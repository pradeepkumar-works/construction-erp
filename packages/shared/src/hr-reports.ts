/**
 * The HR reports' arithmetic (ARCHITECTURE "Management dashboard and reports", HR and payroll reports): who is on the roll
 * on a day, the moves over a period and attrition, length of service, the month's statutory due date and attendance.
 */

export interface RollDates {
  /** YYYY-MM-DD, null = before records began */
  joinedOn: string | null;
  /** YYYY-MM-DD, the last day, null = still employed */
  leftOn: string | null;
}

/** On the roll on a day: joined by then and not yet past their last day. */
export const onRollOn = (e: RollDates, day: string) => (!e.joinedOn || e.joinedOn <= day) && (!e.leftOn || e.leftOn >= day);

export interface HeadcountMoves {
  atStart: number;
  joined: number;
  left: number;
  atEnd: number;
  /** Left as a share of the average of the start and end, in per cent to one place; null when nobody was on the roll */
  attritionPct: number | null;
}

/**
 * Head count over a period: on the roll as it begins (joined before its first day, not gone before it) and as it ends
 * (joined by its last day, staying past it), who joined in it and whose last day fell in it, so start + joined − left =
 * end; someone whose last day is the period's last day has left. Someone who joined and left in the
 * period counts in both and at neither end.
 */
export function headcountMoves(staff: readonly RollDates[], from: string, to: string): HeadcountMoves {
  const atStart = staff.filter((e) => (!e.joinedOn || e.joinedOn < from) && (!e.leftOn || e.leftOn >= from)).length;
  const atEnd = staff.filter((e) => (!e.joinedOn || e.joinedOn <= to) && (!e.leftOn || e.leftOn > to)).length;
  const joined = staff.filter((e) => !!e.joinedOn && e.joinedOn >= from && e.joinedOn <= to).length;
  const left = staff.filter((e) => !!e.leftOn && e.leftOn >= from && e.leftOn <= to).length;
  const average = (atStart + atEnd) / 2;
  return { atStart, joined, left, atEnd, attritionPct: average > 0 ? Math.round((left / average) * 1000) / 10 : null };
}

/** Completed years of service to one place, from joining to the last day (or the day given). */
export function serviceYears(joinedOn: string | null, until: string): number | null {
  if (!joinedOn || joinedOn > until) return null;
  return Math.floor(((Date.parse(until) - Date.parse(joinedOn)) / (365.25 * 86_400_000)) * 10) / 10;
}

/** PF and ESI for a month are deposited by the 15th of the next month. */
export function statutoryDueOn(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01-15` : `${y}-${String(m + 1).padStart(2, '0')}-15`;
}

/**
 * Attendance in per cent: days present (a half day half, on duty and tour included) against the working days so far,
 * which are the days present, on leave, absent or not marked; null with no working day yet.
 */
export function attendancePct(day: { present: number; onLeave: number; absent: number; notMarked: number }): number | null {
  const worked = day.present + day.onLeave + day.absent + day.notMarked;
  return worked > 0 ? Math.round((day.present / worked) * 1000) / 10 : null;
}
