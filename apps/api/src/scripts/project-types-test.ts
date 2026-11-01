/**
 * Project types and component kinds. The built-in kinds as data lay out what the code did, a company's own
 * kind (its RCC parts, a group of sub-activities, lifts of its height) lays out what it says, the checks name what an
 * admin must fix, the standard types are sound, a company's rows replace the standard ones by code, and a new project's
 * starting breakdown gives each copy and its sub-components.
 *
 *   node dist/scripts/project-types-test.js
 */
import assert from 'node:assert/strict';
import {
  STANDARD_COMPONENT_KINDS,
  STANDARD_PROJECT_TYPES,
  STANDARD_TYPE_FOR,
  componentKindProblems,
  defaultPicks,
  elementPlan,
  kindFrom,
  kindPlan,
  layOutBreakdown,
  overlay,
  projectFeatures,
  projectTypeProblems,
  sectorKinds,
  sectorStepOf,
  typeCodeOf,
  WORK_ELEMENT_TYPES,
  type ComponentKindDef,
  type ProjectTypeDef,
} from '@erp/shared';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);
const sumTop = (lines: { parentKey: string | null; weightPct: number }[]) => lines.filter((l) => !l.parentKey).reduce((t, l) => t + l.weightPct, 0);
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 0.01, `${a} is not ${b}`);

// Component kinds

test('every built-in kind as data lays out the same activities as elementPlan, and passes its own checks', () => {
  assert.equal(STANDARD_COMPONENT_KINDS.length, WORK_ELEMENT_TYPES.length);
  const specs = { stagingM: 16, liftM: 3, depthM: 14.5, wallHeightM: 5.2, floors: 4, lengthM: 1234.5, connections: 800 };
  for (const k of STANDARD_COMPONENT_KINDS) {
    assert.deepEqual(kindPlan(k, specs), elementPlan(k.elementType, specs), k.code);
    assert.deepEqual(componentKindProblems(k), [], k.code);
  }
});

test("a company's kind: its own RCC parts, a group with sub-activities, lifts of its own height", () => {
  const kind: ComponentKindDef = {
    code: 'OHT_4M',
    name: 'Overhead tank, 4 m lifts',
    elementType: 'OHT',
    specFields: [
      { key: 'stagingM', label: 'Staging height', unit: 'm' },
      { key: 'liftM', label: 'Lift height', unit: 'm', default: 4 },
    ],
    steps: [
      { kind: 'plain', name: 'Excavation', unit: 'Cum', weightPct: 10 },
      { kind: 'lifts', name: 'Staging', weightPct: 50, over: 'stagingM', parts: [{ name: 'Steel', unit: 'MT', weightPct: 40 }, { name: 'Concrete', unit: 'Cum', weightPct: 60 }] },
      { kind: 'group', name: 'Pipes and valves', unit: 'LS', weightPct: 30, subs: [{ name: 'Inlet and outlet', unit: 'Rmt', weightPct: 70, qtyFrom: 'stagingM' }, { name: 'Valves', unit: 'Nos', weightPct: 30 }] },
      { kind: 'rcc', name: 'Top dome', weightPct: 10 },
    ],
    active: true,
  };
  assert.deepEqual(componentKindProblems(kind), []);
  const plan = kindPlan(kind, { stagingM: 16 });
  near(sumTop(plan), 100);
  // 16 m at the 4 m default: four lifts, each split into the company's two parts.
  const lifts = plan.filter((l) => !l.parentKey && l.name.startsWith('Staging'));
  assert.deepEqual(lifts.map((l) => l.name), ['Staging lift 1', 'Staging lift 2', 'Staging lift 3', 'Staging lift 4']);
  assert.deepEqual(plan.filter((l) => l.parentKey === lifts[0].key).map((l) => [l.name, l.unit, l.weightPct]), [['Staging lift 1: steel', 'MT', 40], ['Staging lift 1: concrete', 'Cum', 60]]);
  const group = plan.find((l) => l.name === 'Pipes and valves')!;
  assert.deepEqual(plan.filter((l) => l.parentKey === group.key).map((l) => [l.name, l.qty]), [['Inlet and outlet', 16], ['Valves', null]]);
  // An RCC step with no parts of its own takes the standard three.
  const dome = plan.find((l) => l.name === 'Top dome')!;
  assert.equal(plan.filter((l) => l.parentKey === dome.key).length, 3);
});

test('the checks name what to fix: weights, parts, a spec a step reads, a bad code', () => {
  const base = kindFrom('PIER', 'Bridge pier', 'GENERAL');
  assert.deepEqual(componentKindProblems(base), []);
  const bad: ComponentKindDef = {
    ...base,
    code: 'pier',
    specFields: [{ key: 'heightM', label: 'Height', unit: 'm' }],
    steps: [
      { kind: 'plain', name: 'Pile', unit: 'Nos', weightPct: 30, qtyFrom: 'piles' },
      { kind: 'lifts', name: 'Pier shaft', weightPct: 50, over: 'heightM', parts: [{ name: 'Steel', unit: 'MT', weightPct: 50 }] },
      { kind: 'group', name: 'Bearings', unit: 'Nos', weightPct: 10, subs: [] },
    ],
  };
  const p = componentKindProblems(bad).join(' | ');
  assert.match(p, /The code is 2 to 40 capital letters/);
  assert.match(p, /Pile: its quantity comes from piles, which is not a spec/);
  assert.match(p, /Pier shaft: its parts add up to 50%, not 100%/);
  assert.match(p, /Bearings: add its sub-activities/);
  assert.match(p, /The steps add up to 90%, not 100%/);
});

// Project types

test('the six standard types are sound against the built-in kinds', () => {
  assert.deepEqual(STANDARD_PROJECT_TYPES.map((t) => t.code), ['ROAD', 'BUILDING', 'WATER_SUPPLY', 'TRANSMISSION_MAIN', 'SEWERAGE', 'GENERAL']);
  for (const t of STANDARD_PROJECT_TYPES) assert.deepEqual(projectTypeProblems(t, STANDARD_COMPONENT_KINDS), [], t.code);
  // Every built-in kind of work has its standard type, so a project made before project types existed finds one.
  for (const code of Object.values(STANDARD_TYPE_FOR)) if (code) assert.ok(STANDARD_PROJECT_TYPES.some((t) => t.code === code), code);
});

test("a type's checks: kinds it names, weights per level, a pipe network only on water or sewerage", () => {
  const t: ProjectTypeDef = {
    ...STANDARD_PROJECT_TYPES.find((x) => x.code === 'ROAD')!,
    code: 'BRIDGE',
    name: 'Bridge',
    pipeNetwork: true,
    kinds: ['PIER'],
    breakdown: [
      { key: '1', parentKey: null, kind: 'ROAD_STRETCH', name: 'Approach', count: 2, weightPct: 20 },
      { key: '2', parentKey: null, kind: 'GENERAL', name: 'Main span', count: 1, weightPct: 50 },
      { key: '2.1', parentKey: '9', kind: 'GENERAL', name: 'Deck', count: 1 },
    ],
  };
  const p = projectTypeProblems(t, STANDARD_COMPONENT_KINDS).join(' | ');
  assert.match(p, /Only a water supply or sewerage type has a pipe network/);
  assert.match(p, /Component kind PIER is not in the company's library/);
  assert.match(p, /Deck: its component is not in the breakdown/);
  // Two approaches at 20% each and the span at 50%: 90%.
  assert.match(p, /The components' weights add up to 90%, not 100%/);
});

test("a company's rows replace the standard ones by code, and add their own after them", () => {
  const std = [{ code: 'A', name: 'a' }, { code: 'B', name: 'b' }];
  const list = overlay(std, [{ code: 'B', name: 'b, ours' }, { code: 'C', name: 'c' }]);
  assert.deepEqual(list.map((x) => [x.code, x.name, x.standard, x.edited]), [['A', 'a', true, false], ['B', 'b, ours', true, true], ['C', 'c', false, true]]);
});

test("a project's type: its own code, else its kind's standard type; none for a store or a plant", () => {
  assert.equal(typeCodeOf({ type: 'ROAD', typeCode: 'BRIDGE' }), 'BRIDGE');
  assert.equal(typeCodeOf({ type: 'WATER_SUPPLY', typeCode: null }), 'WATER_SUPPLY');
  assert.equal(typeCodeOf({ type: 'OTHER' }), 'GENERAL');
  assert.equal(typeCodeOf({ type: 'STORE' }), null);
});

test('places and the pipe network come from the type, else the built-in kind as before', () => {
  assert.deepEqual(projectFeatures('WATER_SUPPLY', null), { locations: ['CHAINAGE', 'VILLAGE'], pipeNetwork: true });
  assert.deepEqual(projectFeatures('ROAD', null), { locations: ['CHAINAGE'], pipeNetwork: false });
  assert.deepEqual(projectFeatures('OTHER', { locations: ['CHAINAGE'], pipeNetwork: false }), { locations: ['CHAINAGE'], pipeNetwork: false });
  // A store keeps its kind's answer whatever is passed.
  assert.deepEqual(projectFeatures('STORE', { locations: ['FLOOR'], pipeNetwork: true }), { locations: [], pipeNetwork: false });
  // The sector view: by kind as before, by the type's places when the project has them.
  assert.deepEqual(sectorKinds('BUILDING'), { chainage: false, floor: true, village: false });
  assert.equal(sectorStepOf('WATER_SUPPLY'), 'villages');
  assert.equal(sectorStepOf({ type: 'WATER_SUPPLY', locations: ['CHAINAGE'] }), 'chainage');
  assert.equal(sectorStepOf({ type: 'OTHER', locations: [] }), null);
});

test("a new project's breakdown: each copy numbered, its sub-components under every copy, a missing kind skipped", () => {
  const water = STANDARD_PROJECT_TYPES.find((t) => t.code === 'WATER_SUPPLY')!;
  const picks = defaultPicks(water);
  assert.deepEqual(picks.find((p) => p.key === '7'), { key: '7', count: 2 });
  const laid = layOutBreakdown(water, STANDARD_COMPONENT_KINDS, [{ key: '7', count: 3 }, { key: '4', count: 1 }]);
  assert.deepEqual(laid.map((c) => [c.key, c.parentKey, c.name]), [
    ['7#1', null, 'Overhead tank 1'],
    ['7#2', null, 'Overhead tank 2'],
    ['7#3', null, 'Overhead tank 3'],
    ['4', null, 'Water treatment plant'],
    ['4/4.1', '4', 'Clariflocculator'],
    ['4/4.2', '4', 'Rapid sand filters'],
  ]);
  assert.deepEqual(laid[0].activities, elementPlan('OHT', null));
  // A kind the company no longer has drops that component and its branch.
  assert.deepEqual(layOutBreakdown(water, STANDARD_COMPONENT_KINDS.filter((k) => k.code !== 'WTP'), [{ key: '4', count: 1 }]), []);
  // A count of 0 or a key that is not a top-level component lays out nothing.
  assert.deepEqual(layOutBreakdown(water, STANDARD_COMPONENT_KINDS, [{ key: '7', count: 0 }, { key: '4.1', count: 1 }]), []);
  // Weights per copy: three piers where the type has four, and the shares are scaled back to 100%.
  const bridge = {
    breakdown: [
      { key: '1', parentKey: null, kind: 'ROAD_STRETCH', name: 'Approach', count: 2, weightPct: 10 },
      { key: '2', parentKey: null, kind: 'GENERAL', name: 'Pier', count: 4, weightPct: 12.5 },
      { key: '3', parentKey: null, kind: 'GENERAL', name: 'Deck', count: 1, weightPct: 30 },
    ],
  };
  near(sumTop(layOutBreakdown(bridge, STANDARD_COMPONENT_KINDS, defaultPicks(bridge)) as { parentKey: string | null; weightPct: number }[]), 100);
  const three = layOutBreakdown(bridge, STANDARD_COMPONENT_KINDS, [{ key: '1', count: 2 }, { key: '2', count: 3 }, { key: '3', count: 1 }]);
  near(sumTop(three as { parentKey: string | null; weightPct: number }[]), 100);
  near(three.find((c) => c.name === 'Pier 1')!.weightPct!, 14.29);
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
