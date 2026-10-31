/**
 * Payroll arithmetic, pure so that `src/scripts/payroll-test.ts` can check it: a month's payslip from the
 * salary structure, the days paid and the company's settings, the income tax a month under either regime, and the full
 * and final settlement of someone who has left. Amounts are rupees; payslip lines are rounded to the rupee.
 */
import { PAYSLIP_CODES, professionalTax, type Gender, type ManualPayslipCode, type PaidDaysBasis, type PayslipCode, type PayslipLineKind, type TaxRegime } from '@erp/shared';

export interface RulesSettings {
  pfEmployeePct: number;
  pfEmployerPct: number;
  epsPct: number;
  pfWageCeiling: number;
  pfCapAtCeiling: boolean;
  esiEmployeePct: number;
  esiEmployerPct: number;
  esiGrossCeiling: number;
  ptState: string | null;
  paidDaysBasis: PaidDaysBasis;
  overtimeMultiplier: number;
}

export const DEFAULT_SETTINGS: RulesSettings = {
  pfEmployeePct: 12,
  pfEmployerPct: 12,
  epsPct: 8.33,
  pfWageCeiling: 15000,
  pfCapAtCeiling: true,
  esiEmployeePct: 0.75,
  esiEmployerPct: 3.25,
  esiGrossCeiling: 21000,
  ptState: '21',
  paidDaysBasis: 'CALENDAR',
  overtimeMultiplier: 2,
};

export interface RulesStructure {
  basic: number;
  da: number;
  hra: number;
  conveyance: number;
  special: number;
  otherEarnings: number;
  pf: boolean;
  esi: boolean;
  pt: boolean;
  taxRegime: TaxRegime;
  declaredDeductions: number;
  otherIncome: number;
}

export interface SlipLine {
  kind: PayslipLineKind;
  code: PayslipCode;
  label: string;
  amount: number;
  manual?: boolean;
  loanId?: string;
}

export interface SlipInput {
  /** YYYY-MM */
  month: string;
  /** Days in the calendar month */
  calendarDays: number;
  /** Days of the month on the rolls (all of them unless joined or left in it) */
  daysOnRolls: number;
  lopDays: number;
  overtimeHours: number;
  structure: RulesStructure;
  settings: RulesSettings;
  gender?: Gender | null;
  /** Lines HR added: arrears, bonus, other earnings and deductions */
  manual?: { code: ManualPayslipCode; label?: string; amount: number }[];
  /** Open loans and advances whose recovery has started, oldest first */
  loans?: { id: string; kind: 'LOAN' | 'ADVANCE'; emi: number; balance: number }[];
}

export interface SlipResult {
  monthDays: number;
  paidDays: number;
  lopDays: number;
  gross: number;
  deductions: number;
  net: number;
  employerCost: number;
  pfWages: number;
  esiWages: number;
  lines: SlipLine[];
}

const r0 = (n: number) => Math.round(n + Number.EPSILON);
const r1 = (n: number) => Math.round((n + Number.EPSILON) * 10) / 10;
const line = (code: PayslipCode, amount: number, extra: Partial<SlipLine> = {}): SlipLine => ({ kind: PAYSLIP_CODES[code].kind, code, label: PAYSLIP_CODES[code].label, amount, ...extra });

export const structureGross = (s: Pick<RulesStructure, 'basic' | 'da' | 'hra' | 'conveyance' | 'special' | 'otherEarnings'>) => s.basic + s.da + s.hra + s.conveyance + s.special + s.otherEarnings;

/** Slabs of [income up to, rate %] for each regime (FY 2025-26), the standard deduction and the 87A rebate limit. */
const REGIMES: Record<TaxRegime, { slabs: [number, number][]; standard: number; rebateUpTo: number }> = {
  NEW: {
    slabs: [[400000, 0], [800000, 5], [1200000, 10], [1600000, 15], [2000000, 20], [2400000, 25], [Infinity, 30]],
    standard: 75000,
    rebateUpTo: 1200000,
  },
  OLD: { slabs: [[250000, 0], [500000, 5], [1000000, 20], [Infinity, 30]], standard: 50000, rebateUpTo: 500000 },
};

/** Income tax for a year's taxable income under a regime, with the 87A rebate and 4% cess (no surcharge). */
export function incomeTax(taxable: number, regime: TaxRegime): number {
  const { slabs, rebateUpTo } = REGIMES[regime];
  if (taxable <= rebateUpTo) return 0;
  let tax = 0;
  let from = 0;
  for (const [upTo, rate] of slabs) {
    if (taxable > from) tax += ((Math.min(taxable, upTo) - from) * rate) / 100;
    from = upTo;
  }
  // Marginal relief (new regime): just above the rebate limit, no more tax than the income above it.
  if (regime === 'NEW') tax = Math.min(tax, taxable - rebateUpTo);
  return r0(tax * 1.04);
}

/**
 * TDS a month, projected evenly: the year's salary at this structure (plus other income declared), less the standard
 * deduction and, under the old regime, employee PF, the declared deductions and professional tax.
 */
export function monthlyTds(s: RulesStructure, settings: RulesSettings, gender?: Gender | null): number {
  const gross = structureGross(s);
  const annual = gross * 12 + s.otherIncome;
  const { standard } = REGIMES[s.taxRegime];
  let taxable = annual - standard;
  if (s.taxRegime === 'OLD') {
    const pf = s.pf ? pfShare(s.basic + s.da, settings).employee * 12 : 0;
    const pt = s.pt ? Array.from({ length: 12 }, (_, i) => professionalTax(settings.ptState, gross, i + 1, gender)).reduce((a, b) => a + b, 0) : 0;
    // Declared deductions are taken as HR entered them (what is allowed of 80C beyond PF, 80D, home loan interest).
    taxable -= pf + s.declaredDeductions + pt;
  }
  return r0(incomeTax(Math.max(0, taxable), s.taxRegime) / 12);
}

/** PF on a month's basic and DA: the wages it is on, the employee's share and the employer's EPF and EPS. */
export function pfShare(basicDa: number, st: RulesSettings) {
  const wages = st.pfCapAtCeiling ? Math.min(basicDa, st.pfWageCeiling) : basicDa;
  const employee = r0((wages * st.pfEmployeePct) / 100);
  const eps = r0((Math.min(wages, st.pfWageCeiling) * st.epsPct) / 100);
  const employer = r0((wages * st.pfEmployerPct) / 100);
  return { wages: r0(wages), employee, eps, epf: employer - eps };
}

/** ESI is due while the structure's monthly gross is within the ceiling; contributions are rounded up to the rupee. */
export function esiShare(esiWages: number, structureMonthlyGross: number, s: Pick<RulesStructure, 'esi'>, st: RulesSettings) {
  if (!s.esi || structureMonthlyGross > st.esiGrossCeiling) return { wages: 0, employee: 0, employer: 0 };
  return { wages: r0(esiWages), employee: Math.ceil((esiWages * st.esiEmployeePct) / 100 - 1e-9), employer: Math.ceil((esiWages * st.esiEmployerPct) / 100 - 1e-9) };
}

/** Days paid out of the month: the month's own days less loss of pay, or the same share of 26. */
export function paidDays(input: Pick<SlipInput, 'calendarDays' | 'daysOnRolls' | 'lopDays'>, basis: PaidDaysBasis) {
  const monthDays = basis === 'FIXED_26' ? 26 : input.calendarDays;
  const onRolls = basis === 'FIXED_26' ? r1((26 * input.daysOnRolls) / input.calendarDays) : input.daysOnRolls;
  const paid = Math.max(0, Math.min(monthDays, onRolls - input.lopDays));
  return { monthDays, paidDays: r1(paid), lopDays: r1(Math.min(input.lopDays, onRolls)) };
}

/** One employee's payslip for a month. */
export function computePayslip(input: SlipInput): SlipResult {
  const { structure: s, settings: st } = input;
  const days = paidDays(input, st.paidDaysBasis);
  const factor = days.monthDays ? days.paidDays / days.monthDays : 0;
  const earn = (v: number) => r0(v * factor);
  const lines: SlipLine[] = [];
  const add = (code: PayslipCode, amount: number, extra?: Partial<SlipLine>) => {
    if (amount > 0) lines.push(line(code, amount, extra));
  };
  const basic = earn(s.basic);
  const da = earn(s.da);
  add('BASIC', basic);
  add('DA', da);
  add('HRA', earn(s.hra));
  add('CONVEYANCE', earn(s.conveyance));
  add('SPECIAL', earn(s.special));
  add('OTHER', earn(s.otherEarnings));
  add('OVERTIME', r0(((s.basic + s.da) / 26 / 8) * st.overtimeMultiplier * input.overtimeHours));
  for (const m of input.manual ?? []) if (PAYSLIP_CODES[m.code].kind === 'EARNING') add(m.code, r0(m.amount), { manual: true, label: m.label || PAYSLIP_CODES[m.code].label });
  const gross = lines.reduce((t, l) => t + l.amount, 0);

  const pf = s.pf ? pfShare(basic + da, st) : { wages: 0, employee: 0, eps: 0, epf: 0 };
  const esi = esiShare(gross, structureGross(s), s, st);
  const month = Number(input.month.slice(5, 7));
  add('PF', pf.employee);
  add('ESI', esi.employee);
  add('PT', s.pt ? professionalTax(st.ptState, gross, month, input.gender) : 0);
  // TDS only when something is paid this month.
  add('TDS', gross > 0 ? monthlyTds(s, st, input.gender) : 0);
  for (const m of input.manual ?? []) if (PAYSLIP_CODES[m.code].kind === 'DEDUCTION') add(m.code, r0(m.amount), { manual: true, label: m.label || PAYSLIP_CODES[m.code].label });
  // Loans and advances last, and never more than is left to pay.
  let left = gross - lines.filter((l) => l.kind === 'DEDUCTION').reduce((t, l) => t + l.amount, 0);
  for (const loan of input.loans ?? []) {
    const take = Math.max(0, Math.min(loan.emi, loan.balance, left));
    if (take > 0) {
      add(loan.kind, r0(take), { loanId: loan.id });
      left -= r0(take);
    }
  }
  add('PF_EMPLOYER', pf.epf);
  add('EPS_EMPLOYER', pf.eps);
  add('ESI_EMPLOYER', esi.employer);

  const sum = (k: PayslipLineKind) => lines.filter((l) => l.kind === k).reduce((t, l) => t + l.amount, 0);
  const deductions = sum('DEDUCTION');
  return { ...days, gross, deductions, net: gross - deductions, employerCost: sum('EMPLOYER'), pfWages: pf.wages, esiWages: esi.wages, lines };
}

/** What a structure costs at full attendance: monthly PF and ESI both sides, and the CTC a year. */
export function structureCost(s: RulesStructure, st: RulesSettings) {
  const gross = structureGross(s);
  const pf = s.pf ? pfShare(s.basic + s.da, st) : { wages: 0, employee: 0, eps: 0, epf: 0 };
  const esi = esiShare(gross, gross, s, st);
  return { gross, employeePf: pf.employee, employerPf: pf.epf + pf.eps, employeeEsi: esi.employee, employerEsi: esi.employer, ctcAnnual: (gross + pf.epf + pf.eps + esi.employer) * 12 };
}

export interface SettlementInput {
  joinedOn: string | null;
  lastWorkingDay: string;
  /** Monthly basic + DA and gross at the last structure */
  basicDa: number;
  gross: number;
  /** Days of the last month not paid in a salary run (0 when that month's run paid them) */
  unpaidDays: number;
  /** Days in the last month */
  calendarDays: number;
  /** Earned leave left */
  leaveDays: number;
  noticeDays: number | null;
  /** The day the resignation was handed in; null for a termination or retirement (no recovery) */
  noticeGivenOn: string | null;
  loanBalance: number;
  otherEarnings?: number;
  otherDeductions?: number;
}

const DAY = 86_400_000;
const dayNo = (d: string) => Date.parse(`${d}T00:00:00Z`) / DAY;
/** Gratuity is capped by law (₹25 lakh from 2024). */
export const GRATUITY_CAP = 2_500_000;

/**
 * Full and final settlement: the last month's unpaid salary, earned leave encashed at a day's basic and DA (/26),
 * gratuity at 15 days' basic and DA (/26) for each year after five years' service (six months or more counts as a
 * year), less notice not served at a day's gross (/30) and loans still owed.
 */
export function computeSettlement(i: SettlementInput) {
  const salary = r0((i.gross / i.calendarDays) * i.unpaidDays);
  const leaveEncashment = r0((i.basicDa / 26) * i.leaveDays);
  const serviceDays = i.joinedOn ? dayNo(i.lastWorkingDay) - dayNo(i.joinedOn) + 1 : 0;
  const serviceYears = Math.round((serviceDays / 365.25) * 100) / 100;
  const whole = Math.floor(serviceYears);
  const years = serviceYears - whole >= 0.5 ? whole + 1 : whole;
  const gratuity = serviceYears >= 4.75 ? Math.min(GRATUITY_CAP, r0(((i.basicDa * 15) / 26) * years)) : 0;
  const served = i.noticeGivenOn ? dayNo(i.lastWorkingDay) - dayNo(i.noticeGivenOn) + 1 : null;
  const noticeShortDays = served === null || !i.noticeDays ? 0 : Math.max(0, i.noticeDays - served);
  const noticeRecovery = r0((i.gross / 30) * noticeShortDays);
  const loanRecovery = r0(i.loanBalance);
  const otherEarnings = r0(i.otherEarnings ?? 0);
  const otherDeductions = r0(i.otherDeductions ?? 0);
  const net = salary + leaveEncashment + gratuity + otherEarnings - noticeRecovery - loanRecovery - otherDeductions;
  return { salaryDays: i.unpaidDays, salary, leaveDays: i.leaveDays, leaveEncashment, serviceYears, gratuity, noticeShortDays, noticeRecovery, loanRecovery, otherEarnings, otherDeductions, net };
}
