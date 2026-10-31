/**
 * Department screens' tests: which figures a department shows from the area modules', and a pipeline's stage
 * counts and order, with no database. CI runs it after the build:
 *
 *   node dist/scripts/department-home-test.js
 */
import assert from 'node:assert/strict';
import { DEPARTMENT_FIGURES, DEPARTMENT_FIGURE_MAX, DEPARTMENT_MODULES, DEPARTMENT_PIPELINES, MODULE_KEYS, daysPast, departmentFigures, pipelineOf, type ModuleFigureDto, type PipelineRowDto } from '@erp/shared';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);

const fig = (key: string): ModuleFigureDto => ({ key, label: key, value: '1', format: 'count', href: '/' });
const row = (number: string, stage: string, extra: Partial<PipelineRowDto> = {}): PipelineRowDto => ({ id: number, number, href: '/', projectName: null, title: number, stage, dueOn: null, daysLate: 0, since: null, ...extra });

test('every department has its figures and pipelines named, from area modules that exist', () => {
  for (const d of DEPARTMENT_MODULES) assert.ok(d.key in DEPARTMENT_FIGURES, `${d.key} has no line in DEPARTMENT_FIGURES`);
  for (const [d, srcs] of Object.entries(DEPARTMENT_FIGURES)) {
    assert.ok(DEPARTMENT_MODULES.some((m) => m.key === d), `${d} is not a department`);
    for (const s of srcs) assert.ok((MODULE_KEYS as readonly string[]).includes(s.module), `${d}: ${s.module}`);
  }
  for (const d of Object.keys(DEPARTMENT_PIPELINES)) assert.ok(DEPARTMENT_MODULES.some((m) => m.key === d), `${d} is not a department`);
});

test("a department picks the named figures in its own order, each once, and no more than the strip holds", () => {
  const figures = departmentFigures('purchase-management', { materials: [fig('lowStock'), fig('openRequests')], purchases: [fig('ordersOpen'), fig('ordersLate')] });
  assert.deepEqual(figures.map((f) => f.key), ['openRequests', 'ordersOpen', 'ordersLate']);
  assert.deepEqual(departmentFigures('store-inventory', { materials: [fig('openRequests'), fig('lowStock')], purchases: [fig('ordersOpen'), fig('ordersLate')] }).map((f) => f.key), ['openRequests', 'lowStock', 'ordersLate']);
  assert.deepEqual(departmentFigures('reports-mis', {}), []);
  const many = Array.from({ length: 9 }, (_, i) => fig(`f${i}`));
  assert.equal(departmentFigures('quality-control', { quality: many }).length, DEPARTMENT_FIGURE_MAX);
});

test('a pipeline counts every stage, a stage with none at 0, and shows the late ones first', () => {
  const p = pipelineOf('indents', [
    row('MR-3', 'APPROVAL', { dueOn: '2026-11-10' }),
    row('PO-1', 'NOT_STARTED', { dueOn: '2026-10-20', daysLate: 10 }),
    row('MR-1', 'READY', { dueOn: '2026-11-02' }),
    row('PO-2', 'PARTLY_RECEIVED', { dueOn: '2026-10-28', daysLate: 2 }),
    row('MR-2', 'APPROVAL', { since: '2026-10-01' }),
  ]);
  assert.equal(p.total, 5);
  assert.deepEqual(
    p.stages.map((s) => [s.key, s.count]),
    [
      ['APPROVAL', 2],
      ['TO_ENQUIRE', 0],
      ['AWAITING_QUOTES', 0],
      ['TO_FINALISE', 0],
      ['READY', 1],
      ['NOT_STARTED', 1],
      ['PARTLY_RECEIVED', 1],
    ],
  );
  assert.deepEqual(p.rows.map((r) => r.number), ['PO-1', 'PO-2', 'MR-1', 'MR-3', 'MR-2']);
});

test('the screen shows the most urgent eight; days past a date count from the day after it', () => {
  const p = pipelineOf('letters', Array.from({ length: 12 }, (_, i) => row(`L-${String(i).padStart(2, '0')}`, 'SIGN')));
  assert.equal(p.rows.length, 8);
  assert.equal(p.total, 12);
  assert.equal(daysPast('2026-10-28', '2026-10-30'), 2);
  assert.equal(daysPast('2026-10-30', '2026-10-30'), 0);
  assert.equal(daysPast(null, '2026-10-30'), 0);
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
