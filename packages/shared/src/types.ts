import type {
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
