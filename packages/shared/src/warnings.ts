import type { RoleKey } from './enums';
import { canApprove, canEditProjects, canManageDocuments, canManageMachineLoans, canManagePackages, canManageQaPlan, canManageMaintenance, canManageOm, canManageStore, canPurchase, canRaiseRisk, canSetMaterialNorms, canViewCost } from './permissions';

/**
 * Early warnings: plain forecasts over the records, shown as the Watch list (a My work card and its
 * own page) and a weekly notification. Each kind is calculated in `apps/api/src/warnings/warning-rules.ts`.
 */
export const WARNING_KINDS = ['SCHEDULE', 'CASH', 'VENDOR', 'STOCK', 'MACHINE', 'DPR', 'MATERIAL_OVERUSE', 'FUEL_NORM', 'LOAN_EMI', 'RATE_ABOVE', 'FUEL_NO_LOG', 'IDLE_HIRE', 'NOTICE_DUE', 'MANDAYS_ABOVE', 'PACKAGE_LATE', 'OM_SERVICE', 'BOQ_OFF_CONTRACT', 'TESTS_SHORT', 'CALIBRATION_DUE', 'LAB_REPORT_LATE', 'DRAWING_LATE', 'DESIGN_REVIEW_LATE', 'COPY_RECALL_LATE', 'MARGIN_FADE', 'CUBE_7DAY_LOW', 'PURCHASE_CONTROL', 'FUEL_TANK', 'WEIGH_SHORT'] as const;
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
  RATE_ABOVE: 'Paying more than another site',
  FUEL_NO_LOG: 'Fuel issued with no log',
  IDLE_HIRE: 'Hired machine paid for idle time',
  NOTICE_DUE: 'Hindrance notice due',
  MANDAYS_ABOVE: 'Man-days billed above attendance',
  PACKAGE_LATE: 'Equipment late for site',
  OM_SERVICE: 'O&M service levels missed',
  BOQ_OFF_CONTRACT: 'BOQ far from the contract value',
  TESTS_SHORT: 'Tests short of the quality plan',
  CALIBRATION_DUE: 'Instrument out of calibration',
  LAB_REPORT_LATE: 'Lab reports late',
  DRAWING_LATE: 'Drawings awaited',
  DESIGN_REVIEW_LATE: 'Design approval late',
  COPY_RECALL_LATE: 'Superseded drawings on site',
  MARGIN_FADE: 'Margin falling',
  CUBE_7DAY_LOW: 'Cubes weak at 7 days',
  PURCHASE_CONTROL: 'Purchase control',
  FUEL_TANK: "Fuel tank and slips don't match",
  WEIGH_SHORT: 'Short deliveries at the weighbridge',
};

/**
 * Purchase controls: orders split under an approval limit, goods received by the person who
 * ordered them, a payment soon after a vendor's bank details changed. Management, accounts and the admin; each sees them on
 * their own watch list, never in a shared place.
 */
export const canSeePurchaseControls = (role: RoleKey) => role === 'ADMIN' || role === 'MANAGEMENT' || role === 'ACCOUNTS_MANAGER';

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
  // Leakage checks
  if (canPurchase(role)) out.push('RATE_ABOVE');
  if (canManageMaintenance(role)) out.push('FUEL_NO_LOG', 'IDLE_HIRE');
  // Fuel sensors: drains and fills off the slips, for whoever looks after the machines' fuel.
  if (canManageMaintenance(role)) out.push('FUEL_TANK');
  // Weighbridge: a supplier's loads short of their challans, for the store and the buyers who deal with them.
  if (canManageStore(role) || canPurchase(role)) out.push('WEIGH_SHORT');
  // Hindrance notices: the project manager signs them.
  if (canApprove(role) && canRaiseRisk(role)) out.push('NOTICE_DUE');
  // Attendance cross-check: whoever approves the bill.
  if (canApprove(role)) out.push('MANDAYS_ABOVE');
  // EPC packages: procurement and the project's managers chase them.
  if (canManagePackages(role)) out.push('PACKAGE_LATE');
  // O&M: the managers who run the scheme and sign its bills.
  if (canManageOm(role)) out.push('OM_SERVICE');
  // Project setup: every figure built on the BOQ is off; the managers who see cost and
  // edit the project put it right.
  if (canViewCost(role) && canEditProjects(role)) out.push('BOQ_OFF_CONTRACT');
  // QA/QC: QA/QC and the managers who keep the quality plan.
  if (canManageQaPlan(role)) out.push('TESTS_SHORT', 'CALIBRATION_DUE', 'LAB_REPORT_LATE');
  // Design and drawings: whoever keeps the register chases the drawings and records the delay.
  if (canManageDocuments(role)) out.push('DRAWING_LATE', 'DESIGN_REVIEW_LATE', 'COPY_RECALL_LATE');
  // Margin fade: those who see cost and approve, the PM up to the MD.
  if (canViewCost(role) && canApprove(role)) out.push('MARGIN_FADE');
  // Cubes weak at 7 days (Q2): QA/QC and the approvers, who can hold the next lift.
  if (canManageQaPlan(role)) out.push('CUBE_7DAY_LOW');
  // Purchase controls (Q6): the owners of the money only, never the buyers or approvers whose work they look at.
  if (canSeePurchaseControls(role)) out.push('PURCHASE_CONTROL');
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

/** What each kind is. Kinds read by the model are CHECK_THIS. */
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
  RATE_ABOVE: 'CHECKED',
  FUEL_NO_LOG: 'CHECKED',
  IDLE_HIRE: 'CHECKED',
  NOTICE_DUE: 'CHECKED',
  MANDAYS_ABOVE: 'CHECKED',
  PACKAGE_LATE: 'LIKELY',
  OM_SERVICE: 'CHECKED',
  BOQ_OFF_CONTRACT: 'CHECKED',
  TESTS_SHORT: 'CHECKED',
  CALIBRATION_DUE: 'CHECKED',
  LAB_REPORT_LATE: 'CHECKED',
  DRAWING_LATE: 'CHECKED',
  DESIGN_REVIEW_LATE: 'CHECKED',
  COPY_RECALL_LATE: 'CHECKED',
  MARGIN_FADE: 'LIKELY',
  CUBE_7DAY_LOW: 'LIKELY',
  PURCHASE_CONTROL: 'CHECKED',
  FUEL_TANK: 'CHECKED',
  WEIGH_SHORT: 'CHECKED',
};

/**
 * What became of a warning when someone dismissed it: WRONG (the figures or the rule were wrong), KNOWN
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
