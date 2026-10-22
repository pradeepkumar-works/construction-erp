import type { AttachmentDto } from './types';

/**
 * Material approvals (v6 item 113): each project's list of approved makes (from the contract, or approved on request),
 * and requests to the client's engineer or consultant to approve a make or a sample, each submission a revision with
 * its outcome, so what is waiting, for how long, and what may be bought are known. A purchase order line for a listed
 * material in a make not on the list is flagged.
 */
export const MATERIAL_APPROVAL_KINDS = ['MATERIAL', 'SAMPLE'] as const;
export type MaterialApprovalKind = (typeof MATERIAL_APPROVAL_KINDS)[number];
export const MATERIAL_APPROVAL_KIND_LABELS: Record<MaterialApprovalKind, string> = { MATERIAL: 'Material', SAMPLE: 'Sample' };

export const MATERIAL_APPROVAL_STATUSES = ['DRAFT', 'UNDER_REVIEW', 'APPROVED', 'APPROVED_AS_NOTED', 'REVISE_RESUBMIT', 'REJECTED', 'WITHDRAWN'] as const;
export type MaterialApprovalStatus = (typeof MATERIAL_APPROVAL_STATUSES)[number];
export const MATERIAL_APPROVAL_STATUS_LABELS: Record<MaterialApprovalStatus, string> = {
  DRAFT: 'Draft',
  UNDER_REVIEW: 'Under review',
  APPROVED: 'Approved',
  APPROVED_AS_NOTED: 'Approved as noted',
  REVISE_RESUBMIT: 'Revise and resubmit',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
};

export const MATERIAL_REVIEW_OUTCOMES = ['APPROVED', 'APPROVED_AS_NOTED', 'REVISE_RESUBMIT', 'REJECTED'] as const;
export type MaterialReviewOutcome = (typeof MATERIAL_REVIEW_OUTCOMES)[number];
export const MATERIAL_REVIEW_OUTCOME_LABELS: Record<MaterialReviewOutcome, string> = {
  APPROVED: 'Approved',
  APPROVED_AS_NOTED: 'Approved as noted',
  REVISE_RESUBMIT: 'Revise and resubmit',
  REJECTED: 'Rejected',
};

export const APPROVED_MAKE_SOURCES = ['CONTRACT', 'APPROVAL'] as const;
export type ApprovedMakeSource = (typeof APPROVED_MAKE_SOURCES)[number];
export const APPROVED_MAKE_SOURCE_LABELS: Record<ApprovedMakeSource, string> = { CONTRACT: 'Contract list', APPROVAL: 'Approved on request' };

/** R0, R1… */
export const revisionLabel = (n: number) => `R${n}`;

export interface MaterialApprovalRevisionDto {
  id: string;
  revision: number;
  submittedOn: string;
  submittedByName: string;
  submitNote: string | null;
  outcome: MaterialReviewOutcome | null;
  reviewedOn: string | null;
  reviewerName: string | null;
  comments: string | null;
  reviewRef: string | null;
  /** Days from submission to the outcome, or to today while it waits */
  days: number;
}

export interface MaterialApprovalDto {
  id: string;
  marNo: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  kind: MaterialApprovalKind;
  material: string;
  itemId: string | null;
  boqItemId: string | null;
  boqItemNo: string | null;
  make: string;
  model: string | null;
  vendorId: string | null;
  vendorName: string | null;
  usedFor: string | null;
  toParty: string;
  replyBy: string | null;
  status: MaterialApprovalStatus;
  revision: number;
  /** The current revision's submission day; null for a draft */
  submittedOn: string | null;
  /** Days the current revision has waited with the reviewer, while under review */
  daysOutstanding: number | null;
  /** Under review past its reply-by date */
  overdue: boolean;
  createdByName: string;
  createdAt: string;
}

export interface MaterialApprovalDetailDto extends MaterialApprovalDto {
  note: string | null;
  /** Why it was withdrawn, from the audit trail */
  withdrawnNote: string | null;
  /** Newest first */
  revisions: MaterialApprovalRevisionDto[];
  attachments: AttachmentDto[];
  /** On the project's approved makes because of this request */
  approvedMakeId: string | null;
  canEdit: boolean;
  canSubmit: boolean;
  canRecord: boolean;
  canResubmit: boolean;
  canWithdraw: boolean;
}

export interface MaterialApprovalListDto {
  items: MaterialApprovalDto[];
  summary: {
    underReview: number;
    overdue: number;
    /** Requests back for revision or rejected, waiting on us */
    withUs: number;
    approvedThisMonth: number;
    /** Average days to an outcome over the last 90 days; null with none */
    avgDaysToDecide: number | null;
  };
}

export interface ApprovedMakeDto {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  material: string;
  itemId: string | null;
  make: string;
  model: string | null;
  source: ApprovedMakeSource;
  approvalId: string | null;
  marNo: string | null;
  note: string | null;
  createdByName: string;
  createdAt: string;
}

/** A purchase order line checked against the project's approved makes. */
export interface MakeCheckLineInput {
  itemName: string;
  make?: string | null;
}

export interface MakeWarningDto {
  /** The line's place in the order, from 0 */
  index: number;
  itemName: string;
  make: string | null;
  /** NO_MAKE: the material has approved makes but the line names none; NOT_APPROVED: its make is not one of them */
  reason: 'NO_MAKE' | 'NOT_APPROVED';
  /** The makes approved for the material */
  approved: string[];
  /** A request for this make that is still with the reviewer */
  pendingMarNo: string | null;
}
