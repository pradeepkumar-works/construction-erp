import type { RoleKey, SubmissionType } from './enums';
import { canViewCost } from './permissions';

/**
 * Management dashboard and reports (ARCHITECTURE "Management dashboard and reports"): the portfolio for the MD, one
 * project's drill-down, and printable reports (monthly MIS, profit and loss, work in progress, receivables, payables,
 * procurement, labour, stock, approvals). Every figure is read through the modules' own services; the arithmetic is pure
 * in `apps/api/src/management/management-rules.ts`.
 */

/** Who opens the dashboard and the reports: those who see project cost (admin, management, accounts, and a project
 *  manager for their own projects). */
export const canSeeManagement = (role: RoleKey) => canViewCost(role);

/** Below this share of the work done, forecasts (cost and margin at completion) are left out: too early to mean anything. */
export const FORECAST_MIN_DONE_PCT = 5;
/** Work done and not billed for this many days is worth a word; twice as long needs action. */
export const UNBILLED_WATCH_DAYS = 45;
/** Approvals waiting longer than this many days count as old. */
export const APPROVAL_OLD_DAYS = 7;

export type HealthLevel = 'good' | 'watch' | 'act';
export const HEALTH_LABELS: Record<HealthLevel, string> = { good: 'On course', watch: 'Watch', act: 'Act now' };

/** What makes a project need attention, in words, with the rupees or days behind it. */
export interface HealthReasonDto {
  /** schedule, cost, billing, collection, approvals, risk */
  key: 'schedule' | 'cost' | 'billing' | 'collection' | 'approvals' | 'risk';
  level: Exclude<HealthLevel, 'good'>;
  text: string;
}

export type PortfolioScheduleState = 'NO_PLAN' | 'ON_TRACK' | 'BEHIND' | 'LATE' | 'DONE';
export const PORTFOLIO_SCHEDULE_LABELS: Record<PortfolioScheduleState, string> = {
  NO_PLAN: 'No plan',
  ON_TRACK: 'On track',
  BEHIND: 'Behind plan',
  LATE: 'Finishing late',
  DONE: 'Complete',
};

export interface PortfolioScheduleDto {
  state: PortfolioScheduleState;
  /** Physical progress, % */
  done: number;
  /** % planned by today from the activities' dates; null without dated activities */
  planned: number | null;
  /** % of the time from start to completion gone; null without both dates */
  elapsed: number | null;
  lateActivities: number;
  /** End date plus extensions granted */
  completionDate: string | null;
  /** The latest planned finish of an activity */
  plannedFinish: string | null;
  /** Days the plan (or, past the completion date, today) runs beyond the completion date; null when not late */
  daysLate: number | null;
}

/** One project's money, to date, in rupees as strings. */
export interface PortfolioMoneyDto {
  /** Contract value plus approved variations; null without a contract value */
  contractValue: string | null;
  /** The BOQ at its current quantities */
  boqValue: string;
  /** Each BOQ item at the larger of its approved progress and its approved measurement, at the BOQ rate. Supply items
   *  with no activity count from their measurement. */
  workDone: string;
  /** Approved measurement sheets at the BOQ rate */
  measured: string;
  /** Approved RA bills: work value plus price variation, before GST */
  billed: string;
  /** Of that, in bills the client certified */
  certified: string;
  /** Of that, the share the client has settled (received plus their deductions) */
  paid: string;
  /** Work done not yet billed (never below zero) */
  unbilled: string;
  /** The last bill's "measured up to" date; null before the first bill */
  billedUpTo: string | null;
  /** Days since `billedUpTo` (or the start) while something is unbilled; null when nothing is */
  unbilledDays: number | null;
  /** Client bills sent and not settled, with GST */
  outstanding: string;
  /** Of that, sent more than 90 days ago */
  over90: string;
  retentionHeld: string;
  /** Received in the bank to date */
  received: string;
  /** Cost booked to date (site expenses, material issued, machinery, labour, subcontractors) */
  cost: string;
  /** Approved purchase and work orders still open, less what is billed against them, before GST */
  committed: string;
  /** Cost budget at completion; null without a budget */
  budget: string | null;
  /** Actual plus the budget for the work still to do; null without a budget or below FORECAST_MIN_DONE_PCT done */
  forecastCost: string | null;
  /** Work done less cost */
  margin: string;
  /** margin ÷ work done, %; null when nothing is done */
  marginPct: number | null;
  /** Contract value less the forecast cost; null when either is */
  forecastMargin: string | null;
}

export interface PortfolioProjectDto {
  projectId: string;
  code: string;
  name: string;
  type: string;
  status: string;
  clientName: string | null;
  projectManagerName: string | null;
  schedule: PortfolioScheduleDto;
  money: PortfolioMoneyDto;
  /** Entries waiting for approval in the project, whoever decides them */
  approvals: { waiting: number; oldestDays: number | null };
  /** Open delays and risks; high is a score of 15 or more */
  risks: { open: number; high: number };
  health: HealthLevel;
  reasons: HealthReasonDto[];
}

export interface ApprovalAgeingDto {
  waiting: number;
  oldestDays: number | null;
  /** Waiting 0–2, 3–7, 8–15 and over 15 days */
  buckets: [number, number, number, number];
  byType: { type: SubmissionType; count: number; oldestDays: number }[];
}

export interface PortfolioTotalsDto {
  projects: number;
  active: number;
  contractValue: string;
  /** Contract value still to bill */
  orderBook: string;
  workDone: string;
  measured: string;
  billed: string;
  certified: string;
  paid: string;
  unbilled: string;
  outstanding: string;
  over90: string;
  retentionHeld: string;
  received: string;
  cost: string;
  committed: string;
  margin: string;
  marginPct: number | null;
}

/** Billed, received and cost by month, for the trend. */
export interface PortfolioMonthDto {
  /** YYYY-MM */
  month: string;
  billed: string;
  received: string;
  cost: string;
}

export interface PortfolioCashDto {
  today: number;
  lowest: number;
  lowestWeek: string;
  firstShort: string | null;
}

export interface AttentionItemDto {
  projectId: string;
  projectCode: string;
  projectName: string;
  level: Exclude<HealthLevel, 'good'>;
  key: HealthReasonDto['key'];
  text: string;
}

export interface PortfolioDto {
  asOf: string;
  totals: PortfolioTotalsDto;
  projects: PortfolioProjectDto[];
  approvals: ApprovalAgeingDto;
  months: PortfolioMonthDto[];
  /** The 13-week cash forecast's headline, for those who see it (`canSeeCashForecast`) */
  cash: PortfolioCashDto | null;
  /** Every reason that needs action or watching, the worst first */
  attention: AttentionItemDto[];
}

/** One project's drill-down: its portfolio row, cost by head against budget, the months, what waits and what is open. */
export interface PortfolioProjectDetailDto {
  asOf: string;
  project: PortfolioProjectDto;
  heads: { head: string; label: string; budget: string | null; actual: string; forecast: string | null }[];
  months: (PortfolioMonthDto & { workDone: string })[];
  openBills: { billId: string; label: string; stage: string; sentDate: string; outstanding: string; daysOutstanding: number }[];
  waiting: { type: SubmissionType; id: string; title: string; submittedByName: string; submittedAt: string; days: number; amount: string | null }[];
  risks: { id: string; riskNo: string; title: string; kind: string; score: number; daysLost: number | null; dueDate: string | null }[];
  orders: { kind: 'PO' | 'WO'; id: string; number: string; vendorName: string; date: string; value: string; billed: string; open: string }[];
}

/* ---------- reports ---------- */

export const MANAGEMENT_REPORT_KEYS = ['mis', 'profit-loss', 'wip', 'receivables', 'payables', 'procurement', 'labour', 'stock', 'approvals'] as const;
export type ManagementReportKey = (typeof MANAGEMENT_REPORT_KEYS)[number];

/** How a report's period is chosen: a month, a range of dates, or a day it stands at. */
export type ReportPeriodKind = 'month' | 'range' | 'asOf';

export interface ManagementReportInfo {
  key: ManagementReportKey;
  title: string;
  description: string;
  period: ReportPeriodKind;
}

export const MANAGEMENT_REPORTS: Record<ManagementReportKey, ManagementReportInfo> = {
  mis: { key: 'mis', title: 'Monthly MIS', description: 'The month and the year so far for every project: progress, work done, billing, collection, cost and margin, with what needs action.', period: 'month' },
  'profit-loss': { key: 'profit-loss', title: 'Project profit and loss', description: 'Billed against cost by head for each project, with orders still open and the margin forecast at completion.', period: 'range' },
  wip: { key: 'wip', title: 'Work in progress', description: 'Work done and not billed, billed and not certified, certified and not paid, project by project.', period: 'asOf' },
  receivables: { key: 'receivables', title: 'Receivables ageing', description: 'What clients owe by age, client by client and bill by bill, with retention held.', period: 'asOf' },
  payables: { key: 'payables', title: 'Payables ageing', description: 'What the company owes vendors and subcontractors by how far past due, with MSME bills at risk.', period: 'asOf' },
  procurement: { key: 'procurement', title: 'Procurement spend', description: 'Orders by vendor, material and project, rates paid, and how long requests take to be ordered and received.', period: 'range' },
  labour: { key: 'labour', title: 'Labour and attendance', description: 'Man-days by project, trade and contractor, the average and peak on site, and labour cost.', period: 'range' },
  stock: { key: 'stock', title: 'Stock position', description: 'Stock value by project and store, items below their minimum, and stock lying idle.', period: 'asOf' },
  approvals: { key: 'approvals', title: 'Approvals waiting', description: 'Entries waiting for a decision by type and project, and the ones waiting longest.', period: 'asOf' },
};

export type ReportColumnKind = 'text' | 'money' | 'qty' | 'pct' | 'date' | 'days' | 'count';
export type ReportCell = string | number | null;

export interface ReportColumnDto {
  key: string;
  label: string;
  kind: ReportColumnKind;
}

/** A row: a cell per column key, plus `_href` (where the row opens) when it has one. */
export type ReportRowDto = Record<string, ReportCell> & { _href?: string | null };

export interface ReportSectionDto {
  key: string;
  title: string;
  /** One line under the title: what the section counts */
  note?: string;
  columns: ReportColumnDto[];
  rows: ReportRowDto[];
  total?: ReportRowDto;
  /** Shown when there are no rows */
  empty?: string;
}

export interface ReportFigureDto {
  label: string;
  value: ReportCell;
  kind: ReportColumnKind;
  note?: string;
}

export interface ManagementReportDto {
  key: ManagementReportKey;
  title: string;
  /** The period in words: "October 2026", "1 Apr 2026 to 26 Oct 2026", "As of 26 Oct 2026" */
  period: string;
  from: string | null;
  to: string;
  /** The project it is limited to, else null for every project the reader sees */
  projectName: string | null;
  generatedAt: string;
  /** The paragraph the report opens with, written from its own figures (the Monthly MIS, intelligence quick win Q9) */
  commentary?: string | null;
  figures: ReportFigureDto[];
  sections: ReportSectionDto[];
  /** How the figures are worked out, for the last page */
  notes: string[];
}
