import type { ApprovalRightDto } from './approvals';
import type {
  BillStage,
  ReceiptKind,
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
  /** Password-reset emails can be sent (email provider and web address configured). */
  resetByEmail: boolean;
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
  dprsToday: number;
  /** Only for roles that see bills */
  receivables?: { outstanding: string; over90: string; openBills: number };
  projects: ProjectSummary[];
}

export interface ProjectDashboard {
  project: ProjectSummary;
  physicalProgressPct: number;
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
  /** Set when the notification points at a submission; open it with entityType + entityId. */
  entityType: SubmissionType | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListDto {
  items: NotificationDto[];
  unreadCount: number;
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
  job: 'DPR_REMINDER' | 'APPROVAL_DIGEST';
  date: string;
  created: number;
  pushed: number;
  emailed: number;
  skipped: number;
}

export interface AttendanceLineDto {
  id: string;
  contractor: string;
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
  supplier: string | null;
  challanNo: string | null;
  vehicleNo: string | null;
  issuedTo: string | null;
  activityId: string | null;
  activityName: string | null;
  remarks: string | null;
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
  received: string;
  issued: string;
  adjusted: string;
  balance: string;
  minQty: string | null;
  low: boolean;
  lastMovement: string | null;
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
  registrationNo: string | null;
  /** Only returned to roles that manage equipment (rates are commercial); null otherwise. */
  rate: string | null;
  rateUnit: EquipmentRateUnit;
  projectId: string | null;
  projectName: string | null;
  isActive: boolean;
  /** Date of the latest log, any status except rejected. */
  lastLogDate: string | null;
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
  meterStart: string | null;
  meterEnd: string | null;
  operatorName: string | null;
  activityId: string | null;
  activityName: string | null;
  workDone: string | null;
  breakdownNote: string | null;
  remarks: string | null;
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
  date: string;
  boqItemId: string;
  boqItemNo: string;
  boqDescription: string;
  unit: string;
  rate: string;
  location: string;
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
  material: string;
  machinery: string;
  labour: string;
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
  /** Approved RA bills dated in the period: value of work (before GST) */
  billedValue: string;
  /** Received from the client in the period (bank credits, all receipts) */
  cashIn: string;
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
}

/* ---------- clients and contracts ---------- */

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
  priceVariation: boolean;
  gstRate: string;
  tdsPct: string;
  gstTdsPct: string;
  labourCessPct: string;
  updatedAt: string;
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

export interface RaBillDto extends SubmissionBase {
  billNo: number;
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
  gstRate: string;
  gstAmount: string;
  /** Retention, security deposit, advance recovery, TDS, GST TDS, labour cess and any other deduction, in that order (zero ones left out) */
  deductions: RaBillDeductionDto[];
  otherDeduction: string;
  otherDeductionNote: string | null;
  totalDeductions: string;
  /** gross + GST - deductions */
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
  /** Work value + GST: what the client owes before its deductions */
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
