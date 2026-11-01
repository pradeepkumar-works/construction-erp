// How a list's columns read (ARCHITECTURE "Tables that answer"): one money scale for a whole column, and which columns a
// table of a given width leaves out by default. Pure, so the web's DataTable, print and the tests read them the same way.

import { RUPEE, formatINR, toNumber } from './numbers';

/** The unit a money column is written in: whole rupees, lakh or crore. */
export type MoneyScale = 'rupees' | 'lakh' | 'crore';

const LAKH = 1e5;
const CRORE = 1e7;

/**
 * One scale for every figure in a column, so ₹ 63 lakh and ₹ 6.3 crore are told apart by their digits, not by a unit that
 * changes from row to row. The largest unit in which the smallest figure still reads with two decimals: crore when every
 * figure is ₹ 10 lakh or more, lakh when every figure is ₹ 1,000 or more and one reaches a lakh, else whole rupees.
 * Zeros and blanks do not count.
 */
export function moneyScale(values: readonly (string | number | null | undefined)[]): MoneyScale {
  const sizes = values
    .filter((v) => v !== null && v !== undefined && v !== '')
    .map((v) => Math.abs(toNumber(v)))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!sizes.length) return 'rupees';
  const least = Math.min(...sizes);
  const most = Math.max(...sizes);
  if (least >= CRORE / 10 && most >= CRORE) return 'crore';
  if (least >= 1000 && most >= LAKH) return 'lakh';
  return 'rupees';
}

const fixed2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A figure in its column's scale: "₹ 6.32 Cr", "₹ 63.20 L", "₹ 85,000"; the exact figure stays `formatINR`. */
export function formatInScale(value: string | number | null | undefined, scale: MoneyScale): string {
  const n = toNumber(value);
  if (scale === 'crore') return `${RUPEE}${fixed2.format(n / CRORE)} Cr`;
  if (scale === 'lakh') return `${RUPEE}${fixed2.format(n / LAKH)} L`;
  return formatINR(n);
}

/** A column as the fit sees it: its width (px) and, for one that may be left out, the width it first showed from. */
export interface FitColumn {
  key: string;
  width: number;
  /** Left out first when the table is narrow; a larger number goes before a smaller one. None: always kept. */
  dropFrom?: number;
}

/**
 * Which columns a table `available` px wide leaves out of its default view so the rest fit without sideways scrolling:
 * the droppable ones, largest `dropFrom` first (the later of two equals first), until the kept widths fit. A table whose
 * kept columns still do not fit scrolls; it never drops a column that has no `dropFrom`.
 */
export function columnsToDrop(columns: readonly FitColumn[], available: number): string[] {
  let width = columns.reduce((n, c) => n + c.width, 0);
  if (width <= available) return [];
  const order = columns
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.dropFrom !== undefined)
    .sort((a, b) => b.c.dropFrom! - a.c.dropFrom! || b.i - a.i);
  const dropped: string[] = [];
  for (const { c } of order) {
    if (width <= available) break;
    dropped.push(c.key);
    width -= c.width;
  }
  return dropped;
}
