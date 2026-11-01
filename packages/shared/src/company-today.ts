import type { SubmissionType } from './enums';

/**
 * Management view on the phone: `GET /dashboard/company-today`, the company's day at a glance for owners,
 * directors, accounts and project managers. Each part is left out for a role that may not see its module, and covers
 * only the projects the caller sees.
 */

/** Payments made or receipts banked today, against yesterday. */
export interface CashDayDto {
  today: string;
  yesterday: string;
  countToday: number;
  /** Today's entries, largest first (at most 10) */
  rows: CashRowDto[];
}

export interface CashRowDto {
  /** Vendor or client name */
  party: string;
  /** Bill, PO or receipt reference, when there is one */
  reference: string | null;
  projectName: string;
  amount: string;
  /** Web page of the bill it settles, when there is one */
  href: string | null;
}

/** What is owed to us or by us, with the overdue part. */
export interface DuesDto {
  outstanding: string;
  overdue: string;
  overdueCount: number;
  /** Open bills, most overdue first (at most 10) */
  rows: DueRowDto[];
}

export interface DueRowDto {
  /** Bill number · party */
  label: string;
  projectName: string;
  outstanding: string;
  /** Days past due; 0 or less when not yet due */
  daysOverdue: number;
  href: string | null;
}

export interface AttendanceTodayDto {
  /** Staff marked present (a half day counts) */
  staffPresent: number;
  staffAbsent: number;
  /** Active staff on the roll (for a project manager, those posted at their sites) */
  staffTotal: number;
  /** Labour on the day's attendance sheets plus named workers present at the roll call */
  labour: number;
  /** Active sites with attendance recorded today */
  sitesReported: number;
  sites: number;
  /** Each active site, those not reported first */
  rows: { projectId: string; projectName: string; staffPresent: number; labour: number; reported: boolean }[];
}

export interface FuelTodayDto {
  /** Per fuel item, across the sites */
  items: { itemName: string; unit: string; issued: string; closing: string; sitesBelowMin: number }[];
  /** Each site and fuel item with stock or movement today, lowest closing first */
  rows: { projectId: string; projectName: string; itemName: string; unit: string; issued: string; closing: string; belowMin: boolean }[];
}

export interface PurchaseTodayDto {
  /** Approved material requests with something still to order */
  requestsToOrder: number;
  /** Approved orders not fully received */
  ordersOpen: number;
  ordersOpenValue: string;
  ordersLate: number;
  /** Goods received today */
  grnsToday: number;
  /** Receipts against orders that QA/QC has not checked */
  grnsAwaitingCheck: number;
  /** Late orders first, then the oldest requests (at most 10) */
  rows: { kind: 'ORDER' | 'REQUEST'; label: string; projectName: string; amount: string | null; daysLate: number; href: string }[];
}

export interface ApprovalsByModuleDto {
  total: number;
  /** Sum of the amounts of entries that carry one; null when the role does not see amounts */
  amount: string | null;
  /** Days the oldest entry has waited */
  oldestDays: number | null;
  /** Most waiting first */
  modules: { type: SubmissionType; count: number; amount: string | null; oldestDays: number }[];
}

export interface WaitingWithOthersTodayDto {
  count: number;
  amount: string | null;
  oldestDays: number | null;
}

export interface CompanyTodayDto {
  date: string;
  yesterday: string;
  payments?: CashDayDto;
  receipts?: CashDayDto;
  receivables?: DuesDto;
  payables?: DuesDto;
  attendance?: AttendanceTodayDto;
  fuel?: FuelTodayDto;
  purchase?: PurchaseTodayDto;
  approvals?: ApprovalsByModuleDto;
  waitingWithOthers?: WaitingWithOthersTodayDto;
}

/** Most rows a tile's list carries. */
export const COMPANY_TODAY_ROWS = 10;
