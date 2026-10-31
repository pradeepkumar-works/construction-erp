import type { ContractModel, ProjectType, RoleKey, WorkLocation } from './enums';
import { sectorKinds } from './sector';
import { canFreezeBaseline, canViewContract, canViewCost, canViewReconciliation } from './permissions';

/**
 * Setting up a new project (finding 6 of the October review): the steps a project needs before the site starts
 * entering work, each ticked from the records themselves; the standard contract terms a new project starts with; and
 * the check that the BOQ adds up to roughly the contract value. Pure, tested in `apps/api/src/scripts/project-setup-test.ts`.
 */

/** Bill deductions a new project starts with when its client has no terms of its own: government works keep a security
 *  deposit of 5 % from each RA bill and no retention apart from it. */
export const STANDARD_TERMS = { retentionPct: '0', securityDepositPct: '5', tdsPct: '2', gstTdsPct: '2', labourCessPct: '1', gstRate: '18' } as const;

/** A client's usual terms (the client master): percentages a new project of theirs starts with, and two periods. */
export const CLIENT_TERM_PERCENTS = ['retentionPct', 'securityDepositPct', 'tdsPct', 'gstTdsPct', 'labourCessPct', 'gstRate'] as const;
export type ClientTermPercent = (typeof CLIENT_TERM_PERCENTS)[number];
export interface ClientTerms {
  retentionPct: string | null;
  securityDepositPct: string | null;
  tdsPct: string | null;
  gstTdsPct: string | null;
  labourCessPct: string | null;
  gstRate: string | null;
  defectLiabilityMonths: number | null;
  clientPaymentDays: number | null;
}

/** The terms a new project starts with: the client's where it has them, the standard ones for the rest. */
export function termsFor(client: Partial<ClientTerms> | null): Record<ClientTermPercent, string> & { defectLiabilityMonths: number | null; clientPaymentDays: number | null } {
  const pick = (k: ClientTermPercent) => client?.[k] ?? STANDARD_TERMS[k];
  return {
    retentionPct: pick('retentionPct'),
    securityDepositPct: pick('securityDepositPct'),
    tdsPct: pick('tdsPct'),
    gstTdsPct: pick('gstTdsPct'),
    labourCessPct: pick('labourCessPct'),
    gstRate: pick('gstRate'),
    defectLiabilityMonths: client?.defectLiabilityMonths ?? null,
    clientPaymentDays: client?.clientPaymentDays ?? null,
  };
}

/** What "copy from a project" takes besides the team: the contract terms that are not the contract's own figures. */
export const COPIED_TERMS = [
  'retentionPct',
  'securityDepositPct',
  'advanceRecoveryPct',
  'tdsPct',
  'gstTdsPct',
  'labourCessPct',
  'gstRate',
  'defectLiabilityMonths',
  'clientPaymentDays',
  'noticeDays',
  'measureTolerancePct',
  'priceVariation',
  'ldRatePct',
  'ldPeriod',
  'ldCapPct',
] as const;

/** An item-rate BOQ more than this far, in %, from the contract value is flagged: usual tender premiums stay inside it. */
export const BOQ_GAP_PCT = 15;

export interface BoqContractGap {
  boqTotal: number;
  contractValue: number;
  /** (BOQ total − contract value) ÷ contract value, whole %; negative when the BOQ is short */
  gapPct: number;
}

/**
 * Whether an item-rate project's BOQ adds up to far from its contract value, which makes every figure built on the BOQ
 * (work done, earned value, the budget) wrong. Lump sum and EPC contracts are priced by their stages, so they are left out.
 */
export function boqContractGap(f: { boqTotal: number; contractValue: number | null; contractModel: ContractModel }): BoqContractGap | null {
  if (f.contractModel !== 'ITEM_RATE' || !f.contractValue || f.contractValue <= 0 || f.boqTotal <= 0) return null;
  const gapPct = Math.round(((f.boqTotal - f.contractValue) / f.contractValue) * 100);
  return Math.abs(gapPct) > BOQ_GAP_PCT ? { boqTotal: f.boqTotal, contractValue: f.contractValue, gapPct } : null;
}

export const SETUP_STEPS = ['team', 'dates', 'boq', 'activities', 'boqLinks', 'schedule', 'baseline', 'contract', 'budget', 'sector', 'norms'] as const;
export type SetupStepKey = (typeof SETUP_STEPS)[number];

/** The project tab each step is done on (`?tab=`); the team is on the Overview itself. */
export const SETUP_STEP_TAB: Record<SetupStepKey, string> = {
  team: 'overview',
  dates: 'contract',
  boq: 'boq',
  activities: 'activities',
  boqLinks: 'activities',
  schedule: 'schedule',
  baseline: 'schedule',
  contract: 'contract',
  budget: 'budget',
  sector: 'sector',
  norms: 'reconciliation',
};

/** Steps that only some roles can do: the rest of the team does not see them. */
const STEP_ACCESS: Partial<Record<SetupStepKey, (role: RoleKey) => boolean>> = {
  dates: canViewContract,
  contract: canViewContract,
  budget: canViewCost,
  baseline: canFreezeBaseline,
  norms: canViewReconciliation,
};

export interface ProjectSetupFacts {
  type: ProjectType;
  /** Where its type locates work (item 134); the built-in kind's places when left out */
  locations?: WorkLocation[];
  contractModel: ContractModel;
  /** People on the project besides its project manager */
  team: number;
  startDate: string | null;
  endDate: string | null;
  contractValue: number | null;
  boqItems: number;
  boqTotal: number;
  /** BOQ items with a quantity that no activity is linked to, so work on them is not counted */
  boqItemsWithoutActivity: number;
  activities: number;
  /** Activities with no sub-activities that have no planned start or finish */
  activitiesUndated: number;
  baselineAt: string | null;
  agreementNo: string | null;
  budgetSet: boolean;
  /** The chainage, floors or villages the sector view needs */
  sectorSet: boolean;
  norms: number;
}

export interface SetupStepDto {
  key: SetupStepKey;
  done: boolean;
  tab: string;
  /** What is left, counted: people, BOQ items without an activity, activities without dates */
  count: number | null;
}

export interface ProjectSetupDto {
  /** Stores and plants have no site setup; a project someone hid the checklist on, or a finished one, shows none */
  show: boolean;
  steps: SetupStepDto[];
  done: number;
  total: number;
  boqGap: BoqContractGap | null;
}

/** A store or an RMC plant is set up differently; it has no setup checklist. */
export const setupApplies = (type: ProjectType) => type !== 'STORE' && type !== 'PLANT';

/** A project is new, and shows its checklist, until this much of its work is done. */
export const SETUP_UNTIL_PROGRESS_PCT = 10;

/** Whether the Overview shows the checklist: a new, open project of a kind that has one, not hidden, with steps left. */
export function setupShown(f: { type: ProjectType; status: string; physicalProgressPct: number; hidden: boolean; done: number; total: number }): boolean {
  return setupApplies(f.type) && (f.status === 'PLANNED' || f.status === 'ACTIVE') && f.physicalProgressPct < SETUP_UNTIL_PROGRESS_PCT && !f.hidden && f.done < f.total;
}

/**
 * The sector view a project sets up: villages where its type locates work by village, else floors, else chainage
 * (item 134: from its type's places; a road or a sewer line chainage, a building floors, water supply villages).
 */
export const sectorStepOf = (p: ProjectType | { type: ProjectType; locations?: WorkLocation[] | null }): 'chainage' | 'floors' | 'villages' | null => {
  const k = sectorKinds(p);
  return k.village ? 'villages' : k.floor ? 'floors' : k.chainage ? 'chainage' : null;
};

/** The steps the role sees, in order, each ticked from the facts. */
export function setupSteps(f: ProjectSetupFacts, role: RoleKey): SetupStepDto[] {
  const done: Record<SetupStepKey, [boolean, number | null]> = {
    team: [f.team > 0, f.team],
    dates: [!!f.startDate && !!f.endDate && !!f.contractValue, null],
    boq: [f.boqItems > 0 && !boqContractGap(f), f.boqItems],
    activities: [f.activities > 0, f.activities],
    boqLinks: [f.boqItems > 0 && f.activities > 0 && f.boqItemsWithoutActivity === 0, f.boqItemsWithoutActivity],
    schedule: [f.activities > 0 && f.activitiesUndated === 0, f.activitiesUndated],
    baseline: [!!f.baselineAt, null],
    contract: [!!f.agreementNo, null],
    budget: [f.budgetSet, null],
    sector: [f.sectorSet, null],
    norms: [f.norms > 0, f.norms],
  };
  return SETUP_STEPS.filter((k) => (k !== 'sector' || sectorStepOf(f)) && (STEP_ACCESS[k]?.(role) ?? true)).map((key) => ({
    key,
    done: done[key][0],
    tab: SETUP_STEP_TAB[key],
    count: done[key][1],
  }));
}
