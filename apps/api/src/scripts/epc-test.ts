/**
 * EPC tests (item 130). Where a deliverable stands from the code it came back with and how late it is, the disciplines'
 * summary, a package's stages, forecast on site (delivered, from the ship's ETA, or the plan moved by the slip so far)
 * and its problems, the day a package reached a stage, the evidence a payment stage reads from deliverables and
 * packages, a client input's overdue days, the bank credit at the day's rate, and the contract currency's conversions.
 *
 *   node dist/scripts/epc-test.js
 */
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { fromRupees, isForeign, toRupees } from '@erp/shared';
import {
  bankCredit,
  clientInputOverdue,
  deliverableLate,
  deliverableStatus,
  deliverablesEvidence,
  disciplineSummary,
  isImported,
  packageStatus,
  packagesEvidence,
  reachedOn,
  type PackageInput,
} from '../epc/epc-rules';
import { packageLate, PACKAGE_GRACE_DAYS } from '../warnings/warning-rules';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);
const TODAY = '2026-10-24';
const D = (v: string | number) => new Prisma.Decimal(v);

test('a deliverable is approved on code A or B, has comments to answer on C or D, else with the client or not submitted', () => {
  assert.equal(deliverableStatus({ submittedOn: null, approvalCode: null, approvedOn: null }), 'NOT_STARTED');
  assert.equal(deliverableStatus({ submittedOn: '2026-09-01', approvalCode: null, approvedOn: null }), 'SUBMITTED');
  assert.equal(deliverableStatus({ submittedOn: '2026-09-01', approvalCode: 'C', approvedOn: null }), 'COMMENTS');
  assert.equal(deliverableStatus({ submittedOn: '2026-09-01', approvalCode: 'D', approvedOn: null }), 'COMMENTS');
  assert.equal(deliverableStatus({ submittedOn: '2026-09-01', approvalCode: 'B', approvedOn: '2026-09-20' }), 'APPROVED');
  assert.equal(deliverableStatus({ submittedOn: '2026-09-01', approvalCode: 'A', approvedOn: null }), 'APPROVED');
});

test('late for submission while not submitted, else for approval; never once approved', () => {
  assert.deepEqual(deliverableLate({ status: 'NOT_STARTED', plannedSubmitOn: '2026-10-14', plannedApprovalOn: '2026-11-20' }, TODAY), { lateDays: 10, lateFor: 'SUBMISSION' });
  assert.deepEqual(deliverableLate({ status: 'NOT_STARTED', plannedSubmitOn: '2026-10-30', plannedApprovalOn: '2026-11-20' }, TODAY), { lateDays: null, lateFor: null });
  assert.deepEqual(deliverableLate({ status: 'COMMENTS', plannedSubmitOn: '2026-08-01', plannedApprovalOn: '2026-09-14' }, TODAY), { lateDays: 40, lateFor: 'APPROVAL' });
  assert.deepEqual(deliverableLate({ status: 'SUBMITTED', plannedSubmitOn: '2026-08-01', plannedApprovalOn: '2026-10-24' }, TODAY), { lateDays: null, lateFor: null });
  assert.deepEqual(deliverableLate({ status: 'APPROVED', plannedSubmitOn: '2026-01-01', plannedApprovalOn: '2026-02-01' }, TODAY), { lateDays: null, lateFor: null });
});

test("the disciplines' summary keeps their order and leaves out an empty one", () => {
  const rows = [
    { discipline: 'MECHANICAL' as const, status: 'APPROVED' as const, lateDays: null },
    { discipline: 'PROCESS' as const, status: 'NOT_STARTED' as const, lateDays: 5 },
    { discipline: 'PROCESS' as const, status: 'COMMENTS' as const, lateDays: null },
    { discipline: 'PROCESS' as const, status: 'APPROVED' as const, lateDays: null },
  ];
  assert.deepEqual(disciplineSummary(rows), [
    { discipline: 'PROCESS', total: 3, submitted: 2, approved: 1, late: 1 },
    { discipline: 'MECHANICAL', total: 1, submitted: 1, approved: 1, late: 0 },
  ]);
});

const blowers: PackageInput = {
  neededOn: '2026-10-29',
  vessel: 'MV Ocean Pelican',
  eta: '2026-11-05',
  portToSiteDays: 8,
  stages: [
    { stage: 'SHIPPED', plannedOn: '2026-08-30', actualOn: '2026-09-24' },
    { stage: 'ORDERED', plannedOn: '2026-04-07', actualOn: '2026-04-09' },
    { stage: 'MANUFACTURED', plannedOn: '2026-07-26', actualOn: '2026-08-15' },
    { stage: 'CUSTOMS_CLEARED', plannedOn: '2026-09-29', actualOn: null },
    { stage: 'DELIVERED', plannedOn: '2026-10-09', actualOn: null },
    { stage: 'ERECTED', plannedOn: '2026-11-13', actualOn: null },
    { stage: 'INSPECTED', plannedOn: null, actualOn: null },
  ],
};

test('a package at sea: stages in order, the next overdue, on site at the ETA plus the days to site, late against the day needed', () => {
  const s = packageStatus(blowers, TODAY);
  assert.deepEqual(s.stages.map((x) => x.stage), ['ORDERED', 'MANUFACTURED', 'SHIPPED', 'CUSTOMS_CLEARED', 'DELIVERED', 'ERECTED']);
  assert.equal(s.stages[1].slipDays, 20);
  assert.equal(s.currentStage, 'SHIPPED');
  assert.equal(s.nextStage, 'CUSTOMS_CLEARED');
  assert.equal(s.nextOverdueDays, 25);
  assert.equal(s.forecastOnSite, '2026-11-13');
  assert.equal(s.forecastFrom, 'ETA');
  assert.equal(s.lateDays, 15);
  assert.equal(s.imported, true);
  assert.deepEqual(s.problems, []);
  // Ten days from the port when the package does not say
  assert.equal(packageStatus({ ...blowers, portToSiteDays: null }, TODAY).forecastOnSite, '2026-11-15');
  // An ETA already past cannot put it on site before today.
  assert.equal(packageStatus({ ...blowers, eta: '2026-10-01', portToSiteDays: 5 }, TODAY).forecastOnSite, TODAY);
});

test('without an ETA the planned delivery moves by the larger of the last slip and how overdue the next stage is', () => {
  const p: PackageInput = {
    neededOn: '2027-01-22',
    eta: null,
    portToSiteDays: null,
    stages: [
      { stage: 'ORDERED', plannedOn: '2026-06-26', actualOn: '2026-06-28' },
      { stage: 'MANUFACTURED', plannedOn: '2026-09-24', actualOn: '2026-09-28' },
      { stage: 'INSPECTED', plannedOn: '2026-10-04', actualOn: null },
      { stage: 'DELIVERED', plannedOn: '2026-11-28', actualOn: null },
    ],
  };
  const s = packageStatus(p, TODAY);
  assert.equal(s.nextOverdueDays, 20);
  assert.equal(s.forecastOnSite, '2026-12-18');
  assert.equal(s.forecastFrom, 'PLAN');
  assert.equal(s.lateDays, null);
  assert.equal(s.imported, false);
  // On time when nothing has slipped
  const onTime = packageStatus({ ...p, stages: p.stages.map((x) => ({ ...x, actualOn: x.stage === 'ORDERED' ? x.plannedOn : null })) }, '2026-07-01');
  assert.equal(onTime.forecastOnSite, '2026-11-28');
  // No delivery planned, nothing to forecast
  assert.equal(packageStatus({ ...p, stages: p.stages.filter((x) => x.stage !== 'DELIVERED') }, TODAY).forecastOnSite, null);
});

test('a delivered package is on site on its delivery day, or on the day of a later stage done', () => {
  const p: PackageInput = { neededOn: '2026-09-01', eta: '2026-08-01', portToSiteDays: 10, stages: [{ stage: 'DELIVERED', plannedOn: '2026-08-10', actualOn: '2026-08-20' }] };
  const s = packageStatus(p, TODAY);
  assert.equal(s.forecastOnSite, '2026-08-20');
  assert.equal(s.forecastFrom, 'DELIVERED');
  assert.equal(s.nextStage, null);
  const erected = packageStatus({ ...p, stages: [{ stage: 'ERECTED', plannedOn: null, actualOn: '2026-09-15' }] }, TODAY);
  assert.equal(erected.forecastOnSite, '2026-09-15');
  assert.equal(erected.lateDays, 14);
});

test('actual dates out of order or after today are problems', () => {
  const p: PackageInput = {
    neededOn: null,
    eta: null,
    portToSiteDays: null,
    stages: [
      { stage: 'ORDERED', plannedOn: null, actualOn: '2026-05-10' },
      { stage: 'DRAWINGS_APPROVED', plannedOn: null, actualOn: '2026-05-01' },
      { stage: 'MANUFACTURED', plannedOn: null, actualOn: '2026-11-01' },
    ],
  };
  const s = packageStatus(p, TODAY);
  assert.deepEqual(s.problems, ['Drawings and QAP approved on 2026-05-01, before order placed (2026-05-10)', 'Manufactured is dated 2026-11-01, after today']);
  assert.equal(isImported({ ...p, billOfLading: 'BL-1' }), true);
  assert.equal(isImported(p), false);
});

test('a package reached a stage on its own date, or on the earliest later stage done', () => {
  const stages = [
    { stage: 'ORDERED' as const, plannedOn: null, actualOn: '2026-03-01' },
    { stage: 'ERECTED' as const, plannedOn: null, actualOn: '2026-09-10' },
    { stage: 'COMMISSIONED' as const, plannedOn: null, actualOn: '2026-10-01' },
  ];
  assert.equal(reachedOn(stages, 'ORDERED'), '2026-03-01');
  assert.equal(reachedOn(stages, 'DELIVERED'), '2026-09-10');
  assert.equal(reachedOn(stages, 'MANUFACTURED'), '2026-09-10');
  assert.equal(reachedOn(stages.slice(0, 1), 'DELIVERED'), null);
});

test('a design stage is done on the day its last deliverable was approved, once all are by the day', () => {
  assert.deepEqual(deliverablesEvidence([], TODAY), { pct: 0, text: 'No deliverables linked' });
  assert.deepEqual(deliverablesEvidence([{ approvedOn: '2026-03-01' }], TODAY), { pct: 100, text: 'Approved on 2026-03-01' });
  assert.deepEqual(deliverablesEvidence([{ approvedOn: '2026-03-01' }, { approvedOn: '2026-04-07' }], TODAY), { pct: 100, text: 'All 2 deliverables approved, the last on 2026-04-07' });
  assert.deepEqual(deliverablesEvidence([{ approvedOn: '2026-03-01' }, { approvedOn: null }], TODAY), { pct: 0, text: '1 of 2 deliverables approved' });
  // A bill measured before the last approval does not take it.
  assert.deepEqual(deliverablesEvidence([{ approvedOn: '2026-03-01' }, { approvedOn: '2026-04-07' }], '2026-04-01'), { pct: 0, text: '1 of 2 deliverables approved' });
});

test('an equipment stage takes the share of value that reached its stage by the day, or a count when a value is missing', () => {
  const rows = [
    { value: 300, reachedOn: '2026-08-01' },
    { value: 100, reachedOn: '2026-10-01' },
    { value: 600, reachedOn: null },
  ];
  assert.deepEqual(packagesEvidence(rows, 'DELIVERED', TODAY), { pct: 40, text: '2 of 3 packages delivered to site, 40% by value' });
  assert.deepEqual(packagesEvidence(rows, 'DELIVERED', '2026-09-01'), { pct: 30, text: '1 of 3 packages delivered to site, 30% by value' });
  assert.deepEqual(packagesEvidence([{ value: null, reachedOn: '2026-08-01' }, ...rows.slice(1)], 'ERECTED', TODAY), { pct: 66.667, text: '2 of 3 packages erected' });
  assert.deepEqual(packagesEvidence(rows.map((r) => ({ ...r, reachedOn: '2026-01-01' })), 'DELIVERED', TODAY), { pct: 100, text: '3 of 3 packages delivered to site' });
  assert.deepEqual(packagesEvidence([], 'DELIVERED', TODAY), { pct: 0, text: 'No packages linked' });
});

test('a client input is overdue from the day after it was due until given', () => {
  assert.equal(clientInputOverdue({ dueDate: '2026-10-04', achievedOn: null }, TODAY), 20);
  assert.equal(clientInputOverdue({ dueDate: TODAY, achievedOn: null }, TODAY), null);
  assert.equal(clientInputOverdue({ dueDate: '2026-10-04', achievedOn: '2026-10-20' }, TODAY), null);
});

test('the watch list warns of a package late for site beyond the grace days', () => {
  assert.equal(PACKAGE_GRACE_DAYS, 3);
  assert.equal(packageLate({ lateDays: 15, forecastFrom: 'ETA' }), 15);
  assert.equal(packageLate({ lateDays: 3, forecastFrom: 'PLAN' }), null);
  assert.equal(packageLate({ lateDays: null, forecastFrom: 'PLAN' }), null);
  // Once on site it is history, not a warning.
  assert.equal(packageLate({ lateDays: 14, forecastFrom: 'DELIVERED' }), null);
});

test('the bank credits the payment at the day’s rate; in rupees, or at the contract rate, it is the amount', () => {
  // US$ 100,000 kept at ₹ 83.25 is ₹ 83,25,000; at ₹ 83.90 the bank credits ₹ 83,90,000, a gain of ₹ 65,000.
  assert.equal(bankCredit(D('8325000'), D('83.25'), D('83.9')).toFixed(2), '8390000.00');
  assert.equal(bankCredit(D('8325000'), D('83.25'), D('82.6')).toFixed(2), '8260000.00');
  assert.equal(bankCredit(D('8325000'), D('83.25'), null).toFixed(2), '8325000.00');
  assert.equal(bankCredit(D('8325000'), null, D('83.9')).toFixed(2), '8325000.00');
  assert.equal(bankCredit(D('1000.10'), D('83.25'), D('83.25')).toFixed(2), '1000.10');
});

test('amounts are kept in rupees at the contract rate and shown in the contract currency', () => {
  const usd = { currency: 'USD', exchangeRate: '83.25' };
  assert.equal(isForeign(usd), true);
  assert.equal(isForeign({ currency: 'INR', exchangeRate: null }), false);
  assert.equal(isForeign({ currency: 'USD', exchangeRate: null }), false);
  assert.equal(toRupees(6_200_000, usd.exchangeRate), 516_150_000);
  assert.equal(fromRupees(516_150_000, usd.exchangeRate), 6_200_000);
  assert.equal(fromRupees('100', usd.exchangeRate), 1.2);
  assert.equal(toRupees(1.2, usd.exchangeRate), 99.9);
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
