/** Inspections (QA/QC): checklist results, status wording and the standard checklists. */
import type { SubmissionStatus } from './enums';

export const INSPECTION_RESULTS = ['PASS', 'FAIL', 'NA'] as const;
export type InspectionResult = (typeof INSPECTION_RESULTS)[number];

export const INSPECTION_RESULT_LABELS: Record<InspectionResult, string> = { PASS: 'OK', FAIL: 'Not OK', NA: 'Not applicable' };

/** An inspection is a submission: requested = submitted, passed = approved, failed = rejected, re-inspect = changes requested. */
export const INSPECTION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Requested',
  APPROVED: 'Passed',
  REJECTED: 'Failed',
  CHANGES_REQUESTED: 'Re-inspect',
};

/** One checklist point of an inspection; `result` is empty until the inspector records it. */
export interface InspectionCheck {
  item: string;
  result: InspectionResult | null;
  remark: string | null;
}

/** Points checked, failed and still open. */
export function checklistCounts(checks: InspectionCheck[]) {
  return {
    total: checks.length,
    pass: checks.filter((c) => c.result === 'PASS').length,
    fail: checks.filter((c) => c.result === 'FAIL').length,
    na: checks.filter((c) => c.result === 'NA').length,
    open: checks.filter((c) => !c.result).length,
  };
}

/** Same location, ignoring case and spacing ("Km 14+200 LHS" = "km 14+200  lhs"). */
export const sameLocation = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? '').trim().replace(/\s+/g, ' ').toLowerCase() === (b ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/** Standard checklists an organisation can start from (Quality > Checklists, and the demo seed). */
export const STANDARD_CHECKLISTS: { name: string; items: string[] }[] = [
  {
    name: 'Reinforcement before concreting',
    items: [
      'Bar diameter and number as per drawing',
      'Spacing of main bars and stirrups',
      'Lap length and location of laps',
      'Cover blocks placed for the specified cover',
      'Bars tied firmly, chairs in place',
      'Bars clean, free of rust, oil and mud',
      'Embedded items and sleeves in place',
    ],
  },
  {
    name: 'Formwork',
    items: ['Line, level and plumb checked', 'Joints tight against slurry loss', 'Props and bracing adequate', 'Shuttering oil applied', 'Formwork clean inside'],
  },
  {
    name: 'Concrete pour',
    items: [
      'Mix design and grade as specified',
      'Slump within limit',
      'Cube samples taken',
      'Vibrator and standby available',
      'Construction joints prepared',
      'Curing arrangement ready',
    ],
  },
  {
    name: 'Brickwork',
    items: ['Bricks soaked before use', 'Mortar mix as specified', 'Courses in line and level', 'Joints filled, thickness within 10 mm', 'Plumb of wall', 'Curing done'],
  },
  {
    name: 'Subgrade and embankment layer',
    items: ['Layer thickness within limit', 'Moisture near optimum', 'Compaction tested (field density)', 'Camber and cross slope', 'Level as per drawing'],
  },
  {
    name: 'GSB / WMM layer',
    items: ['Material gradation approved', 'Layer thickness', 'Compaction tested (field density)', 'Surface level and camber', 'No segregation'],
  },
  {
    name: 'Bituminous layer',
    items: ['Tack coat applied uniformly', 'Laying temperature within limit', 'Thickness and camber', 'Rolling pattern followed', 'Surface regularity (3 m straight edge)', 'Cores taken for density'],
  },
  {
    name: 'Pipe laying and hydro test',
    items: ['Trench depth and bedding', 'Pipe class and diameter as specified', 'Joints made as per manufacturer', 'Alignment and gradient', 'Hydraulic test pressure held for the specified time', 'Thrust blocks at bends'],
  },
];

export const TEST_KINDS = ['CONCRETE_CUBE', 'FIELD_DENSITY', 'SOIL', 'AGGREGATE', 'BITUMEN', 'BRICK', 'STEEL', 'WATER', 'HYDRAULIC', 'OTHER'] as const;
export type TestKind = (typeof TEST_KINDS)[number];

export const TEST_KIND_LABELS: Record<TestKind, string> = {
  CONCRETE_CUBE: 'Concrete cubes',
  FIELD_DENSITY: 'Compaction (field density)',
  SOIL: 'Soil',
  AGGREGATE: 'Aggregate',
  BITUMEN: 'Bitumen and mix',
  BRICK: 'Bricks and blocks',
  STEEL: 'Reinforcement steel',
  WATER: 'Water',
  HYDRAULIC: 'Hydraulic pressure test',
  OTHER: 'Other',
};

/** What a new test of each kind starts with: the usual unit and its readings, due a number of days after sampling. */
export const TEST_KIND_DEFAULTS: Record<TestKind, { unit: string; readings: { label: string; days: number }[] }> = {
  CONCRETE_CUBE: { unit: 'N/mm²', readings: [{ label: '7 days', days: 7 }, { label: '28 days', days: 28 }] },
  FIELD_DENSITY: { unit: '%', readings: [{ label: 'Result', days: 0 }] },
  SOIL: { unit: '%', readings: [{ label: 'Result', days: 4 }] },
  AGGREGATE: { unit: '%', readings: [{ label: 'Result', days: 1 }] },
  BITUMEN: { unit: '%', readings: [{ label: 'Result', days: 1 }] },
  BRICK: { unit: 'N/mm²', readings: [{ label: 'Result', days: 3 }] },
  STEEL: { unit: 'N/mm²', readings: [{ label: 'Result', days: 3 }] },
  WATER: { unit: 'pH', readings: [{ label: 'Result', days: 1 }] },
  HYDRAULIC: { unit: 'kg/cm²', readings: [{ label: 'Pressure held', days: 0 }] },
  OTHER: { unit: '', readings: [{ label: 'Result', days: 0 }] },
};

export const TEST_RESULTS = ['PENDING', 'PASS', 'FAIL'] as const;
export type TestResult = (typeof TEST_RESULTS)[number];
export const TEST_RESULT_LABELS: Record<TestResult, string> = { PENDING: 'Pending', PASS: 'Pass', FAIL: 'Fail' };

/**
 * A test's result from its readings: the last reading decides (the 28-day cubes, not the 7-day ones), against
 * specMin / specMax. PENDING until that reading has a value; null when there is no specification to judge by.
 */
export function judgeTest(readings: { value: string | number | null }[], specMin: string | number | null, specMax: string | number | null): TestResult | null {
  if ((specMin === null || specMin === '') && (specMax === null || specMax === '')) return null;
  const last = readings[readings.length - 1];
  if (!last || last.value === null || last.value === '') return 'PENDING';
  const v = Number(last.value);
  if (specMin !== null && specMin !== '' && v < Number(specMin)) return 'FAIL';
  if (specMax !== null && specMax !== '' && v > Number(specMax)) return 'FAIL';
  return 'PASS';
}

/** The specification as a short range: "≥ 25", "≤ 30", "95 to 100". */
export function specRange(specMin: string | null, specMax: string | null, unit?: string | null): string | null {
  const u = unit ? ` ${unit}` : '';
  if (specMin !== null && specMax !== null) return `${Number(specMin)} to ${Number(specMax)}${u}`;
  if (specMin !== null) return `≥ ${Number(specMin)}${u}`;
  if (specMax !== null) return `≤ ${Number(specMax)}${u}`;
  return null;
}

export const NCR_SEVERITIES = ['MINOR', 'MAJOR', 'CRITICAL'] as const;
export type NcrSeverity = (typeof NCR_SEVERITIES)[number];
export const NCR_SEVERITY_LABELS: Record<NcrSeverity, string> = { MINOR: 'Minor', MAJOR: 'Major', CRITICAL: 'Critical' };

/** OPEN: raised, waiting for site; ACTION_TAKEN: site recorded cause and corrective action; CLOSED: QA/QC verified it. */
export const NCR_STATUSES = ['OPEN', 'ACTION_TAKEN', 'CLOSED'] as const;
export type NcrStatus = (typeof NCR_STATUSES)[number];
export const NCR_STATUS_LABELS: Record<NcrStatus, string> = { OPEN: 'Open', ACTION_TAKEN: 'Action taken', CLOSED: 'Closed' };
