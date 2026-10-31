/**
 * Operation and maintenance (item 131, ARCHITECTURE "Operation and maintenance"): the years of running a water scheme
 * after its handover. The contract pays each year as a % of the contract value in instalments (an O&M bill each), less
 * the pay of staff short of the minimum and the penalties for service levels missed beyond what a month allows. The
 * arithmetic is in `apps/api/src/om/om-rules.ts`.
 */

/** The service level benchmarks an O&M contract holds the operator to. */
export const OM_BENCHMARKS = ['LPCD', 'CHLORINE', 'PRESSURE', 'WATER_LOSS', 'COMPLAINTS', 'PUMP_EFFICIENCY'] as const;
export type OmBenchmark = (typeof OM_BENCHMARKS)[number];

export interface OmBenchmarkInfo {
  label: string;
  /** Short name for a table column or a tag */
  short: string;
  unit: string;
  /** MIN: a reading below the limit fails; MAX: above it fails */
  direction: 'MIN' | 'MAX';
  /** DAY: each day's reading is checked; MONTH: the month's figure is, once */
  basis: 'DAY' | 'MONTH';
  help: string;
  /** The usual terms: the limit, failures a month allows, and the penalty in rupees for each failure beyond */
  limit: string;
  allowedPerMonth: number;
  penalty: string;
}

export const OM_BENCHMARK_INFO: Record<OmBenchmark, OmBenchmarkInfo> = {
  LPCD: {
    label: 'Water supplied per person',
    short: 'Supply',
    unit: 'lpcd',
    direction: 'MIN',
    basis: 'DAY',
    help: 'Litres a person a day: water supplied ÷ the population served.',
    limit: '135',
    allowedPerMonth: 2,
    penalty: '5000',
  },
  CHLORINE: {
    label: 'Residual chlorine at the tail end',
    short: 'Chlorine',
    unit: 'mg/l',
    direction: 'MIN',
    basis: 'DAY',
    help: 'Measured at the farthest tap of the network.',
    limit: '0.2',
    allowedPerMonth: 0,
    penalty: '10000',
  },
  PRESSURE: {
    label: 'Pressure at the tail end',
    short: 'Pressure',
    unit: 'm',
    direction: 'MIN',
    basis: 'DAY',
    help: 'Metres of water at the farthest point of the network during supply hours.',
    limit: '7',
    allowedPerMonth: 1,
    penalty: '5000',
  },
  WATER_LOSS: {
    label: 'Water not accounted for',
    short: 'Water lost',
    unit: '%',
    direction: 'MAX',
    basis: 'MONTH',
    help: 'Water produced in the month that did not reach consumers, as a % of what was produced.',
    limit: '20',
    allowedPerMonth: 0,
    penalty: '25000',
  },
  COMPLAINTS: {
    label: 'Complaints closed within 48 hours',
    short: 'Complaints',
    unit: '%',
    direction: 'MIN',
    basis: 'MONTH',
    help: 'Of the month’s complaints, the share put right within 48 hours.',
    limit: '95',
    allowedPerMonth: 0,
    penalty: '10000',
  },
  PUMP_EFFICIENCY: {
    label: 'Pump efficiency',
    short: 'Pumps',
    unit: '%',
    direction: 'MIN',
    basis: 'MONTH',
    help: 'The month’s average of the pump set efficiency readings.',
    limit: '60',
    allowedPerMonth: 0,
    penalty: '10000',
  },
};

/** One benchmark as an O&M contract sets it. */
export interface OmBenchmarkSetting {
  key: OmBenchmark;
  limit: string;
  allowedPerMonth: number;
  /** Rupees for each failure beyond the allowed count in a month */
  penalty: string;
}

export const DEFAULT_OM_BENCHMARKS: OmBenchmarkSetting[] = OM_BENCHMARKS.map((key) => ({
  key,
  limit: OM_BENCHMARK_INFO[key].limit,
  allowedPerMonth: OM_BENCHMARK_INFO[key].allowedPerMonth,
  penalty: OM_BENCHMARK_INFO[key].penalty,
}));

/** "135 lpcd", "0.2 mg/l", "20%" */
export const omLimitText = (key: OmBenchmark, limit: string | number) => {
  const u = OM_BENCHMARK_INFO[key].unit;
  return u === '%' ? `${Number(limit)}%` : `${Number(limit)} ${u}`;
};

/** "at least 135 lpcd", "at most 20%" */
export const omRuleText = (key: OmBenchmark, limit: string | number) => `${OM_BENCHMARK_INFO[key].direction === 'MIN' ? 'at least' : 'at most'} ${omLimitText(key, limit)}`;

// ---------------------------------------------------------------------------------------------------------------------
// What the project's O&M tab reads

export interface OmStaffNormDto {
  role: string;
  required: number;
  /** Rupees a month; a month short of the minimum is deducted at it, per person short */
  monthlyPay: string;
}

export interface OmChemicalNormDto {
  itemId: string;
  itemName: string;
  unit: string;
  /** Quantity in the item's unit per million litres treated */
  perMl: string;
}

export interface OmContractDto {
  id: string;
  startOn: string;
  /** The last day of the last O&M year (extension years not counted) */
  endsOn: string;
  years: number;
  /** % of the contract value paid each year, year 1 first */
  yearPcts: string[];
  instalmentsPerYear: number;
  extensionYears: number;
  population: number;
  /** The contract value the years' % are of; null when the project has none */
  contractValue: string | null;
  benchmarks: OmBenchmarkSetting[];
  staff: OmStaffNormDto[];
  chemicals: OmChemicalNormDto[];
  note: string | null;
}

export interface ServiceLevelDayDto {
  id: string;
  date: string;
  producedKl: string;
  suppliedKl: string;
  /** Supplied × 1000 ÷ population, one decimal */
  lpcd: number | null;
  /** (Produced − supplied) ÷ produced, %, one decimal */
  lossPct: number | null;
  residualChlorine: string | null;
  tailPressureM: string | null;
  complaintsReceived: number;
  complaintsClosed48h: number;
  pumpEfficiencyPct: string | null;
  note: string | null;
  /** The day benchmarks the reading misses */
  failures: OmBenchmark[];
  enteredByName: string;
  /** In a period already billed: it can no longer change */
  locked: boolean;
}

export interface OmBenchmarkMonthDto {
  key: OmBenchmark;
  limit: string;
  /** Days that missed (DAY), or 1 when the month's figure missed (MONTH) */
  failures: number;
  allowed: number;
  /** Failures beyond the allowed count, each one penalised */
  penalised: number;
  penalty: string;
  /** The month's figure for a MONTH benchmark (null without readings), the worst day's for a DAY one */
  value: number | null;
  /** The days that missed, for a DAY benchmark */
  days: string[];
}

export interface OmStaffLineDto {
  role: string;
  required: number;
  /** null when the month's deployment has not been recorded */
  deployed: number | null;
  short: number;
  /** Short × monthly pay, rupees */
  deduction: string;
}

export interface OmMonthDto {
  /** YYYY-MM */
  month: string;
  /** Days of the month inside the O&M period, up to today */
  dueDays: number;
  loggedDays: number;
  /** Days due with no reading (no penalty, but the client will ask) */
  missingDays: string[];
  benchmarks: OmBenchmarkMonthDto[];
  penalty: string;
  staff: OmStaffLineDto[];
  staffDeduction: string;
  staffRecorded: boolean;
}

export type OmPeriodStatus = 'FUTURE' | 'RUNNING' | 'DUE' | 'BILLED';
export const OM_PERIOD_STATUS_LABELS: Record<OmPeriodStatus, string> = { FUTURE: 'Not started', RUNNING: 'Running', DUE: 'Due to bill', BILLED: 'Billed' };

export interface OmPeriodDto {
  year: number;
  /** 1 to instalments per year */
  instalment: number;
  /** "Year 2, quarter 3" */
  label: string;
  from: string;
  to: string;
  /** The instalment before any deduction, rupees */
  amount: string;
  /** What the period's months add up to so far (the bill's own figures once billed) */
  staffDeduction: string;
  penalty: string;
  /** Instalment − staff deduction − penalty */
  net: string;
  status: OmPeriodStatus;
  billId: string | null;
  billNo: number | null;
  billLabel: string | null;
  /** The bill's state in words: "Draft", "Approved", "Certified", "Paid" */
  billState: string | null;
}

export interface OmChemicalRowDto {
  itemId: string;
  itemName: string;
  unit: string;
  perMl: string;
  /** Water produced in the period, million litres */
  producedMl: string;
  /** perMl × producedMl */
  normQty: string;
  /** Issued less returned in the period (the reconciliation's consumed quantity) */
  consumedQty: string;
  /** Consumed against the norm, %, one decimal; null with no norm quantity */
  variancePct: number | null;
  status: OmChemicalState;
}

export type OmChemicalState = 'OVER' | 'UNDER' | 'WITHIN' | 'NO_WATER';
export const OM_CHEMICAL_STATE_LABELS: Record<OmChemicalState, string> = { OVER: 'Over the norm', UNDER: 'Under the norm', WITHIN: 'Within the norm', NO_WATER: 'No water logged' };

export interface OmDto {
  projectId: string;
  /** The completion date of the handover certificate; null before handover */
  handedOverOn: string | null;
  contract: OmContractDto | null;
  today: string;
  /** The O&M period today falls in; null before the start or after the end */
  current: { year: number; instalment: number; label: string } | null;
  /** The month the log shows (YYYY-MM) */
  month: string;
  months: OmMonthDto[];
  days: ServiceLevelDayDto[];
  periods: OmPeriodDto[];
  /** The chemicals over the shown month */
  chemicals: OmChemicalRowDto[];
  canManage: boolean;
  canLog: boolean;
  canRecordStaff: boolean;
  canBill: boolean;
}

/** Tolerance either side of a chemical's norm before it is called over or under, %. */
export const OM_CHEMICAL_TOLERANCE_PCT = 10;

/** What an O&M bill shows of the period behind it (`RaBillDto.om`). */
export interface OmBillDto {
  year: number;
  instalment: number;
  /** "Year 2, quarter 2" */
  label: string;
  from: string;
  to: string;
  /** The year's % of the contract value */
  yearPct: string;
  /** The instalment before deductions */
  instalmentAmount: string;
  /** Pay of staff short of the minimum, taken off the instalment */
  staffDeduction: string;
  /** Service level penalties, deducted like the client's other recoveries */
  penalty: string;
  staff: { month: string; role: string; required: number; deployed: number; short: number; deduction: string }[];
  penalties: { month: string; key: OmBenchmark; failures: number; allowed: number; penalised: number; amount: string }[];
  missingDays: number;
  staffNotRecorded: string[];
}
