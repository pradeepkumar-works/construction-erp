/** Project cost rules, shared by the API and the web. */
import type { EquipmentRateUnit, ExpenseCategory } from './enums';
import { EXPENSE_CATEGORY_LABELS } from './labels';

/** Days in a month when a monthly hire rate is spread over the days a machine was logged. */
export const DAYS_PER_MONTH = 30;

/**
 * Cost of one approved machinery log: hourly rates × hours worked, a daily rate per logged day,
 * a monthly rate ÷ 30 per logged day. Null when the machine has no rate.
 */
export function machineryLogCost(rate: string | number | null | undefined, unit: EquipmentRateUnit, hoursWorked: string | number): number | null {
  if (rate === null || rate === undefined || rate === '') return null;
  const r = Number(rate);
  if (!Number.isFinite(r)) return null;
  if (unit === 'HOUR') return r * Number(hoursWorked);
  if (unit === 'DAY') return r;
  return r / DAYS_PER_MONTH;
}

/** Cost heads, in the order they are shown. */
export const COST_HEADS = ['expenses', 'material', 'machinery', 'labour', 'subcontract'] as const;
export type CostHead = (typeof COST_HEADS)[number];
export const COST_HEAD_LABELS: Record<CostHead, string> = {
  expenses: 'Site expenses',
  material: 'Material issued',
  machinery: 'Machinery',
  labour: 'Labour',
  subcontract: 'Subcontractors',
};

/** Days a client is assumed to take to pay a bill when the contract does not say. */
export const DEFAULT_CLIENT_PAYMENT_DAYS = 30;

/**
 * Site staff salaries in project cost: a payslip's gross and the company's PF and ESI are its site's cost, a line of
 * site expenses beside the expense categories, dated the salary month's last day.
 */
export const SITE_STAFF = 'SITE_STAFF' as const;
export type CostExpenseCategory = ExpenseCategory | typeof SITE_STAFF;
export const COST_EXPENSE_LABELS: Record<CostExpenseCategory, string> = { ...EXPENSE_CATEGORY_LABELS, SITE_STAFF: 'Site staff salaries' };
/** The day a month's salaries count in cost: its last day. */
export const staffCostDate = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0));
