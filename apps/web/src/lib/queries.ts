'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
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

export type ApprovalTypeParam = 'progress' | 'dpr' | 'material_request';

export const approvalTypeParam: Record<SubmissionType, ApprovalTypeParam> = {
  PROGRESS: 'progress',
  DPR: 'dpr',
  MATERIAL_REQUEST: 'material_request',
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

export const clean = (f?: object) =>
  Object.fromEntries(Object.entries(f ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== ''));

/* ---------- queries ---------- */

export const useCompanyDashboard = () =>
  useQuery({ queryKey: ['dashboard', 'company'], queryFn: async () => (await api.get<CompanyDashboard>('/dashboard/company')).data });

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
