import type { RoleKey, SubmissionStatus } from './enums';

/** Roles that see every project in the organisation without being a project member. */
export const COMPANY_WIDE_ROLES: RoleKey[] = [
  'ADMIN',
  'MANAGEMENT',
  'PROCUREMENT_MANAGER',
  'ACCOUNTS_MANAGER',
  'HR_MANAGER',
];

/**
 * Guests from outside the company: the client's engineer and the consultant (PMC). They only use the client portal,
 * on projects they are a member of, and see approved work only. The API refuses every other route for them.
 */
export const GUEST_ROLES: RoleKey[] = ['CLIENT_ENGINEER', 'CONSULTANT'];
export const isGuest = (role: RoleKey) => GUEST_ROLES.includes(role);

/** Roles allowed to approve / reject site submissions (within their accessible projects). */
export const APPROVER_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER'];

/** Roles allowed to create and edit projects, BOQ and activities. */
export const PROJECT_EDITOR_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER', 'QUANTITY_SURVEYOR'];
/** Freeze a project's schedule baseline: the project's managers, not the planners who keep the plan current. */
export const BASELINE_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER'];

/** Site roles expected to file the daily progress report; they receive the "DPR not submitted" reminder. */
export const DPR_SUBMITTER_ROLES: RoleKey[] = ['SITE_ENGINEER', 'TEAM_LEADER'];

/** Roles that record daily attendance (site supervisors and engineers) and the approvers who may correct it. */
export const ATTENDANCE_RECORDER_ROLES: RoleKey[] = ['TEAM_LEADER', 'SITE_ENGINEER', 'ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER'];

/** Roles that receive material (GRN) and issue it at site. Adjustments, deletions and the item master need an approver. */
export const STOCK_KEEPER_ROLES: RoleKey[] = ['STORE_MANAGER', 'SITE_ENGINEER', 'ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER'];

/** Roles that log a machine's day (hours, idle, breakdown, diesel). Approvers review the logs. */
export const MACHINERY_LOGGER_ROLES: RoleKey[] = ['TEAM_LEADER', 'SITE_ENGINEER', 'STORE_MANAGER', 'ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER'];

/** Roles that file site expenses: site staff, the store manager, accounts and approvers. */
export const EXPENSE_SUBMITTER_ROLES: RoleKey[] = ['TEAM_LEADER', 'SITE_ENGINEER', 'STORE_MANAGER', 'ACCOUNTS_MANAGER', 'ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER'];

/** Roles that record measurement book entries: the QS, site engineers and approvers. */
export const MEASUREMENT_ROLES: RoleKey[] = ['QUANTITY_SURVEYOR', 'SITE_ENGINEER', 'ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER'];

/** Roles that see project cost (rates and margins): approvers and accounts. */
export const COST_VIEW_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER', 'ACCOUNTS_MANAGER'];

/** Roles that set labour daily rates for the organisation. */
export const LABOUR_RATE_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'ACCOUNTS_MANAGER'];

/** Roles that raise delays and risks: site staff, the QS and approvers. Anyone with project access can read the register. */
export const RISK_RAISER_ROLES: RoleKey[] = ['TEAM_LEADER', 'SITE_ENGINEER', 'QUANTITY_SURVEYOR', 'STORE_MANAGER', 'QA_QC_ENGINEER', 'SAFETY_OFFICER', 'ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER'];

/** Report incidents and near misses, record toolbox talks and request permits to work: everyone working at site. Anyone with project access reads them. */
export const SAFETY_REPORTER_ROLES: RoleKey[] = ['TEAM_LEADER', 'SITE_ENGINEER', 'STORE_MANAGER', 'QUANTITY_SURVEYOR', 'QA_QC_ENGINEER', 'SAFETY_OFFICER', 'ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER'];

/** Issue or reject permits, close incidents and delete wrong safety records: the safety officer and approvers. */
export const SAFETY_MANAGER_ROLES: RoleKey[] = ['SAFETY_OFFICER', 'ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER'];

/** Roles that request inspections from site: site staff, QA/QC and approvers. */
export const INSPECTION_REQUEST_ROLES: RoleKey[] = ['TEAM_LEADER', 'SITE_ENGINEER', 'QA_QC_ENGINEER', 'ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER'];

/** Roles that keep the organisation's inspection checklists. */
export const CHECKLIST_ADMIN_ROLES: RoleKey[] = ['QA_QC_ENGINEER', 'ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER'];

/** Roles that record quality tests (samples, specification, readings): as for inspections. */
export const QUALITY_TEST_ROLES: RoleKey[] = INSPECTION_REQUEST_ROLES;

/** Roles that raise and close non-conformance reports: QA/QC and approvers. */
export const NCR_ROLES: RoleKey[] = CHECKLIST_ADMIN_ROLES;

/** Roles that see contract terms and bills: approvers, the QS who prepares bills, and accounts. */
/** Keep the document register: add drawings and revisions, send transmittals. Everyone on a project reads it. */
export const DOCUMENT_CONTROL_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER', 'QUANTITY_SURVEYOR', 'QA_QC_ENGINEER'];

/** Keep the staff master and holidays, see every employee, decide anyone's leave. */
export const STAFF_ADMIN_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'HR_MANAGER'];

/** Monthly payroll inputs (days, leave, overtime per employee) for the payroll provider: staff admins and accounts. */
export const PAYROLL_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'HR_MANAGER', 'ACCOUNTS_MANAGER'];

/** Read and record letters in and out (contractual correspondence). */
export const CORRESPONDENCE_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER', 'QUANTITY_SURVEYOR'];

export const BILLING_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER', 'QUANTITY_SURVEYOR', 'ACCOUNTS_MANAGER'];

/** Roles that change the client master and a project's contract terms. */
export const CONTRACT_EDITOR_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER', 'ACCOUNTS_MANAGER'];

/** Roles that edit the organisation's activity templates. */
export const TEMPLATE_ADMIN_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT'];

/** Roles allowed to manage users. */
export const USER_ADMIN_ROLES: RoleKey[] = ['ADMIN'];
/** Who sees the first-week setup checklist on the dashboard. */
export const GETTING_STARTED_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT'];

export const isCompanyWide = (role: RoleKey) => COMPANY_WIDE_ROLES.includes(role);
export const canApprove = (role: RoleKey) => APPROVER_ROLES.includes(role);
export const canRequestInspection = (role: RoleKey) => INSPECTION_REQUEST_ROLES.includes(role);
export const canManageChecklists = (role: RoleKey) => CHECKLIST_ADMIN_ROLES.includes(role);
export const canRecordTest = (role: RoleKey) => QUALITY_TEST_ROLES.includes(role);
export const canRaiseNcr = (role: RoleKey) => NCR_ROLES.includes(role);
/** Check material received on a GRN and accept or reject it: QA/QC and the approvers (as for NCRs). */
export const canCheckGrn = (role: RoleKey) => NCR_ROLES.includes(role);
export const canManageDocuments = (role: RoleKey) => DOCUMENT_CONTROL_ROLES.includes(role);
export const canViewLetters = (role: RoleKey) => CORRESPONDENCE_ROLES.includes(role);
/** Who sees the company's WhatsApp and SMS log. */
export const MESSAGE_LOG_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT'];
export const canViewMessageLog = (role: RoleKey) => MESSAGE_LOG_ROLES.includes(role);
export const canManageStaff = (role: RoleKey) => STAFF_ADMIN_ROLES.includes(role);
export const canViewPayroll = (role: RoleKey) => PAYROLL_ROLES.includes(role);
/** The monthly labour contractor summary: payroll roles and those who see project cost. */
export const canViewLabourSummary = (role: RoleKey) => PAYROLL_ROLES.includes(role) || COST_VIEW_ROLES.includes(role);
/** See the staff posted at their projects and mark their attendance: staff admins and attendance recorders. */
export const canMarkStaff = (role: RoleKey) => STAFF_ADMIN_ROLES.includes(role) || ATTENDANCE_RECORDER_ROLES.includes(role);
export const canEditProjects = (role: RoleKey) => PROJECT_EDITOR_ROLES.includes(role);
export const canFreezeBaseline = (role: RoleKey) => BASELINE_ROLES.includes(role);
export const canManageUsers = (role: RoleKey) => USER_ADMIN_ROLES.includes(role);
/** Export all the company's data, or ask for the company to be deleted: admins only. */
export const canManageCompanyData = (role: RoleKey) => role === 'ADMIN';
/** See and pay for the company's subscription: admins only. */
export const canManageBilling = (role: RoleKey) => role === 'ADMIN';
export const seesGettingStarted = (role: RoleKey) => GETTING_STARTED_ROLES.includes(role);
export const submitsDpr = (role: RoleKey) => DPR_SUBMITTER_ROLES.includes(role);
export const canRecordAttendance = (role: RoleKey) => ATTENDANCE_RECORDER_ROLES.includes(role);
/** Keep the named worker register and its roll call: the attendance recorders. */
export const canManageWorkers = (role: RoleKey) => ATTENDANCE_RECORDER_ROLES.includes(role);
/** See the worker register, the muster and output per man-day: recorders, quantity surveyors and accounts. */
export const WORKER_VIEW_ROLES: RoleKey[] = [...ATTENDANCE_RECORDER_ROLES, 'QUANTITY_SURVEYOR', 'ACCOUNTS_MANAGER'];
export const canViewWorkers = (role: RoleKey) => WORKER_VIEW_ROLES.includes(role);
/** Open imprests, set the float, pay or turn down top-ups and take back cash: accounts and the company's admins. */
export const IMPREST_ADMIN_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'ACCOUNTS_MANAGER'];
export const canManageImprest = (role: RoleKey) => IMPREST_ADMIN_ROLES.includes(role);
/** Hold an imprest: anyone who pays site expenses. */
export const canHoldImprest = (role: RoleKey) => EXPENSE_SUBMITTER_ROLES.includes(role);
/** Keep the guarantees, insurance and licences register: accounts and the company's admins. */
export const COMPLIANCE_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'ACCOUNTS_MANAGER'];
export const canManageCompliance = (role: RoleKey) => COMPLIANCE_ROLES.includes(role);
/** See the register: its keepers, and project managers for the entries of their projects. */
export const canViewCompliance = (role: RoleKey) => canManageCompliance(role) || role === 'PROJECT_MANAGER';
/** Report snags and defects and mark them fixed: the project's site and office staff. */
export const DEFECT_REPORTER_ROLES: RoleKey[] = ['TEAM_LEADER', 'SITE_ENGINEER', 'QA_QC_ENGINEER', 'QUANTITY_SURVEYOR', 'SAFETY_OFFICER', 'STORE_MANAGER', 'ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER'];
export const canReportDefect = (role: RoleKey) => DEFECT_REPORTER_ROLES.includes(role);
/** Close (accept) or reopen a fixed snag or defect: QA/QC and the approvers. */
export const canCloseDefect = (role: RoleKey) => role === 'QA_QC_ENGINEER' || APPROVER_ROLES.includes(role);
/** Record the completion certificate and keep the close-out checklist: project managers and the company's admins. */
export const canManageHandover = (role: RoleKey) => APPROVER_ROLES.includes(role);
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
/** Report a breakdown from site: the roles that log machinery. Close job cards, keep vehicle papers and drivers: the store manager and approvers. */
export const MAINTENANCE_MANAGER_ROLES: RoleKey[] = ['STORE_MANAGER', ...APPROVER_ROLES];
export const canManageMaintenance = (role: RoleKey) => MAINTENANCE_MANAGER_ROLES.includes(role);

/** File site expenses. */
export const canSubmitExpense = (role: RoleKey) => EXPENSE_SUBMITTER_ROLES.includes(role);

/** See the project cost view. */
export const canViewCost = (role: RoleKey) => COST_VIEW_ROLES.includes(role);
/** Set labour daily rates. */
export const canSetLabourRates = (role: RoleKey) => LABOUR_RATE_ROLES.includes(role);
/** Set a project's cost budget and the budget rates of its BOQ items. */
export const BUDGET_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER'];
export const canSetBudget = (role: RoleKey) => BUDGET_ROLES.includes(role);

/** Report an incident or near miss, record a toolbox talk, request a permit to work. */
export const canReportSafety = (role: RoleKey) => SAFETY_REPORTER_ROLES.includes(role);
/** Issue / reject permits, close incidents. */
export const canManageSafety = (role: RoleKey) => SAFETY_MANAGER_ROLES.includes(role);
/** Change a safety record: whoever entered it, the safety officer and approvers. */
export const canEditSafetyRecord = (user: SubmissionActor, byId: string): boolean => byId === user.id || canManageSafety(user.roleKey);

/** Raise a delay or risk. */
export const canRaiseRisk = (role: RoleKey) => RISK_RAISER_ROLES.includes(role);
/**
 * Edit or close a register entry: approvers, the person who raised it and its owner.
 * Deleting one (a wrong entry, not a closed one) is for approvers only.
 */
/** Record the cause and corrective action of an NCR: the person it is assigned to, site staff and approvers. */
export const canActOnNcr = (user: SubmissionActor, n: { actionById: string | null }): boolean => n.actionById === user.id || INSPECTION_REQUEST_ROLES.includes(user.roleKey);
/** Change or delete a test: whoever recorded it, QA/QC and approvers. */
export const canEditTest = (user: SubmissionActor, t: { createdById: string }): boolean => t.createdById === user.id || NCR_ROLES.includes(user.roleKey);

export const canEditRisk = (user: SubmissionActor, r: { raisedById: string; ownerId: string | null }): boolean =>
  canApprove(user.roleKey) || r.raisedById === user.id || r.ownerId === user.id;

/** See a project's contract terms (retention, advance, deductions) and its bills. */
export const canViewContract = (role: RoleKey) => BILLING_ROLES.includes(role);
/** Record money received from clients: admin, management and accounts. */
export const RECEIPT_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'ACCOUNTS_MANAGER'];
export const canRecordReceipt = (role: RoleKey) => RECEIPT_ROLES.includes(role);
/** Enter vendor quotations and raise purchase orders: procurement and approvers. */
export const PURCHASE_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER', 'PROCUREMENT_MANAGER'];
export const canPurchase = (role: RoleKey) => PURCHASE_ROLES.includes(role);
/** See purchase orders: purchasers, the store (receives against them) and accounts (matches bills). */
export const PO_VIEW_ROLES: RoleKey[] = [...PURCHASE_ROLES, 'STORE_MANAGER', 'ACCOUNTS_MANAGER', 'SITE_ENGINEER'];
export const canViewPurchaseOrders = (role: RoleKey) => PO_VIEW_ROLES.includes(role);
/** Record vendor invoices against purchase orders: accounts, procurement and management. */
export const VENDOR_BILL_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'PROCUREMENT_MANAGER', 'ACCOUNTS_MANAGER'];
export const canRecordVendorBill = (role: RoleKey) => VENDOR_BILL_ROLES.includes(role);
/** See vendor bills: those who record them and project managers. */
export const canViewVendorBills = (role: RoleKey) => VENDOR_BILL_ROLES.includes(role) || role === 'PROJECT_MANAGER';
/** Record payments to vendors and subcontractors: admin, management and accounts. */
export const PAYMENT_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'ACCOUNTS_MANAGER'];
export const canRecordPayment = (role: RoleKey) => PAYMENT_ROLES.includes(role);
/** See payables (what is owed to vendors and subcontractors, and when): those who pay and project managers. */
export const canViewPayables = (role: RoleKey) => PAYMENT_ROLES.includes(role) || role === 'PROJECT_MANAGER';
/** Export vouchers to Tally and set the ledger names: those who keep the books. */
export const TALLY_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'ACCOUNTS_MANAGER'];
export const canExportTally = (role: RoleKey) => TALLY_ROLES.includes(role);
/** See the GST registers (outward supplies and input tax): those who keep the books. */
export const canViewGstRegisters = (role: RoleKey) => TALLY_ROLES.includes(role);
/** Issue work orders to subcontractors and labour contractors. */
export const WORK_ORDER_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER', 'PROCUREMENT_MANAGER', 'QUANTITY_SURVEYOR'];
export const canIssueWorkOrder = (role: RoleKey) => WORK_ORDER_ROLES.includes(role);
/** See work orders: those who issue them, the site (measures their work), the store (issues them material) and accounts. */
export const WORK_ORDER_VIEW_ROLES: RoleKey[] = [...WORK_ORDER_ROLES, 'SITE_ENGINEER', 'STORE_MANAGER', 'ACCOUNTS_MANAGER'];
export const canViewWorkOrders = (role: RoleKey) => WORK_ORDER_VIEW_ROLES.includes(role);
/** Prepare subcontractor bills and see the margin per BOQ item: the billing roles. */
export const canPrepareSubcontractBill = (role: RoleKey) => BILLING_ROLES.includes(role);
/** Add and edit vendors: admin, management, project managers, procurement, accounts and stores. */
export const VENDOR_EDITOR_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER', 'PROCUREMENT_MANAGER', 'ACCOUNTS_MANAGER', 'STORE_MANAGER'];
export const canEditVendors = (role: RoleKey) => VENDOR_EDITOR_ROLES.includes(role);
/** A vendor's bank account is shown only to those who pay vendors. */
export const VENDOR_BANK_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'PROCUREMENT_MANAGER', 'ACCOUNTS_MANAGER'];
export const canSeeVendorBank = (role: RoleKey) => VENDOR_BANK_ROLES.includes(role);
/** Prepare RA bills and record them as sent and certified: the billing roles. */
export const canPrepareBill = (role: RoleKey) => BILLING_ROLES.includes(role);
/** Change the client master and a project's contract terms. */
export const canEditContract = (role: RoleKey) => CONTRACT_EDITOR_ROLES.includes(role);

/** Edit activity templates per project type. */
export const canManageTemplates = (role: RoleKey) => TEMPLATE_ADMIN_ROLES.includes(role);

/** Prepare variations, send them to the client and record the client's decision. Bill viewers (accounts too) can read them. */
export const VARIATION_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER', 'QUANTITY_SURVEYOR'];
export const canManageVariations = (role: RoleKey) => VARIATION_ROLES.includes(role);
export const canViewVariations = (role: RoleKey) => BILLING_ROLES.includes(role);
/** Record measurements (MB). */
export const canMeasure = (role: RoleKey) => MEASUREMENT_ROLES.includes(role);

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
