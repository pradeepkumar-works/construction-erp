import type { SubmissionType } from '@erp/shared';

export type OutboxStatus = 'PENDING' | 'SYNCING' | 'FAILED';

/** What an outbox entry creates: one of the approval submissions, a day's attendance sheet, a delay / risk register entry or a safety record. */
export type OutboxType = SubmissionType | 'ATTENDANCE' | 'RISK' | 'SAFETY_INCIDENT' | 'TOOLBOX_TALK' | 'WORK_PERMIT' | 'PPE_ISSUE' | 'RFI';

export interface OutboxPhoto {
  /** Local file URI (copied into the app's document directory so it survives cache clean-ups). */
  uri: string;
  name: string;
  type: string;
  /** Set once the photo has been uploaded; a retry never uploads it again. */
  attachmentId?: string;
}

/** One site entry waiting on this phone to be sent to the API. `id` becomes the server id. */
export interface OutboxItem {
  id: string;
  userId: string;
  type: OutboxType;
  /** Request body for POST /progress, /dpr, /material-requests, /machinery-logs, /expenses, /measurements, /inspections, /attendance, /risks or /safety/*, without id and attachmentIds. */
  payload: Record<string, unknown>;
  photos: OutboxPhoto[];
  /** Display strings for the outbox list. */
  title: string;
  subtitle: string;
  status: OutboxStatus;
  error: string | null;
  attempts: number;
  createdAt: string;
}

export const OUTBOX_PATH: Record<OutboxType, string> = {
  PROGRESS: '/progress',
  DPR: '/dpr',
  MATERIAL_REQUEST: '/material-requests',
  MACHINERY: '/machinery-logs',
  EXPENSE: '/expenses',
  MEASUREMENT: '/measurements',
  BILL: '/ra-bills',
  PURCHASE_ORDER: '/purchase-orders',
  VENDOR_BILL: '/vendor-bills',
  WORK_ORDER: '/work-orders',
  SUBCONTRACT_BILL: '/subcontract-bills',
  PAYMENT_REQUEST: '/payment-requests',
  INSPECTION: '/inspections',
  ATTENDANCE: '/attendance',
  RISK: '/risks',
  SAFETY_INCIDENT: '/safety/incidents',
  TOOLBOX_TALK: '/safety/talks',
  WORK_PERMIT: '/safety/permits',
  PPE_ISSUE: '/ppe/issues',
  RFI: '/rfis',
};

export const OUTBOX_DETAIL: Record<SubmissionType, string> = {
  PROGRESS: '/progress/',
  DPR: '/dpr/',
  MATERIAL_REQUEST: '/material-request/',
  MACHINERY: '/machinery/',
  EXPENSE: '/expense/',
  MEASUREMENT: '/measurement/',
  BILL: '/bill/',
  PURCHASE_ORDER: '/purchase-order/',
  VENDOR_BILL: '/vendor-bill/',
  WORK_ORDER: '/work-order/',
  SUBCONTRACT_BILL: '/subcontract-bill/',
  INSPECTION: '/inspection/',
  PAYMENT_REQUEST: '/payment-request/',
};

/**
 * Phone forms that can open an entry the server refused, so it is corrected and sent again (UX item 80). The form reads
 * the entry by its `outboxId` param, keeps its id (so a retry never makes a second entry) and replaces it when sent.
 */
export const OUTBOX_FIX_PATH: Partial<Record<OutboxType, string>> = {
  DPR: '/dpr/new',
  PROGRESS: '/progress/new',
  MEASUREMENT: '/measurement/new',
  ATTENDANCE: '/attendance',
};
