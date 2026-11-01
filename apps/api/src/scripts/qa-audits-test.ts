/**
 * QA/QC audits and the monthly report: where a finding stands and when it is late, what an audit needs
 * before it is saved, and the report's months, pass rate, NCR ages, counts and totals, with no database. CI runs it after
 * the build:
 *
 *   node dist/scripts/qa-audits-test.js
 */
import assert from 'node:assert/strict';
import { FINDING_CLOSE_DAYS, auditCounts, auditProblem, countBy, findingOverdue, findingState, isExternalAudit, monthBounds, ncrAgeBand, passRate, reportRowHasWork, reportTotals, type QaReportRowDto } from '@erp/shared';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);

test('a finding is open, followed through its NCR until that closes, or closed', () => {
  assert.equal(findingState({ closedOn: null, ncrStatus: null }), 'OPEN');
  assert.equal(findingState({ closedOn: '2026-10-01', ncrStatus: null }), 'CLOSED');
  assert.equal(findingState({ closedOn: null, ncrStatus: 'OPEN' }), 'NCR');
  assert.equal(findingState({ closedOn: null, ncrStatus: 'ACTION_TAKEN' }), 'NCR');
  assert.equal(findingState({ closedOn: null, ncrStatus: 'CLOSED' }), 'CLOSED');
});

test(`a finding open past ${FINDING_CLOSE_DAYS} days from its audit is late by the days over`, () => {
  const open = { closedOn: null, ncrStatus: null };
  assert.equal(findingOverdue(open, '2026-10-01', '2026-10-16'), null);
  assert.equal(findingOverdue(open, '2026-10-01', '2026-10-17'), 1);
  assert.equal(findingOverdue({ closedOn: null, ncrStatus: 'OPEN' }, '2026-09-01', '2026-10-01'), 15);
  assert.equal(findingOverdue({ closedOn: '2026-10-02', ncrStatus: null }, '2026-09-01', '2026-10-29'), null);
});

test('an audit is recorded on or after its day, a visit from outside names who came, and no finding is blank', () => {
  const ok = { kind: 'INTERNAL' as const, date: '2026-10-20', visitor: null, findings: [{ text: 'Curing tank without a thermometer' }] };
  assert.equal(auditProblem(ok, '2026-10-29'), null);
  assert.match(auditProblem({ ...ok, date: '2026-10-30' }, '2026-10-29') ?? '', /not ahead/);
  assert.match(auditProblem({ ...ok, kind: 'TPI', visitor: ' ' }, '2026-10-29') ?? '', /who visited/);
  assert.equal(auditProblem({ ...ok, kind: 'TPI', visitor: 'Third-party inspection agency' }, '2026-10-29'), null);
  assert.match(auditProblem({ ...ok, findings: [{ text: '  ' }] }, '2026-10-29') ?? '', /each finding/);
  assert.equal(isExternalAudit('INTERNAL'), false);
  assert.equal(isExternalAudit('DEPARTMENT'), true);
});

test('an audit counts its findings closed on their own or through a closed NCR', () => {
  assert.deepEqual(
    auditCounts([
      { closedOn: null, ncrStatus: null },
      { closedOn: '2026-10-02', ncrStatus: null },
      { closedOn: null, ncrStatus: 'CLOSED' },
      { closedOn: null, ncrStatus: 'OPEN' },
    ]),
    { total: 4, open: 2, closed: 2 },
  );
});

test('a month runs from its first to its last day, February in a leap year included', () => {
  assert.deepEqual(monthBounds('2026-10'), { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(monthBounds('2028-02'), { from: '2028-02-01', to: '2028-02-29' });
  assert.deepEqual(monthBounds('2027-02'), { from: '2027-02-01', to: '2027-02-28' });
});

test('the pass rate is of tests decided, and none decided has no rate', () => {
  assert.equal(passRate(0, 0), null);
  assert.equal(passRate(19, 1), 95);
  assert.equal(passRate(2, 1), 67);
});

test('an open NCR is up to 15 days, 16 to 30, or over 30 days old', () => {
  assert.equal(ncrAgeBand('2026-10-14', '2026-10-29'), 'UP_TO_15');
  assert.equal(ncrAgeBand('2026-10-13', '2026-10-29'), 'UP_TO_30');
  assert.equal(ncrAgeBand('2026-09-29', '2026-10-29'), 'UP_TO_30');
  assert.equal(ncrAgeBand('2026-09-28', '2026-10-29'), 'OVER_30');
});

test('counts by code put the largest first and call a missing code Not given', () => {
  const rows = countBy(['workmanship', null, 'material', 'workmanship', null, null], (c) => c[0].toUpperCase() + c.slice(1));
  assert.deepEqual(rows, [
    { code: null, name: 'Not given', count: 3 },
    { code: 'workmanship', name: 'Workmanship', count: 2 },
    { code: 'material', name: 'Material', count: 1 },
  ]);
});

test("the report's totals add the rows and take the pass rate from the summed counts", () => {
  const row = (p: Partial<QaReportRowDto>): QaReportRowDto => ({
    projectId: 'p',
    projectName: 'P',
    tests: 0,
    passed: 0,
    failed: 0,
    passRate: null,
    short: 0,
    ncrsRaised: 0,
    ncrsClosed: 0,
    ncrsOpen: 0,
    ncrsOver30: 0,
    reworkCost: '0.00',
    audits: 0,
    findingsOpen: 0,
    cubesFailing: [],
    ...p,
  });
  const t = reportTotals([row({ tests: 10, passed: 9, failed: 1, passRate: 90, reworkCost: '18500.00', cubesFailing: ['M25'] }), row({ tests: 2, passed: 1, failed: 1, passRate: 50, short: 3, findingsOpen: 2 })]);
  assert.equal(t.tests, 12);
  assert.equal(t.passRate, 83); // 10 of 12, not the average of 90 and 50
  assert.equal(t.short, 3);
  assert.equal(t.reworkCost, '18500.00');
  assert.equal(t.cubesFailing, 1);
  assert.equal(t.findingsOpen, 2);
  assert.equal(reportRowHasWork(row({})), false);
  assert.equal(reportRowHasWork(row({ short: 1 })), true);
  assert.equal(reportRowHasWork(row({ reworkCost: '500.00' })), true);
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
