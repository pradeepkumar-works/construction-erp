/**
 * PPE register: personal protective equipment handed to named workers at a project, when it is due for replacement,
 * and who is on site without the kit the project requires. An issue stays ISSUED while the worker has it; returning
 * it, losing it, or issuing the same kind again (REPLACED) closes it.
 */
import type { PpeIssueStatus, PpeKind } from './enums';

/** Kit every worker at a new project must have; a project can change its own list. */
export const DEFAULT_PPE_REQUIRED: PpeKind[] = ['HELMET', 'SAFETY_SHOES', 'REFLECTIVE_JACKET'];

/** Days an item usually lasts before it is replaced; sets the replace-by date on an issue. */
export const PPE_LIFE_DAYS: Record<PpeKind, number> = {
  HELMET: 730,
  SAFETY_SHOES: 365,
  REFLECTIVE_JACKET: 365,
  GLOVES: 30,
  SAFETY_HARNESS: 730,
  GOGGLES: 180,
  EAR_PROTECTION: 90,
  DUST_MASK: 7,
  GUMBOOTS: 180,
};

/** The replace-by date for a kind issued on a day (YYYY-MM-DD). */
export function ppeReplaceBy(kind: PpeKind, issuedOn: string): string {
  const d = new Date(`${issuedOn}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + PPE_LIFE_DAYS[kind]);
  return d.toISOString().slice(0, 10);
}

export interface PpeHolding {
  kind: PpeKind;
  issueId: string;
  issuedOn: string;
  replaceBy: string | null;
  /** Past its replace-by date */
  due: boolean;
}

/** What a worker lacks of the required kit, and which of what they hold is due, from their open issues. */
export function ppeGaps(required: readonly PpeKind[], open: { id: string; kind: PpeKind; issuedOn: string; replaceBy: string | null }[], today: string): { holding: PpeHolding[]; missing: PpeKind[]; due: PpeKind[] } {
  // The newest open issue of each kind counts (an older one left open is a record to tidy, not a second helmet).
  const newest = new Map<PpeKind, (typeof open)[number]>();
  for (const o of open) {
    const had = newest.get(o.kind);
    if (!had || o.issuedOn > had.issuedOn) newest.set(o.kind, o);
  }
  const holding: PpeHolding[] = [...newest.values()].map((o) => ({ kind: o.kind, issueId: o.id, issuedOn: o.issuedOn, replaceBy: o.replaceBy, due: !!o.replaceBy && o.replaceBy < today }));
  return {
    holding,
    missing: required.filter((k) => !newest.has(k)),
    due: holding.filter((h) => h.due).map((h) => h.kind),
  };
}

export interface PpeIssueDto {
  id: string;
  projectId: string;
  projectName: string;
  workerId: string;
  workerNo: string;
  workerName: string;
  contractor: string;
  trade: string;
  kind: PpeKind;
  size: string | null;
  issuedOn: string;
  replaceBy: string | null;
  status: PpeIssueStatus;
  /** Open and past its replace-by date */
  dueForReplacement: boolean;
  closedOn: string | null;
  closeNote: string | null;
  /** To be recovered from the labour contractor (lost, or kept when the worker left) */
  recoverable: boolean;
  note: string | null;
  issuedById: string;
  issuedByName: string;
  closedByName: string | null;
  createdAt: string;
}

export interface PpeWorkerDto {
  workerId: string;
  workerNo: string;
  name: string;
  contractor: string;
  trade: string;
  /** From today's roll call: true present or half day, false absent, null not marked */
  presentToday: boolean | null;
  holding: PpeHolding[];
  missing: PpeKind[];
}

export interface PpeContractorDto {
  contractor: string;
  workers: number;
  /** Workers without all of the required kit */
  missingAny: number;
  /** Items lost or kept, all time at this project */
  recoverable: number;
}

export interface PpeRegisterDto {
  projectId: string;
  projectCode: string;
  projectName: string;
  required: PpeKind[];
  today: string;
  /** Whether a roll call was taken today (else presentToday is null for everyone) */
  rollCallToday: boolean;
  workers: PpeWorkerDto[];
  counts: {
    workers: number;
    fullyKitted: number;
    missingAny: number;
    /** On site today without all of the required kit */
    presentMissing: number;
    /** Items held past their replace-by date */
    dueForReplacement: number;
    lostThisYear: number;
  };
  byContractor: PpeContractorDto[];
  /** Kit still out with workers who have left or moved to another project: take it back or mark it lost */
  leftWithKit: { issueId: string; workerName: string; workerNo: string; contractor: string; kind: PpeKind; issuedOn: string }[];
  canIssue: boolean;
  canSetRequired: boolean;
}

export interface PpeIssueResultDto {
  /** Items issued (one per worker and kind) */
  issued: number;
  /** Open issues the new ones replaced */
  replaced: number;
}
