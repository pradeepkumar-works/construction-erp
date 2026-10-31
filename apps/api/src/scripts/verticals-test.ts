/**
 * Verticals' tests (item 167): the vertical a new project takes from its kind, the filter the header and lists share,
 * the check on a vertical about to be saved and the grouping reports use, with no database. CI runs it after the build:
 *
 *   node dist/scripts/verticals-test.js
 */
import assert from 'node:assert/strict';
import { MASTER_LIST_DEFS, NO_VERTICAL, VERTICAL_OF_TYPE, byVertical, inVertical, verticalOfType, verticalProblem } from '@erp/shared';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);

const standard = MASTER_LIST_DEFS.vertical.standard.map((s) => ({ code: s.code, name: s.name, isActive: true }));

test("every kind's vertical is a standard entry of the master (the migration backfills the same codes)", () => {
  const codes = new Set(standard.map((s) => s.code));
  for (const [type, code] of Object.entries(VERTICAL_OF_TYPE)) assert.ok(codes.has(code!), `${type} → ${code}`);
  assert.deepEqual(
    standard.map((s) => s.code),
    ['water', 'buildings', 'irrigation', 'roads-and-bridges'],
  );
});

test('a new project takes its kind’s vertical, unless the company switched it off or the kind has none', () => {
  assert.equal(verticalOfType('SEWERAGE', standard), 'water');
  assert.equal(verticalOfType('ROAD', standard), 'roads-and-bridges');
  assert.equal(verticalOfType('STORE', standard), null);
  assert.equal(verticalOfType('BUILDING', standard.map((s) => (s.code === 'buildings' ? { ...s, isActive: false } : s))), null);
});

test('the filter: none passes all, NO_VERTICAL only those with none, a code only its own', () => {
  assert.equal(inVertical('water', undefined), true);
  assert.equal(inVertical(null, ''), true);
  assert.equal(inVertical(null, NO_VERTICAL), true);
  assert.equal(inVertical('water', NO_VERTICAL), false);
  assert.equal(inVertical('water', 'water'), true);
  assert.equal(inVertical('buildings', 'water'), false);
  assert.equal(inVertical(null, 'water'), false);
});

test('a vertical saved on a project is one of the company’s, switched on; none is fine', () => {
  assert.equal(verticalProblem(null, standard), null);
  assert.equal(verticalProblem('water', standard), null);
  assert.match(verticalProblem('mining', standard)!, /Choose one of the company/);
  assert.match(verticalProblem('irrigation', standard.map((s) => (s.code === 'irrigation' ? { ...s, isActive: false } : s)))!, /Irrigation is switched off/);
});

test('reports group by vertical in the master’s order, an old code under itself and no vertical last', () => {
  const rows = [
    { id: 'a', v: 'buildings' },
    { id: 'b', v: null },
    { id: 'c', v: 'water' },
    { id: 'd', v: 'mining' },
    { id: 'e', v: 'water' },
  ];
  const groups = byVertical(rows, (r) => r.v, standard);
  assert.deepEqual(
    groups.map((g) => [g.code, g.name, g.rows.map((r) => r.id).join('')]),
    [
      ['water', 'Water', 'ce'],
      ['buildings', 'Buildings', 'a'],
      ['mining', 'mining', 'd'],
      [null, 'No vertical', 'b'],
    ],
  );
  assert.deepEqual(byVertical([], (r: { v: string }) => r.v, standard), []);
});

let failed = 0;
for (const [name, fn] of cases) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n${(e as Error).message}`);
  }
}
console.log(`\n${cases.length - failed}/${cases.length} passed`);
if (failed) process.exit(1);
