import type { RoleKey } from './enums';
import { canApprove, canManageMachineLoans, canManageMaintenance, canManageStore, canPurchase, canSetMaterialNorms, canViewCost } from './permissions';

/**
 * Early warnings (AI roadmap item 73): plain forecasts over the records, shown as the Watch list (a My work card and its
 * own page) and a weekly notification. Each kind is calculated in `apps/api/src/warnings/warning-rules.ts`.
 */
export const WARNING_KINDS = ['SCHEDULE', 'CASH', 'VENDOR', 'STOCK', 'MACHINE', 'DPR', 'MATERIAL_OVERUSE', 'FUEL_NORM', 'LOAN_EMI'] as const;
export type WarningKind = (typeof WARNING_KINDS)[number];

export const WARNING_KIND_LABELS: Record<WarningKind, string> = {
  SCHEDULE: 'Finish slipping',
  CASH: 'Cash gap',
  VENDOR: 'Vendor trending worse',
  STOCK: 'Stock running out',
  MACHINE: 'Machine idle or breaking down',
  DPR: 'DPRs missing',
  MATERIAL_OVERUSE: 'Material used over the norm',
  FUEL_NORM: 'Fuel use off the norm',
  LOAN_EMI: 'Machine loan EMI overdue',
};

/** The warning kinds a role sees: each is the business of the role that can act on it. */
export function watchListKinds(role: RoleKey): WarningKind[] {
  const out: WarningKind[] = [];
  if (canApprove(role)) out.push('SCHEDULE');
  if (canViewCost(role)) out.push('CASH');
  if (canPurchase(role)) out.push('VENDOR');
  if (canManageStore(role)) out.push('STOCK');
  if (canManageMaintenance(role)) out.push('MACHINE');
  if (canApprove(role)) out.push('DPR');
  if (canSetMaterialNorms(role)) out.push('MATERIAL_OVERUSE');
  if (canManageMaintenance(role)) out.push('FUEL_NORM');
  if (canManageMachineLoans(role)) out.push('LOAN_EMI');
  return out;
}

export const canSeeWatchList = (role: RoleKey) => watchListKinds(role).length > 0;

/** Shortest note accepted when a warning is dismissed as Known and accepted (the other outcomes need none). */
export const WARNING_DISMISS_MIN = 3;

/**
 * How sure a warning is, in words (AI strategy, design principle 3): CHECKED is a rule over records, LIKELY a forecast,
 * CHECK_THIS something read by the model from a photo, voice note or message. Site staff never see a bare percentage.
 */
export const WARNING_CONFIDENCES = ['CHECKED', 'LIKELY', 'CHECK_THIS'] as const;
export type WarningConfidence = (typeof WARNING_CONFIDENCES)[number];

export const WARNING_CONFIDENCE_LABELS: Record<WarningConfidence, string> = { CHECKED: 'Checked', LIKELY: 'Likely', CHECK_THIS: 'Check this' };
export const WARNING_CONFIDENCE_HELP: Record<WarningConfidence, string> = {
  CHECKED: 'A rule over your own records: the figures are as entered.',
  LIKELY: 'A forecast from the pace so far: it can move as new entries come in.',
  CHECK_THIS: 'Read by Ask Nirmaan from a photo, voice note or message: check it against the original.',
};

/** What each kind is (item 119). Kinds read by the model are CHECK_THIS. */
export const WARNING_CONFIDENCE_OF: Record<WarningKind, WarningConfidence> = {
  SCHEDULE: 'LIKELY',
  CASH: 'LIKELY',
  VENDOR: 'CHECKED',
  STOCK: 'LIKELY',
  MACHINE: 'CHECKED',
  DPR: 'CHECKED',
  MATERIAL_OVERUSE: 'CHECKED',
  FUEL_NORM: 'CHECKED',
  LOAN_EMI: 'CHECKED',
};

/**
 * What became of a warning when someone dismissed it (item 119): WRONG (the figures or the rule were wrong), KNOWN
 * (true, and accepted for a reason) or FIXED (true, and acted on). KNOWN and FIXED count as right in the track record.
 */
export const WARNING_OUTCOMES = ['FIXED', 'KNOWN', 'WRONG'] as const;
export type WarningOutcome = (typeof WARNING_OUTCOMES)[number];
export const WARNING_OUTCOME_LABELS: Record<WarningOutcome, string> = { FIXED: 'Fixed', KNOWN: 'Known and accepted', WRONG: 'Wrong' };
export const WARNING_OUTCOME_HELP: Record<WarningOutcome, string> = {
  FIXED: 'It was right and has been acted on.',
  KNOWN: 'It is right, and there is a reason to leave it: say what.',
  WRONG: 'The figures or the rule are wrong here: it counts against this check.',
};

/** The track record is over this many latest outcomes of a kind, company-wide. */
export const TRACK_RECORD_SIZE = 10;
/** A kind marked Wrong more than this share of the time, over at least PAUSE_MIN_OUTCOMES outcomes in PAUSE_WINDOW_DAYS, pauses. */
export const PAUSE_WRONG_SHARE = 0.5;
export const PAUSE_MIN_OUTCOMES = 4;
export const PAUSE_WINDOW_DAYS = 30;
/** New warnings sent as notifications (and so WhatsApp alerts) to one person in a day; the rest wait for the morning brief. */
export const DAILY_WARNING_ALERTS = 5;

/** Admins and management resume a paused kind. */
export const canResumeWarningKind = (role: RoleKey) => role === 'ADMIN' || role === 'MANAGEMENT';

export interface WarningFact {
  label: string;
  value: string;
}

export interface WarningLink {
  label: string;
  href: string;
}

/** What it costs if nobody acts: the text shown, and the rupees or days it is sorted by. */
export interface WarningImpact {
  text: string;
  inr: number | null;
  days: number | null;
}

export interface WarningDto {
  /**
   * Names the warning and the figures it fired on (`stock:<project>:<item>:<month>`), so a dismissal holds while the
   * figures stay about the same and the warning comes back when they move on.
   */
  key: string;
  kind: WarningKind;
  title: string;
  /** One sentence: what the figures say will happen. */
  detail: string;
  /** What to do about it, by when, in a few words: the card leads with it. */
  action: string;
  impact: WarningImpact | null;
  confidence: WarningConfidence;
  /** The rule and its numbers, a line each ("58 m³ × 7.1 bags = 412 bags allowed"), shown under Why. */
  working: string[];
  facts: WarningFact[];
  links: WarningLink[];
  projectId: string | null;
  projectName: string | null;
  /** Dismissed by someone in the company, with what became of it and their note. */
  dismissed: { outcome: WarningOutcome; reason: string; byName: string; at: string } | null;
}

/** How a kind has done in this company: its latest outcomes, and whether it is paused. */
export interface WarningRecordDto {
  kind: WarningKind;
  /** Of the latest `of` outcomes (at most TRACK_RECORD_SIZE), how many were Fixed or Known. */
  right: number;
  of: number;
  /** Paused because it was marked Wrong too often; null while it runs. */
  paused: { since: string; wrong: number; of: number } | null;
}

export interface WatchListDto {
  asOf: string;
  kinds: WarningKind[];
  open: WarningDto[];
  dismissed: WarningDto[];
  /** One per kind the caller sees. A paused kind's warnings are left out of `open` and `dismissed`. */
  records: WarningRecordDto[];
  canResume: boolean;
}

/** "Right 7 of the last 10", or null before anything has been marked. */
export function trackRecordText(r: Pick<WarningRecordDto, 'right' | 'of'>): string | null {
  if (!r.of) return null;
  if (r.of === 1) return r.right ? 'Right the one time it was marked' : 'Wrong the one time it was marked';
  return `Right ${r.right} of the last ${r.of}`;
}
