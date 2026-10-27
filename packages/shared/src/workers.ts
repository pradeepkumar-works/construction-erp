/**
 * Named worker register (v4 item 44): contractor labour by name, with a daily roll call, a monthly muster and output
 * per man-day. A site register, not HR: no PF, ESI or payslips. The roll call keeps the day's head-count sheet in step.
 */
import type { StaffAttendanceStatus } from './staff';
import type { WorkerIdType, WorkerSkill } from './enums';
import type { AttendanceLineInput } from './attendance';

/** Hours of work a daily wage pays for; the default overtime rate is the daily wage over these hours. */
export const WORKER_DAY_HOURS = 8;
/** Time on site a normal day takes, lunch included; time past it between in and out is overtime. */
export const WORKER_SHIFT_HOURS = 9;

/** A day's mark as man-days: present 1, half day 0.5, absent 0. */
export const manDays = (status: StaffAttendanceStatus | null | undefined) => (status === 'PRESENT' ? 1 : status === 'HALF_DAY' ? 0.5 : 0);

/** Counts on the head-count sheet: present and half day are both a worker on site. */
export const onSite = (status: StaffAttendanceStatus | null | undefined) => status === 'PRESENT' || status === 'HALF_DAY';

/** Overtime rate per hour: the one set on the worker, else the daily wage over WORKER_DAY_HOURS. */
export const workerOtRate = (dailyWage: number | string, otRate?: number | string | null) =>
  otRate !== null && otRate !== undefined && otRate !== '' ? Number(otRate) : Math.round((Number(dailyWage) / WORKER_DAY_HOURS) * 100) / 100;

/** Wages for a period: man-days at the daily wage plus overtime hours at the OT rate, rounded to the paisa. */
export const workerWages = (dailyWage: number | string, otRate: number | string | null | undefined, days: number, otHours: number) =>
  Math.round((days * Number(dailyWage) + otHours * workerOtRate(dailyWage, otRate)) * 100) / 100;

export const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Overtime from in and out ("HH:mm", same day), in half hours past WORKER_SHIFT_HOURS; null without both. */
export function workerOvertime(inTime: string | null | undefined, outTime: string | null | undefined): number | null {
  if (!inTime || !outTime || !TIME_HHMM.test(inTime) || !TIME_HHMM.test(outTime)) return null;
  const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const hours = (mins(outTime) - mins(inTime)) / 60;
  return Math.max(0, Math.floor((hours - WORKER_SHIFT_HOURS) * 2) / 2);
}

/** Aadhaar is kept as its last four digits only; other IDs as typed. */
export function maskWorkerId(idType: WorkerIdType | null | undefined, idNumber: string | null | undefined): string | null {
  const v = idNumber?.trim();
  if (!v) return null;
  if (idType !== 'AADHAAR') return v;
  const digits = v.replace(/\D/g, '');
  return `XXXX-XXXX-${digits.slice(-4).padStart(4, 'X')}`;
}

const key = (s: string) => s.trim().toLowerCase();

/**
 * Head count per contractor and trade from a roll call: one per worker present or on a half day. Order follows
 * the first worker of each pair.
 */
export function rollCallHeadCount(rows: { contractor: string; trade: string; status: StaffAttendanceStatus | null }[]): AttendanceLineInput[] {
  const out = new Map<string, AttendanceLineInput>();
  for (const r of rows) {
    const k = `${key(r.contractor)}\u0000${key(r.trade)}`;
    const prev = out.get(k) ?? { contractor: r.contractor.trim(), category: r.trade.trim(), count: 0 };
    if (onSite(r.status)) prev.count += 1;
    out.set(k, prev);
  }
  return [...out.values()];
}

/**
 * The head-count sheet after a roll call: lines for the contractor and trade pairs the roll call covers take its
 * counts (and drop out at zero); lines it does not cover stay as they were.
 */
export function mergeHeadCount(existing: AttendanceLineInput[], fromRollCall: AttendanceLineInput[]): AttendanceLineInput[] {
  const pair = (l: AttendanceLineInput) => `${key(l.contractor)}\u0000${key(l.category)}`;
  const covered = new Map(fromRollCall.map((l) => [pair(l), l]));
  const out: AttendanceLineInput[] = [];
  const done = new Set<string>();
  for (const l of existing) {
    const k = pair(l);
    const r = covered.get(k);
    if (!r) out.push({ contractor: l.contractor, category: l.category, count: l.count });
    else if (!done.has(k) && r.count > 0) out.push({ contractor: l.contractor, category: l.category, count: r.count });
    if (r) done.add(k);
  }
  for (const [k, r] of covered) if (!done.has(k) && r.count > 0) out.push(r);
  return out;
}

export interface WorkerDto {
  id: string;
  workerNo: string;
  name: string;
  fatherName: string | null;
  phone: string | null;
  contractor: string;
  vendorId: string | null;
  trade: string;
  skill: WorkerSkill;
  idType: WorkerIdType | null;
  idNumber: string | null;
  dailyWage: string;
  otRate: string | null;
  /** The OT rate used: otRate, or the daily wage / 8 */
  effectiveOtRate: string;
  projectId: string | null;
  projectName: string | null;
  joinedOn: string | null;
  leftOn: string | null;
  isActive: boolean;
  /** Last day marked present or half day, anywhere */
  lastSeenOn: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RollCallRowDto {
  workerId: string;
  workerNo: string;
  name: string;
  contractor: string;
  trade: string;
  skill: WorkerSkill;
  status: StaffAttendanceStatus | null;
  inTime: string | null;
  outTime: string | null;
  otHours: string | null;
  activityId: string | null;
  activityName: string | null;
  note: string | null;
  markedByName: string | null;
}

export interface RollCallDto {
  projectId: string;
  date: string;
  /** Payroll for the month is approved: the roll call, like the head count, can no longer change */
  locked: boolean;
  /** The approved payroll run that locks the day, null while it is open */
  lockedByRun: string | null;
  rows: RollCallRowDto[];
  totals: { workers: number; present: number; halfDay: number; absent: number; unmarked: number; manDays: number; otHours: number };
  /** The head-count sheet of the day after the roll call (null when none) */
  headCount: AttendanceLineInput[] | null;
}

export interface MusterRowDto {
  workerId: string;
  workerNo: string;
  name: string;
  contractor: string;
  trade: string;
  dailyWage: string;
  /** Day of month (1-based) to its mark */
  marks: Record<number, StaffAttendanceStatus>;
  present: number;
  halfDays: number;
  absent: number;
  manDays: number;
  otHours: number;
  wages: string;
}

export interface MusterContractorDto {
  contractor: string;
  workers: number;
  manDays: number;
  otHours: number;
  wages: string;
}

export interface MusterDto {
  projectId: string;
  /** YYYY-MM */
  month: string;
  daysInMonth: number;
  rows: MusterRowDto[];
  byContractor: MusterContractorDto[];
  totals: { workers: number; manDays: number; otHours: number; wages: string };
}

export interface OutputRowDto {
  activityId: string;
  activityName: string;
  unit: string;
  manDays: number;
  /** Approved progress in the period */
  quantity: string;
  /** quantity / manDays; null without man-days */
  outputPerManDay: string | null;
  /** Man-days by trade, largest first */
  trades: { trade: string; manDays: number }[];
}

export interface OutputDto {
  projectId: string;
  from: string;
  to: string;
  rows: OutputRowDto[];
  /** Man-days marked without an activity */
  untaggedManDays: number;
  totalManDays: number;
}
