import type { RoleKey, SubmissionStatus } from './enums';

/**
 * Roles that see every project in the organisation without being a project member. The document controller keeps the
 * company's letters, in and out, for every project (Correspondence, item 136).
 */
export const COMPANY_WIDE_ROLES: RoleKey[] = [
  'ADMIN',
  'MANAGEMENT',
  'PROCUREMENT_MANAGER',
  'ACCOUNTS_MANAGER',
  'HR_MANAGER',
  'DOCUMENT_CONTROLLER',
];

/**
 * Guests from outside the company. The client's engineer and the consultant (PMC) only use the client portal, on
 * projects they are a member of, and see approved work only. A supplier or subcontractor (v6 item 105) only uses the
 * supplier portal, for the vendor their login belongs to. The API refuses every other route for a guest.
 */
export const CLIENT_GUEST_ROLES: RoleKey[] = ['CLIENT_ENGINEER', 'CONSULTANT'];
export const GUEST_ROLES: RoleKey[] = [...CLIENT_GUEST_ROLES, 'SUPPLIER'];
export const isGuest = (role: RoleKey) => GUEST_ROLES.includes(role);
export const isClientGuest = (role: RoleKey) => CLIENT_GUEST_ROLES.includes(role);
export const isSupplier = (role: RoleKey) => role === 'SUPPLIER';

/** Roles allowed to approve / reject site submissions (within their accessible projects). */
export const APPROVER_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER'];

export const PROJECT_EDITOR_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER', 'QUANTITY_SURVEYOR'];
// The QS keeps the BOQ and plan, not the project or its team.
export const PROJECT_ADMIN_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER'];
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

/**
 * Record a site order from the paper book and answer site orders with the compliance (item 172): the site staff, QA/QC,
 * the QS and approvers. Anyone with project access reads the book; the client's engineer and the consultant write in it
 * from the portal.
 */
export const SITE_ORDER_ROLES: RoleKey[] = ['TEAM_LEADER', 'SITE_ENGINEER', 'QA_QC_ENGINEER', 'QUANTITY_SURVEYOR', 'ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER'];
/** Programme and EOT (item 173): who sends programme revisions and records the Engineer's answer from a letter. */
export const PROGRAMME_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER', 'TEAM_LEADER'];
/** Who applies for an extension of time and records the authority's decision: the contract's own people. */
export const EOT_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER'];

/** Keep the document register: add drawings and revisions, send transmittals. Everyone on a project reads it. */
export const DOCUMENT_CONTROL_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER', 'QUANTITY_SURVEYOR', 'QA_QC_ENGINEER', 'DOCUMENT_CONTROLLER'];

/** Keep the staff master and holidays, see every employee, decide anyone's leave. */
export const STAFF_ADMIN_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'HR_MANAGER'];

/** Monthly payroll inputs (days, leave, overtime per employee) for the payroll provider: staff admins and accounts. */
export const PAYROLL_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'HR_MANAGER', 'ACCOUNTS_MANAGER'];

/** Read and record letters in and out (contractual correspondence) on their projects. */
export const CORRESPONDENCE_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER', 'QUANTITY_SURVEYOR', 'DOCUMENT_CONTROLLER'];
/**
 * Correspondence heads (item 136): every project's letters and head office's, confidential ones included; they keep the
 * numbering series, the templates and the approval rule. The document controller runs the inward (dak) desk.
 */
export const LETTER_HEAD_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'DOCUMENT_CONTROLLER'];
/** Who signs an outward letter, and so approves it before it is numbered: the project manager on their projects, directors anywhere. */
export const LETTER_SIGNATORY_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER'];

export const BILLING_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER', 'QUANTITY_SURVEYOR', 'ACCOUNTS_MANAGER'];

/** Roles that change the client master and a project's contract terms. */
export const CONTRACT_EDITOR_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER', 'ACCOUNTS_MANAGER'];

/** Roles that edit the organisation's activity templates. */
export const TEMPLATE_ADMIN_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT'];

/** Roles allowed to manage users. */
export const USER_ADMIN_ROLES: RoleKey[] = ['ADMIN'];
/** Who sees the first-week setup checklist on the dashboard. */
export const GETTING_STARTED_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT'];
/** Who gets the company's day on the phone's Home (v5 item 96): owners, directors, accounts and project managers. */
export const COMPANY_TODAY_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'ACCOUNTS_MANAGER', 'PROJECT_MANAGER'];

export const isCompanyWide = (role: RoleKey) => COMPANY_WIDE_ROLES.includes(role);
export const isDirector = (role: RoleKey) => role === 'ADMIN' || role === 'MANAGEMENT';
export const canApprove = (role: RoleKey) => APPROVER_ROLES.includes(role);
/** Issue an official progress report to the client (item 174): it takes a revision and is kept as issued. */
export const canIssueOfficialReport = (role: RoleKey) => APPROVER_ROLES.includes(role);
export const canRequestInspection = (role: RoleKey) => INSPECTION_REQUEST_ROLES.includes(role);
export const canKeepSiteOrders = (role: RoleKey) => SITE_ORDER_ROLES.includes(role);
export const canKeepProgramme = (role: RoleKey) => PROGRAMME_ROLES.includes(role);
export const canApplyEot = (role: RoleKey) => EOT_ROLES.includes(role);
/** The project's Programme and EOT tab: the planners and whoever sees the contract terms. */
export const canViewProgramme = (role: RoleKey) => canKeepProgramme(role) || canViewContract(role);
export const canManageChecklists = (role: RoleKey) => CHECKLIST_ADMIN_ROLES.includes(role);
export const canRecordTest = (role: RoleKey) => QUALITY_TEST_ROLES.includes(role);
export const canRaiseNcr = (role: RoleKey) => NCR_ROLES.includes(role);
/** Edit the company's test types and a project's quality plan (item 137): QA/QC and the approvers who keep checklists. */
export const canManageQaPlan = (role: RoleKey) => CHECKLIST_ADMIN_ROLES.includes(role);
/** Plan a pour, ask for its card and record it poured (item 137): whoever requests inspections. */
export const canRecordPour = (role: RoleKey) => INSPECTION_REQUEST_ROLES.includes(role);
/** Check material received on a GRN and accept or reject it: QA/QC and the approvers (as for NCRs). */
export const canCheckGrn = (role: RoleKey) => NCR_ROLES.includes(role);
export const canManageDocuments = (role: RoleKey) => DOCUMENT_CONTROL_ROLES.includes(role);
export const canViewLetters = (role: RoleKey) => CORRESPONDENCE_ROLES.includes(role);
/** Every letter, head office's and confidential ones too; keeps series, templates and the approval rule. */
export const canHeadLetters = (role: RoleKey) => LETTER_HEAD_ROLES.includes(role);
export const canSignLetters = (role: RoleKey) => LETTER_SIGNATORY_ROLES.includes(role);
/** Change, resolve or delete a mark on a drawing (item 109): whoever made it, and document control. Anyone on the project adds one. */
export const canEditMarkup = (role: RoleKey, mine: boolean) => mine || canManageDocuments(role);
/** Who sees the company's WhatsApp and SMS log. */
export const MESSAGE_LOG_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT'];
export const canViewMessageLog = (role: RoleKey) => MESSAGE_LOG_ROLES.includes(role);
export const canManageStaff = (role: RoleKey) => STAFF_ADMIN_ROLES.includes(role);
export const canViewPayroll = (role: RoleKey) => PAYROLL_ROLES.includes(role);
/** HR records (v6 item 99): an employee's personal, statutory and bank details and service history. Staff admins and payroll see
 *  everyone's; each person sees their own (checked by the API). Site managers who mark the register see the job details only. */
export const canViewEmployeePrivate = (role: RoleKey) => PAYROLL_ROLES.includes(role);
/** Biometric devices (v6 item 101): register them, match their user numbers and import punch files: staff admins. */
export const canManageBiometric = (role: RoleKey) => STAFF_ADMIN_ROLES.includes(role);
export const canRunPayroll = (role: RoleKey) => role === 'ADMIN' || role === 'HR_MANAGER';
export const canApprovePayroll = (role: RoleKey) => role === 'ADMIN' || role === 'MANAGEMENT';
export const canPayPayroll = (role: RoleKey) => role === 'ADMIN' || role === 'ACCOUNTS_MANAGER';
/** The monthly labour contractor summary: payroll roles and those who see project cost. */
export const canViewLabourSummary = (role: RoleKey) => PAYROLL_ROLES.includes(role) || COST_VIEW_ROLES.includes(role);
/** See the staff posted at their projects and mark their attendance: staff admins and attendance recorders. */
export const canMarkStaff = (role: RoleKey) => STAFF_ADMIN_ROLES.includes(role) || ATTENDANCE_RECORDER_ROLES.includes(role);
export const canEditProjects = (role: RoleKey) => PROJECT_EDITOR_ROLES.includes(role);
export const canManageProjects = (role: RoleKey) => PROJECT_ADMIN_ROLES.includes(role);
export const canFreezeBaseline = (role: RoleKey) => BASELINE_ROLES.includes(role);
export const canManageUsers = (role: RoleKey) => USER_ADMIN_ROLES.includes(role);
/** Export all the company's data, or ask for the company to be deleted: admins only. */
export const canManageCompanyData = (role: RoleKey) => role === 'ADMIN';
/** See and pay for the company's subscription: admins only. */
export const canManageBilling = (role: RoleKey) => role === 'ADMIN';
/** Changing or deleting a view someone else shared with the company (owners always can). */
export const canManageSharedViews = (role: RoleKey) => role === 'ADMIN';
// Authors can always remove their own.
export const canRemoveAnyComment = (role: RoleKey) => role === 'ADMIN';
export const canMakeGroup = (role: RoleKey) => role === 'ADMIN';
export const seesGettingStarted = (role: RoleKey) => GETTING_STARTED_ROLES.includes(role);
export const seesCompanyToday = (role: RoleKey) => COMPANY_TODAY_ROLES.includes(role);
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
/** See the central stores page (v6 item 106): store managers, buyers, accounts and approvers. A store's keepers are its members; a site sees store stock on its material requests. */
export const canSeeStores = (role: RoleKey) => role === 'STORE_MANAGER' || role === 'PROCUREMENT_MANAGER' || role === 'ACCOUNTS_MANAGER' || canApprove(role);
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
/** Issue fuel from the store into a machine (v5 item 93): whoever issues material. */
export const canIssueFuel = (role: RoleKey) => canKeepStock(role);
/** Record the tyres and batteries fitted to a machine: whoever closes job cards. */
export const canRecordEquipmentParts = (role: RoleKey) => canManageMaintenance(role);

/** File site expenses. */
export const canSubmitExpense = (role: RoleKey) => EXPENSE_SUBMITTER_ROLES.includes(role);

/** See the project cost view. */
export const canViewCost = (role: RoleKey) => COST_VIEW_ROLES.includes(role);
/** Set labour daily rates. */
export const canSetLabourRates = (role: RoleKey) => LABOUR_RATE_ROLES.includes(role);
/** Set a project's cost budget and the budget rates of its BOQ items. */
export const BUDGET_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER'];
export const canSetBudget = (role: RoleKey) => BUDGET_ROLES.includes(role);

/** Set material norms for reconciliation (quantity of an item per unit of a BOQ item): the QS and the project's managers. */
export const MATERIAL_NORM_ROLES: RoleKey[] = ['QUANTITY_SURVEYOR', 'ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER'];
export const canSetMaterialNorms = (role: RoleKey) => MATERIAL_NORM_ROLES.includes(role);
/** See material reconciliation (theoretical against issued): norm setters, stores, procurement and accounts. Values need canViewCost. */
export const RECONCILIATION_VIEW_ROLES: RoleKey[] = [...MATERIAL_NORM_ROLES, 'STORE_MANAGER', 'SITE_ENGINEER', 'PROCUREMENT_MANAGER', 'ACCOUNTS_MANAGER'];
export const canViewReconciliation = (role: RoleKey) => RECONCILIATION_VIEW_ROLES.includes(role);
/** Rate analysis (labour and machine hours per BOQ unit) is set by the same people as the material norms. */
export const canSetRateAnalysis = canSetMaterialNorms;
/** The estimate (built-up rates against the BOQ rate) is about cost: norm setters who see cost. */
export const canViewEstimate = (role: RoleKey) => canViewReconciliation(role) && canViewCost(role);
/** Take material used beyond the norm off a subcontractor's next bill: whoever prepares their bills and sees the reconciliation. */
export const canRecoverExcessMaterial = (role: RoleKey) => canPrepareSubcontractBill(role) && canViewReconciliation(role) && canViewCost(role);

/** Report an incident or near miss, record a toolbox talk, request a permit to work. */
export const canReportSafety = (role: RoleKey) => SAFETY_REPORTER_ROLES.includes(role);
/** Issue / reject permits, close incidents. */
export const canManageSafety = (role: RoleKey) => SAFETY_MANAGER_ROLES.includes(role);
/** Hand PPE to workers and take it back: the safety officer, stores, site staff and approvers. Anyone who reports safety reads the register. */
export const PPE_ISSUER_ROLES: RoleKey[] = ['SAFETY_OFFICER', 'STORE_MANAGER', 'SITE_ENGINEER', 'TEAM_LEADER', 'ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER'];
export const canIssuePpe = (role: RoleKey) => PPE_ISSUER_ROLES.includes(role);
/** Raise RFIs and record answers received by letter or mail: site and office engineers and approvers. Anyone on the project reads them. */
export const RFI_RAISER_ROLES: RoleKey[] = ['SITE_ENGINEER', 'TEAM_LEADER', 'QUANTITY_SURVEYOR', 'QA_QC_ENGINEER', 'ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER'];
export const canRaiseRfi = (role: RoleKey) => RFI_RAISER_ROLES.includes(role);
/** Change a safety record: whoever entered it, the safety officer and approvers. */
export const canEditSafetyRecord = (user: SubmissionActor, byId: string): boolean => byId === user.id || canManageSafety(user.roleKey);

/** Raise a delay or risk. */
export const canRaiseRisk = (role: RoleKey) => RISK_RAISER_ROLES.includes(role);
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
/**
 * Ask for a bill to be paid or an advance released (v5 item 90): those who record bills and orders, and project
 * managers. The same roles see the requests.
 */
export const PAYMENT_REQUEST_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER', 'ACCOUNTS_MANAGER', 'PROCUREMENT_MANAGER', 'QUANTITY_SURVEYOR'];
export const canRequestPayment = (role: RoleKey) => PAYMENT_REQUEST_ROLES.includes(role);
export const canViewPaymentRequests = (role: RoleKey) => PAYMENT_REQUEST_ROLES.includes(role);
/**
 * Ask head office for money for a site (v6 item 107): anyone who pays site expenses (who may hold an imprest). Those
 * outside the payment request roles see only fund requests.
 */
export const FUND_REQUEST_ROLES: RoleKey[] = EXPENSE_SUBMITTER_ROLES;
export const canRequestFunds = (role: RoleKey) => FUND_REQUEST_ROLES.includes(role);
/** Release an approved fund request into the site's imprest: those who pay top-ups. */
export const canReleaseFunds = (role: RoleKey) => IMPREST_ADMIN_ROLES.includes(role);
/**
 * Raise or cancel a debit note against an approved vendor or subcontract bill (v5 item 91): those who record vendor
 * bills. Those who see payables see the notes.
 */
export const canRaiseDebitNote = (role: RoleKey) => VENDOR_BILL_ROLES.includes(role);
export const canViewDebitNotes = (role: RoleKey) => VENDOR_BILL_ROLES.includes(role) || role === 'PROJECT_MANAGER';
/** Export vouchers to Tally and set the ledger names: those who keep the books. */
export const TALLY_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'ACCOUNTS_MANAGER'];
export const canExportTally = (role: RoleKey) => TALLY_ROLES.includes(role);
/** See the GST registers (outward supplies and input tax): those who keep the books. */
export const canViewGstRegisters = (role: RoleKey) => TALLY_ROLES.includes(role);
/** The books (v6 item 102): accounts keep them and make vouchers; management approves what accounts makes by hand. */
export const canKeepBooks = (role: RoleKey) => TALLY_ROLES.includes(role);
export const canApproveVouchers = (role: RoleKey) => role === 'ADMIN' || role === 'MANAGEMENT';
/** Machine finance (v6 item 108): loans on machines, their EMIs and what is owed, kept and seen by those who keep the books. */
export const canManageMachineLoans = (role: RoleKey) => TALLY_ROLES.includes(role);
/** Tender bidding (v6 item 110): head office prices and submits bids (admin, management and the QS); the project managers
 *  who help price them and accounts, who pay the EMD, see the register. */
export const TENDER_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'QUANTITY_SURVEYOR'];
export const canManageTenders = (role: RoleKey) => TENDER_ROLES.includes(role);
export const canViewTenders = (role: RoleKey) => canManageTenders(role) || role === 'PROJECT_MANAGER' || role === 'ACCOUNTS_MANAGER';
/** A won tender becomes a project by those who both price tenders and open projects: admin and management. */
export const canMakeProjectFromTender = (role: RoleKey) => role === 'ADMIN' || role === 'MANAGEMENT';
/** RMC (v6 item 104): quote and take orders from customers (sales), on the plants the caller sees. */
export const RMC_SALES_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER', 'ACCOUNTS_MANAGER'];
export const canSellRmc = (role: RoleKey) => RMC_SALES_ROLES.includes(role);
/** Run the plant: batches and their delivery challans, which issue the materials from the plant's stock (so the stock keepers). */
export const RMC_PLANT_ROLES: RoleKey[] = STOCK_KEEPER_ROLES;
export const canRunRmcPlant = (role: RoleKey) => RMC_PLANT_ROLES.includes(role);
/** Approve a mix design before it is batched: quality, or management. */
export const canApproveMixDesign = (role: RoleKey) => role === 'ADMIN' || role === 'MANAGEMENT' || role === 'QA_QC_ENGINEER';
/** Bill customers for RMC and record what they pay: accounts, management. */
export const canBillRmc = (role: RoleKey) => TALLY_ROLES.includes(role);
/** See the RMC pages at all. */
export const canViewRmc = (role: RoleKey) => canSellRmc(role) || canRunRmcPlant(role) || canBillRmc(role) || canApproveMixDesign(role);
/** Issue work orders to subcontractors and labour contractors. */
export const WORK_ORDER_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER', 'PROCUREMENT_MANAGER', 'QUANTITY_SURVEYOR'];
export const canIssueWorkOrder = (role: RoleKey) => WORK_ORDER_ROLES.includes(role);
/** See work orders: those who issue them, the site (measures their work), the store (issues them material) and accounts. */
export const WORK_ORDER_VIEW_ROLES: RoleKey[] = [...WORK_ORDER_ROLES, 'SITE_ENGINEER', 'STORE_MANAGER', 'ACCOUNTS_MANAGER'];
export const canViewWorkOrders = (role: RoleKey) => WORK_ORDER_VIEW_ROLES.includes(role);
/** Subcontract enquiries (v6 item 111): those who issue work orders ask for quotes and award them; quotes stay with them. */
export const canRunSubcontractEnquiries = (role: RoleKey) => canIssueWorkOrder(role);
/** Meetings (v6 item 112): anyone on a project reads its minutes and the actions; these roles record meetings. */
export const MEETING_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER', 'TEAM_LEADER', 'SITE_ENGINEER', 'QUANTITY_SURVEYOR', 'QA_QC_ENGINEER', 'SAFETY_OFFICER', 'PROCUREMENT_MANAGER'];
export const canRecordMeetings = (role: RoleKey) => MEETING_ROLES.includes(role);
export const canViewMeetings = (role: RoleKey) => !isGuest(role);
/** Change anyone's minutes, take issued minutes back to draft, and move any action: the managers. */
export const MEETING_MANAGER_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER'];
export const canManageMeetings = (role: RoleKey) => MEETING_MANAGER_ROLES.includes(role);
/** Draft minutes change by whoever recorded them, or a manager. */
export const canEditMeeting = (user: SubmissionActor, createdById: string) => canRecordMeetings(user.roleKey) && (createdById === user.id || canManageMeetings(user.roleKey));
/** An action is closed, dropped, reopened or moved by its owner, whoever recorded its meeting, or a manager. */
export const canUpdateMeetingAction = (user: SubmissionActor, a: { ownerUserId: string | null; meetingCreatedById: string }) =>
  !isGuest(user.roleKey) && (a.ownerUserId === user.id || a.meetingCreatedById === user.id || canManageMeetings(user.roleKey));
/** Material approvals (v6 item 113): the site, quality, purchase and project roles raise, submit and record requests. */
export const MATERIAL_APPROVAL_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER', 'TEAM_LEADER', 'SITE_ENGINEER', 'QA_QC_ENGINEER', 'QUANTITY_SURVEYOR', 'PROCUREMENT_MANAGER'];
export const canRaiseMaterialApprovals = (role: RoleKey) => MATERIAL_APPROVAL_ROLES.includes(role);
/** Anyone on a project but guests reads its requests and approved makes (stores and buyers check makes against them). */
export const canViewMaterialApprovals = (role: RoleKey) => !isGuest(role);
/** Keep a project's approved makes from the contract: project managers, quality and the managers over them. */
export const APPROVED_MAKE_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER', 'QA_QC_ENGINEER'];
export const canManageApprovedMakes = (role: RoleKey) => APPROVED_MAKE_ROLES.includes(role);
/** Prepare subcontractor bills and see the margin per BOQ item: the billing roles. */
export const canPrepareSubcontractBill = (role: RoleKey) => BILLING_ROLES.includes(role);
/** Add and edit vendors: admin, management, project managers, procurement, accounts and stores. */
export const VENDOR_EDITOR_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'PROJECT_MANAGER', 'PROCUREMENT_MANAGER', 'ACCOUNTS_MANAGER', 'STORE_MANAGER'];
export const canEditVendors = (role: RoleKey) => VENDOR_EDITOR_ROLES.includes(role);
/** A vendor's bank account is shown only to those who pay vendors. */
export const VENDOR_BANK_ROLES: RoleKey[] = ['ADMIN', 'MANAGEMENT', 'PROCUREMENT_MANAGER', 'ACCOUNTS_MANAGER'];
export const canSeeVendorBank = (role: RoleKey) => VENDOR_BANK_ROLES.includes(role);
/**
 * The supplier portal (v6 item 105). Those who see a vendor's bank account give its people portal logins and see what
 * they send; those who record vendor bills turn a supplier's invoice into a bill or return it. A change to the vendor's
 * details is approved by the same roles, except a new bank account, which only those who pay vendors approve.
 */
export const canManageSupplierLogins = (role: RoleKey) => VENDOR_BANK_ROLES.includes(role);
export const canCheckSupplierInvoices = (role: RoleKey) => VENDOR_BILL_ROLES.includes(role);
export const canApproveSupplierChange = (role: RoleKey, bank: boolean) => (bank ? PAYMENT_ROLES.includes(role) : VENDOR_BANK_ROLES.includes(role));
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
/**
 * EPC (item 130): engineering deliverables are kept by document control; equipment packages by procurement and the
 * project's managers. Everyone else on the project reads both, without the packages' values unless they see orders.
 */
export const canManageDeliverables = (role: RoleKey) => DOCUMENT_CONTROL_ROLES.includes(role);
export const canManagePackages = (role: RoleKey) => PURCHASE_ROLES.includes(role);
export const canViewEpc = (role: RoleKey) => !isGuest(role);

/**
 * O&M (item 131): the contract's terms by the project's managers; the daily service levels by the site and the lab; staff
 * deployed by HR and the managers; the O&M bills by whoever prepares RA bills. Everyone but guests reads.
 */
export const canViewOm = (role: RoleKey) => !isGuest(role);
export const canManageOm = (role: RoleKey) => APPROVER_ROLES.includes(role);
export const OM_LOG_ROLES: RoleKey[] = [...DPR_SUBMITTER_ROLES, 'QA_QC_ENGINEER', ...APPROVER_ROLES];
export const canLogServiceLevels = (role: RoleKey) => OM_LOG_ROLES.includes(role);
export const canRecordOmStaff = (role: RoleKey) => role === 'HR_MANAGER' || APPROVER_ROLES.includes(role);
/** Record measurements (MB). */
export const canMeasure = (role: RoleKey) => MEASUREMENT_ROLES.includes(role);

/**
 * Attendance first (finding 7 of the October review): a day's head counts and roll call stay open after its DPR is
 * approved, since the site often records the DPR first, and lock once payroll for their month is approved. Pass the
 * status of the payroll run for the month that covers the project (its own run, or the company's), null when there is none.
 */
export const isAttendanceLocked = (payrollStatus: string | null | undefined): boolean => payrollStatus === 'APPROVED' || payrollStatus === 'PAID';

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
