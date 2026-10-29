import type { NextBillDto } from './next-bill';
import type { RoleKey } from './enums';
import { canKeepBooks } from './permissions';

/**
 * Cash forecast and billing readiness (AI item 122): the bank and cash balance from the books, 13 weeks of money in and
 * out as a low, likely and high range, why each short week is short, what to chase or hold, and how far last month's
 * forecast was out. The rules are in `apps/api/src/cash-forecast/cash-forecast-rules.ts`.
 */

export const FORECAST_WEEKS = 13;
/** A client's payment days are spread at least this much either side of their average for the low and high case. */
export const MIN_PAY_SPREAD_DAYS = 7;
/** Without two paid bills from a client, their contract days are used, spread this much either side. */
export const CONTRACT_PAY_SPREAD_DAYS = 14;
/** The forecast checked against what happened was made this many weeks ago. */
export const FORECAST_ERROR_WEEKS = 4;
/** A purchase order is paid this many days after delivery when it names no payment days. */
export const DEFAULT_PO_PAYMENT_DAYS = 30;
/** Statutory dues in the books are paid on this day of the next month (GST returns; TDS falls due earlier). */
export const STATUTORY_DUE_DAY = 20;

/** Finance and management: whoever keeps the books. */
export const canSeeCashForecast = (role: RoleKey) => canKeepBooks(role);

export const CASH_FLOW_KINDS = [
  'CLIENT_BILL',
  'UNBILLED_WORK',
  'VENDOR_BILL',
  'SUBCONTRACT_BILL',
  'PURCHASE_ORDER',
  'WORK_ORDER',
  'SALARY',
  'LOAN_EMI',
  'STATUTORY',
  'PAYMENT_REQUEST',
] as const;
export type CashFlowKind = (typeof CASH_FLOW_KINDS)[number];

export const CASH_FLOW_KIND_LABELS: Record<CashFlowKind, string> = {
  CLIENT_BILL: 'Client bills sent',
  UNBILLED_WORK: 'Measured work not billed',
  VENDOR_BILL: 'Vendor bills',
  SUBCONTRACT_BILL: 'Subcontractor bills',
  PURCHASE_ORDER: 'Open purchase orders',
  WORK_ORDER: 'Open work orders',
  SALARY: 'Salaries',
  LOAN_EMI: 'Machine loan EMIs',
  STATUTORY: 'Statutory dues',
  PAYMENT_REQUEST: 'Approved advances and fund requests',
};

export interface CashRange {
  low: number;
  likely: number;
  high: number;
}

/** One expected receipt or payment, with when it may come: early, likely, late. */
export interface CashFlowItemDto {
  key: string;
  kind: CashFlowKind;
  direction: 'IN' | 'OUT';
  /** "RA-7 Tower B", "PO-2026-0004 Utkal Cement" */
  label: string;
  projectId: string | null;
  projectCode: string | null;
  amount: number;
  early: string;
  likely: string;
  late: string;
  /** Left out of the low case (work not yet billed) */
  uncertain: boolean;
  /** Why this date: "sent 23 days ago; this client averages 41 days" */
  why: string;
  /** A micro or small enterprise, paid within 45 days by law */
  msme: boolean;
  /** Its date has passed: a client bill past the client's days, a bill past its due date */
  overdue: boolean;
  href: string | null;
}

export interface CashWeekDto {
  start: string;
  end: string;
  in: CashRange;
  out: CashRange;
  /** Balance at the week's end */
  closing: CashRange;
  /** The likely balance is below zero */
  short: boolean;
  /** The low balance is below zero, the likely not */
  atRisk: boolean;
  /** Why a short or at-risk week is short, a line each */
  reasons: string[];
}

export interface ForecastErrorDto {
  /** The day the forecast was made, and the week it is checked on */
  madeOn: string;
  weekEnd: string;
  forecast: CashRange;
  actual: number;
  /** actual − likely, ₹ */
  error: number;
  /** |error| ÷ actual, in % (null when the actual is 0) */
  errorPct: number | null;
  withinRange: boolean;
}

export interface CashForecastDto {
  asOf: string;
  opening: { bank: number; cash: number; total: number };
  weeks: CashWeekDto[];
  items: CashFlowItemDto[];
  /** Totals over the 13 weeks, likely case, by kind */
  byKind: { kind: CashFlowKind; direction: 'IN' | 'OUT'; amount: number }[];
  firstShort: string | null;
  lowest: { week: string; closing: CashRange };
  /** Client bills worth chasing before the first short week, largest first */
  chase: CashFlowItemDto[];
  /** Payments that can wait past it (not MSME, salaries, EMIs or dues), largest first */
  hold: CashFlowItemDto[];
  error: ForecastErrorDto | null;
  assumptions: string[];
}

/** Billing readiness for one project: money earned and not yet asked for, or asked for and late. */
export interface BillingReadinessRowDto {
  projectId: string;
  projectCode: string;
  projectName: string;
  clientName: string | null;
  /** Approved measurements in no RA bill, at BOQ rates */
  unbilledValue: number;
  unbilledSheets: number;
  oldestUnbilled: string | null;
  /** Approved RA bills not sent to the client */
  notSent: { billId: string; label: string; billDate: string; amount: number }[];
  /** Sent bills not fully paid, the longest waiting first; `late` once past the days the client takes (or the contract's) */
  unpaid: { billId: string; label: string; sentDate: string; daysOutstanding: number; expectedDays: number; outstanding: number; late: boolean }[];
  /** The next bill (intelligence quick win Q7): billable now and by the next month end at the current pace */
  next: NextBillDto;
}

export interface BillingReadinessDto {
  asOf: string;
  rows: BillingReadinessRowDto[];
  /** pastDue: the late part of `unpaid` */
  totals: { unbilled: number; notSent: number; unpaid: number; pastDue: number; nextNow: number; nextAtBillBy: number };
  /** The month end the next bills run to */
  billBy: string;
}
