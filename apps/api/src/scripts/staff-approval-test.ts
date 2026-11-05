/** Reporting lines: leave, overtime and corrections wait on the manager, then HR. Run: node dist/scripts/staff-approval-test.js */
import assert from 'node:assert/strict';
import { staffDecision, staffTurn, staffWaitsOn, staffWaitWords, type RoleKey, type StaffLine, type StaffRequestState } from '@erp/shared';

const emp = 'u-emp';
const ravi = { userId: 'u-ravi', name: 'Ravi Kumar', active: true };
const pm = { userId: 'u-pm', name: 'Priya Menon', active: true };
const hr = { id: 'u-hr', roleKey: 'HR_MANAGER' as RoleKey };
const asRavi = { id: ravi.userId, roleKey: 'QA_QC_ENGINEER' as RoleKey };
const asPm = { id: pm.userId, roleKey: 'PROJECT_MANAGER' as RoleKey };

const line = (l: Partial<StaffLine> = {}): StaffLine => ({ employeeUserId: emp, reportsTo: ravi, siteManager: pm, ...l });
const waiting: StaffRequestState = { status: 'PENDING', appliedById: emp, recommendedById: null };
const recommended: StaffRequestState = { ...waiting, recommendedById: ravi.userId };
const result = (o: ReturnType<typeof staffDecision>) => (o.ok ? o.result : `refused: ${o.problem}`);

const cases: [string, () => void][] = [
  ['a new request waits on the person they report to, not HR or the site manager', () => {
    assert.equal(staffWaitWords(staffWaitsOn(waiting, line())), 'Ravi Kumar, their manager');
    assert.equal(result(staffDecision(waiting, line(), asRavi, 'APPROVE')), 'RECOMMENDED');
    assert.match(result(staffDecision(waiting, line(), hr, 'APPROVE')), /refused: This waits on Ravi Kumar, their manager, first/);
    assert.match(result(staffDecision(waiting, line(), asPm, 'APPROVE')), /refused/);
  }],
  ['once recommended it waits on HR, and the manager cannot decide it again', () => {
    assert.equal(staffWaitWords(staffWaitsOn(recommended, line())), 'HR');
    assert.equal(result(staffDecision(recommended, line(), hr, 'APPROVE')), 'APPROVED');
    assert.equal(result(staffDecision(recommended, line(), hr, 'REJECT')), 'REJECTED');
    assert.match(result(staffDecision(recommended, line(), asRavi, 'APPROVE')), /refused: Recommended; HR approves it now/);
  }],
  ['the manager can reject at the first step, which ends it', () => {
    assert.equal(result(staffDecision(waiting, line(), asRavi, 'REJECT')), 'REJECTED');
    assert.equal(staffWaitsOn({ ...waiting, status: 'REJECTED' }, line()), null);
  }],
  ['a manager who is a staff admin approves it outright: no second step for HR', () => {
    const asAdminManager = { id: ravi.userId, roleKey: 'MANAGEMENT' as RoleKey };
    assert.equal(result(staffDecision(waiting, line(), asAdminManager, 'APPROVE')), 'APPROVED');
    assert.deepEqual(staffTurn(waiting, line(), asAdminManager), { mine: true, recommends: false });
    assert.deepEqual(staffTurn(waiting, line(), asRavi), { mine: true, recommends: true });
  }],
  ['with no login to report to, the posting project manager is the first step', () => {
    const noManager = line({ reportsTo: null });
    assert.equal(staffWaitWords(staffWaitsOn(waiting, noManager)), "Priya Menon, the site's project manager");
    assert.equal(result(staffDecision(waiting, noManager, asPm, 'APPROVE')), 'RECOMMENDED');
  }],
  ['a manager whose login is off (they left) is passed over', () => {
    const left = line({ reportsTo: { ...ravi, active: false } });
    assert.equal(staffWaitWords(staffWaitsOn(waiting, left)), "Priya Menon, the site's project manager");
    assert.match(result(staffDecision(waiting, left, asRavi, 'APPROVE')), /refused/);
  }],
  ['with neither, the first step is skipped and HR decides it', () => {
    const none = line({ reportsTo: null, siteManager: null });
    assert.equal(staffWaitWords(staffWaitsOn(waiting, none)), 'HR');
    assert.equal(result(staffDecision(waiting, none, hr, 'APPROVE')), 'APPROVED');
    assert.match(result(staffDecision(waiting, none, asPm, 'APPROVE')), /refused: HR decides this/);
  }],
  ['a project manager who is the employee themselves is no first step', () => {
    const ownSite = line({ employeeUserId: pm.userId, reportsTo: null });
    assert.equal(staffWaitWords(staffWaitsOn({ ...waiting, appliedById: pm.userId }, ownSite)), 'HR');
  }],
  ['nobody decides their own request, HR and admins included', () => {
    const hrOwn = line({ employeeUserId: hr.id, reportsTo: null, siteManager: null });
    assert.match(result(staffDecision({ ...waiting, appliedById: hr.id }, hrOwn, hr, 'APPROVE')), /refused: You cannot decide your own request/);
    const enteredByHr = { ...waiting, appliedById: hr.id };
    assert.match(result(staffDecision({ ...enteredByHr, recommendedById: ravi.userId }, line(), hr, 'APPROVE')), /refused: You made this entry/);
    assert.equal(result(staffDecision({ ...enteredByHr, recommendedById: ravi.userId }, line(), { id: 'u-md', roleKey: 'ADMIN' }, 'APPROVE')), 'APPROVED');
  }],
  ['an ended request takes no decision', () => {
    for (const status of ['APPROVED', 'REJECTED', 'CANCELLED'] as const) {
      assert.match(result(staffDecision({ ...waiting, status }, line(), hr, 'APPROVE')), /refused: This has already been decided or cancelled/);
      assert.deepEqual(staffTurn({ ...waiting, status }, line(), hr), { mine: false, recommends: false });
    }
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
