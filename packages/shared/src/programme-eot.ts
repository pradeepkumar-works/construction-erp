/**
 * Programme submissions and extension of time applications (item 173, ARCHITECTURE "Programme and EOT").
 *
 * A works contract asks for the construction programme within days of the agreement (0.20% of the contract value is held
 * back until it comes), then an updated programme at a set interval, each approved by the Engineer. Each revision is
 * kept with what it showed, the day it went and the Engineer's answer. An extension of time is applied for in writing,
 * forwarded by the Engineer to the competent authority and decided within 30 days. It is claimed either for delays in
 * the register or for added work, where time extends in proportion to the work added. The days granted are written to
 * the delays' `eotGrantedDays`, the figure the revised completion, liquidated damages and slippage read.
 *
 * Everything here is pure. `ProgrammeService` and `EotService` load the rows.
 */
import type { EotBasis, EotStatus, ProgrammeStatus } from './enums';
import { daysFrom } from './official-reports';
import { addMonthsDays } from './contract-obligations';

/** How often an updated programme is due when the contract sets no interval of its own (days). */
export const PROGRAMME_UPDATE_DAYS = 30;
/** An update is "due soon" this many days before its day. */
export const PROGRAMME_SOON_DAYS = 7;
/** The competent authority decides an EOT application within this many days of it being made. */
export const EOT_DECISION_DAYS = 30;
/** The standard obligation the first programme meets (`STANDARD_OBLIGATIONS`). */
export const PROGRAMME_OBLIGATION_CODE = 'PROGRAMME';

export const programmeLabel = (revision: number) => `Rev ${revision}`;
export const eotLabel = (appNo: number) => `EOT ${appNo}`;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** What the rules read of a programme revision. */
export interface ProgrammeRow {
  revision: number;
  status: ProgrammeStatus;
  submittedOn: string;
}

/** The revision the site works to: the latest one approved. */
export function programmeInForce<T extends ProgrammeRow>(rows: T[]): T | null {
  return rows.filter((r) => r.status === 'APPROVED').reduce<T | null>((best, r) => (!best || r.revision > best.revision ? r : best), null);
}

/**
 * The day the contract's programme obligation was met: the first revision sent that the Engineer did not return. A
 * revision returned with comments is not a programme, so the obligation stays open until the next one goes.
 */
export function programmeMetOn(rows: ProgrammeRow[]): string | null {
  const live = rows.filter((r) => r.status !== 'RETURNED').map((r) => r.submittedOn);
  return live.length ? live.reduce((a, b) => (b < a ? b : a)) : null;
}

export const PROGRAMME_WATCH_STATES = ['NO_DATE', 'UPCOMING', 'DUE_SOON', 'OVERDUE'] as const;
export type ProgrammeWatchState = (typeof PROGRAMME_WATCH_STATES)[number];
export const PROGRAMME_WATCH_LABELS: Record<ProgrammeWatchState, string> = {
  NO_DATE: 'Nothing due',
  UPCOMING: 'Up to date',
  DUE_SOON: 'Due soon',
  OVERDUE: 'Overdue',
};
export const PROGRAMME_WATCH_COLORS: Record<ProgrammeWatchState, string> = { NO_DATE: 'default', UPCOMING: 'green', DUE_SOON: 'gold', OVERDUE: 'red' };

export interface ProgrammeWatch {
  /** The first programme (none sent yet) or an update */
  first: boolean;
  nextDue: string | null;
  state: ProgrammeWatchState;
  daysLeft: number | null;
  daysLate: number | null;
}

/**
 * When the next programme is due. Before any revision has gone, it is the first one, due on the obligation's day
 * (`firstDue`, null when the contract has no agreement date or no such obligation). After that, an update is due
 * `intervalDays` after the latest revision sent, whether or not the Engineer has answered it yet: the contractor has done
 * their part. A returned revision does not count. Once the works are complete (`active` false) nothing more is due.
 */
export function programmeWatch(rows: ProgrammeRow[], firstDue: string | null, intervalDays: number, today: string, active = true, metBefore: string | null = null): ProgrammeWatch {
  // A programme the Contract tab marks as met before the register was kept counts as the first one sent.
  const sent = [...rows.filter((r) => r.status !== 'RETURNED').map((r) => r.submittedOn), ...(metBefore ? [metBefore] : [])];
  const first = sent.length === 0;
  const last = first ? null : sent.reduce((a, b) => (b > a ? b : a));
  const nextDue = !active ? null : first ? firstDue : addMonthsDays(last!, 0, Math.max(1, intervalDays));
  if (!nextDue) return { first, nextDue: null, state: 'NO_DATE', daysLeft: null, daysLate: null };
  const left = daysFrom(today, nextDue);
  const state: ProgrammeWatchState = left < 0 ? 'OVERDUE' : left <= PROGRAMME_SOON_DAYS ? 'DUE_SOON' : 'UPCOMING';
  return { first, nextDue, state, daysLeft: left >= 0 ? left : null, daysLate: left < 0 ? -left : null };
}

/**
 * The programme obligation's `metOn` once the register changes: `programmeMetOn` over the revisions, except that a day
 * kept on the Contract tab before the first revision was sent stands (the programme went before the register was kept).
 */
export function programmeObligationMetOn(rows: ProgrammeRow[], current: string | null): string | null {
  const firstSent = rows.length ? rows.map((r) => r.submittedOn).reduce((a, b) => (b < a ? b : a)) : null;
  if (current && (!firstSent || current < firstSent)) return current;
  return programmeMetOn(rows);
}

/** What stops a new revision going to the Engineer, or null. */
export function programmeSubmitProblem(rows: ProgrammeRow[], submittedOn: string, today: string): string | null {
  if (daysFrom(today, submittedOn) > 0) return 'The submission date cannot be after today';
  const waiting = rows.find((r) => r.status === 'SUBMITTED');
  if (waiting) return `${programmeLabel(waiting.revision)} is still with the Engineer: record their answer before sending the next revision`;
  const last = rows.reduce<ProgrammeRow | null>((best, r) => (!best || r.revision > best.revision ? r : best), null);
  if (last && submittedOn < last.submittedOn) return `A revision cannot be dated before ${programmeLabel(last.revision)}, sent on ${last.submittedOn}`;
  return null;
}

/** What stops the Engineer's answer to a revision being recorded, or null. */
export function programmeDecisionProblem(row: ProgrammeRow, decision: 'APPROVED' | 'RETURNED', decidedOn: string, note: string | null | undefined, today: string): string | null {
  if (row.status !== 'SUBMITTED') return `${programmeLabel(row.revision)} has already been answered`;
  if (daysFrom(today, decidedOn) > 0) return 'The answer cannot be dated after today';
  if (decidedOn < row.submittedOn) return 'The answer cannot be dated before the revision was sent';
  if (decision === 'RETURNED' && !note?.trim()) return "Write the Engineer's comments, so the next revision can answer them";
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Extension of time

export const EOT_STATES = ['SENT', 'FORWARDED', 'OVERDUE', 'GRANTED', 'PART_GRANTED', 'REFUSED', 'WITHDRAWN'] as const;
export type EotState = (typeof EOT_STATES)[number];
export const EOT_STATE_LABELS: Record<EotState, string> = {
  SENT: 'With the Engineer',
  FORWARDED: 'With the authority',
  OVERDUE: 'Decision overdue',
  GRANTED: 'Granted in full',
  PART_GRANTED: 'Granted in part',
  REFUSED: 'Refused',
  WITHDRAWN: 'Withdrawn',
};
export const EOT_STATE_COLORS: Record<EotState, string> = {
  SENT: 'blue',
  FORWARDED: 'blue',
  OVERDUE: 'red',
  GRANTED: 'green',
  PART_GRANTED: 'gold',
  REFUSED: 'red',
  WITHDRAWN: 'default',
};

/** What the rules read of an application. */
export interface EotRow {
  status: EotStatus;
  appliedOn: string;
  daysClaimed: number;
  grantedDays: number | null;
}

/** The day the decision is due: EOT_DECISION_DAYS after the application. */
export const eotDecisionDue = (appliedOn: string) => addMonthsDays(appliedOn, 0, EOT_DECISION_DAYS);

/** Where an application stands on `today`. */
export function eotState(r: EotRow, today: string): EotState {
  if (r.status === 'WITHDRAWN') return 'WITHDRAWN';
  if (r.status === 'DECIDED') {
    const g = r.grantedDays ?? 0;
    return g <= 0 ? 'REFUSED' : g >= r.daysClaimed ? 'GRANTED' : 'PART_GRANTED';
  }
  if (daysFrom(eotDecisionDue(r.appliedOn), today) > 0) return 'OVERDUE';
  return r.status === 'FORWARDED' ? 'FORWARDED' : 'SENT';
}

/**
 * Days of extension for added work: the contract period in proportion to the value the variation adds, rounded up to
 * a whole day. Nothing when any figure is missing.
 */
export function variationEotDays(contractDays: number, contractValue: number, variationValue: number): number {
  if (!(contractDays > 0) || !(contractValue > 0) || !(variationValue > 0)) return 0;
  return Math.ceil((contractDays * variationValue) / contractValue - 1e-9);
}

/** A delay as the split reads it. */
export interface GrantDelay {
  id: string;
  /** YYYY-MM-DD the delay began, or null */
  start: string | null;
  daysLost: number;
}

/**
 * Spreads the days granted over the delays an application claimed for: oldest first, each up to the days it lost, and
 * whatever is left on the last one, so the delays add up to the decision exactly. Nothing granted gives each delay 0.
 */
export function allocateGranted(granted: number, delays: GrantDelay[]): Record<string, number> {
  const out: Record<string, number> = {};
  const sorted = [...delays].sort((a, b) => (a.start ?? '9999').localeCompare(b.start ?? '9999') || a.id.localeCompare(b.id));
  let left = Math.max(0, Math.floor(granted));
  sorted.forEach((d, i) => {
    const give = i === sorted.length - 1 ? left : Math.min(left, Math.max(0, d.daysLost));
    out[d.id] = give;
    left -= give;
  });
  return out;
}

export interface EotApplyInput {
  basis: EotBasis;
  appliedOn: string;
  daysClaimed: number;
  grounds: string;
  delayIds: string[];
  variationId: string | null;
}

/** What stops an application being recorded, or null. */
export function eotApplyProblem(a: EotApplyInput, today: string): string | null {
  if (daysFrom(today, a.appliedOn) > 0) return 'The application date cannot be after today';
  if (!Number.isInteger(a.daysClaimed) || a.daysClaimed < 1) return 'Claim at least one day';
  if (!a.grounds.trim()) return 'Write the grounds for the extension';
  if (a.basis === 'DELAY' && !a.delayIds.length) return 'Choose the delays the extension is claimed for';
  if (a.basis === 'VARIATION' && !a.variationId) return 'Choose the variation that added the work';
  return null;
}

/** What stops the Engineer's forwarding being recorded, or null. */
export function eotForwardProblem(r: EotRow, forwardedOn: string, recommendedDays: number | null, today: string): string | null {
  if (r.status === 'FORWARDED') return 'This application has already been forwarded';
  if (r.status !== 'SENT') return `This application is ${r.status === 'DECIDED' ? 'decided' : 'withdrawn'}`;
  if (daysFrom(today, forwardedOn) > 0) return 'The forwarding date cannot be after today';
  if (forwardedOn < r.appliedOn) return 'It cannot be forwarded before it was made';
  if (recommendedDays !== null && (recommendedDays < 0 || recommendedDays > r.daysClaimed)) return `Recommend between 0 and the ${plural(r.daysClaimed, 'day')} claimed`;
  return null;
}

/** What stops the authority's decision being recorded, or null. */
export function eotDecisionProblem(r: EotRow, decidedOn: string, grantedDays: number, today: string): string | null {
  if (r.status === 'DECIDED') return 'This application is already decided';
  if (r.status === 'WITHDRAWN') return 'This application was withdrawn';
  if (daysFrom(today, decidedOn) > 0) return 'The decision cannot be dated after today';
  if (decidedOn < r.appliedOn) return 'The decision cannot be dated before the application';
  if (!Number.isInteger(grantedDays) || grantedDays < 0 || grantedDays > r.daysClaimed) return `Grant between 0 and the ${plural(r.daysClaimed, 'day')} claimed`;
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// DTOs

export interface ProgrammeSubmissionDto {
  id: string;
  projectId: string;
  revision: number;
  label: string;
  submittedOn: string;
  submittedByName: string;
  letterRef: string | null;
  note: string | null;
  /** What the programme showed when it went: its activities and the day they finish */
  activityCount: number;
  plannedFinish: string | null;
  status: ProgrammeStatus;
  decidedOn: string | null;
  /** The Engineer who answered: their name in the portal, or as written on their letter */
  decidedByName: string | null;
  decisionNote: string | null;
  inForce: boolean;
}

export interface ProgrammeRegisterDto {
  projectId: string;
  /** Days between updates, as set on the contract, else PROGRAMME_UPDATE_DAYS */
  intervalDays: number;
  intervalSet: boolean;
  /** The first programme's day, from the contract's programme obligation */
  firstDue: string | null;
  watch: ProgrammeWatch;
  /** The day the programme obligation was met, as the register shows it */
  metOn: string | null;
  obligation: { id: string; title: string; clause: string | null; penaltyValue: string | null; waived: boolean } | null;
  /** The plan as it stands today: what the next revision would show */
  activityCount: number;
  plannedFinish: string | null;
  submissions: ProgrammeSubmissionDto[];
}

export interface EotDelayDto {
  id: string;
  riskNo: string;
  title: string;
  delayStart: string | null;
  delayEnd: string | null;
  daysLost: number | null;
  eotGrantedDays: number | null;
}

export interface EotApplicationDto {
  id: string;
  projectId: string;
  projectName: string;
  appNo: number;
  label: string;
  basis: EotBasis;
  appliedOn: string;
  daysClaimed: number;
  grounds: string;
  letterRef: string | null;
  variation: { id: string; label: string; title: string; value: string } | null;
  delays: EotDelayDto[];
  decisionDue: string;
  status: EotStatus;
  state: EotState;
  forwardedOn: string | null;
  forwardedByName: string | null;
  recommendedDays: number | null;
  forwardNote: string | null;
  decidedOn: string | null;
  grantedDays: number | null;
  decisionRef: string | null;
  decisionNote: string | null;
  decidedByName: string | null;
  createdByName: string;
  createdAt: string;
}

export interface EotRegisterDto {
  projectId: string;
  /** The contract's completion date, and after every extension granted in the delay register */
  originalCompletion: string | null;
  revisedCompletion: string | null;
  /** Days granted across the delay register (applications or not) */
  granted: number;
  /** Days claimed in applications still waiting for a decision */
  pending: number;
  /** For an extension for added work: the contract period and value it is in proportion to */
  contractDays: number | null;
  contractValue: string | null;
  applications: EotApplicationDto[];
}
