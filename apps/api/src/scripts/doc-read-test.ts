/**
 * Tests for reading invoices, challans and drawings, work orders and BOQs that need no model: turning the model's reply into
 * typed values, the checks that mark a value to check, and matching read lines to order lines.
 *
 *   node dist/scripts/doc-read-test.js
 */
import assert from 'node:assert/strict';
import { boqRowsFromRead, disciplineOf, gstinCheckChar, itemSimilarity, matchLines, normUnit, readDateProblem, workOrderEnd } from '@erp/shared';
import { fixGstin, fixVehicleNo, normalise, parseReply, toDate, toNumber } from '../ai/ai-read.service';

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
  // A wrong check character that is no look-alike of the right one.
  const good = valid('21ABCPU7788C1Z');
  const bad = normalise('invoice', { fields: { gstin: at(`${good.slice(0, 14)}${good[14] === 'X' ? 'Y' : 'X'}`) }, lines: [] }, 1);
  assert.equal(bad.fields.gstin.confidence, 'low');
  assert.match(bad.fields.gstin.reason ?? '', /check character/);
  const short = normalise('challan', { fields: { gstin: at('21ABCPU7788') }, lines: [] }, 1);
  assert.equal(short.fields.gstin.confidence, 'low');
});

test('look-alike characters in a GSTIN and a vehicle number are put right by their pattern', () => {
  assert.equal(fixGstin('21AAKFK4521B1ZO'), '21AAKFK4521B1Z0');
  assert.equal(fixGstin('2LAAKFK452IB1Z0'), '21AAKFK4521B1Z0');
  assert.equal(fixGstin('21AAKFK4521B1Z0'), '21AAKFK4521B1Z0');
  const r = normalise('challan', { fields: { gstin: { value: '21AAKFK4521B1ZO' }, vehicleNo: { value: 'ODO2 BT 9087' } }, lines: [] }, 1);
  assert.equal(r.fields.gstin.value, '21AAKFK4521B1Z0');
  assert.equal(r.fields.gstin.confidence, 'high');
  assert.equal(r.fields.vehicleNo.value, 'OD02 BT 9087');
  assert.equal(fixVehicleNo('ODO2BT9087'), 'OD02BT9087');
  assert.equal(fixVehicleNo('DL1C AB 1234'), 'DL1C AB 1234');
  assert.equal(fixVehicleNo('OD 33 X 4410'), 'OD 33 X 4410');
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

test('a kachha bill with only lines, one GST figure and a total gets its taxable value and GST worked out', () => {
  const r = normalise('invoice', { fields: { total: at(2714) }, lines: [{ description: at('Hydraulic hose'), quantity: at(2), rate: at(1150), amount: at(2300) }] }, 1);
  assert.equal(r.fields.subtotal.value, 2300);
  assert.equal(r.fields.subtotal.box, null, 'a worked-out figure has no place on the page');
  assert.match(r.fields.subtotal.reason ?? '', /sum of the lines/);
  assert.equal(Number(r.fields.cgst.value) + Number(r.fields.sgst.value), 414);
  assert.equal(r.fields.total.confidence, 'high');
  const printed = normalise('invoice', { fields: { subtotal: at(2300), cgst: at(207), sgst: at(207), total: at(2714) }, lines: [] }, 1);
  assert.equal(printed.fields.cgst.reason, null, 'printed figures are left alone');
  const noGst = normalise('invoice', { fields: { subtotal: at(2300), total: at(2300) }, lines: [] }, 1);
  assert.equal(noGst.fields.cgst.value, null, 'a bill without GST gets none');
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

test('a work order: dates and the contract value typed, a completion before the start marked', () => {
  const r = normalise('workOrder', { fields: { nameOfWork: at('Road from Km 12 to Km 18'), workOrderDate: at('02/11/2026'), contractValue: at('₹ 8,46,50,000'), startDate: at('15.11.2026'), completionDate: at('01/11/2026'), durationMonths: at('18') }, lines: [] }, 1);
  assert.equal(r.fields.workOrderDate.value, '2026-11-02');
  assert.equal(r.fields.contractValue.value, 84650000);
  assert.equal(r.fields.durationMonths.value, 18);
  assert.equal(r.fields.completionDate.confidence, 'low');
  assert.equal(r.lines.length, 0);
  // A value of a few hundred is a figure in lakh or crore misread as rupees.
  assert.equal(normalise('workOrder', { fields: { contractValue: at('846.5') }, lines: [] }, 1).fields.contractValue.confidence, 'low');
});

test('a work order runs its months from the start when no completion date is printed', () => {
  assert.equal(workOrderEnd('2026-11-01', null, 18), '2028-04-30');
  assert.equal(workOrderEnd('2026-11-15', null, 18), '2028-05-14');
  assert.equal(workOrderEnd('2027-01-31', null, 1), '2027-02-28');
  assert.equal(workOrderEnd('2026-11-15', '2028-05-31', 18), '2028-05-31');
  assert.equal(workOrderEnd(null, null, 18), null);
  assert.equal(workOrderEnd('2026-11-15', null, 2.5), null);
});

test('BOQ lines: amounts checked against quantity × rate, with a BOQ’s rounding allowed', () => {
  const r = normalise('boq', { fields: {}, lines: [
    { itemNo: at('1.01'), description: at('Earthwork in embankment'), unit: at('Cum'), quantity: at('18,500'), rate: at('245'), amount: at('45,32,500') },
    { itemNo: at('1.02'), description: at('Granular sub-base'), unit: at('Cum'), quantity: at('6400'), rate: at('1850'), amount: at('1,18,40,000') },
    { itemNo: at('1.03'), description: at('Wet mix macadam'), unit: at('Cum'), quantity: at('4812'), rate: at('2650'), amount: at('1,27,52,000') },
  ] }, 1);
  assert.equal(r.lines[0].amount.confidence, 'high');
  // 6400 × 1850 is 1,18,40,000: right. 4812 × 2650 is 1,27,51,800: within half a per cent of the rounded amount.
  assert.equal(r.lines[1].quantity.confidence, 'high');
  assert.equal(r.lines[2].amount.confidence, 'high');
  const wrong = normalise('boq', { fields: {}, lines: [{ description: at('GSB'), quantity: at('6400'), rate: at('1850'), amount: at('11480000') }] }, 1);
  assert.equal(wrong.lines[0].quantity.confidence, 'low');
});

test('BOQ rows for the import: headings carried down, run-on descriptions joined, missing rates worked out', () => {
  const read = normalise('boq', { fields: {}, lines: [
    { description: at('PART A: EARTHWORK') },
    { itemNo: at('1.01'), description: at('Earthwork in embankment with approved borrowed earth,'), unit: at('Cum'), quantity: at(18500), rate: at(245), amount: at(4532500) },
    { description: at('compacted in layers of 200 mm') },
    { itemNo: at('1.02'), section: at('Earthwork'), description: at('Clearing and grubbing'), unit: at('Sqm'), quantity: at(42000), amount: at(777000) },
    { itemNo: at('2.01'), description: at('Granular sub-base'), unit: at('Cum'), quantity: at('64OO', 'low'), rate: at(1850) },
  ] }, 1);
  const rows = boqRowsFromRead(read.lines);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].section, 'PART A: EARTHWORK');
  assert.equal(rows[0].description, 'Earthwork in embankment with approved borrowed earth, compacted in layers of 200 mm');
  assert.equal(rows[0].check, null);
  assert.equal(rows[1].section, 'Earthwork');
  assert.equal(rows[1].rate, '18.5');
  assert.match(rows[1].check!, /rate: not printed/);
  assert.equal(rows[2].originalQty, '');
  assert.match(rows[2].check!, /quantity/);
});

test('a date that cannot be right is left for the person, with the reason', () => {
  const today = '2026-10-26';
  // A year misread turns last Christmas into next: never filled in by itself.
  assert.equal(readDateProblem('2026-12-25', today), 'future');
  assert.equal(readDateProblem('2025-09-30', today), null);
  assert.equal(readDateProblem('2025-01-02', today), 'old');
  assert.equal(readDateProblem('15-10-2026', today), 'unreadable');
  // Today is fine, and no date at all is no problem.
  assert.equal(readDateProblem(today, today), null);
  assert.equal(readDateProblem(null, today), null);
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
