import type { EquipmentOwnership, ExpenseCategory, PaymentMode, EquipmentRateUnit, MaterialPriority, NotificationType, ProjectStatus, ProjectType, RoleKey, StockEntryType, SubmissionStatus, SubmissionType, Weather } from './enums';

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
