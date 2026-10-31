import { Prisma } from '@prisma/client';
import {
  DEFAULT_PORT_TO_SITE_DAYS,
  ENGINEERING_DISCIPLINES,
  IMPORT_STAGES,
  PACKAGE_STAGES,
  PACKAGE_STAGE_LABELS,
  approvalCodeApproves,
  daysBetween,
  type DeliverableStatus,
  type DisciplineSummaryDto,
  type EngineeringDiscipline,
  type PackageStage,
  type PackageStageDto,
} from '@erp/shared';
import { round3, type StageEvidence } from '../stage-billing/stage-billing-rules';

/**
 * EPC (ARCHITECTURE "EPC"): pure arithmetic over deliverables, equipment packages, client inputs and the
 * contract currency, tested in `src/scripts/epc-test.ts`. Dates are YYYY-MM-DD strings.
 */

type Fmt = (d: string) => string;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const maxDate = (a: string, b: string) => (a > b ? a : b);
const order = (s: PackageStage) => PACKAGE_STAGES.indexOf(s);

// Engineering deliverables

/** Where a deliverable stands, from its dates and the code it came back with. */
export function deliverableStatus(d: { submittedOn: string | null; approvalCode: string | null; approvedOn: string | null }): DeliverableStatus {
  if (d.approvedOn || approvalCodeApproves(d.approvalCode)) return 'APPROVED';
  if (d.approvalCode) return 'COMMENTS';
  return d.submittedOn ? 'SUBMITTED' : 'NOT_STARTED';
}

/**
 * How late a deliverable is on `today`: past its planned submission while not yet submitted, else past its planned
 * approval while not approved. One sent back with comments is late for approval, as the client still has to approve it.
 */
export function deliverableLate(
  d: { status: DeliverableStatus; plannedSubmitOn: string | null; plannedApprovalOn: string | null },
  today: string,
): { lateDays: number | null; lateFor: 'SUBMISSION' | 'APPROVAL' | null } {
  if (d.status === 'APPROVED') return { lateDays: null, lateFor: null };
  if (d.status === 'NOT_STARTED' && d.plannedSubmitOn && d.plannedSubmitOn < today) return { lateDays: daysBetween(d.plannedSubmitOn, today), lateFor: 'SUBMISSION' };
  if (d.plannedApprovalOn && d.plannedApprovalOn < today) return { lateDays: daysBetween(d.plannedApprovalOn, today), lateFor: 'APPROVAL' };
  return { lateDays: null, lateFor: null };
}

/** Deliverables by discipline, in the disciplines' order, leaving out a discipline with none. */
export function disciplineSummary(rows: { discipline: EngineeringDiscipline; status: DeliverableStatus; lateDays: number | null }[]): DisciplineSummaryDto[] {
  return ENGINEERING_DISCIPLINES.map((discipline) => {
    const mine = rows.filter((r) => r.discipline === discipline);
    return {
      discipline,
      total: mine.length,
      submitted: mine.filter((r) => r.status !== 'NOT_STARTED').length,
      approved: mine.filter((r) => r.status === 'APPROVED').length,
      late: mine.filter((r) => r.lateDays !== null).length,
    };
  }).filter((s) => s.total > 0);
}

// Equipment packages

export interface StageDates {
  stage: PackageStage;
  plannedOn: string | null;
  actualOn: string | null;
}

export interface PackageInput {
  stages: StageDates[];
  neededOn: string | null;
  vessel?: string | null;
  billOfLading?: string | null;
  eta: string | null;
  portToSiteDays: number | null;
}

export interface PackageStatus {
  imported: boolean;
  stages: PackageStageDto[];
  currentStage: PackageStage | null;
  nextStage: PackageStage | null;
  nextPlannedOn: string | null;
  nextOverdueDays: number | null;
  forecastOnSite: string | null;
  forecastFrom: 'DELIVERED' | 'ETA' | 'PLAN' | null;
  lateDays: number | null;
  problems: string[];
}

/** A package comes by sea or air when it has a shipping stage, a ship, a bill of lading or an ETA. */
export const isImported = (p: PackageInput) => p.stages.some((s) => IMPORT_STAGES.includes(s.stage) && (s.plannedOn || s.actualOn)) || !!(p.vessel || p.billOfLading || p.eta);

/**
 * Where a package stands on `today` (ARCHITECTURE "EPC"):
 * - its stages are those with a planned or actual date, in order;
 * - the current stage is the last one done, the next the first after it not done, overdue once its plan has passed;
 * - it reaches site on its delivery date; at sea, on the ship's ETA plus the days from the port to site; else on the
 *   planned delivery moved by the delay so far (the slip of the last stage done, or how overdue the next one is), never
 *   before today;
 * - it is late by the days that falls after the day site needs it;
 * - actual dates out of order, or in the future, are problems.
 */
export function packageStatus(p: PackageInput, today: string, fmt: Fmt = (d) => d): PackageStatus {
  const rows = p.stages.filter((s) => s.plannedOn || s.actualOn).sort((a, b) => order(a.stage) - order(b.stage));
  const stages: PackageStageDto[] = rows.map((s) => ({ stage: s.stage, plannedOn: s.plannedOn, actualOn: s.actualOn, slipDays: s.plannedOn && s.actualOn ? daysBetween(s.plannedOn, s.actualOn) : null }));
  const doneIdx = rows.reduce((at, s, i) => (s.actualOn ? i : at), -1);
  const current = doneIdx >= 0 ? rows[doneIdx] : null;
  const next = rows.slice(doneIdx + 1).find((s) => !s.actualOn) ?? null;
  const nextOverdueDays = next?.plannedOn && next.plannedOn < today ? daysBetween(next.plannedOn, today) : null;

  const delivered = rows.find((s) => s.stage === 'DELIVERED' && s.actualOn) ?? rows.find((s) => order(s.stage) > order('DELIVERED') && s.actualOn);
  let forecastOnSite: string | null = null;
  let forecastFrom: PackageStatus['forecastFrom'] = null;
  if (delivered) {
    forecastOnSite = delivered.actualOn;
    forecastFrom = 'DELIVERED';
  } else if (p.eta) {
    forecastOnSite = maxDate(addDays(p.eta, p.portToSiteDays ?? DEFAULT_PORT_TO_SITE_DAYS), today);
    forecastFrom = 'ETA';
  } else {
    const planned = rows.find((s) => s.stage === 'DELIVERED')?.plannedOn ?? null;
    if (planned) {
      const slip = Math.max(current?.plannedOn && current.actualOn ? daysBetween(current.plannedOn, current.actualOn) : 0, nextOverdueDays ?? 0, 0);
      forecastOnSite = maxDate(addDays(planned, slip), today);
      forecastFrom = 'PLAN';
    }
  }
  const late = forecastOnSite && p.neededOn ? daysBetween(p.neededOn, forecastOnSite) : 0;

  const problems: string[] = [];
  const done = rows.filter((s) => s.actualOn);
  for (let i = 1; i < done.length; i++) {
    const before = done.slice(0, i).find((s) => s.actualOn! > done[i].actualOn!);
    if (before) problems.push(`${PACKAGE_STAGE_LABELS[done[i].stage]} on ${fmt(done[i].actualOn!)}, before ${PACKAGE_STAGE_LABELS[before.stage].toLowerCase()} (${fmt(before.actualOn!)})`);
  }
  for (const s of done.filter((x) => x.actualOn! > today)) problems.push(`${PACKAGE_STAGE_LABELS[s.stage]} is dated ${fmt(s.actualOn!)}, after today`);

  return {
    imported: isImported(p),
    stages,
    currentStage: current?.stage ?? null,
    nextStage: next?.stage ?? null,
    nextPlannedOn: next?.plannedOn ?? null,
    nextOverdueDays,
    forecastOnSite,
    forecastFrom,
    lateDays: late > 0 ? late : null,
    problems,
  };
}

/** The day a package reached a stage: its actual date, or that of a later stage done (it cannot be erected undelivered). */
export function reachedOn(stages: StageDates[], stage: PackageStage): string | null {
  const own = stages.find((s) => s.stage === stage)?.actualOn;
  if (own) return own;
  const later = stages.filter((s) => order(s.stage) > order(stage) && s.actualOn).map((s) => s.actualOn!);
  return later.length ? later.sort()[0] : null;
}

// What a payment stage reads

/** An EVENT stage tied to deliverables is done on the day the last of them was approved, once all are. */
export function deliverablesEvidence(rows: { approvedOn: string | null }[], upTo: string, fmt: Fmt = (d) => d): StageEvidence {
  if (!rows.length) return { pct: 0, text: 'No deliverables linked' };
  const by = rows.filter((r) => r.approvedOn && r.approvedOn <= upTo);
  if (by.length === rows.length) {
    const last = by.map((r) => r.approvedOn!).sort().pop()!;
    return { pct: 100, text: `${rows.length === 1 ? 'Approved' : `All ${rows.length} deliverables approved, the last`} on ${fmt(last)}` };
  }
  return { pct: 0, text: `${by.length} of ${rows.length} deliverables approved` };
}

/**
 * A SUPPLY stage tied to packages takes the share of their value that has reached the stage by the day (each package
 * counts the same when any has no value).
 */
export function packagesEvidence(rows: { value: number | null; reachedOn: string | null }[], stage: PackageStage, upTo: string): StageEvidence {
  if (!rows.length) return { pct: 0, text: 'No packages linked' };
  const byValue = rows.every((r) => r.value !== null && r.value > 0);
  const weight = (r: (typeof rows)[number]) => (byValue ? r.value! : 1);
  const total = rows.reduce((s, r) => s + weight(r), 0);
  const reached = rows.filter((r) => r.reachedOn && r.reachedOn <= upTo);
  const pct = round3((reached.reduce((s, r) => s + weight(r), 0) / total) * 100);
  const word = PACKAGE_STAGE_LABELS[stage].toLowerCase();
  return { pct, text: `${reached.length} of ${rows.length} packages ${word}${byValue && reached.length && reached.length < rows.length ? `, ${Math.round(pct * 10) / 10}% by value` : ''}` };
}

// Client inputs and the contract currency

/** Days a client input is past due and not given; null when given or not yet due. */
export function clientInputOverdue(m: { dueDate: string; achievedOn: string | null }, today: string): number | null {
  if (m.achievedOn || m.dueDate >= today) return null;
  return daysBetween(m.dueDate, today);
}

type D = Prisma.Decimal;
const round2 = (v: D) => v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

/**
 * What the bank credited for a receipt on a project in another currency: the client's payment (kept at the contract rate)
 * at the day's rate. In rupees, or with no day's rate, it is the amount itself.
 */
export function bankCredit(amount: D, contractRate: D | null, dayRate: D | null): D {
  if (!contractRate || !dayRate || contractRate.lte(0) || dayRate.eq(contractRate)) return amount;
  return round2(amount.div(contractRate).mul(dayRate));
}
