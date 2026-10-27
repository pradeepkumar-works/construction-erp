/**
 * Tests for linking activities to BOQ items and spreading undated activities (finding 11 of the October review).
 * Both are pure, so they need no database:
 *
 *   node dist/scripts/boq-links-test.js
 */
import assert from 'node:assert/strict';
import { DEFAULT_ACTIVITY_TEMPLATES, boqLinkSuggestions, nameMatch, spreadUndated, type LinkActivity, type LinkBoqItem, type PlanActivity } from '@erp/shared';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

const activity = (id: string, name: string, extra: Partial<LinkActivity> = {}): LinkActivity => ({ id, name, unit: 'Cum', plannedQty: '0', boqItemId: null, ...extra });
const item = (id: string, itemNo: string, description: string, extra: Partial<LinkBoqItem> = {}): LinkBoqItem => ({ id, itemNo, description, section: null, unit: 'Cum', quantity: '1000', linked: 0, ...extra });
const plan = (id: string, name: string, extra: Partial<PlanActivity> = {}): PlanActivity => ({ id, name, unit: 'Cum', plannedQty: '0', plannedStart: null, plannedEnd: null, boqItemId: null, sortOrder: Number(id), ...extra });

test('a section is matched to the activity of the same work, whatever it is called', () => {
  assert.equal(nameMatch('Earthwork', 'Earthwork embankment') >= 0.6, true);
  assert.equal(nameMatch('EARTHWORK WORKS', 'Earthwork'), 1);
  assert.equal(nameMatch('Site works', 'Painting') < 0.6, true);
});

test('each activity is offered one item, by its section where there is one, and each item only once', () => {
  const activities = [activity('a1', 'Earthwork embankment'), activity('a2', 'BC paving'), activity('a3', 'Mobilisation and site clearance')];
  const items = [
    item('i1', '1.01', 'Earthwork in embankment with borrowed earth', { section: 'Earthwork', quantity: '18500' }),
    item('i2', '1.02', 'Earthwork in cutting', { section: 'Earthwork', quantity: '4000' }),
    item('i3', '4.01', 'Bituminous concrete 40 mm', { section: 'Bituminous works', quantity: '5200' }),
    item('i4', '0.01', 'Clearing and grubbing of the site', { section: 'Site works', quantity: '42000' }),
  ];
  const out = boqLinkSuggestions(activities, items);
  const by = new Map(out.map((s) => [s.activityId, s]));
  // The section's largest item stands for the section.
  assert.deepEqual([by.get('a1')!.boqItemId, by.get('a1')!.reason], ['i1', 'section']);
  assert.deepEqual([by.get('a3')!.boqItemId, by.get('a3')!.reason], ['i4', 'section']);
  // "BC paving" and "Bituminous concrete" share no word: nothing is offered rather than the wrong item.
  assert.equal(by.has('a2'), false);
  assert.equal(new Set(out.map((s) => s.boqItemId)).size, out.length);
  // The item's unit and quantity come with the offer, for an activity with none.
  assert.deepEqual([by.get('a1')!.unit, by.get('a1')!.quantity], ['Cum', '18500']);
  // Spelt out, the bituminous section is found.
  assert.equal(boqLinkSuggestions([activity('a2', 'Bituminous concrete paving')], items)[0].boqItemId, 'i3');
  // A section no activity is named after offers by description instead.
  const byWords = boqLinkSuggestions([activity('a4', 'Clearing and grubbing')], items);
  assert.deepEqual([byWords[0].boqItemId, byWords[0].reason], ['i4', 'description']);
});

test('an activity or an item already linked is not offered again', () => {
  const items = [item('i1', '1.01', 'Earthwork in embankment', { section: 'Earthwork' })];
  assert.deepEqual(boqLinkSuggestions([activity('a1', 'Earthwork', { boqItemId: 'i9' })], items), []);
  assert.deepEqual(boqLinkSuggestions([activity('a1', 'Earthwork')], [{ ...items[0], linked: 1 }]), []);
});

test('nothing unlike the activity is offered', () => {
  assert.deepEqual(boqLinkSuggestions([activity('a1', 'Painting')], [item('i1', '1.01', 'Earthwork in embankment', { section: 'Earthwork' })]), []);
});

test('dates arriving spread the undated activities over the period, the template ones in their places', () => {
  const road = DEFAULT_ACTIVITY_TEMPLATES.ROAD;
  const activities = [plan('1', 'Mobilisation and site clearance'), plan('2', 'BC paving'), plan('3', 'Shifting of the water main')];
  const out = spreadUndated(activities, road, '2026-11-01', '2027-10-31');
  assert.equal(out.length, 3);
  const by = new Map(out.map((d) => [d.id, d]));
  assert.equal(by.get('1')!.plannedStart, '2026-11-01');
  // BC paving starts late in the road template, so late in the project.
  assert.ok(by.get('2')!.plannedStart > '2027-06-01');
  // An activity of its own gets a share of the period, and the last one ends with the project.
  assert.deepEqual([by.get('3')!.plannedStart, by.get('3')!.plannedEnd], ['2026-11-01', '2027-10-31']);
  for (const d of out) assert.ok(d.plannedEnd >= d.plannedStart && d.plannedStart >= '2026-11-01' && d.plannedEnd <= '2027-10-31');
});

test('activities that already have dates are left alone, and no start date spreads nothing', () => {
  const activities = [plan('1', 'BC paving', { plannedStart: '2027-01-01', plannedEnd: '2027-02-01' }), plan('2', 'Earthwork embankment')];
  const out = spreadUndated(activities, DEFAULT_ACTIVITY_TEMPLATES.ROAD, '2026-11-01', '2027-10-31');
  assert.deepEqual(out.map((d) => d.id), ['2']);
  assert.deepEqual(spreadUndated([], DEFAULT_ACTIVITY_TEMPLATES.ROAD, '2026-11-01', null), []);
});

test('a project with a start but no completion date still spreads its activities', () => {
  const out = spreadUndated([plan('1', 'First'), plan('2', 'Second')], [], '2026-11-01', null);
  assert.equal(out.length, 2);
  assert.equal(out[0].plannedStart, '2026-11-01');
  assert.ok(out[1].plannedStart > out[0].plannedStart);
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
console.log(`BOQ links and spreading: ${tests.length - failed} of ${tests.length} tests pass`);
if (failed) process.exit(1);
