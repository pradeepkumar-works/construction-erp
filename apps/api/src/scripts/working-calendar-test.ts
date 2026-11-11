/**
 * Working calendar tests (ARCHITECTURE "Working calendar"): which days count, counting and adding working days, the
 * critical path, lags and float on working days, the checks on days off and breaks, and the days a chart shades. No
 * database. CI runs it after the build:
 *
 *   node dist/scripts/working-calendar-test.js
 */
import assert from 'node:assert/strict';
import { EVERY_DAY, addWorkingDays, breakProblem, dayClock, daysOffProblem, isWorkingDay, nonWorkingDays, nonWorkingReason, workWeekWords, workingDaysIn, type WorkingCalendar } from '@erp/shared';
import { criticalPath, moves, type NetActivity, type NetLink } from '../planning/schedule-rules';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

// January 2026: the 4th is a Sunday, the 5th a Monday, the 26th Republic Day (a Monday).
const site: WorkingCalendar = { on: true, daysOff: [0], holidays: [{ date: '2026-01-26', name: 'Republic Day' }], breaks: [] };
const withBreak: WorkingCalendar = { ...site, breaks: [{ from: '2026-01-12', to: '2026-01-14', reason: 'Pongal shutdown' }] };

test('a day off says why: the weekday, the holiday or the break; with the calendar off every day works', () => {
  assert.equal(nonWorkingReason(site, '2026-01-04'), 'Sunday');
  assert.equal(nonWorkingReason(site, '2026-01-26'), 'Republic Day');
  assert.equal(nonWorkingReason(withBreak, '2026-01-13'), 'Pongal shutdown');
  assert.equal(nonWorkingReason(site, '2026-01-05'), null);
  assert.ok(isWorkingDay({ ...site, on: false }, '2026-01-04'));
});

test('working days in a stretch count both ends and skip days off', () => {
  assert.equal(workingDaysIn(site, '2026-01-05', '2026-01-11'), 6);
  assert.equal(workingDaysIn(withBreak, '2026-01-12', '2026-01-18'), 3);
  assert.equal(workingDaysIn(site, '2026-01-04', '2026-01-04'), 0);
  assert.equal(workingDaysIn(site, '2026-01-25', '2026-01-27'), 1);
  assert.equal(workingDaysIn(EVERY_DAY, '2026-01-05', '2026-01-11'), 7);
});

test('adding working days steps over Sundays, holidays and breaks, and starts from the next working day', () => {
  assert.equal(addWorkingDays(site, '2026-01-10', 1), '2026-01-12');
  assert.equal(addWorkingDays(withBreak, '2026-01-10', 1), '2026-01-15');
  assert.equal(addWorkingDays(site, '2026-01-11', 0), '2026-01-12');
  assert.equal(addWorkingDays(site, '2026-01-24', 1), '2026-01-27');
  assert.equal(addWorkingDays(site, '2026-01-12', -1), '2026-01-10');
  assert.equal(addWorkingDays(EVERY_DAY, '2026-01-10', 1), '2026-01-11');
});

test('the clock round-trips working days and moves a day off forward or back', () => {
  const c = dayClock(site);
  for (const d of ['2026-01-05', '2026-01-10', '2026-01-12', '2026-01-27']) assert.equal(c.fromIndex(c.toIndex(d)), d);
  assert.equal(c.fromIndex(c.toIndex('2026-01-04', 'back')), '2026-01-03');
  assert.equal(c.fromIndex(c.toIndex('2026-01-04', 'forward')), '2026-01-05');
  assert.equal(c.toIndex('2026-01-12') - c.toIndex('2026-01-10'), 1);
});

// A runs Mon 5 to Tue 13 (8 working days); C Mon 5 to Fri 9 (5); B Sun 11 to Tue 13, after both.
const acts: NetActivity[] = [
  { id: 'A', start: '2026-01-05', end: '2026-01-13' },
  { id: 'C', start: '2026-01-05', end: '2026-01-09' },
  { id: 'B', start: '2026-01-11', end: '2026-01-13' },
];
const links: NetLink[] = [
  { pred: 'A', succ: 'B', type: 'FS', lag: 0 },
  { pred: 'C', succ: 'B', type: 'FS', lag: 0 },
];

test('the critical path counts lengths and float in working days', () => {
  const net = criticalPath(acts, links, dayClock(site))!;
  const b = net.results.get('B')!;
  // B has two working days (Mon 12, Tue 13) and starts after A, the next working day: Wed 14 to Thu 15.
  assert.deepEqual([b.es, b.ef], ['2026-01-14', '2026-01-15']);
  // C may finish as late as Tue 13: Sat 10, Mon 12 and Tue 13 are its float, the Sunday not counted.
  assert.equal(net.results.get('C')!.float, 3);
  assert.equal(net.results.get('C')!.lf, '2026-01-13');
  assert.ok(net.results.get('A')!.critical && b.critical);
  assert.equal(net.finish, '2026-01-15');
  // On calendar days the same plan gives C four days of float and B three days from Wed 14.
  const plain = criticalPath(acts, links)!;
  assert.equal(plain.results.get('C')!.float, 4);
  assert.deepEqual([plain.results.get('B')!.es, plain.results.get('B')!.ef], ['2026-01-14', '2026-01-16']);
});

test('a lag counts working days, and a holiday or break in the way pushes the successor on', () => {
  const two: NetActivity[] = [
    { id: 'P', start: '2026-01-19', end: '2026-01-24' },
    { id: 'S', start: '2026-01-19', end: '2026-01-20' },
  ];
  const net = criticalPath(two, [{ pred: 'P', succ: 'S', type: 'FS', lag: 1 }], dayClock(site))!;
  // P ends Sat 24; one working day of lag skips Sun 25 and Republic Day, so S starts Wed 28 and runs two days.
  assert.deepEqual([net.results.get('S')!.es, net.results.get('S')!.ef], ['2026-01-28', '2026-01-29']);
  const m = moves(two, net.results);
  assert.deepEqual(m, [{ id: 'S', start: '2026-01-28', end: '2026-01-29' }]);
});

test('started and done work stays where it ran', () => {
  const net = criticalPath(
    [
      { id: 'D', start: '2026-01-05', end: '2026-01-09', done: true },
      { id: 'G', start: '2026-01-07', end: '2026-01-10', startedOn: '2026-01-08' },
    ],
    [{ pred: 'D', succ: 'G', type: 'FS', lag: 0 }],
    dayClock(withBreak),
  )!;
  // G started Thu 8 whatever the link says, and its four working days run Thu 8, Fri 9, Sat 10 and, over the break, Thu 15.
  assert.deepEqual([net.results.get('G')!.es, net.results.get('G')!.ef], ['2026-01-08', '2026-01-15']);
});

test('the working week reads in words', () => {
  assert.equal(workWeekWords([0]), 'Monday to Saturday');
  assert.equal(workWeekWords([]), 'every day');
  assert.equal(workWeekWords([6, 0]), 'Monday to Friday');
  assert.equal(workWeekWords([5]), 'Monday, Tuesday, Wednesday, Thursday, Saturday, Sunday');
});

test('days off and breaks are checked', () => {
  assert.equal(daysOffProblem([0]), null);
  assert.equal(daysOffProblem([0, 0]), 'Pick each day once');
  assert.equal(daysOffProblem([0, 1, 2, 3]), 'Pick at most 3 days off a week');
  assert.equal(daysOffProblem([7]), 'Pick days of the week');
  assert.equal(breakProblem({ from: '2026-07-01', to: '2026-08-31', reason: 'Monsoon' }), null);
  assert.equal(breakProblem({ from: '2026-08-31', to: '2026-07-01', reason: 'Monsoon' }), 'The last day comes after the first');
  assert.equal(breakProblem({ from: '2026-07-01', to: '2026-08-31', reason: ' ' }), 'Say why the site stops, such as Monsoon');
  assert.match(breakProblem({ from: '2026-01-01', to: '2026-12-31', reason: 'Long' })!, /at most 200 days/);
  assert.match(breakProblem({ from: '2026-08-15', to: '2026-09-15', reason: 'Late rain' }, [{ from: '2026-07-01', to: '2026-08-31', reason: 'Monsoon' }])!, /overlaps Monsoon/);
});

test('a chart shades holidays and breaks, and weekly days off only when asked', () => {
  assert.deepEqual(nonWorkingDays(withBreak, '2026-01-10', '2026-01-15', false), [
    { date: '2026-01-12', reason: 'Pongal shutdown' },
    { date: '2026-01-13', reason: 'Pongal shutdown' },
    { date: '2026-01-14', reason: 'Pongal shutdown' },
  ]);
  assert.equal(nonWorkingDays(withBreak, '2026-01-10', '2026-01-15').length, 4);
  assert.deepEqual(nonWorkingDays({ ...site, on: false }, '2026-01-01', '2026-01-31'), []);
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
