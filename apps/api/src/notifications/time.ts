/** Date helpers for the scheduled jobs. Site staff work in local time, so "today" is taken in NOTIFICATION_TIMEZONE. */

export const JOB_TIMEZONE = process.env.NOTIFICATION_TIMEZONE || 'Asia/Kolkata';

const parts = (d: Date, timeZone: string) => {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const out: Record<string, number> = {};
  for (const p of fmt.formatToParts(d)) if (p.type !== 'literal') out[p.type] = Number(p.value);
  return out;
};

/** YYYY-MM-DD of `now` in the given time zone. */
export function todayIn(timeZone = JOB_TIMEZONE, now = new Date()): string {
  const p = parts(now, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** "HH:mm" wall-clock of `now` in the given time zone. */
export function wallClockIn(timeZone = JOB_TIMEZONE, now = new Date()): string {
  const p = parts(now, timeZone);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}
