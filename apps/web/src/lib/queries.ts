'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import type {
  DocReadKind,
  DocReadResultDto,
  DraftChecksDto,
  BillChecksDto,
  WatchListDto,
  BriefStatusDto,
  BillCheckSummaryDto,
  CheckKind,
  AiSettingsDto,
  AiConversationDetailDto,
  AiConversationDto,
  AiStatusDto,
  AiThreadDto,
  SavedViewDto,
  SearchResultDto,
  SavedViewList,
  SavedViewState,
  DefectDto,
  DefectPhase,
  HandoverSummaryDto,
  GrnQcStatus,
  LdExposureDto,
  ProcurementStatusDto,
  UnitDto,
  DriverDto,
  GanttDto,
  EquipmentDocType,
  EquipmentDocumentDto,
  ExpiryState,
  MaintenanceJobDto,
  MaintenanceKind,
  MaintenanceStatus,
  MaintenanceSummaryDto,
  SectorProgressDto,
  VariationDto,
  VariationStatus,
  VariationSummaryDto,
  BillingDetailsDto,
  BillingInvoiceDto,
  BillingOrderDto,
  BillingSummaryDto,
  CompanyDeletionDto,
  CompanyLogEntryDto,
  PlatformCompanyDetailDto,
  PlatformCompanyDto,
  SupportAccessDto,
  SupportSessionDto,
  CompanyExportManifestDto,
  ComparativeStatementDto,
  PurchaseOrderDto,
  QuotationDto,
  ReceivableOrderDto,
  VendorBillDto,
  WorkOrderDto,
  WorkOrderMarginDto,
  SubcontractBillDto,
  PayablesDto,
  VendorPaymentDto,
  ClientDto,
  MsmeCategory,
  UnlistedVendorDto,
  VendorDto,
  VendorKind,
  ProjectContractDto,
  GettingStartedDto,
  EquipmentDto,
  EquipmentOwnership,
  ExpenseCategory,
  ExpenseDto,
  ExpenseSummaryDto,
  DelaySuggestionDto,
  RiskCategory,
  RiskDto,
  RiskKind,
  RiskStatus,
  RiskSummaryDto,
  ActivityTemplateDto,
  ApprovalMatrixDto,
  AuthOptionsDto,
  MeasurementSheetDto,
  InspectionDto,
  ChecklistTemplateDto,
  RaBillDto,
  ReceiptDto,
  ReceivablesDto,
  ReceiptKind,
  BillStage,
  LabourRatesDto,
  ProjectCostDto,
  ProjectBudgetDto,
  ProjectReconciliationDto,
  MaterialNormDto,
  CashFlowDto,
  CashFlowGranularity,
  ProjectCostSummaryDto,
  ProgressReportDto,
  PaymentMode,
  ItemDto,
  MachineryLogDto,
  ReceivableRequestDto,
  StockBalanceDto,
  StockEntryDto,
  StockEntryType,
  StockValuationDto,
  ActivityDto,
  AttendanceDayDto,
  AttendanceSheetDto,
  AttendanceSuggestionsDto,
  ImprestDetailDto,
  ComplianceDocDetailDto,
  ComplianceDocKind,
  ComplianceDocStatus,
  ComplianceRegisterDto,
  ImprestDto,
  MusterDto,
  OutputDto,
  RollCallDto,
  WorkerDto,
  AttachmentDto,
  AuditLogDto,
  NcrDto,
  DocumentDto,
  DocumentDetailDto,
  DocumentSummaryDto,
  DocumentKind,
  DocumentDiscipline,
  RevisionStatus,
  TransmittalDto,
  LetterDto,
  LetterDirection,
  NcrSeverity,
  NcrStatus,
  QualitySummaryDto,
  QualityTestDto,
  TestKind,
  TestResult,
  BoqItemDto,
  CompanyDashboard,
  DailyReportDto,
  MaterialRequestDto,
  NotificationDto,
  NotificationListDto,
  NotificationTab,
  Paginated,
  PendingApprovalDto,
  ReviewedItemDto,
  MyWorkDto,
  HomeTrendsDto,
  ProgressEntryDto,
  ProjectDashboard,
  ProjectDetail,
  ProjectSummary,
  ReviewDecision,
  SubmissionStatus,
  SubmissionType,
  UserSummary,
  ProjectStatus,
  ProjectType,
  RoleKey,
  SortOrder,
  TallyExportDto,
  GstRegistersDto,
  TallyPreviewDto,
  TallySettingsDto,
  EmployeeDto,
  HolidayDto,
  LeaveBalanceDto,
  LeaveRequestDto,
  LeaveStatus,
  LeaveType,
  MyStaffDto,
  StaffAttendanceDto,
  StaffRegisterDto,
  StaffSummaryDto,
  PayrollDto,
  ContractorMonthDto,
  MessageChannel,
  MessagingPrefsDto,
  OutboundMessageDto,
  OutboundMessageStatus,
  PortalBillDto,
  PortalDprDto,
  PortalInspectionDto,
  PortalProjectDetailDto,
  PortalProjectDto,
  SafetyIncidentDto,
  SafetyIncidentStatus,
  SafetyIncidentType,
  SafetySummaryDto,
  PpeRegisterDto,
  RfiDto,
  RfiSummaryDto,
  RfiStatus,
  RfiPriority,
  RfiSortField,
  PortalRfiDto,
  PpeIssueDto,
  PpeIssueResultDto,
  PpeKind,
  PpeIssueStatus,
  ToolboxTalkDto,
  WorkPermitDto,
  WorkPermitStatus,
  WorkPermitType,
  DocumentPageViewDto,
  PhotoCheckKind,
  PhotoChecksDto,
  SnagDraftDto,
} from '@erp/shared';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, NOTIFICATION_TYPES_VERSION, SEARCH_MIN_LENGTH } from '@erp/shared';
import { api } from './api';
import { failNoticeSaying } from './notify';

export interface RoleDto {
  id: string;
  key: string;
  name: string;
}

export type ApprovalTypeParam = 'progress' | 'dpr' | 'material_request' | 'machinery' | 'expense' | 'measurement' | 'bill' | 'purchase_order' | 'vendor_bill' | 'work_order' | 'subcontract_bill' | 'inspection';

export const approvalTypeParam: Record<SubmissionType, ApprovalTypeParam> = {
  PROGRESS: 'progress',
  DPR: 'dpr',
  MATERIAL_REQUEST: 'material_request',
  MACHINERY: 'machinery',
  EXPENSE: 'expense',
  MEASUREMENT: 'measurement',
  BILL: 'bill',
  PURCHASE_ORDER: 'purchase_order',
  VENDOR_BILL: 'vendor_bill',
  WORK_ORDER: 'work_order',
  SUBCONTRACT_BILL: 'subcontract_bill',
  INSPECTION: 'inspection',
};

/** Paging, search and sort understood by every paged list endpoint. */
export interface PageParams {
  page?: number;
  pageSize?: number;
  q?: string;
  sortBy?: string;
  sortOrder?: SortOrder;
}

export interface ListFilters extends PageParams {
  projectId?: string;
  activityId?: string;
  status?: SubmissionStatus;
  mine?: boolean;
  /** YYYY-MM-DD, both ends included (DPR, progress, material requests). */
  from?: string;
  to?: string;
}

export interface ProjectFilters extends PageParams {
  status?: ProjectStatus;
  type?: ProjectType;
}

export interface UserFilters extends PageParams {
  roleKey?: RoleKey;
  isActive?: boolean;
}

export interface AttendanceFilters extends PageParams {
  projectId?: string;
  from?: string;
  to?: string;
}

export interface WorkerFilters extends PageParams {
  projectId?: string;
  contractor?: string;
  active?: boolean;
}

export interface StockEntryFilters extends PageParams {
  projectId?: string;
  type?: StockEntryType;
  itemId?: string;
  materialRequestId?: string;
  from?: string;
  to?: string;
  /** Receipts by QA/QC check; PENDING = not checked yet */
  qc?: GrnQcStatus | 'PENDING';
}

export interface StockBalanceFilters extends PageParams {
  projectId?: string;
  lowOnly?: boolean;
  inStock?: boolean;
}

export interface MachineryFilters extends ListFilters {
  equipmentId?: string;
  from?: string;
  to?: string;
  breakdownOnly?: boolean;
}

export interface EquipmentFilters extends PageParams {
  projectId?: string;
  ownership?: EquipmentOwnership;
  includeInactive?: boolean;
}

export interface ExpenseFilters extends ListFilters {
  category?: ExpenseCategory;
  paymentMode?: PaymentMode;
  from?: string;
  to?: string;
  noReceipt?: boolean;
}

export interface RiskFilters extends PageParams {
  projectId?: string;
  kind?: RiskKind;
  status?: RiskStatus;
  active?: boolean;
  category?: RiskCategory;
  mine?: boolean;
  minScore?: number;
  overdue?: boolean;
}

export interface MeasurementFilters extends ListFilters {
  boqItemId?: string;
  from?: string;
  to?: string;
}

export const clean = (f?: object) =>
  Object.fromEntries(Object.entries(f ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== ''));

/* ---------- records and lists by their page, so a hover can fetch them ahead ---------- */

/** Each record page's query: the route its links use, the API path, and the key its hook below reads. */
const RECORD_QUERIES = {
  '/progress': { key: (id: string) => ['progress', 'detail', id], path: '/progress' },
  '/dpr': { key: (id: string) => ['dpr', 'detail', id], path: '/dpr' },
  '/material-requests': { key: (id: string) => ['material-requests', 'detail', id], path: '/material-requests' },
  '/purchase-orders': { key: (id: string) => ['purchase-orders', 'detail', id], path: '/purchase-orders' },
  '/bills': { key: (id: string) => ['bills', 'detail', id], path: '/ra-bills' },
  '/machinery': { key: (id: string) => ['machinery', 'logs', 'detail', id], path: '/machinery-logs' },
  '/expenses': { key: (id: string) => ['expenses', 'detail', id], path: '/expenses' },
  '/measurements': { key: (id: string) => ['measurements', 'detail', id], path: '/measurements' },
  '/vendor-bills': { key: (id: string) => ['vendor-bills', 'detail', id], path: '/vendor-bills' },
  '/work-orders': { key: (id: string) => ['work-orders', 'detail', id], path: '/work-orders' },
  '/subcontract-bills': { key: (id: string) => ['subcontract-bills', 'detail', id], path: '/subcontract-bills' },
  '/inspections': { key: (id: string) => ['inspections', 'detail', id], path: '/inspections' },
  '/projects': { key: (id: string) => ['projects', id], path: '/projects' },
} satisfies Record<string, { key: (id: string) => QueryKey; path: string }>;
type RecordRoute = keyof typeof RECORD_QUERIES;

const recordQuery = <T>(route: RecordRoute, id: string | undefined) => ({
  queryKey: RECORD_QUERIES[route].key(id ?? ''),
  queryFn: async () => (await api.get<T>(`${RECORD_QUERIES[route].path}/${id}`)).data,
});

/** The query behind a link to a record's page (`/dpr/<id>`, `/projects/<id>?tab=boq`); null for any other link. */
export function recordQueryFor(href: string) {
  const m = href.match(/^(\/[a-z-]+)\/([0-9a-f-]{8,})(?:[?#].*)?$/i);
  if (!m || !(m[1] in RECORD_QUERIES)) return null;
  return recordQuery<unknown>(m[1] as RecordRoute, m[2]);
}

/**
 * Where each list the sidebar links to starts: page 1 in its default sort. Its page reads the sort from here, so the
 * query a hover fetches ahead is the very one the list then asks for (`key` + the cleaned filters, as its hook builds it).
 */
export const LIST_START = {
  '/dpr': { key: ['dpr'], path: '/dpr', sortBy: 'date', sortOrder: 'desc', projectScoped: true },
  '/progress': { key: ['progress'], path: '/progress', sortBy: 'date', sortOrder: 'desc', projectScoped: true },
  '/material-requests': { key: ['material-requests'], path: '/material-requests', sortBy: 'createdAt', sortOrder: 'desc', projectScoped: true },
  '/bills': { key: ['bills'], path: '/ra-bills', sortBy: 'billDate', sortOrder: 'desc', projectScoped: true },
  '/expenses': { key: ['expenses'], path: '/expenses', sortBy: 'date', sortOrder: 'desc', projectScoped: true },
  '/measurements': { key: ['measurements'], path: '/measurements', sortBy: 'date', sortOrder: 'desc', projectScoped: true },
  '/vendor-bills': { key: ['vendor-bills'], path: '/vendor-bills', sortBy: 'invoiceDate', sortOrder: 'desc', projectScoped: true },
  '/work-orders': { key: ['work-orders'], path: '/work-orders', sortBy: 'woDate', sortOrder: 'desc', projectScoped: true },
  '/subcontract-bills': { key: ['subcontract-bills'], path: '/subcontract-bills', sortBy: 'billDate', sortOrder: 'desc', projectScoped: true },
  '/projects': { key: ['projects', 'page'], path: '/projects', sortBy: 'status', sortOrder: 'asc', projectScoped: false },
} as const satisfies Record<string, { key: readonly string[]; path: string; sortBy: string; sortOrder: SortOrder; projectScoped: boolean }>;

/** The first-page query of the list a sidebar link opens (with the header's project where the list follows it). */
export function listStartQueryFor(href: string, projectId?: string): { queryKey: QueryKey; queryFn: () => Promise<unknown> } | null {
  if (href === '/approvals') return { queryKey: ['approvals', 'pending'], queryFn: async () => (await api.get<PendingApprovalDto[]>('/approvals/pending')).data };
  if (href === '/') return { queryKey: ['dashboard', 'my-work'], queryFn: async () => (await api.get<MyWorkDto>('/dashboard/my-work')).data };
  const start = LIST_START[href as keyof typeof LIST_START];
  if (!start) return null;
  const params = clean({ page: 1, pageSize: DEFAULT_PAGE_SIZE, sortBy: start.sortBy, sortOrder: start.sortOrder, projectId: start.projectScoped ? projectId : undefined });
  return { queryKey: [...start.key, params], queryFn: async () => (await api.get<Paginated<unknown>>(start.path, { params })).data };
}

/* ---------- search-as-you-type pickers ---------- */

/** Rows a picker shows at a time: the first page as it opens, then what matches the words typed. */
export const PICKER_PAGE_SIZE = 20;

/** The masters a picker can search, each with its list endpoint (which understands `q`) and whether it has `GET /:id`. */
export const PICKER_SOURCES = {
  users: { key: ['users'], path: '/users', sortBy: 'fullName', byId: false },
  vendors: { key: ['vendors'], path: '/vendors', sortBy: 'name', byId: true },
  clients: { key: ['clients'], path: '/clients', sortBy: 'name', byId: true },
  equipment: { key: ['machinery', 'equipment'], path: '/equipment', sortBy: 'code', byId: true },
  items: { key: ['stock', 'items'], path: '/stock/items', sortBy: 'name', byId: false },
} as const;
export type PickerSource = keyof typeof PICKER_SOURCES;

/** One page of a master for a picker; under the master's key, so creating or editing one refreshes it. */
export const usePickerPage = <T>(source: PickerSource, q: string, params: object | undefined, enabled: boolean) => {
  const s = PICKER_SOURCES[source];
  const query = clean({ ...params, q: q.trim() || undefined, pageSize: PICKER_PAGE_SIZE, sortBy: s.sortBy });
  return useQuery({
    queryKey: [...s.key, 'pick', query],
    queryFn: async () => (await api.get<Paginated<T>>(s.path, { params: query })).data,
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
};

/** A picker's current value when it is not on the page shown (only for masters with `GET /:id`). */
export const usePickerRecord = <T>(source: PickerSource, id: string | undefined, enabled: boolean) => {
  const s = PICKER_SOURCES[source];
  return useQuery({
    queryKey: [...s.key, 'pick-one', id],
    queryFn: async () => (await api.get<T>(`${s.path}/${id}`)).data,
    enabled: enabled && !!id && s.byId,
    staleTime: 5 * 60_000,
  });
};

/* ---------- queries ---------- */

/** The home page's My work: only the cards the caller's role has. */
export const useMyWork = () =>
  useQuery({ queryKey: ['dashboard', 'my-work'], queryFn: async () => (await api.get<MyWorkDto>('/dashboard/my-work')).data, refetchInterval: 60_000 });

/** Six months of trends for the home page's tiles and charts. */
export const useHomeTrends = () => useQuery({ queryKey: ['dashboard', 'trends'], queryFn: async () => (await api.get<HomeTrendsDto>('/dashboard/trends')).data });

export const useCompanyDashboard = () =>
  useQuery({ queryKey: ['dashboard', 'company'], queryFn: async () => (await api.get<CompanyDashboard>('/dashboard/company')).data });

export const useGettingStarted = (enabled: boolean) =>
  useQuery({ queryKey: ['dashboard', 'getting-started'], queryFn: async () => (await api.get<GettingStartedDto>('/dashboard/getting-started')).data, enabled });

export const useProjectDashboard = (id: string | undefined) =>
  useQuery({
    queryKey: ['dashboard', 'project', id],
    queryFn: async () => (await api.get<ProjectDashboard>(`/dashboard/projects/${id}`)).data,
    enabled: !!id,
  });

/**
 * Every visible project (one large page) for the header's switcher, the shell and project dropdowns. It stays one cached
 * query on purpose: the shell needs the whole set anyway, every picker shares it, and an organisation has tens of
 * projects, not thousands. Kept fresh for five minutes; saving a project invalidates it.
 */
export const useProjects = (enabled = true) =>
  useQuery({
    queryKey: ['projects', 'all'],
    queryFn: async () => (await api.get<Paginated<ProjectSummary>>('/projects', { params: { pageSize: MAX_PAGE_SIZE, sortBy: 'code' } })).data.items,
    enabled,
    staleTime: 5 * 60_000,
  });

/** One server-side page of the projects list (search, filters, sort). */
export const useProjectsPage = (filters: ProjectFilters) =>
  useQuery({
    queryKey: ['projects', 'page', clean(filters)],
    queryFn: async () => (await api.get<Paginated<ProjectSummary>>('/projects', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
  });

export const useProject = (id: string | undefined) => useQuery({ ...recordQuery<ProjectDetail>('/projects', id), enabled: !!id });

export const useUsersPage = (filters: UserFilters) =>
  useQuery({
    queryKey: ['users', 'page', clean(filters)],
    queryFn: async () => (await api.get<Paginated<UserSummary>>('/users', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
  });

export const useRoles = () =>
  useQuery({ queryKey: ['users', 'roles'], queryFn: async () => (await api.get<RoleDto[]>('/users/roles')).data });

export const useBoq = (projectId: string | undefined) =>
  useQuery({
    queryKey: ['boq', projectId],
    queryFn: async () => (await api.get<BoqItemDto[]>(`/projects/${projectId}/boq`)).data,
    enabled: !!projectId,
  });

export const useActivities = (projectId: string | undefined) =>
  useQuery({
    queryKey: ['activities', projectId],
    queryFn: async () => (await api.get<ActivityDto[]>(`/projects/${projectId}/activities`)).data,
    enabled: !!projectId,
  });

/** Gantt with milestones and the baseline; under the activities key so any activity change refreshes it. */
export const useGantt = (projectId: string | undefined) =>
  useQuery({
    queryKey: ['activities', projectId, 'gantt'],
    queryFn: async () => (await api.get<GanttDto>(`/projects/${projectId}/gantt`)).data,
    enabled: !!projectId,
  });

export const useProgressList = (filters?: ListFilters) =>
  useQuery({
    queryKey: ['progress', clean(filters)],
    queryFn: async () => (await api.get<Paginated<ProgressEntryDto>>('/progress', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
  });

export const useProgressEntry = (id: string | undefined) => useQuery({ ...recordQuery<ProgressEntryDto>('/progress', id), enabled: !!id });

export const useDprList = (filters?: ListFilters, enabled = true) =>
  useQuery({
    queryKey: ['dpr', clean(filters)],
    queryFn: async () => (await api.get<Paginated<DailyReportDto>>('/dpr', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });

export const useDpr = (id: string | undefined) => useQuery({ ...recordQuery<DailyReportDto>('/dpr', id), enabled: !!id });

export const useMaterialRequests = (filters?: ListFilters) =>
  useQuery({
    queryKey: ['material-requests', clean(filters)],
    queryFn: async () => (await api.get<Paginated<MaterialRequestDto>>('/material-requests', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
  });

export const useMaterialRequest = (id: string | undefined) => useQuery({ ...recordQuery<MaterialRequestDto>('/material-requests', id), enabled: !!id });

export const useAttendanceList = (filters?: AttendanceFilters) =>
  useQuery({
    queryKey: ['attendance', clean(filters)],
    queryFn: async () => (await api.get<Paginated<AttendanceSheetDto>>('/attendance', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
  });

/** The project's attendance for one day (`sheet: null` when not recorded), e.g. to fill DPR manpower. */
export const useAttendanceDay = (projectId: string | undefined, date: string | undefined) =>
  useQuery({
    queryKey: ['attendance', 'day', projectId, date],
    queryFn: async () => (await api.get<AttendanceDayDto>('/attendance/day', { params: { projectId, date } })).data,
    enabled: !!projectId && !!date,
  });

export const useAttendanceSuggestions = (projectId: string | undefined) =>
  useQuery({
    queryKey: ['attendance', 'suggestions', projectId ?? 'all'],
    queryFn: async () => (await api.get<AttendanceSuggestionsDto>('/attendance/suggestions', { params: clean({ projectId }) })).data,
    staleTime: 5 * 60_000,
  });

/* Named worker register (v4 item 44); every key starts with 'workers' so one invalidation refreshes them all. */
export const useWorkers = (filters?: WorkerFilters) =>
  useQuery({
    queryKey: ['workers', 'list', clean(filters)],
    queryFn: async () => (await api.get<Paginated<WorkerDto>>('/workers', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
  });

export const useRollCall = (projectId: string | undefined, date: string | undefined) =>
  useQuery({
    queryKey: ['workers', 'roll-call', projectId, date],
    queryFn: async () => (await api.get<RollCallDto>('/workers/roll-call', { params: { projectId, date } })).data,
    enabled: !!projectId && !!date,
  });

export const useMuster = (projectId: string | undefined, month: string | undefined) =>
  useQuery({
    queryKey: ['workers', 'muster', projectId, month],
    queryFn: async () => (await api.get<MusterDto>('/workers/muster', { params: { projectId, month } })).data,
    enabled: !!projectId && !!month,
  });

export const useWorkerOutput = (projectId: string | undefined, from: string | undefined, to: string | undefined) =>
  useQuery({
    queryKey: ['workers', 'output', projectId, from, to],
    queryFn: async () => (await api.get<OutputDto>('/workers/output', { params: { projectId, from, to } })).data,
    enabled: !!projectId && !!from && !!to,
  });

export const useStockBalances = (filters?: StockBalanceFilters, enabled = true) =>
  useQuery({
    queryKey: ['stock', 'balances', clean(filters)],
    queryFn: async () => (await api.get<Paginated<StockBalanceDto>>('/stock/balances', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });

export const useStockEntries = (filters?: StockEntryFilters, enabled = true) =>
  useQuery({
    queryKey: ['stock', 'entries', clean(filters)],
    queryFn: async () => (await api.get<Paginated<StockEntryDto>>('/stock/entries', { params: { ...clean(filters), allTypes: true } })).data,
    placeholderData: keepPreviousData,
    enabled,
  });

export const useIncomingTransfers = (projectId?: string, enabled = true) =>
  useQuery({
    queryKey: ['stock', 'incoming', projectId ?? 'all'],
    queryFn: async () => (await api.get<StockEntryDto[]>('/stock/transfers/incoming', { params: clean({ projectId }) })).data,
    enabled,
  });

export const useStockValuation = (projectId?: string, enabled = true) =>
  useQuery({
    queryKey: ['stock', 'valuation', projectId ?? 'all'],
    queryFn: async () => (await api.get<StockValuationDto>('/stock/valuation', { params: clean({ projectId }) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });

export const useStockEntry = (id: string | undefined) =>
  useQuery({
    queryKey: ['stock', 'entry', id],
    queryFn: async () => (await api.get<StockEntryDto>(`/stock/entries/${id}`)).data,
    enabled: !!id,
  });

export const useStockItems = (filters?: PageParams) =>
  useQuery({
    queryKey: ['stock', 'items', clean(filters)],
    queryFn: async () => (await api.get<Paginated<ItemDto>>('/stock/items', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
  });

export const useMachineryLogs = (filters?: MachineryFilters) =>
  useQuery({
    queryKey: ['machinery', 'logs', clean(filters)],
    queryFn: async () => (await api.get<Paginated<MachineryLogDto>>('/machinery-logs', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
  });

export const useMachineryLog = (id: string | undefined) => useQuery({ ...recordQuery<MachineryLogDto>('/machinery', id), enabled: !!id });

export const useEquipment = (filters?: EquipmentFilters, enabled = true) =>
  useQuery({
    queryKey: ['machinery', 'equipment', clean(filters)],
    queryFn: async () => (await api.get<Paginated<EquipmentDto>>('/equipment', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });

export const useExpenses = (filters?: ExpenseFilters) =>
  useQuery({
    queryKey: ['expenses', clean(filters)],
    queryFn: async () => (await api.get<Paginated<ExpenseDto>>('/expenses', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
  });

/** Totals for the same filters as the list (paging and sort are ignored by the API). */
export const useExpenseSummary = (filters?: ExpenseFilters) =>
  useQuery({
    queryKey: ['expenses', 'summary', clean({ ...filters, page: undefined, pageSize: undefined, sortBy: undefined, sortOrder: undefined })],
    queryFn: async () => (await api.get<ExpenseSummaryDto>('/expenses/summary', { params: clean({ ...filters, page: undefined, pageSize: undefined, sortBy: undefined, sortOrder: undefined }) })).data,
    placeholderData: keepPreviousData,
  });

export const useExpense = (id: string | undefined) => useQuery({ ...recordQuery<ExpenseDto>('/expenses', id), enabled: !!id });

export const useAuthOptions = () =>
  useQuery({ queryKey: ['auth-options'], queryFn: async () => (await api.get<AuthOptionsDto>('/auth/options')).data, staleTime: 5 * 60_000 });

export const useApprovalMatrix = (enabled = true) =>
  useQuery({ queryKey: ['approval-rules'], queryFn: async () => (await api.get<ApprovalMatrixDto>('/approval-rules')).data, enabled });

export const useActivityTemplates = (enabled = true) =>
  useQuery({ queryKey: ['activity-templates'], queryFn: async () => (await api.get<ActivityTemplateDto[]>('/activity-templates')).data, enabled });

export const useRisks = (filters?: RiskFilters, enabled = true) =>
  useQuery({
    queryKey: ['risks', clean(filters)],
    queryFn: async () => (await api.get<Paginated<RiskDto>>('/risks', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });

/** Totals and heat map for the same filters (paging, sort and status filters are ignored by the API). */
export const useRiskSummary = (filters?: RiskFilters) => {
  const params = clean({ ...filters, page: undefined, pageSize: undefined, sortBy: undefined, sortOrder: undefined, status: undefined, active: undefined, overdue: undefined });
  return useQuery({
    queryKey: ['risks', 'summary', params],
    queryFn: async () => (await api.get<RiskSummaryDto>('/risks/summary', { params })).data,
    placeholderData: keepPreviousData,
  });
};

export const useRiskSuggestions = (projectId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: ['risks', 'suggestions', projectId ?? 'all'],
    queryFn: async () => (await api.get<DelaySuggestionDto[]>('/risks/suggestions', { params: clean({ projectId }) })).data,
    enabled,
  });

export const useRisk = (id: string | undefined) =>
  useQuery({
    queryKey: ['risks', 'detail', id],
    queryFn: async () => (await api.get<RiskDto>(`/risks/${id}`)).data,
    enabled: !!id,
  });

export const useRiskHistory = (id: string | undefined) =>
  useQuery({
    queryKey: ['risks', 'history', id],
    queryFn: async () => (await api.get<AuditLogDto[]>(`/risks/${id}/history`)).data,
    enabled: !!id,
  });

export const useMeasurements = (filters?: MeasurementFilters) =>
  useQuery({
    queryKey: ['measurements', clean(filters)],
    queryFn: async () => (await api.get<Paginated<MeasurementSheetDto>>('/measurements', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
  });

export const useMeasurement = (id: string | undefined) => useQuery({ ...recordQuery<MeasurementSheetDto>('/measurements', id), enabled: !!id });

export interface InspectionFilters extends ListFilters {
  from?: string;
  to?: string;
}

export const useInspections = (filters?: InspectionFilters) =>
  useQuery({
    queryKey: ['inspections', clean(filters)],
    queryFn: async () => (await api.get<Paginated<InspectionDto>>('/inspections', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
  });

export const useInspection = (id: string | undefined) => useQuery({ ...recordQuery<InspectionDto>('/inspections', id), enabled: !!id });

export const useChecklists = () =>
  useQuery({
    queryKey: ['inspections', 'checklists'],
    queryFn: async () => (await api.get<ChecklistTemplateDto[]>('/inspections/checklists')).data,
  });

export interface TestFilters extends PageParams {
  projectId?: string;
  kind?: TestKind;
  result?: TestResult;
  overdue?: boolean;
  from?: string;
  to?: string;
}

export const useQualityTests = (filters?: TestFilters) =>
  useQuery({
    queryKey: ['quality', 'tests', clean(filters)],
    queryFn: async () => (await api.get<Paginated<QualityTestDto>>('/quality/tests', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
  });

export const useQualityTest = (id: string | undefined) =>
  useQuery({
    queryKey: ['quality', 'tests', 'detail', id],
    queryFn: async () => (await api.get<QualityTestDto>(`/quality/tests/${id}`)).data,
    enabled: !!id,
  });

export interface NcrFilters extends PageParams {
  projectId?: string;
  status?: NcrStatus;
  severity?: NcrSeverity;
  active?: boolean;
  overdue?: boolean;
  mine?: boolean;
  qualityTestId?: string;
  inspectionId?: string;
}

export const useNcrs = (filters?: NcrFilters) =>
  useQuery({
    queryKey: ['quality', 'ncrs', clean(filters)],
    queryFn: async () => (await api.get<Paginated<NcrDto>>('/quality/ncrs', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
  });

export const useNcr = (id: string | undefined) =>
  useQuery({
    queryKey: ['quality', 'ncrs', 'detail', id],
    queryFn: async () => (await api.get<NcrDto>(`/quality/ncrs/${id}`)).data,
    enabled: !!id,
  });

export const useNcrHistory = (id: string | undefined) =>
  useQuery({
    queryKey: ['quality', 'ncrs', 'history', id],
    queryFn: async () => (await api.get<AuditLogDto[]>(`/quality/ncrs/${id}/history`)).data,
    enabled: !!id,
  });

export const useQualitySummary = (projectId?: string) =>
  useQuery({
    queryKey: ['quality', 'summary', projectId ?? null],
    queryFn: async () => (await api.get<QualitySummaryDto>('/quality/summary', { params: clean({ projectId }) })).data,
  });

export interface DocumentFilters extends PageParams {
  projectId?: string;
  kind?: DocumentKind;
  discipline?: DocumentDiscipline;
  status?: RevisionStatus;
}

export const useDocuments = (filters?: DocumentFilters, enabled = true) =>
  useQuery({
    queryKey: ['documents', 'list', clean(filters)],
    queryFn: async () => (await api.get<Paginated<DocumentDto>>('/documents', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });

export const useDocument = (id: string | undefined) =>
  useQuery({
    queryKey: ['documents', 'detail', id],
    queryFn: async () => (await api.get<DocumentDetailDto>(`/documents/${id}`)).data,
    enabled: !!id,
  });

export const useDocumentHistory = (id: string | undefined) =>
  useQuery({
    queryKey: ['documents', 'history', id],
    queryFn: async () => (await api.get<AuditLogDto[]>(`/documents/${id}/history`)).data,
    enabled: !!id,
  });

/** Every document of a project with its current revision (to pick revisions for a transmittal). */
export const useSiteDocuments = (projectId: string | undefined) =>
  useQuery({
    queryKey: ['documents', 'site', projectId],
    queryFn: async () => (await api.get<DocumentDto[]>('/documents/site', { params: { projectId } })).data,
    enabled: !!projectId,
  });

export const useDocumentSummary = (projectId?: string) =>
  useQuery({
    queryKey: ['documents', 'summary', projectId ?? null],
    queryFn: async () => (await api.get<DocumentSummaryDto>('/documents/summary', { params: clean({ projectId }) })).data,
  });

export interface TransmittalFilters extends PageParams {
  projectId?: string;
  unacknowledged?: boolean;
  documentId?: string;
}

export const useTransmittals = (filters?: TransmittalFilters) =>
  useQuery({
    queryKey: ['documents', 'transmittals', clean(filters)],
    queryFn: async () => (await api.get<Paginated<TransmittalDto>>('/transmittals', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
  });

export const useTransmittal = (id: string | undefined) =>
  useQuery({
    queryKey: ['documents', 'transmittals', 'detail', id],
    queryFn: async () => (await api.get<TransmittalDto>(`/transmittals/${id}`)).data,
    enabled: !!id,
  });

export interface LetterFilters extends PageParams {
  projectId?: string;
  direction?: LetterDirection;
  riskId?: string;
  awaitingReply?: boolean;
}

export const useLetters = (filters?: LetterFilters, enabled = true) =>
  useQuery({
    queryKey: ['documents', 'letters', clean(filters)],
    queryFn: async () => (await api.get<Paginated<LetterDto>>('/letters', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });

export const useLetter = (id: string | undefined) =>
  useQuery({
    queryKey: ['documents', 'letters', 'detail', id],
    queryFn: async () => (await api.get<LetterDto>(`/letters/${id}`)).data,
    enabled: !!id,
  });

/* ---------- RFIs ---------- */

export interface RfiFilters extends PageParams {
  projectId?: string;
  status?: RfiStatus;
  priority?: RfiPriority;
  overdue?: boolean;
  documentId?: string;
  sortBy?: RfiSortField;
}

export const useRfis = (filters?: RfiFilters, enabled = true) =>
  useQuery({
    queryKey: ['documents', 'rfis', clean(filters)],
    queryFn: async () => (await api.get<Paginated<RfiDto>>('/rfis', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });

export const useRfi = (id: string | undefined) =>
  useQuery({
    queryKey: ['documents', 'rfis', 'detail', id],
    queryFn: async () => (await api.get<RfiDto>(`/rfis/${id}`)).data,
    enabled: !!id,
  });

export const useRfiSummary = (projectId?: string) =>
  useQuery({
    queryKey: ['documents', 'rfis', 'summary', projectId ?? null],
    queryFn: async () => (await api.get<RfiSummaryDto>('/rfis/summary', { params: clean({ projectId }) })).data,
  });

/** Every RFI change refreshes the lists, the record, the counts and the notifications. */
function useRfiMutation<V, R = RfiDto>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents', 'rfis'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export interface SaveRfiInput {
  id?: string;
  projectId: string;
  subject: string;
  question: string;
  proposal: string | null;
  location: string | null;
  priority: RfiPriority;
  toParty: string | null;
  raisedOn: string;
  replyBy: string;
  documentId: string | null;
  boqItemId: string | null;
  costImpact: boolean;
  timeImpact: boolean;
  attachmentIds: string[];
}

export const useCreateRfi = () => useRfiMutation(async (v: SaveRfiInput) => (await api.post<RfiDto>('/rfis', v)).data);
export const useUpdateRfi = () =>
  useRfiMutation(async ({ rfiId, ...v }: Omit<Partial<SaveRfiInput>, 'projectId' | 'raisedOn' | 'id'> & { rfiId: string }) => (await api.patch<RfiDto>(`/rfis/${rfiId}`, v)).data);
export const useRecordRfiAnswer = () =>
  useRfiMutation(async ({ id, ...v }: { id: string; answer: string; answeredOn: string; answeredByName: string; answerRef: string | null }) => (await api.post<RfiDto>(`/rfis/${id}/answer`, v)).data);
export const useCloseRfi = () => useRfiMutation(async ({ id, ...v }: { id: string; on: string; note: string | null }) => (await api.post<RfiDto>(`/rfis/${id}/close`, v)).data);
export const useWithdrawRfi = () => useRfiMutation(async ({ id, note }: { id: string; note: string }) => (await api.post<RfiDto>(`/rfis/${id}/withdraw`, { note })).data);
export const useLinkRfi = () =>
  useRfiMutation(async ({ id, ...v }: { id: string; variationId?: string | null; riskId?: string | null }) => (await api.put<RfiDto>(`/rfis/${id}/links`, v)).data);
export const useDeleteRfi = () => useRfiMutation(async (id: string) => (await api.delete<{ ok: true }>(`/rfis/${id}`)).data);

export const usePortalRfis = (projectId: string | undefined) =>
  useQuery({ queryKey: ['portal', 'rfis', projectId], queryFn: async () => (await api.get<PortalRfiDto[]>(`/portal/projects/${projectId}/rfis`)).data, enabled: !!projectId });

export function useAnswerRfiAsClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, answer }: { id: string; answer: string }) => (await api.post<PortalRfiDto>(`/portal/rfis/${id}/answer`, { answer })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal'] }),
  });
}

/* ---------- staff and leave ---------- */

export const useStaffSummary = () =>
  useQuery({
    queryKey: ['staff', 'summary'],
    queryFn: async () => (await api.get<StaffSummaryDto>('/staff/summary')).data,
  });

export const useMyStaff = () =>
  useQuery({
    queryKey: ['staff', 'me'],
    queryFn: async () => (await api.get<MyStaffDto>('/staff/me')).data,
  });

export interface EmployeeFilters extends PageParams {
  projectId?: string;
  includeInactive?: boolean;
}

export const useEmployees = (filters?: EmployeeFilters, enabled = true) =>
  useQuery({
    queryKey: ['staff', 'employees', clean(filters)],
    queryFn: async () => (await api.get<Paginated<EmployeeDto>>('/staff/employees', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });

export const useEmployee = (id: string | undefined) =>
  useQuery({
    queryKey: ['staff', 'employees', 'detail', id],
    queryFn: async () => (await api.get<EmployeeDto>(`/staff/employees/${id}`)).data,
    enabled: !!id,
  });

export const useLinkableUsers = (employeeId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: ['staff', 'users', employeeId ?? null],
    queryFn: async () => (await api.get<{ id: string; fullName: string; email: string; roleName: string }[]>('/staff/users', { params: clean({ employeeId }) })).data,
    enabled,
  });

export const useStaffAttendance = (employeeId: string | undefined, from: string, to: string) =>
  useQuery({
    queryKey: ['staff', 'attendance', employeeId, from, to],
    queryFn: async () => (await api.get<StaffAttendanceDto[]>('/staff/attendance', { params: { employeeId, from, to } })).data,
    enabled: !!employeeId,
  });

export const useStaffRegister = (projectId: string | undefined, date: string) =>
  useQuery({
    queryKey: ['staff', 'register', projectId, date],
    queryFn: async () => (await api.get<StaffRegisterDto>('/staff/register', { params: { projectId, date } })).data,
    enabled: !!projectId,
  });

export interface LeaveFilters extends PageParams {
  status?: LeaveStatus;
  type?: LeaveType;
  employeeId?: string;
  projectId?: string;
  toDecide?: boolean;
  on?: string;
}

export const useLeave = (filters?: LeaveFilters, enabled = true) =>
  useQuery({
    queryKey: ['staff', 'leave', clean(filters)],
    queryFn: async () => (await api.get<Paginated<LeaveRequestDto>>('/staff/leave', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });

export const useLeaveRequest = (id: string | undefined) =>
  useQuery({
    queryKey: ['staff', 'leave', 'detail', id],
    queryFn: async () => (await api.get<LeaveRequestDto>(`/staff/leave/${id}`)).data,
    enabled: !!id,
  });

export const useLeaveHistory = (id: string | undefined) =>
  useQuery({
    queryKey: ['staff', 'leave', 'history', id],
    queryFn: async () => (await api.get<AuditLogDto[]>(`/staff/leave/${id}/history`)).data,
    enabled: !!id,
  });

export const useEmployeeHistory = (id: string | undefined, enabled = true) =>
  useQuery({
    queryKey: ['staff', 'employees', 'history', id],
    queryFn: async () => (await api.get<AuditLogDto[]>(`/staff/employees/${id}/history`)).data,
    enabled: !!id && enabled,
  });

export const useLeaveBalances = (employeeId: string | undefined, year?: number, enabled = true) =>
  useQuery({
    queryKey: ['staff', 'balances', employeeId ?? 'me', year ?? null],
    queryFn: async () => (await api.get<LeaveBalanceDto[]>('/staff/leave/balances', { params: clean({ employeeId, year }) })).data,
    enabled,
  });

export const useHolidays = (year?: number, projectId?: string) =>
  useQuery({
    queryKey: ['staff', 'holidays', year ?? null, projectId ?? null],
    queryFn: async () => (await api.get<HolidayDto[]>('/staff/holidays', { params: clean({ year, projectId }) })).data,
  });

export const usePayroll = (month: string, projectId?: string, enabled = true) =>
  useQuery({
    queryKey: ['payroll', 'staff', month, projectId ?? null],
    queryFn: async () => (await api.get<PayrollDto>('/payroll/staff', { params: clean({ month, projectId }) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });

export const useContractorMonth = (month: string, projectId?: string, enabled = true) =>
  useQuery({
    queryKey: ['payroll', 'contractors', month, projectId ?? null],
    queryFn: async () => (await api.get<ContractorMonthDto>('/payroll/contractors', { params: clean({ month, projectId }) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });

export interface BillFilters extends PageParams {
  projectId?: string;
  status?: SubmissionStatus;
  stage?: BillStage;
  mine?: boolean;
  from?: string;
  to?: string;
}

export const useBills = (filters: BillFilters, enabled = true) =>
  useQuery({
    queryKey: ['bills', clean(filters)],
    queryFn: async () => (await api.get<Paginated<RaBillDto>>('/ra-bills', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });

export const useBill = (id: string | undefined) => useQuery({ ...recordQuery<RaBillDto>('/bills', id), enabled: !!id });

export interface ReceiptFilters extends PageParams {
  projectId?: string;
  billId?: string;
  kind?: ReceiptKind;
  from?: string;
  to?: string;
}

export const useReceipts = (filters: ReceiptFilters, enabled = true) =>
  useQuery({
    queryKey: ['receipts', clean(filters)],
    queryFn: async () => (await api.get<Paginated<ReceiptDto>>('/receipts', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });

export const useReceivables = (projectId?: string, enabled = true) =>
  useQuery({
    queryKey: ['receivables', projectId ?? 'all'],
    queryFn: async () => (await api.get<ReceivablesDto>('/receivables', { params: clean({ projectId }) })).data,
    enabled,
    placeholderData: keepPreviousData,
  });

export interface VendorPaymentFilters extends PageParams {
  projectId?: string;
  vendorId?: string;
  vendorBillId?: string;
  subcontractBillId?: string;
  from?: string;
  to?: string;
}

export const useVendorPayments = (filters: VendorPaymentFilters, enabled = true) =>
  useQuery({
    queryKey: ['vendor-payments', clean(filters)],
    queryFn: async () => (await api.get<Paginated<VendorPaymentDto>>('/vendor-payments', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });

export const usePayables = (filters: { projectId?: string; vendorId?: string } = {}, enabled = true) =>
  useQuery({
    queryKey: ['payables', clean(filters)],
    queryFn: async () => (await api.get<PayablesDto>('/payables', { params: clean(filters) })).data,
    enabled,
    placeholderData: keepPreviousData,
  });

export const useTallySettings = (enabled = true) =>
  useQuery({ queryKey: ['tally', 'settings'], queryFn: async () => (await api.get<TallySettingsDto>('/tally/settings')).data, enabled });

export const useTallyPreview = (range: { upTo: string; from?: string }, enabled = true) =>
  useQuery({
    queryKey: ['tally', 'preview', clean(range)],
    queryFn: async () => (await api.get<TallyPreviewDto>('/tally/preview', { params: clean(range) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });

export const useTallyExports = (enabled = true) =>
  useQuery({ queryKey: ['tally', 'exports'], queryFn: async () => (await api.get<TallyExportDto[]>('/tally/exports')).data, enabled });

export const useGstRegisters = (range: { from: string; to: string }) =>
  useQuery({
    queryKey: ['gst', range],
    queryFn: async () => (await api.get<GstRegistersDto>('/gst/registers', { params: range })).data,
    placeholderData: keepPreviousData,
  });

export interface ClientFilters extends PageParams {
  includeInactive?: boolean;
}

export const useClientsPage = (filters: ClientFilters) =>
  useQuery({
    queryKey: ['clients', 'page', clean(filters)],
    queryFn: async () => (await api.get<Paginated<ClientDto>>('/clients', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
  });

/** Every active client (one large page) for pickers. */
export interface VendorFilters extends PageParams {
  kind?: VendorKind;
  msme?: MsmeCategory;
  includeInactive?: boolean;
}

export const useVendorsPage = (filters: VendorFilters) =>
  useQuery({
    queryKey: ['vendors', 'page', clean(filters)],
    queryFn: async () => (await api.get<Paginated<VendorDto>>('/vendors', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
  });

export const useUnlistedVendors = (enabled = true) =>
  useQuery({
    queryKey: ['vendors', 'unlisted'],
    queryFn: async () => (await api.get<UnlistedVendorDto[]>('/vendors/unlisted')).data,
    enabled,
  });

export interface PurchaseOrderFilters extends PageParams {
  projectId?: string;
  vendorId?: string;
  materialRequestId?: string;
  status?: SubmissionStatus;
  open?: boolean;
  mine?: boolean;
  from?: string;
  to?: string;
}

export const usePurchaseOrders = (filters: PurchaseOrderFilters, enabled = true) =>
  useQuery({
    queryKey: ['purchase-orders', clean(filters)],
    queryFn: async () => (await api.get<Paginated<PurchaseOrderDto>>('/purchase-orders', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });

export const usePurchaseOrder = (id: string | undefined) => useQuery({ ...recordQuery<PurchaseOrderDto>('/purchase-orders', id), enabled: !!id });

/** Approved, open purchase orders with something still to receive (GRN form). */
export const useReceivableOrders = (projectId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: ['purchase-orders', 'receivable', projectId ?? 'all'],
    queryFn: async () => (await api.get<ReceivableOrderDto[]>('/purchase-orders/receivable', { params: clean({ projectId }) })).data,
    enabled,
  });

export const useQuotations = (materialRequestId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: ['quotations', materialRequestId],
    queryFn: async () => (await api.get<QuotationDto[]>(`/material-requests/${materialRequestId}/quotations`)).data,
    enabled: enabled && !!materialRequestId,
  });

export const useComparative = (materialRequestId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: ['quotations', 'comparative', materialRequestId],
    queryFn: async () => (await api.get<ComparativeStatementDto>(`/material-requests/${materialRequestId}/comparative`)).data,
    enabled: enabled && !!materialRequestId,
  });

export interface VendorBillFilters extends PageParams {
  projectId?: string;
  vendorId?: string;
  purchaseOrderId?: string;
  status?: SubmissionStatus;
  exceptions?: boolean;
}

export const useVendorBills = (filters: VendorBillFilters, enabled = true) =>
  useQuery({
    queryKey: ['vendor-bills', clean(filters)],
    queryFn: async () => (await api.get<Paginated<VendorBillDto>>('/vendor-bills', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });

export const useVendorBill = (id: string | undefined) => useQuery({ ...recordQuery<VendorBillDto>('/vendor-bills', id), enabled: !!id });

export interface WorkOrderFilters extends PageParams {
  projectId?: string;
  vendorId?: string;
  status?: SubmissionStatus;
  open?: boolean;
  boqItemId?: string;
}

export const useWorkOrders = (filters: WorkOrderFilters, enabled = true) =>
  useQuery({
    queryKey: ['work-orders', clean(filters)],
    queryFn: async () => (await api.get<Paginated<WorkOrderDto>>('/work-orders', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });

export const useWorkOrder = (id: string | undefined) => useQuery({ ...recordQuery<WorkOrderDto>('/work-orders', id), enabled: !!id });

/** Client rate against subcontract rate per BOQ item of a project (billing roles). */
export const useWorkOrderMargin = (projectId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: ['work-orders', 'margin', projectId],
    queryFn: async () => (await api.get<WorkOrderMarginDto[]>('/work-orders/margin', { params: { projectId } })).data,
    enabled: enabled && !!projectId,
  });

export interface SubcontractBillFilters extends PageParams {
  projectId?: string;
  vendorId?: string;
  workOrderId?: string;
  status?: SubmissionStatus;
}

export const useSubcontractBills = (filters: SubcontractBillFilters, enabled = true) =>
  useQuery({
    queryKey: ['subcontract-bills', clean(filters)],
    queryFn: async () => (await api.get<Paginated<SubcontractBillDto>>('/subcontract-bills', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });

export const useSubcontractBill = (id: string | undefined) => useQuery({ ...recordQuery<SubcontractBillDto>('/subcontract-bills', id), enabled: !!id });

export const useContract = (projectId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: ['contract', projectId],
    queryFn: async () => (await api.get<ProjectContractDto>(`/projects/${projectId}/contract`)).data,
    enabled: !!projectId && enabled,
  });

/** Cost period; both ends optional. */
export interface CostPeriod {
  from?: string;
  to?: string;
}

export const useCostSummary = (period: CostPeriod, enabled = true) =>
  useQuery({
    queryKey: ['cost', 'projects', clean(period)],
    queryFn: async () => (await api.get<ProjectCostSummaryDto[]>('/cost/projects', { params: clean(period) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });

export const useProjectBudget = (projectId: string | undefined) =>
  useQuery({
    queryKey: ['cost', 'budget', projectId],
    queryFn: async () => (await api.get<ProjectBudgetDto>(`/cost/projects/${projectId}/budget`)).data,
    enabled: !!projectId,
  });

export const useCashFlow = (params: { projectId?: string; granularity: CashFlowGranularity }) =>
  useQuery({
    queryKey: ['cost', 'cash-flow', clean(params)],
    queryFn: async () => (await api.get<CashFlowDto>('/cost/cash-flow', { params: clean(params) })).data,
    placeholderData: keepPreviousData,
  });

/* ---------- material reconciliation ---------- */

/** A project's norms and its theoretical against issued material for a period (all time when empty). */
export const useProjectReconciliation = (projectId: string | undefined, period: CostPeriod) =>
  useQuery({
    queryKey: ['reconciliation', projectId, clean(period)],
    queryFn: async () => (await api.get<ProjectReconciliationDto>(`/reconciliation/projects/${projectId}`, { params: clean(period) })).data,
    placeholderData: keepPreviousData,
    enabled: !!projectId,
  });

export interface SaveMaterialNormInput {
  projectId: string;
  boqItemId: string;
  itemId: string;
  qtyPerUnit: string;
  wastagePct: string;
  note: string | null;
}

/** Add a norm, or change the one the BOQ item has for that store item. */
export function useSaveMaterialNorm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, ...body }: SaveMaterialNormInput) => (await api.put<MaterialNormDto>(`/reconciliation/projects/${projectId}/norms`, body)).data,
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['reconciliation', v.projectId] }),
  });
}

export function useRemoveMaterialNorm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, normId }: { projectId: string; normId: string }) => (await api.delete<{ ok: true }>(`/reconciliation/projects/${projectId}/norms/${normId}`)).data,
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['reconciliation', v.projectId] }),
  });
}

export const useProjectCost = (projectId: string | undefined, period: CostPeriod) =>
  useQuery({
    queryKey: ['cost', 'project', projectId, clean(period)],
    queryFn: async () => (await api.get<ProjectCostDto>(`/cost/projects/${projectId}`, { params: clean(period) })).data,
    placeholderData: keepPreviousData,
    enabled: !!projectId,
  });

export const useLabourRates = (enabled = true) =>
  useQuery({
    queryKey: ['cost', 'labour-rates'],
    queryFn: async () => (await api.get<LabourRatesDto>('/cost/labour-rates')).data,
    enabled,
  });

export const useProgressReport = (projectId: string | undefined, from: string, to: string) =>
  useQuery({
    queryKey: ['reports', 'progress', projectId, from, to],
    queryFn: async () => (await api.get<ProgressReportDto>('/reports/progress', { params: { projectId, from, to } })).data,
    placeholderData: keepPreviousData,
    enabled: !!projectId,
  });

/** Approved material requests with something still to receive (GRN form). */
export const useReceivable = (projectId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: ['stock', 'receivable', projectId ?? 'all'],
    queryFn: async () => (await api.get<ReceivableRequestDto[]>('/stock/receivable', { params: clean({ projectId }) })).data,
    enabled,
  });

export const usePendingApprovals = (enabled = true) =>
  useQuery({
    queryKey: ['approvals', 'pending'],
    queryFn: async () => (await api.get<PendingApprovalDto[]>('/approvals/pending')).data,
    enabled,
    refetchInterval: 30_000,
  });

/** What the current user reviewed since local midnight: the Approvals inbox's "reviewed today". */
export const useReviewedToday = (enabled = true) => {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const since = midnight.toISOString();
  return useQuery({
    queryKey: ['approvals', 'reviewed', since],
    queryFn: async () => (await api.get<ReviewedItemDto[]>('/approvals/reviewed', { params: { since } })).data,
    enabled,
  });
};

export const useNotifications = (opts?: { unreadOnly?: boolean; limit?: number; tab?: NotificationTab }, enabled = true) =>
  useQuery({
    queryKey: ['notifications', clean(opts)],
    queryFn: async () => (await api.get<NotificationListDto>('/notifications', { params: clean({ ...opts, typesVersion: NOTIFICATION_TYPES_VERSION }) })).data,
    refetchInterval: 30_000,
    enabled,
  });

/* ---------- Client portal ---------- */

export const usePortalProjects = () => useQuery({ queryKey: ['portal', 'projects'], queryFn: async () => (await api.get<PortalProjectDto[]>('/portal/projects')).data });

export const usePortalProject = (id: string | undefined) =>
  useQuery({ queryKey: ['portal', 'project', id], queryFn: async () => (await api.get<PortalProjectDetailDto>(`/portal/projects/${id}`)).data, enabled: !!id });

export const usePortalDprs = (projectId: string | undefined, page: number, pageSize: number) =>
  useQuery({
    queryKey: ['portal', 'dprs', projectId, page, pageSize],
    queryFn: async () => (await api.get<Paginated<PortalDprDto>>(`/portal/projects/${projectId}/dprs`, { params: { page, pageSize } })).data,
    placeholderData: keepPreviousData,
    enabled: !!projectId,
  });

export const usePortalReport = (projectId: string | undefined, from: string, to: string) =>
  useQuery({
    queryKey: ['portal', 'report', projectId, from, to],
    queryFn: async () => (await api.get<ProgressReportDto>(`/portal/projects/${projectId}/report`, { params: { from, to } })).data,
    enabled: !!projectId && !!from && !!to,
  });

export const usePortalBills = (projectId: string | undefined) =>
  useQuery({ queryKey: ['portal', 'bills', projectId], queryFn: async () => (await api.get<PortalBillDto[]>(`/portal/projects/${projectId}/bills`)).data, enabled: !!projectId });

export const usePortalBill = (id: string | null) =>
  useQuery({ queryKey: ['portal', 'bill', id], queryFn: async () => (await api.get<PortalBillDto>(`/portal/bills/${id}`)).data, enabled: !!id });

export const usePortalInspections = (projectId: string | undefined) =>
  useQuery({ queryKey: ['portal', 'inspections', projectId], queryFn: async () => (await api.get<PortalInspectionDto[]>(`/portal/projects/${projectId}/inspections`)).data, enabled: !!projectId });

export function useCertifyAsClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string; date: string; certificateNo?: string | null; items?: { boqItemId: string; certifiedQty: string }[] }) =>
      (await api.post<PortalBillDto>(`/portal/bills/${id}/certify`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal'] }),
  });
}

export function useWitnessInspection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string | null }) => (await api.post<PortalInspectionDto>(`/portal/inspections/${id}/witness`, { note })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal'] }),
  });
}

/* ---------- WhatsApp and SMS ---------- */

export const useMessagingPrefs = (enabled = true) =>
  useQuery({ queryKey: ['messaging', 'me'], queryFn: async () => (await api.get<MessagingPrefsDto>('/messaging/me')).data, enabled });

export function useUpdateMessagingPrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { phone?: string | null; whatsapp?: boolean; sms?: boolean }) => (await api.put<MessagingPrefsDto>('/messaging/me', body)).data,
    onSuccess: (d) => {
      qc.setQueryData(['messaging', 'me'], d);
    },
  });
}

export function useSendTestMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (channel: MessageChannel) => (await api.post<OutboundMessageDto>('/messaging/me/test', { channel })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['messaging', 'log'] }),
  });
}

export interface MessageLogFilters {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: OutboundMessageStatus;
  channel?: MessageChannel;
}

export const useMessageLog = (filters?: MessageLogFilters, enabled = true) =>
  useQuery({
    queryKey: ['messaging', 'log', clean(filters)],
    queryFn: async () => (await api.get<Paginated<OutboundMessageDto>>('/messaging/log', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });

export const useAudit = (type: ApprovalTypeParam, id: string | undefined) =>
  useQuery({
    queryKey: ['audit', type, id],
    queryFn: async () => (await api.get<AuditLogDto[]>(`/approvals/${type}/${id}/audit`)).data,
    enabled: !!id,
  });

/* ---------- mutations ---------- */

export function useInvalidateAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

const REVIEWED_STATUS: Record<ReviewDecision, SubmissionStatus> = { APPROVE: 'APPROVED', REJECT: 'REJECTED', REQUEST_CHANGES: 'CHANGES_REQUESTED' };

/** `data` with every entry whose id is in `ids` (in a list, a page or a record) given `status`; the same object when nothing changed. */
function withStatus(data: unknown, ids: Set<string>, status: SubmissionStatus, depth = 0): unknown {
  if (depth > 4 || !data || typeof data !== 'object') return data;
  if (Array.isArray(data)) {
    let changed = false;
    const next = data.map((d) => {
      const n = withStatus(d, ids, status, depth + 1);
      if (n !== d) changed = true;
      return n;
    });
    return changed ? next : data;
  }
  const o = data as Record<string, unknown>;
  if (typeof o.id === 'string' && ids.has(o.id) && typeof o.status === 'string') return o.status === status ? o : { ...o, status };
  let changed = false;
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    const n = withStatus(v, ids, status, depth + 1);
    if (n !== v) changed = true;
    next[k] = n;
  }
  return changed ? next : data;
}

/**
 * Shows a decision at once (UX item 86): every cached list and record of these entries takes the new status, and they
 * leave the Approvals inbox (and its count). Hands back what puts the cache as it was, for when the server refuses.
 */
export async function showReviewed(qc: ReturnType<typeof useQueryClient>, ids: string[], decision: ReviewDecision): Promise<() => void> {
  const set = new Set(ids);
  const status = REVIEWED_STATUS[decision];
  const before: [QueryKey, unknown][] = [];
  const pending = (key: QueryKey) => key[0] === 'approvals' && key[1] === 'pending';
  const patch = (key: QueryKey, data: unknown) => (pending(key) && Array.isArray(data) ? (data.some((p: PendingApprovalDto) => set.has(p.id)) ? data.filter((p: PendingApprovalDto) => !set.has(p.id)) : data) : withStatus(data, set, status));
  const hits = qc.getQueryCache().getAll().filter((q) => q.state.data !== undefined && patch(q.queryKey, q.state.data) !== q.state.data);
  // A refetch already on its way would put the old status back.
  await Promise.all(hits.map((q) => qc.cancelQueries({ queryKey: q.queryKey, exact: true })));
  for (const q of hits) {
    const data = qc.getQueryData(q.queryKey);
    const next = patch(q.queryKey, data);
    if (next === data) continue;
    before.push([q.queryKey, data]);
    qc.setQueryData(q.queryKey, next);
  }
  return () => before.forEach(([key, data]) => qc.setQueryData(key, data));
}

export function useReview() {
  const qc = useQueryClient();
  return useMutation({
    /** `batch`: one of several approved together (bulk approve), which refetches once at the end. */
    mutationFn: async (vars: { type: ApprovalTypeParam; id: string; decision: ReviewDecision; note?: string; batch?: boolean }) =>
      (await api.post(`/approvals/${vars.type}/${vars.id}/review`, { decision: vars.decision, note: vars.note || undefined })).data,
    // An approval shows straight away; a refusal puts it back, and then everything is read again. Sending back and
    // rejecting wait for the server, since the dialog with the reason stays open until then.
    onMutate: async (vars) => ({ rollback: vars.batch || vars.decision !== 'APPROVE' ? null : await showReviewed(qc, [vars.id], vars.decision) }),
    onError: (_err, _vars, ctx) => ctx?.rollback?.(),
    onSettled: (_d, _e, vars) => (vars.batch ? undefined : qc.invalidateQueries()),
    meta: failNoticeSaying((v: { decision: ReviewDecision }) => (v.decision === 'APPROVE' ? 'Approved' : v.decision === 'REJECT' ? 'Rejected' : 'Changes requested')),
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.post<NotificationDto>(`/notifications/${id}/read`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    /** Every notification, or only one tab's. */
    mutationFn: async (tab?: NotificationTab) => (await api.post<{ updated: number }>('/notifications/read-all', undefined, { params: clean({ tab }) })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

/** Above this a file goes straight to Blob storage, past the 4.5 MB a hosted request takes. */
const DIRECT_UPLOAD_BYTES = 4 * 1024 * 1024;

export async function uploadFile(file: File): Promise<AttachmentDto> {
  if (file.size > DIRECT_UPLOAD_BYTES) {
    const mimeType = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');
    const { pathname, clientToken } = (await api.post<{ pathname: string; clientToken: string }>('/uploads/direct', { fileName: file.name, mimeType, size: file.size })).data;
    const { put } = await import('@vercel/blob/client');
    const blob = await put(pathname, file, { access: 'public', token: clientToken, contentType: mimeType, multipart: file.size > 8 * 1024 * 1024 });
    return (await api.post<AttachmentDto>('/uploads/direct/complete', { pathname, url: blob.url, fileName: file.name })).data;
  }
  const fd = new FormData();
  fd.append('file', file);
  const { data } = await api.post<AttachmentDto>('/uploads', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  return data;
}

/* ---------- Company data (export and deletion) ---------- */

export const useCompanyExportManifest = (enabled = true) =>
  useQuery({ queryKey: ['company-data', 'export'], queryFn: async () => (await api.get<CompanyExportManifestDto>('/company-data/export')).data, enabled });

export const useCompanyDeletion = (enabled = true) =>
  useQuery({ queryKey: ['company-data', 'deletion'], queryFn: async () => (await api.get<CompanyDeletionDto>('/company-data/deletion')).data, enabled, staleTime: 5 * 60_000 });

export function useRequestCompanyDeletion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (companyName: string) => (await api.post<CompanyDeletionDto>('/company-data/deletion', { companyName })).data,
    onSuccess: (d) => qc.setQueryData(['company-data', 'deletion'], d),
  });
}

export function useCancelCompanyDeletion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.delete<CompanyDeletionDto>('/company-data/deletion')).data,
    onSuccess: (d) => qc.setQueryData(['company-data', 'deletion'], d),
  });
}

// ---- Support access and the company log (v3 item 35) ----

export const useCompanyLog = () => useQuery({ queryKey: ['company-data', 'log'], queryFn: async () => (await api.get<CompanyLogEntryDto[]>('/company-data/log')).data });

export const useSupportAccess = () => useQuery({ queryKey: ['company-data', 'support-access'], queryFn: async () => (await api.get<SupportAccessDto>('/company-data/support-access')).data });

export function useSetSupportAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (allow: boolean) => (allow ? await api.post<SupportAccessDto>('/company-data/support-access') : await api.delete<SupportAccessDto>('/company-data/support-access')).data,
    onSuccess: (d) => {
      qc.setQueryData(['company-data', 'support-access'], d);
      void qc.invalidateQueries({ queryKey: ['company-data', 'log'] });
    },
  });
}

// ---- Platform console for staff (v3 item 35) ----

export const usePlatformCompanies = (enabled = true) =>
  useQuery({ queryKey: ['platform', 'companies'], queryFn: async () => (await api.get<PlatformCompanyDto[]>('/platform/companies')).data, enabled });

export const usePlatformCompany = (id: string | null) =>
  useQuery({ queryKey: ['platform', 'companies', id], queryFn: async () => (await api.get<PlatformCompanyDetailDto>(`/platform/companies/${id}`)).data, enabled: !!id });

export function useSuspendCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string | null }) =>
      (reason === null ? await api.post<PlatformCompanyDetailDto>(`/platform/companies/${id}/unsuspend`) : await api.post<PlatformCompanyDetailDto>(`/platform/companies/${id}/suspend`, { reason })).data,
    onSuccess: (d) => {
      qc.setQueryData(['platform', 'companies', d.id], d);
      void qc.invalidateQueries({ queryKey: ['platform', 'companies'], exact: true });
    },
  });
}

export const useOpenSupportSession = () => useMutation({ mutationFn: async (id: string) => (await api.post<SupportSessionDto>(`/platform/companies/${id}/support-session`)).data });

// ---- Plans and billing (v3 item 34) ----

export const useBilling = (enabled = true) => useQuery({ queryKey: ['billing'], queryFn: async () => (await api.get<BillingSummaryDto>('/billing')).data, enabled });

export const useBillingInvoices = (enabled = true) =>
  useQuery({ queryKey: ['billing', 'invoices'], queryFn: async () => (await api.get<BillingInvoiceDto[]>('/billing/invoices')).data, enabled });

export function useUpdateBillingDetails() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: BillingDetailsDto) => (await api.put<BillingSummaryDto>('/billing/details', d)).data,
    onSuccess: (d) => qc.setQueryData(['billing'], d),
  });
}

export const useCreateBillingOrder = () => useMutation({ mutationFn: async (months: 1 | 12) => (await api.post<BillingOrderDto>('/billing/orders', { months })).data });

export function useVerifyBillingPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { orderId: string; paymentId: string; signature: string }) => (await api.post<BillingSummaryDto>('/billing/verify', p)).data,
    onSuccess: (d) => {
      qc.setQueryData(['billing'], d);
      void qc.invalidateQueries({ queryKey: ['billing', 'invoices'] });
    },
  });
}

export function useSetTrialEnd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, until }: { id: string; until: string }) => (await api.post<PlatformCompanyDetailDto>(`/platform/companies/${id}/trial`, { until })).data,
    onSuccess: (d) => {
      qc.setQueryData(['platform', 'companies', d.id], d);
      void qc.invalidateQueries({ queryKey: ['platform', 'companies'], exact: true });
    },
  });
}

/* ---------- variations (v4 item 37) ---------- */

export interface VariationFilters extends PageParams {
  projectId?: string;
  status?: VariationStatus;
}

export const useVariations = (filters?: VariationFilters, enabled = true) =>
  useQuery({
    queryKey: ['variations', 'list', clean(filters)],
    queryFn: async () => (await api.get<Paginated<VariationDto>>('/variations', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });

export const useVariation = (id: string | undefined) =>
  useQuery({
    queryKey: ['variations', 'detail', id],
    queryFn: async () => (await api.get<VariationDto>(`/variations/${id}`)).data,
    enabled: !!id,
  });

export const useVariationSummary = (projectId?: string, enabled = true) =>
  useQuery({
    queryKey: ['variations', 'summary', projectId ?? 'all'],
    queryFn: async () => (await api.get<VariationSummaryDto[]>('/variations/summary', { params: clean({ projectId }) })).data,
    enabled,
  });

/* ---------- Safety ---------- */

export interface IncidentFilters extends PageParams {
  projectId?: string;
  type?: SafetyIncidentType;
  incidentsOnly?: boolean;
  status?: SafetyIncidentStatus;
  from?: string;
  to?: string;
}

export interface TalkFilters extends PageParams {
  projectId?: string;
  from?: string;
  to?: string;
}

export interface PermitFilters extends PageParams {
  projectId?: string;
  type?: WorkPermitType;
  status?: WorkPermitStatus;
  active?: boolean;
}

/* ---------- PPE register ---------- */

/** A project's workers with the PPE they hold and lack. */
export const usePpeRegister = (projectId: string | undefined) =>
  useQuery({
    queryKey: ['ppe', 'register', projectId],
    queryFn: async () => (await api.get<PpeRegisterDto>(`/ppe/projects/${projectId}/register`)).data,
    enabled: !!projectId,
    placeholderData: keepPreviousData,
  });

export interface PpeIssueFilters {
  projectId?: string;
  workerId?: string;
  status?: PpeIssueStatus;
  page?: number;
  pageSize?: number;
  q?: string;
}

export const usePpeIssues = (filters: PpeIssueFilters, enabled = true) =>
  useQuery({
    queryKey: ['ppe', 'issues', clean(filters)],
    queryFn: async () => (await api.get<Paginated<PpeIssueDto>>('/ppe/issues', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });

export function useIssuePpe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { id?: string; projectId: string; workerIds: string[]; kinds: PpeKind[]; issuedOn: string; size?: string | null; note?: string | null }) =>
      (await api.post<PpeIssueResultDto>('/ppe/issues', body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ppe'] }),
  });
}

export function useClosePpe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string; status: 'RETURNED' | 'LOST'; on: string; recoverable?: boolean; note?: string | null }) => (await api.post<PpeIssueDto>(`/ppe/issues/${id}/close`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ppe'] }),
  });
}

export function useDeletePpe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete<{ ok: true }>(`/ppe/issues/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ppe'] }),
  });
}

export function useSetPpeRequired() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, kinds }: { projectId: string; kinds: PpeKind[] }) => (await api.put<PpeRegisterDto>(`/ppe/projects/${projectId}/required`, { kinds })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ppe'] }),
  });
}

export const useSafetySummary = (projectId?: string) =>
  useQuery({
    queryKey: ['safety', 'summary', projectId ?? 'all'],
    queryFn: async () => (await api.get<SafetySummaryDto>('/safety/summary', { params: clean({ projectId }) })).data,
    placeholderData: keepPreviousData,
  });

export const useSafetyIncidents = (filters?: IncidentFilters) =>
  useQuery({
    queryKey: ['safety', 'incidents', clean(filters)],
    queryFn: async () => (await api.get<Paginated<SafetyIncidentDto>>('/safety/incidents', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
  });

export const useSafetyIncident = (id: string | undefined) =>
  useQuery({ queryKey: ['safety', 'incident', id], queryFn: async () => (await api.get<SafetyIncidentDto>(`/safety/incidents/${id}`)).data, enabled: !!id });

export const useSafetyIncidentHistory = (id: string | undefined) =>
  useQuery({ queryKey: ['safety', 'incident-history', id], queryFn: async () => (await api.get<AuditLogDto[]>(`/safety/incidents/${id}/history`)).data, enabled: !!id });

export const useToolboxTalks = (filters?: TalkFilters) =>
  useQuery({
    queryKey: ['safety', 'talks', clean(filters)],
    queryFn: async () => (await api.get<Paginated<ToolboxTalkDto>>('/safety/talks', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
  });

export const useWorkPermits = (filters?: PermitFilters) =>
  useQuery({
    queryKey: ['safety', 'permits', clean(filters)],
    queryFn: async () => (await api.get<Paginated<WorkPermitDto>>('/safety/permits', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
  });

export const useWorkPermit = (id: string | undefined) =>
  useQuery({ queryKey: ['safety', 'permit', id], queryFn: async () => (await api.get<WorkPermitDto>(`/safety/permits/${id}`)).data, enabled: !!id });

export const useWorkPermitHistory = (id: string | undefined) =>
  useQuery({ queryKey: ['safety', 'permit-history', id], queryFn: async () => (await api.get<AuditLogDto[]>(`/safety/permits/${id}/history`)).data, enabled: !!id });

/** Chainage strip, floor / village matrix and pipeline stages of a project (v4 item 41). */
export const useSectorProgress = (projectId: string | undefined) =>
  useQuery({
    queryKey: ['sector', projectId],
    queryFn: async () => (await api.get<SectorProgressDto>(`/projects/${projectId}/sector-progress`)).data,
    enabled: !!projectId,
  });

/* ---------- Maintenance (v4 item 42) ---------- */

export interface JobFilters extends PageParams {
  projectId?: string;
  equipmentId?: string;
  kind?: MaintenanceKind;
  status?: MaintenanceStatus;
}

export interface DocumentFilters extends PageParams {
  equipmentId?: string;
  type?: EquipmentDocType;
  state?: ExpiryState;
  latestOnly?: boolean;
}

export interface DriverFilters extends PageParams {
  equipmentId?: string;
  includeInactive?: boolean;
}

export const useMaintenanceSummary = (projectId?: string) =>
  useQuery({
    queryKey: ['maintenance', 'summary', projectId ?? 'all'],
    queryFn: async () => (await api.get<MaintenanceSummaryDto>('/maintenance/summary', { params: clean({ projectId }) })).data,
    placeholderData: keepPreviousData,
  });

export const useMaintenanceJobs = (filters?: JobFilters) =>
  useQuery({
    queryKey: ['maintenance', 'jobs', clean(filters)],
    queryFn: async () => (await api.get<Paginated<MaintenanceJobDto>>('/maintenance/jobs', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
  });

export const useMaintenanceJob = (id: string | undefined) =>
  useQuery({ queryKey: ['maintenance', 'job', id], queryFn: async () => (await api.get<MaintenanceJobDto>(`/maintenance/jobs/${id}`)).data, enabled: !!id });

export const useEquipmentDocuments = (filters?: DocumentFilters) =>
  useQuery({
    queryKey: ['maintenance', 'documents', clean(filters)],
    queryFn: async () => (await api.get<Paginated<EquipmentDocumentDto>>('/equipment-documents', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
  });

export const useDrivers = (filters?: DriverFilters) =>
  useQuery({
    queryKey: ['maintenance', 'drivers', clean(filters)],
    queryFn: async () => (await api.get<Paginated<DriverDto>>('/drivers', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
  });

/* Site imprest (v4 item 45) */
export const useImprests = (filters?: { projectId?: string; active?: boolean; mine?: boolean }) =>
  useQuery({
    queryKey: ['imprests', 'list', clean(filters)],
    queryFn: async () => (await api.get<ImprestDto[]>('/imprests', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
  });

export const useImprest = (id: string | null | undefined) =>
  useQuery({
    queryKey: ['imprests', 'one', id],
    queryFn: async () => (await api.get<ImprestDetailDto>(`/imprests/${id}`)).data,
    enabled: !!id,
  });

/* Guarantees, insurance and licences register (v4 item 46) */
export const useComplianceDocs = (filters?: { kind?: ComplianceDocKind; status?: ComplianceDocStatus | 'ALL'; state?: 'EXPIRING' | 'EXPIRED'; projectId?: string; q?: string }) =>
  useQuery({
    queryKey: ['compliance', 'list', clean(filters)],
    queryFn: async () => (await api.get<ComplianceRegisterDto>('/compliance-docs', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
  });

export const useComplianceDoc = (id: string | null | undefined) =>
  useQuery({
    queryKey: ['compliance', 'one', id],
    queryFn: async () => (await api.get<ComplianceDocDetailDto>(`/compliance-docs/${id}`)).data,
    enabled: !!id,
  });

export const useHandover = (projectId: string | undefined) =>
  useQuery({
    queryKey: ['handover', projectId],
    queryFn: async () => (await api.get<HandoverSummaryDto>(`/projects/${projectId}/handover`)).data,
    enabled: !!projectId,
  });

export const useDefects = (filters: { projectId?: string; phase?: DefectPhase; status?: 'OPEN' | 'FIXED' | 'CLOSED' | 'PENDING'; overdue?: boolean; q?: string; page?: number; pageSize?: number }) =>
  useQuery({
    queryKey: ['defects', 'list', clean(filters)],
    queryFn: async () => (await api.get<Paginated<DefectDto>>('/defects', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
  });

export const useDefect = (id: string | null | undefined) =>
  useQuery({
    queryKey: ['defects', 'one', id],
    queryFn: async () => (await api.get<DefectDto>(`/defects/${id}`)).data,
    enabled: !!id,
  });
export const useUnits = () =>
  useQuery({
    queryKey: ['units'],
    queryFn: async () => (await api.get<UnitDto[]>('/units')).data,
    staleTime: 5 * 60_000,
  });

export const useProcurementStatus = (filters: { projectId?: string; vendorId?: string; show?: 'PENDING' | 'LATE' | 'ALL'; from?: string; to?: string }) =>
  useQuery({
    queryKey: ['purchase-orders', 'status', clean(filters)],
    queryFn: async () => (await api.get<ProcurementStatusDto>('/purchase-orders/status', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
  });

/* Liquidated damages exposure (v4 item 50) */
export const useLdExposure = (enabled = true) =>
  useQuery({
    queryKey: ['ld-exposure'],
    queryFn: async () => (await api.get<LdExposureDto[]>('/ld-exposure')).data,
    enabled,
  });

/* ---------- saved views (UI roadmap item 55) ---------- */

export const useSavedViews = (list: SavedViewList, enabled = true) =>
  useQuery({ queryKey: ['saved-views', list], queryFn: async () => (await api.get<SavedViewDto[]>('/saved-views', { params: { list } })).data, enabled });

export function useSaveView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id?: string; list: SavedViewList; name?: string; shared?: boolean; state?: SavedViewState }) =>
      vars.id
        ? (await api.patch<SavedViewDto>(`/saved-views/${vars.id}`, { name: vars.name, shared: vars.shared, state: vars.state })).data
        : (await api.post<SavedViewDto>('/saved-views', { list: vars.list, name: vars.name, shared: vars.shared, state: vars.state })).data,
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['saved-views', vars.list] }),
  });
}

export function useDeleteView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; list: SavedViewList }) => (await api.delete(`/saved-views/${vars.id}`)).data,
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['saved-views', vars.list] }),
  });
}

/** Search everything (Ctrl K): records by number or name, a few of each kind, through the same rules as their lists. */
export function useSearch(q: string, enabled: boolean) {
  const term = q.trim();
  return useQuery({
    queryKey: ['search', term],
    queryFn: async () => (await api.get<SearchResultDto>('/search', { params: { q: term } })).data,
    enabled: enabled && term.length >= SEARCH_MIN_LENGTH,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

// ---- Ask Nirmaan (AI item 67) ----

export const useAiStatus = (enabled: boolean) =>
  useQuery({ queryKey: ['ai', 'status'], queryFn: async () => (await api.get<AiStatusDto>('/ai/status')).data, enabled, staleTime: 60_000 });

export const useAiThreads = (enabled: boolean) => useQuery({ queryKey: ['ai', 'threads'], queryFn: async () => (await api.get<AiThreadDto[]>('/ai/threads')).data, enabled });

export function useDeleteAiThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/ai/threads/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai', 'threads'] }),
  });
}

export const useAiFeedback = () =>
  useMutation({ mutationFn: async ({ id, value }: { id: string; value: 1 | -1 | null }) => (await api.post(`/ai/messages/${id}/feedback`, { value })).data });

/** The settings and a month's use (AI item 77: `month` YYYY-MM, the current one when left out). */
export const useAiSettings = (enabled: boolean, month?: string) =>
  useQuery({ queryKey: ['ai', 'settings', month ?? 'now'], queryFn: async () => (await api.get<AiSettingsDto>('/ai/settings', { params: { month } })).data, enabled, placeholderData: keepPreviousData });

export function useUpdateAiSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: { enabled?: boolean; monthlyCapInr?: number | null; roles?: RoleKey[] }) => (await api.patch<AiSettingsDto>('/ai/settings', d)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ai', 'settings'] });
      void qc.invalidateQueries({ queryKey: ['ai', 'status'] });
    },
  });
}

export interface AiConversationFilters {
  userId?: string;
  month?: string;
  q?: string;
  page: number;
  pageSize: number;
}

/** The admins' log of the company's conversations (AI item 77). */
export const useAiConversations = (f: AiConversationFilters, enabled: boolean) =>
  useQuery({ queryKey: ['ai', 'conversations', f], queryFn: async () => (await api.get<Paginated<AiConversationDto>>('/ai/conversations', { params: f })).data, enabled, placeholderData: keepPreviousData });

export const useAiConversation = (id: string | null) =>
  useQuery({ queryKey: ['ai', 'conversation', id], queryFn: async () => (await api.get<AiConversationDetailDto>(`/ai/conversations/${id}`)).data, enabled: !!id });

/** A bill's checks before approval (AI item 69); `version` refetches them when the bill itself was reloaded. */
export const useBillChecks = (kind: CheckKind, id: string | undefined, version?: number) =>
  useQuery({
    queryKey: ['checks', kind, id, version],
    queryFn: async () => (await api.get<BillChecksDto>(`/checks/${kind}/${id}`)).data,
    enabled: !!id,
    placeholderData: keepPreviousData,
  });

/** The model's one line over a bill's open flags, asked for only when the checks say it is not written yet. */
export const useBillCheckSummary = (kind: CheckKind, id: string | undefined, enabled: boolean) =>
  useQuery({
    queryKey: ['checks', kind, id, 'summary'],
    queryFn: async () => (await api.get<BillCheckSummaryDto>(`/checks/${kind}/${id}/summary`)).data,
    enabled: !!id && enabled,
    staleTime: Infinity,
  });

export function useAcceptCheck(kind: CheckKind, id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { key: string; note: string; reopen?: boolean }) =>
      (await api.post<BillChecksDto>(`/checks/${kind}/${id}/${v.reopen ? 'reopen' : 'accept'}`, v.reopen ? { key: v.key } : { key: v.key, note: v.note })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['checks', kind, id] }),
  });
}

// ---- Site photo checks (AI item 76) ----

/** A record's photo captions and flags; `version` refetches them when the record was reloaded (a photo added). */
export const usePhotoChecks = (kind: PhotoCheckKind, id: string | undefined, enabled = true, version?: number) =>
  useQuery({
    queryKey: ['photo-checks', kind, id, version],
    queryFn: async () => (await api.get<PhotoChecksDto>(`/photo-checks/${kind}/${id}`)).data,
    enabled: !!id && enabled,
    placeholderData: keepPreviousData,
  });

/** Checks the record's next few photos; the page asks again while some are left. */
export function useRunPhotoChecks(kind: PhotoCheckKind, id: string, version?: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.post<PhotoChecksDto>(`/photo-checks/${kind}/${id}/run`)).data,
    onSuccess: (d) => qc.setQueryData(['photo-checks', kind, id, version], d),
  });
}

/** The project's safety officer switches photo flags off or back on. */
export function useSetPhotoFlags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { projectId: string; flagsOff: boolean }) => (await api.put<{ projectId: string; flagsOff: boolean }>(`/photo-checks/projects/${v.projectId}`, { flagsOff: v.flagsOff })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['photo-checks'] }),
  });
}

/** A new snag's title, description and place from its photo, for the form; nothing is saved. */
export const useSnagDraft = () =>
  useMutation({ mutationFn: async (v: { attachmentId: string; projectId: string }) => (await api.post<SnagDraftDto>('/photo-checks/snag-draft', v)).data });

// ---- Early warnings, the watch list (AI item 73) ----

export const useWatchList = (enabled = true) =>
  useQuery({ queryKey: ['watch-list'], queryFn: async () => (await api.get<WatchListDto>('/warnings')).data, enabled });

/** Dismiss a warning with a reason, or bring a dismissed one back (`restore`). */
export function useDismissWarning() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { key: string; reason?: string; restore?: boolean }) =>
      (await api.post<WatchListDto>(`/warnings/${v.restore ? 'restore' : 'dismiss'}`, v.restore ? { key: v.key } : { key: v.key, reason: v.reason })).data,
    onSuccess: (d) => {
      qc.setQueryData(['watch-list'], d);
      void qc.invalidateQueries({ queryKey: ['dashboard', 'my-work'] });
    },
  });
}

// ---- Morning brief (AI item 74) ----

export const useMorningBrief = () => useQuery({ queryKey: ['brief-today'], queryFn: async () => (await api.get<BriefStatusDto>('/briefs/today')).data, staleTime: 5 * 60_000 });

/** Ask for the morning brief or stop it; turning it on brings back today's brief at once. */
export function useSetMorningBrief() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (morningBrief: boolean) => (await api.put<BriefStatusDto>('/briefs/me', { morningBrief })).data,
    onSuccess: (d) => qc.setQueryData(['brief-today'], d),
  });
}

// ---- Ask the contract (AI item 75) ----

/** One page of a filed PDF: the page an answer's citation opens. */
export const useDocumentPage = (file: string | null, page: number) =>
  useQuery({ queryKey: ['document-page', file, page], queryFn: async () => (await api.get<DocumentPageViewDto>(`/documents/files/${file}/pages/${page}`)).data, enabled: !!file });

// ---- Reading invoices, challans and drawings (AI item 70) ----

/** Sends page images to be read; saves nothing. */
export function useReadDocument() {
  return useMutation({
    mutationFn: async ({ kind, pages, purchaseOrderId }: { kind: DocReadKind; pages: Blob[]; purchaseOrderId?: string }) => {
      const fd = new FormData();
      fd.append('kind', kind);
      if (purchaseOrderId) fd.append('purchaseOrderId', purchaseOrderId);
      pages.forEach((p, i) => fd.append('pages', p, `page-${i + 1}.jpg`));
      return (await api.post<DocReadResultDto>('/ai/read', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120_000 })).data;
    },
  });
}

export interface DraftVendorBill {
  purchaseOrderId: string;
  invoiceNo: string;
  freight: number;
  invoiceTotal?: number | null;
  lines: { purchaseOrderLineId: string; quantity: number; rate: number; gstRate: number }[];
}

/** Item 69's checks on a vendor bill not yet saved. */
export const useDraftVendorBillChecks = (draft: DraftVendorBill | null) =>
  useQuery({
    queryKey: ['checks', 'draft', 'vendor-bill', draft],
    queryFn: async () => (await api.post<DraftChecksDto>('/checks/vendor-bill/preview', draft)).data,
    enabled: !!draft && !!draft.invoiceNo && draft.lines.length > 0,
    placeholderData: keepPreviousData,
  });
