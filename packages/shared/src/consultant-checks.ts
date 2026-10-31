/**
 * Consultant checks in the portal (ARCHITECTURE "Consultant checks"). A supervision consultant's terms of
 * reference say who checks how much: the assistant engineer checks every measurement, the resident engineer at least a
 * quarter, the deputy team leader a tenth and the team leader 3%, and each certifies their share before a bill is paid.
 * Work that will be hidden (foundations, reinforcement) is measured and signed off before it is covered up, and the
 * sign-off is countersigned by someone above. The engineer's written instructions go in the site order book, and the
 * site answers each one with what it did. Everything here is pure; `ConsultantChecksService` and `SiteOrdersService`
 * load the rows.
 */
import type { CheckLevel, RoleKey, SiteOrderStatus, SubmissionStatus } from './enums';
import { CHECK_LEVEL_LABELS } from './labels';
import { daysFrom } from './official-reports';
import type { AttachmentDto } from './types';

/** The share of a bill's measurements, by value, each level checks before certifying it (%). */
export const CHECK_LEVEL_SHARE: Record<CheckLevel, number> = { ASSISTANT_ENGINEER: 100, RESIDENT_ENGINEER: 25, DEPUTY_TEAM_LEADER: 10, TEAM_LEADER: 3 };
/** Seniority, lowest first: a countersign comes from above the sign-off. */
export const CHECK_LEVEL_RANK: Record<CheckLevel, number> = { ASSISTANT_ENGINEER: 1, RESIDENT_ENGINEER: 2, DEPUTY_TEAM_LEADER: 3, TEAM_LEADER: 4 };
/** A checked quantity within this % of the recorded one agrees with it. */
export const CHECK_AGREE_PCT = 0.5;

const round1 = (n: number) => Math.round(n * 10) / 10;
const levelWords = (l: CheckLevel) => CHECK_LEVEL_LABELS[l].toLowerCase();
const article = (l: CheckLevel) => (/^[aeiou]/i.test(CHECK_LEVEL_LABELS[l]) ? 'an' : 'a');

export type CheckOutcome = 'AGREED' | 'LESS' | 'MORE';
export const CHECK_OUTCOME_LABELS: Record<CheckOutcome, string> = { AGREED: 'Agrees', LESS: 'Less than recorded', MORE: 'More than recorded' };

/** What a check found: the checker's quantity against the sheet's, agreeing within CHECK_AGREE_PCT. */
export function checkOutcome(recorded: number, checked: number): CheckOutcome {
  const allowance = Math.abs(recorded) * (CHECK_AGREE_PCT / 100);
  if (Math.abs(checked - recorded) <= allowance + 1e-9) return 'AGREED';
  return checked < recorded ? 'LESS' : 'MORE';
}

/** A measurement sheet as coverage counts it: its value (quantity at the BOQ rate). */
export interface CoverageSheet {
  id: string;
  amount: number;
}
export interface CoverageCheck {
  sheetId: string;
  level: CheckLevel;
}
export interface LevelCoverage {
  level: CheckLevel;
  /** The share this level checks, % */
  requiredPct: number;
  /** The share checked so far, %, by value (by count when the sheets carry no value) */
  checkedPct: number;
  checkedSheets: number;
  totalSheets: number;
  met: boolean;
  byValue: boolean;
}

/**
 * How much of a set of sheets each level has checked. Each level counts only its own checks: the resident engineer's
 * quarter is theirs, whatever the assistant engineer did. By value, so a large sheet weighs more than a small one; by
 * count when no sheet has a value. A level with no sheets to check has met its share.
 */
export function checkCoverage(sheets: CoverageSheet[], checks: CoverageCheck[]): LevelCoverage[] {
  const total = sheets.reduce((s, x) => s + Math.max(0, x.amount), 0);
  const byValue = total > 0;
  const ids = new Set(sheets.map((s) => s.id));
  return (Object.keys(CHECK_LEVEL_SHARE) as CheckLevel[]).map((level) => {
    const done = new Set(checks.filter((c) => c.level === level && ids.has(c.sheetId)).map((c) => c.sheetId));
    const checked = sheets.filter((s) => done.has(s.id));
    const raw = !sheets.length ? 100 : byValue ? (checked.reduce((s, x) => s + Math.max(0, x.amount), 0) / total) * 100 : (checked.length / sheets.length) * 100;
    return { level, requiredPct: CHECK_LEVEL_SHARE[level], checkedPct: round1(raw), checkedSheets: checked.length, totalSheets: sheets.length, met: raw + 1e-9 >= CHECK_LEVEL_SHARE[level], byValue };
  });
}

/**
 * The unchecked sheets a level checks next to reach its share, largest first, so the fewest sheets cover it. Empty once
 * the share is met.
 */
export function sheetsToReach(level: CheckLevel, sheets: CoverageSheet[], checks: CoverageCheck[]): string[] {
  const cov = checkCoverage(sheets, checks).find((c) => c.level === level)!;
  if (cov.met) return [];
  const done = new Set(checks.filter((c) => c.level === level).map((c) => c.sheetId));
  const total = cov.byValue ? sheets.reduce((s, x) => s + Math.max(0, x.amount), 0) : sheets.length;
  let have = sheets.filter((s) => done.has(s.id)).reduce((s, x) => s + (cov.byValue ? Math.max(0, x.amount) : 1), 0);
  const need = (cov.requiredPct / 100) * total;
  const out: string[] = [];
  for (const s of [...sheets].filter((x) => !done.has(x.id)).sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id))) {
    if (have + 1e-9 >= need) break;
    out.push(s.id);
    have += cov.byValue ? Math.max(0, s.amount) : 1;
  }
  return out;
}

/**
 * Why a consultant at this level may not certify a bill yet: they have not checked their share of its measurements. A
 * guest with no level on the project (the client's own engineer, say) is not held to a share.
 */
export function certifyCheckProblem(level: CheckLevel | null, coverage: LevelCoverage[]): string | null {
  if (!level) return null;
  const c = coverage.find((x) => x.level === level);
  if (!c || c.met || !c.totalSheets) return null;
  return `Check more of this bill's measurements first: ${article(level)} ${levelWords(level)} checks at least ${c.requiredPct}% of them${c.byValue ? ' by value' : ''} before certifying, and you have checked ${c.checkedPct}%.`;
}

/** The person who signs off or countersigns hidden work, as the rules need them. */
export interface CheckSigner {
  id: string;
  roleKey: RoleKey;
  /** Their level on the project; null for the client's engineer or a consultant given none */
  level: CheckLevel | null;
}

/** An inspection as the hidden-work rules read it. */
export interface HiddenWorkState {
  status: SubmissionStatus;
  /** The inspection's activity is marked hidden work */
  hiddenWork: boolean;
  signedById: string | null;
  signedLevel: CheckLevel | null;
  countersignedById: string | null;
}

/** Why hidden work cannot be signed off on this inspection now. Signing again (before the countersign) replaces it. */
export function hiddenSignProblem(ins: HiddenWorkState): string | null {
  if (!ins.hiddenWork) return 'This activity is not marked as hidden work, so it needs no sign-off before it is covered';
  if (ins.status !== 'SUBMITTED' && ins.status !== 'APPROVED') return 'Sign off hidden work on an inspection that is requested or passed';
  if (ins.countersignedById) return 'This sign-off is countersigned, so it no longer changes';
  return null;
}

/**
 * Why this person cannot countersign the sign-off: it must be signed first, by someone else, and the countersign comes
 * from the client's engineer or a consultant at a higher level than whoever signed.
 */
export function countersignProblem(ins: HiddenWorkState, by: CheckSigner): string | null {
  if (!ins.signedById) return 'The hidden work is not signed off yet. Whoever measured it signs it off first';
  if (ins.countersignedById) return 'This sign-off is already countersigned';
  if (ins.signedById === by.id) return 'Someone other than the person who signed it off countersigns it';
  if (by.roleKey === 'CLIENT_ENGINEER') return null;
  if (!by.level) return "Only the client's engineer, or a consultant given a level on this project, countersigns hidden work";
  if (ins.signedLevel && CHECK_LEVEL_RANK[by.level] <= CHECK_LEVEL_RANK[ins.signedLevel])
    return `A countersign comes from above the sign-off: it was signed by ${article(ins.signedLevel)} ${levelWords(ins.signedLevel)}, so a higher level or the client's engineer countersigns`;
  return null;
}

/** Hidden work may be covered: the inspection passed and its sign-off is countersigned. */
export const hiddenWorkCleared = (ins: Pick<HiddenWorkState, 'status' | 'signedById' | 'countersignedById'>) => ins.status === 'APPROVED' && !!ins.signedById && !!ins.countersignedById;

/** Days given to comply when the order names no date. */
export const SITE_ORDER_DEFAULT_DAYS = 7;
export const SITE_ORDER_STATES = ['OPEN', 'OVERDUE', 'REPLIED', 'CLOSED'] as const;
export type SiteOrderState = (typeof SITE_ORDER_STATES)[number];
export const SITE_ORDER_STATE_LABELS: Record<SiteOrderState, string> = { OPEN: 'Waiting for compliance', OVERDUE: 'Compliance overdue', REPLIED: 'Complied, to accept', CLOSED: 'Closed' };
export const SITE_ORDER_STATE_COLORS: Record<SiteOrderState, string> = { OPEN: 'gold', OVERDUE: 'red', REPLIED: 'blue', CLOSED: 'green' };

/** Where an order stands today: an open order past its comply-by date is overdue. */
export function siteOrderState(o: { status: SiteOrderStatus; complyBy: string | null }, today: string): SiteOrderState {
  if (o.status !== 'OPEN') return o.status;
  return o.complyBy && daysFrom(o.complyBy, today) > 0 ? 'OVERDUE' : 'OPEN';
}

/** Why an order cannot be written as given. */
export function siteOrderProblem(o: { instruction: string; date: string; complyBy: string | null }, today: string): string | null {
  if (!o.instruction.trim()) return 'Write the instruction, as it reads in the order book';
  if (daysFrom(today, o.date) > 0) return 'The order date cannot be after today';
  if (o.complyBy && daysFrom(o.date, o.complyBy) < 0) return 'The comply-by date cannot be before the order date';
  return null;
}

/** The order's name: its number in the project's book. */
export const siteOrderLabel = (no: number) => `Order ${no}`;

export interface MeasurementCheckDto {
  id: string;
  sheetId: string;
  level: CheckLevel;
  checkedById: string;
  checkedByName: string;
  checkedOn: string;
  recordedQty: string;
  checkedQty: string;
  outcome: CheckOutcome;
  note: string | null;
}

/** A measurement sheet in the consultant's portal: approved by the contractor, with its lines and the checks on it. */
export interface PortalMeasurementDto {
  id: string;
  mbNo: string;
  date: string;
  location: string;
  boqItemNo: string;
  boqItemDescription: string;
  unit: string;
  totalQty: string;
  rate: string;
  amount: string;
  billLabel: string | null;
  lines: { description: string; nos: string | null; length: string | null; breadth: string | null; depth: string | null; deduct: boolean; quantity: string }[];
  attachments: AttachmentDto[];
  checks: MeasurementCheckDto[];
}

export interface PortalMeasurementsDto {
  /** The caller's level on the project, null when they have none */
  level: CheckLevel | null;
  sheets: PortalMeasurementDto[];
  /** Over every approved sheet of the project */
  coverage: LevelCoverage[];
  /** The caller's next sheets to reach their share, largest first */
  toCheck: string[];
}

/** A bill's sheets as checked: shown in the portal's bill and refused below the certifier's share. */
export interface BillMeasureChecksDto {
  level: CheckLevel | null;
  coverage: LevelCoverage[];
  toCheck: string[];
  problem: string | null;
}

/** The sign-off of hidden work against its inspection, and its countersign. */
export interface HiddenWorkDto {
  signedById: string | null;
  signedByName: string | null;
  signedLevel: CheckLevel | null;
  signedAt: string | null;
  qty: string | null;
  note: string | null;
  countersignedByName: string | null;
  countersignedAt: string | null;
  countersignNote: string | null;
  cleared: boolean;
}

export interface SiteOrderDto {
  id: string;
  projectId: string;
  projectName: string;
  orderNo: number;
  label: string;
  date: string;
  /** The engineer who wrote it: a portal user, or a name as written in the book */
  issuedById: string | null;
  issuedByName: string;
  issuedByLevel: CheckLevel | null;
  /** Written in the portal (else recorded by staff from the book) */
  fromPortal: boolean;
  location: string | null;
  instruction: string;
  complyBy: string | null;
  status: SiteOrderStatus;
  state: SiteOrderState;
  reply: string | null;
  repliedByName: string | null;
  repliedOn: string | null;
  closedByName: string | null;
  closedOn: string | null;
  closeNote: string | null;
  recordedByName: string | null;
  createdAt: string;
}
