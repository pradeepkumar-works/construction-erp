/** String-literal unions that mirror the Prisma enums in apps/api. Keep both in sync. */

export const PROJECT_TYPES = ['ROAD', 'BUILDING', 'WATER_SUPPLY'] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const PROJECT_STATUSES = ['PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CLOSED'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const SUBMISSION_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED'] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const REVIEW_DECISIONS = ['APPROVE', 'REJECT', 'REQUEST_CHANGES'] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export const MATERIAL_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type MaterialPriority = (typeof MATERIAL_PRIORITIES)[number];

export const SUBMISSION_TYPES = ['PROGRESS', 'DPR', 'MATERIAL_REQUEST', 'MACHINERY', 'EXPENSE', 'MEASUREMENT', 'BILL', 'PURCHASE_ORDER', 'VENDOR_BILL'] as const;
export type SubmissionType = (typeof SUBMISSION_TYPES)[number];

export const ROLE_KEYS = [
  'ADMIN',
  'MANAGEMENT',
  'PROJECT_MANAGER',
  'TEAM_LEADER',
  'SITE_ENGINEER',
  'STORE_MANAGER',
  'QUANTITY_SURVEYOR',
  'PROCUREMENT_MANAGER',
  'QA_QC_ENGINEER',
  'ACCOUNTS_MANAGER',
  'HR_MANAGER',
] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const WEATHER_OPTIONS = ['SUNNY', 'CLOUDY', 'RAINY', 'WINDY', 'HOT'] as const;
export type Weather = (typeof WEATHER_OPTIONS)[number];

export const NOTIFICATION_TYPES = [
  'SUBMISSION_SUBMITTED',
  'SUBMISSION_APPROVED',
  'SUBMISSION_REJECTED',
  'SUBMISSION_CHANGES_REQUESTED',
  'DPR_REMINDER',
  'APPROVAL_DIGEST',
  'LOW_STOCK',
  'RISK_RAISED',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const PUSH_PLATFORMS = ['IOS', 'ANDROID', 'WEB'] as const;
export type PushPlatform = (typeof PUSH_PLATFORMS)[number];

/** RECEIPT = GRN against an approved material request, ISSUE = handed out at site, ADJUSTMENT = opening stock or count correction. */
export const STOCK_ENTRY_TYPES = ['RECEIPT', 'ISSUE', 'ADJUSTMENT'] as const;
export type StockEntryType = (typeof STOCK_ENTRY_TYPES)[number];

export const EQUIPMENT_OWNERSHIPS = ['OWNED', 'HIRED'] as const;
export type EquipmentOwnership = (typeof EQUIPMENT_OWNERSHIPS)[number];

/** What an equipment rate is quoted per. */
export const EQUIPMENT_RATE_UNITS = ['HOUR', 'DAY', 'MONTH'] as const;
export type EquipmentRateUnit = (typeof EQUIPMENT_RATE_UNITS)[number];

export const EXPENSE_CATEGORIES = ['FUEL', 'TRANSPORT', 'REPAIRS', 'MATERIAL_LOCAL', 'LABOUR', 'FOOD_WELFARE', 'TRAVEL', 'RENT_UTILITIES', 'OFFICE', 'SAFETY', 'OTHER'] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const PAYMENT_MODES = ['CASH', 'UPI', 'BANK', 'CARD', 'CREDIT'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

/** DELAY = something that has held up work (days lost, who caused it); RISK = something that might. */
export const RISK_KINDS = ['DELAY', 'RISK'] as const;
export type RiskKind = (typeof RISK_KINDS)[number];

export const RISK_CATEGORIES = ['LAND', 'DESIGN', 'CLIENT', 'MATERIAL', 'LABOUR', 'EQUIPMENT', 'WEATHER', 'FINANCE', 'STATUTORY', 'SAFETY', 'UTILITY', 'OTHER'] as const;
export type RiskCategory = (typeof RISK_CATEGORIES)[number];

export const RISK_STATUSES = ['OPEN', 'MONITORING', 'CLOSED'] as const;
export type RiskStatus = (typeof RISK_STATUSES)[number];

/** Who a delay is attributable to, which decides whether an extension of time can be claimed. */
export const DELAY_PARTIES = ['CLIENT', 'CONTRACTOR', 'THIRD_PARTY', 'FORCE_MAJEURE'] as const;
export type DelayParty = (typeof DELAY_PARTIES)[number];

/** Why a set-password link was made: an invited user's first password, or a forgotten one. */
export const PASSWORD_TOKEN_PURPOSES = ['INVITE', 'RESET'] as const;
export type PasswordTokenPurpose = (typeof PASSWORD_TOKEN_PURPOSES)[number];

/** Where an approved RA bill is with the client. */
export const BILL_STAGES = ['NOT_SENT', 'SENT', 'CERTIFIED', 'PAID'] as const;
export type BillStage = (typeof BILL_STAGES)[number];

/** What a receipt from the client is for: a bill, or the release of retention or security deposit it held. */
export const RECEIPT_KINDS = ['BILL', 'RETENTION_RELEASE', 'DEPOSIT_RELEASE'] as const;
export type ReceiptKind = (typeof RECEIPT_KINDS)[number];
/** How a client pays: the payment modes that make sense for money coming in. */
export const VENDOR_KINDS = ['SUPPLIER', 'HIRE_AGENCY', 'SUBCONTRACTOR', 'LABOUR_CONTRACTOR', 'SERVICE'] as const;
export type VendorKind = (typeof VENDOR_KINDS)[number];

export const MSME_CATEGORIES = ['MICRO', 'SMALL', 'MEDIUM'] as const;
export type MsmeCategory = (typeof MSME_CATEGORIES)[number];

export const RECEIPT_MODES = ['BANK', 'UPI', 'CASH'] as const satisfies readonly PaymentMode[];
