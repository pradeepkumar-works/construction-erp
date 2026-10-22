/**
 * Material approvals' tests (v6 item 113): matching an order line's material and make to the approved makes, what an
 * outcome and a (re)submission need, and the days a request waits, with no database. CI runs it after the build:
 *
 *   node dist/scripts/material-approvals-test.js
 */
import assert from 'node:assert/strict';
import { averageDays, daysOutstanding, makeWarnings, normalise, reviewProblem, sameMake, sameMaterial, submitProblem } from '../material-approvals/material-approval-rules';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);
const today = '2026-11-10';

test('names compare by their words, not case or punctuation', () => {
  assert.equal(normalise('  UltraTech Cement (OPC-53) '), 'ultratech cement opc 53');
  assert.ok(sameMaterial('Cement OPC 53 grade', 'OPC 53 cement'));
  assert.ok(sameMaterial('TMT bars Fe 550D', 'TMT bars'));
  assert.ok(sameMaterial('Cement', 'cement'));
  // A one-word listing matches only that word, so "Cement" does not catch cement paint.
  assert.ok(!sameMaterial('Cement paint, exterior', 'Cement'));
  assert.ok(!sameMaterial('Vitrified tiles 600 x 600', 'Ceramic tiles'));
});

test('a make matches by name or a name inside the other', () => {
  assert.ok(sameMake('Tata Tiscon', 'TATA'));
  assert.ok(sameMake('UltraTech', 'Ultratech Cement'));
  assert.ok(!sameMake('Kajaria', 'Somany'));
  // Not part of a word: "Jindal" is not in "Jindalee".
  assert.ok(!sameMake('Jindalee', 'Jindal'));
});

test('an order line is flagged only for a listed material in another make, or with none', () => {
  const approved = [
    { material: 'Cement OPC 53', make: 'UltraTech' },
    { material: 'Cement OPC 53', make: 'ACC' },
    { material: 'TMT bars', make: 'Tata Tiscon' },
  ];
  const pending = [{ material: 'TMT bars', make: 'JSW Neosteel', marNo: 'MAR-2026-0004' }];
  const lines = [
    { itemName: 'OPC 53 cement', make: 'ACC' },
    { itemName: 'OPC 53 cement', make: 'Dalmia' },
    { itemName: 'TMT bars 12 mm', make: '' },
    { itemName: 'TMT bars 16 mm', make: 'JSW Neosteel' },
    { itemName: 'River sand', make: 'Local' },
  ];
  const w = makeWarnings(lines, approved, pending);
  assert.deepEqual(
    w.map((x) => [x.index, x.reason, x.approved.join('/'), x.pendingMarNo]),
    [
      [1, 'NOT_APPROVED', 'UltraTech/ACC', null],
      [2, 'NO_MAKE', 'Tata Tiscon', null],
      [3, 'NOT_APPROVED', 'Tata Tiscon', 'MAR-2026-0004'],
    ],
  );
  assert.deepEqual(makeWarnings(lines, []), []);
});

test('an outcome needs a request under review, a day between submission and today, and comments unless approved', () => {
  const r = { outcome: 'APPROVED' as const, reviewedOn: '2026-11-08', submittedOn: '2026-11-01', today };
  assert.equal(reviewProblem('UNDER_REVIEW', r), null);
  assert.match(reviewProblem('DRAFT', r)!, /under review/);
  assert.match(reviewProblem('UNDER_REVIEW', { ...r, reviewedOn: '2026-10-30' })!, /before/);
  assert.match(reviewProblem('UNDER_REVIEW', { ...r, reviewedOn: '2026-11-11' })!, /after today/);
  assert.match(reviewProblem('UNDER_REVIEW', { ...r, outcome: 'REVISE_RESUBMIT' })!, /comments/);
  assert.equal(reviewProblem('UNDER_REVIEW', { ...r, outcome: 'APPROVED_AS_NOTED', comments: 'Only the matt finish' }), null);
});

test('a request goes to the reviewer from draft, or again after revise or reject, never ahead of today', () => {
  assert.equal(submitProblem('DRAFT', { submittedOn: today, today }), null);
  assert.equal(submitProblem('REVISE_RESUBMIT', { submittedOn: today, today, lastReviewedOn: '2026-11-05' }), null);
  assert.equal(submitProblem('REJECTED', { submittedOn: today, today }), null);
  assert.match(submitProblem('UNDER_REVIEW', { submittedOn: today, today })!, /already/);
  assert.match(submitProblem('APPROVED', { submittedOn: today, today })!, /new one/);
  assert.match(submitProblem('DRAFT', { submittedOn: '2026-11-11', today })!, /after today/);
  assert.match(submitProblem('REVISE_RESUBMIT', { submittedOn: '2026-11-04', today, lastReviewedOn: '2026-11-05' })!, /before the last review/);
});

test('a request waits from its submission while under review; decisions average their days', () => {
  assert.equal(daysOutstanding('UNDER_REVIEW', '2026-10-27', today), 14);
  assert.equal(daysOutstanding('APPROVED', '2026-10-27', today), null);
  assert.equal(daysOutstanding('UNDER_REVIEW', null, today), null);
  assert.equal(averageDays([{ submittedOn: '2026-11-01', reviewedOn: '2026-11-08' }, { submittedOn: '2026-11-01', reviewedOn: '2026-11-04' }]), 5);
  assert.equal(averageDays([]), null);
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
