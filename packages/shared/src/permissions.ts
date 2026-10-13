import type { RoleKey, SubmissionStatus } from './enums';

/** Roles that see every project in the organisation without being a project member. */
export const COMPANY_WIDE_ROLES: RoleKey[] = [
  'ADMIN',
  'MANAGEMENT',
  'PROCUREMENT_MANAGER',
  'ACCOUNTS_MANAGER',
  'HR_MANAGER',
];

/** Roles allowed to approve / reject site submissions (within their accessible projects). */
export const APPROVER_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER'];

/** Roles allowed to create and edit projects, BOQ and activities. */
export const PROJECT_EDITOR_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER', 'QUANTITY_SURVEYOR'];

/** Site roles expected to file the daily progress report; they receive the "DPR not submitted" reminder. */
export const DPR_SUBMITTER_ROLES: RoleKey[] = ['SITE_ENGINEER', 'TEAM_LEADER'];

/** Roles that record daily attendance (site supervisors and engineers) and the approvers who may correct it. */
export const ATTENDANCE_RECORDER_ROLES: RoleKey[] = ['TEAM_LEADER', 'SITE_ENGINEER', 'ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER'];

/** Roles that receive material (GRN) and issue it at site. Adjustments, deletions and the item master need an approver. */
export const STOCK_KEEPER_ROLES: RoleKey[] = ['STORE_MANAGER', 'SITE_ENGINEER', 'ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER'];

/** Roles that log a machine's day (hours, idle, breakdown, diesel). Approvers review the logs. */
export const MACHINERY_LOGGER_ROLES: RoleKey[] = ['TEAM_LEADER', 'SITE_ENGINEER', 'STORE_MANAGER', 'ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER'];

/** Roles allowed to manage users. */
export const USER_ADMIN_ROLES: RoleKey[] = ['ADMIN'];

export const isCompanyWide = (role: RoleKey) => COMPANY_WIDE_ROLES.includes(role);
export const canApprove = (role: RoleKey) => APPROVER_ROLES.includes(role);
export const canEditProjects = (role: RoleKey) => PROJECT_EDITOR_ROLES.includes(role);
export const canManageUsers = (role: RoleKey) => USER_ADMIN_ROLES.includes(role);
export const submitsDpr = (role: RoleKey) => DPR_SUBMITTER_ROLES.includes(role);
export const canRecordAttendance = (role: RoleKey) => ATTENDANCE_RECORDER_ROLES.includes(role);
/** Record goods received and material issued. */
export const canKeepStock = (role: RoleKey) => STOCK_KEEPER_ROLES.includes(role);
/** Store master data (item master, minimum stock levels): the store manager and approvers. */
export const canManageStore = (role: RoleKey) => role === 'STORE_MANAGER' || canApprove(role);
/** Adjust stock (opening balance, count correction), delete stock entries and edit the item master: approvers only. */
export const canAdjustStock = (role: RoleKey) => canApprove(role);

/** File machinery logs. */
export const canLogMachinery = (role: RoleKey) => MACHINERY_LOGGER_ROLES.includes(role);
/** Equipment master (codes, ownership, hire rates, deployment): approvers only, since rates are commercial. */
export const canManageEquipment = (role: RoleKey) => canApprove(role);

/**
 * Attendance feeds the day's DPR manpower, so a sheet stays editable until that DPR is approved.
 * Pass the status of the project's DPR for the same date (null when there is none).
 */
export const isAttendanceLocked = (dprStatus: SubmissionStatus | null | undefined): boolean => dprStatus === 'APPROVED';

/* ---------- submission editing ---------- */

export interface SubmissionActor {
  id: string;
  roleKey: RoleKey;
}

export interface SubmissionRef {
  status: SubmissionStatus;
  submittedById: string;
}

/** Statuses from which a submission can be (re)submitted for approval. */
export const RESUBMITTABLE_STATUSES: SubmissionStatus[] = ['DRAFT', 'REJECTED', 'CHANGES_REQUESTED'];

/**
 * Can this user change the content of a submission?
 * The author may edit while it is a draft or has come back as rejected / changes requested.
 * Approvers may edit anything that is not yet approved (e.g. to fix a typo before approving).
 */
export const canEditSubmission = (user: SubmissionActor, s: SubmissionRef): boolean => {
  if (s.status === 'APPROVED') return false;
  if (canApprove(user.roleKey)) return true;
  return s.submittedById === user.id && RESUBMITTABLE_STATUSES.includes(s.status);
};

/** Can this user send the submission (back) to the approval queue? Author or an approver, from a resubmittable status. */
export const canResubmit = (user: SubmissionActor, s: SubmissionRef): boolean =>
  RESUBMITTABLE_STATUSES.includes(s.status) && (s.submittedById === user.id || canApprove(user.roleKey));
