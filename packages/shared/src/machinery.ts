/** Rules for a machine's daily log, shared by the API, web and site app. */

/** Worked + idle + breakdown hours in one day cannot exceed this. */
export const MAX_LOG_HOURS = 24;

const num = (v: string | number | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

export interface MachineryHoursInput {
  hoursWorked: string | number | null | undefined;
  idleHours?: string | number | null;
  breakdownHours?: string | number | null;
  meterStart?: string | number | null;
  meterEnd?: string | number | null;
  breakdownNote?: string | null;
}

/** Returns the first problem with a log's hours, or null when it is consistent. */
export function machineryLogProblem(l: MachineryHoursInput): string | null {
  const worked = num(l.hoursWorked);
  const idle = num(l.idleHours) ?? 0;
  const down = num(l.breakdownHours) ?? 0;
  if (worked === null) return 'Hours worked is required';
  if (worked < 0 || idle < 0 || down < 0) return 'Hours cannot be negative';
  if (worked + idle + down > MAX_LOG_HOURS) return `Worked, idle and breakdown hours add up to more than ${MAX_LOG_HOURS}`;
  const start = num(l.meterStart);
  const end = num(l.meterEnd);
  if (start !== null && end !== null && end < start) return 'Meter reading at close is below the opening reading';
  if (down > 0 && !(l.breakdownNote ?? '').trim()) return 'Say what broke down when breakdown hours are entered';
  return null;
}
