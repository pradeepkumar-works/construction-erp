import { HEADCOUNT_GAP_MIN, HEADCOUNT_GAP_PCT, MANDAY_TOLERANCE_MIN, MANDAY_TOLERANCE_PCT, NO_PUNCH_MIN, type AttendanceSourcesDto } from '@erp/shared';

/**
 * Attendance cross-check: the arithmetic, as plain functions of what the site recorded, so each rule is
 * tested on its own (`src/scripts/attendance-check-test.ts`) and the bill check, the page and the watch list agree.
 */

export const addDays = (d: string, n: number) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

/** Every day from `from` to `to`, both included. */
export function daysOf(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** "Helpers", " helper " and "HELPER" are the same trade. */
export const normTrade = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/s$/, '');

/** Contractor names compare without case, dots or "Pvt Ltd". */
export const normName = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b(pvt|private|ltd|limited|co|m\/s)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * The trade a bill line is for, read from its description ("Helper (man-day)", "Masons for culverts"): the longest of
 * `trades` named in it as a word, plural or not. Null when it names none, and the line then stands for the whole crew.
 */
export function tradeOf(description: string, trades: string[]): string | null {
  const words = ` ${description.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  let best: string | null = null;
  for (const t of trades) {
    const n = normTrade(t);
    if (!n) continue;
    if ((words.includes(` ${n} `) || words.includes(` ${n}s `)) && (!best || n.length > normTrade(best).length)) best = t;
  }
  return best;
}

/** A bill covers the days after the bill before it (or from the work order's start) up to its own "measured up to". */
export function billSpan(prevUpTo: string | null, woStart: string | null, woDate: string, upTo: string): { from: string; to: string } {
  const from = prevUpTo ? addDays(prevUpTo, 1) : (woStart ?? woDate);
  return { from: from <= upTo ? from : upTo, to: upTo };
}

/** The most any record supports: the head count or the roll call (punches are a part of the roll call). */
export function supportedOf(s: AttendanceSourcesDto): number | null {
  const kept = [s.headCount, s.rollCall].filter((v): v is number => v !== null);
  return kept.length ? Math.max(...kept) : null;
}

/** How far a bill's man-days run above the records, and whether that is beyond rounding. */
export function billExcess(billed: number, s: AttendanceSourcesDto): { supported: number | null; excess: number; flagged: boolean } {
  const supported = supportedOf(s);
  if (supported === null) return { supported, excess: billed, flagged: billed > 0 };
  const excess = Math.round((billed - supported) * 10) / 10;
  return { supported, excess: Math.max(excess, 0), flagged: excess >= Math.max(MANDAY_TOLERANCE_MIN, (supported * MANDAY_TOLERANCE_PCT) / 100) };
}

/**
 * Workers on a day's roll call who did not punch: only those enrolled on a device, on a day the site's device took
 * punches from others of the same crew (a device that was down, or a crew not yet using it, proves nothing), flagged
 * from NO_PUNCH_MIN in a crew (one forgotten punch is not).
 */
export function unpunched<W extends { present: boolean; enrolled: boolean; punched: boolean }>(deviceUp: boolean, crew: W[]): { workers: W[]; flagged: boolean } {
  if (!deviceUp || !crew.some((w) => w.punched)) return { workers: [], flagged: false };
  const workers = crew.filter((w) => w.present && w.enrolled && !w.punched);
  return { workers, flagged: workers.length >= NO_PUNCH_MIN };
}

/** A head count above another record of the same day by HEADCOUNT_GAP_MIN heads and HEADCOUNT_GAP_PCT of the lower. */
export function headGap(headCount: number, other: number): { gap: number; flagged: boolean } {
  const gap = headCount - other;
  return { gap, flagged: gap >= Math.max(HEADCOUNT_GAP_MIN, (other * HEADCOUNT_GAP_PCT) / 100) };
}

/** Sum of a DPR's manpower JSON ([{ category, count }]), or null when it lists none. */
export function dprManpower(json: unknown): number | null {
  if (!Array.isArray(json) || !json.length) return null;
  let total = 0;
  for (const row of json) {
    const n = Number((row as { count?: unknown })?.count);
    if (Number.isFinite(n) && n > 0) total += n;
  }
  return total;
}

export const plural = (n: number, word: string) => `${Number.isInteger(n) ? n : n.toFixed(1)} ${word}${n === 1 ? '' : 's'}`;
