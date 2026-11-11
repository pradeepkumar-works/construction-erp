/**
 * Subcontractor retention paid back and back-charges by kind (ARCHITECTURE "Subcontracts", Retention release and
 * back-charges): what is held, what a bill may release, which charges a bill takes and how a work order sums them. No
 * database.
 *
 *   node dist/scripts/subcontract-recoveries-test.js
 */
import assert from 'node:assert/strict';
import { BACK_CHARGE_OTHER, MASTER_LIST_DEFS, backChargesByKind, backChargesProblem, backChargesTotal, halfOfHeld, masterCode, retentionHeld, retentionReleaseProblem, subBillLabel } from '@erp/shared';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

// A work order at 5% retention: three running bills, the final one paying back half.
const bills = [
  { billNo: 1, retentionAmount: '21340.50', retentionReleased: '0' },
  { billNo: 2, retentionAmount: '18210.25', retentionReleased: '0' },
  { billNo: 3, retentionAmount: '9449.25', retentionReleased: '24500.00' },
];
const kinds = new Set(MASTER_LIST_DEFS.backCharge.standard.map((e) => e.code));

test('retention held is what the bills kept less what they paid back, to the paisa', () => {
  assert.equal(retentionHeld(bills), '24500.00');
  assert.equal(retentionHeld(bills, 3), '39550.75', 'before bill 3 only bills 1 and 2 count');
  assert.equal(retentionHeld(bills, 1), '0.00');
  assert.equal(retentionHeld([{ billNo: 1, retentionAmount: '100', retentionReleased: '150' }]), '0.00', 'never below nothing');
});

test('a bill pays back at most what is held', () => {
  assert.equal(retentionReleaseProblem('39550.75', '39550.75', false), null);
  assert.equal(retentionReleaseProblem('0', '39550.75', false), null, 'a running bill need not release any');
  assert.equal(retentionReleaseProblem('39550.76', '39550.75', false), 'Only ₹39550.75 of retention is held on this work order');
  assert.equal(retentionReleaseProblem('-1', '100', false), 'The retention to release cannot be negative');
  assert.equal(retentionReleaseProblem('10.005', '100', false), 'Enter the retention to release in rupees and paise');
  assert.equal(retentionReleaseProblem('0', '100', true), 'A retention release bill pays back some retention; enter how much');
  assert.equal(halfOfHeld('39550.75'), '19775.37', 'half rounds down to the paisa');
});

test('back-charges take a listed kind, a positive amount, and a note for other', () => {
  const ok = [
    { kindCode: masterCode('Cleaning and debris'), amount: '4500', note: 'Block B after plastering' },
    { kindCode: masterCode('Labour supplied'), amount: '12600.50' },
  ];
  assert.equal(backChargesProblem(ok, kinds), null);
  assert.equal(backChargesProblem([{ kindCode: 'fines', amount: '10' }], kinds), 'Back-charge 1: choose what it is for');
  assert.equal(backChargesProblem([...ok, { kindCode: masterCode('Delay'), amount: '0' }], kinds), 'Back-charge 3: enter an amount above zero');
  assert.equal(backChargesProblem([{ kindCode: masterCode('Delay'), amount: '10.123' }], kinds), 'Back-charge 1: enter the amount in rupees and paise');
  assert.equal(backChargesProblem([{ kindCode: BACK_CHARGE_OTHER, amount: '800', note: '  ' }], kinds), 'Back-charge 1: say what the charge is for');
  assert.equal(backChargesProblem([{ kindCode: BACK_CHARGE_OTHER, amount: '800', note: 'Lost scaffold clamps' }], kinds), null);
  assert.equal(backChargesProblem(Array.from({ length: 31 }, () => ok[0]), kinds), 'A bill takes at most 30 back-charges');
  assert.ok(kinds.has(BACK_CHARGE_OTHER), 'the standard list has Other');
});

test('charges total to the paisa and sum by kind, largest first', () => {
  const charges = [
    { kindCode: 'cleaning-and-debris', amount: '4500.10' },
    { kindCode: 'labour-supplied', amount: '12600.50' },
    { kindCode: 'cleaning-and-debris', amount: '2200.20' },
    { kindCode: 'water-and-power', amount: '6700.30' },
  ];
  assert.equal(backChargesTotal(charges), '26001.10');
  assert.deepEqual(backChargesByKind(charges), [
    { kindCode: 'labour-supplied', amount: '12600.50', count: 1 },
    { kindCode: 'cleaning-and-debris', amount: '6700.30', count: 2 },
    { kindCode: 'water-and-power', amount: '6700.30', count: 1 },
  ]);
});

test('a release bill names itself', () => {
  assert.equal(subBillLabel('WO-2026-0004', 4, false, true), 'WO-2026-0004 bill 4 (retention release)');
  assert.equal(subBillLabel('WO-2026-0004', 3, true), 'WO-2026-0004 bill 3 (final)');
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
