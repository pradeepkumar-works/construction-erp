/**
 * QA/QC plans (ARCHITECTURE "QA/QC"): the company's test types, a project's quality plan (inspection and test
 * plan, ITP) and the tests it owes, and the pour register's IS 456 cube acceptance check. Everything here is pure: the
 * API loads the work done, receipts, tests and pours and asks these functions what is owed and whether concrete passes.
 *
 * Test types are data like project types: the standard ones below are what a company uses until it saves its own copy
 * (matched by code), so a new company needs no seeding.
 */
import type { ProjectType } from './enums';
import { TEST_KIND_DEFAULTS, type TestKind } from './quality';
import { sameUnit } from './reconciliation';

// Test types

/** A kind of test the company takes: what it tests, by which method, its unit, limits and readings. */
export interface TestTypeDef {
  /** Upper-case key, unique in the company; a standard type's code is fixed */
  code: string;
  name: string;
  /** The built-in kind it is recorded as: the tests register groups and reminds by it */
  kind: TestKind;
  /** What is tested: concrete, cement, steel… */
  material: string;
  /** The code and method, e.g. "IS 516" */
  method: string | null;
  unit: string;
  specMin: number | null;
  specMax: number | null;
  /** Readings and the days after sampling each falls due */
  readings: { label: string; days: number }[];
  /** Specimens in one sample: three cubes make one test result under IS 456 */
  specimens: number;
  active: boolean;
}

const t = (code: string, name: string, kind: TestKind, material: string, method: string | null, extra: Partial<TestTypeDef> = {}): TestTypeDef => ({
  code,
  name,
  kind,
  material,
  method,
  unit: TEST_KIND_DEFAULTS[kind].unit,
  specMin: null,
  specMax: null,
  readings: TEST_KIND_DEFAULTS[kind].readings,
  specimens: 1,
  active: true,
  ...extra,
});

/** The tests an Indian contractor's quality plan usually lists, with the IS (or MoRTH) method each is taken by. */
export const STANDARD_TEST_TYPES: TestTypeDef[] = [
  t('CUBE', 'Concrete cube strength', 'CONCRETE_CUBE', 'Concrete', 'IS 516', { specimens: 3 }),
  t('SLUMP', 'Slump of fresh concrete', 'OTHER', 'Concrete', 'IS 1199', { unit: 'mm', readings: [{ label: 'Slump', days: 0 }] }),
  t('CEMENT', 'Cement: setting time and strength', 'OTHER', 'Cement', 'IS 4031', { unit: 'N/mm²', readings: [{ label: '3 days', days: 3 }, { label: '7 days', days: 7 }, { label: '28 days', days: 28 }] }),
  t('STEEL', 'Reinforcement: tensile, elongation and bend', 'STEEL', 'Steel', 'IS 1608 / IS 1786'),
  t('SAND_SILT', 'Sand: silt content', 'AGGREGATE', 'Fine aggregate', 'IS 2386 Part 2', { specMax: 8 }),
  t('GRADING', 'Aggregate grading', 'AGGREGATE', 'Aggregate', 'IS 2386 Part 1'),
  t('AIV', 'Aggregate impact value', 'AGGREGATE', 'Coarse aggregate', 'IS 2386 Part 4', { specMax: 30 }),
  t('BRICK', 'Bricks: compressive strength', 'BRICK', 'Bricks and blocks', 'IS 3495 Part 1', { specimens: 5 }),
  t('BRICK_WA', 'Bricks: water absorption', 'BRICK', 'Bricks and blocks', 'IS 3495 Part 2', { unit: '%', specMax: 20, specimens: 5 }),
  t('MDD', 'Soil: maximum dry density (Proctor)', 'SOIL', 'Soil', 'IS 2720 Part 8', { unit: 'g/cc' }),
  t('CBR', 'Soil: CBR', 'SOIL', 'Soil', 'IS 2720 Part 16'),
  t('FDD', 'Field dry density (compaction)', 'FIELD_DENSITY', 'Soil and granular layers', 'IS 2720 Part 28', { specMin: 97 }),
  t('BITUMEN', 'Bitumen content of mix', 'BITUMEN', 'Bituminous mix', 'MoRTH 500 / ASTM D2172'),
  t('PENETRATION', 'Bitumen penetration', 'BITUMEN', 'Bitumen', 'IS 1203', { unit: 'dmm' }),
  t('WATER', 'Water for construction: pH', 'WATER', 'Water', 'IS 3025', { specMin: 6 }),
  t('HYDRO', 'Pipeline hydraulic test', 'HYDRAULIC', 'Pipes', 'IS 5822 / IS 3114'),
];

export const TEST_TYPE_CODE = /^[A-Z][A-Z0-9_]{1,29}$/;

/** The company's test types: the standard ones with its copies laid over them by code, then its own. */
export function testTypesOf(own: TestTypeDef[]): TestTypeDef[] {
  const byCode = new Map(own.map((o) => [o.code, o]));
  return [...STANDARD_TEST_TYPES.map((s) => byCode.get(s.code) ?? s), ...own.filter((o) => !STANDARD_TEST_TYPES.some((s) => s.code === o.code))];
}

/** What is wrong with a test type before it is saved, in words for the form. */
export function testTypeProblem(d: Pick<TestTypeDef, 'code' | 'name' | 'unit' | 'specMin' | 'specMax' | 'readings' | 'specimens'>): string | null {
  if (!TEST_TYPE_CODE.test(d.code)) return 'Give the code in capitals and digits, such as CUBE or SAND_SILT';
  if (!d.name.trim()) return 'Name the test';
  if (d.specMin !== null && d.specMax !== null && d.specMin > d.specMax) return 'The lower limit is above the upper one';
  if (!d.readings.length) return 'Give the test at least one reading';
  if (d.readings.length > 6) return 'A test has at most six readings';
  if (d.readings.some((r) => !r.label.trim() || r.days < 0 || r.days > 365 || !Number.isInteger(r.days))) return 'Each reading needs a name and whole days from sampling, 0 to 365';
  if (!Number.isInteger(d.specimens) || d.specimens < 1 || d.specimens > 12) return 'Specimens in a sample are 1 to 12';
  return null;
}

// The quality plan

/** What a plan line counts its tests against: the work done in DPRs, or material received. */
export const QA_PLAN_SOURCES = ['WORK', 'RECEIPT'] as const;
export type QaPlanSource = (typeof QA_PLAN_SOURCES)[number];
export const QA_PLAN_SOURCE_LABELS: Record<QaPlanSource, string> = { WORK: 'Work done', RECEIPT: 'Material received' };

/**
 * How often: IS456 = the cube samples IS 456 clause 15.2.2 sets by the volume of each grade poured in a day;
 * QUANTITY = one test for every `per` of the unit done; RECEIPT = one for each lot received (or every `per` of it);
 * DAY = one for each day the work was done.
 */
export const QA_FREQUENCIES = ['IS456', 'QUANTITY', 'RECEIPT', 'DAY'] as const;
export type QaFrequency = (typeof QA_FREQUENCIES)[number];
export const QA_FREQUENCY_LABELS: Record<QaFrequency, string> = { IS456: 'IS 456 sampling', QUANTITY: 'By quantity', RECEIPT: 'Each lot received', DAY: 'Each day of work' };

/** Who witnesses the test: our own QA/QC, the client's engineer, or the third-party inspection agency. */
export const QA_WITNESSES = ['OWN', 'CLIENT', 'TPI'] as const;
export type QaWitness = (typeof QA_WITNESSES)[number];
export const QA_WITNESS_LABELS: Record<QaWitness, string> = { OWN: 'Our QA/QC', CLIENT: 'Client', TPI: 'Third party (TPI)' };

/** One line of a project's quality plan. */
export interface QaPlanLineDef {
  testType: string;
  source: QaPlanSource;
  /** Words any of which the work (activity and BOQ item) or the item received is named with, comma separated */
  match: string;
  /** Concrete only: the grade the line is for (M25); null for every grade */
  grade: string | null;
  /** Material received only: the item category, as in the item master */
  itemCategory: string | null;
  frequency: QaFrequency;
  /** QUANTITY: one test per this much; RECEIPT: per this much of a lot, null for one a lot */
  per: number | null;
  /** The unit the work is counted in (QUANTITY); IS456 counts m³ */
  unit: string | null;
  witness: QaWitness;
  /** Work stops at this test until it passes */
  holdPoint: boolean;
}

const line = (testType: string, source: QaPlanSource, match: string, frequency: QaFrequency, extra: Partial<QaPlanLineDef> = {}): QaPlanLineDef => ({
  testType,
  source,
  match,
  grade: null,
  itemCategory: null,
  frequency,
  per: null,
  unit: null,
  witness: 'OWN',
  holdPoint: false,
  ...extra,
});

const CONCRETE = 'concrete, rcc, pcc';
const COMMON: QaPlanLineDef[] = [
  line('CUBE', 'WORK', CONCRETE, 'IS456', { unit: 'm3', witness: 'CLIENT' }),
  line('SLUMP', 'WORK', CONCRETE, 'DAY'),
  line('CEMENT', 'RECEIPT', 'cement', 'RECEIPT', { itemCategory: 'Cement' }),
  line('STEEL', 'RECEIPT', 'steel, tmt, reinforcement', 'RECEIPT', { itemCategory: 'Steel', witness: 'TPI' }),
  line('SAND_SILT', 'RECEIPT', 'sand', 'RECEIPT', { per: 50 }),
  line('GRADING', 'RECEIPT', 'aggregate, metal', 'RECEIPT', { per: 100 }),
];

/** A new project's starting plan by its kind of work; the QA/QC engineer edits it from the contract's specifications. */
export const STANDARD_QA_PLANS: Record<ProjectType, QaPlanLineDef[]> = {
  BUILDING: [...COMMON, line('BRICK', 'RECEIPT', 'brick, block', 'RECEIPT', { itemCategory: 'Bricks and blocks' }), line('BRICK_WA', 'RECEIPT', 'brick, block', 'RECEIPT', { itemCategory: 'Bricks and blocks' })],
  ROAD: [
    ...COMMON,
    line('MDD', 'WORK', 'embankment, subgrade', 'QUANTITY', { per: 3000, unit: 'm3' }),
    line('FDD', 'WORK', 'embankment, subgrade, gsb, wmm, granular', 'QUANTITY', { per: 500, unit: 'm2', witness: 'CLIENT', holdPoint: true }),
    line('CBR', 'WORK', 'subgrade', 'QUANTITY', { per: 3000, unit: 'm3' }),
    line('BITUMEN', 'WORK', 'bituminous, dbm, bc, sdbc', 'DAY', { witness: 'CLIENT' }),
    line('PENETRATION', 'RECEIPT', 'bitumen', 'RECEIPT'),
  ],
  WATER_SUPPLY: [...COMMON, line('HYDRO', 'WORK', 'pipe, laying', 'QUANTITY', { per: 500, unit: 'm', witness: 'CLIENT', holdPoint: true })],
  SEWERAGE: [...COMMON, line('HYDRO', 'WORK', 'pipe, laying, sewer', 'QUANTITY', { per: 300, unit: 'm', witness: 'CLIENT', holdPoint: true })],
  OTHER: COMMON,
  PLANT: [],
  STORE: [],
};

/** What is wrong with a plan line before it is saved. */
export function planLineProblem(l: QaPlanLineDef, types: TestTypeDef[]): string | null {
  if (!types.some((x) => x.code === l.testType)) return 'Choose the test';
  if (!l.match.trim() && !(l.source === 'RECEIPT' && l.itemCategory)) return l.source === 'WORK' ? 'Give the words the work is named with, such as concrete, rcc' : 'Give the item category or the words the item is named with';
  if (l.frequency === 'RECEIPT' && l.source !== 'RECEIPT') return 'Each lot received is for material received';
  if (l.source === 'RECEIPT' && l.frequency !== 'RECEIPT') return 'Material received is tested by the lot';
  if (l.frequency === 'QUANTITY' && !(l.per && l.per > 0)) return 'Give how much work one test covers';
  if (l.frequency === 'QUANTITY' && !l.unit?.trim()) return 'Give the unit the work is counted in';
  if (l.per !== null && !(l.per > 0)) return 'One test covers more than zero';
  if (l.grade && !concreteGrade(l.grade)) return 'Write the grade as M20, M25…';
  return null;
}

// What is owed

/** "M25" from "RCC M 25 slab" or "M-30 grade"; null when the text names no grade. */
export function concreteGrade(text: string | null | undefined): string | null {
  const m = /\bM\s?-?\s?(\d{2,3})\b/i.exec(text ?? '');
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 5 && n <= 100 ? `M${n}` : null;
}

/** The characteristic strength of a grade, N/mm² ("M25" → 25). */
export const gradeFck = (grade: string): number | null => {
  const g = concreteGrade(grade);
  return g ? Number(g.slice(1)) : null;
};

/** Whether text is named with any of the words ("concrete, rcc"), as whole words, ignoring case. */
export function matchesWords(text: string, words: string): boolean {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  return words
    .split(/[,;]/)
    .map((w) => w.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())
    .filter(Boolean)
    .some((w) => t.includes(` ${w} `));
}

/** IS 456 clause 15.2.2: samples for a grade's volume in a day (1 to 5 m³ one, then 2, 3, 4, and one more each 50 m³). */
export function is456Samples(volume: number): number {
  if (!(volume > 0)) return 0;
  if (volume <= 5) return 1;
  if (volume <= 15) return 2;
  if (volume <= 30) return 3;
  if (volume <= 50) return 4;
  return 4 + Math.ceil((volume - 50) / 50);
}

/** One approved DPR line: its day, quantity and unit, and the activity and BOQ item it is for. */
export interface WorkDone {
  date: string;
  quantity: number;
  unit: string;
  /** Activity name and BOQ item description */
  text: string;
}

/** One line of a goods receipt. */
export interface LotReceived {
  entryId: string;
  date: string;
  quantity: number;
  unit: string;
  itemName: string;
  category: string | null;
}

export interface TestTaken {
  planLineId: string | null;
  sampledOn: string;
}

export interface TestsOwed {
  /** Work or material the line counts, in its unit */
  quantity: number;
  unit: string | null;
  /** Days of work or lots received counted */
  occasions: number;
  required: number;
  taken: number;
  short: number;
  lastWorkOn: string | null;
  lastTestOn: string | null;
}

/** The work a line covers: named with its words, of its grade, and in its unit where the frequency counts by quantity. */
export function workFor(l: Pick<QaPlanLineDef, 'match' | 'grade' | 'frequency' | 'unit'>, work: WorkDone[]): WorkDone[] {
  const unit = l.frequency === 'IS456' ? 'm3' : l.frequency === 'QUANTITY' ? l.unit : null;
  return work.filter((w) => matchesWords(w.text, l.match) && (!l.grade || concreteGrade(w.text) === concreteGrade(l.grade)) && (!unit || sameUnit(w.unit, unit)));
}

/** The lots a line covers: of its item category, or named with its words. */
export function lotsFor(l: Pick<QaPlanLineDef, 'match' | 'itemCategory'>, lots: LotReceived[]): LotReceived[] {
  return lots.filter((r) => (l.itemCategory && r.category?.trim().toLowerCase() === l.itemCategory.trim().toLowerCase()) || (!!l.match.trim() && matchesWords(r.itemName, l.match)));
}

/** Tests a plan line owes from the work done and material received, against those taken under it. */
export function testsOwed(l: QaPlanLineDef, work: WorkDone[], lots: LotReceived[], taken: TestTaken[]): TestsOwed {
  let quantity = 0;
  let occasions = 0;
  let required = 0;
  let lastWorkOn: string | null = null;
  const latest = (d: string) => (lastWorkOn = !lastWorkOn || d > lastWorkOn ? d : lastWorkOn);
  if (l.source === 'WORK') {
    const mine = workFor(l, work);
    const byDay = new Map<string, Map<string, number>>();
    for (const w of mine) {
      quantity += w.quantity;
      latest(w.date);
      const grades = byDay.get(w.date) ?? new Map<string, number>();
      const g = concreteGrade(w.text) ?? '';
      grades.set(g, (grades.get(g) ?? 0) + w.quantity);
      byDay.set(w.date, grades);
    }
    occasions = byDay.size;
    if (l.frequency === 'IS456') for (const grades of byDay.values()) for (const v of grades.values()) required += is456Samples(v);
    else if (l.frequency === 'QUANTITY') required = quantity > 0 && l.per ? Math.max(1, Math.ceil(round3(quantity / l.per))) : 0;
    else if (l.frequency === 'DAY') required = occasions;
  } else {
    const mine = lotsFor(l, lots);
    const byEntry = new Map<string, number>();
    for (const r of mine) {
      quantity += r.quantity;
      latest(r.date);
      byEntry.set(r.entryId, (byEntry.get(r.entryId) ?? 0) + r.quantity);
    }
    occasions = byEntry.size;
    for (const q of byEntry.values()) required += l.per ? Math.max(1, Math.ceil(round3(q / l.per))) : 1;
  }
  const lastTestOn = taken.reduce<string | null>((a, x) => (!a || x.sampledOn > a ? x.sampledOn : a), null);
  return { quantity: round3(quantity), unit: l.source === 'WORK' ? (l.frequency === 'IS456' ? 'm3' : l.unit) : null, occasions, required, taken: taken.length, short: Math.max(0, required - taken.length), lastWorkOn, lastTestOn };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** The plan line a test is counted under when it was recorded without one: the only line of its type, else none. */
export function planLineFor<L extends { id: string; testType: string; grade: string | null }>(testType: string | null, title: string, lines: L[]): L | null {
  if (!testType) return null;
  const same = lines.filter((l) => l.testType === testType);
  if (same.length <= 1) return same[0] ?? null;
  const grade = concreteGrade(title);
  const byGrade = same.filter((l) => l.grade && grade && concreteGrade(l.grade) === grade);
  if (byGrade.length === 1) return byGrade[0];
  const general = same.filter((l) => !l.grade);
  return general.length === 1 ? general[0] : null;
}

// Pours and the IS 456 acceptance check

export const POUR_STATUSES = ['PLANNED', 'POURED', 'CANCELLED'] as const;
export type PourStatus = (typeof POUR_STATUSES)[number];
export const POUR_STATUS_LABELS: Record<PourStatus, string> = { PLANNED: 'Planned', POURED: 'Poured', CANCELLED: 'Cancelled' };

export const POUR_SORT_FIELDS = ['date', 'pourNo', 'grade'] as const;
export type PourSortField = (typeof POUR_SORT_FIELDS)[number];

export const POUR_SOURCES = ['RMC', 'SITE'] as const;
export type PourSource = (typeof POUR_SOURCES)[number];
export const POUR_SOURCE_LABELS: Record<PourSource, string> = { RMC: 'Ready-mix', SITE: 'Batched at site' };

/** The points a pour card clears before concrete is placed. */
export const POUR_CARD_CHECKLIST = {
  name: 'Pour card',
  items: [
    'Shuttering: line, level, plumb and joints tight',
    'Shuttering: props, bracing and oil',
    'Reinforcement as per drawing, cover blocks in place',
    'Embedded items, sleeves and conduits in place',
    'Construction joints prepared',
    'Concrete grade and mix approved, quantity ordered',
    'Vibrators, standby and lighting ready',
    'Cube moulds and slump cone at the pour',
    'Curing arrangement ready',
  ],
};

/** Table 8 of IS 456: the standard deviation assumed until a grade has 30 results of its own. */
export function assumedSd(fck: number): number {
  if (fck <= 15) return 3.5;
  if (fck <= 25) return 4;
  return 5;
}

/** Results of its own a grade needs before its standard deviation is "established" (IS 456 clause 9.2.4.1). */
export const ESTABLISHED_SD_RESULTS = 30;

export interface CubeResult {
  id: string;
  date: string;
  /** The 28-day result: the mean of the sample's cubes, N/mm² */
  value: number;
}

export interface CubeGroup {
  ids: string[];
  from: string;
  to: string;
  mean: number;
  needed: number;
  ok: boolean;
}

export type CubeVerdict = 'PASS' | 'FAIL' | 'WAITING';

export interface CubeAcceptance {
  fck: number;
  sd: number;
  sdEstablished: boolean;
  /** Each result's own floor (fck − 3) */
  individualMin: number;
  /** What the mean of four must reach */
  meanNeeded: number;
  groups: CubeGroup[];
  /** Results that fall below the individual floor */
  lowIds: string[];
  /** Results after the last group of four, waiting for the rest of theirs */
  pending: number;
  mean: number | null;
  verdict: CubeVerdict;
}

const half = (n: number) => Math.round(n * 2) / 2;

/** The sample standard deviation of results. */
export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const m = values.reduce((a, v) => a + v, 0) / values.length;
  return Math.sqrt(values.reduce((a, v) => a + (v - m) ** 2, 0) / (values.length - 1));
}

/**
 * The acceptance check of IS 456 clause 16.1 and Table 11 (as amended): in date order, the mean of each four
 * non-overlapping consecutive results must reach fck + 0.825 × the standard deviation (rounded to 0.5 N/mm²) or
 * fck + 3 N/mm², whichever is greater, and every result must reach fck − 3 N/mm². The standard deviation is the grade's
 * own once it has 30 results, else Table 8's.
 */
export function cubeAcceptance(results: CubeResult[], fck: number): CubeAcceptance {
  const sorted = [...results].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const sdEstablished = sorted.length >= ESTABLISHED_SD_RESULTS;
  const sd = sdEstablished ? Math.round(standardDeviation(sorted.map((r) => r.value)) * 100) / 100 : assumedSd(fck);
  const meanNeeded = Math.max(half(fck + 0.825 * sd), fck + 3);
  const individualMin = fck - 3;
  const groups: CubeGroup[] = [];
  for (let i = 0; i + 4 <= sorted.length; i += 4) {
    const four = sorted.slice(i, i + 4);
    const mean = Math.round((four.reduce((a, r) => a + r.value, 0) / 4) * 100) / 100;
    groups.push({ ids: four.map((r) => r.id), from: four[0].date, to: four[3].date, mean, needed: meanNeeded, ok: mean >= meanNeeded });
  }
  const lowIds = sorted.filter((r) => r.value < individualMin).map((r) => r.id);
  const mean = sorted.length ? Math.round((sorted.reduce((a, r) => a + r.value, 0) / sorted.length) * 100) / 100 : null;
  const verdict: CubeVerdict = lowIds.length || groups.some((g) => !g.ok) ? 'FAIL' : groups.length ? 'PASS' : 'WAITING';
  return { fck, sd, sdEstablished, individualMin, meanNeeded, groups, lowIds, pending: sorted.length % 4, mean, verdict };
}

/** Cube sets a pour owes under IS 456 for its volume (at least one once anything is poured). */
export const cubeSetsFor = (volume: number | null | undefined) => is456Samples(Number(volume ?? 0));

/** What the register flags on a pour: poured without a passed card, or fewer cube sets than IS 456 asks. */
export function pourFlags(p: { status: PourStatus; volume: number | null; cardPassed: boolean; cubeSets: number }): ('NO_CARD' | 'CUBES_SHORT')[] {
  if (p.status !== 'POURED') return [];
  const flags: ('NO_CARD' | 'CUBES_SHORT')[] = [];
  if (!p.cardPassed) flags.push('NO_CARD');
  if (p.cubeSets < cubeSetsFor(p.volume)) flags.push('CUBES_SHORT');
  return flags;
}

export const POUR_FLAG_LABELS = { NO_CARD: 'Poured without a passed card', CUBES_SHORT: 'Cube sets short' } as const;

// What the API returns

export interface TestTypeDto extends TestTypeDef {
  /** One of STANDARD_TEST_TYPES (perhaps changed by the company) */
  standard: boolean;
  /** A standard type the company has changed */
  changed: boolean;
  /** Tests recorded as it */
  inUse: number;
}

export interface QaPlanLineDto extends QaPlanLineDef {
  id: string;
  projectId: string;
  testName: string;
  notes: string | null;
  sortOrder: number;
}

export interface QaPlanDto {
  projectId: string;
  projectName: string;
  projectType: ProjectType;
  lines: QaPlanLineDto[];
  canEdit: boolean;
}

export interface TestsDueRowDto extends TestsOwed {
  line: QaPlanLineDto;
  projectName: string;
}

export interface TestsDueDto {
  rows: TestsDueRowDto[];
  required: number;
  taken: number;
  short: number;
  /** Projects the reader sees with no quality plan yet */
  withoutPlan: { id: string; name: string }[];
}

export interface PourTestDto {
  id: string;
  testNo: string;
  sampledOn: string;
  result: string;
  /** The 28-day result, when in */
  value: string | null;
}

export interface PourDto {
  id: string;
  pourNo: string;
  projectId: string;
  projectName: string;
  activityId: string;
  activityName: string;
  date: string;
  location: string;
  grade: string;
  plannedVolume: string;
  volume: string | null;
  source: PourSource;
  supplier: string | null;
  status: PourStatus;
  remarks: string | null;
  card: { id: string; inspectionNo: string; status: string } | null;
  cardPassed: boolean;
  tests: PourTestDto[];
  /** Cube sets IS 456 asks for its volume (planned until poured) */
  cubeSetsDue: number;
  flags: (keyof typeof POUR_FLAG_LABELS)[];
  createdByName: string;
  createdAt: string;
}

export interface CubeAcceptanceDto {
  projectId: string;
  projectName: string;
  grade: string;
  results: (CubeResult & { testNo: string; pourNo: string | null })[];
  acceptance: CubeAcceptance;
}
