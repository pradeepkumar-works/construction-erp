/**
 * Tests for the one order of what waits (ARCHITECTURE "Overviews answer first"): money at stake first, then how late, then
 * the role's own order. Pure, so it needs no database:
 *
 *   node dist/scripts/waiting-rank-test.js
 */
import assert from 'node:assert/strict';
import { compareWaiting, moneyBand, rankWaiting } from '@erp/shared';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

test('money bands: crore, ten lakh, lakh, below', () => {
  assert.equal(moneyBand('141600000'), 3);
  assert.equal(moneyBand(1420000), 2);
  assert.equal(moneyBand(250000), 1);
  assert.equal(moneyBand(99999), 0);
  assert.equal(moneyBand(null), 0);
  assert.equal(moneyBand(-25000000), 3);
});

test('₹14 crore waiting 36 days comes before ₹14 lakh due this week, whatever the role order says', () => {
  const cards = [
    { key: 'payments', amount: '1420000', daysLate: 3 },
    { key: 'approvals', amount: null, daysLate: 2 },
    { key: 'receivables', amount: '141600000', daysLate: 0 },
  ];
  assert.deepEqual(rankWaiting(cards, (c) => c).map((c) => c.key), ['receivables', 'payments', 'approvals']);
});

test('in the same money band the later one leads, so ₹14.2 lakh and ₹14.9 lakh are decided by days', () => {
  const a = { amount: 1420000, daysLate: 10 };
  const b = { amount: 1490000, daysLate: 2 };
  assert.ok(compareWaiting(a, b) < 0);
});

test('with no money and no lateness, the role order stands', () => {
  const keys = ['dprsMissing', 'sentBack', 'leave'];
  assert.deepEqual(rankWaiting(keys, () => ({})), keys);
});

test('an entry still ahead of its mark (negative days) comes after one due today', () => {
  const ranked = rankWaiting(
    [
      { key: 'ahead', daysLate: -4 },
      { key: 'today', daysLate: 0 },
    ],
    (x) => x,
  );
  assert.deepEqual(ranked.map((x) => x.key), ['today', 'ahead']);
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
console.log(`Waiting order: ${tests.length - failed} of ${tests.length} tests pass`);
if (failed) process.exit(1);
