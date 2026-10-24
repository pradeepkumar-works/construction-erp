/**
 * O&M tests (item 131). The contract's instalment periods and their labels, the terms a contract must hold to, a day's
 * service level failures, a month's figures (days due and missing, failures beyond the allowance, MONTH benchmarks only
 * once the month is over, staff short at the monthly pay), the bill of a period, what stops a period being billed, and a
 * chemical's use against its norm.
 *
 *   node dist/scripts/om-test.js
 */
import assert from 'node:assert/strict';
import { DEFAULT_OM_BENCHMARKS, omRuleText, type OmBenchmarkSetting } from '@erp/shared';
import {
  addMonths,
  billProblem,
  chemicalRow,
  dayFailures,
  lastOf,
  lossPctOf,
  lpcdOf,
  monthFigures,
  monthsBetween,
  omBill,
  omEndsOn,
  omPeriods,
  periodLabel,
  periodOf,
  termsProblem,
  type DayReading,
} from '../om/om-rules';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

const TERMS = { startOn: '2025-04-01', years: 5, yearPcts: [3, 3.25, 3.5, 3.75, 4], instalmentsPerYear: 4, contractValue: 216_000_000 };
const POP = 40_000;
const day = (date: string, over: Partial<DayReading> = {}): DayReading => ({
  date,
  producedKl: 6600,
  suppliedKl: 5800, // 145 lpcd at 40,000 people, 12.1% lost
  residualChlorine: 0.4,
  tailPressureM: 9,
  complaintsReceived: 2,
  complaintsClosed48h: 2,
  pumpEfficiencyPct: 68,
  ...over,
});
const monthOf = (month: string, days: DayReading[], today = '2026-12-31', deployed = new Map<string, number>(), settings: OmBenchmarkSetting[] = DEFAULT_OM_BENCHMARKS) =>
  monthFigures({ month, startOn: TERMS.startOn, endsOn: omEndsOn(TERMS), today, days, settings, population: POP, norms: [{ role: 'Pump operator', required: 6, monthlyPay: 18000 }, { role: 'Lineman', required: 4, monthlyPay: 15000 }], deployed });
const fullMonth = (month: string, over: (d: string) => Partial<DayReading> = () => ({})) => {
  const out: DayReading[] = [];
  for (let i = 1; i <= Number(lastOf(month).slice(8)); i++) {
    const d = `${month}-${String(i).padStart(2, '0')}`;
    out.push(day(d, over(d)));
  }
  return out;
};

test('dates: months move across a year end, a month has its last day, and months between run inclusive', () => {
  assert.equal(addMonths('2025-11-01', 3), '2026-02-01');
  assert.equal(addMonths('2026-01-01', -1), '2025-12-01');
  assert.equal(lastOf('2028-02'), '2028-02-29');
  assert.equal(lastOf('2026-09'), '2026-09-30');
  assert.deepEqual(monthsBetween('2026-11-15', '2027-01-03'), ['2026-11', '2026-12', '2027-01']);
});

test('periods: five years in quarters are 20 instalments of the year’s % over whole months, ending the day before the sixth year', () => {
  const periods = omPeriods(TERMS);
  assert.equal(periods.length, 20);
  assert.deepEqual(periods[0], { year: 1, instalment: 1, label: 'Year 1, quarter 1', from: '2025-04-01', to: '2025-06-30', yearPct: 3, amount: 1_620_000 });
  assert.equal(periods[5].label, 'Year 2, quarter 2');
  assert.equal(periods[5].from, '2026-07-01');
  assert.equal(periods[5].to, '2026-09-30');
  assert.equal(periods[5].amount, 1_755_000);
  assert.equal(periods[19].to, '2030-03-31');
  assert.equal(omEndsOn(TERMS), '2030-03-31');
  assert.equal(periodOf(periods, '2026-10-24')?.label, 'Year 2, quarter 3');
  assert.equal(periodOf(periods, '2030-04-01'), null);
});

test('periods: labels follow the instalments a year, and a contract with no value bills nothing', () => {
  assert.equal(periodLabel(3, 1, 1), 'Year 3');
  assert.equal(periodLabel(1, 2, 2), 'Year 1, half 2');
  assert.equal(periodLabel(1, 5, 12), 'Year 1, month 5');
  const monthly = omPeriods({ ...TERMS, years: 1, yearPcts: [3], instalmentsPerYear: 12, contractValue: null });
  assert.equal(monthly.length, 12);
  assert.equal(monthly[10].from, '2026-02-01');
  assert.equal(monthly[10].to, '2026-02-28');
  assert.ok(monthly.every((p) => p.amount === 0));
});

test('terms: start on a first, whole-month instalments, a % for each year, and a population', () => {
  const ok = { startOn: '2025-04-01', years: 5, yearPcts: [3, 3.25, 3.5, 3.75, 4], instalmentsPerYear: 4, population: 40000 };
  assert.equal(termsProblem(ok), null);
  assert.match(termsProblem({ ...ok, startOn: '2025-04-02' })!, /first of a month/);
  assert.match(termsProblem({ ...ok, instalmentsPerYear: 5 })!, /1, 2, 3, 4, 6 or 12/);
  assert.match(termsProblem({ ...ok, yearPcts: [3, 3] })!, /each of the 5 years/);
  assert.match(termsProblem({ ...ok, yearPcts: [3, 3, 0, 3, 3] })!, /more than 0/);
  assert.match(termsProblem({ ...ok, population: 0 })!, /population/);
});

test('service levels: lpcd and loss are worked out, and a day misses the DAY benchmarks it falls short of', () => {
  assert.equal(lpcdOf(5800, POP), 145);
  assert.equal(lossPctOf(6600, 5800), 12.1);
  assert.equal(lossPctOf(0, 0), null);
  assert.deepEqual(dayFailures(day('2026-09-02'), DEFAULT_OM_BENCHMARKS, POP), []);
  assert.deepEqual(dayFailures(day('2026-09-02', { suppliedKl: 5000, tailPressureM: 6.2, residualChlorine: 0.1 }), DEFAULT_OM_BENCHMARKS, POP), ['LPCD', 'CHLORINE', 'PRESSURE']);
  // A reading not taken misses nothing; month benchmarks are not judged on a day
  assert.deepEqual(dayFailures(day('2026-09-02', { tailPressureM: null, residualChlorine: null, pumpEfficiencyPct: 20 }), DEFAULT_OM_BENCHMARKS, POP), []);
  assert.equal(omRuleText('LPCD', '135'), 'at least 135 lpcd');
  assert.equal(omRuleText('WATER_LOSS', '20'), 'at most 20%');
});

test('a month: failures within the allowance cost nothing, each one beyond costs the penalty', () => {
  const bad = new Set(['2026-09-05', '2026-09-18']);
  const m = monthOf('2026-09', fullMonth('2026-09', (d) => (bad.has(d) ? { tailPressureM: 5.5 } : {})));
  const pressure = m.benchmarks.find((b) => b.key === 'PRESSURE')!;
  assert.equal(pressure.failures, 2);
  assert.equal(pressure.allowed, 1);
  assert.equal(pressure.penalised, 1);
  assert.equal(pressure.penalty, 5000);
  assert.equal(pressure.value, 5.5);
  assert.deepEqual(pressure.days, ['2026-09-05', '2026-09-18']);
  assert.equal(m.penalty, 5000);
  assert.equal(m.dueDays, 30);
  assert.equal(m.loggedDays, 30);
  assert.deepEqual(m.missingDays, []);
});

test('a month: MONTH benchmarks are judged once the month is over, on the month’s own figure', () => {
  const lossy = fullMonth('2026-10', () => ({ suppliedKl: 5100 })); // 22.7% lost, 127.5 lpcd
  const running = monthOf('2026-10', lossy.slice(0, 23), '2026-10-24');
  const loss = running.benchmarks.find((b) => b.key === 'WATER_LOSS')!;
  assert.equal(running.complete, false);
  assert.equal(loss.value, 22.7);
  assert.equal(loss.failures, 0);
  const done = monthOf('2026-10', lossy);
  assert.equal(done.complete, true);
  const lossDone = done.benchmarks.find((b) => b.key === 'WATER_LOSS')!;
  assert.equal(lossDone.failures, 1);
  assert.equal(lossDone.penalty, 25000);
  // Supply missed all 31 days, two allowed
  assert.equal(done.benchmarks.find((b) => b.key === 'LPCD')!.penalty, 29 * 5000);
});

test('a month: complaints closed late and weak pumps are a single failure each; no complaints is no figure', () => {
  const m = monthOf('2026-08', fullMonth('2026-08', (d) => (d.endsWith('-10') ? { complaintsReceived: 10, complaintsClosed48h: 4, pumpEfficiencyPct: 40 } : { pumpEfficiencyPct: 59 })));
  const c = m.benchmarks.find((b) => b.key === 'COMPLAINTS')!;
  assert.equal(c.value, 91.4); // 60 + 4 of 70
  assert.equal(c.failures, 1);
  assert.equal(m.benchmarks.find((b) => b.key === 'PUMP_EFFICIENCY')!.failures, 1);
  const quiet = monthOf('2026-08', fullMonth('2026-08', () => ({ complaintsReceived: 0, complaintsClosed48h: 0 })));
  assert.equal(quiet.benchmarks.find((b) => b.key === 'COMPLAINTS')!.value, null);
  assert.equal(quiet.benchmarks.find((b) => b.key === 'COMPLAINTS')!.failures, 0);
});

test('a month: the days due run to yesterday, and a missing day is listed but not penalised', () => {
  const days = fullMonth('2026-10').filter((d) => d.date <= '2026-10-23' && d.date !== '2026-10-12');
  const m = monthOf('2026-10', days, '2026-10-24');
  assert.equal(m.dueDays, 23);
  assert.equal(m.loggedDays, 22);
  assert.deepEqual(m.missingDays, ['2026-10-12']);
  assert.equal(m.penalty, 0);
  // Before the contract starts nothing is due
  assert.equal(monthOf('2025-03', [], '2026-10-24').dueDays, 0);
  // A month ending today is not judged until tomorrow
  assert.equal(monthOf('2026-10', fullMonth('2026-10'), '2026-10-31').complete, false);
  assert.equal(monthOf('2026-10', fullMonth('2026-10'), '2026-11-01').complete, true);
});

test('a month: staff short of the minimum are deducted at the monthly pay; staff not recorded deduct nothing', () => {
  const m = monthOf('2026-08', fullMonth('2026-08'), '2026-12-31', new Map([['Pump operator', 5], ['Lineman', 5]]));
  assert.equal(m.staffRecorded, true);
  assert.deepEqual(m.staff.map((l) => [l.role, l.deployed, l.short, l.deduction]), [['Pump operator', 5, 1, 18000], ['Lineman', 5, 0, 0]]);
  assert.equal(m.staffDeduction, 18000);
  const none = monthOf('2026-08', fullMonth('2026-08'));
  assert.equal(none.staffRecorded, false);
  assert.equal(none.staffDeduction, 0);
  assert.equal(none.staff[0].deployed, null);
});

test('a bill: the instalment less staff short is the gross, penalties are the deduction, and the gaps are kept', () => {
  const period = omPeriods(TERMS)[5]; // Year 2, quarter 2: Jul to Sep 2026
  const bad = new Set(['2026-09-05', '2026-09-18']);
  const months = [
    monthOf('2026-07', fullMonth('2026-07')),
    monthOf('2026-08', fullMonth('2026-08').filter((d) => d.date !== '2026-08-30'), '2026-12-31', new Map([['Pump operator', 5], ['Lineman', 4]])),
    monthOf('2026-09', fullMonth('2026-09', (d) => (bad.has(d) ? { tailPressureM: 5.5 } : {}))),
    monthOf('2026-10', fullMonth('2026-10', () => ({ tailPressureM: 1 }))), // outside the period
  ];
  const { gross, penalty, detail } = omBill(period, months);
  assert.equal(gross, 1_755_000 - 18_000);
  assert.equal(penalty, 5000);
  assert.deepEqual(detail.staff, [{ month: '2026-08', role: 'Pump operator', required: 6, deployed: 5, short: 1, deduction: 18000 }]);
  assert.deepEqual(detail.penalties, [{ month: '2026-09', key: 'PRESSURE', failures: 2, allowed: 1, penalised: 1, amount: 5000 }]);
  assert.equal(detail.missingDays, 1);
  assert.deepEqual(detail.staffNotRecorded, ['2026-07', '2026-09']);
  assert.equal(detail.label, 'Year 2, quarter 2');
});

test('billing: a period is billed once, after it ends, and in order', () => {
  const periods = omPeriods(TERMS);
  const billed = periods.slice(0, 5).map((p) => ({ year: p.year, instalment: p.instalment }));
  assert.equal(billProblem(periods[5], '2026-10-05', billed, periods), null);
  assert.match(billProblem(periods[5], '2026-09-29', billed, periods)!, /runs to 2026-09-30/);
  assert.match(billProblem(periods[4], '2026-10-05', billed, periods)!, /already has its bill/);
  assert.match(billProblem(periods[6], '2027-01-05', billed.slice(0, 4), periods)!, /Bill Year 2, quarter 1 first/);
  assert.match(billProblem(null, '2026-10-05', billed, periods)!, /no such O&M period/);
});

test('chemicals: use is set against the norm per ML produced, within 10% either side', () => {
  assert.deepEqual(chemicalRow({ perMl: 25 }, 200_000, 5000), { producedMl: 200, normQty: 5000, variancePct: 0, status: 'WITHIN' });
  assert.equal(chemicalRow({ perMl: 25 }, 200_000, 5600).status, 'OVER');
  assert.equal(chemicalRow({ perMl: 25 }, 200_000, 5600).variancePct, 12);
  assert.equal(chemicalRow({ perMl: 25 }, 200_000, 4400).status, 'UNDER');
  assert.equal(chemicalRow({ perMl: 25 }, 0, 300).status, 'NO_WATER');
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
