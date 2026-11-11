import type { RoleKey } from './enums';
import type { MaterialRequestDto, ProjectSummary, PurchaseOrderDto, RaBillDto, StockBalanceDto, VendorBillDto, VendorDto } from './types';
import type { ReportCell, ReportColumnKind, ReportRowDto, ReportSectionDto } from './management';
import { extraText, type CustomFieldDto, type CustomFieldEntity } from './custom-fields';
import { canEditVendors, canPrepareBill, canSeeVendorBank, canViewContract, canViewPurchaseOrders, canViewStockValue, canViewVendorBills, isGuest } from './permissions';
import {
  BILL_STAGE_LABELS,
  CONTRACT_MODEL_LABELS,
  MATERIAL_PRIORITY_LABELS,
  MSME_CATEGORY_LABELS,
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
  SUBMISSION_STATUS_LABELS,
  VENDOR_BILL_KIND_LABELS,
  VENDOR_KIND_LABELS,
} from './labels';

/**
 * Reports people build, save and schedule (ARCHITECTURE "Reports you build"). A source is a list the person already
 * opens; its catalogue is every column a report may show, each read from the list service's own row. A definition names
 * columns of the catalogue only, so nothing a person types reaches a query, and `runReport` filters, groups, totals and
 * sorts the rows the list service returned.
 */

export const REPORT_SOURCE_KEYS = ['purchase-orders', 'vendor-bills', 'ra-bills', 'indents', 'stock', 'vendors', 'projects'] as const;
export type ReportSourceKey = (typeof REPORT_SOURCE_KEYS)[number];

/** The most rows a report reads from its list; a note says when it stops there. */
export const REPORT_ROW_CAP = 20_000;
export const MAX_REPORT_COLUMNS = 20;
export const MAX_REPORT_FILTERS = 10;
export const MAX_REPORT_NAME = 80;
export const MAX_REPORT_RECIPIENTS = 20;
const MAX_FILTER_VALUE = 200;

type RowOf = {
  'purchase-orders': PurchaseOrderDto;
  'vendor-bills': VendorBillDto;
  'ra-bills': RaBillDto;
  indents: MaterialRequestDto;
  stock: StockBalanceDto;
  vendors: VendorDto;
  projects: ProjectSummary;
};

/** A column a report may show: its cell from the list's row, whether it groups and totals, and who sees it. */
export interface ReportColumnDef<R> {
  key: string;
  label: string;
  kind: ReportColumnKind;
  value: (row: R) => ReportCell;
  /** Rows may be grouped by it */
  group?: boolean;
  /** It may be totalled (money, quantities, counts) */
  sum?: boolean;
  /** The words a filter on it picks from */
  options?: readonly string[];
  /** Only these roles see it (the helper the list's own page hides it by) */
  sees?: (role: RoleKey) => boolean;
}

export interface ReportSourceDef<R> {
  key: ReportSourceKey;
  /** The list's name: "Purchase orders" */
  label: string;
  /** What the count column of a group says: "Orders" */
  countLabel: string;
  /** The list's own role check: a role it refuses is not offered the source */
  sees: (role: RoleKey) => boolean;
  /** The date a period narrows, passed to the list as from and to; null for a list that stands as of today */
  dated: { column: string; label: string } | null;
  /** The list takes a project */
  projects: boolean;
  /** Its records carry the company's own fields (CF) */
  customFields: CustomFieldEntity | null;
  href: (row: R) => string | null;
  columns: ReportColumnDef<R>[];
  /** What a new report over it starts with */
  starter: { columns: string[]; groupBy: string | null; totals: string[] };
}

const hasOwn = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const yesNo = (v: boolean) => (v ? 'Yes' : 'No');
const YES_NO = ['Yes', 'No'] as const;
const words = <K extends string>(labels: Record<K, string>) => Object.values(labels) as string[];
const labelOf = <K extends string>(labels: Record<K, string>, k: K | null | undefined): string | null => (k ? labels[k] ?? String(k) : null);
const monthOf = (day: string | null | undefined) => (day && /^\d{4}-\d{2}/.test(day) ? day.slice(0, 7) : null);
/** A timestamp's day as the sites see it (India, UTC+05:30). */
const istDay = (iso: string | null | undefined) => (iso ? new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(0, 10) : null);
const STATUS = { key: 'status', label: 'Status', kind: 'text', group: true, options: words(SUBMISSION_STATUS_LABELS) } as const;
const status = <R extends { status: keyof typeof SUBMISSION_STATUS_LABELS }>(): ReportColumnDef<R> => ({ ...STATUS, value: (r) => SUBMISSION_STATUS_LABELS[r.status] });

const purchaseOrders: ReportSourceDef<PurchaseOrderDto> = {
  key: 'purchase-orders',
  label: 'Purchase orders',
  countLabel: 'Orders',
  sees: canViewPurchaseOrders,
  dated: { column: 'poDate', label: 'Order date' },
  projects: true,
  customFields: 'PURCHASE_ORDER',
  href: (r) => `/purchase-orders/${r.id}`,
  columns: [
    { key: 'poNo', label: 'Order', kind: 'text', value: (r) => r.poNo },
    { key: 'poDate', label: 'Order date', kind: 'date', group: true, value: (r) => r.poDate },
    { key: 'poMonth', label: 'Order month', kind: 'month', group: true, value: (r) => monthOf(r.poDate) },
    { key: 'project', label: 'Project', kind: 'text', group: true, value: (r) => r.projectName },
    { key: 'vendor', label: 'Vendor', kind: 'text', group: true, value: (r) => r.vendorName },
    { key: 'vendorGstin', label: 'Vendor GSTIN', kind: 'text', value: (r) => r.vendorGstin },
    { key: 'vendorMsme', label: 'MSME', kind: 'text', group: true, options: words(MSME_CATEGORY_LABELS), value: (r) => labelOf(MSME_CATEGORY_LABELS, r.vendorMsme) },
    { key: 'requestNo', label: 'Indent', kind: 'text', value: (r) => r.requestNo },
    status<PurchaseOrderDto>(),
    { key: 'open', label: 'Still to receive', kind: 'text', group: true, options: YES_NO, value: (r) => yesNo(r.open) },
    { key: 'deliveryBy', label: 'Deliver by', kind: 'date', value: (r) => r.deliveryBy },
    { key: 'paymentDays', label: 'Payment days', kind: 'days', value: (r) => r.paymentDays },
    { key: 'lines', label: 'Lines', kind: 'count', sum: true, value: (r) => r.lines.length },
    { key: 'subtotal', label: 'Before GST', kind: 'money', sum: true, value: (r) => r.subtotal },
    { key: 'gstAmount', label: 'GST', kind: 'money', sum: true, value: (r) => r.gstAmount },
    { key: 'freight', label: 'Freight', kind: 'money', sum: true, value: (r) => r.freight },
    { key: 'total', label: 'Order value', kind: 'money', sum: true, value: (r) => r.total },
    { key: 'receivedPct', label: 'Received', kind: 'pct', value: (r) => r.receivedPct },
    { key: 'advancePaid', label: 'Advance paid', kind: 'money', sum: true, value: (r) => r.advancePaid },
    { key: 'raisedBy', label: 'Raised by', kind: 'text', group: true, value: (r) => r.submittedByName },
  ],
  starter: { columns: ['poNo', 'poDate', 'project', 'vendor', 'status', 'total'], groupBy: 'vendor', totals: ['total'] },
};

const vendorBills: ReportSourceDef<VendorBillDto> = {
  key: 'vendor-bills',
  label: 'Vendor bills',
  countLabel: 'Bills',
  sees: canViewVendorBills,
  dated: { column: 'invoiceDate', label: 'Invoice date' },
  projects: true,
  customFields: null,
  href: (r) => `/vendor-bills/${r.id}`,
  columns: [
    { key: 'billNo', label: 'Bill', kind: 'text', value: (r) => r.billNo },
    { key: 'invoiceNo', label: 'Invoice', kind: 'text', value: (r) => r.invoiceNo },
    { key: 'invoiceDate', label: 'Invoice date', kind: 'date', group: true, value: (r) => r.invoiceDate },
    { key: 'invoiceMonth', label: 'Invoice month', kind: 'month', group: true, value: (r) => monthOf(r.invoiceDate) },
    { key: 'dueDate', label: 'Due', kind: 'date', value: (r) => r.dueDate },
    { key: 'project', label: 'Project', kind: 'text', group: true, value: (r) => r.projectName },
    { key: 'vendor', label: 'Vendor', kind: 'text', group: true, value: (r) => r.vendorName },
    { key: 'vendorMsme', label: 'MSME', kind: 'text', group: true, options: words(MSME_CATEGORY_LABELS), value: (r) => labelOf(MSME_CATEGORY_LABELS, r.vendorMsme) },
    { key: 'kind', label: 'Kind', kind: 'text', group: true, options: words(VENDOR_BILL_KIND_LABELS), value: (r) => labelOf(VENDOR_BILL_KIND_LABELS, r.kind) },
    { key: 'poNo', label: 'Order', kind: 'text', value: (r) => r.poNo },
    status<VendorBillDto>(),
    { key: 'matched', label: 'Matched', kind: 'text', group: true, options: YES_NO, value: (r) => yesNo(r.matched) },
    { key: 'subtotal', label: 'Before GST', kind: 'money', sum: true, value: (r) => r.subtotal },
    { key: 'gstAmount', label: 'GST', kind: 'money', sum: true, value: (r) => r.gstAmount },
    { key: 'total', label: 'Bill value', kind: 'money', sum: true, value: (r) => r.total },
    { key: 'payable', label: 'Payable', kind: 'money', sum: true, value: (r) => r.payable },
    { key: 'paidAmount', label: 'Paid', kind: 'money', sum: true, value: (r) => r.paidAmount },
    { key: 'outstanding', label: 'Outstanding', kind: 'money', sum: true, value: (r) => r.outstanding },
  ],
  starter: { columns: ['billNo', 'invoiceDate', 'vendor', 'project', 'total', 'outstanding'], groupBy: 'vendor', totals: ['total', 'outstanding'] },
};

const raBills: ReportSourceDef<RaBillDto> = {
  key: 'ra-bills',
  label: 'RA bills',
  countLabel: 'Bills',
  sees: canPrepareBill,
  dated: { column: 'billDate', label: 'Bill date' },
  projects: true,
  customFields: null,
  href: (r) => `/bills/${r.id}`,
  columns: [
    { key: 'bill', label: 'Bill', kind: 'text', value: (r) => r.billLabel },
    { key: 'billDate', label: 'Bill date', kind: 'date', group: true, value: (r) => r.billDate },
    { key: 'billMonth', label: 'Bill month', kind: 'month', group: true, value: (r) => monthOf(r.billDate) },
    { key: 'project', label: 'Project', kind: 'text', group: true, value: (r) => r.projectName },
    { key: 'client', label: 'Client', kind: 'text', group: true, value: (r) => r.clientName },
    { key: 'stage', label: 'Stage', kind: 'text', group: true, options: words(BILL_STAGE_LABELS), value: (r) => labelOf(BILL_STAGE_LABELS, r.stage) },
    status<RaBillDto>(),
    { key: 'isFinal', label: 'Final bill', kind: 'text', group: true, options: YES_NO, value: (r) => yesNo(r.isFinal) },
    { key: 'grossAmount', label: 'Work this bill', kind: 'money', sum: true, value: (r) => r.grossAmount },
    { key: 'grossUpto', label: 'Work up to date', kind: 'money', sum: true, value: (r) => r.grossUpto },
    { key: 'gstAmount', label: 'GST', kind: 'money', sum: true, value: (r) => r.gstAmount },
    { key: 'totalDeductions', label: 'Deductions', kind: 'money', sum: true, value: (r) => r.totalDeductions },
    { key: 'netPayable', label: 'Net payable', kind: 'money', sum: true, value: (r) => r.netPayable },
    { key: 'receivedAmount', label: 'Received', kind: 'money', sum: true, value: (r) => r.receivedAmount },
    { key: 'outstanding', label: 'Outstanding', kind: 'money', sum: true, value: (r) => r.outstanding },
    { key: 'certifiedDate', label: 'Certified on', kind: 'date', value: (r) => r.certifiedDate },
  ],
  starter: { columns: ['bill', 'billDate', 'project', 'stage', 'netPayable', 'outstanding'], groupBy: 'project', totals: ['netPayable', 'outstanding'] },
};

const indents: ReportSourceDef<MaterialRequestDto> = {
  key: 'indents',
  label: 'Indents',
  countLabel: 'Indents',
  sees: (role) => !isGuest(role),
  dated: { column: 'raisedOn', label: 'Raised on' },
  projects: true,
  customFields: null,
  href: (r) => `/material-requests/${r.id}`,
  columns: [
    { key: 'requestNo', label: 'Indent', kind: 'text', value: (r) => r.requestNo },
    { key: 'raisedOn', label: 'Raised on', kind: 'date', group: true, value: (r) => istDay(r.createdAt) },
    { key: 'raisedMonth', label: 'Month raised', kind: 'month', group: true, value: (r) => monthOf(istDay(r.createdAt)) },
    { key: 'project', label: 'Project', kind: 'text', group: true, value: (r) => r.projectName },
    { key: 'requiredDate', label: 'Needed by', kind: 'date', value: (r) => r.requiredDate },
    { key: 'priority', label: 'Priority', kind: 'text', group: true, options: words(MATERIAL_PRIORITY_LABELS), value: (r) => labelOf(MATERIAL_PRIORITY_LABELS, r.priority) },
    status<MaterialRequestDto>(),
    { key: 'items', label: 'Items', kind: 'count', sum: true, value: (r) => r.items.length },
    { key: 'raisedBy', label: 'Raised by', kind: 'text', group: true, value: (r) => r.submittedByName },
  ],
  starter: { columns: ['requestNo', 'raisedOn', 'project', 'priority', 'status', 'items'], groupBy: 'project', totals: ['items'] },
};

const stock: ReportSourceDef<StockBalanceDto> = {
  key: 'stock',
  label: 'Stock',
  countLabel: 'Items',
  sees: (role) => !isGuest(role),
  dated: null,
  projects: true,
  customFields: null,
  href: (r) => `/stock?projectId=${r.projectId}&q=${encodeURIComponent(r.itemName)}`,
  columns: [
    { key: 'item', label: 'Item', kind: 'text', group: true, value: (r) => r.itemName },
    { key: 'itemCode', label: 'Item code', kind: 'text', value: (r) => r.itemCode ?? null },
    { key: 'category', label: 'Category', kind: 'text', group: true, value: (r) => r.category },
    { key: 'project', label: 'Site or store', kind: 'text', group: true, value: (r) => r.projectName },
    { key: 'unit', label: 'Unit', kind: 'text', group: true, value: (r) => r.unit },
    // Items are in different units, so their quantities are never added up.
    { key: 'received', label: 'Received', kind: 'qty', value: (r) => r.received },
    { key: 'issued', label: 'Issued', kind: 'qty', value: (r) => r.issued },
    { key: 'balance', label: 'In stock', kind: 'qty', value: (r) => r.balance },
    { key: 'minQty', label: 'Minimum', kind: 'qty', value: (r) => r.minQty },
    { key: 'low', label: 'Below minimum', kind: 'text', group: true, options: YES_NO, value: (r) => yesNo(r.low) },
    { key: 'value', label: 'Stock value', kind: 'money', sum: true, sees: canViewStockValue, value: (r) => r.value ?? null },
    { key: 'lastMovement', label: 'Last movement', kind: 'date', value: (r) => r.lastMovement },
  ],
  starter: { columns: ['item', 'project', 'unit', 'balance', 'low'], groupBy: null, totals: [] },
};

const vendors: ReportSourceDef<VendorDto> = {
  key: 'vendors',
  label: 'Vendors',
  countLabel: 'Vendors',
  sees: (role) => canEditVendors(role) || canSeeVendorBank(role),
  dated: null,
  projects: false,
  customFields: 'VENDOR',
  href: (r) => `/vendors?q=${encodeURIComponent(r.name)}`,
  columns: [
    { key: 'name', label: 'Vendor', kind: 'text', value: (r) => r.name },
    { key: 'kinds', label: 'Supplies', kind: 'text', value: (r) => r.kinds.map((k) => VENDOR_KIND_LABELS[k] ?? k).join(', ') || null },
    { key: 'gstin', label: 'GSTIN', kind: 'text', value: (r) => r.gstin },
    { key: 'pan', label: 'PAN', kind: 'text', value: (r) => r.pan },
    { key: 'stateCode', label: 'State code', kind: 'text', group: true, value: (r) => r.stateCode },
    { key: 'msme', label: 'MSME', kind: 'text', group: true, options: words(MSME_CATEGORY_LABELS), value: (r) => labelOf(MSME_CATEGORY_LABELS, r.msmeCategory) },
    { key: 'udyamNo', label: 'Udyam number', kind: 'text', value: (r) => r.udyamNo },
    { key: 'contactPerson', label: 'Contact', kind: 'text', value: (r) => r.contactPerson },
    { key: 'phone', label: 'Phone', kind: 'text', value: (r) => r.phone },
    { key: 'email', label: 'Email', kind: 'text', value: (r) => r.email },
    { key: 'bankName', label: 'Bank', kind: 'text', sees: canSeeVendorBank, value: (r) => r.bankName },
    { key: 'bankAccountNo', label: 'Account number', kind: 'text', sees: canSeeVendorBank, value: (r) => r.bankAccountNo },
    { key: 'bankIfsc', label: 'IFSC', kind: 'text', sees: canSeeVendorBank, value: (r) => r.bankIfsc },
    { key: 'active', label: 'Active', kind: 'text', group: true, options: YES_NO, value: (r) => yesNo(r.isActive) },
    { key: 'grnCount', label: 'Goods receipts', kind: 'count', sum: true, value: (r) => r.grnCount },
  ],
  starter: { columns: ['name', 'kinds', 'gstin', 'msme', 'phone'], groupBy: null, totals: [] },
};

const projects: ReportSourceDef<ProjectSummary> = {
  key: 'projects',
  label: 'Projects',
  countLabel: 'Projects',
  sees: (role) => !isGuest(role),
  dated: null,
  projects: false,
  customFields: 'PROJECT',
  href: (r) => `/projects/${r.id}`,
  columns: [
    { key: 'code', label: 'Code', kind: 'text', value: (r) => r.code },
    { key: 'name', label: 'Project', kind: 'text', value: (r) => r.name },
    { key: 'status', label: 'Status', kind: 'text', group: true, options: words(PROJECT_STATUS_LABELS), value: (r) => labelOf(PROJECT_STATUS_LABELS, r.status) },
    { key: 'type', label: 'Type', kind: 'text', group: true, value: (r) => r.typeName ?? labelOf(PROJECT_TYPE_LABELS, r.type) },
    { key: 'contractModel', label: 'Contract', kind: 'text', group: true, options: words(CONTRACT_MODEL_LABELS), value: (r) => labelOf(CONTRACT_MODEL_LABELS, r.contractModel) },
    { key: 'client', label: 'Client', kind: 'text', group: true, value: (r) => r.clientName },
    { key: 'location', label: 'Location', kind: 'text', group: true, value: (r) => r.location },
    { key: 'manager', label: 'Project manager', kind: 'text', group: true, value: (r) => r.projectManagerName },
    { key: 'startDate', label: 'Start', kind: 'date', value: (r) => r.startDate },
    { key: 'endDate', label: 'Finish', kind: 'date', value: (r) => r.endDate },
    { key: 'contractValue', label: 'Contract value', kind: 'money', sum: true, sees: canViewContract, value: (r) => r.contractValue },
    { key: 'revisedContractValue', label: 'Revised contract value', kind: 'money', sum: true, sees: canViewContract, value: (r) => r.revisedContractValue },
    { key: 'progress', label: 'Progress', kind: 'pct', value: (r) => r.physicalProgressPct },
    { key: 'planned', label: 'Planned by today', kind: 'pct', value: (r) => r.plannedProgressPct },
    { key: 'pendingApprovals', label: 'Waiting for approval', kind: 'count', sum: true, value: (r) => r.pendingApprovals },
  ],
  starter: { columns: ['code', 'name', 'status', 'client', 'progress'], groupBy: null, totals: [] },
};

export const REPORT_SOURCES: { [K in ReportSourceKey]: ReportSourceDef<RowOf[K]> } = {
  'purchase-orders': purchaseOrders,
  'vendor-bills': vendorBills,
  'ra-bills': raBills,
  indents,
  stock,
  vendors,
  projects,
};

export const isReportSource = (k: unknown): k is ReportSourceKey => typeof k === 'string' && (REPORT_SOURCE_KEYS as readonly string[]).includes(k);

/** The sources a role may build a report over. */
export const reportSourcesFor = (role: RoleKey): ReportSourceKey[] => REPORT_SOURCE_KEYS.filter((k) => REPORT_SOURCES[k].sees(role));

/** Who may build reports: anyone whose role opens one of the sources' lists. */
export const canBuildReports = (role: RoleKey) => reportSourcesFor(role).length > 0;

// The catalogue a reader is offered

export interface ReportColumn {
  key: string;
  label: string;
  kind: ReportColumnKind;
  group: boolean;
  sum: boolean;
  options?: readonly string[];
  /** A company field (CF) that is archived: it keeps its values but takes no new ones */
  archived?: boolean;
  value: (row: unknown) => ReportCell;
}

export interface ReportCatalogue {
  source: ReportSourceKey;
  label: string;
  countLabel: string;
  dated: { column: string; label: string } | null;
  projects: boolean;
  columns: ReportColumn[];
  /** Columns the source has that this reader's role does not see, by key, with their names */
  hidden: Map<string, string>;
  href: (row: unknown) => string | null;
}

/** A company field as a report column, keyed `cf:<key>`: a number as a quantity, a date as a day, the rest as words. */
function customColumn(d: Pick<CustomFieldDto, 'key' | 'label' | 'kind' | 'unit' | 'options' | 'archived'>): ReportColumn {
  const read = (row: unknown) => {
    const values = (row as { customValues?: Record<string, unknown> } | null)?.customValues;
    return values && hasOwn(values, d.key) ? values[d.key] : undefined;
  };
  if (d.kind === 'NUMBER')
    return { key: `cf:${d.key}`, label: d.unit ? `${d.label} (${d.unit})` : d.label, kind: 'qty', group: false, sum: true, archived: d.archived, value: (row) => (typeof read(row) === 'number' ? String(read(row)) : null) };
  if (d.kind === 'DATE') return { key: `cf:${d.key}`, label: d.label, kind: 'date', group: true, sum: false, archived: d.archived, value: (row) => (typeof read(row) === 'string' ? (read(row) as string) : null) };
  const options = d.kind === 'YES_NO' ? YES_NO : d.kind === 'CHOICE' ? d.options : undefined;
  return {
    key: `cf:${d.key}`,
    label: d.label,
    kind: 'text',
    group: d.kind === 'YES_NO' || d.kind === 'CHOICE' || d.kind === 'TEXT',
    sum: false,
    ...(options ? { options } : {}),
    archived: d.archived,
    value: (row) => {
      const v = read(row);
      return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? extraText(d, v) || null : null;
    },
  };
}

/** The columns a role is offered over a source: its own (less those the role does not see) and the company's fields. */
export function catalogueFor(role: RoleKey, source: ReportSourceKey, customFields: Pick<CustomFieldDto, 'key' | 'label' | 'kind' | 'unit' | 'options' | 'archived'>[] = []): ReportCatalogue {
  const def = REPORT_SOURCES[source] as ReportSourceDef<unknown>;
  const hidden = new Map<string, string>();
  const columns: ReportColumn[] = [];
  for (const c of def.columns) {
    if (c.sees && !c.sees(role)) hidden.set(c.key, c.label);
    else columns.push({ key: c.key, label: c.label, kind: c.kind, group: !!c.group, sum: !!c.sum, ...(c.options ? { options: c.options } : {}), value: c.value });
  }
  if (def.customFields) columns.push(...customFields.map(customColumn));
  return { source, label: def.label, countLabel: def.countLabel, dated: def.dated, projects: def.projects, columns, hidden, href: def.href };
}

// A definition

export const REPORT_FILTER_OPS = ['is', 'isNot', 'contains', 'atLeast', 'atMost', 'from', 'upTo'] as const;
export type ReportFilterOp = (typeof REPORT_FILTER_OPS)[number];
export const REPORT_FILTER_OP_LABELS: Record<ReportFilterOp, string> = { is: 'is', isNot: 'is not', contains: 'contains', atLeast: 'is at least', atMost: 'is at most', from: 'is on or after', upTo: 'is on or before' };

const NUMERIC_KINDS: readonly ReportColumnKind[] = ['money', 'qty', 'pct', 'days', 'count'];
/** The conditions a column of a kind takes. */
export function filterOpsFor(kind: ReportColumnKind): ReportFilterOp[] {
  if (kind === 'date') return ['from', 'upTo'];
  if (kind === 'month') return ['is', 'from', 'upTo'];
  if (NUMERIC_KINDS.includes(kind)) return ['atLeast', 'atMost', 'is'];
  return ['is', 'isNot', 'contains'];
}

export interface ReportFilter {
  column: string;
  op: ReportFilterOp;
  value: string;
}

export interface ReportDefinition {
  source: ReportSourceKey;
  /** The columns shown, in order */
  columns: string[];
  filters: ReportFilter[];
  /** One level of grouping, by a column that groups */
  groupBy: string | null;
  /** Columns totalled; each one of `columns` */
  totals: string[];
  sort: { column: string; desc: boolean } | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const field = (o: Record<string, unknown>, k: string): unknown => (hasOwn(o, k) ? o[k] : undefined);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;
const DECIMAL = /^-?\d{1,15}(\.\d{1,6})?$/;
const realDay = (s: string) => DAY.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/**
 * A definition as sent (user JSON), read against the catalogue the reader is offered: a fresh object of own keys only.
 * A column the source does not have, or one the reader's role does not see, is a problem; with `drop` (someone else's
 * report, or a schedule run as its recipient) a column the reader does not see is left out instead, named in `left`.
 */
export function readDefinition(raw: unknown, catalogue: ReportCatalogue, opts: { drop?: boolean } = {}): { definition: ReportDefinition | null; problems: string[]; left: string[] } {
  const problems: string[] = [];
  const left = new Set<string>();
  if (!isRecord(raw)) return { definition: null, problems: ['Send the report as its source, columns, filters, group and totals'], left: [] };
  if (field(raw, 'source') !== catalogue.source) problems.push(`This report is over ${catalogue.label.toLowerCase()}`);
  const byKey = new Map(catalogue.columns.map((c) => [c.key, c]));
  const column = (k: unknown, what: string): ReportColumn | null => {
    if (typeof k !== 'string' || !k) {
      problems.push(`Choose the column ${what}`);
      return null;
    }
    const c = byKey.get(k);
    if (c) return c;
    const hiddenLabel = catalogue.hidden.get(k);
    if (hiddenLabel && opts.drop) left.add(hiddenLabel);
    else if (hiddenLabel) problems.push(`Your role does not see ${hiddenLabel}; take it out of the report`);
    else if (opts.drop && /^cf:/.test(k)) left.add(k.slice(3));
    else problems.push(`${catalogue.label} has no column “${k.slice(0, 40)}”`);
    return null;
  };

  const rawColumns = field(raw, 'columns');
  const columns: string[] = [];
  if (!Array.isArray(rawColumns) || !rawColumns.length) problems.push('Choose at least one column');
  else if (rawColumns.length > MAX_REPORT_COLUMNS) problems.push(`Keep to ${MAX_REPORT_COLUMNS} columns`);
  else
    for (const k of rawColumns) {
      const c = column(k, 'to show');
      if (c && !columns.includes(c.key)) columns.push(c.key);
    }
  if (Array.isArray(rawColumns) && rawColumns.length && !columns.length && opts.drop && !problems.length) problems.push('None of this report’s columns is shown to your role');

  const filters: ReportFilter[] = [];
  const rawFilters = field(raw, 'filters') ?? [];
  if (!Array.isArray(rawFilters)) problems.push('Send the filters as a list');
  else if (rawFilters.length > MAX_REPORT_FILTERS) problems.push(`Keep to ${MAX_REPORT_FILTERS} filters`);
  else
    for (const f of rawFilters) {
      if (!isRecord(f)) {
        problems.push('Each filter is a column, a condition and a value');
        continue;
      }
      const c = column(field(f, 'column'), 'to filter on');
      if (!c) continue;
      const op = field(f, 'op');
      const value = field(f, 'value');
      if (typeof op !== 'string' || !(filterOpsFor(c.kind) as string[]).includes(op)) {
        problems.push(`${c.label}: choose ${filterOpsFor(c.kind).map((o) => REPORT_FILTER_OP_LABELS[o]).join(', ')}`);
        continue;
      }
      const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
      if (!text || text.length > MAX_FILTER_VALUE) {
        problems.push(`${c.label}: give a value of 1 to ${MAX_FILTER_VALUE} letters`);
        continue;
      }
      if (c.kind === 'date' && !realDay(text)) problems.push(`${c.label}: give a day as YYYY-MM-DD`);
      else if (c.kind === 'month' && !MONTH.test(text)) problems.push(`${c.label}: give a month as YYYY-MM`);
      else if (NUMERIC_KINDS.includes(c.kind) && !DECIMAL.test(text)) problems.push(`${c.label}: give a number`);
      else filters.push({ column: c.key, op: op as ReportFilterOp, value: text });
    }

  const rawGroup = field(raw, 'groupBy') ?? null;
  let groupBy: string | null = null;
  if (rawGroup !== null && rawGroup !== '') {
    const c = column(rawGroup, 'to group by');
    if (c && !c.group) problems.push(`Rows cannot be grouped by ${c.label}`);
    else if (c) groupBy = c.key;
  }

  const totals: string[] = [];
  const rawTotals = field(raw, 'totals') ?? [];
  if (!Array.isArray(rawTotals)) problems.push('Send the totals as a list of columns');
  else
    for (const k of rawTotals) {
      const c = column(k, 'to total');
      if (!c) continue;
      if (!c.sum) problems.push(`${c.label} does not add up; choose a money, quantity or count column to total`);
      else if (!columns.includes(c.key)) problems.push(`Show ${c.label} to total it`);
      else if (!totals.includes(c.key)) totals.push(c.key);
    }

  const rawSort = field(raw, 'sort') ?? null;
  let sort: ReportDefinition['sort'] = null;
  if (rawSort !== null) {
    if (!isRecord(rawSort)) problems.push('Sort by one column, up or down');
    else {
      const c = column(field(rawSort, 'column'), 'to sort by');
      if (c) sort = { column: c.key, desc: field(rawSort, 'desc') === true };
    }
  }

  if (problems.length) return { definition: null, problems, left: [...left] };
  return { definition: { source: catalogue.source, columns, filters, groupBy, totals, sort }, problems, left: [...left] };
}

// Running a report

/** A decimal string or number as an integer of `scale` places (rounded half away from zero); null when it is none. */
export function scaled(v: ReportCell | undefined, scale: number): bigint | null {
  if (v === null || v === undefined || v === '') return null;
  const s = typeof v === 'number' ? (Number.isFinite(v) ? v.toFixed(Math.max(scale, 6)) : '') : v.trim();
  const m = /^(-?)(\d+)(?:\.(\d*))?$/.exec(s);
  if (!m) return null;
  const frac = m[3] ?? '';
  let n = BigInt(m[2] + frac.padEnd(scale, '0').slice(0, scale));
  if (Number(frac.charAt(scale) || '0') >= 5) n += 1n;
  return m[1] === '-' ? -n : n;
}

/** An integer of `scale` places back as a decimal string: 123456n at 2 is "1234.56". */
export function unscaled(n: bigint, scale: number): string {
  const neg = n < 0n;
  const digits = (neg ? -n : n).toString().padStart(scale + 1, '0');
  const whole = digits.slice(0, digits.length - scale);
  return `${neg ? '-' : ''}${whole}${scale ? `.${digits.slice(-scale)}` : ''}`;
}

const SUM_SCALE: Partial<Record<ReportColumnKind, number>> = { money: 2, qty: 3 };
const COMPARE_SCALE = 6;

/** The sum of a column's cells: money and quantities as decimal strings added exactly, counts as a whole number. */
export function sumCells(kind: ReportColumnKind, cells: ReportCell[]): ReportCell {
  if (kind === 'count') return cells.reduce<number>((a, c) => a + (typeof c === 'number' ? c : Number(c) || 0), 0);
  const scale = SUM_SCALE[kind] ?? 2;
  let n = 0n;
  for (const c of cells) n += scaled(c, scale) ?? 0n;
  return unscaled(n, scale);
}

function compareCells(kind: ReportColumnKind, a: ReportCell, b: ReportCell): number {
  const blankA = a === null || a === '';
  const blankB = b === null || b === '';
  if (blankA || blankB) return blankA && blankB ? 0 : blankA ? 1 : -1;
  if (NUMERIC_KINDS.includes(kind)) {
    const x = scaled(a, COMPARE_SCALE) ?? 0n;
    const y = scaled(b, COMPARE_SCALE) ?? 0n;
    return x < y ? -1 : x > y ? 1 : 0;
  }
  if (kind === 'date' || kind === 'month') return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  return String(a).localeCompare(String(b), 'en', { sensitivity: 'base', numeric: true });
}

function matches(f: ReportFilter, kind: ReportColumnKind, cell: ReportCell): boolean {
  const blank = cell === null || cell === '';
  const text = blank ? '' : String(cell).toLowerCase();
  const value = f.value.toLowerCase();
  if (NUMERIC_KINDS.includes(kind)) {
    if (blank) return false;
    const x = scaled(cell, COMPARE_SCALE);
    const y = scaled(f.value, COMPARE_SCALE);
    if (x === null || y === null) return false;
    return f.op === 'atLeast' ? x >= y : f.op === 'atMost' ? x <= y : x === y;
  }
  switch (f.op) {
    case 'is':
      return !blank && text === value;
    case 'isNot':
      return text !== value;
    case 'contains':
      return !blank && text.includes(value);
    case 'from':
      return !blank && String(cell) >= f.value;
    case 'upTo':
      return !blank && String(cell).slice(0, f.value.length) <= f.value;
    default:
      return false;
  }
}

/** What a group of rows with no value in the grouped column is called. */
export const NOT_SET = 'Not set';

export interface ReportRun {
  sections: ReportSectionDto[];
  /** Rows after the filters */
  count: number;
}

/**
 * The report over the list's rows: each row read into the catalogue's cells, the filters kept, then grouped (a summary
 * of the groups with their count and totals, above the rows), totalled exactly and sorted. Pure.
 */
export function runReport(rows: readonly unknown[], def: ReportDefinition, catalogue: ReportCatalogue): ReportRun {
  const byKey = new Map(catalogue.columns.map((c) => [c.key, c]));
  const col = (k: string) => byKey.get(k)!;
  const needed = [...new Set([...def.columns, ...def.filters.map((f) => f.column), ...(def.groupBy ? [def.groupBy] : []), ...(def.sort ? [def.sort.column] : [])])].map(col);
  const cells = rows
    .map((row, i) => {
      const r: ReportRowDto = {};
      for (const c of needed) r[c.key] = c.value(row) ?? null;
      r._href = catalogue.href(row);
      return { r, i };
    })
    .filter(({ r }) => def.filters.every((f) => matches(f, col(f.column).kind, r[f.column] ?? null)));

  const group = def.groupBy ? col(def.groupBy) : null;
  const sortCol = def.sort ? col(def.sort.column) : null;
  const dir = def.sort?.desc ? -1 : 1;
  cells.sort((a, b) => (group ? compareCells(group.kind, a.r[group.key] ?? null, b.r[group.key] ?? null) : 0) || (sortCol ? dir * compareCells(sortCol.kind, a.r[sortCol.key] ?? null, b.r[sortCol.key] ?? null) : 0) || a.i - b.i);

  const totalsRow = (list: ReportRowDto[], keys: string[]) => Object.fromEntries(keys.map((k) => [k, sumCells(col(k).kind, list.map((r) => r[k] ?? null))])) as ReportRowDto;
  const shown = def.columns.map(col).map((c) => ({ key: c.key, label: c.label, kind: c.kind }));
  const detailRows = cells.map(({ r }) => Object.fromEntries([...def.columns.map((k) => [k, r[k] ?? null]), ['_href', r._href ?? null]]) as ReportRowDto);
  const detail: ReportSectionDto = {
    key: 'rows',
    title: catalogue.label,
    columns: shown,
    rows: detailRows,
    ...(def.totals.length && detailRows.length ? { total: { [def.columns[0]]: null, ...totalsRow(detailRows, def.totals) } } : {}),
    empty: `No ${catalogue.label.toLowerCase()} match this report.`,
  };
  if (!group) return { sections: [detail], count: cells.length };

  const groups = new Map<string, { label: ReportCell; rows: ReportRowDto[] }>();
  for (const { r } of cells) {
    const v = r[group.key] ?? null;
    const k = v === null || v === '' ? '' : String(v);
    const g = groups.get(k) ?? { label: k === '' ? NOT_SET : v, rows: [] };
    g.rows.push(r);
    groups.set(k, g);
  }
  const groupKey = `group:${group.key}`;
  const summaryRows = [...groups.values()].map((g) => ({ [groupKey]: g.label, _count: g.rows.length, ...totalsRow(g.rows, def.totals) }) as ReportRowDto);
  const ordered = sortCol && def.totals.includes(sortCol.key) ? [...summaryRows].sort((a, b) => dir * compareCells(sortCol.kind, a[sortCol.key] ?? null, b[sortCol.key] ?? null)) : summaryRows;
  const summary: ReportSectionDto = {
    key: 'groups',
    title: `By ${group.label.charAt(0).toLowerCase()}${group.label.slice(1)}`,
    columns: [{ key: groupKey, label: group.label, kind: group.kind === 'month' || group.kind === 'date' ? group.kind : 'text' }, { key: '_count', label: catalogue.countLabel, kind: 'count' }, ...def.totals.map(col).map((c) => ({ key: c.key, label: c.label, kind: c.kind }))],
    rows: ordered,
    ...(ordered.length ? { total: { [groupKey]: null, _count: cells.length, ...totalsRow(detailRows, def.totals) } } : {}),
    empty: `No ${catalogue.label.toLowerCase()} match this report.`,
  };
  return { sections: [summary, detail], count: cells.length };
}

// Schedules

export const REPORT_FREQUENCIES = ['WEEKLY', 'MONTHLY'] as const;
export type ReportFrequency = (typeof REPORT_FREQUENCIES)[number];
export const REPORT_FREQUENCY_LABELS: Record<ReportFrequency, string> = { WEEKLY: 'Weekly', MONTHLY: 'Monthly' };
/** Monday first, as the weekly round-ups count a week. */
export const REPORT_WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
/** A monthly report goes on a day every month has. */
export const MAX_SCHEDULE_DAY = 28;

export interface ReportScheduleRule {
  frequency: ReportFrequency;
  /** 0 Monday to 6 Sunday, for a weekly report */
  weekday: number;
  /** 1 to 28, for a monthly report */
  dayOfMonth: number;
  /** The day the schedule was set: nothing is sent for a send day before it */
  since: string;
}

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const weekdayOf = (day: string) => (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

/** When a schedule sends, in words: "Every Monday", "On the 1st of every month". */
export const scheduleWords = (r: Pick<ReportScheduleRule, 'frequency' | 'weekday' | 'dayOfMonth'>) => (r.frequency === 'WEEKLY' ? `Every ${REPORT_WEEKDAYS[r.weekday] ?? 'Monday'}` : `On the ${ordinal(r.dayOfMonth)} of every month`);

/** Why a schedule cannot be kept, in words that say what to fix; null when it can. */
export function scheduleProblem(r: { frequency: unknown; weekday?: unknown; dayOfMonth?: unknown; recipientIds?: unknown }): string | null {
  if (r.frequency !== 'WEEKLY' && r.frequency !== 'MONTHLY') return 'Choose weekly or monthly';
  if (r.frequency === 'WEEKLY' && !(Number.isInteger(r.weekday) && (r.weekday as number) >= 0 && (r.weekday as number) <= 6)) return 'Choose the day of the week it goes';
  if (r.frequency === 'MONTHLY' && !(Number.isInteger(r.dayOfMonth) && (r.dayOfMonth as number) >= 1 && (r.dayOfMonth as number) <= MAX_SCHEDULE_DAY)) return `Choose a day of the month from 1 to ${MAX_SCHEDULE_DAY}`;
  if (!Array.isArray(r.recipientIds) || !r.recipientIds.length) return 'Choose who gets it';
  if (r.recipientIds.length > MAX_REPORT_RECIPIENTS) return `Send it to ${MAX_REPORT_RECIPIENTS} people at most`;
  return null;
}

export interface ScheduledPeriod {
  /** The send day this run belongs to */
  sendOn: string;
  from: string;
  to: string;
  /** One key per period: the dedupe of each recipient's copy */
  key: string;
}

/**
 * The period a schedule owes on `today`: the latest send day on or before today (none before `since`), and what it
 * covers. A weekly report covers the seven days before its send day, a monthly one the calendar month before. A run on a
 * later day of the same cycle owes the same period, so a missed day catches up and a second run sends nothing new.
 */
export function scheduleDue(rule: ReportScheduleRule, today: string): ScheduledPeriod | null {
  let sendOn: string;
  let from: string;
  let to: string;
  let key: string;
  if (rule.frequency === 'WEEKLY') {
    sendOn = addDays(today, -((weekdayOf(today) - rule.weekday + 7) % 7));
    from = addDays(sendOn, -7);
    to = addDays(sendOn, -1);
    key = `W${from}`;
  } else {
    const [y, m, d] = today.split('-').map(Number);
    const [sy, sm] = d >= rule.dayOfMonth ? [y, m] : m === 1 ? [y - 1, 12] : [y, m - 1];
    sendOn = `${sy}-${String(sm).padStart(2, '0')}-${String(rule.dayOfMonth).padStart(2, '0')}`;
    const [py, pm] = sm === 1 ? [sy - 1, 12] : [sy, sm - 1];
    from = `${py}-${String(pm).padStart(2, '0')}-01`;
    to = addDays(`${sy}-${String(sm).padStart(2, '0')}-01`, -1);
    key = `M${from.slice(0, 7)}`;
  }
  if (sendOn < rule.since) return null;
  return { sendOn, from, to, key };
}

/** The notice each recipient's copy carries, unique per person: a second run for the same period sends nothing. */
export const scheduleDedupeKey = (scheduleId: string, period: Pick<ScheduledPeriod, 'key'>) => `SAVED_REPORT:${scheduleId}:${period.key}`;

// What the API sends

export interface ReportCatalogueColumnDto {
  key: string;
  label: string;
  kind: ReportColumnKind;
  group: boolean;
  sum: boolean;
  options?: readonly string[];
  archived?: boolean;
}

export interface ReportSourceDto {
  key: ReportSourceKey;
  label: string;
  dated: { column: string; label: string } | null;
  projects: boolean;
  columns: ReportCatalogueColumnDto[];
  starter: { columns: string[]; groupBy: string | null; totals: string[] };
}

export const catalogueDto = (c: ReportCatalogue): ReportSourceDto => {
  const starter = REPORT_SOURCES[c.source].starter;
  const has = new Set(c.columns.map((x) => x.key));
  return {
    key: c.source,
    label: c.label,
    dated: c.dated,
    projects: c.projects,
    columns: c.columns.map(({ value: _value, ...rest }) => rest),
    starter: { columns: starter.columns.filter((k) => has.has(k)), groupBy: starter.groupBy && has.has(starter.groupBy) ? starter.groupBy : null, totals: starter.totals.filter((k) => has.has(k)) },
  };
};

export interface ReportScheduleDto {
  frequency: ReportFrequency;
  weekday: number;
  dayOfMonth: number;
  recipients: { id: string; name: string }[];
  /** "Every Monday" */
  words: string;
  lastSentOn: string | null;
}

export interface SavedReportDto {
  id: string;
  name: string;
  source: ReportSourceKey;
  sourceLabel: string;
  definition: ReportDefinition;
  shared: boolean;
  ownerId: string;
  ownerName: string;
  mine: boolean;
  schedule: ReportScheduleDto | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReportRecipientDto {
  id: string;
  name: string;
  role: string;
}
