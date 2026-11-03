import { COST_HEADS, type CostHead } from './cost';

/**
 * Opening cost (ARCHITECTURE "Opening cost"): a project that was running before it came on Nirmaan carries the cost it
 * had run up by then, by head, and the work done by then, both dated on the day it came on. Cost to date, margin, the
 * budget forecast and the cash-flow forecast count it from that day; a project that ran before and has none is flagged,
 * because its cost leaves out everything spent before. Pure, tested in `apps/api/src/scripts/project-opening-test.ts`.
 */

/** A project that started this many days or fewer before it was entered started on Nirmaan: it needs no opening cost. */
export const OPENING_GRACE_DAYS = 30;

const dayNo = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 86_400_000;

/** Whether the project ran before it came on Nirmaan: its start more than `OPENING_GRACE_DAYS` before the day it was entered. */
export function ranBeforeNirmaan(startDate: string | null, enteredOn: string): boolean {
  return !!startDate && dayNo(enteredOn) - dayNo(startDate) > OPENING_GRACE_DAYS;
}

/** Whether the project's cost leaves out what it spent before it came on: it ran before and no opening cost is recorded. */
export function openingMissing(f: { type: string; startDate: string | null; enteredOn: string; hasOpening: boolean }): boolean {
  return f.type !== 'STORE' && f.type !== 'PLANT' && !f.hasOpening && ranBeforeNirmaan(f.startDate, f.enteredOn);
}

export interface ProjectOpeningInput {
  /** The day the figures stand at, YYYY-MM-DD */
  asOf: string | null | undefined;
  heads: Partial<Record<CostHead, string | number | null>>;
  /** Value of the work done by then; null or empty when not known */
  workDone?: string | number | null;
}

const amountOf = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? 0 : Number(v));

/** What is wrong with an opening cost, in words that say how to fix it, or null. */
export function openingProblem(v: ProjectOpeningInput, project: { startDate: string | null }, today: string): string | null {
  if (!v.asOf || !/^\d{4}-\d{2}-\d{2}$/.test(v.asOf)) return 'Choose the date the figures stand at';
  if (v.asOf > today) return 'The figures cannot stand at a date after today';
  if (project.startDate && v.asOf < project.startDate) return 'The figures cannot stand at a date before the project started';
  for (const h of COST_HEADS) {
    const n = amountOf(v.heads[h]);
    if (!Number.isFinite(n)) return 'Enter each cost as an amount in rupees';
    if (n < 0) return 'A cost cannot be negative';
  }
  const work = amountOf(v.workDone);
  if (!Number.isFinite(work) || work < 0) return 'Enter the work done as an amount of zero or more';
  return null;
}

/** The opening cost's total over the heads. */
export const openingTotal = (heads: Partial<Record<CostHead, string | number | null>>) => COST_HEADS.reduce((s, h) => s + amountOf(heads[h]), 0);

/** Where a project's spending to come is read from in the cash-flow forecast: its budget, else its cost to date against what it has billed. */
export type SpendBasis = { kind: 'budget' } | { kind: 'costRatio'; ratio: number } | { kind: 'none'; why: 'noBilling' | 'openingMissing' | 'ratioOff' };

/** Cost to date above this share of billing to date says the records are not to be read as a cost ratio. */
export const COST_RATIO_MAX = 1.5;

/**
 * How the spending still to come is forecast. A project with a budget spends its budget for the work left. One without
 * spends at its cost to date against its billing to date (both including the opening cost), but only when that ratio
 * means something: something billed, no opening cost missing, and the ratio not past `COST_RATIO_MAX`. Otherwise
 * neither its billing nor its spending to come is forecast, so the forecast never shows money in with nothing going out.
 */
export function spendBasis(f: { hasBudget: boolean; costToDate: number; billedToDate: number; openingMissing: boolean }): SpendBasis {
  if (f.hasBudget) return { kind: 'budget' };
  if (f.openingMissing) return { kind: 'none', why: 'openingMissing' };
  if (f.billedToDate <= 0) return { kind: 'none', why: 'noBilling' };
  const ratio = f.costToDate / f.billedToDate;
  if (!(ratio > 0) || ratio > COST_RATIO_MAX) return { kind: 'none', why: 'ratioOff' };
  return { kind: 'costRatio', ratio: Math.round(ratio * 10_000) / 10_000 };
}

/** One project's opening cost, as the Budget tab shows and edits it. */
export interface ProjectOpeningDto {
  projectId: string;
  projectCode: string;
  startDate: string | null;
  /** The day the project was entered on Nirmaan */
  enteredOn: string;
  /** It started more than `OPENING_GRACE_DAYS` before it was entered */
  ranBefore: boolean;
  /** It ran before and has no opening cost: its cost and margin leave out what it spent before */
  missing: boolean;
  /** null when none is recorded */
  opening: {
    asOf: string;
    heads: Record<CostHead, string>;
    total: string;
    workDone: string | null;
    notes: string | null;
    updatedAt: string;
    updatedByName: string;
  } | null;
}
