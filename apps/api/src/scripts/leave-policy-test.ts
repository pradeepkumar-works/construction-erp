/** The company's leave rules: days a year, pro rata for joiners, earned leave carried forward. Run: node dist/scripts/leave-policy-test.js */
import assert from 'node:assert/strict';
import { DEFAULT_LEAVE_POLICY, leaveEntitlement, type LeavePolicy } from '@erp/shared';

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
  ['a joiner has no earlier year to carry from', () => assert.equal(leaveEntitlement('EARNED', policy({ earnedCarryMax: 10 }), 2026, '2026-03-01', 6), 15)],
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
