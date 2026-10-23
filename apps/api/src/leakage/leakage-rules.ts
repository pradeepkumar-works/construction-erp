import { FUEL_NO_LOG_MIN_LITRES, IDLE_MIN_DAYS, MATERIAL_OVERUSE_MIN_PCT, SITE_RATIO_ABOVE_PTS, SITE_RATIO_MIN_SITES } from '@erp/shared';

/**
 * Leakage checks (AI item 121), the arithmetic with no database: material against the allowance and the company's other
 * sites, fuel issued to a machine on a day it has no log, and a hired machine paid for hours it did not work. Rates are
 * `rateAboveOthers` in `@erp/shared` (the purchase order form uses it too). Tested in `src/scripts/leakage-test.ts`.
 */

/** One site's month of an item, from the material reconciliation. */
export interface SiteUse {
  projectId: string;
  itemId: string;
  /** Theoretical with the norms' wastage */
  allowed: number;
  /** Issued less returned */
  consumed: number;
}

/** The middle value; the mean of the middle two for an even count. */
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** The company's median use (used ÷ allowed) of each item over the sites that used it against an allowance. */
export function companyMedians(uses: SiteUse[]): Map<string, { median: number; sites: number }> {
  const by = new Map<string, number[]>();
  for (const u of uses) if (u.allowed > 0) by.set(u.itemId, [...(by.get(u.itemId) ?? []), u.consumed / u.allowed]);
  const out = new Map<string, { median: number; sites: number }>();
  for (const [itemId, ratios] of by) out.set(itemId, { median: median(ratios)!, sites: ratios.length });
  return out;
}

export interface MaterialLeak {
  /** used ÷ allowed */
  ratio: number;
  /** Over the allowance, in % of it; null when within it (or under MATERIAL_OVERUSE_MIN_PCT over) */
  overPct: number | null;
  /** The company's median ratio when there are enough sites, and how far this site is above it in points */
  median: number | null;
  abovePts: number | null;
  /** Quantity at risk: over the allowance when it is, else over what the median site would have used */
  excess: number;
  /** What the excess is measured from */
  against: 'ALLOWANCE' | 'MEDIAN';
}

/**
 * A site's month of an item is a leak when it used more than the allowance (by MATERIAL_OVERUSE_MIN_PCT or more), or
 * when its use ratio is SITE_RATIO_ABOVE_PTS or more points above the company's median over at least
 * SITE_RATIO_MIN_SITES sites. A site under its allowance can still be using more than the others: its norms may be loose.
 */
export function materialLeak(u: SiteUse, med: { median: number; sites: number } | undefined): MaterialLeak | null {
  if (!(u.allowed > 0) || !(u.consumed > 0)) return null;
  const ratio = u.consumed / u.allowed;
  const over = (ratio - 1) * 100;
  const overPct = over >= MATERIAL_OVERUSE_MIN_PCT ? over : null;
  const median = med && med.sites >= SITE_RATIO_MIN_SITES ? med.median : null;
  const pts = median === null ? null : (ratio - median) * 100;
  const abovePts = pts !== null && pts >= SITE_RATIO_ABOVE_PTS ? pts : null;
  if (overPct === null && abovePts === null) return null;
  return overPct !== null
    ? { ratio, overPct, median, abovePts, excess: u.consumed - u.allowed, against: 'ALLOWANCE' }
    : { ratio, overPct, median, abovePts, excess: u.consumed - median! * u.allowed, against: 'MEDIAN' };
}

/** Fuel issued into a machine on one day. */
export interface FuelIssue {
  equipmentId: string;
  date: string;
  litres: number;
  entryId: string;
  entryNo: string;
}

/**
 * Fuel issued into a machine on days it has no log (any log not rejected), from FUEL_NO_LOG_MIN_LITRES a day: fuel
 * with no work to show for it. `logged` holds `equipmentId|date`.
 */
export function fuelWithoutLog(issues: FuelIssue[], logged: Set<string>): { equipmentId: string; date: string; litres: number; entries: { id: string; no: string }[] }[] {
  const by = new Map<string, { equipmentId: string; date: string; litres: number; entries: { id: string; no: string }[] }>();
  for (const i of issues) {
    const k = `${i.equipmentId}|${i.date}`;
    if (logged.has(k)) continue;
    const cur = by.get(k) ?? { equipmentId: i.equipmentId, date: i.date, litres: 0, entries: [] };
    cur.litres += i.litres;
    if (!cur.entries.some((e) => e.id === i.entryId)) cur.entries.push({ id: i.entryId, no: i.entryNo });
    by.set(k, cur);
  }
  return [...by.values()].filter((d) => d.litres >= FUEL_NO_LOG_MIN_LITRES).sort((a, b) => a.date.localeCompare(b.date) || a.equipmentId.localeCompare(b.equipmentId));
}

/** A hired machine's hire terms. */
export interface HireTerms {
  rateUnit: 'HOUR' | 'DAY' | 'MONTH';
  rate: number | null;
  /** Hours paid for a month even if it worked less (hourly hire) */
  minHours: number | null;
}

export interface HireDay {
  date: string;
  worked: number;
}

export interface IdleHire {
  /** Days from the first log of the month to its last with no hours worked (no log, or a log with none) */
  idleDays: number;
  /** Days counted, first log to last */
  days: number;
  worked: number;
  /** Hourly hire: the minimum for the days so far (minHours × days ÷ days in the month), and the hours short of it */
  minSoFar: number | null;
  shortHours: number | null;
  /** ₹ paid for no work: short hours × rate, or idle days × the month's rate ÷ days in the month; null without a rate */
  paidIdle: number | null;
}

const addDay = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
/** Days in a YYYY-MM month. */
export const daysIn = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();

/**
 * What a hired machine was paid for and did not work in the month up to `to`. Idle days are counted between its first
 * and last log of the month: before the first it may not have come, and after the last it may have gone. Hourly hire with a monthly minimum: flagged while the hours worked are under
 * the minimum for the days so far, since the bill tops them up to it. Monthly hire: flagged from IDLE_MIN_DAYS idle
 * days, each a day's share of the month's rate. Daily hire bills only the days worked, so it is never flagged.
 */
export function idleHire(terms: HireTerms, logs: HireDay[], month: string, to: string): IdleHire | null {
  if (terms.rateUnit === 'DAY') return null;
  const inMonth = logs.filter((l) => l.date.startsWith(month) && l.date <= to);
  if (!inMonth.length) return null;
  const first = inMonth.reduce((m, l) => (l.date < m ? l.date : m), inMonth[0].date);
  const last = inMonth.reduce((m, l) => (l.date > m ? l.date : m), inMonth[0].date);
  const workedOn = new Set(inMonth.filter((l) => l.worked > 0).map((l) => l.date));
  let days = 0;
  let idleDays = 0;
  for (let d = first; d <= last; d = addDay(d, 1)) {
    days++;
    if (!workedOn.has(d)) idleDays++;
  }
  const worked = inMonth.reduce((s, l) => s + l.worked, 0);
  const monthDays = daysIn(month);
  if (terms.rateUnit === 'HOUR') {
    if (!terms.minHours || !(terms.minHours > 0)) return null;
    // The minimum is for the whole month; so far it is the share of the days to `to`.
    const elapsed = Number(to.slice(8, 10));
    const minSoFar = (terms.minHours * Math.min(elapsed, monthDays)) / monthDays;
    const shortHours = minSoFar - worked;
    if (shortHours <= 0) return null;
    return { idleDays, days, worked, minSoFar, shortHours, paidIdle: terms.rate ? shortHours * terms.rate : null };
  }
  if (idleDays < IDLE_MIN_DAYS) return null;
  return { idleDays, days, worked, minSoFar: null, shortHours: null, paidIdle: terms.rate ? (idleDays * terms.rate) / monthDays : null };
}

/** The month's first day, and its last or `today` while it runs. */
export function monthSpan(month: string, today: string): { from: string; to: string } {
  const from = `${month}-01`;
  const last = `${month}-${String(daysIn(month)).padStart(2, '0')}`;
  return { from, to: today < last ? today : last };
}
