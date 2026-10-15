/**
 * Handover and defects (v4 item 47): snags before handover, the completion certificate, defects reported in the
 * defect liability period (DLP), and the close-out checklist.
 */
import type { DefectPhase, DefectPriority, DefectStatus } from './enums';
import type { AttachmentDto } from './types';

/** The DLP when the contract does not say: 12 months is the usual term in Indian public works contracts. */
export const DEFAULT_DLP_MONTHS = 12;
/** Project managers are reminded this many days before the DLP ends, to claim back retention and guarantees. */
export const DLP_ALERT_DAYS = 30;

export const CLOSEOUT_CATEGORIES = ['DOCUMENTS', 'COMMERCIAL', 'SITE', 'STATUTORY'] as const;
export type CloseoutCategory = (typeof CLOSEOUT_CATEGORIES)[number];
export const CLOSEOUT_CATEGORY_LABELS: Record<CloseoutCategory, string> = { DOCUMENTS: 'Documents', COMMERCIAL: 'Commercial', SITE: 'Site', STATUTORY: 'Statutory' };

/** The checklist a project starts with; lines can be added, edited or removed per project. */
export const DEFAULT_CLOSEOUT_ITEMS: { category: CloseoutCategory; title: string }[] = [
  { category: 'DOCUMENTS', title: 'As-built drawings submitted' },
  { category: 'DOCUMENTS', title: 'Operation and maintenance manuals and warranties handed over' },
  { category: 'DOCUMENTS', title: 'Test certificates and quality records handed over' },
  { category: 'DOCUMENTS', title: 'Completion certificate received' },
  { category: 'COMMERCIAL', title: 'Final bill submitted' },
  { category: 'COMMERCIAL', title: 'Material reconciliation done (issued vs used)' },
  { category: 'COMMERCIAL', title: 'Subcontractor and vendor final bills settled' },
  { category: 'COMMERCIAL', title: 'Retention money claimed back after the DLP' },
  { category: 'COMMERCIAL', title: 'Security deposit and performance guarantee released' },
  { category: 'SITE', title: 'Snag list closed' },
  { category: 'SITE', title: 'Surplus material and machinery moved out' },
  { category: 'SITE', title: 'Site cleared and keys handed over' },
  { category: 'STATUTORY', title: 'Labour licence surrendered and labour dues cleared' },
  { category: 'STATUTORY', title: 'Insurance policies closed or transferred' },
];

/** The day the DLP ends: `months` after completion (YYYY-MM-DD), clamped to the month's last day. */
export function dlpEnd(completedOn: string, months: number): string {
  const [y, m, d] = completedOn.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

export interface DefectDto {
  id: string;
  defectNo: string;
  projectId: string;
  projectName: string;
  phase: DefectPhase;
  title: string;
  description: string | null;
  location: string | null;
  trade: string | null;
  priority: DefectPriority;
  status: DefectStatus;
  reportedOn: string;
  reportedByName: string;
  /** The person who found it, when not one of us */
  foundBy: string | null;
  assignedToId: string | null;
  assignedToName: string | null;
  contractor: string | null;
  dueDate: string | null;
  /** Open and past its due date */
  overdue: boolean;
  fixedOn: string | null;
  fixNote: string | null;
  fixedByName: string | null;
  cost: string | null;
  closedAt: string | null;
  closedByName: string | null;
  closeNote: string | null;
  attachments: AttachmentDto[];
  createdAt: string;
}

export interface CloseoutItemDto {
  id: string;
  category: CloseoutCategory;
  title: string;
  sortOrder: number;
  doneOn: string | null;
  doneByName: string | null;
  note: string | null;
}

export interface HandoverDto {
  id: string;
  completedOn: string;
  certificateNo: string | null;
  certificateDate: string | null;
  certifiedBy: string | null;
  dlpMonths: number;
  dlpEndsOn: string;
  /** Days to the end of the DLP (negative once over) */
  dlpDaysLeft: number;
  note: string | null;
  recordedByName: string;
  attachments: AttachmentDto[];
}

/** A project's handover page: completion, the DLP, snags and defects in numbers, money held back, the checklist. */
export interface HandoverSummaryDto {
  projectId: string;
  projectName: string;
  projectStatus: string;
  /** From the contract terms; used when completion is recorded */
  defectLiabilityMonths: number | null;
  handover: HandoverDto | null;
  snags: { open: number; fixed: number; closed: number };
  defects: { open: number; fixed: number; closed: number; overdue: number; cost: string };
  /** Retention and security deposit the client still holds; null for roles that do not see the contract */
  retentionHeld: string | null;
  depositHeld: string | null;
  checklist: CloseoutItemDto[];
}
