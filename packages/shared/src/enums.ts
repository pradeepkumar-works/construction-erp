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

export const SUBMISSION_TYPES = ['PROGRESS', 'DPR', 'MATERIAL_REQUEST', 'MACHINERY', 'EXPENSE', 'MEASUREMENT', 'BILL', 'PURCHASE_ORDER', 'VENDOR_BILL', 'WORK_ORDER', 'SUBCONTRACT_BILL', 'INSPECTION'] as const;
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
  'SAFETY_OFFICER',
  'ACCOUNTS_MANAGER',
  'HR_MANAGER',
  'CLIENT_ENGINEER',
  'CONSULTANT',
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
  'TEST_DUE',
  'TEST_FAILED',
  'NCR',
  'DOCUMENT_ISSUED',
  'LEAVE',
  'BILLS_DUE',
  'PORTAL',
  'SAFETY',
  'MACHINERY',
  'IMPREST',
  'COMPLIANCE',
  'DEFECT',
  'WATCH_LIST',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const PUSH_PLATFORMS = ['IOS', 'ANDROID', 'WEB'] as const;
export type PushPlatform = (typeof PUSH_PLATFORMS)[number];

/** RECEIPT = GRN against an approved material request, ISSUE = handed out at site, ADJUSTMENT = opening stock or count correction. */
export const STOCK_ENTRY_TYPES = ['RECEIPT', 'ISSUE', 'ADJUSTMENT', 'TRANSFER_OUT', 'TRANSFER_IN', 'RETURN_TO_VENDOR', 'RETURN_FROM_SITE'] as const;
export type StockEntryType = (typeof STOCK_ENTRY_TYPES)[number];
export const GRN_QC_STATUSES = ['ACCEPTED', 'PARTLY_ACCEPTED', 'REJECTED'] as const;
export type GrnQcStatus = (typeof GRN_QC_STATUSES)[number];

/** How a contract's liquidated damages rate is expressed (v4 item 50). */
export const LD_PERIODS = ['DAY', 'WEEK', 'MONTH'] as const;
export type LdPeriod = (typeof LD_PERIODS)[number];

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

/** What happened at site. A near miss hurt no one; the rest are graded by the worst outcome. */
export const SAFETY_INCIDENT_TYPES = ['NEAR_MISS', 'FIRST_AID', 'MEDICAL_TREATMENT', 'LOST_TIME', 'PROPERTY_DAMAGE', 'FATALITY'] as const;
export type SafetyIncidentType = (typeof SAFETY_INCIDENT_TYPES)[number];

export const SAFETY_INCIDENT_STATUSES = ['OPEN', 'CLOSED'] as const;
export type SafetyIncidentStatus = (typeof SAFETY_INCIDENT_STATUSES)[number];

/** Risky work that needs a written permit before it starts. */
export const WORK_PERMIT_TYPES = ['HOT_WORK', 'WORK_AT_HEIGHT', 'EXCAVATION', 'CONFINED_SPACE', 'ELECTRICAL', 'LIFTING', 'OTHER'] as const;
export type WorkPermitType = (typeof WORK_PERMIT_TYPES)[number];

/** REQUESTED by site; ISSUED (work may start) or REJECTED by the safety officer or an approver; CLOSED when the work is done. */
export const WORK_PERMIT_STATUSES = ['REQUESTED', 'ISSUED', 'REJECTED', 'CLOSED'] as const;
export type WorkPermitStatus = (typeof WORK_PERMIT_STATUSES)[number];

/** A scheduled service when it falls due, or a breakdown repair. */
export const MAINTENANCE_KINDS = ['SERVICE', 'BREAKDOWN'] as const;
export type MaintenanceKind = (typeof MAINTENANCE_KINDS)[number];

export const MAINTENANCE_STATUSES = ['OPEN', 'CLOSED'] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];

/** Machine and vehicle papers that expire. */
export const EQUIPMENT_DOC_TYPES = ['INSURANCE', 'FITNESS', 'PERMIT', 'PUC', 'ROAD_TAX', 'REGISTRATION', 'OTHER'] as const;
export type EquipmentDocType = (typeof EQUIPMENT_DOC_TYPES)[number];

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

/** A payment for the Nirmaan subscription (v3 item 34): created with a Razorpay order, paid once Razorpay confirms it. */
export const BILLING_PAYMENT_STATUSES = ['CREATED', 'PAID'] as const;
export type BillingPaymentStatus = (typeof BILLING_PAYMENT_STATUSES)[number];

/** Skill grade of a named worker (minimum-wage schedules use the same four). */
export const WORKER_SKILLS = ['UNSKILLED', 'SEMI_SKILLED', 'SKILLED', 'HIGHLY_SKILLED'] as const;
export type WorkerSkill = (typeof WORKER_SKILLS)[number];

/** Identity document of a named worker; for Aadhaar only the last four digits are kept. */
export const WORKER_ID_TYPES = ['AADHAAR', 'VOTER_ID', 'DRIVING_LICENCE', 'PAN', 'OTHER'] as const;
export type WorkerIdType = (typeof WORKER_ID_TYPES)[number];

/** Site imprest (v4 item 45): cash advanced to the site, or handed back. */
export const IMPREST_ENTRY_KINDS = ['ADVANCE', 'RETURN'] as const;
export type ImprestEntryKind = (typeof IMPREST_ENTRY_KINDS)[number];

/** A top-up asked for, then paid or turned down; returns and direct advances are paid at once. */
export const IMPREST_ENTRY_STATUSES = ['REQUESTED', 'PAID', 'REJECTED'] as const;
export type ImprestEntryStatus = (typeof IMPREST_ENTRY_STATUSES)[number];

/** Guarantees, insurance and licences register (v4 item 46). */
export const COMPLIANCE_DOC_KINDS = ['BANK_GUARANTEE', 'EMD', 'INSURANCE', 'LICENCE'] as const;
export type ComplianceDocKind = (typeof COMPLIANCE_DOC_KINDS)[number];

/** Active until renewed, released (returned, refunded, cancelled, surrendered) or invoked (encashed, forfeited). */
export const COMPLIANCE_DOC_STATUSES = ['ACTIVE', 'RENEWED', 'RELEASED', 'INVOKED'] as const;
export type ComplianceDocStatus = (typeof COMPLIANCE_DOC_STATUSES)[number];

/** Handover and defects (v4 item 47): a snag before handover, or a defect in the defect liability period. */
export const DEFECT_PHASES = ['SNAG', 'DEFECT'] as const;
export type DefectPhase = (typeof DEFECT_PHASES)[number];

export const DEFECT_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type DefectPriority = (typeof DEFECT_PRIORITIES)[number];

/** OPEN, FIXED by the site, CLOSED once checked (or reopened back to OPEN). */
export const DEFECT_STATUSES = ['OPEN', 'FIXED', 'CLOSED'] as const;
export type DefectStatus = (typeof DEFECT_STATUSES)[number];
