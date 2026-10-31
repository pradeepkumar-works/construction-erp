import type { RoleKey, SubmissionStatus } from './enums';
import { APPROVER_ROLES, STAFF_ADMIN_ROLES } from './permissions';

/**
 * Attendance cross-check: what a labour contractor bills in man-days against what the site recorded (the
 * head-count sheet, the named roll call and the biometric punches), and each day's records against each other and the
 * DPR's manpower. Rules only; a flag is a reason to check the muster, never a cut in anyone's wage. The rules are in
 * `apps/api/src/attendance-check/attendance-check-rules.ts`.
 */

/** Man-days billed above the records by fewer than this are rounding, not a flag. */
export const MANDAY_TOLERANCE_MIN = 2;
/** ... nor by less than this share of what the records support, in %. */
export const MANDAY_TOLERANCE_PCT = 5;
/** Workers on the roll call with no punch on a day the site's device took punches: flagged from this many in a crew. */
export const NO_PUNCH_MIN = 2;
/** A crew's head count above its named roll call, or a site's head count above its DPR, flagged from this many. */
export const HEADCOUNT_GAP_MIN = 3;
/** ... and from this share of the lower figure, in %. */
export const HEADCOUNT_GAP_PCT = 10;

export const ATTENDANCE_FLAG_KINDS = ['BILL_ABOVE', 'NO_PUNCH', 'HEADCOUNT_ABOVE', 'DPR_GAP'] as const;
export type AttendanceFlagKind = (typeof ATTENDANCE_FLAG_KINDS)[number];

export const ATTENDANCE_FLAG_LABELS: Record<AttendanceFlagKind, string> = {
  BILL_ABOVE: 'Billed above the records',
  NO_PUNCH: 'On the roll call, no punch',
  HEADCOUNT_ABOVE: 'Head count above the roll call',
  DPR_GAP: 'Head count against the DPR',
};

/** The page: HR and whoever approves a site's work (project managers, management, admin). */
export const canSeeAttendanceCheck = (role: RoleKey) => APPROVER_ROLES.includes(role) || STAFF_ADMIN_ROLES.includes(role);
/** A worker is named only to HR and the project manager; everyone else sees counts. */
export const canSeeAttendanceNames = (role: RoleKey) => role === 'HR_MANAGER' || role === 'PROJECT_MANAGER';

/** Whether a work order line is billed in man-days ("Man-day", "MD", "Mandays", "Man days"). */
export const isManDayUnit = (unit: string) => /^\s*(man[\s-]?days?|mandays?|m\.?\s?d\.?s?|mds)\s*$/i.test(unit);

/** What the site recorded for a crew over a span: null when that record is not kept for it at all. */
export interface AttendanceSourcesDto {
  /** Head-count sheet: heads × days */
  headCount: number | null;
  /** Named roll call: man-days (a half day is 0.5) */
  rollCall: number | null;
  /** Roll-call man-days of workers who punched on the site's device that day */
  punched: number | null;
}

export interface AttendanceWorkerDto {
  id: string;
  workerNo: string;
  name: string;
}

export interface AttendanceFlagDto {
  key: string;
  kind: AttendanceFlagKind;
  projectId: string;
  projectName: string;
  /** The day, or the first day of the bill's span */
  from: string;
  to: string;
  contractor: string;
  trade: string | null;
  title: string;
  detail: string;
  /** "9 man-days", "3 workers" */
  quantity: string;
  valueInr: number | null;
  working: string[];
  links: { label: string; href: string }[];
  /** Named only for `canSeeAttendanceNames`; null for everyone else, and for flags about counts */
  workers: AttendanceWorkerDto[] | null;
  billId: string | null;
}

/** One man-day line of a subcontractor bill against the records over the bill's span. */
export interface AttendanceBillLineDto {
  lineId: string;
  description: string;
  /** The trade read from the line ("Helper"), or null when it names none (then all the crew's trades) */
  trade: string | null;
  billed: number;
  rate: string;
  sources: AttendanceSourcesDto;
  /** The most any record supports (head count or roll call); null when the site kept neither */
  supported: number | null;
  excess: number;
  excessInr: number;
  flagged: boolean;
}

export interface AttendanceBillDto {
  billId: string;
  label: string;
  projectId: string;
  projectName: string;
  vendorName: string;
  status: SubmissionStatus;
  from: string;
  to: string;
  lines: AttendanceBillLineDto[];
  excessInr: number;
}

export interface AttendanceCrewDayDto {
  contractor: string;
  headCount: number | null;
  /** Heads on the roll call (present or half day) */
  rollCall: number | null;
  punched: number | null;
}

export interface AttendanceCheckDayDto {
  date: string;
  /** Manpower on the day's DPR */
  dpr: number | null;
  headCount: number | null;
  rollCall: number | null;
  punched: number | null;
  /** The site's biometric device took punches that day */
  deviceUp: boolean;
  crews: AttendanceCrewDayDto[];
}

export interface AttendanceCheckDto {
  month: string;
  from: string;
  to: string;
  projects: number;
  flags: AttendanceFlagDto[];
  bills: AttendanceBillDto[];
  /** Each day of the month for the chosen project; empty when none is chosen */
  days: AttendanceCheckDayDto[];
  namesShown: boolean;
}
