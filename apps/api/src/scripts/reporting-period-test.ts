/**
 * Tests for the month a screen opens on and the money and dates written into a record's history. Pure, so they need no
 * database:
 *
 *   node dist/scripts/reporting-period-test.js
 */
import assert from 'node:assert/strict';
import { MONTH_SETTLES_ON, reportingMonth, reportingMonthRunning } from '@erp/shared';
import { inr } from '../common/submission-titles';
import { formatDay } from '../common/serialize';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

test('the first days of a month open on the last full month', () => {
  assert.equal(reportingMonth('2026-11-01'), '2026-10');
  assert.equal(reportingMonth(`2026-11-0${MONTH_SETTLES_ON - 1}`), '2026-10');
  assert.equal(reportingMonthRunning('2026-11-01'), false);
});

test('from the settling day on, a month opens on itself', () => {
  assert.equal(reportingMonth(`2026-11-0${MONTH_SETTLES_ON}`), '2026-11');
  assert.equal(reportingMonth('2026-11-30'), '2026-11');
  assert.equal(reportingMonthRunning('2026-11-15'), true);
});

test('January opens on the December before it', () => {
  assert.equal(reportingMonth('2027-01-02'), '2026-12');
});

test('history notes read rupees and days the way people write them', () => {
  assert.equal(inr('2498617.80'), '₹24,98,617.80');
  assert.equal(inr(1500), '₹1,500.00');
  assert.equal(formatDay('2026-10-20'), '20 Oct 2026');
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
console.log(`Reporting period and history notes: ${tests.length - failed} of ${tests.length} tests pass`);
if (failed) process.exit(1);
