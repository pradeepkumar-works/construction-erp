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
