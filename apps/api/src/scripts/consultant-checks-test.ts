/**
 * Consultant checks' tests (ARCHITECTURE "Consultant checks"): a check against the recorded quantity, each
 * level's share of a set of sheets by value (and by count when nothing has a value), the sheets to check next, the
 * certificate held to the certifier's share, the hidden-work sign-off and countersign, and the site order book's dates
 * and states.
 *
 *   node dist/scripts/consultant-checks-test.js
 */
import assert from 'node:assert/strict';
import {
  CHECK_LEVEL_SHARE,
  certifyCheckProblem,
  checkCoverage,
  checkOutcome,
  countersignProblem,
  hiddenSignProblem,
  hiddenWorkCleared,
  sheetsToReach,
  siteOrderLabel,
  siteOrderProblem,
  siteOrderState,
  type CoverageCheck,
  type HiddenWorkState,
} from '@erp/shared';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

// Ten sheets worth ₹10 lakh in all: one large (₹4 lakh), two of ₹1.5 lakh, seven of ₹43,000 or so.
const sheets = [
  { id: 's1', amount: 400_000 },
  { id: 's2', amount: 150_000 },
  { id: 's3', amount: 150_000 },
  ...['s4', 's5', 's6', 's7', 's8', 's9', 's10'].map((id) => ({ id, amount: 300_000 / 7 })),
];
const of = (level: CoverageCheck['level'], ...ids: string[]): CoverageCheck[] => ids.map((sheetId) => ({ sheetId, level }));
const cov = (checks: CoverageCheck[], level: CoverageCheck['level']) => checkCoverage(sheets, checks).find((c) => c.level === level)!;

test('the shares are the terms of reference: 100, 25, 10 and 3%', () => {
  assert.deepEqual(CHECK_LEVEL_SHARE, { ASSISTANT_ENGINEER: 100, RESIDENT_ENGINEER: 25, DEPUTY_TEAM_LEADER: 10, TEAM_LEADER: 3 });
});

test('a check agrees within half a per cent, else it is less or more', () => {
  assert.equal(checkOutcome(175, 175), 'AGREED');
  assert.equal(checkOutcome(175, 174.2), 'AGREED'); // 0.46% short
  assert.equal(checkOutcome(175, 174), 'LESS'); // 0.57% short
  assert.equal(checkOutcome(175, 176), 'MORE');
  assert.equal(checkOutcome(0, 0), 'AGREED');
  assert.equal(checkOutcome(0, 1), 'MORE');
});

test('coverage is by value: the one large sheet is 40% for the resident engineer', () => {
  const c = cov(of('RESIDENT_ENGINEER', 's1'), 'RESIDENT_ENGINEER');
  assert.deepEqual(c, { level: 'RESIDENT_ENGINEER', requiredPct: 25, checkedPct: 40, checkedSheets: 1, totalSheets: 10, met: true, byValue: true });
  // Two small ones are about 8.6%: short of 25, though they are 20% of the sheets.
  const small = cov(of('RESIDENT_ENGINEER', 's4', 's5'), 'RESIDENT_ENGINEER');
  assert.equal(small.checkedPct, 8.6);
  assert.equal(small.met, false);
});

test("each level counts only its own checks: the assistant engineer's do not make the resident engineer's share", () => {
  const checks = of('ASSISTANT_ENGINEER', ...sheets.map((s) => s.id));
  assert.equal(cov(checks, 'ASSISTANT_ENGINEER').met, true);
  assert.equal(cov(checks, 'RESIDENT_ENGINEER').checkedPct, 0);
  // The assistant engineer checks every sheet: nine of ten is not enough.
  assert.equal(cov(checks.slice(1), 'ASSISTANT_ENGINEER').met, false);
});

test('checks on sheets outside the set do not count', () => {
  assert.equal(cov(of('TEAM_LEADER', 'other'), 'TEAM_LEADER').checkedPct, 0);
});

test('sheets with no value are counted instead', () => {
  const free = [{ id: 'a', amount: 0 }, { id: 'b', amount: 0 }, { id: 'c', amount: 0 }, { id: 'd', amount: 0 }];
  const c = checkCoverage(free, of('RESIDENT_ENGINEER', 'a')).find((x) => x.level === 'RESIDENT_ENGINEER')!;
  assert.equal(c.byValue, false);
  assert.equal(c.checkedPct, 25);
  assert.equal(c.met, true);
});

test('a bill with no sheets (a lump-sum stage bill) holds nobody', () => {
  const c = checkCoverage([], []);
  assert.ok(c.every((x) => x.met && x.checkedPct === 100));
  assert.equal(certifyCheckProblem('ASSISTANT_ENGINEER', c), null);
});

test('the sheets to check next are the largest unchecked ones, as few as reach the share', () => {
  assert.deepEqual(sheetsToReach('RESIDENT_ENGINEER', sheets, []), ['s1']);
  assert.deepEqual(sheetsToReach('DEPUTY_TEAM_LEADER', sheets, of('DEPUTY_TEAM_LEADER', 's4')), ['s1']);
  // With the large sheet checked by someone else's level, the resident engineer still starts from it.
  assert.deepEqual(sheetsToReach('RESIDENT_ENGINEER', sheets, of('ASSISTANT_ENGINEER', 's1')), ['s1']);
  // Having checked two small ones (8.6%), the resident engineer needs the next largest: s1 alone takes it past 25%.
  assert.deepEqual(sheetsToReach('RESIDENT_ENGINEER', sheets, of('RESIDENT_ENGINEER', 's4', 's5')), ['s1']);
  assert.deepEqual(sheetsToReach('TEAM_LEADER', sheets, of('TEAM_LEADER', 's2')), []);
  assert.equal(sheetsToReach('ASSISTANT_ENGINEER', sheets, []).length, 10);
});

test('the certificate waits for the certifier to check their share, and says how far they are', () => {
  const short = checkCoverage(sheets, of('RESIDENT_ENGINEER', 's4', 's5'));
  assert.equal(
    certifyCheckProblem('RESIDENT_ENGINEER', short),
    "Check more of this bill's measurements first: a resident engineer checks at least 25% of them by value before certifying, and you have checked 8.6%.",
  );
  assert.match(certifyCheckProblem('ASSISTANT_ENGINEER', short)!, /^Check more .*an assistant engineer checks at least 100%/);
  assert.equal(certifyCheckProblem('RESIDENT_ENGINEER', checkCoverage(sheets, of('RESIDENT_ENGINEER', 's1'))), null);
  // A guest with no level (the client's own engineer) is not held to a share.
  assert.equal(certifyCheckProblem(null, short), null);
});

const signed: HiddenWorkState = { status: 'APPROVED', hiddenWork: true, signedById: 'ae', signedLevel: 'ASSISTANT_ENGINEER', countersignedById: null };

test('hidden work is signed off on a requested or passed inspection of a hidden-work activity, until countersigned', () => {
  assert.equal(hiddenSignProblem({ ...signed, signedById: null, signedLevel: null, status: 'SUBMITTED' }), null);
  assert.equal(hiddenSignProblem(signed), null); // signing again replaces it
  assert.match(hiddenSignProblem({ ...signed, hiddenWork: false })!, /not marked as hidden work/);
  assert.match(hiddenSignProblem({ ...signed, status: 'REJECTED' })!, /requested or passed/);
  assert.match(hiddenSignProblem({ ...signed, status: 'DRAFT' })!, /requested or passed/);
  assert.match(hiddenSignProblem({ ...signed, countersignedById: 're' })!, /countersigned/);
});

test('a countersign comes from someone else, above the sign-off, or from the client engineer', () => {
  const re = { id: 're', roleKey: 'CONSULTANT' as const, level: 'RESIDENT_ENGINEER' as const };
  assert.equal(countersignProblem(signed, re), null);
  assert.equal(countersignProblem(signed, { id: 'ee', roleKey: 'CLIENT_ENGINEER', level: null }), null);
  assert.match(countersignProblem({ ...signed, signedById: null }, re)!, /not signed off yet/);
  assert.match(countersignProblem({ ...signed, countersignedById: 'x' }, re)!, /already countersigned/);
  assert.match(countersignProblem(signed, { ...re, id: 'ae' })!, /Someone other than/);
  assert.match(countersignProblem(signed, { id: 'ae2', roleKey: 'CONSULTANT', level: 'ASSISTANT_ENGINEER' })!, /signed by an assistant engineer, so a higher level/);
  assert.match(countersignProblem(signed, { id: 'x', roleKey: 'CONSULTANT', level: null })!, /given a level on this project/);
  // Signed by the resident engineer: the deputy team leader may countersign, another resident engineer may not.
  const byRe: HiddenWorkState = { ...signed, signedById: 're', signedLevel: 'RESIDENT_ENGINEER' };
  assert.equal(countersignProblem(byRe, { id: 'dtl', roleKey: 'CONSULTANT', level: 'DEPUTY_TEAM_LEADER' }), null);
  assert.match(countersignProblem(byRe, { id: 're2', roleKey: 'CONSULTANT', level: 'RESIDENT_ENGINEER' })!, /a resident engineer/);
  // Signed by the client engineer (no level): any consultant with a level countersigns.
  assert.equal(countersignProblem({ ...signed, signedById: 'ee', signedLevel: null }, { id: 'ae', roleKey: 'CONSULTANT', level: 'ASSISTANT_ENGINEER' }), null);
});

test('hidden work may be covered once its inspection passed and the sign-off is countersigned', () => {
  assert.equal(hiddenWorkCleared({ ...signed, countersignedById: 're' }), true);
  assert.equal(hiddenWorkCleared(signed), false);
  assert.equal(hiddenWorkCleared({ status: 'SUBMITTED', signedById: 'ae', countersignedById: 're' }), false);
});

test("a site order's state: open, overdue past its date, replied or closed", () => {
  assert.equal(siteOrderState({ status: 'OPEN', complyBy: '2026-11-06' }, '2026-11-06'), 'OPEN');
  assert.equal(siteOrderState({ status: 'OPEN', complyBy: '2026-11-06' }, '2026-11-07'), 'OVERDUE');
  assert.equal(siteOrderState({ status: 'OPEN', complyBy: null }, '2027-01-01'), 'OPEN');
  assert.equal(siteOrderState({ status: 'REPLIED', complyBy: '2026-11-06' }, '2026-12-01'), 'REPLIED');
  assert.equal(siteOrderState({ status: 'CLOSED', complyBy: '2026-11-06' }, '2026-12-01'), 'CLOSED');
});

test('an order has its words, is not dated after today, and is not due before it was written', () => {
  assert.equal(siteOrderProblem({ instruction: 'Cure the slab for 14 days', date: '2026-10-30', complyBy: '2026-11-06' }, '2026-10-31'), null);
  assert.match(siteOrderProblem({ instruction: '  ', date: '2026-10-30', complyBy: null }, '2026-10-31')!, /Write the instruction/);
  assert.match(siteOrderProblem({ instruction: 'x', date: '2026-11-01', complyBy: null }, '2026-10-31')!, /after today/);
  assert.match(siteOrderProblem({ instruction: 'x', date: '2026-10-30', complyBy: '2026-10-29' }, '2026-10-31')!, /before the order date/);
  assert.equal(siteOrderLabel(12), 'Order 12');
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
