/**
 * Tests for a project's area summaries (ARCHITECTURE "Overviews answer first"): every warning kind and entry kind has its
 * area, what waits is grouped by kind and by whom it waits on in the one waiting order, an area lists only its project's
 * warnings, and the week's daily reports count from the project's start. Pure, so it needs no database:
 *
 *   node dist/scripts/project-areas-test.js
 */
import assert from 'node:assert/strict';
import {
  AREA_EXCEPTIONS,
  PROJECT_AREAS,
  SUBMISSION_AREA,
  SUBMISSION_TYPES,
  WARNING_AREA,
  WARNING_KINDS,
  areaExceptions,
  areaSubmissionTypes,
  areaSummaryTab,
  areaWaiting,
  areaWarningKinds,
  daysWithoutReport,
  type AreaWaitingEntry,
  type WarningDto,
  type WarningKind,
} from '@erp/shared';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

test('every warning kind and entry kind has its place, and each area its summary tab', () => {
  assert.deepEqual(Object.keys(WARNING_AREA).sort(), [...WARNING_KINDS].sort());
  assert.deepEqual(Object.keys(SUBMISSION_AREA).sort(), [...SUBMISSION_TYPES].sort());
  assert.deepEqual(PROJECT_AREAS.map(areaSummaryTab), ['plan-summary', 'site-summary', 'materials-summary', 'money-summary']);
  const listed = PROJECT_AREAS.flatMap(areaWarningKinds);
  assert.equal(new Set(listed).size, listed.length, 'a kind leads under one area only');
  assert.ok(!listed.includes('LOAN_EMI'), "a machine loan's EMI is no one project's");
});

test('an area shows a kind waiting only to a role that reads its list', () => {
  assert.ok(areaSubmissionTypes('money', 'PROJECT_MANAGER').includes('BILL'));
  assert.ok(!areaSubmissionTypes('money', 'SITE_ENGINEER').includes('BILL'), 'no RA bills for a site engineer');
  assert.ok(areaSubmissionTypes('money', 'SITE_ENGINEER').includes('EXPENSE'));
  assert.ok(!areaSubmissionTypes('money', 'SITE_ENGINEER').includes('VENDOR_BILL'), 'nor vendor bills');
  assert.deepEqual(areaSubmissionTypes('site', 'CLIENT_ENGINEER'), [], 'a guest sees nothing waiting');
  assert.deepEqual(areaSubmissionTypes('plan', 'ADMIN'), [], 'nothing is approved in the plan');
});

const entry = (e: Partial<AreaWaitingEntry> & Pick<AreaWaitingEntry, 'type'>): AreaWaitingEntry => ({ amount: null, waitingSince: '2026-11-01T10:00:00.000Z', waitingWith: ['Project manager'], yours: false, ...e });

test('what waits is grouped by kind and by whom, the rupees first, then the oldest', () => {
  const rows = areaWaiting(
    [
      entry({ type: 'DPR', waitingSince: '2026-10-25T09:00:00.000Z' }),
      entry({ type: 'DPR', waitingSince: '2026-10-31T09:00:00.000Z' }),
      entry({ type: 'DPR', yours: true, waitingSince: '2026-11-01T09:00:00.000Z' }),
      entry({ type: 'EXPENSE', amount: '150000.00', waitingWith: ['Management', 'Accounts manager'] }),
      entry({ type: 'EXPENSE', amount: '50000.00', waitingWith: ['Accounts manager', 'Management'] }),
    ],
    '2026-11-02',
    true,
  );
  assert.deepEqual(
    rows.map((r) => [r.type, r.yours, r.waitingWith.join(' and '), r.count, r.oldestDays, r.amount]),
    [
      ['EXPENSE', false, 'Accounts manager and Management', 2, 1, '200000.00'],
      ['DPR', false, 'Project manager', 2, 8, null],
      ['DPR', true, '', 1, 1, null],
    ],
  );
  assert.equal(rows[0].tab, 'expenses');
});

test('a role that sees no amounts gets none, and the order falls to the oldest', () => {
  const rows = areaWaiting([entry({ type: 'BILL', amount: '90000000.00' }), entry({ type: 'MEASUREMENT', waitingSince: '2026-10-20T00:00:00.000Z' })], '2026-11-02', false);
  assert.deepEqual(rows.map((r) => [r.type, r.amount]), [
    ['MEASUREMENT', null],
    ['BILL', null],
  ]);
});

const warning = (kind: WarningKind, projectId: string | null, key: string): WarningDto => ({
  key,
  kind,
  title: key,
  detail: '',
  action: '',
  impact: null,
  confidence: 'CHECKED',
  working: [],
  facts: [],
  links: [],
  projectId,
  projectName: null,
  dismissed: null,
});

test("an area lists its own project's warnings in the watch list's order, the first few and how many more", () => {
  const open = [
    warning('CASH', 'p1', 'cash'),
    warning('SCHEDULE', 'p1', 'late'),
    warning('DPR', 'p1', 'dpr'),
    warning('SCHEDULE', 'p2', 'other'),
    warning('BOQ_OFF_CONTRACT', 'p1', 'boq'),
    warning('LOAN_EMI', null, 'emi'),
  ];
  assert.deepEqual(areaExceptions(open, 'p1', 'plan').top.map((w) => w.key), ['late', 'boq']);
  assert.deepEqual(areaExceptions(open, 'p1', 'money').top.map((w) => w.key), ['cash']);
  const many = Array.from({ length: AREA_EXCEPTIONS + 2 }, (_, i) => warning('STOCK', 'p1', `s${i}`));
  const { top, more } = areaExceptions(many, 'p1', 'materials');
  assert.equal(top.length, AREA_EXCEPTIONS);
  assert.equal(more, 2);
});

test("the week's daily reports count back from yesterday, and not before the project started", () => {
  const sent = new Set(['2026-11-01', '2026-10-30', '2026-10-27']);
  assert.deepEqual(daysWithoutReport(sent, '2026-11-02', '2026-01-01'), { missing: 4, counted: 7 });
  assert.deepEqual(daysWithoutReport(sent, '2026-11-02', '2026-10-30'), { missing: 1, counted: 3 }, 'from the start on 30 Oct');
  assert.deepEqual(daysWithoutReport(new Set(), '2026-11-02', '2026-11-02'), { missing: 0, counted: 0 }, 'a project starting today owes none yet');
  assert.deepEqual(daysWithoutReport(new Set(), '2026-03-02', null), { missing: 7, counted: 7 }, 'across a month end');
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
  } catch (e) {
    failed++;
    console.error(`✗ ${name}\n  ${(e as Error).message}`);
  }
}
console.log(`Project areas: ${tests.length - failed} of ${tests.length} tests pass`);
if (failed) process.exit(1);
