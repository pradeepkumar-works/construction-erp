/**
 * Tests for the standard norms library. Which BOQ item is which kind of work is
 * pure, so it needs no database:
 *
 *   node dist/scripts/norms-library-test.js
 */
import assert from 'node:assert/strict';
import { STANDARD_NORMS, normsKey, standardNormFor, suggestStandardNorms, type NormCandidate } from '@erp/shared';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

const boq = (description: string, unit: string, id = description): NormCandidate => ({ id, description, unit });
const keyOf = (description: string, unit: string) => standardNormFor(boq(description, unit))?.key ?? null;

test('a BOQ item is read by its words and its unit', () => {
  assert.equal(keyOf('RCC M20 in foundation and plinth', 'Cum'), 'rcc-m20');
  assert.equal(keyOf('Providing and laying PCC 1:4:8 under footings', 'Cum'), 'pcc-m75');
  assert.equal(keyOf('Brick work in cement mortar 1:6 in superstructure', 'Cum'), 'brickwork');
  assert.equal(keyOf('12 mm cement plaster to walls', 'Sqm'), 'plaster-12');
  assert.equal(keyOf('Granular Sub Base (GSB) Grading-II', 'Cum'), 'gsb');
  assert.equal(keyOf('Wet Mix Macadam (WMM)', 'Cum'), 'wmm');
  assert.equal(keyOf('Dense Bituminous Macadam (DBM) 50mm', 'MT'), 'dbm');
  assert.equal(keyOf('Reinforcement for RCC work with TMT bars', 'MT'), 'reinforcement');
});

test('the same work measured in another unit is not it', () => {
  // Concrete sold by weight, plaster by the cum: the library stays out of it.
  assert.equal(keyOf('RCC M20 in foundation', 'MT'), null);
  assert.equal(keyOf('12 mm cement plaster to walls', 'Cum'), null);
});

test('M 20 written with a space is still M20, and case does not matter', () => {
  assert.equal(keyOf('rcc m 20 in raft', 'Cum'), 'rcc-m20');
  assert.equal(keyOf('R.C.C. M-25 in columns', 'Cum'), 'rcc-m25');
  // Dots only separate words; what matters is that the grade comes out as one word to look for.
  assert.equal(normsKey('R.C.C. M-25'), 'r c c m25');
});

test('what it does not know, it leaves alone', () => {
  assert.equal(keyOf('Supplying and fixing MS railing as per drawing', 'Rmt'), null);
  assert.equal(keyOf('Earthwork in excavation in ordinary soil', 'Cum'), null);
  // Half-brick walls are measured in sqm and take different figures: ruled out rather than guessed at.
  assert.equal(keyOf('Half brick masonry 115 mm thick in CM 1:4', 'Cum'), null);
});

test('a bituminous concrete item is not read as macadam', () => {
  assert.equal(keyOf('Bituminous Concrete 40mm wearing course', 'MT'), 'bc');
  assert.equal(keyOf('Dense Bituminous Macadam', 'MT'), 'dbm');
});

test('a list comes back with only what the library knows', () => {
  const items = [boq('RCC M20 in footings', 'Cum'), boq('Earthwork in excavation', 'Cum'), boq('Wet Mix Macadam', 'Cum')];
  assert.deepEqual(
    suggestStandardNorms(items).map((s) => [s.item.id, s.norm.key]),
    [
      ['RCC M20 in footings', 'rcc-m20'],
      ['Wet Mix Macadam', 'wmm'],
    ],
  );
});

test('every norm in the library is usable: a key of its own, materials, and sane figures', () => {
  const keys = new Set<string>();
  for (const n of STANDARD_NORMS) {
    assert.equal(keys.has(n.key), false, `${n.key} is in the library twice`);
    keys.add(n.key);
    assert.ok(n.words.length && n.materials.length, `${n.key} says nothing`);
    assert.ok(n.note.length > 20, `${n.key} does not say what its figures stand on`);
    for (const m of n.materials) {
      assert.ok(m.qtyPerUnit > 0, `${n.key}: ${m.item} per unit must be above zero`);
      assert.ok(m.wastagePct >= 0 && m.wastagePct <= 100, `${n.key}: ${m.item} wastage is not a percentage`);
    }
  }
});

test('cement per cum falls with the grade, as it must', () => {
  const bags = (key: string) => STANDARD_NORMS.find((n) => n.key === key)!.materials.find((m) => m.item.includes('Cement'))!.qtyPerUnit;
  const order = ['rcc-m25', 'rcc-m20', 'rcc-m15', 'pcc-m10', 'pcc-m75'];
  for (let i = 1; i < order.length; i++) assert.ok(bags(order[i]) < bags(order[i - 1]), `${order[i]} takes as much cement as ${order[i - 1]}`);
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
console.log(`The standard norms library: ${tests.length - failed} of ${tests.length} tests pass`);
if (failed) process.exit(1);
