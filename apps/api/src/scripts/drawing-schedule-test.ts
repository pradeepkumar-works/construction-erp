/**
 * The drawing schedule (item 138 part 1): where a scheduled drawing stands and how late it is, the days its revisions
 * give, the company's drawing numbers, what a line needs, the reminder letter and the counts, with no database. CI runs
 * it after the build:
 *
 *   node dist/scripts/drawing-schedule-test.js
 */
import assert from 'node:assert/strict';
import {
  drawingDaysLate,
  drawingDueSoon,
  drawingNeedProblem,
  drawingNeedState,
  drawingNoKey,
  drawingOverdue,
  isClientSide,
  nextDrawingNo,
  reminderLetter,
  remindsByLetter,
  revisionDays,
  scheduleCounts,
} from '@erp/shared';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);
const T = '2026-10-29';
const need = (neededBy: string, o: { receivedOn?: string; gfcOn?: string; dropped?: boolean } = {}) => ({ neededBy, dropped: !!o.dropped, receivedOn: o.receivedOn ?? null, gfcOn: o.gfcOn ?? null });

test('a drawing is awaited, in but not buildable, good for construction, or not needed', () => {
  assert.equal(drawingNeedState(need('2026-11-01')), 'AWAITED');
  assert.equal(drawingNeedState(need('2026-11-01', { receivedOn: '2026-10-20' })), 'RECEIVED');
  assert.equal(drawingNeedState(need('2026-11-01', { receivedOn: '2026-10-20', gfcOn: '2026-10-25' })), 'GFC');
  assert.equal(drawingNeedState(need('2026-11-01', { gfcOn: '2026-10-25', dropped: true })), 'DROPPED');
});

test('late counts to today while not buildable, and to the day it came once it is', () => {
  assert.equal(drawingDaysLate(need('2026-10-20'), T), 9);
  assert.equal(drawingDaysLate(need('2026-10-20', { receivedOn: '2026-10-10' }), T), 9);
  assert.equal(drawingDaysLate(need('2026-10-20', { gfcOn: '2026-10-24' }), T), 4);
  assert.equal(drawingDaysLate(need('2026-10-20', { gfcOn: '2026-10-18' }), T), null);
  assert.equal(drawingDaysLate(need('2026-11-20'), T), null);
  assert.equal(drawingDaysLate(need('2026-10-01', { dropped: true }), T), null);
});

test('overdue holds up work today; due soon is within a week and not yet buildable', () => {
  assert.equal(drawingOverdue(need('2026-10-28'), T), true);
  assert.equal(drawingOverdue(need(T), T), false);
  assert.equal(drawingOverdue(need('2026-10-20', { gfcOn: '2026-10-24' }), T), false);
  assert.equal(drawingDueSoon(need('2026-11-05'), T), true);
  assert.equal(drawingDueSoon(need('2026-11-06'), T), false);
  assert.equal(drawingDueSoon(need('2026-11-01', { gfcOn: '2026-10-28' }), T), false);
  assert.equal(drawingDueSoon(need('2026-10-28'), T), false);
});

test('revisions give the first day in and the first one site may build from, in any order', () => {
  assert.deepEqual(
    revisionDays([
      { issuedOn: '2026-10-12', status: 'FOR_CONSTRUCTION' },
      { issuedOn: '2026-09-30', status: 'FOR_APPROVAL' },
      { issuedOn: '2026-10-05', status: 'APPROVED_WITH_COMMENTS' },
    ]),
    { receivedOn: '2026-09-30', gfcOn: '2026-10-05' },
  );
  assert.deepEqual(revisionDays([{ issuedOn: '2026-09-30', status: 'FOR_INFORMATION' }]), { receivedOn: '2026-09-30', gfcOn: null });
  assert.deepEqual(revisionDays([]), { receivedOn: null, gfcOn: null });
});

test('drawing numbers: the next serial of the project and discipline, matched in any spelling', () => {
  assert.equal(nextDrawingNo('BLD-2026-02', 'STRUCTURAL', []), 'BLD-2026-02-STR-001');
  assert.equal(nextDrawingNo('BLD-2026-02', 'STRUCTURAL', ['BLD-2026-02-STR-006', 'bld 2026 02 str 011', 'BLD-2026-02-ARC-030', 'BLD-2026-02-STR-GA']), 'BLD-2026-02-STR-012');
  assert.equal(nextDrawingNo('ws/26/03', 'WATER', ['WS-26-03-WS-099']), 'WS-26-03-WS-100');
  assert.equal(drawingNoKey('STR/GA-101 '), drawingNoKey('str ga 101'));
});

test('a schedule line names the drawing and its day, and who issues it unless it is our own', () => {
  assert.equal(drawingNeedProblem({ title: 'Raft reinforcement', neededBy: '2026-11-01', source: 'ARCHITECT', fromParty: 'Architect' }), null);
  assert.match(drawingNeedProblem({ title: ' ', neededBy: '2026-11-01', source: 'OWN' }) ?? '', /which drawing/);
  assert.match(drawingNeedProblem({ title: 'Raft', neededBy: '', source: 'OWN' }) ?? '', /day site needs/);
  assert.match(drawingNeedProblem({ title: 'Raft', neededBy: '2026-11-01', source: 'CLIENT', fromParty: '' }) ?? '', /who issues/);
  assert.equal(drawingNeedProblem({ title: 'Raft', neededBy: '2026-11-01', source: 'OWN' }), null);
  assert.equal(isClientSide('CONSULTANT'), true);
  assert.equal(isClientSide('DESIGN_CONSULTANT'), false);
  assert.equal(remindsByLetter('DESIGN_CONSULTANT'), true);
  assert.equal(remindsByLetter('OWN'), false);
});

test('a reminder lists the drawings oldest first with their days late, and says so when it follows another', () => {
  const day = (d: string) => d.split('-').reverse().join('/');
  const first = reminderLetter('Hospital Block B', [{ docNo: 'B-STR-012', title: 'Second floor slab', discipline: 'STRUCTURAL', neededBy: '2026-10-25', reminders: 0 }], T, day);
  assert.equal(first.subject, 'Hospital Block B: drawing B-STR-012 awaited');
  assert.match(first.body, /^The following drawing is still awaited/);
  assert.match(first.body, /1\. B-STR-012, Second floor slab \(Structural\): needed by 25\/10\/2026, 4 days ago\./);
  const again = reminderLetter(
    'Hospital Block B',
    [
      { docNo: null, title: 'Lift machine room', discipline: 'ARCHITECTURAL', neededBy: '2026-11-02', reminders: 0 },
      { docNo: 'B-STR-012', title: 'Second floor slab', discipline: 'STRUCTURAL', neededBy: '2026-10-25', reminders: 1 },
    ],
    T,
    day,
  );
  assert.equal(again.subject, 'Hospital Block B: 2 drawings awaited, reminder');
  assert.match(again.body, /^Further to our earlier letters, the following drawings are/);
  assert.ok(again.body.indexOf('B-STR-012') < again.body.indexOf('Lift machine room'));
  assert.match(again.body, /Lift machine room \(Architectural\): needed by 02\/11\/2026\./);
  assert.match(again.body, /extension of time/);
});

test('the counts leave out what is not needed', () => {
  const c = scheduleCounts([need('2026-10-20'), need('2026-11-02'), need('2026-10-01', { gfcOn: '2026-09-28' }), need('2026-10-01', { dropped: true })], T);
  assert.deepEqual(c, { total: 3, gfc: 1, overdue: 1, dueSoon: 1 });
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
