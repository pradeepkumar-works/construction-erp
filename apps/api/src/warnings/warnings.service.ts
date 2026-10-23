import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { WarningDto, WarningKind, WarningOutcome, WarningRecordDto, WatchListDto } from '@erp/shared';
import {
  DEFAULT_CLIENT_PAYMENT_DAYS,
  FUEL_TOLERANCE_DEFAULT_PCT,
  MATERIAL_OVERUSE_MIN_PCT,
  PAUSE_MIN_OUTCOMES,
  PAUSE_WINDOW_DAYS,
  PAUSE_WRONG_SHARE,
  TRACK_RECORD_SIZE,
  WARNING_CONFIDENCE_OF,
  WARNING_DISMISS_MIN,
  WARNING_KINDS,
  WARNING_KIND_LABELS,
  WARNING_OUTCOME_LABELS,
  canResumeWarningKind,
  canSeeCashForecast,
  fuelNormText,
  watchListKinds,
} from '@erp/shared';
import type { RequestUser } from '../common/current-user';
import { AuditService } from '../common/audit.service';
import { ProjectAccessService } from '../common/project-access.service';
import { dateOnly, parseDate } from '../common/serialize';
import { PrismaService } from '../prisma/prisma.service';
import { todayIn } from '../notifications/time';
import { ReceivablesService } from '../receivables/receivables.service';
import { PayablesService } from '../payables/payables.service';
import { ReconciliationService } from '../reconciliation/reconciliation.service';
import { moduleOn } from '../common/module-switch.guard';
import { LeakageService } from '../leakage/leakage.service';
import { monthSpan } from '../leakage/leakage-rules';
import { CashForecastService } from '../cash-forecast/cash-forecast.service';
import {
  type Delivery,
  type MachineDay,
  type OutcomeFact,
  DPR_MISSING_DAYS,
  EMI_GRACE_DAYS,
  IDLE_SHARE,
  ISSUE_WINDOW_DAYS,
  LATE_SHARE,
  MACHINE_WINDOW_DAYS,
  MIN_BREAKDOWN_HOURS,
  REJECT_SHARE,
  SLIP_GRACE_DAYS,
  VENDOR_WINDOW_DAYS,
  activityForecast,
  addDays,
  daysBetween,
  pauseState,
  trackRecord,
  cashGap,
  cashWeeks,
  daysToPay,
  dprGap,
  emiOverdue,
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

type Draft = Omit<WarningDto, 'dismissed' | 'confidence'>;

/** The watch-list kinds built from the leakage checks (item 121), and the section each comes from. */
const LEAK_SECTION = { RATE_ABOVE: 'rates', FUEL_NO_LOG: 'fuel', IDLE_HIRE: 'idle' } as const;

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
    private leakage: LeakageService,
    private cashForecast: CashForecastService,
  ) {}

  async list(user: RequestUser): Promise<WatchListDto> {
    const kinds = watchListKinds(user.roleKey);
    if (!kinds.length) throw new ForbiddenException('The watch list is for managers, stores, purchase and accounts');
    const today = todayIn();
    const records = await this.records(user.organizationId, kinds, today);
    const paused = new Set(records.filter((r) => r.paused).map((r) => r.kind));
    const warnings = (await this.compute(user, today)).filter((w) => !paused.has(w.kind));
    const keys = warnings.map((w) => w.key);
    const dismissals = keys.length
      ? await this.prisma.warningDismissal.findMany({
          where: { organizationId: user.organizationId, warningKey: { in: keys } },
          select: { warningKey: true, outcome: true, reason: true, createdAt: true, dismissedBy: { select: { fullName: true } } },
        })
      : [];
    const by = new Map(dismissals.map((d) => [d.warningKey, { outcome: d.outcome, reason: d.reason, byName: d.dismissedBy.fullName, at: d.createdAt.toISOString() }]));
    const all: WarningDto[] = warnings.map((w) => ({ ...w, dismissed: by.get(w.key) ?? null }));
    return { asOf: today, kinds, open: all.filter((w) => !w.dismissed), dismissed: all.filter((w) => w.dismissed), records, canResume: canResumeWarningKind(user.roleKey) };
  }

  /**
   * Item 119: dismissing says what became of the warning. Known and accepted needs a note saying why; Fixed and Wrong
   * may have one. The outcome is also logged for the kind's track record, and kept when the warning is restored.
   */
  async dismiss(user: RequestUser, key: string, outcome: WarningOutcome, reason?: string): Promise<WatchListDto> {
    const note = (reason ?? '').trim();
    if (outcome === 'KNOWN' && note.length < WARNING_DISMISS_MIN) throw new BadRequestException('Say why it can be left as it is');
    const w = await this.assertShown(user, key);
    try {
      await this.prisma.$transaction([
        this.prisma.warningDismissal.create({ data: { organizationId: user.organizationId, warningKey: key, outcome, reason: (note || WARNING_OUTCOME_LABELS[outcome]).slice(0, 500), dismissedById: user.id } }),
        this.prisma.warningOutcomeLog.create({ data: { organizationId: user.organizationId, kind: w.kind, warningKey: key, outcome, note: note ? note.slice(0, 500) : null, userId: user.id } }),
      ]);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Someone has already dismissed this warning');
      throw e;
    }
    await this.audit.log(user, 'WARNING', key, 'DISMISSED', `${WARNING_OUTCOME_LABELS[outcome]}${note ? `: ${note}` : ''}`);
    return this.list(user);
  }

  async restore(user: RequestUser, key: string): Promise<WatchListDto> {
    await this.assertShown(user, key);
    const { count } = await this.prisma.warningDismissal.deleteMany({ where: { organizationId: user.organizationId, warningKey: key } });
    if (count) await this.audit.log(user, 'WARNING', key, 'RESTORED');
    return this.list(user);
  }

  /** An admin or management resumes a paused kind: outcomes from before now stop counting towards a pause. Audited. */
  async resume(user: RequestUser, kind: WarningKind): Promise<WatchListDto> {
    if (!canResumeWarningKind(user.roleKey)) throw new ForbiddenException('Only admins and management resume a paused check');
    const now = new Date();
    await this.prisma.warningKindResume.upsert({
      where: { organizationId_kind: { organizationId: user.organizationId, kind } },
      create: { organizationId: user.organizationId, kind, resumedAt: now, resumedById: user.id },
      update: { resumedAt: now, resumedById: user.id },
    });
    await this.audit.log(user, 'WARNING', kind, 'RESUMED', WARNING_KIND_LABELS[kind]);
    return this.list(user);
  }

  /**
   * Item 119: each kind's track record over its latest outcomes in the company, and whether it is paused (marked Wrong
   * too often in the last 30 days, since it was last resumed). `warningAlerts` and the morning brief leave paused kinds out.
   */
  async records(organizationId: string, kinds: WarningKind[], today: string): Promise<WarningRecordDto[]> {
    if (!kinds.length) return [];
    const [logs, resumes] = await Promise.all([
      this.prisma.warningOutcomeLog.findMany({
        where: { organizationId, kind: { in: kinds } },
        select: { kind: true, outcome: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        // Enough for the track record and a 30-day window on any sane volume.
        take: 2000,
      }),
      this.prisma.warningKindResume.findMany({ where: { organizationId, kind: { in: kinds } }, select: { kind: true, resumedAt: true } }),
    ]);
    const resumedAt = new Map(resumes.map((r) => [r.kind, r.resumedAt.getTime()]));
    const fact = (l: (typeof logs)[number]): OutcomeFact => ({ outcome: l.outcome, date: todayIn(undefined, l.createdAt) });
    return kinds.map((kind) => {
      const ofKind = logs.filter((l) => l.kind === kind);
      const sinceResume = ofKind.filter((l) => l.createdAt.getTime() > (resumedAt.get(kind) ?? 0));
      return {
        kind,
        ...trackRecord(ofKind.map(fact), TRACK_RECORD_SIZE),
        paused: pauseState(sinceResume.map(fact), today, { windowDays: PAUSE_WINDOW_DAYS, minOutcomes: PAUSE_MIN_OUTCOMES, wrongShare: PAUSE_WRONG_SHARE }),
      };
    });
  }

  /** Only a warning the caller is shown now can be dismissed or brought back. */
  private async assertShown(user: RequestUser, key: string) {
    if (!watchListKinds(user.roleKey).length) throw new ForbiddenException('The watch list is for managers, stores, purchase and accounts');
    const w = (await this.compute(user, todayIn())).find((x) => x.key === key);
    if (!w) throw new NotFoundException('This warning no longer applies');
    return w;
  }

  /** Open warnings (not dismissed) for My work. */
  async open(user: RequestUser): Promise<WarningDto[]> {
    return (await this.list(user)).open;
  }

  /** Every warning the caller's role and projects give on `today`, dismissed or not (paused kinds too), most pressing kind first. */
  async compute(user: RequestUser, today: string, only?: WarningKind[]): Promise<Omit<WarningDto, 'dismissed'>[]> {
    // EMIs only while the company uses machine loans (v6 item 117).
    const kinds = watchListKinds(user.roleKey).filter((k) => (!only || only.includes(k)) && (k !== 'LOAN_EMI' || moduleOn(user, 'machine_loans')));
    if (!kinds.length) return [];
    const projects: Project[] = await this.prisma.project.findMany({
      where: this.access.projectWhere(user),
      select: { id: true, code: true, name: true, status: true, type: true, startDate: true },
      orderBy: { code: 'asc' },
    });
    const active = projects.filter((p) => p.status === 'ACTIVE');
    const leaks = kinds.some((k) => k in LEAK_SECTION) ? this.leaks(user, today, kinds) : Promise.resolve([]);
    const parts = await Promise.all(
      WARNING_KINDS.filter((k) => kinds.includes(k)).map((k) => {
        if (k === 'SCHEDULE') return this.schedule(active, today);
        if (k === 'CASH') return today === todayIn() ? this.cash(user, projects, today) : Promise.resolve([]);
        if (k === 'VENDOR') return this.vendors(projects, today);
        if (k === 'STOCK') return this.stock(user.organizationId, projects, today);
        if (k === 'MACHINE') return this.machines(projects, today);
        if (k === 'MATERIAL_OVERUSE') return this.overuse(active, today);
        if (k === 'FUEL_NORM') return this.fuel(projects, today);
        if (k === 'LOAN_EMI') return this.loanEmis(user.organizationId, today);
        if (k in LEAK_SECTION) return leaks.then((ws) => ws.filter((w) => w.kind === k));
        // A central store files no DPR (v6 item 106).
        return this.dprs(active.filter((p) => p.type !== 'STORE'), today);
      }),
    );
    return parts.flat().map((w) => ({ ...w, confidence: WARNING_CONFIDENCE_OF[w.kind] }));
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
      const daysToTarget = daysBetween(today, f.target);
      const need = daysToTarget > 0 ? left / daysToTarget : null;
      out.push({
        key: f.stalled ? `schedule:${a.id}:stalled` : `schedule:${a.id}:${Math.floor(f.slipDays! / 14)}`,
        kind: 'SCHEDULE',
        title: f.stalled ? `${a.name} on ${p.code} has had no progress for ${stalledFor}` : `${a.name} on ${p.code} heads for ${plural(f.slipDays!, 'day')} late`,
        detail: f.stalled
          ? `No progress approved in that time; ${f.donePct}% is done, ${qty(left)} ${a.unit} is left, and the ${targetLabel.toLowerCase()} is ${day(f.target)}.`
          : `At ${qty(f.rate)} ${a.unit} a day over the last 4 weeks, the ${qty(left)} ${a.unit} left is done on ${day(f.forecastFinish!)}, against the ${targetLabel.toLowerCase()} of ${day(f.target)}.`,
        action: f.stalled
          ? `Find out what holds up ${a.name} and restart it, or re-plan it`
          : need
            ? `Raise the pace to ${qty(need)} ${a.unit} a day (now ${qty(f.rate)}) with another crew or a new sequence`
            : `Agree a new finish for ${a.name} and tell the client`,
        impact: f.stalled ? { text: `No progress for ${stalledFor}`, inr: null, days: null } : { text: `${plural(f.slipDays!, 'day')} late`, inr: null, days: f.slipDays! },
        working: [
          `Done: ${f.donePct}% of ${qty(n(a.plannedQty))} ${a.unit}, so ${qty(left)} ${a.unit} is left`,
          f.stalled ? `Approved progress in the last ${stalledFor}: none` : `Pace: ${qty(f.rate)} ${a.unit} a day of approved progress over the last 4 weeks`,
          ...(f.forecastFinish ? [`${qty(left)} ÷ ${qty(f.rate)} a day finishes on ${day(f.forecastFinish)}`] : []),
          `${targetLabel}: ${day(f.target)}${f.slipDays ? `, so ${plural(f.slipDays, 'day')} late` : ''}. A slip of ${SLIP_GRACE_DAYS} days or less is not flagged`,
          ...(need ? [`To finish on time: ${qty(left)} ÷ ${plural(daysToTarget, 'day')} = ${qty(need)} ${a.unit} a day`] : []),
        ],
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
  /**
   * Leakage checks (item 121) as warnings: rates above another site, fuel issued with no log and hired machines paid for
   * idle time, from the month's flags in `LeakageService` so the watch list and the Leakage checks page agree. Fuel off
   * its norm stays FUEL_NORM, and material over the norm MATERIAL_OVERUSE.
   */
  private async leaks(user: RequestUser, today: string, kinds: WarningKind[]): Promise<Draft[]> {
    const sections = [...new Set(kinds.filter((k) => k in LEAK_SECTION).map((k) => LEAK_SECTION[k as keyof typeof LEAK_SECTION]))];
    const { from, to } = monthSpan(today.slice(0, 7), today);
    const { flags } = await this.leakage.compute(user, from, to, sections);
    const kindOf = (f: (typeof flags)[number]): WarningKind | null =>
      f.section === 'rates' ? 'RATE_ABOVE' : f.section === 'idle' ? 'IDLE_HIRE' : f.key.startsWith('fuel-no-log:') ? 'FUEL_NO_LOG' : null;
    const out: Draft[] = [];
    for (const f of flags) {
      const kind = kindOf(f);
      if (!kind || !kinds.includes(kind)) continue;
      out.push({
        key: f.warnKey,
        kind,
        title: f.title,
        detail: f.detail,
        action: f.action,
        impact: { text: f.valueInr !== null ? `${rupees(f.valueInr)} at risk` : f.quantity, inr: f.valueInr, days: null },
        working: f.working,
        facts: [{ label: 'At risk', value: f.quantity }, ...(f.valueInr !== null ? [{ label: 'Value', value: rupees(f.valueInr) }] : [])],
        links: [...f.links, { label: 'Leakage checks', href: '/leakage' }],
        projectId: f.projectId,
        projectName: f.projectName,
      });
    }
    return out;
  }

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
          action: `Count the ${item.itemName} at ${p.code} and check its issue slips this week`,
          impact: { text: value ? `${rupees(value)} over` : `${qty(f.excess)} ${item.unit} over`, inr: value, days: null },
          working: [
            ...item.lines.map((l) => `${l.itemNo} ${l.description}: ${qty(Number(l.executedQty))} ${l.unit} done × ${qty(Number(l.qtyPerUnit))} ${item.unit} a ${l.unit} = ${qty(Number(l.theoreticalQty))} ${item.unit}`),
            `Needed for the work: ${qty(Number(item.theoreticalQty))} ${item.unit}; with the wastage allowed: ${qty(Number(item.allowedQty))} ${item.unit}`,
            `Used: ${qty(Number(item.issuedQty))} issued − ${qty(Number(item.returnedQty))} returned = ${qty(Number(item.consumedQty))} ${item.unit}`,
            `Over: ${qty(Number(item.consumedQty))} − ${qty(Number(item.allowedQty))} = ${qty(f.excess)} ${item.unit} (${Math.round(f.overPct)}%)${value && item.rate ? ` × ₹${Number(item.rate).toLocaleString('en-IN')} = ${rupees(value)}` : ''}`,
            `Flagged from ${MATERIAL_OVERUSE_MIN_PCT}% over the allowance`,
          ],
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
      const usedLogs = ls.filter((l) => dateOnly(l.date)! >= f.from && dateOnly(l.date)! <= f.to);
      const litres = usedLogs.reduce((s, l) => s + (l.dieselLitres ? n(l.dieselLitres) : (issued.get(`${id}|${dateOnly(l.date)}`) ?? 0)), 0);
      const use = unit === 'KM_PER_LITRE' ? usedLogs.reduce((s, l) => s + (l.meterStart && l.meterEnd ? n(l.meterEnd) - n(l.meterStart) : 0), 0) : usedLogs.reduce((s, l) => s + n(l.hoursWorked), 0);
      // Litres beyond the norm over these logs, for a machine that burns too much.
      const extraLitres = f.thirsty ? Math.max(0, unit === 'KM_PER_LITRE' ? litres - use / norm : litres - use * norm) : 0;
      const avg = `${qty(f.average)} ${unit === 'KM_PER_LITRE' ? 'km a litre' : 'litres an hour'}`;
      out.push({
        key: `fuel:${id}:${f.thirsty ? 'more' : 'less'}:${fuelStep(f.deviationPct)}`,
        kind: 'FUEL_NORM',
        title: `${eq.code} ${eq.name} ${f.thirsty ? 'is using more fuel than its norm' : 'is using less fuel than its norm'}: ${avg}`,
        detail: `${avg} over its last ${f.logs} logs (${day(f.from)} to ${day(f.to)}) against ${fuelNormText(norm, unit)}, ${Math.abs(Math.round(f.deviationPct))}% ${f.deviationPct > 0 ? 'above' : 'below'} it (tolerance ${tolerance}%). ${f.thirsty ? 'Check for leaks, idling counted as work, or fuel going elsewhere.' : 'Check that hours or km are not written up and that fuel is booked to the right machine.'}`,
        action: f.thirsty ? `Check ${eq.code} for leaks and idling, and match its fuel slips to the log sheets` : `Check ${eq.code}'s ${unit === 'KM_PER_LITRE' ? 'odometer' : 'hour meter'} readings and where its fuel is booked`,
        impact: { text: f.thirsty ? `${qty(extraLitres)} litres over the norm` : `${Math.abs(Math.round(f.deviationPct))}% under the norm`, inr: null, days: null },
        working: [
          `${f.logs} logs, ${day(f.from)} to ${day(f.to)}: ${qty(litres)} litres for ${qty(use)} ${unit === 'KM_PER_LITRE' ? 'km' : 'hours'}`,
          unit === 'KM_PER_LITRE' ? `${qty(use)} km ÷ ${qty(litres)} litres = ${avg}` : `${qty(litres)} litres ÷ ${qty(use)} hours = ${avg}`,
          `Norm ${fuelNormText(norm, unit)}, flagged beyond ±${tolerance}%: this is ${Math.round(f.deviationPct) > 0 ? '+' : ''}${Math.round(f.deviationPct)}%`,
          ...(f.thirsty ? [`At the norm these ${unit === 'KM_PER_LITRE' ? 'km' : 'hours'} need ${qty(litres - extraLitres)} litres: ${qty(extraLitres)} more were used`] : []),
        ],
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

  /** Machine loans (v6 item 108): an EMI unpaid past its date, most overdue first. Company-wide, as the loans are. */
  private async loanEmis(organizationId: string, today: string): Promise<Draft[]> {
    const loans = await this.prisma.equipmentLoan.findMany({
      where: { organizationId, status: 'ACTIVE', emis: { some: { paidOn: null, dueDate: { lt: parseDate(today) } } } },
      select: {
        id: true,
        lenderName: true,
        loanNo: true,
        equipment: { select: { code: true, name: true } },
        emis: { where: { dueDate: { lte: parseDate(today) } }, select: { no: true, dueDate: true, emi: true, paidOn: true }, orderBy: { no: 'asc' } },
      },
    });
    const out: (Draft & { days: number })[] = [];
    for (const l of loans) {
      const o = emiOverdue(
        l.emis.map((e) => ({ no: e.no, dueDate: dateOnly(e.dueDate)!, emi: n(e.emi), paidOn: dateOnly(e.paidOn) })),
        today,
      );
      if (!o) continue;
      out.push({
        key: `emi:${l.id}:${o.oldestNo}:${o.count}`,
        kind: 'LOAN_EMI',
        title: `${plural(o.count, 'EMI')} unpaid on ${l.equipment.code} ${l.equipment.name}: ${rupees(o.amount)} to ${l.lenderName}`,
        detail: `EMI ${o.oldestNo} of loan ${l.loanNo} fell due on ${day(o.oldestDue)}, ${o.days} days ago. A late EMI draws penal interest and a bounce charge, and marks the company's credit; pay it, or record it if it was paid.`,
        action: `Pay ${l.lenderName} today, or record the EMI if it was paid`,
        impact: { text: `${rupees(o.amount)} overdue`, inr: o.amount, days: null },
        working: [`EMI ${o.oldestNo} fell due on ${day(o.oldestDue)}: ${o.days} days ago`, `${plural(o.count, 'EMI')} due and not marked paid: ${rupees(o.amount)}`, `Flagged ${EMI_GRACE_DAYS} days after a due date`],
        facts: [
          { label: 'Overdue', value: rupees(o.amount) },
          { label: 'Oldest due', value: day(o.oldestDue) },
          { label: 'Days late', value: String(o.days) },
          { label: 'Lender', value: l.lenderName },
        ],
        links: [{ label: 'The loan', href: `/machine-loans/${l.id}` }],
        projectId: null,
        projectName: null,
        days: o.days,
      });
    }
    return out.sort((a, b) => b.days - a.days).map(({ days: _d, ...w }) => w);
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
        action: `Ask the site team at ${p.code} to send the missing DPRs today`,
        impact: { text: `${plural(gap.days, 'day')} not recorded`, inr: null, days: null },
        working: [last ? `Last DPR sent: ${day(last)}` : 'No DPR sent in the last 31 days', `Days since with none sent: ${gap.days >= 30 ? '30 or more' : gap.days}`, `Flagged after ${DPR_MISSING_DAYS} days in a row; drafts do not count`],
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
        action: `Raise a material request for ${item.name} at ${p.code} today`,
        impact: { text: balance <= 0 ? 'Out of stock' : `Runs out in ${plural(Math.max(0, Math.floor(f.daysLeft)), 'day')}`, inr: null, days: null },
        working: [
          `Balance: ${qty(Math.max(0, balance))} ${item.unit}; on order: ${qty(onOrder)} ${item.unit}`,
          `Issued in the last ${ISSUE_WINDOW_DAYS} days: ${qty(pair.issues.filter((i) => i.date >= addDays(today, -ISSUE_WINDOW_DAYS + 1)).reduce((s, i) => s + i.qty, 0))} ${item.unit}, so ${qty(f.perDay)} a day`,
          `${qty(Math.max(0, balance))} ÷ ${qty(f.perDay)} a day = ${qty(f.daysLeft)} days left`,
          `An order takes ${plural(lead.days, 'day')} ${lead.fromHistory ? '(the median of past orders)' : '(assumed: no past orders)'}, so it is flagged now`,
        ],
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
        action: `Talk to ${v.name} before the next order, or ask other vendors for prices`,
        impact: null,
        working: [
          `Last 60 days: ${t.recent.deliveries} deliveries, ${t.recent.late} after the order's delivery date, ${pct(t.recent.rejectShare)} of the quantity rejected at the gate`,
          `The 60 days before: ${t.before.deliveries ? `${t.before.deliveries} deliveries, ${t.before.late} late, ${pct(t.before.rejectShare)} rejected` : 'no deliveries'}`,
          `Flagged when late on ${pct(LATE_SHARE)} or more of deliveries, or ${pct(REJECT_SHARE)} or more rejected, and worse than before`,
        ],
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
        action: t.breakdownWorse ? `Book a service for ${m.name} and check its breakdown entries` : `Move ${m.name} to where it is needed, or off-hire it`,
        impact: { text: what, inr: null, days: null },
        working: [
          `Last 30 days: ${qty(t.recent.worked)} h worked, ${qty(t.recent.idle)} h idle, ${qty(t.recent.breakdown)} h broken down`,
          `Idle share: ${qty(t.recent.idle)} ÷ ${qty(t.recent.worked + t.recent.idle)} h = ${pct(t.recent.idleShare)} (the 30 days before: ${pct(t.before.idleShare)})`,
          `Flagged when idle ${pct(IDLE_SHARE)} or more of its hours, or broken down ${MIN_BREAKDOWN_HOURS} h or more, and worse than the 30 days before`,
        ],
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
    if (canSeeCashForecast(user.roleKey)) return this.cashFromForecast(user);
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
        action: `Chase the open client bills, or agree which payments wait, before ${day(gap.start)}`,
        impact: { text: `${rupees(-gap.cumulative)} short`, inr: -gap.cumulative, days: null },
        working: [
          ...upTo.map((w) => `Week of ${day(w.start)}: in ${rupees(w.in)}, out ${rupees(w.out)}, running ${rupees(w.cumulative)}`),
          `Money in: each open client bill at its sent date plus the days that client takes to pay (${pays || 'none open'})`,
          'Money out: open vendor and subcontractor bills on their due dates. The bank balance is not counted yet',
        ],
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
  /**
   * The cash gap from the 13-week forecast (item 122) for whoever keeps the books: the bank and cash in hand, every
   * receipt and payment the forecast knows, and the first week whose likely balance goes below zero.
   */
  private async cashFromForecast(user: RequestUser): Promise<Draft[]> {
    const f = await this.cashForecast.forecast(user);
    const gap = f.weeks.find((w) => w.short);
    if (!gap) return [];
    const upTo = f.weeks.slice(0, f.weeks.indexOf(gap) + 1);
    const inn = upTo.reduce((s, w) => s + w.in.likely, 0);
    const out = upTo.reduce((s, w) => s + w.out.likely, 0);
    const lowest = f.weeks.find((w) => w.start === f.lowest.week)!;
    return [
      {
        key: `cash:${gap.start}:${Math.round(-gap.closing.likely / 1e5)}`,
        kind: 'CASH',
        title: `Cash gap of ${rupees(-gap.closing.likely)} by the week of ${day(gap.start)}`,
        detail: `${rupees(f.opening.total)} in bank and cash today, ${rupees(inn)} likely to come in and ${rupees(out)} to go out by ${day(gap.end)}.${gap.reasons.length ? ` ${gap.reasons[0]}.` : ''}`,
        action: f.chase.length ? `Chase ${f.chase[0].label}${f.hold.length ? `, or hold ${f.hold[0].label}` : ''}, before ${day(gap.start)}` : `Agree which payments wait past ${day(gap.start)}`,
        impact: { text: `${rupees(-gap.closing.likely)} short`, inr: -gap.closing.likely, days: null },
        working: [
          `Opening: bank ${rupees(f.opening.bank)} + cash ${rupees(f.opening.cash)} = ${rupees(f.opening.total)}`,
          ...upTo.map((w) => `Week of ${day(w.start)}: in ${rupees(w.in.likely)}, out ${rupees(w.out.likely)}, balance ${rupees(w.closing.likely)} (low ${rupees(w.closing.low)}, high ${rupees(w.closing.high)})`),
          ...gap.reasons,
        ],
        facts: [
          { label: 'Bank and cash today', value: rupees(f.opening.total) },
          { label: 'Likely in to then', value: rupees(inn) },
          { label: 'Likely out to then', value: rupees(out) },
          { label: 'Lowest in 13 weeks', value: `${rupees(lowest.closing.likely)}, week of ${day(lowest.start)}` },
        ],
        links: [
          { label: 'Cash forecast', href: '/cash-forecast' },
          { label: 'Receivables', href: '/receivables' },
          { label: 'Payables', href: '/payables' },
        ],
        projectId: null,
        projectName: null,
      },
    ];
  }
}
