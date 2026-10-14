/** Company staff (not contractor labour): attendance, leave and holidays. */

export const STAFF_ATTENDANCE_STATUSES = ['PRESENT', 'HALF_DAY', 'ABSENT'] as const;
export type StaffAttendanceStatus = (typeof STAFF_ATTENDANCE_STATUSES)[number];
export const STAFF_ATTENDANCE_LABELS: Record<StaffAttendanceStatus, string> = { PRESENT: 'Present', HALF_DAY: 'Half day', ABSENT: 'Absent' };

export const LEAVE_TYPES = ['CASUAL', 'SICK', 'EARNED', 'COMP_OFF', 'UNPAID'] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];
export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = { CASUAL: 'Casual leave', SICK: 'Sick leave', EARNED: 'Earned leave', COMP_OFF: 'Compensatory off', UNPAID: 'Leave without pay' };

/** Days a year for each leave type; null = no yearly limit (comp-off is earned by working an off day, unpaid is unpaid). */
export const LEAVE_ENTITLEMENT: Record<LeaveType, number | null> = { CASUAL: 12, SICK: 12, EARNED: 15, COMP_OFF: null, UNPAID: null };

export const LEAVE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];
export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = { PENDING: 'Waiting', APPROVED: 'Approved', REJECTED: 'Rejected', CANCELLED: 'Cancelled' };

/** The weekly off for every site. */
export const isWeeklyOff = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() === 0;

/** A standard working day in hours; time beyond it between check-in and check-out is overtime. */
export const STANDARD_DAY_HOURS = 9;

/**
 * Working days a leave takes: Sundays and the given holidays (YYYY-MM-DD) are not counted; a half day is 0.5.
 */
export function leaveDays(fromDate: string, toDate: string, halfDay: boolean, holidays: ReadonlySet<string> = new Set()): number {
  if (halfDay) return fromDate === toDate && !isWeeklyOff(fromDate) && !holidays.has(fromDate) ? 0.5 : 0;
  let n = 0;
  for (let t = Date.parse(`${fromDate}T00:00:00Z`), end = Date.parse(`${toDate}T00:00:00Z`); t <= end; t += 86_400_000) {
    const d = new Date(t).toISOString().slice(0, 10);
    if (!isWeeklyOff(d) && !holidays.has(d)) n += 1;
  }
  return n;
}

/** Overtime in half hours past the standard day; null without both times. */
export function overtimeHours(checkIn: string | null, checkOut: string | null): number | null {
  if (!checkIn || !checkOut) return null;
  const hours = (Date.parse(checkOut) - Date.parse(checkIn)) / 3_600_000;
  return Math.max(0, Math.floor((hours - STANDARD_DAY_HOURS) * 2) / 2);
}
