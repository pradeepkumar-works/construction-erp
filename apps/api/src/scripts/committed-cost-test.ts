/**
 * Committed cost (ARCHITECTURE "Committed cost"): an order's balance still to deliver or bill, and a forecast that never
 * ends below what is already ordered. No database.
 *
 *   node dist/scripts/committed-cost-test.js
 */
import assert from 'node:assert/strict';
import { COMMITMENT_HEAD, costToComplete, overCommitted, poBalance, woBalance } from '@erp/shared';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

test('a purchase order commits what it still has to deliver, at its rate before GST', () => {
  const lines = [
    { quantity: '100', rate: '420.50', received: '60' },
    { quantity: '12.5', rate: '68000', received: '0' },
  ];
  assert.equal(poBalance(lines, false), 40 * 420.5 + 12.5 * 68000);
});

test('an over-delivered line or a return never turns into a credit', () => {
  assert.equal(poBalance([{ quantity: '10', rate: '100', received: '12' }], false), 0);
  assert.equal(poBalance([{ quantity: '10', rate: '100', received: '-3' }], false), 1000);
});

test('a closed order commits nothing more', () => {
  assert.equal(poBalance([{ quantity: '10', rate: '100', received: '2' }], true), 0);
  assert.equal(woBalance('500000', '120000', true), 0);
});

test('a work order commits its value less what approved bills charged, never below zero', () => {
  assert.equal(woBalance('1250000', '480000.40', false), 769999.6);
  assert.equal(woBalance('100000', '130000', false), 0);
});

test('paise add up exactly', () => {
  assert.equal(poBalance([{ quantity: '3', rate: '0.1', received: '0' }, { quantity: '3', rate: '0.2', received: '0' }], false), 0.9);
});

test('a head’s cost to complete is its budget for the work left, or what is ordered when that is more', () => {
  assert.equal(costToComplete(400000, 150000), 400000);
  assert.equal(costToComplete(400000, 650000), 650000);
  assert.equal(costToComplete(null, 650000), 650000);
});

test('orders past the budget read as over-committed by the amount', () => {
  assert.equal(overCommitted(1000000, 700000, 250000), null);
  assert.equal(overCommitted(1000000, 700000, 300000), null);
  assert.equal(overCommitted(1000000, 700000, 350000.5), 50000.5);
  assert.equal(overCommitted(null, 700000, 350000), null);
});

test('purchase orders commit material and work orders subcontract', () => {
  assert.deepEqual(COMMITMENT_HEAD, { PO: 'material', WO: 'subcontract' });
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
