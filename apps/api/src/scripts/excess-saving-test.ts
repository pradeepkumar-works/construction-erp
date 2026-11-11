/**
 * Excess and saving statement (ARCHITECTURE "Excess and saving statement"): agreement against anticipated quantities,
 * excess items for quantity beyond the deviation limit, and the checks on an anticipated quantity. No database.
 *
 *   node dist/scripts/excess-saving-test.js
 */
import assert from 'node:assert/strict';
import { anticipatedQtyProblem, excessItemDescription, excessItemNo, excessSaving, type ExcessSavingFact } from '@erp/shared';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

const item = (o: Partial<ExcessSavingFact> & Pick<ExcessSavingFact, 'id' | 'itemNo'>): ExcessSavingFact => ({
  description: `Item ${o.itemNo}`,
  unit: 'cum',
  rate: 100,
  originalQty: 0,
  revisedQty: null,
  anticipatedQty: null,
  measuredQty: 0,
  excessOfId: null,
  ...o,
});

test('an excess item is numbered under its BOQ item, the next free number when one is taken', () => {
  assert.equal(excessItemNo('2.8', new Set()), '2.8-X');
  assert.equal(excessItemNo('2.8', new Set(['2.8-x'])), '2.8-X2');
  assert.equal(excessItemNo('2.8', new Set(['2.8-x', '2.8-x2'])), '2.8-X3');
  assert.equal(excessItemDescription('Earth work in excavation'), 'Earth work in excavation (quantity beyond the deviation limit)');
});

test('anticipated defaults to the larger of measured and sanctioned, so an unfinished item shows no saving', () => {
  const { rows } = excessSaving([item({ id: 'a', itemNo: '1', originalQty: 1000, measuredQty: 400 }), item({ id: 'b', itemNo: '2', originalQty: 1000, measuredQty: 1180 })], 25);
  assert.equal(rows[0].anticipatedQty, '1000');
  assert.equal(rows[0].savingQty, '0');
  assert.equal(rows[1].anticipatedQty, '1180');
  assert.equal(rows[1].excessQty, '180');
  assert.equal(rows[1].excessAmount, '18000.00');
});

test('the quantity surveyor’s anticipated quantity gives the saving', () => {
  const { rows, totals } = excessSaving([item({ id: 'a', itemNo: '1', originalQty: 1000, measuredQty: 400, anticipatedQty: 850, rate: 245.5 })], 25);
  assert.equal(rows[0].savingQty, '150');
  assert.equal(rows[0].savingAmount, '36825.00');
  assert.equal(totals.net, '-36825.00');
  assert.equal(totals.netPct, -15);
});

test('a variation at the BOQ rate raises the sanctioned quantity, and the excess is still over the agreement', () => {
  const { rows } = excessSaving([item({ id: 'a', itemNo: '1', originalQty: 100, revisedQty: 160, measuredQty: 150 })], 25);
  assert.equal(rows[0].sanctionedQty, '160');
  assert.equal(rows[0].anticipatedQty, '160');
  assert.equal(rows[0].excessQty, '60');
  assert.equal(rows[0].limitQty, '200');
  assert.equal(rows[0].pastLimitQty, null);
});

test('past the deviation limit with no excess item to take it is flagged by how much', () => {
  const { rows } = excessSaving([item({ id: 'a', itemNo: '1', originalQty: 100, anticipatedQty: 140 })], 25);
  assert.equal(rows[0].pastLimitQty, '15');
});

test('an excess item sits right under its BOQ item at its own rate, and the parent is not flagged', () => {
  const { rows, totals } = excessSaving(
    [
      item({ id: 'a', itemNo: '2.8', originalQty: 100, anticipatedQty: 125 }),
      item({ id: 'c', itemNo: '3.1', originalQty: 10 }),
      item({ id: 'x', itemNo: '2.8-X', revisedQty: 30, rate: 130, excessOfId: 'a' }),
      item({ id: 'e', itemNo: '9.1', revisedQty: 5, rate: 900 }),
    ],
    25,
  );
  assert.deepEqual(
    rows.map((r) => [r.itemNo, r.kind, r.parentItemNo]),
    [
      ['2.8', 'BOQ', null],
      ['2.8-X', 'EXCESS', '2.8'],
      ['3.1', 'BOQ', null],
      ['9.1', 'EXTRA', null],
    ],
  );
  assert.equal(rows[0].pastLimitQty, null);
  assert.equal(rows[1].excessAmount, '3900.00');
  assert.equal(rows[3].excessAmount, '4500.00');
  assert.equal(totals.agreement, '11000.00');
  assert.equal(totals.excess, '10900.00');
});

test('an anticipated quantity is never below zero or below what is measured', () => {
  assert.equal(anticipatedQtyProblem(null, 50), null);
  assert.equal(anticipatedQtyProblem(60, 50), null);
  assert.equal(anticipatedQtyProblem(-1, 0), 'Enter a quantity of 0 or more');
  assert.equal(anticipatedQtyProblem(40, 50), 'It is already measured to 50: expect at least that');
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
