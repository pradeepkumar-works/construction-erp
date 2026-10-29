import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { WarningDto, WarningKind, WarningOutcome, WarningRecordDto, WatchListDto } from '@erp/shared';
import {
  RECALL_DAYS,
  copyLabel,
  DEFAULT_CLIENT_PAYMENT_DAYS,
  DEFAULT_PORT_TO_SITE_DAYS,
  PACKAGE_STAGE_LABELS,
  OM_BENCHMARK_INFO,
  DEFAULT_NOTICE_DAYS,
  DELAY_PARTY_LABELS,
  NOTICE_PARTIES,
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
  BOQ_GAP_PCT,
  COST_HEAD_LABELS,
  COST_HEADS,
  MAX_PAGE_SIZE,
  boqContractGap,
  concreteGrade,
  gradeFck,
  canResumeWarningKind,
  canSeeCashForecast,
  fuelNormText,
  revisedCompletion,
  watchListKinds,
  isClientSide,
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
import { AttendanceCheckService } from '../attendance-check/attendance-check.service';
import { monthSpan } from '../leakage/leakage-rules';
import { CashForecastService } from '../cash-forecast/cash-forecast.service';
import { QaService } from '../qa/qa.service';
import { QaRegistersService } from '../qa/registers.service';
import { QualityService } from '../quality/quality.service';
import { DrawingScheduleService } from '../design/drawing-schedule.service';
import { DesignSubmissionsService } from '../design/design-submissions.service';
import { DesignControlService } from '../design/design-control.service';
import { EarnedValueService } from '../cost/earned-value.service';
import { BudgetService } from '../cost/budget.service';
import { CostService } from '../cost/cost.service';
import { noticeClock } from '../hindrance/hindrance-rules';
import { packageStatus } from '../epc/epc-rules';
import { loadMonths, loadOm } from '../om/om-load';
import { periodOf } from '../om/om-rules';
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
  TESTS_SHORT_MIN,
  CUBE_7DAY_SHARE,
  calibrationWarns,
  cubeEarly,
  lateReportGroups,
  lateDrawingGroups,
  lateDesignReviews,
  lateRecalls,
  testsShort,
  PACKAGE_GRACE_DAYS,
  SLIP_GRACE_DAYS,
  VENDOR_WINDOW_DAYS,
  activityForecast,
  addDays,
  daysBetween,
  packageLate,
  omSlip,
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
  planFinishLate,
  scheduleWarns,
  stockRunout,
  vendorTrend,
  headsBehind,
  marginFade,
  marginStep,
  MARGIN_FADE_PTS,
  MARGIN_WINDOW_MONTHS,
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
/** With the year: a completion date is often next year or later. */
const dayYear = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
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
  endDate: Date | null;
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
    private attendance: AttendanceCheckService,
    private qa: QaService,
    private qaRegisters: QaRegistersService,
    private drawingSchedule: DrawingScheduleService,
    private designSubmissions: DesignSubmissionsService,
    private designControl: DesignControlService,
    private earnedValue: EarnedValueService,
    private budget: BudgetService,
    private cost: CostService,
    private quality: QualityService,
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
      select: { id: true, code: true, name: true, status: true, type: true, startDate: true, endDate: true },
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
        if (k === 'NOTICE_DUE') return this.notices(active, today);
        if (k === 'MANDAYS_ABOVE') return today === todayIn() ? this.manDays(user) : Promise.resolve([]);
        if (k === 'PACKAGE_LATE') return this.packages(active, today);
        // A scheme in O&M is a completed project (item 131).
        if (k === 'OM_SERVICE') return this.omService(projects, today);
        if (k === 'BOQ_OFF_CONTRACT') return this.boqGaps(projects.filter((p) => p.status === 'ACTIVE' || p.status === 'PLANNED'));
        // QA/QC (item 137): today's registers, read through their own services.
        if (k === 'TESTS_SHORT') return today === todayIn() ? this.testsShort(user) : Promise.resolve([]);
        if (k === 'CALIBRATION_DUE') return today === todayIn() ? this.calibration(user, today) : Promise.resolve([]);
        if (k === 'LAB_REPORT_LATE') return today === todayIn() ? this.labReports(user) : Promise.resolve([]);
        // Design and drawings (item 138): the schedule's late drawings, through its own service.
        if (k === 'DRAWING_LATE') return today === todayIn() ? this.drawings(user) : Promise.resolve([]);
        if (k === 'DESIGN_REVIEW_LATE') return today === todayIn() ? this.designReviews(user) : Promise.resolve([]);
        if (k === 'COPY_RECALL_LATE') return today === todayIn() ? this.copyRecalls(user) : Promise.resolve([]);
        // Margin fade (intelligence quick win Q1): earned value's month ends, as of today.
        if (k === 'MARGIN_FADE') return today === todayIn() ? this.marginFades(user, active) : Promise.resolve([]);
        if (k === 'CUBE_7DAY_LOW') return today === todayIn() ? this.cubesEarly(user, today) : Promise.resolve([]);
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
    out.push(...(await this.planFinishes(projects)));
    return out.sort((a, b) => b.slip - a.slip).map(({ slip: _slip, ...w }) => w);
  }

  /** Projects whose plan ends after the completion date with its extensions (e2e review, fix 1), first in the list. */
  private async planFinishes(projects: Project[]): Promise<(Draft & { slip: number })[]> {
    const dated = projects.filter((p) => p.endDate);
    if (!dated.length) return [];
    const ids = dated.map((p) => p.id);
    const [finishes, milestones, eots] = await Promise.all([
      this.prisma.activity.groupBy({ by: ['projectId'], where: { projectId: { in: ids } }, _max: { plannedEnd: true } }),
      this.prisma.milestone.groupBy({ by: ['projectId'], where: { projectId: { in: ids } }, _max: { dueDate: true } }),
      this.prisma.risk.groupBy({ by: ['projectId'], where: { projectId: { in: ids }, kind: 'DELAY' }, _sum: { eotGrantedDays: true } }),
    ]);
    // The Gantt's planned finish: the latest activity end or milestone due date.
    const finishOf = new Map<string, string | null>(finishes.map((f) => [f.projectId, dateOnly(f._max.plannedEnd)]));
    for (const m of milestones) {
      const due = dateOnly(m._max.dueDate);
      const was = finishOf.get(m.projectId) ?? null;
      if (due && (!was || due > was)) finishOf.set(m.projectId, due);
    }
    const eotOf = new Map(eots.map((e) => [e.projectId, e._sum.eotGrantedDays ?? 0]));
    const out: (Draft & { slip: number })[] = [];
    for (const p of dated) {
      const finish = finishOf.get(p.id) ?? null;
      const eot = eotOf.get(p.id) ?? 0;
      const completion = revisedCompletion(dateOnly(p.endDate), eot);
      const late = planFinishLate(finish, completion);
      if (late === null) continue;
      out.push({
        // A new key each fortnight the finish moves, so a dismissal holds only while the slip is about the same.
        key: `schedule-finish:${p.id}:${completion}:${Math.floor(late / 14)}`,
        kind: 'SCHEDULE',
        title: `${p.code}'s plan ends ${plural(late, 'day')} after the completion date`,
        detail: `The schedule's planned dates run to ${dayYear(finish!)}, against the completion date of ${dayYear(completion!)}${eot ? ` (with ${plural(eot, 'day')} of extensions granted)` : ''}.`,
        action: 'Re-plan the critical activities to finish in time, or claim an extension of time for the delays that excuse it',
        impact: { text: `${plural(late, 'day')} late`, inr: null, days: late },
        working: [
          `Latest planned finish of the activities and milestones: ${dayYear(finish!)}`,
          `Completion date: ${dayYear(dateOnly(p.endDate)!)}${eot ? ` + ${plural(eot, 'day')} of extensions = ${dayYear(completion!)}` : ''}`,
          `${dayYear(finish!)} − ${dayYear(completion!)} = ${plural(late, 'day')}`,
        ],
        facts: [
          { label: 'Plan ends', value: dayYear(finish!) },
          { label: 'Completion date', value: dayYear(completion!) },
        ],
        links: [
          { label: 'Schedule', href: `/projects/${p.id}?tab=schedule` },
          { label: 'Contract', href: `/projects/${p.id}?tab=contract` },
        ],
        projectId: p.id,
        projectName: p.name,
        // Whole-project lateness goes above any one activity's.
        slip: 20_000 + late,
      });
    }
    return out;
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

  /**
   * Hindrance notices (item 123): an open delay the contractor is not answerable for, with no outgoing letter linked by
   * `today`, at 7, 3 and 0 days or fewer before its notice is due (the delay's start plus the contract's notice days).
   * The key carries the stage, so a dismissal holds until the next one. Overdue ones stay until a letter is linked.
   */
  private async notices(projects: Project[], today: string): Promise<Draft[]> {
    if (!projects.length) return [];
    const delays = await this.prisma.risk.findMany({
      where: {
        projectId: { in: projects.map((p) => p.id) },
        kind: 'DELAY',
        responsibleParty: { in: NOTICE_PARTIES },
        delayStart: { lte: parseDate(today) },
        OR: [{ status: { not: 'CLOSED' } }, { closedAt: { gt: parseDate(today) } }],
        letters: { none: { direction: 'OUT', letterDate: { lte: parseDate(today) } } },
      },
      select: { id: true, riskNo: true, title: true, projectId: true, delayStart: true, delayEnd: true, responsibleParty: true, project: { select: { noticeDays: true } } },
      orderBy: { delayStart: 'asc' },
    });
    const byId = new Map(projects.map((p) => [p.id, p]));
    const out: Draft[] = [];
    for (const d of delays) {
      const p = byId.get(d.projectId)!;
      const start = dateOnly(d.delayStart)!;
      const days = d.project.noticeDays ?? DEFAULT_NOTICE_DAYS;
      const clock = noticeClock(start, days, today);
      if (clock.stage === null) continue;
      const end = dateOnly(d.delayEnd);
      const lost = daysBetween(start, end && end < today ? end : today) + 1;
      const when = clock.daysLeft > 1 ? `in ${plural(clock.daysLeft, 'day')}` : clock.daysLeft === 1 ? 'tomorrow' : clock.daysLeft === 0 ? 'today' : `${plural(-clock.daysLeft, 'day')} ago`;
      out.push({
        key: `notice:${d.id}:${clock.stage}`,
        kind: 'NOTICE_DUE',
        title: `Hindrance notice for ${d.riskNo} ${clock.daysLeft < 0 ? 'was due' : 'due'} ${when}`,
        detail: `${d.title} has held up ${p.name} since ${day(start)}. The contract allows ${days} days to give notice, so it is due ${day(clock.due)}, and no letter to the client is linked to the delay.`,
        action: clock.daysLeft >= 0 ? `Draft the notice from the delay and send it by ${day(clock.due)}` : `Send the notice today and link it to ${d.riskNo}`,
        impact: { text: clock.daysLeft < 0 ? `${plural(lost, 'day')} lost that a late notice may not cover` : `${plural(lost, 'day')} lost so far, to claim as an extension of time`, inr: null, days: lost },
        working: [
          `Held up since ${day(start)}, caused by ${DELAY_PARTY_LABELS[d.responsibleParty!].toLowerCase()}`,
          `Notice period: ${days} days${d.project.noticeDays === null ? ' (none set on the contract, 14 assumed)' : ' (set on the contract)'}`,
          `Due ${day(clock.due)}: ${clock.daysLeft >= 0 ? `${plural(clock.daysLeft, 'day')} left` : `${plural(-clock.daysLeft, 'day')} past`}`,
          'Shown 7, 3 and 0 days before it is due, until an outgoing letter is linked to the delay',
        ],
        facts: [
          { label: 'Notice due', value: day(clock.due) },
          { label: 'Days lost so far', value: String(lost) },
        ],
        links: [{ label: d.riskNo, href: `/risks?id=${d.id}` }],
        projectId: p.id,
        projectName: p.name,
      });
    }
    return out;
  }

  /**
   * EPC equipment packages that will reach site after the day site needs them (item 130): at sea by the ship's ETA,
   * else by the plan moved by the slip so far (`packageStatus`). The key moves with the forecast.
   */
  private async packages(projects: Project[], today: string): Promise<Draft[]> {
    if (!projects.length) return [];
    const rows = await this.prisma.procurementPackage.findMany({
      where: { projectId: { in: projects.map((p) => p.id) }, neededOn: { not: null } },
      include: { stages: true, vendor: { select: { name: true } } },
      orderBy: [{ projectId: 'asc' }, { sortOrder: 'asc' }],
    });
    const byId = new Map(projects.map((p) => [p.id, p]));
    const out: Draft[] = [];
    for (const r of rows) {
      const needed = dateOnly(r.neededOn)!;
      const f = packageStatus({ stages: r.stages.map((s) => ({ stage: s.stage, plannedOn: dateOnly(s.plannedOn), actualOn: dateOnly(s.actualOn) })), neededOn: needed, vessel: r.vessel, billOfLading: r.billOfLading, eta: dateOnly(r.eta), portToSiteDays: r.portToSiteDays }, today);
      const late = packageLate(f);
      if (late === null || !f.forecastOnSite) continue;
      const p = byId.get(r.projectId)!;
      const port = r.portToSiteDays ?? DEFAULT_PORT_TO_SITE_DAYS;
      const how =
        f.forecastFrom === 'ETA'
          ? `${r.vessel ? `${r.vessel} is` : 'The ship is'} due at the port on ${day(dateOnly(r.eta)!)}, and customs and the road take ${plural(port, 'day')}`
          : f.nextStage && f.nextOverdueDays
            ? `${PACKAGE_STAGE_LABELS[f.nextStage]} was planned for ${day(f.nextPlannedOn!)} and is ${plural(f.nextOverdueDays, 'day')} overdue`
            : 'The stages done so far ran late against the plan';
      out.push({
        key: `package:${r.id}:${f.forecastOnSite}`,
        kind: 'PACKAGE_LATE',
        title: `${r.code} ${r.name} will reach site ${plural(late, 'day')} after it is needed`,
        detail: `${how}, so it reaches ${p.name} about ${day(f.forecastOnSite)}; site needs it on ${day(needed)}.`,
        action: f.forecastFrom === 'ETA' ? `Line up customs clearance and transport before the ship docks, and re-plan the work that waits on it` : `Chase ${r.vendor?.name ?? 'the vendor'} for a firm date, and re-plan the work that waits on it`,
        impact: { text: `${plural(late, 'day')} late for site`, inr: null, days: late },
        working: [
          ...(f.currentStage ? [`Last stage done: ${PACKAGE_STAGE_LABELS[f.currentStage].toLowerCase()}`] : ['No stage done yet']),
          f.forecastFrom === 'ETA' ? `ETA ${day(dateOnly(r.eta)!)} + ${plural(port, 'day')} port to site = ${day(f.forecastOnSite)}` : `Planned delivery moved by the delay so far = ${day(f.forecastOnSite)}`,
          `Needed on site ${day(needed)}; warns once more than ${plural(PACKAGE_GRACE_DAYS, 'day')} late`,
        ],
        facts: [
          { label: 'Expected at site', value: day(f.forecastOnSite) },
          { label: 'Needed on site', value: day(needed) },
        ],
        links: [{ label: 'Engineering and packages', href: `/projects/${p.id}?tab=epc&sub=packages` }],
        projectId: p.id,
        projectName: p.name,
      });
    }
    return out;
  }

  /**
   * A scheme in O&M whose running period is losing money to service levels or staff short, has days with no reading, or
   * has a benchmark at this month's allowance (item 131, `omSlip`). The key moves with the figures.
   */
  private async omService(projects: Project[], today: string): Promise<Draft[]> {
    if (!projects.length) return [];
    const contracts = await this.prisma.omContract.findMany({ where: { projectId: { in: projects.map((p) => p.id) } }, select: { projectId: true } });
    const byId = new Map(projects.map((p) => [p.id, p]));
    const out: Draft[] = [];
    for (const c of contracts) {
      const om = await loadOm(this.prisma, c.projectId);
      const period = om && periodOf(om.periods, today);
      if (!om || !period) continue;
      const months = await loadMonths(this.prisma, om, c.projectId, period.from, today, today);
      const w = omSlip(months);
      if (!w) continue;
      const p = byId.get(c.projectId)!;
      const lost = w.penalty + w.staffDeduction;
      const near = w.atAllowance.map((k) => OM_BENCHMARK_INFO[k as keyof typeof OM_BENCHMARK_INFO].label.toLowerCase());
      const parts = [
        w.penalty ? `${rupees(w.penalty)} in service level penalties` : null,
        w.staffDeduction ? `${rupees(w.staffDeduction)} for staff short of the minimum` : null,
      ].filter(Boolean);
      out.push({
        key: `om:${c.projectId}:${period.year}-${period.instalment}:${w.penalty}:${w.staffDeduction}:${w.missingDays.length}:${w.atAllowance.join(',')}`,
        kind: 'OM_SERVICE',
        title: lost ? `${p.name} has lost ${rupees(lost)} of ${period.label} so far` : near.length ? `${p.name}: one more ${near[0]} failure this month costs a penalty` : `${p.name} has ${plural(w.missingDays.length, 'day')} with no service level reading`,
        detail: [
          parts.length ? `${period.label} (${day(period.from)} to ${day(period.to)}) will be billed less ${parts.join(' and ')}.` : `${period.label} runs ${day(period.from)} to ${day(period.to)}.`,
          near.length ? `This month has used up the failures allowed for ${near.join(', ')}.` : null,
          w.missingDays.length ? `${plural(w.missingDays.length, 'day')} of the period ${w.missingDays.length === 1 ? 'has' : 'have'} no reading, which the client will ask for.` : null,
        ]
          .filter(Boolean)
          .join(' '),
        action: w.penalty || near.length ? 'Find why the readings miss (pressure zones, chlorine dosing, leaks) and fix it before the next reading' : w.staffDeduction ? 'Deploy the minimum staff, or record the month’s staff if they were there' : 'Log the missing days from the plant register',
        impact: { text: lost ? `${rupees(lost)} off the bill` : near.length ? 'At the allowance' : `${plural(w.missingDays.length, 'day')} not logged`, inr: lost || null, days: null },
        working: [
          `Instalment ${rupees(period.amount)} for ${period.label}`,
          ...months.flatMap((m) => m.benchmarks.filter((b) => b.penalised > 0).map((b) => `${m.month}: ${OM_BENCHMARK_INFO[b.key].label}, ${b.failures} failures with ${b.allowed} allowed = ${rupees(b.penalty)}`)),
          ...months.flatMap((m) => m.staff.filter((l) => l.short > 0).map((l) => `${m.month}: ${l.role} ${l.deployed} of ${l.required} = ${rupees(l.deduction)}`)),
        ],
        facts: [
          { label: 'Penalties so far', value: rupees(w.penalty) },
          { label: 'Staff short so far', value: rupees(w.staffDeduction) },
          { label: 'Days not logged', value: String(w.missingDays.length) },
        ],
        links: [{ label: 'O&M', href: `/projects/${p.id}?tab=om` }],
        projectId: p.id,
        projectName: p.name,
      });
    }
    return out;
  }

  /** A project whose quality plan is short of `TESTS_SHORT_MIN` tests or more (`testsShort` over `QaService.testsDue`). */
  private async testsShort(user: RequestUser): Promise<Draft[]> {
    const due = await this.qa.testsDue(user, {});
    const byProject = new Map<string, typeof due.rows>();
    for (const r of due.rows) byProject.set(r.line.projectId, [...(byProject.get(r.line.projectId) ?? []), r]);
    const out: Draft[] = [];
    for (const [projectId, rows] of byProject) {
      const w = testsShort(rows);
      if (!w) continue;
      const name = rows[0].projectName;
      const top = w.lines.slice(0, 3).map((l) => `${l.line.testName}${l.line.grade ? ` ${l.line.grade}` : ''}: ${l.short} short`);
      out.push({
        key: `tests:${projectId}:${w.short}`,
        kind: 'TESTS_SHORT',
        title: `${name} is ${plural(w.short, 'test')} short of its quality plan`,
        detail: `The work approved in DPRs and the material received owe ${w.required} tests by the plan; ${w.taken} are recorded. ${top.join('; ')}.`,
        action: 'Take the samples before the work is covered up, or record the tests already taken against their plan line',
        impact: { text: `${plural(w.short, 'test')} short`, inr: null, days: null },
        working: [...w.lines.map((l) => `${l.line.testName}${l.line.grade ? ` ${l.line.grade}` : ''}: ${l.required} owed, ${l.taken} taken`), `Warns at ${TESTS_SHORT_MIN} or more short`],
        facts: [
          { label: 'Owed', value: String(w.required) },
          { label: 'Taken', value: String(w.taken) },
        ],
        links: [{ label: 'Tests due', href: `/tests-due?projectId=${projectId}` }],
        projectId,
        projectName: name,
      });
    }
    return out;
  }

  /** An instrument in use past its calibration, failed, or never calibrated and used (`calibrationWarns`). */
  private async calibration(user: RequestUser, today: string): Promise<Draft[]> {
    const register = await this.qaRegisters.instruments(user, { attention: true });
    const used = new Map(
      (
        await this.prisma.qualityTest.groupBy({
          by: ['instrumentId'],
          where: { organizationId: user.organizationId, instrumentId: { in: register.items.map((i) => i.id) } },
          _count: true,
        })
      ).map((g) => [g.instrumentId!, g._count]),
    );
    const out: Draft[] = [];
    for (const i of register.items) {
      if (!calibrationWarns({ state: i.state, active: i.active, lastResult: i.lastResult, usedSinceDue: used.get(i.id) ?? 0 })) continue;
      const overdue = i.dueOn ? Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${i.dueOn}T00:00:00Z`)) / 86_400_000)) : null;
      const why = i.state === 'OVERDUE' ? `was due for calibration on ${day(i.dueOn!)}` : i.state === 'NEVER' ? 'has no calibration on record' : 'failed its last calibration';
      out.push({
        key: `calibration:${i.id}:${i.state}:${i.dueOn ?? ''}`,
        kind: 'CALIBRATION_DUE',
        title: `${i.name} ${why}`,
        detail: `Results from ${i.name}${i.labName ? ` at ${i.labName}` : ''} will not stand with the client or a third-party inspector until it is calibrated${used.get(i.id) ? `; ${plural(used.get(i.id)!, 'test')} ${used.get(i.id) === 1 ? 'names' : 'name'} it` : ''}.`,
        action: i.state === 'OUT_OF_USE' ? 'Stop using it, repair or replace it and record the new calibration' : 'Book the calibration with an NABL calibration lab and record its certificate',
        impact: { text: overdue ? `${plural(overdue, 'day')} overdue` : 'Not calibrated', inr: null, days: overdue },
        working: [`Calibrated every ${plural(i.intervalDays, 'day')}`, i.lastCalibratedOn ? `Last calibrated ${day(i.lastCalibratedOn)}${i.certificateNo ? `, certificate ${i.certificateNo}` : ''}` : 'No calibration recorded'],
        facts: [
          { label: 'Due', value: i.dueOn ? day(i.dueOn) : 'Not calibrated' },
          { label: 'Where', value: i.labName ?? i.projectName ?? 'Head office' },
        ],
        links: [{ label: 'Calibration register', href: '/calibration' }],
        projectId: i.projectId,
        projectName: i.projectName,
      });
    }
    return out;
  }

  /** Samples at a lab past `LAB_REPORT_DAYS` without a report, one warning per project and lab (`lateReportGroups`). */
  private async labReports(user: RequestUser): Promise<Draft[]> {
    const late = await this.qaRegisters.samples(user, { late: true, state: 'AT_LAB', page: 1, pageSize: 500 });
    return lateReportGroups(late.items).map((g) => {
      const s = g.samples[0];
      const names = g.samples.slice(0, 3).map((x) => `${x.testNo} ${x.title}`);
      return {
        key: `lab:${g.projectId}:${g.labId}:${g.samples.map((x) => x.testId).join(',')}`,
        kind: 'LAB_REPORT_LATE' as const,
        title: `${plural(g.samples.length, 'report')} late from ${s.labName}`,
        detail: `${names.join('; ')}${g.samples.length > 3 ? ' and more' : ''}. The oldest went ${plural(g.longest, 'day')} ago, and work that waits on the result is held.`,
        action: `Chase ${s.labName} for the reports, or send a fresh sample elsewhere`,
        impact: { text: `${plural(g.longest, 'day')} waiting`, inr: null, days: g.longest },
        working: g.samples.map((x) => `${x.testNo}: sent ${day(x.sentOn)}, ${plural(x.waitDays ?? 0, 'day')} at the lab`),
        facts: [
          { label: 'Late', value: String(g.samples.length) },
          { label: 'Longest wait', value: plural(g.longest, 'day') },
        ],
        links: [{ label: 'Samples sent out', href: `/lab-samples?labId=${g.labId}&late=1` }],
        projectId: g.projectId,
        projectName: s.projectName,
      };
    });
  }

  /** Drawings past the day site needed them and still not buildable, one warning per project and party (`lateDrawingGroups`). */
  private async drawings(user: RequestUser): Promise<Draft[]> {
    return lateDrawingGroups(await this.drawingSchedule.overdue(user)).map((g) => {
      const n = g.needs[0];
      const names = g.needs.slice(0, 3).map((x) => [x.docNo, x.title].filter(Boolean).join(' '));
      const delays = g.needs.filter((x) => x.riskId).length;
      const clientSide = isClientSide(n.source);
      return {
        key: `drawings:${g.projectId}:${g.needs.map((x) => `${x.id}.${x.state}`).join(',')}`,
        kind: 'DRAWING_LATE' as const,
        title: `${plural(g.needs.length, 'drawing')} awaited from ${g.party}`,
        detail: `${names.join('; ')}${g.needs.length > 3 ? ' and more' : ''}. The oldest was needed ${plural(g.longest, 'day')} ago, and work that depends on ${g.needs.length === 1 ? 'it' : 'them'} is held.`,
        action: clientSide
          ? delays < g.needs.length
            ? 'Send a reminder letter and record the wait as a delay, so the notice and the extension of time run from it'
            : 'Send a reminder letter; the delay is recorded'
          : 'Chase the design team and agree a date',
        impact: { text: `${plural(g.longest, 'day')} late`, inr: null, days: g.longest },
        working: g.needs.map((x) => `${x.docNo ?? x.title}: needed ${day(x.neededBy)}, ${x.state === 'RECEIVED' ? `revision ${x.revision} not for construction` : 'not received'}${x.reminders ? `, ${plural(x.reminders, 'reminder')}` : ''}${x.riskNo ? `, delay ${x.riskNo}` : ''}`),
        facts: [
          { label: 'Awaited', value: String(g.needs.length) },
          { label: 'Longest wait', value: plural(g.longest, 'day') },
        ],
        links: [{ label: 'Drawing schedule', href: `/drawing-schedule?projectId=${g.projectId}&state=LATE` }],
        projectId: g.projectId,
        projectName: n.projectName,
      };
    });
  }

  /** Superseded controlled copies out past the recall period, one warning per document and new revision (`lateRecalls`). */
  private async copyRecalls(user: RequestUser): Promise<Draft[]> {
    return lateRecalls(await this.designControl.copiesToRecall(user)).map((g) => {
      const c = g.copies[0];
      const holders = g.copies.map((x) => `${copyLabel(x.copyNo)} ${x.holder} (${x.revision})`);
      return {
        key: `copy-recall:${g.documentId}:${g.revision}`,
        kind: 'COPY_RECALL_LATE' as const,
        title: `${c.docNo}: ${g.copies.length === 1 ? '1 superseded copy' : `${g.copies.length} superseded copies`} still out`,
        detail: `${c.docNo} ${c.title} went to ${g.revision} on ${day(c.supersededOn!)}; ${holders.join(', ')} ${g.copies.length === 1 ? 'has' : 'have'} not come back in ${RECALL_DAYS} days.`,
        action: 'Collect the old prints or have them stamped superseded and destroyed, and give the holders the current revision',
        impact: { text: `${plural(g.longest, 'day')} out`, inr: null, days: g.longest },
        working: [`Superseded ${day(c.supersededOn!)}, recall within ${RECALL_DAYS} days`],
        facts: [
          { label: 'Copies out', value: String(g.copies.length) },
          { label: 'Current revision', value: g.revision },
        ],
        links: [{ label: `${c.docNo} copies`, href: `/controlled-copies?documentId=${g.documentId}` }],
        projectId: c.projectId,
        projectName: c.projectName,
      };
    });
  }

  /** Design submissions with the reviewer past their reply-by date, one warning each (`lateDesignReviews`). */
  private async designReviews(user: RequestUser): Promise<Draft[]> {
    return lateDesignReviews(await this.designSubmissions.lateReviews(user)).map((r) => {
      const clientSide = isClientSide(r.source);
      return {
        key: `design-review:${r.id}:${r.revision}`,
        kind: 'DESIGN_REVIEW_LATE' as const,
        title: `${r.title}: ${r.purpose === 'VETTING' ? 'vetting' : 'approval'} ${plural(r.daysLate, 'day')} late`,
        detail: `${r.submissionNo} R${r.revision} went to ${r.toParty} on ${day(r.submittedOn!)} with ${plural(r.documents, 'document')}; the reply was asked by ${day(r.replyBy!)}.`,
        action: clientSide
          ? r.riskId
            ? 'Write to the reviewer again; the delay is recorded'
            : 'Write to the reviewer and record the wait as a delay, so the notice and the extension of time run from it'
          : 'Call the institution and agree a date for the certificate',
        impact: { text: `${plural(r.daysLate, 'day')} late`, inr: null, days: r.daysLate },
        working: [`Submitted ${day(r.submittedOn!)}, reply asked by ${day(r.replyBy!)}, ${plural(r.daysOutstanding ?? 0, 'day')} with the reviewer${r.riskNo ? `, delay ${r.riskNo}` : ''}`],
        facts: [
          { label: 'With the reviewer', value: plural(r.daysOutstanding ?? 0, 'day') },
          { label: 'Documents', value: String(r.documents) },
        ],
        links: [{ label: r.submissionNo, href: `/design-submissions/${r.id}` }],
        projectId: r.projectId,
        projectName: r.projectName,
      };
    });
  }

  /**
   * An item-rate project whose BOQ adds up to far from its contract value (finding 6 of the October review,
   * `boqContractGap`): work done, earned value and the budget are built on the BOQ, so all of them are off. The key moves
   * with the gap's whole %.
   */
  /**
   * Projects whose forecast margin at completion has fallen by `MARGIN_FADE_PTS` or more over the last few months
   * (intelligence quick win Q1). The forecast at each month end is earned value's (EAC = BAC × AC ÷ EV), read through
   * `EarnedValueService` with the caller; the heads behind it are what each spent in the window against its budget for
   * the work earned in it.
   */
  private async marginFades(user: RequestUser, projects: Project[]): Promise<Draft[]> {
    if (!projects.length) return [];
    const terms = await this.prisma.project.findMany({
      where: { id: { in: projects.map((p) => p.id) }, contractValue: { gt: 0 } },
      select: { id: true, contractValue: true },
    });
    if (!terms.length) return [];
    // The revised contract value: the contract plus approved variations, as the projects list has it.
    const varied = new Map(
      (await this.prisma.variation.groupBy({ by: ['projectId'], where: { projectId: { in: terms.map((t) => t.id) }, status: 'APPROVED' }, _sum: { approvedAmount: true } })).map((v) => [v.projectId, n(v._sum.approvedAmount)]),
    );
    const fades = (
      await Promise.all(
        terms.map(async (t) => {
          const ev = await this.earnedValue.get(user, t.id);
          const contractValue = n(t.contractValue) + (varied.get(t.id) ?? 0);
          const points = ev.curve.flatMap((c) => (c.ev !== null && c.ac !== null ? [{ month: c.month, ev: Number(c.ev), ac: Number(c.ac) }] : []));
          const fade = marginFade(points, Number(ev.bac), contractValue);
          return fade ? { t, ev, fade, contractValue } : null;
        }),
      )
    ).filter((f) => !!f);
    if (!fades.length) return [];
    const ids = fades.map((f) => f.t.id);
    const earliest = fades.map((f) => f.fade.from.month).sort()[0];
    const [forecasts, windowCost] = await Promise.all([
      this.budget.forecasts(user.organizationId, fades.map((f) => ({ id: f.t.id, contractValue: f.t.contractValue }))),
      // Spent after the window's first month end.
      this.cost.compute(user.organizationId, ids, { gt: parseDate(`${earliest}-01`) }),
    ]);
    const byId = new Map(projects.map((p) => [p.id, p]));
    return fades.map(({ t, ev, fade, contractValue }) => {
      const p = byId.get(t.id)!;
      const f = forecasts.get(t.id);
      const acc = windowCost.get(t.id);
      // Each head's spend in the months after the window's first, against its budget for the share earned in them.
      const after = [...(acc?.months.entries() ?? [])].filter(([m]) => m > fade.from.month);
      const spent = (h: (typeof COST_HEADS)[number]) => after.reduce((s, [, v]) => s + n(v.heads[h]), 0);
      const earnedShare = fade.to.earned - fade.from.earned;
      const heads = headsBehind(
        COST_HEADS.map((h) => ({ head: h, spent: spent(h), budget: f?.headBudget ? n(f.headBudget[h]) : null })),
        earnedShare,
      );
      const headLine = heads.length ? heads.map((h) => `${COST_HEAD_LABELS[h.head].toLowerCase()} ${rupees(h.over)} over`).join(' and ') : null;
      const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
      return {
        key: `marginfade:${p.id}:${fade.to.month}:${marginStep(fade.dropPts)}`,
        kind: 'MARGIN_FADE' as const,
        title: `${p.name}: forecast margin down from ${fade.from.marginPct}% to ${fade.to.marginPct}% since ${monthName(fade.from.month)}`,
        detail: headLine
          ? `Cost is running ahead of the work earned. Over the same months ${headLine} against the budget for the work done.`
          : 'Cost is running ahead of the work earned, across the cost heads rather than in one of them.',
        action: heads.length ? `Review ${COST_HEAD_LABELS[heads[0].head].toLowerCase()} on this project` : 'Review the cost heads against the budget',
        impact: { text: `${rupees(fade.dropInr)} less margin at completion`, inr: fade.dropInr, days: null },
        working: [
          `Forecast cost at completion = budget ÷ CPI, CPI = earned value ÷ actual cost at each month end`,
          `${monthName(fade.from.month)}: forecast cost ${rupees(fade.from.eac)}, margin ${rupees(fade.from.margin)} (${fade.from.marginPct}% of ${rupees(contractValue)})`,
          `${monthName(fade.to.month)}: forecast cost ${rupees(fade.to.eac)}, margin ${rupees(fade.to.margin)} (${fade.to.marginPct}%)`,
          ...heads.map((h) => `${COST_HEAD_LABELS[h.head]}: spent ${rupees(h.spent)} against ${rupees(h.allowed)} budgeted for the ${pct(earnedShare)} of the work earned since`),
          `Flagged when the margin falls ${MARGIN_FADE_PTS} points or more within ${MARGIN_WINDOW_MONTHS} months and is at its lowest now`,
        ],
        facts: [
          { label: 'Forecast margin', value: `${fade.from.marginPct}% → ${fade.to.marginPct}%` },
          { label: 'Forecast cost', value: rupees(fade.to.eac) },
          { label: 'Budget at completion', value: rupees(Number(ev.bac)) },
          { label: 'Contract value', value: rupees(contractValue) },
        ],
        links: [
          { label: 'Earned value', href: `/projects/${p.id}?tab=earned-value` },
          { label: 'Cost', href: `/projects/${p.id}?tab=cost` },
        ],
        projectId: p.id,
        projectName: p.name,
      };
    });
  }

  /**
   * Cube sets whose 7-day result points to a 28-day one below the mark while the 28-day result is still to come
   * (intelligence quick win Q2, `cubeEarly`), read through `QualityService.listTests` with the caller. Sampled in the last
   * 35 days, so a 28-day result long overdue does not keep warning here (the tests due list chases that).
   */
  private async cubesEarly(user: RequestUser, today: string): Promise<Draft[]> {
    const from = dateOnly(new Date(Date.parse(`${today}T00:00:00Z`) - 35 * 86_400_000))!;
    const tests = await this.quality.listTests(user, { kind: 'CONCRETE_CUBE', result: 'PENDING', from, page: 1, pageSize: MAX_PAGE_SIZE });
    return tests.items.flatMap((t) => {
      const grade = concreteGrade(t.title);
      const needed = t.specMin !== null ? Number(t.specMin) : grade ? gradeFck(grade) : null;
      const early = cubeEarly(t.readings.map((r) => ({ label: r.label, value: r.value === null ? null : Number(r.value) })), needed);
      if (!early) return [];
      const r28 = t.readings.find((r) => /^28\s*days?$/i.test(r.label.trim()));
      const where = t.location ?? t.activityName ?? t.title;
      return [
        {
          key: `cube7:${t.id}:${early.at7}`,
          kind: 'CUBE_7DAY_LOW' as const,
          title: `${t.testNo} ${t.title}: ${early.at7} N/mm² at 7 days points to about ${early.projected} at 28, under ${early.needed}`,
          detail: `${where}${t.pourNo ? ` (pour ${t.pourNo})` : ''}. The 28-day result is due ${r28?.dueOn ? day(r28.dueOn) : 'later'}; until then whatever is built on this concrete stands on a likely failure.`,
          action: 'Hold the next lift and the striking of props under it until the 28-day result, and ask the lab to test the spare cubes early',
          impact: { text: `${early.shortBy} N/mm² short at 28 days`, inr: null, days: null },
          working: [
            `7-day result ${early.at7} N/mm² ÷ ${CUBE_7DAY_SHARE} (the share of its 28-day strength ordinary Portland cement concrete usually has at 7 days) = about ${early.projected} N/mm² at 28 days`,
            `Needed at 28 days: ${early.needed} N/mm² (${t.specMin !== null ? 'the test\'s specification' : `the characteristic strength of ${grade}`})`,
            'Blended cements (PPC, slag) gain strength more slowly; with them a low 7-day figure is a question for the mix, not yet a failure',
          ],
          facts: [
            { label: '7 days', value: `${early.at7} N/mm²` },
            { label: 'Points to', value: `${early.projected} N/mm²` },
            { label: 'Needed', value: `${early.needed} N/mm²` },
            ...(r28?.dueOn ? [{ label: '28-day due', value: day(r28.dueOn) }] : []),
          ],
          links: [
            { label: 'Test', href: `/inspections?tab=tests&id=${t.id}` },
            ...(t.pourId ? [{ label: 'Pour register', href: `/pours?projectId=${t.projectId}` }] : []),
          ],
          projectId: t.projectId,
          projectName: t.projectName,
        },
      ];
    });
  }

  private async boqGaps(projects: Project[]): Promise<Draft[]> {
    if (!projects.length) return [];
    const terms = await this.prisma.project.findMany({
      where: { id: { in: projects.map((p) => p.id) }, contractModel: 'ITEM_RATE', contractValue: { gt: 0 } },
      select: { id: true, contractValue: true },
    });
    if (!terms.length) return [];
    const items = await this.prisma.boqItem.findMany({ where: { projectId: { in: terms.map((t) => t.id) } }, select: { projectId: true, rate: true, originalQty: true, revisedQty: true } });
    const totals = new Map<string, number>();
    for (const i of items) totals.set(i.projectId, (totals.get(i.projectId) ?? 0) + n(i.rate) * n(i.revisedQty ?? i.originalQty));
    const byId = new Map(projects.map((p) => [p.id, p]));
    const out: Draft[] = [];
    for (const t of terms) {
      const gap = boqContractGap({ boqTotal: Math.round(totals.get(t.id) ?? 0), contractValue: n(t.contractValue), contractModel: 'ITEM_RATE' });
      if (!gap) continue;
      const p = byId.get(t.id)!;
      const diff = Math.abs(gap.boqTotal - gap.contractValue);
      const short = gap.gapPct < 0;
      out.push({
        key: `boqgap:${p.id}:${gap.gapPct}`,
        kind: 'BOQ_OFF_CONTRACT',
        title: `${p.name}: the BOQ adds up to ${rupees(gap.boqTotal)}, ${Math.abs(gap.gapPct)}% ${short ? 'below' : 'above'} the contract value`,
        detail: `The contract value is ${rupees(gap.contractValue)}. Work done, earned value and the budget are all worked out from the BOQ, so they are off by the same share until the two agree.`,
        action: short ? 'Import the missing BOQ items, or correct the contract value' : 'Check the BOQ quantities and rates against the agreement, or correct the contract value',
        impact: { text: `${rupees(diff)} ${short ? 'not in the BOQ' : 'more than the contract'}`, inr: diff, days: null },
        working: [`BOQ total ${rupees(gap.boqTotal)}`, `Contract value ${rupees(gap.contractValue)}`, `A gap over ${BOQ_GAP_PCT}% either way is flagged; usual tender premiums stay inside it`],
        facts: [
          { label: 'BOQ total', value: rupees(gap.boqTotal) },
          { label: 'Contract value', value: rupees(gap.contractValue) },
          { label: 'Difference', value: `${gap.gapPct > 0 ? '+' : ''}${gap.gapPct}%` },
        ],
        links: [
          { label: 'BOQ', href: `/projects/${p.id}?tab=boq` },
          { label: 'Contract', href: `/projects/${p.id}?tab=contract` },
        ],
        projectId: p.id,
        projectName: p.name,
      });
    }
    return out;
  }

  /** Subcontractor bills waiting for approval that bill more man-days than the site's attendance supports (item 124). */
  private async manDays(user: RequestUser): Promise<Draft[]> {
    const bills = await this.attendance.waitingBills(user);
    return bills.map((b) => {
      const lines = b.lines.filter((l) => l.flagged);
      const excess = Math.round(lines.reduce((t, l) => t + l.excess, 0) * 10) / 10;
      const billed = lines.reduce((t, l) => t + l.billed, 0);
      return {
        key: `mandays:${b.billId}:${lines.map((l) => `${l.billed}-${l.supported ?? 'none'}`).join(':')}`,
        kind: 'MANDAYS_ABOVE' as const,
        title: `${b.label} from ${b.vendorName} bills ${plural(excess, 'man-day')} more than the site recorded`,
        detail: `For ${day(b.from)} to ${day(b.to)} the bill's labour lines come to ${plural(billed, 'man-day')}; the head count and roll call support ${lines.map((l) => (l.supported === null ? 'none' : String(l.supported))).join(' and ')}.`,
        action: `Hold ${plural(excess, 'man-day')} of ${b.label} until ${b.vendorName} shows the muster`,
        impact: { text: `${rupees(b.excessInr)} billed above the records`, inr: b.excessInr, days: null },
        working: lines.map(
          (l) =>
            `${l.description}: billed ${l.billed}; head count ${l.sources.headCount ?? 'not kept'}, roll call ${l.sources.rollCall ?? 'not kept'}${l.sources.punched !== null ? `, punched ${l.sources.punched}` : ''}; ${l.excess} above at ₹${Number(l.rate).toLocaleString('en-IN')}`,
        ),
        facts: [
          { label: 'Man-days above the records', value: String(excess) },
          { label: 'Days the bill covers', value: `${day(b.from)} to ${day(b.to)}` },
        ],
        links: [
          { label: b.label, href: `/subcontract-bills/${b.billId}` },
          { label: 'Attendance cross-check', href: `/attendance-check?month=${b.to.slice(0, 7)}&projectId=${b.projectId}` },
        ],
        projectId: b.projectId,
        projectName: b.projectName,
      };
    });
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
