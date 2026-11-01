import dayjs from 'dayjs';
import { formatMonthName, formatPct, todayDate } from '@/lib/format';

export interface Trend {
  values: number[];
  /** Change of this month on last month, in % (null when last month was nil or too small to compare with, and then not shown) */
  deltaPct: number | null;
  /** This month over last month, for a jump too big to read as a percentage */
  ratio: number | null;
  /** Last month's short name, e.g. "Sep" */
  previous: string;
  /** Whether more is good news (work done, billing, cash in) or not (cost) */
  upIsGood: boolean;
  /** Share of this month gone by (1 once it is over): a month under way is compared with last month's pace */
  elapsed: number;
}

/** Share of the month `month` (YYYY-MM) gone by on `today` (YYYY-MM-DD): 1 for a past month. */
export function monthElapsed(month: string, today = todayDate()): number {
  if (today.slice(0, 7) !== month) return 1;
  return dayjs(today).date() / dayjs(today).daysInMonth();
}

/**
 * Last six months of a series into a figure's trend: this month on last month. Last month is no base to compare with
 * when it was nil or under a tenth of the best month before it, so no percentage is shown then.
 */
export function trendOf(series: (string | number)[], months: string[], upIsGood = true, today?: string): Trend {
  const values = series.map(Number);
  const now = values[values.length - 1] ?? 0;
  const before = values[values.length - 2] ?? 0;
  const best = Math.max(0, ...values.slice(0, -1));
  const base = before > 0 && before >= best / 10;
  return {
    values,
    deltaPct: base ? Math.round(((now - before) / before) * 100) : null,
    ratio: base ? now / before : null,
    previous: formatMonthName(months[months.length - 2] ?? null),
    upIsGood,
    elapsed: monthElapsed(months[months.length - 1] ?? '', today),
  };
}

/**
 * Whether a trend is bad news worth colour: a move the wrong way of 10% or more. A fall in a month
 * still under way counts only when it is 10% or more behind last month's pace too, so the 3rd of the month is no alarm.
 */
export function isBadTrend(t: Trend): boolean {
  const delta = t.deltaPct;
  if (delta === null || delta === 0 || delta > 0 === t.upIsGood || Math.abs(delta) < 10) return false;
  if (delta > 0) return true;
  const now = t.values[t.values.length - 1] ?? 0;
  const before = t.values[t.values.length - 2] ?? 0;
  return now < before * t.elapsed * 0.9;
}

export function trendNote(t: Trend): string | null {
  const delta = t.deltaPct;
  if (delta === null) return null;
  if (delta >= 200 && t.ratio) return `${Math.round(t.ratio)}× ${t.previous}`;
  const soFar = t.elapsed < 1 && delta < 0 ? ' so far' : '';
  return `${formatPct(Math.abs(delta))} ${delta >= 0 ? 'up' : 'down'} on ${t.previous}${soFar}`;
}
