/**
 * Design and drawings part 3 (ARCHITECTURE "Design and drawings"): controlled copies of drawings, what a new
 * revision changes, and the design dashboard by project. Site builds from the paper in its hands, so every print issued as
 * a controlled copy is numbered to its holder, and when a later revision supersedes it the old print is recalled. A new
 * revision also reopens what was done on the old one: quantities taken off, approvals, open marks and questions.
 * Everything here is pure.
 */
import { daysBetween } from './maintenance';
import { BUILDABLE_STATUSES, type RevisionStatus } from './documents';

/** A superseded copy not back within this many days of the new revision is late to recall. */
export const RECALL_DAYS = 7;

export const COPY_DISPOSALS = ['RETURNED', 'DESTROYED', 'LOST'] as const;
export type CopyDisposal = (typeof COPY_DISPOSALS)[number];
export const COPY_DISPOSAL_LABELS: Record<CopyDisposal, string> = { RETURNED: 'Returned', DESTROYED: 'Destroyed on site', LOST: 'Reported lost' };

export type CopyState = 'IN_FORCE' | 'TO_RECALL' | 'CLOSED';
export const COPY_STATE_LABELS: Record<CopyState, string> = { IN_FORCE: 'In force', TO_RECALL: 'Superseded, to recall', CLOSED: 'Taken back' };

/** CC-03: the copy number printed and stamped on the sheet. */
export const copyLabel = (n: number) => `CC-${String(n).padStart(2, '0')}`;

/** A copy is in force while it is the document's current revision, to recall once a later revision supersedes it, closed once back. */
export function copyState(c: { revisionId: string; disposedOn: string | null }, currentRevisionId: string | null): CopyState {
  if (c.disposedOn) return 'CLOSED';
  return currentRevisionId && c.revisionId !== currentRevisionId ? 'TO_RECALL' : 'IN_FORCE';
}

/** Days a superseded copy has been out since the revision that superseded it was issued; null when it is not to recall. */
export function recallDays(state: CopyState, supersededOn: string | null, today: string): number | null {
  if (state !== 'TO_RECALL' || !supersededOn) return null;
  return Math.max(0, daysBetween(supersededOn, today));
}
export const recallLate = (days: number | null) => days !== null && days > RECALL_DAYS;

/**
 * The copy numbers for new holders of a document: a holder who already had a copy keeps its number (the print is replaced
 * by the new revision), anyone else takes the next free number.
 */
export function copyNumbersFor(holders: string[], existing: { holder: string; copyNo: number }[]): { holder: string; copyNo: number }[] {
  const key = (h: string) => h.trim().toLowerCase().replace(/\s+/g, ' ');
  const known = new Map<string, number>();
  for (const e of existing) if (!known.has(key(e.holder))) known.set(key(e.holder), e.copyNo);
  let next = Math.max(0, ...existing.map((e) => e.copyNo)) + 1;
  return holders.map((holder) => {
    const n = known.get(key(holder));
    if (n !== undefined) return { holder: holder.trim(), copyNo: n };
    known.set(key(holder), next);
    return { holder: holder.trim(), copyNo: next++ };
  });
}

/** Why copies cannot be issued: no holder, a holder twice, a holder who already has this revision, or a revision site may not build from. */
export function issueCopiesProblem(r: { holders: string[]; status: RevisionStatus; current: boolean; holdersInForce: string[] }): string | null {
  const names = r.holders.map((h) => h.trim()).filter(Boolean);
  if (!names.length) return 'Name who gets a copy';
  const key = (h: string) => h.toLowerCase().replace(/\s+/g, ' ');
  const seen = new Set<string>();
  for (const n of names) {
    if (seen.has(key(n))) return `${n} is named twice`;
    seen.add(key(n));
  }
  if (!r.current) return 'Only the current revision is issued as a controlled copy';
  if (!BUILDABLE_STATUSES.includes(r.status)) return 'A controlled copy is of a revision site may build from (good for construction or approved). Send others for information on a transmittal.';
  const has = new Set(r.holdersInForce.map(key));
  const dup = names.find((n) => has.has(key(n)));
  return dup ? `${dup} already holds a copy of this revision` : null;
}

export function disposeCopyProblem(r: { issuedOn: string; disposedOn: string; today: string; alreadyOn: string | null }): string | null {
  if (r.alreadyOn) return 'This copy is already taken back';
  if (r.disposedOn > r.today) return 'The day it came back cannot be after today';
  if (r.disposedOn < r.issuedOn) return 'The day it came back cannot be before the day it was issued';
  return null;
}

// What a new revision changes

export type ImpactKey = 'copies' | 'submissions' | 'takeoffs' | 'markups' | 'rfis' | 'schedule' | 'deliverables';
export type ImpactTone = 'danger' | 'warning' | 'info';

export interface RevisionImpactFacts {
  revision: string;
  status: RevisionStatus;
  /** The revision it superseded, if any */
  previous: string | null;
  /** Copies of earlier revisions still out */
  copiesToRecall: { holder: string; copyNo: number; revision: string }[];
  /** Copies of this revision issued */
  copiesIssued: number;
  /** Design submissions that sent an earlier revision and were approved: the new one is not approved yet */
  approvedEarlier: { id: string; submissionNo: string; revision: string }[];
  /** Submissions under review with an earlier revision of this document */
  underReviewEarlier: { id: string; submissionNo: string; revision: string }[];
  /** Quantity take-offs measured on earlier revisions */
  takeoffsEarlier: number;
  /** Marks on earlier revisions still open (carried to this one) */
  openMarkups: number;
  /** Open RFIs on the document */
  openRfis: number;
  /** Lines of the drawing schedule this document answers */
  scheduleLines: number;
  /** EPC deliverables that follow this document */
  deliverables: number;
}

export interface RevisionImpactItem {
  key: ImpactKey;
  tone: ImpactTone;
  count: number;
  text: string;
  /** Ids the screen links to (submission ids for `submissions`) */
  ids?: string[];
}

const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
const listOf = (xs: string[], max = 3) => (xs.length <= max ? xs.join(', ') : `${xs.slice(0, max).join(', ')} and ${xs.length - max} more`);

/** What to do because this revision came in, most pressing first; nothing when it is the first revision and nothing hangs on it. */
export function revisionImpact(f: RevisionImpactFacts): RevisionImpactItem[] {
  const out: RevisionImpactItem[] = [];
  const buildable = BUILDABLE_STATUSES.includes(f.status);
  if (f.copiesToRecall.length) {
    const revs = [...new Set(f.copiesToRecall.map((c) => c.revision))];
    out.push({
      key: 'copies',
      tone: 'danger',
      count: f.copiesToRecall.length,
      text: `Recall ${n(f.copiesToRecall.length, 'controlled copy', 'controlled copies')} of ${revs.join(', ')}: ${listOf(f.copiesToRecall.map((c) => `${copyLabel(c.copyNo)} ${c.holder}`))}.${buildable && !f.copiesIssued ? ` Issue ${f.revision} in their place.` : ''}`,
    });
  } else if (buildable && f.previous && !f.copiesIssued) {
    out.push({ key: 'copies', tone: 'info', count: 0, text: `No controlled copy of ${f.revision} issued yet.` });
  }
  if (f.approvedEarlier.length && f.status !== 'APPROVED' && f.status !== 'APPROVED_WITH_COMMENTS') {
    out.push({
      key: 'submissions',
      tone: 'warning',
      count: f.approvedEarlier.length,
      ids: f.approvedEarlier.map((s) => s.id),
      text: `Approved earlier at ${listOf(f.approvedEarlier.map((s) => `${s.revision} (${s.submissionNo})`))}; send ${f.revision} for approval if the change needs it.`,
    });
  }
  if (f.underReviewEarlier.length) {
    out.push({
      key: 'submissions',
      tone: 'warning',
      count: f.underReviewEarlier.length,
      ids: f.underReviewEarlier.map((s) => s.id),
      text: `${listOf(f.underReviewEarlier.map((s) => s.submissionNo))} is with the reviewer at ${listOf([...new Set(f.underReviewEarlier.map((s) => s.revision))])}; tell them ${f.revision} replaces it.`,
    });
  }
  if (f.takeoffsEarlier) out.push({ key: 'takeoffs', tone: 'warning', count: f.takeoffsEarlier, text: `${n(f.takeoffsEarlier, 'quantity take-off')} measured on an earlier revision: check the quantities against ${f.revision}.` });
  if (f.openMarkups) out.push({ key: 'markups', tone: 'info', count: f.openMarkups, text: `${n(f.openMarkups, 'open mark')} from earlier revisions carried to ${f.revision}: close those it answers.` });
  if (f.openRfis) out.push({ key: 'rfis', tone: 'info', count: f.openRfis, text: `${n(f.openRfis, 'open RFI')} on this drawing: see whether ${f.revision} answers ${f.openRfis === 1 ? 'it' : 'them'}.` });
  if (f.deliverables && f.previous) out.push({ key: 'deliverables', tone: 'info', count: f.deliverables, text: `Follows ${n(f.deliverables, 'EPC deliverable')}, whose revision and status move with the register.` });
  return out;
}

// The design dashboard

export interface DesignProjectRow {
  projectId: string;
  projectCode: string;
  projectName: string;
  /** Drawing schedule: awaited and not yet buildable, and those past their day */
  drawingsAwaited: number;
  drawingsLate: number;
  /** Design submissions with the reviewer, past the reply date, and back with us (C or D) */
  underReview: number;
  reviewsLate: number;
  withUs: number;
  commentsToAnswer: number;
  /** Controlled copies out of an earlier revision, and those out longer than RECALL_DAYS */
  copiesToRecall: number;
  recallsLate: number;
  /** Built from, no as-built revision */
  asBuiltDue: number;
  rfisOpen: number;
  /** Revisions received in the last 30 days */
  revisionsRecent: number;
}

export type DesignTotals = Omit<DesignProjectRow, 'projectId' | 'projectCode' | 'projectName'>;

export const DESIGN_TOTAL_KEYS: (keyof DesignTotals)[] = [
  'drawingsAwaited', 'drawingsLate', 'underReview', 'reviewsLate', 'withUs', 'commentsToAnswer', 'copiesToRecall', 'recallsLate', 'asBuiltDue', 'rfisOpen', 'revisionsRecent',
];

export function designTotals(rows: DesignProjectRow[]): DesignTotals {
  const t = Object.fromEntries(DESIGN_TOTAL_KEYS.map((k) => [k, 0])) as DesignTotals;
  for (const r of rows) for (const k of DESIGN_TOTAL_KEYS) t[k] += r[k];
  return t;
}

/** A project's design notes, worst first: what holds up site, then what waits on us. */
export function designNotes(r: DesignTotals): { tone: ImpactTone; text: string }[] {
  const out: { tone: ImpactTone; text: string }[] = [];
  if (r.drawingsLate) out.push({ tone: 'danger', text: `${n(r.drawingsLate, 'drawing')} late` });
  if (r.recallsLate) out.push({ tone: 'danger', text: `${n(r.recallsLate, 'superseded copy', 'superseded copies')} still on site` });
  if (r.reviewsLate) out.push({ tone: 'warning', text: `${n(r.reviewsLate, 'review')} past the reply date` });
  if (r.withUs) out.push({ tone: 'warning', text: `${n(r.withUs, 'submission')} to revise` });
  if (r.commentsToAnswer) out.push({ tone: 'warning', text: `${n(r.commentsToAnswer, 'comment')} to answer` });
  if (r.copiesToRecall > r.recallsLate) out.push({ tone: 'info', text: `${n(r.copiesToRecall - r.recallsLate, 'copy', 'copies')} to recall` });
  if (r.asBuiltDue) out.push({ tone: 'info', text: `${n(r.asBuiltDue, 'as-built')} due` });
  return out;
}

/** A row worth showing: anything open at all. */
export const designRowHasWork = (r: DesignTotals) => DESIGN_TOTAL_KEYS.some((k) => k !== 'revisionsRecent' && r[k] > 0) || r.revisionsRecent > 0;

// DTOs

export interface ControlledCopyDto {
  id: string;
  projectId: string;
  projectName: string;
  documentId: string;
  docNo: string;
  title: string;
  revisionId: string;
  revision: string;
  /** The document's current revision, when this copy is not of it */
  currentRevision: string | null;
  copyNo: number;
  holder: string;
  issuedOn: string;
  issuedByName: string;
  transmittalId: string | null;
  transmittalNo: string | null;
  state: CopyState;
  supersededOn: string | null;
  recallDays: number | null;
  recallLate: boolean;
  disposedOn: string | null;
  disposal: CopyDisposal | null;
  disposalNote: string | null;
}

export interface ControlledCopyListDto {
  items: ControlledCopyDto[];
  total: number;
  counts: { inForce: number; toRecall: number; recallsLate: number; holders: number };
}

export interface RevisionImpactDto {
  documentId: string;
  docNo: string;
  revisionId: string | null;
  revision: string | null;
  previous: string | null;
  items: RevisionImpactItem[];
  copies: ControlledCopyDto[];
}

export interface RecentRevisionDto {
  documentId: string;
  docNo: string;
  title: string;
  projectId: string;
  projectName: string;
  revision: string;
  status: RevisionStatus;
  issuedOn: string;
  previous: string | null;
  items: RevisionImpactItem[];
}

export interface DesignDashboardDto {
  date: string;
  totals: DesignTotals;
  projects: (DesignProjectRow & { notes: { tone: ImpactTone; text: string }[] })[];
  recent: RecentRevisionDto[];
}
