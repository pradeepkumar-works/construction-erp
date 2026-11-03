/**
 * Opening cost tests (ARCHITECTURE "Opening cost"): which projects ran before they came on Nirmaan and need an opening
 * cost, the checks on one, where the cash-flow forecast reads a project's spending from, how work done takes in what was
 * done before, and how a project without one is flagged on the Overview and the management dashboard.
 *
 *   node dist/scripts/project-opening-test.js
 */
import assert from 'node:assert/strict';
import {
  COST_RATIO_MAX,
  OPENING_GRACE_DAYS,
  dataProblems,
  openingMissing,
  openingProblem,
  openingTotal,
  ranBeforeNirmaan,
  spendBasis,
  type PortfolioScheduleDto,
  type ProjectSetupFacts,
} from '@erp/shared';
import { healthOf, withOpeningWork, type HealthFacts } from '../management/management-rules';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

test('a project that started over a month before it was entered ran before Nirmaan', () => {
  assert.equal(OPENING_GRACE_DAYS, 30);
  assert.equal(ranBeforeNirmaan('2026-01-06', '2026-11-02'), true);
  // Entered within the month it started: it started on Nirmaan.
  assert.equal(ranBeforeNirmaan('2026-10-03', '2026-11-02'), false);
  assert.equal(ranBeforeNirmaan('2026-10-02', '2026-11-02'), true);
  // Entered before it started, or with no start date: nothing before.
  assert.equal(ranBeforeNirmaan('2026-12-01', '2026-11-02'), false);
  assert.equal(ranBeforeNirmaan(null, '2026-11-02'), false);
});

test('an opening cost is missing only where the project ran before and has none, and never for a store or a plant', () => {
  const ran = { type: 'SEWERAGE', startDate: '2026-01-06', enteredOn: '2026-11-02' };
  assert.equal(openingMissing({ ...ran, hasOpening: false }), true);
  assert.equal(openingMissing({ ...ran, hasOpening: true }), false);
  assert.equal(openingMissing({ ...ran, type: 'STORE', hasOpening: false }), false);
  assert.equal(openingMissing({ ...ran, type: 'PLANT', hasOpening: false }), false);
  assert.equal(openingMissing({ ...ran, startDate: '2026-10-20', hasOpening: false }), false);
});

test('an opening cost stands at a date from the start to today, with amounts of zero or more', () => {
  const heads = { expenses: '120000', material: '5400000', machinery: '0', labour: '880000', subcontract: '' };
  const project = { startDate: '2026-01-06' };
  assert.equal(openingProblem({ asOf: '2026-10-27', heads }, project, '2026-11-03'), null);
  assert.equal(openingProblem({ asOf: '2026-10-27', heads, workDone: '8400000' }, project, '2026-11-03'), null);
  assert.equal(openingProblem({ asOf: null, heads }, project, '2026-11-03'), 'Choose the date the figures stand at');
  assert.equal(openingProblem({ asOf: '2026-11-04', heads }, project, '2026-11-03'), 'The figures cannot stand at a date after today');
  assert.equal(openingProblem({ asOf: '2025-12-31', heads }, project, '2026-11-03'), 'The figures cannot stand at a date before the project started');
  assert.equal(openingProblem({ asOf: '2025-12-31', heads }, { startDate: null }, '2026-11-03'), null);
  assert.equal(openingProblem({ asOf: '2026-10-27', heads: { ...heads, labour: '-1' } }, project, '2026-11-03'), 'A cost cannot be negative');
  assert.equal(openingProblem({ asOf: '2026-10-27', heads: { ...heads, labour: 'abc' } }, project, '2026-11-03'), 'Enter each cost as an amount in rupees');
  assert.equal(openingProblem({ asOf: '2026-10-27', heads, workDone: -5 }, project, '2026-11-03'), 'Enter the work done as an amount of zero or more');
  assert.equal(openingTotal(heads), 6_400_000);
  assert.equal(openingTotal({}), 0);
});

test('spending to come is read from the budget, else the cost ratio to date, else neither billing nor spending is forecast', () => {
  assert.deepEqual(spendBasis({ hasBudget: true, costToDate: 0, billedToDate: 0, openingMissing: true }), { kind: 'budget' });
  // Cost of 15.0 Cr against 19.2 Cr billed: the rest is spent at 78%.
  assert.deepEqual(spendBasis({ hasBudget: false, costToDate: 150_062_940, billedToDate: 192_388_385, openingMissing: false }), { kind: 'costRatio', ratio: 0.78 });
  // The case the margin was wrong on: billing before Nirmaan, no opening cost, a cost of ₹1.7 L against ₹19.2 Cr.
  assert.deepEqual(spendBasis({ hasBudget: false, costToDate: 170_000, billedToDate: 192_388_385, openingMissing: true }), { kind: 'none', why: 'openingMissing' });
  assert.deepEqual(spendBasis({ hasBudget: false, costToDate: 4_200_000, billedToDate: 0, openingMissing: false }), { kind: 'none', why: 'noBilling' });
  assert.deepEqual(spendBasis({ hasBudget: false, costToDate: 10_000_000, billedToDate: 386_597, openingMissing: false }), { kind: 'none', why: 'ratioOff' });
  assert.deepEqual(spendBasis({ hasBudget: false, costToDate: 0, billedToDate: 386_597, openingMissing: false }), { kind: 'none', why: 'ratioOff' });
  assert.equal(spendBasis({ hasBudget: false, costToDate: COST_RATIO_MAX * 100, billedToDate: 100, openingMissing: false }).kind, 'costRatio');
});

test('work done takes in the work done before Nirmaan only where the opening gives it', () => {
  // BOQ count 12 Cr; opening work 8.4 Cr plus 5 Cr of progress since.
  assert.equal(withOpeningWork(120_000_000, 134_000_000, 84_000_000), 134_000_000);
  // Measurement already reaches back further than the opening and progress: it stands.
  assert.equal(withOpeningWork(150_000_000, 134_000_000, 84_000_000), 150_000_000);
  assert.equal(withOpeningWork(120_000_000, 134_000_000, null), 120_000_000);
  assert.equal(withOpeningWork(120_000_000, 134_000_000, 0), 120_000_000);
});

const onTrack: PortfolioScheduleDto = { state: 'ON_TRACK', done: 40, planned: 42, elapsed: 45, lateActivities: 0, completionDate: '2027-06-30', plannedFinish: '2027-05-30', daysLate: null };
const healthy: HealthFacts = {
  schedule: onTrack,
  contractValue: 516_150_000,
  workDone: 181_684_800,
  cost: 170_000,
  forecastMargin: null,
  unbilled: 0,
  unbilledDays: null,
  billedUpTo: '2026-10-06',
  over90: 0,
  approvalsWaiting: 0,
  approvalsOldestDays: null,
  highRisks: 0,
};

test('the dashboard watches a project with no opening cost, and cost above work done still comes first', () => {
  assert.deepEqual(healthOf(healthy), { level: 'good', reasons: [] });
  const h = healthOf({ ...healthy, openingMissing: true });
  assert.equal(h.level, 'watch');
  assert.deepEqual(h.reasons.map((r) => [r.key, r.level]), [['cost', 'watch']]);
  assert.match(h.reasons[0].text, /No opening cost/);
  const over = healthOf({ ...healthy, cost: 190_000_000, openingMissing: true });
  assert.deepEqual(over.reasons.map((r) => [r.key, r.level]), [['cost', 'act']]);
});

const facts: ProjectSetupFacts = {
  type: 'SEWERAGE',
  contractModel: 'LUMP_SUM',
  team: 4,
  startDate: '2026-01-06',
  endDate: '2028-04-30',
  contractValue: 516_150_000,
  boqItems: 13,
  boqTotal: 516_150_000,
  boqItemsWithoutActivity: 0,
  activities: 40,
  activitiesUndated: 0,
  baselineAt: null,
  agreementNo: 'CP/WW/07',
  budgetSet: false,
  sectorSet: true,
  norms: 0,
  openingMissing: true,
};

test('the Overview tells those who see cost of a missing opening cost, and no one else', () => {
  const p = dataProblems(facts, 'MANAGEMENT');
  assert.deepEqual(p.map((x) => [x.key, x.tab]), [['openingMissing', 'budget']]);
  assert.deepEqual(p[0].affects, ['cost', 'marginToDate']);
  assert.deepEqual(dataProblems(facts, 'SITE_ENGINEER'), []);
  assert.deepEqual(dataProblems({ ...facts, openingMissing: false }, 'MANAGEMENT'), []);
  assert.deepEqual(dataProblems({ ...facts, type: 'STORE' }, 'MANAGEMENT'), []);
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
