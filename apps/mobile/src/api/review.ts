import type { ReviewDecision, SubmissionType } from '@erp/shared';
import type { Api } from './hooks';

/** The `:type` segment of `POST /approvals/:type/:id/review` for each submission type. */
const REVIEW_PATH: Record<SubmissionType, string> = {
  PROGRESS: 'progress',
  DPR: 'dpr',
  MATERIAL_REQUEST: 'material_request',
  MACHINERY: 'machinery',
  EXPENSE: 'expense',
  MEASUREMENT: 'measurement',
  BILL: 'bill',
  PURCHASE_ORDER: 'purchase_order',
  VENDOR_BILL: 'vendor_bill',
  WORK_ORDER: 'work_order',
  SUBCONTRACT_BILL: 'subcontract_bill',
  INSPECTION: 'inspection',
};

/** Types reviewed with a plain decision; an inspection is decided with its checklist on its own screen. */
export const canQuickReview = (type: SubmissionType) => type !== 'INSPECTION';

/** Approve, send back or reject an entry, with an optional note for the submitter. Used by the record screens and the Approvals tab. */
export function reviewSubmission(api: Api, type: SubmissionType, id: string, decision: ReviewDecision, note?: string) {
  return api.post<{ ok: true }>(`/approvals/${REVIEW_PATH[type]}/${id}/review`, { decision, note: note?.trim() || undefined });
}
