/**
 * Machine finance's tests: the EMI, the schedule (interest on what is owed, the last EMI clearing the
 * rest), dates a month apart, the terms that make no loan, where an EMI stands, what a loan has repaid and owes, paying
 * in order, closing early and the machine's cost of finance, with no database. CI runs it after the build:
 *
 *   node dist/scripts/loans-test.js
 */
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { addMonths, emiFor, emiStage, foreclosure, interestPerHour, loanPosition, payProblem, schedule, scheduleFrom, termsProblem, type EmiState } from '../machine-loans/loan-rules';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);
const s = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v).toFixed(2);
const sum = (xs: Prisma.Decimal[]) => xs.reduce((a, b) => a.add(b), new Prisma.Decimal(0));

test('the EMI is the annuity formula to the rupee, and the amount over the months at no interest', () => {
  // ₹10 lakh at 10% for 12 months: 87,915.89 by the formula.
  assert.equal(s(emiFor(1_000_000, 10, 12)), '87916.00');
  // ₹38 lakh at 9.25% for 48 months.
  assert.equal(s(emiFor(3_800_000, 9.25, 48)), '95015.00');
  assert.equal(s(emiFor(120_000, 0, 12)), '10000.00');
  assert.equal(s(emiFor(100_000, 0, 12)), '8334.00', 'rounded up so the loan is repaid in the tenure');
});

test('EMIs fall on the same day of each month, or the last day of a shorter month', () => {
  assert.equal(addMonths('2026-11-05', 0), '2026-11-05');
  assert.equal(addMonths('2026-11-05', 2), '2027-01-05');
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2024-01-31', 1), '2024-02-29');
  assert.equal(addMonths('2026-01-31', 2), '2026-03-31', 'back to the 31st after a short month');
});

test('the schedule charges a month’s interest on what is owed and the last EMI clears the loan', () => {
  const rows = schedule({ amount: 1_000_000, ratePct: 10, tenureMonths: 12, firstEmiDate: '2026-11-05' });
  assert.equal(rows.length, 12);
  assert.equal(s(rows[0].interest), '8333.33');
  assert.equal(s(rows[0].principal), '79582.67');
  assert.equal(s(rows[0].emi), '87916.00');
  assert.equal(s(rows[1].opening), '920417.33');
  assert.equal(rows[11].dueDate, '2027-10-05');
  assert.equal(s(rows[11].closing), '0.00');
  assert.equal(s(sum(rows.map((r) => r.principal))), '1000000.00');
  for (const r of rows) {
    assert.equal(s(r.emi), s(r.principal.add(r.interest)), `EMI ${r.no} adds up`);
    assert.equal(s(r.closing), s(r.opening.sub(r.principal)), `EMI ${r.no} carries on`);
  }
  // The rounding of the EMI lands on the last one, within a few rupees.
  assert.ok(rows[11].emi.sub(87916).abs().lt(12), `last EMI ${s(rows[11].emi)}`);
});

test('a lender’s higher EMI repays the loan early; at no interest every EMI is principal', () => {
  const fast = schedule({ amount: 1_000_000, ratePct: 10, tenureMonths: 12, emi: 100_000, firstEmiDate: '2026-11-05' });
  assert.ok(fast.length < 12, `${fast.length} EMIs`);
  assert.equal(s(fast[fast.length - 1].closing), '0.00');
  assert.ok(fast[fast.length - 1].emi.lte(100_000));
  const free = schedule({ amount: 100_000, ratePct: 0, tenureMonths: 12, firstEmiDate: '2026-11-05' });
  assert.equal(free.length, 12);
  assert.ok(free.every((r) => r.interest.isZero()));
  assert.equal(s(free[11].principal), '8326.00', 'what is left after eleven of ₹8,334');
});

test('terms that make no loan are refused with what to fix', () => {
  const ok = { amount: 1_000_000, ratePct: 10, tenureMonths: 12, firstEmiDate: '2026-11-05', sanctionDate: '2026-10-10' };
  assert.equal(termsProblem(ok), null);
  assert.equal(termsProblem({ ...ok, emi: 87_900 }), null, 'a lender’s rounding is fine');
  assert.match(termsProblem({ ...ok, amount: 0 })!, /amount/);
  assert.match(termsProblem({ ...ok, ratePct: 40 })!, /between 0 and 36/);
  assert.match(termsProblem({ ...ok, tenureMonths: 0 })!, /1 to 120 months/);
  assert.match(termsProblem({ ...ok, firstEmiDate: '2026-10-01' })!, /on or after the sanction date/);
  assert.match(termsProblem({ ...ok, emi: 8_000 })!, /does not cover the first month's interest/);
  assert.match(termsProblem({ ...ok, emi: 50_000 })!, /last EMI would be/);
});

test('an EMI is paid, overdue past its date, due within a week, or later', () => {
  assert.equal(emiStage({ dueDate: '2026-10-05', paidOn: '2026-10-05' }, '2026-10-22'), 'PAID');
  assert.equal(emiStage({ dueDate: '2026-10-21', paidOn: null }, '2026-10-22'), 'OVERDUE');
  assert.equal(emiStage({ dueDate: '2026-10-22', paidOn: null }, '2026-10-22'), 'DUE', 'due today is not yet late');
  assert.equal(emiStage({ dueDate: '2026-10-29', paidOn: null }, '2026-10-22'), 'DUE');
  assert.equal(emiStage({ dueDate: '2026-10-30', paidOn: null }, '2026-10-22'), 'LATER');
});

const rows = schedule({ amount: 1_000_000, ratePct: 10, tenureMonths: 12, firstEmiDate: '2026-04-05' });
const state = (paid: number): EmiState[] => rows.map((r) => ({ no: r.no, dueDate: r.dueDate, principal: r.principal, interest: r.interest, emi: r.emi, paidOn: r.no <= paid ? r.dueDate : null }));

test('a loan’s position: repaid, owed, overdue, next, due in 30 days and the year’s interest', () => {
  // Five EMIs paid (April to August); September and October unpaid on 22 Oct.
  const p = loanPosition(1_000_000, state(5), '2026-10-22');
  assert.equal(p.emisPaid, 5);
  assert.equal(s(p.outstanding), s(rows[4].closing));
  assert.equal(s(p.principalRepaid.add(p.outstanding)), '1000000.00');
  assert.equal(s(p.interestPaid), s(sum(rows.slice(0, 5).map((r) => r.interest))));
  assert.equal(p.overdueCount, 2);
  assert.equal(s(p.overdueAmount), '175832.00');
  assert.equal(p.overdueDays, 47, 'September’s, since 5 Sep');
  assert.equal(p.next!.no, 6);
  assert.equal(p.next!.stage, 'OVERDUE');
  assert.equal(s(p.dueIn30), '87916.00', 'November’s');
  assert.equal(s(p.interestThisYear), s(p.interestPaid), 'all paid since April');
  assert.equal(s(p.interestToCome.add(p.interestPaid)), s(sum(rows.map((r) => r.interest))));
  // Before April the year is last year's.
  assert.equal(s(loanPosition(1_000_000, state(5), '2027-03-01').interestThisYear), s(p.interestPaid));
  assert.equal(s(loanPosition(1_000_000, state(5), '2027-04-01').interestThisYear), '0.00');
  const done = loanPosition(1_000_000, state(12), '2027-04-10');
  assert.equal(s(done.outstanding), '0.00');
  assert.equal(done.next, null);
});

test('EMIs are paid in order, once, on or after sanction and not in the future', () => {
  const st = state(5);
  assert.equal(payProblem(st, 6, '2026-10-22', '2026-03-20', '2026-10-22'), null);
  assert.match(payProblem(st, 7, '2026-10-22', '2026-03-20', '2026-10-22')!, /Pay EMI 6 first/);
  assert.match(payProblem(st, 5, '2026-10-22', '2026-03-20', '2026-10-22')!, /already paid/);
  assert.match(payProblem(st, 6, '2026-10-23', '2026-03-20', '2026-10-22')!, /once it is paid/);
  assert.match(payProblem(st, 6, '2026-03-01', '2026-03-20', '2026-10-22')!, /sanction date/);
  assert.match(payProblem(st, 13, '2026-10-22', '2026-03-20', '2026-10-22')!, /No such EMI/);
});

test('closing early repays all that is owed with the month’s interest or the lender’s', () => {
  const next = rows[5];
  const f = foreclosure(next);
  assert.equal(s(f.principal), s(next.opening));
  assert.equal(s(f.interest), s(next.interest));
  assert.equal(s(f.emi), s(next.opening.add(next.interest)));
  assert.equal(s(f.closing), '0.00');
  assert.equal(s(foreclosure(next, 12_345.678).interest), '12345.68');
  assert.equal(s(foreclosure(next, 0).emi), s(next.opening), 'no interest when the lender waives it');
});

test('an undone payment puts back the schedule as it was from that EMI', () => {
  const t = { amount: 1_000_000, ratePct: 10, tenureMonths: 12, emi: 87_916, firstEmiDate: '2026-04-05' };
  const rest = scheduleFrom(t, 6);
  assert.deepEqual(
    rest.map((r) => [r.no, s(r.opening), s(r.emi)]),
    rows.slice(5).map((r) => [r.no, s(r.opening), s(r.emi)]),
  );
});

test('the machine’s cost of finance is the interest paid over the hours worked', () => {
  assert.equal(s(interestPerHour(42_000, 1_200)!), '35.00');
  assert.equal(interestPerHour(42_000, 0), null);
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
