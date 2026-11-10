/**
 * A company's own fields on vendors, projects and purchase orders (ARCHITECTURE "Custom fields"). Each kind of value is
 * read the one way; required fields are asked for in words; keys of no field are dropped; an archived field keeps the
 * value a record holds and takes no new one; a field's definition is checked before it is saved; and the DPR's own
 * fields, which share the readers, read exactly as before.
 *
 *   node dist/scripts/custom-fields-test.js
 */
import assert from 'node:assert/strict';
import {
  CUSTOM_FIELD_ENTITIES,
  CUSTOM_FIELD_ENTITY_INFO,
  DPR_FIELD_KINDS,
  FIELD_KINDS,
  MAX_CUSTOM_FIELDS,
  STANDARD_DPR_FORMS,
  customFieldProblem,
  dprExtraProblems,
  extraText,
  fieldKey,
  filledCustomValues,
  normaliseCustomField,
  ownFieldKey,
  readCustomValues,
  type CustomFieldDto,
  type FieldKind,
} from '@erp/shared';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

const def = (key: string, label: string, kind: FieldKind, extra: Partial<CustomFieldDto> = {}): CustomFieldDto => ({
  id: key,
  entity: 'VENDOR',
  key,
  label,
  labelHi: null,
  kind,
  required: false,
  unit: null,
  min: null,
  max: null,
  options: [],
  sortOrder: 0,
  archived: false,
  archivedAt: null,
  ...extra,
});

test('each kind parses as the DPR reads it, and says how to fix what it cannot read', () => {
  const defs = [
    def('msmeNo', 'MSME number', 'TEXT'),
    def('turnover', 'Turnover', 'NUMBER', { unit: 'Cr', min: 0 }),
    def('blacklisted', 'Blacklisted', 'YES_NO'),
    def('grade', 'Grade', 'CHOICE', { options: ['A', 'B', 'C'] }),
    def('since', 'Vendor since', 'DATE'),
    def('cutoff', 'Gate closes', 'TIME'),
    def('notes', 'Notes', 'LONG_TEXT'),
  ];
  assert.deepEqual(readCustomValues(defs, { msmeNo: ' UDYAM-OD-19-1 ', turnover: '12.5', blacklisted: 'no', grade: 'b', since: '2024-04-01', cutoff: '18:30', notes: 'x'.repeat(500) }), {
    values: { msmeNo: 'UDYAM-OD-19-1', turnover: 12.5, blacklisted: false, grade: 'B', since: '2024-04-01', cutoff: '18:30', notes: 'x'.repeat(500) },
    problems: [],
  });
  assert.deepEqual(readCustomValues(defs, { turnover: 'twelve', blacklisted: 'maybe', grade: 'Z', since: '01/04/2024', cutoff: '6pm', msmeNo: { a: 1 } }).problems, [
    'MSME number: write it as text',
    'Turnover: enter a number of 0 Cr or more',
    'Blacklisted: choose yes or no',
    'Grade: choose one of A, B, C',
    'Vendor since: give the date as YYYY-MM-DD',
    'Gate closes: give the time as HH:MM, 24-hour',
  ]);
  assert.deepEqual(readCustomValues(defs, { turnover: -1 }).problems, ['Turnover: enter a number of 0 Cr or more']);
});

test('required fields are asked for by name, only when asked to check them', () => {
  const defs = [def('costCentre', 'Cost centre', 'TEXT', { required: true }), def('funding', 'Funding', 'CHOICE', { required: true, options: ['Own', 'Bank'] })];
  assert.deepEqual(readCustomValues(defs, {}).problems, []);
  assert.deepEqual(readCustomValues(defs, {}, { required: true }).problems, ['Fill in Cost centre', 'Choose Funding']);
  assert.deepEqual(readCustomValues(defs, { costCentre: 'CC-12' }, { before: { funding: 'Bank' }, required: true }), { values: { costCentre: 'CC-12', funding: 'Bank' }, problems: [] });
});

test('unknown keys are dropped; what was not sent stays and a blank clears', () => {
  const defs = [def('msmeNo', 'MSME number', 'TEXT'), def('grade', 'Grade', 'CHOICE', { options: ['A', 'B'] })];
  assert.deepEqual(readCustomValues(defs, { stray: 'x', grade: 'A' }, { before: { msmeNo: 'M-1', gone: 'y' } }).values, { msmeNo: 'M-1', grade: 'A' });
  assert.deepEqual(readCustomValues(defs, { msmeNo: '' }, { before: { msmeNo: 'M-1', grade: 'B' } }).values, { grade: 'B' });
  assert.deepEqual(readCustomValues(defs, 'not an object', { before: null }).values, {});
});

test('an archived field keeps what the record holds and takes nothing new', () => {
  const defs = [def('msmeNo', 'MSME number', 'TEXT', { archived: true, required: true }), def('grade', 'Grade', 'CHOICE', { options: ['A', 'B'] })];
  assert.deepEqual(readCustomValues(defs, { msmeNo: 'NEW', grade: 'A' }, { before: { msmeNo: 'OLD' }, required: true }), { values: { grade: 'A', msmeNo: 'OLD' }, problems: [] });
  assert.deepEqual(readCustomValues(defs, { msmeNo: 'NEW' }).values, {});
  assert.deepEqual(
    filledCustomValues(defs, { msmeNo: 'OLD' }).map((f) => [f.field.key, f.value, f.field.archived]),
    [['msmeNo', 'OLD', true]],
  );
});

test('a field is checked before it is saved, in words that say what to fix', () => {
  const others = [{ label: 'MSME number', archived: false }];
  const ok = normaliseCustomField({ label: '  Turnover   band ', kind: 'NUMBER', unit: ' Cr ', min: 0, max: '100' as unknown as number, options: ['x'] });
  assert.deepEqual(ok, { label: 'Turnover band', labelHi: null, kind: 'NUMBER', required: false, unit: 'Cr', min: 0, max: 100, options: [] });
  assert.equal(customFieldProblem(ok, others), null);
  assert.equal(customFieldProblem(normaliseCustomField({ label: '', kind: 'TEXT' }), others), 'Give the field a name of 1 to 60 letters');
  assert.equal(customFieldProblem(normaliseCustomField({ label: 'msme number', kind: 'TEXT' }), others), 'Another field is called msme number; give this one another name');
  assert.equal(customFieldProblem(normaliseCustomField({ label: 'Grade', kind: 'CHOICE', options: ['A', 'a', ' '] }), others), 'Grade: give at least two choices');
  assert.deepEqual(normaliseCustomField({ label: 'Grade', kind: 'CHOICE', options: ['A', 'a', 'B '] }).options, ['A', 'B']);
  assert.equal(customFieldProblem(normaliseCustomField({ label: 'Band', kind: 'NUMBER', min: 5, max: 1 }), others), 'Band: the smallest value is more than the largest');
  assert.equal(customFieldProblem(normaliseCustomField({ label: 'Odd', kind: 'COLOUR' as FieldKind }), others), 'Choose what kind of field it is');
  const full = Array.from({ length: MAX_CUSTOM_FIELDS }, (_, i) => ({ label: `F${i}`, archived: false }));
  assert.equal(customFieldProblem(normaliseCustomField({ label: 'One more', kind: 'TEXT' }), full, { adding: true }), 'Keep to 20 fields; archive one you no longer use first');
  assert.equal(customFieldProblem(normaliseCustomField({ label: 'One more', kind: 'TEXT' }), [...full.slice(1), { label: 'Old', archived: true }], { adding: true }), null);
});

test("a field named like an object's own property reads only what was sent", () => {
  assert.equal(fieldKey('Constructor', []), 'constructor2');
  assert.equal(fieldKey('To string', []), 'toString2');
  const defs = [def('constructor', 'Constructor', 'TEXT'), def('toString', 'To string', 'TEXT', { archived: true })];
  assert.deepEqual(readCustomValues(defs, {}), { values: {}, problems: [] });
  assert.deepEqual(readCustomValues(defs, { constructor: 'C-1' }, { before: {} }), { values: { constructor: 'C-1' }, problems: [] });
  assert.deepEqual(filledCustomValues(defs, {}), []);
});

test('a date is a real day on the calendar', () => {
  const defs = [def('since', 'Vendor since', 'DATE')];
  assert.deepEqual(readCustomValues(defs, { since: '2026-02-31' }).problems, ['Vendor since: give the date as YYYY-MM-DD']);
  assert.deepEqual(readCustomValues(defs, { since: '2028-02-29' }).values, { since: '2028-02-29' });
  assert.deepEqual(readCustomValues(defs, { since: '2027-02-29' }).problems, ['Vendor since: give the date as YYYY-MM-DD']);
});

test('keys come from the name and are never one already taken', () => {
  assert.equal(fieldKey('MSME number', []), 'msmeNumber');
  assert.equal(fieldKey('MSME number', ['msmeNumber']), 'msmeNumber2');
  assert.equal(fieldKey('Issues', []), 'issues');
  assert.equal(fieldKey('2nd contact', []), 'field2ndContact');
});

test('the registry names every entity once, and only the purchase order waits for submit', () => {
  assert.deepEqual([...CUSTOM_FIELD_ENTITIES], ['VENDOR', 'PROJECT', 'PURCHASE_ORDER']);
  assert.deepEqual(CUSTOM_FIELD_ENTITIES.filter((e) => CUSTOM_FIELD_ENTITY_INFO[e].requiredAtSubmit), ['PURCHASE_ORDER']);
});

test("the DPR's own fields read exactly as before the lift", () => {
  assert.equal(DPR_FIELD_KINDS, FIELD_KINDS);
  assert.equal(ownFieldKey('Issues', []), 'issues2');
  assert.equal(ownFieldKey('Rain hours', ['rainHours']), 'rainHours2');
  const road = STANDARD_DPR_FORMS.ROAD;
  assert.deepEqual(dprExtraProblems(road, { day: { rainHours: '3.5', trafficDiversion: 'Yes', stray: 1 }, lines: [] }), { day: { rainHours: 3.5, trafficDiversion: true }, lines: [], problems: [] });
  assert.deepEqual(dprExtraProblems(road, { day: { rainHours: 30 }, lines: [] }).problems, ['Rain hours: enter a number from 0 to 24 h']);
  assert.equal(extraText({ kind: 'DATE', unit: null }, '2026-11-03'), '3 Nov 2026');
  assert.equal(extraText({ kind: 'NUMBER', unit: 'h' }, 2.5), '2.5 h');
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
