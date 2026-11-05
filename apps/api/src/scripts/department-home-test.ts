/**
 * Department screens' tests: which figures a department shows from the area modules', and a pipeline's stage
 * counts and order, with no database. CI runs it after the build:
 *
 *   node dist/scripts/department-home-test.js
 */
import assert from 'node:assert/strict';
import { DEPARTMENT_FIGURES, DEPARTMENT_FIGURE_MAX, DEPARTMENT_MODULES, DEPARTMENT_PIPELINES, FIGURE_LABELS, MODULE_KEYS, daysPast, departmentFigures, monthWords, pipelineOf, salaryDueOn, salaryMonthsNotRun, settlementDueOn, type Figure, type FigureId, type PipelineRowDto } from '@erp/shared';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);

const fig = (id: FigureId) => ({ id, value: 1 }) as Figure;
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
  const figures = departmentFigures('purchase-management', { materials: [fig('itemsBelowMinimum'), fig('materialRequestsToApprove')], purchases: [fig('ordersToReceive'), fig('lateDeliveries')] });
  assert.deepEqual(figures.map((f) => f.id), ['materialRequestsToApprove', 'ordersToReceive', 'lateDeliveries']);
  assert.deepEqual(departmentFigures('store-inventory', { materials: [fig('materialRequestsToApprove'), fig('itemsBelowMinimum')], purchases: [fig('ordersToReceive'), fig('lateDeliveries')] }).map((f) => f.id), ['materialRequestsToApprove', 'itemsBelowMinimum', 'lateDeliveries']);
  assert.deepEqual(departmentFigures('reports-mis', {}), []);
  const many = (Object.keys(FIGURE_LABELS) as FigureId[]).slice(0, 9).map(fig);
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

test('salaries: a month ended with no run is to prepare, from the first run on, due by the 7th', () => {
  // Runs for Jul and Sep; today in Nov: Aug and Oct ended with none.
  assert.deepEqual(salaryMonthsNotRun('2026-11-05', ['2026-07', '2026-09']), ['2026-08', '2026-10']);
  // The first run was in Sep: nothing before it is owed.
  assert.deepEqual(salaryMonthsNotRun('2026-11-05', ['2026-09']), ['2026-10']);
  // A company that has never run payroll owes none; the current month is not yet ended.
  assert.deepEqual(salaryMonthsNotRun('2026-11-05', []), []);
  assert.deepEqual(salaryMonthsNotRun('2026-11-05', ['2026-08', '2026-09', '2026-10', '2026-11']), []);
  // Across the year end.
  assert.deepEqual(salaryMonthsNotRun('2027-01-10', ['2026-10']), ['2026-11', '2026-12']);
  assert.equal(salaryDueOn('2026-12'), '2027-01-07');
  assert.equal(settlementDueOn('2026-10-30'), '2026-11-01');
  assert.equal(monthWords('2026-10'), 'Oct 2026');
  const p = pipelineOf('salaries', [row('Oct 2026', 'TO_PREPARE', { dueOn: '2026-11-07' }), row('SAL-2026-09', 'TO_PAY', { dueOn: '2026-10-07', daysLate: 29 })]);
  assert.deepEqual(p.stages.map((s) => s.count), [1, 0, 0, 1]);
  assert.equal(DEPARTMENT_PIPELINES['hr-payroll'][0], 'salaries');
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
