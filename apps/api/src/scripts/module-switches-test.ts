/**
 * Module switches' tests: which modules are off for a company (turned off, or left out of its plan), which
 * page belongs to which module, and what an admin may switch, with no database. CI runs it after the build:
 *
 *   node dist/scripts/module-switches-test.js
 */
import assert from 'node:assert/strict';
import { MODULE_TIER_MODULES, SWITCHABLE_MODULES, SWITCHABLE_MODULE_INFO, inTier, moduleOfPath, modulesOffFor, pathIsOff } from '@erp/shared';
import { nextModulesOff, switchesOf, switchNote, switchProblem, tierNote } from '../module-switches/module-switch-rules';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);

test('a company with no plan and nothing turned off has every module', () => {
  assert.deepEqual(modulesOffFor({ modulesOff: [], moduleTier: null }), []);
  assert.ok(SWITCHABLE_MODULES.every((k) => inTier(null, k)));
});

test('off are the modules turned off and those the plan leaves out, in a fixed order; unknown keys are ignored', () => {
  assert.deepEqual(modulesOffFor({ modulesOff: ['safety', 'meetings', 'old-module'], moduleTier: null }), ['meetings', 'safety']);
  assert.deepEqual(modulesOffFor({ modulesOff: [], moduleTier: 'ESSENTIALS' }), ['tenders', 'subcontract_enquiries', 'books', 'payroll', 'biometric', 'rmc', 'machine_loans']);
  assert.deepEqual(modulesOffFor({ modulesOff: ['meetings'], moduleTier: 'BUSINESS' }), ['meetings', 'rmc', 'machine_loans']);
  assert.deepEqual(modulesOffFor({ modulesOff: [], moduleTier: 'ENTERPRISE' }), []);
});

test('each plan includes the one below it', () => {
  assert.ok(MODULE_TIER_MODULES.ESSENTIALS.every((k) => MODULE_TIER_MODULES.BUSINESS.includes(k)));
  assert.ok(MODULE_TIER_MODULES.BUSINESS.every((k) => MODULE_TIER_MODULES.ENTERPRISE.includes(k)));
});

test('a page belongs to the module whose path it is or is under, ignoring query and hash; the core belongs to none', () => {
  assert.equal(moduleOfPath('/meetings'), 'meetings');
  assert.equal(moduleOfPath('/meetings/73a2b2f3?tab=actions#record-comments'), 'meetings');
  assert.equal(moduleOfPath('/books?tab=vouchers'), 'books');
  assert.equal(moduleOfPath('/statements/'), 'books');
  assert.equal(moduleOfPath('/schedule-of-rates'), 'tenders');
  assert.equal(moduleOfPath('/payslips'), 'payroll');
  assert.equal(moduleOfPath('/ppe/issues'), 'safety');
  assert.equal(moduleOfPath('/imprest?tab=funds'), 'imprest');
  // Look-alikes and the core
  assert.equal(moduleOfPath('/meetings-archive'), null);
  assert.equal(moduleOfPath('/material-requests'), null);
  assert.equal(moduleOfPath('/subcontract-bills'), null);
  assert.equal(moduleOfPath('/dpr'), null);
  assert.equal(moduleOfPath('/'), null);
  assert.ok(pathIsOff('/rmc?tab=orders', ['rmc']));
  assert.ok(!pathIsOff('/rmc', ['books']));
  assert.ok(!pathIsOff('/rmc', undefined));
});

test('no two modules claim the same page', () => {
  const all = SWITCHABLE_MODULES.flatMap((k) => SWITCHABLE_MODULE_INFO[k].paths);
  assert.equal(new Set(all).size, all.length);
  for (const k of SWITCHABLE_MODULES) for (const p of SWITCHABLE_MODULE_INFO[k].paths) assert.equal(moduleOfPath(p), k);
});

test("the admin's page shows each module with its plan and whether it is in use", () => {
  const s = switchesOf({ modulesOff: ['safety'], moduleTier: 'ESSENTIALS' });
  assert.equal(s.tier, 'ESSENTIALS');
  assert.equal(s.modules.length, SWITCHABLE_MODULES.length);
  assert.deepEqual(s.modules.find((m) => m.key === 'safety'), { key: 'safety', label: 'Safety', description: SWITCHABLE_MODULE_INFO.safety.description, inPlan: true, on: false });
  assert.deepEqual(
    s.modules.filter((m) => m.key === 'books').map((m) => [m.inPlan, m.on]),
    [[false, false]],
  );
  assert.ok(s.modules.find((m) => m.key === 'meetings')!.on);
});

test('a module outside the plan cannot be turned on; turning off is always allowed', () => {
  assert.equal(switchProblem({ modulesOff: [], moduleTier: 'ESSENTIALS' }, 'payroll', true), 'Payroll is not in your Essentials plan. Ask us to move you to a plan that has it.');
  assert.equal(switchProblem({ modulesOff: [], moduleTier: 'ESSENTIALS' }, 'payroll', false), null);
  assert.equal(switchProblem({ modulesOff: ['meetings'], moduleTier: 'ESSENTIALS' }, 'meetings', true), null);
  assert.equal(switchProblem({ modulesOff: [], moduleTier: null }, 'rmc', true), null);
});

test("a switch changes only its module in the company's list, in a fixed order, dropping keys no longer known", () => {
  assert.deepEqual(nextModulesOff([], 'safety', false), ['safety']);
  assert.deepEqual(nextModulesOff(['rmc', 'safety'], 'meetings', false), ['meetings', 'safety', 'rmc']);
  assert.deepEqual(nextModulesOff(['rmc', 'safety', 'gone'], 'safety', true), ['rmc']);
  assert.deepEqual(nextModulesOff(['rmc'], 'rmc', false), ['rmc']);
});

test('the audit says what changed', () => {
  assert.equal(switchNote('machine_loans', false), 'Machine loans turned off');
  assert.equal(switchNote('compliance', true), 'Guarantees and licences turned on');
  assert.equal(tierNote(null, 'BUSINESS'), 'Module plan every module → Business');
  assert.equal(tierNote('ESSENTIALS', null), 'Module plan Essentials → every module');
});

let failed = 0;
for (const [name, fn] of cases) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n${(e as Error).message}`);
  }
}
console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
