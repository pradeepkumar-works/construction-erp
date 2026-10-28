import type { ProjectStatus } from './enums';
import { BEHIND_TOLERANCE_PCT } from './schedule';

/**
 * Progress by project (ARCHITECTURE "Progress by project"): the Projects module's screen shows every contract project the
 * caller sees with its physical progress (the work breakdown's `rollUp`, against the share planned by today) and its
 * financial progress (approved RA bills, work value before GST and price variation, against the revised contract value),
 * side by side on one 0–100 scale. The portfolio figures and the notes beside a project are pure here.
 */

/** Billing this many points behind or ahead of the work done is worth a word. */
export const BILLING_GAP_PCT = 10;

export interface ProjectProgressDto {
  projectId: string;
  code: string;
  name: string;
  status: ProjectStatus;
  /** Physical progress, % (the project's `physicalProgressPct`) */
  physicalPct: number;
  /** % planned by today from the activities' dates; null without dated activities */
  plannedPct: number | null;
  /** Approved RA bills ÷ revised contract value, %; null without a contract value, or for a role that does not see bills */
  financialPct: number | null;
  /** Revised contract value (contract plus approved variations), for roles that see bills; null otherwise */
  contractValue: string | null;
  /** Approved RA bills to date, work value before GST and price variation, for roles that see bills; null otherwise */
  billed: string | null;
}

export interface ModuleProgressDto {
  projects: ProjectProgressDto[];
  /** Physical progress of the projects together, %; null without projects */
  physicalPct: number | null;
  /** `contract` when every project has a contract value and each weighs by it; `equal` when they count alike */
  weighting: 'contract' | 'equal';
  /** Billed ÷ contract over the projects with a contract value, %; null when none has one, or for a role without bills */
  financialPct: number | null;
  /** Whether the caller sees bills (and so financial progress at all) */
  seesFinancial: boolean;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The projects' figures together. Physical progress weighs each project by its contract value when every project has
 * one (a big job moves the figure more than a small one), else counts them alike, and says which. Financial progress is
 * the bills over the contract values of the projects that have one, so it compares like with like.
 */
export function portfolioProgress(rows: { physicalPct: number; contractValue: number | null; billed: number | null }[]): {
  physicalPct: number | null;
  weighting: 'contract' | 'equal';
  financialPct: number | null;
} {
  if (!rows.length) return { physicalPct: null, weighting: 'equal', financialPct: null };
  const valued = rows.filter((r) => r.contractValue !== null && r.contractValue > 0);
  const weighting = valued.length === rows.length ? 'contract' : 'equal';
  const physical =
    weighting === 'contract'
      ? valued.reduce((s, r) => s + r.physicalPct * r.contractValue!, 0) / valued.reduce((s, r) => s + r.contractValue!, 0)
      : rows.reduce((s, r) => s + r.physicalPct, 0) / rows.length;
  const billedRows = valued.filter((r) => r.billed !== null);
  const contract = billedRows.reduce((s, r) => s + r.contractValue!, 0);
  const financial = contract > 0 ? (billedRows.reduce((s, r) => s + r.billed!, 0) / contract) * 100 : null;
  return { physicalPct: round1(physical), weighting, financialPct: financial === null ? null : round1(financial) };
}

export type ProgressNoteKey = 'behind' | 'billingBehind' | 'billingAhead';

export interface ProgressNote {
  key: ProgressNoteKey;
  /** Percentage points between the two figures */
  points: number;
  /** What it means, in a few words */
  text: string;
}

/**
 * What a project's two figures say together: work behind the plan by more than the schedule's tolerance, and billing
 * `BILLING_GAP_PCT` or more points behind the work done (bill it) or ahead of it (billed before the work).
 */
export function progressNotes(p: { physicalPct: number; plannedPct: number | null; financialPct: number | null }): ProgressNote[] {
  const out: ProgressNote[] = [];
  if (p.plannedPct !== null && p.physicalPct + BEHIND_TOLERANCE_PCT < p.plannedPct) {
    const points = Math.round(p.plannedPct - p.physicalPct);
    out.push({ key: 'behind', points, text: `${points} points behind plan` });
  }
  if (p.financialPct !== null) {
    const gap = Math.round(p.physicalPct - p.financialPct);
    if (gap >= BILLING_GAP_PCT) out.push({ key: 'billingBehind', points: gap, text: `Billing ${gap} points behind the work` });
    else if (-gap >= BILLING_GAP_PCT) out.push({ key: 'billingAhead', points: -gap, text: `Billed ${-gap} points ahead of the work` });
  }
  return out;
}

const STATUS_ORDER: Record<ProjectStatus, number> = { ACTIVE: 0, ON_HOLD: 1, PLANNED: 2, COMPLETED: 3, CLOSED: 4 };

/** Running projects first, then on hold, planned and complete; by code within each. */
export const byProgressOrder = (a: Pick<ProjectProgressDto, 'status' | 'code'>, b: Pick<ProjectProgressDto, 'status' | 'code'>) =>
  STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.code.localeCompare(b.code);
