import { SUBMISSION_TYPE_LABELS, auditActionLabel } from './labels';
import type { SubmissionType } from './enums';

/**
 * The company's audit log in one place (design review, November 2026: "IT & ERP Administration … audit logs"): every
 * line any module wrote to `AuditLog`, searchable by who, what and when. A kind without words of its own is read from
 * its key ("WORK_PERMIT" reads "Work permit", "RFI" stays "RFI").
 */
export interface AuditLogEntryDto {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorId: string;
  actorName: string;
  note: string | null;
  createdAt: string;
}

const KIND_WORDS: Record<string, string> = {
  COMPANY: 'Company data',
  STOCK: 'Stock entry',
  SC_ENQUIRY: 'Subcontract enquiry',
};

/** The words for a kind of record in the log; what was done reads through `auditActionLabel` (labels.ts). */
export const auditKindLabel = (entityType: string): string =>
  KIND_WORDS[entityType] ?? SUBMISSION_TYPE_LABELS[entityType as SubmissionType] ?? auditActionLabel(entityType);
