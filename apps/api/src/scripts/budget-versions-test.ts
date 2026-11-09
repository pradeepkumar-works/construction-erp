/**
 * Budget version tests (ARCHITECTURE "Budget and cash flow"): which version is in force, what stops a version being
 * submitted, who may approve or return one, and what a revision changes by head and in total.
 *
 *   node dist/scripts/budget-versions-test.js
 */
import assert from 'node:assert/strict';
import { approvedVersionOf, budgetChange, budgetDecisionProblem, budgetVersionProblem, openVersionOf, type BudgetVersionInput } from '@erp/shared';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

const heads = (n: number) => ({ expenses: n, material: n, machinery: n, labour: n, subcontract: n });
const version = (v: Partial<BudgetVersionInput> = {}): BudgetVersionInput => ({ versionNo: 1, reasonCode: null, reasonNote: null, heads: heads(100), lines: [], ...v });

test('the version in force is the approved one, and the open one is the one still being prepared or decided', () => {
  assert.equal(approvedVersionOf([]), null);
  const rows = [
    { versionNo: 1, status: 'SUPERSEDED' as const },
    { versionNo: 2, status: 'APPROVED' as const },
    { versionNo: 3, status: 'SUBMITTED' as const },
  ];
  assert.equal(approvedVersionOf(rows)?.versionNo, 2);
  assert.equal(openVersionOf(rows)?.versionNo, 3);
  assert.equal(openVersionOf(rows.slice(0, 2)), null);
  assert.equal(approvedVersionOf([{ versionNo: 1, status: 'SUBMITTED' as const }]), null, 'a first version waiting for approval is not in force');
});

test('a first version needs no reason; a revision needs one, and "other" needs words', () => {
  assert.equal(budgetVersionProblem(version()), null);
  assert.equal(budgetVersionProblem(version({ versionNo: 2 })), 'Choose why the budget is revised');
  assert.equal(budgetVersionProblem(version({ versionNo: 2, reasonCode: 'variation' })), null);
  assert.equal(budgetVersionProblem(version({ versionNo: 2, reasonCode: 'other' })), 'Say why the budget is revised');
  assert.equal(budgetVersionProblem(version({ versionNo: 2, reasonCode: 'other', reasonNote: '  ' })), 'Say why the budget is revised');
  assert.equal(budgetVersionProblem(version({ versionNo: 2, reasonCode: 'other', reasonNote: 'Client cut the scope of the boundary wall' })), null);
});

test('no amount below zero, and something must be set', () => {
  assert.equal(budgetVersionProblem(version({ heads: { ...heads(10), labour: -1 } })), 'A budget cannot be negative');
  assert.equal(budgetVersionProblem(version({ heads: null, lines: [{ budgetRate: '-0.01' }] })), 'A budget rate cannot be negative');
  assert.equal(budgetVersionProblem(version({ heads: null, lines: [] })), 'Set the budget by cost head, or give the BOQ items a budget rate');
  assert.equal(budgetVersionProblem(version({ heads: null, lines: [{ budgetRate: '1450.00' }] })), null, 'BOQ budget rates alone are a budget');
});

test('admin and management decide a submitted version, never their own, and a return says what to change', () => {
  const submitted = { status: 'SUBMITTED' as const, preparedById: 'pm' };
  assert.equal(budgetDecisionProblem({ version: submitted, deciderId: 'md', deciderRole: 'MANAGEMENT', decision: 'APPROVE' }), null);
  assert.equal(budgetDecisionProblem({ version: submitted, deciderId: 'admin', deciderRole: 'ADMIN', decision: 'APPROVE' }), null);
  assert.equal(budgetDecisionProblem({ version: submitted, deciderId: 'pm2', deciderRole: 'PROJECT_MANAGER', decision: 'APPROVE' }), 'Admin or management approve a budget');
  assert.equal(budgetDecisionProblem({ version: submitted, deciderId: 'acc', deciderRole: 'ACCOUNTS_MANAGER' }), 'Admin or management approve a budget');
  assert.match(budgetDecisionProblem({ version: { status: 'SUBMITTED', preparedById: 'md' }, deciderId: 'md', deciderRole: 'MANAGEMENT', decision: 'APPROVE' }) ?? '', /You prepared this version/);
  assert.match(budgetDecisionProblem({ version: { status: 'SUBMITTED', preparedById: 'admin' }, deciderId: 'admin', deciderRole: 'ADMIN' }) ?? '', /You prepared this version/, 'admin included');
  for (const status of ['DRAFT', 'RETURNED', 'APPROVED', 'SUPERSEDED'] as const)
    assert.equal(budgetDecisionProblem({ version: { status, preparedById: 'pm' }, deciderId: 'md', deciderRole: 'MANAGEMENT', decision: 'APPROVE' }), 'This version is not waiting for a decision', status);
  assert.match(budgetDecisionProblem({ version: submitted, deciderId: 'md', deciderRole: 'MANAGEMENT', decision: 'RETURN', note: ' ' }) ?? '', /Say what to change/);
  assert.equal(budgetDecisionProblem({ version: submitted, deciderId: 'md', deciderRole: 'MANAGEMENT', decision: 'RETURN', note: 'Steel is at last month’s rate' }), null);
});

test('a revision changes each head and the total', () => {
  const v1 = { heads: { expenses: 100, material: 1000, machinery: 300, labour: 200, subcontract: 400 }, boqBudget: 1900 };
  const v2 = { heads: { expenses: 100, material: 1250.5, machinery: 300, labour: 180, subcontract: 400 }, boqBudget: 2100 };
  const c = budgetChange(v1, v2);
  assert.deepEqual(
    c.heads.map((h) => [h.head, h.change]),
    [
      ['expenses', '0.00'],
      ['material', '250.50'],
      ['machinery', '0.00'],
      ['labour', '-20.00'],
      ['subcontract', '0.00'],
    ],
  );
  assert.deepEqual(c.total, { from: '2000.00', to: '2230.50', change: '230.50' });
  assert.deepEqual(c.boqBudget, { from: '1900.00', to: '2100.00', change: '200.00' });
});

test('a first version is all change; without cost heads the total is the BOQ budget', () => {
  const first = budgetChange(null, { heads: null, boqBudget: 5000 });
  assert.deepEqual(first.heads, [], 'no head rows when neither side has a cost-head budget');
  assert.deepEqual(first.total, { from: null, to: '5000.00', change: '5000.00' });
  const added = budgetChange({ heads: null, boqBudget: 5000 }, { heads: heads(1000), boqBudget: 5000 });
  assert.equal(added.heads.length, 5);
  assert.deepEqual(added.heads[0], { head: 'expenses', from: null, to: '1000.00', change: '1000.00' });
  assert.deepEqual(added.total, { from: '5000.00', to: '5000.00', change: '0.00' });
  assert.deepEqual(budgetChange(null, { heads: null, boqBudget: null }).total, { from: null, to: null, change: null });
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
console.log(`\n${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);
