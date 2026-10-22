/**
 * Payroll's tests (v6 item 100): payslips, PF, ESI, professional tax, TDS and full and final settlement, with no
 * database. CI runs it after the build:
 *
 *   node dist/scripts/payroll-test.js
 */
import assert from 'node:assert/strict';
import { professionalTax } from '@erp/shared';
import { DEFAULT_SETTINGS, computePayslip, computeSettlement, incomeTax, monthlyTds, structureCost, type RulesStructure, type SlipResult } from '../payroll/payroll-rules';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);
const S = (s: Partial<RulesStructure>): RulesStructure => ({ basic: 0, da: 0, hra: 0, conveyance: 0, special: 0, otherEarnings: 0, pf: true, esi: true, pt: true, taxRegime: 'NEW', declaredDeductions: 0, otherIncome: 0, ...s });
const amount = (r: SlipResult, code: string) => r.lines.find((l) => l.code === code)?.amount ?? 0;

test('a full month at ₹25,000: PF on the ₹15,000 ceiling, no ESI above ₹21,000, Odisha PT ₹125, no TDS', () => {
  const r = computePayslip({ month: '2026-10', calendarDays: 31, daysOnRolls: 31, lopDays: 0, overtimeHours: 0, structure: S({ basic: 15000, hra: 6000, conveyance: 1600, special: 2400 }), settings: DEFAULT_SETTINGS });
  assert.equal(r.gross, 25000);
  assert.equal(amount(r, 'PF'), 1800);
  assert.equal(amount(r, 'EPS_EMPLOYER'), 1250);
  assert.equal(amount(r, 'PF_EMPLOYER'), 550);
  assert.equal(amount(r, 'ESI'), 0);
  assert.equal(amount(r, 'PT'), 125);
  assert.equal(amount(r, 'TDS'), 0);
  assert.equal(r.net, 23075);
  assert.equal(r.employerCost, 1800);
  assert.equal(r.pfWages, 15000);
});

test('three days of loss of pay in a 30-day month: earnings at 27/30, ESI rounded up both sides', () => {
  const r = computePayslip({ month: '2026-11', calendarDays: 30, daysOnRolls: 30, lopDays: 3, overtimeHours: 0, structure: S({ basic: 10000, hra: 4000, special: 2000 }), settings: DEFAULT_SETTINGS });
  assert.deepEqual([r.monthDays, r.paidDays, r.lopDays], [30, 27, 3]);
  assert.equal(r.gross, 14400);
  assert.equal(amount(r, 'PF'), 1080);
  assert.equal(amount(r, 'EPS_EMPLOYER'), 750);
  assert.equal(amount(r, 'PF_EMPLOYER'), 330);
  assert.equal(amount(r, 'ESI'), 108);
  assert.equal(amount(r, 'ESI_EMPLOYER'), 468);
  assert.equal(amount(r, 'PT'), 125);
  assert.equal(r.net, 13087);
  assert.equal(r.employerCost, 1548);
});

test('26-day basis, a joiner part-way, overtime at twice the hourly basic', () => {
  const r = computePayslip({ month: '2026-10', calendarDays: 31, daysOnRolls: 31, lopDays: 2, overtimeHours: 10, structure: S({ basic: 15000 }), settings: { ...DEFAULT_SETTINGS, paidDaysBasis: 'FIXED_26' } });
  assert.deepEqual([r.monthDays, r.paidDays], [26, 24]);
  assert.equal(amount(r, 'BASIC'), Math.round((15000 * 24) / 26));
  assert.equal(amount(r, 'OVERTIME'), 1442);
  const joiner = computePayslip({ month: '2026-10', calendarDays: 31, daysOnRolls: 10, lopDays: 0, overtimeHours: 0, structure: S({ basic: 31000 }), settings: DEFAULT_SETTINGS });
  assert.equal(amount(joiner, 'BASIC'), 10000);
});

test('PF on the full basic when the company does not cap it', () => {
  const r = computePayslip({ month: '2026-10', calendarDays: 31, daysOnRolls: 31, lopDays: 0, overtimeHours: 0, structure: S({ basic: 30000, esi: false }), settings: { ...DEFAULT_SETTINGS, pfCapAtCeiling: false } });
  assert.equal(amount(r, 'PF'), 3600);
  // The pension share stays on the ceiling; the rest of the employer's 12% goes to EPF.
  assert.equal(amount(r, 'EPS_EMPLOYER'), 1250);
  assert.equal(amount(r, 'PF_EMPLOYER'), 2350);
});

test('manual lines are kept, and loans never take more than is left', () => {
  const r = computePayslip({
    month: '2026-10',
    calendarDays: 31,
    daysOnRolls: 31,
    lopDays: 0,
    overtimeHours: 0,
    structure: S({ basic: 15000, hra: 6000, conveyance: 1600, special: 2400 }),
    settings: DEFAULT_SETTINGS,
    manual: [
      { code: 'ARREARS', amount: 2000 },
      { code: 'OTHER_DEDUCTION', label: 'Canteen', amount: 500 },
    ],
    loans: [
      { id: 'a', kind: 'ADVANCE', emi: 5000, balance: 3000 },
      { id: 'b', kind: 'LOAN', emi: 100000, balance: 100000 },
    ],
  });
  assert.equal(r.gross, 27000);
  assert.equal(r.lines.find((l) => l.code === 'OTHER_DEDUCTION')?.label, 'Canteen');
  assert.equal(amount(r, 'ADVANCE'), 3000);
  assert.equal(r.net, 0);
  assert.ok(amount(r, 'LOAN') > 0 && amount(r, 'LOAN') < 100000);
});

test('professional tax by state, with the higher last month and women’s slabs in Maharashtra', () => {
  assert.equal(professionalTax('21', 13000, 10), 0);
  assert.equal(professionalTax('21', 40000, 10), 200);
  assert.equal(professionalTax('21', 40000, 3), 300);
  assert.equal(professionalTax('27', 20000, 10, 'FEMALE'), 0);
  assert.equal(professionalTax('27', 20000, 2, 'MALE'), 300);
  assert.equal(professionalTax('27', 9000, 2, 'MALE'), 175);
  assert.equal(professionalTax('29', 25000, 10), 200);
  assert.equal(professionalTax('19', 30000, 10), 150);
  assert.equal(professionalTax('07', 90000, 10), 0);
  assert.equal(professionalTax(null, 90000, 10), 0);
});

test('income tax: the new regime’s rebate to ₹12 lakh with marginal relief, the old regime’s slabs, 4% cess', () => {
  assert.equal(incomeTax(1200000, 'NEW'), 0);
  assert.equal(incomeTax(1210000, 'NEW'), 10400);
  assert.equal(incomeTax(1300000, 'NEW'), 78000);
  assert.equal(incomeTax(500000, 'OLD'), 0);
  assert.equal(incomeTax(800000, 'OLD'), 75400);
  // ₹1,25,000 a month: 15 lakh a year less 75,000 standard = 14.25 lakh.
  const tds = monthlyTds(S({ basic: 60000, hra: 30000, special: 35000 }), DEFAULT_SETTINGS);
  assert.equal(tds, Math.round(incomeTax(1425000, 'NEW') / 12));
});

test('structure cost: CTC a year is gross plus the employer’s PF and ESI', () => {
  const c = structureCost(S({ basic: 10000, hra: 4000, special: 2000 }), DEFAULT_SETTINGS);
  assert.equal(c.gross, 16000);
  assert.equal(c.employerPf, 1200);
  assert.equal(c.employerEsi, 520);
  assert.equal(c.ctcAnnual, (16000 + 1200 + 520) * 12);
});

test('full and final: unpaid days, leave encashed, gratuity after five years, notice short and loans recovered', () => {
  const s = computeSettlement({ joinedOn: '2020-01-01', lastWorkingDay: '2025-06-30', basicDa: 20000, gross: 30000, unpaidDays: 30, calendarDays: 30, leaveDays: 10, noticeDays: 30, noticeGivenOn: '2025-06-16', loanBalance: 5000 });
  assert.equal(s.serviceYears, 5.5);
  assert.equal(s.gratuity, 69231);
  assert.equal(s.leaveEncashment, 7692);
  assert.equal(s.noticeShortDays, 15);
  assert.equal(s.noticeRecovery, 15000);
  assert.equal(s.salary, 30000);
  assert.equal(s.net, 30000 + 7692 + 69231 - 15000 - 5000);
  const short = computeSettlement({ joinedOn: '2022-01-01', lastWorkingDay: '2025-06-30', basicDa: 20000, gross: 30000, unpaidDays: 0, calendarDays: 30, leaveDays: 0, noticeDays: 30, noticeGivenOn: null, loanBalance: 0 });
  assert.equal(short.gratuity, 0);
  assert.equal(short.noticeShortDays, 0);
  assert.equal(short.net, 0);
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
console.log(`\nPayroll: ${cases.length - failed} of ${cases.length} tests pass`);
process.exit(failed ? 1 : 0);
