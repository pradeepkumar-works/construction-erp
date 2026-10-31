/**
 * RMC's tests: a batch's quantities at its mix design and how far the weighing strayed, how much more an
 * order may dispatch, a bill's GST, and what the day's orders need against the plant's stock, with no database. CI
 * runs it after the build:
 *
 *   node dist/scripts/rmc-test.js
 */
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { gradeStrength } from '@erp/shared';
import { actualQuantities, amountDue, batchQuantities, dispatchable, invoiceAmounts, materialsNeeded, orderProgress, orderValue, variancePct } from '../rmc/rmc-rules';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);
const s = (v: Prisma.Decimal) => v.toFixed(3);

const M25 = [
  { itemId: 'cement', quantity: '0.38' },
  { itemId: 'sand', quantity: '0.72' },
  { itemId: 'agg20', quantity: '1.12' },
  { itemId: 'admix', quantity: '3.2' },
];

test('a batch weighs out its design times its cubic metres, and the batcher’s figures stand where given', () => {
  const planned = batchQuantities(M25, '6.5');
  assert.deepEqual(
    planned.map((p) => [p.itemId, s(p.designQty)]),
    [
      ['cement', '2.470'],
      ['sand', '4.680'],
      ['agg20', '7.280'],
      ['admix', '20.800'],
    ],
  );
  const actual = actualQuantities(planned, [{ itemId: 'cement', actualQty: '2.5' }]);
  assert.equal(s(actual[0].actualQty), '2.500');
  assert.equal(s(actual[1].actualQty), '4.680');
});

test('variance is the weighed against the design in % to one place', () => {
  assert.equal(variancePct('2.47', '2.5'), 1.2);
  assert.equal(variancePct('4.68', '4.6'), -1.7);
  assert.equal(variancePct('4.68', '4.68'), 0);
  assert.equal(variancePct('0', '1'), null);
});

test('an order counts delivered, on the way and unbilled; trucks turned back count for none', () => {
  const p = orderProgress([
    { quantity: '6', status: 'DELIVERED', invoiceId: 'inv1' },
    { quantity: '6', status: 'DELIVERED', invoiceId: null },
    { quantity: '6', status: 'DISPATCHED', invoiceId: null },
    { quantity: '6', status: 'REJECTED', invoiceId: null },
  ]);
  assert.deepEqual([s(p.delivered), s(p.onTheWay), s(p.unbilled)], ['12.000', '6.000', '6.000']);
});

test('an order dispatches up to 10% past its quantity and no further', () => {
  assert.equal(s(dispatchable('30', { delivered: D(18), onTheWay: D(6) })), '9.000');
  assert.equal(s(dispatchable('30', { delivered: D(30), onTheWay: D(3) })), '0.000');
  assert.equal(s(dispatchable('30', { delivered: D(36), onTheWay: D(0) })), '0.000');
});

test('a bill charges concrete on all challans and pumping on those pumped, with GST split in the state and IGST across', () => {
  const challans = [
    { quantity: '6', pumped: true },
    { quantity: '6', pumped: true },
    { quantity: '4.5', pumped: false },
  ];
  const a = invoiceAmounts(challans, '5450', '350', false);
  assert.equal(a.quantity.toFixed(3), '16.500');
  assert.equal(a.concrete.toFixed(2), '89925.00');
  assert.equal(a.pumping.toFixed(2), '4200.00');
  assert.equal(a.taxable.toFixed(2), '94125.00');
  assert.equal(a.cgst.toFixed(2), '8471.25');
  assert.equal(a.sgst.toFixed(2), '8471.25');
  assert.equal(a.igst.toFixed(2), '0.00');
  assert.equal(a.total.toFixed(2), '111067.50');
  const odd = invoiceAmounts([{ quantity: '1', pumped: false }], '100.05', null, false);
  assert.equal(odd.cgst.add(odd.sgst).toFixed(2), '18.01');
  assert.equal(odd.cgst.toFixed(2), '9.00');
  const across = invoiceAmounts(challans, '5450', null, true);
  assert.equal(across.pumping.toFixed(2), '0.00');
  assert.equal(across.igst.toFixed(2), '16186.50');
  assert.equal(across.cgst.toFixed(2), '0.00');
});

test('what a bill waits for never goes below nothing', () => {
  assert.equal(amountDue('1000', ['400', '250']).toFixed(2), '350.00');
  assert.equal(amountDue('1000', ['1200']).toFixed(2), '0.00');
});

test('the day needs what is left of each order at its design, and shows what the stock is short of', () => {
  const need = materialsNeeded(
    [
      { quantity: '30', delivered: '12', onTheWay: '6', design: M25 },
      { quantity: '10', delivered: '10', onTheWay: '0', design: M25 },
      { quantity: '5', delivered: '0', onTheWay: '0', design: [{ itemId: 'cement', quantity: '0.32' }] },
    ],
    new Map([
      ['cement', D(10)],
      ['sand', D(5)],
    ]),
  );
  const by = new Map(need.map((n) => [n.itemId, n]));
  assert.equal(s(by.get('cement')!.needed), '6.160');
  assert.equal(by.get('cement')!.short, false);
  assert.equal(s(by.get('sand')!.needed), '8.640');
  assert.equal(by.get('sand')!.short, true);
  assert.equal(s(by.get('agg20')!.inStock), '0.000');
  assert.equal(by.get('agg20')!.short, true);
});

test('a quote is worth its concrete and pumping, and a grade’s cubes must reach its number', () => {
  assert.equal(orderValue('30', '5450', '350').toFixed(2), '174000.00');
  assert.equal(orderValue('30', '5450', null).toFixed(2), '163500.00');
  assert.equal(gradeStrength('M25'), 25);
  assert.equal(gradeStrength('M7.5'), null);
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
console.log(`\nRMC: ${cases.length - failed} of ${cases.length} tests pass`);
process.exit(failed ? 1 : 0);
