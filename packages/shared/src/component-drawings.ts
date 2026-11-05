/**
 * Drawings by component (ARCHITECTURE "Design and drawings"): each component of a project (a top-level work element, such
 * as the intake well or the treatment plant) with its drawings by discipline and where their approval stands, the
 * construction programme's drawing matrix. A drawing belongs to a component by `Document.workElementId`; the approval is
 * the latest submittal that sends any of the component's drawings. Everything here is pure.
 */
import { BUILDABLE_STATUSES, type DocumentDiscipline, type RevisionStatus } from './documents';
import type { DesignCode, DesignPurpose, DesignSubmissionStatus } from './design-submissions';

/** Approved for construction: every drawing buildable. Else the latest submittal's place, or not sent yet. */
export const COMPONENT_STATES = ['AFC', 'UNDER_REVIEW', 'BACK_WITH_US', 'NOT_SENT', 'NO_DRAWINGS'] as const;
export type ComponentState = (typeof COMPONENT_STATES)[number];
export const COMPONENT_STATE_LABELS: Record<ComponentState, string> = {
  AFC: 'AFC',
  UNDER_REVIEW: 'Under review',
  BACK_WITH_US: 'Back with us',
  NOT_SENT: 'Not sent',
  NO_DRAWINGS: 'No drawings',
};

/** Where a component's drawings stand: AFC once each is buildable, else as its latest submittal stands. */
export function componentState(drawings: { revisionStatus: RevisionStatus | null }[], review: { status: DesignSubmissionStatus } | null): ComponentState {
  if (!drawings.length) return 'NO_DRAWINGS';
  if (drawings.every((d) => d.revisionStatus && BUILDABLE_STATUSES.includes(d.revisionStatus))) return 'AFC';
  if (review?.status === 'UNDER_REVIEW') return 'UNDER_REVIEW';
  if (review?.status === 'REVISE_RESUBMIT' || review?.status === 'REJECTED') return 'BACK_WITH_US';
  return 'NOT_SENT';
}

export interface ComponentTotals {
  /** Components with at least one drawing */
  components: number;
  afc: number;
  underReview: number;
  backWithUs: number;
  notSent: number;
  /** Drawings in all, and those buildable */
  drawings: number;
  drawingsAfc: number;
}

export function componentTotals(rows: { state: ComponentState; drawings: { revisionStatus: RevisionStatus | null }[] }[]): ComponentTotals {
  const count = (s: ComponentState) => rows.filter((r) => r.state === s).length;
  const all = rows.flatMap((r) => r.drawings);
  return {
    components: rows.filter((r) => r.state !== 'NO_DRAWINGS').length,
    afc: count('AFC'),
    underReview: count('UNDER_REVIEW'),
    backWithUs: count('BACK_WITH_US'),
    notSent: count('NOT_SENT'),
    drawings: all.length,
    drawingsAfc: all.filter((d) => d.revisionStatus && BUILDABLE_STATUSES.includes(d.revisionStatus)).length,
  };
}

/**
 * The review stages to show as columns: the stages of the components' submittals in the order they first come, so a
 * project whose submittals all go proof checker, TPIA, PIU, head office reads that way.
 */
export function stageColumns(reviews: ({ stages: string[] } | null)[]): string[] {
  const out: string[] = [];
  for (const r of reviews) for (const s of r?.stages ?? []) if (!out.includes(s)) out.push(s);
  return out;
}

/** The disciplines a project's drawings are in, in the register's order. */
export const disciplinesOf = (drawings: { discipline: DocumentDiscipline }[], order: readonly DocumentDiscipline[]) => order.filter((d) => drawings.some((x) => x.discipline === d));

export interface ComponentDrawingDto {
  documentId: string;
  docNo: string;
  title: string;
  discipline: DocumentDiscipline;
  revision: string | null;
  revisionStatus: RevisionStatus | null;
}

export interface ComponentReviewDto {
  submissionId: string;
  submissionNo: string;
  status: DesignSubmissionStatus;
  purpose: DesignPurpose;
  submittedOn: string | null;
  /** The stage it waits at, by name */
  waitingAt: string | null;
  daysLate: number | null;
  /** Each review stage of the latest round: the day it cleared (or sent it back) and its code */
  stages: { name: string; clearedOn: string | null; code: DesignCode | null }[];
  /** With no stages: the round's code and its day */
  code: DesignCode | null;
  reviewedOn: string | null;
}

export interface ComponentRowDto {
  /** Null for the drawings linked to no component */
  workElementId: string | null;
  code: string | null;
  name: string;
  drawings: ComponentDrawingDto[];
  review: ComponentReviewDto | null;
  state: ComponentState;
}

export interface ComponentDrawingsDto {
  projectId: string;
  disciplines: DocumentDiscipline[];
  stages: string[];
  rows: ComponentRowDto[];
  totals: ComponentTotals;
}
