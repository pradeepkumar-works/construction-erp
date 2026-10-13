import {
  MATERIAL_PRIORITY_LABELS,
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
  SUBMISSION_STATUS_LABELS,
  WEATHER_LABELS,
  type ActivityDto,
  type DailyReportDto,
  type MaterialRequestDto,
  type ProgressEntryDto,
  type ProjectSummary,
  type UserSummary,
} from '@erp/shared';
import type { ExportColumn } from './exportExcel';
import { formatDateTime, toNumber } from './format';

const status = (s: keyof typeof SUBMISSION_STATUS_LABELS) => SUBMISSION_STATUS_LABELS[s];
const review: ExportColumn<{ reviewedByName: string | null; reviewedAt: string | null; reviewNote: string | null }>[] = [
  { header: 'Reviewed by', value: (r) => r.reviewedByName, width: 20 },
  { header: 'Reviewed at', value: (r) => (r.reviewedAt ? formatDateTime(r.reviewedAt) : ''), width: 18 },
  { header: 'Review note', value: (r) => r.reviewNote, width: 30 },
];

export const PROGRESS_EXPORT: ExportColumn<ProgressEntryDto>[] = [
  { header: 'Date', value: (r) => r.date, width: 12 },
  { header: 'Project', value: (r) => r.projectName, width: 34 },
  { header: 'Activity', value: (r) => r.activityName, width: 30 },
  { header: 'Quantity', value: (r) => toNumber(r.quantity) },
  { header: 'Unit', value: (r) => r.unit },
  { header: 'Location', value: (r) => r.location, width: 24 },
  { header: 'Manpower', value: (r) => r.manpowerCount },
  { header: 'Machinery', value: (r) => r.machineryUsed, width: 20 },
  { header: 'Remarks', value: (r) => r.remarks, width: 30 },
  { header: 'Photos', value: (r) => r.attachments.length },
  { header: 'Submitted by', value: (r) => r.submittedByName, width: 20 },
  { header: 'Submitted at', value: (r) => (r.submittedAt ? formatDateTime(r.submittedAt) : ''), width: 18 },
  { header: 'Status', value: (r) => status(r.status), width: 18 },
  ...review,
];

export const DPR_EXPORT: ExportColumn<DailyReportDto>[] = [
  { header: 'Date', value: (r) => r.date, width: 12 },
  { header: 'Project', value: (r) => r.projectName, width: 34 },
  { header: 'Weather', value: (r) => (r.weather ? WEATHER_LABELS[r.weather] : '') },
  { header: 'Site condition', value: (r) => r.siteCondition, width: 24 },
  { header: 'Total manpower', value: (r) => r.totalManpower },
  { header: 'Manpower', value: (r) => r.manpower.map((m) => `${m.category}: ${m.count}`).join(', '), width: 34 },
  { header: 'Machinery', value: (r) => r.machinery.map((m) => `${m.name}: ${m.hours} h`).join(', '), width: 30 },
  { header: 'Work executed', value: (r) => r.workExecuted, width: 50 },
  { header: 'Material received', value: (r) => r.materialReceived, width: 30 },
  { header: 'Tests', value: (r) => r.testsConducted, width: 24 },
  { header: 'Safety', value: (r) => r.safetyObservations, width: 24 },
  { header: 'Issues', value: (r) => r.issues, width: 30 },
  { header: 'Next-day plan', value: (r) => r.nextDayPlan, width: 30 },
  { header: 'Submitted by', value: (r) => r.submittedByName, width: 20 },
  { header: 'Status', value: (r) => status(r.status), width: 18 },
  ...review,
];

/** One row per requested item, so quantities can be summed in Excel. */
export interface MrExportRow {
  mr: MaterialRequestDto;
  item: MaterialRequestDto['items'][number] | null;
}
export const mrExportRows = (rows: MaterialRequestDto[]): MrExportRow[] => rows.flatMap((mr): MrExportRow[] => (mr.items.length ? mr.items.map((item) => ({ mr, item })) : [{ mr, item: null }]));

export const MR_EXPORT: ExportColumn<MrExportRow>[] = [
  { header: 'Request no', value: (r) => r.mr.requestNo, width: 14 },
  { header: 'Project', value: (r) => r.mr.projectName, width: 34 },
  { header: 'Required by', value: (r) => r.mr.requiredDate, width: 12 },
  { header: 'Priority', value: (r) => MATERIAL_PRIORITY_LABELS[r.mr.priority] },
  { header: 'Item', value: (r) => r.item?.itemName, width: 30 },
  { header: 'Specification', value: (r) => r.item?.specification, width: 26 },
  { header: 'Quantity', value: (r) => (r.item ? toNumber(r.item.quantity) : '') },
  { header: 'Unit', value: (r) => r.item?.unit },
  { header: 'Remarks', value: (r) => r.mr.remarks, width: 30 },
  { header: 'Requested by', value: (r) => r.mr.submittedByName, width: 20 },
  { header: 'Created', value: (r) => formatDateTime(r.mr.createdAt), width: 18 },
  { header: 'Status', value: (r) => status(r.mr.status), width: 18 },
  { header: 'Reviewed by', value: (r) => r.mr.reviewedByName, width: 20 },
  { header: 'Review note', value: (r) => r.mr.reviewNote, width: 30 },
];

export const PROJECT_EXPORT: ExportColumn<ProjectSummary>[] = [
  { header: 'Code', value: (r) => r.code },
  { header: 'Name', value: (r) => r.name, width: 40 },
  { header: 'Type', value: (r) => PROJECT_TYPE_LABELS[r.type], width: 22 },
  { header: 'Status', value: (r) => PROJECT_STATUS_LABELS[r.status] },
  { header: 'Client', value: (r) => r.clientName, width: 28 },
  { header: 'Location', value: (r) => r.location, width: 24 },
  { header: 'Project manager', value: (r) => r.projectManagerName, width: 20 },
  { header: 'Start date', value: (r) => r.startDate, width: 12 },
  { header: 'End date', value: (r) => r.endDate, width: 12 },
  { header: 'Contract value (INR)', value: (r) => (r.contractValue ? toNumber(r.contractValue) : ''), width: 20 },
  { header: 'Physical progress %', value: (r) => r.physicalProgressPct },
  { header: 'Pending approvals', value: (r) => r.pendingApprovals },
];

export const USER_EXPORT: ExportColumn<UserSummary>[] = [
  { header: 'Name', value: (r) => r.fullName, width: 24 },
  { header: 'Email', value: (r) => r.email, width: 28 },
  { header: 'Phone', value: (r) => r.phone, width: 14 },
  { header: 'Role', value: (r) => r.roleName, width: 26 },
  { header: 'Active', value: (r) => (r.isActive ? 'Yes' : 'No') },
  { header: 'Created', value: (r) => r.createdAt.slice(0, 10), width: 12 },
];

export const ACTIVITY_EXPORT: ExportColumn<ActivityDto>[] = [
  { header: 'BOQ item', value: (r) => r.boqItemNo },
  { header: 'Activity', value: (r) => r.name, width: 34 },
  { header: 'Unit', value: (r) => r.unit },
  { header: 'Planned qty', value: (r) => toNumber(r.plannedQty) },
  { header: 'Executed qty', value: (r) => toNumber(r.executedQty) },
  { header: 'Progress %', value: (r) => r.progressPct },
  { header: 'Planned start', value: (r) => r.plannedStart, width: 12 },
  { header: 'Planned end', value: (r) => r.plannedEnd, width: 12 },
  { header: 'Responsible', value: (r) => r.responsibleName, width: 20 },
  { header: 'Delayed', value: (r) => (r.isDelayed ? 'Yes' : 'No') },
];
