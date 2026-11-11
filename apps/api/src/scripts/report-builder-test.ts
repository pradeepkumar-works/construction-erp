/**
 * Reports people build (ARCHITECTURE "Reports you build"). A definition names only columns of its source's catalogue
 * (an unknown column, an object's own name or a hidden one is refused, or left out for someone else's report); the
 * catalogue hides what a role does not see; filters, one level of grouping, exact money totals and sort; the company's
 * own fields as columns; a schedule's period and its dedupe; and the email a schedule sends. Each source is offered to
 * exactly the roles its list's page admits (`NAV_ACCESS`), and a schedule holds once its owner leaves or loses the source.
 *
 *   node dist/scripts/report-builder-test.js
 */
import assert from 'node:assert/strict';
import {
  MAX_REPORT_COLUMNS,
  NAV_ACCESS,
  NAV_TREE,
  NOT_SET,
  REPORT_SOURCES,
  REPORT_SOURCE_KEYS,
  ROLE_KEYS,
  canBuildReports,
  canStopAnySchedule,
  catalogueFor,
  isRealDay,
  leftOutNotes,
  mayReceiveReport,
  readDefinition,
  reportSourcesFor,
  runReport,
  scaled,
  scheduleDedupeKey,
  scheduleDue,
  scheduleOwnerProblem,
  scheduleProblem,
  scheduleSince,
  scheduleWords,
  visibleDefinition,
  sumCells,
  unscaled,
  type CustomFieldDto,
  type ManagementReportDto,
  type ProjectSummary,
  type PurchaseOrderDto,
  type ReportDefinition,
} from '@erp/shared';
import { reportEmail } from '../report-builder/report-email';
import { uniqueRows } from '../report-builder/report-builder.service';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

const po = (id: string, vendorName: string, total: string, over: Partial<PurchaseOrderDto> = {}) =>
  ({ id, poNo: `PO-${id}`, poDate: '2026-11-03', projectId: 'p1', projectName: 'Ring road', vendorName, vendorGstin: null, vendorMsme: null, requestNo: null, status: 'APPROVED', open: true, deliveryBy: null, paymentDays: 30, lines: [{}], subtotal: total, gstAmount: '0.00', freight: '0.00', total, receivedPct: 0, advancePaid: '0.00', submittedByName: 'Asha', customValues: {}, ...over }) as unknown as PurchaseOrderDto;

const def = (over: Partial<ReportDefinition> = {}): ReportDefinition => ({ source: 'purchase-orders', columns: ['poNo', 'vendor', 'total'], filters: [], groupBy: null, totals: ['total'], sort: null, ...over });
const cat = catalogueFor('PROCUREMENT_MANAGER', 'purchase-orders');

test('every source has a starter its own catalogue offers, and keys that are its own', () => {
  for (const k of REPORT_SOURCE_KEYS) {
    const s = REPORT_SOURCES[k];
    assert.equal(s.key, k);
    const keys = new Set(s.columns.map((c) => c.key));
    assert.equal(keys.size, s.columns.length, `${k}: a column key twice`);
    for (const c of s.starter.columns) assert.ok(keys.has(c), `${k}: starter column ${c}`);
    for (const c of s.starter.totals) assert.ok(s.columns.find((x) => x.key === c)?.sum, `${k}: starter total ${c} does not add up`);
    if (s.dated) assert.ok(keys.has(s.dated.column), `${k}: dated column`);
    for (const c of s.columns) if (c.sum) assert.ok(['money', 'qty', 'count'].includes(c.kind), `${k}.${c.key} sums a ${c.kind}`);
  }
});

test('a site engineer is offered purchase orders and projects, but not contract value; a client guest nothing', () => {
  assert.ok(reportSourcesFor({ roleKey: 'SITE_ENGINEER' }).includes('purchase-orders'));
  assert.ok(!reportSourcesFor({ roleKey: 'SITE_ENGINEER' }).includes('ra-bills'));
  const projects = catalogueFor('SITE_ENGINEER', 'projects');
  assert.ok(!projects.columns.some((c) => c.key === 'contractValue' || c.key === 'revisedContractValue'));
  assert.equal(projects.hidden.get('contractValue'), 'Contract value');
  assert.ok(catalogueFor('ACCOUNTS_MANAGER', 'projects').columns.some((c) => c.key === 'contractValue'));
  assert.ok(!catalogueFor('STORE_MANAGER', 'vendors').columns.some((c) => c.key === 'bankAccountNo'));
  assert.equal(canBuildReports({ roleKey: 'CLIENT_ENGINEER' }), false);
  assert.equal(canBuildReports({ roleKey: 'SUPPLIER' }), false);
  assert.equal(canBuildReports({ roleKey: 'SITE_ENGINEER' }), true);
});

// The page each source's list is: its node in the navigation tree.
const SOURCE_ROUTES: Record<(typeof REPORT_SOURCE_KEYS)[number], string> = {
  'purchase-orders': '/purchase-orders',
  'vendor-bills': '/vendor-bills',
  'ra-bills': '/bills',
  indents: '/material-requests',
  stock: '/stock',
  vendors: '/vendors?kind=SUPPLIER',
  projects: '/projects',
};

test('every role is offered a source exactly when its list’s page opens for them (NAV_ACCESS), approvers of RA bills too', () => {
  const bill = [{ type: 'BILL' as const, maxAmount: null }];
  for (const k of REPORT_SOURCE_KEYS) {
    const node = NAV_TREE.find((n) => n.route === SOURCE_ROUTES[k]);
    assert.ok(node?.access, `${k}: no page at ${SOURCE_ROUTES[k]}`);
    const page = NAV_ACCESS[node.access as keyof typeof NAV_ACCESS];
    for (const roleKey of ROLE_KEYS)
      for (const approvalRights of [undefined, bill]) {
        const reader = { roleKey, approvalRights };
        assert.equal(REPORT_SOURCES[k].sees(reader), page(reader), `${k} for ${roleKey}${approvalRights ? ' with BILL rights' : ''}`);
        // A recipient is staff who opens the page; never a client's guest or a supplier.
        if (mayReceiveReport(reader, k)) assert.ok(page(reader) && !['CLIENT_ENGINEER', 'SUPPLIER'].includes(roleKey), `${k} to ${roleKey}`);
      }
  }
  // A role that does not prepare RA bills is offered them once the company's matrix makes it an approver.
  const role = ROLE_KEYS.find((r) => !REPORT_SOURCES['ra-bills'].sees({ roleKey: r }) && REPORT_SOURCES['ra-bills'].sees({ roleKey: r, approvalRights: bill }));
  assert.ok(role, 'some role sees RA bills only as an approver');
});

test('a schedule holds once its owner has left the company or no longer opens the source', () => {
  assert.equal(scheduleOwnerProblem({ isActive: true, roleKey: 'PROCUREMENT_MANAGER' }, 'purchase-orders'), null);
  assert.match(scheduleOwnerProblem({ isActive: false, roleKey: 'PROCUREMENT_MANAGER' }, 'purchase-orders')!, /no longer works in the company/);
  assert.match(scheduleOwnerProblem({ isActive: true, roleKey: 'SITE_ENGINEER' }, 'ra-bills')!, /no longer opens ra bills/);
  assert.match(scheduleOwnerProblem({ isActive: true, roleKey: 'CLIENT_ENGINEER' }, 'projects')!, /no longer opens projects/);
  // Only an admin stops someone else's schedule.
  assert.equal(canStopAnySchedule('ADMIN'), true);
  assert.equal(canStopAnySchedule('PROJECT_MANAGER'), false);
});

test('an unknown column is refused, an object’s own names too, and nothing but own keys is read', () => {
  const r = readDefinition({ ...def(), columns: ['poNo', 'drop table'] }, cat);
  assert.equal(r.definition, null);
  assert.match(r.problems.join(), /no column “drop table”/);
  for (const k of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) assert.equal(readDefinition({ ...def(), columns: [k] }, cat).definition, null, k);
  const inherited = Object.create({ columns: ['poNo'], source: 'purchase-orders' });
  assert.equal(readDefinition(inherited, cat).definition, null);
  assert.equal(readDefinition({ ...def(), filters: [{ column: 'vendor', op: 'is', value: 'A', extra: 1 }] }, cat).definition!.filters[0].hasOwnProperty('extra'), false);
  assert.equal(readDefinition({ ...def(), source: 'vendors' }, cat).definition, null);
  assert.equal(readDefinition('select *', cat).definition, null);
});

test('a hidden column is refused on save, and left out with its name when someone else’s report is run', () => {
  const projects = catalogueFor('SITE_ENGINEER', 'projects');
  const raw = { source: 'projects', columns: ['name', 'contractValue'], filters: [], groupBy: null, totals: ['contractValue'], sort: null };
  const strict = readDefinition(raw, projects);
  assert.equal(strict.definition, null);
  assert.match(strict.problems.join(), /Your role does not see Contract value/);
  const dropped = readDefinition(raw, projects, { drop: true });
  assert.deepEqual(dropped.definition!.columns, ['name']);
  assert.deepEqual(dropped.definition!.totals, []);
  assert.deepEqual(dropped.left, ['Contract value']);
  assert.deepEqual(dropped.leftFilters, []);
});

test('a condition on a hidden column is dropped by name, and someone else’s report reads as only what the reader sees', () => {
  const projects = catalogueFor('SITE_ENGINEER', 'projects');
  const raw = { source: 'projects', columns: ['name', 'contractValue'], filters: [{ column: 'contractValue', op: 'atLeast', value: '1000000' }, { column: 'status', op: 'is', value: 'Active' }], groupBy: null, totals: ['contractValue'], sort: { column: 'contractValue', desc: true } };
  const dropped = readDefinition(raw, projects, { drop: true });
  assert.deepEqual(dropped.leftFilters, ['Contract value']);
  assert.deepEqual(leftOutNotes(dropped), ['Left out, as your role does not see it: Contract value.', 'Not limited by Contract value, which your role does not see.']);
  // A condition alone (not shown) still says the report is not limited by it.
  const onlyFilter = readDefinition({ ...raw, columns: ['name'], totals: [], sort: null }, projects, { drop: true });
  assert.deepEqual(leftOutNotes(onlyFilter), ['Not limited by Contract value, which your role does not see.']);
  const seen = visibleDefinition(raw, projects);
  assert.deepEqual(seen, { source: 'projects', columns: ['name'], filters: [{ column: 'status', op: 'is', value: 'Active' }], groupBy: null, totals: [], sort: null });
  assert.ok(!JSON.stringify(seen).includes('contractValue'));
  // Every column hidden: nothing of it reads back.
  assert.deepEqual(visibleDefinition({ ...raw, columns: ['contractValue'] }, projects).columns, []);
  assert.match(readDefinition({ ...raw, columns: ['contractValue'] }, projects, { drop: true }).problems.join(), /None of this report’s columns is shown to your role/);
});

test('totals are capped like columns, and an impossible day is never a day', () => {
  const many = Array.from({ length: MAX_REPORT_COLUMNS + 1 }, () => 'total');
  assert.match(readDefinition({ ...def(), totals: many }, cat).problems.join(), new RegExp(`Keep to ${MAX_REPORT_COLUMNS} totals`));
  assert.equal(isRealDay('2026-02-31'), false);
  assert.equal(isRealDay('2026-13-01'), false);
  assert.equal(isRealDay('2026-00-10'), false);
  assert.equal(isRealDay('9999-99-99'), false);
  assert.equal(isRealDay('2028-02-29'), true);
  assert.equal(isRealDay('2026-11-11'), true);
});

test('rows read a page at a time are each kept once', () => {
  const rows = [{ id: 'a' }, { id: 'b' }, { id: 'a' }, { name: 'no id' }, { name: 'no id' }];
  assert.deepEqual(uniqueRows(rows), [{ id: 'a' }, { id: 'b' }, { name: 'no id' }, { name: 'no id' }]);
});

test('filters by kind: words, figures as exact decimals, days; a condition the kind does not take is refused', () => {
  const rows = [po('1', 'Acme', '100.00'), po('2', 'Bharat Steel', '250.50', { status: 'SUBMITTED' }), po('3', 'acme', '99.99', { poDate: '2026-11-20' })];
  const run = (filters: unknown[]) => runReport(rows, readDefinition({ ...def(), columns: ['poNo', 'vendor', 'total', 'poDate', 'status'], filters }, cat).definition!, cat).count;
  assert.equal(run([{ column: 'vendor', op: 'is', value: 'ACME' }]), 2);
  assert.equal(run([{ column: 'vendor', op: 'isNot', value: 'acme' }]), 1);
  assert.equal(run([{ column: 'vendor', op: 'contains', value: 'steel' }]), 1);
  assert.equal(run([{ column: 'total', op: 'atLeast', value: '100' }]), 2);
  assert.equal(run([{ column: 'total', op: 'atMost', value: '99.99' }]), 1);
  assert.equal(run([{ column: 'poDate', op: 'from', value: '2026-11-04' }]), 1);
  assert.equal(run([{ column: 'status', op: 'is', value: 'Approved' }]), 2);
  assert.equal(readDefinition({ ...def(), filters: [{ column: 'total', op: 'contains', value: '1' }] }, cat).definition, null);
  assert.equal(readDefinition({ ...def(), filters: [{ column: 'total', op: 'atLeast', value: '1e5' }] }, cat).definition, null);
  assert.equal(readDefinition({ ...def(), filters: [{ column: 'poDate', op: 'from', value: '2026-02-30' }] }, cat).definition, null);
});

test('money totals add exactly as decimal strings, never floats', () => {
  assert.equal(sumCells('money', ['0.10', '0.20']), '0.30');
  assert.equal(sumCells('money', ['9999999999999999.99', '0.01']), '10000000000000000.00');
  assert.equal(sumCells('money', ['-5.25', '2.00', null]), '-3.25');
  assert.equal(sumCells('qty', ['1.125', '2.250']), '3.375');
  assert.equal(sumCells('count', [1, 2, 3]), 6);
  assert.equal(unscaled(scaled('12.345', 2)!, 2), '12.35');
  const rows = Array.from({ length: 10 }, (_, i) => po(String(i), 'Acme', '0.10'));
  const out = runReport(rows, def(), cat);
  assert.equal(out.sections[0].total!.total, '1.00');
});

test('grouping: a summary of each vendor with its count and total above the rows, and both totals tie', () => {
  const rows = [po('1', 'Acme', '100.00'), po('2', 'Bharat Steel', '250.50'), po('3', 'Acme', '0.25'), po('4', '', '10.00')];
  const out = runReport(rows, def({ groupBy: 'vendor', sort: { column: 'total', desc: true } }), cat);
  assert.equal(out.sections.length, 2);
  const [groups, detail] = out.sections;
  assert.equal(groups.title, 'By vendor');
  assert.deepEqual(groups.rows.map((r) => [r['group:vendor'], r._count, r.total]), [
    ['Bharat Steel', 1, '250.50'],
    ['Acme', 2, '100.25'],
    ['Not set', 1, '10.00'],
  ]);
  assert.equal(groups.total!.total, '360.75');
  assert.equal(groups.total!._count, 4);
  assert.equal(detail.total!.total, '360.75');
  // The rows sit under their group, largest first within it.
  assert.deepEqual(detail.rows.map((r) => r.poNo), ['PO-1', 'PO-3', 'PO-2', 'PO-4']);
  assert.equal(detail.rows[0]._href, '/purchase-orders/1');
  assert.equal(readDefinition({ ...def(), groupBy: 'total' }, cat).definition, null);
  assert.equal(readDefinition({ ...def(), totals: ['vendor'] }, cat).definition, null);
  assert.equal(readDefinition({ ...def(), columns: ['poNo'], totals: ['total'] }, cat).definition, null);
});

test('a real “Not set” and a blank are two groups; sorting down on the grouped column orders the groups down', () => {
  const rows = [po('1', NOT_SET, '1.00'), po('2', '', '2.00'), po('3', 'Acme', '3.00'), po('4', 'Zenith', '4.00'), po('5', NOT_SET, '5.00')];
  const groups = (desc: boolean) => runReport(rows, def({ groupBy: 'vendor', sort: { column: 'vendor', desc } }), cat).sections;
  const [down, rowsDown] = groups(true);
  assert.deepEqual(down.rows.map((r) => [r['group:vendor'], r._count]), [
    ['Zenith', 1],
    [NOT_SET, 2],
    ['Acme', 1],
    [`${NOT_SET} (blank)`, 1],
  ]);
  assert.deepEqual(rowsDown.rows.map((r) => r.poNo), ['PO-4', 'PO-1', 'PO-5', 'PO-3', 'PO-2']);
  assert.deepEqual(groups(false)[0].rows.map((r) => r['group:vendor']), ['Acme', NOT_SET, 'Zenith', `${NOT_SET} (blank)`]);
  // With no real "Not set", the blank group keeps the plain name.
  assert.equal(runReport([po('1', '', '1.00')], def({ groupBy: 'vendor' }), cat).sections[0].rows[0]['group:vendor'], NOT_SET);
  // Totals sorted down keep blanks last too.
  const byTotal = runReport([po('1', 'A', '1.00'), po('2', 'B', '9.00')], def({ groupBy: 'vendor', sort: { column: 'total', desc: true } }), cat).sections[0];
  assert.deepEqual(byTotal.rows.map((r) => r['group:vendor']), ['B', 'A']);
});

test('sort: figures by value, words by name, blanks last; an empty report says so', () => {
  const rows = [po('1', 'b', '9.00'), po('2', 'a', '10.00'), po('3', 'c', '100.00', { vendorName: null as unknown as string })];
  assert.deepEqual(runReport(rows, def({ sort: { column: 'total', desc: false } }), cat).sections[0].rows.map((r) => r.poNo), ['PO-1', 'PO-2', 'PO-3']);
  assert.deepEqual(runReport(rows, def({ sort: { column: 'vendor', desc: false } }), cat).sections[0].rows.map((r) => r.poNo), ['PO-2', 'PO-1', 'PO-3']);
  const none = runReport([], def(), cat).sections[0];
  assert.equal(none.rows.length, 0);
  assert.equal(none.total, undefined);
  assert.match(none.empty!, /No purchase orders/);
});

test('the company’s own fields are columns of their sources, read from the record’s own keys', () => {
  const fields = [
    { key: 'costCentre', label: 'Cost centre', kind: 'CHOICE', unit: null, options: ['North', 'South'], archived: false },
    { key: 'weight', label: 'Weight', kind: 'NUMBER', unit: 't', options: [], archived: false },
    { key: 'old', label: 'Old code', kind: 'TEXT', unit: null, options: [], archived: true },
  ] as unknown as CustomFieldDto[];
  const c = catalogueFor('PROCUREMENT_MANAGER', 'purchase-orders', fields);
  assert.deepEqual(c.columns.filter((x) => x.key.startsWith('cf:')).map((x) => [x.key, x.kind, x.sum]), [
    ['cf:costCentre', 'text', false],
    ['cf:weight', 'qty', true],
    ['cf:old', 'text', false],
  ]);
  const rows = [po('1', 'A', '1.00', { customValues: { costCentre: 'North', weight: 1.5 } }), po('2', 'A', '1.00', { customValues: { costCentre: 'South', weight: 2 } }), po('3', 'A', '1.00', { customValues: Object.create({ costCentre: 'North' }) })];
  const d = readDefinition({ ...def(), columns: ['poNo', 'cf:costCentre', 'cf:weight'], totals: ['cf:weight'], groupBy: 'cf:costCentre' }, c).definition!;
  const out = runReport(rows, d, c);
  assert.deepEqual(out.sections[0].rows.map((r) => [r['group:cf:costCentre'], r['cf:weight']]), [
    ['North', '1.500'],
    ['South', '2.000'],
    ['Not set', '0.000'],
  ]);
  // A large number reads as a decimal, never in exponent form.
  const big = runReport([po('9', 'A', '1.00', { customValues: { weight: 1e21 } }), po('8', 'A', '1.00', { customValues: { weight: 0.1 } })], readDefinition({ ...def(), columns: ['poNo', 'cf:weight'], totals: [] }, c).definition!, c);
  assert.deepEqual(big.sections[0].rows.map((r) => r['cf:weight']), ['1000000000000000000000', '0.1']);
  // Projects without the field in the catalogue: a saved report naming it leaves it out with its name.
  assert.deepEqual(readDefinition({ ...def(), columns: ['poNo', 'cf:gone'], totals: [] }, cat, { drop: true }).left, ['gone']);
  assert.ok(catalogueFor('ADMIN', 'projects', fields).columns.some((x) => x.key === 'cf:weight'));
  assert.ok(!catalogueFor('ADMIN', 'vendor-bills', fields).columns.some((x) => x.key.startsWith('cf:')));
});

test('a weekly schedule owes the seven days before its send day, once per period, and catches up a missed day', () => {
  const rule = { frequency: 'WEEKLY' as const, weekday: 0, dayOfMonth: 1, since: '2026-11-01' };
  const mon = scheduleDue(rule, '2026-11-09')!;
  assert.deepEqual(mon, { sendOn: '2026-11-09', from: '2026-11-02', to: '2026-11-08', key: 'W2026-11-02' });
  // Wednesday's run owes the same week, so a second run (or a missed Monday) sends nothing new.
  assert.deepEqual(scheduleDue(rule, '2026-11-11'), mon);
  assert.equal(scheduleDedupeKey('s1', scheduleDue(rule, '2026-11-11')!), scheduleDedupeKey('s1', mon));
  assert.notEqual(scheduleDedupeKey('s1', scheduleDue(rule, '2026-11-16')!), scheduleDedupeKey('s1', mon));
  // Set on a Thursday: nothing until the next Monday.
  assert.equal(scheduleDue({ ...rule, since: '2026-11-12' }, '2026-11-13'), null);
  assert.equal(scheduleDue({ ...rule, since: '2026-11-12' }, '2026-11-16')!.from, '2026-11-09');
  assert.equal(scheduleDue({ ...rule, weekday: 3, since: '2026-11-01' }, '2026-11-12')!.to, '2026-11-11');
});

test('a new schedule never sends a period that ended before the day it was set', () => {
  const rule = { frequency: 'WEEKLY' as const, weekday: 0, dayOfMonth: 1, since: '2026-11-09' };
  // Set on the send day itself: last week ended yesterday, so nothing goes today; next Monday's week does.
  assert.equal(scheduleDue(rule, '2026-11-09'), null);
  assert.deepEqual(scheduleDue(rule, '2026-11-16'), { sendOn: '2026-11-16', from: '2026-11-09', to: '2026-11-15', key: 'W2026-11-09' });
  // A period that ends on the day it was set still goes.
  assert.equal(scheduleDue({ ...rule, since: '2026-11-15' }, '2026-11-16')!.to, '2026-11-15');
  assert.equal(scheduleDue({ ...rule, since: '2026-11-16' }, '2026-11-16'), null);
  const monthly = { frequency: 'MONTHLY' as const, weekday: 0, dayOfMonth: 1, since: '2026-11-01' };
  assert.equal(scheduleDue(monthly, '2026-11-01'), null);
  assert.equal(scheduleDue(monthly, '2026-12-01')!.key, 'M2026-11');
});

test('changing a schedule’s frequency or day starts it again from today; recipients alone keep its start', () => {
  const old = { frequency: 'WEEKLY' as const, weekday: 0, dayOfMonth: 1, since: '2026-10-01' };
  const today = '2026-11-11';
  assert.equal(scheduleSince(null, old, today), today);
  assert.equal(scheduleSince(old, { ...old }, today), '2026-10-01');
  // A weekly schedule's day of the month is not used, so changing it changes nothing.
  assert.equal(scheduleSince(old, { ...old, dayOfMonth: 15 }, today), '2026-10-01');
  assert.equal(scheduleSince(old, { ...old, weekday: 6 }, today), today);
  assert.equal(scheduleSince(old, { ...old, frequency: 'MONTHLY' }, today), today);
  assert.equal(scheduleSince({ ...old, frequency: 'MONTHLY' }, { ...old, frequency: 'MONTHLY', dayOfMonth: 2 }, today), today);
  // Moved from Monday to Sunday on a Wednesday: last Sunday's week (already sent on Monday, bar a day) does not go again.
  const moved = { ...old, weekday: 6, since: scheduleSince(old, { ...old, weekday: 6 }, today) };
  assert.equal(scheduleDue(old, today)!.key, 'W2026-11-02');
  assert.equal(scheduleDue({ ...old, weekday: 6 }, today)!.to, '2026-11-07');
  assert.equal(scheduleDue(moved, today), null);
});

test('a monthly schedule owes the calendar month before its send day, across a year end', () => {
  const rule = { frequency: 'MONTHLY' as const, weekday: 0, dayOfMonth: 3, since: '2026-01-01' };
  assert.deepEqual(scheduleDue(rule, '2026-11-03'), { sendOn: '2026-11-03', from: '2026-10-01', to: '2026-10-31', key: 'M2026-10' });
  assert.deepEqual(scheduleDue(rule, '2026-11-02'), { sendOn: '2026-10-03', from: '2026-09-01', to: '2026-09-30', key: 'M2026-09' });
  assert.deepEqual(scheduleDue(rule, '2027-01-05'), { sendOn: '2027-01-03', from: '2026-12-01', to: '2026-12-31', key: 'M2026-12' });
  assert.equal(scheduleDue(rule, '2027-03-03')!.to, '2027-02-28');
  assert.equal(scheduleDue({ ...rule, since: '2026-11-04' }, '2026-11-20'), null);
  assert.equal(scheduleWords(rule), 'On the 3rd of every month');
  assert.equal(scheduleWords({ ...rule, frequency: 'WEEKLY', weekday: 0 }), 'Every Monday');
});

test('a schedule needs its day and at least one recipient', () => {
  assert.equal(scheduleProblem({ frequency: 'WEEKLY', weekday: 2, recipientIds: ['u'] }), null);
  assert.match(scheduleProblem({ frequency: 'DAILY', recipientIds: ['u'] })!, /weekly or monthly/);
  assert.match(scheduleProblem({ frequency: 'MONTHLY', dayOfMonth: 31, recipientIds: ['u'] })!, /1 to 28/);
  assert.match(scheduleProblem({ frequency: 'WEEKLY', weekday: 0, recipientIds: [] })!, /who gets it/);
});

test('the scheduled email carries the first table with its total and the link', () => {
  const projects = catalogueFor('ADMIN', 'projects');
  const rows = [{ id: 'p1', code: 'RR-1', name: 'Ring <road>', contractValue: '1250000.50' }, { id: 'p2', code: 'RR-2', name: 'Bypass', contractValue: '100.00' }] as unknown as ProjectSummary[];
  const d = readDefinition({ source: 'projects', columns: ['name', 'contractValue'], totals: ['contractValue'] }, projects).definition!;
  const run = runReport(rows, d, projects);
  const dto: ManagementReportDto = { key: 'saved', title: 'Contracts', period: 'As of 9 Nov 2026', from: null, to: '2026-11-09', projectName: null, verticalName: null, scope: 'Every project you see', generatedAt: '', figures: [], sections: run.sections, notes: [] };
  const mail = reportEmail(dto, { firstName: 'Asha', href: 'https://app.example/my-reports/r1', orgName: 'Acme Builders', count: run.count, countLabel: 'Projects' });
  assert.equal(mail.subject, 'Contracts: As of 9 Nov 2026');
  assert.match(mail.html, /Ring &lt;road&gt;/);
  assert.match(mail.html, /12,50,100\.50/);
  assert.match(mail.html, /Total/);
  assert.match(mail.html, /https:\/\/app\.example\/my-reports\/r1/);
  assert.match(mail.text, /2 projects/);
  assert.ok(!/<road>/.test(mail.html));
  // The footnote is true: the owner, or an admin, can stop it.
  assert.match(mail.html, /The person who set it up, or an admin, can stop it/);
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
console.log(`\n${tests.length - failed} of ${tests.length} passed`);
if (failed) process.exit(1);
