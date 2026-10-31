/**
 * Contract obligations' tests (item 171, ARCHITECTURE "Contract obligations and recoveries"): the deadline from its anchor,
 * where an obligation stands, what missing it costs as of a bill's date for each kind of penalty, a bill's recovery lines
 * with withholdings given back, the checks on a saved obligation and the security deposit held to its cap.
 *
 *   node dist/scripts/contract-obligations-test.js
 */
import assert from 'node:assert/strict';
import {
  STANDARD_OBLIGATIONS,
  addMonthsDays,
  billRecoveryLines,
  cappedSecurityDeposit,
  monthsLate,
  obligationDue,
  obligationProblem,
  obligationState,
  obligationTotals,
  penaltyAsOf,
  type ObligationAnchors,
  type ObligationTerms,
} from '@erp/shared';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

const anchors: ObligationAnchors = { AGREEMENT: '2026-01-10', START: '2026-01-25', COMPLETION: '2027-07-24', HANDOVER: null };
const base: ObligationTerms = { party: 'CONTRACTOR', anchor: 'AGREEMENT', offsetDays: 15, offsetMonths: 0, dueOn: null, penalty: 'WITHHOLD_PCT', penaltyValue: '0.2', metOn: null, waived: false };
const CV = 50_000_000; // a 5 crore contract

test('a deadline is its anchor moved by the months and days allowed, or its own date, and unknown without the anchor', () => {
  assert.equal(obligationDue(base, anchors), '2026-01-25');
  assert.equal(obligationDue({ ...base, offsetDays: 0, offsetMonths: 2 }, anchors), '2026-03-10');
  assert.equal(obligationDue({ ...base, anchor: 'DATE', dueOn: '2026-05-01' }, anchors), '2026-05-01');
  assert.equal(obligationDue({ ...base, anchor: 'HANDOVER', offsetDays: 21 }, anchors), null);
  // The 31st of a month two months on is the last day of a short month.
  assert.equal(addMonthsDays('2025-12-31', 2, 0), '2026-02-28');
  assert.equal(addMonthsDays('2026-01-31', 1, 1), '2026-03-01');
});

test('where it stands: met on time or late, waived, upcoming, due within a week, overdue, no date yet', () => {
  assert.equal(obligationState({ metOn: '2026-01-20', waived: false }, '2026-01-25', '2026-03-01'), 'MET');
  assert.equal(obligationState({ metOn: '2026-02-02', waived: false }, '2026-01-25', '2026-03-01'), 'MET_LATE');
  assert.equal(obligationState({ metOn: null, waived: true }, '2026-01-25', '2026-03-01'), 'WAIVED');
  assert.equal(obligationState({ metOn: null, waived: false }, '2026-01-25', '2026-01-10'), 'UPCOMING');
  assert.equal(obligationState({ metOn: null, waived: false }, '2026-01-25', '2026-01-18'), 'DUE_SOON');
  assert.equal(obligationState({ metOn: null, waived: false }, '2026-01-25', '2026-01-25'), 'DUE_SOON');
  assert.equal(obligationState({ metOn: null, waived: false }, '2026-01-25', '2026-01-26'), 'OVERDUE');
  assert.equal(obligationState({ metOn: null, waived: false }, null, '2026-01-26'), 'NO_DATE');
});

test('months late count whole months and the month begun, from the day after the deadline', () => {
  assert.equal(monthsLate('2026-01-25', '2026-01-25'), 0);
  assert.equal(monthsLate('2026-01-25', '2026-01-26'), 1);
  assert.equal(monthsLate('2026-01-25', '2026-02-25'), 1);
  assert.equal(monthsLate('2026-01-25', '2026-02-26'), 2);
});

test('a withholding of the contract value is held while the programme is not in, and released once it is', () => {
  // 0.2% of 5 crore = 1 lakh
  assert.equal(penaltyAsOf(base, '2026-01-25', '2026-01-25', CV), 0);
  assert.equal(penaltyAsOf(base, '2026-01-25', '2026-02-28', CV), 100_000);
  assert.equal(penaltyAsOf({ ...base, metOn: '2026-03-05' }, '2026-01-25', '2026-03-31', CV), 0);
  // Met after the bill's date: that bill still holds it.
  assert.equal(penaltyAsOf({ ...base, metOn: '2026-03-05' }, '2026-01-25', '2026-02-28', CV), 100_000);
});

test('a one-off penalty stays once incurred, even when met late; met on time, nothing', () => {
  const once = { ...base, penalty: 'ONCE_AMOUNT' as const, penaltyValue: '25000' };
  assert.equal(penaltyAsOf({ ...once, metOn: '2026-02-10' }, '2026-01-25', '2026-03-31', CV), 25_000);
  assert.equal(penaltyAsOf({ ...once, metOn: '2026-01-24' }, '2026-01-25', '2026-03-31', CV), 0);
  assert.equal(penaltyAsOf({ ...base, penalty: 'ONCE_PCT', penaltyValue: '0.5', metOn: '2026-02-10' }, '2026-01-25', '2026-03-31', CV), 250_000);
});

test('a penalty per month counts the months begun to the day it was met, or to the bill', () => {
  const staff = { ...base, anchor: 'START' as const, offsetDays: 0, penalty: 'PER_MONTH' as const, penaltyValue: '20000' };
  const due = obligationDue(staff, anchors)!;
  assert.equal(due, '2026-01-25');
  assert.equal(penaltyAsOf(staff, due, '2026-03-31', CV), 60_000);
  assert.equal(penaltyAsOf({ ...staff, metOn: '2026-02-10' }, due, '2026-03-31', CV), 20_000);
});

test('the client\'s obligations, waived ones and ones without money cost our bills nothing', () => {
  assert.equal(penaltyAsOf({ ...base, party: 'CLIENT' }, '2026-01-25', '2026-03-31', CV), 0);
  assert.equal(penaltyAsOf({ ...base, waived: true }, '2026-01-25', '2026-03-31', CV), 0);
  assert.equal(penaltyAsOf({ ...base, penalty: 'NONE', penaltyValue: null }, '2026-01-25', '2026-03-31', CV), 0);
  assert.equal(penaltyAsOf(base, null, '2026-03-31', CV), 0);
});

test('a bill deducts the cost as of its date less what earlier bills took, and gives back a released withholding', () => {
  const programme = { ...base, id: 'p', title: 'Submit the construction programme', clause: 'GCC 13.1', due: '2026-01-25' };
  const staff = { ...base, id: 's', title: 'Deploy the technical staff', clause: 'GCC 6.1', anchor: 'START' as const, offsetDays: 0, penalty: 'PER_MONTH' as const, penaltyValue: '20000', due: '2026-01-25' };
  const lab = { ...base, id: 'l', title: 'Set up the field laboratory', clause: 'GCC 17.2', offsetDays: 0, offsetMonths: 2, due: '2026-03-10' };
  // Bill 1 on 28 Feb: the programme held, two months of staff, the lab not due yet.
  const first = billRecoveryLines([programme, staff, lab], '2026-02-28', CV, new Map());
  assert.deepEqual(first.map((l) => [l.obligationId, l.amount]), [['p', 100_000], ['s', 40_000]]);
  // Bill 2 on 31 Mar: the programme went in on 5 Mar (given back), staff deployed on 10 Mar (still two months begun), the lab overdue.
  const second = billRecoveryLines([{ ...programme, metOn: '2026-03-05' }, { ...staff, metOn: '2026-03-10' }, lab], '2026-03-31', CV, new Map([['p', 100_000], ['s', 40_000]]));
  assert.deepEqual(second.map((l) => [l.obligationId, l.upto, l.previous, l.amount]), [['p', 0, 100_000, -100_000], ['l', 100_000, 0, 100_000]]);
  // Bill 3: the lab went in on 2 Apr, so its withholding comes back; the staff, fully taken, has no line.
  const third = billRecoveryLines([{ ...programme, metOn: '2026-03-05' }, { ...staff, metOn: '2026-03-10' }, { ...lab, metOn: '2026-04-02' }], '2026-04-30', CV, new Map([['p', 0], ['s', 40_000], ['l', 100_000]]));
  assert.deepEqual(third.map((l) => [l.obligationId, l.amount]), [['l', -100_000]]);
});

test('a saved obligation says what is to be done, has a date where it needs one, and a penalty only where it may', () => {
  const today = '2026-03-01';
  assert.equal(obligationProblem({ ...base, title: 'Programme' }, today), null);
  assert.match(obligationProblem({ ...base, title: '  ' }, today)!, /Say what/);
  assert.match(obligationProblem({ ...base, title: 'X', anchor: 'DATE', dueOn: null }, today)!, /date it is due/);
  assert.match(obligationProblem({ ...base, title: 'X', party: 'CLIENT' }, today)!, /client owes/);
  assert.match(obligationProblem({ ...base, title: 'X', penaltyValue: '0' }, today)!, /more than 0/);
  assert.match(obligationProblem({ ...base, title: 'X', penaltyValue: '120' }, today)!, /at most 100%/);
  assert.equal(obligationProblem({ ...base, title: 'X', penalty: 'PER_MONTH', penaltyValue: '120000' }, today), null);
  assert.match(obligationProblem({ ...base, title: 'X', metOn: '2026-03-02' }, today)!, /after today/);
  assert.match(obligationProblem({ ...base, title: 'X', offsetDays: -1 }, today)!, /time allowed/);
});

test('the standard set has a code each, and what the client owes carries no penalty', () => {
  assert.equal(new Set(STANDARD_OBLIGATIONS.map((s) => s.code)).size, STANDARD_OBLIGATIONS.length);
  for (const s of STANDARD_OBLIGATIONS) assert.equal(obligationProblem({ ...s, dueOn: null, metOn: null }, '2026-01-01'), null, s.code);
});

test('the security deposit stops at its cap of the contract value, or of the work billed when that is larger', () => {
  // 10% a bill up to 5% of a 1 crore contract: 5 lakh in all.
  assert.equal(cappedSecurityDeposit(300_000, 5, 10_000_000, 3_000_000, 0), 300_000);
  assert.equal(cappedSecurityDeposit(300_000, 5, 10_000_000, 6_000_000, 300_000), 200_000);
  assert.equal(cappedSecurityDeposit(300_000, 5, 10_000_000, 9_000_000, 500_000), 0);
  // The work grew past the contract: the cap grows with it.
  assert.equal(cappedSecurityDeposit(300_000, 5, 10_000_000, 12_000_000, 500_000), 100_000);
  // No cap: the bill's % as it is.
  assert.equal(cappedSecurityDeposit(300_000, null, 10_000_000, 9_000_000, 900_000), 300_000);
});

test('the totals count what is overdue, due soon and open, and add up what is held as of today', () => {
  const t = obligationTotals([
    { state: 'OVERDUE', penaltyToDate: 100_000 },
    { state: 'DUE_SOON', penaltyToDate: 0 },
    { state: 'NO_DATE', penaltyToDate: 0 },
    { state: 'MET_LATE', penaltyToDate: 25_000.5 },
    { state: 'WAIVED', penaltyToDate: 0 },
  ]);
  assert.deepEqual(t, { overdue: 1, dueSoon: 1, open: 3, penaltyToDate: 125_000.5 });
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
