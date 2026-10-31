/**
 * Masters' tests: a company's rows lay over the standard entries by code, new entries get a code of their own,
 * an entry in use keeps its name, each list says who changes it, every master list has its node, and each department's
 * Masters names pages of the tree, with no database. CI runs it after the build:
 *
 *   node dist/scripts/masters-test.js
 */
import assert from 'node:assert/strict';
import {
  DEPARTMENT_MODULES,
  MASTER_LISTS,
  MASTER_LIST_DEFS,
  MANPOWER_CATEGORIES,
  canManageMaster,
  canViewMasters,
  masterCode,
  masterListBySlug,
  masterNames,
  masterProblem,
  mastersByDepartment,
  mergeMaster,
  navNode,
  newMasterCode,
  type MasterRow,
} from '@erp/shared';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);
const row = (code: string, name: string, more: Partial<MasterRow> = {}): MasterRow => ({ code, name, nameHi: null, isActive: true, sortOrder: 0, ...more });

test('a code is the name in lower case words joined by hyphens', () => {
  assert.equal(masterCode('Bar Bender'), 'bar-bender');
  assert.equal(masterCode('  Spares & lubricants '), 'spares-and-lubricants');
  assert.equal(masterCode('QA/QC engineer'), 'qa-qc-engineer');
  assert.equal(masterCode('***'), '');
});

test('a new entry gets a code of its own, never one in the list', () => {
  assert.equal(newMasterCode('Fitter', ['mason']), 'fitter');
  assert.equal(newMasterCode('Fitter', ['fitter', 'fitter-2']), 'fitter-3');
});

test('every standard code is unique within its list and made from its name', () => {
  for (const l of MASTER_LISTS) {
    const codes = MASTER_LIST_DEFS[l].standard.map((s) => s.code);
    assert.equal(new Set(codes).size, codes.length, l);
    for (const s of MASTER_LIST_DEFS[l].standard) assert.equal(s.code, masterCode(s.name), `${l}: ${s.name}`);
  }
});

test('the standard trades keep every trade the head count offered before', () => {
  const names = MASTER_LIST_DEFS.trade.standard.map((s) => s.name);
  for (const c of MANPOWER_CATEGORIES) assert.ok(names.includes(c), c);
  assert.equal(names.at(-1), 'Other');
});

test('a company with no rows has the standard list, all switched on', () => {
  const merged = mergeMaster('trade', []);
  assert.equal(merged.length, MASTER_LIST_DEFS.trade.standard.length);
  assert.ok(merged.every((e) => e.standard && e.isActive));
  assert.equal(merged.find((e) => e.code === 'mason')?.nameHi, 'राजमिस्त्री');
});

test("a company's row renames or switches off a standard entry in its place, and its own come after", () => {
  const merged = mergeMaster('itemCategory', [row('cement', 'Cement (OPC and PPC)'), row('fuel', 'Fuel', { isActive: false }), row('tiles', 'Tiles', { sortOrder: 2 }), row('glass', 'Glass', { sortOrder: 1 })]);
  assert.equal(merged[0].name, 'Cement (OPC and PPC)');
  assert.equal(merged[0].standard, true);
  assert.equal(merged.find((e) => e.code === 'fuel')?.isActive, false);
  assert.deepEqual(merged.slice(-2).map((e) => [e.name, e.standard]), [['Glass', false], ['Tiles', false]]);
  assert.ok(!masterNames(merged).includes('Fuel'));
  assert.ok(masterNames(merged).includes('Glass'));
});

test("the company's Hindi name for a standard entry wins", () => {
  assert.equal(mergeMaster('trade', [row('mason', 'Mason', { nameHi: 'मिस्त्री' })])[0].nameHi, 'मिस्त्री');
});

test('an entry needs a name, not a second one of the same name', () => {
  const current = mergeMaster('trade', []);
  assert.equal(masterProblem({ name: '  ' }, current, null), 'Enter the name');
  assert.equal(masterProblem({ name: 'mason' }, current, null), 'Mason is already in the list');
  assert.equal(masterProblem({ name: 'Shuttering carpenter' }, current, null), null);
  assert.match(masterProblem({ name: 'x'.repeat(81) }, current, null)!, /80 characters/);
  assert.equal(masterProblem({ name: '!!!' }, current, null), 'Use letters or numbers in the name');
});

test('an entry in use keeps its name (case aside); its Hindi name and switch still change', () => {
  const current = mergeMaster('trade', []);
  const mason = { code: 'mason', name: 'Mason', inUse: 23 };
  assert.match(masterProblem({ name: 'Raj mistri' }, current, mason)!, /^23 records use Mason; add the new name and switch this one off$/);
  assert.equal(masterProblem({ name: 'MASON', nameHi: 'राज मिस्त्री' }, current, mason), null);
  assert.equal(masterProblem({ name: 'Raj mistri' }, current, { ...mason, inUse: 0 }), null);
});

test('each list says who changes it; all staff read them, guests do not', () => {
  assert.ok(canManageMaster('STORE_MANAGER', 'itemCategory'));
  assert.ok(!canManageMaster('SITE_ENGINEER', 'itemCategory'));
  assert.ok(canManageMaster('HR_MANAGER', 'designation'));
  assert.ok(!canManageMaster('STORE_MANAGER', 'designation'));
  assert.ok(canViewMasters('SITE_ENGINEER'));
  assert.ok(!canViewMasters('CLIENT_ENGINEER'));
});

test('every list has its page in the tree and its address', () => {
  for (const l of MASTER_LISTS) {
    const def = MASTER_LIST_DEFS[l];
    const node = navNode(def.node);
    assert.ok(node, `${l}: ${def.node} is not a node`);
    assert.equal(node!.route, `/masters/${def.slug}`);
    assert.equal(masterListBySlug(def.slug)?.key, l);
  }
});

test("every department but Administration's own names its masters, and each is a page of the tree", () => {
  for (const m of DEPARTMENT_MODULES) {
    const masters = m.subs.find((s) => s.key === 'masters');
    if (m.key === 'design-drawings' || m.key === 'correspondence' || m.key === 'reports-mis') continue;
    assert.ok(masters?.nodes.length, `${m.key} has no Masters`);
    for (const id of masters!.nodes) assert.ok(navNode(id)?.route || navNode(id)?.shortcutOf, `${m.key}: ${id}`);
  }
  for (const l of MASTER_LISTS) assert.ok(DEPARTMENT_MODULES.some((m) => m.subs.some((s) => s.key === 'masters' && s.nodes.includes(MASTER_LIST_DEFS[l].node))), l);
});

test('Administration › Masters shows each user only the masters they may open', () => {
  const admin = mastersByDepartment({ roleKey: 'ADMIN' }).map((d) => d.module.key);
  assert.ok(admin.includes('store-inventory') && admin.includes('hr-payroll') && admin.includes('quality-control'));
  const engineer = mastersByDepartment({ roleKey: 'SITE_ENGINEER' });
  const hr = engineer.find((d) => d.module.key === 'hr-payroll')?.nodes.map((n) => n.id) ?? [];
  assert.ok(!hr.includes('people.designations') && !hr.includes('people.departments'), 'a site engineer sees no designations or departments');
  assert.ok(engineer.some((d) => d.nodes.some((n) => n.id === 'site.trades')), 'a site engineer sees the trades');
  assert.deepEqual(mastersByDepartment({ roleKey: 'CLIENT_ENGINEER' }), []);
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
