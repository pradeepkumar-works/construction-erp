/**
 * QA/QC registers (ARCHITECTURE "QA/QC"): the labs tests go to, samples sent out and their reports, the
 * calibration register, the manufacturer's test certificates a receipt needs, and an NCR's category, root cause and cost.
 * Everything here is pure; the API loads the rows and asks these functions where each stands.
 */
import { daysBetween } from './maintenance';
import type { AttachmentDto } from './types';

/** Where a test is done: the site's own lab, an NABL-accredited lab, a lab of a sister company, or any other. */
export const LAB_KINDS = ['SITE', 'NABL', 'GROUP', 'OUTSIDE'] as const;
export type LabKind = (typeof LAB_KINDS)[number];
export const LAB_KIND_LABELS: Record<LabKind, string> = { SITE: 'Site lab', NABL: 'NABL lab', GROUP: 'Group company lab', OUTSIDE: 'Other lab' };

/** An NABL accreditation is flagged this many days before it lapses. */
export const NABL_ALERT_DAYS = 30;

/** NABL certificate numbers look like TC-1234 (testing) or CC-1234 (calibration). */
export const NABL_NO = /^(TC|CC|MC)-?\d{3,6}$/i;

export type AccreditationState = 'VALID' | 'EXPIRING' | 'EXPIRED' | 'NONE';

/** Where a lab's NABL accreditation stands on `today`. Only an NABL lab carries one. */
export function accreditationState(lab: { kind: LabKind; nablValidTill: string | null }, today: string): AccreditationState {
  if (lab.kind !== 'NABL' || !lab.nablValidTill) return 'NONE';
  const left = daysBetween(today, lab.nablValidTill);
  if (left < 0) return 'EXPIRED';
  return left <= NABL_ALERT_DAYS ? 'EXPIRING' : 'VALID';
}

/** What is wrong with a lab before it is saved, in words for the form. */
export function labProblem(l: { name: string; kind: LabKind; nablNo?: string | null; nablValidTill?: string | null }): string | null {
  if (!l.name.trim()) return 'Give the lab a name';
  if (l.kind === 'NABL') {
    if (!l.nablNo?.trim()) return 'Give the NABL certificate number, such as TC-5678';
    if (!NABL_NO.test(l.nablNo.trim())) return 'An NABL certificate number looks like TC-5678';
    if (!l.nablValidTill) return 'Give the date the accreditation is valid till';
  }
  return null;
}

/** A test sent to a lab: waiting for its report, reported, or not sent anywhere (tested at site). */
export type SampleState = 'AT_LAB' | 'REPORTED' | 'NOT_SENT';

/** Days a lab normally takes; a report later than this is overdue (28-day cubes are counted from their reading's day). */
export const LAB_REPORT_DAYS = 10;

export function sampleState(t: { labId: string | null; sentOn: string | null; reportOn: string | null }): SampleState {
  if (!t.labId || !t.sentOn) return 'NOT_SENT';
  return t.reportOn ? 'REPORTED' : 'AT_LAB';
}

/** Days a sample has been at the lab without a report (null when not waiting), and whether that is past `LAB_REPORT_DAYS`. */
export function reportWait(t: { labId: string | null; sentOn: string | null; reportOn: string | null; lastDueOn?: string | null }, today: string): { days: number; late: boolean } | null {
  if (sampleState(t) !== 'AT_LAB') return null;
  const from = t.lastDueOn && t.lastDueOn > t.sentOn! ? t.lastDueOn : t.sentOn!;
  const days = Math.max(0, daysBetween(t.sentOn!, today));
  return { days, late: daysBetween(from, today) > LAB_REPORT_DAYS };
}

/** A calibration is "due soon" within this many days. */
export const CALIBRATION_SOON_DAYS = 15;

export const CALIBRATION_RESULTS = ['OK', 'ADJUSTED', 'FAILED'] as const;
export type CalibrationResult = (typeof CALIBRATION_RESULTS)[number];
export const CALIBRATION_RESULT_LABELS: Record<CalibrationResult, string> = { OK: 'Within limits', ADJUSTED: 'Adjusted and within limits', FAILED: 'Failed: out of use' };

/** How often each standard kind of instrument is calibrated, in days (IS 516, IS 1199, the makers' and NABL practice). */
export const STANDARD_CALIBRATION_DAYS: Record<string, number> = {
  'compression-testing-machine': 365,
  'cube-moulds': 365,
  'slump-cone': 365,
  'weighing-scale': 365,
  'batching-plant': 180,
  'sieves': 365,
  'oven': 365,
  'total-station': 365,
  'auto-level': 365,
  'pressure-gauge': 180,
  'thermometer': 365,
  'proving-ring': 365,
};
export const DEFAULT_CALIBRATION_DAYS = 365;

/** The interval an instrument of this kind starts with. */
export const calibrationDaysFor = (kind: string | null | undefined) => (kind && STANDARD_CALIBRATION_DAYS[kind]) || DEFAULT_CALIBRATION_DAYS;

export type CalibrationState = 'OK' | 'DUE_SOON' | 'OVERDUE' | 'NEVER' | 'OUT_OF_USE';
export const CALIBRATION_STATE_LABELS: Record<CalibrationState, string> = {
  OK: 'Calibrated',
  DUE_SOON: 'Due soon',
  OVERDUE: 'Overdue',
  NEVER: 'Not calibrated',
  OUT_OF_USE: 'Out of use',
};

/** The day after `from` by `days` (both YYYY-MM-DD). */
function plusDays(from: string, days: number): string {
  const d = new Date(`${from.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** When an instrument next falls due: the date its last certificate gave, else the last calibration plus its interval. */
export function nextCalibration(i: { lastCalibratedOn: string | null; nextDueOn: string | null; intervalDays: number }): string | null {
  if (i.nextDueOn) return i.nextDueOn;
  return i.lastCalibratedOn ? plusDays(i.lastCalibratedOn, i.intervalDays) : null;
}

/** Where an instrument stands on `today`. One that failed its last calibration is out of use until calibrated again. */
export function calibrationState(
  i: { lastCalibratedOn: string | null; nextDueOn: string | null; intervalDays: number; lastResult: CalibrationResult | null; active: boolean },
  today: string,
): { state: CalibrationState; dueOn: string | null; daysLeft: number | null } {
  const dueOn = nextCalibration(i);
  if (!i.active || i.lastResult === 'FAILED') return { state: 'OUT_OF_USE', dueOn, daysLeft: null };
  if (!dueOn) return { state: 'NEVER', dueOn: null, daysLeft: null };
  const daysLeft = daysBetween(today, dueOn);
  return { state: daysLeft < 0 ? 'OVERDUE' : daysLeft <= CALIBRATION_SOON_DAYS ? 'DUE_SOON' : 'OK', dueOn, daysLeft };
}

/**
 * Whether a test taken on `on` used an instrument out of calibration that day: never calibrated, past its due date, or
 * failed at its last calibration (from that day on). Before its last calibration the register cannot tell, so no.
 */
export function testedOutOfCalibration(i: { lastCalibratedOn: string | null; nextDueOn: string | null; intervalDays: number; lastResult: CalibrationResult | null }, on: string): boolean {
  const dueOn = nextCalibration(i);
  if (!i.lastCalibratedOn || !dueOn) return true;
  if (on < i.lastCalibratedOn) return false;
  return i.lastResult === 'FAILED' || on > dueOn;
}

/** What is wrong with a calibration before it is recorded. */
export function calibrationProblem(c: { calibratedOn: string; nextDueOn?: string | null; certificateNo?: string | null; result: CalibrationResult }, today: string): string | null {
  if (c.calibratedOn > today) return 'A calibration cannot be dated after today';
  if (c.nextDueOn && c.nextDueOn <= c.calibratedOn) return 'The next due date comes after the calibration';
  if (c.result !== 'FAILED' && !c.certificateNo?.trim()) return 'Give the certificate number';
  return null;
}

/** Item categories (master codes) whose receipts need the maker's test certificate, until the company chooses its own. */
export const STANDARD_MTC_CATEGORIES = ['steel', 'cement', 'pipes-and-fittings'];

/** Whether a receipt of items in these categories needs a test certificate under the company's list. */
export function certificateNeeded(categories: (string | null | undefined)[], mtcCategories: string[]): boolean {
  const need = new Set(mtcCategories.map((c) => c.toLowerCase()));
  return categories.some((c) => !!c && need.has(categoryCode(c)));
}

/** A category's name or code as its master code ("Pipes and fittings" → "pipes-and-fittings"). */
const categoryCode = (c: string) =>
  c
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export interface QaLabDto {
  id: string;
  name: string;
  kind: LabKind;
  nablNo: string | null;
  nablValidTill: string | null;
  accreditation: AccreditationState;
  projectId: string | null;
  projectName: string | null;
  address: string | null;
  contact: string | null;
  phone: string | null;
  email: string | null;
  active: boolean;
  notes: string | null;
  /** Samples at the lab waiting for a report */
  atLab: number;
  /** Tests it has reported */
  reported: number;
}

export interface LabSampleDto {
  testId: string;
  testNo: string;
  title: string;
  projectId: string;
  projectName: string;
  labId: string;
  labName: string;
  sentOn: string;
  reportOn: string | null;
  labReportNo: string | null;
  labCharge: string | null;
  state: SampleState;
  waitDays: number | null;
  late: boolean;
  result: string;
}

export interface LabSamplesDto {
  items: LabSampleDto[];
  total: number;
  atLab: number;
  late: number;
  /** Charges on the samples listed */
  charges: string;
}

export interface CalibrationDto {
  id: string;
  calibratedOn: string;
  certificateNo: string | null;
  agency: string | null;
  result: CalibrationResult;
  nextDueOn: string | null;
  remarks: string | null;
  createdByName: string;
  attachments: AttachmentDto[];
}

export interface QaInstrumentDto {
  id: string;
  name: string;
  kind: string;
  kindName: string;
  serialNo: string | null;
  make: string | null;
  range: string | null;
  projectId: string | null;
  projectName: string | null;
  labId: string | null;
  labName: string | null;
  intervalDays: number;
  lastCalibratedOn: string | null;
  lastResult: CalibrationResult | null;
  certificateNo: string | null;
  state: CalibrationState;
  dueOn: string | null;
  daysLeft: number | null;
  active: boolean;
  notes: string | null;
  history?: CalibrationDto[];
}

export interface CalibrationRegisterDto {
  items: QaInstrumentDto[];
  overdue: number;
  dueSoon: number;
  outOfUse: number;
}

/** A receipt whose items need the maker's test certificate and has none. */
export interface CertificateMissingDto {
  id: string;
  entryNo: string;
  date: string;
  projectId: string;
  projectName: string;
  supplier: string | null;
  /** The items that need it */
  items: string[];
  /** QA/QC has checked the material (accepted it without the certificate) */
  checked: boolean;
}
