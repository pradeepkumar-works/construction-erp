/**
 * Approval levels' tests (v5 item 94): how many levels an amount needs, which level an entry waits at, who may decide
 * it (and why not), whose queue it is in, and escalation. No database. CI runs it after the build:
 *
 *   node dist/scripts/approval-levels-test.js
 */
import assert from 'node:assert/strict';
import { levelsNeeded } from '@erp/shared';
import { escalationRoles, levelRoles, mayDecide, queueRoles, stageOf, type LevelRule, type LevelStep } from '../common/approval-levels';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);

const round = new Date('2026-10-20T04:00:00Z');
const at = (h: number) => new Date(round.getTime() + h * 3_600_000);
const rule = (roleKey: LevelRule['roleKey'], level: number, extra: Partial<LevelRule> = {}): LevelRule => ({ roleKey, type: 'PURCHASE_ORDER', level, maxAmount: null, minAmount: null, ...extra });
// Purchase orders: the PM approves up to ₹5 lakh, procurement up to ₹10 lakh; management approves second above
// ₹2 lakh, and the MD (admin) third above ₹10 lakh through management's level-3 rule.
const RULES: LevelRule[] = [
  rule('PROJECT_MANAGER', 1, { maxAmount: '500000' }),
  rule('PROCUREMENT_MANAGER', 1, { maxAmount: '1000000' }),
  rule('MANAGEMENT', 2, { minAmount: '200000' }),
  rule('MANAGEMENT', 3, { minAmount: '1000000' }),
  rule('ACCOUNTS_MANAGER', 3, { minAmount: '1000000' }),
];
const pm = { id: 'u-pm', roleKey: 'PROJECT_MANAGER' as const };
const md = { id: 'u-md', roleKey: 'MANAGEMENT' as const };
const accounts = { id: 'u-ac', roleKey: 'ACCOUNTS_MANAGER' as const };
const approved = (level: number, actorId: string, h = level): LevelStep => ({ level, action: 'APPROVED', actorId, createdAt: at(h) });

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
  const fresh = stageOf('PURCHASE_ORDER', RULES, '400000', round, []);
  assert.deepEqual([fresh.level, fresh.levels, fresh.since.getTime()], [1, 2, round.getTime()]);
  const next = stageOf('PURCHASE_ORDER', RULES, '400000', round, [approved(1, pm.id, 5)]);
  assert.deepEqual([next.level, next.levels, next.since.getTime(), next.approvedBy], [2, 2, at(5).getTime(), [pm.id]]);
});

test('who decides: the level-1 role within its limit, then the level-2 role; not the same person twice', () => {
  const s1 = stageOf('PURCHASE_ORDER', RULES, '400000', round, []);
  assert.equal(mayDecide(pm, 'PURCHASE_ORDER', RULES, '400000', s1).ok, true);
  const early = mayDecide(md, 'PURCHASE_ORDER', RULES, '400000', s1);
  assert.equal(early.ok, false);
  assert.match(early.reason!, /waiting for level 1 first/);
  const s2 = stageOf('PURCHASE_ORDER', RULES, '400000', round, [approved(1, pm.id)]);
  assert.equal(mayDecide(md, 'PURCHASE_ORDER', RULES, '400000', s2).ok, true);
  const moved = mayDecide({ id: 'u-pm2', roleKey: 'PROJECT_MANAGER' }, 'PURCHASE_ORDER', RULES, '400000', s2);
  assert.equal(moved.ok, false);
  assert.match(moved.reason!, /moved on to level 2/);
  // Management at level 2 and 3: the person who approved level 2 cannot approve level 3 as well.
  const s3 = stageOf('PURCHASE_ORDER', RULES, '1200000', round, [approved(1, 'u-proc'), approved(2, md.id)]);
  assert.equal(s3.level, 3);
  assert.match(mayDecide(md, 'PURCHASE_ORDER', RULES, '1200000', s3).reason!, /approved an earlier level/);
  assert.equal(mayDecide({ id: 'u-md2', roleKey: 'MANAGEMENT' }, 'PURCHASE_ORDER', RULES, '1200000', s3).ok, true);
  assert.equal(mayDecide(accounts, 'PURCHASE_ORDER', RULES, '1200000', s3).ok, true);
  assert.equal(mayDecide({ id: 'u-admin', roleKey: 'ADMIN' }, 'PURCHASE_ORDER', RULES, '1200000', s1).ok, true, 'admin decides any level');
});

test('the level-1 limit still sends a larger order to the role with the higher limit', () => {
  const s = stageOf('PURCHASE_ORDER', RULES, '700000', round, []);
  const over = mayDecide(pm, 'PURCHASE_ORDER', RULES, '700000', s);
  assert.equal(over.ok, false);
  assert.match(over.reason!, /above your limit of ₹500000/);
  assert.deepEqual(levelRoles('PURCHASE_ORDER', RULES, 1, '700000'), ['PROCUREMENT_MANAGER']);
});

test('escalation: past its time, the next level may decide too; above the top level, management', () => {
  const steps: LevelStep[] = [{ level: 1, action: 'ESCALATED', actorId: null, createdAt: at(48) }];
  const s = stageOf('PURCHASE_ORDER', RULES, '400000', round, steps);
  assert.equal(s.escalated, true);
  assert.equal(mayDecide(md, 'PURCHASE_ORDER', RULES, '400000', s).ok, true);
  assert.deepEqual(queueRoles('PURCHASE_ORDER', RULES, '400000', s).sort(), ['MANAGEMENT', 'PROCUREMENT_MANAGER', 'PROJECT_MANAGER']);
  assert.deepEqual(escalationRoles('PURCHASE_ORDER', RULES, 3), ['MANAGEMENT']);
  assert.deepEqual(escalationRoles('EXPENSE', [], 1), ['MANAGEMENT'], 'the fixed rule escalates to management');
  // A reminder or escalation at level 1 does not carry over to level 2.
  const later = stageOf('PURCHASE_ORDER', RULES, '400000', round, [...steps, { level: 1, action: 'REMINDED', actorId: null, createdAt: at(24) }, approved(1, pm.id, 50)]);
  assert.deepEqual([later.level, later.escalated, later.reminded], [2, false, false]);
});

test('the fixed rule (no matrix): one level, the approver roles, as before', () => {
  const s = stageOf('EXPENSE', [], '90000', round, []);
  assert.equal(s.levels, 1);
  assert.equal(mayDecide({ id: 'x', roleKey: 'PROJECT_MANAGER' }, 'EXPENSE', [], '90000', s).ok, true);
  assert.equal(mayDecide({ id: 'y', roleKey: 'SITE_ENGINEER' }, 'EXPENSE', [], '90000', s).ok, false);
  assert.equal(mayDecide({ id: 'z', roleKey: 'QA_QC_ENGINEER' }, 'INSPECTION', [], null, stageOf('INSPECTION', [], null, round, [])).ok, true);
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
