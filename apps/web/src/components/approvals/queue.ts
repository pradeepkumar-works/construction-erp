import { SUBMISSION_TYPE_PLURAL_LABELS, rankWaiting, toNumber, type PendingApprovalDto, type SubmissionType } from '@erp/shared';

const QUEUE_ORDER: SubmissionType[] = ['PROGRESS', 'DPR', 'MATERIAL_REQUEST', 'MACHINERY', 'EXPENSE', 'MEASUREMENT', 'BILL', 'SUPPLIER_CHOICE', 'PURCHASE_ORDER', 'VENDOR_BILL', 'WORK_ORDER', 'SUBCONTRACT_BILL', 'PAYMENT_REQUEST', 'INSPECTION'];

/** Queue order of the groups, named as their lists are (the filter and the group headers). */
export const QUEUE_TYPES: [SubmissionType, string][] = QUEUE_ORDER.map((t) => [t, SUBMISSION_TYPE_PLURAL_LABELS[t]]);

export const QUEUE_TYPE_LABELS = Object.fromEntries(QUEUE_TYPES) as Record<SubmissionType, string>;

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

/** A progress entry or measurement for nothing: its rupees are its quantity at the BOQ rate, so ₹0 means no quantity. */
export const noQuantity = (p: Pick<PendingApprovalDto, 'type' | 'amount'>) =>
  (p.type === 'PROGRESS' || p.type === 'MEASUREMENT') && p.amount !== null && toNumber(p.amount) === 0;

export const queueKey = (p: Pick<PendingApprovalDto, 'type' | 'id'>) => `${p.type}:${p.id}`;

export interface QueueGroup {
  type: SubmissionType;
  label: string;
  items: PendingApprovalDto[];
  /** Rupees the group's entries add up to; null when none of its entries has an amount. */
  amount: number | null;
  /** Whole days its oldest entry has waited. */
  oldestDays: number;
}

const DAY_MS = 86_400_000;

/**
 * The queue in groups, most at stake first (`rankWaiting`: the group's rupees, then how long its oldest entry has waited,
 * then `QUEUE_TYPES` order), each group's entries oldest (or newest) first.
 */
export function groupQueue(items: PendingApprovalDto[], newestFirst: boolean, now = Date.now()): QueueGroup[] {
  const groups = QUEUE_TYPES.map(([type, label]): QueueGroup => {
    const of = items.filter((p) => p.type === type);
    const amounts = of.filter((p) => p.amount !== null).map((p) => toNumber(p.amount));
    const oldest = of.reduce((t, p) => Math.min(t, Date.parse(p.submittedAt)), now);
    return {
      type,
      label,
      items: of.sort((a, b) => (newestFirst ? b.submittedAt.localeCompare(a.submittedAt) : a.submittedAt.localeCompare(b.submittedAt))),
      amount: amounts.length ? amounts.reduce((n, a) => n + a, 0) : null,
      oldestDays: Math.max(0, Math.floor((now - oldest) / DAY_MS)),
    };
  }).filter((g) => g.items.length > 0);
  return rankWaiting(groups, (g) => ({ amount: g.amount, daysLate: g.oldestDays }));
}
