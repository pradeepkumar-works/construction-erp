/**
 * Meetings' tests (v6 item 112): how late an action is, what stops the minutes being issued, what an action may move
 * to, and the register's counts, with no database. CI runs it after the build:
 *
 *   node dist/scripts/meetings-test.js
 */
import assert from 'node:assert/strict';
import { actionCounts, actionMoveProblem, actionTiming, addDays, byUrgency, daysBetween, issueProblem } from '../meetings/meeting-rules';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);
const today = '2026-11-10';

test('days between dates count whole days, across a month end', () => {
  assert.equal(daysBetween('2026-10-30', '2026-11-02'), 3);
  assert.equal(addDays('2026-10-30', 3), '2026-11-02');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('an open action is late from the day after it falls due; closed or undated ones are neither', () => {
  assert.deepEqual(actionTiming('OPEN', '2026-11-07', today), { daysOverdue: 3, daysLeft: null });
  assert.deepEqual(actionTiming('OPEN', today, today), { daysOverdue: 0, daysLeft: null });
  assert.deepEqual(actionTiming('OPEN', '2026-11-14', today), { daysOverdue: null, daysLeft: 4 });
  assert.deepEqual(actionTiming('DONE', '2026-11-01', today), { daysOverdue: null, daysLeft: null });
  assert.deepEqual(actionTiming('OPEN', null, today), { daysOverdue: null, daysLeft: null });
});

test('minutes are issued with someone present, something written and every action owned and dated', () => {
  const ok = { attendees: [{ present: true }], points: 1, actions: [{ text: 'Send the revised drawing', ownerName: 'S. Das', dueOn: '2026-11-15' }] };
  assert.equal(issueProblem(ok), null);
  assert.match(issueProblem({ ...ok, attendees: [{ present: false }] })!, /present/);
  assert.match(issueProblem({ ...ok, points: 0, actions: [] })!, /Write the minutes/);
  // Actions alone are minutes enough.
  assert.equal(issueProblem({ ...ok, points: 0 }), null);
  assert.match(issueProblem({ ...ok, actions: [ok.actions[0], { text: 'x', ownerName: ' ', dueOn: '2026-11-20' }] })!, /^Action 2: name who/);
  assert.match(issueProblem({ ...ok, actions: [{ text: 'x', ownerName: 'A', dueOn: null }] })!, /^Action 1: give the date/);
});

test('an action is done on a day not ahead, dropped with a reason, and can be reopened', () => {
  assert.equal(actionMoveProblem('OPEN', 'DONE', { doneOn: today, today }), null);
  assert.match(actionMoveProblem('OPEN', 'DONE', { doneOn: null, today })!, /day it was done/);
  assert.match(actionMoveProblem('OPEN', 'DONE', { doneOn: '2026-11-11', today })!, /after today/);
  assert.match(actionMoveProblem('OPEN', 'DROPPED', { note: '', today })!, /why/);
  assert.equal(actionMoveProblem('OPEN', 'DROPPED', { note: 'Client withdrew the change', today }), null);
  assert.equal(actionMoveProblem('DONE', 'OPEN', { today }), null);
  // Moving the date of an open action keeps it open.
  assert.equal(actionMoveProblem('OPEN', 'OPEN', { today }), null);
  assert.match(actionMoveProblem('DONE', 'DONE', { doneOn: today, today })!, /already done/);
});

test('the register counts open, late, due this week and done this month', () => {
  const c = actionCounts(
    [
      { status: 'OPEN', dueOn: '2026-11-08', doneOn: null },
      { status: 'OPEN', dueOn: today, doneOn: null },
      { status: 'OPEN', dueOn: '2026-11-17', doneOn: null },
      { status: 'OPEN', dueOn: '2026-11-18', doneOn: null },
      { status: 'OPEN', dueOn: null, doneOn: null },
      { status: 'DONE', dueOn: '2026-11-05', doneOn: '2026-11-04' },
      { status: 'DONE', dueOn: '2026-10-20', doneOn: '2026-10-28' },
      { status: 'DROPPED', dueOn: '2026-11-01', doneOn: '2026-11-02' },
    ],
    today,
  );
  // Due today is not yet late; the 17th is within the week, the 18th not.
  assert.deepEqual(c, { open: 5, overdue: 1, dueThisWeek: 2, doneThisMonth: 1 });
});

test('actions are taken up by due date, undated last', () => {
  const order = byUrgency([{ dueOn: null, sortKey: 'a' }, { dueOn: '2026-11-12', sortKey: 'b' }, { dueOn: '2026-11-01', sortKey: 'c' }, { dueOn: '2026-11-12', sortKey: 'a' }]);
  assert.deepEqual(order.map((o) => `${o.dueOn}:${o.sortKey}`), ['2026-11-01:c', '2026-11-12:a', '2026-11-12:b', 'null:a']);
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
