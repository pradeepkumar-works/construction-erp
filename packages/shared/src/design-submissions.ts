/**
 * Design submissions (item 138 part 2, ARCHITECTURE "Design and drawings"): a package of drawings or a design report
 * sent to the client's engineer or consultant for approval, or to an outside institution for vetting (proof checking),
 * each submission a revision that comes back with a code (A to D) and the reviewer's comments. Every comment gets our
 * reply before the package goes back, which is the comment resolution sheet. Everything here is pure.
 */
import { daysBetween } from './maintenance';
import { APPROVAL_CODES, type ApprovalCode } from './epc';
import type { DocumentDiscipline, RevisionStatus } from './documents';
import type { AttachmentDto } from './types';
import type { DrawingSource } from './drawing-schedule';

export const DESIGN_SUBMISSION_KINDS = ['DRAWINGS', 'DESIGN_BASIS', 'CALCULATIONS', 'SHOP_DRAWINGS', 'VENDOR_DRAWINGS', 'METHOD_STATEMENT', 'OTHER'] as const;
export type DesignSubmissionKind = (typeof DESIGN_SUBMISSION_KINDS)[number];
export const DESIGN_SUBMISSION_KIND_LABELS: Record<DesignSubmissionKind, string> = {
  DRAWINGS: 'Drawings',
  DESIGN_BASIS: 'Design basis report',
  CALCULATIONS: 'Design calculations',
  SHOP_DRAWINGS: 'Shop drawings',
  VENDOR_DRAWINGS: 'Vendor drawings',
  METHOD_STATEMENT: 'Method statement',
  OTHER: 'Other',
};

/** For the client's approval, or for vetting (proof checking of the design by an outside institution). */
export const DESIGN_PURPOSES = ['APPROVAL', 'VETTING'] as const;
export type DesignPurpose = (typeof DESIGN_PURPOSES)[number];
export const DESIGN_PURPOSE_LABELS: Record<DesignPurpose, string> = { APPROVAL: 'For approval', VETTING: 'For vetting' };

export const DESIGN_SUBMISSION_STATUSES = ['DRAFT', 'UNDER_REVIEW', 'APPROVED', 'APPROVED_AS_NOTED', 'REVISE_RESUBMIT', 'REJECTED', 'WITHDRAWN'] as const;
export type DesignSubmissionStatus = (typeof DESIGN_SUBMISSION_STATUSES)[number];
export const DESIGN_SUBMISSION_STATUS_LABELS: Record<DesignSubmissionStatus, string> = {
  DRAFT: 'Draft',
  UNDER_REVIEW: 'Under review',
  APPROVED: 'Approved',
  APPROVED_AS_NOTED: 'Approved with comments',
  REVISE_RESUBMIT: 'Revise and resubmit',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
};
/** What a vetting's codes mean: the institution vets the design, or sends it back. */
export const VETTING_STATUS_LABELS: Partial<Record<DesignSubmissionStatus, string>> = { APPROVED: 'Vetted', APPROVED_AS_NOTED: 'Vetted with remarks' };
export const designStatusLabel = (status: DesignSubmissionStatus, purpose: DesignPurpose) => (purpose === 'VETTING' && VETTING_STATUS_LABELS[status]) || DESIGN_SUBMISSION_STATUS_LABELS[status];

export { APPROVAL_CODES as DESIGN_CODES };
export type DesignCode = ApprovalCode;

/** The submission's status after the code it came back with. */
const STATUS_FOR_CODE: Record<DesignCode, DesignSubmissionStatus> = { A: 'APPROVED', B: 'APPROVED_AS_NOTED', C: 'REVISE_RESUBMIT', D: 'REJECTED' };
export const statusForCode = (code: DesignCode): DesignSubmissionStatus => STATUS_FOR_CODE[code];
/** A and B approve it (or vet it); C and D send it back. */
export const codeApproves = (code: DesignCode | null | undefined) => code === 'A' || code === 'B';
export const isDesignApproved = (s: DesignSubmissionStatus) => s === 'APPROVED' || s === 'APPROVED_AS_NOTED';

/**
 * What a drawing's revision in the register becomes when an approval comes back: approved, approved with comments, or
 * rejected (C and D both need a new revision). Only a revision sent for approval changes; a vetting leaves the register
 * alone, since the institution does not approve the drawing for the client.
 */
export function revisionStatusAfter(code: DesignCode, purpose: DesignPurpose, current: RevisionStatus): RevisionStatus | null {
  if (purpose !== 'APPROVAL' || current !== 'FOR_APPROVAL') return null;
  return code === 'A' ? 'APPROVED' : code === 'B' ? 'APPROVED_WITH_COMMENTS' : 'REJECTED';
}

/** The days the reviewer is given when the contract says nothing else. */
export const DESIGN_REVIEW_DAYS = 14;

/** R0, R1… */
export const designRevisionLabel = (n: number) => `R${n}`;

export type DesignCommentState = 'OPEN' | 'ANSWERED' | 'CLOSED';
export const DESIGN_COMMENT_STATE_LABELS: Record<DesignCommentState, string> = { OPEN: 'To answer', ANSWERED: 'Answered', CLOSED: 'Closed' };

/** A comment is closed by the reviewer (or by us when the next code accepts it), answered once we reply, else open. */
export const commentState = (c: { reply: string | null; closedOn: string | null }): DesignCommentState => (c.closedOn ? 'CLOSED' : c.reply?.trim() ? 'ANSWERED' : 'OPEN');

/** Days the current revision has been with the reviewer, while under review; null otherwise. */
export const designDaysOutstanding = (status: DesignSubmissionStatus, submittedOn: string | null, today: string) => (status === 'UNDER_REVIEW' && submittedOn ? Math.max(0, daysBetween(submittedOn, today)) : null);

/** Days past the reply-by date while still under review; null when not late. */
export function reviewDaysLate(status: DesignSubmissionStatus, replyBy: string | null, today: string): number | null {
  if (status !== 'UNDER_REVIEW' || !replyBy) return null;
  const late = daysBetween(replyBy, today);
  return late > 0 ? late : null;
}

/** The day a reply is asked by: the given day, else the usual review period from the day it went. */
export const replyByFor = (submittedOn: string, days = DESIGN_REVIEW_DAYS) => {
  const d = new Date(`${submittedOn}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Why the package cannot go (again) to the reviewer, or null. Every comment is answered before a resubmission. */
export function designSubmitProblem(
  status: DesignSubmissionStatus,
  r: { submittedOn: string; today: string; documents: number; lastReviewedOn?: string | null; replyBy?: string | null; openComments: number },
): string | null {
  if (status === 'UNDER_REVIEW') return 'This submission is already with the reviewer.';
  if (isDesignApproved(status)) return 'This submission is approved. Raise a new one for further drawings.';
  if (status === 'WITHDRAWN') return 'This submission is withdrawn.';
  if (!r.documents) return 'Add the drawings or documents it sends.';
  if (r.submittedOn > r.today) return 'It cannot be submitted after today.';
  if (r.lastReviewedOn && r.submittedOn < r.lastReviewedOn) return 'A revision cannot be submitted before the last review.';
  if (r.replyBy && r.replyBy < r.submittedOn) return 'The reply is asked for on or after the day it is submitted.';
  if (r.openComments) return `Answer the reviewer’s ${r.openComments === 1 ? 'comment' : `${r.openComments} comments`} before resubmitting.`;
  return null;
}

/** Why a code cannot be recorded, or null: only under review, dated between submission and today, and B, C or D with the reviewer's comments. */
export function designCodeProblem(status: DesignSubmissionStatus, r: { code: DesignCode; reviewedOn: string; submittedOn: string; newComments: number; today: string }): string | null {
  if (status !== 'UNDER_REVIEW') return 'Only a submission under review gets a code.';
  if (!(APPROVAL_CODES as readonly string[]).includes(r.code)) return 'Choose the code it came back with.';
  if (r.reviewedOn < r.submittedOn) return 'The review cannot be before it was submitted.';
  if (r.reviewedOn > r.today) return 'The review cannot be after today.';
  if (r.code !== 'A' && !r.newComments) return `Write the reviewer’s comments: code ${r.code} comes with them.`;
  return null;
}

/**
 * The comments still standing after a code: an A or B accepts the answers given so far (they close), a C or D leaves
 * them for the reviewer to close by hand. Returns the ids to close.
 */
export const commentsClosedBy = (code: DesignCode, comments: { id: string; reply: string | null; closedOn: string | null }[]) =>
  codeApproves(code) ? comments.filter((c) => commentState(c) === 'ANSWERED').map((c) => c.id) : [];

/**
 * The covering letter for a round: what is sent, at which revisions, for what, and the reply asked by. A resubmission
 * says so and points to the comment replies enclosed.
 */
export function coveringLetter(
  s: { projectName: string; title: string; purpose: DesignPurpose; submissionNo: string },
  round: number,
  sent: { docNo: string; title: string; revision: string }[],
  replyBy: string | null,
  answered: number,
  formatDay: (d: string) => string,
): { subject: string; body: string } {
  const what = s.purpose === 'VETTING' ? 'for vetting' : 'for approval';
  const subject = `${s.projectName}: ${s.title}, ${round ? `resubmission ${designRevisionLabel(round)} ` : ''}${what}`;
  const lines = sent.map((d, i) => `${i + 1}. ${d.docNo} ${d.title}, revision ${d.revision}`);
  const body = [
    `We submit the following ${s.purpose === 'VETTING' ? 'design for vetting' : 'for your approval'} (our ref. ${s.submissionNo} ${designRevisionLabel(round)}):`,
    '',
    ...lines,
    '',
    ...(round && answered ? [`Our replies to the ${answered === 1 ? 'comment' : `${answered} comments`} on the last submission are enclosed.`, ''] : []),
    replyBy ? `We request your ${s.purpose === 'VETTING' ? 'vetting certificate' : 'approval'} by ${formatDay(replyBy)}, so that work is not held up.` : `We request your early ${s.purpose === 'VETTING' ? 'vetting certificate' : 'approval'}, so that work is not held up.`,
  ].join('\n');
  return { subject, body };
}

export interface DesignSummary {
  underReview: number;
  late: number;
  /** Sent back (C or D) and waiting on us */
  withUs: number;
  /** Comments not yet answered across the list */
  toAnswer: number;
  /** Average days from submission to a code over the last 90 days; null with none */
  avgDaysToCode: number | null;
}

export function designSummary(
  rows: { status: DesignSubmissionStatus; late: boolean; openComments: number }[],
  reviews: { submittedOn: string; reviewedOn: string }[],
): DesignSummary {
  return {
    underReview: rows.filter((r) => r.status === 'UNDER_REVIEW').length,
    late: rows.filter((r) => r.late).length,
    withUs: rows.filter((r) => r.status === 'REVISE_RESUBMIT' || r.status === 'REJECTED').length,
    toAnswer: rows.reduce((s, r) => s + r.openComments, 0),
    avgDaysToCode: reviews.length ? Math.round(reviews.reduce((s, r) => s + Math.max(0, daysBetween(r.submittedOn, r.reviewedOn)), 0) / reviews.length) : null,
  };
}

export interface DesignSubmissionDocDto {
  documentId: string;
  docNo: string;
  title: string;
  discipline: DocumentDiscipline;
  /** The register's current revision */
  revision: string | null;
  revisionStatus: RevisionStatus | null;
}

export interface DesignRoundDto {
  id: string;
  revision: number;
  submittedOn: string;
  submittedByName: string;
  submitNote: string | null;
  /** The register revisions it sent, as "STR-201 R1" */
  sent: { documentId: string; docNo: string; revision: string }[];
  letterId: string | null;
  letterNo: string | null;
  code: DesignCode | null;
  reviewedOn: string | null;
  reviewerName: string | null;
  reviewRef: string | null;
  /** Days from submission to the code, or to today while it waits */
  days: number;
}

export interface DesignCommentDto {
  id: string;
  commentNo: number;
  /** The revision the comment was made on */
  round: number;
  documentId: string | null;
  docNo: string | null;
  text: string;
  reply: string | null;
  repliedOn: string | null;
  repliedByName: string | null;
  closedOn: string | null;
  state: DesignCommentState;
}

export interface DesignSubmissionDto {
  id: string;
  submissionNo: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  title: string;
  kind: DesignSubmissionKind;
  purpose: DesignPurpose;
  toParty: string;
  /** The reviewer's side: a late review by the client's side can be a delay */
  source: DrawingSource;
  replyBy: string | null;
  status: DesignSubmissionStatus;
  revision: number;
  submittedOn: string | null;
  lastCode: DesignCode | null;
  daysOutstanding: number | null;
  /** Under review past its reply-by date */
  daysLate: number | null;
  documents: number;
  openComments: number;
  riskId: string | null;
  riskNo: string | null;
  createdByName: string;
  createdAt: string;
}

export interface DesignSubmissionDetailDto extends DesignSubmissionDto {
  note: string | null;
  fee: string | null;
  certificateNo: string | null;
  docs: DesignSubmissionDocDto[];
  /** Newest first */
  rounds: DesignRoundDto[];
  comments: DesignCommentDto[];
  attachments: AttachmentDto[];
  canEdit: boolean;
  canSubmit: boolean;
  canRecord: boolean;
  canReply: boolean;
  canWithdraw: boolean;
  /** Late with the client's side and not yet a delay */
  canRecordDelay: boolean;
}

export interface DesignSubmissionListDto {
  items: DesignSubmissionDto[];
  total: number;
  summary: DesignSummary;
}
