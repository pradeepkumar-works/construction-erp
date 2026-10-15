'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
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
  Paginated,
  PendingApprovalDto,
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
  ToolboxTalkDto,
  WorkPermitDto,
  WorkPermitStatus,
  WorkPermitType,
} from '@erp/shared';
import { MAX_PAGE_SIZE } from '@erp/shared';
import { api } from './api';

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

/* ---------- queries ---------- */

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

/** Every visible project (one large page) for dropdowns and pickers. */
export const useProjects = (enabled = true) =>
  useQuery({
    queryKey: ['projects', 'all'],
    queryFn: async () => (await api.get<Paginated<ProjectSummary>>('/projects', { params: { pageSize: MAX_PAGE_SIZE, sortBy: 'code' } })).data.items,
    enabled,
  });

/** One server-side page of the projects list (search, filters, sort). */
export const useProjectsPage = (filters: ProjectFilters) =>
  useQuery({
    queryKey: ['projects', 'page', clean(filters)],
    queryFn: async () => (await api.get<Paginated<ProjectSummary>>('/projects', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
  });

export const useProject = (id: string | undefined) =>
  useQuery({
    queryKey: ['projects', id],
    queryFn: async () => (await api.get<ProjectDetail>(`/projects/${id}`)).data,
    enabled: !!id,
  });

/** Every user of the organisation (one large page) for pickers. */
export const useUsers = () =>
  useQuery({ queryKey: ['users', 'all'], queryFn: async () => (await api.get<Paginated<UserSummary>>('/users', { params: { pageSize: MAX_PAGE_SIZE } })).data.items });

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

export const useProgressEntry = (id: string | undefined) =>
  useQuery({
    queryKey: ['progress', 'detail', id],
    queryFn: async () => (await api.get<ProgressEntryDto>(`/progress/${id}`)).data,
    enabled: !!id,
  });

export const useDprList = (filters?: ListFilters) =>
  useQuery({
    queryKey: ['dpr', clean(filters)],
    queryFn: async () => (await api.get<Paginated<DailyReportDto>>('/dpr', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
  });

export const useDpr = (id: string | undefined) =>
  useQuery({
    queryKey: ['dpr', 'detail', id],
    queryFn: async () => (await api.get<DailyReportDto>(`/dpr/${id}`)).data,
    enabled: !!id,
  });

export const useMaterialRequests = (filters?: ListFilters) =>
  useQuery({
    queryKey: ['material-requests', clean(filters)],
    queryFn: async () => (await api.get<Paginated<MaterialRequestDto>>('/material-requests', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
  });

export const useMaterialRequest = (id: string | undefined) =>
  useQuery({
    queryKey: ['material-requests', 'detail', id],
    queryFn: async () => (await api.get<MaterialRequestDto>(`/material-requests/${id}`)).data,
    enabled: !!id,
  });

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

export const useMachineryLog = (id: string | undefined) =>
  useQuery({
    queryKey: ['machinery', 'logs', 'detail', id],
    queryFn: async () => (await api.get<MachineryLogDto>(`/machinery-logs/${id}`)).data,
    enabled: !!id,
  });

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

export const useExpense = (id: string | undefined) =>
  useQuery({
    queryKey: ['expenses', 'detail', id],
    queryFn: async () => (await api.get<ExpenseDto>(`/expenses/${id}`)).data,
    enabled: !!id,
  });

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

export const useMeasurement = (id: string | undefined) =>
  useQuery({
    queryKey: ['measurements', 'detail', id],
    queryFn: async () => (await api.get<MeasurementSheetDto>(`/measurements/${id}`)).data,
    enabled: !!id,
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

export const useInspection = (id: string | undefined) =>
  useQuery({
    queryKey: ['inspections', 'detail', id],
    queryFn: async () => (await api.get<InspectionDto>(`/inspections/${id}`)).data,
    enabled: !!id,
  });

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
}

export const useBills = (filters: BillFilters, enabled = true) =>
  useQuery({
    queryKey: ['bills', clean(filters)],
    queryFn: async () => (await api.get<Paginated<RaBillDto>>('/ra-bills', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });

export const useBill = (id: string | undefined) =>
  useQuery({
    queryKey: ['bills', 'detail', id],
    queryFn: async () => (await api.get<RaBillDto>(`/ra-bills/${id}`)).data,
    enabled: !!id,
  });

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

/** Active vendors for pickers. */
export const useVendors = (enabled = true) =>
  useQuery({
    queryKey: ['vendors', 'all'],
    queryFn: async () => (await api.get<Paginated<VendorDto>>('/vendors', { params: { pageSize: MAX_PAGE_SIZE } })).data.items,
    enabled,
    staleTime: 60_000,
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
}

export const usePurchaseOrders = (filters: PurchaseOrderFilters, enabled = true) =>
  useQuery({
    queryKey: ['purchase-orders', clean(filters)],
    queryFn: async () => (await api.get<Paginated<PurchaseOrderDto>>('/purchase-orders', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
    enabled,
  });

export const usePurchaseOrder = (id: string | undefined) =>
  useQuery({
    queryKey: ['purchase-orders', 'detail', id],
    queryFn: async () => (await api.get<PurchaseOrderDto>(`/purchase-orders/${id}`)).data,
    enabled: !!id,
  });

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

export const useVendorBill = (id: string | undefined) =>
  useQuery({
    queryKey: ['vendor-bills', 'detail', id],
    queryFn: async () => (await api.get<VendorBillDto>(`/vendor-bills/${id}`)).data,
    enabled: !!id,
  });

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

export const useWorkOrder = (id: string | undefined) =>
  useQuery({
    queryKey: ['work-orders', 'detail', id],
    queryFn: async () => (await api.get<WorkOrderDto>(`/work-orders/${id}`)).data,
    enabled: !!id,
  });

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

export const useSubcontractBill = (id: string | undefined) =>
  useQuery({
    queryKey: ['subcontract-bills', 'detail', id],
    queryFn: async () => (await api.get<SubcontractBillDto>(`/subcontract-bills/${id}`)).data,
    enabled: !!id,
  });

export const useClients = (enabled = true) =>
  useQuery({
    queryKey: ['clients', 'all'],
    queryFn: async () => (await api.get<Paginated<ClientDto>>('/clients', { params: { pageSize: MAX_PAGE_SIZE } })).data.items,
    enabled,
  });

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

export const useNotifications = (opts?: { unreadOnly?: boolean; limit?: number }) =>
  useQuery({
    queryKey: ['notifications', clean(opts)],
    queryFn: async () => (await api.get<NotificationListDto>('/notifications', { params: clean({ ...opts, allTypes: true }) })).data,
    refetchInterval: 30_000,
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

export function useReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { type: ApprovalTypeParam; id: string; decision: ReviewDecision; note?: string }) =>
      (await api.post(`/approvals/${vars.type}/${vars.id}/review`, { decision: vars.decision, note: vars.note || undefined })).data,
    onSuccess: () => qc.invalidateQueries(),
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
    mutationFn: async () => (await api.post<{ updated: number }>('/notifications/read-all')).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export async function uploadFile(file: File): Promise<AttachmentDto> {
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
