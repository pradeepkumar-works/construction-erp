/**
 * Early warnings' forecasts (AI roadmap item 73): plain calculations over facts the service loads, with no database
 * and no model, so `src/scripts/warnings-test.ts` can test each one and replay them over the demo history. Dates are
 * YYYY-MM-DD; every rule takes the day it is run for, so a backtest can ask what it would have said on any day.
 */
import { FUEL_NORM_LOGS, FUEL_NORM_MIN_LOGS, MATERIAL_OVERUSE_MIN_PCT, type FuelNormUnit } from '@erp/shared';

const DAY = 24 * 3600 * 1000;
const toTime = (d: string) => Date.parse(`${d}T00:00:00Z`);
export const addDays = (d: string, n: number) => new Date(toTime(d) + n * DAY).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string) => Math.round((toTime(to) - toTime(from)) / DAY);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ---------------------------------------------------------------------------------------------------------------------
// EPC packages (item 130): when a package reaches site is `packageStatus` in `epc/epc-rules.ts`.

/** A package forecast to reach site within this many days after site needs it is noise, not a warning. */
export const PACKAGE_GRACE_DAYS = 3;

/** Days a package will be late for site, when that is past the grace; null otherwise or once it has been delivered. */
export function packageLate(f: { lateDays: number | null; forecastFrom: 'DELIVERED' | 'ETA' | 'PLAN' | null }): number | null {
  if (f.forecastFrom === 'DELIVERED' || f.lateDays === null || f.lateDays <= PACKAGE_GRACE_DAYS) return null;
  return f.lateDays;
}

// O&M (item 131): a month's failures, penalties and staff short are `monthFigures` in `om/om-rules.ts`.

/** Days of the running period with no service level reading before the gap is worth a warning on its own. */
export const OM_MISSING_DAYS = 3;

interface OmMonthFacts {
  month: string;
  penalty: number;
  staffDeduction: number;
  missingDays: string[];
  benchmarks: { key: string; failures: number; allowed: number; penalised: number }[];
}

/**
 * What the running O&M period is losing so far: penalties and staff short, the days with no reading, and the DAY
 * benchmarks of this month already at their allowance (the next failure costs). Null when there is nothing to say.
 */
export function omSlip(months: OmMonthFacts[]): { penalty: number; staffDeduction: number; missingDays: string[]; atAllowance: string[] } | null {
  const penalty = Math.round(months.reduce((s, m) => s + m.penalty, 0) * 100) / 100;
  const staffDeduction = Math.round(months.reduce((s, m) => s + m.staffDeduction, 0) * 100) / 100;
  const missingDays = months.flatMap((m) => m.missingDays);
  const last = months[months.length - 1];
  const atAllowance = last ? last.benchmarks.filter((b) => b.allowed > 0 && b.failures === b.allowed).map((b) => b.key) : [];
  if (!penalty && !staffDeduction && missingDays.length < OM_MISSING_DAYS && !atAllowance.length) return null;
  return { penalty, staffDeduction, missingDays, atAllowance };
}

// ---------------------------------------------------------------------------------------------------------------------
// Schedule: an activity's current rate puts its finish past the baseline.

/** The rate is the work done over this many days, so a burst long ago does not hide a stall now. */
export const RATE_WINDOW_DAYS = 28;
/** A finish forecast within this many days of the baseline is noise, not a warning. */
export const SLIP_GRACE_DAYS = 7;
/** An activity that started this long ago with nothing recorded in the window is stalled. */
export const STALL_DAYS = 14;

export interface ActivityFacts {
  plannedQty: number;
  plannedStart: string | null;
  plannedEnd: string | null;
  baselineEnd: string | null;
  /** Approved progress, any order. */
  entries: { date: string; qty: number }[];
}

export interface ActivityForecast {
  donePct: number;
  /** Quantity a day over the window, 0 when nothing was done in it. */
  rate: number;
  /** The day the rest would be done at that rate; null when the rate is 0. */
  forecastFinish: string | null;
  /** The baseline finish, or the planned one when no baseline was frozen. */
  target: string;
  slipDays: number | null;
  stalled: boolean;
}

/** Null when there is nothing to forecast: not started, done, or no finish date to compare with. */
export function activityForecast(a: ActivityFacts, today: string): ActivityForecast | null {
  const target = a.baselineEnd ?? a.plannedEnd;
  if (!target || !a.plannedStart || a.plannedStart > today || a.plannedQty <= 0) return null;
  const past = a.entries.filter((e) => e.date <= today);
  const done = past.reduce((s, e) => s + e.qty, 0);
  if (done >= a.plannedQty) return null;
  const windowStart = addDays(today, -RATE_WINDOW_DAYS + 1);
  const first = past.map((e) => e.date).sort()[0];
  // Started inside the window: the rate is over the days since it started (at least a week), not the whole window.
  const from = first && first > windowStart ? first : windowStart;
  const days = Math.max(7, daysBetween(from, today) + 1);
  const inWindow = past.filter((e) => e.date >= windowStart).reduce((s, e) => s + e.qty, 0);
  const rate = inWindow / days;
  const left = a.plannedQty - done;
  const forecastFinish = rate > 0 ? addDays(today, Math.ceil(left / rate)) : null;
  return {
    donePct: Math.round((done / a.plannedQty) * 1000) / 10,
    rate,
    forecastFinish,
    target,
    slipDays: forecastFinish ? daysBetween(target, forecastFinish) : null,
    stalled: rate === 0 && daysBetween(a.plannedStart, today) >= STALL_DAYS,
  };
}

/** Whether the forecast is a warning: the finish lands past the target by more than the grace, or the work has stalled. */
export function scheduleWarns(f: ActivityForecast | null): boolean {
  if (!f) return false;
  return f.stalled || (f.slipDays !== null && f.slipDays > SLIP_GRACE_DAYS);
}

/**
 * The project's plan ends after its completion date (e2e review, fix 1): the latest planned finish of its activities
 * against the contract completion with the extensions granted. Days late, or null when the plan ends in time (or a
 * date is missing). Every day counts: a plan past the contract date is a claim for time or liquidated damages.
 */
export function planFinishLate(plannedFinish: string | null, completionDate: string | null): number | null {
  if (!plannedFinish || !completionDate || plannedFinish <= completionDate) return null;
  return daysBetween(completionDate, plannedFinish);
}

// ---------------------------------------------------------------------------------------------------------------------
// Cash: bills due against expected receipts over the next eight weeks.

export const CASH_WEEKS = 8;
/** A client's days to pay are their own only once this many bills have been paid; until then the contract's. */
export const MIN_PAID_BILLS = 2;

/** The median days a client took from a bill being sent to it being paid, or null with too few paid bills. */
export function daysToPay(paid: { sentDate: string; paidDate: string }[]): number | null {
  if (paid.length < MIN_PAID_BILLS) return null;
  return median(paid.map((b) => Math.max(0, daysBetween(b.sentDate, b.paidDate))));
}

export interface CashWeek {
  start: string;
  end: string;
  in: number;
  out: number;
  /** Money in less money out from today to the end of this week. */
  cumulative: number;
}

/**
 * The next eight weeks from the Monday of `today`'s week. Anything overdue (a receipt expected before today, a bill
 * due before today) is counted in the first week.
 */
export function cashWeeks(inflows: { date: string; amount: number }[], outflows: { date: string; amount: number }[], today: string): CashWeek[] {
  const monday = addDays(today, -((new Date(toTime(today)).getUTCDay() + 6) % 7));
  const weeks: CashWeek[] = Array.from({ length: CASH_WEEKS }, (_, i) => ({ start: addDays(monday, i * 7), end: addDays(monday, i * 7 + 6), in: 0, out: 0, cumulative: 0 }));
  const weekOf = (d: string) => (d <= weeks[0].end ? weeks[0] : weeks.find((w) => d >= w.start && d <= w.end) ?? null);
  for (const f of inflows) {
    const w = weekOf(f.date);
    if (w) w.in += f.amount;
  }
  for (const f of outflows) {
    const w = weekOf(f.date);
    if (w) w.out += f.amount;
  }
  let running = 0;
  for (const w of weeks) {
    running += w.in - w.out;
    w.cumulative = running;
  }
  return weeks;
}

/** The first week where more has gone out than come in since today, or null. */
export const cashGap = (weeks: CashWeek[]) => weeks.find((w) => w.cumulative < -0.5) ?? null;

// ---------------------------------------------------------------------------------------------------------------------
// Vendors: deliveries late more often, or more rejected, than before.

export const VENDOR_WINDOW_DAYS = 60;
export const MIN_DELIVERIES = 2;
export const LATE_SHARE = 0.5;
export const REJECT_SHARE = 0.1;

export interface Delivery {
  date: string;
  /** Received after the order's delivery date. */
  late: boolean;
  qty: number;
  rejectedQty: number;
}

export interface VendorTrend {
  recent: { deliveries: number; late: number; lateShare: number; rejectShare: number };
  before: { deliveries: number; late: number; lateShare: number; rejectShare: number };
  lateWorse: boolean;
  rejectWorse: boolean;
}

function window(ds: Delivery[]) {
  const late = ds.filter((d) => d.late).length;
  const qty = ds.reduce((s, d) => s + d.qty, 0);
  const rejected = ds.reduce((s, d) => s + d.rejectedQty, 0);
  return { deliveries: ds.length, late, lateShare: ds.length ? late / ds.length : 0, rejectShare: qty > 0 ? rejected / qty : 0 };
}

/** The last 60 days against the 60 before: late on at least half, or a tenth rejected, and worse than before. */
export function vendorTrend(deliveries: Delivery[], today: string): VendorTrend | null {
  const from = addDays(today, -VENDOR_WINDOW_DAYS + 1);
  const prevFrom = addDays(from, -VENDOR_WINDOW_DAYS);
  const recent = window(deliveries.filter((d) => d.date >= from && d.date <= today));
  const before = window(deliveries.filter((d) => d.date >= prevFrom && d.date < from));
  if (recent.deliveries < MIN_DELIVERIES) return null;
  const lateWorse = recent.lateShare >= LATE_SHARE && recent.lateShare > before.lateShare;
  const rejectWorse = recent.rejectShare >= REJECT_SHARE && recent.rejectShare > before.rejectShare + 0.05;
  return { recent, before, lateWorse, rejectWorse };
}

// ---------------------------------------------------------------------------------------------------------------------
// Stock: the balance runs out before a new order could arrive.

export const ISSUE_WINDOW_DAYS = 30;
/** Lead time when the item has never been ordered and received. */
export const DEFAULT_LEAD_DAYS = 7;

/** The median days from order to receipt over past deliveries of the item, or the default. */
export function leadDays(receipts: { poDate: string; received: string }[]): { days: number; fromHistory: boolean } {
  const m = median(receipts.map((r) => Math.max(0, daysBetween(r.poDate, r.received))));
  return m === null ? { days: DEFAULT_LEAD_DAYS, fromHistory: false } : { days: Math.ceil(m), fromHistory: true };
}

export interface StockFacts {
  balance: number;
  issues: { date: string; qty: number }[];
  leadDays: number;
  /** Ordered on open orders and not yet received. */
  onOrder: number;
}

export interface StockForecast {
  perDay: number;
  daysLeft: number;
  runsOut: string;
}

/** Warns when the balance lasts fewer days than the lead time at the last 30 days' rate, with nothing on order. */
export function stockRunout(s: StockFacts, today: string): StockForecast | null {
  const from = addDays(today, -ISSUE_WINDOW_DAYS + 1);
  const recent = s.issues.filter((i) => i.date >= from && i.date <= today);
  if (!recent.length || s.onOrder > 0) return null;
  const first = recent.map((i) => i.date).sort()[0];
  const days = Math.max(7, daysBetween(first, today) + 1);
  const perDay = recent.reduce((sum, i) => sum + i.qty, 0) / days;
  if (perDay <= 0) return null;
  const daysLeft = Math.max(0, s.balance) / perDay;
  if (daysLeft >= s.leadDays) return null;
  return { perDay, daysLeft, runsOut: addDays(today, Math.floor(daysLeft)) };
}

// ---------------------------------------------------------------------------------------------------------------------
// Machines: idle or breaking down more than the month before.

export const MACHINE_WINDOW_DAYS = 30;
export const MIN_BREAKDOWN_HOURS = 8;
export const IDLE_SHARE = 0.3;

export interface MachineDay {
  date: string;
  worked: number;
  idle: number;
  breakdown: number;
}

export interface MachineTrend {
  recent: { worked: number; idle: number; breakdown: number; idleShare: number };
  before: { worked: number; idle: number; breakdown: number; idleShare: number };
  breakdownWorse: boolean;
  idleWorse: boolean;
}

function hours(ds: MachineDay[]) {
  const worked = ds.reduce((s, d) => s + d.worked, 0);
  const idle = ds.reduce((s, d) => s + d.idle, 0);
  const breakdown = ds.reduce((s, d) => s + d.breakdown, 0);
  return { worked, idle, breakdown, idleShare: worked + idle > 0 ? idle / (worked + idle) : 0 };
}

/** The last 30 days against the 30 before: at least 8 breakdown hours and half as many again, or idle 30% and up 10 points. */
export function machineTrend(days: MachineDay[], today: string): MachineTrend | null {
  const from = addDays(today, -MACHINE_WINDOW_DAYS + 1);
  const prevFrom = addDays(from, -MACHINE_WINDOW_DAYS);
  const recentDays = days.filter((d) => d.date >= from && d.date <= today);
  if (!recentDays.length) return null;
  const recent = hours(recentDays);
  const before = hours(days.filter((d) => d.date >= prevFrom && d.date < from));
  const breakdownWorse = recent.breakdown >= MIN_BREAKDOWN_HOURS && recent.breakdown > before.breakdown * 1.5;
  const idleWorse = recent.idleShare >= IDLE_SHARE && recent.idleShare >= before.idleShare + 0.1;
  return { recent, before, breakdownWorse, idleWorse };
}

// ---------------------------------------------------------------------------------------------------------------------
// DPRs: none sent for a site three days running.

export const DPR_MISSING_DAYS = 3;

/**
 * The days before today with no DPR sent, counted back from yesterday while they run (up to 30), when at least three
 * run; else null. Days before the project started don't count.
 */
export function dprGap(sent: Set<string>, today: string, startDate: string | null): { from: string; days: number } | null {
  let days = 0;
  let d = addDays(today, -1);
  while (days < 30 && !sent.has(d) && (!startDate || d >= startDate)) {
    days++;
    d = addDays(d, -1);
  }
  return days >= DPR_MISSING_DAYS ? { from: addDays(today, -days), days } : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Material used over the norm (v5 item 92), from the material reconciliation.

export interface OveruseFacts {
  /** Theoretical with the norms' wastage */
  allowed: number;
  /** Issued less returned from site */
  consumed: number;
}

/** Warns when consumption is over the allowance by at least MATERIAL_OVERUSE_MIN_PCT of the allowed quantity. */
export function materialOveruse(f: OveruseFacts): { excess: number; overPct: number } | null {
  if (f.allowed <= 0 || f.consumed <= f.allowed) return null;
  const excess = f.consumed - f.allowed;
  const overPct = (excess / f.allowed) * 100;
  return overPct >= MATERIAL_OVERUSE_MIN_PCT ? { excess, overPct } : null;
}

/** The step of the overuse a dismissal holds for: 5 points of %, so the warning comes back as the overuse grows. */
export const overuseStep = (overPct: number) => Math.floor(overPct / 5) * 5;

// ---------------------------------------------------------------------------------------------------------------------
// Fuel use off the norm (v5 item 93): a machine's average over its latest logs against its norm.

export interface FuelLog {
  date: string;
  hoursWorked: number;
  /** Meter run of the day for a vehicle (odometer); null without both readings */
  km: number | null;
  litres: number;
}

export interface FuelCheck {
  /** Litres an hour, or km a litre, over the logs used */
  average: number;
  /** (average − norm) ÷ norm, in %; positive is more litres an hour or more km a litre */
  deviationPct: number;
  /** True when the machine burns more fuel than the norm allows: more litres an hour, or fewer km a litre */
  thirsty: boolean;
  logs: number;
  from: string;
  to: string;
}

/**
 * The machine's latest FUEL_NORM_LOGS logs that have fuel and use (hours, or km for a vehicle), up to `today`; a
 * warning when there are at least FUEL_NORM_MIN_LOGS and their average strays from the norm by more than the tolerance,
 * either way (less fuel than the norm can mean hours written up or fuel booked to another machine).
 */
export function fuelNormCheck(logs: FuelLog[], norm: number, unit: FuelNormUnit, tolerancePct: number, today: string): FuelCheck | null {
  if (!(norm > 0)) return null;
  const used = logs
    .filter((l) => l.date <= today && l.litres > 0 && (unit === 'KM_PER_LITRE' ? (l.km ?? 0) > 0 : l.hoursWorked > 0))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, FUEL_NORM_LOGS);
  if (used.length < FUEL_NORM_MIN_LOGS) return null;
  const litres = used.reduce((s, l) => s + l.litres, 0);
  const average = unit === 'KM_PER_LITRE' ? used.reduce((s, l) => s + (l.km ?? 0), 0) / litres : litres / used.reduce((s, l) => s + l.hoursWorked, 0);
  const deviationPct = ((average - norm) / norm) * 100;
  if (Math.abs(deviationPct) <= tolerancePct) return null;
  return { average, deviationPct, thirsty: unit === 'KM_PER_LITRE' ? deviationPct < 0 : deviationPct > 0, logs: used.length, from: used[used.length - 1].date, to: used[0].date };
}

/** The step a dismissal holds for: 10 points of %, so the warning comes back when the machine drifts further. */
export const fuelStep = (deviationPct: number) => Math.floor(Math.abs(deviationPct) / 10) * 10;

// ---------------------------------------------------------------------------------------------------------------------
// Machine loans (v6 item 108): an EMI past its date unpaid.

/** An EMI paid this many days late is still a slip worth no warning (a cheque in clearing). */
export const EMI_GRACE_DAYS = 2;

export interface EmiOverdue {
  count: number;
  /** EMIs overdue, ₹ */
  amount: number;
  /** The oldest unpaid EMI */
  oldestNo: number;
  oldestDue: string;
  days: number;
}

/**
 * The EMIs of a loan unpaid past their due date on `today`; a warning once the oldest is more than EMI_GRACE_DAYS late.
 * Its key moves on with the oldest EMI and the count, so a dismissal holds for this EMI only.
 */
export function emiOverdue(emis: { no: number; dueDate: string; emi: number; paidOn: string | null }[], today: string): EmiOverdue | null {
  const late = emis.filter((e) => !e.paidOn && e.dueDate < today).sort((a, b) => a.no - b.no);
  if (!late.length) return null;
  const days = daysBetween(late[0].dueDate, today);
  if (days <= EMI_GRACE_DAYS) return null;
  return { count: late.length, amount: late.reduce((s, e) => s + e.emi, 0), oldestNo: late[0].no, oldestDue: late[0].dueDate, days };
}

// ---------------------------------------------------------------------------------------------------------------------
// Track record and pauses (item 119): what people said about a kind's warnings when they dismissed them.

export interface OutcomeFact {
  outcome: 'FIXED' | 'KNOWN' | 'WRONG';
  /** YYYY-MM-DD */
  date: string;
}

/** Of the latest `size` outcomes, how many were right (Fixed or Known). Outcomes in any order. */
export function trackRecord(outcomes: OutcomeFact[], size: number): { right: number; of: number } {
  const latest = [...outcomes].sort((a, b) => b.date.localeCompare(a.date)).slice(0, size);
  return { right: latest.filter((o) => o.outcome !== 'WRONG').length, of: latest.length };
}

/**
 * A kind pauses when, over the outcomes in the last `windowDays`, at least `minOutcomes` were given and more than
 * `wrongShare` of them were Wrong. The caller leaves out outcomes from before an admin last resumed the kind. `since` is
 * the day the pause began: the day of the outcome that first tipped it over.
 */
export function pauseState(outcomes: OutcomeFact[], today: string, rules: { windowDays: number; minOutcomes: number; wrongShare: number }): { since: string; wrong: number; of: number } | null {
  const from = addDays(today, -rules.windowDays + 1);
  const counted = outcomes.filter((o) => o.date >= from && o.date <= today).sort((a, b) => a.date.localeCompare(b.date));
  let wrong = 0;
  let since: string | null = null;
  counted.forEach((o, i) => {
    if (o.outcome === 'WRONG') wrong++;
    const of = i + 1;
    if (!since && of >= rules.minOutcomes && wrong / of > rules.wrongShare) since = o.date;
  });
  if (counted.length < rules.minOutcomes || wrong / counted.length <= rules.wrongShare) return null;
  return { since: since ?? counted[counted.length - 1].date, wrong, of: counted.length };
}

/** The warnings to tell a person about today: not told before, most costly first (rupees, then days), at most `cap`. */
export function alertsToSend<W extends { key: string; impact: { inr: number | null; days: number | null } | null }>(open: W[], told: Set<string>, cap: number): W[] {
  const weight = (w: W) => [w.impact?.inr ?? 0, w.impact?.days ?? 0] as const;
  return open
    .filter((w) => !told.has(w.key))
    .map((w, i) => ({ w, i }))
    .sort((a, b) => weight(b.w)[0] - weight(a.w)[0] || weight(b.w)[1] - weight(a.w)[1] || a.i - b.i)
    .slice(0, cap)
    .map((x) => x.w);
}

// ---------------------------------------------------------------------------------------------------------------------
// QA/QC (item 137 part 3)

/** A project's quality plan warns once this many tests are short of what its work and receipts owe. */
export const TESTS_SHORT_MIN = 2;

/** The plan lines of one project that are short, most short first; null while the project is under `TESTS_SHORT_MIN`. */
export function testsShort<L extends { short: number; required: number; taken: number }>(lines: L[]): { short: number; required: number; taken: number; lines: L[] } | null {
  const short = lines.filter((l) => l.short > 0).sort((a, b) => b.short - a.short);
  const total = short.reduce((s, l) => s + l.short, 0);
  if (total < TESTS_SHORT_MIN) return null;
  return { short: total, required: lines.reduce((s, l) => s + l.required, 0), taken: lines.reduce((s, l) => s + l.taken, 0), lines: short };
}

/** An instrument in use that is overdue for calibration or failed its last one; never-calibrated ones too once a test names them. */
export function calibrationWarns(i: { state: 'OK' | 'DUE_SOON' | 'OVERDUE' | 'NEVER' | 'OUT_OF_USE'; active: boolean; lastResult: string | null; usedSinceDue: number }): boolean {
  if (!i.active) return false;
  if (i.state === 'OVERDUE') return true;
  if (i.state === 'OUT_OF_USE') return i.lastResult === 'FAILED';
  return i.state === 'NEVER' && i.usedSinceDue > 0;
}

/** Late samples grouped by project and lab, the longest wait first. */
export function lateReportGroups<S extends { projectId: string; labId: string; late: boolean; waitDays: number | null }>(samples: S[]): { projectId: string; labId: string; samples: S[]; longest: number }[] {
  const groups = new Map<string, S[]>();
  for (const s of samples.filter((x) => x.late)) {
    const k = `${s.projectId}:${s.labId}`;
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  return [...groups.values()]
    .map((xs) => ({ projectId: xs[0].projectId, labId: xs[0].labId, samples: xs.sort((a, b) => (b.waitDays ?? 0) - (a.waitDays ?? 0)), longest: Math.max(...xs.map((x) => x.waitDays ?? 0)) }))
    .sort((a, b) => b.longest - a.longest);
}

/**
 * Drawings still not buildable past their day (item 138), one warning per project and party that owes them, the longest
 * wait first. The party is who issues them as written, else the kind of source.
 */
export function lateDrawingGroups<N extends { projectId: string; source: string; fromParty: string | null; overdue: boolean; daysLate: number | null }>(needs: N[]): { projectId: string; party: string; needs: N[]; longest: number }[] {
  const groups = new Map<string, N[]>();
  for (const n of needs.filter((x) => x.overdue)) {
    const k = `${n.projectId}:${(n.fromParty ?? n.source).trim().toLowerCase()}`;
    groups.set(k, [...(groups.get(k) ?? []), n]);
  }
  return [...groups.values()]
    .map((xs) => ({ projectId: xs[0].projectId, party: (xs[0].fromParty ?? xs[0].source).trim(), needs: xs.sort((a, b) => (b.daysLate ?? 0) - (a.daysLate ?? 0)), longest: Math.max(...xs.map((x) => x.daysLate ?? 0)) }))
    .sort((a, b) => b.longest - a.longest);
}

/**
 * Design submissions with the reviewer past the day the reply was asked by (item 138 part 2), longest first. One warning
 * each: the key moves with the round, so a resubmission is a new warning.
 */
export function lateDesignReviews<R extends { status: string; daysLate: number | null }>(rows: R[]): (R & { daysLate: number })[] {
  return rows.filter((r): r is R & { daysLate: number } => r.status === 'UNDER_REVIEW' && (r.daysLate ?? 0) > 0).sort((a, b) => b.daysLate - a.daysLate);
}
