/**
 * The DPR form of each project type. The standard forms are sound and leave a report as it was; a
 * stored definition reads whole whatever it holds; the checks name what an admin must fix; a field already used keeps
 * its kind; the values of the company's own fields are read by kind and range; the required fields and photos are
 * asked for in words; and Ask Nirmaan's names find their fields.
 *
 *   node dist/scripts/dpr-form-test.js
 */
import assert from 'node:assert/strict';
import {
  DPR_BUILT_IN_KEYS,
  MAX_OWN_FIELDS,
  STANDARD_DPR_FORM,
  STANDARD_DPR_FORMS,
  STANDARD_PROJECT_TYPES,
  activitiesFor,
  componentChoices,
  dprExtraProblems,
  dprFormChangeProblems,
  dprFormProblems,
  dprRequiredProblems,
  dprShows,
  extraByLabel,
  extraText,
  filledExtra,
  linePick,
  normaliseDprForm,
  ownFieldKey,
  ownFieldsOf,
  readExtra,
  standardDprForm,
  subComponentChoices,
  type DprFilled,
  type DprFormDef,
  type DprOwnField,
} from '@erp/shared';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

const field = (key: string, label: string, kind: DprOwnField['kind'], more: Partial<DprOwnField> = {}): DprOwnField => ({
  key,
  label,
  labelHi: null,
  kind,
  scope: 'DAY',
  required: false,
  unit: null,
  min: null,
  max: null,
  options: [],
  ...more,
});
const withFields = (own: DprOwnField[], more: Partial<DprFormDef> = {}): DprFormDef => normaliseDprForm({ ...STANDARD_DPR_FORM, own, ...more });
const empty: DprFilled = { weather: null, siteCondition: null, lines: 0, manpower: 0, machinery: 0, materialReceived: null, testsConducted: null, safetyObservations: null, issues: null, nextDayPlan: null, photos: 0 };

test('every standard type has a sound form, none of it required, every built-in field shown', () => {
  for (const t of STANDARD_PROJECT_TYPES) {
    const def = normaliseDprForm(standardDprForm(t.code, t.baseType));
    assert.deepEqual(dprFormProblems(def), [], t.code);
    assert.deepEqual(dprFormProblems(def, { progressFromDpr: true }), [], t.code);
    assert.ok(def.fields.every((f) => f.show && !f.required), t.code);
    assert.ok(def.own.every((f) => !f.required && f.labelHi), `${t.code}: every own field has its Hindi`);
    assert.equal(def.minPhotos, 0);
    // A report with nothing but its work passes, as before the form could change.
    assert.deepEqual(dprRequiredProblems(def, empty), []);
  }
  assert.deepEqual(Object.keys(STANDARD_DPR_FORMS).sort(), STANDARD_PROJECT_TYPES.map((t) => t.code).sort());
  assert.deepEqual(STANDARD_DPR_FORMS.GENERAL, STANDARD_DPR_FORM);
});

test("a type's standard form is its own, else its base's standard type's, else the plain one", () => {
  assert.equal(standardDprForm('ROAD', 'ROAD'), STANDARD_DPR_FORMS.ROAD);
  // A bridge of the company's own built on a road starts with the road's form.
  assert.equal(standardDprForm('BRIDGE', 'ROAD'), STANDARD_DPR_FORMS.ROAD);
  assert.equal(standardDprForm('BRIDGE', null), STANDARD_DPR_FORM);
  assert.equal(standardDprForm(null, 'STORE'), STANDARD_DPR_FORM);
});

test('a stored definition reads whole: missing fields added, issues always shown, hidden fields not required', () => {
  const def = normaliseDprForm({
    fields: [
      { key: 'issues', show: false, required: true },
      { key: 'weather', show: false, required: true, label: '  ' },
      { key: 'nonsense', show: true },
      { key: 'weather', show: true },
    ],
    minPhotos: 40,
    lines: { picker: 'ODD', parts: ['crew', 'photo', 'teleport'], crewCategories: ['Mason', 'mason', ' Helper '] },
    own: [{ key: 'rainHours', label: 'Rain hours', kind: 'NUMBER', unit: 'h', min: '0', max: 24, options: ['x'] }, { key: 'site', kind: 'MAGIC', options: ['a'] }, 'junk'],
  });
  assert.equal(def.fields.length, DPR_BUILT_IN_KEYS.length);
  assert.deepEqual(def.fields.slice(0, 2), [
    { key: 'issues', show: true, required: true, label: null },
    { key: 'weather', show: false, required: false, label: null },
  ]);
  assert.deepEqual(def.fields.slice(2).map((f) => f.key), DPR_BUILT_IN_KEYS.filter((k) => k !== 'issues' && k !== 'weather'));
  assert.equal(def.minPhotos, 10);
  assert.deepEqual(def.lines, { picker: 'CASCADE', parts: ['crew', 'photo'], crewCategories: ['Mason', 'Helper'], machineNames: [] });
  assert.deepEqual(def.own[0], field('rainHours', 'Rain hours', 'NUMBER', { unit: 'h', min: 0, max: 24 }));
  assert.deepEqual(def.own[1], field('site', 'site', 'TEXT'));
  // Hiding photos asks for none.
  assert.equal(normaliseDprForm({ fields: [{ key: 'photos', show: false }], minPhotos: 3 }).minPhotos, 0);
  // Nothing at all is the standard form.
  assert.deepEqual(normaliseDprForm(null), STANDARD_DPR_FORM);
  assert.deepEqual(normaliseDprForm(STANDARD_DPR_FORMS.ROAD), STANDARD_DPR_FORMS.ROAD);
});

test('the checks say what to fix', () => {
  const noLines = normaliseDprForm({ fields: [{ key: 'lines', show: false }] });
  assert.deepEqual(dprFormProblems(noLines), []);
  assert.deepEqual(dprFormProblems(noLines, { progressFromDpr: true }), ['Work lines stay on: the company records progress only from the DPR']);
  assert.equal(dprShows(noLines, 'lines', { progressFromDpr: true }), true);
  const bad = withFields([
    field('rain', 'Rain', 'NUMBER', { min: 5, max: 1 }),
    field('rain', 'Rain again', 'TEXT'),
    field('issues', 'Problems', 'TEXT'),
    field('Bad key', 'Odd', 'TEXT'),
    field('shift', 'Shift', 'CHOICE', { options: ['Day'] }),
    field('rain2', 'rain', 'TEXT'),
  ]);
  assert.deepEqual(dprFormProblems(bad), [
    'Rain: the smallest value is more than the largest',
    'Rain again: another field has the key rain',
    'Problems: issues is a built-in field\'s key; choose another',
    'Odd: its key must be letters and digits, starting with a small letter',
    'Shift: give at least two choices',
    'rain is on the form twice; give one another name',
  ]);
  // The same name once for the day and once for each line is two fields.
  assert.deepEqual(dprFormProblems(withFields([field('a', 'Depth', 'NUMBER'), field('b', 'Depth', 'NUMBER', { scope: 'LINE' })])), []);
  const many = withFields(Array.from({ length: MAX_OWN_FIELDS + 1 }, (_, i) => field(`f${i}`, `Field ${i}`, 'TEXT')));
  assert.deepEqual(dprFormProblems(many), [`A form takes up to ${MAX_OWN_FIELDS} fields of the company's own`]);
});

test('a field already used keeps its kind and where it is asked', () => {
  const before = withFields([field('rainHours', 'Rain hours', 'NUMBER')]);
  assert.deepEqual(dprFormChangeProblems(before, withFields([field('rainHours', 'Hours of rain', 'NUMBER', { required: true, max: 24 })])), []);
  assert.deepEqual(dprFormChangeProblems(before, withFields([])), []);
  assert.deepEqual(dprFormChangeProblems(before, withFields([field('rainHours', 'Rain hours', 'TEXT')])), ['Rain hours was number; add a new field rather than change its kind']);
  assert.deepEqual(dprFormChangeProblems(before, withFields([field('rainHours', 'Rain hours', 'NUMBER', { scope: 'LINE' })])), ['Rain hours was asked for the day; add a new field rather than move it']);
});

test('a new field takes a key from its name', () => {
  assert.equal(ownFieldKey('Rain hours', []), 'rainHours');
  assert.equal(ownFieldKey('Rain hours', ['rainHours']), 'rainHours2');
  assert.equal(ownFieldKey('Rain hours', ['rainHours', 'rainHours2']), 'rainHours3');
  assert.equal(ownFieldKey('3 shifts?', []), 'field3Shifts');
  assert.equal(ownFieldKey('बारिश', []), 'field');
  assert.equal(ownFieldKey('Issues', []), 'issues2');
});

test('values are read by kind and range; blank and unknown ones are dropped', () => {
  const fields = [
    field('rain', 'Rain hours', 'NUMBER', { unit: 'h', min: 0, max: 24 }),
    field('diversion', 'Traffic diversion', 'YES_NO'),
    field('shift', 'Shift', 'CHOICE', { options: ['Day', 'Night'] }),
    field('poured', 'Poured on', 'DATE'),
    field('start', 'Start time', 'TIME'),
    field('note', 'Note', 'TEXT'),
  ];
  assert.deepEqual(readExtra(fields, { rain: '4.25', diversion: 'yes', shift: 'night', poured: '2026-10-28', start: '07:30', note: ' ok ', stray: 1 }), {
    values: { rain: 4.25, diversion: true, shift: 'Night', poured: '2026-10-28', start: '07:30', note: 'ok' },
    problems: [],
  });
  assert.deepEqual(readExtra(fields, { rain: '', diversion: null, note: '   ' }), { values: {}, problems: [] });
  assert.deepEqual(readExtra(fields, { rain: 30, diversion: 'maybe', shift: 'Evening', poured: '28/10/2026', start: '7.30', note: { a: 1 } }).problems, [
    'Rain hours: enter a number from 0 to 24 h',
    'Traffic diversion: choose yes or no',
    'Shift: choose one of Day, Night',
    'Poured on: give the date as YYYY-MM-DD',
    'Start time: give the time as HH:MM, 24-hour',
    'Note: write it as text',
  ]);
  assert.deepEqual(readExtra([field('n', 'Note', 'TEXT')], { n: 'x'.repeat(201) }).problems, ['Note: keep it to 200 letters']);
  assert.deepEqual(readExtra([field('n', 'Note', 'LONG_TEXT')], { n: 'x'.repeat(201) }).problems, []);
});

test('required own fields are asked for only when the report goes for approval, line by line', () => {
  const def = withFields([
    field('rain', 'Rain hours', 'NUMBER', { required: true }),
    field('open', 'Trench left open', 'NUMBER', { scope: 'LINE', required: true }),
    field('ok', 'Barricaded', 'YES_NO', { scope: 'LINE', required: true }),
  ]);
  assert.deepEqual(dprExtraProblems(def, { day: {}, lines: [{}, {}] }).problems, []);
  const sent = dprExtraProblems(def, { day: {}, lines: [{ open: 4, ok: false }, { open: 'x' }] }, { required: true });
  assert.deepEqual(sent.problems, ['Fill in Rain hours', 'Line 2: Trench left open: enter a number', 'Line 2: Choose Barricaded']);
  assert.deepEqual(sent.lines[0], { open: 4, ok: false });
  assert.deepEqual(ownFieldsOf(def, 'LINE').map((f) => f.key), ['open', 'ok']);
});

test('required built-in fields and photos are asked for in words, under the name the form gives them', () => {
  const def = normaliseDprForm({
    fields: [
      { key: 'weather', show: true, required: true },
      { key: 'nextDayPlan', show: true, required: true, label: 'Plan for tomorrow' },
      { key: 'manpower', show: true, required: true },
      { key: 'safetyObservations', show: false, required: true },
    ],
    minPhotos: 2,
  });
  assert.deepEqual(dprRequiredProblems(def, empty), ['Choose the weather', 'Fill in Plan for tomorrow', 'Add the manpower on site today', 'Add at least 2 site photos']);
  assert.deepEqual(dprRequiredProblems(def, { ...empty, weather: 'CLEAR', nextDayPlan: 'Lay GSB', manpower: 12, photos: 2 }), []);
  assert.deepEqual(dprRequiredProblems(normaliseDprForm({ minPhotos: 1 }), empty), ['Add a site photo']);
});

test('values read back in words, and Ask Nirmaan finds fields by their English or Hindi names', () => {
  const rain = field('rain', 'Rain hours', 'NUMBER', { unit: 'h', labelHi: 'बारिश के घंटे' });
  const diversion = field('diversion', 'Traffic diversion', 'YES_NO');
  const poured = field('poured', 'Poured on', 'DATE');
  assert.equal(extraText(rain, 2.5), '2.5 h');
  assert.equal(extraText(diversion, false), 'No');
  assert.equal(extraText(poured, '2026-11-03'), '3 Nov 2026');
  assert.equal(extraText(rain, undefined), '');
  assert.deepEqual(filledExtra([rain, diversion, poured], { diversion: true, rain: 0 }).map((x) => x.text), ['0 h', 'Yes']);
  assert.deepEqual(extraByLabel([rain, diversion], { 'rain HOURS': 3, 'traffic diversion': '', 'Crane hours': 2 }), { rain: 3 });
  assert.deepEqual(extraByLabel([rain, diversion], { 'बारिश के घंटे': 1, diversion: true }), { rain: 1, diversion: true });
});

test('the line picker narrows component, then sub-component, then activity', () => {
  const acts = [
    { id: '1', componentCode: '2', componentName: 'Pier 2', subComponentCode: '2.1', subComponentName: 'Pile cap' },
    { id: '2', componentCode: '2', componentName: 'Pier 2', subComponentCode: null, subComponentName: null },
    { id: '3', componentCode: '10', componentName: 'Deck', subComponentCode: null, subComponentName: null },
    { id: '4', componentCode: null, componentName: null, subComponentCode: null, subComponentName: null },
  ];
  assert.deepEqual(componentChoices(acts).map((c) => [c.key, c.count]), [['2', 2], ['10', 1], ['~', 1]]);
  assert.deepEqual(subComponentChoices(acts, '2').map((c) => c.key), ['2.1', '=']);
  assert.deepEqual(subComponentChoices(acts, '10'), []);
  assert.deepEqual(activitiesFor(acts, '2', '=').map((a) => a.id), ['2']);
  assert.deepEqual(activitiesFor(acts, '~', null).map((a) => a.id), ['4']);
  assert.deepEqual(linePick({ component: '10', sub: null }, acts[0]), { component: '2', sub: '2.1' });
  assert.deepEqual(componentChoices([acts[3]]), []);
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
