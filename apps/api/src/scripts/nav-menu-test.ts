/**
 * Menu and names' tests: every page of the navigation tree has a place in the department modules, a module set only
 * groups the tree's own nodes, each user sees only the pages they may open, the company's names win, and an address is
 * found in the menu, with no database. CI runs it after the build:
 *
 *   node dist/scripts/nav-menu-test.js
 */
import assert from 'node:assert/strict';
import {
  AREA_MODULES,
  DEFAULT_NAV_SETTINGS,
  DEPARTMENT_MODULES,
  HOME_TABS,
  NAV_MODULE_NAME_KEYS,
  NAV_NAME_MAX,
  NAV_TREE,
  canSeeNav,
  cleanNavNames,
  homeTabOf,
  homeTabSections,
  homeTabsFor,
  isDefaultNav,
  menuWaiting,
  navMenuFor,
  navMenuPlace,
  navNamesProblem,
  navNode,
  navNodeForPath,
  navSettingsFrom,
  navSettingsOf,
  type NavUser,
} from '@erp/shared';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);

const admin: NavUser = { roleKey: 'ADMIN' };
const engineer: NavUser = { roleKey: 'SITE_ENGINEER' };
const departments = { moduleSet: 'DEPARTMENTS' as const, names: {} };

test('every node a department module names is in the tree', () => {
  for (const m of DEPARTMENT_MODULES) for (const s of m.subs) for (const id of s.nodes) assert.ok(navNode(id), `${m.key} › ${s.label}: ${id} is not a node`);
});

test('every live page of the tree has a place in the department modules', () => {
  const placed = new Set(DEPARTMENT_MODULES.flatMap((m) => m.subs.flatMap((s) => s.nodes)));
  const pages = NAV_TREE.filter((n) => n.status === 'live' && n.parent !== null && !n.shortcutOf && n.tile !== false);
  const missing = pages.filter((n) => !placed.has(n.id)).map((n) => n.id);
  assert.deepEqual(missing, []);
});

test('module keys are unique within a set, and sub-module keys within a module', () => {
  for (const set of [AREA_MODULES, DEPARTMENT_MODULES]) {
    assert.equal(new Set(set.map((m) => m.key)).size, set.length);
    for (const m of set) assert.equal(new Set(m.subs.map((s) => s.key)).size, m.subs.length, m.key);
  }
});

test('the work-area set is the tree’s own modules, with Accounts by its groups', () => {
  assert.deepEqual(
    AREA_MODULES.map((m) => m.key),
    NAV_TREE.filter((n) => n.parent === null && !n.route).map((n) => n.id),
  );
  assert.deepEqual(AREA_MODULES.find((m) => m.key === 'accounts')!.subs.slice(0, 4).map((s) => s.label), ['Payments', 'Books', 'Statements', 'Tax and Tally']);
});

test('a user sees only the pages they may open, and a module with none is left out', () => {
  const menu = navMenuFor(engineer, departments);
  for (const m of menu) for (const s of m.subs) for (const n of s.nodes) assert.ok(canSeeNav(engineer, n), `${n.id} shown to a site engineer`);
  assert.ok(!menu.some((m) => m.key === 'administration'), 'a site engineer has no Administration');
  assert.ok(navMenuFor(admin, departments).some((m) => m.key === 'administration'));
});

test('a module turned off leaves the menu', () => {
  const on = navMenuFor(admin, departments).find((m) => m.key === 'plant-production');
  const off = navMenuFor({ ...admin, modulesOff: ['rmc'] }, departments).find((m) => m.key === 'plant-production');
  assert.ok(on);
  assert.equal(off, undefined);
});

test('the company’s names win, and an empty name keeps the module’s own', () => {
  const menu = navMenuFor(admin, { moduleSet: 'DEPARTMENTS', names: { 'store-inventory': 'Stores', 'hr-payroll': '  ' } });
  assert.equal(menu.find((m) => m.key === 'store-inventory')!.label, 'Stores');
  assert.equal(menu.find((m) => m.key === 'store-inventory')!.defaultLabel, 'Store and inventory');
  assert.equal(menu.find((m) => m.key === 'hr-payroll')!.label, 'HR and payroll');
});

test('names are trimmed, and a name the same as the module’s own or for no module is dropped', () => {
  assert.deepEqual(cleanNavNames({ 'store-inventory': '  Stores   and  yards ', 'hr-payroll': 'HR and payroll', nope: 'X', purchases: '' }), { 'store-inventory': 'Stores and yards' });
  assert.equal(navNamesProblem({ 'store-inventory': 'Stores' }), null);
  assert.match(navNamesProblem({ nope: 'X' }) ?? '', /no module/);
  assert.match(navNamesProblem({ purchases: 'x'.repeat(NAV_NAME_MAX + 1) }) ?? '', /40 characters/);
  assert.ok(NAV_MODULE_NAME_KEYS.includes('purchases') && NAV_MODULE_NAME_KEYS.includes('purchase-management'));
});

test('an address is found in the menu: a page, a record under it, a project tab, and the module the user came from first', () => {
  const menu = navMenuFor(admin, departments);
  const at = (path: string, search = '', prefer?: string) => {
    const node = navNodeForPath(path, search);
    const place = node && navMenuPlace(menu, node.id, prefer);
    return place ? `${place.module.key} › ${place.sub.key}` : null;
  };
  assert.equal(at('/purchase-orders'), 'purchase-management › orders');
  assert.equal(at('/purchase-orders', '?tab=status'), 'purchase-management › orders');
  assert.equal(at('/dpr/9f1c'), 'project-management › site');
  assert.equal(at('/projects/abc', '?tab=schedule'), 'project-management › schedule');
  assert.equal(at('/projects/abc', '?tab=overview'), 'project-management › projects');
  assert.equal(at('/vendor-bills', '?tab=to-bill'), 'purchase-management › bills');
  // Debit notes are purchase's and accounts': each module keeps them when that is where the user came from.
  assert.equal(at('/payables', '?tab=debit-notes'), 'purchase-management › bills');
  assert.equal(at('/payables', '?tab=debit-notes', 'accounts-finance'), 'accounts-finance › payables');
  assert.equal(at('/'), null);
  assert.equal(at('/modules/purchase-management'), null);
});

test('settings from the database fall back to the default, and the default is left off the sign-in', () => {
  assert.deepEqual(navSettingsFrom({}), DEFAULT_NAV_SETTINGS);
  assert.deepEqual(navSettingsFrom({ navLayout: 'SIDEWAYS', navLook: 'BAR', navNames: ['x'] }), { ...DEFAULT_NAV_SETTINGS, look: 'BAR' });
  assert.ok(isDefaultNav(DEFAULT_NAV_SETTINGS));
  assert.ok(!isDefaultNav({ ...DEFAULT_NAV_SETTINGS, layout: 'TOP_BAR' }));
});

test('a person’s own look counts only when the company lets people choose', () => {
  const navigation = { ...DEFAULT_NAV_SETTINGS, layout: 'TOP_BAR' as const };
  assert.equal(navSettingsOf({ navigation, ownLook: 'BAR' }).look, 'NAVY');
  assert.equal(navSettingsOf({ navigation: { ...navigation, personalLook: true }, ownLook: 'BAR' }).look, 'BAR');
  assert.equal(navSettingsOf({}).layout, 'SIDEBAR');
});

test('what waits in a module: approvals whose list is one of its pages, and the queues on its pages', () => {
  for (const settings of [DEFAULT_NAV_SETTINGS, { ...DEFAULT_NAV_SETTINGS, ...departments }]) {
    const menu = navMenuFor(admin, settings);
    const waiting = menuWaiting(menu, [{ type: 'DPR', count: 3 }], { 'purchases.toOrder': 2, approvals: 5, 'my-work': 9 });
    const holding = (id: string) => menu.filter((m) => m.subs.some((s) => s.nodes.some((n) => (n.shortcutOf ?? n.id) === id))).map((m) => m.key);
    const dpr = holding('site.dpr');
    const toOrder = holding('purchases.toOrder');
    assert.ok(dpr.length && toOrder.length, `${settings.moduleSet}: Daily reports and Requests to order have a module`);
    for (const m of menu) assert.equal(waiting[m.key] ?? 0, (dpr.includes(m.key) ? 3 : 0) + (toOrder.includes(m.key) ? 2 : 0), `${settings.moduleSet} › ${m.key}`);
  }
  assert.deepEqual(menuWaiting(navMenuFor(engineer, DEFAULT_NAV_SETTINGS), undefined, undefined), {});
});

test("the phone's Home tabs: every module has one, each page a user may open is in one tab, masters stay out", () => {
  const named = new Set(NAV_MODULE_NAME_KEYS);
  for (const key of named) assert.ok(HOME_TABS.some((t) => t.key === homeTabOf({ key, family: 'work' })), key);
  for (const settings of [DEFAULT_NAV_SETTINGS, { ...DEFAULT_NAV_SETTINGS, ...departments }])
    for (const user of [admin, engineer]) {
      const menu = navMenuFor(user, settings);
      const tabs = homeTabsFor(menu);
      assert.equal(tabs[0].key, 'overview');
      const shown = new Map<string, string>();
      for (const t of tabs.slice(1)) {
        const sections = homeTabSections(menu, t.key as Exclude<typeof t.key, 'overview'>);
        assert.ok(sections.length, `${settings.moduleSet} › ${t.key} is shown with nothing in it`);
        const ids = sections.flatMap((s) => s.nodes.map((n) => n.shortcutOf ?? n.id));
        assert.equal(new Set(ids).size, ids.length, `${settings.moduleSet} › ${t.key}: a page twice`);
        for (const id of ids) shown.set(id, t.key);
      }
      // Every page outside Masters is in a tab, and only pages the user may open.
      for (const m of menu) for (const s of m.subs) if (s.key !== 'masters') for (const n of s.nodes) assert.ok(shown.has(n.shortcutOf ?? n.id), `${settings.moduleSet} › ${m.key} › ${n.id} is in no tab`);
      for (const id of shown.keys()) assert.ok(canSeeNav(user, navNode(id)!), id);
    }
  const engineerMenu = navMenuFor(engineer, DEFAULT_NAV_SETTINGS);
  assert.ok(!homeTabsFor(engineerMenu).some((t) => t.key === 'admin'), 'a site engineer has no Admin tab');
  const hr = homeTabSections(engineerMenu, 'hr');
  assert.ok(hr.some((s) => s.nodes.some((n) => n.id === 'site.attendance')), 'labour attendance is with HR');
  const dept = navMenuFor(admin, { ...DEFAULT_NAV_SETTINGS, ...departments, names: { 'quality-control': 'QC' } });
  const quality = homeTabSections(dept, 'quality');
  assert.deepEqual(
    quality.map((s) => s.title),
    ['Safety', 'QC'],
    "a module's part takes its sub-module's name, a whole module the company's",
  );
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
