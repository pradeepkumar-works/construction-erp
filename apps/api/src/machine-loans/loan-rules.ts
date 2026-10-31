import { Prisma } from '@prisma/client';
import { EMI_DUE_DAYS, LOAN_MAX_MONTHS, LOAN_MAX_RATE, type EmiStage } from '@erp/shared';
import { addDays, daysBetween } from '../warnings/warning-rules';

/**
 * Machine finance's figures, with no database: the EMI of a loan, its schedule (each month's interest on
 * what is owed at the month's start, the rest of the EMI repaying the loan, the last EMI clearing what is left), where
 * an EMI stands on a day, and what is repaid, paid in interest, owed and overdue. Tested in `src/scripts/loans-test.ts`.
 */
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const ZERO = D(0);
const r2 = (v: Prisma.Decimal) => v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

export interface LoanTerms {
  amount: Prisma.Decimal.Value;
  /** Yearly rate, % */
  ratePct: Prisma.Decimal.Value;
  tenureMonths: number;
  /** The lender's EMI; left out, the formula's (to the rupee) */
  emi?: Prisma.Decimal.Value | null;
  /** YYYY-MM-DD; later EMIs fall on the same day of each month (the month's last day when it is shorter) */
  firstEmiDate: string;
}

/**
 * The EMI that repays `amount` over `months` at `ratePct` a year, monthly rests: P·r·(1+r)^n / ((1+r)^n − 1), to the
 * rupee as lenders round it. At no interest it is the amount over the months.
 */
export function emiFor(amount: Prisma.Decimal.Value, ratePct: Prisma.Decimal.Value, months: number): Prisma.Decimal {
  const p = D(amount);
  const r = D(ratePct).div(1200);
  if (r.isZero()) return p.div(months).toDecimalPlaces(0, Prisma.Decimal.ROUND_UP);
  const f = r.add(1).pow(months);
  return p.mul(r).mul(f).div(f.sub(1)).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
}

/** `ymd` plus `n` months, on the same day, or the month's last day when the month is shorter. */
export function addMonths(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last))).toISOString().slice(0, 10);
}

export interface ScheduleRow {
  no: number;
  dueDate: string;
  opening: Prisma.Decimal;
  interest: Prisma.Decimal;
  principal: Prisma.Decimal;
  emi: Prisma.Decimal;
  closing: Prisma.Decimal;
}

/**
 * The EMI schedule. Each month's interest is the rate's twelfth on what is owed at its start, to the paisa; the rest
 * of the EMI repays the loan. The last EMI (the tenure's, or the one that would overpay with a lender's higher EMI)
 * repays all that is left with its interest, so the loan ends at nothing.
 */
export function schedule(t: LoanTerms): ScheduleRow[] {
  const r = D(t.ratePct).div(1200);
  const emi = t.emi ? D(t.emi) : emiFor(t.amount, t.ratePct, t.tenureMonths);
  const rows: ScheduleRow[] = [];
  let owed = D(t.amount);
  for (let no = 1; no <= t.tenureMonths && owed.gt(0); no++) {
    const interest = r2(owed.mul(r));
    let principal = emi.sub(interest);
    if (no === t.tenureMonths || principal.gte(owed)) principal = owed;
    if (principal.lt(0)) principal = ZERO;
    rows.push({ no, dueDate: addMonths(t.firstEmiDate, no - 1), opening: owed, interest, principal, emi: principal.add(interest), closing: owed.sub(principal) });
    owed = owed.sub(principal);
  }
  return rows;
}

/** The rest of a schedule from EMI `from` on, as left by the EMIs before it: what an undone payment goes back to. */
export function scheduleFrom(t: LoanTerms, from: number): ScheduleRow[] {
  return schedule(t).filter((r) => r.no >= from);
}

/**
 * Closing a loan early on its next EMI (a foreclosure): that EMI repays all that is owed at its start, with `interest`
 * (the lender's figure, else the month's interest); the later EMIs go.
 */
export function foreclosure(next: { opening: Prisma.Decimal.Value; interest: Prisma.Decimal.Value }, interest?: Prisma.Decimal.Value | null) {
  const principal = D(next.opening);
  const i = interest === undefined || interest === null ? D(next.interest) : r2(D(interest));
  return { principal, interest: i, emi: principal.add(i), closing: ZERO };
}

/** Why the terms make no loan, or null. */
export function termsProblem(t: LoanTerms & { sanctionDate: string }): string | null {
  const amount = D(t.amount);
  const rate = D(t.ratePct);
  if (amount.lte(0)) return 'Enter the amount of the loan';
  if (rate.lt(0) || rate.gt(LOAN_MAX_RATE)) return `The rate is a yearly percentage between 0 and ${LOAN_MAX_RATE}`;
  if (!Number.isInteger(t.tenureMonths) || t.tenureMonths < 1 || t.tenureMonths > LOAN_MAX_MONTHS) return `The tenure is 1 to ${LOAN_MAX_MONTHS} months`;
  if (t.firstEmiDate < t.sanctionDate) return 'The first EMI falls on or after the sanction date';
  if (t.emi !== undefined && t.emi !== null) {
    const emi = D(t.emi);
    if (emi.lte(0)) return 'Enter the EMI, or leave it blank to work it out';
    const firstInterest = r2(amount.mul(rate.div(1200)));
    if (emi.lte(firstInterest)) return `An EMI of ₹${emi.toFixed(2)} does not cover the first month's interest of ₹${firstInterest.toFixed(2)}, so the loan would never be repaid`;
    // A lender's EMI may differ from the formula by its rounding, not by enough to leave a lump at the end.
    const rows = schedule(t);
    const last = rows[rows.length - 1];
    if (last && rows.length === t.tenureMonths && last.emi.gt(emi.mul(1.5)) && t.tenureMonths > 1)
      return `At ₹${emi.toFixed(2)} a month the last EMI would be ₹${last.emi.toFixed(2)}. Check the EMI or the tenure.`;
  }
  return null;
}

/** Where an EMI stands on `today`. */
export function emiStage(e: { dueDate: string; paidOn: string | null }, today: string): EmiStage {
  if (e.paidOn) return 'PAID';
  if (e.dueDate < today) return 'OVERDUE';
  return e.dueDate <= addDays(today, EMI_DUE_DAYS) ? 'DUE' : 'LATER';
}

export interface EmiState {
  no: number;
  dueDate: string;
  principal: Prisma.Decimal.Value;
  interest: Prisma.Decimal.Value;
  emi: Prisma.Decimal.Value;
  paidOn: string | null;
}

export interface LoanPosition {
  emisPaid: number;
  principalRepaid: Prisma.Decimal;
  interestPaid: Prisma.Decimal;
  /** Principal still owed */
  outstanding: Prisma.Decimal;
  interestToCome: Prisma.Decimal;
  overdueCount: number;
  overdueAmount: Prisma.Decimal;
  /** Days the oldest unpaid EMI is late, 0 when none is */
  overdueDays: number;
  /** EMIs falling due in the 30 days from today */
  dueIn30: Prisma.Decimal;
  next: (EmiState & { stage: EmiStage }) | null;
  /** Interest paid in the financial year (April to March) that `today` is in */
  interestThisYear: Prisma.Decimal;
}

/** What a loan's EMIs add up to on `today`: repaid, owed, overdue and next. */
export function loanPosition(amount: Prisma.Decimal.Value, emis: EmiState[], today: string): LoanPosition {
  const rows = [...emis].sort((a, b) => a.no - b.no);
  const paid = rows.filter((e) => e.paidOn);
  const open = rows.filter((e) => !e.paidOn);
  const sum = (xs: EmiState[], f: (e: EmiState) => Prisma.Decimal.Value) => xs.reduce((s, e) => s.add(f(e)), ZERO);
  const principalRepaid = sum(paid, (e) => e.principal);
  const overdue = open.filter((e) => e.dueDate < today);
  const in30 = addDays(today, 30);
  const fyStart = `${Number(today.slice(5, 7)) >= 4 ? today.slice(0, 4) : Number(today.slice(0, 4)) - 1}-04-01`;
  const next = open[0] ?? null;
  return {
    emisPaid: paid.length,
    principalRepaid,
    interestPaid: sum(paid, (e) => e.interest),
    outstanding: D(amount).sub(principalRepaid),
    interestToCome: sum(open, (e) => e.interest),
    overdueCount: overdue.length,
    overdueAmount: sum(overdue, (e) => e.emi),
    overdueDays: overdue.length ? daysBetween(overdue[0].dueDate, today) : 0,
    dueIn30: sum(
      open.filter((e) => e.dueDate >= today && e.dueDate <= in30),
      (e) => e.emi,
    ),
    next: next ? { ...next, stage: emiStage(next, today) } : null,
    interestThisYear: sum(
      paid.filter((e) => e.paidOn! >= fyStart && e.paidOn! <= today),
      (e) => e.interest,
    ),
  };
}

/** Why EMI `no` cannot be paid on `paidOn`, or null: EMIs are paid in order, and not before the loan was sanctioned. */
export function payProblem(emis: EmiState[], no: number, paidOn: string, sanctionDate: string, today: string): string | null {
  const e = emis.find((x) => x.no === no);
  if (!e) return 'No such EMI';
  if (e.paidOn) return `EMI ${no} is already paid`;
  const earlier = emis.filter((x) => x.no < no && !x.paidOn).sort((a, b) => a.no - b.no)[0];
  if (earlier) return `Pay EMI ${earlier.no} first: EMIs are paid in order`;
  if (paidOn < sanctionDate) return 'The EMI is paid on or after the sanction date';
  if (paidOn > today) return 'Record an EMI once it is paid, not before';
  return null;
}

/** The machine's cost of finance: interest paid over the hours it has worked since the loan; null with no hours. */
export function interestPerHour(interestPaid: Prisma.Decimal.Value, hours: Prisma.Decimal.Value): Prisma.Decimal | null {
  const h = D(hours);
  return h.gt(0) ? r2(D(interestPaid).div(h)) : null;
}
