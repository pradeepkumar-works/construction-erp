/**
 * Joining documents: the papers HR collects from a new person, each checked against the original, and the rule that
 * the offer and appointment letters wait until every required paper is verified (or set aside as not needed for this
 * person, with a reason: a fresher has no experience letter).
 */
import type { EmployeeEventType } from './hr';
import type { AttachmentDto } from './types';

export const EMPLOYEE_DOCUMENT_KINDS = ['PHOTO', 'AADHAAR', 'PAN', 'SSC', 'INTER', 'DEGREE', 'PG', 'EXPERIENCE', 'BANK'] as const;
export type EmployeeDocumentKind = (typeof EMPLOYEE_DOCUMENT_KINDS)[number];

export const EMPLOYEE_DOCUMENT_INFO: Record<EmployeeDocumentKind, { label: string; required: boolean; hint: string }> = {
  PHOTO: { label: 'Photo', required: true, hint: 'Passport size, recent' },
  AADHAAR: { label: 'Aadhaar', required: true, hint: 'Front and back; only the last four digits are kept on the record' },
  PAN: { label: 'PAN card', required: true, hint: 'Needed for TDS on salary' },
  SSC: { label: 'Class 10 (SSC) certificate', required: true, hint: 'Marks memo or pass certificate' },
  INTER: { label: 'Class 12 (Intermediate) or diploma', required: true, hint: 'Marks memo or pass certificate' },
  DEGREE: { label: 'Degree (B.Tech, B.E., B.Sc.)', required: true, hint: 'Provisional or final certificate' },
  PG: { label: 'Postgraduate (M.Tech, MBA)', required: false, hint: 'Only if they have one' },
  EXPERIENCE: { label: 'Experience or relieving letter', required: true, hint: 'From the last employer. Set aside for a fresher.' },
  BANK: { label: 'Cancelled cheque or passbook', required: false, hint: 'Proves the salary account' },
};

export const EMPLOYEE_DOCUMENT_STATUSES = ['UPLOADED', 'VERIFIED', 'REJECTED', 'WAIVED'] as const;
export type EmployeeDocumentStatus = (typeof EMPLOYEE_DOCUMENT_STATUSES)[number];
/** A kind with nothing filed reads as MISSING; it is never stored. */
export type EmployeeDocumentState = EmployeeDocumentStatus | 'MISSING';
export const EMPLOYEE_DOCUMENT_STATE_LABELS: Record<EmployeeDocumentState, string> = {
  MISSING: 'Not received',
  UPLOADED: 'To verify',
  VERIFIED: 'Verified',
  REJECTED: 'Sent back',
  WAIVED: 'Not needed',
};

/** The letters that wait for the joining documents. */
export const LETTERS_NEEDING_DOCUMENTS: readonly EmployeeEventType[] = ['OFFERED', 'JOINED'];

export interface DocumentFact {
  kind: string;
  status: EmployeeDocumentStatus;
}

export interface ChecklistLine {
  kind: EmployeeDocumentKind;
  label: string;
  required: boolean;
  state: EmployeeDocumentState;
}

/** Every kind in its order, with what is filed for it. */
export function documentChecklist(docs: DocumentFact[]): ChecklistLine[] {
  const byKind = new Map(docs.map((d) => [d.kind, d.status]));
  return EMPLOYEE_DOCUMENT_KINDS.map((kind) => ({ kind, ...EMPLOYEE_DOCUMENT_INFO[kind], state: byKind.get(kind) ?? 'MISSING' }));
}

/** Required kinds not yet verified or set aside, in checklist order. */
export function documentsOutstanding(docs: DocumentFact[]): EmployeeDocumentKind[] {
  return documentChecklist(docs)
    .filter((l) => l.required && l.state !== 'VERIFIED' && l.state !== 'WAIVED')
    .map((l) => l.kind);
}

const listOf = (words: string[]) => (words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`);

/** Why a letter cannot go out yet, or null. Only the offer and appointment letters wait for the papers. */
export function documentLetterProblem(type: EmployeeEventType, docs: DocumentFact[]): string | null {
  if (!LETTERS_NEEDING_DOCUMENTS.includes(type)) return null;
  const out = documentsOutstanding(docs);
  if (!out.length) return null;
  const letter = type === 'OFFERED' ? 'offer letter' : 'appointment letter';
  const names = out.map((k) => EMPLOYEE_DOCUMENT_INFO[k].label);
  const shown = names.length > 4 ? [...names.slice(0, 3), `${names.length - 3} more`] : names;
  return `Verify ${listOf(shown)} before the ${letter}. Open the person's Documents tab.`;
}

export type DocumentCheckDecision = 'VERIFIED' | 'REJECTED' | 'WAIVED';

/** Why a check cannot be recorded, or null. A verification needs a file; sending back and setting aside need a reason. */
export function documentCheckProblem(kind: EmployeeDocumentKind, current: EmployeeDocumentState, decision: DocumentCheckDecision, note: string | null | undefined): string | null {
  const label = EMPLOYEE_DOCUMENT_INFO[kind].label;
  if (decision === 'VERIFIED') {
    if (current === 'MISSING' || current === 'WAIVED') return `There is no ${label} on file. Upload it first.`;
    if (current === 'VERIFIED') return `${label} is already verified.`;
    return null;
  }
  if (!note?.trim()) return decision === 'REJECTED' ? `Say what is wrong with the ${label}, so they can send a fresh copy.` : `Say why ${label} is not needed for this person.`;
  if (decision === 'REJECTED' && (current === 'MISSING' || current === 'WAIVED')) return `There is no ${label} on file to send back.`;
  return null;
}

export interface EmployeeDocumentDto {
  kind: EmployeeDocumentKind;
  label: string;
  required: boolean;
  hint: string;
  state: EmployeeDocumentState;
  file: AttachmentDto | null;
  /** Why it was sent back or set aside */
  note: string | null;
  checkedByName: string | null;
  checkedAt: string | null;
}

export interface EmployeeDocumentsChecklistDto {
  employeeId: string;
  lines: EmployeeDocumentDto[];
  /** Required kinds still to verify, by label */
  outstanding: string[];
  /** Why the offer and appointment letters wait, or null when they can go out */
  letterProblem: string | null;
  /** Files filed before the checklist, or anything else HR keeps on the person */
  otherFiles: AttachmentDto[];
}
