/**
 * Indian Standards: the catalogue and the company's copies over it, what a standard needs before it is saved, whether
 * its edition was checked lately, which clauses a test proves, and compliance by standard and discipline, with no
 * database. CI runs it after the build:
 *
 *   node dist/scripts/is-standards-test.js
 */
import assert from 'node:assert/strict';
import {
  STANDARD_IS_CODES,
  STANDARD_TEST_TYPES,
  editionState,
  isCompliance,
  isStandardCode,
  isStandardLabel,
  isStandardProblem,
  isStandardsOf,
  standardsForTestType,
  type ComplianceTest,
  type IsStandardDef,
} from '@erp/shared';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);

const typeCodes = STANDARD_TEST_TYPES.map((t) => t.code);
const byCode = (code: string) => STANDARD_IS_CODES.find((s) => s.code === code)!;

test('the catalogue: codes come from the numbers, none repeats, and every standard would save as shipped', () => {
  const codes = STANDARD_IS_CODES.map((s) => s.code);
  assert.equal(new Set(codes).size, codes.length);
  for (const s of STANDARD_IS_CODES) {
    assert.equal(s.code, isStandardCode(s.number), s.number);
    assert.equal(isStandardProblem(s, typeCodes, 2026), null, s.number);
    assert.ok(s.clauses.length, `${s.number} has a clause`);
  }
  assert.deepEqual(new Set(STANDARD_IS_CODES.map((s) => s.discipline)), new Set(['CIVIL', 'MECHANICAL', 'ELECTRICAL']));
});

test('a number with its part reads as one key, and a standard is written with its edition', () => {
  assert.equal(isStandardCode('IS 2720 (Part 8)'), 'IS_2720_PART_8');
  assert.equal(isStandardCode(' is 456 '), 'IS_456');
  assert.equal(isStandardLabel(byCode('IS_456')), 'IS 456:2000');
});

test("the company's copy replaces the catalogue's by code, and its own come after the catalogue", () => {
  const copy: IsStandardDef = { ...byCode('IS_456'), checkedOn: '2026-10-01', active: false };
  const own: IsStandardDef = { ...byCode('IS_456'), code: 'IS_14858', number: 'IS 14858', year: 2000, title: 'Compression testing machine', clauses: [] };
  const list = isStandardsOf([own, copy]);
  assert.equal(list.length, STANDARD_IS_CODES.length + 1);
  assert.equal(list.find((s) => s.code === 'IS_456')!.checkedOn, '2026-10-01');
  assert.equal(list.at(-1)!.code, 'IS_14858');
});

test('a standard is refused with words that say what to fix', () => {
  const base = byCode('IS_456');
  assert.match(isStandardProblem({ ...base, number: '456' }, typeCodes, 2026)!, /as BIS writes it/);
  assert.match(isStandardProblem({ ...base, year: 2030 }, typeCodes, 2026)!, /edition's year/);
  assert.match(isStandardProblem({ ...base, reaffirmed: 1999 }, typeCodes, 2026)!, /reaffirmed/);
  assert.match(isStandardProblem({ ...base, subject: ' ' }, typeCodes, 2026)!, /about/);
  const unknownTest = { ...base, clauses: [{ ...base.clauses[1], check: { by: 'TEST' as const, testTypeCode: 'NOPE' } }] };
  assert.equal(isStandardProblem(unknownTest, typeCodes, 2026), 'Choose the test that proves 7.1');
  const untitled = { ...base, clauses: [{ ...base.clauses[0], ref: null, title: '' }] };
  assert.equal(isStandardProblem(untitled, typeCodes, 2026), 'Give Clause 1 a title');
});

test('an edition never checked, checked within a year, or checked longer ago', () => {
  assert.equal(editionState(null, '2026-11-08'), 'NEVER');
  assert.equal(editionState('2025-11-08', '2026-11-08'), 'CURRENT');
  assert.equal(editionState('2025-11-07', '2026-11-08'), 'DUE');
});

test('a test type proves the tracked clauses that name it, and a standard switched off drops out', () => {
  const cube = standardsForTestType('CUBE', STANDARD_IS_CODES).map((r) => `${r.standard.number} ${r.clause.ref ?? r.clause.title}`);
  assert.deepEqual(cube, ['IS 456 15.2.2', 'IS 456 16.1, Table 11', 'IS 516 (Part 1/Sec 1) Compressive strength of cubes']);
  const off = STANDARD_IS_CODES.map((s) => (s.code === 'IS_516_PART_1_SEC_1' ? { ...s, active: false } : s));
  assert.equal(standardsForTestType('CUBE', off).length, 2);
  assert.deepEqual(standardsForTestType(null, STANDARD_IS_CODES), []);
});

test('compliance counts a test once by discipline, under every standard that names it, and keeps the rest apart', () => {
  const tests: ComplianceTest[] = [
    { testTypeCode: 'CUBE', result: 'PASS' },
    { testTypeCode: 'CUBE', result: 'FAIL' },
    { testTypeCode: 'CUBE', result: 'PENDING' },
    { testTypeCode: 'EARTH', result: 'PASS' },
    { testTypeCode: 'INSULATION', result: 'FAIL' },
    { testTypeCode: 'FDD', result: 'PASS' },
    { testTypeCode: null, result: 'PASS' },
  ];
  const c = isCompliance(tests, STANDARD_IS_CODES);
  assert.equal(c.standards, STANDARD_IS_CODES.length);
  assert.deepEqual(c.totals, { passed: 4, failed: 2, waiting: 1, passRate: 67 });
  assert.deepEqual(c.byDiscipline.map((d) => [d.discipline, d.passed, d.failed, d.waiting, d.passRate]), [['CIVIL', 1, 1, 1, 50], ['MECHANICAL', 0, 0, 0, null], ['ELECTRICAL', 1, 1, 0, 50]]);
  const row = (code: string) => c.byStandard.find((s) => s.code === code)!;
  assert.deepEqual([row('IS_456').passed, row('IS_516_PART_1_SEC_1').passed], [1, 1]);
  assert.equal(row('IS_732').failed, 1);
  assert.equal(row('IS_325').failed, 1);
  assert.equal(c.byStandard.find((s) => s.code === 'IS_8329'), undefined, 'a standard proved only by certificate has no row');
  assert.deepEqual(c.unlinked, { passed: 2, failed: 0, waiting: 0, passRate: 100 });
});

test('a switched-off standard leaves compliance, and its tests count where another standard names them', () => {
  const off = STANDARD_IS_CODES.map((s) => (s.code === 'IS_732' ? { ...s, active: false } : s));
  const c = isCompliance([{ testTypeCode: 'INSULATION', result: 'PASS' }], off);
  assert.equal(c.standards, STANDARD_IS_CODES.length - 1);
  assert.equal(c.byStandard.find((s) => s.code === 'IS_732'), undefined);
  assert.equal(c.byDiscipline.find((d) => d.discipline === 'ELECTRICAL')!.passed, 1);
});

let failed = 0;
for (const [name, fn] of cases) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n${(e as Error).message}`);
  }
}
console.log(`\n${cases.length - failed}/${cases.length} passed`);
if (failed) process.exit(1);
