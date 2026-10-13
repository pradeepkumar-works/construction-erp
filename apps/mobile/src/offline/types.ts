import type { SubmissionType } from '@erp/shared';

export type OutboxStatus = 'PENDING' | 'SYNCING' | 'FAILED';

export interface OutboxPhoto {
  /** Local file URI (copied into the app's document directory so it survives cache clean-ups). */
  uri: string;
  name: string;
  type: string;
  /** Set once the photo has been uploaded; a retry never uploads it again. */
  attachmentId?: string;
}

/** One site submission waiting on this phone to be sent to the API. `id` becomes the server id. */
export interface OutboxItem {
  id: string;
  userId: string;
  type: SubmissionType;
  /** Request body for POST /progress, /dpr or /material-requests, without id and attachmentIds. */
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

export const OUTBOX_PATH: Record<SubmissionType, string> = {
  PROGRESS: '/progress',
  DPR: '/dpr',
  MATERIAL_REQUEST: '/material-requests',
};

export const OUTBOX_DETAIL: Record<SubmissionType, string> = {
  PROGRESS: '/progress/',
  DPR: '/dpr/',
  MATERIAL_REQUEST: '/material-request/',
};
