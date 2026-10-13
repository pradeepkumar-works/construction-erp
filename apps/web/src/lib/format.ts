import dayjs from 'dayjs';
import type { SubmissionStatus, MaterialPriority, NotificationType, ProjectStatus } from '@erp/shared';

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Full INR with Indian digit grouping: ₹ 18,65,00,000 */
export function formatINR(value: string | number | null | undefined, decimals = false): string {
  const n = toNumber(value);
  return `₹ ${decimals ? inr2.format(n) : inr.format(n)}`;
}

/** Compact INR for KPIs: ₹ 1.87 Cr / ₹ 12.5 L / ₹ 85,000 */
export function formatINRCompact(value: string | number | null | undefined): string {
  const n = toNumber(value);
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹ ${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹ ${(n / 1e5).toFixed(2)} L`;
  return `₹ ${inr.format(n)}`;
}

export function formatQty(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '-';
  return num.format(toNumber(value));
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const d = dayjs(value);
  return d.isValid() ? d.format('DD MMM YYYY') : value;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const d = dayjs(value);
  return d.isValid() ? d.format('DD MMM YYYY, HH:mm') : value;
}

export function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return `${Math.round(value * 10) / 10}%`;
}

export const STATUS_COLORS: Record<SubmissionStatus, string> = {
  DRAFT: 'default',
  SUBMITTED: 'gold',
  APPROVED: 'green',
  REJECTED: 'red',
  CHANGES_REQUESTED: 'orange',
};

export const PROJECT_STATUS_COLORS: Record<ProjectStatus, string> = {
  PLANNED: 'blue',
  ACTIVE: 'green',
  ON_HOLD: 'orange',
  COMPLETED: 'purple',
  CLOSED: 'default',
};

export const PRIORITY_COLORS: Record<MaterialPriority, string> = {
  LOW: 'default',
  NORMAL: 'blue',
  HIGH: 'orange',
  URGENT: 'red',
};

export const NOTIFICATION_COLORS: Record<NotificationType, string> = {
  SUBMISSION_SUBMITTED: 'gold',
  SUBMISSION_APPROVED: 'green',
  SUBMISSION_REJECTED: 'red',
  SUBMISSION_CHANGES_REQUESTED: 'orange',
  DPR_REMINDER: 'blue',
  APPROVAL_DIGEST: 'purple',
};

/** "2 min ago", "3 h ago", "4 d ago", then a date. */
export function timeAgo(value: string | null | undefined): string {
  if (!value) return '-';
  const d = dayjs(value);
  if (!d.isValid()) return value;
  const min = Math.max(0, Math.floor((Date.now() - d.valueOf()) / 60000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days} d ago`;
  return d.format('DD MMM YYYY');
}

export function progressStatus(pct: number): 'success' | 'exception' | 'normal' | 'active' {
  if (pct >= 100) return 'success';
  return 'active';
}
