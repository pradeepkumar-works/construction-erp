/**
 * QA/QC's tests (item 137): the company's test types over the standard ones, a quality plan's lines, the tests a line
 * owes from the work done and the material received, the IS 456 sampling and Table 11 acceptance figures, and a pour's
 * flags, with no database. CI runs it after the build:
 *
 *   node dist/scripts/qa-plan-test.js
 */
import assert from 'node:assert/strict';
import {
  STANDARD_QA_PLANS,
  STANDARD_TEST_TYPES,
  assumedSd,
  concreteGrade,
  cubeAcceptance,
  cubeSetsFor,
  gradeFck,
  is456Samples,
  lotsFor,
  matchesWords,
  planLineFor,
  planLineProblem,
  pourFlags,
  testTypeProblem,
  testTypesOf,
  testsOwed,
  workFor,
  type CubeResult,
  type QaPlanLineDef,
  type WorkDone,
} from '@erp/shared';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);

const cubeLine = STANDARD_QA_PLANS.BUILDING.find((l) => l.testType === 'CUBE')!;
const w = (date: string, quantity: number, text: string, unit = 'Cum'): WorkDone => ({ date, quantity, unit, text });

test('IS 456 15.2.2: one sample to 5 m³, then 2, 3, 4, and one more for each 50 m³ or part', () => {
  assert.deepEqual([0, 3, 5, 5.5, 15, 16, 30, 50, 51, 100, 101, 180].map(is456Samples), [0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 7]);
  assert.equal(cubeSetsFor('12' as unknown as number), 2);
  assert.equal(cubeSetsFor(null), 0);
});

test('a grade is read from the work’s name in its usual spellings', () => {
  assert.equal(concreteGrade('RCC M 25 slab, first floor'), 'M25');
  assert.equal(concreteGrade('PCC M-10 below footing'), 'M10');
  assert.equal(concreteGrade('Concrete of grade M30'), 'M30');
  assert.equal(concreteGrade('Brickwork in CM 1:6'), null);
  assert.equal(concreteGrade('MS pipe 200 mm'), null);
  assert.equal(gradeFck('m35'), 35);
});

test('words match whole words in any case, so "rcc" finds "RCC slab" but "bc" does not find "abc"', () => {
  assert.ok(matchesWords('RCC M25 slab', 'concrete, rcc'));
  assert.ok(matchesWords('Laying of DBM course', 'bituminous, dbm'));
  assert.ok(!matchesWords('abc road', 'bc'));
  assert.ok(matchesWords('Hard aggregate 20 mm', 'metal, aggregate'));
});

test('cubes owed are counted per grade and day, so two grades poured on one day each owe their own samples', () => {
  const work = [w('2026-10-01', 12, 'RCC M25 slab'), w('2026-10-01', 4, 'PCC M15'), w('2026-10-02', 60, 'RCC M25 raft'), w('2026-10-02', 30, 'Brickwork', 'Cum'), w('2026-10-03', 5, 'RCC M25 beam', 'Sqm')];
  const owed = testsOwed(cubeLine, work, [], [{ planLineId: 'x', sampledOn: '2026-10-01' }]);
  assert.equal(owed.quantity, 76, 'm³ only, concrete only');
  assert.equal(owed.required, 2 + 1 + 5);
  assert.equal(owed.taken, 1);
  assert.equal(owed.short, 7);
  assert.equal(owed.occasions, 2);
  assert.equal(owed.lastWorkOn, '2026-10-02');
  assert.equal(owed.lastTestOn, '2026-10-01');
  const m25 = testsOwed({ ...cubeLine, grade: 'M25' }, work, [], []);
  assert.equal(m25.required, 2 + 5);
});

test('by quantity, one test for every so much in the line’s unit, at least one once work is done', () => {
  const fdd = STANDARD_QA_PLANS.ROAD.find((l) => l.testType === 'FDD')!;
  const work = [w('2026-10-01', 1200, 'Subgrade layer km 2', 'sqm'), w('2026-10-02', 300, 'GSB layer', 'm2'), w('2026-10-02', 90, 'Embankment', 'cum')];
  assert.equal(workFor(fdd, work).length, 2);
  assert.equal(testsOwed(fdd, work, [], []).required, 3);
  assert.equal(testsOwed(fdd, [w('2026-10-01', 10, 'GSB', 'sqm')], [], []).required, 1);
  assert.equal(testsOwed(fdd, [], [], []).required, 0);
});

test('each day of work owes one, and each lot received one, or one for each so much of it', () => {
  const slump = STANDARD_QA_PLANS.BUILDING.find((l) => l.testType === 'SLUMP')!;
  assert.equal(testsOwed(slump, [w('2026-10-01', 3, 'PCC'), w('2026-10-01', 9, 'RCC'), w('2026-10-04', 1, 'RCC')], [], []).required, 2);
  const cement = STANDARD_QA_PLANS.BUILDING.find((l) => l.testType === 'CEMENT')!;
  const sand = STANDARD_QA_PLANS.BUILDING.find((l) => l.testType === 'SAND_SILT')!;
  const lots = [
    { entryId: 'g1', date: '2026-10-01', quantity: 400, unit: 'bag', itemName: 'OPC 53 grade', category: 'Cement' },
    { entryId: 'g1', date: '2026-10-01', quantity: 100, unit: 'bag', itemName: 'PPC', category: 'cement ' },
    { entryId: 'g2', date: '2026-10-05', quantity: 120, unit: 'cum', itemName: 'River sand', category: 'Aggregate and sand' },
    { entryId: 'g3', date: '2026-10-06', quantity: 20, unit: 'cum', itemName: 'Sand (M-sand)', category: null },
  ];
  assert.equal(lotsFor(cement, lots).length, 2);
  assert.equal(testsOwed(cement, [], lots, []).required, 1, 'one GRN is one lot');
  assert.equal(testsOwed(sand, [], lots, []).required, 3 + 1);
});

test('a plan line needs its test, its words or category, and a quantity when counted by quantity', () => {
  const ok: QaPlanLineDef = { ...cubeLine };
  assert.equal(planLineProblem(ok, STANDARD_TEST_TYPES), null);
  assert.match(planLineProblem({ ...ok, testType: 'NOPE' }, STANDARD_TEST_TYPES)!, /Choose the test/);
  assert.match(planLineProblem({ ...ok, match: ' ' }, STANDARD_TEST_TYPES)!, /words/);
  assert.match(planLineProblem({ ...ok, frequency: 'QUANTITY', per: null }, STANDARD_TEST_TYPES)!, /how much work/);
  assert.match(planLineProblem({ ...ok, frequency: 'RECEIPT' }, STANDARD_TEST_TYPES)!, /material received/);
  assert.match(planLineProblem({ ...ok, grade: '25' }, STANDARD_TEST_TYPES)!, /M20/);
  assert.equal(planLineProblem({ ...ok, source: 'RECEIPT', frequency: 'RECEIPT', match: '', itemCategory: 'Cement' }, STANDARD_TEST_TYPES), null);
});

test('every standard plan names standard tests and passes its own checks', () => {
  for (const [type, lines] of Object.entries(STANDARD_QA_PLANS)) for (const l of lines) assert.equal(planLineProblem(l, STANDARD_TEST_TYPES), null, `${type} ${l.testType}`);
  for (const tt of STANDARD_TEST_TYPES) assert.equal(testTypeProblem(tt), null, tt.code);
  assert.equal(new Set(STANDARD_TEST_TYPES.map((x) => x.code)).size, STANDARD_TEST_TYPES.length);
});

test('a company’s copy replaces the standard test by code, its own come after, and a type is checked before saving', () => {
  const mine = [{ ...STANDARD_TEST_TYPES[0], name: 'Cubes (150 mm)', specimens: 6 }, { ...STANDARD_TEST_TYPES[1], code: 'FLOW', name: 'Flow table' }];
  const all = testTypesOf(mine);
  assert.equal(all.length, STANDARD_TEST_TYPES.length + 1);
  assert.equal(all[0].name, 'Cubes (150 mm)');
  assert.equal(all[all.length - 1].code, 'FLOW');
  assert.match(testTypeProblem({ ...STANDARD_TEST_TYPES[0], code: 'cube' })!, /capitals/);
  assert.match(testTypeProblem({ ...STANDARD_TEST_TYPES[0], specMin: 10, specMax: 5 })!, /lower limit/);
  assert.match(testTypeProblem({ ...STANDARD_TEST_TYPES[0], readings: [] })!, /one reading/);
  assert.match(testTypeProblem({ ...STANDARD_TEST_TYPES[0], readings: [{ label: '7 days', days: 7.5 }] })!, /whole days/);
});

test('a test without a line goes under the only line of its type, or the one of its grade', () => {
  const lines = [
    { id: 'a', testType: 'CUBE', grade: 'M25' },
    { id: 'b', testType: 'CUBE', grade: 'M30' },
    { id: 'c', testType: 'SLUMP', grade: null },
  ];
  assert.equal(planLineFor('SLUMP', 'Slump at pour 4', lines)?.id, 'c');
  assert.equal(planLineFor('CUBE', 'M30 cubes, raft', lines)?.id, 'b');
  assert.equal(planLineFor('CUBE', 'Cubes, raft', lines), null);
  assert.equal(planLineFor('STEEL', 'TMT 12', lines), null);
  assert.equal(planLineFor(null, 'anything', lines), null);
});

const r = (i: number, value: number): CubeResult => ({ id: `r${i}`, date: `2026-10-${String(i).padStart(2, '0')}`, value });

test('Table 11: an M25 mean of four reaches 25 + 0.825 × 4 = 28.5 (above 25 + 3), and each result 22', () => {
  const a = cubeAcceptance([r(1, 29), r(2, 31), r(3, 27), r(4, 30)], 25);
  assert.equal(a.sd, 4);
  assert.equal(a.sdEstablished, false);
  assert.equal(a.meanNeeded, 28.5);
  assert.equal(a.individualMin, 22);
  assert.deepEqual(a.groups.map((g) => [g.mean, g.ok]), [[29.25, true]]);
  assert.equal(a.verdict, 'PASS');
});

test('a mean short of the figure, or one result below fck − 3, fails; fewer than four waits', () => {
  assert.equal(cubeAcceptance([r(1, 28), r(2, 28), r(3, 28), r(4, 28.4)], 25).verdict, 'FAIL');
  const low = cubeAcceptance([r(1, 35), r(2, 21.5), r(3, 33), r(4, 34)], 25);
  assert.equal(low.groups[0].ok, true);
  assert.deepEqual(low.lowIds, ['r2']);
  assert.equal(low.verdict, 'FAIL');
  const few = cubeAcceptance([r(1, 30), r(2, 31), r(3, 32)], 25);
  assert.equal(few.verdict, 'WAITING');
  assert.equal(few.pending, 3);
  assert.equal(cubeAcceptance([r(1, 30), r(2, 21)], 25).verdict, 'FAIL', 'a low result fails before four are in');
});

test('groups of four do not overlap and follow the dates, not the order given', () => {
  const a = cubeAcceptance([r(5, 40), r(1, 30), r(2, 30), r(3, 30), r(4, 30), r(6, 40)], 25);
  assert.deepEqual(a.groups.map((g) => g.ids), [['r1', 'r2', 'r3', 'r4']]);
  assert.equal(a.pending, 2);
});

test('Table 8 assumes 3.5 to M15, 4 to M25 and 5 above; with 30 results the grade’s own deviation is used', () => {
  assert.deepEqual([10, 15, 20, 25, 30, 40].map(assumedSd), [3.5, 3.5, 4, 4, 5, 5]);
  assert.equal(cubeAcceptance([r(1, 40), r(2, 40), r(3, 40), r(4, 40)], 30).meanNeeded, 34, 'M30: 30 + 0.825 × 5 = 34.125, to 34');
  const steady = Array.from({ length: 30 }, (_, i) => r(i + 1, i % 2 ? 30 : 31));
  const own = cubeAcceptance(steady, 25);
  assert.equal(own.sdEstablished, true);
  assert.ok(own.sd < 1);
  assert.equal(own.meanNeeded, 28, 'fck + 3 when 0.825 × a small deviation is less');
});

test('a pour poured without a passed card, or with fewer cube sets than its volume asks, is flagged', () => {
  assert.deepEqual(pourFlags({ status: 'POURED', volume: 20, cardPassed: false, cubeSets: 2 }), ['NO_CARD', 'CUBES_SHORT']);
  assert.deepEqual(pourFlags({ status: 'POURED', volume: 20, cardPassed: true, cubeSets: 3 }), []);
  assert.deepEqual(pourFlags({ status: 'PLANNED', volume: 20, cardPassed: false, cubeSets: 0 }), []);
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
