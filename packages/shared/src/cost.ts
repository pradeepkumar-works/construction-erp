/** Project cost rules, shared by the API and the web. */
import type { EquipmentRateUnit } from './enums';

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
