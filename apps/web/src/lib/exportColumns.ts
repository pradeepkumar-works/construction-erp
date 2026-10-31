import {
  VENDOR_KIND_LABELS,
  MSME_CATEGORY_LABELS,
  EQUIPMENT_OWNERSHIP_LABELS,
  EQUIPMENT_RATE_UNIT_LABELS,
  EXPENSE_CATEGORY_LABELS,
  DELAY_PARTY_LABELS,
  RISK_CATEGORY_LABELS,
  RISK_KIND_LABELS,
  RISK_STATUS_LABELS,
  riskLevel,
  RISK_LEVEL_LABELS,
  PAYMENT_MODE_LABELS,
  RECEIPT_MODE_LABELS,
  MATERIAL_PRIORITY_LABELS,
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
  STOCK_ENTRY_TYPE_LABELS,
  GRN_QC_STATUS_LABELS,
  SUBMISSION_STATUS_LABELS,
  BILL_STAGE_LABELS,
  RECEIPT_KIND_LABELS,
  WEATHER_LABELS,
  SUB_BILL_DEDUCTION_LABELS,
  FUND_PURPOSE_LABELS,
  PAYMENT_REQUEST_KIND_LABELS,
  VENDOR_BILL_KIND_LABELS,
  DEBIT_NOTE_REASON_LABELS,
  type PaymentRequestDto,
  type DebitNoteDto,
  type WorkOrderDto,
  type SubcontractBillDto,
  type ActivityDto,
  type PurchaseOrderDto,
  type VendorBillDto,
  type AttendanceLineDto,
  type AttendanceSheetDto,
  type DailyReportDto,
  type EquipmentDto,
  type ExpenseDto,
  type RiskDto,
  type MeasurementSheetDto,
  type RaBillDto,
  type ReceiptDto,
  type ProjectReceivableDto,
  type OpenBillDto,
  type PayableBillDto,
  type VendorPayableDto,
  type VendorPaymentDto,
  type MachineryLogDto,
  type MaterialRequestDto,
  type ProgressEntryDto,
  type ProjectSummary,
  type StockBalanceDto,
  type StockEntryDto,
  type StockLineDto,
  type UserSummary,
  type VendorDto,
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
  { header: 'Labour', value: (r) => r.manpowerCount },
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
  { header: 'Labour', value: (r) => r.totalManpower },
  { header: 'Labour by trade', value: (r) => r.manpower.map((m) => `${m.category}: ${m.count}`).join(', '), width: 34 },
  { header: 'Machinery', value: (r) => r.machinery.map((m) => `${m.name}: ${m.hours} h`).join(', '), width: 30 },
  { header: 'Work done', value: (r) => r.workExecuted, width: 50 },
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
  { header: 'Invite pending', value: (r) => (r.invitePending ? 'Yes' : 'No') },
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
  { header: 'Purchase order', value: (r) => r.entry.poNo, width: 16 },
  { header: 'Material request', value: (r) => r.entry.requestNo, width: 16 },
  { header: 'Supplier', value: (r) => r.entry.supplier, width: 24 },
  { header: 'Challan no.', value: (r) => r.entry.challanNo, width: 14 },
  { header: 'Vehicle no.', value: (r) => r.entry.vehicleNo, width: 14 },
  { header: 'Issued to', value: (r) => r.entry.issuedTo, width: 24 },
  { header: 'Work order', value: (r) => r.entry.woNo, width: 16 },
  { header: 'Activity', value: (r) => r.entry.activityName, width: 24 },
  { header: 'Remarks', value: (r) => r.entry.remarks, width: 30 },
  { header: 'QA/QC', value: (r) => (r.entry.type !== 'RECEIPT' ? null : r.entry.qcStatus ? GRN_QC_STATUS_LABELS[r.entry.qcStatus] : 'Awaiting'), width: 16 },
  { header: 'Rejected', value: (r) => (r.line.rejectedQty ? toNumber(r.line.rejectedQty) : null) },
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

export const RISK_EXPORT: ExportColumn<RiskDto>[] = [
  { header: 'No.', value: (r) => r.riskNo, width: 15 },
  { header: 'Project', value: (r) => r.projectName, width: 34 },
  { header: 'Type', value: (r) => RISK_KIND_LABELS[r.kind], width: 8 },
  { header: 'Category', value: (r) => RISK_CATEGORY_LABELS[r.category], width: 22 },
  { header: 'Title', value: (r) => r.title, width: 40 },
  { header: 'Description', value: (r) => r.description, width: 40 },
  { header: 'Activity', value: (r) => r.activityName, width: 26 },
  { header: 'Probability', value: (r) => r.probability },
  { header: 'Impact', value: (r) => r.impact },
  { header: 'Score', value: (r) => r.score },
  { header: 'Level', value: (r) => RISK_LEVEL_LABELS[riskLevel(r.score)], width: 9 },
  { header: 'Delay from', value: (r) => r.delayStart, width: 12 },
  { header: 'Delay to', value: (r) => r.delayEnd, width: 12 },
  { header: 'Days lost', value: (r) => r.daysLost },
  { header: 'Responsible', value: (r) => (r.responsibleParty ? DELAY_PARTY_LABELS[r.responsibleParty] : ''), width: 16 },
  { header: 'EOT claimed', value: (r) => (r.kind === 'DELAY' ? (r.eotClaimed ? 'Yes' : 'No') : ''), width: 11 },
  { header: 'EOT granted (days)', value: (r) => r.eotGrantedDays ?? '', width: 12 },
  { header: 'Mitigation / action', value: (r) => r.mitigation, width: 40 },
  { header: 'Owner', value: (r) => r.ownerName, width: 20 },
  { header: 'Due', value: (r) => r.dueDate, width: 12 },
  { header: 'Overdue', value: (r) => (r.overdue ? 'Yes' : ''), width: 9 },
  { header: 'Status', value: (r) => RISK_STATUS_LABELS[r.status], width: 12 },
  { header: 'Closed at', value: (r) => (r.closedAt ? formatDateTime(r.closedAt) : ''), width: 18 },
  { header: 'Closure note', value: (r) => r.closureNote, width: 30 },
  { header: 'Raised by', value: (r) => r.raisedByName, width: 20 },
  { header: 'Raised at', value: (r) => formatDateTime(r.createdAt), width: 18 },
];

/** One row per measurement line, so the export reads like the measurement book. */
export interface MeasurementExportRow {
  sheet: MeasurementSheetDto;
  line: MeasurementSheetDto['lines'][number] | null;
}

const dim = (v: string | null | undefined) => (v === null || v === undefined ? null : toNumber(v));

export const MEASUREMENT_EXPORT: ExportColumn<MeasurementExportRow>[] = [
  { header: 'MB no.', value: (r) => r.sheet.mbNo, width: 14 },
  { header: 'Date', value: (r) => r.sheet.date, width: 12 },
  { header: 'Project', value: (r) => r.sheet.projectName, width: 34 },
  { header: 'BOQ item', value: (r) => r.sheet.boqItemNo, width: 10 },
  { header: 'BOQ description', value: (r) => r.sheet.boqDescription, width: 36 },
  { header: 'Location', value: (r) => r.sheet.location, width: 26 },
  { header: 'Work order', value: (r) => r.sheet.woNo, width: 16 },
  { header: 'Contractor', value: (r) => r.sheet.contractorName, width: 24 },
  { header: 'Line', value: (r) => r.line?.description ?? null, width: 28 },
  { header: 'Nos', value: (r) => dim(r.line?.nos) },
  { header: 'L', value: (r) => dim(r.line?.length) },
  { header: 'B', value: (r) => dim(r.line?.breadth) },
  { header: 'D / H', value: (r) => dim(r.line?.depth) },
  { header: 'Line qty', value: (r) => dim(r.line?.quantity) },
  { header: 'Unit', value: (r) => r.sheet.unit, width: 8 },
  { header: 'Sheet total', value: (r) => toNumber(r.sheet.totalQty) },
  { header: 'Rate', value: (r) => toNumber(r.sheet.rate) },
  { header: 'Amount', value: (r) => toNumber(r.sheet.amount) },
  { header: 'Submitted by', value: (r) => r.sheet.submittedByName, width: 20 },
  { header: 'Status', value: (r) => status(r.sheet.status), width: 18 },
  { header: 'Reviewed by', value: (r) => r.sheet.reviewedByName, width: 20 },
  { header: 'Reviewer note', value: (r) => r.sheet.reviewNote, width: 30 },
];

export const measurementExportRows = (sheets: MeasurementSheetDto[]): MeasurementExportRow[] =>
  sheets.flatMap<MeasurementExportRow>((sheet) => (sheet.lines.length ? sheet.lines.map((line) => ({ sheet, line })) : [{ sheet, line: null }]));

const deduction = (b: RaBillDto, key: string) => toNumber(b.deductions.find((d) => d.key === key)?.amount ?? 0);

/** One row per RA bill, with each deduction in its own column for the accounts team. */
export const BILL_EXPORT: ExportColumn<RaBillDto>[] = [
  { header: 'Bill', value: (b) => b.billLabel, width: 18 },
  { header: 'Bill date', value: (b) => b.billDate, width: 12 },
  { header: 'Measured up to', value: (b) => b.measuredUpTo, width: 14 },
  { header: 'Project code', value: (b) => b.projectCode, width: 14 },
  { header: 'Project', value: (b) => b.projectName, width: 34 },
  { header: 'Client', value: (b) => b.clientName, width: 30 },
  { header: 'Client GSTIN', value: (b) => b.client?.gstin ?? null, width: 18 },
  { header: 'Work up to previous', value: (b) => toNumber(b.grossPrevious) },
  { header: 'Work in this bill', value: (b) => toNumber(b.grossAmount) },
  { header: 'Work up to date', value: (b) => toNumber(b.grossUpto) },
  { header: 'Price variation', value: (b) => toNumber(b.pvAmount) },
  { header: 'GST %', value: (b) => toNumber(b.gstRate) },
  { header: 'GST', value: (b) => toNumber(b.gstAmount) },
  { header: 'Retention', value: (b) => deduction(b, 'retention') },
  { header: 'Security deposit', value: (b) => deduction(b, 'securityDeposit') },
  { header: 'Advance recovery', value: (b) => deduction(b, 'advanceRecovery') },
  { header: 'TDS', value: (b) => deduction(b, 'tds') },
  { header: 'GST TDS', value: (b) => deduction(b, 'gstTds') },
  { header: 'Labour cess', value: (b) => deduction(b, 'labourCess') },
  { header: 'Other deduction', value: (b) => toNumber(b.otherDeduction) },
  { header: 'Other deduction for', value: (b) => b.otherDeductionNote, width: 20 },
  { header: 'Total deductions', value: (b) => toNumber(b.totalDeductions) },
  { header: 'Net payable', value: (b) => toNumber(b.netPayable) },
  { header: 'Claimed net', value: (b) => (b.claimedNet === null ? null : toNumber(b.claimedNet)) },
  { header: 'Status', value: (b) => status(b.status), width: 18 },
  { header: 'With client', value: (b) => (b.status === 'APPROVED' ? BILL_STAGE_LABELS[b.stage] : null), width: 14 },
  { header: 'Sent', value: (b) => b.sentDate, width: 12 },
  { header: 'Certified', value: (b) => b.certifiedDate, width: 12 },
  { header: 'Certificate no.', value: (b) => b.certificateNo, width: 18 },
  { header: 'Paid', value: (b) => b.paidDate, width: 12 },
  { header: 'Prepared by', value: (b) => b.submittedByName, width: 20 },
  { header: 'Approved by', value: (b) => b.reviewedByName, width: 20 },
];

export const RECEIPT_EXPORT: ExportColumn<ReceiptDto>[] = [
  { header: 'Date', value: (r) => r.receiptDate, width: 12 },
  { header: 'Kind', value: (r) => RECEIPT_KIND_LABELS[r.kind], width: 20 },
  { header: 'Project code', value: (r) => r.projectCode, width: 14 },
  { header: 'Project', value: (r) => r.projectName, width: 34 },
  { header: 'Client', value: (r) => r.clientName, width: 30 },
  { header: 'Bill', value: (r) => r.billLabel, width: 16 },
  { header: 'Received', value: (r) => toNumber(r.amount) },
  { header: 'Mode', value: (r) => PAYMENT_MODE_LABELS[r.mode], width: 10 },
  { header: 'Reference', value: (r) => r.reference, width: 22 },
  { header: 'TDS', value: (r) => toNumber(r.tdsAmount) },
  { header: 'GST TDS', value: (r) => toNumber(r.gstTdsAmount) },
  { header: 'Retention', value: (r) => toNumber(r.retentionAmount) },
  { header: 'Security deposit', value: (r) => toNumber(r.securityDepositAmount) },
  { header: 'Advance recovery', value: (r) => toNumber(r.advanceRecoveryAmount) },
  { header: 'Labour cess', value: (r) => toNumber(r.labourCessAmount) },
  { header: 'Other deduction', value: (r) => toNumber(r.otherDeduction) },
  { header: 'Other deduction for', value: (r) => r.otherDeductionNote, width: 20 },
  { header: 'Total deducted', value: (r) => toNumber(r.deductedAmount) },
  { header: 'Remarks', value: (r) => r.remarks, width: 30 },
  { header: 'Recorded by', value: (r) => r.createdByName, width: 20 },
];

export const RECEIVABLE_EXPORT: ExportColumn<ProjectReceivableDto>[] = [
  { header: 'Project code', value: (r) => r.projectCode, width: 14 },
  { header: 'Project', value: (r) => r.projectName, width: 34 },
  { header: 'Client', value: (r) => r.clientName, width: 30 },
  { header: 'Billed (work + GST)', value: (r) => toNumber(r.billed) },
  { header: 'Received', value: (r) => toNumber(r.received) },
  { header: 'Deducted by client', value: (r) => toNumber(r.deducted) },
  { header: 'Outstanding', value: (r) => toNumber(r.outstanding) },
  { header: '0-30 days', value: (r) => toNumber(r.ageing.current) },
  { header: '31-60 days', value: (r) => toNumber(r.ageing.days31to60) },
  { header: '61-90 days', value: (r) => toNumber(r.ageing.days61to90) },
  { header: 'Over 90 days', value: (r) => toNumber(r.ageing.over90) },
  { header: 'Approved, not sent', value: (r) => toNumber(r.notSent) },
  { header: 'Retention held', value: (r) => toNumber(r.retentionHeld) },
  { header: 'Retention due', value: (r) => r.retentionReleaseDate, width: 12 },
  { header: 'Deposit held', value: (r) => toNumber(r.depositHeld) },
  { header: 'TDS deducted', value: (r) => toNumber(r.tdsDeducted) },
  { header: 'GST TDS deducted', value: (r) => toNumber(r.gstTdsDeducted) },
];

export const OPEN_BILL_EXPORT: ExportColumn<OpenBillDto>[] = [
  { header: 'Bill', value: (r) => r.billLabel, width: 16 },
  { header: 'Project code', value: (r) => r.projectCode, width: 14 },
  { header: 'Project', value: (r) => r.projectName, width: 34 },
  { header: 'Client', value: (r) => r.clientName, width: 30 },
  { header: 'Bill date', value: (r) => r.billDate, width: 12 },
  { header: 'Sent', value: (r) => r.sentDate, width: 12 },
  { header: 'Certified', value: (r) => r.certifiedDate, width: 12 },
  { header: 'Work + GST', value: (r) => toNumber(r.invoiceAmount) },
  { header: 'Settled', value: (r) => toNumber(r.settledAmount) },
  { header: 'Outstanding', value: (r) => toNumber(r.outstanding) },
  { header: 'Days since sent', value: (r) => r.daysOutstanding },
];

const billKind = (t: PayableBillDto['billType'] | null) => (t === 'VENDOR_BILL' ? 'Vendor bill' : t === 'SUBCONTRACT_BILL' ? 'Subcontractor bill' : 'Advance');

export const PAYABLE_BILL_EXPORT: ExportColumn<PayableBillDto>[] = [
  { header: 'Bill', value: (r) => r.billLabel, width: 22 },
  { header: 'Type', value: (r) => billKind(r.billType), width: 18 },
  { header: 'Vendor', value: (r) => r.vendorName, width: 30 },
  { header: 'MSME', value: (r) => (r.vendorMsme ? MSME_CATEGORY_LABELS[r.vendorMsme] : null), width: 10 },
  { header: 'Project code', value: (r) => r.projectCode, width: 14 },
  { header: 'Project', value: (r) => r.projectName, width: 34 },
  { header: 'Bill date', value: (r) => r.billDate, width: 12 },
  { header: 'Due date', value: (r) => r.dueDate, width: 12 },
  { header: 'Payable', value: (r) => toNumber(r.payable) },
  { header: 'Paid', value: (r) => toNumber(r.paid) },
  { header: 'Outstanding', value: (r) => toNumber(r.outstanding) },
  { header: 'Days to due', value: (r) => r.daysToDue },
  { header: 'MSME at risk', value: (r) => (r.msmeFlag ? 'Yes' : null), width: 12 },
];

export const PAYABLE_VENDOR_EXPORT: ExportColumn<VendorPayableDto>[] = [
  { header: 'Vendor', value: (r) => r.vendorName, width: 34 },
  { header: 'MSME', value: (r) => (r.vendorMsme ? MSME_CATEGORY_LABELS[r.vendorMsme] : null), width: 10 },
  { header: 'Open bills', value: (r) => r.openBills },
  { header: 'Billed', value: (r) => toNumber(r.billed) },
  { header: 'Paid', value: (r) => toNumber(r.paid) },
  { header: 'Deducted', value: (r) => toNumber(r.deducted) },
  { header: 'Outstanding', value: (r) => toNumber(r.outstanding) },
  { header: 'Not due', value: (r) => toNumber(r.ageing.notDue) },
  { header: '1-30 days late', value: (r) => toNumber(r.ageing.days1to30) },
  { header: '31-60 days late', value: (r) => toNumber(r.ageing.days31to60) },
  { header: '61-90 days late', value: (r) => toNumber(r.ageing.days61to90) },
  { header: 'Over 90 days late', value: (r) => toNumber(r.ageing.over90) },
  { header: 'MSME at risk', value: (r) => toNumber(r.msmeAtRisk) },
  { header: 'Retention held', value: (r) => toNumber(r.retentionHeld) },
  { header: 'TDS deducted', value: (r) => toNumber(r.tdsDeducted) },
  { header: 'Advance not yet adjusted', value: (r) => toNumber(r.advanceOutstanding) },
];

export const VENDOR_PAYMENT_EXPORT: ExportColumn<VendorPaymentDto>[] = [
  { header: 'Date', value: (r) => r.paymentDate, width: 12 },
  { header: 'Vendor', value: (r) => r.vendorName, width: 30 },
  { header: 'Bill', value: (r) => r.billLabel, width: 22 },
  { header: 'Type', value: (r) => billKind(r.billType), width: 18 },
  { header: 'Project code', value: (r) => r.projectCode, width: 14 },
  { header: 'Project', value: (r) => r.projectName, width: 34 },
  { header: 'Paid', value: (r) => toNumber(r.amount) },
  { header: 'TDS', value: (r) => toNumber(r.tdsAmount) },
  { header: 'Other deduction', value: (r) => toNumber(r.otherDeduction) },
  { header: 'Deducted for', value: (r) => r.otherDeductionNote, width: 24 },
  { header: 'Settled', value: (r) => toNumber(r.settledAmount) },
  { header: 'Mode', value: (r) => RECEIPT_MODE_LABELS[r.mode] ?? PAYMENT_MODE_LABELS[r.mode], width: 16 },
  { header: 'Reference', value: (r) => r.reference, width: 22 },
  { header: 'Remarks', value: (r) => r.remarks, width: 30 },
  { header: 'Recorded by', value: (r) => r.createdByName, width: 20 },
];

export const PAYMENT_REQUEST_EXPORT: ExportColumn<PaymentRequestDto>[] = [
  { header: 'Request', value: (r) => r.requestNo, width: 16 },
  { header: 'For', value: (r) => (r.purpose ? `${PAYMENT_REQUEST_KIND_LABELS[r.kind]}: ${FUND_PURPOSE_LABELS[r.purpose].toLowerCase()}` : PAYMENT_REQUEST_KIND_LABELS[r.kind]), width: 26 },
  { header: 'Bill, order or imprest', value: (r) => r.targetLabel, width: 22 },
  { header: 'Pay to', value: (r) => r.vendorName ?? (r.imprestHolderName ? `${r.imprestHolderName}'s imprest` : null), width: 30 },
  { header: 'Project code', value: (r) => r.projectCode, width: 14 },
  { header: 'Project', value: (r) => r.projectName, width: 34 },
  { header: 'Amount', value: (r) => toNumber(r.amount) },
  { header: 'Pay by', value: (r) => RECEIPT_MODE_LABELS[r.mode] ?? PAYMENT_MODE_LABELS[r.mode], width: 14 },
  { header: 'Needed by', value: (r) => r.neededBy, width: 12 },
  { header: 'Reason', value: (r) => r.reason, width: 40 },
  { header: 'Status', value: (r) => status(r.status), width: 16 },
  { header: 'Paid', value: (r) => toNumber(r.paidAmount) },
  { header: 'Paid on', value: (r) => r.paidDate, width: 12 },
  { header: 'Asked by', value: (r) => r.submittedByName, width: 20 },
  { header: 'Approved by', value: (r) => (r.status === 'APPROVED' ? r.reviewedByName : null), width: 20 },
];

export const DEBIT_NOTE_EXPORT: ExportColumn<DebitNoteDto>[] = [
  { header: 'Debit note', value: (r) => r.noteNo, width: 16 },
  { header: 'Date', value: (r) => r.date, width: 12 },
  { header: 'Reason', value: (r) => DEBIT_NOTE_REASON_LABELS[r.reason], width: 20 },
  { header: 'Bill', value: (r) => r.billLabel, width: 28 },
  { header: 'Vendor', value: (r) => r.vendorName, width: 30 },
  { header: 'Vendor GSTIN', value: (r) => r.vendorGstin, width: 18 },
  { header: 'Project code', value: (r) => r.projectCode, width: 14 },
  { header: 'Project', value: (r) => r.projectName, width: 34 },
  { header: 'GRN', value: (r) => r.stockEntryNo, width: 14 },
  { header: 'Before GST', value: (r) => toNumber(r.subtotal) },
  { header: 'GST', value: (r) => toNumber(r.gstAmount) },
  { header: 'Total', value: (r) => toNumber(r.total) },
  { header: 'Remarks', value: (r) => r.remarks, width: 40 },
  { header: 'Raised by', value: (r) => r.createdByName, width: 20 },
  { header: 'Cancelled on', value: (r) => r.cancelledAt?.slice(0, 10) ?? null, width: 12 },
  { header: 'In Tally', value: (r) => (r.exportedToTally ? 'Yes' : 'No'), width: 8 },
];

export const VENDOR_EXPORT: ExportColumn<VendorDto>[] = [
  { header: 'Vendor', value: (r) => r.name, width: 34 },
  { header: 'Supplies', value: (r) => r.kinds.map((k) => VENDOR_KIND_LABELS[k]).join(', '), width: 30 },
  { header: 'GSTIN', value: (r) => r.gstin, width: 18 },
  { header: 'PAN', value: (r) => r.pan, width: 12 },
  { header: 'State code', value: (r) => r.stateCode, width: 10 },
  { header: 'MSME', value: (r) => (r.msmeCategory ? MSME_CATEGORY_LABELS[r.msmeCategory] : null), width: 10 },
  { header: 'Udyam no.', value: (r) => r.udyamNo, width: 22 },
  { header: 'Contact person', value: (r) => r.contactPerson, width: 20 },
  { header: 'Phone', value: (r) => r.phone, width: 14 },
  { header: 'Email', value: (r) => r.email, width: 24 },
  { header: 'Address', value: (r) => r.address, width: 30 },
  { header: 'Account name', value: (r) => r.bankAccountName, width: 24 },
  { header: 'Account no.', value: (r) => r.bankAccountNo, width: 20 },
  { header: 'IFSC', value: (r) => r.bankIfsc, width: 13 },
  { header: 'Bank', value: (r) => r.bankName, width: 26 },
  { header: 'Expenses', value: (r) => r.expenseCount },
  { header: 'Machines', value: (r) => r.equipmentCount },
  { header: 'GRNs', value: (r) => r.grnCount },
  { header: 'Active', value: (r) => (r.isActive ? 'Yes' : 'No'), width: 8 },
];

export const PURCHASE_ORDER_EXPORT: ExportColumn<PurchaseOrderDto>[] = [
  { header: 'PO no.', value: (r) => r.poNo, width: 14 },
  { header: 'PO date', value: (r) => r.poDate, width: 12 },
  { header: 'Project', value: (r) => r.projectName, width: 34 },
  { header: 'Vendor', value: (r) => r.vendorName, width: 30 },
  { header: 'Vendor GSTIN', value: (r) => r.vendorGstin, width: 18 },
  { header: 'Material request', value: (r) => r.requestNo, width: 14 },
  { header: 'Items', value: (r) => r.lines.map((l) => `${l.itemName} ${l.quantity} ${l.unit}`).join('; '), width: 40 },
  { header: 'Before GST', value: (r) => toNumber(r.subtotal) },
  { header: 'GST', value: (r) => toNumber(r.gstAmount) },
  { header: 'Freight', value: (r) => toNumber(r.freight) },
  { header: 'Total', value: (r) => toNumber(r.total) },
  { header: 'Deliver by', value: (r) => r.deliveryBy, width: 12 },
  { header: 'Payment days', value: (r) => r.paymentDays },
  { header: 'Received %', value: (r) => r.receivedPct },
  { header: 'Status', value: (r) => SUBMISSION_STATUS_LABELS[r.status], width: 16 },
  { header: 'Closed', value: (r) => (r.closedAt ? r.closedAt.slice(0, 10) : null), width: 12 },
  { header: 'Raised by', value: (r) => r.submittedByName, width: 20 },
  { header: 'Approved by', value: (r) => r.reviewedByName, width: 20 },
];

export const VENDOR_BILL_EXPORT: ExportColumn<VendorBillDto>[] = [
  { header: 'Bill no.', value: (r) => r.billNo, width: 14 },
  { header: 'Vendor', value: (r) => r.vendorName, width: 30 },
  { header: 'Vendor GSTIN', value: (r) => r.vendorGstin, width: 18 },
  { header: 'MSME', value: (r) => (r.vendorMsme ? MSME_CATEGORY_LABELS[r.vendorMsme] : null), width: 10 },
  { header: 'Invoice no.', value: (r) => r.invoiceNo, width: 16 },
  { header: 'Invoice date', value: (r) => r.invoiceDate, width: 12 },
  { header: 'Due date', value: (r) => r.dueDate, width: 12 },
  { header: 'Kind', value: (r) => VENDOR_BILL_KIND_LABELS[r.kind], width: 22 },
  { header: 'PO no.', value: (r) => r.poNo, width: 14 },
  { header: 'Machine', value: (r) => r.equipmentCode, width: 12 },
  { header: 'Hire month', value: (r) => r.hireMonth?.slice(0, 7) ?? null, width: 10 },
  { header: 'Cost head', value: (r) => (r.expenseCategory ? EXPENSE_CATEGORY_LABELS[r.expenseCategory] : null), width: 18 },
  { header: 'Project', value: (r) => r.projectName, width: 34 },
  { header: 'Before GST', value: (r) => toNumber(r.subtotal) },
  { header: 'GST', value: (r) => toNumber(r.gstAmount) },
  { header: 'Freight', value: (r) => toNumber(r.freight) },
  { header: 'Total', value: (r) => toNumber(r.total) },
  { header: 'Advance adjusted', value: (r) => toNumber(r.advanceAdjusted) },
  { header: 'Diesel recovered', value: (r) => toNumber(r.fuelRecovery) },
  { header: 'Debit notes', value: (r) => toNumber(r.debitNoteAmount) },
  { header: 'Payable', value: (r) => toNumber(r.payable) },
  { header: 'No exceptions', value: (r) => (r.matched ? 'Yes' : 'No'), width: 10 },
  { header: 'Exceptions', value: (r) => r.exceptions.join('; '), width: 50 },
  { header: 'Status', value: (r) => SUBMISSION_STATUS_LABELS[r.status], width: 16 },
  { header: 'Entered by', value: (r) => r.submittedByName, width: 20 },
  { header: 'Approved by', value: (r) => r.reviewedByName, width: 20 },
];

export const WORK_ORDER_EXPORT: ExportColumn<WorkOrderDto>[] = [
  { header: 'WO no.', value: (r) => r.woNo, width: 14 },
  { header: 'WO date', value: (r) => r.woDate, width: 12 },
  { header: 'Subcontractor', value: (r) => r.vendorName, width: 30 },
  { header: 'PAN', value: (r) => r.vendorPan, width: 12 },
  { header: 'MSME', value: (r) => (r.vendorMsme ? MSME_CATEGORY_LABELS[r.vendorMsme] : null), width: 10 },
  { header: 'Work', value: (r) => r.title, width: 40 },
  { header: 'Project', value: (r) => r.projectName, width: 34 },
  { header: 'Value before GST', value: (r) => toNumber(r.value) },
  { header: 'GST %', value: (r) => toNumber(r.gstRate), width: 8 },
  { header: 'Retention %', value: (r) => toNumber(r.retentionPct), width: 10 },
  { header: 'TDS %', value: (r) => toNumber(r.tdsPct), width: 8 },
  { header: 'Advance', value: (r) => toNumber(r.advanceAmount) },
  { header: 'Advance recovered', value: (r) => toNumber(r.advanceRecovered) },
  { header: 'Billed', value: (r) => toNumber(r.billedAmount) },
  { header: 'Billed %', value: (r) => r.billedPct, width: 9 },
  { header: 'Closed', value: (r) => (r.closedAt ? 'Yes' : 'No'), width: 8 },
  { header: 'Status', value: (r) => SUBMISSION_STATUS_LABELS[r.status], width: 16 },
  { header: 'Issued by', value: (r) => r.submittedByName, width: 20 },
  { header: 'Approved by', value: (r) => r.reviewedByName, width: 20 },
];

export const SUBCONTRACT_BILL_EXPORT: ExportColumn<SubcontractBillDto>[] = [
  { header: 'Bill', value: (r) => r.label, width: 24 },
  { header: 'Bill date', value: (r) => r.billDate, width: 12 },
  { header: 'Measured up to', value: (r) => r.measuredUpTo, width: 12 },
  { header: 'Subcontractor', value: (r) => r.vendorName, width: 30 },
  { header: 'PAN', value: (r) => r.vendorPan, width: 12 },
  { header: 'Their invoice', value: (r) => r.invoiceNo, width: 16 },
  { header: 'Project', value: (r) => r.projectName, width: 34 },
  { header: 'Work value', value: (r) => toNumber(r.grossAmount) },
  { header: 'GST', value: (r) => toNumber(r.gstAmount) },
  ...(['retention', 'advanceRecovery', 'tds', 'material', 'other'] as const).map(
    (key): ExportColumn<SubcontractBillDto> => ({ header: SUB_BILL_DEDUCTION_LABELS[key], value: (r) => toNumber(r.deductions.find((d) => d.key === key)?.amount) }),
  ),
  { header: 'Total deductions', value: (r) => toNumber(r.totalDeductions) },
  { header: 'Net payable', value: (r) => toNumber(r.netPayable) },
  { header: 'Due date', value: (r) => r.dueDate, width: 12 },
  { header: 'Final', value: (r) => (r.isFinal ? 'Yes' : 'No'), width: 8 },
  { header: 'Status', value: (r) => SUBMISSION_STATUS_LABELS[r.status], width: 16 },
  { header: 'Prepared by', value: (r) => r.submittedByName, width: 20 },
  { header: 'Approved by', value: (r) => r.reviewedByName, width: 20 },
];
