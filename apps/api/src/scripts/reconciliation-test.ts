/**
 * Material reconciliation's tests. The arithmetic and statuses with no database; CI runs it after the build:
 *
 *   node dist/scripts/reconciliation-test.js
 */
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { movementsFrom, reconcile, reconciliationStatus, type NormInput } from '../reconciliation/reconciliation-rules';

const D = (v: number | string) => new Prisma.Decimal(v);
const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);

const norm = (id: string, boqItemId: string, itemId: string, qtyPerUnit: number | string, wastagePct = 0): NormInput => ({
  id,
  boqItemId,
  itemId,
  qtyPerUnit: D(qtyPerUnit),
  wastagePct: D(wastagePct),
});

test('status: nothing done and nothing used is no work', () => {
  assert.equal(reconciliationStatus(D(0), D(0), D(0)), 'NO_WORK');
});
test('status: material used with no approved work is over', () => {
  assert.equal(reconciliationStatus(D(0), D(0), D(5)), 'OVER');
});
test('status: up to the allowance is within, beyond it over', () => {
  assert.equal(reconciliationStatus(D(100), D(103), D(103)), 'WITHIN');
  assert.equal(reconciliationStatus(D(100), D(103), D('103.001')), 'OVER');
});
test('status: up to 5% under theoretical is within, more is below', () => {
  assert.equal(reconciliationStatus(D(100), D(103), D(95)), 'WITHIN');
  assert.equal(reconciliationStatus(D(100), D(103), D('94.9')), 'UNDER');
});

test('movements: issues are negative rows, returns from site positive, others ignored', () => {
  const m = movementsFrom([
    { itemId: 'cement', type: 'ISSUE', quantity: D(-500) },
    { itemId: 'cement', type: 'ISSUE', quantity: D(-300) },
    { itemId: 'cement', type: 'RETURN_FROM_SITE', quantity: D(20) },
    { itemId: 'cement', type: 'RECEIPT', quantity: D(1000) },
    { itemId: 'cement', type: 'TRANSFER_OUT', quantity: D(-100) },
  ]).get('cement')!;
  assert.equal(m.issued.toString(), '800');
  assert.equal(m.returned.toString(), '20');
});

test('reconcile: cement over two concrete items, with weighted wastage', () => {
  // 100 cum M25 at 8.2 bags (2%) + 50 cum PCC at 4 bags (5%): theoretical 820 + 200 = 1020, allowance 16.4 + 10.
  const [r] = reconcile(
    [norm('n1', 'm25', 'cement', '8.2', 2), norm('n2', 'pcc', 'cement', 4, 5)],
    new Map([['m25', D(100)], ['pcc', D(50)]]),
    new Map([['cement', { issued: D(1080), returned: D(10) }]]),
  );
  assert.equal(r.theoretical.toString(), '1020');
  assert.equal(r.allowed.toString(), '1046.4');
  assert.equal(r.consumed.toString(), '1070');
  assert.equal(r.status, 'OVER');
  assert.equal(r.excess.toString(), '23.6');
  assert.equal(r.variance.toString(), '50');
  assert.equal(r.variancePct, 4.9);
  assert.equal(r.lines.length, 2);
});

test('reconcile: one BOQ item feeds several items, each reconciled on its own', () => {
  const out = reconcile(
    [norm('n1', 'm25', 'cement', '8.2', 2), norm('n2', 'm25', 'steel', '0.09', 3)],
    new Map([['m25', D(200)]]),
    new Map([['cement', { issued: D(1650), returned: D(0) }], ['steel', { issued: D(15), returned: D(0) }]]),
  );
  const cement = out.find((r) => r.itemId === 'cement')!;
  const steel = out.find((r) => r.itemId === 'steel')!;
  assert.equal(cement.theoretical.toString(), '1640');
  assert.equal(cement.status, 'WITHIN');
  assert.equal(steel.theoretical.toString(), '18');
  assert.equal(steel.status, 'UNDER');
  assert.equal(steel.excess.toString(), '0');
});

test('reconcile: a normed item never issued shows all of its theoretical as variance', () => {
  const [r] = reconcile([norm('n1', 'brick', 'bricks', 500)], new Map([['brick', D(10)]]), new Map());
  assert.equal(r.consumed.toString(), '0');
  assert.equal(r.variance.toString(), '-5000');
  assert.equal(r.status, 'UNDER');
});

test('reconcile: a BOQ item without progress gives no theoretical and no work', () => {
  const [r] = reconcile([norm('n1', 'ff-slab', 'cement', 8)], new Map(), new Map());
  assert.equal(r.theoretical.toString(), '0');
  assert.equal(r.status, 'NO_WORK');
  assert.equal(r.variancePct, null);
});

let failed = 0;
for (const [name, fn] of cases) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`✗ ${name}\n  ${(e as Error).message.split('\n').join('\n  ')}`);
  }
}
console.log(`\nReconciliation: ${cases.length - failed} of ${cases.length} tests pass`);
process.exit(failed ? 1 : 0);
