import type { ImprestEntryKind, ImprestEntryStatus, WorkerIdType, WorkerSkill, EquipmentDocType, MaintenanceKind, MaintenanceStatus, BillStage, ReceiptKind, VendorKind, MsmeCategory, EquipmentOwnership, ExpenseCategory, PaymentMode, EquipmentRateUnit, MaterialPriority, NotificationType, ProjectStatus, ProjectType, DelayParty, PasswordTokenPurpose, RiskCategory, RiskKind, RiskStatus, RoleKey, SafetyIncidentStatus, SafetyIncidentType, StockEntryType, SubmissionStatus, SubmissionType, Weather, WorkPermitStatus, WorkPermitType } from './enums';

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  ROAD: 'Road / Infrastructure',
  BUILDING: 'Building',
  WATER_SUPPLY: 'Water Supply',
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  PLANNED: 'Planned',
  ACTIVE: 'Active',
  ON_HOLD: 'On Hold',
  COMPLETED: 'Completed',
  CLOSED: 'Closed',
};

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Pending Approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CHANGES_REQUESTED: 'Changes Requested',
};

export const SUBMISSION_TYPE_LABELS: Record<SubmissionType, string> = {
  PROGRESS: 'Daily Progress',
  DPR: 'Daily Progress Report',
  MATERIAL_REQUEST: 'Material Request',
  MACHINERY: 'Machinery Log',
  EXPENSE: 'Site Expense',
  MEASUREMENT: 'Measurement (MB)',
  BILL: 'RA Bill',
  PURCHASE_ORDER: 'Purchase Order',
  VENDOR_BILL: 'Vendor Bill',
  WORK_ORDER: 'Work Order',
  SUBCONTRACT_BILL: 'Subcontractor Bill',
  INSPECTION: 'Inspection',
};

export const MATERIAL_PRIORITY_LABELS: Record<MaterialPriority, string> = {
  LOW: 'Low',
  NORMAL: 'Normal',
  HIGH: 'High',
  URGENT: 'Urgent',
};

export const ROLE_LABELS: Record<RoleKey, string> = {
  ADMIN: 'Admin',
  MANAGEMENT: 'Management',
  PROJECT_MANAGER: 'Project Manager',
  TEAM_LEADER: 'Team Leader / Site Supervisor',
  SITE_ENGINEER: 'Site Engineer',
  STORE_MANAGER: 'Store Manager',
  QUANTITY_SURVEYOR: 'Quantity Surveyor',
  PROCUREMENT_MANAGER: 'Procurement Manager',
  QA_QC_ENGINEER: 'QA/QC Engineer',
  SAFETY_OFFICER: 'Safety Officer',
  ACCOUNTS_MANAGER: 'Accounts Manager',
  HR_MANAGER: 'HR Manager',
  CLIENT_ENGINEER: "Client's Engineer (guest)",
  CONSULTANT: 'Consultant / PMC (guest)',
};

export const WEATHER_LABELS: Record<Weather, string> = {
  SUNNY: 'Sunny',
  CLOUDY: 'Cloudy',
  RAINY: 'Rainy',
  WINDY: 'Windy',
  HOT: 'Hot',
};

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  SUBMISSION_SUBMITTED: 'Awaiting approval',
  SUBMISSION_APPROVED: 'Approved',
  SUBMISSION_REJECTED: 'Rejected',
  SUBMISSION_CHANGES_REQUESTED: 'Changes requested',
  DPR_REMINDER: 'DPR reminder',
  APPROVAL_DIGEST: 'Pending approvals',
  LOW_STOCK: 'Low stock',
  RISK_RAISED: 'Delay / risk raised',
  TEST_DUE: 'Test due',
  TEST_FAILED: 'Test failed',
  NCR: 'Non-conformance',
  DOCUMENT_ISSUED: 'Drawing issued',
  LEAVE: 'Leave',
  BILLS_DUE: 'Payments due',
  PORTAL: 'Client portal',
  SAFETY: 'Safety',
  MACHINERY: 'Machinery',
  IMPREST: 'Site imprest',
};

export const STOCK_ENTRY_TYPE_LABELS: Record<StockEntryType, string> = {
  RECEIPT: 'Receipt (GRN)',
  ISSUE: 'Issue',
  ADJUSTMENT: 'Adjustment',
  TRANSFER_OUT: 'Transfer out',
  TRANSFER_IN: 'Transfer in',
  RETURN_TO_VENDOR: 'Return to supplier',
  RETURN_FROM_SITE: 'Return from site',
};

/** Common units used in BOQ / activities. Free text is still allowed. */
export const COMMON_UNITS = ['Cum', 'Sqm', 'Rmt', 'MT', 'Nos', 'Kg', 'Ltr', 'LS', 'Km', '%'];

/** Manpower categories used in DPR manpower summary. */
export const MANPOWER_CATEGORIES = ['Mason', 'Carpenter', 'Bar Bender', 'Helper', 'Operator', 'Driver', 'Electrician', 'Plumber', 'Supervisor', 'Other'];

/** Contractor name for the company's own (departmental) workers on an attendance sheet. */
export const DEPARTMENTAL_CONTRACTOR = 'Departmental';

export const EQUIPMENT_OWNERSHIP_LABELS: Record<EquipmentOwnership, string> = {
  OWNED: 'Owned',
  HIRED: 'Hired',
};

export const EQUIPMENT_RATE_UNIT_LABELS: Record<EquipmentRateUnit, string> = {
  HOUR: 'per hour',
  DAY: 'per day',
  MONTH: 'per month',
};

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  FUEL: 'Fuel',
  TRANSPORT: 'Transport / hiring',
  REPAIRS: 'Repairs & maintenance',
  MATERIAL_LOCAL: 'Local material purchase',
  LABOUR: 'Labour payment',
  FOOD_WELFARE: 'Food & welfare',
  TRAVEL: 'Travel',
  RENT_UTILITIES: 'Rent & utilities',
  OFFICE: 'Site office',
  SAFETY: 'Safety items',
  OTHER: 'Other',
};

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  CASH: 'Cash (petty cash)',
  UPI: 'UPI',
  BANK: 'Bank transfer',
  CARD: 'Card',
  CREDIT: 'On credit (to be paid)',
};

export const RISK_KIND_LABELS: Record<RiskKind, string> = {
  DELAY: 'Delay',
  RISK: 'Risk',
};

export const RISK_CATEGORY_LABELS: Record<RiskCategory, string> = {
  LAND: 'Land / right of way',
  DESIGN: 'Drawings & design',
  CLIENT: 'Client decisions',
  MATERIAL: 'Material supply',
  LABOUR: 'Labour',
  EQUIPMENT: 'Equipment',
  WEATHER: 'Weather',
  FINANCE: 'Payments & finance',
  STATUTORY: 'Permits & statutory',
  SAFETY: 'Safety',
  UTILITY: 'Utility shifting',
  OTHER: 'Other',
};

export const RISK_STATUS_LABELS: Record<RiskStatus, string> = {
  OPEN: 'Open',
  MONITORING: 'Monitoring',
  CLOSED: 'Closed',
};

export const DELAY_PARTY_LABELS: Record<DelayParty, string> = {
  CLIENT: 'Client',
  CONTRACTOR: 'Contractor (us)',
  THIRD_PARTY: 'Third party',
  FORCE_MAJEURE: 'Force majeure',
};

export const PASSWORD_TOKEN_PURPOSE_LABELS: Record<PasswordTokenPurpose, string> = {
  INVITE: 'Invitation',
  RESET: 'Password reset',
};

export const BILL_STAGE_LABELS: Record<BillStage, string> = {
  NOT_SENT: 'Not sent',
  SENT: 'Sent to client',
  CERTIFIED: 'Certified',
  PAID: 'Paid',
};

export const VENDOR_KIND_LABELS: Record<VendorKind, string> = {
  SUPPLIER: 'Material supplier',
  HIRE_AGENCY: 'Machinery hire',
  SUBCONTRACTOR: 'Subcontractor',
  LABOUR_CONTRACTOR: 'Labour contractor',
  SERVICE: 'Services',
};

export const MSME_CATEGORY_LABELS: Record<MsmeCategory, string> = {
  MICRO: 'Micro',
  SMALL: 'Small',
  MEDIUM: 'Medium',
};

export const RECEIPT_KIND_LABELS: Record<ReceiptKind, string> = {
  BILL: 'Bill payment',
  RETENTION_RELEASE: 'Retention released',
  DEPOSIT_RELEASE: 'Security deposit released',
};

/** Payment modes as they read on a receipt from a client. */
export const RECEIPT_MODE_LABELS: Partial<Record<PaymentMode, string>> = { BANK: 'Bank (RTGS / NEFT / cheque)', UPI: 'UPI', CASH: 'Cash' };

export const SAFETY_INCIDENT_TYPE_LABELS: Record<SafetyIncidentType, string> = {
  NEAR_MISS: 'Near miss',
  FIRST_AID: 'First aid case',
  MEDICAL_TREATMENT: 'Medical treatment',
  LOST_TIME: 'Lost time injury',
  PROPERTY_DAMAGE: 'Property damage',
  FATALITY: 'Fatality',
};

export const SAFETY_INCIDENT_STATUS_LABELS: Record<SafetyIncidentStatus, string> = {
  OPEN: 'Open',
  CLOSED: 'Closed',
};

export const WORK_PERMIT_TYPE_LABELS: Record<WorkPermitType, string> = {
  HOT_WORK: 'Hot work (welding, cutting)',
  WORK_AT_HEIGHT: 'Work at height',
  EXCAVATION: 'Excavation / trench',
  CONFINED_SPACE: 'Confined space',
  ELECTRICAL: 'Electrical work',
  LIFTING: 'Crane / heavy lift',
  OTHER: 'Other',
};

export const WORK_PERMIT_STATUS_LABELS: Record<WorkPermitStatus, string> = {
  REQUESTED: 'Requested',
  ISSUED: 'Issued',
  REJECTED: 'Rejected',
  CLOSED: 'Closed',
};

export const MAINTENANCE_KIND_LABELS: Record<MaintenanceKind, string> = {
  SERVICE: 'Service',
  BREAKDOWN: 'Breakdown',
};

export const MAINTENANCE_STATUS_LABELS: Record<MaintenanceStatus, string> = {
  OPEN: 'Open',
  CLOSED: 'Closed',
};

export const EQUIPMENT_DOC_TYPE_LABELS: Record<EquipmentDocType, string> = {
  INSURANCE: 'Insurance',
  FITNESS: 'Fitness certificate',
  PERMIT: 'Permit',
  PUC: 'PUC (pollution)',
  ROAD_TAX: 'Road tax',
  REGISTRATION: 'Registration (RC)',
  OTHER: 'Other',
};

export const WORKER_SKILL_LABELS: Record<WorkerSkill, string> = {
  UNSKILLED: 'Unskilled',
  SEMI_SKILLED: 'Semi-skilled',
  SKILLED: 'Skilled',
  HIGHLY_SKILLED: 'Highly skilled',
};

export const WORKER_ID_TYPE_LABELS: Record<WorkerIdType, string> = {
  AADHAAR: 'Aadhaar',
  VOTER_ID: 'Voter ID',
  DRIVING_LICENCE: 'Driving licence',
  PAN: 'PAN',
  OTHER: 'Other',
};

export const IMPREST_ENTRY_KIND_LABELS: Record<ImprestEntryKind, string> = { ADVANCE: 'Cash advanced', RETURN: 'Cash returned' };
export const IMPREST_ENTRY_STATUS_LABELS: Record<ImprestEntryStatus, string> = { REQUESTED: 'Top-up asked for', PAID: 'Paid', REJECTED: 'Turned down' };
