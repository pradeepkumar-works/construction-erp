/**
 * Fuel slip tests (item 178). The bowser's readings on a slip hold the litres to what the pump moved, and the day's
 * fuel adds up by machine kind with what went into hired machines.
 *
 *   node dist/scripts/fuel-slips-test.js
 */
import assert from 'node:assert/strict';
import { fuelByKind, pumpReadingProblem } from '@erp/shared';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

test('a slip without readings passes, and one with half of them does not', () => {
  assert.equal(pumpReadingProblem(null, null, 60), null);
  assert.match(pumpReadingProblem(12450, null, 60)!, /both pump readings/);
  assert.match(pumpReadingProblem(null, 12510, 60)!, /both pump readings/);
});

test('the litres are what the pump moved, within half a litre', () => {
  assert.equal(pumpReadingProblem(12450, 12510, 60), null);
  assert.equal(pumpReadingProblem(12450, 12510.4, 60), null);
  assert.equal(pumpReadingProblem(12450.25, 12465.25, 15), null);
  assert.equal(pumpReadingProblem(12450, 12510, 55), 'The pump moved 60 L; the slip says 55 L');
});

test('the end reading must be past the start, and the start not negative', () => {
  assert.match(pumpReadingProblem(12510, 12450, 60)!, /past the start/);
  assert.match(pumpReadingProblem(12510, 12510, 0)!, /past the start/);
  assert.match(pumpReadingProblem(-5, 10, 15)!, /negative/);
});

test("the day's fuel adds up by kind, machines counted once, hired litres apart, most litres first", () => {
  const rows = fuelByKind([
    { equipmentId: 'jcb', equipmentCategory: 'Excavator', ownership: 'OWNED', litres: '60' },
    { equipmentId: 'jcb', equipmentCategory: 'Excavator', ownership: 'OWNED', litres: '20' },
    { equipmentId: 'tilwadi', equipmentCategory: 'Excavator', ownership: 'HIRED', litres: '45' },
    { equipmentId: 't5', equipmentCategory: 'Tractor', ownership: 'OWNED', litres: '15' },
    { equipmentId: 'dg', equipmentCategory: null, ownership: 'OWNED', litres: '120' },
    { equipmentId: 'flory', equipmentCategory: ' ', ownership: 'HIRED', litres: '15' },
  ]);
  assert.deepEqual(rows, [
    { kind: 'Other', machines: 2, litres: 135, hiredLitres: 15 },
    { kind: 'Excavator', machines: 2, litres: 125, hiredLitres: 45 },
    { kind: 'Tractor', machines: 1, litres: 15, hiredLitres: 0 },
  ]);
  assert.deepEqual(fuelByKind([]), []);
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
