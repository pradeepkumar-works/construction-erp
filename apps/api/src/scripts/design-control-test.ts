/**
 * Design and drawings part 3: controlled copies (their state, numbers and recall), what a new revision changes,
 * and the design dashboard's totals and notes, with no database. CI runs it after the build:
 *
 *   node dist/scripts/design-control-test.js
 */
import assert from 'node:assert/strict';
import {
  copyLabel,
  copyNumbersFor,
  copyState,
  designNotes,
  designRowHasWork,
  designTotals,
  disposeCopyProblem,
  issueCopiesProblem,
  recallDays,
  recallLate,
  revisionImpact,
  type DesignProjectRow,
  type RevisionImpactFacts,
} from '@erp/shared';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);
const T = '2026-10-29';

test('a copy is in force while it is the current revision, to recall once superseded, closed once taken back', () => {
  assert.equal(copyState({ revisionId: 'r1', disposedOn: null }, 'r1'), 'IN_FORCE');
  assert.equal(copyState({ revisionId: 'r0', disposedOn: null }, 'r1'), 'TO_RECALL');
  assert.equal(copyState({ revisionId: 'r0', disposedOn: '2026-10-20' }, 'r1'), 'CLOSED');
  assert.equal(copyState({ revisionId: 'r0', disposedOn: null }, null), 'IN_FORCE');
  assert.equal(copyLabel(3), 'CC-03');
  assert.equal(copyLabel(112), 'CC-112');
});

test('a superseded copy counts its days out from the new revision and is late after a week', () => {
  assert.equal(recallDays('TO_RECALL', '2026-10-20', T), 9);
  assert.equal(recallDays('IN_FORCE', '2026-10-20', T), null);
  assert.equal(recallDays('TO_RECALL', '2026-11-02', T), 0);
  assert.equal(recallLate(7), false);
  assert.equal(recallLate(8), true);
  assert.equal(recallLate(null), false);
});

test('a holder keeps its copy number from one revision to the next; a new holder takes the next free one', () => {
  const existing = [{ holder: 'Site office', copyNo: 1 }, { holder: 'Formwork subcontractor', copyNo: 2 }, { holder: 'Quality lab', copyNo: 4 }];
  assert.deepEqual(copyNumbersFor(['site  OFFICE', 'Steel fixing gang', 'Quality lab', 'Client’s engineer'], existing), [
    { holder: 'site  OFFICE', copyNo: 1 },
    { holder: 'Steel fixing gang', copyNo: 5 },
    { holder: 'Quality lab', copyNo: 4 },
    { holder: 'Client’s engineer', copyNo: 6 },
  ]);
  assert.deepEqual(copyNumbersFor(['A', 'B'], []), [{ holder: 'A', copyNo: 1 }, { holder: 'B', copyNo: 2 }]);
});

test('copies are issued of the current revision site may build from, to holders named once who do not hold it already', () => {
  const ok = { holders: ['Site office'], status: 'FOR_CONSTRUCTION' as const, current: true, holdersInForce: [] };
  assert.equal(issueCopiesProblem(ok), null);
  assert.equal(issueCopiesProblem({ ...ok, status: 'APPROVED_WITH_COMMENTS' }), null);
  assert.match(issueCopiesProblem({ ...ok, holders: [' '] })!, /Name who gets a copy/);
  assert.match(issueCopiesProblem({ ...ok, holders: ['Site office', 'site office'] })!, /named twice/);
  assert.match(issueCopiesProblem({ ...ok, status: 'FOR_APPROVAL' })!, /site may build from/);
  assert.match(issueCopiesProblem({ ...ok, current: false })!, /current revision/);
  assert.match(issueCopiesProblem({ ...ok, holdersInForce: ['SITE OFFICE'] })!, /already holds a copy/);
});

test('a copy is taken back once, not before it went out and not after today', () => {
  const r = { issuedOn: '2026-10-01', disposedOn: '2026-10-20', today: T, alreadyOn: null };
  assert.equal(disposeCopyProblem(r), null);
  assert.match(disposeCopyProblem({ ...r, alreadyOn: '2026-10-10' })!, /already taken back/);
  assert.match(disposeCopyProblem({ ...r, disposedOn: '2026-11-01' })!, /after today/);
  assert.match(disposeCopyProblem({ ...r, disposedOn: '2026-09-30' })!, /before the day it was issued/);
});

const facts = (over: Partial<RevisionImpactFacts> = {}): RevisionImpactFacts => ({
  revision: 'R1',
  status: 'FOR_CONSTRUCTION',
  previous: 'R0',
  copiesToRecall: [],
  copiesIssued: 0,
  approvedEarlier: [],
  underReviewEarlier: [],
  takeoffsEarlier: 0,
  openMarkups: 0,
  openRfis: 0,
  scheduleLines: 0,
  deliverables: 0,
  ...over,
});

test('a new revision recalls the old copies first, and asks for its own to be issued', () => {
  const items = revisionImpact(facts({ copiesToRecall: [{ holder: 'Site office', copyNo: 1, revision: 'R0' }, { holder: 'Formwork subcontractor', copyNo: 2, revision: 'R0' }] }));
  assert.equal(items[0].key, 'copies');
  assert.equal(items[0].tone, 'danger');
  assert.equal(items[0].text, 'Recall 2 controlled copies of R0: CC-01 Site office, CC-02 Formwork subcontractor. Issue R1 in their place.');
  const issued = revisionImpact(facts({ copiesIssued: 2, copiesToRecall: [{ holder: 'Site office', copyNo: 1, revision: 'R0' }] }));
  assert.equal(issued[0].text, 'Recall 1 controlled copy of R0: CC-01 Site office.');
  assert.deepEqual(revisionImpact(facts()).map((i) => [i.key, i.tone]), [['copies', 'info']]);
  assert.deepEqual(revisionImpact(facts({ previous: null })), []);
  assert.deepEqual(revisionImpact(facts({ status: 'FOR_APPROVAL' })), []);
});

test('an earlier approval asks for the new revision to go again; one under review is told it is replaced', () => {
  const s = { id: 's1', submissionNo: 'DSN-2026-0004', revision: 'R0' };
  const items = revisionImpact(facts({ copiesIssued: 1, approvedEarlier: [s], underReviewEarlier: [{ ...s, id: 's2', submissionNo: 'DSN-2026-0009' }] }));
  assert.deepEqual(items.map((i) => i.key), ['submissions', 'submissions']);
  assert.match(items[0].text, /Approved earlier at R0 \(DSN-2026-0004\); send R1 for approval/);
  assert.deepEqual(items[0].ids, ['s1']);
  assert.match(items[1].text, /DSN-2026-0009 is with the reviewer at R0; tell them R1 replaces it/);
  // A revision that is itself approved needs no new approval.
  assert.deepEqual(revisionImpact(facts({ copiesIssued: 1, status: 'APPROVED', approvedEarlier: [s] })).map((i) => i.key), []);
});

test('take-offs, open marks, RFIs and EPC deliverables on the drawing are listed after, in that order', () => {
  const items = revisionImpact(facts({ copiesIssued: 1, takeoffsEarlier: 2, openMarkups: 1, openRfis: 3, deliverables: 1 }));
  assert.deepEqual(items.map((i) => i.key), ['takeoffs', 'markups', 'rfis', 'deliverables']);
  assert.equal(items[0].text, '2 quantity take-offs measured on an earlier revision: check the quantities against R1.');
  assert.equal(items[1].text, '1 open mark from earlier revisions carried to R1: close those it answers.');
  assert.equal(items[2].text, '3 open RFIs on this drawing: see whether R1 answers them.');
});

const row = (over: Partial<DesignProjectRow>): DesignProjectRow => ({
  projectId: 'p',
  projectCode: 'P',
  projectName: 'P',
  drawingsAwaited: 0,
  drawingsLate: 0,
  underReview: 0,
  reviewsLate: 0,
  withUs: 0,
  commentsToAnswer: 0,
  copiesToRecall: 0,
  recallsLate: 0,
  asBuiltDue: 0,
  rfisOpen: 0,
  revisionsRecent: 0,
  ...over,
});

test('the dashboard adds the projects up and notes the worst first', () => {
  const t = designTotals([row({ drawingsLate: 2, drawingsAwaited: 5, copiesToRecall: 3, recallsLate: 1 }), row({ drawingsAwaited: 1, commentsToAnswer: 4, reviewsLate: 1, underReview: 2 })]);
  assert.equal(t.drawingsAwaited, 6);
  assert.equal(t.drawingsLate, 2);
  assert.equal(t.commentsToAnswer, 4);
  assert.deepEqual(designNotes(t).map((n) => n.text), ['2 drawings late', '1 superseded copy still on site', '1 review past the reply date', '4 comments to answer', '2 copies to recall']);
  assert.equal(designRowHasWork(row({})), false);
  assert.equal(designRowHasWork(row({ revisionsRecent: 1 })), true);
  assert.equal(designRowHasWork(row({ asBuiltDue: 1 })), true);
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
if (failed) process.exit(1);
