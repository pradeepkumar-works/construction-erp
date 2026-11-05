/** The company's leave rules: days a year, pro rata for joiners, earned leave carried forward. Run: node dist/scripts/leave-policy-test.js */
import assert from 'node:assert/strict';
import { DEFAULT_LEAVE_POLICY, isWeeklyOff, leaveDays, leaveEntitlement, leaveOpeningProblem, leaveYearLabel, leaveYearOf, leaveYearRange, weeklyOffOf, type LeavePolicy } from '@erp/shared';

const policy = (p: Partial<LeavePolicy>): LeavePolicy => ({ ...DEFAULT_LEAVE_POLICY, ...p });

const cases: [string, () => void][] = [
  ['the standard days: casual 12, sick 12, earned 15, no carry, no pro rata', () => {
    assert.equal(leaveEntitlement('CASUAL', DEFAULT_LEAVE_POLICY, 2026, '2020-04-01'), 12);
    assert.equal(leaveEntitlement('SICK', DEFAULT_LEAVE_POLICY, 2026, null), 12);
    assert.equal(leaveEntitlement('EARNED', DEFAULT_LEAVE_POLICY, 2026, '2020-04-01', 9), 15);
  }],
  ['unpaid, on duty and tour have no yearly limit', () => {
    assert.equal(leaveEntitlement('UNPAID', DEFAULT_LEAVE_POLICY, 2026, null), null);
    assert.equal(leaveEntitlement('ON_DUTY', DEFAULT_LEAVE_POLICY, 2026, null), null);
  }],
  ['the company sets its own days', () => {
    const p = policy({ casual: 8, sick: 7, earned: 18 });
    assert.equal(leaveEntitlement('CASUAL', p, 2026, null), 8);
    assert.equal(leaveEntitlement('SICK', p, 2026, null), 7);
    assert.equal(leaveEntitlement('EARNED', p, 2026, null), 18);
  }],
  ['someone joining after the year has none of it', () => assert.equal(leaveEntitlement('CASUAL', DEFAULT_LEAVE_POLICY, 2026, '2027-01-05'), 0)],
  ['without pro rata a joiner gets the whole year', () => assert.equal(leaveEntitlement('CASUAL', DEFAULT_LEAVE_POLICY, 2026, '2026-10-01'), 12)],
  ['pro rata: the months left from the joining month, rounded down to a half day', () => {
    const p = policy({ proRata: true });
    assert.equal(leaveEntitlement('CASUAL', p, 2026, '2026-01-20'), 12);
    assert.equal(leaveEntitlement('CASUAL', p, 2026, '2026-10-01'), 3);
    assert.equal(leaveEntitlement('EARNED', p, 2026, '2026-08-14'), 6); // 15 × 5 / 12 = 6.25
    assert.equal(leaveEntitlement('EARNED', p, 2026, '2026-07-01'), 7.5); // 15 × 6 / 12
    assert.equal(leaveEntitlement('SICK', p, 2026, '2026-12-31'), 1);
    assert.equal(leaveEntitlement('CASUAL', p, 2026, '2024-06-01'), 12, 'only the joining year is cut');
  }],
  ['earned leave carries up to the limit; nothing negative, and only earned', () => {
    const p = policy({ earnedCarryMax: 10 });
    assert.equal(leaveEntitlement('EARNED', p, 2026, '2022-01-01', 6), 21);
    assert.equal(leaveEntitlement('EARNED', p, 2026, '2022-01-01', 14), 25);
    assert.equal(leaveEntitlement('EARNED', p, 2026, '2022-01-01', -3), 15);
    assert.equal(leaveEntitlement('CASUAL', p, 2026, '2022-01-01', 6), 12);
  }],
  ['earned leave brought forward from the old records stands in for the carry, as entered', () => {
    assert.equal(leaveEntitlement('EARNED', DEFAULT_LEAVE_POLICY, 2026, '2019-06-01', 0, 22), 37);
    assert.equal(leaveEntitlement('EARNED', policy({ earnedCarryMax: 10 }), 2026, '2019-06-01', 6, 0), 15, 'brought forward 0 means none, not the carry');
    assert.equal(leaveEntitlement('CASUAL', DEFAULT_LEAVE_POLICY, 2026, null, 0, 5), 12, 'only earned leave is brought forward');
  }],
  ['opening leave: half days, earned only brought forward, each type once', () => {
    assert.equal(leaveOpeningProblem([{ type: 'CASUAL', takenBefore: 3.5, broughtForward: null }, { type: 'EARNED', takenBefore: 0, broughtForward: 18 }]), null);
    assert.match(leaveOpeningProblem([{ type: 'CASUAL', takenBefore: 1.25, broughtForward: null }])!, /whole or half days/);
    assert.match(leaveOpeningProblem([{ type: 'SICK', takenBefore: 0, broughtForward: 4 }])!, /Only earned leave/);
    assert.match(leaveOpeningProblem([{ type: 'UNPAID', takenBefore: 2, broughtForward: null }])!, /no yearly balance/);
    assert.match(leaveOpeningProblem([{ type: 'CASUAL', takenBefore: 1, broughtForward: null }, { type: 'CASUAL', takenBefore: 2, broughtForward: null }])!, /once/);
  }],
  ['a joiner has no earlier year to carry from', () => assert.equal(leaveEntitlement('EARNED', policy({ earnedCarryMax: 10 }), 2026, '2026-03-01', 6), 15)],
  ['an April to March leave year is named by the year it starts in', () => {
    assert.equal(leaveYearOf('2027-02-10', 4), 2026);
    assert.equal(leaveYearOf('2027-04-01', 4), 2027);
    assert.equal(leaveYearOf('2027-03-31', 4), 2026);
    assert.equal(leaveYearOf('2027-02-10'), 2027);
    assert.deepEqual(leaveYearRange(2026, 4), { from: '2026-04-01', to: '2027-03-31' });
    assert.deepEqual(leaveYearRange(2026), { from: '2026-01-01', to: '2026-12-31' });
    assert.equal(leaveYearLabel(2026, 4), '2026-27');
    assert.equal(leaveYearLabel(2099, 4), '2099-00');
    assert.equal(leaveYearLabel(2026), '2026');
  }],
  ['pro rata counts the months left in the leave year, the joining month included', () => {
    const april = policy({ proRata: true, yearStart: 4 });
    // Joined in October 2026: October to March is 6 months of 12.
    assert.equal(leaveEntitlement('CASUAL', april, 2026, '2026-10-15'), 6);
    // Joined in February 2027: still leave year 2026, February and March left.
    assert.equal(leaveEntitlement('CASUAL', april, 2026, '2027-02-01'), 2);
    // Joined in April: the whole year.
    assert.equal(leaveEntitlement('CASUAL', april, 2027, '2027-04-01'), 12);
    // Not yet joined in that leave year.
    assert.equal(leaveEntitlement('CASUAL', april, 2025, '2026-05-01'), 0);
    // Calendar year as before: joined in October, 3 months.
    assert.equal(leaveEntitlement('CASUAL', policy({ proRata: true }), 2026, '2026-10-01'), 3);
  }],
  ['the weekly off is the site’s own day, else the company’s, else Sunday', () => {
    assert.equal(weeklyOffOf({ weeklyOff: 5 }, 0), 5);
    assert.equal(weeklyOffOf({ weeklyOff: null }, 1), 1);
    assert.equal(weeklyOffOf(null), 0);
    assert.equal(weeklyOffOf({ weeklyOff: 9 }, 2), 2);
    // 6 Nov 2026 is a Friday, 8 Nov a Sunday.
    assert.ok(isWeeklyOff('2026-11-06', 5));
    assert.ok(isWeeklyOff('2026-11-08'));
    assert.ok(!isWeeklyOff('2026-11-08', 5));
  }],
  ['leave days leave out the site’s weekly off and holidays', () => {
    // Mon 2 Nov to Sun 8 Nov 2026: 6 days with Sunday off, 6 with Friday off.
    assert.equal(leaveDays('2026-11-02', '2026-11-08', false), 6);
    assert.equal(leaveDays('2026-11-02', '2026-11-08', false, new Set(), 5), 6);
    assert.equal(leaveDays('2026-11-02', '2026-11-08', false, new Set(['2026-11-04']), 5), 5);
    // A half day on the weekly off takes nothing.
    assert.equal(leaveDays('2026-11-06', '2026-11-06', true, new Set(), 5), 0);
    assert.equal(leaveDays('2026-11-06', '2026-11-06', true), 0.5);
  }],
];

let failed = 0;
for (const [name, fn] of cases) {
  try {
    fn();
    console.log(`ok  ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n  ${(e as Error).message}`);
  }
}
console.log(`${cases.length - failed}/${cases.length} passed`);
if (failed) process.exit(1);
