/**
 * Payroll: salary structures, salary runs with payslips, loans and advances, the statutory returns, and
 * full and final settlement. The arithmetic is in the API's `payroll-rules.ts`; this holds the labels, the professional
 * tax slabs and the shapes the screens use.
 */
import type { Gender } from './hr';

export const TAX_REGIMES = ['NEW', 'OLD'] as const;
export type TaxRegime = (typeof TAX_REGIMES)[number];
export const TAX_REGIME_LABELS: Record<TaxRegime, string> = { NEW: 'New regime', OLD: 'Old regime' };

export const PAID_DAYS_BASES = ['CALENDAR', 'FIXED_26'] as const;
export type PaidDaysBasis = (typeof PAID_DAYS_BASES)[number];
export const PAID_DAYS_BASIS_LABELS: Record<PaidDaysBasis, string> = { CALENDAR: "The month's own days", FIXED_26: '26 days' };

export const PAYROLL_RUN_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'PAID'] as const;
export type PayrollRunStatus = (typeof PAYROLL_RUN_STATUSES)[number];
export const PAYROLL_RUN_STATUS_LABELS: Record<PayrollRunStatus, string> = { DRAFT: 'Draft', SUBMITTED: 'Waiting for approval', APPROVED: 'Approved, to pay', PAID: 'Paid' };

export const PAYSLIP_LINE_KINDS = ['EARNING', 'DEDUCTION', 'EMPLOYER'] as const;
export type PayslipLineKind = (typeof PAYSLIP_LINE_KINDS)[number];

export const STAFF_LOAN_KINDS = ['LOAN', 'ADVANCE'] as const;
export type StaffLoanKind = (typeof STAFF_LOAN_KINDS)[number];
export const STAFF_LOAN_KIND_LABELS: Record<StaffLoanKind, string> = { LOAN: 'Loan', ADVANCE: 'Salary advance' };

export const SETTLEMENT_STATUSES = ['DRAFT', 'APPROVED', 'PAID'] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];
export const SETTLEMENT_STATUS_LABELS: Record<SettlementStatus, string> = { DRAFT: 'Draft', APPROVED: 'Approved, to pay', PAID: 'Paid' };

/** The lines a payslip can carry, in the order they print. */
export const PAYSLIP_CODES = {
  BASIC: { kind: 'EARNING', label: 'Basic' },
  DA: { kind: 'EARNING', label: 'Dearness allowance' },
  HRA: { kind: 'EARNING', label: 'House rent allowance' },
  CONVEYANCE: { kind: 'EARNING', label: 'Conveyance' },
  SPECIAL: { kind: 'EARNING', label: 'Special allowance' },
  OTHER: { kind: 'EARNING', label: 'Other allowances' },
  OVERTIME: { kind: 'EARNING', label: 'Overtime' },
  ARREARS: { kind: 'EARNING', label: 'Arrears' },
  BONUS: { kind: 'EARNING', label: 'Bonus or incentive' },
  OTHER_EARNING: { kind: 'EARNING', label: 'Other earning' },
  PF: { kind: 'DEDUCTION', label: 'Provident fund' },
  ESI: { kind: 'DEDUCTION', label: 'ESI' },
  PT: { kind: 'DEDUCTION', label: 'Professional tax' },
  TDS: { kind: 'DEDUCTION', label: 'Income tax (TDS)' },
  LOAN: { kind: 'DEDUCTION', label: 'Loan instalment' },
  ADVANCE: { kind: 'DEDUCTION', label: 'Advance recovered' },
  OTHER_DEDUCTION: { kind: 'DEDUCTION', label: 'Other deduction' },
  PF_EMPLOYER: { kind: 'EMPLOYER', label: 'Employer PF (EPF)' },
  EPS_EMPLOYER: { kind: 'EMPLOYER', label: 'Employer pension (EPS)' },
  ESI_EMPLOYER: { kind: 'EMPLOYER', label: 'Employer ESI' },
} as const satisfies Record<string, { kind: PayslipLineKind; label: string }>;
export type PayslipCode = keyof typeof PAYSLIP_CODES;
/** What HR may add to a payslip by hand. */
export const MANUAL_PAYSLIP_CODES = ['ARREARS', 'BONUS', 'OTHER_EARNING', 'OTHER_DEDUCTION'] as const satisfies readonly PayslipCode[];
export type ManualPayslipCode = (typeof MANUAL_PAYSLIP_CODES)[number];

/**
 * Professional tax a month by state (GST state code), on the month's gross. Each slab is [gross up to, tax]; the last has
 * no limit. `lastMonth` is the higher amount some states take in one month so the year comes to ₹2,500; `women` is a
 * state's own slabs for women. States not listed charge none.
 */
export interface PtRule {
  slabs: [number | null, number][];
  women?: [number | null, number][];
  /** Month (1-12) the higher amount is taken, and that amount, for the top slab */
  lastMonth?: { month: number; amount: number };
}
export const PT_RULES: Record<string, PtRule> = {
  /** Odisha: ₹1,60,000 a year free, ₹125 to ₹3,00,000, ₹200 above (₹300 in March) */
  '21': { slabs: [[13333, 0], [25000, 125], [null, 200]], lastMonth: { month: 3, amount: 300 } },
  /** Maharashtra */
  '27': { slabs: [[7500, 0], [10000, 175], [null, 200]], women: [[25000, 0], [null, 200]], lastMonth: { month: 2, amount: 300 } },
  /** Karnataka */
  '29': { slabs: [[24999, 0], [null, 200]], lastMonth: { month: 2, amount: 300 } },
  /** West Bengal */
  '19': { slabs: [[10000, 0], [15000, 110], [25000, 130], [40000, 150], [null, 200]] },
  /** Andhra Pradesh */
  '37': { slabs: [[15000, 0], [20000, 150], [null, 200]] },
  /** Telangana */
  '36': { slabs: [[15000, 0], [20000, 150], [null, 200]] },
  /** Gujarat */
  '24': { slabs: [[11999, 0], [null, 200]] },
  /** Madhya Pradesh */
  '23': { slabs: [[18750, 0], [25000, 125], [33333, 167], [null, 208]], lastMonth: { month: 3, amount: 212 } },
  /** Assam */
  '18': { slabs: [[15000, 0], [25000, 180], [null, 208]] },
};

/** Professional tax for a month's gross (rupees), for the state and month (1-12). */
export function professionalTax(state: string | null | undefined, gross: number, month: number, gender?: Gender | null): number {
  const rule = state ? PT_RULES[state] : undefined;
  if (!rule) return 0;
  const slabs = gender === 'FEMALE' && rule.women ? rule.women : rule.slabs;
  const i = slabs.findIndex(([upTo]) => upTo === null || gross <= upTo);
  const tax = slabs[i]?.[1] ?? 0;
  const top = i === slabs.length - 1 && tax > 0;
  return top && rule.lastMonth && rule.lastMonth.month === month ? rule.lastMonth.amount : tax;
}

export interface PayrollSettingsDto {
  pfEmployeePct: string;
  pfEmployerPct: string;
  epsPct: string;
  pfWageCeiling: string;
  pfCapAtCeiling: boolean;
  esiEmployeePct: string;
  esiEmployerPct: string;
  esiGrossCeiling: string;
  ptState: string | null;
  paidDaysBasis: PaidDaysBasis;
  overtimeMultiplier: string;
  debitAccountNo: string | null;
  debitBankName: string | null;
}

export interface SalaryStructureDto {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  effectiveFrom: string;
  basic: string;
  da: string;
  hra: string;
  conveyance: string;
  special: string;
  otherEarnings: string;
  /** Monthly gross, all of the above */
  gross: string;
  /** Monthly employee PF and ESI, and the employer's, at full attendance */
  employeePf: string;
  employerPf: string;
  employeeEsi: string;
  employerEsi: string;
  /** Gross plus the employer's PF and ESI, a year */
  ctcAnnual: string;
  pf: boolean;
  esi: boolean;
  pt: boolean;
  taxRegime: TaxRegime;
  declaredDeductions: string;
  otherIncome: string;
  /** TDS a month, projected evenly over the year */
  monthlyTds: string;
  note: string | null;
  createdByName: string;
  createdAt: string;
}

export interface StaffLoanDto {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  kind: StaffLoanKind;
  issuedOn: string;
  amount: string;
  emi: string;
  startMonth: string;
  /** Recovered in approved or paid runs (and settlement) */
  recovered: string;
  balance: string;
  note: string | null;
  createdByName: string;
  createdAt: string;
}

export interface PayslipLineDto {
  id: string;
  kind: PayslipLineKind;
  code: string;
  label: string;
  amount: string;
  manual: boolean;
}

export interface PayslipDto {
  id: string;
  runId: string;
  runNo: string;
  month: string;
  status: PayrollRunStatus;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  designation: string;
  projectName: string | null;
  pan: string | null;
  uan: string | null;
  esiNumber: string | null;
  bankName: string | null;
  bankAccountNo: string | null;
  bankIfsc: string | null;
  monthDays: string;
  paidDays: string;
  lopDays: string;
  overtimeHours: string;
  gross: string;
  deductions: string;
  net: string;
  employerCost: string;
  pfWages: string;
  esiWages: string;
  lines: PayslipLineDto[];
}

export interface PayrollRunDto {
  id: string;
  runNo: string;
  month: string;
  projectId: string | null;
  projectName: string | null;
  status: PayrollRunStatus;
  employees: number;
  gross: string;
  deductions: string;
  net: string;
  employerCost: string;
  preparedByName: string;
  submittedAt: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  reviewNote: string | null;
  paidOn: string | null;
  paymentRef: string | null;
  paidByName: string | null;
  createdAt: string;
  /** What the caller may do now */
  can: { edit: boolean; submit: boolean; approve: boolean; pay: boolean; remove: boolean };
}

export interface PayrollRunDetailDto extends PayrollRunDto {
  payslips: PayslipDto[];
  /** On the rolls but left out, and why (no salary structure) */
  skipped: { employeeId: string; employeeCode: string; fullName: string; reason: string }[];
}

export interface FinalSettlementDto {
  id: string;
  settlementNo: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  designation: string;
  joinedOn: string | null;
  lastWorkingDay: string;
  status: SettlementStatus;
  salaryDays: string;
  salary: string;
  leaveDays: string;
  leaveEncashment: string;
  serviceYears: string;
  gratuity: string;
  noticeShortDays: number;
  noticeRecovery: string;
  loanRecovery: string;
  otherEarnings: string;
  otherDeductions: string;
  net: string;
  note: string | null;
  preparedByName: string;
  approvedByName: string | null;
  approvedAt: string | null;
  paidOn: string | null;
  paymentRef: string | null;
  createdAt: string;
  can: { edit: boolean; approve: boolean; pay: boolean };
}
