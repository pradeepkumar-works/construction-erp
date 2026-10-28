/**
 * Bringing running projects up to their type, and moving types between companies (item 134 part 3). An update plan
 * only adds: a component the project lacks comes with its kind's activities, a sub-component goes under every copy of
 * its component, a kind's new step reaches the components laid out from it (never one made by hand), an activity kept
 * as one line is not split, and the loose activities are matched by name; what the admin leaves out stays out. A
 * project types file reads strictly, refuses what is not one, and its items are new, replace the company's own, are
 * the same, or cannot be imported over something else in use.
 *
 *   node dist/scripts/type-updates-test.js
 */
import assert from 'node:assert/strict';
import {
  BUNDLE_FORMAT,
  BUNDLE_VERSION,
  STANDARD_COMPONENT_KINDS,
  STANDARD_DPR_FORMS,
  STANDARD_PROJECT_TYPES,
  activityItemKey,
  bundleFileName,
  componentItemKey,
  componentKindProblems,
  copiesOf,
  importAction,
  kindPlan,
  looseItemKey,
  normaliseKindDef,
  normaliseTypeDef,
  planIsEmpty,
  planSize,
  projectTypeProblems,
  projectUpdatePlan,
  readBundle,
  rollUp,
  sameDef,
  withoutItems,
  type ComponentKindDef,
  type ProjectTypeDef,
  type UpdateActivity,
  type UpdateElement,
} from '@erp/shared';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

const PIER: ComponentKindDef = {
  code: 'PIER',
  name: 'Pier',
  elementType: 'GENERAL',
  specFields: [],
  steps: [
    { kind: 'plain', name: 'Pile boring', unit: 'Rmt', weightPct: 40 },
    { kind: 'group', name: 'Pier cap', unit: 'Cum', weightPct: 40, subs: [{ name: 'Shuttering', unit: 'Sqm', weightPct: 50 }, { name: 'Concreting', unit: 'Cum', weightPct: 50 }] },
    { kind: 'plain', name: 'Bearings', unit: 'Nos', weightPct: 20 },
  ],
  active: true,
};
const DECK: ComponentKindDef = { code: 'DECK', name: 'Deck', elementType: 'GENERAL', specFields: [], steps: [{ kind: 'plain', name: 'Deck slab', unit: 'Cum', weightPct: 100 }], active: true };
const SLAB: ComponentKindDef = { code: 'SLAB', name: 'Approach slab', elementType: 'GENERAL', specFields: [], steps: [{ kind: 'plain', name: 'Slab casting', unit: 'Cum', weightPct: 100 }], active: true };
const KINDS = [PIER, DECK, SLAB];

const BRIDGE: Pick<ProjectTypeDef, 'breakdown' | 'activities'> = {
  breakdown: [
    { key: '1', parentKey: null, kind: 'PIER', name: 'Pier', count: 2 },
    { key: '1.1', parentKey: '1', kind: 'DECK', name: 'Deck span', count: 1 },
    { key: '2', parentKey: null, kind: 'SLAB', name: 'Approach slab', count: 1 },
  ],
  activities: [
    { name: 'Mobilisation', unit: 'LS', startDay: 0, durationDays: 15 },
    { name: 'Load test', unit: 'LS', startDay: 300, durationDays: 10 },
  ],
};

/** A project laid out from an older bridge: two piers with the first two steps, no deck spans or approach slab. */
function project() {
  const elements: UpdateElement[] = [
    { id: 'p1', parentId: null, name: 'Pier 1', kindCode: 'PIER', elementType: 'GENERAL', specs: null },
    { id: 'p2', parentId: null, name: 'Pier 2', kindCode: 'PIER', elementType: 'GENERAL', specs: null },
    { id: 'h1', parentId: null, name: 'Site office', kindCode: null, elementType: 'GENERAL', specs: null },
  ];
  const activities: UpdateActivity[] = [];
  for (const p of ['p1', 'p2']) {
    activities.push({ id: `${p}-a`, workElementId: p, parentActivityId: null, name: 'Pile boring' });
    activities.push({ id: `${p}-b`, workElementId: p, parentActivityId: null, name: 'Pier cap' });
  }
  // Pier 1's cap is split, with shuttering only; Pier 2's is kept as one line.
  activities.push({ id: 'p1-b1', workElementId: 'p1', parentActivityId: 'p1-b', name: 'Shuttering' });
  activities.push({ id: 'h1-a', workElementId: 'h1', parentActivityId: null, name: 'Office block' });
  activities.push({ id: 'loose-1', workElementId: null, parentActivityId: null, name: 'mobilisation ' });
  return { elements, activities };
}

test('a copy is the name, or the name and a number', () => {
  const els = [{ name: 'Pier 1' }, { name: 'pier  2' }, { name: 'Pier cap' }, { name: 'Pier' }, { name: 'Piers 3' }];
  assert.deepEqual(copiesOf('Pier', els).map((e) => e.name), ['Pier 1', 'pier  2', 'Pier']);
});

test('a project gains the components, steps, sub-components and loose activities it lacks, and nothing else', () => {
  const { elements, activities } = project();
  const plan = projectUpdatePlan(BRIDGE, KINDS, elements, activities);
  // The approach slab is new, with its kind's activity and weight inside it, but no weight of its own.
  const slab = plan.components.find((c) => c.name === 'Approach slab')!;
  assert.equal(slab.parentId, null);
  assert.equal(slab.weightPct, null);
  assert.deepEqual(slab.activities.map((a) => [a.name, a.weightPct]), [['Slab casting', 100]]);
  // A deck span under each pier the project has.
  assert.deepEqual(plan.components.filter((c) => c.name === 'Deck span').map((c) => c.parentName), ['Pier 1', 'Pier 2']);
  // Bearings on both piers; Pier 1's cap gains concreting; Pier 2's cap, one line, is left alone; the site office is the planner's own.
  assert.deepEqual(
    plan.activities.map((a) => [a.elementName, a.name, a.parentActivityId, a.weightPct]),
    [
      ['Pier 1', 'Concreting', 'p1-b', null],
      ['Pier 1', 'Bearings', null, null],
      ['Pier 2', 'Bearings', null, null],
    ],
  );
  // Mobilisation is there (any case, spaces); the load test is not.
  assert.deepEqual(plan.loose, ['Load test']);
  assert.deepEqual(planSize(plan), { components: 3, activities: 3 + 1 + 1 + 2 });
});

test('a new step with sub-activities comes whole, its parts weighted inside it', () => {
  const elements: UpdateElement[] = [{ id: 'p1', parentId: null, name: 'Pier', kindCode: 'PIER', elementType: 'GENERAL', specs: null }];
  const plan = projectUpdatePlan(null, KINDS, elements, [{ id: 'a', workElementId: 'p1', parentActivityId: null, name: 'Pile boring' }]);
  const cap = plan.activities.filter((a) => a.name === 'Pier cap' || a.parentKey);
  assert.deepEqual(cap.map((a) => [a.name, a.parentKey, a.weightPct]), [
    ['Pier cap', null, null],
    ['Shuttering', '2', 50],
    ['Concreting', '2', 50],
  ]);
});

test('a project with everything its type has gets nothing', () => {
  const elements: UpdateElement[] = [{ id: 's', parentId: null, name: 'Approach slab', kindCode: 'SLAB', elementType: 'GENERAL', specs: null }];
  const activities: UpdateActivity[] = [
    { id: 'x', workElementId: 's', parentActivityId: null, name: 'Slab casting' },
    { id: 'm', workElementId: null, parentActivityId: null, name: 'Mobilisation' },
    { id: 'l', workElementId: null, parentActivityId: null, name: 'Load test' },
  ];
  const only = { breakdown: BRIDGE.breakdown.filter((b) => b.key === '2'), activities: BRIDGE.activities };
  assert.ok(planIsEmpty(projectUpdatePlan(only, KINDS, elements, activities)));
});

test('a kind’s update reaches only its own components, and leaves the breakdown and loose activities out', () => {
  const { elements, activities } = project();
  const plan = projectUpdatePlan(BRIDGE, KINDS, elements, activities, { kind: 'PIER' });
  assert.equal(plan.components.length, 0);
  assert.deepEqual(plan.loose, []);
  assert.deepEqual([...new Set(plan.activities.map((a) => a.elementName))], ['Pier 1', 'Pier 2']);
});

test('an archived kind is not laid out, and a component of a kind the company no longer has is left alone', () => {
  const { elements, activities } = project();
  const plan = projectUpdatePlan(BRIDGE, [PIER, DECK, { ...SLAB, active: false }], elements, activities);
  assert.ok(!plan.components.some((c) => c.name === 'Approach slab'));
  assert.equal(projectUpdatePlan(BRIDGE, [DECK, SLAB], elements, activities).activities.length, 0);
});

test('what the admin leaves out stays out, with its sub-component or sub-activities', () => {
  const elements: UpdateElement[] = [{ id: 'p1', parentId: null, name: 'Pier', kindCode: 'PIER', elementType: 'GENERAL', specs: null }];
  const full = projectUpdatePlan({ ...BRIDGE, breakdown: [...BRIDGE.breakdown, { key: '3', parentKey: null, kind: 'PIER', name: 'Abutment', count: 1 }, { key: '3.1', parentKey: '3', kind: 'DECK', name: 'Deck span', count: 1 }] }, KINDS, elements, []);
  const abutment = full.components.find((c) => c.name === 'Abutment')!;
  const cap = full.activities.find((a) => a.name === 'Pier cap')!;
  const plan = withoutItems(full, [componentItemKey(abutment), activityItemKey(cap), looseItemKey('LOAD TEST')]);
  assert.ok(!plan.components.some((c) => c.name === 'Abutment' || c.parentKey === abutment.key));
  assert.ok(!plan.activities.some((a) => a.name === 'Pier cap' || a.parentKey === cap.key));
  assert.ok(plan.activities.some((a) => a.name === 'Bearings'));
  assert.deepEqual(plan.loose, ['Mobilisation']);
});

test('what joins a project with set weights does not move its progress', () => {
  const { elements, activities } = project();
  const plan = projectUpdatePlan(BRIDGE, KINDS, elements, activities);
  // Piers at 50% each, their steps weighted; half the work on Pier 1 done.
  const els = elements.filter((e) => e.id !== 'h1').map((e) => ({ id: e.id, parentId: e.parentId, weightPct: 50 }));
  const acts = activities
    .filter((a) => a.workElementId === 'p1' || a.workElementId === 'p2')
    .map((a) => ({ id: a.id, workElementId: a.workElementId, parentActivityId: a.parentActivityId, weightPct: a.parentActivityId ? 100 : 50, plannedQty: 10, executedQty: a.id === 'p1-a' ? 10 : 0, value: 10 }));
  const now = rollUp(els, acts).projectPct;
  const after = [...els, ...plan.components.map((c) => ({ id: `n:${c.key}`, parentId: c.parentId, weightPct: c.weightPct }))];
  const afterActs = [...acts, ...plan.activities.map((a) => ({ id: `n:${a.key}:${a.elementId}`, workElementId: a.elementId, parentActivityId: a.parentActivityId, weightPct: a.weightPct, plannedQty: 0, executedQty: 0, value: 0 }))];
  assert.equal(rollUp(after, afterActs).projectPct, now);
});

test('a new component lays out its kind’s plan as New project would', () => {
  const plan = projectUpdatePlan(BRIDGE, KINDS, [], []);
  assert.deepEqual(plan.components.map((c) => c.name), ['Pier 1', 'Deck span', 'Pier 2', 'Deck span', 'Approach slab']);
  assert.deepEqual(plan.components[0].activities, kindPlan(PIER, null));
  assert.equal(plan.components[1].parentKey, plan.components[0].key);
});

// ---------- files ----------

const file = (extra: Record<string, unknown> = {}) => ({
  format: BUNDLE_FORMAT,
  version: BUNDLE_VERSION,
  exportedAt: '2027-03-01T10:00:00.000Z',
  from: 'Sample Infra',
  types: [{ ...STANDARD_PROJECT_TYPES[0], code: 'culvert', name: 'Culvert works', secret: 'dropped', dprForm: STANDARD_DPR_FORMS.ROAD }],
  kinds: [{ ...PIER, rogue: true }],
  ...extra,
});

test('a file that is not a project types file, or from a newer Nirmaan, is refused in words', () => {
  assert.match(readBundle({ hello: 1 }).problem!, /not a project types file/);
  assert.match(readBundle(file({ version: BUNDLE_VERSION + 1 })).problem!, /newer Nirmaan/);
  assert.match(readBundle(file({ types: [], kinds: [] })).problem!, /no project types or component kinds/);
});

test('a file reads strictly: codes upper-cased, unknown fields and values dropped, checks still apply', () => {
  const { bundle } = readBundle(file());
  const t = bundle!.types[0];
  assert.equal(t.code, 'CULVERT');
  assert.ok(!('secret' in t));
  assert.ok(!('rogue' in bundle!.kinds[0]));
  assert.deepEqual(projectTypeProblems(t, STANDARD_COMPONENT_KINDS), []);
  assert.deepEqual(componentKindProblems(bundle!.kinds[0]), []);
  const bad = normaliseTypeDef({ code: 'X', baseType: 'PLANT', locations: ['MOON', 'FLOOR'], breakdown: [{ key: '1', kind: 'pier', name: 'Pier', count: 'two' }] });
  assert.deepEqual(bad.locations, ['FLOOR']);
  assert.equal(bad.breakdown[0].kind, 'PIER');
  assert.ok(projectTypeProblems(bad, KINDS).length >= 3);
  assert.ok(componentKindProblems(normaliseKindDef({ code: 'K', steps: [{ kind: 'lifts', name: 'Shaft' }] })).length > 0);
});

test('an exported type reads back the same', () => {
  const type = { ...STANDARD_PROJECT_TYPES[2], dprForm: null };
  assert.ok(sameDef(normaliseTypeDef(JSON.parse(JSON.stringify(type))), normaliseTypeDef(type)));
  assert.ok(sameDef(normaliseKindDef(JSON.parse(JSON.stringify(PIER))), normaliseKindDef(PIER)));
  assert.ok(!sameDef(normaliseKindDef(PIER), normaliseKindDef({ ...PIER, name: 'Pier, river' })));
});

test('each item is new, replaces the company’s own, is the same, or cannot go over something else in use', () => {
  const def = normaliseKindDef(PIER);
  assert.equal(importAction({ code: 'PIER', base: 'GENERAL' }, undefined, def, 'kind').action, 'CREATE');
  assert.equal(importAction({ code: 'PIER', base: 'GENERAL' }, { code: 'PIER', base: 'GENERAL', used: 4, def }, def, 'kind').action, 'SAME');
  const replace = importAction({ code: 'PIER', base: 'GENERAL' }, { code: 'PIER', base: 'GENERAL', used: 4, def: { ...def, name: 'Old' } }, def, 'kind');
  assert.equal(replace.action, 'REPLACE');
  assert.match(replace.note!, /new version/);
  const refused = importAction({ code: 'ROAD', base: 'BUILDING' }, { code: 'ROAD', base: 'ROAD', used: 2, def: {} }, { x: 1 }, 'type');
  assert.equal(refused.action, 'REFUSED');
  assert.match(refused.note!, /2 projects use your ROAD.*change the code/);
  assert.equal(importAction({ code: 'ROAD', base: 'BUILDING' }, { code: 'ROAD', base: 'ROAD', used: 0, def: {} }, { x: 1 }, 'type').action, 'REPLACE');
});

test('an export is named after what it holds', () => {
  assert.equal(bundleFileName('Bridge (river)', '2027-03-01'), 'bridge-river-2027-03-01.json');
  assert.equal(bundleFileName('', '2027-03-01'), 'project-types-2027-03-01.json');
});

// ---------------------------------------------------------------------------------------------------------------------

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
