/**
 * Launcher tests (phases 2 and 3, ARCHITECTURE "Launcher Home" and "Discover and access requests"): pin positions, New and
 * Featured marks, what Discover shows each role and who may ask for what, with no database. CI runs it after the build:
 *
 *   node dist/scripts/launcher-test.js
 */
import assert from 'node:assert/strict';
import {
  DISCOVER_SHOWN,
  LAUNCHER_FLAG_NODES,
  accessGrantCheck,
  accessGrantProblem,
  byPosition,
  canRequestNav,
  discoverFor,
  launcherMarks,
  navNode,
  navRootOf,
  positionBetween,
  type LauncherDto,
  type LauncherFlagDto,
} from '@erp/shared';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);

const TODAY = '2026-10-23';
const none: Pick<LauncherDto, 'flags' | 'opened' | 'requests' | 'discoverLocked'> = { flags: [], opened: [], requests: [], discoverLocked: true };
const shown = (entries: ReturnType<typeof discoverFor>) => entries.map((e) => `${e.node.id}:${e.reason}`);
const flag = (nodeId: string, f: Partial<LauncherFlagDto>): LauncherFlagDto => ({ nodeId, isNew: null, newUntil: null, featured: null, ...f });

test('a position always fits between two others, and pins sort by it', () => {
  const a = positionBetween(null, null);
  const b = positionBetween(a, null);
  const between = positionBetween(a, b);
  assert.ok(a < between && between < b);
  assert.ok(positionBetween(null, a) < a);
  assert.deepEqual(byPosition([{ position: b }, { position: a }, { position: between }]).map((p) => p.position), [a, between, b]);
});

test('New comes from the tree until its day, and the company can turn it on, off or give it a day of its own', () => {
  const tenders = navNode('tenders')!;
  assert.equal(launcherMarks(tenders, undefined, TODAY).isNew, true);
  assert.equal(launcherMarks(tenders, undefined, '2027-04-01').isNew, false);
  assert.equal(launcherMarks(tenders, flag('tenders', { isNew: false }), TODAY).isNew, false);
  const site = navNode('site')!;
  assert.equal(launcherMarks(site, undefined, TODAY).isNew, false);
  assert.equal(launcherMarks(site, flag('site', { isNew: true }), TODAY).isNew, true);
  assert.equal(launcherMarks(site, flag('site', { isNew: true, newUntil: '2026-10-22' }), TODAY).isNew, false);
  assert.equal(launcherMarks(site, flag('site', { isNew: true, newUntil: TODAY }), TODAY).isNew, true);
});

test('Featured is off unless the tree or the company turns it on; a null keeps the default', () => {
  const site = navNode('site')!;
  assert.equal(launcherMarks(site, undefined, TODAY).featured, false);
  assert.equal(launcherMarks(site, flag('site', { featured: true }), TODAY).featured, true);
  assert.equal(launcherMarks(site, flag('site', { featured: null, isNew: true }), TODAY).featured, false);
});

test('Home tiles to mark are the top-level tiles but My work, and a visit counts for the module it is under', () => {
  const ids = LAUNCHER_FLAG_NODES.map((n) => n.id);
  assert.ok(ids.includes('site') && ids.includes('approvals') && ids.includes('admin'));
  assert.ok(!ids.includes('my-work') && !ids.includes('home'));
  assert.equal(navRootOf('site.dpr'), 'site');
  assert.equal(navRootOf('site'), 'site');
  assert.equal(navRootOf('no-such-node'), undefined);
});

test('a site engineer sees New first, then modules never opened (three at most), then modules to ask for', () => {
  assert.deepEqual(shown(discoverFor({ roleKey: 'SITE_ENGINEER' }, none, TODAY)), ['tenders:new', 'rmc:new', 'projects:unopened', 'site:unopened', 'quality:unopened', 'correspondence:locked']);
  const entries = discoverFor({ roleKey: 'SITE_ENGINEER' }, none, TODAY);
  assert.equal(entries.find((e) => e.node.id === 'tenders')!.locked, true, 'New but not for the role: greyed, with Request access');
  assert.equal(entries.find((e) => e.node.id === 'rmc')!.locked, false);
});

test('opening a module takes it out of Discover, New included', () => {
  const after = discoverFor({ roleKey: 'SITE_ENGINEER' }, { ...none, opened: ['rmc', 'projects', 'site', 'quality', 'documents'] }, TODAY);
  assert.deepEqual(shown(after).slice(0, 3), ['tenders:new', 'safety:unopened', 'materials:unopened']);
  assert.ok(!shown(after).some((s) => s.startsWith('rmc:') || s.startsWith('site:')));
});

test('Featured leads after New; with the switch off a role sees only what it can open', () => {
  const featured = discoverFor({ roleKey: 'SITE_ENGINEER' }, { ...none, flags: [flag('documents', { featured: true }), flag('tenders', { isNew: false }), flag('rmc', { isNew: false })] }, TODAY);
  assert.deepEqual(shown(featured).slice(0, 2), ['documents:featured', 'projects:unopened']);
  const closed = discoverFor({ roleKey: 'SITE_ENGINEER' }, { ...none, discoverLocked: false }, TODAY);
  assert.ok(closed.every((e) => !e.locked));
  assert.ok(!shown(closed).some((s) => s.startsWith('tenders:')));
});

test('New and Featured filling Discover still leave a place for a module to ask for', () => {
  const full = discoverFor({ roleKey: 'SITE_ENGINEER' }, { ...none, flags: [flag('documents', { featured: true })] }, TODAY);
  assert.deepEqual(shown(full), ['tenders:new', 'rmc:new', 'documents:featured', 'projects:unopened', 'site:unopened', 'correspondence:locked']);
});

test('a module the company turned off is neither shown nor asked for; Admin and single pages are never asked for', () => {
  const off = discoverFor({ roleKey: 'SITE_ENGINEER', modulesOff: ['rmc', 'tenders', 'payroll'] }, none, TODAY);
  assert.ok(!shown(off).some((s) => /^(rmc|tenders|payroll):/.test(s)));
  assert.equal(canRequestNav({ roleKey: 'SITE_ENGINEER', modulesOff: ['payroll'] }, navNode('payroll')!), false);
  assert.equal(canRequestNav({ roleKey: 'SITE_ENGINEER' }, navNode('payroll')!), true);
  assert.equal(canRequestNav({ roleKey: 'SITE_ENGINEER' }, navNode('admin')!), false);
  assert.equal(canRequestNav({ roleKey: 'SITE_ENGINEER' }, navNode('watch')!), false);
  assert.equal(canRequestNav({ roleKey: 'ADMIN' }, navNode('payroll')!), false, 'an admin already opens it');
});

test('Discover holds at most six, and a request rides on its tile', () => {
  for (const roleKey of ['ADMIN', 'MANAGEMENT', 'HR_MANAGER', 'STORE_MANAGER', 'SITE_ENGINEER'] as const) assert.ok(discoverFor({ roleKey }, none, TODAY).length <= DISCOVER_SHOWN, roleKey);
  const request = { id: 'r1', nodeId: 'correspondence', status: 'OPEN' as const, reply: null, createdAt: `${TODAY}T05:00:00.000Z`, decidedAt: null };
  const entries = discoverFor({ roleKey: 'SITE_ENGINEER' }, { ...none, requests: [request] }, TODAY);
  assert.equal(entries.find((e) => e.node.id === 'correspondence')!.request, request);
});

test('Grant lets someone in only when their role and the company\'s modules open the module', () => {
  const payroll = navNode('payroll')!;
  // Their role does not open it: say which roles do, and never offer Admin when another role will do.
  const blocked = accessGrantCheck({ roleKey: 'SITE_ENGINEER' }, payroll, (r) => ({ roleKey: r }));
  assert.equal(blocked.openNow, false);
  assert.equal(blocked.roleBlocks, true);
  assert.equal(blocked.moduleOff, false);
  assert.ok(blocked.rolesThatOpen.length > 0 && !blocked.rolesThatOpen.includes('ADMIN') && !blocked.rolesThatOpen.includes('SUPPLIER'), blocked.rolesThatOpen.join());
  assert.equal(blocked.rolesThatOpen[0], 'HR_MANAGER', 'the narrowest role that opens it comes first');
  assert.match(accessGrantProblem(blocked, 'Ravi', 'SITE_ENGINEER', 'Payroll')!, /^Ravi's role, Site engineer, does not open Payroll; .*Change their role in Users, then mark it granted\.$/);
  // Once their role opens it, Grant goes through.
  const hr = accessGrantCheck({ roleKey: 'HR_MANAGER' }, payroll, (r) => ({ roleKey: r }));
  assert.equal(hr.openNow, true);
  assert.equal(accessGrantProblem(hr, 'Ravi', 'HR_MANAGER', 'Payroll'), null);
  // The module is off: turn it on first, even for a role that would open it.
  const off = accessGrantCheck({ roleKey: 'HR_MANAGER', modulesOff: ['payroll'] }, payroll, (r) => ({ roleKey: r }));
  assert.deepEqual([off.openNow, off.moduleOff, off.roleBlocks], [false, true, false]);
  assert.equal(accessGrantProblem(off, 'Ravi', 'HR_MANAGER', 'Payroll'), 'Payroll is turned off for the company. Turn it on in Modules, then mark it granted.');
  const both = accessGrantCheck({ roleKey: 'SITE_ENGINEER', modulesOff: ['payroll'] }, payroll, (r) => ({ roleKey: r }));
  assert.match(accessGrantProblem(both, 'Ravi', 'SITE_ENGINEER', 'Payroll')!, /^Payroll is turned off for the company\. Turn it on in Modules\. Ravi's role, Site engineer, does not open Payroll.*Change their role in Users, then mark it granted\.$/);
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
