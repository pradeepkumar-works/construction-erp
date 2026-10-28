/**
 * Group companies' tests (phase 1, ARCHITECTURE "Group companies"): which company a sign-in lands in, when an email
 * gives someone a place in a sister company, who may be given a place, the group's admins, what a company's Users page
 * may change of a shared sign-in, and the modules each kind of company starts with. No database. CI runs it:
 *
 *   node dist/scripts/group-companies-test.js
 */
import assert from 'node:assert/strict';
import { COMPANY_KINDS, COMPANY_KIND_INFO, SWITCHABLE_MODULES, canSeeGroupCompanies, isGroupPlaceRole } from '@erp/shared';
import { adminChangeProblem, emailUse, pickPlace, placeProblem, sharedLoginProblem, type PlaceRow } from '../group/group-rules';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);

const place = (id: string, org: string, made: string, more: Partial<PlaceRow> = {}): PlaceRow => ({ id, organizationId: org, isActive: true, suspended: false, createdAt: new Date(made), ...more });

test('a sign-in lands in the company used last', () => {
  const rows = [place('u1', 'build', '2026-01-01'), place('u2', 'lab', '2026-03-01')];
  assert.equal(pickPlace(rows, 'lab')?.id, 'u2');
  assert.equal(pickPlace(rows, 'build')?.id, 'u1');
});

test('with no company used yet, or one no longer open, it lands in the first place given', () => {
  const rows = [place('u2', 'lab', '2026-03-01'), place('u1', 'build', '2026-01-01')];
  assert.equal(pickPlace(rows, null)?.id, 'u1');
  assert.equal(pickPlace([place('u2', 'lab', '2026-03-01', { isActive: false }), place('u1', 'build', '2026-01-01')], 'lab')?.id, 'u1');
  assert.equal(pickPlace([place('u1', 'build', '2026-01-01', { suspended: true }), place('u2', 'lab', '2026-03-01')], 'build')?.id, 'u2');
});

test('no active place means no sign-in; only suspended ones land there so the sign-in says so', () => {
  assert.equal(pickPlace([place('u1', 'build', '2026-01-01', { isActive: false })], 'build'), null);
  assert.equal(pickPlace([], null), null);
  assert.equal(pickPlace([place('u1', 'build', '2026-01-01', { suspended: true })], 'build')?.id, 'u1');
});

test('an email is new, already here, in a sister company, or someone else’s', () => {
  const here = { organizationId: 'lab', groupId: 'g1' };
  assert.equal(emailUse([], here), 'NEW');
  assert.equal(emailUse([{ organizationId: 'lab', groupId: 'g1' }], here), 'HERE');
  assert.equal(emailUse([{ organizationId: 'build', groupId: 'g1' }], here), 'SISTER');
  assert.equal(emailUse([{ organizationId: 'build', groupId: 'g1' }, { organizationId: 'other', groupId: 'g2' }], here), 'ELSEWHERE');
  assert.equal(emailUse([{ organizationId: 'other', groupId: null }], here), 'ELSEWHERE');
});

test('a company outside any group never shares a sign-in', () => {
  assert.equal(emailUse([{ organizationId: 'a', groupId: null }], { organizationId: 'b', groupId: null }), 'ELSEWHERE');
});

test('a place is given in a company of the group, to someone of the group, with a staff role, once', () => {
  const ok = { roleKey: 'QA_QC_ENGINEER' as const, companyInGroup: true, personInGroup: true, existingActive: false };
  assert.equal(placeProblem(ok), null);
  assert.equal(placeProblem({ ...ok, companyInGroup: false }), 'Choose a company of this group');
  assert.equal(placeProblem({ ...ok, personInGroup: false }), 'Choose someone who works in a company of this group');
  assert.match(placeProblem({ ...ok, roleKey: 'CONSULTANT' })!, /company's own pages/);
  assert.match(placeProblem({ ...ok, roleKey: 'SUPPLIER' })!, /company's own pages/);
  assert.match(placeProblem({ ...ok, existingActive: true })!, /already work/);
  assert.ok(isGroupPlaceRole('ADMIN') && !isGroupPlaceRole('CLIENT_ENGINEER'));
});

test('the group always keeps an admin', () => {
  assert.equal(adminChangeProblem({ adminCount: 2, isAdmin: true, makeAdmin: false }), null);
  assert.match(adminChangeProblem({ adminCount: 1, isAdmin: true, makeAdmin: false })!, /needs an admin/);
  assert.equal(adminChangeProblem({ adminCount: 1, isAdmin: false, makeAdmin: true }), null);
});

test('a shared sign-in’s email and password are not changed from one company', () => {
  assert.equal(sharedLoginProblem([], 'email'), null);
  assert.equal(sharedLoginProblem([], 'password'), null);
  assert.equal(sharedLoginProblem(['Demo Quality Labs'], 'email'), 'They also sign in to Demo Quality Labs with this email, so it cannot be changed from here.');
  assert.match(sharedLoginProblem(['A', 'B'], 'password')!, /A, B .* reset link/);
});

test('Group companies is for the group’s admins, and for a company admin before there is a group', () => {
  assert.equal(canSeeGroupCompanies({ roleKey: 'ADMIN' }), true);
  assert.equal(canSeeGroupCompanies({ roleKey: 'PROJECT_MANAGER' }), false);
  assert.equal(canSeeGroupCompanies({ roleKey: 'ADMIN', group: { id: 'g', name: 'G', admin: false } }), false);
  assert.equal(canSeeGroupCompanies({ roleKey: 'MANAGEMENT', group: { id: 'g', name: 'G', admin: true } }), true);
});

test('each kind starts with known modules off; construction with every module', () => {
  for (const kind of COMPANY_KINDS) assert.ok(COMPANY_KIND_INFO[kind].modulesOff.every((m) => (SWITCHABLE_MODULES as readonly string[]).includes(m)), kind);
  assert.deepEqual(COMPANY_KIND_INFO.CONSTRUCTION.modulesOff, []);
  assert.ok(COMPANY_KIND_INFO.QUALITY_LAB.modulesOff.includes('rmc'));
  assert.ok(!COMPANY_KIND_INFO.QUALITY_LAB.modulesOff.includes('books'));
  assert.ok(COMPANY_KIND_INFO.HOLDING.modulesOff.length > COMPANY_KIND_INFO.CONSULTANCY.modulesOff.length);
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
