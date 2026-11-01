/**
 * Item master tests. One spelling per name, which master item a typed line is (by
 * name or old name, the unit however it is spelt), the items a new name may mean, and the groups offered for merging.
 *
 *   node dist/scripts/items-test.js
 */
import assert from 'node:assert/strict';
import { duplicateGroups, isItem, itemKey, masterItemFor, similarItems } from '@erp/shared';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

const items = [
  { id: 'opc', name: 'OPC 53 Grade Cement', unit: 'Bags', aliases: ['cement opc'] },
  { id: 'ppc', name: 'PPC Cement', unit: 'Bags' },
  { id: 'tmt12', name: 'TMT Bar 12mm', unit: 'MT' },
  { id: 'tmt16', name: 'TMT Bar 16mm', unit: 'MT' },
  { id: 'sand', name: 'River Sand', unit: 'Cum' },
];

test('a name is one spelling whatever its case, dots and spaces', () => {
  assert.equal(itemKey('  O.P.C. 53  Grade cement '), 'opc 53grade cement');
  assert.equal(itemKey('OPC 53grade Cement'), itemKey('opc 53 GRADE cement'));
  assert.equal(itemKey('TMT bar, 12 mm'), 'tmt bar 12mm');
  assert.equal(itemKey('...'), '');
});

test('a typed line is the master item of the same name and unit, however both are written', () => {
  assert.equal(masterItemFor('opc 53 grade cement', 'bag', items)?.id, 'opc');
  assert.equal(masterItemFor('TMT bar 12 mm', 'Tonne', items)?.id, 'tmt12');
  assert.equal(masterItemFor('river sand', 'm3', items)?.id, 'sand');
});

test('an old name merged into an item still lands on it', () => {
  assert.equal(masterItemFor('Cement OPC', 'Bags', items)?.id, 'opc');
  assert.ok(isItem(items[0], 'cement, opc', 'bag'));
});

test('the same name in another unit is another item', () => {
  assert.equal(masterItemFor('OPC 53 Grade Cement', 'MT', items), null);
  assert.equal(masterItemFor('Cement', 'Bags', items), null);
});

test('a new name finds the items it may mean, the same unit first, a different size not at all', () => {
  assert.deepEqual(similarItems('Cement', 'Bags', items).map((i) => i.id), ['ppc', 'opc']);
  assert.deepEqual(similarItems('TMT 12mm', 'MT', items).map((i) => i.id), ['tmt12']);
  assert.deepEqual(similarItems('Sand', 'Bags', items).map((i) => i.id), ['sand']);
  assert.deepEqual(similarItems('Diesel', 'Ltr', items), []);
});

test('duplicates group around the most used item, each item in one group', () => {
  const groups = duplicateGroups([
    { id: 'a', name: 'OPC 53 Grade Cement', unit: 'Bags', uses: 40 },
    { id: 'b', name: 'opc 53 grade cement', unit: 'bag', uses: 3 },
    { id: 'c', name: 'Cement', unit: 'Bags', uses: 9 },
    { id: 'd', name: 'PPC Cement', unit: 'Bags', uses: 5 },
    { id: 'e', name: 'OPC 53 Grade Cement', unit: 'MT', uses: 1 },
    { id: 'f', name: 'TMT Bar 12mm', unit: 'MT', uses: 7 },
    { id: 'g', name: 'TMT Bar 16mm', unit: 'MT', uses: 7 },
  ]);
  assert.deepEqual(
    groups.map((g) => [g.keep.id, g.merge.map((m) => m.id)]),
    [['a', ['c', 'b']]],
  );
});

test('an old name counts as the item, but a name holding it is not a duplicate by that', () => {
  const groups = duplicateGroups([
    { id: 'opc', name: 'OPC 53 Grade Cement', unit: 'Bags', aliases: ['cement'], uses: 40 },
    { id: 'ppc', name: 'PPC Cement', unit: 'Bags', uses: 5 },
    { id: 'old', name: 'Cement', unit: 'bag', uses: 1 },
  ]);
  assert.deepEqual(groups.map((g) => [g.keep.id, g.merge.map((m) => m.id)]), [['opc', ['old']]]);
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
