/**
 * RFI register: requests for information sent to the client or consultant (a drawing that does not match site, a
 * missing level, a specification to confirm). Each is OPEN until answered, by the client's engineer in their portal or
 * recorded by staff from a letter, then CLOSED once acted on. An answer that changes the work can raise a variation
 * or a delay, linked back to the RFI.
 */
import type { RfiPriority, RfiStatus } from './enums';
import type { AttachmentDto } from './types';

/** Days given for an answer when none is chosen, and for an urgent RFI. */
export const RFI_DEFAULT_REPLY_DAYS = 7;
export const RFI_URGENT_REPLY_DAYS = 2;

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** The default reply-by date for an RFI raised on a day. */
export const rfiReplyBy = (raisedOn: string, priority: RfiPriority) => addDays(raisedOn, priority === 'URGENT' ? RFI_URGENT_REPLY_DAYS : RFI_DEFAULT_REPLY_DAYS);

export interface RfiAge {
  /** Days from raised to answered, or to today while open */
  daysOpen: number;
  /** Open and past its reply-by date */
  overdue: boolean;
  /** Days past the reply-by date while open (0 when not overdue) */
  daysOverdue: number;
  /** Days the answer took against the reply-by date: negative = early; null until answered */
  answeredLateBy: number | null;
}

/** How long an RFI has been, or was, waiting for its answer. */
export function rfiAge(r: { status: RfiStatus; raisedOn: string; replyBy: string; answeredOn: string | null }, today: string): RfiAge {
  const end = r.answeredOn ?? (r.status === 'OPEN' ? today : r.raisedOn);
  const waiting = r.status === 'OPEN';
  const daysOverdue = waiting ? Math.max(0, daysBetween(r.replyBy, today)) : 0;
  return {
    daysOpen: Math.max(0, daysBetween(r.raisedOn, end)),
    overdue: daysOverdue > 0,
    daysOverdue,
    answeredLateBy: r.answeredOn ? daysBetween(r.replyBy, r.answeredOn) : null,
  };
}

/** Ageing buckets for open RFIs, in days past the reply-by date. */
export const RFI_AGE_BUCKETS = [
  { key: 'onTime', label: 'Not yet due', min: -Infinity, max: 0 },
  { key: 'upTo7', label: '1 to 7 days late', min: 1, max: 7 },
  { key: 'upTo30', label: '8 to 30 days late', min: 8, max: 30 },
  { key: 'over30', label: 'Over 30 days late', min: 31, max: Infinity },
] as const;
export type RfiAgeBucket = (typeof RFI_AGE_BUCKETS)[number]['key'];
export const rfiAgeBucket = (daysOverdue: number): RfiAgeBucket => RFI_AGE_BUCKETS.find((b) => daysOverdue >= b.min && daysOverdue <= b.max)!.key;

export interface RfiDto {
  id: string;
  rfiNo: string;
  projectId: string;
  projectName: string;
  subject: string;
  question: string;
  /** What we suggest, so the client can just agree */
  proposal: string | null;
  location: string | null;
  priority: RfiPriority;
  status: RfiStatus;
  /** Addressed to (the client's engineer or the consultant, as written) */
  toParty: string;
  raisedOn: string;
  replyBy: string;
  documentId: string | null;
  documentLabel: string | null;
  boqItemId: string | null;
  boqItemLabel: string | null;
  /** Expected when raised: the answer may change cost or time */
  costImpact: boolean;
  timeImpact: boolean;
  answer: string | null;
  answeredOn: string | null;
  /** Who answered: the guest user's name, or as recorded from a letter */
  answeredByName: string | null;
  /** True when the client's engineer or consultant answered in their portal */
  answeredInPortal: boolean;
  /** Their letter or mail reference, when recorded by staff */
  answerRef: string | null;
  closedOn: string | null;
  closeNote: string | null;
  variationId: string | null;
  variationLabel: string | null;
  riskId: string | null;
  riskNo: string | null;
  raisedById: string;
  raisedByName: string;
  age: RfiAge;
  attachments: AttachmentDto[];
  createdAt: string;
  updatedAt: string;
}

export interface RfiSummaryDto {
  open: number;
  overdue: number;
  /** Answered but not yet closed: someone has to act on the answer */
  answered: number;
  urgentOpen: number;
  /** Average days to answer over the RFIs answered in the last 90 days; null with none */
  avgDaysToAnswer: number | null;
  ageing: Record<RfiAgeBucket, number>;
}

/** An RFI as the client's engineer or consultant sees it in the portal (nothing about our cost or delays). */
export interface PortalRfiDto {
  id: string;
  rfiNo: string;
  subject: string;
  question: string;
  proposal: string | null;
  location: string | null;
  priority: RfiPriority;
  status: RfiStatus;
  raisedOn: string;
  replyBy: string;
  documentLabel: string | null;
  boqItemLabel: string | null;
  answer: string | null;
  answeredOn: string | null;
  answeredByName: string | null;
  raisedByName: string;
  age: RfiAge;
  attachments: AttachmentDto[];
}
