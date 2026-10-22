/**
 * Earned value of a project (v6 item 115): planned value from the baseline (else the plan) and the BOQ, earned value from
 * approved progress or measured work, actual cost from the project's cost, all at the budget's scale.
 */
export const EV_BASES = ['PROGRESS', 'MEASURED'] as const;
export type EvBasis = (typeof EV_BASES)[number];
export const EV_BASIS_LABELS: Record<EvBasis, string> = { PROGRESS: 'Approved progress', MEASURED: 'Measured work' };

/** Where the budget at completion comes from: the cost-head budget, the BOQ budget rates, or (with neither) the BOQ value. */
export type EvBacSource = 'HEADS' | 'BOQ_BUDGET' | 'BOQ_VALUE';
export const EV_BAC_SOURCE_LABELS: Record<EvBacSource, string> = {
  HEADS: 'the budget by cost head',
  BOQ_BUDGET: 'the BOQ budget rates',
  BOQ_VALUE: 'the BOQ value at contract rates (no budget set)',
};

export interface EarnedValuePointDto {
  /** YYYY-MM; figures are cumulative to its last day (today for this month) */
  month: string;
  pv: string;
  /** Null after this month */
  ev: string | null;
  ac: string | null;
}

export interface EarnedValueActivityDto {
  id: string;
  name: string;
  /** Its share of the budget at completion */
  value: string;
  /** 0 to 100, one decimal */
  plannedPct: number;
  earnedPct: number;
  /** (earned − planned) × value: negative is behind */
  sv: string;
}

export interface EarnedValueDto {
  projectId: string;
  projectCode: string;
  projectName: string;
  today: string;
  basis: EvBasis;
  bacSource: EvBacSource;
  /** Planned value is spread over the baseline dates (BASELINE) or, with no baseline, the planned dates (PLAN) */
  pvSource: 'BASELINE' | 'PLAN';
  start: string | null;
  plannedFinish: string | null;
  bac: string;
  boqValue: string;
  /** BOQ value with no dated activity, spread evenly over the project's dates */
  unscheduledValue: string;
  /** 0 to 100, one decimal */
  plannedPct: number;
  earnedPct: number;
  pv: string;
  ev: string;
  ac: string;
  sv: string;
  cv: string;
  spi: number | null;
  cpi: number | null;
  eac: string | null;
  eacWithSchedule: string | null;
  etc: string | null;
  vac: string | null;
  tcpi: number | null;
  /** Earned schedule: the day the plan had as much done as is done now */
  earnedOn: string | null;
  spiT: number | null;
  forecastFinish: string | null;
  /** Forecast finish against the planned finish: positive is late */
  daysLate: number | null;
  curve: EarnedValuePointDto[];
  /** Behind first */
  activities: EarnedValueActivityDto[];
}
