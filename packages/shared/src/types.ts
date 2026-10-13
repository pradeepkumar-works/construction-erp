import type {
  MaterialPriority,
  ProjectStatus,
  ProjectType,
  RoleKey,
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

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
