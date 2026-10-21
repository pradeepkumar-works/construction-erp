/**
 * Approval matrix: which roles may approve which submission types, and up to what amount.
 * An organisation without a saved matrix uses the fixed rule (APPROVER_ROLES approve everything, no limit).
 * Admin can always approve everything, so nothing is ever left without an approver.
 */
import { SUBMISSION_TYPES, type ApprovalStepAction, type RoleKey, type SubmissionStatus, type SubmissionType } from './enums';
import { APPROVER_ROLES } from './permissions';

/** One right: approve `type`, up to `maxAmount` rupees (null = no limit), at approval `level` (1 when left out). */
export interface ApprovalRightDto {
  type: SubmissionType;
  maxAmount: string | null;
  /** v5 item 94: 2 or 3 for a higher level; absent or 1 for the first approval */
  level?: number;
}

/** Up to three approvals of one entry (v5 item 94): level 1 is the matrix; levels 2 and 3 apply above their amount. */
export const MAX_APPROVAL_LEVELS = 3;

/** A higher level of one submission type: who approves it, and the amount from which it applies (null = always). */
export interface ApprovalLevelRule {
  level: number;
  minAmount: string | null;
}

/**
 * How many approvals an entry needs: level 1 always, and each higher level whose amount the entry reaches (a level
 * without an amount, or any level of a type without an amount, always applies). An unknown amount counts as nil, so
 * it needs only the levels that always apply. Levels run in order: level 3 applies only when level 2 does.
 */
export function levelsNeeded(type: SubmissionType, higher: ApprovalLevelRule[], amount: string | number | null): number {
  let levels = 1;
  for (let level = 2; level <= MAX_APPROVAL_LEVELS; level++) {
    const rules = higher.filter((r) => r.level === level);
    if (!rules.length) break;
    const always = !hasAmount(type) || rules.some((r) => r.minAmount === null);
    const from = always ? 0 : Math.min(...rules.map((r) => Number(r.minAmount)));
    if (!always && Number(amount ?? 0) < from) break;
    levels = level;
  }
  return levels;
}

/** Reminders and escalation for one submission type (v5 item 94); null hours = off. */
export interface ApprovalEscalationDto {
  type: SubmissionType;
  /** Remind the approvers once the entry has waited this many hours at its level */
  remindAfterHours: number | null;
  /** After this many hours, the next level's roles (management above the top level) may decide it too, and are told */
  escalateAfterHours: number | null;
}

/** One step on an entry's way through its approval levels. */
export interface ApprovalStepDto {
  level: number;
  action: ApprovalStepAction;
  byName: string | null;
  at: string;
  note: string | null;
}

/** Where an entry stands in its approval levels, and whether the caller may decide it now. */
export interface ApprovalStageDto {
  type: SubmissionType;
  id: string;
  status: SubmissionStatus;
  /** The level waiting for a decision (the last one once approved) */
  level: number;
  /** Levels this entry needs at its amount */
  levels: number;
  /** Steps since it was last submitted, oldest first */
  steps: ApprovalStepDto[];
  /** Waiting long enough that the next level's roles may decide it too */
  escalated: boolean;
  /** Roles whose queue it is in now */
  waitingWith: string[];
  /** Since when it has waited at this level (submission, or the last step) */
  waitingSince: string | null;
  canReview: boolean;
  /** Why the caller may not decide it now, when they may approve this type at all */
  reason: string | null;
}

/** What the amount of each type is; types not listed have no amount, so a limit does not apply to them. */
export const APPROVAL_AMOUNT_BASIS: Partial<Record<SubmissionType, string>> = {
  PROGRESS: 'value of the quantity at the BOQ rate',
  EXPENSE: 'bill total including GST',
  MEASUREMENT: 'measured quantity at the BOQ rate',
  MACHINERY: 'machine cost for the day at its hire rate',
  BILL: 'value of work in the bill, before GST and deductions',
  PURCHASE_ORDER: 'order total including freight and GST',
  VENDOR_BILL: 'invoice total including freight and GST',
  WORK_ORDER: 'work order value before GST',
  SUBCONTRACT_BILL: 'value of work in the bill, before GST and recoveries',
  PAYMENT_REQUEST: 'amount asked to be paid',
};

export const hasAmount = (type: SubmissionType): boolean => type in APPROVAL_AMOUNT_BASIS;

/** Under the fixed rule, specialists who approve one type besides the approvers: QA/QC passes or fails inspections. */
export const SPECIALIST_APPROVERS: Partial<Record<SubmissionType, RoleKey[]>> = { INSPECTION: ['QA_QC_ENGINEER'] };

/** Roles that approve `type` under the fixed rule. */
export const defaultApproverRoles = (type: SubmissionType): RoleKey[] => [...APPROVER_ROLES, ...(SPECIALIST_APPROVERS[type] ?? [])];

/** The fixed rule used until an organisation saves a matrix. */
export const defaultApprovalRights = (role: RoleKey): ApprovalRightDto[] =>
  SUBMISSION_TYPES.filter((type) => defaultApproverRoles(type).includes(role)).map((type) => ({ type, maxAmount: null }));

export const ALL_APPROVAL_RIGHTS: ApprovalRightDto[] = SUBMISSION_TYPES.map((type) => ({ type, maxAmount: null }));

/** The user's rights as sent by the API (older APIs send none: fall back to the role rule). */
export const approvalRightsOf = (user: { roleKey: RoleKey; approvalRights?: ApprovalRightDto[] }): ApprovalRightDto[] => user.approvalRights ?? defaultApprovalRights(user.roleKey);

/** May this user approve anything at all, at any level (shows the approvals queue)? */
export const mayApprove = (user: { roleKey: RoleKey; approvalRights?: ApprovalRightDto[] }): boolean => approvalRightsOf(user).length > 0;

/**
 * Might this user decide some entry of this type at some level (v5 item 94)? Management also takes escalated entries
 * of any type. Whether they may decide a given entry now is the API's stage (`GET /approvals/:type/:id/stage`).
 */
export const mayApproveTypeAtAll = (user: { roleKey: RoleKey; approvalRights?: ApprovalRightDto[] }, type: SubmissionType): boolean =>
  user.roleKey === 'MANAGEMENT' || approvalRightsOf(user).some((r) => r.type === type);

/** May this user approve this type (at `level`, 1 when left out), and (when given) this amount? */
export function mayApproveType(user: { roleKey: RoleKey; approvalRights?: ApprovalRightDto[] }, type: SubmissionType, amount?: string | number | null, level = 1): boolean {
  const right = approvalRightsOf(user).find((r) => r.type === type && (r.level ?? 1) === level);
  if (!right) return false;
  if (right.maxAmount === null || amount === undefined || amount === null || !hasAmount(type)) return true;
  return Number(amount) <= Number(right.maxAmount);
}
