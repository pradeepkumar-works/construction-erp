import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { LeakageDto, LeakageFlagDto, LeakageSection } from '@erp/shared';
import {
  FUEL_NO_LOG_MIN_LITRES,
  FUEL_TOLERANCE_DEFAULT_PCT,
  IDLE_MIN_DAYS,
  LEAKAGE_SECTIONS,
  MATERIAL_OVERUSE_MIN_PCT,
  RATE_ABOVE_MIN_PCT,
  RATE_WINDOW_DAYS,
  SITE_RATIO_ABOVE_PTS,
  canSeeLeakageHireValue,
  canSeeLeakageStockValue,
  fuelNormText,
  lastRateKey,
  leakageSections,
  rateAboveOthers,
} from '@erp/shared';
import type { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { dateOnly, parseDate } from '../common/serialize';
import { PrismaService } from '../prisma/prisma.service';
import { todayIn } from '../notifications/time';
import { ReconciliationService } from '../reconciliation/reconciliation.service';
import { PurchaseOrdersService } from '../purchasing/purchase-orders.service';
import { addDays, fuelNormCheck } from '../warnings/warning-rules';
import { type SiteUse, companyMedians, daysIn, fuelWithoutLog, idleHire, materialLeak, monthSpan } from './leakage-rules';

const n = (d: Prisma.Decimal | null | undefined) => (d ? d.toNumber() : 0);
const notRejected = { not: 'REJECTED' as const };
/** 1840000 → "₹18.4 L", 45000 → "₹45,000". */
export const rupees = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e7) return `₹${(v / 1e7).toFixed(1)} Cr`;
  if (a >= 1e5) return `₹${(v / 1e5).toFixed(1)} L`;
  return `₹${Math.round(v).toLocaleString('en-IN')}`;
};
const qty = (v: number) => (Math.abs(v) > 0 && Math.abs(v) < 1 ? Number(v.toPrecision(2)) : Math.round(v * 10) / 10).toLocaleString('en-IN');
const rate = (v: number) => `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const plural = (k: number, word: string) => `${k} ${word}${k === 1 ? '' : 's'}`;

interface Project {
  id: string;
  code: string;
  name: string;
}

/** A flag with what the watch list needs to build its warning from it. */
export type LeakageFlag = LeakageFlagDto & { warnKey: string; action: string };

/**
 * Leakage checks (AI item 121): the month's material, rate, fuel and idle-hire flags over the caller's projects, with
 * the rupees at risk. Material reads the reconciliation (`ReconciliationService.forPeriod`), rates the purchase orders
 * (`PurchaseOrdersService.quotesFor`), fuel and hire the machinery logs and fuel issues. The arithmetic is in
 * `leakage-rules.ts`; the watch list's RATE_ABOVE, FUEL_NO_LOG and IDLE_HIRE warnings are built from these flags.
 */
@Injectable()
export class LeakageService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private reconciliation: ReconciliationService,
    private orders: PurchaseOrdersService,
  ) {}

  /** GET /leakage?month=YYYY-MM */
  async get(user: RequestUser, month?: string): Promise<LeakageDto> {
    const sections = leakageSections(user.roleKey);
    if (!sections.length) throw new ForbiddenException('Leakage checks are for the store, the QS, purchasers, whoever runs the machines, approvers and accounts');
    const today = todayIn();
    const m = month ?? today.slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) throw new BadRequestException('Choose a month as YYYY-MM');
    if (`${m}-01` > today) throw new BadRequestException('That month has not started: choose this month or an earlier one');
    const { from, to } = monthSpan(m, today);
    const { flags, projects } = await this.compute(user, from, to, sections);
    const totals = Object.fromEntries(LEAKAGE_SECTIONS.map((s) => [s, null])) as Record<LeakageSection, number | null>;
    const stockValue = canSeeLeakageStockValue(user.roleKey);
    const hireValue = canSeeLeakageHireValue(user.roleKey);
    for (const s of sections) {
      const shown = s === 'idle' ? hireValue : s === 'rates' || stockValue;
      totals[s] = shown ? flags.filter((f) => f.section === s).reduce((t, f) => t + (f.valueInr ?? 0), 0) : null;
    }
    const known = sections.map((s) => totals[s]).filter((v): v is number => v !== null);
    return {
      month: m,
      from,
      to,
      sections,
      flags: flags.map(({ warnKey: _k, action: _a, ...f }) => f),
      totals,
      totalInr: known.length ? known.reduce((a, b) => a + b, 0) : null,
      projects,
      canSeeStockValue: stockValue,
      canSeeHireValue: hireValue,
    };
  }

  /** The flags of `sections` for the caller's projects from `from` to `to`, largest rupees first within each section. */
  async compute(user: RequestUser, from: string, to: string, sections: LeakageSection[]): Promise<{ flags: LeakageFlag[]; projects: number }> {
    const projects: Project[] = await this.prisma.project.findMany({
      where: { ...this.access.projectWhere(user), status: 'ACTIVE' },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    });
    if (!projects.length) return { flags: [], projects: 0 };
    const stockValue = canSeeLeakageStockValue(user.roleKey);
    const parts = await Promise.all(
      sections.map((s) => {
        if (s === 'material') return this.material(user.organizationId, projects, from, to, stockValue);
        if (s === 'rates') return this.rates(user, projects, from, to);
        if (s === 'fuel') return this.fuel(projects, from, to, stockValue);
        return this.idle(projects, from, to, canSeeLeakageHireValue(user.roleKey));
      }),
    );
    const byValue = (a: LeakageFlag, b: LeakageFlag) => (b.valueInr ?? -1) - (a.valueInr ?? -1) || a.title.localeCompare(b.title);
    return { flags: parts.flatMap((p) => p.sort(byValue)), projects: projects.length };
  }

  // -------------------------------------------------------------------------------------------------------------------

  /**
   * Material used against the allowance for the month's approved progress, and against the company's median use of the
   * item. The median is over every active project of the company with norms, though only the caller's are flagged.
   */
  private async material(organizationId: string, projects: Project[], from: string, to: string, seeValues: boolean): Promise<LeakageFlag[]> {
    const normed = (await this.prisma.materialNorm.groupBy({ by: ['projectId'], where: { organizationId, project: { status: 'ACTIVE', type: { not: 'STORE' } } } })).map((g) => g.projectId);
    if (!normed.length) return [];
    const recs = await Promise.all(normed.map((id) => this.reconciliation.forPeriod(id, from, to)));
    const uses: SiteUse[] = recs.flatMap((r) => r.items.map((i) => ({ projectId: r.projectId, itemId: i.itemId, allowed: Number(i.allowedQty), consumed: Number(i.consumedQty) })));
    const medians = companyMedians(uses);
    const mine = new Map(projects.map((p) => [p.id, p]));
    const out: LeakageFlag[] = [];
    for (const r of recs) {
      const p = mine.get(r.projectId);
      if (!p) continue;
      for (const item of r.items) {
        const allowed = Number(item.allowedQty);
        const consumed = Number(item.consumedQty);
        const med = medians.get(item.itemId);
        const leak = materialLeak({ projectId: p.id, itemId: item.itemId, allowed, consumed }, med);
        if (!leak) continue;
        const itemRate = item.rate !== null ? Number(item.rate) : null;
        const value = seeValues && itemRate ? leak.excess * itemRate : null;
        const pctUse = (v: number) => `${Math.round(v * 100)}%`;
        out.push({
          key: `material:${p.id}:${item.itemId}`,
          warnKey: `material:${p.id}:${item.itemId}:${from.slice(0, 7)}`,
          section: 'material',
          projectId: p.id,
          projectCode: p.code,
          projectName: p.name,
          title:
            leak.against === 'ALLOWANCE'
              ? `${item.itemName} at ${p.code}: ${Math.round(leak.overPct!)}% over what the work allows`
              : `${item.itemName} at ${p.code}: used ${pctUse(leak.ratio)} of its allowance, other sites ${pctUse(leak.median!)}`,
          detail:
            leak.against === 'ALLOWANCE'
              ? `${qty(consumed)} ${item.unit} used against ${qty(allowed)} ${item.unit} allowed for the month's approved progress, wastage included.`
              : `Within its allowance, but ${Math.round(leak.abovePts!)} points above the company's other sites for the same item: its norms may be loose, or material is going elsewhere.`,
          quantity: `${qty(leak.excess)} ${item.unit}`,
          valueInr: value,
          working: [
            ...item.lines.filter((l) => Number(l.executedQty) > 0).map((l) => `${l.itemNo} ${l.description}: ${qty(Number(l.executedQty))} ${l.unit} done × ${qty(Number(l.qtyPerUnit))} ${item.unit} a ${l.unit} = ${qty(Number(l.theoreticalQty))} ${item.unit}`),
            `Allowed with wastage: ${qty(allowed)} ${item.unit}`,
            `Used: ${qty(Number(item.issuedQty))} issued − ${qty(Number(item.returnedQty))} returned = ${qty(consumed)} ${item.unit}, ${pctUse(leak.ratio)} of the allowance`,
            ...(leak.median !== null ? [`Company median for ${item.itemName}: ${pctUse(leak.median)} of the allowance over ${plural(med!.sites, 'site')}`] : []),
            leak.against === 'ALLOWANCE'
              ? `At risk: ${qty(consumed)} − ${qty(allowed)} = ${qty(leak.excess)} ${item.unit}${value && itemRate ? ` × ${rate(itemRate)} = ${rupees(value)}` : ''}`
              : `At risk: ${qty(consumed)} − ${pctUse(leak.median!)} × ${qty(allowed)} = ${qty(leak.excess)} ${item.unit}${value && itemRate ? ` × ${rate(itemRate)} = ${rupees(value)}` : ''}`,
            `Flagged from ${MATERIAL_OVERUSE_MIN_PCT}% over the allowance, or ${SITE_RATIO_ABOVE_PTS} points above the median of other sites`,
          ],
          links: [
            { label: 'Reconciliation', href: `/projects/${p.id}?tab=reconciliation` },
            { label: 'Issues', href: `/stock?sub=register&projectId=${p.id}` },
          ],
          action: `Count the ${item.itemName} at ${p.code} and check its issue slips`,
        });
      }
    }
    return out;
  }

  /** Purchase order lines of the month (sent or approved) above the lowest another site paid in the 30 days before. */
  private async rates(user: RequestUser, projects: Project[], from: string, to: string): Promise<LeakageFlag[]> {
    const scope = this.access.submissionWhere(user);
    const lines = await this.prisma.purchaseOrderLine.findMany({
      where: { purchaseOrder: { ...scope, projectId: { in: projects.map((p) => p.id) }, status: { in: ['SUBMITTED', 'APPROVED'] }, poDate: { gte: parseDate(from), lte: parseDate(to) } } },
      select: { id: true, itemName: true, unit: true, quantity: true, rate: true, purchaseOrder: { select: { id: true, poNo: true, poDate: true, status: true, projectId: true, vendor: { select: { name: true } } } } },
    });
    if (!lines.length) return [];
    const quotes = await this.orders.quotesFor(scope, lines.map((l) => ({ name: l.itemName, unit: l.unit })), addDays(from, -RATE_WINDOW_DAYS), to);
    const byId = new Map(projects.map((p) => [p.id, p]));
    const out: LeakageFlag[] = [];
    for (const l of lines) {
      const po = l.purchaseOrder;
      const poDate = dateOnly(po.poDate)!;
      const hit = rateAboveOthers({ rate: n(l.rate), projectId: po.projectId, poDate }, (quotes.get(lastRateKey(l.itemName, l.unit)) ?? []).filter((q) => q.purchaseOrderId !== po.id));
      if (!hit) continue;
      const p = byId.get(po.projectId)!;
      const extra = (n(l.rate) - hit.best.rate) * n(l.quantity);
      out.push({
        key: `rate:${l.id}`,
        warnKey: `rate:${l.id}:${n(l.rate)}`,
        section: 'rates',
        projectId: p.id,
        projectCode: p.code,
        projectName: p.name,
        title: `${l.itemName} on ${po.poNo}: ${rate(n(l.rate))} a ${l.unit}, ${Math.round(hit.abovePct)}% above ${hit.best.projectName}`,
        detail: `${hit.best.projectName} paid ${rate(hit.best.rate)} a ${l.unit} to ${hit.best.vendorName} on ${day(hit.best.poDate)} (${hit.best.poNo}); ${po.poNo} pays ${po.vendor.name} ${rate(n(l.rate))}${po.status === 'SUBMITTED' ? ' and is waiting for approval' : ''}.`,
        quantity: `${qty(n(l.quantity))} ${l.unit}`,
        valueInr: extra,
        working: [
          `${po.poNo}, ${day(poDate)}: ${qty(n(l.quantity))} ${l.unit} at ${rate(n(l.rate))}`,
          `Lowest another site paid in the ${RATE_WINDOW_DAYS} days before: ${rate(hit.best.rate)} (${hit.best.poNo}, ${hit.best.projectName}, ${day(hit.best.poDate)})`,
          `(${rate(n(l.rate))} − ${rate(hit.best.rate)}) × ${qty(n(l.quantity))} ${l.unit} = ${rupees(extra)}`,
          `Flagged from ${RATE_ABOVE_MIN_PCT}% above; items are matched by name and unit`,
        ],
        links: [
          { label: po.poNo, href: `/purchase-orders/${po.id}` },
          { label: hit.best.poNo, href: `/purchase-orders/${hit.best.purchaseOrderId}` },
        ],
        action: po.status === 'SUBMITTED' ? `Ask ${po.vendor.name} to match ${rate(hit.best.rate)} before approving ${po.poNo}` : `Ask ${po.vendor.name} to match ${rate(hit.best.rate)} on the next order`,
      });
    }
    return out;
  }

  /** Fuel issued into a machine on a day it has no log, and machines off their fuel norm over the month's logs. */
  private async fuel(projects: Project[], from: string, to: string, seeValues: boolean): Promise<LeakageFlag[]> {
    const projectIds = projects.map((p) => p.id);
    const byId = new Map(projects.map((p) => [p.id, p]));
    const range = { gte: parseDate(from), lte: parseDate(to) };
    const issues = await this.prisma.stockEntry.findMany({
      where: { projectId: { in: projectIds }, type: 'ISSUE', equipmentId: { not: null }, date: range },
      select: { id: true, entryNo: true, projectId: true, equipmentId: true, date: true, lines: { select: { quantity: true, item: { select: { rate: true } } } }, equipment: { select: { code: true, name: true } } },
    });
    const machineIds = [...new Set(issues.map((i) => i.equipmentId!))];
    const logs = await this.prisma.machineryLog.findMany({
      where: { OR: [{ equipmentId: { in: machineIds } }, { projectId: { in: projectIds }, equipment: { fuelNorm: { not: null }, fuelNormUnit: { not: null } } }], status: notRejected, date: range },
      select: { id: true, equipmentId: true, projectId: true, date: true, status: true, hoursWorked: true, dieselLitres: true, meterStart: true, meterEnd: true, equipment: { select: { code: true, name: true, fuelNorm: true, fuelNormUnit: true, fuelTolerancePct: true } } },
      orderBy: { date: 'asc' },
    });
    // Litres and their value per machine and day, from the issues
    const issued = new Map<string, { litres: number; value: number; priced: boolean }>();
    for (const e of issues) {
      const k = `${e.equipmentId}|${dateOnly(e.date)}`;
      const cur = issued.get(k) ?? { litres: 0, value: 0, priced: true };
      for (const l of e.lines) {
        cur.litres -= n(l.quantity);
        if (l.item.rate) cur.value -= n(l.quantity) * n(l.item.rate);
        else cur.priced = false;
      }
      issued.set(k, cur);
    }
    const out: LeakageFlag[] = [];

    const logged = new Set(logs.map((l) => `${l.equipmentId}|${dateOnly(l.date)}`));
    const machine = new Map(issues.map((i) => [i.equipmentId!, { ...i.equipment!, projectId: i.projectId }]));
    for (const d of fuelWithoutLog(
      issues.map((e) => ({ equipmentId: e.equipmentId!, date: dateOnly(e.date)!, litres: -e.lines.reduce((s, l) => s + n(l.quantity), 0), entryId: e.id, entryNo: e.entryNo })),
      logged,
    )) {
      const eq = machine.get(d.equipmentId)!;
      const p = byId.get(eq.projectId)!;
      const money = issued.get(`${d.equipmentId}|${d.date}`)!;
      const value = seeValues && money.priced && money.value > 0 ? money.value : null;
      out.push({
        key: `fuel-no-log:${d.equipmentId}:${d.date}`,
        warnKey: `fuel-no-log:${d.equipmentId}:${d.date}`,
        section: 'fuel',
        projectId: p.id,
        projectCode: p.code,
        projectName: p.name,
        title: `${qty(d.litres)} litres into ${eq.code} ${eq.name} on ${day(d.date)} with no log that day`,
        detail: `The store issued fuel into ${eq.code} at ${p.code} on ${day(d.date)}, but the machine has no log for the day: fuel with no work to show for it.`,
        quantity: `${qty(d.litres)} litres`,
        valueInr: value,
        working: [
          `Issued on ${day(d.date)}: ${d.entries.map((e) => e.no).join(', ')}, ${qty(d.litres)} litres`,
          `Logs of ${eq.code} on ${day(d.date)}: none (rejected logs don't count)`,
          ...(value ? [`At the fuel's item rate: ${rupees(value)}`] : []),
          `Flagged from ${FUEL_NO_LOG_MIN_LITRES} litres a day`,
        ],
        links: [...d.entries.map((e) => ({ label: e.no, href: `/stock?sub=register&q=${encodeURIComponent(e.no)}` })), { label: 'Machinery logs', href: `/projects/${p.id}?tab=machinery` }],
        action: `Get ${eq.code}'s log for ${day(d.date)} written, or find where the fuel went`,
      });
    }

    // Off the norm over the month's logs: the watch list's FUEL_NORM, priced here.
    const normed = new Map<string, typeof logs>();
    for (const l of logs) if (l.equipment.fuelNorm && l.equipment.fuelNormUnit && byId.has(l.projectId)) normed.set(l.equipmentId, [...(normed.get(l.equipmentId) ?? []), l]);
    for (const [id, ls] of normed) {
      const eq = ls[0].equipment;
      const unit = eq.fuelNormUnit!;
      const norm = n(eq.fuelNorm);
      const tolerance = eq.fuelTolerancePct ? n(eq.fuelTolerancePct) : FUEL_TOLERANCE_DEFAULT_PCT;
      const litresOf = (l: (typeof ls)[number]) => (l.dieselLitres ? n(l.dieselLitres) : (issued.get(`${id}|${dateOnly(l.date)}`)?.litres ?? 0));
      const kmOf = (l: (typeof ls)[number]) => (l.meterStart && l.meterEnd ? n(l.meterEnd) - n(l.meterStart) : null);
      const sent = ls.filter((l) => l.status === 'SUBMITTED' || l.status === 'APPROVED');
      const f = fuelNormCheck(sent.map((l) => ({ date: dateOnly(l.date)!, hoursWorked: n(l.hoursWorked), km: kmOf(l), litres: litresOf(l) })), norm, unit, tolerance, to);
      if (!f || !f.thirsty) continue;
      const used = sent.filter((l) => dateOnly(l.date)! >= f.from && dateOnly(l.date)! <= f.to);
      const litres = used.reduce((s, l) => s + litresOf(l), 0);
      const use = unit === 'KM_PER_LITRE' ? used.reduce((s, l) => s + (kmOf(l) ?? 0), 0) : used.reduce((s, l) => s + n(l.hoursWorked), 0);
      const extra = Math.max(0, unit === 'KM_PER_LITRE' ? litres - use / norm : litres - use * norm);
      if (extra <= 0) continue;
      // A litre at what the store charged for the fuel issued into it this month
      const priced = [...issued].filter(([k]) => k.startsWith(`${id}|`)).map(([, v]) => v);
      const perLitre = priced.length && priced.every((v) => v.priced) ? priced.reduce((s, v) => s + v.value, 0) / priced.reduce((s, v) => s + v.litres, 0) : null;
      const value = seeValues && perLitre ? extra * perLitre : null;
      const p = byId.get(used[used.length - 1].projectId)!;
      const avg = `${qty(f.average)} ${unit === 'KM_PER_LITRE' ? 'km a litre' : 'litres an hour'}`;
      out.push({
        key: `fuel-norm:${id}`,
        warnKey: `fuel-norm:${id}:${from.slice(0, 7)}`,
        section: 'fuel',
        projectId: p.id,
        projectCode: p.code,
        projectName: p.name,
        title: `${eq.code} ${eq.name}: ${avg} against ${fuelNormText(norm, unit)}`,
        detail: `${Math.abs(Math.round(f.deviationPct))}% beyond its norm over ${plural(f.logs, 'log')} this month: check for leaks, idling counted as work, or fuel going elsewhere.`,
        quantity: `${qty(extra)} litres`,
        valueInr: value,
        working: [
          `${plural(f.logs, 'log')}, ${day(f.from)} to ${day(f.to)}: ${qty(litres)} litres for ${qty(use)} ${unit === 'KM_PER_LITRE' ? 'km' : 'hours'}`,
          `At the norm these need ${qty(litres - extra)} litres: ${qty(extra)} more were used`,
          ...(value && perLitre ? [`${qty(extra)} litres × ${rate(Math.round(perLitre * 100) / 100)} a litre = ${rupees(value)}`] : []),
          `Flagged beyond ±${tolerance}% of the norm`,
        ],
        links: [
          { label: 'Fuel position', href: '/machinery?tab=fuel' },
          { label: 'Machinery logs', href: `/projects/${p.id}?tab=machinery` },
        ],
        action: `Check ${eq.code} for leaks and idling, and match its fuel slips to the log sheets`,
      });
    }
    return out;
  }

  /** Hired machines paid for hours or days they did not work this month. */
  private async idle(projects: Project[], from: string, to: string, seeValues: boolean): Promise<LeakageFlag[]> {
    const logs = await this.prisma.machineryLog.findMany({
      where: { projectId: { in: projects.map((p) => p.id) }, status: notRejected, date: { gte: parseDate(from), lte: parseDate(to) }, equipment: { ownership: 'HIRED', rateUnit: { in: ['HOUR', 'MONTH'] } } },
      select: { equipmentId: true, projectId: true, date: true, hoursWorked: true, idleHours: true, equipment: { select: { code: true, name: true, rate: true, rateUnit: true, hireMinHours: true, vendor: { select: { name: true } } } } },
      orderBy: { date: 'asc' },
    });
    const byKey = new Map<string, typeof logs>();
    for (const l of logs) byKey.set(`${l.equipmentId}|${l.projectId}`, [...(byKey.get(`${l.equipmentId}|${l.projectId}`) ?? []), l]);
    const byId = new Map(projects.map((p) => [p.id, p]));
    const month = from.slice(0, 7);
    const out: LeakageFlag[] = [];
    for (const [k, ls] of byKey) {
      const eq = ls[0].equipment;
      const p = byId.get(ls[0].projectId)!;
      // Two logs on a day (shifts) are one day
      const perDay = new Map<string, number>();
      for (const l of ls) perDay.set(dateOnly(l.date)!, (perDay.get(dateOnly(l.date)!) ?? 0) + n(l.hoursWorked));
      const h = idleHire({ rateUnit: eq.rateUnit, rate: eq.rate ? n(eq.rate) : null, minHours: eq.hireMinHours ? n(eq.hireMinHours) : null }, [...perDay].map(([date, worked]) => ({ date, worked })), month, to);
      if (!h) continue;
      const value = seeValues ? h.paidIdle : null;
      const hourly = eq.rateUnit === 'HOUR';
      const [equipmentId] = k.split('|');
      out.push({
        key: `idle:${k}`,
        warnKey: hourly ? `idle:${equipmentId}:${p.id}:${month}:${Math.floor(h.shortHours! / 25)}` : `idle:${equipmentId}:${p.id}:${month}:${Math.floor(h.idleDays / 3)}`,
        section: 'idle',
        projectId: p.id,
        projectCode: p.code,
        projectName: p.name,
        title: hourly
          ? `${eq.code} ${eq.name}: ${qty(h.shortHours!)} hours under its paid minimum`
          : `${eq.code} ${eq.name}: ${plural(h.idleDays, 'idle day')} on a monthly hire`,
        detail: hourly
          ? `Hired with ${qty(n(eq.hireMinHours))} hours a month paid whatever it works; it has worked ${qty(h.worked)} hours so far, against ${qty(h.minSoFar!)} for the days gone. The bill tops it up to the minimum.`
          : `Hired by the month${eq.vendor ? ` from ${eq.vendor.name}` : ''}, and idle ${plural(h.idleDays, 'day')} of ${h.days} at ${p.code}: each is paid for.`,
        quantity: hourly ? `${qty(h.shortHours!)} hours${h.idleDays ? `, ${plural(h.idleDays, 'idle day')}` : ''}` : plural(h.idleDays, 'idle day'),
        valueInr: value,
        working: hourly
          ? [
              `Minimum ${qty(n(eq.hireMinHours))} hours a month × ${Number(to.slice(8, 10))} of ${daysIn(month)} days = ${qty(h.minSoFar!)} hours so far`,
              `Worked: ${qty(h.worked)} hours over ${plural(h.days - h.idleDays, 'day')} since its first log of the month on ${day([...perDay.keys()][0])}${h.idleDays ? `; ${plural(h.idleDays, 'day')} with none` : ''}`,
              `Short: ${qty(h.minSoFar!)} − ${qty(h.worked)} = ${qty(h.shortHours!)} hours${value && eq.rate ? ` × ${rate(n(eq.rate))} an hour = ${rupees(value)}` : ''}`,
            ]
          : [
              `${h.days} days from its first log of the month on ${day([...perDay.keys()][0])} to its last on ${day([...perDay.keys()].at(-1)!)}: ${plural(h.idleDays, 'day')} with no hours worked`,
              ...(value && eq.rate ? [`${rate(n(eq.rate))} a month ÷ ${daysIn(month)} days × ${h.idleDays} = ${rupees(value)}`] : []),
              `Flagged from ${IDLE_MIN_DAYS} idle days in a month`,
            ],
        links: [
          { label: 'Machinery logs', href: `/projects/${p.id}?tab=machinery` },
          { label: 'Hire bills', href: '/vendor-bills' },
        ],
        action: `Put ${eq.code} to work, move it to a site that needs it, or off-hire it`,
      });
    }
    return out;
  }
}
