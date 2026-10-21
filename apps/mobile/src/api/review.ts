import type { ReviewDecision, ReviewResultDto, SubmissionType } from '@erp/shared';
import type { Api } from './hooks';
import { ApiError } from './client';

/** The `:type` segment of `POST /approvals/:type/:id/review` for each submission type. */
export const REVIEW_PATH: Record<SubmissionType, string> = {
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
  PAYMENT_REQUEST: 'payment_request',
  INSPECTION: 'inspection',
};

/** Types reviewed with a plain decision; an inspection is decided with its checklist on its own screen. */
export const canQuickReview = (type: SubmissionType) => type !== 'INSPECTION';

/** The fewest letters a reason to reject or send back may have: a few words, not "no" (the API holds to the same). */
export const MIN_REASON_LENGTH = 5;

/**
 * What is wrong with the note for this decision (English, the `t()` key), or null (UX item 88): Approve stays one tap
 * with an optional note; Reject says why and Send back says what needs changing, so the submitter knows what to fix.
 */
export function reviewNoteProblem(decision: ReviewDecision, note: string | undefined): string | null {
  if (decision === 'APPROVE' || (note?.trim().length ?? 0) >= MIN_REASON_LENGTH) return null;
  return decision === 'REJECT' ? 'Say why you are rejecting it' : 'Say what needs changing';
}

/**
 * Approve, send back or reject an entry, with a note for the submitter (required to reject or send back). Used by the
 * record screens and the Approvals tab. With approval levels (v5 item 94) an approval below the last level leaves the
 * entry SUBMITTED for the next one: the result says which level was decided.
 */
export function reviewSubmission(api: Api, type: SubmissionType, id: string, decision: ReviewDecision, note?: string) {
  const problem = reviewNoteProblem(decision, note);
  if (problem) return Promise.reject(new ApiError(400, problem));
  return api.post<ReviewResultDto>(`/approvals/${REVIEW_PATH[type]}/${id}/review`, { decision, note: note?.trim() || undefined });
}

/** The snackbar line after an approval: which level, when the entry goes on to another (English, the `t()` key and its values). */
export function approvedLine(r: ReviewResultDto | undefined): [string, Record<string, number>] | null {
  return r && r.status === 'SUBMITTED' && r.levels > 1 ? ['Approved level {level} of {levels}. It goes to the next level.', { level: r.level, levels: r.levels }] : null;
}
