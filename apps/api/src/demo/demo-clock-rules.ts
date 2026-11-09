/*
 * The demo clock (ARCHITECTURE "Demo clock"): a demo company's records are dated around the day they were written, so
 * left alone they age and every card reads late. Each day the dates move forward by the days since the demo was last
 * dated, so the demo's "today" stays today. Pure arithmetic here; `redate.ts` moves the rows.
 */

const DAY_MS = 86_400_000;
const at = (d: string) => Date.parse(`${d}T00:00:00Z`);
const monthIndex = (d: string) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7)) - 1;

/** Whole days from the day the demo was dated to today; 0 when it is current (or dated ahead). */
export function demoShiftDays(datedOn: string, today: string): number {
  return Math.max(0, Math.round((at(today) - at(datedOn)) / DAY_MS));
}

/** Months a `YYYY-MM` field moves when the demo's day moves from `datedOn` to `today` (a salary run for last month stays last month's). */
export function demoShiftMonths(datedOn: string, today: string): number {
  return Math.max(0, monthIndex(today) - monthIndex(datedOn));
}

/** A `YYYY-MM` month `n` months on. */
export function monthPlus(month: string, n: number): string {
  const i = monthIndex(`${month}-01`) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
}

/** Columns that are never moved: when a token or a pairing code expires is about security, not the story. */
export const DEMO_CLOCK_SKIP_COLUMNS: ReadonlySet<string> = new Set(['expiresAt', 'pairCodeExpiresAt', 'tokensValidAfter']);

/** Tables never moved: sign-in records, push devices, and the companies themselves (moved apart, below). */
export const DEMO_CLOCK_SKIP_TABLES: ReadonlySet<string> = new Set(['Login', 'PushToken', 'Organization', 'PasswordToken', 'EnquiryToken', '_prisma_migrations']);
