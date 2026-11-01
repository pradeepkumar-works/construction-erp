/**
 * Tests for how a list's columns read (ARCHITECTURE "Tables that answer"): one money scale for a whole column, and which
 * columns a narrow table leaves out of its default view. Pure, so it needs no database:
 *
 *   node dist/scripts/list-columns-test.js
 */
import assert from 'node:assert/strict';
import { columnsToDrop, formatInScale, moneyScale } from '@erp/shared';

/** Figures keep their unit on the same line with no-break spaces; the tests write plain ones. */
const plain = (text: string) => text.replace(/\u00A0/g, ' ');

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

test('a column of crores reads in crore, so ₹ 63 lakh and ₹ 6.3 crore differ by their digits', () => {
  const scale = moneyScale(['63206168.00', '6320616.80', '12500000']);
  assert.equal(scale, 'crore');
  assert.equal(plain(formatInScale('63206168.00', scale)), '₹ 6.32 Cr');
  assert.equal(plain(formatInScale('6320616.80', scale)), '₹ 0.63 Cr');
});

test('one figure under ₹ 10 lakh keeps the column in lakh, never "₹ 0.04 Cr"', () => {
  const scale = moneyScale([63206168, 400000]);
  assert.equal(scale, 'lakh');
  assert.equal(plain(formatInScale(63206168, scale)), '₹ 632.06 L');
  assert.equal(plain(formatInScale(400000, scale)), '₹ 4.00 L');
});

test('small figures stay whole rupees, and a column with no lakh in it is never scaled', () => {
  assert.equal(moneyScale([450, 120000]), 'rupees');
  assert.equal(moneyScale([85000, 2000]), 'rupees');
  assert.equal(plain(formatInScale(85000, 'rupees')), '₹ 85,000');
});

test('zeros and blanks do not pull a column down to rupees', () => {
  assert.equal(moneyScale(['0', null, '', undefined, 25000000, 1500000]), 'crore');
  assert.equal(moneyScale([]), 'rupees');
  assert.equal(moneyScale([0, null]), 'rupees');
});

test('negatives are scaled by their size and keep their sign', () => {
  assert.equal(moneyScale([-2500000, 300000]), 'lakh');
  assert.equal(plain(formatInScale(-2500000, 'lakh')), '₹ -25.00 L');
});

test('a table that fits leaves nothing out', () => {
  assert.deepEqual(columnsToDrop([{ key: 'a', width: 300 }, { key: 'b', width: 200, dropFrom: 1400 }], 600), []);
});

test('a narrow table leaves out the widest-first column first, and only until the rest fit', () => {
  const cols = [
    { key: 'name', width: 260 },
    { key: 'balance', width: 140 },
    { key: 'received', width: 120, dropFrom: 1400 },
    { key: 'issued', width: 120, dropFrom: 1400 },
    { key: 'last', width: 130, dropFrom: 1600 },
  ];
  assert.deepEqual(columnsToDrop(cols, 660), ['last']);
  // Two at the same width: the later one goes first.
  assert.deepEqual(columnsToDrop(cols, 540), ['last', 'issued']);
});

test('a column with no dropFrom is never left out; the table scrolls instead', () => {
  const cols = [
    { key: 'name', width: 400 },
    { key: 'amount', width: 300 },
    { key: 'extra', width: 100, dropFrom: 1280 },
  ];
  assert.deepEqual(columnsToDrop(cols, 500), ['extra']);
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
console.log(`List columns: ${tests.length - failed} of ${tests.length} tests pass`);
if (failed) process.exit(1);
