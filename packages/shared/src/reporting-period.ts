/**
 * The month a screen opens on (ARCHITECTURE "Reporting period"). For the first days of a month the new one holds
 * almost nothing, so a figure for "this month" reads zero or a loss on the day people look at the month's numbers. Until
 * `MONTH_SETTLES_ON`, a screen opens on the last full month instead, and on the month so far after that.
 */
export const MONTH_SETTLES_ON = 7;

/** `YYYY-MM` of the month to open on, from today's `YYYY-MM-DD`. */
export function reportingMonth(today: string): string {
  const [y, m, d] = today.split('-').map(Number);
  if (d >= MONTH_SETTLES_ON) return today.slice(0, 7);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** Whether the month to open on is still running (its figures are "so far"). */
export const reportingMonthRunning = (today: string): boolean => reportingMonth(today) === today.slice(0, 7);
