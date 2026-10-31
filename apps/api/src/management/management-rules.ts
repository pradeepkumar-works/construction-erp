import type { ApprovalAgeingDto, HealthLevel, HealthReasonDto, PortfolioScheduleDto, PortfolioScheduleState, SubmissionType } from '@erp/shared';
import { APPROVAL_OLD_DAYS, FORECAST_MIN_DONE_PCT, UNBILLED_WATCH_DAYS } from '@erp/shared';
import { rupees } from '../briefs/brief-rules';
import { formatDay } from '../common/serialize';

/**
 * Management dashboard and reports: the arithmetic, pure. The service loads the records through the modules' own
 * services and queries; everything that turns them into a figure or a reason is here and tested in
 * `src/scripts/management-test.ts`.
 */

const DAY = 86_400_000;
const at = (d: string) => Date.parse(`${d}T00:00:00Z`);
/** Whole days from `from` to `to` (negative when `to` is earlier). */
export const daysBetween = (from: string, to: string) => Math.round((at(to) - at(from)) / DAY);
const round1 = (n: number) => Math.round(n * 10) / 10;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// Work done (BI review: supply items with no activity counted as no work)

export interface BoqWork {
  rate: number;
  /** Approved progress through the item's activities */
  progressQty: number;
  /** Approved measurement sheets */
  measuredQty: number;
}

/**
 * Value of work done: each BOQ item at the larger of its approved progress and its approved measurement, at its rate.
 * A supply item (pipes delivered, a pump) has no activity, so progress never counts it; its measurement does, and a
 * measured item is not double counted with its progress.
 */
export function workDoneValue(items: BoqWork[]): number {
  return items.reduce((s, i) => s + Math.max(i.progressQty, i.measuredQty, 0) * i.rate, 0);
}

/**
 * Work done on a lump-sum or EPC contract: its physical progress (the WBS roll-up) of the lump sum, since its BOQ only
 * prices the work and its bills follow stages; never less than the BOQ's own reading. An item-rate contract is its BOQ.
 */
export function contractWorkDone(model: string, boqWork: number, donePct: number, lumpSum: number | null): number {
  if (model === 'ITEM_RATE' || !lumpSum) return boqWork;
  return Math.max(boqWork, (lumpSum * Math.min(100, Math.max(0, donePct))) / 100);
}

/** The share of a bill's work value the client has settled: settled ÷ invoice, at most all of it. */
export function paidWork(workValue: number, invoice: number, settled: number): number {
  if (invoice <= 0) return 0;
  return workValue * Math.min(1, Math.max(0, settled / invoice));
}

/** Days work has waited to be billed: since the last bill's "measured up to", else the start. Null when nothing waits. */
export function unbilledDays(unbilled: number, billedUpTo: string | null, startDate: string | null, today: string): number | null {
  if (unbilled <= 0) return null;
  const since = billedUpTo ?? startDate;
  if (!since) return null;
  return Math.max(0, daysBetween(since, today));
}

/** Unbilled work is worth a word from ₹1 lakh or half a percent of the contract, whichever is more. */
export const unbilledMatters = (unbilled: number, contractValue: number | null) => unbilled >= Math.max(100_000, (contractValue ?? 0) * 0.005);

/** Cost at completion: actual plus the budget for the work still to do. Null without a budget, or too early to say. */
export function forecastCost(actual: number, budget: number | null, donePct: number): number | null {
  if (budget === null || donePct < FORECAST_MIN_DONE_PCT) return null;
  return actual + budget * (1 - Math.min(100, donePct) / 100);
}

// Schedule (until the fixes thread's `projectScheduleStatus` lands in @erp/shared; the facts carry the same names)

export interface ScheduleFacts {
  status: string;
  done: number;
  planned: number | null;
  startDate: string | null;
  completionDate: string | null;
  plannedFinish: string | null;
  late: number;
  /** Activities with both planned dates */
  scheduled: number;
  today: string;
}

/** Points a project may trail its plan (or the time gone) before it is behind. */
export const BEHIND_BY = 10;

/** Share of the time from start to completion gone by on `today`, 0 to 100. */
export function elapsedPct(start: string | null, end: string | null, today: string): number | null {
  if (!start || !end) return null;
  const total = daysBetween(start, end);
  if (total <= 0) return null;
  return round1(Math.min(100, Math.max(0, (daysBetween(start, today) / total) * 100)));
}

/**
 * Where a project stands: complete; finishing late when its plan ends after the completion date (or the date has passed
 * unfinished); behind when progress trails what the plan expects by today (or the time gone, without a plan) by
 * BEHIND_BY points; no plan without dated activities or dates.
 */
export function scheduleOf(f: ScheduleFacts): PortfolioScheduleDto {
  const elapsed = elapsedPct(f.startDate, f.completionDate, f.today);
  const base = { done: f.done, planned: f.planned, elapsed, lateActivities: f.late, completionDate: f.completionDate, plannedFinish: f.plannedFinish };
  if (f.status === 'COMPLETED' || f.done >= 100) return { ...base, state: 'DONE', daysLate: null };
  let daysLate: number | null = null;
  if (f.completionDate) {
    const overrun = daysBetween(f.completionDate, f.today);
    const planLate = f.plannedFinish ? daysBetween(f.completionDate, f.plannedFinish) : 0;
    const worst = Math.max(overrun, planLate);
    if (worst > 0) daysLate = worst;
  }
  let state: PortfolioScheduleState;
  const mark = f.planned ?? elapsed;
  if (daysLate !== null) state = 'LATE';
  else if (!f.scheduled && elapsed === null) state = 'NO_PLAN';
  else if (mark !== null && f.done <= mark - BEHIND_BY) state = 'BEHIND';
  else state = 'ON_TRACK';
  return { ...base, state, daysLate };
}

// Approvals

/** Waiting entries by age (0–2, 3–7, 8–15, over 15 days) and by type, the type with the oldest first. */
export function approvalAgeing(items: { type: SubmissionType; submittedAt: string }[], today: string): ApprovalAgeingDto {
  const buckets: [number, number, number, number] = [0, 0, 0, 0];
  const byType = new Map<SubmissionType, { count: number; oldestDays: number }>();
  let oldest: number | null = null;
  for (const i of items) {
    const days = Math.max(0, daysBetween(i.submittedAt.slice(0, 10), today));
    buckets[days <= 2 ? 0 : days <= 7 ? 1 : days <= 15 ? 2 : 3] += 1;
    const t = byType.get(i.type) ?? { count: 0, oldestDays: 0 };
    byType.set(i.type, { count: t.count + 1, oldestDays: Math.max(t.oldestDays, days) });
    oldest = Math.max(oldest ?? 0, days);
  }
  return {
    waiting: items.length,
    oldestDays: oldest,
    buckets,
    byType: [...byType.entries()].map(([type, t]) => ({ type, ...t })).sort((a, b) => b.oldestDays - a.oldestDays || b.count - a.count),
  };
}

// Health

/** A margin on work done thinner than this is worth watching. */
export const THIN_MARGIN_PCT = 5;

export interface HealthFacts {
  schedule: PortfolioScheduleDto;
  contractValue: number | null;
  workDone: number;
  cost: number;
  forecastMargin: number | null;
  unbilled: number;
  unbilledDays: number | null;
  billedUpTo: string | null;
  over90: number;
  approvalsWaiting: number;
  approvalsOldestDays: number | null;
  highRisks: number;
}

/**
 * Why a project needs attention, each reason with its figure: a plan finishing after the completion date or progress
 * behind it; cost above the work done or a forecast loss; work left unbilled; client money over 90 days; approvals
 * left waiting; high risks open. Act now is money or time already lost; watch is where it is heading.
 */
export function healthOf(f: HealthFacts): { level: HealthLevel; reasons: HealthReasonDto[] } {
  const reasons: HealthReasonDto[] = [];
  const s = f.schedule;
  if (s.state === 'LATE' && s.daysLate !== null) {
    const past = s.completionDate && s.plannedFinish && s.plannedFinish > s.completionDate;
    reasons.push({
      key: 'schedule',
      level: s.daysLate > 30 ? 'act' : 'watch',
      text: past
        ? `Plan finishes ${formatDay(s.plannedFinish)}, ${plural(s.daysLate, 'day')} after the completion date of ${formatDay(s.completionDate)}`
        : `${plural(s.daysLate, 'day')} past the completion date of ${formatDay(s.completionDate)}, ${round1(s.done)}% done`,
    });
  } else if (s.state === 'BEHIND') {
    const mark = s.planned ?? s.elapsed;
    reasons.push({ key: 'schedule', level: 'watch', text: `${round1(s.done)}% done against ${round1(mark ?? 0)}% ${s.planned !== null ? 'planned by today' : 'of the time gone'}` });
  }
  if (f.workDone > 0 && f.cost > f.workDone) {
    reasons.push({ key: 'cost', level: 'act', text: `Cost of ${rupees(f.cost)} is above the ${rupees(f.workDone)} of work done` });
  } else if (f.forecastMargin !== null && f.forecastMargin < 0) {
    reasons.push({ key: 'cost', level: 'act', text: `Forecast cost is ${rupees(-f.forecastMargin)} above the contract value` });
  } else if (f.workDone > 0 && f.cost / f.workDone > 1 - THIN_MARGIN_PCT / 100) {
    reasons.push({ key: 'cost', level: 'watch', text: `Cost is ${round1((f.cost / f.workDone) * 100)}% of the work done, leaving under ${THIN_MARGIN_PCT}%` });
  }
  if (f.unbilledDays !== null && f.unbilledDays >= UNBILLED_WATCH_DAYS && unbilledMatters(f.unbilled, f.contractValue)) {
    reasons.push({
      key: 'billing',
      level: f.unbilledDays >= UNBILLED_WATCH_DAYS * 2 ? 'act' : 'watch',
      text: `${rupees(f.unbilled)} of work done not billed, ${f.billedUpTo ? `last bill up to ${formatDay(f.billedUpTo)}` : 'no bill yet'} (${plural(f.unbilledDays, 'day')})`,
    });
  }
  if (f.over90 > 0) reasons.push({ key: 'collection', level: 'act', text: `${rupees(f.over90)} due from the client for over 90 days` });
  if (f.approvalsOldestDays !== null && f.approvalsOldestDays > APPROVAL_OLD_DAYS) {
    reasons.push({
      key: 'approvals',
      level: f.approvalsOldestDays > APPROVAL_OLD_DAYS * 2 ? 'act' : 'watch',
      text: `${plural(f.approvalsWaiting, 'entry', 'entries')} waiting for approval, the oldest ${plural(f.approvalsOldestDays, 'day')}`,
    });
  }
  if (f.highRisks > 0) reasons.push({ key: 'risk', level: 'watch', text: `${plural(f.highRisks, 'high risk')} open` });
  const level: HealthLevel = reasons.some((r) => r.level === 'act') ? 'act' : reasons.length ? 'watch' : 'good';
  return { level, reasons };
}

/** Act now before watch, then schedule, cost, billing, collection, approvals and risk. */
const KEY_ORDER: HealthReasonDto['key'][] = ['schedule', 'cost', 'billing', 'collection', 'approvals', 'risk'];
export const byUrgency = <T extends { level: 'act' | 'watch'; key: HealthReasonDto['key'] }>(a: T, b: T) =>
  (a.level === b.level ? 0 : a.level === 'act' ? -1 : 1) || KEY_ORDER.indexOf(a.key) - KEY_ORDER.indexOf(b.key);

// Periods

/** The months from `from` to `to` (YYYY-MM), both included. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.slice(0, 7).split('-').map(Number);
  const [ty, tm] = to.slice(0, 7).split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** The last `n` months up to the one `today` is in, oldest first. */
export const lastMonths = (today: string, n: number) => {
  const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - (n - 1));
  return monthsBetween(d.toISOString().slice(0, 10), today);
};

/** The first and last day of a month (YYYY-MM). */
export function monthSpan(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

/** The Indian financial year's first day for a date: 1 April. */
export function financialYearStart(day: string): string {
  const [y, m] = day.split('-').map(Number);
  return `${m >= 4 ? y : y - 1}-04-01`;
}

/** "October 2026" */
export const monthName = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/**
 * Margin on what was billed, %: null when nothing was billed or the billing is under a tenth of the cost, where a
 * percentage (−2,400%) says less than the two figures beside it.
 */
export const billedMarginPct = (billed: number, cost: number): number | null => (billed > 0 && billed * 10 >= cost ? pctOf(billed - cost, billed) : null);

/** A share in %, one decimal; null when the base is nil. */
export const pctOf = (part: number, whole: number): number | null => (whole > 0 ? round1((part / whole) * 100) : null);

// MIS commentary

/** Rupees in words a board reads: "₹2.45 crore", "₹38.2 lakh", "₹42,500". */
export function inrWords(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 2 })} crore`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toLocaleString('en-IN', { maximumFractionDigits: 1 })} lakh`;
  return `${sign}₹${Math.round(a).toLocaleString('en-IN')}`;
}

/** A change within this share reads as "about the same". */
export const MIS_SAME_PCT = 5;

export interface MisFlow {
  workDone: number;
  billed: number;
  received: number;
  cost: number;
}

export interface MisFacts {
  /** "October 2026" */
  month: string;
  /** "September", or "the same days of September" while the month is still running */
  previous: string;
  projects: number;
  inMonth: MisFlow;
  /** The same figures for the month before (its same days while this one runs); null when there is none */
  before: MisFlow | null;
  year: { billed: number; cost: number };
  /** Today, across the projects */
  unbilled: number;
  outstanding: number;
  /** The project with the most work not billed, and the one whose client owes most */
  mostUnbilled: { name: string; amount: number } | null;
  mostOwed: { name: string; amount: number } | null;
  /** Projects with a reason to act now, worst first, and how many more are to watch */
  actNow: { name: string; text: string }[];
  watch: number;
}

const change = (now: number, then: number) => {
  const pct = ((now - then) / then) * 100;
  return Math.abs(pct) < MIS_SAME_PCT ? 'about the same as' : `${Math.round(Math.abs(pct))}% ${pct > 0 ? 'more' : 'less'} than`;
};
const names = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/**
 * The paragraph the Monthly MIS opens with, written only from its own figures: the month's work, billing and collection
 * against the month before, billing against cost, what is owed and not billed today and where most of it sits, the
 * year's margin on billing, and what needs action now. Rules, never a model, so every figure in it is one of the report's.
 */
export function misCommentary(f: MisFacts): string {
  const m = f.inMonth;
  const out: string[] = [];
  if (m.workDone === 0 && m.billed === 0 && m.received === 0 && m.cost === 0) out.push(`Nothing was done, billed, received or spent on the ${f.projects} projects in ${f.month}.`);
  else {
    const work = m.workDone > 0 ? `${inrWords(m.workDone)} of work${f.before && f.before.workDone > 0 ? `, ${change(m.workDone, f.before.workDone)} in ${f.previous}` : ''}` : 'no work at BOQ rates';
    out.push(`In ${f.month} the ${f.projects} project${f.projects === 1 ? '' : 's'} did ${work}; ${m.billed > 0 ? `${inrWords(m.billed)} was billed` : 'nothing was billed'} and ${m.received > 0 ? `${inrWords(m.received)} received` : 'nothing received'}.`);
    const gap = m.billed - m.cost;
    if (m.cost > 0)
      out.push(m.billed === 0 ? `Cost was ${inrWords(m.cost)}, with nothing billed against it.` : gap >= 0 ? `Cost was ${inrWords(m.cost)}, so billing ran ${inrWords(gap)} ahead of it.` : `Cost was ${inrWords(m.cost)}, ${inrWords(-gap)} more than was billed.`);
  }
  if (f.outstanding > 0) out.push(`Today clients owe ${inrWords(f.outstanding)}${f.mostOwed && f.mostOwed.amount > 0 ? `, the most on ${f.mostOwed.name} (${inrWords(f.mostOwed.amount)})` : ''}.`);
  if (unbilledMatters(f.unbilled, null)) out.push(`${inrWords(f.unbilled)} of work done is not billed yet${f.mostUnbilled && f.mostUnbilled.amount > 0 ? `, the most on ${f.mostUnbilled.name} (${inrWords(f.mostUnbilled.amount)})` : ''}.`);
  const ym = billedMarginPct(f.year.billed, f.year.cost);
  if (f.year.billed > 0) out.push(`For the year so far ${inrWords(f.year.billed)} is billed against ${inrWords(f.year.cost)} of cost${ym === null ? '' : `, a margin of ${ym}% on billing`}.`);
  if (f.actNow.length) {
    const first = f.actNow[0];
    out.push(
      `${f.actNow.length} project${f.actNow.length === 1 ? ' needs' : 's need'} action now (${names(f.actNow.slice(0, 3).map((a) => a.name))}${f.actNow.length > 3 ? ' and more' : ''}), first ${first.name}: ${first.text.charAt(0).toLowerCase()}${first.text.slice(1).replace(/\.$/, '')}.${f.watch ? ` ${f.watch} more ${f.watch === 1 ? 'is' : 'are'} to watch.` : ''}`,
    );
  } else out.push(f.watch ? `No project needs action now; ${f.watch} ${f.watch === 1 ? 'is' : 'are'} to watch.` : 'No project needs action now.');
  return out.join(' ');
}
