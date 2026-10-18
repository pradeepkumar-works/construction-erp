import type { CostHeadsDto, HomeTrendsDto } from '@erp/shared';
import { formatINRCompact, formatMonthShort, formatPct, toNumber } from '@/lib/format';

/**
 * The figures behind the home page's charts, in words and as rows (UX item 81, WCAG 1.1.1): each chart has a one-line
 * summary above it, which is also the drawing's accessible name, and a table of the same figures. Kept apart from
 * `charts.tsx` so the charting library stays in its own bundle.
 */

/** "2026-10" → "Oct 26" */
export const monthLabel = (m: string) => formatMonthShort(m);

export const COST_HEADS: [keyof Omit<CostHeadsDto, 'total'>, string][] = [
  ['material', 'Material'],
  ['subcontract', 'Subcontract'],
  ['labour', 'Labour'],
  ['machinery', 'Machinery'],
  ['expenses', 'Site expenses'],
];

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const months = (n: number) => (n === 1 ? 'month' : `${WORDS[n] ?? n} months`);

/** "Actual 41% against 48% planned in Oct 26" */
export function sCurveSummary(data: HomeTrendsDto['sCurve']): string {
  const now = [...data].reverse().find((p) => p.actual !== null);
  if (now) return `Actual ${formatPct(now.actual)} against ${formatPct(now.planned)} planned in ${monthLabel(now.month)}`;
  const last = data[data.length - 1];
  return last ? `No approved work yet, ${formatPct(last.planned)} planned by ${monthLabel(last.month)}` : 'Nothing planned yet';
}

export const sum = (values?: string[]) => (values ?? []).reduce((n, v) => n + toNumber(v), 0);

/** "₹ 1.20 Cr received and ₹ 96.00 L paid over the last six months" */
export function cashFlowSummary(trends: Pick<HomeTrendsDto, 'months' | 'cashIn' | 'cashOut'>): string {
  const parts = [trends.cashIn ? `${formatINRCompact(sum(trends.cashIn))} received` : null, trends.cashOut ? `${formatINRCompact(sum(trends.cashOut))} paid` : null].filter(Boolean);
  return `${parts.join(' and ')} over the last ${months(trends.months.length)}`;
}

export interface CostHeadRow {
  head: string;
  amount: number;
  share: number;
}

/** The heads with cost booked, largest first, with each one's share of the total. */
export function costHeadRows(heads: CostHeadsDto): CostHeadRow[] {
  const total = toNumber(heads.total);
  return COST_HEADS.map(([k, head]) => ({ head, amount: toNumber(heads[k]), share: total > 0 ? (toNumber(heads[k]) / total) * 100 : 0 }))
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

/** "Material is the largest head, 52% of ₹ 4.10 Cr" */
export function costByHeadSummary(heads: CostHeadsDto): string {
  const [top] = costHeadRows(heads);
  if (!top) return 'No cost booked';
  return `${top.head} is the largest head, ${formatPct(top.share)} of ${formatINRCompact(heads.total)}`;
}

/** Whether a series has nothing in it yet (every month nil): its chart says so in words instead of drawing zeros. */
export const allZero = (...series: (string[] | undefined)[]) => series.every((xs) => !xs || xs.every((v) => toNumber(v) === 0));
