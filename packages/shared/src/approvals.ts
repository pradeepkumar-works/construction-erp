/**
 * Approval matrix: which roles and positions may approve which submission types, at which level, and up to what amount.
 * An organisation without a saved matrix uses the fixed rule (APPROVER_ROLES approve everything, no limit).
 * Admin can always approve everything, so nothing is ever left without an approver.
 */
import { SUBMISSION_TYPES, type ApprovalStepAction, type RoleKey, type SubmissionStatus, type SubmissionType } from './enums';
import { APPROVER_ROLES, GUEST_ROLES } from './permissions';

/** One right: approve `type`, up to `maxAmount` rupees (null = no limit), at approval `level` (1 when left out). */
export interface ApprovalRightDto {
  type: SubmissionType;
  maxAmount: string | null;
  /** 2 to 6 for a higher level; absent or 1 for the first approval */
  level?: number;
}

/** Up to six approvals of one entry, in order: level 1 always; levels 2 to 6 apply from their amount. */
export const MAX_APPROVAL_LEVELS = 6;

/**
 * Who a level of the approval matrix names: a role ("role:PROJECT_MANAGER") or a position of the `position` master
 * ("position:site-in-charge"). Built only by `roleApprover` and `positionApprover`, so the two never mix up.
 */
export type ApproverKey = string & { readonly __approver: unique symbol };
export const roleApprover = (role: RoleKey): ApproverKey => `role:${role}` as ApproverKey;
export const positionApprover = (code: string): ApproverKey => `position:${code}` as ApproverKey;
/** The role or the position code a key names (the other one null). */
export function approverOf(key: ApproverKey): { roleKey: RoleKey | null; positionCode: string | null } {
  return key.startsWith('role:') ? { roleKey: key.slice(5) as RoleKey, positionCode: null } : { roleKey: null, positionCode: key.slice(9) };
}
/** A rule's approver as a key: its role, else its position. */
export const ruleApprover = (r: { roleKey: RoleKey | null; positionCode: string | null }): ApproverKey => (r.positionCode ? positionApprover(r.positionCode) : roleApprover(r.roleKey!));

/** A higher level of one submission type: who approves it, and the amount from which it applies (null = always). */
export interface ApprovalLevelRule {
  level: number;
  minAmount: string | null;
}

/**
 * How many approvals an entry needs: level 1 always, and each higher level whose amount the entry reaches (a level
 * without an amount, or any level of a type without an amount, always applies). An unknown amount counts as nil, so
 * it needs only the levels that always apply. Levels run in order: a level applies only when the one below it does.
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

/** Reminders and escalation for one submission type; null hours = off. */
export interface ApprovalEscalationDto {
  type: SubmissionType;
  /** Remind the approvers once the entry has waited this many hours at its level */
  remindAfterHours: number | null;
  /** After this many hours, the next level's approvers (management above the top level) may decide it too, and are told */
  escalateAfterHours: number | null;
}

/** One step on an entry's way through its approval levels. */
export interface ApprovalStepDto {
  level: number;
  action: ApprovalStepAction;
  byName: string | null;
  /** The approver `byName` decided for while they were away; null when they decided as themselves */
  forName: string | null;
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
  /** Waiting long enough that the next level's approvers may decide it too */
  escalated: boolean;
  /** Roles and positions whose queue it is in now */
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
  MATERIAL_REQUEST: 'items at their last approved order rate, before GST (an item never ordered adds nothing)',
  EXPENSE: 'bill total including GST',
  MEASUREMENT: 'measured quantity at the BOQ rate',
  MACHINERY: 'machine cost for the day at its hire rate',
  BILL: 'value of work in the bill, before GST and deductions',
  PURCHASE_ORDER: 'order total including freight and GST',
  VENDOR_BILL: 'invoice total including freight and GST',
  WORK_ORDER: 'work order value before GST',
  SUBCONTRACT_BILL: 'value of work in the bill, before GST and recoveries',
  PAYMENT_REQUEST: 'amount asked to be paid',
  SUPPLIER_CHOICE: 'what is still to order at the chosen rates, with GST and freight',
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
 * Might this user decide some entry of this type at some level? Management also takes escalated entries
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

/**
 * Approvals while someone is away: from `startsOn` to `endsOn` (company dates, both days included) `toUserId` decides
 * what waits on `fromUserId` as well as their own, with their limits, and is told of it. The delegator keeps their rights.
 */
export interface ApprovalDelegationDto {
  id: string;
  fromUserId: string;
  fromName: string;
  toUserId: string;
  toName: string;
  /** YYYY-MM-DD */
  startsOn: string;
  /** YYYY-MM-DD */
  endsOn: string;
  note: string | null;
  /** Today is within its dates */
  active: boolean;
  createdByName: string | null;
}

/** YYYY-MM-DD, both days included. */
export const delegationActive = (d: { startsOn: string; endsOn: string }, today: string): boolean => d.startsOn <= today && today <= d.endsOn;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * What is wrong with a delegation about to be saved, or null. `to` is the delegate as found in the company (null when
 * not found); `today` the company's date.
 */
export function delegationProblem(
  d: { fromUserId: string; toUserId: string; startsOn: string; endsOn: string },
  to: { roleKey: RoleKey; isActive: boolean; fullName: string } | null,
  today: string,
): string | null {
  if (!to) return 'Choose who approves while they are away';
  if (d.toUserId === d.fromUserId) return 'Choose someone else: a person cannot approve for themselves';
  if (GUEST_ROLES.includes(to.roleKey)) return `${to.fullName} signs in as a guest or supplier and cannot approve; choose someone on the company's staff`;
  if (!to.isActive) return `${to.fullName}'s login is switched off; choose someone else`;
  if (!DAY.test(d.startsOn) || !DAY.test(d.endsOn)) return 'Enter the first and last day as dates';
  if (d.endsOn < d.startsOn) return 'Choose a last day on or after the first day';
  if (d.endsOn < today) return 'Choose a last day from today on';
  return null;
}

/**
 * Whoever made an entry never decides it, whatever their role (admin included): a submission, a salary run, a full and
 * final settlement, a voucher. Null when `userId` may decide; else the words that say so.
 */
export const ownEntryProblem = (makerId: string | null | undefined, userId: string): string | null =>
  makerId && makerId === userId ? 'You made this entry, so another approver decides it.' : null;

/**
 * Decisions that wait on the caller outside the submission queue: each has its own approval in its module (leave and
 * overtime under Staff, a salary run under Payroll, a voucher in the Books, an outward letter's signature under
 * Correspondence, a project budget's version on its Budget tab). The Approvals inbox lists them so one page holds everything waiting on someone; deciding opens the
 * module's own page.
 */
export const OTHER_DECISION_KINDS = ['LEAVE', 'OVERTIME', 'CORRECTION', 'PAYROLL_RUN', 'VOUCHER', 'LETTER', 'BUDGET'] as const;
export type OtherDecisionKind = (typeof OTHER_DECISION_KINDS)[number];
export const OTHER_DECISION_LABELS: Record<OtherDecisionKind, string> = {
  LEAVE: 'Leave',
  OVERTIME: 'Overtime',
  CORRECTION: 'Attendance corrections',
  PAYROLL_RUN: 'Salary runs',
  VOUCHER: 'Vouchers',
  LETTER: 'Letters to sign',
  BUDGET: 'Budgets',
};

export interface OtherDecisionDto {
  id: string;
  /** e.g. "Arun Sharma · Casual leave", "PR-2026-10-01 · October 2026" */
  title: string;
  /** e.g. "3 Nov to 5 Nov, 3 days" */
  note: string;
  projectName: string | null;
  /** Rupees, where it means something */
  amount: string | null;
  /** YYYY-MM-DD: when it started waiting */
  since: string;
  /** Web path that opens it where it is decided */
  href: string;
}

export interface OtherDecisionGroupDto {
  kind: OtherDecisionKind;
  count: number;
  amount: string | null;
  /** The module's list of these, filtered to what waits on the caller */
  href: string;
  /** Oldest first, at most ten */
  items: OtherDecisionDto[];
}
