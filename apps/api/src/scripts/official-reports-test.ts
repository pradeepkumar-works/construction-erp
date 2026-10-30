/**
 * Official progress reports' tests (item 167): the periods a report covers, its number counted from the project's
 * start and its document number, the period in words, how late a component is, a component's status in words, and the
 * summary paragraph a weekly or monthly report opens with.
 *
 *   node dist/scripts/official-reports-test.js
 */
import assert from 'node:assert/strict';
import { componentDelayDays, componentStatusText, listWords, officialDocNo, officialFileName, officialPeriod, officialPeriodWords, officialReportNo, officialSummary, weekOfMonth, type SummaryFacts } from '@erp/shared';

// Periods: the day; Monday to Sunday; the calendar month (a leap February too).
assert.deepEqual(officialPeriod('DAILY', '2026-04-08'), { from: '2026-04-08', to: '2026-04-08' });
assert.deepEqual(officialPeriod('WEEKLY', '2026-04-08'), { from: '2026-04-06', to: '2026-04-12' }, 'a Wednesday sits in its Monday-to-Sunday week');
assert.deepEqual(officialPeriod('WEEKLY', '2026-04-12'), { from: '2026-04-06', to: '2026-04-12' }, 'a Sunday ends its week');
assert.deepEqual(officialPeriod('WEEKLY', '2026-04-13'), { from: '2026-04-13', to: '2026-04-19' }, 'a Monday starts one');
assert.deepEqual(officialPeriod('MONTHLY', '2026-05-17'), { from: '2026-05-01', to: '2026-05-31' });
assert.deepEqual(officialPeriod('MONTHLY', '2028-02-10'), { from: '2028-02-01', to: '2028-02-29' });

// Numbers from the start: day 1 is the start, week 1 the week holding it, MPR 1 its month; nothing before the start.
assert.equal(officialReportNo('DAILY', '2026-04-08', '2026-04-08'), 1);
assert.equal(officialReportNo('DAILY', '2026-04-08', '2026-05-08'), 31);
assert.equal(officialReportNo('WEEKLY', '2026-04-08', '2026-04-06'), 1, 'the week holding a Wednesday start is week 1');
assert.equal(officialReportNo('WEEKLY', '2026-04-08', '2026-04-13'), 2);
assert.equal(officialReportNo('MONTHLY', '2023-09-26', '2023-09-01'), 1);
assert.equal(officialReportNo('MONTHLY', '2023-09-26', '2025-06-01'), 22, 'September 2023 to June 2025');
assert.equal(officialReportNo('MONTHLY', '2026-04-08', '2026-03-01'), null, 'a month before the start has no number');
assert.equal(officialReportNo('DAILY', null, '2026-04-08'), null, 'no start date, no number');
assert.equal(officialDocNo('WS-04', 'MONTHLY', 16), 'WS-04/MPR/016');
assert.equal(officialDocNo('WS-04', 'WEEKLY', null), 'WS-04/WPR/DRAFT');

// Words: a week belongs to the month holding its Thursday.
assert.equal(officialPeriodWords('DAILY', '2026-04-08', '2026-04-08'), '8 Apr 2026');
assert.equal(officialPeriodWords('MONTHLY', '2026-05-01', '2026-05-31'), 'May 2026');
assert.equal(officialPeriodWords('WEEKLY', '2026-04-13', '2026-04-19'), 'Week 3 of April 2026 (13 to 19 Apr 2026)');
assert.equal(officialPeriodWords('WEEKLY', '2026-04-27', '2026-05-03'), 'Week 5 of April 2026 (27 Apr to 3 May 2026)');
assert.deepEqual(weekOfMonth('2026-06-29'), { week: 1, month: 'July 2026' }, 'Thursday 2 July puts the week in July');
assert.equal(
  officialFileName({ kind: 'MONTHLY', project: { id: 'x', code: 'WS 04', name: '' }, reportNo: 16, from: '2026-05-01', issue: { revision: 1 } as never }, 'pdf'),
  'WS-04-MPR-016-R1-2026-05.pdf',
);

// Delay: an unfinished component counts to the report date, a finished one to its last day of work; never negative.
assert.equal(componentDelayDays({ plannedEnd: '2026-05-10', pct: 60, lastWorkOn: '2026-05-20' }, '2026-05-31'), 21);
assert.equal(componentDelayDays({ plannedEnd: '2026-05-10', pct: 100, lastWorkOn: '2026-05-14' }, '2026-05-31'), 4);
assert.equal(componentDelayDays({ plannedEnd: '2026-06-30', pct: 40, lastWorkOn: null }, '2026-05-31'), 0);
assert.equal(componentDelayDays({ plannedEnd: null, pct: 40, lastWorkOn: null }, '2026-05-31'), null);

// Status in words, in the programme's order.
assert.equal(componentStatusText([]), 'No activities in the programme');
assert.equal(componentStatusText([{ name: 'Excavation', pct: 100 }, { name: 'Raft', pct: 100 }]), 'Completed');
assert.equal(componentStatusText([{ name: 'Excavation', pct: 0 }]), 'Not started');
assert.equal(
  componentStatusText([
    { name: 'Excavation', pct: 100 },
    { name: 'PCC', pct: 100 },
    { name: 'Raft', pct: 60.4 },
    { name: 'Staging', pct: 0 },
    { name: 'Container', pct: 0 },
  ]),
  'Excavation and PCC completed; Raft (60%) in progress; 2 not started',
);
assert.equal(listWords(['A', 'B', 'C', 'D', 'E'], 3), 'A, B and 3 more');
assert.equal(listWords(['A', 'B', 'C'], 3), 'A, B and C');

// The summary: gain against the plan and time, money only when given, what finished and what is late.
const facts: SummaryFacts = {
  kind: 'MONTHLY',
  physicalPct: 42.3,
  physicalAtStartPct: 38.1,
  plannedPct: 47.5,
  timeElapsedPct: 55,
  financialPct: 40.6,
  completed: ['Intake well'],
  late: [
    { name: 'Overhead tanks', days: 45 },
    { name: 'Distribution network', days: 12 },
  ],
  delayDays: 3,
  openNcrs: 2,
  dprDays: 28,
  days: 31,
};
assert.equal(
  officialSummary(facts),
  'Overall physical progress is 42.3%, up 4.2% this month, 5.2% behind the 47.5% planned with 55% of the contract period gone. ' +
    'Bills approved to date come to 40.6% of the revised contract value. Intake well was completed this month. ' +
    '2 components are behind the programme: Overhead tanks (45 days) and Distribution network (12 days). ' +
    'Work was held up on 3 days this month (see hindrances). 2 non-conformances are open. Approved daily reports cover 28 of the 31 days.',
);
const quiet = officialSummary({ ...facts, kind: 'WEEKLY', physicalAtStartPct: 42.3, plannedPct: 42.3, financialPct: null, completed: [], late: [], delayDays: 0, openNcrs: 0, dprDays: 7, days: 7, timeElapsedPct: null });
assert.equal(quiet, 'Overall physical progress is 42.3%, with no measurable gain this week, on the 42.3% planned.');

console.log('official reports: all checks passed');
