/**
 * Management dashboard and reports' tests: the rules on their own. Work done counting supply items from their
 * measurement and lump sums from their progress, the share of a bill the client has paid, how long work has waited to
 * be billed, the forecast left out while it is too early, where a project stands against its completion date and plan,
 * approvals by age, the reasons a project needs attention, and the periods the reports run over.
 *
 *   node dist/scripts/management-test.js
 */
import assert from 'node:assert/strict';
import { APPROVAL_OLD_DAYS, FORECAST_MIN_DONE_PCT, UNBILLED_WATCH_DAYS, type PortfolioScheduleDto } from '@erp/shared';
import {
  approvalAgeing,
  billedMarginPct,
  byUrgency,
  contractWorkDone,
  daysBetween,
  elapsedPct,
  financialYearStart,
  forecastCost,
  healthOf,
  lastMonths,
  monthSpan,
  monthsBetween,
  paidWork,
  scheduleOf,
  unbilledDays,
  unbilledMatters,
  workDoneValue,
  type HealthFacts,
  type ScheduleFacts,
} from '../management/management-rules';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

// ---------------------------------------------------------------------------------------------------------------------
// Work done and billing

test('work done takes each item at the larger of progress and measurement, so supply items count once measured', () => {
  // Earthwork: progress 100, measured 80. Pipe supply: no activity, measured 600 m. A pump not yet measured.
  const v = workDoneValue([
    { rate: 200, progressQty: 100, measuredQty: 80 },
    { rate: 1500, progressQty: 0, measuredQty: 600 },
    { rate: 900000, progressQty: 0, measuredQty: 0 },
  ]);
  assert.equal(v, 200 * 100 + 1500 * 600);
  assert.equal(workDoneValue([{ rate: 10, progressQty: -5, measuredQty: 0 }]), 0);
});

test('a lump sum or EPC contract counts its physical progress of the lump sum, never below its BOQ reading', () => {
  assert.equal(contractWorkDone('ITEM_RATE', 1000, 50, 10_000), 1000);
  assert.equal(contractWorkDone('LUMP_SUM', 1000, 40, 10_000), 4000);
  assert.equal(contractWorkDone('EPC', 6000, 40, 10_000), 6000);
  assert.equal(contractWorkDone('EPC', 1000, 140, 10_000), 10_000);
  assert.equal(contractWorkDone('LUMP_SUM', 1000, 40, null), 1000);
});

test('paid work is the bill’s work value in the share the client has settled', () => {
  assert.equal(paidWork(100, 118, 59), 50);
  assert.equal(paidWork(100, 118, 200), 100);
  assert.equal(paidWork(100, 0, 50), 0);
});

test('work waits to be billed from the last bill’s measured-up-to date, else the start; nothing waits when all is billed', () => {
  assert.equal(unbilledDays(5000, '2026-09-30', '2026-01-01', '2026-10-26'), 26);
  assert.equal(unbilledDays(5000, null, '2026-05-29', '2026-10-26'), 150);
  assert.equal(unbilledDays(0, '2026-09-30', '2026-01-01', '2026-10-26'), null);
  assert.equal(unbilledDays(5000, null, null, '2026-10-26'), null);
});

test('unbilled work matters from a lakh or half a percent of the contract', () => {
  assert.equal(unbilledMatters(99_999, null), false);
  assert.equal(unbilledMatters(100_000, null), true);
  assert.equal(unbilledMatters(400_000, 100_000_000), false);
  assert.equal(unbilledMatters(500_000, 100_000_000), true);
});

test('forecast cost is actual plus the budget still to spend, left out without a budget or too early', () => {
  assert.equal(forecastCost(400, 1000, 50), 900);
  assert.equal(forecastCost(400, null, 50), null);
  assert.equal(forecastCost(400, 1000, FORECAST_MIN_DONE_PCT - 0.1), null);
  assert.equal(forecastCost(1200, 1000, 120), 1200);
});

test('margin on billing is left out when the billing is a sliver of the cost', () => {
  assert.equal(billedMarginPct(1000, 800), 20);
  assert.equal(billedMarginPct(386_596, 9_909_267), null);
  assert.equal(billedMarginPct(0, 100), null);
});

// ---------------------------------------------------------------------------------------------------------------------
// Schedule

const facts = (f: Partial<ScheduleFacts>): ScheduleFacts => ({
  status: 'ACTIVE',
  done: 40,
  planned: 45,
  startDate: '2026-01-01',
  completionDate: '2027-01-01',
  plannedFinish: '2026-12-15',
  late: 0,
  scheduled: 10,
  today: '2026-07-01',
  ...f,
});

test('a plan ending after the completion date is late by the difference, whatever the progress', () => {
  const s = scheduleOf(facts({ completionDate: '2028-04-30', plannedFinish: '2028-12-31', done: 0.2, planned: 0 }));
  assert.equal(s.state, 'LATE');
  assert.equal(s.daysLate, 245);
});

test('past the completion date unfinished is late by the days gone', () => {
  const s = scheduleOf(facts({ completionDate: '2026-06-01', plannedFinish: '2026-05-20', today: '2026-07-01' }));
  assert.equal(s.state, 'LATE');
  assert.equal(s.daysLate, 30);
});

test('ten points behind the plan (or the time gone without one) is behind; less is on track', () => {
  assert.equal(scheduleOf(facts({ done: 35, planned: 45 })).state, 'BEHIND');
  assert.equal(scheduleOf(facts({ done: 36, planned: 45 })).state, 'ON_TRACK');
  // No dated activities: against the time gone (half the year, about 50%).
  assert.equal(scheduleOf(facts({ planned: null, scheduled: 0, plannedFinish: null, done: 30 })).state, 'BEHIND');
});

test('complete, and no plan at all', () => {
  assert.equal(scheduleOf(facts({ status: 'COMPLETED', done: 80 })).state, 'DONE');
  assert.equal(scheduleOf(facts({ done: 100 })).state, 'DONE');
  const none = scheduleOf(facts({ planned: null, scheduled: 0, plannedFinish: null, startDate: null, completionDate: null }));
  assert.equal(none.state, 'NO_PLAN');
  assert.equal(none.elapsed, null);
});

test('elapsed share of the time and whole days between dates', () => {
  assert.equal(elapsedPct('2026-01-01', '2026-01-11', '2026-01-06'), 50);
  assert.equal(elapsedPct('2026-01-01', '2026-01-11', '2027-01-01'), 100);
  assert.equal(elapsedPct('2026-01-11', '2026-01-01', '2026-01-06'), null);
  assert.equal(daysBetween('2026-10-01', '2026-10-26'), 25);
});

// ---------------------------------------------------------------------------------------------------------------------
// Approvals and health

test('approvals by age and by type, the type with the oldest first', () => {
  const a = approvalAgeing(
    [
      { type: 'DPR', submittedAt: '2026-10-25T10:00:00Z' },
      { type: 'DPR', submittedAt: '2026-10-20T10:00:00Z' },
      { type: 'BILL', submittedAt: '2026-10-11T10:00:00Z' },
      { type: 'MEASUREMENT', submittedAt: '2026-10-01T10:00:00Z' },
    ],
    '2026-10-26',
  );
  assert.deepEqual(a.buckets, [1, 1, 1, 1]);
  assert.equal(a.oldestDays, 25);
  assert.deepEqual(a.byType.map((t) => t.type), ['MEASUREMENT', 'BILL', 'DPR']);
  assert.equal(a.byType[2].count, 2);
  assert.equal(approvalAgeing([], '2026-10-26').oldestDays, null);
});

const onTrack: PortfolioScheduleDto = { state: 'ON_TRACK', done: 40, planned: 42, elapsed: 45, lateActivities: 0, completionDate: '2027-06-30', plannedFinish: '2027-05-30', daysLate: null };
const healthy: HealthFacts = {
  schedule: onTrack,
  contractValue: 100_000_000,
  workDone: 40_000_000,
  cost: 30_000_000,
  forecastMargin: 20_000_000,
  unbilled: 2_000_000,
  unbilledDays: 20,
  billedUpTo: '2026-10-06',
  over90: 0,
  approvalsWaiting: 3,
  approvalsOldestDays: 2,
  highRisks: 0,
};

test('a project on its plan, in margin, billed and paid on time is on course', () => {
  assert.deepEqual(healthOf(healthy), { level: 'good', reasons: [] });
});

test('a plan finishing a month after completion, cost above work done, and money over 90 days need action now', () => {
  const late: PortfolioScheduleDto = { ...onTrack, state: 'LATE', plannedFinish: '2028-12-31', completionDate: '2028-04-30', daysLate: 245 };
  const h = healthOf({ ...healthy, schedule: late, cost: 41_000_000, over90: 459_000 });
  assert.equal(h.level, 'act');
  assert.deepEqual(h.reasons.map((r) => [r.key, r.level]), [['schedule', 'act'], ['cost', 'act'], ['collection', 'act']]);
  assert.match(h.reasons[0].text, /245 days after the completion date/);
  assert.match(h.reasons[1].text, /₹4\.1 Cr is above the ₹4\.0 Cr of work done/);
});

test('unbilled work is watched from 45 days and needs action from 90, if it is worth billing', () => {
  assert.equal(healthOf({ ...healthy, unbilledDays: UNBILLED_WATCH_DAYS - 1 }).reasons.length, 0);
  assert.equal(healthOf({ ...healthy, unbilledDays: UNBILLED_WATCH_DAYS }).reasons[0].level, 'watch');
  const h = healthOf({ ...healthy, unbilled: 88_251_000, unbilledDays: 150, billedUpTo: null });
  assert.equal(h.reasons[0].level, 'act');
  assert.equal(h.reasons[0].text, '₹8.8 Cr of work done not billed, no bill yet (150 days)');
  assert.equal(healthOf({ ...healthy, unbilled: 50_000, unbilledDays: 150 }).reasons.length, 0);
});

test('a thin margin, behind plan, old approvals and high risks are watched', () => {
  const behind: PortfolioScheduleDto = { ...onTrack, state: 'BEHIND', done: 30, planned: 45 };
  const h = healthOf({ ...healthy, schedule: behind, cost: 39_000_000, approvalsWaiting: 6, approvalsOldestDays: APPROVAL_OLD_DAYS + 1, highRisks: 2 });
  assert.equal(h.level, 'watch');
  assert.deepEqual(h.reasons.map((r) => r.key), ['schedule', 'cost', 'approvals', 'risk']);
  assert.equal(h.reasons[0].text, '30% done against 45% planned by today');
  assert.equal(h.reasons[2].text, '6 entries waiting for approval, the oldest 8 days');
  assert.equal(healthOf({ ...healthy, approvalsOldestDays: APPROVAL_OLD_DAYS * 2 + 1 }).reasons[0].level, 'act');
});

test('a forecast loss needs action even while cost is below work done', () => {
  const h = healthOf({ ...healthy, forecastMargin: -5_000_000 });
  assert.equal(h.level, 'act');
  assert.equal(h.reasons[0].text, 'Forecast cost is ₹50.0 L above the contract value');
});

test('attention is sorted act before watch, then schedule, cost, billing, collection, approvals and risk', () => {
  const items = [
    { level: 'watch' as const, key: 'risk' as const },
    { level: 'act' as const, key: 'collection' as const },
    { level: 'watch' as const, key: 'schedule' as const },
    { level: 'act' as const, key: 'billing' as const },
  ].sort(byUrgency);
  assert.deepEqual(items.map((i) => `${i.level}:${i.key}`), ['act:billing', 'act:collection', 'watch:schedule', 'watch:risk']);
});

// ---------------------------------------------------------------------------------------------------------------------
// Periods

test('months between two dates, the last twelve, a month’s first and last day and the financial year', () => {
  assert.deepEqual(monthsBetween('2026-11-15', '2027-02-01'), ['2026-11', '2026-12', '2027-01', '2027-02']);
  const twelve = lastMonths('2026-10-26', 12);
  assert.equal(twelve.length, 12);
  assert.equal(twelve[0], '2025-11');
  assert.equal(twelve[11], '2026-10');
  assert.deepEqual(monthSpan('2028-02'), { from: '2028-02-01', to: '2028-02-29' });
  assert.equal(financialYearStart('2026-10-26'), '2026-04-01');
  assert.equal(financialYearStart('2027-03-31'), '2026-04-01');
  assert.equal(financialYearStart('2027-04-01'), '2027-04-01');
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
