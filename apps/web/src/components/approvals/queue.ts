import { SUBMISSION_TYPE_PLURAL_LABELS, type PendingApprovalDto, type SubmissionType } from '@erp/shared';

const QUEUE_ORDER: SubmissionType[] = ['PROGRESS', 'DPR', 'MATERIAL_REQUEST', 'MACHINERY', 'EXPENSE', 'MEASUREMENT', 'BILL', 'SUPPLIER_CHOICE', 'PURCHASE_ORDER', 'VENDOR_BILL', 'WORK_ORDER', 'SUBCONTRACT_BILL', 'PAYMENT_REQUEST', 'INSPECTION'];

/** Queue order of the groups, named as their lists are (the filter and the group headers). */
export const QUEUE_TYPES: [SubmissionType, string][] = QUEUE_ORDER.map((t) => [t, SUBMISSION_TYPE_PLURAL_LABELS[t]]);

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
  SUPPLIER_CHOICE: 'gold',
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
  SUPPLIER_CHOICE: '/supplier-choices',
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
