/**
 * Tests for two typing fixes: the PAN inside a GSTIN, and the next project
 * code in the company's series. Both are pure, so they need no database:
 *
 *   node dist/scripts/small-fixes-test.js
 */
import assert from 'node:assert/strict';
import { nextProjectCode, panFromGstin } from '@erp/shared';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

test('the PAN is characters 3 to 12 of the GSTIN', () => {
  assert.equal(panFromGstin('21ABCPT1234F1Z9'), 'ABCPT1234F');
  assert.equal(panFromGstin('  21abcpt1234f1z9  '), 'ABCPT1234F');
  assert.equal(panFromGstin('07AAAGO1234F1Z5'), 'AAAGO1234F');
});

test('nothing is read out of a GSTIN that is not one', () => {
  for (const g of [null, undefined, '', '21ABCPT1234F1Z', '21ABCPT1234F1Y9', 'ABCPT1234F', '211BCPT1234F1Z9'])
    assert.equal(panFromGstin(g), null, `${g} gave a PAN`);
});

test('the next code carries on the company series, whatever the kind of work', () => {
  const taken = ['RD-2026-01', 'BL-2026-02', 'WS-2026-03', 'WS-2026-04'];
  assert.equal(nextProjectCode('WATER_SUPPLY', 2026, taken), 'WS-2026-05');
  assert.equal(nextProjectCode('ROAD', 2026, taken), 'RD-2026-05');
  assert.equal(nextProjectCode('STORE', 2026, taken), 'ST-2026-05');
});

test('a new year starts at 01, and a company with no projects starts the series', () => {
  assert.equal(nextProjectCode('ROAD', 2027, ['RD-2026-01', 'WS-2026-09']), 'RD-2027-01');
  assert.equal(nextProjectCode('BUILDING', 2026, []), 'BL-2026-01');
});

test('the padding follows the company: three figures stay three', () => {
  assert.equal(nextProjectCode('ROAD', 2026, ['RD-2026-007', 'BL-2026-008']), 'RD-2026-009');
  assert.equal(nextProjectCode('ROAD', 2026, ['RD-2026-99']), 'RD-2026-100');
});

test("a company that numbers projects its own way is left alone", () => {
  assert.equal(nextProjectCode('ROAD', 2026, ['P-101', 'SITE/7']), null);
  // One code in the shape is enough to carry on from; the rest are ignored.
  assert.equal(nextProjectCode('ROAD', 2026, ['P-101', 'WS-2026-12']), 'RD-2026-13');
});

test('the suggestion never collides with a code already taken', () => {
  const taken = ['RD-2026-01', 'RD-2026-02', 'RD-2026-03'];
  assert.ok(!taken.includes(nextProjectCode('ROAD', 2026, taken)!));
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
console.log(`The October review's small fixes: ${tests.length - failed} of ${tests.length} tests pass`);
if (failed) process.exit(1);
