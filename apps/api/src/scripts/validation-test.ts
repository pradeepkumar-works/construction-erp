/**
 * Input checks (finding 4 of the October review): a quantity is a plain number above zero, a day's record is not dated
 * after today, and a measurement sheet does not take a BOQ item past its quantity plus the contract's tolerance.
 *
 *   node dist/scripts/validation-test.js
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { validateSync } from 'class-validator';
import { MEASURE_TOLERANCE_PCT, measureOverBoq } from '@erp/shared';
import { IsQuantity } from '../common/quantity';
import { assertNotAfterToday } from '../common/serialize';
import { todayIn } from '../notifications/time';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

class Line {
  @IsQuantity() quantity!: string;
}
class Used {
  @IsQuantity({ zero: true }) quantity!: string;
}
const ok = (cls: new () => { quantity: string }, quantity: unknown) => validateSync(Object.assign(new cls(), { quantity })).length === 0;

test('a quantity is a plain number above zero', () => {
  for (const q of ['1', '12.5', '0.001', '.5', '200.']) assert.ok(ok(Line, q), q);
  for (const q of ['0', '0.000', '-5', '-0.5', '+3', '1e3', 'abc', '', ' 2', '12,5']) assert.ok(!ok(Line, q), q);
  assert.ok(!ok(Line, 5), 'a number, not a string');
});

test('material used may be zero, never negative', () => {
  assert.ok(ok(Used, '0'));
  assert.ok(ok(Used, '92'));
  assert.ok(!ok(Used, '-1'));
});

test('the message names the field and says what to enter', () => {
  const [e] = validateSync(Object.assign(new Line(), { quantity: '-5' }));
  assert.equal(Object.values(e.constraints ?? {})[0], 'quantity must be more than zero');
});

test('a record for today or before is taken; tomorrow is not', () => {
  const today = todayIn();
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  assert.doesNotThrow(() => assertNotAfterToday(today, 'DPR'));
  assert.doesNotThrow(() => assertNotAfterToday('2024-01-31', 'DPR'));
  assert.throws(() => assertNotAfterToday(tomorrow, 'DPR'), /The DPR date cannot be after today/);
});

test('measurement within the BOQ quantity and its tolerance passes', () => {
  assert.equal(measureOverBoq({ boqQty: 100, before: 60, sheet: 40 }), null);
  assert.equal(measureOverBoq({ boqQty: 100, before: 100, sheet: 25 }), null);
  assert.equal(MEASURE_TOLERANCE_PCT, 25);
});

test('a sheet past the BOQ quantity plus the tolerance is held, with the figures to say so', () => {
  assert.deepEqual(measureOverBoq({ boqQty: 100, before: 100, sheet: 25.001 }), { cap: 125, after: 125.001 });
  assert.deepEqual(measureOverBoq({ boqQty: 69, before: 0, sheet: 345 }), { cap: 86.25, after: 345 });
  assert.deepEqual(measureOverBoq({ boqQty: 100, before: 0, sheet: 105, tolerancePct: 0 }), { cap: 100, after: 105 });
  assert.equal(measureOverBoq({ boqQty: 100, before: 0, sheet: 140, tolerancePct: 50 }), null);
});

test('an extra item with no BOQ quantity is left to its variation', () => {
  assert.equal(measureOverBoq({ boqQty: 0, before: 0, sheet: 30 }), null);
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
