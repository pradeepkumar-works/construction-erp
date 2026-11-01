/** Document register: drawings and documents with revisions, transmittals and letters in and out. */

export const DOCUMENT_KINDS = ['DRAWING', 'SPECIFICATION', 'REPORT', 'METHOD_STATEMENT', 'CONTRACT', 'OTHER'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  DRAWING: 'Drawing',
  SPECIFICATION: 'Specification',
  REPORT: 'Report',
  METHOD_STATEMENT: 'Method statement',
  CONTRACT: 'Contract document',
  OTHER: 'Other',
};

export const DOCUMENT_DISCIPLINES = ['GENERAL', 'ARCHITECTURAL', 'STRUCTURAL', 'ROAD', 'WATER', 'ELECTRICAL', 'MECHANICAL', 'PLUMBING'] as const;
export type DocumentDiscipline = (typeof DOCUMENT_DISCIPLINES)[number];
export const DOCUMENT_DISCIPLINE_LABELS: Record<DocumentDiscipline, string> = {
  GENERAL: 'General',
  ARCHITECTURAL: 'Architectural',
  STRUCTURAL: 'Structural',
  ROAD: 'Roads and highways',
  WATER: 'Water and sewerage',
  ELECTRICAL: 'Electrical',
  MECHANICAL: 'Mechanical',
  PLUMBING: 'Plumbing',
};

export const REVISION_STATUSES = ['FOR_CONSTRUCTION', 'APPROVED', 'APPROVED_WITH_COMMENTS', 'FOR_APPROVAL', 'FOR_INFORMATION', 'REJECTED', 'AS_BUILT', 'WITHDRAWN'] as const;
export type RevisionStatus = (typeof REVISION_STATUSES)[number];
export const REVISION_STATUS_LABELS: Record<RevisionStatus, string> = {
  FOR_CONSTRUCTION: 'Good for construction',
  APPROVED: 'Approved',
  APPROVED_WITH_COMMENTS: 'Approved with comments',
  FOR_APPROVAL: 'For approval',
  FOR_INFORMATION: 'For information',
  REJECTED: 'Rejected',
  AS_BUILT: 'As built',
  WITHDRAWN: 'Withdrawn',
};

/** Statuses site may build from. Any other current revision is shown on site with a "not for construction" warning. */
export const BUILDABLE_STATUSES: RevisionStatus[] = ['FOR_CONSTRUCTION', 'APPROVED', 'APPROVED_WITH_COMMENTS'];
export const isBuildable = (s: RevisionStatus | null | undefined) => !!s && BUILDABLE_STATUSES.includes(s);

export const TRANSMITTAL_PURPOSES = ['FOR_CONSTRUCTION', 'FOR_APPROVAL', 'FOR_REVIEW', 'FOR_INFORMATION', 'AS_REQUESTED'] as const;
export type TransmittalPurpose = (typeof TRANSMITTAL_PURPOSES)[number];
export const TRANSMITTAL_PURPOSE_LABELS: Record<TransmittalPurpose, string> = {
  FOR_CONSTRUCTION: 'For construction',
  FOR_APPROVAL: 'For approval',
  FOR_REVIEW: 'For review and comments',
  FOR_INFORMATION: 'For information',
  AS_REQUESTED: 'As requested',
};

export const LETTER_DIRECTIONS = ['IN', 'OUT'] as const;
export type LetterDirection = (typeof LETTER_DIRECTIONS)[number];
export const LETTER_DIRECTION_LABELS: Record<LetterDirection, string> = { IN: 'Inward', OUT: 'Outward' };
