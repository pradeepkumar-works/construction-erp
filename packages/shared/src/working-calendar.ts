/**
 * Working calendar (ARCHITECTURE "Working calendar"): the days a project's schedule counts. Off, every day counts, as
 * before. On, the critical path, float, lags and the look-ahead count only working days: not the site's weekly days off,
 * its holidays (the company's and the site's own) or its breaks (a monsoon shutdown, a festival closure). Pure, tested in
 * `src/scripts/working-calendar-test.ts`.
 */
import { WEEKDAY_NAMES, isWeekday, type Weekday } from './staff';

export interface CalendarHoliday {
  date: string;
  name: string;
}

export interface CalendarBreak {
  from: string;
  to: string;
  reason: string;
}

export interface WorkingCalendar {
  /** Off: the schedule counts every day */
  on: boolean;
  /** Weekly days off, 0 Sunday to 6 Saturday */
  daysOff: number[];
  holidays: CalendarHoliday[];
  breaks: CalendarBreak[];
}

/** Every day a working day: a project whose calendar is off. */
export const EVERY_DAY: WorkingCalendar = { on: false, daysOff: [], holidays: [], breaks: [] };

/** At most this many weekly days off. */
export const MAX_DAYS_OFF = 3;
/** A break is at most this many days long. */
export const MAX_BREAK_DAYS = 200;

const DAY_MS = 86_400_000;
const dayNo = (d: string) => Math.floor(Date.parse(`${d.slice(0, 10)}T00:00:00Z`) / DAY_MS);
const fromDayNo = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);
const weekdayOf = (n: number) => new Date(n * DAY_MS).getUTCDay();

/** Why a day is not worked, in words ("Sunday", the holiday's name, the break's reason), or null on a working day. */
export function nonWorkingReason(cal: WorkingCalendar, date: string): string | null {
  if (!cal.on) return null;
  const d = date.slice(0, 10);
  const wd = weekdayOf(dayNo(d));
  if (cal.daysOff.includes(wd)) return WEEKDAY_NAMES[wd as Weekday];
  const h = cal.holidays.find((x) => x.date === d);
  if (h) return h.name;
  const b = cal.breaks.find((x) => x.from <= d && d <= x.to);
  return b ? b.reason : null;
}

export const isWorkingDay = (cal: WorkingCalendar, date: string) => nonWorkingReason(cal, date) === null;

/**
 * Counting on working days: `toIndex` numbers a day among the working days (a day off moves forward to the next working
 * day, or back to the one before), `fromIndex` turns the number back into a date. With the calendar off it is the plain
 * day count, so arithmetic on indexes is arithmetic on days.
 */
export interface DayClock {
  toIndex(date: string, snap?: 'forward' | 'back'): number;
  fromIndex(i: number): string;
}

const CALENDAR_DAYS: DayClock = { toIndex: (d) => dayNo(d), fromIndex: fromDayNo };

/** The clock for a calendar. Working days are listed from `origin` (default 2000-01-01) and further as asked for. */
export function dayClock(cal: WorkingCalendar, origin = '2000-01-01'): DayClock {
  if (!cal.on) return CALENDAR_DAYS;
  const holidays = new Set(cal.holidays.map((h) => dayNo(h.date)));
  const breaks = cal.breaks.map((b) => [dayNo(b.from), dayNo(b.to)] as const);
  const off = new Set(cal.daysOff);
  const works = (n: number) => !off.has(weekdayOf(n)) && !holidays.has(n) && !breaks.some(([f, t]) => n >= f && n <= t);
  const start = dayNo(origin);
  const days: number[] = []; // working day numbers, ascending
  let scanned = start - 1;
  const extendTo = (n: number) => {
    for (; scanned < n; ) {
      scanned++;
      if (works(scanned)) days.push(scanned);
    }
  };
  // The first index past the list: keep going until a working day turns up, giving up after ten years of none.
  const extendCount = (count: number) => {
    let guard = 0;
    while (days.length < count) {
      const before = days.length;
      extendTo(scanned + 366);
      guard = days.length === before ? guard + 1 : 0;
      if (guard > 10) throw new Error('The working calendar has no working days');
    }
  };
  // First position whose day is >= n.
  const lowerBound = (n: number) => {
    let lo = 0;
    let hi = days.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (days[mid] < n) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  return {
    toIndex(date, snap = 'forward') {
      const n = dayNo(date);
      if (n < start) return n - start; // before the origin every day counts; schedules never reach so far back
      extendTo(n);
      if (snap === 'back') return lowerBound(n + 1) - 1;
      extendCount(lowerBound(n) + 1);
      return lowerBound(n);
    },
    fromIndex(i) {
      if (i < 0) return fromDayNo(start + i);
      extendCount(i + 1);
      return fromDayNo(days[i]);
    },
  };
}

/** Working days from `start` to `end`, both counted; 0 when none. */
export function workingDaysIn(cal: WorkingCalendar, start: string, end: string): number {
  if (end < start) return 0;
  const c = dayClock(cal, start < '2000-01-01' ? start : undefined);
  return Math.max(0, c.toIndex(end, 'back') - c.toIndex(start, 'forward') + 1);
}

/** The day `n` working days after `date` (before, when negative); from a day off it counts from the next working day. */
export function addWorkingDays(cal: WorkingCalendar, date: string, n: number): string {
  const c = dayClock(cal, date < '2000-01-01' ? date : undefined);
  return c.fromIndex(c.toIndex(date, 'forward') + n);
}

/** The days off between two dates, each with why, for a chart to shade; weekly days off only when `weekly`. */
export function nonWorkingDays(cal: WorkingCalendar, from: string, to: string, weekly = true): { date: string; reason: string }[] {
  if (!cal.on || to < from) return [];
  const out: { date: string; reason: string }[] = [];
  for (let n = dayNo(from); n <= dayNo(to); n++) {
    const d = fromDayNo(n);
    if (!weekly && cal.daysOff.includes(weekdayOf(n))) {
      const rest = nonWorkingReason({ ...cal, daysOff: [] }, d);
      if (rest) out.push({ date: d, reason: rest });
      continue;
    }
    const r = nonWorkingReason(cal, d);
    if (r) out.push({ date: d, reason: r });
  }
  return out;
}

/** The working week in words: "Monday to Saturday", "every day", "Monday to Friday". */
export function workWeekWords(daysOff: number[]): string {
  const on = [1, 2, 3, 4, 5, 6, 0].filter((d) => !daysOff.includes(d)) as Weekday[];
  if (on.length === 7) return 'every day';
  // A run in the week from Monday reads as "Monday to Saturday"; anything else is listed.
  const order = [1, 2, 3, 4, 5, 6, 0];
  const pos = on.map((d) => order.indexOf(d));
  const run = pos.every((p, i) => !i || p === pos[i - 1] + 1);
  if (run && on.length > 2) return `${WEEKDAY_NAMES[on[0]]} to ${WEEKDAY_NAMES[on[on.length - 1]]}`;
  return on.map((d) => WEEKDAY_NAMES[d]).join(', ');
}

/** What is wrong with a calendar's weekly days off, or null. */
export function daysOffProblem(daysOff: number[]): string | null {
  if (daysOff.some((d) => !isWeekday(d))) return 'Pick days of the week';
  if (new Set(daysOff).size !== daysOff.length) return 'Pick each day once';
  if (daysOff.length > MAX_DAYS_OFF) return `Pick at most ${MAX_DAYS_OFF} days off a week`;
  return null;
}

/** What is wrong with a break, or null: dates in order, not too long, a reason, and not on top of another break. */
export function breakProblem(b: CalendarBreak, others: CalendarBreak[] = []): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.from) || !/^\d{4}-\d{2}-\d{2}$/.test(b.to)) return 'Enter the first and last day';
  if (b.to < b.from) return 'The last day comes after the first';
  if (dayNo(b.to) - dayNo(b.from) + 1 > MAX_BREAK_DAYS) return `A break is at most ${MAX_BREAK_DAYS} days. Enter a longer one as two`;
  if (!b.reason.trim()) return 'Say why the site stops, such as Monsoon';
  const clash = others.find((o) => o.from <= b.to && b.from <= o.to);
  if (clash) return `It overlaps ${clash.reason} (${clash.from} to ${clash.to}). Change that one instead`;
  return null;
}

export interface CalendarBreakDto extends CalendarBreak {
  id: string;
  /** Working days it takes out of the schedule */
  days: number;
}

export interface WorkingCalendarDto {
  projectId: string;
  on: boolean;
  daysOff: number[];
  /** The staff weekly off at the site, offered as the starting day off */
  staffWeeklyOff: number;
  /** From a year ago, the company's and the site's */
  holidays: (CalendarHoliday & { siteOnly: boolean })[];
  breaks: CalendarBreakDto[];
  /** The working week in words */
  workWeek: string;
  canEdit: boolean;
}
