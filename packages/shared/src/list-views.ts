// Views that fit the data (ARCHITECTURE "Views that fit the data"): a list is a table by default, a pipeline is a board
// with a count and rupees on each stage, and a record a site files each day is a grid of sites by days, where a day
// with nothing filed is an empty cell anyone can see. Pure, so the web and the tests read them the same way.

import { toNumber } from './numbers';

/** How a list is shown: rows, a board of stages, or sites by days. */
export type ListViewKind = 'table' | 'board' | 'days';

export const LIST_VIEW_LABELS: Record<ListViewKind, string> = {
  table: 'Table',
  board: 'Board',
  days: 'Days',
};

/** A stage of a pipeline, in the pipeline's order. */
export interface BoardStage {
  key: string;
  label: string;
}

/** One column of a board: its stage, the rows in it in the order they came, how many and the rupees in them. */
export interface BoardColumn<T> extends BoardStage {
  rows: T[];
  count: number;
  /** The rupees in the column, as a string with two decimals; null when the board has no amounts. */
  amount: string | null;
}

/**
 * Rows laid out by stage. A row whose stage is not on the board (a draft, a cancelled entry) is left off; the board says
 * where things stand in the pipeline, the table holds the rest. Every stage gets its column, empty or not, so a stage
 * with nothing in it reads as nothing rather than as missing.
 */
export function boardColumns<T>(
  rows: readonly T[],
  stages: readonly BoardStage[],
  stageOf: (row: T) => string | null | undefined,
  amountOf?: (row: T) => string | number | null | undefined,
): BoardColumn<T>[] {
  const byStage = new Map<string, T[]>(stages.map((s) => [s.key, []]));
  for (const row of rows) {
    const key = stageOf(row);
    if (key) byStage.get(key)?.push(row);
  }
  return stages.map((s) => {
    const inStage = byStage.get(s.key)!;
    const amount = amountOf ? inStage.reduce((n, r) => n + toNumber(amountOf(r) ?? 0), 0) : null;
    return { ...s, rows: inStage, count: inStage.length, amount: amount === null ? null : amount.toFixed(2) };
  });
}

/** `days` dates ending on `last`, oldest first, as YYYY-MM-DD. */
export function dayColumns(last: string, days: number): string[] {
  const end = new Date(`${last}T00:00:00Z`).getTime();
  return Array.from({ length: days }, (_, i) => new Date(end - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10));
}

/** A site in the grid: its entries by day, and the days it has none for. */
export interface DayGridRow<P, T> {
  place: P;
  cells: Record<string, T[]>;
  /** Days in the grid with nothing filed. */
  missing: number;
}

/**
 * Sites by days: every place gets a row, whether it filed or not, and every day a cell, so a site that did not report
 * shows as a run of empty cells instead of being absent from the list. Places that missed the most days lead, then the
 * order they came in; entries outside the days or for a place not given are left out.
 */
export function dayGrid<P, T>(
  rows: readonly T[],
  opts: { places: readonly P[]; placeKey: (place: P) => string; days: readonly string[]; placeOf: (row: T) => string; dayOf: (row: T) => string },
): DayGridRow<P, T>[] {
  const index = new Map(opts.places.map((p, i) => [opts.placeKey(p), i]));
  const grid = opts.places.map((place) => ({ place, cells: Object.fromEntries(opts.days.map((d) => [d, [] as T[]])) as Record<string, T[]>, missing: 0 }));
  for (const row of rows) {
    const i = index.get(opts.placeOf(row));
    const cell = i === undefined ? undefined : grid[i].cells[opts.dayOf(row).slice(0, 10)];
    cell?.push(row);
  }
  for (const r of grid) r.missing = opts.days.filter((d) => r.cells[d].length === 0).length;
  return grid
    .map((r, i) => ({ r, i }))
    .sort((a, b) => b.r.missing - a.r.missing || a.i - b.i)
    .map((x) => x.r);
}
