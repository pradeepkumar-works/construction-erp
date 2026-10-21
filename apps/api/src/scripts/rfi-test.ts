/**
 * RFI register's tests: answer-by dates and ageing, with no database. CI runs it after the build:
 *
 *   node dist/scripts/rfi-test.js
 */
import assert from 'node:assert/strict';
import { RFI_DEFAULT_REPLY_DAYS, RFI_URGENT_REPLY_DAYS, rfiAge, rfiAgeBucket, rfiReplyBy } from '@erp/shared';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);
const T = '2026-10-21';

test('answer-by: a week by default, two days when urgent, across a month end', () => {
  assert.equal(RFI_DEFAULT_REPLY_DAYS, 7);
  assert.equal(RFI_URGENT_REPLY_DAYS, 2);
  assert.equal(rfiReplyBy('2026-10-28', 'NORMAL'), '2026-11-04');
  assert.equal(rfiReplyBy('2026-12-30', 'URGENT'), '2027-01-01');
});

test('open and not yet due: counts days open, not overdue', () => {
  const a = rfiAge({ status: 'OPEN', raisedOn: '2026-10-18', replyBy: '2026-10-25', answeredOn: null }, T);
  assert.deepEqual(a, { daysOpen: 3, overdue: false, daysOverdue: 0, answeredLateBy: null });
});

test('open on its answer-by date is not overdue; the day after it is', () => {
  assert.equal(rfiAge({ status: 'OPEN', raisedOn: '2026-10-14', replyBy: T, answeredOn: null }, T).overdue, false);
  const a = rfiAge({ status: 'OPEN', raisedOn: '2026-10-13', replyBy: '2026-10-20', answeredOn: null }, T);
  assert.equal(a.overdue, true);
  assert.equal(a.daysOverdue, 1);
});

test('answered: days open stop at the answer, and lateness is against the answer-by date', () => {
  const late = rfiAge({ status: 'ANSWERED', raisedOn: '2026-10-01', replyBy: '2026-10-08', answeredOn: '2026-10-11' }, T);
  assert.deepEqual(late, { daysOpen: 10, overdue: false, daysOverdue: 0, answeredLateBy: 3 });
  const early = rfiAge({ status: 'CLOSED', raisedOn: '2026-10-01', replyBy: '2026-10-08', answeredOn: '2026-10-05' }, T);
  assert.equal(early.answeredLateBy, -3);
});

test('withdrawn without an answer is never overdue', () => {
  const a = rfiAge({ status: 'WITHDRAWN', raisedOn: '2026-09-01', replyBy: '2026-09-08', answeredOn: null }, T);
  assert.equal(a.overdue, false);
  assert.equal(a.daysOpen, 0);
});

test('ageing buckets by days late', () => {
  assert.equal(rfiAgeBucket(0), 'onTime');
  assert.equal(rfiAgeBucket(1), 'upTo7');
  assert.equal(rfiAgeBucket(7), 'upTo7');
  assert.equal(rfiAgeBucket(8), 'upTo30');
  assert.equal(rfiAgeBucket(30), 'upTo30');
  assert.equal(rfiAgeBucket(31), 'over30');
});

let failed = 0;
for (const [name, fn] of cases) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`✗ ${name}\n  ${(e as Error).message.split('\n').join('\n  ')}`);
  }
}
console.log(`\nRFI: ${cases.length - failed} of ${cases.length} tests pass`);
process.exit(failed ? 1 : 0);
