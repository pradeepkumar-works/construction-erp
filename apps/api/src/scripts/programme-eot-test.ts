/**
 * Programme and EOT tests (ARCHITECTURE "Programme and EOT"): the revision in force, the day the programme
 * obligation was met, the watch on the next programme, what stops a revision or an answer, an application's state and
 * its 30 days, the extension for added work in proportion, the split of days granted over the delays, and what stops an
 * application, its forwarding and its decision.
 *
 *   node dist/scripts/programme-eot-test.js
 */
import assert from 'node:assert/strict';
import {
  EOT_DECISION_DAYS,
  allocateGranted,
  eotApplyProblem,
  eotDecisionDue,
  eotDecisionProblem,
  eotForwardProblem,
  eotState,
  programmeDecisionProblem,
  programmeInForce,
  programmeLabel,
  programmeMetOn,
  programmeObligationMetOn,
  programmeSubmitProblem,
  programmeWatch,
  variationEotDays,
  type EotRow,
  type ProgrammeRow,
} from '@erp/shared';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

const rev = (revision: number, status: ProgrammeRow['status'], submittedOn: string): ProgrammeRow => ({ revision, status, submittedOn });

test('the revision in force is the latest approved one', () => {
  assert.equal(programmeInForce([]), null);
  const rows = [rev(0, 'APPROVED', '2026-04-14'), rev(1, 'RETURNED', '2026-05-14'), rev(2, 'APPROVED', '2026-05-28'), rev(3, 'SUBMITTED', '2026-06-27')];
  assert.equal(programmeInForce(rows)?.revision, 2);
  assert.equal(programmeLabel(0), 'Rev 0');
});

test('the programme obligation is met by the first revision the Engineer did not return', () => {
  assert.equal(programmeMetOn([]), null);
  assert.equal(programmeMetOn([rev(0, 'RETURNED', '2026-04-10')]), null);
  assert.equal(programmeMetOn([rev(0, 'RETURNED', '2026-04-10'), rev(1, 'SUBMITTED', '2026-04-20')]), '2026-04-20');
  assert.equal(programmeMetOn([rev(0, 'APPROVED', '2026-04-10'), rev(1, 'APPROVED', '2026-05-10')]), '2026-04-10');
});

test('a programme the Contract tab marked as met before the register stands, and counts as the first one sent', () => {
  // Met on 10 Apr by hand; Rev 1 goes on 20 May: the obligation keeps 10 Apr, and the next update counts from 20 May.
  assert.equal(programmeObligationMetOn([rev(1, 'SUBMITTED', '2026-05-20')], '2026-04-10'), '2026-04-10');
  assert.equal(programmeObligationMetOn([], '2026-04-10'), '2026-04-10');
  // A day the register set follows the register: the only revision returned or deleted opens it again.
  assert.equal(programmeObligationMetOn([rev(0, 'RETURNED', '2026-04-10')], '2026-04-10'), null);
  assert.equal(programmeObligationMetOn([rev(0, 'RETURNED', '2026-04-10'), rev(1, 'SUBMITTED', '2026-04-20')], null), '2026-04-20');
  assert.deepEqual(programmeWatch([], '2026-04-16', 30, '2026-05-01', true, '2026-04-10'), { first: false, nextDue: '2026-05-10', state: 'UPCOMING', daysLeft: 9, daysLate: null });
  assert.equal(programmeWatch([rev(1, 'SUBMITTED', '2026-05-20')], '2026-04-16', 30, '2026-06-01', true, '2026-04-10').nextDue, '2026-06-19');
});

test('before any revision the first programme is due on the obligation day', () => {
  assert.deepEqual(programmeWatch([], '2026-04-16', 30, '2026-04-01'), { first: true, nextDue: '2026-04-16', state: 'UPCOMING', daysLeft: 15, daysLate: null });
  assert.equal(programmeWatch([], '2026-04-16', 30, '2026-04-10').state, 'DUE_SOON');
  assert.deepEqual(programmeWatch([], '2026-04-16', 30, '2026-04-20'), { first: true, nextDue: '2026-04-16', state: 'OVERDUE', daysLeft: null, daysLate: 4 });
  // No agreement date, no obligation: nothing to count from.
  assert.equal(programmeWatch([], null, 30, '2026-04-20').state, 'NO_DATE');
  // A returned first programme is not a programme: still the first one, still overdue.
  assert.equal(programmeWatch([rev(0, 'RETURNED', '2026-04-14')], '2026-04-16', 30, '2026-04-20').state, 'OVERDUE');
});

test('an update is due the interval after the latest revision sent, answered or not', () => {
  const rows = [rev(0, 'APPROVED', '2026-04-14'), rev(1, 'SUBMITTED', '2026-05-12')];
  assert.deepEqual(programmeWatch(rows, '2026-04-16', 30, '2026-06-01'), { first: false, nextDue: '2026-06-11', state: 'UPCOMING', daysLeft: 10, daysLate: null });
  assert.equal(programmeWatch(rows, '2026-04-16', 30, '2026-06-11').state, 'DUE_SOON');
  assert.equal(programmeWatch(rows, '2026-04-16', 30, '2026-06-12').daysLate, 1);
  // A fortnightly contract.
  assert.equal(programmeWatch(rows, '2026-04-16', 14, '2026-05-20').nextDue, '2026-05-26');
  // Works complete: nothing more is due.
  assert.equal(programmeWatch(rows, '2026-04-16', 30, '2026-09-01', false).state, 'NO_DATE');
});

test('one revision with the Engineer at a time, in date order, not after today', () => {
  assert.equal(programmeSubmitProblem([], '2026-04-14', '2026-04-14'), null);
  assert.match(programmeSubmitProblem([], '2026-04-15', '2026-04-14')!, /after today/);
  assert.match(programmeSubmitProblem([rev(0, 'SUBMITTED', '2026-04-14')], '2026-05-01', '2026-05-01')!, /^Rev 0 is still with the Engineer/);
  assert.match(programmeSubmitProblem([rev(0, 'APPROVED', '2026-04-14')], '2026-04-10', '2026-05-01')!, /cannot be dated before Rev 0/);
  assert.equal(programmeSubmitProblem([rev(0, 'RETURNED', '2026-04-14')], '2026-04-20', '2026-05-01'), null);
});

test("the Engineer answers a waiting revision once, on or after it went, and a return carries the comments", () => {
  const waiting = rev(1, 'SUBMITTED', '2026-05-12');
  assert.equal(programmeDecisionProblem(waiting, 'APPROVED', '2026-05-20', null, '2026-05-20'), null);
  assert.match(programmeDecisionProblem(waiting, 'RETURNED', '2026-05-20', ' ', '2026-05-20')!, /comments/);
  assert.match(programmeDecisionProblem(waiting, 'APPROVED', '2026-05-10', null, '2026-05-20')!, /before the revision was sent/);
  assert.match(programmeDecisionProblem(waiting, 'APPROVED', '2026-05-21', null, '2026-05-20')!, /after today/);
  assert.match(programmeDecisionProblem({ ...waiting, status: 'APPROVED' }, 'APPROVED', '2026-05-20', null, '2026-05-20')!, /already been answered/);
});

const app = (over: Partial<EotRow> = {}): EotRow => ({ status: 'SENT', appliedOn: '2026-10-01', daysClaimed: 21, grantedDays: null, ...over });

test('a decision is due 30 days after the application, and is overdue the day after', () => {
  assert.equal(EOT_DECISION_DAYS, 30);
  assert.equal(eotDecisionDue('2026-10-01'), '2026-10-31');
  assert.equal(eotState(app(), '2026-10-31'), 'SENT');
  assert.equal(eotState(app({ status: 'FORWARDED' }), '2026-10-31'), 'FORWARDED');
  assert.equal(eotState(app(), '2026-11-01'), 'OVERDUE');
  assert.equal(eotState(app({ status: 'FORWARDED' }), '2026-11-01'), 'OVERDUE');
});

test('a decision is granted in full, in part or refused, and a withdrawal stands', () => {
  assert.equal(eotState(app({ status: 'DECIDED', grantedDays: 21 }), '2026-12-01'), 'GRANTED');
  assert.equal(eotState(app({ status: 'DECIDED', grantedDays: 14 }), '2026-12-01'), 'PART_GRANTED');
  assert.equal(eotState(app({ status: 'DECIDED', grantedDays: 0 }), '2026-12-01'), 'REFUSED');
  assert.equal(eotState(app({ status: 'WITHDRAWN' }), '2026-12-01'), 'WITHDRAWN');
});

test('time for added work is the contract period in proportion to the value added, rounded up', () => {
  // 18 months (548 days) on ₹12 crore; a ₹45 lakh variation is 20.55 days: 21.
  assert.equal(variationEotDays(548, 120_000_000, 4_500_000), 21);
  assert.equal(variationEotDays(365, 100_000_000, 10_000_000), 37); // 36.5 → 37
  assert.equal(variationEotDays(360, 100_000_000, 10_000_000), 36); // exactly 36
  assert.equal(variationEotDays(0, 100_000_000, 10_000_000), 0);
  assert.equal(variationEotDays(365, 0, 10_000_000), 0);
  assert.equal(variationEotDays(365, 100_000_000, -5), 0);
});

test('days granted go to the delays oldest first, each up to its days lost, the rest on the last', () => {
  const delays = [
    { id: 'b', start: '2026-07-10', daysLost: 12 },
    { id: 'a', start: '2026-06-01', daysLost: 10 },
    { id: 'c', start: '2026-08-01', daysLost: 5 },
  ];
  assert.deepEqual(allocateGranted(27, delays), { a: 10, b: 12, c: 5 });
  assert.deepEqual(allocateGranted(15, delays), { a: 10, b: 5, c: 0 });
  // More than the days lost (the authority's own count): the excess sits on the last.
  assert.deepEqual(allocateGranted(30, delays), { a: 10, b: 12, c: 8 });
  assert.deepEqual(allocateGranted(0, delays), { a: 0, b: 0, c: 0 });
  assert.deepEqual(allocateGranted(9, [{ id: 'x', start: null, daysLost: 0 }]), { x: 9 });
  const total = Object.values(allocateGranted(19, delays)).reduce((s, n) => s + n, 0);
  assert.equal(total, 19);
});

test('an application names its grounds, at least a day, and the delays or the variation it is for', () => {
  const base = { basis: 'DELAY' as const, appliedOn: '2026-10-01', daysClaimed: 21, grounds: 'Site handed over late', delayIds: ['d1'], variationId: null };
  assert.equal(eotApplyProblem(base, '2026-10-01'), null);
  assert.match(eotApplyProblem({ ...base, appliedOn: '2026-10-02' }, '2026-10-01')!, /after today/);
  assert.match(eotApplyProblem({ ...base, daysClaimed: 0 }, '2026-10-01')!, /at least one day/);
  assert.match(eotApplyProblem({ ...base, grounds: '  ' }, '2026-10-01')!, /grounds/);
  assert.match(eotApplyProblem({ ...base, delayIds: [] }, '2026-10-01')!, /Choose the delays/);
  assert.match(eotApplyProblem({ ...base, basis: 'VARIATION', delayIds: [] }, '2026-10-01')!, /Choose the variation/);
  assert.equal(eotApplyProblem({ ...base, basis: 'VARIATION', delayIds: [], variationId: 'v1' }, '2026-10-01'), null);
});

test('the Engineer forwards a waiting application once, recommending no more than was claimed', () => {
  assert.equal(eotForwardProblem(app(), '2026-10-05', 14, '2026-10-05'), null);
  assert.equal(eotForwardProblem(app(), '2026-10-05', null, '2026-10-05'), null);
  assert.match(eotForwardProblem(app({ status: 'FORWARDED' }), '2026-10-05', 14, '2026-10-05')!, /already been forwarded/);
  assert.match(eotForwardProblem(app({ status: 'DECIDED', grantedDays: 7 }), '2026-10-05', 14, '2026-10-05')!, /decided/);
  assert.match(eotForwardProblem(app(), '2026-09-30', 14, '2026-10-05')!, /before it was made/);
  assert.match(eotForwardProblem(app(), '2026-10-05', 22, '2026-10-05')!, /between 0 and the 21 days claimed/);
});

test('the authority decides once, between 0 and the days claimed, on or after the application', () => {
  assert.equal(eotDecisionProblem(app({ status: 'FORWARDED' }), '2026-10-20', 14, '2026-10-20'), null);
  assert.equal(eotDecisionProblem(app(), '2026-10-20', 0, '2026-10-20'), null);
  assert.match(eotDecisionProblem(app(), '2026-10-20', 22, '2026-10-20')!, /between 0 and the 21 days claimed/);
  assert.match(eotDecisionProblem(app(), '2026-09-20', 7, '2026-10-20')!, /before the application/);
  assert.match(eotDecisionProblem(app(), '2026-10-21', 7, '2026-10-20')!, /after today/);
  assert.match(eotDecisionProblem(app({ status: 'DECIDED', grantedDays: 7 }), '2026-10-20', 7, '2026-10-20')!, /already decided/);
  assert.match(eotDecisionProblem(app({ status: 'WITHDRAWN' }), '2026-10-20', 7, '2026-10-20')!, /withdrawn/);
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
