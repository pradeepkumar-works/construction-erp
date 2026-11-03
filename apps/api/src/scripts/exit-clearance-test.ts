/** Exit clearance: what an item needs to be signed off, the dues recovered, and what holds the settlement. Run: node dist/scripts/exit-clearance-test.js */
import assert from 'node:assert/strict';
import { canClearExit, clearanceDues, clearanceLineProblem, clearanceProblem, MASTER_LIST_DEFS, type ClearanceFact } from '@erp/shared';

const line = (name: string, state: ClearanceFact['state'], amount: number | null = null): ClearanceFact => ({ name, state, amount });

const cases: [string, () => void][] = [
  ['the standard list: six things to hand back or settle', () => assert.equal(MASTER_LIST_DEFS.exitClearance.standard.length, 6)],
  ['dues need an amount and what they are for; not applicable needs a reason', () => {
    assert.match(clearanceLineProblem('DUES', null, 'Helmet')!, /amount/);
    assert.match(clearanceLineProblem('DUES', 1200, ' ')!, /what the dues are for/);
    assert.equal(clearanceLineProblem('DUES', 1200, 'Safety shoes not returned'), null);
    assert.match(clearanceLineProblem('NOT_APPLICABLE', null, '')!, /does not apply/);
    assert.equal(clearanceLineProblem('CLEARED', null, null), null);
    assert.match(clearanceLineProblem('CLEARED', 500, null)!, /Only dues/);
  }],
  ['the settlement recovers the dues only', () => assert.equal(clearanceDues([line('Tools', 'DUES', 1200.5), line('Imprest', 'DUES', 3000), line('Laptop', 'CLEARED')]), 4200.5)],
  ['the settlement waits while anything is still to clear, and says what', () => {
    assert.equal(clearanceProblem([line('Tools', 'CLEARED'), line('Vehicle', 'NOT_APPLICABLE'), line('Imprest', 'DUES', 10)]), null);
    assert.match(clearanceProblem([line('Tools', 'PENDING'), line('Vehicle', 'CLEARED')])!, /Tools is still to clear/);
    assert.match(clearanceProblem(['A', 'B', 'C', 'D'].map((n) => line(n, 'PENDING')))!, /A, B and 2 more are still to clear/);
  }],
  ['HR, accounts, stores and the site manager sign items off; a site engineer does not', () => {
    for (const r of ['HR_MANAGER', 'ACCOUNTS_MANAGER', 'STORE_MANAGER', 'PROJECT_MANAGER', 'ADMIN'] as const) assert.equal(canClearExit(r), true, r);
    assert.equal(canClearExit('SITE_ENGINEER'), false);
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
