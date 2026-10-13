'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ActivityDto,
  AttachmentDto,
  AuditLogDto,
  BoqItemDto,
  CompanyDashboard,
  DailyReportDto,
  MaterialRequestDto,
  NotificationDto,
  NotificationListDto,
  PendingApprovalDto,
  ProgressEntryDto,
  ProjectDashboard,
  ProjectDetail,
  ProjectSummary,
  ReviewDecision,
  SubmissionStatus,
  SubmissionType,
  UserSummary,
} from '@erp/shared';
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

export interface ListFilters {
  projectId?: string;
  activityId?: string;
  status?: SubmissionStatus;
  mine?: boolean;
  limit?: number;
}

const clean = (f?: ListFilters) =>
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

export const useProjects = () =>
  useQuery({ queryKey: ['projects'], queryFn: async () => (await api.get<ProjectSummary[]>('/projects')).data });

export const useProject = (id: string | undefined) =>
  useQuery({
    queryKey: ['projects', id],
    queryFn: async () => (await api.get<ProjectDetail>(`/projects/${id}`)).data,
    enabled: !!id,
  });

export const useUsers = () =>
  useQuery({ queryKey: ['users'], queryFn: async () => (await api.get<UserSummary[]>('/users')).data });

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
    queryFn: async () => (await api.get<ProgressEntryDto[]>('/progress', { params: clean(filters) })).data,
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
    queryFn: async () => (await api.get<DailyReportDto[]>('/dpr', { params: clean(filters) })).data,
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
    queryFn: async () => (await api.get<MaterialRequestDto[]>('/material-requests', { params: clean(filters) })).data,
  });

export const useMaterialRequest = (id: string | undefined) =>
  useQuery({
    queryKey: ['material-requests', 'detail', id],
    queryFn: async () => (await api.get<MaterialRequestDto>(`/material-requests/${id}`)).data,
    enabled: !!id,
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
    queryKey: ['notifications', clean(opts as ListFilters | undefined)],
    queryFn: async () => (await api.get<NotificationListDto>('/notifications', { params: clean(opts as ListFilters | undefined) })).data,
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
