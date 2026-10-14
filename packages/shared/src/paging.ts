/** Server-side paging, search and sort shared by every list endpoint that returns `Paginated<T>`. */

export const SORT_ORDERS = ['asc', 'desc'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

export const DEFAULT_PAGE_SIZE = 25;
/** Upper bound for one page; dropdowns and Excel exports ask for this much. */
export const MAX_PAGE_SIZE = 500;

/** Columns each list can be sorted by (`sortBy`). The first one is the default. */
export const LIST_SORT_FIELDS = {
  progress: ['date', 'createdAt', 'submittedAt', 'quantity', 'status', 'project', 'activity', 'submittedBy'],
  dpr: ['date', 'createdAt', 'submittedAt', 'status', 'project', 'submittedBy'],
  materialRequests: ['createdAt', 'requestNo', 'requiredDate', 'priority', 'status', 'project', 'submittedBy'],
  projects: ['status', 'code', 'name', 'type', 'startDate', 'endDate', 'contractValue', 'createdAt'],
  users: ['fullName', 'email', 'role', 'isActive', 'createdAt'],
  attendance: ['date', 'project', 'totalWorkers', 'recordedBy', 'updatedAt'],
  stockEntries: ['date', 'entryNo', 'type', 'project', 'createdBy', 'createdAt'],
  stockBalances: ['item', 'project', 'balance', 'received', 'issued', 'lastMovement'],
  items: ['name', 'unit', 'category', 'createdAt'],
  machinery: ['date', 'createdAt', 'submittedAt', 'hoursWorked', 'status', 'project', 'equipment', 'submittedBy'],
  equipment: ['code', 'name', 'category', 'ownership', 'project', 'createdAt'],
  measurements: ['date', 'mbNo', 'createdAt', 'submittedAt', 'totalQty', 'boqItem', 'status', 'project', 'submittedBy'],
  expenses: ['date', 'expenseNo', 'createdAt', 'submittedAt', 'totalAmount', 'category', 'status', 'project', 'submittedBy'],
  bills: ['billDate', 'billNo', 'grossAmount', 'netPayable', 'status', 'stage', 'project', 'createdAt'],
  receipts: ['receiptDate', 'amount', 'project', 'kind', 'createdAt'],
  vendorPayments: ['paymentDate', 'amount', 'vendor', 'project', 'createdAt'],
  vendors: ['name', 'createdAt'],
  purchaseOrders: ['poDate', 'poNo', 'total', 'status', 'project', 'vendor', 'createdAt'],
  vendorBills: ['invoiceDate', 'billNo', 'dueDate', 'total', 'status', 'project', 'vendor', 'createdAt'],
  workOrders: ['woDate', 'woNo', 'value', 'status', 'project', 'vendor', 'createdAt'],
  subcontractBills: ['billDate', 'grossAmount', 'netPayable', 'dueDate', 'status', 'project', 'vendor', 'createdAt'],
  inspections: ['date', 'inspectionNo', 'createdAt', 'submittedAt', 'status', 'project', 'activity', 'submittedBy'],
  risks: ['riskNo', 'score', 'status', 'kind', 'category', 'dueDate', 'project', 'owner', 'createdAt', 'updatedAt'],
} as const;

export type ProgressSortField = (typeof LIST_SORT_FIELDS.progress)[number];
export type DprSortField = (typeof LIST_SORT_FIELDS.dpr)[number];
export type MaterialRequestSortField = (typeof LIST_SORT_FIELDS.materialRequests)[number];
export type ProjectSortField = (typeof LIST_SORT_FIELDS.projects)[number];
export type UserSortField = (typeof LIST_SORT_FIELDS.users)[number];
export type AttendanceSortField = (typeof LIST_SORT_FIELDS.attendance)[number];
export type StockEntrySortField = (typeof LIST_SORT_FIELDS.stockEntries)[number];
export type StockBalanceSortField = (typeof LIST_SORT_FIELDS.stockBalances)[number];
export type ItemSortField = (typeof LIST_SORT_FIELDS.items)[number];
export type MachineryLogSortField = (typeof LIST_SORT_FIELDS.machinery)[number];
export type EquipmentSortField = (typeof LIST_SORT_FIELDS.equipment)[number];
export type MeasurementSortField = (typeof LIST_SORT_FIELDS.measurements)[number];
export type ExpenseSortField = (typeof LIST_SORT_FIELDS.expenses)[number];
export type RiskSortField = (typeof LIST_SORT_FIELDS.risks)[number];
export type InspectionSortField = (typeof LIST_SORT_FIELDS.inspections)[number];
export type BillSortField = (typeof LIST_SORT_FIELDS.bills)[number];
export type ReceiptSortField = (typeof LIST_SORT_FIELDS.receipts)[number];
export type VendorPaymentSortField = (typeof LIST_SORT_FIELDS.vendorPayments)[number];
export type VendorSortField = (typeof LIST_SORT_FIELDS.vendors)[number];
export type PurchaseOrderSortField = (typeof LIST_SORT_FIELDS.purchaseOrders)[number];
export type VendorBillSortField = (typeof LIST_SORT_FIELDS.vendorBills)[number];
export type WorkOrderSortField = (typeof LIST_SORT_FIELDS.workOrders)[number];
export type SubcontractBillSortField = (typeof LIST_SORT_FIELDS.subcontractBills)[number];

/** Query parameters understood by every paged list. */
export interface ListParams<S extends string = string> {
  /** 1-based page number. */
  page?: number;
  pageSize?: number;
  /** Free-text search; each list documents which columns it matches. */
  q?: string;
  sortBy?: S;
  sortOrder?: SortOrder;
}
