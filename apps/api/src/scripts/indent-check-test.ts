/**
 * Indent checks' tests: what the BOQ allows of a material from the project's norms, an activity's own norm
 * taking its share out of its BOQ item's, and each request line against the site's store and what is left of the
 * allowance, with no database. CI runs it after the build:
 *
 *   node dist/scripts/indent-check-test.js
 */
import assert from 'node:assert/strict';
import { boqAllowance, indentLineCheck, indentLineFlagged } from '@erp/shared';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);

test('the allowance is the norms over the whole BOQ, wastage included', () => {
  // 120 cum of M25 at 8 bags a cum with 2% wastage, and 40 cum of PCC at 4.4 bags
  const bags = boqAllowance(
    [
      { boqItemId: 'm25', boqQty: 120, qtyPerUnit: 8, wastagePct: 2 },
      { boqItemId: 'pcc', boqQty: 40, qtyPerUnit: 4.4, wastagePct: 0 },
    ],
    [],
  );
  assert.equal(bags, 979.2 + 176);
});

test('an activity with its own norm takes its planned quantity out of its BOQ item', () => {
  // 30 of the 120 cum are a raft with its own norm of 8.4 bags
  const bags = boqAllowance([{ boqItemId: 'm25', boqQty: 120, qtyPerUnit: 8, wastagePct: 0 }], [{ activityId: 'raft', boqItemId: 'm25', plannedQty: 30, qtyPerUnit: 8.4, wastagePct: 0 }]);
  assert.equal(bags, 90 * 8 + 30 * 8.4);
  assert.equal(boqAllowance([], []), null, 'no norm names the material');
  assert.equal(boqAllowance([{ boqItemId: 'm25', boqQty: 10, qtyPerUnit: 8, wastagePct: 0 }], [{ activityId: 'a', boqItemId: 'm25', plannedQty: 15, qtyPerUnit: 8, wastagePct: 0 }]), 120, 'an activity planned past its BOQ item leaves the item nothing, never less');
});

test('a line within what is left, with nothing in the store, needs no eye', () => {
  const v = indentLineCheck({ requested: 50, onHand: 0, allowance: 1000, issued: 600, waiting: 0 });
  assert.deepEqual(v, { left: 400, over: null, fromStock: 0, notes: [] });
  assert.equal(indentLineFlagged(v), false);
});

test('a line past the BOQ says by how much, counting the store and requests waiting', () => {
  // 1000 allowed, 700 issued, 150 in the store, 100 asked for by a request waiting: 50 left, 120 asked
  const v = indentLineCheck({ requested: 120, onHand: 150, allowance: 1000, issued: 700, waiting: 100 });
  assert.equal(v.left, 50);
  assert.equal(v.over, 70);
  assert.deepEqual(v.notes, ['STOCK_COVERS', 'OVER_BOQ', 'WAITING']);
  assert.equal(v.fromStock, 120);
  assert.equal(indentLineFlagged(v), true);
});

test('the store first: all of it, part of it, and a negative balance read as nothing', () => {
  assert.deepEqual(indentLineCheck({ requested: 20, onHand: 25, allowance: null, issued: 0, waiting: 0 }).notes, ['STOCK_COVERS', 'NO_NORM']);
  const part = indentLineCheck({ requested: 20, onHand: 5, allowance: null, issued: 0, waiting: 0 });
  assert.equal(part.fromStock, 5);
  assert.deepEqual(part.notes, ['STOCK_PART', 'NO_NORM']);
  assert.equal(indentLineFlagged(part), false, 'part from the store is advice, not a flag');
  assert.equal(indentLineCheck({ requested: 20, onHand: -3, allowance: 100, issued: 0, waiting: 0 }).fromStock, 0);
});

test('an allowance used up leaves nothing, never less', () => {
  const v = indentLineCheck({ requested: 10, onHand: 0, allowance: 100, issued: 130, waiting: 0 });
  assert.equal(v.left, 0);
  assert.equal(v.over, 10);
});

let failed = 0;
for (const [name, fn] of cases) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n${(e as Error).message}`);
  }
}
console.log(`\n${cases.length - failed}/${cases.length} passed`);
if (failed) process.exit(1);
