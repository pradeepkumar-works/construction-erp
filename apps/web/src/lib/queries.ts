'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import type {
  InsightsDto,
  CubeAcceptanceDto,
  PourDto,
  PourStatus,
  QaPlanDto,
  TestTypeDto,
  TestsDueDto,
  GroupCompanyInput,
  GroupStateDto,
  ManagementReportDto,
  ManagementReportKey,
  PortfolioDto,
  PortfolioProjectDetailDto,
  ProjectSetupDto,
  DprWorkOptionsDto,
  CommentKind,
  ModuleSwitchesDto,
  NavSettingsDto,
  NavLook,
  ModuleTier,
  SwitchableModule,
  CommentThreadsDto,
  MentionableDto,
  SupplierChangeDto,
  SupplierDispatchDto,
  SupplierEnquiryDto,
  SupplierHomeDto,
  SupplierInvoiceDto,
  SupplierInvoiceStage,
  SupplierOrderDto,
  SupplierProfileDto,
  SupplierStatementDto,
  VendorPortalDto,
  MixDesignDto,
  RmcBatchDto,
  RmcBatchStatus,
  RmcDayDto,
  RmcInvoiceDto,
  RmcOrderDto,
  RmcOrderStatus,
  RmcPlantDto,
  RmcReceiptDto,
  LauncherBadgesDto,
  LauncherDto,
  LauncherFlagDto,
  HomeTilesDto,
  AccessRequestDto,
  MyAccessRequestDto,
  NavPinDto,
  NavPinKind,
  DocReadKind,
  DocReadResultDto,
  DraftChecksDto,
  BillChecksDto,
  WatchListDto,
  LeakageDto,
  AttendanceCheckDto,
  CashForecastDto,
  AiDraftDto,
  BillingReadinessDto,
  HindranceSuggestionDto,
  NoticeClockDto,
  NoticePeriodDto,
  DelayRegisterDto,
  DelayParty,
  RateBenchmarksDto,
  WarningKind,
  WarningOutcome,
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
  MasterCountsDto,
  MasterEntryDto,
  MasterListDto,
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
  OrderStage,
  ReceiptWait,
  RequestToOrderDto,
  RequestsToOrderPage,
  QuotationDto,
  ReceivableOrderDto,
  VendorBillDto,
  VendorBillKind,
  HireBillPreviewDto,
  BillableJobDto,
  DebitNoteDto,
  DebitNoteReason,
  WorkOrderDto,
  WorkOrderMarginDto,
  SubcontractBillDto,
  PayablesDto,
  VendorPaymentDto,
  PaymentRequestDto,
  PaymentRequestKind,
  ClientDto,
  MsmeCategory,
  UnlistedVendorDto,
  VendorDto,
  VendorKind,
  ProjectContractDto,
  BillingBreakupDto,
  EpcDto,
  OmDto,
  GettingStartedDto,
  EquipmentDto,
  EquipmentPartsDto,
  FleetUtilisationDto,
  MachineDayDto,
  MachineDaysDto,
  FuelIssueDto,
  FuelPositionDto,
  EquipmentOwnership,
  EquipmentPartKind,
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
  ComponentKindDto,
  ProjectTypeDto,
  DprFormDef,
  DprFormDto,
  DprFormVersionsDto,
  ApprovalMatrixDto,
  AuthOptionsDto,
  MeasurementSheetDto,
  ToMeasureItemDto,
  StandardNormPlanDto,
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
  ProjectStructureReconDto,
  ProjectPipeReconDto,
  ProjectKitReconDto,
  ProjectReconExceptionsDto,
  ActivityNormDto,
  MaterialNormDto,
  BoqResourceDto,
  BoqResourceKind,
  ProjectEstimateDto,
  ProjectSubconReconciliationDto,
  RateAnalysisResultDto,
  WastageReportDto,
  ExcessRecoveryDto,
  CashFlowDto,
  CashFlowGranularity,
  ProjectCostSummaryDto,
  ProgressReportDto,
  PaymentMode,
  ItemDto,
  ItemDuplicateGroupDto,
  MachineryLogDto,
  ReceivableRequestDto,
  StockBalanceDto,
  StockEntryDto,
  StockEntryType,
  StockValuationDto,
  ActivityDto,
  StructureDto,
  PipeNetworkDto,
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
  LetterStatus,
  LetterContactDto,
  LetterPersonDto,
  LetterSettingsDto,
  LetterSummaryDto,
  LetterTemplateDto,
  NcrSeverity,
  NcrStatus,
  QualitySummaryDto,
  QualityTestDto,
  TestKind,
  TestResult,
  BoqItemDto,
  CompanyDashboard,
  DailyReportDto,
  DprChecksDto,
  MaterialRequestDto,
  NotificationDto,
  NotificationListDto,
  NotificationTab,
  Paginated,
  PendingApprovalDto,
  ApprovalStageDto,
  ReviewResultDto,
  ReviewedItemDto,
  MyWorkDto,
  EmployeeEventDto,
  EmployeeEventType,
  HrDashboardDto,
  PayrollSettingsDto,
  BiometricDeviceDto,
  ConnectorAgentDto,
  DeviceLinkDto,
  IntegrationConnectionDto,
  IntegrationEventDto,
  IntegrationEventStatus,
  BookSource,
  BookVoucherDto,
  BookVoucherStatus,
  BookVoucherType,
  BooksStatusDto,
  LedgerAccountDto,
  BalanceSheetDto,
  BankReconciliationDto,
  BooksYearDto,
  ProfitLossDto,
  TrialBalanceByProjectDto,
  TrialBalanceDto,
  LedgerDto,
  BiometricUserDto,
  BiometricPunchDto,
  BiometricPunchResult,
  SalaryStructureDto,
  StaffLoanDto,
  PayrollRunDto,
  PayrollRunDetailDto,
  PayslipDto,
  FinalSettlementDto,
  ModuleHomeDto,
  HomeTrendsDto,
  NextProjectCodeDto,
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
  ProjectTypeDef,
  WorkElementType,
  ComponentKindDef,
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
  MaterialRequestStockDto,
  LastRatesDto,
  EnquiryDto,
  DrawingMarkupDto,
  DrawingTakeoffsDto,
  TakeoffBoqField,
  TakeoffKind,
  MarkupColor,
  MarkupKind,
  MarkupPoint,
  StoreSummaryDto,
  StockDestinationDto,
  EquipmentLoanListDto,
  SorBookDto,
  SorItemListDto,
  TenderDetailDto,
  PastOpeningsDto,
  ToolboxTalkDraftDto,
  TenderListDto,
  ScEnquiryDetailDto,
  ScEnquiryListDto,
  MeetingListDto,
  MeetingActionListDto,
  MeetingDetailDto,
  MeetingLinkOptionsDto,
  MaterialApprovalListDto,
  LookaheadDto,
  EarnedValueDto,
  EvBasis,
  MaterialApprovalDetailDto,
  ApprovedMakeDto,
  MakeWarningDto,
  EquipmentLoanDetailDto,
  EquipmentLoanStatus,
  LoanPreviewDto,
  CaptureListDto,
  CaptureSetupDto,
  InboundMessageDto,
  InboundState,
  ApplyUpdatesResultDto,
  ImportRowDto,
  ProjectUpdatesDto,
  TypeBundle, CalibrationRegisterDto, CertificateMissingDto, LabSamplesDto, QaInstrumentDto, QaLabDto, QaAuditDto, QaAuditKind, QaReportDto, DrawingNeedState, DrawingNeedDto, DrawingSource, DrawingScheduleDto, AsBuiltDueDto, DesignSubmissionListDto, DesignSubmissionDetailDto, DesignSubmissionStatus, DesignPurpose, DesignSubmissionKind, CopyState, ControlledCopyListDto, RevisionImpactDto, DesignDashboardDto, } from '@erp/shared';
import { CAD_MIME_TYPES, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, NOTIFICATION_TYPES_VERSION, SEARCH_MIN_LENGTH } from '@erp/shared';
import { api } from './api';
import { useModuleOn } from './modules';
import { FAIL_NOTICE, failNoticeSaying } from './notify';

export interface RoleDto {
  id: string;
  key: string;
  name: string;
}

export type ApprovalTypeParam = 'progress' | 'dpr' | 'material_request' | 'machinery' | 'expense' | 'measurement' | 'bill' | 'purchase_order' | 'vendor_bill' | 'work_order' | 'subcontract_bill' | 'inspection' | 'payment_request';

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
  PAYMENT_REQUEST: 'payment_request',
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
  /** Fuel items only (v5 item 93) */
  fuel?: boolean;
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
  '/payment-requests': { key: (id: string) => ['payment-requests', 'detail', id], path: '/payment-requests' },
  '/debit-notes': { key: (id: string) => ['debit-notes', 'detail', id], path: '/debit-notes' },
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
  sorItems: { key: ['tenders', 'sor-items'], path: '/sor-items', sortBy: 'code', byId: false },
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

/** A module's home page (v6 item 98): its figures and what waits for the caller in it, for the header's project or all. */
export const useModuleHome = (key: string, projectId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: ['dashboard', 'module', key, projectId ?? null],
    queryFn: async () => (await api.get<ModuleHomeDto>(`/dashboard/modules/${key}`, { params: projectId ? { projectId } : {} })).data,
    enabled,
    refetchInterval: 60_000,
  });

export const useCompanyDashboard = () =>
  useQuery({ queryKey: ['dashboard', 'company'], queryFn: async () => (await api.get<CompanyDashboard>('/dashboard/company')).data });

export const useGettingStarted = (enabled: boolean) =>
  useQuery({ queryKey: ['dashboard', 'getting-started'], queryFn: async () => (await api.get<GettingStartedDto>('/dashboard/getting-started')).data, enabled });

/** The new project's setup checklist (finding 6 of the October review); under the project's key, so team changes refresh it. */
export const useProjectSetup = (id: string | undefined) =>
  useQuery({
    queryKey: ['projects', id, 'setup'],
    queryFn: async () => (await api.get<ProjectSetupDto>(`/projects/${id}/setup`)).data,
    enabled: !!id,
    refetchOnMount: 'always',
  });

export const useHideProjectSetup = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (hidden: boolean) => (await api.put<ProjectSetupDto>(`/projects/${id}/setup`, { hidden })).data,
    onSuccess: (d) => qc.setQueryData(['projects', id, 'setup'], d),
    meta: FAIL_NOTICE,
  });
};

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

export const useUsersPage = (filters: UserFilters, enabled = true) =>
  useQuery({
    queryKey: ['users', 'page', clean(filters)],
    queryFn: async () => (await api.get<Paginated<UserSummary>>('/users', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
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

/** Work breakdown with rolled-up progress (item 125); under the activities key so any activity change refreshes it. */
export const useStructure = (projectId: string | undefined) =>
  useQuery({
    queryKey: ['activities', projectId, 'structure'],
    queryFn: async () => (await api.get<StructureDto>(`/projects/${projectId}/structure`)).data,
    enabled: !!projectId,
  });

/** Pipe zones and mains with their segments and stage progress (item 126); under the activities key so a change to the plan refreshes it. */
export const usePipeNetwork = (projectId: string | undefined) =>
  useQuery({
    queryKey: ['activities', projectId, 'pipe-network'],
    queryFn: async () => (await api.get<PipeNetworkDto>(`/projects/${projectId}/pipe-network`)).data,
    enabled: !!projectId,
  });

/** Gantt with milestones and the baseline; under the activities key so any activity change refreshes it. */
export const useGantt = (projectId: string | undefined) =>
  useQuery({
    queryKey: ['activities', projectId, 'gantt'],
    queryFn: async () => (await api.get<GanttDto>(`/projects/${projectId}/gantt`)).data,
    enabled: !!projectId,
  });

/** Three weeks from this Monday on a project (v6 item 114); under the activities key so a change to the plan refreshes it. */
export const useLookahead = (projectId: string | undefined) =>
  useQuery({ queryKey: ['activities', projectId, 'lookahead'], queryFn: async () => (await api.get<LookaheadDto>(`/projects/${projectId}/lookahead`)).data, enabled: !!projectId });
/** Links, moving to the links' dates and importing a schedule file: the Gantt, look-ahead and activities refresh. */
export function useScheduleAction<T = unknown>(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ method = 'post', path, body }: { method?: 'post' | 'patch' | 'delete'; path: string; body?: unknown }) =>
      (method === 'delete' ? await api.delete<T>(`/projects/${projectId}${path}`) : await api[method]<T>(`/projects/${projectId}${path}`, body ?? {})).data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['activities', projectId] }),
  });
}

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

/** What an approver should look at twice on a DPR (intelligence quick win Q3); advice only. */
export const useDprChecks = (dprId: string | undefined, enabled = true) =>
  useQuery({ queryKey: ['dpr', dprId, 'checks'], queryFn: async () => (await api.get<DprChecksDto>(`/dpr/${dprId}/checks`)).data, enabled: enabled && !!dprId, staleTime: 60_000 });

/** What a project's DPR form offers (item 127): activities that take progress, store items, open work orders. */
export const useDprWorkOptions = (projectId: string | undefined, date?: string) =>
  useQuery({
    queryKey: ['activities', projectId, 'dpr-options', date ?? null],
    queryFn: async () => (await api.get<DprWorkOptionsDto>('/dpr/work-options', { params: { projectId, date } })).data,
    enabled: !!projectId,
  });

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

/** Machine loans (v6 item 108): the loans with what each owes, and the running ones by lender. */
export const useMachineLoans = (filters?: { status?: EquipmentLoanStatus; q?: string; equipmentId?: string }, enabled = true) =>
  useQuery({
    queryKey: ['machine-loans', 'list', clean(filters)],
    queryFn: async () => (await api.get<EquipmentLoanListDto>('/machine-loans', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });
/** A loan with its EMI schedule; `id` may be an EMI's (a posted EMI in the books links to its loan). */
export const useMachineLoan = (id?: string) =>
  useQuery({ queryKey: ['machine-loans', 'one', id], queryFn: async () => (await api.get<EquipmentLoanDetailDto>(`/machine-loans/${id}`)).data, enabled: !!id });
/** The EMI and schedule the terms on a loan form give, as they are typed. */
export const useLoanPreview = (terms: { amount?: number | null; ratePct?: number | null; tenureMonths?: number | null; emi?: number | null; firstEmiDate?: string; sanctionDate?: string }, enabled = true) => {
  const ready = enabled && !!terms.amount && terms.ratePct !== null && terms.ratePct !== undefined && !!terms.tenureMonths && !!terms.firstEmiDate && !!terms.sanctionDate;
  return useQuery({
    queryKey: ['machine-loans', 'preview', clean(terms)],
    queryFn: async () => (await api.get<LoanPreviewDto>('/machine-loans/preview', { params: clean(terms) })).data,
    placeholderData: keepPreviousData,
    enabled: ready,
    staleTime: 60_000,
  });
};

/* ---------- tender bidding (v6 item 110) ---------- */

/** The tender register: open ones by default (soonest due first), with the year's figures. */
export const useTenders = (filters?: { status?: string; q?: string }, enabled = true) =>
  useQuery({ queryKey: ['tenders', 'list', clean(filters)], queryFn: async () => (await api.get<TenderListDto>('/tenders', { params: clean(filters) })).data, placeholderData: keepPreviousData, enabled });
export const useTender = (id?: string) => useQuery({ queryKey: ['tenders', 'one', id], queryFn: async () => (await api.get<TenderDetailDto>(`/tenders/${id}`)).data, enabled: !!id });
/** Where L1 landed on past openings of the same client and kind of work (intelligence quick win Q4). */
export const usePastOpenings = (id?: string) => useQuery({ queryKey: ['tenders', 'past', id], queryFn: async () => (await api.get<PastOpeningsDto>(`/tenders/${id}/past-openings`)).data, enabled: !!id });
export const useSorBooks = (enabled = true) => useQuery({ queryKey: ['tenders', 'sor-books'], queryFn: async () => (await api.get<SorBookDto[]>('/sor-books')).data, enabled });
export const useSorItems = (filters: { bookId?: string; q?: string; page?: number; pageSize?: number }, enabled = true) =>
  useQuery({ queryKey: ['tenders', 'sor-items', clean(filters)], queryFn: async () => (await api.get<SorItemListDto>('/sor-items', { params: clean(filters) })).data, placeholderData: keepPreviousData, enabled: enabled && !!filters.bookId });
/** Any change to a tender or a schedule of rates; a won tender's project and the guarantees refresh too. */
export function useTenderAction<T = TenderDetailDto>() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ method = 'post', path, body }: { method?: 'post' | 'patch' | 'put' | 'delete'; path: string; body?: unknown }) =>
      (method === 'delete' ? await api.delete<T>(path) : await api[method]<T>(path, body ?? {})).data,
    onSuccess: () => {
      for (const key of [['tenders'], ['compliance'], ['projects']]) void qc.invalidateQueries({ queryKey: key });
    },
  });
}

/* ---------- subcontract enquiries (v6 item 111) ---------- */

/** Enquiries to subcontractors: open ones by default (soonest closing first), with the year's figures. */
export const useScEnquiries = (filters?: { status?: string; projectId?: string; q?: string }, enabled = true) =>
  useQuery({
    queryKey: ['sc-enquiries', 'list', clean(filters)],
    queryFn: async () => (await api.get<ScEnquiryListDto>('/subcontract-enquiries', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });
export const useScEnquiry = (id?: string) =>
  useQuery({ queryKey: ['sc-enquiries', 'one', id], queryFn: async () => (await api.get<ScEnquiryDetailDto>(`/subcontract-enquiries/${id}`)).data, enabled: !!id });
/** Any change to an enquiry or its quotes; an award makes a work order, so those refresh too. */
export function useScEnquiryAction<T = ScEnquiryDetailDto>() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ method = 'post', path, body }: { method?: 'post' | 'patch' | 'put' | 'delete'; path: string; body?: unknown }) =>
      (method === 'delete' ? await api.delete<T>(path) : await api[method]<T>(path, body ?? {})).data,
    onSuccess: () => {
      for (const key of [['sc-enquiries'], ['work-orders']]) void qc.invalidateQueries({ queryKey: key });
    },
  });
}

/** Meetings and their actions (v6 item 112). */
export const useMeetings = (filters?: { status?: string; projectId?: string; q?: string }, enabled = true) =>
  useQuery({
    queryKey: ['meetings', 'list', clean(filters)],
    queryFn: async () => (await api.get<MeetingListDto>('/meetings', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });
export const useMeetingActions = (filters?: { status?: string; projectId?: string; q?: string; mine?: boolean }, enabled = true) =>
  useQuery({
    queryKey: ['meetings', 'actions', clean(filters)],
    queryFn: async () => (await api.get<MeetingActionListDto>('/meetings/actions', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });
export const useMeeting = (id?: string) =>
  useQuery({ queryKey: ['meetings', 'one', id], queryFn: async () => (await api.get<MeetingDetailDto>(`/meetings/${id}`)).data, enabled: !!id });
/** The RFIs, NCRs and variations of a project an action can be about. */
export const useMeetingLinkOptions = (projectId?: string) =>
  useQuery({ queryKey: ['meetings', 'links', projectId], queryFn: async () => (await api.get<MeetingLinkOptionsDto>(`/meetings/link-options/${projectId}`)).data, enabled: !!projectId, staleTime: 60_000 });
/** Any change to a meeting or an action; My work's card counts the caller's actions, so home refreshes too. */
export function useMeetingAction<T = MeetingDetailDto>() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ method = 'post', path, body }: { method?: 'post' | 'patch' | 'delete'; path: string; body?: unknown }) =>
      (method === 'delete' ? await api.delete<T>(path) : await api[method]<T>(path, body ?? {})).data,
    onSuccess: () => {
      for (const key of [['meetings'], ['dashboard']]) void qc.invalidateQueries({ queryKey: key });
    },
  });
}

/** Material approvals and each project's approved makes (v6 item 113). */
export const useMaterialApprovals = (filters?: { status?: string; kind?: string; projectId?: string; q?: string }, enabled = true) =>
  useQuery({
    queryKey: ['material-approvals', 'list', clean(filters)],
    queryFn: async () => (await api.get<MaterialApprovalListDto>('/material-approvals', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });
export const useMaterialApproval = (id?: string) =>
  useQuery({ queryKey: ['material-approvals', 'one', id], queryFn: async () => (await api.get<MaterialApprovalDetailDto>(`/material-approvals/${id}`)).data, enabled: !!id });
export const useApprovedMakes = (filters?: { projectId?: string; q?: string }, enabled = true) =>
  useQuery({
    queryKey: ['material-approvals', 'makes', clean(filters)],
    queryFn: async () => (await api.get<ApprovedMakeDto[]>('/material-approvals/makes', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });
/** Order lines whose material has approved makes on the project but name another make, or none. */
export const useMakeCheck = (projectId: string | undefined, lines: { itemName: string; make?: string | null }[]) => {
  // No check while the company has material approvals off (v6 item 117).
  const on = useModuleOn('material_approvals');
  return useQuery({
    queryKey: ['material-approvals', 'check', projectId, lines],
    queryFn: async () => (await api.post<MakeWarningDto[]>('/material-approvals/make-check', { projectId, lines })).data,
    enabled: on && !!projectId && lines.some((l) => l.itemName.trim()),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
};
export function useMaterialApprovalAction<T = MaterialApprovalDetailDto>() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ method = 'post', path, body }: { method?: 'post' | 'patch' | 'delete'; path: string; body?: unknown }) =>
      (method === 'delete' ? await api.delete<T>(path) : await api[method]<T>(path, body ?? {})).data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['material-approvals'] }),
  });
}

/** Central stores and yards (v6 item 106), each with its stock, value and transfers on the road. */
export const useStores = (enabled = true) => useQuery({ queryKey: ['stock', 'stores'], queryFn: async () => (await api.get<StoreSummaryDto[]>('/stock/stores')).data, enabled });
/** Every open site and store a stock keeper can send to, stores first. */
export const useStockDestinations = (enabled = true) =>
  useQuery({ queryKey: ['stock', 'destinations'], queryFn: async () => (await api.get<StockDestinationDto[]>('/stock/destinations')).data, enabled, staleTime: 60_000 });
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

/** Receipts waiting on a desk after the store (`RECEIPT_WAITS`): QA/QC's check, accounts' bill, a debit note. */
export const useWaitingReceipts = (waiting: ReceiptWait, filters: Omit<StockEntryFilters, 'qc' | 'type'>, enabled = true) =>
  useQuery({
    queryKey: ['stock', 'waiting', waiting, clean(filters)],
    queryFn: async () => (await api.get<Paginated<StockEntryDto>>('/stock/entries', { params: { ...clean(filters), allTypes: true, waiting } })).data,
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

export const useStockItems = (filters?: PageParams & { fuel?: boolean }, enabled = true) =>
  useQuery({
    queryKey: ['stock', 'items', clean(filters)],
    queryFn: async () => (await api.get<Paginated<ItemDto>>('/stock/items', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });

/** Items that look like one item, for the store manager to merge (finding 3 of the October review). */
export const useItemDuplicates = (enabled: boolean) =>
  useQuery({
    queryKey: ['stock', 'items', 'duplicates'],
    queryFn: async () => (await api.get<ItemDuplicateGroupDto[]>('/stock/items/duplicates')).data,
    enabled,
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

/* ---------- fuel and fleet use (v5 item 93) ---------- */

/** Each site's fuel on a day (today when left out) and the day's fuel issues into machines. */
export const useFuelPosition = (q: { date?: string; projectId?: string }) =>
  useQuery({
    queryKey: ['machinery', 'fuel-position', clean(q)],
    queryFn: async () => (await api.get<FuelPositionDto>('/fleet/fuel-position', { params: clean(q) })).data,
    placeholderData: keepPreviousData,
  });

export const useFuelIssues = (q: { from: string; to: string; projectId?: string; equipmentId?: string }, enabled = true) =>
  useQuery({
    queryKey: ['machinery', 'fuel-issues', clean(q)],
    queryFn: async () => (await api.get<FuelIssueDto[]>('/fleet/fuel-issues', { params: clean(q) })).data,
    enabled,
  });

export const useFleetUtilisation = (q: { from?: string; to?: string; projectId?: string }) =>
  useQuery({
    queryKey: ['machinery', 'utilisation', clean(q)],
    queryFn: async () => (await api.get<FleetUtilisationDto>('/fleet/utilisation', { params: clean(q) })).data,
    placeholderData: keepPreviousData,
  });

/** Engine hours from trackers and makers' feeds (item 146): each machine's days, the last week by default. */
export const useMachineDays = (q: { from?: string; to?: string; projectId?: string }) =>
  useQuery({
    queryKey: ['machinery', 'telematics', clean(q)],
    queryFn: async () => (await api.get<MachineDaysDto>('/telematics/days', { params: clean(q) })).data,
    placeholderData: keepPreviousData,
  });

/** One machine's day from its tracker, for the log form to fill from; null when nothing was read. */
export const useMachineDay = (equipmentId: string | undefined, date: string | undefined) =>
  useQuery({
    queryKey: ['machinery', 'telematics', 'day', equipmentId, date],
    queryFn: async () => ((await api.get<MachineDayDto | ''>('/telematics/day', { params: { equipmentId, date } })).data || null) as MachineDayDto | null,
    enabled: !!equipmentId && !!date,
    staleTime: 60_000,
  });

/** A dispenser's fill refused as a slip, tried again (item 147); the fuel and telematics figures are fetched again. */
export function useRetryDispense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.post<{ entryNo: string | null; problem: string | null }>(`/telematics/dispenses/${id}/retry`)).data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['machinery'] }),
  });
}

export interface FuelIssueInput {
  projectId: string;
  date: string;
  equipmentId: string;
  itemId: string;
  quantity: string;
  meterReading?: string | null;
  issuedTo?: string | null;
  remarks?: string | null;
}

/** Fuel from the store into a machine: an issue slip that names the machine and its meter. */
export function useFuelIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: FuelIssueInput) => (await api.post<StockEntryDto>('/stock/fuel-issues', body)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['machinery'] });
    },
  });
}

/** A machine's tyres and batteries with each one's life. */
export const useEquipmentParts = (equipmentId: string | undefined) =>
  useQuery({
    queryKey: ['machinery', 'parts', equipmentId],
    queryFn: async () => (await api.get<EquipmentPartsDto>(`/equipment/${equipmentId}/parts`)).data,
    enabled: !!equipmentId,
  });

export interface EquipmentPartInput {
  kind?: EquipmentPartKind;
  position?: string | null;
  make?: string | null;
  serialNo?: string | null;
  fittedOn?: string;
  fittedMeter?: string | null;
  removedOn?: string | null;
  removedMeter?: string | null;
  removalReason?: string | null;
  cost?: string | null;
  note?: string | null;
}

/** Fit (no `partId`), change or take off (`removedOn`) a tyre or battery; `remove` deletes a wrong entry. */
export function useSaveEquipmentPart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ equipmentId, partId, remove, ...body }: EquipmentPartInput & { equipmentId: string; partId?: string; remove?: boolean }) =>
      (remove
        ? await api.delete<EquipmentPartsDto>(`/equipment/${equipmentId}/parts/${partId}`)
        : partId
          ? await api.patch<EquipmentPartsDto>(`/equipment/${equipmentId}/parts/${partId}`, body)
          : await api.post<EquipmentPartsDto>(`/equipment/${equipmentId}/parts`, body)
      ).data,
    onSuccess: (data) => qc.setQueryData(['machinery', 'parts', data.equipmentId], data),
  });
}

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

/* Project types and component kinds (item 134): a save changes what New project, the Structure tab and the templates offer. */
const useTypeChange = <V, R>(fn: (v: V) => Promise<R>) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-types'] });
      qc.invalidateQueries({ queryKey: ['component-kinds'] });
      qc.invalidateQueries({ queryKey: ['activity-templates'] });
    },
    meta: FAIL_NOTICE,
  });
};

export const useProjectTypes = (enabled = true) =>
  useQuery({ queryKey: ['project-types'], queryFn: async () => (await api.get<ProjectTypeDto[]>('/project-types')).data, enabled, staleTime: 60_000 });

export const useComponentKinds = (enabled = true) =>
  useQuery({ queryKey: ['component-kinds'], queryFn: async () => (await api.get<ComponentKindDto[]>('/component-kinds')).data, enabled, staleTime: 60_000 });

export type NewProjectTypeInput = { code: string; name: string; baseType: ProjectType; description?: string; copyFrom?: string };
export type SaveProjectTypeInput = Omit<ProjectTypeDef, 'code' | 'activities'> & { activities?: ProjectTypeDef['activities'] };
export type NewComponentKindInput = { code: string; name: string; elementType: WorkElementType; copyFrom?: string };
export type SaveComponentKindInput = Omit<ComponentKindDef, 'code'>;

export const useCreateProjectType = () => useTypeChange(async (v: NewProjectTypeInput) => (await api.post<ProjectTypeDto>('/project-types', v)).data);
export const useSaveProjectType = () =>
  useTypeChange(async ({ code, ...v }: SaveProjectTypeInput & { code: string }) => (await api.put<ProjectTypeDto>(`/project-types/${code}`, v)).data);
export const useRemoveProjectType = () => useTypeChange(async (code: string) => (await api.delete<{ reset: boolean }>(`/project-types/${code}`)).data);
export const useCreateComponentKind = () => useTypeChange(async (v: NewComponentKindInput) => (await api.post<ComponentKindDto[]>('/component-kinds', v)).data);
export const useSaveComponentKind = () =>
  useTypeChange(async ({ code, ...v }: SaveComponentKindInput & { code: string }) => (await api.put<ComponentKindDto[]>(`/component-kinds/${code}`, v)).data);
export const useRemoveComponentKind = () => useTypeChange(async (code: string) => (await api.delete<ComponentKindDto[]>(`/component-kinds/${code}`)).data);

/* Update projects, export and import (item 134 part 3): what running projects would gain, adding it, and the types file. */
export const useTypeUpdates = (what: 'type' | 'kind', code: string | undefined, enabled = true) =>
  useQuery({
    queryKey: ['type-updates', what, code],
    queryFn: async () => (await api.get<ProjectUpdatesDto>(`/${what === 'type' ? 'project-types' : 'component-kinds'}/${code}/updates`)).data,
    enabled: enabled && !!code,
  });

export const useApplyTypeUpdates = (what: 'type' | 'kind', code: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (projects: { projectId: string; skip: string[] }[]) =>
      (await api.post<ApplyUpdatesResultDto>(`/${what === 'type' ? 'project-types' : 'component-kinds'}/${code}/updates`, { projects })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['type-updates'] });
      qc.invalidateQueries({ queryKey: ['activities'] });
      qc.invalidateQueries({ queryKey: ['project-types'] });
      qc.invalidateQueries({ queryKey: ['component-kinds'] });
    },
    meta: FAIL_NOTICE,
  });
};

export const exportProjectType = async (code: string) => (await api.get<TypeBundle>(`/project-types/${code}/export`)).data;
export const exportComponentKinds = async (codes?: string[]) => (await api.get<TypeBundle>('/component-kinds/export', { params: codes?.length ? { codes: codes.join(',') } : {} })).data;

export const useImportPreview = () =>
  useMutation({ mutationFn: async (file: unknown) => (await api.post<TypeImportPreviewDto>('/project-types/import/preview', { file })).data, meta: FAIL_NOTICE });
export const useImportTypes = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { file: unknown; picks: string[] }) => (await api.post<TypeImportResultDto>('/project-types/import', v)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-types'] });
      qc.invalidateQueries({ queryKey: ['component-kinds'] });
      qc.invalidateQueries({ queryKey: ['activity-templates'] });
      qc.invalidateQueries({ queryKey: ['dpr-form'] });
    },
    meta: FAIL_NOTICE,
  });
};
export type TypeImportPreviewDto = { from: string; exportedAt: string; rows: ImportRowDto[] };
export type TypeImportResultDto = { imported: number; skipped: string[] };

/* A type's DPR form (item 134 part 2): a save is a new version, which the next report on its projects takes. */
export const useDprForm = (code: string | undefined) =>
  useQuery({ queryKey: ['dpr-form', code], queryFn: async () => (await api.get<DprFormVersionsDto>(`/project-types/${code}/dpr-form`)).data, enabled: !!code });

const useDprFormChange = <V,>(fn: (v: V) => Promise<DprFormDto>) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (form) => {
      qc.invalidateQueries({ queryKey: ['dpr-form', form.typeCode] });
      // The DPR form's options carry the form.
      qc.invalidateQueries({ queryKey: ['activities'] });
    },
    meta: FAIL_NOTICE,
  });
};
export const useSaveDprForm = () => useDprFormChange(async ({ code, definition }: { code: string; definition: DprFormDef }) => (await api.put<DprFormDto>(`/project-types/${code}/dpr-form`, { definition })).data);
export const useResetDprForm = () => useDprFormChange(async (code: string) => (await api.delete<DprFormDto>(`/project-types/${code}/dpr-form`)).data);

/** The code to offer a new project of this type (finding 17 of the October review). */
export const useNextProjectCode = (type: ProjectType | undefined, enabled = true) =>
  useQuery({
    queryKey: ['next-project-code', type],
    queryFn: async () => (await api.get<NextProjectCodeDto>('/projects/next-code', { params: { type } })).data,
    enabled: enabled && !!type,
  });

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

/** Work approved on site that no measurement sheet holds yet (finding 14 of the October review). */
export const useToMeasure = (projectId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: ['to-measure', projectId],
    queryFn: async () => (await api.get<ToMeasureItemDto[]>('/measurements/to-measure', { params: { projectId } })).data,
    enabled: !!projectId && enabled,
  });

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

/* ---------- QA/QC plans and pours (item 137) ---------- */

/** The company's test types; switched-off ones only with `all`, for the master page. */
export const useTestTypes = (all = false) =>
  useQuery({
    queryKey: ['quality', 'qa', 'test-types'],
    queryFn: async () => (await api.get<TestTypeDto[]>('/qa/test-types')).data,
    staleTime: 5 * 60_000,
    select: (types) => (all ? types : types.filter((t) => t.active)),
  });

export const useQaPlan = (projectId: string | undefined) =>
  useQuery({
    queryKey: ['quality', 'qa', 'plan', projectId],
    queryFn: async () => (await api.get<QaPlanDto>('/qa/plan', { params: { projectId } })).data,
    enabled: !!projectId,
  });

export const useTestsDue = (projectId?: string, short?: boolean) =>
  useQuery({
    queryKey: ['quality', 'qa', 'due', projectId ?? null, !!short],
    queryFn: async () => (await api.get<TestsDueDto>('/qa/tests-due', { params: clean({ projectId, short: short || undefined }) })).data,
    placeholderData: keepPreviousData,
  });

export const useCubeAcceptance = (projectId?: string) =>
  useQuery({
    queryKey: ['quality', 'qa', 'cubes', projectId ?? null],
    queryFn: async () => (await api.get<CubeAcceptanceDto[]>('/qa/cubes', { params: clean({ projectId }) })).data,
  });

export interface PourFilters extends PageParams {
  projectId?: string;
  status?: PourStatus;
  flagged?: boolean;
  grade?: string;
}

export const usePours = (filters?: PourFilters) =>
  useQuery({
    queryKey: ['quality', 'qa', 'pours', clean(filters)],
    queryFn: async () => (await api.get<Paginated<PourDto>>('/qa/pours', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
  });

export const usePour = (id: string | null | undefined) =>
  useQuery({
    queryKey: ['quality', 'qa', 'pours', 'detail', id],
    queryFn: async () => (await api.get<PourDto>(`/qa/pours/${id}`)).data,
    enabled: !!id,
  });

/* ---------- QA/QC registers (item 137 part 2) ---------- */

export const useQaLabs = (enabled = true) =>
  useQuery({ queryKey: ['quality', 'qa', 'labs'], queryFn: async () => (await api.get<QaLabDto[]>('/qa/labs')).data, staleTime: 60_000, enabled });

export interface LabSampleFilters extends PageParams {
  projectId?: string;
  labId?: string;
  state?: 'AT_LAB' | 'REPORTED';
  late?: boolean;
}

export const useLabSamples = (filters?: LabSampleFilters) =>
  useQuery({
    queryKey: ['quality', 'qa', 'samples', clean(filters)],
    queryFn: async () => (await api.get<LabSamplesDto>('/qa/samples', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
  });

export const useInstruments = (filters?: { projectId?: string; attention?: boolean }, enabled = true) =>
  useQuery({
    queryKey: ['quality', 'qa', 'instruments', clean(filters)],
    queryFn: async () => (await api.get<CalibrationRegisterDto>('/qa/instruments', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });

export const useInstrument = (id: string | null | undefined) =>
  useQuery({
    queryKey: ['quality', 'qa', 'instruments', 'detail', id],
    queryFn: async () => (await api.get<QaInstrumentDto>(`/qa/instruments/${id}`)).data,
    enabled: !!id,
  });

export const useCertificateCategories = () =>
  useQuery({
    queryKey: ['quality', 'qa', 'certificate-categories'],
    queryFn: async () => (await api.get<{ categories: string[]; standard: string[]; canEdit: boolean }>('/qa/certificate-categories')).data,
    staleTime: 5 * 60_000,
  });

export const useCertificatesMissing = (projectId?: string) =>
  useQuery({
    queryKey: ['quality', 'qa', 'certificates-missing', projectId ?? null],
    queryFn: async () => (await api.get<CertificateMissingDto[]>('/qa/certificates-missing', { params: clean({ projectId }) })).data,
  });

export interface QaAuditFilters extends PageParams {
  projectId?: string;
  kind?: QaAuditKind;
  open?: boolean;
}

export const useQaAudits = (filters?: QaAuditFilters) =>
  useQuery({
    queryKey: ['quality', 'qa', 'audits', clean(filters)],
    queryFn: async () => (await api.get<Paginated<QaAuditDto>>('/qa/audits', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
  });

export const useQaAudit = (id: string | null | undefined) =>
  useQuery({
    queryKey: ['quality', 'qa', 'audits', 'detail', id],
    queryFn: async () => (await api.get<QaAuditDto>(`/qa/audits/${id}`)).data,
    enabled: !!id,
  });

export const useQaReport = (month: string, projectId?: string) =>
  useQuery({
    queryKey: ['quality', 'qa', 'report', month, projectId ?? null],
    queryFn: async () => (await api.get<QaReportDto>('/qa/report', { params: clean({ month, projectId }) })).data,
    placeholderData: keepPreviousData,
  });

export interface DrawingScheduleFilters extends PageParams {
  projectId?: string;
  state?: DrawingNeedState | 'LATE' | 'SOON';
  discipline?: DocumentDiscipline;
  source?: DrawingSource;
}

export const useDrawingSchedule = (filters?: DrawingScheduleFilters) =>
  useQuery({
    queryKey: ['documents', 'schedule', clean(filters)],
    queryFn: async () => (await api.get<DrawingScheduleDto>('/design/schedule', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
  });

export const useDrawingNeed = (id: string | null | undefined) =>
  useQuery({
    queryKey: ['documents', 'schedule', 'detail', id],
    queryFn: async () => (await api.get<DrawingNeedDto>(`/design/schedule/${id}`)).data,
    enabled: !!id,
  });

export const useAsBuiltDue = (projectId?: string, enabled = true) =>
  useQuery({
    queryKey: ['documents', 'as-built-due', projectId ?? null],
    queryFn: async () => (await api.get<AsBuiltDueDto[]>('/design/as-built-due', { params: clean({ projectId }) })).data,
    enabled,
  });

export interface DesignSubmissionFilters extends PageParams {
  projectId?: string;
  status?: DesignSubmissionStatus | 'LATE' | 'WITH_US';
  purpose?: DesignPurpose;
  kind?: DesignSubmissionKind;
  toAnswer?: boolean;
}

/** Design submissions (item 138 part 2): late reviews first, with the summary over the filter. */
export const useDesignSubmissions = (filters?: DesignSubmissionFilters) =>
  useQuery({
    queryKey: ['documents', 'design-submissions', clean(filters)],
    queryFn: async () => (await api.get<DesignSubmissionListDto>('/design/submissions', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
  });

export const useDesignSubmission = (id: string | null | undefined) =>
  useQuery({
    queryKey: ['documents', 'design-submissions', 'detail', id],
    queryFn: async () => (await api.get<DesignSubmissionDetailDto>(`/design/submissions/${id}`)).data,
    enabled: !!id,
  });

/** Any change to a design submission; the register, letters and risks it touches refresh too. */
export function useDesignSubmissionAction<T = DesignSubmissionDetailDto>() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ method = 'post', path, body }: { method?: 'post' | 'put' | 'delete'; path: string; body?: unknown }) =>
      (method === 'delete' ? await api.delete<T>(path) : await api[method]<T>(path, body ?? {})).data,
    meta: FAIL_NOTICE,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['documents'] });
      void qc.invalidateQueries({ queryKey: ['letters'] });
      void qc.invalidateQueries({ queryKey: ['risks'] });
    },
  });
}

export interface ControlledCopyFilters extends PageParams {
  projectId?: string;
  documentId?: string;
  state?: CopyState | 'LATE';
}

export const useControlledCopies = (filters?: ControlledCopyFilters, enabled = true) =>
  useQuery({
    queryKey: ['documents', 'copies', clean(filters)],
    queryFn: async () => (await api.get<ControlledCopyListDto>('/design/copies', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });

export const useRevisionImpact = (documentId: string | null | undefined) =>
  useQuery({
    queryKey: ['documents', 'impact', documentId],
    queryFn: async () => (await api.get<RevisionImpactDto>(`/design/revision-impact/${documentId}`)).data,
    enabled: !!documentId,
  });

export const useDesignDashboard = (projectId?: string) =>
  useQuery({
    queryKey: ['documents', 'design-dashboard', projectId ?? null],
    queryFn: async () => (await api.get<DesignDashboardDto>('/design/dashboard', { params: clean({ projectId }) })).data,
  });

/** Issue, give the new revision, take back or delete controlled copies; the register, the dashboard and the lists follow. */
export function useCopyAction<T = unknown>() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ method = 'post', path, body }: { method?: 'post' | 'delete'; path: string; body?: unknown }) =>
      (method === 'delete' ? await api.delete<T>(path) : await api.post<T>(path, body ?? {})).data,
    meta: FAIL_NOTICE,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['documents'] });
      void qc.invalidateQueries({ queryKey: ['watch-list'] });
    },
  });
}

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

/* ---------- drawing markup (item 109) ---------- */

/** Every mark on a document's revisions; the viewer picks the ones on the sheet it shows. */
export const useDrawingMarkups = (documentId: string | undefined) =>
  useQuery({ queryKey: ['documents', 'markups', documentId], queryFn: async () => (await api.get<DrawingMarkupDto[]>(`/documents/${documentId}/markups`)).data, enabled: !!documentId });

export interface NewMarkupInput {
  id: string;
  revisionId: string;
  attachmentId: string;
  page: number;
  kind: MarkupKind;
  points: MarkupPoint[];
  color: MarkupColor;
  note: string | null;
}

function useMarkupMutation<V, R>(documentId: string | undefined, fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents', 'markups', documentId] });
      // Open counts on the register, and the document's history.
      qc.invalidateQueries({ queryKey: ['documents', 'list'] });
      qc.invalidateQueries({ queryKey: ['documents', 'history', documentId] });
    },
    meta: FAIL_NOTICE,
  });
}

export const useCreateMarkup = (documentId: string | undefined) =>
  useMarkupMutation(documentId, async (v: NewMarkupInput) => (await api.post<DrawingMarkupDto>(`/documents/${documentId}/markups`, v)).data);
export const useUpdateMarkup = (documentId: string | undefined) =>
  useMarkupMutation(documentId, async ({ id, ...v }: { id: string; points?: MarkupPoint[]; color?: MarkupColor; note?: string | null }) => (await api.patch<DrawingMarkupDto>(`/documents/${documentId}/markups/${id}`, v)).data);
export const useResolveMarkup = (documentId: string | undefined) =>
  useMarkupMutation(documentId, async ({ id, resolved, note }: { id: string; resolved: boolean; note?: string | null }) =>
    (await api.post<DrawingMarkupDto>(`/documents/${documentId}/markups/${id}/${resolved ? 'resolve' : 'reopen'}`, resolved ? { note: note || null } : {})).data,
  );
export const useLinkMarkupRfi = (documentId: string | undefined) =>
  useMarkupMutation(documentId, async ({ id, rfiId }: { id: string; rfiId: string | null }) => (await api.put<DrawingMarkupDto>(`/documents/${documentId}/markups/${id}/rfi`, { rfiId })).data);
export const useDeleteMarkup = (documentId: string | undefined) => useMarkupMutation(documentId, async (id: string) => (await api.delete(`/documents/${documentId}/markups/${id}`)).data);

/* ---------- measuring on drawings (v6 item 118) ---------- */

/** The scales of a document's sheets and every measure on them. */
export const useDrawingTakeoffs = (documentId: string | undefined) =>
  useQuery({ queryKey: ['documents', 'takeoffs', documentId], queryFn: async () => (await api.get<DrawingTakeoffsDto>(`/documents/${documentId}/takeoffs`)).data, enabled: !!documentId });

export interface NewTakeoffInput {
  id: string;
  revisionId: string;
  attachmentId: string;
  page: number;
  kind: TakeoffKind;
  points: MarkupPoint[];
  label: string;
}

/** Every takeoff call answers with the whole set, which replaces the cached one. */
function useTakeoffMutation<V>(documentId: string | undefined, fn: (v: V) => Promise<DrawingTakeoffsDto>, also?: (qc: ReturnType<typeof useQueryClient>) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data) => {
      qc.setQueryData(['documents', 'takeoffs', documentId], data);
      qc.invalidateQueries({ queryKey: ['documents', 'history', documentId] });
      also?.(qc);
    },
    meta: FAIL_NOTICE,
  });
}

export const useSetDrawingScale = (documentId: string | undefined) =>
  useTakeoffMutation(documentId, async (v: { attachmentId: string; page: number; points: MarkupPoint[]; lengthM: number; aspect: number }) => (await api.put<DrawingTakeoffsDto>(`/documents/${documentId}/takeoffs/scale`, v)).data);
export const useCreateTakeoff = (documentId: string | undefined) =>
  useTakeoffMutation(documentId, async (v: NewTakeoffInput) => (await api.post<DrawingTakeoffsDto>(`/documents/${documentId}/takeoffs`, v)).data);
export const useRenameTakeoff = (documentId: string | undefined) =>
  useTakeoffMutation(documentId, async ({ id, label }: { id: string; label: string }) => (await api.patch<DrawingTakeoffsDto>(`/documents/${documentId}/takeoffs/${id}`, { label })).data);
export const useDeleteTakeoff = (documentId: string | undefined) =>
  useTakeoffMutation(documentId, async (id: string) => (await api.delete<DrawingTakeoffsDto>(`/documents/${documentId}/takeoffs/${id}`)).data);
export const useTakeoffsToMeasurement = (documentId: string | undefined) =>
  useTakeoffMutation(documentId, async (v: { ids: string[]; measurementId: string }) => (await api.put<DrawingTakeoffsDto>(`/documents/${documentId}/takeoffs/measurement`, v)).data);
export const useTakeoffsToBoq = (documentId: string | undefined, projectId: string | undefined) =>
  useTakeoffMutation(
    documentId,
    async (v: { ids: string[]; boqItemId: string; field: TakeoffBoqField; factor?: number }) => (await api.put<DrawingTakeoffsDto>(`/documents/${documentId}/takeoffs/boq`, v)).data,
    (qc) => {
      qc.invalidateQueries({ queryKey: ['boq', projectId] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  );

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
  /** A project id, or HO for head office letters */
  projectId?: string;
  direction?: LetterDirection;
  status?: LetterStatus;
  category?: string;
  riskId?: string;
  mine?: boolean;
  toSign?: boolean;
  awaitingReply?: boolean;
  overdue?: boolean;
  proofMissing?: boolean;
  unmarked?: boolean;
}

/** Correspondence (item 136): the inward and outward registers. */
export const useLetters = (filters?: LetterFilters, enabled = true) =>
  useQuery({
    queryKey: ['letters', clean(filters)],
    queryFn: async () => (await api.get<Paginated<LetterDto>>('/letters', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });

export const useLetter = (id: string | undefined) =>
  useQuery({
    queryKey: ['letters', 'detail', id],
    queryFn: async () => (await api.get<LetterDto>(`/letters/${id}`)).data,
    enabled: !!id,
  });

export const useLetterSummary = (enabled = true) =>
  useQuery({
    queryKey: ['letters', 'summary'],
    queryFn: async () => (await api.get<LetterSummaryDto>('/letters/summary')).data,
    enabled,
  });

/** Staff a letter can be marked to, and who may sign one for the project (head office when left out). */
export const useLetterPeople = (projectId: string | null | undefined, enabled = true) =>
  useQuery({
    queryKey: ['letters', 'people', projectId ?? 'HO'],
    queryFn: async () => (await api.get<LetterPersonDto[]>('/letters/people', { params: projectId ? { projectId } : {} })).data,
    staleTime: 5 * 60_000,
    enabled,
  });

export const useLetterSettings = (enabled = true) =>
  useQuery({
    queryKey: ['letters', 'settings'],
    queryFn: async () => (await api.get<LetterSettingsDto>('/letters/settings')).data,
    enabled,
  });

export const useLetterContacts = (all = false, enabled = true) =>
  useQuery({
    queryKey: ['letter-contacts', all],
    queryFn: async () => (await api.get<Paginated<LetterContactDto>>('/letter-contacts', { params: { pageSize: MAX_PAGE_SIZE, ...(all ? { all: true } : {}) } })).data.items,
    enabled,
  });

export const useLetterTemplates = (enabled = true) =>
  useQuery({
    queryKey: ['letter-templates'],
    queryFn: async () => (await api.get<LetterTemplateDto[]>('/letter-templates')).data,
    enabled,
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

/** Overtime waiting on the caller (v5 item 97), oldest first. */
export const useOvertimeToDecide = (enabled = true) =>
  useQuery({
    queryKey: ['staff', 'overtime'],
    queryFn: async () => (await api.get<StaffAttendanceDto[]>('/staff/overtime')).data,
    enabled,
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

/* ---------- HR records (v6 item 99) ---------- */

export interface EmployeeEventFilters extends PageParams {
  employeeId?: string;
  type?: EmployeeEventType;
  from?: string;
  to?: string;
}

/** Service events (joining to exit), newest first. */
export const useEmployeeEvents = (filters?: EmployeeEventFilters, enabled = true) =>
  useQuery({
    queryKey: ['staff', 'events', clean(filters)],
    queryFn: async () => (await api.get<Paginated<EmployeeEventDto>>('/staff/events', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });

export const useHrDashboard = (enabled = true) =>
  useQuery({ queryKey: ['staff', 'hr-dashboard'], queryFn: async () => (await api.get<HrDashboardDto>('/staff/hr-dashboard')).data, enabled });

export const useEmployeeDocuments = (employeeId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: ['staff', 'documents', employeeId],
    queryFn: async () => (await api.get<AttachmentDto[]>(`/staff/employees/${employeeId}/documents`)).data,
    enabled: !!employeeId && enabled,
  });

/** Record a confirmation, transfer, promotion, increment, warning or exit; the staff record changes to match. */
export function useRecordEmployeeEvent(employeeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => (await api.post<EmployeeEventDto>(`/staff/employees/${employeeId}/events`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] }),
  });
}

export function useRemoveEmployeeEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/staff/events/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] }),
  });
}

export function useSetEmployeeDocuments(employeeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (attachmentIds: string[]) => (await api.put<AttachmentDto[]>(`/staff/employees/${employeeId}/documents`, { attachmentIds })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff', 'documents', employeeId] }),
  });
}

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

/* ---------- payroll (v6 item 100) ---------- */

export const usePayrollSettings = (enabled = true) =>
  useQuery({ queryKey: ['payroll', 'settings'], queryFn: async () => (await api.get<PayrollSettingsDto>('/payroll/settings')).data, enabled });

/** Each employee's salary in force today, or one employee's history. */
export const useSalaryStructures = (employeeId?: string, enabled = true) =>
  useQuery({
    queryKey: ['payroll', 'structures', employeeId ?? null],
    queryFn: async () => (await api.get<SalaryStructureDto[]>('/payroll/structures', { params: clean({ employeeId }) })).data,
    enabled,
  });

export const useStaffLoans = (filters: { employeeId?: string; open?: boolean } = {}, enabled = true) =>
  useQuery({ queryKey: ['payroll', 'loans', clean(filters)], queryFn: async () => (await api.get<StaffLoanDto[]>('/payroll/loans', { params: clean(filters) })).data, enabled });

export const usePayrollRuns = (enabled = true) =>
  useQuery({ queryKey: ['payroll', 'runs'], queryFn: async () => (await api.get<PayrollRunDto[]>('/payroll/runs')).data, enabled });

export const usePayrollRun = (id: string | null | undefined) =>
  useQuery({ queryKey: ['payroll', 'run', id], queryFn: async () => (await api.get<PayrollRunDetailDto>(`/payroll/runs/${id}`)).data, enabled: !!id });

export const useMyPayslips = (enabled = true) =>
  useQuery({ queryKey: ['payroll', 'mine'], queryFn: async () => (await api.get<PayslipDto[]>('/payroll/my-payslips')).data, enabled });

export const useSettlements = (enabled = true) =>
  useQuery({ queryKey: ['payroll', 'settlements'], queryFn: async () => (await api.get<FinalSettlementDto[]>('/payroll/settlements')).data, enabled });

export const useSettlementsDue = (enabled = true) =>
  useQuery({
    queryKey: ['payroll', 'settlements', 'due'],
    queryFn: async () => (await api.get<{ employeeId: string; fullName: string; employeeCode: string; designation: string; leftOn: string | null }[]>('/payroll/settlements/due')).data,
    enabled,
  });

/** Any payroll write: POST, PUT or DELETE on a payroll path; everything payroll is fetched again after it. */
export function usePayrollAction<T = unknown>() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ method = 'post', path, body }: { method?: 'post' | 'put' | 'delete'; path: string; body?: unknown }) =>
      (method === 'delete' ? await api.delete<T>(path) : await api[method]<T>(path, body ?? {})).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll'] }),
  });
}

/* Biometric attendance (v6 item 101); every key starts with 'biometric'. */
export const useBiometricDevices = (enabled = true) =>
  useQuery({ queryKey: ['biometric', 'devices'], queryFn: async () => (await api.get<BiometricDeviceDto[]>('/biometric/devices')).data, enabled });

export const useBiometricUsers = (enabled = true) =>
  useQuery({ queryKey: ['biometric', 'users'], queryFn: async () => (await api.get<BiometricUserDto[]>('/biometric/users')).data, enabled });

export const useBiometricPunches = (filters: { date: string; deviceId?: string; result?: BiometricPunchResult; pin?: string }) =>
  useQuery({
    queryKey: ['biometric', 'punches', clean(filters)],
    queryFn: async () => (await api.get<BiometricPunchDto[]>('/biometric/punches', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
  });

/* ---------- connections (item 139) ---------- */

export const useIntegrationConnections = () =>
  useQuery({ queryKey: ['integrations', 'connections'], queryFn: async () => (await api.get<IntegrationConnectionDto[]>('/integrations/connections')).data });

export const useConnectorAgents = () => useQuery({ queryKey: ['integrations', 'agents'], queryFn: async () => (await api.get<ConnectorAgentDto[]>('/integrations/agents')).data });

export const useDeviceLinks = () => useQuery({ queryKey: ['integrations', 'devices'], queryFn: async () => (await api.get<DeviceLinkDto[]>('/integrations/devices')).data });

export const useIntegrationEvents = (filters: { connectionId?: string; status?: IntegrationEventStatus }) =>
  useQuery({
    queryKey: ['integrations', 'events', clean(filters)],
    queryFn: async () => (await api.get<IntegrationEventDto[]>('/integrations/events', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
  });

/** Any write on connections, Connectors or devices; all of them are fetched again after it. */
export function useIntegrationAction<T = unknown>() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ method = 'post', path, body }: { method?: 'post' | 'patch' | 'delete'; path: string; body?: unknown }) =>
      (method === 'delete' ? await api.delete<T>(path) : await api[method]<T>(path, body ?? {})).data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['integrations'] }),
  });
}

/** Any biometric write; devices, users and punches are fetched again after it, and the staff register too. */
export function useBiometricAction<T = unknown>() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ method = 'post', path, body }: { method?: 'post' | 'put' | 'patch' | 'delete'; path: string; body?: unknown }) =>
      (method === 'delete' ? await api.delete<T>(path) : await api[method]<T>(path, body ?? {})).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['biometric'] });
      void qc.invalidateQueries({ queryKey: ['staff'] });
      void qc.invalidateQueries({ queryKey: ['workers'] });
    },
  });
}

/* Books of account (v6 item 102); every key starts with 'books'. */
export const useBooksStatus = (enabled = true) => useQuery({ queryKey: ['books', 'status'], queryFn: async () => (await api.get<BooksStatusDto>('/books/status')).data, enabled });

export const useLedgerAccounts = (filters: { to?: string; projectId?: string } = {}, enabled = true) =>
  useQuery({
    queryKey: ['books', 'accounts', clean(filters)],
    queryFn: async () => (await api.get<LedgerAccountDto[]>('/books/accounts', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });

export const useLedger = (filters: { accountId?: string; from?: string; to?: string; projectId?: string }) =>
  useQuery({
    queryKey: ['books', 'ledger', clean(filters)],
    queryFn: async () => (await api.get<LedgerDto>('/books/ledger', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled: !!filters.accountId,
  });

export interface DayBookFilters extends PageParams {
  from?: string;
  to?: string;
  type?: BookVoucherType;
  source?: BookSource;
  projectId?: string;
}
export const useDayBook = (filters: DayBookFilters) =>
  useQuery({
    queryKey: ['books', 'day-book', clean(filters)],
    queryFn: async () => (await api.get<Paginated<BookVoucherDto> & { debit: string }>('/books/day-book', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
  });

export const useBookVouchers = (filters: PageParams & { status?: BookVoucherStatus; toDecide?: boolean }) =>
  useQuery({
    queryKey: ['books', 'vouchers', clean(filters)],
    queryFn: async () => (await api.get<Paginated<BookVoucherDto>>('/books/vouchers', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
  });

export const useBookVoucher = (id: string | null) =>
  useQuery({ queryKey: ['books', 'voucher', id], queryFn: async () => (await api.get<BookVoucherDto>(`/books/vouchers/${id}`)).data, enabled: !!id });

/** Any write to the books; everything in them is fetched again after it, and the Accounts home too. */
export function useBooksAction<T = unknown>() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ method = 'post', path, body }: { method?: 'post' | 'put' | 'patch' | 'delete'; path: string; body?: unknown }) =>
      (method === 'delete' ? await api.delete<T>(path) : await api[method]<T>(path, body ?? {})).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['books'] });
      void qc.invalidateQueries({ queryKey: ['dashboard', 'module', 'accounts'] });
    },
  });
}

// ----- Financial statements (v6 item 103); under ['books'] so every books action refreshes them -----

export const useTrialBalance = (filters: { from: string; to: string; projectId?: string }, byProject = false) =>
  useQuery({
    queryKey: ['books', 'statements', 'trial', byProject, clean(filters)],
    queryFn: async () => (await api.get<TrialBalanceDto | TrialBalanceByProjectDto>(byProject ? '/statements/trial-balance/by-project' : '/statements/trial-balance', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
  });

export const useProfitLoss = (filters: { from: string; to: string; projectId?: string; byProject?: boolean }) =>
  useQuery({
    queryKey: ['books', 'statements', 'pl', clean(filters)],
    queryFn: async () => (await api.get<ProfitLossDto>('/statements/profit-loss', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
  });

export const useBalanceSheet = (asOn: string) =>
  useQuery({
    queryKey: ['books', 'statements', 'bs', asOn],
    queryFn: async () => (await api.get<BalanceSheetDto>('/statements/balance-sheet', { params: { asOn } })).data,
    placeholderData: keepPreviousData,
  });

export const useBankReconciliation = (filters: { accountId?: string; asOn: string; from?: string }) =>
  useQuery({
    queryKey: ['books', 'statements', 'bank', clean(filters)],
    queryFn: async () => (await api.get<BankReconciliationDto>('/statements/bank', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled: !!filters.accountId,
  });

export const useBooksYear = () =>
  useQuery({
    queryKey: ['books', 'statements', 'year'],
    queryFn: async () => (await api.get<BooksYearDto>('/statements/year')).data,
  });

/** A file the API makes (bank file, PF ECR, ESI sheet): its name, type, text and who was left out for missing details. */
export interface PayrollFileDto {
  fileName: string;
  mimeType: string;
  content: string;
  missing: string[];
}

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
  paymentRequestId?: string;
  purchaseOrderId?: string;
  workOrderId?: string;
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

export interface PaymentRequestFilters extends PageParams {
  projectId?: string;
  vendorId?: string;
  kind?: PaymentRequestKind;
  status?: SubmissionStatus;
  toPay?: boolean;
  mine?: boolean;
  vendorBillId?: string;
  subcontractBillId?: string;
  purchaseOrderId?: string;
  workOrderId?: string;
  /** Fund requests (v6 item 107) into this imprest */
  imprestId?: string;
}

/** Payment requests (v5 item 90): asking for a bill to be paid or an advance released, approved before accounts pays. */
export const usePaymentRequests = (filters: PaymentRequestFilters, enabled = true) =>
  useQuery({
    queryKey: ['payment-requests', clean(filters)],
    queryFn: async () => (await api.get<Paginated<PaymentRequestDto>>('/payment-requests', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });

export const usePaymentRequest = (id: string | undefined) => useQuery({ ...recordQuery<PaymentRequestDto>('/payment-requests', id), enabled: !!id });

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
  /** Any of several kinds, comma-separated */
  kinds?: string;
  msme?: MsmeCategory;
  includeInactive?: boolean;
}

export const useVendorsPage = (filters: VendorFilters, enabled = true) =>
  useQuery({
    queryKey: ['vendors', 'page', clean(filters)],
    queryFn: async () => (await api.get<Paginated<VendorDto>>('/vendors', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
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

/* ---------- Requests to order and Finalise L1 ---------- */

export interface RequestsToOrderFilters extends PageParams {
  projectId?: string;
  stage?: OrderStage;
}

/** Under the quotations key, so a quotation, enquiry or order saved anywhere refreshes the list. */
export const useRequestsToOrder = (filters: RequestsToOrderFilters, enabled = true) =>
  useQuery({
    queryKey: ['quotations', 'to-order', clean(filters)],
    queryFn: async () => (await api.get<RequestsToOrderPage>('/purchase-orders/requests-to-order', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });

export const useRequestToOrder = (id: string | undefined) =>
  useQuery({
    queryKey: ['quotations', 'to-order', 'one', id],
    queryFn: async () => (await api.get<RequestToOrderDto>(`/material-requests/${id}/to-order`)).data,
    enabled: !!id,
  });

/** Finalise the supplier on a request (one quotation, or the lowest per item split), or reopen it. */
export function useFinaliseL1(id: string) {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ['quotations'] });
  return {
    finalise: useMutation({
      mutationFn: async (body: { quotationId?: string; split?: boolean; reason?: string | null }) => (await api.post<RequestToOrderDto>(`/material-requests/${id}/finalise`, body)).data,
      onSuccess: done,
    }),
    reopen: useMutation({
      mutationFn: async () => (await api.post<RequestToOrderDto>(`/material-requests/${id}/reopen-supplier`)).data,
      onSuccess: done,
      meta: FAIL_NOTICE,
    }),
  };
}

/* ---------- small purchase items (v5 item 95) ---------- */

/** Stock of a request's lines at its own site and the other sites (stock first). */
export const useRequestStock = (materialRequestId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: ['material-requests', 'stock', materialRequestId],
    queryFn: async () => (await api.get<MaterialRequestStockDto>(`/material-requests/${materialRequestId}/stock`)).data,
    enabled: enabled && !!materialRequestId,
  });

export interface CoverRequestInput {
  id?: string;
  fromProjectId: string;
  date: string;
  vehicleNo?: string | null;
  remarks?: string | null;
  lines: { materialRequestItemId: string; quantity: string }[];
}

/** Meet request lines from stock: an issue at its own site or a transfer from another. */
export function useCoverRequest(materialRequestId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CoverRequestInput) => (await api.post<StockEntryDto>(`/material-requests/${materialRequestId}/cover`, body)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['material-requests'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['quotations'] });
    },
  });
}

/** The last approved orders of items (`name|unit` each), keyed by `lastRateKey`. */
/** What other sites paid for the items in the 30 days before the order (item 121), for the PO form's rate check. */
export const useRateCheck = (items: { itemName: string; unit: string }[], projectId: string | undefined, poDate: string | undefined, enabled = true, excludePoId?: string) => {
  const keys = [...new Set(items.filter((i) => i.itemName?.trim() && i.unit?.trim()).map((i) => `${i.itemName.trim()}|${i.unit.trim()}`))].sort();
  return useQuery({
    queryKey: ['purchase-orders', 'rate-check', keys, projectId ?? null, poDate ?? null, excludePoId ?? null],
    queryFn: async () => {
      const q = new URLSearchParams(keys.map((k) => ['item', k]));
      if (projectId) q.set('projectId', projectId);
      if (poDate) q.set('poDate', poDate);
      if (excludePoId) q.set('excludePoId', excludePoId);
      return (await api.get<RateBenchmarksDto>(`/purchase-orders/rate-check?${q}`)).data;
    },
    enabled: enabled && keys.length > 0 && !!projectId,
    staleTime: 60_000,
  });
};

export const useLastRates = (items: { itemName: string; unit: string }[], enabled = true, excludePoId?: string) => {
  const keys = [...new Set(items.filter((i) => i.itemName?.trim() && i.unit?.trim()).map((i) => `${i.itemName.trim()}|${i.unit.trim()}`))].sort();
  return useQuery({
    queryKey: ['purchase-orders', 'last-rates', keys, excludePoId ?? null],
    queryFn: async () => {
      const q = new URLSearchParams(keys.map((k) => ['item', k]));
      if (excludePoId) q.set('excludePoId', excludePoId);
      return (await api.get<LastRatesDto>(`/purchase-orders/last-rates?${q}`)).data;
    },
    enabled: enabled && keys.length > 0,
    staleTime: 60_000,
  });
};

export const useEnquiries = (materialRequestId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: ['quotations', 'enquiries', materialRequestId],
    queryFn: async () => (await api.get<EnquiryDto[]>(`/material-requests/${materialRequestId}/enquiries`)).data,
    enabled: enabled && !!materialRequestId,
  });

export function useSendEnquiry(materialRequestId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { vendorIds: string[]; closesOn: string; message?: string | null }) => (await api.post<EnquiryDto>(`/material-requests/${materialRequestId}/enquiries`, body)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotations', 'enquiries', materialRequestId] });
    },
  });
}

export interface VendorBillFilters extends PageParams {
  projectId?: string;
  vendorId?: string;
  purchaseOrderId?: string;
  equipmentId?: string;
  kind?: VendorBillKind;
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

/** A hired machine's approved logs of a month on a project, not yet billed: what its hire bill starts from (v5 item 91). */
export const useHirePreview = (q: { equipmentId?: string; projectId?: string; month?: string; billId?: string }) =>
  useQuery({
    queryKey: ['vendor-bills', 'hire-preview', clean(q)],
    queryFn: async () => (await api.get<HireBillPreviewDto>('/vendor-bills/hire-preview', { params: clean(q) })).data,
    enabled: !!q.equipmentId && !!q.projectId && !!q.month,
    retry: false,
  });

/** Closed job cards on a project a workshop can bill (v5 item 91). */
export const useBillableJobs = (q: { projectId?: string; billId?: string }) =>
  useQuery({
    queryKey: ['vendor-bills', 'billable-jobs', clean(q)],
    queryFn: async () => (await api.get<BillableJobDto[]>('/vendor-bills/billable-jobs', { params: clean(q) })).data,
    enabled: !!q.projectId,
  });

export interface DebitNoteFilters extends PageParams {
  projectId?: string;
  vendorId?: string;
  vendorBillId?: string;
  subcontractBillId?: string;
  stockEntryId?: string;
  reason?: DebitNoteReason;
  includeCancelled?: boolean;
}

/** Debit notes (v5 item 91): what a vendor or subcontractor owes back, taken off their bill. */
export const useDebitNotes = (filters: DebitNoteFilters, enabled = true) =>
  useQuery({
    queryKey: ['debit-notes', clean(filters)],
    queryFn: async () => (await api.get<Paginated<DebitNoteDto>>('/debit-notes', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });

export const useDebitNote = (id: string | undefined) => useQuery({ ...recordQuery<DebitNoteDto>('/debit-notes', id), enabled: !!id });

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

/** A lump-sum project's billing break-up (item 129): components, stages with today's evidence, the milestone grid and tiers. */
export const useBillingBreakup = (projectId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: ['contract', projectId, 'billing-breakup'],
    queryFn: async () => (await api.get<BillingBreakupDto>(`/projects/${projectId}/billing-breakup`)).data,
    enabled: !!projectId && enabled,
  });

/** An EPC project's engineering deliverables, equipment packages and client inputs (item 130). */
export const useEpc = (projectId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: ['epc', projectId],
    queryFn: async () => (await api.get<EpcDto>(`/projects/${projectId}/epc`)).data,
    enabled: !!projectId && enabled,
  });

/** A handed-over project's O&M contract, its periods and bills, and a month of service levels (item 131). */
export const useOm = (projectId: string | undefined, month?: string, enabled = true) =>
  useQuery({
    queryKey: ['om', projectId, month ?? null],
    queryFn: async () => (await api.get<OmDto>(`/projects/${projectId}/om`, { params: month ? { month } : {} })).data,
    enabled: !!projectId && enabled,
    placeholderData: keepPreviousData,
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

/** A project's earned value (v6 item 115), earned from approved progress or measured work. */
export const useEarnedValue = (projectId: string | undefined, basis: EvBasis) =>
  useQuery({
    queryKey: ['cost', 'earned-value', projectId, basis],
    queryFn: async () => (await api.get<EarnedValueDto>(`/cost/projects/${projectId}/earned-value`, { params: { basis } })).data,
    enabled: !!projectId,
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

/** What adopting the standard norms library would set on a project (finding 16 of the October review). */
export const useStandardNorms = (projectId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: ['standard-norms', projectId],
    queryFn: async () => (await api.get<StandardNormPlanDto>(`/reconciliation/projects/${projectId}/standard-norms`)).data,
    enabled: enabled && !!projectId,
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

/** Each BOQ item's rate analysis priced into a built-up rate (v5 item 92). */
export const useProjectEstimate = (projectId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: ['reconciliation', projectId, 'estimate'],
    queryFn: async () => (await api.get<ProjectEstimateDto>(`/reconciliation/projects/${projectId}/estimate`)).data,
    enabled: !!projectId && enabled,
  });

export const useSubconReconciliation = (projectId: string | undefined) =>
  useQuery({
    queryKey: ['reconciliation', projectId, 'subcontractors'],
    queryFn: async () => (await api.get<ProjectSubconReconciliationDto>(`/reconciliation/projects/${projectId}/subcontractors`)).data,
    enabled: !!projectId,
  });

/** Stock against the DPR (item 128): per component, per pipe size, per kit, and the exceptions. */
export const useStructureRecon = (projectId: string | undefined, period: CostPeriod) =>
  useQuery({
    queryKey: ['reconciliation', projectId, 'structure', clean(period)],
    queryFn: async () => (await api.get<ProjectStructureReconDto>(`/reconciliation/projects/${projectId}/structure`, { params: clean(period) })).data,
    placeholderData: keepPreviousData,
    enabled: !!projectId,
  });

export const usePipeRecon = (projectId: string | undefined) =>
  useQuery({
    queryKey: ['reconciliation', projectId, 'pipe'],
    queryFn: async () => (await api.get<ProjectPipeReconDto>(`/reconciliation/projects/${projectId}/pipe`)).data,
    enabled: !!projectId,
  });

export const useKitRecon = (projectId: string | undefined) =>
  useQuery({
    queryKey: ['reconciliation', projectId, 'kits'],
    queryFn: async () => (await api.get<ProjectKitReconDto>(`/reconciliation/projects/${projectId}/kits`)).data,
    enabled: !!projectId,
  });

export const useReconExceptions = (projectId: string | undefined, period: CostPeriod) =>
  useQuery({
    queryKey: ['reconciliation', projectId, 'exceptions', clean(period)],
    queryFn: async () => (await api.get<ProjectReconExceptionsDto>(`/reconciliation/projects/${projectId}/exceptions`, { params: clean(period) })).data,
    placeholderData: keepPreviousData,
    enabled: !!projectId,
  });

export interface SaveActivityNormInput {
  projectId: string;
  activityId: string;
  itemId: string;
  qtyPerUnit: string;
  wastagePct: string;
  note: string | null;
}

export function useSaveActivityNorm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, ...body }: SaveActivityNormInput) => (await api.put<ActivityNormDto>(`/reconciliation/projects/${projectId}/activity-norms`, body)).data,
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['reconciliation', v.projectId] });
      qc.invalidateQueries({ queryKey: ['activities', v.projectId, 'dpr-options'] });
    },
  });
}

export function useRemoveActivityNorm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, normId }: { projectId: string; normId: string }) => (await api.delete<{ ok: true }>(`/reconciliation/projects/${projectId}/activity-norms/${normId}`)).data,
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['reconciliation', v.projectId] }),
  });
}

export const useWastageReport = (projectId: string | undefined, period: CostPeriod) =>
  useQuery({
    queryKey: ['reconciliation', projectId, 'wastage', clean(period)],
    queryFn: async () => (await api.get<WastageReportDto>(`/reconciliation/projects/${projectId}/wastage`, { params: clean(period) })).data,
    placeholderData: keepPreviousData,
    enabled: !!projectId,
  });

export interface SaveBoqResourceInput {
  projectId: string;
  id?: string;
  boqItemId: string;
  kind: BoqResourceKind;
  name: string;
  qtyPerUnit: string;
  note: string | null;
}

/** Add or change a labour or machine line of a BOQ item's rate analysis. */
export function useSaveBoqResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, ...body }: SaveBoqResourceInput) => (await api.put<BoqResourceDto>(`/reconciliation/projects/${projectId}/resources`, body)).data,
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['reconciliation', v.projectId] }),
    meta: FAIL_NOTICE,
  });
}

export function useRemoveBoqResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, id }: { projectId: string; id: string }) => (await api.delete<{ ok: true }>(`/reconciliation/projects/${projectId}/resources/${id}`)).data,
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['reconciliation', v.projectId] }),
    meta: FAIL_NOTICE,
  });
}

/** Fill a BOQ item from another BOQ item or the starter library. */
export function useCopyRateAnalysis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, ...body }: { projectId: string; boqItemId: string; fromBoqItemId?: string; libraryKey?: string; replace?: boolean }) =>
      (await api.post<RateAnalysisResultDto>(`/reconciliation/projects/${projectId}/rate-analysis/copy`, body)).data,
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['reconciliation', v.projectId] }),
    meta: FAIL_NOTICE,
  });
}

export interface RateImportRow {
  row: number;
  boqItemNo: string;
  kind: 'MATERIAL' | BoqResourceKind;
  name: string;
  unit?: string;
  qtyPerUnit: string;
  wastagePct?: string;
  note?: string;
}

export function useImportRateAnalysis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, rows }: { projectId: string; rows: RateImportRow[] }) => (await api.post<RateAnalysisResultDto>(`/reconciliation/projects/${projectId}/rate-analysis/import`, { rows })).data,
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['reconciliation', v.projectId] }),
  });
}

export function useSetEstimateTerms() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, ...body }: { projectId: string; overheadPct: string; profitPct: string }) =>
      (await api.put<{ overheadPct: string; profitPct: string }>(`/reconciliation/projects/${projectId}/estimate-terms`, body)).data,
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['reconciliation', v.projectId] }),
    meta: FAIL_NOTICE,
  });
}

/** Raise material a subcontractor used over the allowance for recovery on their next bill. */
export function useRecoverExcess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, workOrderId, ...body }: { projectId: string; workOrderId: string; itemId: string; quantity: string; rate: string; note?: string }) =>
      (await api.post<{ recovery: ExcessRecoveryDto; billLabel: string | null }>(`/reconciliation/projects/${projectId}/work-orders/${workOrderId}/recoveries`, body)).data,
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['reconciliation', v.projectId] });
      qc.invalidateQueries({ queryKey: ['subcontract-bills'] });
    },
    meta: FAIL_NOTICE,
  });
}

export function useCancelRecovery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, id }: { projectId: string; id: string }) => (await api.delete<{ ok: true }>(`/reconciliation/projects/${projectId}/recoveries/${id}`)).data,
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['reconciliation', v.projectId] });
      qc.invalidateQueries({ queryKey: ['subcontract-bills'] });
    },
    meta: FAIL_NOTICE,
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
    mutationFn: async (body: { phone?: string | null; whatsapp?: boolean; sms?: boolean; email?: boolean }) => (await api.put<MessagingPrefsDto>('/messaging/me', body)).data,
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

/** Where an entry stands in its approval levels and whether the user may decide it now (v5 item 94). */
export const useApprovalStage = (type: ApprovalTypeParam, id: string | undefined, enabled = true) =>
  useQuery({
    queryKey: ['approvals', 'stage', type, id],
    queryFn: async () => (await api.get<ApprovalStageDto>(`/approvals/${type}/${id}/stage`)).data,
    enabled: enabled && !!id,
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
      (await api.post<ReviewResultDto>(`/approvals/${vars.type}/${vars.id}/review`, { decision: vars.decision, note: vars.note || undefined })).data,
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
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    const mimeType = CAD_MIME_TYPES[ext] ?? (file.type || (ext === '.pdf' ? 'application/pdf' : 'application/octet-stream'));
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

/** Set a company's plan, which decides its modules (v6 item 117). */
export function useSetModuleTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, tier }: { id: string; tier: ModuleTier | null }) => (await api.post<PlatformCompanyDetailDto>(`/platform/companies/${id}/plan`, { tier })).data,
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

/** Today's toolbox talk for a project, in Hindi and English (intelligence quick win Q8); nothing is saved. */
export const useTodaysTalk = (projectId?: string | null) =>
  useQuery({ queryKey: ['safety', 'talk-today', projectId], queryFn: async () => (await api.get<ToolboxTalkDraftDto>('/safety/talks/today', { params: { projectId } })).data, enabled: !!projectId });
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
export const useImprests = (filters?: { projectId?: string; active?: boolean; mine?: boolean }, enabled = true) =>
  useQuery({
    queryKey: ['imprests', 'list', clean(filters)],
    queryFn: async () => (await api.get<ImprestDto[]>('/imprests', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
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
/** One master list as the company has it (item 135), by its address (`trade`, `item-category`…); `usage` counts records. */
export const useMasterList = (slug: string, usage = false, enabled = true) =>
  useQuery({
    queryKey: ['masters', slug, usage],
    queryFn: async () => (await api.get<MasterListDto>(`/masters/${slug}`, { params: usage ? { usage: 1 } : {} })).data,
    staleTime: usage ? 0 : 5 * 60_000,
    enabled,
  });

/** Each simple list's counts, for Administration › Masters. */
export const useMasterCounts = (enabled = true) =>
  useQuery({ queryKey: ['masters', 'counts'], queryFn: async () => (await api.get<MasterCountsDto>('/masters')).data, enabled });

export function useSaveMasterEntry(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { code?: string; name?: string; nameHi?: string | null; isActive?: boolean }) => {
      const { code, ...body } = v;
      return (code ? await api.patch<MasterEntryDto>(`/masters/${slug}/${encodeURIComponent(code)}`, body) : await api.post<MasterEntryDto>(`/masters/${slug}`, body)).data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['masters'] }),
  });
}

export function useDeleteMasterEntry(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => (await api.delete(`/masters/${slug}/${encodeURIComponent(code)}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['masters'] }),
  });
}

export const useUnits = () =>
  useQuery({
    queryKey: ['units'],
    queryFn: async () => (await api.get<UnitDto[]>('/units')).data,
    staleTime: 5 * 60_000,
  });

export const useProcurementStatus = (filters: { projectId?: string; vendorId?: string; show?: 'PENDING' | 'LATE' | 'ALL'; from?: string; to?: string }, enabled = true) =>
  useQuery({
    queryKey: ['purchase-orders', 'status', clean(filters)],
    queryFn: async () => (await api.get<ProcurementStatusDto>('/purchase-orders/status', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
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

/** Leakage checks (item 121) for a month, YYYY-MM. */
export const useLeakage = (month: string, enabled = true) =>
  useQuery({ queryKey: ['leakage', month], queryFn: async () => (await api.get<LeakageDto>(`/leakage?month=${month}`)).data, enabled });

/** The 13-week cash forecast (item 122): accounts and management. */
export const useCashForecast = (enabled = true) =>
  useQuery({ queryKey: ['cash-forecast'], queryFn: async () => (await api.get<CashForecastDto>('/cash-forecast')).data, enabled });

/** Billing readiness (item 122): measured work not billed, bills not sent, bills unpaid; one project or all. */
export const useBillingReadiness = (projectId: string | undefined, enabled = true) =>
  useQuery({ queryKey: ['billing-readiness', projectId ?? 'all'], queryFn: async () => (await api.get<BillingReadinessDto>('/billing-readiness', { params: { projectId } })).data, enabled });

/** A payment reminder for a sent bill, drafted from its figures and the contract's payment clause; nothing is saved. */
export const usePaymentReminder = () => useMutation({ mutationFn: async (billId: string) => (await api.get<AiDraftDto>(`/billing-readiness/reminder/${billId}`)).data });

/** Attendance cross-check (AI item 124): the month's flags and man-day bills, and with a project its days. */
export const useAttendanceCheck = (month: string, projectId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: ['attendance-check', month, projectId ?? 'all'],
    queryFn: async () => (await api.get<AttendanceCheckDto>('/attendance-check', { params: { month, projectId } })).data,
    enabled,
  });

// ---- Hindrance register to notice (AI item 123) ----

/** DPR remarks read as hindrances, for the project manager to record or dismiss; one project or all. */
export const useHindranceSuggestions = (projectId: string | undefined, enabled = true) =>
  useQuery({ queryKey: ['risks', 'hindrances', projectId ?? 'all'], queryFn: async () => (await api.get<HindranceSuggestionDto[]>('/hindrances/suggestions', { params: clean({ projectId }) })).data, enabled });

/** The hindrance a DPR's remark reads as, or null. */
export const useDprHindrance = (dprId: string | undefined, enabled = true) =>
  useQuery({ queryKey: ['risks', 'hindrances', 'dpr', dprId], queryFn: async () => (await api.get<HindranceSuggestionDto | null>(`/hindrances/dpr/${dprId}`)).data, enabled: enabled && !!dprId });

/** Record a DPR hindrance as a new delay, or into an open one (`riskId`); dismiss one with `dismiss`. */
export function useDecideHindrance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; dismiss?: boolean; riskId?: string; category?: RiskCategory; party?: DelayParty | null }) =>
      v.dismiss ? (await api.post<{ ok: true }>(`/hindrances/${v.id}/dismiss`)).data : (await api.post<RiskDto>(`/hindrances/${v.id}/record`, clean({ riskId: v.riskId, category: v.category, party: v.party }))).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['risks'] });
      void qc.invalidateQueries({ queryKey: ['watch-list'] });
    },
    meta: FAIL_NOTICE,
  });
}

/** A delay's notice clock: due date, days left and the letter that stopped it. */
export const useNoticeClock = (riskId: string | undefined, enabled = true) =>
  useQuery({ queryKey: ['risks', 'notice', riskId], queryFn: async () => (await api.get<NoticeClockDto>(`/hindrances/notice/${riskId}`)).data, enabled: enabled && !!riskId });

/** The notice letter for a delay, drafted from its facts and the contract; nothing is saved. */
export const useNoticeDraft = () => useMutation({ mutationFn: async (riskId: string) => (await api.get<AiDraftDto>(`/hindrances/notice/${riskId}/draft`)).data });

/** A project's hindrance notice period, with the clause found in its filed contract. */
export const useNoticePeriod = (projectId: string | undefined, enabled = true) =>
  useQuery({ queryKey: ['contract', 'notice-period', projectId], queryFn: async () => (await api.get<NoticePeriodDto>(`/hindrances/notice-period/${projectId}`)).data, enabled: enabled && !!projectId });

/** The delay register for an extension-of-time claim, fetched when printed. */
export const useDelayRegister = () => useMutation({ mutationFn: async (projectId: string) => (await api.get<DelayRegisterDto>(`/hindrances/register/${projectId}`)).data });

export const useWatchList = (enabled = true) =>
  useQuery({ queryKey: ['watch-list'], queryFn: async () => (await api.get<WatchListDto>('/warnings')).data, enabled });

/** The headline of each check with a page of its own, for the watch list's Other checks (intelligence quick win Q0). */
export const useInsights = (enabled = true) =>
  useQuery({ queryKey: ['insights'], queryFn: async () => (await api.get<InsightsDto>('/insights')).data, enabled, staleTime: 5 * 60_000 });

/** Dismiss a warning saying what became of it (item 119), or bring a dismissed one back (`restore`). */
export function useDismissWarning() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { key: string; outcome?: WarningOutcome; reason?: string; restore?: boolean }) =>
      (await api.post<WatchListDto>(`/warnings/${v.restore ? 'restore' : 'dismiss'}`, v.restore ? { key: v.key } : { key: v.key, outcome: v.outcome, reason: v.reason || undefined })).data,
    onSuccess: (d) => {
      qc.setQueryData(['watch-list'], d);
      void qc.invalidateQueries({ queryKey: ['dashboard', 'my-work'] });
    },
  });
}

/** Resume a paused kind of warning (admins and management, item 119). */
export function useResumeWarningKind() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (kind: WarningKind) => (await api.post<WatchListDto>('/warnings/resume', { kind })).data,
    onSuccess: (d) => {
      qc.setQueryData(['watch-list'], d);
      void qc.invalidateQueries({ queryKey: ['dashboard', 'my-work'] });
    },
  });
}

// ---- WhatsApp entries (AI item 120) ----

export const useCaptureSetup = (enabled = true) => useQuery({ queryKey: ['whatsapp', 'setup'], queryFn: async () => (await api.get<CaptureSetupDto>('/whatsapp/setup')).data, enabled });

export function useUpdateCaptureSetup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean) => (await api.put<CaptureSetupDto>('/whatsapp/setup', { enabled })).data,
    onSuccess: (d) => qc.setQueryData(['whatsapp', 'setup'], d),
  });
}

export const useCaptureMessages = (q: { scope: 'mine' | 'company'; state?: InboundState; id?: string; page: number; pageSize: number }, enabled = true) =>
  useQuery({
    queryKey: ['whatsapp', 'messages', q],
    queryFn: async () => (await api.get<CaptureListDto>('/whatsapp/messages', { params: { ...q, state: q.state || undefined, id: q.id || undefined } })).data,
    enabled,
    placeholderData: keepPreviousData,
  });

/** Save a WhatsApp draft as it is, or discard it. */
export function useDecideCapture() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; action: 'save' | 'discard' }) => (await api.post<InboundMessageDto>(`/whatsapp/messages/${v.id}/${v.action}`)).data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['whatsapp', 'messages'] }),
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

// ----- RMC (v6 item 104) -----

export const useRmcPlants = (enabled = true) => useQuery({ queryKey: ['rmc', 'plants'], queryFn: async () => (await api.get<RmcPlantDto[]>('/rmc/plants')).data, enabled, staleTime: 5 * 60_000 });

export const useRmcDay = (filters: { date?: string; plantId?: string }) =>
  useQuery({ queryKey: ['rmc', 'day', clean(filters)], queryFn: async () => (await api.get<RmcDayDto>('/rmc/day', { params: clean(filters) })).data, placeholderData: keepPreviousData });

export const useMixDesigns = (filters: { plantId?: string }, enabled = true) =>
  useQuery({ queryKey: ['rmc', 'designs', clean(filters)], queryFn: async () => (await api.get<MixDesignDto[]>('/rmc/mix-designs', { params: clean(filters) })).data, enabled });

export const useRmcOrders = (filters: PageParams & { plantId?: string; status?: RmcOrderStatus; clientId?: string }, enabled = true) =>
  useQuery({
    queryKey: ['rmc', 'orders', clean(filters)],
    queryFn: async () => (await api.get<Paginated<RmcOrderDto>>('/rmc/orders', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });

export const useRmcBatches = (filters: PageParams & { plantId?: string; orderId?: string; status?: RmcBatchStatus; from?: string; to?: string }, enabled = true) =>
  useQuery({
    queryKey: ['rmc', 'batches', clean(filters)],
    queryFn: async () => (await api.get<Paginated<RmcBatchDto>>('/rmc/batches', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });

export const useRmcInvoices = (filters: PageParams & { plantId?: string; clientId?: string; due?: boolean }) =>
  useQuery({
    queryKey: ['rmc', 'invoices', clean(filters)],
    queryFn: async () => (await api.get<Paginated<RmcInvoiceDto>>('/rmc/invoices', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
  });

export const useRmcReceipts = (filters: PageParams & { clientId?: string }, enabled = true) =>
  useQuery({
    queryKey: ['rmc', 'receipts', clean(filters)],
    queryFn: async () => (await api.get<Paginated<RmcReceiptDto>>('/rmc/receipts', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });

/** Any write in RMC: RMC is fetched again, and what it touches (the plant's stock, cube tests, the books, the module home). */
export function useRmcAction<T = unknown>() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ method = 'post', path, body }: { method?: 'post' | 'patch'; path: string; body?: unknown }) => (await api[method]<T>(path, body ?? {})).data,
    onSuccess: () => {
      for (const key of [['rmc'], ['stock'], ['quality'], ['books'], ['dashboard', 'module', 'rmc']]) void qc.invalidateQueries({ queryKey: key });
    },
  });
}

export const useRmcOrder = (id: string | null) => useQuery({ queryKey: ['rmc', 'order', id], queryFn: async () => (await api.get<RmcOrderDto>(`/rmc/orders/${id}`)).data, enabled: !!id });
export const useRmcBatch = (id: string | null) => useQuery({ queryKey: ['rmc', 'batch', id], queryFn: async () => (await api.get<RmcBatchDto>(`/rmc/batches/${id}`)).data, enabled: !!id });

/* ---------- the supplier portal (v6 item 105) ---------- */

export const useSupplierHome = () => useQuery({ queryKey: ['supplier', 'home'], queryFn: async () => (await api.get<SupplierHomeDto>('/supplier/home')).data });
export const useSupplierEnquiries = () => useQuery({ queryKey: ['supplier', 'enquiries'], queryFn: async () => (await api.get<SupplierEnquiryDto[]>('/supplier/enquiries')).data });
export const useSupplierOrders = () => useQuery({ queryKey: ['supplier', 'orders'], queryFn: async () => (await api.get<SupplierOrderDto[]>('/supplier/orders')).data });
export const useSupplierDispatches = () => useQuery({ queryKey: ['supplier', 'dispatches'], queryFn: async () => (await api.get<SupplierDispatchDto[]>('/supplier/dispatches')).data });
export const useSupplierInvoices = () => useQuery({ queryKey: ['supplier', 'invoices'], queryFn: async () => (await api.get<SupplierInvoiceDto[]>('/supplier/invoices')).data });
export const useSupplierStatement = (from?: string) =>
  useQuery({ queryKey: ['supplier', 'statement', from ?? null], queryFn: async () => (await api.get<SupplierStatementDto>('/supplier/statement', { params: clean({ from }) })).data, placeholderData: keepPreviousData });
export const useSupplierProfile = () => useQuery({ queryKey: ['supplier', 'profile'], queryFn: async () => (await api.get<SupplierProfileDto>('/supplier/profile')).data });

/** Every write on the supplier portal, and the company's side of it: refreshes both, and the notifications. */
export function useSupplierAction<T = unknown>() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ method = 'post', path, body }: { method?: 'post' | 'patch'; path: string; body?: unknown }) => (await api[method]<T>(path, body ?? {})).data,
    onSuccess: () => {
      for (const key of [['supplier'], ['supplier-portal'], ['vendors'], ['purchase-orders'], ['stock']]) void qc.invalidateQueries({ queryKey: key });
    },
  });
}

export const useVendorPortal = (vendorId: string | null) =>
  useQuery({ queryKey: ['supplier-portal', 'vendor', vendorId], queryFn: async () => (await api.get<VendorPortalDto>(`/supplier-portal/vendors/${vendorId}`)).data, enabled: !!vendorId });
export const useSupplierInbox = (filters: { stage?: SupplierInvoiceStage; vendorId?: string; all?: boolean }, enabled = true) =>
  useQuery({
    queryKey: ['supplier-portal', 'invoices', clean(filters)],
    queryFn: async () => (await api.get<SupplierInvoiceDto[]>('/supplier-portal/invoices', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });
export const useSupplierInboxInvoice = (id: string | null) =>
  useQuery({ queryKey: ['supplier-portal', 'invoice', id], queryFn: async () => (await api.get<SupplierInvoiceDto>(`/supplier-portal/invoices/${id}`)).data, enabled: !!id });
export const useSupplierChanges = (enabled = true) =>
  useQuery({ queryKey: ['supplier-portal', 'changes'], queryFn: async () => (await api.get<SupplierChangeDto[]>('/supplier-portal/changes')).data, enabled });

/* ---------- Comments and mentions (v6 item 116) ---------- */

export const useComments = (kind: CommentKind, entityId?: string) =>
  useQuery({ queryKey: ['comments', kind, entityId], queryFn: async () => (await api.get<CommentThreadsDto>('/comments', { params: { kind, entityId } })).data, enabled: !!entityId });
/** Staff who see the record's project, for the @ list; fetched once someone starts writing. */
export const useMentionable = (kind: CommentKind, entityId: string | undefined, enabled: boolean) =>
  useQuery({ queryKey: ['comments', 'people', kind, entityId], queryFn: async () => (await api.get<MentionableDto[]>('/comments/people', { params: { kind, entityId } })).data, enabled: enabled && !!entityId, staleTime: 5 * 60_000 });
/** Any change to a record's comments; every route answers with the threads as they now stand. */
export function useCommentAction(kind: CommentKind, entityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ method = 'post', path, body }: { method?: 'post' | 'patch' | 'delete'; path: string; body?: unknown }) =>
      (method === 'delete' ? await api.delete<CommentThreadsDto>(path) : await api[method]<CommentThreadsDto>(path, body ?? {})).data,
    onSuccess: (data) => qc.setQueryData(['comments', kind, entityId], data),
  });
}

/** The company's optional modules (v6 item 117), for an admin. */
export const useModuleSwitches = (enabled: boolean) =>
  useQuery({ queryKey: ['module-switches'], queryFn: async () => (await api.get<ModuleSwitchesDto>('/module-switches')).data, enabled });

/** Turn a module on or off; the caller refreshes the signed-in user so the sidebar follows. */
export function useSetModuleSwitch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: { key: SwitchableModule; on: boolean }) => (await api.put<ModuleSwitchesDto>(`/module-switches/${d.key}`, { on: d.on })).data,
    onSuccess: (data) => {
      qc.setQueryData(['module-switches'], data);
      // Every list, count and search may now leave a module out, or bring one back.
      void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'module-switches' });
    },
  });
}
/** Menu and names: the company's menu, its look and its module names (admins). */
export const useNavSettings = (enabled: boolean) =>
  useQuery({ queryKey: ['nav-settings'], queryFn: async () => (await api.get<NavSettingsDto>('/nav-settings')).data, enabled });

/** Save the company's menu; the caller refreshes the signed-in user so the shell follows. */
export function useSaveNavSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: NavSettingsDto) => (await api.put<NavSettingsDto>('/nav-settings', d)).data,
    onSuccess: (data) => qc.setQueryData(['nav-settings'], data),
  });
}

/** A person's own look for the top bar (null follows the company's); the caller refreshes the signed-in user. */
export const useSaveOwnLook = () => useMutation({ mutationFn: async (look: NavLook | null) => (await api.put<{ look: NavLook | null }>('/nav-settings/own-look', { look })).data });

/* Group companies (phase 1): the group's companies and its people, for the group's admins. Every change answers with the
   whole group; the caller refreshes the signed-in user when their own companies change (the switcher reads them). */
const GROUP_KEY = ['group'] as const;
export const useGroup = (enabled: boolean) => useQuery({ queryKey: GROUP_KEY, queryFn: async () => (await api.get<GroupStateDto>('/group')).data, enabled });

function useGroupChange<V>(send: (v: V) => Promise<GroupStateDto>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: send, onSuccess: (data) => qc.setQueryData(GROUP_KEY, data), meta: FAIL_NOTICE });
}
export const useMakeGroup = () => useGroupChange(async (name: string) => (await api.post<GroupStateDto>('/group', { name })).data);
export const useAddGroupCompany = () => useGroupChange(async (v: GroupCompanyInput) => (await api.post<GroupStateDto>('/group/companies', v)).data);
export const useUpdateGroupCompany = () =>
  useGroupChange(async ({ id, ...v }: Partial<GroupCompanyInput> & { id: string }) => (await api.patch<GroupStateDto>(`/group/companies/${id}`, v)).data);
export const useGivePlace = () =>
  useGroupChange(async (v: { loginId: string; organizationId: string; roleKey: RoleKey }) => (await api.post<GroupStateDto>('/group/places', v)).data);
export const useSetGroupAdmin = () =>
  useGroupChange(async ({ loginId, admin }: { loginId: string; admin: boolean }) => (await api.put<GroupStateDto>(`/group/admins/${loginId}`, { admin })).data);

/* Launcher Home (phase 2): pins and Recent from the server, badges by tile. Pin, move and unpin change the screen at once
   and roll back if the server refuses. */
const LAUNCHER_KEY = ['launcher'] as const;

export const useLauncher = (enabled = true) =>
  useQuery({ queryKey: LAUNCHER_KEY, queryFn: async () => (await api.get<LauncherDto>('/launcher')).data, enabled, staleTime: 30_000 });

export const useLauncherBadges = (enabled = true) =>
  useQuery({ queryKey: ['launcher', 'badges'], queryFn: async () => (await api.get<LauncherBadgesDto>('/launcher/badges')).data, enabled, staleTime: 60_000 });

function useLauncherChange<V>(apply: (old: LauncherDto, vars: V) => LauncherDto, send: (vars: V) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: send,
    onMutate: async (vars: V) => {
      await qc.cancelQueries({ queryKey: LAUNCHER_KEY, exact: true });
      const old = qc.getQueryData<LauncherDto>(LAUNCHER_KEY);
      if (old) qc.setQueryData<LauncherDto>(LAUNCHER_KEY, apply(old, vars));
      return { old };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.old) qc.setQueryData(LAUNCHER_KEY, ctx.old);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: LAUNCHER_KEY, exact: true }),
  });
}

/** Pin a page, project or saved view; `position` puts it back where it was (Undo). */
export const usePin = () =>
  useLauncherChange<{ kind: NavPinKind; target: string; label: string; position?: string }>(
    (old, v) => (old.pins.some((p) => p.kind === v.kind && p.target === v.target) ? old : { ...old, pins: [...old.pins, { id: `new-${v.kind}-${v.target}`, kind: v.kind, target: v.target, label: v.label, position: v.position ?? '~' }].sort((a, b) => (a.position < b.position ? -1 : 1)) }),
    async (v) => (await api.post<NavPinDto>('/launcher/pins', { kind: v.kind, target: v.target, position: v.position })).data,
  );

export const useUnpin = () =>
  useLauncherChange<NavPinDto>(
    (old, pin) => ({ ...old, pins: old.pins.filter((p) => p.id !== pin.id) }),
    async (pin) => (await api.delete(`/launcher/pins/${pin.id}`)).data,
  );

export const useMovePin = () =>
  useLauncherChange<{ id: string; position: string }>(
    (old, v) => ({ ...old, pins: old.pins.map((p) => (p.id === v.id ? { ...p, position: v.position } : p)).sort((a, b) => (a.position < b.position ? -1 : 1)) }),
    async (v) => (await api.patch<NavPinDto>(`/launcher/pins/${v.id}`, { position: v.position })).data,
  );

/* Launcher phase 3: Discover's requests for access, and Admin › Home tiles (New and Featured marks, the Discover switch,
   answering requests). */
const HOME_TILES_KEY = ['launcher', 'home-tiles'] as const;

export const useHomeTiles = (enabled = true) =>
  useQuery({ queryKey: HOME_TILES_KEY, queryFn: async () => (await api.get<HomeTilesDto>('/launcher/home-tiles')).data, enabled });

export function useRequestAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: { nodeId: string; note?: string }) => (await api.post<MyAccessRequestDto>('/launcher/access-requests', d)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: LAUNCHER_KEY, exact: true }),
  });
}

export function useSetLauncherFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: LauncherFlagDto) => (await api.put<LauncherFlagDto>(`/launcher/flags/${d.nodeId}`, { isNew: d.isNew, newUntil: d.newUntil, featured: d.featured })).data,
    onSuccess: (flag) => {
      qc.setQueryData<HomeTilesDto>(HOME_TILES_KEY, (old) => (old ? { ...old, flags: [...old.flags.filter((f) => f.nodeId !== flag.nodeId), flag] } : old));
      void qc.invalidateQueries({ queryKey: LAUNCHER_KEY, exact: true });
    },
  });
}

export function useSetHomeTilesSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: { discoverLocked: boolean }) => (await api.patch<HomeTilesDto>('/launcher/settings', d)).data,
    onSuccess: (data) => {
      qc.setQueryData(HOME_TILES_KEY, data);
      void qc.invalidateQueries({ queryKey: LAUNCHER_KEY, exact: true });
    },
  });
}

export function useDecideAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: { id: string; status: 'GRANTED' | 'DECLINED'; reply?: string }) => (await api.patch<AccessRequestDto>(`/launcher/access-requests/${d.id}`, { status: d.status, reply: d.reply })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: HOME_TILES_KEY }),
  });
}

/** Management dashboard: every contract project the caller sees, with its money from work done to cash and its health. */
export const useManagementPortfolio = (enabled = true) =>
  useQuery({ queryKey: ['management', 'portfolio'], queryFn: async () => (await api.get<PortfolioDto>('/management/portfolio')).data, enabled });

/** One project's drill-down on the management dashboard. */
export const useManagementProject = (projectId: string | undefined) =>
  useQuery({ queryKey: ['management', 'project', projectId], queryFn: async () => (await api.get<PortfolioProjectDetailDto>(`/management/projects/${projectId}`)).data, enabled: !!projectId });

/** A management report for its period (`month`, or `from` and `to`) and, optionally, one project. */
export const useManagementReport = (key: ManagementReportKey | undefined, params: { month?: string; from?: string; to?: string; projectId?: string }) =>
  useQuery({
    queryKey: ['management', 'report', key, params],
    queryFn: async () => (await api.get<ManagementReportDto>(`/management/reports/${key}`, { params })).data,
    enabled: !!key,
    placeholderData: keepPreviousData,
  });
