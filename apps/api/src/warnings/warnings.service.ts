import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { WarningDto, WarningKind, WatchListDto } from '@erp/shared';
import { DEFAULT_CLIENT_PAYMENT_DAYS, FUEL_TOLERANCE_DEFAULT_PCT, WARNING_DISMISS_MIN, WARNING_KINDS, fuelNormText, watchListKinds } from '@erp/shared';
import type { RequestUser } from '../common/current-user';
import { AuditService } from '../common/audit.service';
import { ProjectAccessService } from '../common/project-access.service';
import { dateOnly, parseDate } from '../common/serialize';
import { PrismaService } from '../prisma/prisma.service';
import { todayIn } from '../notifications/time';
import { ReceivablesService } from '../receivables/receivables.service';
import { PayablesService } from '../payables/payables.service';
import { ReconciliationService } from '../reconciliation/reconciliation.service';
import {
  type Delivery,
  type MachineDay,
  ISSUE_WINDOW_DAYS,
  MACHINE_WINDOW_DAYS,
  VENDOR_WINDOW_DAYS,
  activityForecast,
  addDays,
  cashGap,
  cashWeeks,
  daysToPay,
  dprGap,
  fuelNormCheck,
  fuelStep,
  leadDays,
  machineTrend,
  materialOveruse,
  overuseStep,
  scheduleWarns,
  stockRunout,
  vendorTrend,
} from './warning-rules';

const n = (d: Prisma.Decimal | null | undefined) => (d ? d.toNumber() : 0);
const sent = { in: ['SUBMITTED', 'APPROVED'] as ('SUBMITTED' | 'APPROVED')[] };
const plural = (k: number, word: string) => `${k} ${word}${k === 1 ? '' : 's'}`;
/** 1840000 → "₹18.4 L", 25000000 → "₹2.5 Cr", 45000 → "₹45,000". */
export const rupees = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e7) return `₹${(v / 1e7).toFixed(1)} Cr`;
  if (a >= 1e5) return `₹${(v / 1e5).toFixed(1)} L`;
  return `₹${Math.round(v).toLocaleString('en-IN')}`;
};
/** One decimal, or two significant figures below 1 so a slow rate is not "0". */
const qty = (v: number) => (Math.abs(v) > 0 && Math.abs(v) < 1 ? Number(v.toPrecision(2)) : Math.round(v * 10) / 10).toLocaleString('en-IN');
/** 2026-10-23 → "23 Oct". */
const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const pct = (v: number) => `${Math.round(v * 100)}%`;

type Draft = Omit<WarningDto, 'dismissed'>;

interface Project {
  id: string;
  code: string;
  name: string;
  status: string;
  type: string;
  startDate: Date | null;
}

/**
 * Early warnings, the Watch list (AI roadmap item 73): forecasts in `warning-rules.ts` over what the caller may see
 * (`ProjectAccessService.projectWhere`, and each kind only for the roles in `watchListKinds`). A warning dismissed with
 * a reason stays dismissed for the company while its key, which carries the figures, holds. Every load takes the day
 * it is for, so `src/scripts/warnings-test.ts` can replay the demo history; cash is as of today only, because it is
 * read from bills as they now stand.
 */
@Injectable()
export class WarningsService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private receivables: ReceivablesService,
    private payables: PayablesService,
    private reconciliation: ReconciliationService,
  ) {}

  async list(user: RequestUser): Promise<WatchListDto> {
    const kinds = watchListKinds(user.roleKey);
    if (!kinds.length) throw new ForbiddenException('The watch list is for managers, stores, purchase and accounts');
    const today = todayIn();
    const warnings = await this.compute(user, today);
    const keys = warnings.map((w) => w.key);
    const dismissals = keys.length
      ? await this.prisma.warningDismissal.findMany({
          where: { organizationId: user.organizationId, warningKey: { in: keys } },
          select: { warningKey: true, reason: true, createdAt: true, dismissedBy: { select: { fullName: true } } },
        })
      : [];
    const by = new Map(dismissals.map((d) => [d.warningKey, { reason: d.reason, byName: d.dismissedBy.fullName, at: d.createdAt.toISOString() }]));
    const all: WarningDto[] = warnings.map((w) => ({ ...w, dismissed: by.get(w.key) ?? null }));
    return { asOf: today, kinds, open: all.filter((w) => !w.dismissed), dismissed: all.filter((w) => w.dismissed) };
  }

  async dismiss(user: RequestUser, key: string, reason: string): Promise<WatchListDto> {
    const note = (reason ?? '').trim();
    if (note.length < WARNING_DISMISS_MIN) throw new BadRequestException('Say why this warning can be dismissed');
    await this.assertShown(user, key);
    try {
      await this.prisma.warningDismissal.create({ data: { organizationId: user.organizationId, warningKey: key, reason: note.slice(0, 500), dismissedById: user.id } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Someone has already dismissed this warning');
      throw e;
    }
    await this.audit.log(user, 'WARNING', key, 'DISMISSED', note);
    return this.list(user);
  }

  async restore(user: RequestUser, key: string): Promise<WatchListDto> {
    await this.assertShown(user, key);
    const { count } = await this.prisma.warningDismissal.deleteMany({ where: { organizationId: user.organizationId, warningKey: key } });
    if (count) await this.audit.log(user, 'WARNING', key, 'RESTORED');
    return this.list(user);
  }

  /** Only a warning the caller is shown now can be dismissed or brought back. */
  private async assertShown(user: RequestUser, key: string) {
    if (!watchListKinds(user.roleKey).length) throw new ForbiddenException('The watch list is for managers, stores, purchase and accounts');
    const warnings = await this.compute(user, todayIn());
    if (!warnings.some((w) => w.key === key)) throw new NotFoundException('This warning no longer applies');
  }

  /** Open warnings (not dismissed) for My work. */
  async open(user: RequestUser): Promise<WarningDto[]> {
    return (await this.list(user)).open;
  }

  /** Every warning the caller's role and projects give on `today`, dismissed or not, most pressing kind first. */
  async compute(user: RequestUser, today: string, only?: WarningKind[]): Promise<Draft[]> {
    const kinds = watchListKinds(user.roleKey).filter((k) => !only || only.includes(k));
    if (!kinds.length) return [];
    const projects: Project[] = await this.prisma.project.findMany({
      where: this.access.projectWhere(user),
      select: { id: true, code: true, name: true, status: true, type: true, startDate: true },
      orderBy: { code: 'asc' },
    });
    const active = projects.filter((p) => p.status === 'ACTIVE');
    const parts = await Promise.all(
      WARNING_KINDS.filter((k) => kinds.includes(k)).map((k) => {
        if (k === 'SCHEDULE') return this.schedule(active, today);
        if (k === 'CASH') return today === todayIn() ? this.cash(user, projects, today) : Promise.resolve([]);
        if (k === 'VENDOR') return this.vendors(projects, today);
        if (k === 'STOCK') return this.stock(user.organizationId, projects, today);
        if (k === 'MACHINE') return this.machines(projects, today);
        if (k === 'MATERIAL_OVERUSE') return this.overuse(active, today);
        if (k === 'FUEL_NORM') return this.fuel(projects, today);
        // A central store files no DPR (v6 item 106).
        return this.dprs(active.filter((p) => p.type !== 'STORE'), today);
      }),
    );
    return parts.flat();
  }

  private async schedule(projects: Project[], today: string): Promise<Draft[]> {
    if (!projects.length) return [];
    const byId = new Map(projects.map((p) => [p.id, p]));
    const activities = await this.prisma.activity.findMany({
      where: { projectId: { in: projects.map((p) => p.id) }, plannedStart: { lte: parseDate(today) } },
      select: {
        id: true,
        name: true,
        unit: true,
        projectId: true,
        plannedQty: true,
        plannedStart: true,
        plannedEnd: true,
        baselineEnd: true,
        progressEntries: { where: { status: 'APPROVED', date: { lte: parseDate(today) } }, select: { date: true, quantity: true } },
      },
      orderBy: [{ projectId: 'asc' }, { sortOrder: 'asc' }],
    });
    const out: (Draft & { slip: number })[] = [];
    for (const a of activities) {
      const f = activityForecast(
        {
          plannedQty: n(a.plannedQty),
          plannedStart: dateOnly(a.plannedStart),
          plannedEnd: dateOnly(a.plannedEnd),
          baselineEnd: dateOnly(a.baselineEnd),
          entries: a.progressEntries.map((e) => ({ date: dateOnly(e.date)!, qty: n(e.quantity) })),
        },
        today,
      );
      if (!f || !scheduleWarns(f)) continue;
      const p = byId.get(a.projectId)!;
      const targetLabel = a.baselineEnd ? 'Baseline finish' : 'Planned finish';
      const left = n(a.plannedQty) * (1 - f.donePct / 100);
      const sinceStart = Math.round((parseDate(today).getTime() - a.plannedStart!.getTime()) / 86_400_000);
      const stalledFor = sinceStart >= 28 ? '4 weeks' : plural(sinceStart, 'day');
      out.push({
        key: f.stalled ? `schedule:${a.id}:stalled` : `schedule:${a.id}:${Math.floor(f.slipDays! / 14)}`,
        kind: 'SCHEDULE',
        title: f.stalled ? `${a.name} on ${p.code} has had no progress for ${stalledFor}` : `${a.name} on ${p.code} heads for ${plural(f.slipDays!, 'day')} late`,
        detail: f.stalled
          ? `No progress approved in that time; ${f.donePct}% is done, ${qty(left)} ${a.unit} is left, and the ${targetLabel.toLowerCase()} is ${day(f.target)}.`
          : `At ${qty(f.rate)} ${a.unit} a day over the last 4 weeks, the ${qty(left)} ${a.unit} left is done on ${day(f.forecastFinish!)}, against the ${targetLabel.toLowerCase()} of ${day(f.target)}.`,
        facts: [
          { label: 'Done', value: `${f.donePct}%` },
          { label: 'Rate, last 4 weeks', value: `${qty(f.rate)} ${a.unit}/day` },
          { label: 'Forecast finish', value: f.forecastFinish ? day(f.forecastFinish) : 'none at this rate' },
          { label: targetLabel, value: day(f.target) },
        ],
        links: [
          { label: 'Schedule', href: `/projects/${p.id}?tab=schedule` },
          { label: 'Progress entries', href: `/projects/${p.id}?tab=progress` },
        ],
        projectId: p.id,
        projectName: p.name,
        slip: f.stalled ? 10_000 : f.slipDays!,
      });
    }
    return out.sort((a, b) => b.slip - a.slip).map(({ slip: _slip, ...w }) => w);
  }

  /** Materials consumed beyond their norms' allowance at active projects with norms (v5 item 92), largest overuse first. */
  private async overuse(projects: Project[], today: string): Promise<Draft[]> {
    if (!projects.length) return [];
    const withNorms = new Set((await this.prisma.materialNorm.groupBy({ by: ['projectId'], where: { projectId: { in: projects.map((p) => p.id) } } })).map((g) => g.projectId));
    const out: (Draft & { overPct: number })[] = [];
    for (const p of projects.filter((x) => withNorms.has(x.id))) {
      const rec = await this.reconciliation.forWarnings(p.id, today);
      for (const item of rec.items) {
        const f = materialOveruse({ allowed: Number(item.allowedQty), consumed: Number(item.consumedQty) });
        if (!f) continue;
        const value = item.excessValue !== null ? Number(item.excessValue) : null;
        out.push({
          key: `material:${p.id}:${item.itemId}:${overuseStep(f.overPct)}`,
          kind: 'MATERIAL_OVERUSE',
          title: `${item.itemName} at ${p.code} is ${Math.round(f.overPct)}% over what the work allows`,
          detail: `${qty(Number(item.consumedQty))} ${item.unit} used against ${qty(Number(item.allowedQty))} ${item.unit} allowed for the approved progress, wastage included${value ? `: ${rupees(value)} at the item rate` : ''}. Check for wastage, theft, or issues booked to the wrong project or activity.`,
          facts: [
            { label: 'Used', value: `${qty(Number(item.consumedQty))} ${item.unit}` },
            { label: 'Allowed', value: `${qty(Number(item.allowedQty))} ${item.unit}` },
            { label: 'Over', value: `${qty(f.excess)} ${item.unit}` },
            ...(value ? [{ label: 'Value', value: rupees(value) }] : []),
          ],
          links: [
            { label: 'Reconciliation', href: `/projects/${p.id}?tab=reconciliation` },
            { label: 'Stock', href: `/stock?projectId=${p.id}` },
          ],
          projectId: p.id,
          projectName: p.name,
          overPct: f.overPct,
        });
      }
    }
    return out.sort((a, b) => b.overPct - a.overPct).map(({ overPct: _o, ...w }) => w);
  }

  /**
   * Machines with a fuel norm whose average over their latest logs strays from it (v5 item 93). A log's litres are
   * what was typed on it, else the fuel issued from the store to the machine that day.
   */
  private async fuel(projects: Project[], today: string): Promise<Draft[]> {
    if (!projects.length) return [];
    const projectIds = projects.map((p) => p.id);
    const since = parseDate(addDays(today, -120));
    const logs = await this.prisma.machineryLog.findMany({
      where: { projectId: { in: projectIds }, status: sent, date: { gte: since, lte: parseDate(today) }, equipment: { fuelNorm: { not: null }, fuelNormUnit: { not: null } } },
      select: {
        equipmentId: true,
        projectId: true,
        date: true,
        hoursWorked: true,
        dieselLitres: true,
        meterStart: true,
        meterEnd: true,
        equipment: { select: { code: true, name: true, fuelNorm: true, fuelNormUnit: true, fuelTolerancePct: true } },
      },
      orderBy: { date: 'asc' },
    });
    if (!logs.length) return [];
    const issues = await this.prisma.stockEntry.findMany({
      where: { projectId: { in: projectIds }, type: 'ISSUE', equipmentId: { in: [...new Set(logs.map((l) => l.equipmentId))] }, date: { gte: since, lte: parseDate(today) } },
      select: { equipmentId: true, date: true, lines: { select: { quantity: true } } },
    });
    const issued = new Map<string, number>();
    for (const e of issues) {
      const k = `${e.equipmentId}|${dateOnly(e.date)}`;
      issued.set(k, (issued.get(k) ?? 0) - e.lines.reduce((s, l) => s + n(l.quantity), 0));
    }
    const byMachine = new Map<string, typeof logs>();
    for (const l of logs) byMachine.set(l.equipmentId, [...(byMachine.get(l.equipmentId) ?? []), l]);
    const byId = new Map(projects.map((p) => [p.id, p]));
    const out: (Draft & { off: number })[] = [];
    for (const [id, ls] of byMachine) {
      const eq = ls[0].equipment;
      const unit = eq.fuelNormUnit!;
      const norm = n(eq.fuelNorm);
      const tolerance = eq.fuelTolerancePct ? n(eq.fuelTolerancePct) : FUEL_TOLERANCE_DEFAULT_PCT;
      const f = fuelNormCheck(
        ls.map((l) => {
          const date = dateOnly(l.date)!;
          return {
            date,
            hoursWorked: n(l.hoursWorked),
            km: l.meterStart && l.meterEnd ? n(l.meterEnd) - n(l.meterStart) : null,
            litres: l.dieselLitres ? n(l.dieselLitres) : (issued.get(`${id}|${date}`) ?? 0),
          };
        }),
        norm,
        unit,
        tolerance,
        today,
      );
      if (!f) continue;
      const p = byId.get(ls[ls.length - 1].projectId);
      const avg = `${qty(f.average)} ${unit === 'KM_PER_LITRE' ? 'km a litre' : 'litres an hour'}`;
      out.push({
        key: `fuel:${id}:${f.thirsty ? 'more' : 'less'}:${fuelStep(f.deviationPct)}`,
        kind: 'FUEL_NORM',
        title: `${eq.code} ${eq.name} ${f.thirsty ? 'is using more fuel than its norm' : 'is using less fuel than its norm'}: ${avg}`,
        detail: `${avg} over its last ${f.logs} logs (${day(f.from)} to ${day(f.to)}) against ${fuelNormText(norm, unit)}, ${Math.abs(Math.round(f.deviationPct))}% ${f.deviationPct > 0 ? 'above' : 'below'} it (tolerance ${tolerance}%). ${f.thirsty ? 'Check for leaks, idling counted as work, or fuel going elsewhere.' : 'Check that hours or km are not written up and that fuel is booked to the right machine.'}`,
        facts: [
          { label: 'Average', value: avg },
          { label: 'Norm', value: fuelNormText(norm, unit) },
          { label: 'Off by', value: `${Math.round(f.deviationPct) > 0 ? '+' : ''}${Math.round(f.deviationPct)}%` },
          { label: 'Logs', value: String(f.logs) },
        ],
        links: [
          { label: 'Fuel position', href: '/machinery?tab=fuel' },
          { label: 'Machinery logs', href: p ? `/projects/${p.id}?tab=machinery` : '/machinery' },
        ],
        projectId: p?.id ?? null,
        projectName: p?.name ?? null,
        off: Math.abs(f.deviationPct),
      });
    }
    return out.sort((a, b) => b.off - a.off).map(({ off: _o, ...w }) => w);
  }

  private async dprs(projects: Project[], today: string): Promise<Draft[]> {
    if (!projects.length) return [];
    const reports = await this.prisma.dailyReport.findMany({
      where: { projectId: { in: projects.map((p) => p.id) }, status: sent, date: { gte: parseDate(addDays(today, -31)), lt: parseDate(today) } },
      select: { projectId: true, date: true },
    });
    const out: Draft[] = [];
    for (const p of projects) {
      const dates = new Set(reports.filter((r) => r.projectId === p.id).map((r) => dateOnly(r.date)!));
      const gap = dprGap(dates, today, dateOnly(p.startDate));
      if (!gap) continue;
      const last = [...dates].sort().pop();
      out.push({
        key: `dpr:${p.id}:${gap.from}`,
        kind: 'DPR',
        title: `No DPR from ${p.name} for ${plural(gap.days, 'day')}`,
        detail: last ? `The last DPR sent was for ${day(last)}; none has been sent for ${day(gap.from)} to ${day(addDays(today, -1))}.` : `No DPR has been sent in the last month.`,
        facts: [
          { label: 'Days without a DPR', value: gap.days >= 30 ? '30 or more' : String(gap.days) },
          { label: 'Last DPR sent for', value: last ? day(last) : 'none this month' },
        ],
        links: [{ label: 'Daily reports', href: `/projects/${p.id}?tab=dpr` }],
        projectId: p.id,
        projectName: p.name,
      });
    }
    return out;
  }

  private async stock(organizationId: string, projects: Project[], today: string): Promise<Draft[]> {
    if (!projects.length) return [];
    const ids = projects.map((p) => p.id);
    const end = parseDate(today);
    const issues = await this.prisma.stockTxn.findMany({
      where: { projectId: { in: ids }, type: 'ISSUE', date: { gte: parseDate(addDays(today, -ISSUE_WINDOW_DAYS + 1)), lte: end } },
      select: { projectId: true, itemId: true, date: true, quantity: true },
    });
    if (!issues.length) return [];
    const pairs = new Map<string, { projectId: string; itemId: string; issues: { date: string; qty: number }[] }>();
    for (const t of issues) {
      const k = `${t.projectId}:${t.itemId}`;
      if (!pairs.has(k)) pairs.set(k, { projectId: t.projectId, itemId: t.itemId, issues: [] });
      pairs.get(k)!.issues.push({ date: dateOnly(t.date)!, qty: Math.abs(n(t.quantity)) });
    }
    const itemIds = [...new Set(issues.map((t) => t.itemId))];
    const [balances, items, receipts, orders] = await Promise.all([
      this.prisma.stockTxn.groupBy({ by: ['projectId', 'itemId'], where: { projectId: { in: ids }, itemId: { in: itemIds }, date: { lte: end } }, _sum: { quantity: true } }),
      this.prisma.item.findMany({ where: { id: { in: itemIds } }, select: { id: true, name: true, unit: true } }),
      // Lead time from every receipt of the item against an order, company-wide.
      this.prisma.stockTxn.findMany({
        where: { organizationId, itemId: { in: itemIds }, type: 'RECEIPT', purchaseOrderLineId: { not: null }, date: { lte: end } },
        select: { itemId: true, date: true, purchaseOrderLine: { select: { purchaseOrder: { select: { poDate: true } } } } },
      }),
      this.prisma.purchaseOrder.findMany({
        where: { projectId: { in: ids }, status: 'APPROVED', closedAt: null, poDate: { lte: end } },
        select: { projectId: true, lines: { select: { id: true, itemName: true, quantity: true } } },
      }),
    ]);
    const lineIds = orders.flatMap((o) => o.lines.map((l) => l.id));
    const received = lineIds.length
      ? await this.prisma.stockTxn.groupBy({ by: ['purchaseOrderLineId'], where: { purchaseOrderLineId: { in: lineIds }, type: 'RECEIPT', date: { lte: end } }, _sum: { quantity: true } })
      : [];
    const receivedOf = new Map(received.map((r) => [r.purchaseOrderLineId!, n(r._sum.quantity)]));
    const balanceOf = new Map(balances.map((b) => [`${b.projectId}:${b.itemId}`, n(b._sum.quantity)]));
    const itemOf = new Map(items.map((i) => [i.id, i]));
    const byId = new Map(projects.map((p) => [p.id, p]));
    const out: (Draft & { daysLeft: number })[] = [];
    for (const [k, pair] of pairs) {
      const item = itemOf.get(pair.itemId);
      if (!item) continue;
      const lead = leadDays(receipts.filter((r) => r.itemId === pair.itemId && r.purchaseOrderLine).map((r) => ({ poDate: dateOnly(r.purchaseOrderLine!.purchaseOrder.poDate)!, received: dateOnly(r.date)! })));
      const name = item.name.trim().toLowerCase();
      const onOrder = orders
        .filter((o) => o.projectId === pair.projectId)
        .flatMap((o) => o.lines)
        .filter((l) => l.itemName.trim().toLowerCase() === name)
        .reduce((s, l) => s + Math.max(0, n(l.quantity) - (receivedOf.get(l.id) ?? 0)), 0);
      const balance = balanceOf.get(k) ?? 0;
      const f = stockRunout({ balance, issues: pair.issues, leadDays: lead.days, onOrder }, today);
      if (!f) continue;
      const p = byId.get(pair.projectId)!;
      out.push({
        key: `stock:${p.id}:${item.id}:${today.slice(0, 7)}`,
        kind: 'STOCK',
        title: balance <= 0 ? `${item.name} at ${p.code} has run out` : `${item.name} at ${p.code} runs out around ${day(f.runsOut)}`,
        detail: `${qty(Math.max(0, balance))} ${item.unit} left at ${qty(f.perDay)} ${item.unit} a day over the last 30 days, and an order takes ${plural(lead.days, 'day')} ${lead.fromHistory ? 'going by past orders' : '(no past orders, so a week is assumed)'}. Nothing is on order.`,
        facts: [
          { label: 'Balance', value: `${qty(Math.max(0, balance))} ${item.unit}` },
          { label: 'Used a day, last 30 days', value: `${qty(f.perDay)} ${item.unit}` },
          { label: 'Days left', value: qty(f.daysLeft) },
          { label: 'Lead time', value: plural(lead.days, 'day') },
        ],
        links: [
          { label: 'Stock', href: `/stock?projectId=${p.id}` },
          { label: 'Material requests', href: `/projects/${p.id}?tab=material` },
        ],
        projectId: p.id,
        projectName: p.name,
        daysLeft: f.daysLeft,
      });
    }
    return out.sort((a, b) => a.daysLeft - b.daysLeft).map(({ daysLeft: _d, ...w }) => w);
  }

  private async vendors(projects: Project[], today: string): Promise<Draft[]> {
    if (!projects.length) return [];
    const entries = await this.prisma.stockEntry.findMany({
      where: {
        projectId: { in: projects.map((p) => p.id) },
        type: 'RECEIPT',
        purchaseOrderId: { not: null },
        vendorId: { not: null },
        date: { gte: parseDate(addDays(today, -2 * VENDOR_WINDOW_DAYS + 1)), lte: parseDate(today) },
      },
      select: { date: true, vendorId: true, purchaseOrderId: true, lines: { select: { quantity: true, rejectedQty: true } } },
    });
    if (!entries.length) return [];
    const pos = await this.prisma.purchaseOrder.findMany({ where: { id: { in: [...new Set(entries.map((e) => e.purchaseOrderId!))] } }, select: { id: true, deliveryBy: true } });
    const dueOf = new Map(pos.map((p) => [p.id, dateOnly(p.deliveryBy)]));
    const byVendor = new Map<string, Delivery[]>();
    for (const e of entries) {
      const date = dateOnly(e.date)!;
      const due = dueOf.get(e.purchaseOrderId!);
      const list = byVendor.get(e.vendorId!) ?? [];
      list.push({ date, late: !!due && date > due, qty: e.lines.reduce((s, l) => s + n(l.quantity), 0), rejectedQty: e.lines.reduce((s, l) => s + n(l.rejectedQty), 0) });
      byVendor.set(e.vendorId!, list);
    }
    const vendors = await this.prisma.vendor.findMany({ where: { id: { in: [...byVendor.keys()] } }, select: { id: true, name: true } });
    const out: Draft[] = [];
    for (const v of vendors) {
      const t = vendorTrend(byVendor.get(v.id)!, today);
      if (!t || (!t.lateWorse && !t.rejectWorse)) continue;
      const what = [t.lateWorse ? `late on ${t.recent.late} of ${t.recent.deliveries} deliveries` : null, t.rejectWorse ? `${pct(t.recent.rejectShare)} of what came rejected` : null].filter(Boolean).join(', ');
      out.push({
        key: `vendor:${v.id}:${today.slice(0, 7)}:${t.lateWorse ? 'late' : ''}${t.rejectWorse ? 'rejected' : ''}`,
        kind: 'VENDOR',
        title: `${v.name}: ${what} in the last 60 days`,
        detail: `In the 60 days before that: ${t.before.deliveries ? `late on ${t.before.late} of ${t.before.deliveries}, ${pct(t.before.rejectShare)} rejected` : 'no deliveries'}.`,
        facts: [
          { label: 'Deliveries, last 60 days', value: String(t.recent.deliveries) },
          { label: 'Late', value: `${t.recent.late} (${pct(t.recent.lateShare)})` },
          { label: 'Rejected', value: pct(t.recent.rejectShare) },
          { label: 'Late the 60 days before', value: t.before.deliveries ? `${t.before.late} of ${t.before.deliveries}` : 'no deliveries' },
        ],
        links: [{ label: 'Orders and deliveries', href: `/purchase-orders?q=${encodeURIComponent(v.name)}` }],
        projectId: null,
        projectName: null,
      });
    }
    return out;
  }

  private async machines(projects: Project[], today: string): Promise<Draft[]> {
    if (!projects.length) return [];
    const logs = await this.prisma.machineryLog.findMany({
      where: { projectId: { in: projects.map((p) => p.id) }, status: sent, date: { gte: parseDate(addDays(today, -2 * MACHINE_WINDOW_DAYS + 1)), lte: parseDate(today) } },
      select: { equipmentId: true, projectId: true, date: true, hoursWorked: true, idleHours: true, breakdownHours: true, equipment: { select: { code: true, name: true } } },
      orderBy: { date: 'asc' },
    });
    const byMachine = new Map<string, { name: string; projectId: string; days: MachineDay[] }>();
    for (const l of logs) {
      const m = byMachine.get(l.equipmentId) ?? { name: `${l.equipment.code} ${l.equipment.name}`, projectId: l.projectId, days: [] };
      m.projectId = l.projectId;
      m.days.push({ date: dateOnly(l.date)!, worked: n(l.hoursWorked), idle: n(l.idleHours), breakdown: n(l.breakdownHours) });
      byMachine.set(l.equipmentId, m);
    }
    const byId = new Map(projects.map((p) => [p.id, p]));
    const out: Draft[] = [];
    for (const [id, m] of byMachine) {
      const t = machineTrend(m.days, today);
      if (!t || (!t.breakdownWorse && !t.idleWorse)) continue;
      const p = byId.get(m.projectId);
      const what = [t.breakdownWorse ? `${qty(t.recent.breakdown)} h broken down` : null, t.idleWorse ? `idle ${pct(t.recent.idleShare)} of its hours` : null].filter(Boolean).join(', ');
      out.push({
        key: `machine:${id}:${today.slice(0, 7)}:${t.breakdownWorse ? 'breakdown' : ''}${t.idleWorse ? 'idle' : ''}`,
        kind: 'MACHINE',
        title: `${m.name}: ${what} in the last 30 days`,
        detail: `The 30 days before: ${qty(t.before.breakdown)} h broken down, idle ${pct(t.before.idleShare)}.`,
        facts: [
          { label: 'Worked, last 30 days', value: `${qty(t.recent.worked)} h` },
          { label: 'Idle', value: `${qty(t.recent.idle)} h (${pct(t.recent.idleShare)})` },
          { label: 'Breakdown', value: `${qty(t.recent.breakdown)} h` },
          { label: 'Breakdown the 30 days before', value: `${qty(t.before.breakdown)} h` },
        ],
        links: [{ label: 'Machinery logs', href: p ? `/projects/${p.id}?tab=machinery` : '/machinery' }],
        projectId: p?.id ?? null,
        projectName: p?.name ?? null,
      });
    }
    return out;
  }

  private async cash(user: RequestUser, projects: Project[], today: string): Promise<Draft[]> {
    if (!projects.length) return [];
    const [recv, pay, paidBills, contracts] = await Promise.all([
      this.receivables.summary(user),
      this.payables.summary(user),
      this.prisma.raBill.findMany({
        where: { projectId: { in: projects.map((p) => p.id) }, sentDate: { not: null }, paidDate: { not: null } },
        select: { sentDate: true, paidDate: true, project: { select: { id: true, clientId: true, clientName: true } } },
      }),
      this.prisma.project.findMany({ where: { id: { in: projects.map((p) => p.id) } }, select: { id: true, clientId: true, clientName: true, clientPaymentDays: true } }),
    ]);
    const clientOf = (p: { id: string; clientId: string | null; clientName: string | null }) => p.clientId ?? p.clientName?.trim().toLowerCase() ?? p.id;
    const history = new Map<string, { sentDate: string; paidDate: string }[]>();
    for (const b of paidBills) {
      const k = clientOf(b.project);
      history.set(k, [...(history.get(k) ?? []), { sentDate: dateOnly(b.sentDate)!, paidDate: dateOnly(b.paidDate)! }]);
    }
    const projectOf = new Map(contracts.map((p) => [p.id, p]));
    const usedDays = new Map<string, { client: string; days: number; own: boolean }>();
    const inflows = recv.openBills.map((b) => {
      const p = projectOf.get(b.projectId);
      const own = p ? daysToPay(history.get(clientOf(p)) ?? []) : null;
      const days = own ?? p?.clientPaymentDays ?? DEFAULT_CLIENT_PAYMENT_DAYS;
      usedDays.set(b.clientName ?? b.projectCode, { client: b.clientName ?? b.projectCode, days, own: own !== null });
      return { date: addDays(b.sentDate, days), amount: Number(b.outstanding) };
    });
    const outflows = pay.openBills.map((b) => ({ date: b.dueDate, amount: Number(b.outstanding) }));
    const weeks = cashWeeks(inflows, outflows, today);
    const gap = cashGap(weeks);
    if (!gap) return [];
    const upTo = weeks.slice(0, weeks.indexOf(gap) + 1);
    const out = upTo.reduce((s, w) => s + w.out, 0);
    const inn = upTo.reduce((s, w) => s + w.in, 0);
    const worst = weeks.reduce((m, w) => (w.cumulative < m.cumulative ? w : m), gap);
    const pays = [...usedDays.values()].map((c) => `${c.client} ${c.days} days${c.own ? '' : ' (contract)'}`).join('; ');
    return [
      {
        key: `cash:${gap.start}`,
        kind: 'CASH',
        title: `Cash gap of ${rupees(-gap.cumulative)} by the week of ${day(gap.start)}`,
        detail: `By ${day(gap.end)}, ${rupees(out)} of vendor and subcontractor bills fall due against ${rupees(inn)} expected from clients, going by how long each client has taken to pay.`,
        facts: [
          { label: 'Bills due to then', value: rupees(out) },
          { label: 'Expected from clients', value: rupees(inn) },
          { label: 'Largest gap in 8 weeks', value: `${rupees(-worst.cumulative)}, week of ${day(worst.start)}` },
          { label: 'Days to pay used', value: pays || 'no open client bills' },
        ],
        links: [
          { label: 'Payables', href: '/payables' },
          { label: 'Receivables', href: '/receivables' },
        ],
        projectId: null,
        projectName: null,
      },
    ];
  }
}
