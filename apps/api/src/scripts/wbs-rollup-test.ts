/**
 * Work breakdown tests. The roll-up from sub-activity to activity to component to project, sibling weights
 * (given, shared by value, none given), the same answer as before for a project with no breakdown, and the built-in
 * component templates: weights adding up to 100, lifts from a height, quantities from the specs.
 *
 *   node dist/scripts/wbs-rollup-test.js
 */
import assert from 'node:assert/strict';
import { ELEMENT_SPEC_FIELDS, WORK_ELEMENT_TYPES, effectiveWeights, elementPlan, leafPct, liftCount, rollUp, siblingWeights, type RollupActivity } from '@erp/shared';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);
const near = (a: number | undefined, b: number, eps = 0.051) => assert.ok(a !== undefined && Math.abs(a - b) < eps, `${a} is not ${b}`);

const act = (id: string, over: Partial<RollupActivity> = {}): RollupActivity => ({
  id,
  workElementId: null,
  parentActivityId: null,
  weightPct: null,
  plannedQty: 100,
  executedQty: 0,
  value: 100,
  ...over,
});

// Leaves and siblings

test('a leaf is approved over planned, held to 0..100, 0 with nothing planned', () => {
  assert.equal(leafPct(50, 200), 25);
  assert.equal(leafPct(300, 200), 100);
  assert.equal(leafPct(-5, 200), 0);
  assert.equal(leafPct(10, 0), 0);
});

test('siblings with no weight are weighed by value, or equally when all values are 0', () => {
  assert.deepEqual(siblingWeights([{ weightPct: null, value: 30 }, { weightPct: null, value: 10 }]), [30, 10]);
  assert.deepEqual(siblingWeights([{ weightPct: null, value: 0 }, { weightPct: null, value: 0 }]), [1, 1]);
});

test('siblings without a weight share what the weighted ones leave of 100, by value', () => {
  assert.deepEqual(siblingWeights([{ weightPct: 60, value: 1 }, { weightPct: null, value: 30 }, { weightPct: null, value: 10 }]), [60, 30, 10]);
  // Weights already at 100: the rest count for nothing.
  assert.deepEqual(siblingWeights([{ weightPct: 70, value: 1 }, { weightPct: 30, value: 1 }, { weightPct: null, value: 99 }]), [70, 30, 0]);
});

// Roll-up

test('a project with no breakdown is the BOQ-value weighted progress it always was', () => {
  // Two activities: 100 m at ₹10 half done (value 1000), 50 m³ at ₹60 all done (value 3000) → (500 + 3000) / 4000.
  const r = rollUp([], [act('a', { plannedQty: 100, executedQty: 50, value: 1000 }), act('b', { plannedQty: 50, executedQty: 50, value: 3000 })]);
  near(r.projectPct, 87.5);
  assert.equal(r.summaries.size, 0);
});

test('an RCC activity is its reinforcement, shuttering and concrete at 35, 25 and 40', () => {
  const r = rollUp(
    [],
    [
      act('slab', { executedQty: 100 }), // its own quantity is ignored: it has sub-activities
      act('r', { parentActivityId: 'slab', weightPct: 35, plannedQty: 10, executedQty: 10 }),
      act('s', { parentActivityId: 'slab', weightPct: 25, plannedQty: 200, executedQty: 100 }),
      act('c', { parentActivityId: 'slab', weightPct: 40, plannedQty: 80, executedQty: 0 }),
    ],
  );
  near(r.pct.get('slab'), 47.5); // 35 + 12.5 + 0
  near(r.projectPct, 47.5);
  assert.ok(r.summaries.has('slab'));
});

test('components roll up by weight to the project; a sub-component rolls up into its component', () => {
  const elements = [
    { id: 'intake', parentId: null, weightPct: 30 },
    { id: 'wtp', parentId: null, weightPct: 70 },
    { id: 'clari', parentId: 'wtp', weightPct: 60 },
    { id: 'filter', parentId: 'wtp', weightPct: 40 },
  ];
  const r = rollUp(elements, [
    act('curb', { workElementId: 'intake', executedQty: 100 }),
    act('raft', { workElementId: 'clari', executedQty: 50 }),
    act('walls', { workElementId: 'filter', executedQty: 25 }),
  ]);
  near(r.pct.get('intake'), 100);
  near(r.pct.get('clari'), 50);
  near(r.pct.get('wtp'), 40); // 0.6 × 50 + 0.4 × 25
  near(r.projectPct, 58); // 0.3 × 100 + 0.7 × 40
});

test('a component with nothing under it is 0% and still holds its weight', () => {
  const r = rollUp([{ id: 'a', parentId: null, weightPct: 50 }, { id: 'b', parentId: null, weightPct: 50 }], [act('x', { workElementId: 'a', executedQty: 100 })]);
  near(r.pct.get('b'), 0);
  near(r.projectPct, 50);
});

test('a sub-activity counts under its activity, not again under the component', () => {
  const r = rollUp(
    [{ id: 'oht', parentId: null, weightPct: null }],
    [act('lift', { workElementId: 'oht' }), act('lift.c', { workElementId: 'oht', parentActivityId: 'lift', executedQty: 100 })],
  );
  near(r.pct.get('lift'), 100);
  near(r.pct.get('oht'), 100);
});

test('values add up the tree', () => {
  const r = rollUp([{ id: 'e', parentId: null, weightPct: null }], [act('a', { workElementId: 'e', value: 400 }), act('b', { workElementId: 'e', value: 600 })]);
  assert.equal(r.value.get('e'), 1000);
});

test('bad data (a cycle, a missing parent) neither hangs nor throws', () => {
  const r = rollUp(
    [
      { id: 'x', parentId: 'y', weightPct: null },
      { id: 'y', parentId: 'x', weightPct: null },
    ],
    [act('p', { parentActivityId: 'q' }), act('q', { parentActivityId: 'p' }), act('lost', { workElementId: 'gone', executedQty: 100 })],
  );
  assert.ok(Number.isFinite(r.projectPct));
});

test('effective weights are each node as a share of its parent', () => {
  const elements = [
    { id: 'a', parentId: null, weightPct: 25 },
    { id: 'b', parentId: null, weightPct: 75 },
  ];
  const acts = [act('x', { workElementId: 'a', value: 10 }), act('y', { workElementId: 'a', value: 30 })];
  const w = effectiveWeights(elements, acts, rollUp(elements, acts).value);
  near(w.get('a'), 25);
  near(w.get('x'), 25);
  near(w.get('y'), 75);
});

// Component templates

test('every template: top-level weights and each activity’s sub-activities add up to 100', () => {
  for (const type of WORK_ELEMENT_TYPES) {
    const specs: Record<string, number> = {};
    for (const f of ELEMENT_SPEC_FIELDS[type]) specs[f.key] = f.key === 'liftM' ? 3 : f.key === 'floors' ? 4 : 17;
    const lines = elementPlan(type, specs);
    if (!lines.length) continue;
    const top = lines.filter((l) => !l.parentKey);
    near(top.reduce((s, l) => s + l.weightPct, 0), 100, 0.001);
    for (const t of top) {
      const subs = lines.filter((l) => l.parentKey === t.key);
      if (subs.length) near(subs.reduce((s, l) => s + l.weightPct, 0), 100, 0.001);
    }
    assert.equal(new Set(lines.map((l) => l.key)).size, lines.length, `${type}: keys are unique`);
  }
});

test('lifts: height over lift height, rounded up, 1 to 20; floors as given', () => {
  assert.equal(liftCount(16, 3), 6);
  assert.equal(liftCount(15, 3), 5);
  assert.equal(liftCount(null, 3), 1);
  assert.equal(liftCount(500, 1), 20);
  assert.equal(liftCount(4, null, true), 4);
});

test('an overhead tank on 16 m staging has six staging lifts sharing 25%, each in three parts', () => {
  const lines = elementPlan('OHT', { capacityKl: 650, stagingM: 16, liftM: 3 });
  const staging = lines.filter((l) => !l.parentKey && l.name.startsWith('Staging lift'));
  assert.equal(staging.length, 6);
  near(staging.reduce((s, l) => s + l.weightPct, 0), 25, 0.001);
  assert.deepEqual(
    lines.filter((l) => l.parentKey === staging[0].key).map((l) => [l.unit, l.weightPct]),
    [
      ['MT', 35],
      ['Sqm', 25],
      ['Cum', 40],
    ],
  );
});

test('quantities come from the specs: pipe length, connections, one lump sum; the rest left to the planner', () => {
  const zone = elementPlan('PIPE_ZONE', { lengthM: 9200, diameterMm: 110 });
  assert.equal(zone.find((l) => l.name.startsWith('Pipe lowering'))!.qty, 9200);
  assert.equal(zone.find((l) => l.name.startsWith('Valves'))!.qty, null);
  const hc = elementPlan('HOUSE_CONNECTIONS', { connections: 1450 });
  assert.ok(hc.every((l) => l.qty === 1450));
  const oht = elementPlan('OHT', { stagingM: 16 });
  assert.equal(oht.find((l) => l.name === 'Water-tightness test')!.qty, 1);
});

test('a building block lays out its frame floor by floor', () => {
  const lines = elementPlan('BLOCK', { floors: 3 });
  assert.deepEqual(
    lines.filter((l) => !l.parentKey && l.name.startsWith('Frame')).map((l) => l.name),
    ['Frame: Ground floor', 'Frame: First floor', 'Frame: Second floor'],
  );
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
