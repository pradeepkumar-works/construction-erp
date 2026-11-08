/**
 * Indian Standards (ARCHITECTURE "Indian Standards"): the library of IS codes a company works to, each clause tied to the
 * one way it is proved (a test of a test type, the maker's certificate, or inspection on site), whether the company's
 * edition was checked against BIS lately, and compliance read from the tests by standard and by discipline.
 *
 * The standards are data like test types: the catalogue below is what a company uses until it saves its own copy
 * (matched by code), so a new company needs no seeding. A clause's words are the company's summary of the standard,
 * never BIS's text, which is copyright and sold by BIS.
 */
import { IS_DISCIPLINES, type IsDiscipline } from './enums';
import { passRate } from './qa-audits';
import { daysBetween } from './maintenance';
import type { TestResult } from './quality';

/** How a clause is proved: exactly one way, and only a test names a test type. */
export type IsClauseCheck = { by: 'TEST'; testTypeCode: string } | { by: 'CERTIFICATE' } | { by: 'INSPECTION' };
export const IS_CLAUSE_CHECKS = ['TEST', 'CERTIFICATE', 'INSPECTION'] as const;
export type IsClauseCheckBy = (typeof IS_CLAUSE_CHECKS)[number];
export const IS_CLAUSE_CHECK_LABELS: Record<IsClauseCheckBy, string> = {
  TEST: 'Test',
  CERTIFICATE: "Maker's test certificate",
  INSPECTION: 'Inspection on site',
};

export interface IsClauseDef {
  /** Clause or table, as the standard numbers it ("15.2.2", "Table 11"); null where the summary covers a section */
  ref: string | null;
  title: string;
  /** What the clause asks, in the company's words */
  requirement: string;
  check: IsClauseCheck;
  /** How often it is checked, where the standard says; else the quality plan sets it */
  sampling: string | null;
  /** What is allowed either side of the requirement */
  tolerance: string | null;
}

export interface IsStandardDef {
  /** Upper-case key from the number (`isStandardCode`), fixed once saved */
  code: string;
  /** "IS 456", "IS 2720 (Part 8)" */
  number: string;
  /** The edition's year */
  year: number;
  /** The year BIS last reaffirmed the edition, if it has */
  reaffirmed: number | null;
  title: string;
  discipline: IsDiscipline;
  /** What it is about: concrete, pipes, earthing… */
  subject: string;
  clauses: IsClauseDef[];
  /** Tracked by the company: a switched-off standard leaves the library's default view and compliance */
  active: boolean;
  /** The day someone last checked the edition against BIS (YYYY-MM-DD) */
  checkedOn: string | null;
}

/** BIS's own search for an Indian Standard by number (BIS Connect, Know your standards); it takes the number typed in. */
export const BIS_STANDARDS_SEARCH_URL = 'https://www.services.bis.gov.in/php/BIS_2.0/bisconnect/knowyourstandards/Indian_standards/isdetails/';

/** An edition checked longer ago than this is due a check: BIS reviews its standards at least every five years. */
export const EDITION_CHECK_DAYS = 365;

/** The key a standard is saved under: "IS 2720 (Part 8)" is IS_2720_PART_8. */
export function isStandardCode(number: string): string {
  return number
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** "IS 456:2000", as BIS writes a standard with its edition. */
export const isStandardLabel = (s: Pick<IsStandardDef, 'number' | 'year'>) => `${s.number}:${s.year}`;

const test = (testTypeCode: string): IsClauseCheck => ({ by: 'TEST', testTypeCode });
const CERTIFICATE: IsClauseCheck = { by: 'CERTIFICATE' };
const INSPECTION: IsClauseCheck = { by: 'INSPECTION' };

const clause = (ref: string | null, title: string, requirement: string, check: IsClauseCheck, extra: Partial<Pick<IsClauseDef, 'sampling' | 'tolerance'>> = {}): IsClauseDef => ({
  ref,
  title,
  requirement,
  check,
  sampling: extra.sampling ?? null,
  tolerance: extra.tolerance ?? null,
});

const std = (number: string, year: number, discipline: IsDiscipline, subject: string, title: string, clauses: IsClauseDef[], reaffirmed: number | null = null): IsStandardDef => ({
  code: isStandardCode(number),
  number,
  year,
  reaffirmed,
  title,
  discipline,
  subject,
  clauses,
  active: true,
  checkedOn: null,
});

const makersCertificate = (what: string) => clause(null, "Maker's test certificate", `Each lot comes with the maker's certificate for ${what}.`, CERTIFICATE, { sampling: 'Every lot received' });

/**
 * The Indian Standards a contractor building, water supply and plant works usually works to, with the clauses site
 * checks most. Summaries, written to be checked against the company's own copies; a company edits its copy.
 */
export const STANDARD_IS_CODES: IsStandardDef[] = [
  std('IS 456', 2000, 'CIVIL', 'Concrete', 'Plain and reinforced concrete: code of practice', [
    clause('8.2.4.1, Table 5', 'Minimum grade by exposure', 'Reinforced concrete at least M20 in mild exposure, M25 moderate, M30 severe, M35 very severe and M40 extreme. The drawing states the exposure.', INSPECTION),
    clause('7.1', 'Workability', 'Slump of 25 to 75 mm for mass concrete and lightly reinforced sections, 50 to 100 mm for heavily reinforced sections placed by hand, 75 to 100 mm for pumped concrete and 100 to 150 mm for trench fill and in-situ piling.', test('SLUMP')),
    clause('15.2.2', 'Frequency of sampling', 'Samples of each grade poured in a day: 1 for 1 to 5 m³, 2 for 6 to 15, 3 for 16 to 30, 4 for 31 to 50, and one more for each further 50 m³ or part. A sample is three cubes and its result their mean.', test('CUBE'), { sampling: '1 to 5 m³: 1; 6 to 15: 2; 16 to 30: 3; 31 to 50: 4; then 1 per 50 m³ more' }),
    clause('16.1, Table 11', 'Acceptance of concrete', 'The mean of any four non-overlapping consecutive results at least fck + 0.825 × the standard deviation (rounded to 0.5), or fck + 3 N/mm², whichever is more. The pour register checks it by grade.', test('CUBE'), { tolerance: 'No single result below fck − 3 N/mm²' }),
    clause('26.4.2, Table 16', 'Nominal cover', 'Nominal cover to all reinforcement of 20 mm in mild exposure, 30 mm moderate, 45 mm severe, 50 mm very severe and 75 mm extreme.', INSPECTION, { sampling: 'Every pour, before concreting', tolerance: '+10 mm, −0 mm' }),
  ], 2021),
  std('IS 516 (Part 1/Sec 1)', 2021, 'CIVIL', 'Concrete', 'Hardened concrete, methods of test: compressive, flexural and split tensile strength', [
    clause(null, 'Compressive strength of cubes', '150 mm cubes cured in water at 27 ± 2 °C until tested, usually at 7 and 28 days. A result is the mean of three specimens.', test('CUBE')),
  ]),
  std('IS 10262', 2019, 'CIVIL', 'Concrete', 'Concrete mix proportioning: guidelines', [
    clause(null, 'Target mean strength', "The mix is designed for f'ck = fck + 1.65 s, or fck + X, whichever is more; X is 5.0 for M10 to M15, 5.5 for M20 to M25, 6.5 for M30 to M60 and 8.0 above.", INSPECTION, { sampling: 'Each mix design, before it is used' }),
  ]),
  std('IS 383', 2016, 'CIVIL', 'Aggregates', 'Coarse and fine aggregate for concrete: specification', [
    clause(null, 'Aggregate impact value', 'Not more than 45% for concrete other than wearing surfaces, and 30% for wearing surfaces such as roads and pavements.', test('AIV'), { tolerance: '≤ 30% wearing surfaces, ≤ 45% other' }),
    clause(null, 'Deleterious material in sand', 'Silt, clay and fine dust in fine aggregate within the limits for the kind of sand. Site screens each lot with the silt test.', test('SAND_SILT'), { sampling: 'Every lot received' }),
  ]),
  std('IS 1786', 2008, 'CIVIL', 'Reinforcement', 'High strength deformed steel bars and wires for concrete reinforcement: specification', [
    clause('Table 3', 'Mechanical properties', 'Fe 500D: 0.2% proof stress at least 500 N/mm², tensile strength at least 1.10 times it and elongation at least 16%. Fe 500: 1.08 times and 12%. Fe 550D: 1.08 times and 14.5%.', test('STEEL')),
    makersCertificate('cast analysis and mechanical properties'),
  ]),
  std('IS 269', 2015, 'CIVIL', 'Cement', 'Ordinary Portland cement: specification', [
    clause(null, 'Compressive strength', 'At least 16, 22 and 33 N/mm² at 3, 7 and 28 days for 33 grade; 23, 33 and 43 for 43 grade; 27, 37 and 53 for 53 grade.', test('CEMENT')),
    clause(null, 'Setting time', 'Initial setting time not less than 30 minutes and final not more than 600 minutes.', test('CEMENT')),
    makersCertificate('the week of manufacture, strength and setting time'),
  ]),
  std('IS 1077', 1992, 'CIVIL', 'Bricks', 'Common burnt clay building bricks: specification', [
    clause(null, 'Compressive strength', 'The mean of five bricks not below the class ordered (3.5 to 35 N/mm²), and no brick more than 20% below it.', test('BRICK')),
    clause(null, 'Water absorption', 'After 24 hours in water, not more than 20% by weight up to class 12.5 and 15% for higher classes.', test('BRICK_WA')),
  ]),
  std('IS 2720 (Part 8)', 1983, 'CIVIL', 'Soil', 'Methods of test for soils: water content and dry density relation using heavy compaction', [
    clause(null, 'Maximum dry density and optimum moisture', 'The laboratory maximum dry density and optimum moisture content that field compaction is measured against.', test('MDD'), { sampling: 'Each kind of fill, and when the borrow area changes' }),
  ]),
  std('IS 800', 2007, 'CIVIL', 'Structural steel', 'General construction in steel: code of practice', [
    clause('Section 17', 'Fabrication and erection tolerances', 'Fabricated members and erected steelwork within the tolerances of the fabrication and erection section, checked before bolting up and grouting.', INSPECTION),
  ]),
  std('IS 8329', 2000, 'CIVIL', 'Pipes', 'Centrifugally cast (spun) ductile iron pressure pipes for water, gas and sewage: specification', [
    clause(null, 'Hydrostatic test at the works', "Every pipe is pressure tested at the works before it is coated; the maker's certificate gives the pressure for its class and size.", CERTIFICATE, { sampling: 'Every lot received' }),
  ]),
  std('IS 12288', 1987, 'CIVIL', 'Pipes', 'Use and laying of ductile iron pipes: code of practice', [
    clause(null, 'Field hydraulic test', 'Each laid and jointed stretch is filled, its air let out and held at the test pressure the specification sets, with leakage within the allowance.', test('HYDRO'), { sampling: 'Every stretch, before backfilling the joints' }),
  ]),
  std('IS 5822', 1994, 'CIVIL', 'Pipes', 'Laying of electrically welded steel pipes for water supply: code of practice', [
    clause(null, 'Field hydraulic test', 'Each laid and welded stretch is held at the test pressure the specification sets, with no leak at the welds.', test('HYDRO'), { sampling: 'Every stretch, before backfilling the joints' }),
  ]),
  std('IS 3589', 2001, 'CIVIL', 'Pipes', 'Steel pipes for water and sewage (168.3 to 2540 mm outside diameter): specification', [makersCertificate('the hydrostatic test, chemical analysis and tensile test')]),
  std('IS 4984', 2016, 'CIVIL', 'Pipes', 'Polyethylene pipes for water supply: specification', [makersCertificate('dimensions, density and the internal pressure tests')]),
  std('IS 2825', 1969, 'MECHANICAL', 'Pressure vessels', 'Code for unfired pressure vessels', [
    clause(null, 'Hydrostatic test', 'The finished vessel is tested at 1.3 times its design pressure, corrected for temperature, and held while every joint is inspected.', test('VESSEL_HYDRO'), { sampling: 'Every vessel, before it is put in service', tolerance: 'No leak and no pressure drop over the hold' }),
  ]),
  std('IS 9137', 1978, 'MECHANICAL', 'Pumps', 'Code for acceptance tests for centrifugal, mixed flow and axial pumps: class C', [
    clause(null, 'Duty point and efficiency', "The pump's head, discharge and efficiency are measured at the guaranteed duty point and held against the guarantee within class C's tolerances.", test('PUMP'), { sampling: 'Every pump, at commissioning' }),
  ]),
  std('IS 5120', 1977, 'MECHANICAL', 'Pumps', 'Technical requirements for rotodynamic special purpose pumps', [makersCertificate('head, discharge, efficiency and power at the duty point')]),
  std('IS 1239 (Part 1)', 2004, 'MECHANICAL', 'Pipes', 'Steel tubes, tubulars and other wrought steel fittings: Part 1 steel tubes', [makersCertificate('the hydraulic test at the works')]),
  std('IS 3043', 2018, 'ELECTRICAL', 'Earthing', 'Code of practice for earthing', [
    clause(null, 'Earth electrode resistance', 'Each electrode and the earth grid measured by the fall-of-potential method, before and after connection, within the value the design sets.', test('EARTH'), { sampling: 'Every pit, at commissioning and each year', tolerance: 'As the design sets; 1 Ω is usual for a substation grid' }),
  ]),
  std('IS 732', 2019, 'ELECTRICAL', 'Wiring', 'Code of practice for electrical wiring installations', [
    clause(null, 'Insulation resistance', 'Each circuit tested at 500 V DC before it is energised: at least 1 MΩ for circuits up to 500 V.', test('INSULATION'), { sampling: 'Every circuit, before it is energised' }),
  ]),
  std('IS 7098 (Part 2)', 2011, 'ELECTRICAL', 'Cables', 'Crosslinked polyethylene insulated PVC sheathed cables: Part 2 for working voltages from 3.3 kV up to and including 33 kV', [
    makersCertificate('the routine tests at the works'),
    clause(null, 'Insulation resistance after laying', 'Each run tested after laying and jointing, before it is energised.', test('INSULATION'), { sampling: 'Every run' }),
  ]),
  std('IS 694', 2010, 'ELECTRICAL', 'Cables', 'PVC insulated cables for working voltages up to and including 1100 V', [makersCertificate('the routine tests at the works')]),
  std('IS 2026 (Part 1)', 2011, 'ELECTRICAL', 'Transformers', 'Power transformers: Part 1 general', [makersCertificate('the routine tests: winding resistance, ratio, impedance, losses and the dielectric tests')]),
  std('IS 325', 1996, 'ELECTRICAL', 'Motors', 'Three-phase induction motors: specification', [
    makersCertificate('the routine tests at the works'),
    clause(null, 'Insulation resistance before commissioning', 'The windings tested to earth before the motor is first run.', test('INSULATION'), { sampling: 'Every motor, at commissioning' }),
  ]),
];

/** The company's standards: the catalogue with its copies laid over it by code, then its own. */
export function isStandardsOf(own: IsStandardDef[]): IsStandardDef[] {
  const byCode = new Map(own.map((o) => [o.code, o]));
  const shipped = new Set(STANDARD_IS_CODES.map((s) => s.code));
  return [...STANDARD_IS_CODES.map((s) => byCode.get(s.code) ?? s), ...own.filter((o) => !shipped.has(o.code))];
}

const IS_NUMBER = /^IS\s+\d+/i;

/** What is wrong with a standard before it is saved, in words for the form; `testTypes` are the codes a test clause may name. */
export function isStandardProblem(d: Omit<IsStandardDef, 'code' | 'active' | 'checkedOn'>, testTypes: readonly string[], thisYear: number): string | null {
  if (!IS_NUMBER.test(d.number.trim())) return 'Give the number as BIS writes it, such as IS 456 or IS 2720 (Part 8)';
  if (!Number.isInteger(d.year) || d.year < 1947 || d.year > thisYear) return `Give the edition's year, 1947 to ${thisYear}`;
  if (d.reaffirmed !== null && (!Number.isInteger(d.reaffirmed) || d.reaffirmed < d.year || d.reaffirmed > thisYear)) return `The year reaffirmed is from the edition's year to ${thisYear}`;
  if (!d.title.trim()) return 'Give the title';
  if (!d.subject.trim()) return 'Say what it is about, such as Concrete';
  if (d.clauses.length > 40) return 'A standard has at most 40 clauses here; keep the ones site checks';
  for (const [i, c] of d.clauses.entries()) {
    const name = c.ref?.trim() || `Clause ${i + 1}`;
    if (!c.title.trim()) return `Give ${name} a title`;
    if (!c.requirement.trim()) return `Say what ${name} asks`;
    if (c.check.by === 'TEST' && !testTypes.includes(c.check.testTypeCode)) return `Choose the test that proves ${name}`;
  }
  return null;
}

/** Whether the company's edition was checked against BIS lately: never, due (over a year ago) or current. */
export const EDITION_STATES = ['NEVER', 'DUE', 'CURRENT'] as const;
export type EditionState = (typeof EDITION_STATES)[number];
export const EDITION_STATE_LABELS: Record<EditionState, string> = { NEVER: 'Never checked', DUE: 'Check due', CURRENT: 'Checked' };

export function editionState(checkedOn: string | null, today: string): EditionState {
  if (!checkedOn) return 'NEVER';
  return daysBetween(checkedOn, today) > EDITION_CHECK_DAYS ? 'DUE' : 'CURRENT';
}

export interface ClauseRef {
  standard: IsStandardDef;
  clause: IsClauseDef;
}

/** The tracked standards' clauses a test type proves, in library order. */
export function standardsForTestType(code: string | null | undefined, standards: IsStandardDef[]): ClauseRef[] {
  if (!code) return [];
  return standards.filter((s) => s.active).flatMap((s) => s.clauses.filter((c) => c.check.by === 'TEST' && c.check.testTypeCode === code).map((c) => ({ standard: s, clause: c })));
}

/** The test types a standard's clauses name, once each. */
export const testTypesOfStandard = (s: IsStandardDef) => [...new Set(s.clauses.flatMap((c) => (c.check.by === 'TEST' ? [c.check.testTypeCode] : [])))];

// Compliance

export interface ComplianceTest {
  testTypeCode: string | null;
  result: TestResult;
}

export interface ComplianceCount {
  passed: number;
  failed: number;
  waiting: number;
  /** Passed of those decided, rounded; null with none decided */
  passRate: number | null;
}

export interface StandardCompliance extends ComplianceCount {
  code: string;
  number: string;
  year: number;
  title: string;
  discipline: IsDiscipline;
}

export interface IsCompliance {
  /** Standards tracked */
  standards: number;
  /** Every test in view, under a standard or not */
  totals: ComplianceCount;
  /** Each test once, under the discipline of the first tracked standard that names its type */
  byDiscipline: (ComplianceCount & { discipline: IsDiscipline })[];
  /** A test counts under every tracked standard that names its type; standards proved by no test are left out */
  byStandard: StandardCompliance[];
  /** Tests whose type no tracked standard names */
  unlinked: ComplianceCount;
}

const tally = (tests: ComplianceTest[]): ComplianceCount => {
  const passed = tests.filter((t) => t.result === 'PASS').length;
  const failed = tests.filter((t) => t.result === 'FAIL').length;
  return { passed, failed, waiting: tests.length - passed - failed, passRate: passRate(passed, failed) };
};

/** Tests passed, failed and waiting by standard and by discipline. */
export function isCompliance(tests: ComplianceTest[], standards: IsStandardDef[]): IsCompliance {
  const tracked = standards.filter((s) => s.active);
  const disciplineOf = new Map<string, IsDiscipline>();
  for (const s of tracked) for (const code of testTypesOfStandard(s)) if (!disciplineOf.has(code)) disciplineOf.set(code, s.discipline);
  const linked = (t: ComplianceTest) => t.testTypeCode !== null && disciplineOf.has(t.testTypeCode);
  return {
    standards: tracked.length,
    totals: tally(tests),
    byDiscipline: IS_DISCIPLINES.map((discipline) => ({ discipline, ...tally(tests.filter((t) => linked(t) && disciplineOf.get(t.testTypeCode!) === discipline)) })),
    byStandard: tracked
      .map((s) => ({ s, types: testTypesOfStandard(s) }))
      .filter(({ types }) => types.length)
      .map(({ s, types }) => ({ code: s.code, number: s.number, year: s.year, title: s.title, discipline: s.discipline, ...tally(tests.filter((t) => t.testTypeCode !== null && types.includes(t.testTypeCode))) })),
    unlinked: tally(tests.filter((t) => !linked(t))),
  };
}

// What the API returns

export interface IsStandardDto extends IsStandardDef {
  /** One of STANDARD_IS_CODES (perhaps changed by the company) */
  standard: boolean;
  /** A catalogue standard the company has changed */
  changed: boolean;
  edition: EditionState;
  checkedByName: string | null;
}

export interface IsComplianceDto extends IsCompliance {
  from: string;
  to: string;
  projectId: string | null;
}
