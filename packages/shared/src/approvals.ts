/**
 * Approval matrix: which roles may approve which submission types, and up to what amount.
 * An organisation without a saved matrix uses the fixed rule (APPROVER_ROLES approve everything, no limit).
 * Admin can always approve everything, so nothing is ever left without an approver.
 */
import { SUBMISSION_TYPES, type RoleKey, type SubmissionType } from './enums';
import { APPROVER_ROLES } from './permissions';

/** One right: approve `type`, up to `maxAmount` rupees (null = no limit). */
export interface ApprovalRightDto {
  type: SubmissionType;
  maxAmount: string | null;
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

/** May this user approve anything at all (shows the approvals queue)? */
export const mayApprove = (user: { roleKey: RoleKey; approvalRights?: ApprovalRightDto[] }): boolean => approvalRightsOf(user).length > 0;

/** May this user approve this type, and (when given) this amount? */
export function mayApproveType(user: { roleKey: RoleKey; approvalRights?: ApprovalRightDto[] }, type: SubmissionType, amount?: string | number | null): boolean {
  const right = approvalRightsOf(user).find((r) => r.type === type);
  if (!right) return false;
  if (right.maxAmount === null || amount === undefined || amount === null || !hasAmount(type)) return true;
  return Number(amount) <= Number(right.maxAmount);
}
