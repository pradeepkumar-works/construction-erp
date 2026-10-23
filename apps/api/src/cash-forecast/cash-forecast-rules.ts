import {
  CASH_FLOW_KIND_LABELS,
  CONTRACT_PAY_SPREAD_DAYS,
  DEFAULT_CLIENT_PAYMENT_DAYS,
  DEFAULT_PO_PAYMENT_DAYS,
  FORECAST_WEEKS,
  MIN_PAY_SPREAD_DAYS,
  STATUTORY_DUE_DAY,
  type CashFlowItemDto,
  type CashFlowKind,
  type CashRange,
  type CashWeekDto,
  type ForecastErrorDto,
} from '@erp/shared';

/**
 * The 13-week cash forecast (AI item 122), the arithmetic with no database: how long a client takes to pay and how
 * widely that varies, when each receipt and payment may land (early, likely, late), the weeks with their low, likely and
 * high balance, why a short week is short, what to chase or hold, and how far an old forecast was out. Every rule takes
 * the day it is run for, so `src/scripts/cash-forecast-test.ts` can replay past weeks against what was paid.
 */

const DAY = 24 * 3600 * 1000;
const toTime = (d: string) => Date.parse(`${d}T00:00:00Z`);
export const addDays = (d: string, n: number) => new Date(toTime(d) + n * DAY).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string) => Math.round((toTime(to) - toTime(from)) / DAY);
const maxDate = (a: string, b: string) => (a > b ? a : b);

/** 1840000 → "₹18.4 L", 25000000 → "₹2.5 Cr", 45000 → "₹45,000". */
export const rupees = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e7) return `₹${(v / 1e7).toFixed(1)} Cr`;
  if (a >= 1e5) return `₹${(v / 1e5).toFixed(1)} L`;
  return `₹${Math.round(v).toLocaleString('en-IN')}`;
};
/** 2026-10-23 → "23 Oct". */
export const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** The Monday of the week `d` falls in. */
export const mondayOf = (d: string) => addDays(d, -((new Date(toTime(d)).getUTCDay() + 6) % 7));

// ---------------------------------------------------------------------------------------------------------------------
// When clients pay

/** A client's own days are used once this many of their bills have been paid. */
export const MIN_PAID_BILLS = 2;

export interface PayTiming {
  /** Average days from a bill being sent to it being paid */
  days: number;
  /** Days either side for the early and late case */
  spread: number;
  /** From the client's paid bills (true) or the contract's days (false) */
  own: boolean;
  /** Paid bills the average rests on */
  bills: number;
}

/**
 * A client's days to pay: the mean of their paid bills with the spread their standard deviation (at least a week), or
 * with fewer than two paid bills the contract's days, spread two weeks either side.
 */
export function payTiming(paid: { sentDate: string; paidDate: string }[], contractDays: number | null): PayTiming {
  if (paid.length < MIN_PAID_BILLS) return { days: contractDays ?? DEFAULT_CLIENT_PAYMENT_DAYS, spread: CONTRACT_PAY_SPREAD_DAYS, own: false, bills: paid.length };
  const days = paid.map((b) => Math.max(0, daysBetween(b.sentDate, b.paidDate)));
  const mean = days.reduce((a, b) => a + b, 0) / days.length;
  const sd = Math.sqrt(days.reduce((a, b) => a + (b - mean) ** 2, 0) / (days.length - 1));
  return { days: Math.round(mean), spread: Math.max(MIN_PAY_SPREAD_DAYS, Math.round(sd)), own: true, bills: paid.length };
}

export interface Dates {
  early: string;
  likely: string;
  late: string;
  /** The likely date had already passed: moved to today */
  overdue: boolean;
}

/** A date with its spread, never before today: a date already gone is today, late by the spread. */
export function around(likely: string, before: number, after: number, today: string): Dates {
  if (likely < today) return { early: today, likely: today, late: addDays(today, after), overdue: true };
  return { early: maxDate(addDays(likely, -before), today), likely, late: addDays(likely, after), overdue: false };
}

/** A sent client bill: its sent date plus the client's days, spread either side. */
export function clientBillDates(sentDate: string, t: PayTiming, today: string): Dates {
  return around(addDays(sentDate, t.days), t.spread, t.spread, today);
}

/** The words behind a client bill's date: "sent 23 days ago; this client averages 41 days (6 bills)". */
export function clientBillWhy(sentDate: string, t: PayTiming, today: string): string {
  const ago = daysBetween(sentDate, today);
  const days = t.own ? `this client averages ${t.days} days (${t.bills} paid bills)` : `the contract says ${t.days} days (too few paid bills to go by)`;
  return `Sent ${ago === 1 ? '1 day' : `${ago} days`} ago; ${days}`;
}

/**
 * The next RA bill: the same day of the month as the last one (on or after today), or the month's end when no bill
 * was made yet. Measured work not in a bill is expected then, paid at the client's days.
 */
export function nextBillDate(lastBillDate: string | null, today: string): string {
  const [y, m] = today.split('-').map(Number);
  const monthEnd = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);
  if (!lastBillDate) return monthEnd(y, m);
  const dom = Number(lastBillDate.slice(8, 10));
  const at = (yy: number, mm: number) => {
    const end = monthEnd(yy, mm);
    return Number(end.slice(8, 10)) < dom ? end : `${yy}-${String(mm).padStart(2, '0')}-${String(dom).padStart(2, '0')}`;
  };
  const here = at(y, m);
  if (here >= today) return here;
  return m === 12 ? at(y + 1, 1) : at(y, m + 1);
}

// ---------------------------------------------------------------------------------------------------------------------
// When we pay

/** A purchase order's unbilled balance: delivered by its date (two weeks after the order without one), paid its days after. */
export function purchaseOrderDates(poDate: string, deliveryBy: string | null, paymentDays: number | null, today: string): Dates {
  const delivered = deliveryBy ?? addDays(poDate, 14);
  return around(addDays(delivered, paymentDays ?? DEFAULT_PO_PAYMENT_DAYS), 7, 14, today);
}

/**
 * A work order's next bills at the pace of the last 90 days: a month's worth (a third of what was billed in 90 days)
 * each month for up to three months, never more than its unbilled value. The first bill is taken as half a month away,
 * and each is paid at the order's days.
 */
export function workOrderRunRate(remaining: number, billedLast90: number, paymentDays: number, today: string): { amount: number; dates: Dates }[] {
  const monthly = billedLast90 / 3;
  if (!(monthly > 0) || !(remaining > 0)) return [];
  const out: { amount: number; dates: Dates }[] = [];
  let left = remaining;
  for (let i = 1; i <= 3 && left > 0.5; i++) {
    const amount = Math.min(monthly, left);
    left -= amount;
    out.push({ amount, dates: around(addDays(today, 15 + (i - 1) * 30 + paymentDays), 7, 14, today) });
  }
  return out;
}

/** The day of each month a salary run is paid, from today to the horizon. */
export function monthlyDates(payDay: number, today: string, horizon: string): string[] {
  const out: string[] = [];
  let [y, m] = today.split('-').map(Number);
  for (let i = 0; i < 5; i++) {
    const end = Number(new Date(Date.UTC(y, m, 0)).toISOString().slice(8, 10));
    const d = `${y}-${String(m).padStart(2, '0')}-${String(Math.min(payDay, end)).padStart(2, '0')}`;
    if (d >= today && d <= horizon) out.push(d);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** The statutory dues in the books are paid on the 20th: this month's when it is still to come, else next month's. */
export function statutoryDueDate(today: string): string {
  const [y, m, d] = today.split('-').map(Number);
  const dd = String(STATUTORY_DUE_DAY).padStart(2, '0');
  if (d <= STATUTORY_DUE_DAY) return `${y}-${String(m).padStart(2, '0')}-${dd}`;
  return m === 12 ? `${y + 1}-01-${dd}` : `${y}-${String(m + 1).padStart(2, '0')}-${dd}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// The weeks

/** The date an item lands on in each case: money in late and money out early is the low case; the reverse the high. */
function dateIn(item: CashFlowItemDto, scenario: keyof CashRange): string | null {
  if (scenario === 'likely') return item.likely;
  if (item.direction === 'IN') {
    if (scenario === 'low') return item.uncertain ? null : item.late;
    return item.early;
  }
  return scenario === 'low' ? item.early : item.late;
}

const zero = (): CashRange => ({ low: 0, likely: 0, high: 0 });
const SCENARIOS: (keyof CashRange)[] = ['low', 'likely', 'high'];

/** Thirteen weeks from the Monday of today's week; anything dated before the first week counts in it. */
export function forecastWeeks(opening: number, items: CashFlowItemDto[], today: string, count = FORECAST_WEEKS): CashWeekDto[] {
  const monday = mondayOf(today);
  const weeks: CashWeekDto[] = Array.from({ length: count }, (_, i) => ({
    start: addDays(monday, i * 7),
    end: addDays(monday, i * 7 + 6),
    in: zero(),
    out: zero(),
    closing: zero(),
    short: false,
    atRisk: false,
    reasons: [],
  }));
  const index = (d: string) => {
    if (d <= weeks[0].end) return 0;
    const i = Math.floor(daysBetween(monday, d) / 7);
    return i < count ? i : -1;
  };
  for (const item of items)
    for (const s of SCENARIOS) {
      const d = dateIn(item, s);
      if (!d) continue;
      const i = index(d);
      if (i < 0) continue;
      weeks[i][item.direction === 'IN' ? 'in' : 'out'][s] += item.amount;
    }
  const running: CashRange = { low: opening, likely: opening, high: opening };
  for (const w of weeks) {
    for (const s of SCENARIOS) {
      running[s] += w.in[s] - w.out[s];
      w.closing[s] = running[s];
    }
    w.short = w.closing.likely < -0.5;
    w.atRisk = !w.short && w.closing.low < -0.5;
  }
  for (const w of weeks) if (w.short || w.atRisk) w.reasons = weekReasons(w, items, today);
  return weeks;
}

const inWeek = (d: string, w: CashWeekDto, first: boolean) => d <= w.end && (first || d >= w.start);

/**
 * Why a week is short, a line each: the client bills that would have closed the gap but come later than the client's
 * days, the MSME bills due (paid within 45 days by law), and the largest other payments due that week.
 */
export function weekReasons(w: CashWeekDto, items: CashFlowItemDto[], today: string): string[] {
  const first = w.start <= today;
  const out: string[] = [];
  const late = items
    .filter((i) => i.kind === 'CLIENT_BILL' && (i.overdue || i.likely > w.end) && i.early <= w.end)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 2);
  for (const i of late) out.push(i.overdue ? `${i.label} (${rupees(i.amount)}) is past the client's usual days: ${lower(i.why)}` : `${i.label} (${rupees(i.amount)}) may not come in time: ${lower(i.why)}`);
  const due = items.filter((i) => i.direction === 'OUT' && inWeek(i.likely, w, first));
  const msme = due.filter((i) => i.msme);
  if (msme.length) out.push(`${rupees(msme.reduce((s, i) => s + i.amount, 0))} of MSME bills due (${msme.length === 1 ? '1 bill' : `${msme.length} bills`}), paid within 45 days by law`);
  const others = due.filter((i) => !i.msme).sort((a, b) => b.amount - a.amount).slice(0, 3);
  for (const i of others) out.push(`${CASH_FLOW_KIND_LABELS[i.kind].replace(/s$/, '')}: ${i.label}, ${rupees(i.amount)}${i.overdue ? ' (overdue)' : ''}`);
  return out;
}
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Outflows that can wait past a short week without breaking a law or a lender: not MSME, salaries, EMIs, dues or site funds. */
const HOLDABLE: CashFlowKind[] = ['VENDOR_BILL', 'SUBCONTRACT_BILL', 'PURCHASE_ORDER', 'WORK_ORDER'];

/**
 * What to chase and what to hold. Chase: client bills past their days, and those expected after the first short (or at
 * risk) week. Hold: payments that can wait due up to that week. Largest first, eight of each.
 */
export function chaseAndHold(items: CashFlowItemDto[], weeks: CashWeekDto[]): { chase: CashFlowItemDto[]; hold: CashFlowItemDto[]; squeeze: CashWeekDto | null } {
  const squeeze = weeks.find((w) => w.short || w.atRisk) ?? null;
  const byAmount = (a: CashFlowItemDto, b: CashFlowItemDto) => b.amount - a.amount;
  const chase = items.filter((i) => i.kind === 'CLIENT_BILL' && (i.overdue || (squeeze !== null && i.likely > squeeze.end))).sort(byAmount).slice(0, 8);
  const hold = squeeze ? items.filter((i) => i.direction === 'OUT' && HOLDABLE.includes(i.kind) && !i.msme && i.likely <= squeeze.end).sort(byAmount).slice(0, 8) : [];
  return { chase, hold, squeeze };
}

/** The week with the lowest likely balance. */
export const lowestWeek = (weeks: CashWeekDto[]) => weeks.reduce((m, w) => (w.closing.likely < m.closing.likely ? w : m), weeks[0]);

/** Likely totals by kind over the horizon (anything dated before the first week counts). */
export function totalsByKind(items: CashFlowItemDto[], weeks: CashWeekDto[]): { kind: CashFlowKind; direction: 'IN' | 'OUT'; amount: number }[] {
  const end = weeks[weeks.length - 1].end;
  const by = new Map<CashFlowKind, { kind: CashFlowKind; direction: 'IN' | 'OUT'; amount: number }>();
  for (const i of items) {
    if (i.likely > end) continue;
    const t = by.get(i.kind) ?? { kind: i.kind, direction: i.direction, amount: 0 };
    t.amount += i.amount;
    by.set(i.kind, t);
  }
  return [...by.values()].sort((a, b) => (a.direction === b.direction ? b.amount - a.amount : a.direction === 'IN' ? -1 : 1));
}

// ---------------------------------------------------------------------------------------------------------------------
// How far out an old forecast was

/** The forecast made on `madeOn` for the week ending `weekEnd`, against the books' balance that day. */
export function forecastError(madeOn: string, weeks: CashWeekDto[], weekEnd: string, actual: number): ForecastErrorDto | null {
  const w = weeks.find((x) => x.end === weekEnd);
  if (!w) return null;
  const error = actual - w.closing.likely;
  return {
    madeOn,
    weekEnd,
    forecast: w.closing,
    actual,
    error,
    errorPct: Math.abs(actual) > 0.5 ? Math.round((Math.abs(error) / Math.abs(actual)) * 1000) / 10 : null,
    withinRange: actual >= Math.min(w.closing.low, w.closing.high) - 0.5 && actual <= Math.max(w.closing.low, w.closing.high) + 0.5,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// The payment clause, for a reminder

/**
 * The contract's payment clause in a page of its text: the first numbered clause ("7.2 The Department shall pay …")
 * that speaks of paying within a number of days, and those days. Null when the page has none.
 */
export function paymentClause(text: string): { no: string; text: string; days: number | null } | null {
  const flat = text.replace(/\s+/g, ' ');
  const re = /(\d+\.\d+)\s+(.+?\.)(?=\s+\d+\.\d+\s|\s+Clause\s|\s+Page\s\d|\s*$)/g;
  for (const m of flat.matchAll(re)) {
    const body = m[2];
    if (!/\bpa(y|id|yment)\b/i.test(body) || !/\b\d+ days\b/i.test(body)) continue;
    const days = /within (\d+) days/i.exec(body);
    return { no: m[1], text: `${m[1]} ${body}`, days: days ? Number(days[1]) : null };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Replay: what the payment-timing rule would have said on a past day, against what was paid

export interface PastBill {
  client: string;
  sentDate: string;
  paidDate: string | null;
  amount: number;
  contractDays: number | null;
}

/**
 * On `asOf`, the receipts expected in the next `days` from the bills open then (each client's timing from the bills it
 * had paid by then), as a low, likely and high total, against what those bills actually brought in over the same days.
 */
export function replayReceipts(bills: PastBill[], asOf: string, days = 28): { forecast: CashRange; actual: number; open: number } {
  const end = addDays(asOf, days - 1);
  const forecast = zero();
  let actual = 0;
  let open = 0;
  for (const b of bills) {
    if (b.sentDate > asOf || (b.paidDate !== null && b.paidDate < asOf)) continue;
    open += 1;
    const history = bills.filter((h) => h.client === b.client && h.paidDate !== null && h.paidDate < asOf).map((h) => ({ sentDate: h.sentDate, paidDate: h.paidDate! }));
    const d = clientBillDates(b.sentDate, payTiming(history, b.contractDays), asOf);
    if (d.late <= end) forecast.low += b.amount;
    if (d.likely <= end) forecast.likely += b.amount;
    if (d.early <= end) forecast.high += b.amount;
    if (b.paidDate !== null && b.paidDate <= end) actual += b.amount;
  }
  return { forecast, actual, open };
}

/**
 * On `asOf`, the bills to pay in the next `days` (open then and due by the window's end, anything overdue counted) against
 * what was paid on those bills in the window: how far the due dates stand for when money actually goes out.
 */
export function replayPayments(bills: { dueDate: string; paidDate: string | null; billDate: string; amount: number }[], asOf: string, days = 28): { forecast: number; actual: number; open: number } {
  const end = addDays(asOf, days - 1);
  let forecast = 0;
  let actual = 0;
  let open = 0;
  for (const b of bills) {
    if (b.billDate > asOf || (b.paidDate !== null && b.paidDate < asOf)) continue;
    open += 1;
    if (b.dueDate <= end) forecast += b.amount;
    if (b.paidDate !== null && b.paidDate <= end) actual += b.amount;
  }
  return { forecast, actual, open };
}
