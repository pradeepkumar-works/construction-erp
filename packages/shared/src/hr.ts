/**
 * HR records (v6 item 99): the employee master's personal, statutory and bank details, the events of a person's service
 * (joining to exit) with their letters, and the HR dashboard on the People home.
 */

export const GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;
export type Gender = (typeof GENDERS)[number];
export const GENDER_LABELS: Record<Gender, string> = { MALE: 'Male', FEMALE: 'Female', OTHER: 'Other' };

export const EMPLOYMENT_TYPES = ['PERMANENT', 'PROBATION', 'CONTRACT', 'TRAINEE', 'CONSULTANT'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  PERMANENT: 'Permanent',
  PROBATION: 'On probation',
  CONTRACT: 'Fixed-term contract',
  TRAINEE: 'Trainee',
  CONSULTANT: 'Consultant',
};

export const EMPLOYEE_EVENT_TYPES = ['JOINED', 'CONFIRMED', 'TRANSFERRED', 'PROMOTED', 'INCREMENT', 'WARNING', 'RESIGNED', 'TERMINATED', 'RETIRED'] as const;
export type EmployeeEventType = (typeof EMPLOYEE_EVENT_TYPES)[number];
export const EMPLOYEE_EVENT_LABELS: Record<EmployeeEventType, string> = {
  JOINED: 'Joined',
  CONFIRMED: 'Confirmed',
  TRANSFERRED: 'Transferred',
  PROMOTED: 'Promoted',
  INCREMENT: 'Increment',
  WARNING: 'Warning',
  RESIGNED: 'Resigned',
  TERMINATED: 'Terminated',
  RETIRED: 'Retired',
};
/** The letter each event prints. An exit prints the relieving letter; the experience letter is printed from it too. */
export const EMPLOYEE_EVENT_LETTERS: Record<EmployeeEventType, string> = {
  JOINED: 'Appointment letter',
  CONFIRMED: 'Confirmation letter',
  TRANSFERRED: 'Transfer order',
  PROMOTED: 'Promotion letter',
  INCREMENT: 'Increment letter',
  WARNING: 'Warning letter',
  RESIGNED: 'Relieving letter',
  TERMINATED: 'Termination letter',
  RETIRED: 'Relieving letter',
};
/** Events that end the service: they set the last working day and mark the person as left. */
export const EXIT_EVENT_TYPES: readonly EmployeeEventType[] = ['RESIGNED', 'TERMINATED', 'RETIRED'];
export const isExitEvent = (t: EmployeeEventType) => EXIT_EVENT_TYPES.includes(t);
/** Events HR records by hand (joining is recorded with the staff record). */
export const RECORDABLE_EVENT_TYPES: readonly EmployeeEventType[] = ['CONFIRMED', 'TRANSFERRED', 'PROMOTED', 'INCREMENT', 'WARNING', 'RESIGNED', 'TERMINATED', 'RETIRED'];

/** PAN and IFSC patterns are `PAN_PATTERN` and `IFSC_PATTERN` (contract.ts), shared with vendors. */
/** UAN (EPFO): twelve digits. */
export const UAN_PATTERN = /^\d{12}$/;
/** ESI insurance number: ten digits (older cards have seventeen). */
export const ESI_PATTERN = /^(\d{10}|\d{17})$/;

/** Personal, statutory and bank details: staff admins, payroll and the person themselves only. */
export interface EmployeePrivateDto {
  dateOfBirth: string | null;
  gender: Gender | null;
  fatherOrSpouseName: string | null;
  email: string | null;
  address: string | null;
  bloodGroup: string | null;
  emergencyContact: string | null;
  emergencyPhone: string | null;
  pan: string | null;
  /** Shown as XXXX-XXXX-1234 */
  aadhaarLast4: string | null;
  uan: string | null;
  pfNumber: string | null;
  esiNumber: string | null;
  bankName: string | null;
  bankAccountNo: string | null;
  bankIfsc: string | null;
  /** Cost to company a year */
  ctcAnnual: string | null;
  exitReason: string | null;
}

export interface EmployeeEventDto {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  type: EmployeeEventType;
  effectiveDate: string;
  letterNo: string;
  fromProjectName: string | null;
  toProjectName: string | null;
  fromDesignation: string | null;
  toDesignation: string | null;
  fromDepartment: string | null;
  toDepartment: string | null;
  /** Rupees a year; only for those who see private details */
  fromCtc: string | null;
  toCtc: string | null;
  noticeGivenOn: string | null;
  note: string | null;
  createdByName: string;
  createdAt: string;
}

/** Everything a letter needs besides the event: the company and the person as they were then. */
export interface EmployeeLetterDto {
  event: EmployeeEventDto;
  company: { name: string; address: string | null };
  employee: {
    fullName: string;
    employeeCode: string;
    designation: string;
    department: string | null;
    address: string | null;
    fatherOrSpouseName: string | null;
    joinedOn: string | null;
    leftOn: string | null;
    postedAt: string | null;
    probationEndsOn: string | null;
    noticeDays: number | null;
  };
  /** Who signs: the person who recorded it, and their role */
  signedBy: { name: string; title: string };
}

export interface HeadcountRowDto {
  key: string;
  label: string;
  count: number;
}

export interface HrPersonRowDto {
  employeeId: string;
  fullName: string;
  employeeCode: string;
  designation: string;
  projectName: string | null;
  date: string;
  /** Years of service for an anniversary, age is never shown */
  years?: number;
}

/** The HR dashboard (People home): head count and the month's comings and goings. */
export interface HrDashboardDto {
  date: string;
  active: number;
  bySite: HeadcountRowDto[];
  byDepartment: HeadcountRowDto[];
  byType: HeadcountRowDto[];
  joinedThisMonth: HrPersonRowDto[];
  leftThisMonth: HrPersonRowDto[];
  /** Probation ending in the next 30 days, or already ended and not confirmed */
  probationDue: HrPersonRowDto[];
  /** Birthdays and work anniversaries from today to the end of next month */
  birthdays: HrPersonRowDto[];
  anniversaries: HrPersonRowDto[];
  /** Active staff with no PAN, UAN or bank account recorded (payroll needs them) */
  missingDetails: { employeeId: string; fullName: string; employeeCode: string; missing: string[] }[];
}
