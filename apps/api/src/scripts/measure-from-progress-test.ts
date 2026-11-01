/**
 * Tests for measuring from progress. Which approved days a sheet still has to
 * cover is pure, so it needs no database:
 *
 *   node dist/scripts/measure-from-progress-test.js
 */
import assert from 'node:assert/strict';
import { unmeasuredEntries, type ProgressForMeasure } from '@erp/shared';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

/** An approved day's work, as the list reads it off the progress entries. */
const day = (id: string, date: string, quantity: number, location: string | null = null, fromDpr = true): ProgressForMeasure => ({
  id,
  date,
  quantity,
  location,
  activityName: 'Earthwork in embankment',
  fromDpr,
});

const week = [day('e1', '2026-10-05', 120, 'Km 2+000 to 2+300'), day('e2', '2026-10-06', 80, 'Km 2+300 to 2+500'), day('e3', '2026-10-07', 100, 'Km 2+500 to 2+700')];

test('nothing measured yet leaves every day, oldest first', () => {
  assert.deepEqual(
    unmeasuredEntries(week, 0).map((e) => [e.id, e.quantity]),
    [
      ['e1', 120],
      ['e2', 80],
      ['e3', 100],
    ],
  );
});

test('the oldest work is taken as measured first', () => {
  assert.deepEqual(
    unmeasuredEntries(week, 200).map((e) => e.id),
    ['e3'],
  );
});

test('a sheet that stopped in the middle of a day leaves the rest of that day', () => {
  assert.deepEqual(
    unmeasuredEntries(week, 150).map((e) => [e.id, e.quantity]),
    [
      ['e2', 50],
      ['e3', 100],
    ],
  );
});

test('everything measured leaves nothing to offer', () => {
  assert.deepEqual(unmeasuredEntries(week, 300), []);
  // More measured than the DPRs account for (a sheet taken off a drawing) is not negative work.
  assert.deepEqual(unmeasuredEntries(week, 500), []);
});

test('the days come back in date order whatever order they were loaded in', () => {
  assert.deepEqual(
    unmeasuredEntries([week[2], week[0], week[1]], 0).map((e) => e.id),
    ['e1', 'e2', 'e3'],
  );
  // Two entries on the same day keep a settled order, so the same sheet is offered twice over.
  const sameDay = [day('b', '2026-10-05', 10), day('a', '2026-10-05', 10)];
  assert.deepEqual(
    unmeasuredEntries(sameDay, 10).map((e) => e.id),
    ['b'],
  );
});

test('a day carries its location and where it came from, so the sheet can say', () => {
  const [first] = unmeasuredEntries(week, 0);
  assert.deepEqual([first.location, first.fromDpr, first.activityName], ['Km 2+000 to 2+300', true, 'Earthwork in embankment']);
  // The part day keeps them too.
  assert.deepEqual(unmeasuredEntries(week, 100)[0], { ...week[0], quantity: 20 });
});

test('a day with no quantity, and a measured quantity below zero, are left out', () => {
  assert.deepEqual(
    unmeasuredEntries([day('z', '2026-10-04', 0), ...week], -50).map((e) => e.id),
    ['e1', 'e2', 'e3'],
  );
});

test('three decimals stay exact, so the remainder is not a hair off', () => {
  const fine = [day('f1', '2026-10-05', 12.345), day('f2', '2026-10-06', 7.655)];
  assert.deepEqual(
    unmeasuredEntries(fine, 10).map((e) => [e.id, e.quantity]),
    [
      ['f1', 2.345],
      ['f2', 7.655],
    ],
  );
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
  } catch (e) {
    failed++;
    console.error(`✗ ${name}\n  ${(e as Error).message}`);
  }
}
console.log(`Measuring from progress: ${tests.length - failed} of ${tests.length} tests pass`);
if (failed) process.exit(1);
