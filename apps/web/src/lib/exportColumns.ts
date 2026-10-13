import {
  EQUIPMENT_OWNERSHIP_LABELS,
  EQUIPMENT_RATE_UNIT_LABELS,
  EXPENSE_CATEGORY_LABELS,
  PAYMENT_MODE_LABELS,
  MATERIAL_PRIORITY_LABELS,
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
  STOCK_ENTRY_TYPE_LABELS,
  SUBMISSION_STATUS_LABELS,
  WEATHER_LABELS,
  type ActivityDto,
  type AttendanceLineDto,
  type AttendanceSheetDto,
  type DailyReportDto,
  type EquipmentDto,
  type ExpenseDto,
  type MachineryLogDto,
  type MaterialRequestDto,
  type ProgressEntryDto,
  type ProjectSummary,
  type StockBalanceDto,
  type StockEntryDto,
  type StockLineDto,
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

/** One row per contractor and trade, so head counts can be pivoted in Excel. */
export interface AttendanceExportRow {
  sheet: AttendanceSheetDto;
  line: AttendanceLineDto | null;
}

export const attendanceExportRows = (rows: AttendanceSheetDto[]): AttendanceExportRow[] =>
  rows.flatMap((sheet): AttendanceExportRow[] => (sheet.lines.length ? sheet.lines.map((line) => ({ sheet, line })) : [{ sheet, line: null }]));

export const ATTENDANCE_EXPORT: ExportColumn<AttendanceExportRow>[] = [
  { header: 'Date', value: (r) => r.sheet.date, width: 12 },
  { header: 'Project', value: (r) => r.sheet.projectName, width: 34 },
  { header: 'Contractor', value: (r) => r.line?.contractor, width: 28 },
  { header: 'Trade', value: (r) => r.line?.category, width: 16 },
  { header: 'Workers', value: (r) => r.line?.count ?? 0 },
  { header: 'Day total', value: (r) => r.sheet.totalWorkers },
  { header: 'Remarks', value: (r) => r.sheet.remarks, width: 30 },
  { header: 'Recorded by', value: (r) => r.sheet.recordedByName, width: 20 },
  { header: 'Last changed by', value: (r) => r.sheet.updatedByName, width: 20 },
  { header: 'DPR status', value: (r) => (r.sheet.dprStatus ? status(r.sheet.dprStatus) : 'No DPR yet'), width: 18 },
];

export const STOCK_BALANCE_EXPORT: ExportColumn<StockBalanceDto>[] = [
  { header: 'Project', value: (r) => r.projectName, width: 34 },
  { header: 'Item', value: (r) => r.itemName, width: 30 },
  { header: 'Category', value: (r) => r.category, width: 14 },
  { header: 'Unit', value: (r) => r.unit },
  { header: 'Received', value: (r) => toNumber(r.received) },
  { header: 'Issued', value: (r) => toNumber(r.issued) },
  { header: 'Adjusted', value: (r) => toNumber(r.adjusted) },
  { header: 'Balance', value: (r) => toNumber(r.balance) },
  { header: 'Minimum', value: (r) => (r.minQty === null ? '' : toNumber(r.minQty)) },
  { header: 'Low', value: (r) => (r.low ? 'Yes' : '') },
  { header: 'Last movement', value: (r) => r.lastMovement, width: 14 },
];

/** One row per entry line, so quantities can be summed by item in Excel. */
export interface StockEntryExportRow {
  entry: StockEntryDto;
  line: StockLineDto;
}

export const stockEntryExportRows = (rows: StockEntryDto[]): StockEntryExportRow[] => rows.flatMap((entry) => entry.lines.map((line) => ({ entry, line })));

export const STOCK_ENTRY_EXPORT: ExportColumn<StockEntryExportRow>[] = [
  { header: 'Date', value: (r) => r.entry.date, width: 12 },
  { header: 'Entry no.', value: (r) => r.entry.entryNo, width: 16 },
  { header: 'Type', value: (r) => STOCK_ENTRY_TYPE_LABELS[r.entry.type], width: 14 },
  { header: 'Project', value: (r) => r.entry.projectName, width: 34 },
  { header: 'Item', value: (r) => r.line.itemName, width: 30 },
  { header: 'Quantity', value: (r) => toNumber(r.line.quantity) },
  { header: 'Unit', value: (r) => r.line.unit },
  { header: 'Material request', value: (r) => r.entry.requestNo, width: 16 },
  { header: 'Supplier', value: (r) => r.entry.supplier, width: 24 },
  { header: 'Challan no.', value: (r) => r.entry.challanNo, width: 14 },
  { header: 'Vehicle no.', value: (r) => r.entry.vehicleNo, width: 14 },
  { header: 'Issued to', value: (r) => r.entry.issuedTo, width: 24 },
  { header: 'Activity', value: (r) => r.entry.activityName, width: 24 },
  { header: 'Remarks', value: (r) => r.entry.remarks, width: 30 },
  { header: 'Entered by', value: (r) => r.entry.createdByName, width: 20 },
];

export const MACHINERY_EXPORT: ExportColumn<MachineryLogDto>[] = [
  { header: 'Date', value: (r) => r.date, width: 12 },
  { header: 'Project', value: (r) => r.projectName, width: 34 },
  { header: 'Code', value: (r) => r.equipmentCode, width: 12 },
  { header: 'Equipment', value: (r) => r.equipmentName, width: 30 },
  { header: 'Owned / hired', value: (r) => EQUIPMENT_OWNERSHIP_LABELS[r.ownership] },
  { header: 'Hours worked', value: (r) => toNumber(r.hoursWorked) },
  { header: 'Idle hours', value: (r) => toNumber(r.idleHours) },
  { header: 'Breakdown hours', value: (r) => toNumber(r.breakdownHours) },
  { header: 'Diesel (L)', value: (r) => (r.dieselLitres === null ? null : toNumber(r.dieselLitres)) },
  { header: 'Meter start', value: (r) => (r.meterStart === null ? null : toNumber(r.meterStart)) },
  { header: 'Meter end', value: (r) => (r.meterEnd === null ? null : toNumber(r.meterEnd)) },
  { header: 'Operator', value: (r) => r.operatorName, width: 20 },
  { header: 'Activity', value: (r) => r.activityName, width: 28 },
  { header: 'Work done', value: (r) => r.workDone, width: 30 },
  { header: 'Breakdown', value: (r) => r.breakdownNote, width: 30 },
  { header: 'Remarks', value: (r) => r.remarks, width: 30 },
  { header: 'Submitted by', value: (r) => r.submittedByName, width: 20 },
  { header: 'Status', value: (r) => status(r.status), width: 18 },
  ...review,
];

export const EQUIPMENT_EXPORT: ExportColumn<EquipmentDto>[] = [
  { header: 'Code', value: (r) => r.code, width: 12 },
  { header: 'Name', value: (r) => r.name, width: 32 },
  { header: 'Category', value: (r) => r.category, width: 16 },
  { header: 'Owned / hired', value: (r) => EQUIPMENT_OWNERSHIP_LABELS[r.ownership] },
  { header: 'Hire agency', value: (r) => r.supplier, width: 24 },
  { header: 'Registration', value: (r) => r.registrationNo, width: 16 },
  { header: 'Rate', value: (r) => (r.rate === null ? null : toNumber(r.rate)) },
  { header: 'Rate per', value: (r) => EQUIPMENT_RATE_UNIT_LABELS[r.rateUnit] },
  { header: 'Deployed at', value: (r) => r.projectName ?? 'Yard / unassigned', width: 34 },
  { header: 'Last log', value: (r) => r.lastLogDate },
  { header: 'Active', value: (r) => (r.isActive ? 'Yes' : 'No') },
];

export const EXPENSE_EXPORT: ExportColumn<ExpenseDto>[] = [
  { header: 'Expense no.', value: (r) => r.expenseNo, width: 15 },
  { header: 'Date', value: (r) => r.date, width: 12 },
  { header: 'Project', value: (r) => r.projectName, width: 34 },
  { header: 'Category', value: (r) => EXPENSE_CATEGORY_LABELS[r.category], width: 22 },
  { header: 'Description', value: (r) => r.description, width: 36 },
  { header: 'Vendor', value: (r) => r.vendor, width: 24 },
  { header: 'Vendor GSTIN', value: (r) => r.vendorGstin, width: 18 },
  { header: 'Bill no.', value: (r) => r.billNo, width: 12 },
  { header: 'Taxable', value: (r) => toNumber(r.amount) },
  { header: 'GST %', value: (r) => toNumber(r.gstRate) },
  { header: 'GST', value: (r) => toNumber(r.gstAmount) },
  { header: 'Total', value: (r) => toNumber(r.totalAmount) },
  { header: 'Paid by', value: (r) => PAYMENT_MODE_LABELS[r.paymentMode], width: 18 },
  { header: 'Activity', value: (r) => r.activityName, width: 26 },
  { header: 'Bill photos', value: (r) => r.attachments.length },
  { header: 'Remarks', value: (r) => r.remarks, width: 30 },
  { header: 'Submitted by', value: (r) => r.submittedByName, width: 20 },
  { header: 'Status', value: (r) => status(r.status), width: 18 },
  ...review,
];
