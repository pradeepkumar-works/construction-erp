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

/** A company's leave rules (Payroll settings): days a year by type, earned leave carried, pro rata for joiners. */
export interface LeavePolicy {
  casual: number;
  sick: number;
  earned: number;
  /** Earned leave not taken that carries into the next year, at most this many days; 0 = none */
  earnedCarryMax: number;
  /** A joiner gets the year's leave for the months left, from their joining month */
  proRata: boolean;
}

export const DEFAULT_LEAVE_POLICY: LeavePolicy = { casual: 12, sick: 12, earned: 15, earnedCarryMax: 0, proRata: false };

/** Rounded down to a half day. */
const halfDays = (n: number) => Math.floor(n * 2) / 2;

/**
 * The days of a leave type someone is entitled to in a year (null = no yearly limit): the company's days, for the months
 * left from their joining month when they joined that year and the company gives pro rata (rounded down to a half day),
 * and for earned leave what the earlier year left, up to the carry limit, or the days HR brought forward from the records
 * kept before Nirmaan (`broughtForward`, taken as entered). Comp-off is earned by working, so it is not here.
 */
export function leaveEntitlement(type: LeaveType, policy: LeavePolicy, year: number, joinedOn: string | null, earnedLeftLastYear = 0, broughtForward: number | null = null): number | null {
  const days = type === 'CASUAL' ? policy.casual : type === 'SICK' ? policy.sick : type === 'EARNED' ? policy.earned : null;
  if (days === null) return null;
  const joinYear = joinedOn ? Number(joinedOn.slice(0, 4)) : null;
  if (joinYear !== null && joinYear > year) return 0;
  const base = policy.proRata && joinYear === year ? halfDays((days * (13 - Number(joinedOn!.slice(5, 7)))) / 12) : days;
  if (type === 'EARNED' && broughtForward !== null) return base + Math.max(0, broughtForward);
  const carry = type === 'EARNED' && policy.earnedCarryMax > 0 && (joinYear === null || joinYear < year) ? Math.min(policy.earnedCarryMax, Math.max(0, earnedLeftLastYear)) : 0;
  return base + carry;
}

/** The leave types with a yearly balance, so the ones an opening balance is kept for. */
export const OPENING_LEAVE_TYPES: readonly LeaveType[] = ['CASUAL', 'SICK', 'EARNED'];

export interface LeaveOpeningLine {
  type: LeaveType;
  takenBefore: number;
  broughtForward: number | null;
}

/** Why an employee's opening leave cannot be saved, or null. */
export function leaveOpeningProblem(lines: LeaveOpeningLine[]): string | null {
  const half = (n: number) => Number.isFinite(n) && Math.round(n * 2) === n * 2;
  const seen = new Set<LeaveType>();
  for (const l of lines) {
    const label = LEAVE_TYPE_LABELS[l.type].toLowerCase();
    if (!OPENING_LEAVE_TYPES.includes(l.type)) return `${LEAVE_TYPE_LABELS[l.type]} has no yearly balance to open`;
    if (seen.has(l.type)) return `Enter ${label} once`;
    seen.add(l.type);
    if (!half(l.takenBefore) || l.takenBefore < 0 || l.takenBefore > 366) return `Enter the ${label} taken as whole or half days, 0 to 366`;
    if (l.broughtForward !== null && l.type !== 'EARNED') return 'Only earned leave is brought forward';
    if (l.broughtForward !== null && (!half(l.broughtForward) || l.broughtForward < 0 || l.broughtForward > 300)) return 'Enter the earned leave brought forward as whole or half days, 0 to 300';
  }
  return null;
}

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
