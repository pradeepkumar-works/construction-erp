import type { BillStage, ReceiptKind, VendorKind, MsmeCategory, EquipmentOwnership, ExpenseCategory, PaymentMode, EquipmentRateUnit, MaterialPriority, NotificationType, ProjectStatus, ProjectType, DelayParty, PasswordTokenPurpose, RiskCategory, RiskKind, RiskStatus, RoleKey, StockEntryType, SubmissionStatus, SubmissionType, Weather } from './enums';

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
  ACCOUNTS_MANAGER: 'Accounts Manager',
  HR_MANAGER: 'HR Manager',
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
};

export const STOCK_ENTRY_TYPE_LABELS: Record<StockEntryType, string> = {
  RECEIPT: 'Receipt (GRN)',
  ISSUE: 'Issue',
  ADJUSTMENT: 'Adjustment',
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
