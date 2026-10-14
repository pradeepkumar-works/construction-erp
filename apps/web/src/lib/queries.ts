'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
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
  LabourRatesDto,
  ProjectCostDto,
  ProjectCostSummaryDto,
  ProgressReportDto,
  PaymentMode,
  ItemDto,
  MachineryLogDto,
  ReceivableRequestDto,
  StockBalanceDto,
  StockEntryDto,
  StockEntryType,
  ActivityDto,
  AttendanceDayDto,
  AttendanceSheetDto,
  AttendanceSuggestionsDto,
  AttachmentDto,
  AuditLogDto,
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
} from '@erp/shared';
import { MAX_PAGE_SIZE } from '@erp/shared';
import { api } from './api';

export interface RoleDto {
  id: string;
  key: string;
  name: string;
}

export type ApprovalTypeParam = 'progress' | 'dpr' | 'material_request' | 'machinery' | 'expense' | 'measurement';

export const approvalTypeParam: Record<SubmissionType, ApprovalTypeParam> = {
  PROGRESS: 'progress',
  DPR: 'dpr',
  MATERIAL_REQUEST: 'material_request',
  MACHINERY: 'machinery',
  EXPENSE: 'expense',
  MEASUREMENT: 'measurement',
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
export const useProjects = () =>
  useQuery({
    queryKey: ['projects', 'all'],
    queryFn: async () => (await api.get<Paginated<ProjectSummary>>('/projects', { params: { pageSize: MAX_PAGE_SIZE, sortBy: 'code' } })).data.items,
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
    queryFn: async () => (await api.get<Paginated<StockEntryDto>>('/stock/entries', { params: clean(filters) })).data,
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

export const useRisks = (filters?: RiskFilters) =>
  useQuery({
    queryKey: ['risks', clean(filters)],
    queryFn: async () => (await api.get<Paginated<RiskDto>>('/risks', { params: clean(filters) })).data,
    placeholderData: keepPreviousData,
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
    queryFn: async () => (await api.get<NotificationListDto>('/notifications', { params: clean(opts) })).data,
    refetchInterval: 30_000,
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
