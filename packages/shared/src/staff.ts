/** Company staff (not contractor labour): attendance, leave and holidays. */

export const STAFF_ATTENDANCE_STATUSES = ['PRESENT', 'HALF_DAY', 'ABSENT'] as const;
export type StaffAttendanceStatus = (typeof STAFF_ATTENDANCE_STATUSES)[number];
export const STAFF_ATTENDANCE_LABELS: Record<StaffAttendanceStatus, string> = { PRESENT: 'Present', HALF_DAY: 'Half day', ABSENT: 'Absent' };

export const LEAVE_TYPES = ['CASUAL', 'SICK', 'EARNED', 'COMP_OFF', 'UNPAID', 'ON_DUTY', 'TOUR'] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];
export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  CASUAL: 'Casual leave',
  SICK: 'Sick leave',
  EARNED: 'Earned leave',
  COMP_OFF: 'Compensatory off',
  UNPAID: 'Leave without pay',
  ON_DUTY: 'On duty',
  TOUR: 'Tour',
};

/**
 * Days a year for each leave type; null = no yearly limit (comp-off is earned by working an off day, unpaid is unpaid,
 * on duty and tour are work away from the site).
 */
export const LEAVE_ENTITLEMENT: Record<LeaveType, number | null> = { CASUAL: 12, SICK: 12, EARNED: 15, COMP_OFF: null, UNPAID: null, ON_DUTY: null, TOUR: null };

/** Attendance extras: away on company work; approved like leave but counted present and paid. */
export const PRESENT_LEAVE_TYPES: readonly LeaveType[] = ['ON_DUTY', 'TOUR'];
export const countsAsPresent = (type: LeaveType) => PRESENT_LEAVE_TYPES.includes(type);

/** Attendance extras: overtime from a check-out waits for the posting's project manager or HR. */
export const OVERTIME_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type OvertimeStatus = (typeof OVERTIME_STATUSES)[number];
export const OVERTIME_STATUS_LABELS: Record<OvertimeStatus, string> = { PENDING: 'Waiting', APPROVED: 'Approved', REJECTED: 'Rejected' };

/** A site's check-in radius when the project sets a location but no radius, in metres. */
export const DEFAULT_SITE_RADIUS_M = 300;
/** A position's own accuracy is allowed for up to this much, so a weak fix at the gate still counts as inside. */
export const MAX_ACCURACY_ALLOWANCE_M = 50;

/** Metres between two points on the earth (haversine). */
export function distanceMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Whether a check-in position is at the site: within its radius, allowing for the position's accuracy (up to
 * MAX_ACCURACY_ALLOWANCE_M). Distance is whole metres.
 */
export function checkInPlace(site: { lat: number; lng: number; radiusM: number | null }, at: { lat: number; lng: number; accuracyM: number | null }): { distanceM: number; inside: boolean } {
  const distanceM = Math.round(distanceMetres(site.lat, site.lng, at.lat, at.lng));
  const allowance = Math.min(Math.max(at.accuracyM ?? 0, 0), MAX_ACCURACY_ALLOWANCE_M);
  return { distanceM, inside: distanceM - allowance <= (site.radiusM ?? DEFAULT_SITE_RADIUS_M) };
}

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
