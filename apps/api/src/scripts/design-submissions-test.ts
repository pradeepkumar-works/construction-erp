/**
 * Design submissions: the codes and what they do to the submission, the register and the comments,
 * when a package may go (again), when a code may be recorded, how late a review is, the covering letter and the summary,
 * with no database. CI runs it after the build:
 *
 *   node dist/scripts/design-submissions-test.js
 */
import assert from 'node:assert/strict';
import {
  codeApproves,
  commentState,
  commentsClosedBy,
  coveringLetter,
  designCodeProblem,
  designDaysOutstanding,
  designStatusLabel,
  designSubmitProblem,
  designSummary,
  replyByFor,
  reviewDaysLate,
  revisionStatusAfter,
  statusForCode,
} from '@erp/shared';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);
const T = '2026-10-29';

test('A and B approve, C sends it back to revise, D rejects; a vetting says vetted', () => {
  assert.deepEqual(['A', 'B', 'C', 'D'].map((c) => statusForCode(c as 'A')), ['APPROVED', 'APPROVED_AS_NOTED', 'REVISE_RESUBMIT', 'REJECTED']);
  assert.equal(codeApproves('B'), true);
  assert.equal(codeApproves('C'), false);
  assert.equal(codeApproves(null), false);
  assert.equal(designStatusLabel('APPROVED', 'VETTING'), 'Vetted');
  assert.equal(designStatusLabel('APPROVED_AS_NOTED', 'APPROVAL'), 'Approved with comments');
  assert.equal(designStatusLabel('REVISE_RESUBMIT', 'VETTING'), 'Revise and resubmit');
});

test('the register follows an approval only for a revision sent for approval; a vetting leaves it alone', () => {
  assert.equal(revisionStatusAfter('A', 'APPROVAL', 'FOR_APPROVAL'), 'APPROVED');
  assert.equal(revisionStatusAfter('B', 'APPROVAL', 'FOR_APPROVAL'), 'APPROVED_WITH_COMMENTS');
  assert.equal(revisionStatusAfter('C', 'APPROVAL', 'FOR_APPROVAL'), 'REJECTED');
  assert.equal(revisionStatusAfter('D', 'APPROVAL', 'FOR_APPROVAL'), 'REJECTED');
  assert.equal(revisionStatusAfter('A', 'APPROVAL', 'FOR_CONSTRUCTION'), null, 'a drawing already good for construction stays so');
  assert.equal(revisionStatusAfter('A', 'VETTING', 'FOR_APPROVAL'), null);
});

test('a comment is open until we reply, answered after, closed when accepted', () => {
  assert.equal(commentState({ reply: null, closedOn: null }), 'OPEN');
  assert.equal(commentState({ reply: '  ', closedOn: null }), 'OPEN');
  assert.equal(commentState({ reply: 'Revised', closedOn: null }), 'ANSWERED');
  assert.equal(commentState({ reply: 'Revised', closedOn: '2026-10-20' }), 'CLOSED');
});

test('an A or B closes the answered comments; a C or D leaves them for the reviewer', () => {
  const cs = [
    { id: '1', reply: 'Done', closedOn: null },
    { id: '2', reply: null, closedOn: null },
    { id: '3', reply: 'Done', closedOn: '2026-10-01' },
  ];
  assert.deepEqual(commentsClosedBy('A', cs), ['1']);
  assert.deepEqual(commentsClosedBy('B', cs), ['1']);
  assert.deepEqual(commentsClosedBy('C', cs), []);
});

test('a package goes once it has documents, dated by today, and again only with every comment answered', () => {
  const base = { submittedOn: T, today: T, documents: 2, openComments: 0 };
  assert.equal(designSubmitProblem('DRAFT', base), null);
  assert.match(designSubmitProblem('DRAFT', { ...base, documents: 0 })!, /drawings or documents/);
  assert.match(designSubmitProblem('DRAFT', { ...base, submittedOn: '2026-10-30' })!, /after today/);
  assert.match(designSubmitProblem('UNDER_REVIEW', base)!, /already with the reviewer/);
  assert.match(designSubmitProblem('APPROVED_AS_NOTED', base)!, /approved/);
  assert.match(designSubmitProblem('WITHDRAWN', base)!, /withdrawn/);
  assert.match(designSubmitProblem('REVISE_RESUBMIT', { ...base, openComments: 2 })!, /Answer the reviewer’s 2 comments/);
  assert.match(designSubmitProblem('REVISE_RESUBMIT', { ...base, openComments: 1 })!, /comment before/);
  assert.match(designSubmitProblem('REVISE_RESUBMIT', { ...base, lastReviewedOn: '2026-10-29', submittedOn: '2026-10-28' })!, /before the last review/);
  assert.match(designSubmitProblem('DRAFT', { ...base, replyBy: '2026-10-28' })!, /on or after/);
  assert.equal(designSubmitProblem('REJECTED', base), null);
});

test('a code is recorded only under review, between submission and today, with comments unless an A', () => {
  const r = { code: 'B' as const, reviewedOn: '2026-10-20', submittedOn: '2026-10-10', newComments: 1, today: T };
  assert.equal(designCodeProblem('UNDER_REVIEW', r), null);
  assert.match(designCodeProblem('DRAFT', r)!, /under review/);
  assert.match(designCodeProblem('UNDER_REVIEW', { ...r, reviewedOn: '2026-10-09' })!, /before it was submitted/);
  assert.match(designCodeProblem('UNDER_REVIEW', { ...r, reviewedOn: '2026-10-30' })!, /after today/);
  assert.match(designCodeProblem('UNDER_REVIEW', { ...r, code: 'C', newComments: 0 })!, /code C comes with them/);
  assert.equal(designCodeProblem('UNDER_REVIEW', { ...r, code: 'A', newComments: 0 }), null);
});

test('the reply is asked by the usual 14 days; a review past it is late, only while under review', () => {
  assert.equal(replyByFor('2026-10-20'), '2026-11-03');
  assert.equal(replyByFor('2026-10-20', 21), '2026-11-10');
  assert.equal(reviewDaysLate('UNDER_REVIEW', '2026-10-25', T), 4);
  assert.equal(reviewDaysLate('UNDER_REVIEW', T, T), null);
  assert.equal(reviewDaysLate('REVISE_RESUBMIT', '2026-10-01', T), null);
  assert.equal(reviewDaysLate('UNDER_REVIEW', null, T), null);
  assert.equal(designDaysOutstanding('UNDER_REVIEW', '2026-10-19', T), 10);
  assert.equal(designDaysOutstanding('APPROVED', '2026-10-19', T), null);
});

test('the covering letter lists what goes at which revision and, on a resubmission, the replies enclosed', () => {
  const s = { projectName: 'Block B', title: 'Slab drawings', purpose: 'APPROVAL' as const, submissionNo: 'DSN-2026-0004' };
  const first = coveringLetter(s, 0, [{ docNo: 'STR-210', title: 'Second floor slab', revision: 'R0' }], '2026-11-12', 0, (d) => d);
  assert.equal(first.subject, 'Block B: Slab drawings, for approval');
  assert.match(first.body, /1\. STR-210 Second floor slab, revision R0/);
  assert.match(first.body, /approval by 2026-11-12/);
  assert.doesNotMatch(first.body, /enclosed/);
  const again = coveringLetter(s, 1, [{ docNo: 'STR-210', title: 'Second floor slab', revision: 'R1' }], null, 3, (d) => d);
  assert.equal(again.subject, 'Block B: Slab drawings, resubmission R1 for approval');
  assert.match(again.body, /replies to the 3 comments on the last submission are enclosed/);
  const vet = coveringLetter({ ...s, purpose: 'VETTING' }, 0, [], '2026-11-12', 0, (d) => d);
  assert.match(vet.body, /design for vetting/);
  assert.match(vet.body, /vetting certificate by/);
});

test('the summary counts what is under review, late, back with us and the comments to answer', () => {
  const sum = designSummary(
    [
      { status: 'UNDER_REVIEW', late: true, openComments: 0 },
      { status: 'UNDER_REVIEW', late: false, openComments: 0 },
      { status: 'REVISE_RESUBMIT', late: false, openComments: 3 },
      { status: 'REJECTED', late: false, openComments: 1 },
      { status: 'APPROVED', late: false, openComments: 0 },
    ],
    [
      { submittedOn: '2026-10-01', reviewedOn: '2026-10-11' },
      { submittedOn: '2026-10-05', reviewedOn: '2026-10-26' },
    ],
  );
  assert.deepEqual(sum, { underReview: 2, late: 1, withUs: 2, toAnswer: 4, avgDaysToCode: 16 });
  assert.equal(designSummary([], []).avgDaysToCode, null);
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
