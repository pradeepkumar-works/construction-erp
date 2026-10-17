/**
 * Tests for reading invoices, challans and drawings (AI item 70) that need no model: turning the model's reply into
 * typed values, the checks that mark a value to check, and matching read lines to order lines.
 *
 *   node dist/scripts/doc-read-test.js
 */
import assert from 'node:assert/strict';
import { disciplineOf, gstinCheckChar, itemSimilarity, matchLines, normUnit } from '@erp/shared';
import { normalise, parseReply, toDate, toNumber } from '../ai/ai-read.service';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);
const at = (value: unknown, confidence = 'high') => ({ value, confidence, page: 1, box: [100, 100, 300, 130] });
const valid = (first14: string) => `${first14}${gstinCheckChar(first14)}`;

test('dates are read day first, with digits or a month name', () => {
  assert.equal(toDate('05/10/26'), '2026-10-05');
  assert.equal(toDate('5-10-2026'), '2026-10-05');
  assert.equal(toDate('14.10.2026'), '2026-10-14');
  assert.equal(toDate('09-Oct-2026'), '2026-10-09');
  assert.equal(toDate('14 October 2026'), '2026-10-14');
  assert.equal(toDate('2026-10-14'), '2026-10-14');
  assert.equal(toDate('31/02/2026'), null);
  assert.equal(toDate('next week'), null);
});

test('figures lose ₹, commas and per cent, and Devanagari digits become 0 to 9', () => {
  assert.equal(toNumber('₹ 2,48,295.00'), 248295);
  assert.equal(toNumber('18%'), 18);
  assert.equal(toNumber('Rs. 1,150'), 1150);
  assert.equal(toNumber('२४०'), 240);
  assert.equal(toNumber(12.48), 12.48);
  assert.equal(toNumber('twelve'), null);
});

test('the JSON is found inside a code fence or a sentence', () => {
  assert.deepEqual(parseReply('```json\n{"fields": {"invoiceNo": {"value": "A1"}}, "lines": []}\n```')?.fields, { invoiceNo: { value: 'A1' } });
  assert.equal(parseReply('I could not read it.'), null);
  assert.equal(parseReply('{"lines": []}'), null);
});

test('a GSTIN whose check character does not match is marked to check', () => {
  const ok = normalise('invoice', { fields: { gstin: at(valid('21ABCPU7788C1Z')) }, lines: [] }, 1);
  assert.equal(ok.fields.gstin.confidence, 'high');
  const bad = normalise('invoice', { fields: { gstin: at('21ABCPU7788C1Z1') }, lines: [] }, 1);
  assert.equal(bad.fields.gstin.confidence, 'low');
  assert.match(bad.fields.gstin.reason ?? '', /check character/);
  const short = normalise('challan', { fields: { gstin: at('21ABCPU7788') }, lines: [] }, 1);
  assert.equal(short.fields.gstin.confidence, 'low');
});

test('a line whose quantity × rate is not its amount, and totals that do not add up, are marked to check', () => {
  const r = normalise(
    'invoice',
    {
      fields: { subtotal: at(77000), cgst: at(10780), sgst: at(10780), total: at(99560) },
      lines: [{ description: at('OPC 53 Grade Cement'), quantity: at(200), rate: at(358), amount: at(77000) }],
    },
    1,
  );
  assert.equal(r.lines[0].rate.confidence, 'low');
  assert.equal(r.fields.subtotal.confidence, 'high');
  assert.equal(r.fields.total.confidence, 'low', '77,000 + 21,560 is 98,560, not 99,560');
  const fine = normalise('invoice', { fields: { subtotal: at(77000), cgst: at(10780), sgst: at(10780), total: at(98560) }, lines: [{ description: at('Cement'), quantity: at(200), rate: at(385), amount: at(77000) }] }, 1);
  assert.equal(fine.fields.total.confidence, 'high');
  assert.equal(fine.lines[0].rate.confidence, 'high');
});

test('values not printed stay empty with no box; boxes are clamped and a page past the last is dropped', () => {
  const r = normalise('drawing', { fields: { drawingNo: { value: 'A-101', page: 4, box: [-20, 10, 1200, 40] }, revision: { value: null, box: [1, 2, 3, 4] } }, lines: [{ description: at('x') }] }, 2);
  assert.deepEqual(r.fields.drawingNo.box, [0, 10, 1000, 40]);
  assert.equal(r.fields.drawingNo.page, 1);
  assert.equal(r.fields.revision.box, null);
  assert.equal(r.fields.title.value, null);
  assert.equal(r.lines.length, 0, 'a drawing has no lines');
});

test('read lines match order lines by item, unit and rate, each order line once', () => {
  const po = [
    { id: 'cement', itemName: 'OPC 53 Grade Cement', unit: 'Bags', rate: 385 },
    { id: 'tmt12', itemName: 'TMT Fe500D 12mm', unit: 'MT', rate: 58500 },
  ];
  assert.deepEqual(
    matchLines([{ description: 'TMT Fe500D 12mm', unit: 'MT', rate: 58500 }, { description: 'OPC 53 Grade Cement (Ultratech)', unit: 'Bag', rate: 385 }], po).map((m) => m?.id),
    ['tmt12', 'cement'],
  );
  assert.equal(matchLines([{ description: 'TMT Fe500D 16mm', unit: 'MT', rate: 58500 }], po)[0], null, '16mm bars are not the 12mm on the order');
  assert.equal(matchLines([{ description: 'Safety helmet', unit: 'Nos', rate: 245 }], po)[0], null);
  assert.deepEqual(matchLines([{ description: 'Cement', unit: 'Bags' }, { description: 'Cement', unit: 'Bags' }], po).map((m) => m?.id), ['cement', undefined]);
});

test('an item written in Hindi matches on its unit and rate', () => {
  const po = [{ id: 'grease', itemName: 'Grease (lithium)', unit: 'Kg', rate: 240 }, { id: 'oil', itemName: 'Engine oil 15W-40', unit: 'Ltr', rate: 295 }];
  assert.deepEqual(matchLines([{ description: 'ग्रीस', unit: 'Kg', rate: 240 }, { description: 'इंजन ऑयल', unit: 'Ltr', rate: 295 }], po).map((m) => m?.id), ['grease', 'oil']);
  assert.equal(matchLines([{ description: 'ग्रीस', unit: 'Kg', rate: 300 }], po)[0], null, 'a rate 25% off is not enough to go on');
});

test('units and disciplines as printed', () => {
  assert.equal(normUnit('Bags'), normUnit('bag'));
  assert.equal(normUnit('M3'), 'cum');
  assert.equal(normUnit('Litres'), 'ltr');
  assert.equal(disciplineOf('STRUCTURAL'), 'STRUCTURAL');
  assert.equal(disciplineOf('MEP'), 'MECHANICAL');
  assert.equal(disciplineOf('Plumbing & drainage'), 'PLUMBING');
  assert.equal(disciplineOf('Landscape'), null);
  assert.ok(itemSimilarity('Bitumen VG-30 (bulk)', 'Bitumen VG-30') >= 0.9);
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
console.log(`Reading: ${tests.length - failed} of ${tests.length} tests pass`);
if (failed) process.exit(1);
