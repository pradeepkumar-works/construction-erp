/**
 * Progress by project's tests (ARCHITECTURE "Progress by project"): the projects' physical progress together weighs by
 * contract value only when every project has one, financial progress compares bills with the contract values that exist,
 * the notes beside a project, and the order the projects come in.
 *
 *   node dist/scripts/project-progress-test.js
 */
import assert from 'node:assert/strict';
import { BEHIND_TOLERANCE_PCT, BILLING_GAP_PCT, byProgressOrder, portfolioProgress, progressNotes } from '@erp/shared';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

test('physical progress weighs each project by its contract value when every project has one', () => {
  // A 90 crore road at 20% and a 10 crore building at 80%: the road moves the figure most.
  const t = portfolioProgress([
    { physicalPct: 20, contractValue: 90e7, billed: 9e7 },
    { physicalPct: 80, contractValue: 10e7, billed: 7e7 },
  ]);
  assert.equal(t.weighting, 'contract');
  assert.equal(t.physicalPct, 26);
  // 16 crore billed of 100 crore
  assert.equal(t.financialPct, 16);
});

test('a project with no contract value makes the projects count alike, and stays out of financial progress', () => {
  const t = portfolioProgress([
    { physicalPct: 20, contractValue: 90e7, billed: 18e7 },
    { physicalPct: 60, contractValue: null, billed: 0 },
    { physicalPct: 40, contractValue: 0, billed: 0 },
  ]);
  assert.equal(t.weighting, 'equal');
  assert.equal(t.physicalPct, 40);
  assert.equal(t.financialPct, 20);
});

test('without bills to see, or without contract values, there is no financial progress', () => {
  assert.equal(portfolioProgress([{ physicalPct: 30, contractValue: 5e7, billed: null }]).financialPct, null);
  assert.equal(portfolioProgress([{ physicalPct: 30, contractValue: null, billed: 0 }]).financialPct, null);
  assert.deepEqual(portfolioProgress([]), { physicalPct: null, weighting: 'equal', financialPct: null });
});

test('figures are rounded to one decimal', () => {
  const t = portfolioProgress([
    { physicalPct: 10, contractValue: 3e7, billed: 1e7 },
    { physicalPct: 11, contractValue: 3e7, billed: 0 },
    { physicalPct: 12, contractValue: 3e7, billed: 0 },
  ]);
  assert.equal(t.physicalPct, 11);
  assert.equal(t.financialPct, 11.1);
});

test('work is behind plan only past the schedule tolerance', () => {
  assert.deepEqual(progressNotes({ physicalPct: 40, plannedPct: 40 + BEHIND_TOLERANCE_PCT, financialPct: null }), []);
  const [n] = progressNotes({ physicalPct: 40, plannedPct: 55, financialPct: null });
  assert.equal(n.key, 'behind');
  assert.equal(n.points, 15);
  assert.equal(n.text, '15 points behind plan');
  assert.deepEqual(progressNotes({ physicalPct: 40, plannedPct: null, financialPct: null }), []);
});

test('billing behind or ahead of the work is noted from the gap on', () => {
  assert.deepEqual(progressNotes({ physicalPct: 50, plannedPct: null, financialPct: 50 - BILLING_GAP_PCT + 1 }), []);
  const [behind] = progressNotes({ physicalPct: 50, plannedPct: null, financialPct: 50 - BILLING_GAP_PCT });
  assert.equal(behind.key, 'billingBehind');
  assert.equal(behind.text, `Billing ${BILLING_GAP_PCT} points behind the work`);
  const [ahead] = progressNotes({ physicalPct: 20, plannedPct: null, financialPct: 45 });
  assert.equal(ahead.key, 'billingAhead');
  assert.equal(ahead.points, 25);
  // No contract value: nothing to say about billing
  assert.deepEqual(progressNotes({ physicalPct: 50, plannedPct: null, financialPct: null }), []);
});

test('both notes can stand together, the schedule first', () => {
  const keys = progressNotes({ physicalPct: 30, plannedPct: 60, financialPct: 10 }).map((n) => n.key);
  assert.deepEqual(keys, ['behind', 'billingBehind']);
});

test('running projects come first, then on hold, planned and complete, by code within each', () => {
  const rows = [
    { status: 'COMPLETED' as const, code: 'A-01' },
    { status: 'PLANNED' as const, code: 'B-02' },
    { status: 'ACTIVE' as const, code: 'C-03' },
    { status: 'ON_HOLD' as const, code: 'D-04' },
    { status: 'ACTIVE' as const, code: 'B-01' },
  ];
  assert.deepEqual([...rows].sort(byProgressOrder).map((r) => r.code), ['B-01', 'C-03', 'D-04', 'B-02', 'A-01']);
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${name}\n     ${(e as Error).message}`);
  }
}
console.log(`\n${tests.length - failed} of ${tests.length} passed`);
if (failed) process.exit(1);
