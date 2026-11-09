/**
 * Approval levels' tests: how many levels an amount needs, which level an entry waits at, who may decide
 * it (and why not) by role, position or delegation, whose queue it is in, and escalation. No database. CI runs it after the build:
 *
 *   node dist/scripts/approval-levels-test.js
 */
import assert from 'node:assert/strict';
import { delegationActive, delegationProblem, levelsNeeded, ownEntryProblem, positionApprover, roleApprover, type RoleKey } from '@erp/shared';
import { approverKeys, approverName, escalationKeys, levelKeys, levelsPassed, mayDecide, queueKeys, rightsOf, stageOf, type Holding, type LevelRule, type LevelStep } from '../common/approval-levels';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);

const round = new Date('2026-10-20T04:00:00Z');
const at = (h: number) => new Date(round.getTime() + h * 3_600_000);
const rule = (roleKey: RoleKey, level: number, extra: Partial<LevelRule> = {}): LevelRule => ({ approver: roleApprover(roleKey), type: 'PURCHASE_ORDER', level, maxAmount: null, minAmount: null, ...extra });
const post = (code: string, level: number, extra: Partial<LevelRule> = {}): LevelRule => ({ approver: positionApprover(code), type: 'PURCHASE_ORDER', level, maxAmount: null, minAmount: null, ...extra });
// Purchase orders: the PM approves up to ₹5 lakh, procurement up to ₹10 lakh; management approves second above
// ₹2 lakh, and the MD (admin) third above ₹10 lakh through management's level-3 rule.
const RULES: LevelRule[] = [
  rule('PROJECT_MANAGER', 1, { maxAmount: '500000' }),
  rule('PROCUREMENT_MANAGER', 1, { maxAmount: '1000000' }),
  rule('MANAGEMENT', 2, { minAmount: '200000' }),
  rule('MANAGEMENT', 3, { minAmount: '1000000' }),
  rule('ACCOUNTS_MANAGER', 3, { minAmount: '1000000' }),
];
/** A person deciding by their role alone, with no positions and no one they act for. */
const as = (id: string, roleKey: RoleKey) => approverKeys({ id, roleKey }, 'p1', []);
const pm = as('u-pm', 'PROJECT_MANAGER');
const md = as('u-md', 'MANAGEMENT');
const accounts = as('u-ac', 'ACCOUNTS_MANAGER');
const SE = 'u-se';
const approved = (level: number, actorId: string, h = level, onBehalfOfId: string | null = null): LevelStep => ({ level, action: 'APPROVED', actorId, onBehalfOfId, createdAt: at(h) });

test('levels needed: one below the second threshold, two from it, three from the third', () => {
  const higher = RULES.filter((r) => r.level > 1);
  assert.equal(levelsNeeded('PURCHASE_ORDER', higher, '150000'), 1);
  assert.equal(levelsNeeded('PURCHASE_ORDER', higher, '200000'), 2);
  assert.equal(levelsNeeded('PURCHASE_ORDER', higher, '1200000'), 3);
  assert.equal(levelsNeeded('PURCHASE_ORDER', higher, null), 1, 'an unknown amount needs only the levels that always apply');
  assert.equal(levelsNeeded('PURCHASE_ORDER', [], '99999999'), 1, 'no higher levels: one approval, as before');
});

test('a level without an amount always applies; a type without amounts ignores them', () => {
  assert.equal(levelsNeeded('PURCHASE_ORDER', [{ level: 2, minAmount: null }], '10'), 2);
  assert.equal(levelsNeeded('DPR', [{ level: 2, minAmount: '500000' }], null), 2);
  assert.equal(levelsNeeded('PURCHASE_ORDER', [{ level: 3, minAmount: null }], '10'), 1, 'level 3 without level 2 never applies');
});

test('the stage: waiting at level 1, then 2 after the first approval, since that approval', () => {
  const fresh = stageOf('PURCHASE_ORDER', RULES, '400000', round, [], SE);
  assert.deepEqual([fresh.level, fresh.levels, fresh.since.getTime()], [1, 2, round.getTime()]);
  const next = stageOf('PURCHASE_ORDER', RULES, '400000', round, [approved(1, pm.id, 5)], SE);
  assert.deepEqual([next.level, next.levels, next.since.getTime(), next.approvedBy], [2, 2, at(5).getTime(), [pm.id]]);
});

test('two approvals at level 1 at once pass level 1 once: the entry still waits for level 2', () => {
  // A double tap, or the PM and procurement approving within the same moment, used to read as two levels done.
  const steps = [approved(1, pm.id, 5), approved(1, 'u-proc', 5.01)];
  assert.equal(levelsPassed(steps), 1);
  const s = stageOf('PURCHASE_ORDER', RULES, '1200000', round, steps, SE);
  assert.deepEqual([s.level, s.levels, s.since.getTime()], [2, 3, at(5).getTime()]);
  assert.equal(mayDecide(accounts, 'PURCHASE_ORDER', RULES, '1200000', s).ok, false, 'level 3 has not been reached');
  assert.equal(stageOf('PURCHASE_ORDER', RULES, '1200000', round, [...steps, approved(2, md.id, 6)], SE).level, 3);
  assert.equal(levelsPassed([{ level: 1, action: 'REMINDED' }, { level: 1, action: 'ESCALATED' }]), 0, 'only approvals pass a level');
});

test('who decides: the level-1 role within its limit, then the level-2 role; not the same person twice', () => {
  const s1 = stageOf('PURCHASE_ORDER', RULES, '400000', round, [], SE);
  assert.equal(mayDecide(pm, 'PURCHASE_ORDER', RULES, '400000', s1).ok, true);
  const early = mayDecide(md, 'PURCHASE_ORDER', RULES, '400000', s1);
  assert.equal(early.ok, false);
  assert.match(early.reason!, /waiting for level 1 first/);
  const s2 = stageOf('PURCHASE_ORDER', RULES, '400000', round, [approved(1, pm.id)], SE);
  assert.equal(mayDecide(md, 'PURCHASE_ORDER', RULES, '400000', s2).ok, true);
  const moved = mayDecide(as('u-pm2', 'PROJECT_MANAGER'), 'PURCHASE_ORDER', RULES, '400000', s2);
  assert.equal(moved.ok, false);
  assert.match(moved.reason!, /moved on to level 2/);
  // Management at level 2 and 3: the person who approved level 2 cannot approve level 3 as well.
  const s3 = stageOf('PURCHASE_ORDER', RULES, '1200000', round, [approved(1, 'u-proc'), approved(2, md.id)], SE);
  assert.equal(s3.level, 3);
  assert.match(mayDecide(md, 'PURCHASE_ORDER', RULES, '1200000', s3).reason!, /approved an earlier level/);
  assert.equal(mayDecide(as('u-md2', 'MANAGEMENT'), 'PURCHASE_ORDER', RULES, '1200000', s3).ok, true);
  assert.equal(mayDecide(accounts, 'PURCHASE_ORDER', RULES, '1200000', s3).ok, true);
  assert.equal(mayDecide(as('u-admin', 'ADMIN'), 'PURCHASE_ORDER', RULES, '1200000', s1).ok, true, 'admin decides any level');
});

test('the level-1 limit still sends a larger order to the role with the higher limit', () => {
  const s = stageOf('PURCHASE_ORDER', RULES, '700000', round, [], SE);
  const over = mayDecide(pm, 'PURCHASE_ORDER', RULES, '700000', s);
  assert.equal(over.ok, false);
  assert.match(over.reason!, /above your limit of ₹500000/);
  assert.deepEqual(levelKeys('PURCHASE_ORDER', RULES, 1, '700000'), [roleApprover('PROCUREMENT_MANAGER')]);
});

test('escalation: past its time, the next level may decide too; above the top level, management', () => {
  const steps: LevelStep[] = [{ level: 1, action: 'ESCALATED', actorId: null, createdAt: at(48) }];
  const s = stageOf('PURCHASE_ORDER', RULES, '400000', round, steps, SE);
  assert.equal(s.escalated, true);
  assert.equal(mayDecide(md, 'PURCHASE_ORDER', RULES, '400000', s).ok, true);
  assert.deepEqual(queueKeys('PURCHASE_ORDER', RULES, '400000', s).sort(), ['role:MANAGEMENT', 'role:PROCUREMENT_MANAGER', 'role:PROJECT_MANAGER']);
  assert.deepEqual(escalationKeys('PURCHASE_ORDER', RULES, 3), [roleApprover('MANAGEMENT')]);
  assert.deepEqual(escalationKeys('EXPENSE', [], 1), [roleApprover('MANAGEMENT')], 'the fixed rule escalates to management');
  // A reminder or escalation at level 1 does not carry over to level 2.
  const later = stageOf('PURCHASE_ORDER', RULES, '400000', round, [...steps, { level: 1, action: 'REMINDED', actorId: null, createdAt: at(24) }, approved(1, pm.id, 50)], SE);
  assert.deepEqual([later.level, later.escalated, later.reminded], [2, false, false]);
});

test('the fixed rule (no matrix): one level, the approver roles, as before', () => {
  const s = stageOf('EXPENSE', [], '90000', round, [], SE);
  assert.equal(s.levels, 1);
  assert.equal(mayDecide(as('x', 'PROJECT_MANAGER'), 'EXPENSE', [], '90000', s).ok, true);
  assert.equal(mayDecide(as('y', 'SITE_ENGINEER'), 'EXPENSE', [], '90000', s).ok, false);
  assert.equal(mayDecide(as('z', 'QA_QC_ENGINEER'), 'INSPECTION', [], null, stageOf('INSPECTION', [], null, round, [], SE)).ok, true);
  assert.deepEqual(levelKeys('EXPENSE', [], 1, '90000'), [roleApprover('ADMIN'), roleApprover('MANAGEMENT'), roleApprover('PROJECT_MANAGER')]);
  assert.deepEqual(levelKeys('EXPENSE', [], 2, '90000'), []);
});

test('whoever submitted an entry never decides it, admin included; anyone else with the right still does', () => {
  const byPm = stageOf('PURCHASE_ORDER', RULES, '400000', round, [], pm.id);
  assert.equal(byPm.submittedBy, pm.id);
  const self = mayDecide(pm, 'PURCHASE_ORDER', RULES, '400000', byPm);
  assert.equal(self.ok, false);
  assert.match(self.reason!, /You made this entry/);
  assert.equal(mayDecide(as('u-pm2', 'PROJECT_MANAGER'), 'PURCHASE_ORDER', RULES, '400000', byPm).ok, true, 'another PM decides it');
  const admin = as('u-admin', 'ADMIN');
  assert.equal(mayDecide(admin, 'EXPENSE', [], '90000', stageOf('EXPENSE', [], '90000', round, [], admin.id)).ok, false, 'admin does not approve their own entry');
  assert.equal(mayDecide(admin, 'EXPENSE', [], '90000', stageOf('EXPENSE', [], '90000', round, [], SE)).ok, true);
  // Escalated to management: the manager who submitted it still cannot take it.
  const escalated = stageOf('PURCHASE_ORDER', RULES, '400000', round, [{ level: 1, action: 'ESCALATED', actorId: null, createdAt: at(48) }], md.id);
  assert.equal(mayDecide(md, 'PURCHASE_ORDER', RULES, '400000', escalated).ok, false);
  assert.equal(ownEntryProblem(null, pm.id), null, 'an entry with no maker on record stays decidable');
  assert.equal(ownEntryProblem('u-hr', 'u-md'), null);
  assert.match(ownEntryProblem('u-md', 'u-md')!, /another approver decides it/);
});

// The business's chain for an expense: the site in-charge of the project first, then the project manager.
const CHAIN: LevelRule[] = [post('site-in-charge', 1, { type: 'EXPENSE' }), rule('PROJECT_MANAGER', 2, { type: 'EXPENSE' })];
const SIC = 'u-sic';
const held: Holding[] = [
  { userId: SIC, positionCode: 'site-in-charge', projectId: 'p1' },
  { userId: 'u-gm', positionCode: 'general-manager-coo', projectId: null },
  { userId: 'u-md', positionCode: 'managing-director', projectId: null },
];

test('a position at a level: its holder on the entry’s project decides, on another project they do not', () => {
  const s1 = stageOf('EXPENSE', CHAIN, '12000', round, [], SE);
  assert.equal(s1.levels, 2);
  const onP1 = approverKeys({ id: SIC, roleKey: 'SITE_ENGINEER' }, 'p1', held);
  assert.deepEqual(mayDecide(onP1, 'EXPENSE', CHAIN, '12000', s1), { ok: true, reason: null, onBehalfOf: null });
  const onP2 = approverKeys({ id: SIC, roleKey: 'SITE_ENGINEER' }, 'p2', held);
  assert.equal(mayDecide(onP2, 'EXPENSE', CHAIN, '12000', s1).ok, false, 'site in-charge of p1 only');
  assert.equal(mayDecide(as('u-se2', 'SITE_ENGINEER'), 'EXPENSE', CHAIN, '12000', s1).ok, false, 'the role alone does not decide');
  assert.equal(mayDecide(pm, 'EXPENSE', CHAIN, '12000', s1).ok, false, 'the PM waits for level 1');
  const s2 = stageOf('EXPENSE', CHAIN, '12000', round, [approved(1, SIC)], SE);
  assert.equal(mayDecide(pm, 'EXPENSE', CHAIN, '12000', s2).ok, true);
  assert.equal(mayDecide(onP1, 'EXPENSE', CHAIN, '12000', s2).ok, false, 'the site in-charge does not take level 2');
  assert.deepEqual(queueKeys('EXPENSE', CHAIN, '12000', s1), [positionApprover('site-in-charge')]);
  assert.deepEqual(
    queueKeys('EXPENSE', CHAIN, '12000', s1).map((k) => approverName(k, new Map([['site-in-charge', 'Site in-charge']]))),
    ['Site in-charge'],
    'the queue names the position as the company calls it',
  );
});

test('head office positions count on every project; the whole list counts when no project is named', () => {
  assert.deepEqual(approverKeys({ id: 'u-gm', roleKey: 'MANAGEMENT' }, 'p9', held).keys, [roleApprover('MANAGEMENT'), positionApprover('general-manager-coo')]);
  assert.deepEqual(approverKeys({ id: SIC, roleKey: 'SITE_ENGINEER' }, null, held).keys, [roleApprover('SITE_ENGINEER'), positionApprover('site-in-charge')]);
});

test('six levels: each applies from its amount in order; the MD and GM/COO carry their own limits', () => {
  const six: LevelRule[] = [
    post('billing-engineer', 1, { type: 'BILL' }),
    post('site-in-charge', 2, { type: 'BILL' }),
    post('team-leader', 3, { type: 'BILL' }),
    rule('PROJECT_MANAGER', 4, { type: 'BILL' }),
    rule('ACCOUNTS_MANAGER', 5, { type: 'BILL', minAmount: '1000000' }),
    post('general-manager-coo', 6, { type: 'BILL', minAmount: '5000000', maxAmount: '20000000' }),
    post('managing-director', 6, { type: 'BILL', minAmount: '5000000' }),
  ];
  const higher = six.filter((r) => r.level > 1);
  assert.equal(levelsNeeded('BILL', higher, '900000'), 4, 'below level 5’s amount: four levels');
  assert.equal(levelsNeeded('BILL', higher, '3000000'), 5);
  assert.equal(levelsNeeded('BILL', higher, '60000000'), 6);
  assert.equal(levelsNeeded('BILL', [{ level: 2, minAmount: null }, { level: 6, minAmount: null }], '1'), 2, 'level 6 without levels 3 to 5 never applies');
  const steps = [1, 2, 3, 4, 5].map((l) => approved(l, `u-l${l}`, l));
  const big = stageOf('BILL', six, '60000000', round, steps, SE);
  assert.deepEqual([big.level, big.levels], [6, 6]);
  const gm = approverKeys({ id: 'u-gm', roleKey: 'MANAGEMENT' }, 'p1', held);
  const theMd = approverKeys({ id: 'u-md', roleKey: 'MANAGEMENT' }, 'p1', held);
  assert.match(mayDecide(gm, 'BILL', six, '60000000', big).reason!, /above your limit of ₹20000000/, 'the GM/COO stops at their limit');
  assert.equal(mayDecide(theMd, 'BILL', six, '60000000', big).ok, true, 'the MD has none');
  const mid = stageOf('BILL', six, '15000000', round, steps, SE);
  assert.equal(mayDecide(gm, 'BILL', six, '15000000', mid).ok, true);
  assert.deepEqual(escalationKeys('BILL', six, 5).sort(), [positionApprover('general-manager-coo'), positionApprover('managing-director')]);
  assert.deepEqual(escalationKeys('BILL', six, 6), [roleApprover('MANAGEMENT')], 'above the sixth level, management');
});

test('a delegate decides as the person away, and the decision says for whom; the person away keeps their rights', () => {
  const s1 = stageOf('PURCHASE_ORDER', RULES, '400000', round, [], SE);
  const deputy = approverKeys({ id: 'u-dpm', roleKey: 'SITE_ENGINEER' }, 'p1', [], [{ id: pm.id, roleKey: 'PROJECT_MANAGER' }]);
  assert.deepEqual(mayDecide(deputy, 'PURCHASE_ORDER', RULES, '400000', s1), { ok: true, reason: null, onBehalfOf: pm.id });
  assert.equal(mayDecide(as('u-dpm', 'SITE_ENGINEER'), 'PURCHASE_ORDER', RULES, '400000', s1).ok, false, 'without the delegation they cannot');
  assert.equal(mayDecide(pm, 'PURCHASE_ORDER', RULES, '400000', s1).ok, true, 'the PM still can');
  assert.match(mayDecide(deputy, 'PURCHASE_ORDER', RULES, '700000', stageOf('PURCHASE_ORDER', RULES, '700000', round, [], SE)).reason!, /above your limit of ₹500000/, 'with the PM’s limit');
  // Their own rights come first: a procurement manager holding the PM's approvals decides as themselves.
  const proc = approverKeys({ id: 'u-proc', roleKey: 'PROCUREMENT_MANAGER' }, 'p1', [], [{ id: pm.id, roleKey: 'PROJECT_MANAGER' }]);
  assert.equal(mayDecide(proc, 'PURCHASE_ORDER', RULES, '400000', s1).onBehalfOf, null);
  // The person away's positions travel too.
  const forSic = approverKeys({ id: 'u-je', roleKey: 'SITE_ENGINEER' }, 'p1', held, [{ id: SIC, roleKey: 'SITE_ENGINEER' }]);
  assert.equal(mayDecide(forSic, 'EXPENSE', CHAIN, '12000', stageOf('EXPENSE', CHAIN, '12000', round, [], SE)).onBehalfOf, SIC);
});

test('a delegate never decides an entry they or the person away made', () => {
  const deputy = approverKeys({ id: 'u-dpm', roleKey: 'SITE_ENGINEER' }, 'p1', [], [{ id: pm.id, roleKey: 'PROJECT_MANAGER' }]);
  const byPm = stageOf('PURCHASE_ORDER', RULES, '400000', round, [], pm.id);
  const v = mayDecide(deputy, 'PURCHASE_ORDER', RULES, '400000', byPm);
  assert.equal(v.ok, false);
  assert.match(v.reason!, /approve for the person who made this entry/);
  assert.match(mayDecide(deputy, 'PURCHASE_ORDER', RULES, '400000', stageOf('PURCHASE_ORDER', RULES, '400000', round, [], 'u-dpm')).reason!, /You made this entry/);
  // Even a delegate with rights of their own: the person away made it, so someone else decides.
  const proc = approverKeys({ id: 'u-proc', roleKey: 'PROCUREMENT_MANAGER' }, 'p1', [], [{ id: pm.id, roleKey: 'PROJECT_MANAGER' }]);
  assert.equal(mayDecide(proc, 'PURCHASE_ORDER', RULES, '400000', byPm).ok, false);
});

test('one level each across a delegation: neither the delegate nor the person away takes a second level', () => {
  // The PM approved level 1; their delegate, who is management, may not take level 2 of the same entry.
  const s2 = stageOf('PURCHASE_ORDER', RULES, '400000', round, [approved(1, pm.id)], SE);
  const mdForPm = approverKeys({ id: 'u-md2', roleKey: 'MANAGEMENT' }, 'p1', [], [{ id: pm.id, roleKey: 'PROJECT_MANAGER' }]);
  assert.match(mayDecide(mdForPm, 'PURCHASE_ORDER', RULES, '400000', s2).reason!, /Someone you approve for approved an earlier level/);
  // The delegate approved level 1 for the PM: the PM, back, does not take level 2, nor does the delegate.
  const sFor = stageOf('PURCHASE_ORDER', RULES, '400000', round, [approved(1, 'u-dpm', 1, pm.id)], SE);
  assert.deepEqual(sFor.approvedBy.sort(), ['u-dpm', pm.id].sort());
  const pmAsMd = approverKeys({ id: pm.id, roleKey: 'MANAGEMENT' }, 'p1', []);
  assert.match(mayDecide(pmAsMd, 'PURCHASE_ORDER', RULES, '400000', sFor).reason!, /approved an earlier level/);
  assert.equal(mayDecide(md, 'PURCHASE_ORDER', RULES, '400000', sFor).ok, true, 'another approver takes it');
});

test('admin’s right to decide everything is not handed on', () => {
  const s1 = stageOf('PURCHASE_ORDER', RULES, '400000', round, [], SE);
  const forAdmin = approverKeys({ id: 'u-se3', roleKey: 'SITE_ENGINEER' }, 'p1', [], [{ id: 'u-admin', roleKey: 'ADMIN' }]);
  assert.equal(mayDecide(forAdmin, 'PURCHASE_ORDER', RULES, '400000', s1).ok, false);
  assert.equal(mayDecide(forAdmin, 'EXPENSE', [], '1000', stageOf('EXPENSE', [], '1000', round, [], SE)).ok, false, 'not under the fixed rule either');
});

test('the rights the web and phone show follow positions and delegations', () => {
  assert.deepEqual(rightsOf(approverKeys({ id: SIC, roleKey: 'SITE_ENGINEER' }, null, held), CHAIN), [{ type: 'EXPENSE', maxAmount: null }]);
  assert.deepEqual(rightsOf(as('u-se2', 'SITE_ENGINEER'), CHAIN), []);
  const deputy = approverKeys({ id: 'u-dpm', roleKey: 'SITE_ENGINEER' }, null, [], [{ id: pm.id, roleKey: 'PROJECT_MANAGER' }]);
  assert.deepEqual(rightsOf(deputy, RULES), [{ type: 'PURCHASE_ORDER', maxAmount: '500000' }]);
  assert.equal(rightsOf(as('u-admin', 'ADMIN'), []).filter((r) => r.type === 'BILL').length, 6, 'admin: every level');
  assert.deepEqual(rightsOf(as('u-guest', 'CLIENT_ENGINEER'), RULES), []);
});

test('a delegation: someone else on the staff, active, ending on or after it starts and not in the past', () => {
  const today = '2026-11-05';
  const d = { fromUserId: 'u-pm', toUserId: 'u-dpm', startsOn: '2026-11-05', endsOn: '2026-11-12' };
  const staff = { roleKey: 'SITE_ENGINEER' as const, isActive: true, fullName: 'Ravi Kumar' };
  assert.equal(delegationProblem(d, staff, today), null);
  assert.match(delegationProblem({ ...d, toUserId: 'u-pm' }, staff, today)!, /cannot approve for themselves/);
  assert.match(delegationProblem(d, { ...staff, roleKey: 'CLIENT_ENGINEER' }, today)!, /guest or supplier/);
  assert.match(delegationProblem(d, { ...staff, roleKey: 'SUPPLIER' }, today)!, /guest or supplier/);
  assert.match(delegationProblem(d, { ...staff, isActive: false }, today)!, /switched off/);
  assert.match(delegationProblem({ ...d, endsOn: '2026-11-04', startsOn: '2026-11-05' }, staff, today)!, /on or after the first day/);
  assert.match(delegationProblem({ ...d, startsOn: '2026-10-01', endsOn: '2026-10-31' }, staff, today)!, /from today on/);
  assert.match(delegationProblem(d, null, today)!, /Choose who approves/);
  assert.equal(delegationProblem({ ...d, startsOn: today, endsOn: today }, staff, today), null, 'one day is enough');
  assert.equal(delegationActive(d, '2026-11-05'), true, 'from its first day');
  assert.equal(delegationActive(d, '2026-11-12'), true, 'to its last day');
  assert.equal(delegationActive(d, '2026-11-13'), false);
  assert.equal(delegationActive(d, '2026-11-04'), false);
});

let failed = 0;
for (const [name, fn] of cases) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`✗ ${name}\n  ${(e as Error).message.split('\n').join('\n  ')}`);
  }
}
console.log(`\nApproval levels: ${cases.length - failed} of ${cases.length} tests pass`);
process.exit(failed ? 1 : 0);
