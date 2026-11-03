/** HR reports: who is on the roll, the moves over a period, attrition, service, PF and ESI due, attendance. Run: node dist/scripts/hr-reports-test.js */
import assert from 'node:assert/strict';
import { attendancePct, canReadReport, headcountMoves, onRollOn, serviceYears, statutoryDueOn } from '@erp/shared';

const staff = [
  { joinedOn: '2020-04-01', leftOn: null }, // on the roll throughout
  { joinedOn: '2021-06-15', leftOn: '2026-05-31' }, // left in the period
  { joinedOn: '2026-07-01', leftOn: null }, // joined in the period
  { joinedOn: '2026-08-01', leftOn: '2026-09-30' }, // joined and left in it
  { joinedOn: '2027-01-01', leftOn: null }, // after the period
  { joinedOn: null, leftOn: null }, // from before the records
  { joinedOn: '2019-01-01', leftOn: '2026-03-31' }, // left the day before
  { joinedOn: '2026-04-01', leftOn: null }, // joined on the first day
  { joinedOn: '2022-01-01', leftOn: '2026-10-31' }, // left on the last day
];

const cases: [string, () => void][] = [
  ['on the roll: joined by the day and not past the last day', () => {
    assert.equal(onRollOn({ joinedOn: '2026-04-01', leftOn: null }, '2026-04-01'), true);
    assert.equal(onRollOn({ joinedOn: '2026-04-02', leftOn: null }, '2026-04-01'), false);
    assert.equal(onRollOn({ joinedOn: '2026-01-01', leftOn: '2026-04-01' }, '2026-04-01'), true, 'the last day is a day on the roll');
    assert.equal(onRollOn({ joinedOn: '2026-01-01', leftOn: '2026-03-31' }, '2026-04-01'), false);
    assert.equal(onRollOn({ joinedOn: null, leftOn: null }, '2000-01-01'), true);
  }],
  ['the period’s moves, with someone who joined and left inside it', () => {
    const m = headcountMoves(staff, '2026-04-01', '2026-10-31');
    assert.deepEqual({ ...m, attritionPct: undefined }, { atStart: 4, joined: 3, left: 3, atEnd: 4, attritionPct: undefined });
    assert.equal(m.atStart + m.joined - m.left, m.atEnd);
    assert.equal(m.attritionPct, 75);
  }],
  ['nobody on the roll: no attrition rather than a division by nought', () => assert.equal(headcountMoves([], '2026-04-01', '2026-10-31').attritionPct, null)],
  ['years of service, to one place', () => {
    assert.equal(serviceYears('2021-06-15', '2026-05-31'), 4.9);
    assert.equal(serviceYears(null, '2026-05-31'), null);
    assert.equal(serviceYears('2027-01-01', '2026-05-31'), null);
  }],
  ['PF and ESI are due on the 15th of the next month', () => {
    assert.equal(statutoryDueOn('2026-10'), '2026-11-15');
    assert.equal(statutoryDueOn('2026-12'), '2027-01-15');
  }],
  ['attendance against the working days so far', () => {
    assert.equal(attendancePct({ present: 18.5, onLeave: 1, absent: 0.5, notMarked: 2 }), 84.1);
    assert.equal(attendancePct({ present: 0, onLeave: 0, absent: 0, notMarked: 0 }), null);
  }],
  ['HR reports are for the people who see payroll, not site managers', () => {
    assert.equal(canReadReport('HR_MANAGER', 'pf-esi'), true);
    assert.equal(canReadReport('ACCOUNTS_MANAGER', 'staff-cost'), true);
    assert.equal(canReadReport('MANAGEMENT', 'headcount'), true);
    assert.equal(canReadReport('PROJECT_MANAGER', 'leave-register'), false);
    assert.equal(canReadReport('HR_MANAGER', 'mis'), false, 'HR does not read the management MIS');
    assert.equal(canReadReport('HR_MANAGER', 'labour'), true, 'HR keeps its labour report');
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
