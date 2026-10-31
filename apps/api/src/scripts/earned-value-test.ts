/**
 * Earned value's tests: planned value spread over the days, month ends, the earned schedule, the indices and
 * forecasts, and the finish the pace points to, with no database. CI runs it after the build:
 *
 *   node dist/scripts/earned-value-test.js
 */
import assert from 'node:assert/strict';
import { earnedScheduleDate, forecastFinish, indices, monthEnds, plannedShare, type PlannedSlice } from '../cost/earned-value-rules';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);

// Earthwork worth 60 over 1-30 Jan, then GSB worth 40 over 1-10 Feb.
const slices: PlannedSlice[] = [
  { value: 60, start: '2026-01-01', end: '2026-01-30' },
  { value: 40, start: '2026-02-01', end: '2026-02-10' },
];

test('planned value is spread evenly over each activity’s days, both ends counted', () => {
  assert.equal(plannedShare(slices, '2025-12-31'), 0);
  assert.equal(plannedShare(slices, '2026-01-01'), 0.02);
  assert.equal(plannedShare(slices, '2026-01-15'), 0.3);
  assert.equal(plannedShare(slices, '2026-01-31'), 0.6);
  assert.equal(plannedShare(slices, '2026-02-05'), 0.8);
  assert.equal(plannedShare(slices, '2026-03-01'), 1);
  assert.equal(plannedShare([], '2026-03-01'), 0);
  // A one-day activity is all planned on its day.
  assert.equal(plannedShare([{ value: 10, start: '2026-01-05', end: '2026-01-05' }], '2026-01-05'), 1);
});

test('month ends run from the first month to the last, capped', () => {
  assert.deepEqual(monthEnds('2026-11-12', '2027-02-03'), [
    { month: '2026-11', end: '2026-11-30' },
    { month: '2026-12', end: '2026-12-31' },
    { month: '2027-01', end: '2027-01-31' },
    { month: '2027-02', end: '2027-02-28' },
  ]);
  assert.equal(monthEnds('2026-01-01', '2030-12-31', 12).length, 12);
  assert.deepEqual(monthEnds('2024-02-10', '2024-02-10'), [{ month: '2024-02', end: '2024-02-29' }]);
});

test('the earned schedule is the day the plan had as much done as is done now', () => {
  // 30% done: the plan had that by 15 Jan.
  assert.equal(earnedScheduleDate(slices, 0.3, '2026-01-01', '2026-02-10'), '2026-01-15');
  assert.equal(earnedScheduleDate(slices, 0.8, '2026-01-01', '2026-02-10'), '2026-02-05');
  assert.equal(earnedScheduleDate(slices, 0, '2026-01-01', '2026-02-10'), '2026-01-01');
  assert.equal(earnedScheduleDate(slices, 1, '2026-01-01', '2026-02-10'), '2026-02-10');
  assert.equal(earnedScheduleDate([], 0.5, '2026-01-01', '2026-02-10'), null);
});

test('variances, indices and forecasts follow the usual formulas', () => {
  const r = indices({ bac: 1000, pv: 400, ev: 300, ac: 375 });
  assert.equal(r.sv, -100);
  assert.equal(r.cv, -75);
  assert.equal(r.spi, 0.75);
  assert.equal(r.cpi, 0.8);
  assert.equal(r.eac, 1250);
  // 375 + 700 / (0.8 × 0.75)
  assert.equal(r.eacWithSchedule, 1541.67);
  assert.equal(r.etc, 875);
  assert.equal(r.vac, -250);
  // (1000 − 300) / (1000 − 375)
  assert.equal(r.tcpi, 1.12);
  // Nothing spent or nothing planned yet: no index rather than a division by zero.
  const early = indices({ bac: 1000, pv: 0, ev: 0, ac: 0 });
  assert.deepEqual([early.spi, early.cpi, early.eac, early.tcpi], [null, null, null, 1]);
  assert.equal(indices({ bac: 1000, pv: 100, ev: 120, ac: 100 }).spi, 1.2);
});

test('the pace so far stretches the planned duration into a forecast finish', () => {
  // 100 days planned, 50 days gone, the work of day 40 done: SPI(t) 0.8, so 125 days, 25 late.
  const f = forecastFinish('2026-01-01', '2026-04-11', '2026-02-20', '2026-02-10');
  assert.deepEqual(f, { spiT: 0.8, finish: '2026-05-06', daysLate: 25 });
  // Ahead: the work of day 60 done on day 50.
  assert.equal(forecastFinish('2026-01-01', '2026-04-11', '2026-02-20', '2026-03-02').daysLate, -17);
  assert.deepEqual(forecastFinish('2026-01-01', '2026-04-11', '2025-12-20', '2026-01-01'), { spiT: null, finish: null, daysLate: null });
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
process.exit(failed ? 1 : 0);
