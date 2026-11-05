/**
 * Who sees every project: the company-wide roles, and a head office manager an admin gave every project
 * (`User.seesAllProjects`), never a guest or a supplier. Pure, so no database:
 *
 *   node dist/scripts/head-office-reach-test.js
 */
import assert from 'node:assert/strict';
import { ROLE_KEYS, isGuest, mayGiveEveryProject, seesEveryProject } from '@erp/shared';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

test('company-wide roles see every project with or without the switch', () => {
  for (const roleKey of ['ADMIN', 'MANAGEMENT', 'ACCOUNTS_MANAGER', 'PROCUREMENT_MANAGER', 'HR_MANAGER', 'DOCUMENT_CONTROLLER'] as const) {
    assert.equal(seesEveryProject({ roleKey }), true, roleKey);
    assert.equal(mayGiveEveryProject(roleKey), false, `${roleKey} needs no switch`);
  }
});

test('a head office QA/QC or store manager sees every project only once given it', () => {
  for (const roleKey of ['QA_QC_ENGINEER', 'STORE_MANAGER', 'PROJECT_MANAGER', 'SITE_ENGINEER'] as const) {
    assert.equal(seesEveryProject({ roleKey }), false, `${roleKey} without the switch`);
    assert.equal(seesEveryProject({ roleKey, seesAllProjects: true }), true, `${roleKey} with the switch`);
    assert.equal(mayGiveEveryProject(roleKey), true);
  }
});

test('guests and suppliers never see every project, whatever the switch says', () => {
  for (const roleKey of ROLE_KEYS.filter(isGuest)) {
    assert.equal(seesEveryProject({ roleKey, seesAllProjects: true }), false, roleKey);
    assert.equal(mayGiveEveryProject(roleKey), false, roleKey);
  }
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`✗ ${name}\n  ${(e as Error).message.split('\n').join('\n  ')}`);
  }
}
console.log(`\nHead office reach: ${tests.length - failed} of ${tests.length} tests pass`);
process.exit(failed ? 1 : 0);
