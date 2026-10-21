import type { NotificationTab } from './notifications';
import type { InspectionCheck, NcrSeverity, NcrStatus, TestKind, TestResult } from './quality';
import type { ApprovalRightDto } from './approvals';
import type { TallyVoucherKind } from './tally';
import type { BillingUnit } from './billing';
import type { ProgressNarrativeDto } from './briefs';
import type { DocumentDiscipline, DocumentKind, LetterDirection, RevisionStatus, TransmittalPurpose } from './documents';
import type { LeaveStatus, LeaveType, StaffAttendanceStatus } from './staff';
import type { CostHead } from './cost';
import type {
  FuelNormUnit,
  LdPeriod,
  BillStage,
  ReceiptKind,
  VendorKind,
  MsmeCategory,
  DelayParty,
  PasswordTokenPurpose,
  RiskCategory,
  RiskKind,
  RiskStatus,
  EquipmentOwnership,
  EquipmentRateUnit,
  ExpenseCategory,
  PaymentMode,
  MaterialPriority,
  NotificationType,
  ProjectStatus,
  ProjectType,
  PushPlatform,
  RoleKey,
  StockEntryType,
  SubmissionStatus,
  SubmissionType,
  Weather,
  GrnQcStatus,
  PaymentRequestKind,
  VendorBillKind,
  HireFuelBy,
  DebitNoteReason,
  StockAdjustmentReason,
} from './enums';

/** API response shapes. Decimal columns are serialised as strings to preserve precision. */

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  roleKey: RoleKey;
  roleName: string;
  organizationId: string;
  organizationName: string;
  /** What this user may approve (from the organisation's approval matrix, or the fixed role rule). */
  approvalRights?: ApprovalRightDto[];
  /** Nirmaan staff who may use the platform console (PLATFORM_ADMIN_EMAILS) */
  platformAdmin?: boolean;
  /** Set when this is a read-only support session: who from Nirmaan is looking, and until when */
  support?: { staffName: string; expiresAt: string };
  /** The company's subscription, only when billing is switched on for this server */
  billing?: BillingStateDto;
  /** Ask Nirmaan is switched on for the company and set up on this server (AI roadmap item 67) */
  ai?: boolean;
}

/** Where a company stands with its subscription. READ_ONLY: trial over and nothing paid, so it can read but not write. */
export type BillingStatus = 'TRIAL' | 'ACTIVE' | 'READ_ONLY' | 'EXEMPT';

export interface BillingStateDto {
  status: BillingStatus;
  /** Last day of the free trial (null until the trial starts) */
  trialEndsAt: string | null;
  /** Last day paid for (null if never paid) */
  paidUntil: string | null;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export interface UserSummary {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  isActive: boolean;
  roleKey: RoleKey;
  roleName: string;
  createdAt: string;
  /** Invited and has not set a password yet. */
  invitePending: boolean;
}

/** A set-password link made for a user (invite or reset). `link` is null when the web address is not known. */
export interface PasswordLinkDto {
  link: string | null;
  emailed: boolean;
  /** Why the email was not sent, when email is set up but the provider refused it */
  emailError?: string | null;
  /** Also sent to the user's phone on WhatsApp or SMS (invites only), else null */
  messaged?: 'WHATSAPP' | 'SMS' | null;
  expiresAt: string;
}

/** POST /users: the new user, plus the invite link when no password was given. */
export interface CreateUserResultDto extends UserSummary {
  invite: PasswordLinkDto | null;
}

/** What the sign-in screens may offer (public). */
export interface AuthOptionsDto {
  /** New organisations may sign up (ORG_SIGNUP=open on the API). */
  signup: boolean;
  /** The sign-in screens offer the demo accounts (on unless DEMO_LOGIN=false on the API; off for a customer's own server). */
  demoLogin: boolean;
  /** Password-reset emails can be sent (email provider and web address configured). */
  resetByEmail: boolean;
  /** The public price for the product page, or null while billing is switched off. */
  pricing: { unit: BillingUnit; /** Rupees per unit per month, before GST */ price: string; trialDays: number; yearChargedMonths: number } | null;
}

/** Shown on the set-password page before the user chooses a password. */
export interface PasswordTokenInfoDto {
  purpose: PasswordTokenPurpose;
  email: string;
  fullName: string;
  organizationName: string;
  expiresAt: string;
}

export interface ProjectMemberDto {
  id: string;
  userId: string;
  fullName: string;
  roleKey: RoleKey;
  roleName: string;
}

export interface ProjectSummary {
  id: string;
  code: string;
  name: string;
  type: ProjectType;
  status: ProjectStatus;
  clientName: string | null;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  contractValue: string | null;
  /** Contract value plus variations the client approved (null without a contract value) */
  revisedContractValue: string | null;
  projectManagerId: string | null;
  projectManagerName: string | null;
  physicalProgressPct: number;
  pendingApprovals: number;
}

export interface ProjectDetail extends ProjectSummary {
  /** Client from the client master (`clientName` is its name, or free text without one) */
  clientId: string | null;
  consultantName: string | null;
  workOrderNo: string | null;
  description: string | null;
  /** Sector settings (v4 item 41): road / pipeline length in metres, building floors bottom up, water supply villages */
  chainageStart: number | null;
  chainageEnd: number | null;
  floors: string[];
  villages: string[];
  members: ProjectMemberDto[];
  createdAt: string;
  updatedAt: string;
}

export interface BoqItemDto {
  id: string;
  projectId: string;
  itemNo: string;
  description: string;
  unit: string;
  rate: string;
  originalQty: string;
  revisedQty: string | null;
  executedQty: string;
  balanceQty: string;
  amount: string;
  /** Sum of approved measurement book entries: the billable quantity. */
  measuredQty: string;
  /** Measured quantity × rate. */
  measuredAmount: string;
  /** Measurements waiting for approval. */
  pendingMeasuredQty: string;
  sortOrder: number;
}

export interface ActivityDto {
  id: string;
  projectId: string;
  boqItemId: string | null;
  boqItemNo: string | null;
  name: string;
  unit: string;
  plannedQty: string;
  executedQty: string;
  progressPct: number;
  plannedStart: string | null;
  plannedEnd: string | null;
  responsibleId: string | null;
  responsibleName: string | null;
  isDelayed: boolean;
  sortOrder: number;
  /** Checklist a new inspection of this activity starts from */
  checklistTemplateId: string | null;
  checklistName: string | null;
  /** Progress is approved only after a passed inspection */
  holdPoint: boolean;
  /** Planned dates when the baseline was frozen; null if added after it */
  baselineStart: string | null;
  baselineEnd: string | null;
}

export interface AttachmentDto {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
  createdAt: string;
}

export interface SubmissionBase {
  id: string;
  projectId: string;
  projectName: string;
  status: SubmissionStatus;
  submittedById: string;
  submittedByName: string;
  submittedAt: string | null;
  reviewedById: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  attachments: AttachmentDto[];
  createdAt: string;
  updatedAt: string;
}

export interface ProgressEntryDto extends SubmissionBase {
  activityId: string;
  activityName: string;
  unit: string;
  date: string;
  quantity: string;
  remarks: string | null;
  manpowerCount: number | null;
  machineryUsed: string | null;
  location: string | null;
  chainageFrom: number | null;
  chainageTo: number | null;
  floor: string | null;
  village: string | null;
}

export interface ManpowerLine {
  category: string;
  count: number;
}

export interface MachineryLine {
  name: string;
  hours: number;
}

export interface DailyReportDto extends SubmissionBase {
  date: string;
  weather: Weather | null;
  siteCondition: string | null;
  manpower: ManpowerLine[];
  machinery: MachineryLine[];
  materialReceived: string | null;
  workExecuted: string;
  testsConducted: string | null;
  safetyObservations: string | null;
  issues: string | null;
  nextDayPlan: string | null;
  totalManpower: number;
}

export interface MaterialRequestItemDto {
  id: string;
  itemName: string;
  specification: string | null;
  unit: string;
  quantity: string;
  /** Quantity received so far on GRNs against this line ("0" until the first receipt). */
  receivedQty: string;
  /** Quantity on purchase orders that are not rejected ("0" when none); a closed order counts what it received */
  orderedQty: string;
  /** Still to be ordered: requested less what orders hold and what was received without an order */
  toOrderQty: string;
}

export interface MaterialRequestDto extends SubmissionBase {
  requestNo: string;
  requiredDate: string;
  priority: MaterialPriority;
  remarks: string | null;
  items: MaterialRequestItemDto[];
}

export interface PendingApprovalDto {
  type: SubmissionType;
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  submittedByName: string;
  submittedAt: string;
  /** Rupees the approval limit is checked against (see APPROVAL_AMOUNT_BASIS); null for types without an amount. */
  amount: string | null;
}

/** An entry the current user approved, rejected or sent back: the Approvals inbox's "reviewed today". */
export interface ReviewedItemDto extends PendingApprovalDto {
  decision: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';
  note: string | null;
  reviewedAt: string;
}

export interface AuditLogDto {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorName: string;
  note: string | null;
  createdAt: string;
}

export interface CompanyDashboard {
  activeProjects: number;
  totalProjects: number;
  totalContractValue: string;
  projectsByType: { type: ProjectType; count: number }[];
  pendingApprovals: number;
  delayedActivities: number;
  /** Activities whose planned finish has passed, finished or not: what `delayedActivities` is out of (UX item 85) */
  dueActivities?: number;
  dprsToday: number;
  /** Only for roles that see bills */
  receivables?: { outstanding: string; over90: string; openBills: number };
  /** Only for roles that see payables: approved vendor and subcontractor bills not yet paid */
  payables?: { outstanding: string; overdue: string; openBills: number };
  /** Only for roles that see project cost: cost booked in the current calendar month (YYYY-MM), all heads */
  monthCost?: { month: string; total: string; expenses: string };
  /** Only for roles that see bills: approved RA bills dated in the current calendar month, value of work before GST */
  monthBilling?: { month: string; gross: string; bills: number };
  /** Only for roles that see bills: approved RA bills to date against the revised contract value (with approved variations) of projects that have one */
  financialProgress?: { contractValue: string; billed: string; pct: number | null };
  projects: ProjectSummary[];
}

/** One line of a My work card: what needs doing, and where. */
export interface MyWorkItem {
  /** e.g. "PO-2026-0012 · Shree Cement", "RA bill 4 · NHAI" */
  label: string;
  /** e.g. "6 days late", "Due in 3 days" */
  note: string;
  projectName: string | null;
  /** Rupees, where it means something */
  amount: string | null;
  /** Web path that opens it */
  href: string;
}

export interface MyWorkCard {
  count: number;
  /** Rupees involved, where it means something */
  amount: string | null;
  /** The most urgent few */
  items: MyWorkItem[];
  /**
   * How pressing the card is, in days (UX item 85): how long its most pressing entry is overdue, late or past its mark
   * (0 when it is due today, negative while it is still ahead); null when nothing waits. My work puts the highest first.
   */
  urgencyDays?: number | null;
}

/**
 * The home page's My work (UI roadmap item 59): only what the caller's role can act on or see; a card is missing when
 * the role has no business with it, and present with count 0 when there is simply nothing to do.
 */
export interface MyWorkDto {
  approvals?: { type: SubmissionType; count: number }[];
  /** Days the oldest entry waiting for the caller's approval has waited (UX item 85); null when none waits */
  approvalsWaitingDays?: number | null;
  /** Active projects with no daily report for today */
  dprsMissing?: MyWorkCard;
  /** Early warnings not dismissed (AI item 73): finishes slipping, a cash gap, stock running out… */
  watchList?: MyWorkCard;
  /** The caller's own entries rejected or sent back for changes */
  sentBack?: MyWorkCard;
  /** Sent RA bills not fully received, oldest first */
  receivables?: MyWorkCard;
  /** Vendor and subcontractor bills due in the next 7 days or overdue */
  payablesDue?: MyWorkCard;
  /** Guarantees, EMDs, policies and licences expiring in the next 30 days or expired */
  expiring?: MyWorkCard;
  /** Approved orders past their delivery date and not fully received */
  lateDeliveries?: MyWorkCard;
  /** Items below their minimum level in a store */
  lowStock?: MyWorkCard;
}

/** Month by month, oldest first, for the home page's KPI trends and charts (UI roadmap item 59). */
export interface HomeTrendsDto {
  /** YYYY-MM, the last six months including this one */
  months: string[];
  /** Approved progress × BOQ rate, per month */
  workDone: string[];
  /** Approved daily reports, per month */
  dprs: number[];
  /** Approved RA bills by bill date, value of work before GST (roles that see bills) */
  billed?: string[];
  /** Receipts from clients by receipt date (roles that see bills) */
  cashIn?: string[];
  /** Payments to vendors and subcontractors by payment date (roles that see payables) */
  cashOut?: string[];
  /** Cost booked, all heads (roles that see cost) */
  cost?: string[];
  /** Cost of the six months by head (roles that see cost) */
  costByHead?: CostHeadsDto;
  /**
   * Planned against actual value of work, cumulative, as % of the planned total, month by month over the planned span
   * of the projects' activities (activities with dates and a BOQ rate). Empty when nothing is planned.
   */
  sCurve: { month: string; planned: number; actual: number | null }[];
  /** Approved RA bills to date against the revised contract value, per project with one (roles that see bills) */
  billingVsContract?: { projectId: string; projectCode: string; projectName: string; contractValue: string; billed: string }[];
}

export interface ProjectDashboard {
  project: ProjectSummary;
  physicalProgressPct: number;
  /**
   * Share of the work planned to be done by today, weighted as physical progress is (UX item 85), over the activities
   * with planned dates; null when none has dates.
   */
  plannedProgressPct?: number | null;
  boqTotalAmount: string;
  boqExecutedAmount: string;
  activitiesTotal: number;
  activitiesCompleted: number;
  activitiesDelayed: number;
  pendingApprovals: number;
  openMaterialRequests: number;
  lastDprDate: string | null;
  recentProgress: ProgressEntryDto[];
  recentDprs: DailyReportDto[];
  progressByActivity: { activityId: string; name: string; plannedQty: string; executedQty: string; progressPct: number }[];
}

export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  projectId: string | null;
  projectName: string | null;
  /**
   * Set when the notification points at a submission (or, for SAFETY, an incident or permit; for MACHINERY, a machine
   * due for service, a job card, a vehicle paper or a driver); open it with entityType + entityId.
   */
  entityType: SubmissionType | 'SAFETY_INCIDENT' | 'WORK_PERMIT' | 'EQUIPMENT' | 'MAINTENANCE_JOB' | 'EQUIPMENT_DOCUMENT' | 'DRIVER' | 'IMPREST' | 'COMPLIANCE_DOC' | 'DEFECT' | 'HANDOVER' | 'RFI' | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListDto {
  items: NotificationDto[];
  unreadCount: number;
  /** Unread notifications in each drawer tab (all types, whatever `tab` filtered the items to). */
  unreadByTab?: Record<NotificationTab, number>;
}

export interface PushTokenDto {
  id: string;
  token: string;
  platform: PushPlatform;
  deviceName: string | null;
  createdAt: string;
  lastSeenAt: string;
}

/** Result of a scheduled notification job (DPR reminder / approval digest). */
export interface NotificationJobResult {
  job: 'DPR_REMINDER' | 'APPROVAL_DIGEST' | 'TESTS_DUE' | 'BILLS_DUE' | 'MACHINERY_DUE' | 'COMPLIANCE_DUE' | 'HANDOVER_DUE' | 'WATCH_LIST' | 'MORNING_BRIEF' | 'WEEK_NARRATIVE';
  date: string;
  created: number;
  pushed: number;
  emailed: number;
  /** Sent on WhatsApp or SMS */
  messaged?: number;
  skipped: number;
}

export interface AttendanceLineDto {
  id: string;
  contractor: string;
  /** The labour contractor in the vendor master, when the name matches one */
  vendorId: string | null;
  category: string;
  count: number;
}

/** One project's attendance for one day. */
export interface AttendanceSheetDto {
  id: string;
  projectId: string;
  projectName: string;
  date: string;
  remarks: string | null;
  totalWorkers: number;
  lines: AttendanceLineDto[];
  /** Head count per trade across contractors: what the day's DPR manpower is filled with. */
  manpower: ManpowerLine[];
  recordedById: string;
  recordedByName: string;
  updatedByName: string | null;
  /** Status of the project's DPR for the same date, if one exists. */
  dprStatus: SubmissionStatus | null;
  /** True once that DPR is approved; the sheet can no longer be changed. */
  locked: boolean;
  createdAt: string;
  updatedAt: string;
}

/** `GET /attendance/day`: the sheet for a project and date, or null when nothing was recorded. */
export interface AttendanceDayDto {
  projectId: string;
  date: string;
  sheet: AttendanceSheetDto | null;
  dprStatus: SubmissionStatus | null;
  locked: boolean;
}

/** Names used on earlier sheets of the project, for pickers. */
export interface AttendanceSuggestionsDto {
  contractors: string[];
  categories: string[];
}

/* ---------- stock ---------- */

export interface ItemDto {
  id: string;
  name: string;
  unit: string;
  category: string | null;
  /** Standard rate per unit used to value issues in the cost view. */
  rate: string | null;
  /** Fuel (v5 item 93): issued to machines and counted in the daily fuel position */
  isFuel?: boolean;
  /** Projects in which this item has stock movements. */
  projectCount: number;
  createdAt: string;
}

export interface StockLineDto {
  id: string;
  itemId: string;
  itemName: string;
  unit: string;
  /** Signed: positive into the store, negative out of it. */
  quantity: string;
  materialRequestItemId: string | null;
  purchaseOrderLineId: string | null;
  /** Receipts: quantity QA/QC rejected; null until checked */
  rejectedQty?: string | null;
}

export interface StockEntryDto {
  id: string;
  projectId: string;
  projectName: string;
  type: StockEntryType;
  entryNo: string;
  date: string;
  materialRequestId: string | null;
  requestNo: string | null;
  purchaseOrderId: string | null;
  poNo: string | null;
  supplier: string | null;
  /** The supplier in the vendor master, when linked */
  vendorId: string | null;
  challanNo: string | null;
  vehicleNo: string | null;
  issuedTo: string | null;
  activityId: string | null;
  activityName: string | null;
  /** Issues to a subcontractor: their work order, and the bill that recovered the material */
  workOrderId: string | null;
  woNo: string | null;
  subcontractBillId: string | null;
  /** Transfers out: where the material is going, and the transfer in that received it (null while in transit) */
  toProjectId: string | null;
  toProjectName: string | null;
  transferInId: string | null;
  transferInNo: string | null;
  /** Transfers in: the transfer out it received */
  transferOutId: string | null;
  transferOutNo: string | null;
  fromProjectName: string | null;
  remarks: string | null;
  /** Adjustments: why (v5 item 92); null on adjustments made before reasons were asked */
  adjustmentReason?: StockAdjustmentReason | null;
  /** Fuel issues (v5 item 93): the machine fuelled and its meter then */
  equipmentId?: string | null;
  equipmentCode?: string | null;
  meterReading?: string | null;
  /** Receipts: QA/QC's check of the material (null until checked) */
  qcStatus?: GrnQcStatus | null;
  qcAt?: string | null;
  qcByName?: string | null;
  qcNote?: string | null;
  lines: StockLineDto[];
  attachments: AttachmentDto[];
  createdById: string;
  createdByName: string;
  createdAt: string;
}

/** Stock of one item at one project. */
export interface StockBalanceDto {
  projectId: string;
  projectName: string;
  itemId: string;
  itemName: string;
  unit: string;
  category: string | null;
  /** Received on GRNs less returned to suppliers */
  received: string;
  /** Issued at site less returned from site */
  issued: string;
  adjusted: string;
  /** Transferred in less transferred out */
  transferred: string;
  balance: string;
  minQty: string | null;
  low: boolean;
  lastMovement: string | null;
}

/** Value and age of one item's stock at one project. */
export interface StockValuationRowDto {
  projectId: string;
  projectName: string;
  itemId: string;
  itemName: string;
  unit: string;
  category: string | null;
  balance: string;
  /** Item master rate; null when not set */
  rate: string | null;
  value: string;
  /** Quantity in each ageing bucket (STOCK_AGEING_BUCKETS), oldest stock assumed used first */
  ageingQty: string[];
  /** Days since the oldest receipt still in stock */
  oldestDays: number | null;
}

/** A posted stock count: how many items were counted and the adjustment for the differences (null when all matched). */
export interface StockCountResultDto {
  counted: number;
  entry: StockEntryDto | null;
}

/** Stock valuation and ageing: balances at item master rates, aged first in, first out. */
export interface StockValuationDto {
  asOf: string;
  rows: StockValuationRowDto[];
  totalValue: string;
  /** Value in each ageing bucket */
  ageingValue: string[];
  /** Items in stock without a rate (not valued) */
  unpricedItems: number;
}

/** An approved material request line with what is still to be received. */
export interface ReceivableLineDto {
  materialRequestItemId: string;
  itemName: string;
  specification: string | null;
  unit: string;
  requested: string;
  received: string;
  pending: string;
}

export interface ReceivableRequestDto {
  id: string;
  requestNo: string;
  projectId: string;
  projectName: string;
  requiredDate: string;
  priority: MaterialPriority;
  lines: ReceivableLineDto[];
}

/* ---------- machinery ---------- */

export interface EquipmentDto {
  id: string;
  code: string;
  name: string;
  category: string | null;
  ownership: EquipmentOwnership;
  supplier: string | null;
  /** The hire agency in the vendor master, when linked */
  vendorId: string | null;
  registrationNo: string | null;
  /** Only returned to roles that manage equipment (rates are commercial); null otherwise. */
  rate: string | null;
  rateUnit: EquipmentRateUnit;
  /** Hire terms of a hired machine (v5 item 91): hours paid for a month at least, who fuels it, operator included */
  hireMinHours: string | null;
  hireFuelBy: HireFuelBy | null;
  hireOperator: boolean | null;
  projectId: string | null;
  projectName: string | null;
  isActive: boolean;
  /** Date of the latest log, any status except rejected. */
  lastLogDate: string | null;
  /** Service every so many working hours and / or days; null when not set */
  serviceIntervalHours: string | null;
  serviceIntervalDays: number | null;
  lastServiceDate: string | null;
  lastServiceMeter: string | null;
  /** Fuel norm (v5 item 93): litres an hour, or km a litre, and the % the average may stray; null when not set */
  fuelNorm?: string | null;
  fuelNormUnit?: FuelNormUnit | null;
  fuelTolerancePct?: string | null;
  createdAt: string;
}

export interface MachineryLogDto extends SubmissionBase {
  equipmentId: string;
  equipmentCode: string;
  equipmentName: string;
  ownership: EquipmentOwnership;
  date: string;
  hoursWorked: string;
  idleHours: string;
  breakdownHours: string;
  dieselLitres: string | null;
  /** Fuel issued from the store to this machine on the day (v5 item 93), to set beside the litres typed */
  fuelIssuedLitres?: string | null;
  meterStart: string | null;
  meterEnd: string | null;
  operatorName: string | null;
  activityId: string | null;
  activityName: string | null;
  workDone: string | null;
  breakdownNote: string | null;
  remarks: string | null;
  /** The hire bill that billed it (v5 item 91); a billed log is locked */
  vendorBillId: string | null;
  vendorBillNo: string | null;
}

/* ---------- measurement book ---------- */

export interface MeasurementLineDto {
  id: string;
  description: string;
  nos: string | null;
  length: string | null;
  breadth: string | null;
  depth: string | null;
  deduct: boolean;
  /** Signed: negative for deductions. */
  quantity: string;
}

export interface MeasurementSheetDto extends SubmissionBase {
  mbNo: string;
  /** The RA bill that billed it (it cannot be billed again) */
  raBillId: string | null;
  raBillNo: number | null;
  /** Work by a subcontractor: their work order, and the subcontractor bill that paid it */
  workOrderId: string | null;
  woNo: string | null;
  contractorName: string | null;
  subcontractBillId: string | null;
  date: string;
  boqItemId: string;
  boqItemNo: string;
  boqDescription: string;
  unit: string;
  rate: string;
  location: string;
  chainageFrom: number | null;
  chainageTo: number | null;
  floor: string | null;
  village: string | null;
  remarks: string | null;
  totalQty: string;
  /** totalQty × BOQ rate */
  amount: string;
  lines: MeasurementLineDto[];
}

/* ---------- site expenses ---------- */

export interface ExpenseDto extends SubmissionBase {
  expenseNo: string;
  date: string;
  category: ExpenseCategory;
  description: string;
  vendor: string | null;
  vendorGstin: string | null;
  /** The vendor in the vendor master, when linked */
  vendorId: string | null;
  billNo: string | null;
  /** Taxable value */
  amount: string;
  gstRate: string;
  gstAmount: string;
  totalAmount: string;
  paymentMode: PaymentMode;
  activityId: string | null;
  activityName: string | null;
  remarks: string | null;
}

/** Totals for the expenses matching a list filter, split by category; amounts are totals including GST. */
export interface ExpenseSummaryDto {
  count: number;
  amount: string;
  gstAmount: string;
  totalAmount: string;
  /** Approved only: what counts as project cost. */
  approvedTotal: string;
  /** Submitted and waiting for approval. */
  pendingTotal: string;
  byCategory: { category: ExpenseCategory; count: number; totalAmount: string }[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/* ---------- project cost ---------- */

export interface LabourRateDto {
  id: string;
  category: string;
  dailyRate: string;
}

export interface LabourRatesDto {
  rates: LabourRateDto[];
  /** Trades on attendance sheets that have no rate yet. */
  unpricedTrades: string[];
}

export interface CostHeadsDto {
  expenses: string;
  /** Material issued at the item rate, less what subcontractors' approved bills recovered */
  material: string;
  machinery: string;
  /** Attendance man-days, except gangs of a subcontractor with a work order on the project (paid through its bills) */
  labour: string;
  /** Subcontractors' approved bills: value of work (before GST) */
  subcontract: string;
  total: string;
}

/** What could not be valued because a rate is missing. */
export interface UnpricedDto {
  /** Issued items without a standard rate. */
  materialItems: number;
  /** Approved machinery logs of machines without a rate. */
  machineryLogs: number;
  /** Attendance man-days of trades without a daily rate. */
  labourManDays: number;
}

export interface ProjectCostSummaryDto {
  projectId: string;
  projectCode: string;
  projectName: string;
  projectType: ProjectType;
  contractValue: string | null;
  /** Approved progress × BOQ rate in the period. */
  executedValue: string;
  /** Approved measurement sheets × BOQ rate in the period. */
  measuredValue: string;
  cost: CostHeadsDto;
  /** executedValue − cost.total */
  margin: string;
  /** cost.total as % of executedValue; null when nothing was executed. */
  costPct: number | null;
  /** Approved RA bills dated in the period: value of work plus price variation (before GST) */
  billedValue: string;
  /** Received from the client in the period (bank credits, all receipts) */
  cashIn: string;
  /** Approved vendor and subcontractor bills dated in the period (what they are owed with GST) */
  payableBilled: string;
  /** Paid to vendors and subcontractors in the period */
  cashOut: string;
  unpriced: UnpricedDto;
}

export interface CostMonthDto extends CostHeadsDto {
  /** YYYY-MM */
  month: string;
  executedValue: string;
}

export interface ProjectCostDto extends ProjectCostSummaryDto {
  from: string | null;
  to: string | null;
  months: CostMonthDto[];
  expensesByCategory: { category: ExpenseCategory; count: number; amount: string }[];
  materialByItem: { itemId: string; name: string; unit: string; quantity: string; rate: string | null; amount: string }[];
  machineryByEquipment: { equipmentId: string; code: string; name: string; rateUnit: EquipmentRateUnit; rate: string | null; days: number; hours: string; amount: string }[];
  labourByTrade: { category: string; manDays: number; dailyRate: string | null; amount: string }[];
  /** Subcontractors' approved bills in the period, per work order */
  subcontractByOrder: { workOrderId: string; woNo: string; vendorName: string; bills: number; amount: string }[];
}

/* ---------- budget and forecast ---------- */

/** One cost head: budget, actual to date, the budget earned by the work done, and the forecast at completion. */
export interface BudgetHeadDto {
  head: CostHead;
  /** null when the project has no cost-head budget */
  budget: string | null;
  actual: string;
  /** budget × % complete */
  earned: string | null;
  /** actual + budget × (1 − % complete) */
  forecast: string | null;
  /** earned − actual: negative is an overrun */
  variance: string | null;
}

/** One BOQ item with its budgeted cost per unit. */
export interface BudgetBoqItemDto {
  boqItemId: string;
  itemNo: string;
  description: string;
  unit: string;
  /** Revised quantity, else the original */
  qty: string;
  /** Client's rate */
  rate: string;
  amount: string;
  /** Budgeted cost per unit; null when not set */
  budgetRate: string | null;
  /** qty × budgetRate */
  budgetAmount: string | null;
  /** (rate − budgetRate) ÷ rate, % */
  plannedMarginPct: number | null;
  /** Approved progress to date */
  executedQty: string;
  /** executedQty × budgetRate */
  earnedBudget: string | null;
}

/**
 * A project's budget against actual cost to date, and the forecast to complete. % complete is executed value (approved
 * progress × BOQ rate) over the BOQ value; the forecast at completion is actual cost plus the budget for the work left.
 */
export interface ProjectBudgetDto {
  projectId: string;
  projectCode: string;
  projectName: string;
  /** The cost-head budget is set */
  hasHeadBudget: boolean;
  heads: BudgetHeadDto[];
  /** Σ BOQ qty × budget rate over the items that have one; null when none has */
  boqBudget: string | null;
  boqItems: BudgetBoqItemDto[];
  /** BOQ items (with a quantity) that have no budget rate */
  itemsWithoutBudgetRate: number;
  /** Σ BOQ qty × rate */
  boqValue: string;
  executedValue: string;
  /** 0 to 100, one decimal */
  pctComplete: number;
  /** The cost-head budget total, else the BOQ budget; null when neither is set */
  budgetAtCompletion: string | null;
  earnedBudget: string | null;
  actualCost: string;
  /** earnedBudget − actualCost: negative is an overrun */
  costVariance: string | null;
  forecastAtCompletion: string | null;
  /** forecastAtCompletion − actualCost */
  forecastToComplete: string | null;
  revisedContractValue: string | null;
  /** revisedContractValue − forecastAtCompletion */
  forecastMargin: string | null;
  notes: string | null;
  updatedAt: string | null;
  updatedByName: string | null;
}

export type CashFlowGranularity = 'MONTH' | 'WEEK';

/** Money expected in and out in one week or month. The first period also holds everything overdue. */
export interface CashFlowPeriodDto {
  /** First day, YYYY-MM-DD */
  start: string;
  /** Last day, YYYY-MM-DD */
  end: string;
  /** RA bills approved and not yet paid, expected the client's payment days after they were sent (or billed, when not sent) */
  clientBills: string;
  /** Retention and security deposit held by the client, at the end of the defect liability period */
  retentionRelease: string;
  /** Work still to bill (revised contract value less billed), billed evenly to completion, net of the client's deductions, with GST */
  futureBilling: string;
  inTotal: string;
  /** Approved vendor and subcontractor bills not yet paid, by due date */
  vendorBills: string;
  /** Forecast to complete, spent evenly to completion */
  remainingBudget: string;
  outTotal: string;
  net: string;
  cumulative: string;
}

export interface CashFlowDto {
  asOf: string;
  granularity: CashFlowGranularity;
  projectId: string | null;
  periods: CashFlowPeriodDto[];
  /** Amounts due before today, already counted in the first period */
  overdueIn: string;
  overdueOut: string;
  /** Projects whose remaining work is not in the forecast because they have no budget */
  projectsWithoutBudget: { projectId: string; projectCode: string }[];
  /** Projects past (or without) a completion date: their remaining billing and budget are spread over the next 3 months */
  projectsWithoutEndDate: { projectId: string; projectCode: string }[];
}

/* ---------- progress report ---------- */

export interface ReportActivityRowDto {
  id: string;
  name: string;
  unit: string;
  plannedQty: string;
  /** Approved progress dated inside the period. */
  periodQty: string;
  /** Approved progress up to the end of the period. */
  cumulativeQty: string;
  pct: number;
  plannedStart: string | null;
  plannedEnd: string | null;
  /** Planned end on or before the period end and not complete. */
  delayed: boolean;
}

export interface ReportBoqRowDto {
  itemNo: string;
  description: string;
  unit: string;
  rate: string;
  periodQty: string;
  periodValue: string;
  cumulativeQty: string;
  cumulativeValue: string;
  /** Approved measurement book quantity dated inside the period. */
  measuredPeriodQty: string;
}

/** Weekly or monthly progress report built from approved data. */
export interface ProgressReportDto {
  project: {
    id: string;
    code: string;
    name: string;
    type: ProjectType;
    clientName: string | null;
    consultantName: string | null;
    workOrderNo: string | null;
    location: string | null;
    startDate: string | null;
    endDate: string | null;
    contractValue: string | null;
    projectManagerName: string | null;
  };
  organizationName: string;
  from: string;
  to: string;
  generatedAt: string;
  /** A Monday-to-Sunday week's summary paragraph, written overnight by Ask Nirmaan (AI item 74); null otherwise. */
  narrative: ProgressNarrativeDto | null;
  physical: { atStartPct: number; atEndPct: number };
  /** Share of the contract period elapsed at the end of the report period; null without both dates. */
  timeElapsedPct: number | null;
  financial: { periodValue: string; cumulativeValue: string; contractPct: number | null; measuredPeriodValue: string; measuredCumulativeValue: string };
  activities: ReportActivityRowDto[];
  boq: ReportBoqRowDto[];
  manpower: { category: string; manDays: number; avgPerDay: number }[];
  attendanceDays: number;
  machinery: { code: string; name: string; days: number; hours: string; idleHours: string; breakdownHours: string }[];
  materials: { name: string; unit: string; received: string; issued: string }[];
  dpr: { days: number; approved: number; rainyDays: number };
  issues: { date: string; text: string }[];
  safety: { date: string; text: string }[];
  /** Delays that held up work during the period, and risks still open at its end (score 8 or more). */
  delays: { riskNo: string; title: string; activityName: string | null; from: string; to: string | null; daysInPeriod: number; responsibleParty: DelayParty | null; eotClaimed: boolean; status: RiskStatus }[];
  risks: { riskNo: string; title: string; score: number; mitigation: string | null; ownerName: string | null; dueDate: string | null }[];
  /** Activities planned to be under way in the next period of the same length and not complete. */
  nextPeriod: { name: string; unit: string; balanceQty: string; plannedEnd: string | null }[];
  photos: { url: string; caption: string }[];
}

/* ---------- delay and risk register ---------- */

export interface RiskDto {
  id: string;
  projectId: string;
  projectName: string;
  riskNo: string;
  kind: RiskKind;
  category: RiskCategory;
  title: string;
  description: string | null;
  activityId: string | null;
  activityName: string | null;
  ownerId: string | null;
  ownerName: string | null;
  probability: number;
  impact: number;
  score: number;
  mitigation: string | null;
  dueDate: string | null;
  /** Open or monitoring with a due date before today. */
  overdue: boolean;
  status: RiskStatus;
  delayStart: string | null;
  delayEnd: string | null;
  /** Days lost as recorded, else counted from the delay dates (to today while the delay is still running). */
  daysLost: number | null;
  responsibleParty: DelayParty | null;
  eotClaimed: boolean;
  /** Days of extension the client granted for this delay */
  eotGrantedDays: number | null;
  closedAt: string | null;
  closureNote: string | null;
  raisedById: string;
  raisedByName: string;
  attachments: AttachmentDto[];
  createdAt: string;
  updatedAt: string;
}

/** Register totals for the filters on screen (status filter ignored for the open / closed counts). */
export interface RiskSummaryDto {
  open: number;
  monitoring: number;
  closed: number;
  /** Open or monitoring risks (kind RISK) scored HIGH_RISK_SCORE or more. */
  highRisks: number;
  /** Open delays (still holding work up or not yet closed). */
  openDelays: number;
  overdue: number;
  /** Days lost over all delays, and those attributable to the client / third parties / force majeure (EOT-eligible). */
  daysLost: number;
  excusableDaysLost: number;
  eotClaimed: number;
  /** Open and monitoring risks (kind RISK) by probability (row, 1..5) and impact (column, 1..5): heat[p-1][i-1]. */
  heat: number[][];
  byCategory: { category: RiskCategory; open: number; total: number; daysLost: number }[];
}

/** A delayed activity (past planned end, not complete) that has no open delay entry yet. */
export interface DelaySuggestionDto {
  activityId: string;
  activityName: string;
  projectId: string;
  projectName: string;
  plannedEnd: string;
  progressPct: number;
  daysLate: number;
}

/* ---------- activity templates ---------- */

export interface ActivityTemplateDto {
  projectType: ProjectType;
  /** True while the organisation has not saved its own list for this type (the built-in one is shown). */
  isDefault: boolean;
  items: { name: string; unit: string; startDay: number; durationDays: number }[];
  spanDays: number;
}

export interface ApplyTemplateResultDto {
  created: number;
  /** Template activities skipped because the project already has an activity with that name. */
  skipped: string[];
}

/* ---------- approval matrix ---------- */

export interface ApprovalRuleDto {
  roleKey: RoleKey;
  type: SubmissionType;
  /** null = no limit */
  maxAmount: string | null;
}

export interface ApprovalMatrixDto {
  /** False while the organisation uses the fixed rule (admin, management and project managers approve everything). */
  custom: boolean;
  roles: { roleKey: RoleKey; roleName: string; users: number }[];
  rules: ApprovalRuleDto[];
  /** Accounts pays a bill only against an approved payment request (v5 item 90) */
  paymentsNeedRequest: boolean;
}

/* ---------- clients and contracts ---------- */

export interface VendorDto {
  id: string;
  name: string;
  kinds: VendorKind[];
  gstin: string | null;
  pan: string | null;
  stateCode: string | null;
  address: string | null;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  /** Bank details: only for roles that pay vendors (`canSeeVendorBank`); null otherwise. */
  bankAccountName: string | null;
  bankAccountNo: string | null;
  bankIfsc: string | null;
  bankName: string | null;
  msmeCategory: MsmeCategory | null;
  udyamNo: string | null;
  remarks: string | null;
  isActive: boolean;
  /** Where it is used: expenses, machines and GRNs linked to it */
  expenseCount: number;
  equipmentCount: number;
  grnCount: number;
  createdAt: string;
  updatedAt: string;
}

/** A vendor name typed on expenses, machines or GRNs that matches no vendor in the master. */
export interface UnlistedVendorDto {
  name: string;
  /** What it was typed on, which suggests its kind */
  expenseCount: number;
  equipmentCount: number;
  grnCount: number;
  /** A GSTIN typed with it on an expense, if any */
  gstin: string | null;
}

export interface ClientDto {
  id: string;
  name: string;
  department: string | null;
  gstin: string | null;
  pan: string | null;
  billingAddress: string | null;
  /** GST state code, e.g. "21" (Odisha) */
  stateCode: string | null;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  /** Projects of this client */
  projectCount: number;
  createdAt: string;
  updatedAt: string;
}

/** An extension of time granted (or claimed) for a delay in the register. */
export interface ContractExtensionDto {
  riskId: string;
  riskNo: string;
  title: string;
  delayStart: string | null;
  delayEnd: string | null;
  daysLost: number | null;
  responsibleParty: DelayParty | null;
  eotClaimed: boolean;
  eotGrantedDays: number | null;
}

/** A project's contract with its client: what RA bills are built on. Percentages are of the work value. */
/** One component of a contract's price variation formula (v4 item 50). */
export interface PriceVariationComponentDto {
  id: string;
  name: string;
  /** % of the work value that moves with this index */
  sharePct: string;
  /** Index on the base date */
  baseIndex: string;
}

export interface ProjectContractDto {
  projectId: string;
  projectCode: string;
  projectName: string;
  client: ClientDto | null;
  /** Free-text client name when no client from the master is linked */
  clientName: string | null;
  workOrderNo: string | null;
  agreementNo: string | null;
  agreementDate: string | null;
  contractValue: string | null;
  /** Variations the client approved */
  approvedVariations: string;
  /** contractValue + approvedVariations (null without a contract value) */
  revisedContractValue: string | null;
  startDate: string | null;
  /** Completion date in the agreement */
  endDate: string | null;
  /** Extensions of time granted, days (sum over the delay register) */
  extensionDays: number;
  /** endDate + extensionDays */
  revisedEndDate: string | null;
  extensions: ContractExtensionDto[];
  retentionPct: string;
  securityDepositPct: string;
  mobilisationAdvance: string;
  advanceRecoveryPct: string;
  defectLiabilityMonths: number | null;
  /** Days the client takes to pay a bill once sent; null = not set (the cash-flow forecast assumes 30) */
  clientPaymentDays: number | null;
  priceVariation: boolean;
  /** Price variation: the date the base indices are taken at */
  pvBaseDate: string | null;
  /** The price variation formula: each component's share of the work value and its base index; the rest is fixed */
  pvComponents: PriceVariationComponentDto[];
  gstRate: string;
  tdsPct: string;
  gstTdsPct: string;
  labourCessPct: string;
  /** Liquidated damages: % of the contract value per `ldPeriod` late, capped at `ldCapPct` */
  ldRatePct: string;
  ldPeriod: LdPeriod;
  ldCapPct: string;
  /** Exposure to liquidated damages; null without a contract value and completion date */
  ld: LdExposureDto | null;
  updatedAt: string;
}

/**
 * A project's exposure to liquidated damages (v4 item 50): how late it is against the completion date after the
 * extensions of time granted, and the LD that gives at the contract's rate, up to its cap.
 */
export interface LdExposureDto {
  projectId: string;
  projectCode: string;
  projectName: string;
  projectStatus: ProjectStatus;
  ldRatePct: string;
  ldPeriod: LdPeriod;
  ldCapPct: string;
  /** Revised contract value (with approved variations) LD is worked out on */
  contractValue: string;
  endDate: string;
  extensionDays: number;
  revisedEndDate: string;
  /** From the handover record, once the project is complete */
  completedOn: string | null;
  /** completedOn, else the later of today and the last planned finish of the schedule */
  forecastFinish: string;
  /** Days past the revised completion date, to completion or today */
  daysLate: number;
  forecastDaysLate: number;
  /** Days lost in the delay register to the client, third parties and force majeure, and to us */
  excusableDaysLost: number;
  contractorDaysLost: number;
  /** Excusable days lost not yet covered by extensions granted: a claim to pursue */
  eotPendingDays: number;
  /** LD on daysLate, on forecastDaysLate, and on forecastDaysLate less eotPendingDays (if the claims are granted) */
  ldToDate: string;
  ldForecast: string;
  ldForecastWithEot: string;
  /** ldCapPct of the contract value */
  ldCap: string;
  capReached: boolean;
}

/* ---------- RA bills ---------- */

export interface RaBillItemDto {
  id: string;
  boqItemId: string;
  itemNo: string;
  description: string;
  unit: string;
  /** BOQ quantity (revised, else original) and rate when the bill was prepared */
  boqQty: string;
  rate: string;
  prevQty: string;
  /** Claimed in this bill */
  thisQty: string;
  uptoQty: string;
  /** This bill's quantity as certified by the client (null until certified) */
  certifiedQty: string | null;
  prevAmount: string;
  /** (certifiedQty ?? thisQty) × rate */
  amount: string;
  uptoAmount: string;
  /** Up-to-date quantity beyond the BOQ quantity (a deviation), "0" when within it */
  excessQty: string;
  /** Not in the original BOQ (BOQ quantity 0): an extra item */
  extraItem: boolean;
}

export type BillDeductionKey = 'retention' | 'securityDeposit' | 'advanceRecovery' | 'tds' | 'gstTds' | 'labourCess' | 'other';

export interface RaBillDeductionDto {
  key: BillDeductionKey;
  label: string;
  /** % of the work value; null for the other deduction */
  pct: string | null;
  amount: string;
}

/** A measurement billed in the bill, with its lines (measurement annex of the print). */
export interface RaBillMeasurementDto {
  id: string;
  mbNo: string;
  date: string;
  boqItemNo: string;
  unit: string;
  location: string;
  totalQty: string;
  lines: MeasurementLineDto[];
}

/** One component of the price variation on an RA bill. */
export interface RaBillPvLineDto {
  id: string;
  name: string;
  sharePct: string;
  baseIndex: string;
  currentIndex: string;
  amount: string;
}

export interface RaBillDto extends SubmissionBase {
  billNo: number;
  /**
   * Single bill, not approved yet: extra items measured up to the bill's date that it leaves out because they have no
   * BOQ quantity until the client approves a variation for them.
   */
  heldExtraItems?: { boqItemId: string; itemNo: string; description: string; unit: string; qty: string }[];
  /** In a Tally export: cannot be changed until that export is undone */
  exportedToTally: boolean;
  /** "RA bill 3", or "RA bill 7 (final)" */
  billLabel: string;
  isFinal: boolean;
  billDate: string;
  measuredUpTo: string;
  remarks: string | null;
  projectCode: string;
  workOrderNo: string | null;
  agreementNo: string | null;
  agreementDate: string | null;
  client: { name: string; department: string | null; gstin: string | null; billingAddress: string | null; stateCode: string | null } | null;
  clientName: string | null;
  grossPrevious: string;
  /** Value of work in this bill (taxable value) */
  grossAmount: string;
  grossUpto: string;
  /**
   * Price variation on this bill's work value (v4 item 50): work value × Σ share × (current − base) / base over the
   * contract's components. Negative when the indices fell. GST and the deductions are on work value + price variation.
   */
  pvAmount: string;
  /** The month the current indices are for (YYYY-MM-01) */
  pvIndexMonth: string | null;
  pvNote: string | null;
  pvLines: RaBillPvLineDto[];
  gstRate: string;
  gstAmount: string;
  /** Retention, security deposit, advance recovery, TDS, GST TDS, labour cess and any other deduction, in that order (zero ones left out) */
  deductions: RaBillDeductionDto[];
  otherDeduction: string;
  otherDeductionNote: string | null;
  totalDeductions: string;
  /** gross + price variation + GST - deductions */
  netPayable: string;
  /** What was claimed, when the certified amount differs */
  claimedGross: string | null;
  claimedNet: string | null;
  stage: BillStage;
  sentDate: string | null;
  certifiedDate: string | null;
  certificateNo: string | null;
  paidDate: string | null;
  measurementCount: number;
  /** Work value + price variation + GST: what the client owes before its deductions */
  invoiceAmount: string;
  /** Received in the bank against this bill */
  receivedAmount: string;
  /** Received plus what the client deducted on its payments */
  settledAmount: string;
  /** invoiceAmount − settledAmount */
  outstanding: string;
  items: RaBillItemDto[];
  /** Only on GET /ra-bills/:id */
  measurements?: RaBillMeasurementDto[];
  /** Only on GET /ra-bills/:id */
  receipts?: ReceiptDto[];
}

/* ---------- Receivables ---------- */

export type ReceiptDeductionKey = 'tds' | 'gstTds' | 'retention' | 'securityDeposit' | 'advanceRecovery' | 'labourCess' | 'other';

export interface ReceiptDto {
  id: string;
  /** In a Tally export: cannot be changed until that export is undone */
  exportedToTally: boolean;
  kind: ReceiptKind;
  projectId: string;
  projectCode: string;
  projectName: string;
  clientName: string | null;
  billId: string | null;
  /** "RA bill 3" for a bill payment */
  billLabel: string | null;
  receiptDate: string;
  /** Credited to the bank */
  amount: string;
  mode: PaymentMode;
  reference: string | null;
  tdsAmount: string;
  gstTdsAmount: string;
  retentionAmount: string;
  securityDepositAmount: string;
  advanceRecoveryAmount: string;
  labourCessAmount: string;
  otherDeduction: string;
  otherDeductionNote: string | null;
  /** Sum of the deductions above */
  deductedAmount: string;
  remarks: string | null;
  createdByName: string;
  createdAt: string;
}

/** Outstanding by age, counted from the day the bill was sent to the client. */
export interface AgeingDto {
  current: string;
  days31to60: string;
  days61to90: string;
  over90: string;
}

/** Receivable totals for a project, a client, or everything. */
export interface ReceivableTotalsDto {
  /** Approved bills sent to the client: work + GST */
  billed: string;
  received: string;
  deducted: string;
  outstanding: string;
  ageing: AgeingDto;
  /** Approved bills not yet sent */
  notSent: string;
  /** Retention and security deposit deducted on payments, less what was released */
  retentionHeld: string;
  depositHeld: string;
  tdsDeducted: string;
  gstTdsDeducted: string;
}

export interface ProjectReceivableDto extends ReceivableTotalsDto {
  projectId: string;
  projectCode: string;
  projectName: string;
  clientName: string | null;
  /** When retention falls due: revised completion + defect liability period; null when either is unknown */
  retentionReleaseDate: string | null;
}

export interface ClientReceivableDto extends ReceivableTotalsDto {
  clientName: string;
  projectCount: number;
}

/** A sent bill not fully settled. */
export interface OpenBillDto {
  billId: string;
  billLabel: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  clientName: string | null;
  stage: BillStage;
  billDate: string;
  sentDate: string;
  certifiedDate: string | null;
  invoiceAmount: string;
  settledAmount: string;
  outstanding: string;
  daysOutstanding: number;
}

export interface ReceivablesDto {
  asOf: string;
  totals: ReceivableTotalsDto;
  projects: ProjectReceivableDto[];
  clients: ClientReceivableDto[];
  openBills: OpenBillDto[];
}

/* ---------- purchasing (v3 item 21) ---------- */

export interface QuotationLineDto {
  materialRequestItemId: string;
  itemName: string;
  unit: string;
  quantity: string;
  rate: string;
  gstRate: string;
  /** quantity × rate */
  amount: string;
  remarks: string | null;
}

export interface QuotationDto {
  id: string;
  materialRequestId: string;
  requestNo: string;
  projectId: string;
  vendorId: string;
  vendorName: string;
  quoteRef: string | null;
  quoteDate: string;
  validUntil: string | null;
  deliveryDays: number | null;
  paymentTerms: string | null;
  freight: string;
  remarks: string | null;
  lines: QuotationLineDto[];
  /** Lines quoted, before GST */
  subtotal: string;
  gstAmount: string;
  /** subtotal + freight + GST */
  total: string;
  /** Lines of the request it has no rate for */
  missingLines: number;
  createdByName: string;
  createdAt: string;
}

/** Quotations of one request side by side: per line, each vendor's rate and the lowest. */
export interface ComparativeStatementDto {
  materialRequestId: string;
  requestNo: string;
  projectId: string;
  projectName: string;
  quotations: QuotationDto[];
  lines: {
    materialRequestItemId: string;
    itemName: string;
    specification: string | null;
    unit: string;
    quantity: string;
    orderedQty: string;
    /** quotationId → rate, gstRate and amount for this line */
    rates: Record<string, { rate: string; gstRate: string; amount: string } | null>;
    /** The quotation with the lowest landed rate (rate + GST) for this line, if any quoted */
    lowestQuotationId: string | null;
  }[];
  /** The quotation with the lowest total among those quoting every line */
  lowestQuotationId: string | null;
}

export interface PurchaseOrderLineDto {
  id: string;
  materialRequestItemId: string | null;
  itemName: string;
  specification: string | null;
  unit: string;
  quantity: string;
  rate: string;
  gstRate: string;
  amount: string;
  gstAmount: string;
  /** On GRNs against this line */
  receivedQty: string;
  /** On vendor bills against this line that are not rejected */
  billedQty: string;
}

export interface PurchaseOrderDto extends SubmissionBase {
  poNo: string;
  poDate: string;
  vendorId: string;
  vendorName: string;
  vendorGstin: string | null;
  vendorMsme: MsmeCategory | null;
  materialRequestId: string | null;
  requestNo: string | null;
  quotationId: string | null;
  deliveryBy: string | null;
  deliveryAddress: string | null;
  paymentTerms: string | null;
  paymentDays: number | null;
  freight: string;
  subtotal: string;
  gstAmount: string;
  total: string;
  remarks: string | null;
  closedAt: string | null;
  closeNote: string | null;
  /** Approved, not closed, and something still to receive */
  open: boolean;
  /** Share of the order value received, 0 to 100 */
  receivedPct: number;
  lines: PurchaseOrderLineDto[];
  /** Only on GET /purchase-orders/:id */
  grns?: { id: string; entryNo: string; date: string; lines: number }[];
  bills?: { id: string; billNo: string; invoiceNo: string; invoiceDate: string; total: string; status: SubmissionStatus; matched: boolean }[];
  /** Advances paid against the order (v5 item 90) */
  advancePaid: string;
  /** Advances asked for on requests that are not rejected; an advance request may go up to total less this */
  advanceRequested: string;
  /** Advance taken off its bills so far (bills not rejected) */
  advanceAdjusted: string;
}

/** An approved, open PO line with what is still to be received (GRN against a PO). */
export interface ReceivableOrderDto {
  id: string;
  poNo: string;
  projectId: string;
  projectName: string;
  vendorId: string;
  vendorName: string;
  deliveryBy: string | null;
  lines: { purchaseOrderLineId: string; itemName: string; specification: string | null; unit: string; ordered: string; received: string; pending: string }[];
}

export interface VendorBillLineDto {
  id: string;
  /** PO bills: the PO line billed; null on hire, service and other bills (v5 item 91) */
  purchaseOrderLineId: string | null;
  /** The PO line's item, or the line's own description */
  itemName: string;
  unit: string;
  quantity: string;
  rate: string;
  gstRate: string;
  amount: string;
  gstAmount: string;
  /** From the PO and its GRNs, for the match; null on a line without a PO */
  poRate: string | null;
  poGstRate: string | null;
  receivedQty: string | null;
  /** Billed on the vendor's other bills against this line (not rejected) */
  billedElsewhere: string | null;
  /** Hire bills: 0 the hire line, 1 the minimum-hours top-up, 10 on the lines typed in (v5 item 91) */
  sortOrder: number;
}

/** A machine log or job card billed on a hire or service bill (v5 item 91). */
export interface VendorBillSourceDto {
  id: string;
  /** The log's date, or the job's number */
  label: string;
  date: string;
  /** Hours worked (a log), or the job's description */
  detail: string;
  /** A log's hours worked or a job's labour and parts */
  quantity: string | null;
  amount: string | null;
}

export interface VendorBillDto extends SubmissionBase {
  billNo: string;
  vendorId: string;
  vendorName: string;
  vendorGstin: string | null;
  vendorMsme: MsmeCategory | null;
  /** What the bill is against (v5 item 91) */
  kind: VendorBillKind;
  /** PO bills only */
  purchaseOrderId: string | null;
  poNo: string | null;
  /** HIRE: the machine and the month (its first day) */
  equipmentId: string | null;
  equipmentCode: string | null;
  equipmentName: string | null;
  hireMonth: string | null;
  /** HIRE: diesel we issued to an owner-fuelled machine, recovered at fuelRate a litre */
  fuelLitres: string;
  fuelRate: string;
  fuelRecovery: string;
  /** OTHER: the cost head */
  expenseCategory: ExpenseCategory | null;
  /** Debit notes against it that are not cancelled */
  debitNoteAmount: string;
  /** HIRE: the logs it billed; SERVICE: the job cards. Only on GET /vendor-bills/:id */
  sources?: VendorBillSourceDto[];
  invoiceNo: string;
  invoiceDate: string;
  dueDate: string;
  freight: string;
  subtotal: string;
  gstAmount: string;
  total: string;
  matched: boolean;
  exceptions: string[];
  remarks: string | null;
  lines: VendorBillLineDto[];
  /** Advance paid on the PO taken off this bill (v5 item 90) */
  advanceAdjusted: string;
  /** What the bill asks to be paid: total less advanceAdjusted, fuel recovered and debit notes */
  payable: string;
  /** Advance paid on the PO, and how much of it is not yet taken off its other bills (not rejected) */
  poAdvancePaid: string;
  poAdvanceAvailable: string;
  /** Settled by payments (paid plus deducted at payment) */
  paidAmount: string;
  /** What is still to pay: payable less paidAmount */
  outstanding: string;
  /** The day it was paid in full */
  paidDate: string | null;
}

/* ---------- subcontractor work orders and bills (v3 item 22) ---------- */

export interface WorkOrderLineDto {
  id: string;
  /** The BOQ item it is measured against; null for the work order's own item */
  boqItemId: string | null;
  itemNo: string | null;
  description: string;
  unit: string;
  quantity: string;
  rate: string;
  amount: string;
  /** BOQ items: approved measurements of their work under this order */
  measuredQty: string;
  /** Up to date on their bills that are not rejected */
  billedQty: string;
}

export interface WorkOrderDto extends SubmissionBase {
  woNo: string;
  woDate: string;
  vendorId: string;
  vendorName: string;
  vendorGstin: string | null;
  vendorPan: string | null;
  vendorMsme: MsmeCategory | null;
  title: string;
  startDate: string | null;
  endDate: string | null;
  gstRate: string;
  retentionPct: string;
  advanceAmount: string;
  advanceRecoveryPct: string;
  /** Advance recovered on their bills so far (not rejected) */
  advanceRecovered: string;
  /** Advances paid against the order (v5 item 90); once any is paid, recovery is capped at this instead of advanceAmount */
  advancePaid: string;
  /** Advances asked for on requests that are not rejected */
  advanceRequested: string;
  tdsPct: string;
  paymentDays: number | null;
  /** Sum of the lines before GST */
  value: string;
  terms: string | null;
  remarks: string | null;
  closedAt: string | null;
  closeNote: string | null;
  /** Approved and not closed: measurements, issues and bills can be made against it */
  open: boolean;
  /** Work value billed so far (bills not rejected), and as a share of the order value */
  billedAmount: string;
  billedPct: number;
  lines: WorkOrderLineDto[];
  /** Only on GET /work-orders/:id */
  bills?: { id: string; billNo: number; label: string; isFinal: boolean; billDate: string; grossAmount: string; netPayable: string; status: SubmissionStatus }[];
}

export interface SubcontractBillLineDto {
  id: string;
  workOrderLineId: string;
  boqItemId: string | null;
  itemNo: string | null;
  description: string;
  unit: string;
  /** Quantity on the work order */
  woQty: string;
  rate: string;
  prevQty: string;
  thisQty: string;
  uptoQty: string;
  prevAmount: string;
  amount: string;
  uptoAmount: string;
  /** Up to date beyond the work order quantity ("0" when within it) */
  excessQty: string;
}

export interface SubcontractBillMaterialDto {
  itemId: string;
  itemName: string;
  unit: string;
  quantity: string;
  rate: string;
  amount: string;
}

export interface SubcontractBillDeductionDto {
  key: 'retention' | 'advanceRecovery' | 'tds' | 'material' | 'excessMaterial' | 'other';
  label: string;
  /** Percentage of the work value, for the percentage deductions */
  pct: string | null;
  amount: string;
}

export interface SubcontractBillDto extends SubmissionBase {
  billNo: number;
  /** "WO-2026-0003 bill 2" */
  label: string;
  isFinal: boolean;
  workOrderId: string;
  woNo: string;
  woTitle: string;
  vendorId: string;
  vendorName: string;
  vendorGstin: string | null;
  vendorPan: string | null;
  vendorMsme: MsmeCategory | null;
  billDate: string;
  measuredUpTo: string;
  invoiceNo: string | null;
  dueDate: string;
  grossPrevious: string;
  grossAmount: string;
  grossUpto: string;
  gstRate: string;
  gstAmount: string;
  retentionPct: string;
  advanceRecoveryPct: string;
  tdsPct: string;
  materialRecovery: string;
  /** Material used beyond the norm and its wastage, from the reconciliation (v5 item 92) */
  excessRecovery: string;
  otherDeduction: string;
  otherDeductionNote: string | null;
  deductions: SubcontractBillDeductionDto[];
  totalDeductions: string;
  netPayable: string;
  /** Debit notes against it that are not cancelled (v5 item 91) */
  debitNoteAmount: string;
  /** Settled by payments (paid plus deducted at payment) */
  paidAmount: string;
  /** What is still to pay: net payable less debit notes and paidAmount */
  outstanding: string;
  /** The day it was paid in full */
  paidDate: string | null;
  remarks: string | null;
  measurementCount: number;
  issueCount: number;
  lines: SubcontractBillLineDto[];
  materials: SubcontractBillMaterialDto[];
  /** Only on GET /subcontract-bills/:id: the measurements and issues it took */
  measurements?: { id: string; mbNo: string; date: string; boqItemNo: string; unit: string; location: string; totalQty: string }[];
  issues?: { id: string; entryNo: string; date: string; lines: number }[];
}

/** Client rate against the subcontract rate of one BOQ item, from approved work orders. */
export interface WorkOrderMarginDto {
  boqItemId: string;
  itemNo: string;
  description: string;
  unit: string;
  boqQty: string;
  clientRate: string;
  /** Average subcontract rate, weighted by work order quantity */
  subRate: string;
  margin: string;
  /** Margin as a share of the client rate */
  marginPct: number;
  workOrders: { id: string; woNo: string; vendorName: string; quantity: string; rate: string }[];
}

/* ---------- payables (v3 item 23) ---------- */

export type PayableBillType = 'VENDOR_BILL' | 'SUBCONTRACT_BILL';

/** A request to pay a bill or release an advance (v5 item 90), approved through the matrix before accounts pays. */
export interface PaymentRequestDto extends SubmissionBase {
  /** PR-2026-0001 */
  requestNo: string;
  kind: PaymentRequestKind;
  projectCode: string;
  vendorId: string;
  vendorName: string;
  vendorMsme: MsmeCategory | null;
  /** Exactly one, by kind */
  vendorBillId: string | null;
  subcontractBillId: string | null;
  purchaseOrderId: string | null;
  workOrderId: string | null;
  /** What it pays: "VB-2026-0004", "WO-2026-0002 bill 3", "PO-2026-0007" */
  targetLabel: string;
  /** A bill's payable, or an order's value */
  targetValue: string;
  /**
   * What this request may ask for: a bill's outstanding less other open requests on it, or the order value less other
   * advances asked for. Only on GET /payment-requests/:id (null in lists).
   */
  targetOpen: string | null;
  /** A bill's due date */
  dueDate: string | null;
  amount: string;
  mode: PaymentMode;
  neededBy: string | null;
  reason: string | null;
  /** Settled by payments drawing on it (paid plus deducted) */
  paidAmount: string;
  /** Approved and not yet paid: amount less paidAmount ("0" otherwise) */
  outstanding: string;
  /** The day it was paid in full */
  paidDate: string | null;
}

/** A line of a debit note: quantity × rate, or a lump sum. */
export interface DebitNoteLineDto {
  id: string;
  description: string;
  quantity: string | null;
  unit: string | null;
  rate: string | null;
  amount: string;
  gstRate: string;
  gstAmount: string;
}

/**
 * What we take off an approved vendor or subcontract bill (v5 item 91): DN-2026-0001. Not approved separately (it is
 * raised by those who record bills); a cancelled note no longer reduces the bill.
 */
export interface DebitNoteDto {
  id: string;
  noteNo: string;
  date: string;
  reason: DebitNoteReason;
  projectId: string;
  projectCode: string;
  projectName: string;
  vendorId: string;
  vendorName: string;
  vendorGstin: string | null;
  billType: PayableBillType;
  vendorBillId: string | null;
  subcontractBillId: string | null;
  /** "VB-2026-0004 · INV/551", or "WO-2026-0002 bill 3" */
  billLabel: string;
  /** The GRN it came from (rejected at QA/QC or returned) */
  stockEntryId: string | null;
  stockEntryNo: string | null;
  subtotal: string;
  gstAmount: string;
  total: string;
  remarks: string | null;
  createdById: string;
  createdByName: string;
  createdAt: string;
  cancelledAt: string | null;
  cancelledByName: string | null;
  cancelNote: string | null;
  /** In a Tally export: cannot be cancelled until that export is undone */
  exportedToTally: boolean;
  lines: DebitNoteLineDto[];
}

/** What a hire bill for one machine, project and month would hold (GET /vendor-bills/hire-preview, v5 item 91). */
export interface HireBillPreviewDto {
  equipmentId: string;
  equipmentCode: string;
  equipmentName: string;
  vendorId: string | null;
  vendorName: string | null;
  projectId: string;
  /** First day of the month */
  month: string;
  rate: string | null;
  rateUnit: EquipmentRateUnit;
  hireMinHours: string | null;
  hireFuelBy: HireFuelBy | null;
  hireOperator: boolean | null;
  /** Approved logs of the month on the project not on another bill (not rejected) */
  logs: { id: string; date: string; hoursWorked: string; idleHours: string; breakdownHours: string; dieselLitres: string | null }[];
  /** Approved logs of the month still waiting or in draft, which a bill now would leave out */
  pendingLogs: number;
  workedHours: string;
  workedDays: number;
  /** Hours, days or 1 month, by the rate unit */
  hireQuantity: string;
  /** Hours paid for though not worked: the minimum less hours worked */
  minTopUpHours: string;
  /** Diesel in the logs, recovered when the owner fuels the machine */
  fuelLitres: string;
  /** A bill for the machine and month already (not rejected) */
  existingBill: { id: string; billNo: string } | null;
}

/** A closed job card a workshop can bill (GET /vendor-bills/billable-jobs, v5 item 91). */
export interface BillableJobDto {
  id: string;
  jobNo: string;
  date: string;
  closedDate: string | null;
  equipmentCode: string;
  equipmentName: string;
  description: string;
  workshop: string | null;
  labourCost: string;
  partsCost: string;
}

/** The latest open payment request on a bill (not rejected, not yet paid in full). */
export interface BillRequestDto {
  id: string;
  requestNo: string;
  status: SubmissionStatus;
  amount: string;
  /** Approved and not yet paid */
  unpaid: string;
}

export interface VendorPaymentDto {
  id: string;
  /** In a Tally export: cannot be changed until that export is undone */
  exportedToTally: boolean;
  projectId: string;
  projectCode: string;
  projectName: string;
  vendorId: string;
  vendorName: string;
  /** null for an advance (v5 item 90), which is paid against the order */
  billType: PayableBillType | null;
  vendorBillId: string | null;
  subcontractBillId: string | null;
  purchaseOrderId: string | null;
  workOrderId: string | null;
  /** "VB-2026-0004", "WO-2026-0002 bill 3", or for an advance "Advance on PO-2026-0007" */
  billLabel: string;
  /** The approved payment request it drew on */
  paymentRequestId: string | null;
  requestNo: string | null;
  paymentDate: string;
  amount: string;
  mode: PaymentMode;
  reference: string | null;
  tdsAmount: string;
  otherDeduction: string;
  otherDeductionNote: string | null;
  /** amount + tdsAmount + otherDeduction */
  settledAmount: string;
  remarks: string | null;
  createdByName: string;
  createdAt: string;
}

/** Outstanding by how far past its due date: not yet due, then days overdue. */
export interface PayableAgeingDto {
  notDue: string;
  days1to30: string;
  days31to60: string;
  days61to90: string;
  over90: string;
}

export interface PayableTotalsDto {
  /** Approved bills: what they say is payable */
  billed: string;
  paid: string;
  /** Deducted at payment (TDS and other) */
  deducted: string;
  outstanding: string;
  overdue: string;
  /** Falls due in the next 7 days */
  dueSoon: string;
  ageing: PayableAgeingDto;
  /** Outstanding to micro and small enterprises due within 7 days or overdue (MSMED Act: 45 days at most) */
  msmeAtRisk: string;
  /** Retention kept from subcontractors on their approved bills */
  retentionHeld: string;
  /** TDS deducted: on subcontractor bills and at payment */
  tdsDeducted: string;
  /** Advances paid against orders not yet taken off their bills (v5 item 90) */
  advanceOutstanding: string;
}

export interface VendorPayableDto extends PayableTotalsDto {
  vendorId: string;
  vendorName: string;
  vendorMsme: MsmeCategory | null;
  openBills: number;
}

export interface ProjectPayableDto extends PayableTotalsDto {
  projectId: string;
  projectCode: string;
  projectName: string;
}

/** An approved bill with something still to pay: the due list. */
export interface PayableBillDto {
  billType: PayableBillType;
  billId: string;
  billLabel: string;
  vendorId: string;
  vendorName: string;
  vendorMsme: MsmeCategory | null;
  projectId: string;
  projectCode: string;
  projectName: string;
  /** Invoice date (vendor bills) or bill date (subcontractor bills) */
  billDate: string;
  dueDate: string;
  payable: string;
  paid: string;
  outstanding: string;
  /** Days until due; negative when overdue */
  daysToDue: number;
  /** A micro or small enterprise whose bill is due within 7 days or overdue */
  msmeFlag: boolean;
  /** The latest payment request on it that is open (v5 item 90) */
  request: BillRequestDto | null;
}

export interface PayablesDto {
  asOf: string;
  totals: PayableTotalsDto;
  vendors: VendorPayableDto[];
  projects: ProjectPayableDto[];
  /** Most urgent first: overdue longest, then due soonest */
  openBills: PayableBillDto[];
  /** Accounts pays a bill only against an approved payment request */
  paymentsNeedRequest: boolean;
}

// ----- Tally export -----

export interface TallyEntryDto {
  ledgerKey: string;
  ledger: string;
  debit: string | null;
  credit: string | null;
}

/** A Nirmaan record as the Tally voucher it becomes. */
export interface TallyVoucherDto {
  /** `<kind>:<source id>` */
  key: string;
  kind: TallyVoucherKind;
  sourceId: string;
  date: string;
  /** Voucher number: the bill number, or a number made from the receipt or payment */
  number: string;
  party: string;
  projectCode: string;
  projectName: string;
  /** Total of the debits (= the credits) */
  amount: string;
  narration: string;
  entries: TallyEntryDto[];
}

/** A record that cannot go yet, and why. */
export interface TallyHeldDto {
  kind: TallyVoucherKind;
  sourceId: string;
  date: string;
  number: string;
  party: string;
  reason: string;
}

export interface TallyPreviewDto {
  upTo: string;
  from: string | null;
  /** Not yet exported, dated in the range, oldest first */
  vouchers: TallyVoucherDto[];
  held: TallyHeldDto[];
  counts: Partial<Record<TallyVoucherKind, number>>;
  /** Approved RA bills not yet certified by the client: they go once certified */
  awaitingCertification: number;
}

export interface TallyExportDto {
  id: string;
  upTo: string;
  fromDate: string | null;
  voucherCount: number;
  counts: Partial<Record<TallyVoucherKind, number>>;
  createdByName: string;
  createdAt: string;
}

export type TallyLedgerKind = 'FIXED' | 'CLIENT' | 'VENDOR' | 'EXPENSE';

export interface TallyLedgerRowDto {
  key: string;
  kind: TallyLedgerKind;
  /** What Nirmaan posts to it, or the client, vendor or category it stands for */
  use: string;
  defaultName: string;
  /** The Tally ledger name set for it; null uses the default */
  name: string | null;
  group: string;
}

export interface TallySettingsDto {
  companyName: string | null;
  stateCode: string | null;
  costCentres: boolean;
  ledgers: TallyLedgerRowDto[];
}

// ----- GST registers -----

/** GSTR-1 section an RA bill falls in: B2B to a registered client, B2CS (small, unregistered) otherwise. */
export type GstOutwardSection = 'B2B' | 'B2CS';

/** An approved RA bill as an outward supply (one row per bill: a bill has one GST rate). */
export interface GstOutwardRowDto {
  billId: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  /** "RA/BL-2026-02/3", the number the Tally export uses (GST allows at most 16 characters) */
  invoiceNo: string;
  invoiceDate: string;
  section: GstOutwardSection;
  recipientGstin: string | null;
  recipientName: string;
  /** GST state code of the place of supply (where the site is) */
  placeOfSupply: string | null;
  rate: string;
  taxable: string;
  igst: string;
  cgst: string;
  sgst: string;
  invoiceValue: string;
}

/** DEBIT_NOTE rows are negative: a note against a bill reverses its input tax (v5 item 91). */
export type GstInwardSource = 'VENDOR_BILL' | 'SUBCONTRACT_BILL' | 'EXPENSE' | 'DEBIT_NOTE';

/** A purchase with GST, one row per invoice and rate, laid out like GSTR-2B. */
export interface GstInwardRowDto {
  key: string;
  source: GstInwardSource;
  sourceId: string;
  /** Nirmaan number: VB-2026-0004, "WO-2026-0001 bill 2", EXP-2026-0012 */
  ref: string;
  projectCode: string;
  projectName: string;
  supplierGstin: string | null;
  supplierName: string;
  invoiceNo: string | null;
  invoiceDate: string;
  invoiceValue: string;
  rate: string;
  taxable: string;
  igst: string;
  cgst: string;
  sgst: string;
  /** Input tax can be claimed only on an invoice with the supplier's GSTIN */
  itcEligible: boolean;
}

export interface GstTaxTotalsDto {
  taxable: string;
  igst: string;
  cgst: string;
  sgst: string;
  tax: string;
}

export interface GstRegistersDto {
  from: string;
  to: string;
  /** GST state code the company bills from (Tally settings); null when not set */
  stateCode: string | null;
  outward: GstOutwardRowDto[];
  outwardTotals: GstTaxTotalsDto;
  inward: GstInwardRowDto[];
  /** Eligible input tax only */
  inwardTotals: GstTaxTotalsDto;
  /** GST paid on purchases without the supplier's GSTIN (not claimable) */
  ineligibleTax: string;
  warnings: string[];
}

/* ---------- Quality ---------- */

export interface ChecklistTemplateDto {
  id: string;
  name: string;
  items: string[];
  /** Activities (across projects) that start their inspections from it */
  activityCount: number;
  updatedAt: string;
}

/** Inspection request: SUBMITTED = requested, APPROVED = passed, REJECTED = failed, CHANGES_REQUESTED = re-inspect. */
export interface InspectionDto extends SubmissionBase {
  inspectionNo: string;
  activityId: string;
  activityName: string;
  /** The activity is a hold point: its progress waits for a passed inspection */
  holdPoint: boolean;
  /** The date the work is ready for inspection */
  date: string;
  location: string;
  remarks: string | null;
  checklistName: string | null;
  checklist: InspectionCheck[];
}

export interface QualityTestReadingDto {
  id: string;
  /** "7 days", "28 days" or "Result" */
  label: string;
  dueOn: string | null;
  /** Decimal string, empty until tested */
  value: string | null;
  testedOn: string | null;
  remarks: string | null;
  /** Due before today and not recorded yet */
  overdue: boolean;
}

/** A quality test: a sample, its specification and readings. The last reading decides the result. */
export interface QualityTestDto {
  id: string;
  projectId: string;
  projectName: string;
  activityId: string | null;
  activityName: string | null;
  testNo: string;
  kind: TestKind;
  title: string;
  location: string | null;
  sampledOn: string;
  specification: string | null;
  unit: string | null;
  specMin: string | null;
  specMax: string | null;
  result: TestResult;
  remarks: string | null;
  readings: QualityTestReadingDto[];
  /** The earliest reading still to be recorded */
  nextDueOn: string | null;
  overdue: boolean;
  openNcrs: number;
  createdById: string;
  createdByName: string;
  attachments: AttachmentDto[];
  createdAt: string;
  updatedAt: string;
}

/** Non-conformance report: raised by QA/QC, cause and corrective action recorded by site, closed by QA/QC. */
export interface NcrDto {
  id: string;
  projectId: string;
  projectName: string;
  ncrNo: string;
  raisedOn: string;
  title: string;
  description: string;
  location: string | null;
  severity: NcrSeverity;
  status: NcrStatus;
  activityId: string | null;
  activityName: string | null;
  inspectionId: string | null;
  inspectionNo: string | null;
  qualityTestId: string | null;
  testNo: string | null;
  raisedById: string;
  raisedByName: string;
  actionById: string | null;
  actionByName: string | null;
  dueDate: string | null;
  /** Not closed and past its due date */
  overdue: boolean;
  cause: string | null;
  correctiveAction: string | null;
  preventiveAction: string | null;
  actionAt: string | null;
  closedById: string | null;
  closedByName: string | null;
  closedAt: string | null;
  closureNote: string | null;
  attachments: AttachmentDto[];
  createdAt: string;
  updatedAt: string;
}

/** Counts for the Quality page tabs and the project. */
export interface QualitySummaryDto {
  inspectionsWaiting: number;
  testsPending: number;
  testsOverdue: number;
  testsFailed: number;
  ncrsOpen: number;
  ncrsOverdue: number;
}

/* ---------- document register ---------- */

/** One revision of a drawing or document with its files. */
export interface DocumentRevisionDto {
  id: string;
  documentId: string;
  revision: string;
  issuedOn: string;
  status: RevisionStatus;
  receivedFrom: string | null;
  remarks: string | null;
  issuedById: string;
  issuedByName: string;
  /** The latest revision added; the others are superseded */
  current: boolean;
  attachments: AttachmentDto[];
  /** Transmittals it was sent on (document detail only) */
  transmittals: { id: string; transmittalNo: string; toParty: string; sentOn: string }[];
  createdAt: string;
}

export interface DocumentDto {
  id: string;
  projectId: string;
  projectName: string;
  docNo: string;
  title: string;
  kind: DocumentKind;
  discipline: DocumentDiscipline;
  remarks: string | null;
  /** The current revision, null until the first one is added */
  current: DocumentRevisionDto | null;
  revisionCount: number;
  createdById: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentDetailDto extends DocumentDto {
  /** Newest first */
  revisions: DocumentRevisionDto[];
}

export interface TransmittalItemDto {
  id: string;
  revisionId: string;
  documentId: string;
  docNo: string;
  title: string;
  revision: string;
  status: RevisionStatus;
  copies: number;
}

export interface TransmittalDto {
  id: string;
  projectId: string;
  projectName: string;
  projectCode: string;
  transmittalNo: string;
  toParty: string;
  attention: string | null;
  purpose: TransmittalPurpose;
  sentOn: string;
  remarks: string | null;
  acknowledgedOn: string | null;
  acknowledgedBy: string | null;
  sentById: string;
  sentByName: string;
  items: TransmittalItemDto[];
  createdAt: string;
  updatedAt: string;
}

export interface LetterRefDto {
  id: string;
  letterNo: string;
  direction: LetterDirection;
  letterDate: string;
  subject: string;
}

/** Where a search inside the filed documents found its words (Ask the contract, AI item 75). */
export interface DocumentSearchHitDto {
  source: 'DOCUMENT' | 'LETTER';
  projectId: string;
  title: string;
  kind: string;
  /** 1-based; null for a letter's own subject and summary */
  page: number | null;
  pages: number | null;
  date: string | null;
  /** Opens the PDF at the page (`/documents/view?file=…&page=…`), or the letter */
  href: string;
  text: string;
}

export interface DocumentSearchResultDto {
  hits: DocumentSearchHitDto[];
  /** Files in these projects not read yet */
  unread: number;
}

/** One page of a filed PDF, for the page an answer's citation opens. */
export interface DocumentPageViewDto {
  attachmentId: string;
  fileName: string;
  url: string;
  page: number;
  /** Pages with text; 0 when the file has not been read or has no text (a scan) */
  pages: number;
  title: string;
  recordHref: string;
  text: string | null;
  /** Why the file could not be read, when it could not */
  readError: string | null;
}

export interface LetterDto {
  id: string;
  projectId: string;
  projectName: string;
  direction: LetterDirection;
  letterNo: string;
  theirRef: string | null;
  letterDate: string;
  party: string;
  subject: string;
  summary: string | null;
  replyBy: string | null;
  /** Received, a reply is due and none has been sent */
  awaitingReply: boolean;
  /** Awaiting a reply past `replyBy` */
  overdue: boolean;
  inReplyTo: LetterRefDto | null;
  replies: LetterRefDto[];
  riskId: string | null;
  riskNo: string | null;
  riskTitle: string | null;
  createdById: string;
  createdByName: string;
  attachments: AttachmentDto[];
  createdAt: string;
  updatedAt: string;
}

/** Counts for the Documents page and the project tab. */
export interface DocumentSummaryDto {
  documents: number;
  /** Current revision is for approval: waiting on the consultant or client */
  awaitingApproval: number;
  /** Transmittals not yet acknowledged */
  unacknowledged: number;
  /** Letters received that need a reply (null when the user cannot see letters) */
  lettersAwaitingReply: number | null;
  lettersOverdue: number | null;
}

/* ---------- staff and leave (v3 item 29) ---------- */

export interface EmployeeDto {
  id: string;
  employeeCode: string;
  fullName: string;
  designation: string;
  department: string | null;
  phone: string | null;
  /** Their login, when they have one */
  userId: string | null;
  userEmail: string | null;
  /** Posting; null = head office */
  projectId: string | null;
  projectName: string | null;
  joinedOn: string | null;
  leftOn: string | null;
  isActive: boolean;
}

export interface StaffAttendanceDto {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  date: string;
  projectId: string | null;
  projectName: string | null;
  status: StaffAttendanceStatus;
  /** ISO timestamps when they checked in and out themselves */
  checkIn: string | null;
  checkOut: string | null;
  /** Decimal(4,1) as a string */
  overtimeHours: string | null;
  note: string | null;
  markedByName: string;
}

export interface StaffRegisterRowDto {
  employee: EmployeeDto;
  attendance: StaffAttendanceDto | null;
  /** Approved or waiting leave covering the day */
  leave: { id: string; type: LeaveType; status: LeaveStatus; halfDay: boolean } | null;
}

/** One site's staff for one day. */
export interface StaffRegisterDto {
  date: string;
  projectId: string;
  /** Holiday name when the day is a holiday at this site */
  holiday: string | null;
  weeklyOff: boolean;
  rows: StaffRegisterRowDto[];
}

export interface LeaveRequestDto {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  designation: string;
  /** The employee's posting */
  projectId: string | null;
  projectName: string | null;
  type: LeaveType;
  fromDate: string;
  toDate: string;
  halfDay: boolean;
  /** Working days, Decimal(4,1) as a string */
  days: string;
  reason: string;
  status: LeaveStatus;
  appliedByName: string;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
  /** The caller may approve or reject it */
  canDecide: boolean;
  /** The caller may cancel it (their own or a staff admin, before it starts) */
  canCancel: boolean;
}

export interface LeaveBalanceDto {
  type: LeaveType;
  /** Days for the year; comp-off = weekly offs and holidays worked; null = no limit */
  entitled: number | null;
  taken: number;
  pending: number;
  /** null = no limit */
  left: number | null;
}

export interface HolidayDto {
  id: string;
  /** null = every site */
  projectId: string | null;
  projectName: string | null;
  date: string;
  name: string;
}

/** The signed-in user's own staff record: today's attendance, leave balances and requests. */
export interface MyStaffDto {
  /** null when the login is not linked to an employee */
  employee: EmployeeDto | null;
  today: StaffAttendanceDto | null;
  /** Holiday name or 'Sunday' when today is off */
  todayOff: string | null;
  year: number;
  balances: LeaveBalanceDto[];
  leave: LeaveRequestDto[];
  holidays: HolidayDto[];
}

export interface StaffSummaryDto {
  /** Leave requests waiting on the caller */
  leaveToDecide: number;
  /** Active employees the caller can see (null when they cannot see the staff list) */
  employees: number | null;
  onLeaveToday: number | null;
}

/* ---------- payroll inputs (v3 item 30) ---------- */

/** One employee's month, as the payroll provider needs it. Days are numbers (halves allowed). */
export interface PayrollRowDto {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  designation: string;
  department: string | null;
  projectId: string | null;
  projectName: string | null;
  joinedOn: string | null;
  leftOn: string | null;
  /** Days of the month they were on the rolls */
  calendarDays: number;
  /** Sundays and holidays among them */
  offDays: number;
  workingDays: number;
  present: number;
  /** Approved leave days by type (working days only) */
  leave: Record<LeaveType, number>;
  absent: number;
  /** Working days up to today with neither attendance nor approved leave (not deducted) */
  notMarked: number;
  /** Sundays and holidays worked (comp-off earned) */
  offDaysWorked: number;
  overtimeHours: number;
  /** Loss of pay: absent, unpaid leave and the other half of half days */
  lopDays: number;
  /** calendarDays - lopDays */
  paidDays: number;
}

export interface PayrollDto {
  month: string;
  from: string;
  to: string;
  rows: PayrollRowDto[];
}

/** Man-days of one trade from one labour contractor at one project in a month (from the attendance register). */
export interface ContractorMonthRowDto {
  contractor: string;
  vendorId: string | null;
  projectId: string;
  projectCode: string;
  projectName: string;
  category: string;
  manDays: number;
  /** Days with a sheet that had this trade */
  days: number;
  /** The organisation's daily rate for the trade (null = no rate set) */
  dailyRate: string | null;
  amount: string | null;
  /** The contractor has an approved work order on the project, so they are paid through their bills */
  onWorkOrder: boolean;
}

export interface ContractorMonthDto {
  month: string;
  from: string;
  to: string;
  rows: ContractorMonthRowDto[];
}
