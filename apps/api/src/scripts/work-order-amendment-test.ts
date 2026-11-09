/**
 * Tests for amending an approved work order: what may be amended, what a line may become, what the change adds up to,
 * the order as it stood at each amendment, and that a bill after an amended rate leaves earlier bills at their own rates.
 * Pure, so it needs no database:
 *
 *   node dist/scripts/work-order-amendment-test.js
 */
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import {
  amendFloorQty,
  amendLineAmount,
  amendmentLineProblem,
  amendmentLinesProblem,
  amendmentOpenProblem,
  amendmentSummary,
  workOrderAsOf,
  woAmendmentLabel,
  type AmendLineNow,
  type AmendLineProposed,
} from '@erp/shared';
import { subBillLines } from '../subcontracts/sub-bill-lines';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

const order = { woNo: 'WO-2026-0003', status: 'APPROVED', closedAt: null, finalBillApproved: false, openAmendmentNo: null };

const now: AmendLineNow[] = [
  { id: 'l1', boqItemId: 'b1', description: '2.1 Brickwork', quantity: '1200', rate: '310', billedQty: '400', measuredQty: '650.5' },
  { id: 'l2', boqItemId: null, description: 'Scaffolding', quantity: '1', rate: '45000', billedQty: '0', measuredQty: '0' },
];
const keep = (l: AmendLineNow, quantity = l.quantity, rate = l.rate): AmendLineProposed => ({ workOrderLineId: l.id, boqItemId: l.boqItemId, description: l.description, quantity, rate });

test('an amendment is raised only on an approved open order with no final bill and none open', () => {
  assert.equal(amendmentOpenProblem(order), null);
  assert.match(amendmentOpenProblem({ ...order, status: 'SUBMITTED' })!, /not approved/);
  assert.match(amendmentOpenProblem({ ...order, closedAt: '2026-11-01T00:00:00Z' })!, /closed/);
  assert.match(amendmentOpenProblem({ ...order, finalBillApproved: true })!, /final bill/);
  assert.match(amendmentOpenProblem({ ...order, openAmendmentNo: 2 })!, /Amendment 2 .* still open/);
});

test('a line comes down no further than what is billed or measured against it', () => {
  assert.equal(amendFloorQty(now[0]), '650.500', 'measured beyond billed holds it');
  assert.equal(amendmentLineProblem(keep(now[0], '650.5'), now, []), null, 'down to the measured quantity is fine');
  assert.match(amendmentLineProblem(keep(now[0], '650'), now, [])!, /650.5 is already billed or measured/);
  assert.equal(amendmentLineProblem(keep(now[1], '0'), now, []), null, 'an item with no work on it may go to zero');
  assert.match(amendmentLineProblem(keep(now[1], '-1'), now, [])!, /negative/);
});

test('every rate is above zero', () => {
  assert.match(amendmentLineProblem(keep(now[0], '1200', '0'), now, [])!, /rate above zero/);
  assert.match(amendmentLineProblem({ workOrderLineId: null, boqItemId: null, description: 'Curing', quantity: '10', rate: '0' }, now, [])!, /rate above zero/);
});

test('a new BOQ line is not one the order or another new line already has', () => {
  const again: AmendLineProposed = { workOrderLineId: null, boqItemId: 'b1', description: '2.1 Brickwork', quantity: '10', rate: '300' };
  assert.match(amendmentLineProblem(again, now, [again])!, /on the order already/);
  const fresh: AmendLineProposed = { workOrderLineId: null, boqItemId: 'b9', description: '4.2 Plaster', quantity: '500', rate: '120' };
  assert.equal(amendmentLineProblem(fresh, now, [fresh]), null);
  assert.match(amendmentLineProblem(fresh, now, [fresh, fresh])!, /added twice/);
  assert.match(amendmentLineProblem({ ...fresh, quantity: '0' }, now, [fresh])!, /quantity of the new item/);
});

test('a whole proposal names its first problem, and an order line in it twice', () => {
  assert.equal(amendmentLinesProblem(now, [keep(now[0], '1400'), keep(now[1])]), null);
  assert.match(amendmentLinesProblem(now, [keep(now[0]), keep(now[0])])!, /twice/);
  assert.match(amendmentLinesProblem(now, [{ ...keep(now[0]), workOrderLineId: 'gone' }])!, /not a line of this work order/);
});

test('the summary gives the value before and after and counts lines changed and added', () => {
  const s = amendmentSummary(now, [keep(now[0], '1400'), keep(now[1]), { workOrderLineId: null, boqItemId: 'b9', description: '4.2 Plaster', quantity: '500', rate: '120' }]);
  assert.equal(s.valueBefore, '417000.00', '1200 × 310 + 45000');
  assert.equal(s.valueAfter, '539000.00', '1400 × 310 + 45000 + 500 × 120');
  assert.equal(s.change, '122000.00');
  assert.equal(s.changed, 1);
  assert.equal(s.added, 1);
  assert.equal(amendmentSummary(now, [keep(now[0]), keep(now[1])]).changed, 0, 'the same figures are no change');
  assert.equal(amendmentSummary(now, [keep(now[0], '1200.000', '310.00')]).changed, 0, 'trailing zeros are no change');
  assert.equal(amendmentSummary(now, []).valueAfter, '417000.00', 'a line left out stays as it is');
});

test('amounts are exact to the paisa, half up', () => {
  assert.equal(amendLineAmount('0.333', '10.05'), '3.35', '3.34665 rounds up');
  assert.equal(amendLineAmount('2.5', '0.01'), '0.03', '0.025 rounds up');
  assert.equal(amendLineAmount('123456789.125', '98765.43'), '12193262864349.95');
});

test('the order as it stood at each amendment', () => {
  const lines = [
    { id: 'l1', quantity: '1500', rate: '320' },
    { id: 'l2', quantity: '1', rate: '45000' },
    { id: 'l3', quantity: '500', rate: '120' },
  ];
  const amendments = [
    { amendmentNo: 1, lines: [{ workOrderLineId: 'l1', qtyBefore: '1200', rateBefore: '310' }, { workOrderLineId: 'l2', qtyBefore: '1', rateBefore: '45000' }, { workOrderLineId: 'l3', qtyBefore: null, rateBefore: null }] },
    { amendmentNo: 3, lines: [{ workOrderLineId: 'l1', qtyBefore: '1400', rateBefore: '310' }] },
  ];
  const v0 = workOrderAsOf(lines, amendments, 0);
  assert.deepEqual(v0.lines.map((l) => [l.id, l.quantity, l.rate]), [['l1', '1200', '310'], ['l2', '1', '45000']], 'as approved: the added item gone');
  assert.equal(v0.value, '417000.00');
  const v1 = workOrderAsOf(lines, amendments, 1);
  assert.deepEqual(v1.lines.find((l) => l.id === 'l1'), { id: 'l1', quantity: '1400', rate: '310', amount: '434000.00' });
  assert.equal(v1.lines.length, 3);
  assert.equal(workOrderAsOf(lines, amendments, 3).value, '585000.00', 'now: 1500 × 320 + 45000 + 60000');
  assert.equal(workOrderAsOf(lines, amendments, 2).value, workOrderAsOf(lines, amendments, 1).value, 'a rejected number in between changes nothing');
});

test('an amendment is named after its order', () => {
  assert.equal(woAmendmentLabel('WO-2026-0003', 2), 'WO-2026-0003 amendment 2');
});

const D = (v: string | number) => new Prisma.Decimal(v);

test('a bill after an amended rate keeps earlier bills at their own rates', () => {
  // Bill 1 took 400 at 310; the rate was then amended to 320 and 650 are measured up to date.
  const lines = subBillLines([{ id: 'l1', boqItemId: 'b1', rate: D(320) }], [{ workOrderLineId: 'l1', thisQty: D(400), amount: D(124000) }], new Map([['b1', D(650)]]), new Map());
  assert.equal(lines.length, 1);
  assert.equal(lines[0].prevQty.toString(), '400');
  assert.equal(lines[0].prevAmount.toFixed(2), '124000.00', 'bill 1 stands at 310, not restated at 320');
  assert.equal(lines[0].thisQty.toString(), '250');
  assert.equal(lines[0].amount.toFixed(2), '80000.00', 'the new work at the amended rate');
});

test('bill lines: own items take the quantity entered, and a line with nothing is left out', () => {
  const lines = subBillLines(
    [
      { id: 'l1', boqItemId: 'b1', rate: D(310) },
      { id: 'l2', boqItemId: null, rate: D(45000) },
      { id: 'l3', boqItemId: 'b9', rate: D(120) },
    ],
    [],
    new Map([['b1', D(100)]]),
    new Map([['l2', D('0.5')]]),
  );
  assert.deepEqual(lines.map((l) => [l.workOrderLineId, l.thisQty.toString(), l.amount.toFixed(2), l.prevAmount.toFixed(2)]), [
    ['l1', '100', '31000.00', '0.00'],
    ['l2', '0.5', '22500.00', '0.00'],
  ]);
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
console.log(`Work order amendments: ${tests.length - failed} of ${tests.length} tests pass`);
if (failed) process.exit(1);
