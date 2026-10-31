import type { PendingApprovalDto, SubmissionType } from '@erp/shared';

/** Queue order of the groups, with the short names the filter and group headers use. */
export const QUEUE_TYPES: [SubmissionType, string][] = [
  ['PROGRESS', 'Progress'],
  ['DPR', 'Daily reports'],
  ['MATERIAL_REQUEST', 'Material requests'],
  ['MACHINERY', 'Machinery'],
  ['EXPENSE', 'Expenses'],
  ['MEASUREMENT', 'Measurements'],
  ['BILL', 'RA bills'],
  ['PURCHASE_ORDER', 'Purchase orders'],
  ['VENDOR_BILL', 'Vendor bills'],
  ['WORK_ORDER', 'Work orders'],
  ['SUBCONTRACT_BILL', 'Subcontract bills'],
  ['PAYMENT_REQUEST', 'Payment requests'],
  ['INSPECTION', 'Inspections'],
];

export const QUEUE_TYPE_LABELS = Object.fromEntries(QUEUE_TYPES) as Record<SubmissionType, string>;

export const TYPE_COLORS: Record<SubmissionType, string> = {
  PROGRESS: 'blue',
  DPR: 'purple',
  MATERIAL_REQUEST: 'cyan',
  MACHINERY: 'magenta',
  EXPENSE: 'default',
  MEASUREMENT: 'geekblue',
  BILL: 'gold',
  PURCHASE_ORDER: 'orange',
  VENDOR_BILL: 'volcano',
  WORK_ORDER: 'lime',
  SUBCONTRACT_BILL: 'green',
  PAYMENT_REQUEST: 'red',
  INSPECTION: 'orange',
};

/** Types whose record has its own page, and so shows whole in the inbox's right-hand pane. */
export const RECORD_PAGES: Partial<Record<SubmissionType, string>> = {
  PROGRESS: '/progress',
  DPR: '/dpr',
  MATERIAL_REQUEST: '/material-requests',
  PURCHASE_ORDER: '/purchase-orders',
  BILL: '/bills',
  MACHINERY: '/machinery',
  EXPENSE: '/expenses',
  MEASUREMENT: '/measurements',
  VENDOR_BILL: '/vendor-bills',
  WORK_ORDER: '/work-orders',
  SUBCONTRACT_BILL: '/subcontract-bills',
  INSPECTION: '/inspections',
  PAYMENT_REQUEST: '/payment-requests',
};

export const recordPage = (type: SubmissionType, id: string) => (RECORD_PAGES[type] ? `${RECORD_PAGES[type]}/${id}` : null);

/** Inspections are decided with their checklist, so they are opened rather than approved from the queue. */
export const decidedInPlace = (type: SubmissionType) => type !== 'INSPECTION';

export const queueKey = (p: Pick<PendingApprovalDto, 'type' | 'id'>) => `${p.type}:${p.id}`;

export interface QueueGroup {
  type: SubmissionType;
  label: string;
  items: PendingApprovalDto[];
}

/** The queue in groups, in `QUEUE_TYPES` order, each oldest (or newest) first. */
export function groupQueue(items: PendingApprovalDto[], newestFirst: boolean): QueueGroup[] {
  return QUEUE_TYPES.map(([type, label]) => ({
    type,
    label,
    items: items
      .filter((p) => p.type === type)
      .sort((a, b) => (newestFirst ? b.submittedAt.localeCompare(a.submittedAt) : a.submittedAt.localeCompare(b.submittedAt))),
  })).filter((g) => g.items.length > 0);
}
