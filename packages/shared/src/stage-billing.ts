/**
 * Stage billing for lump-sum contracts (item 129, ARCHITECTURE "Stage billing"): the billing break-up (components with
 * their share of the lump sum, each paid in stages), the built-in stages per kind of component, the milestone grid and
 * its slippage tiers, and what an RA bill shows for each stage.
 */
import type { BillingBasis, StageTrigger, WorkElementType } from './enums';

export const BILLING_BASIS_LABELS: Record<BillingBasis, string> = {
  STAGES: 'Stages of its share',
  UNIT_RATE: 'Unit rates × tender factor',
};

export const STAGE_TRIGGER_LABELS: Record<StageTrigger, string> = {
  EVENT: 'On a dated event',
  PROGRESS: 'Pro rata to progress',
  SUPPLY: 'Pro rata to supply',
  TEST: 'Pro rata to testing',
};

export const STAGE_TRIGGER_HINTS: Record<StageTrigger, string> = {
  EVENT: 'Paid in full once the event is recorded with its date and the certificate or letter that says so',
  PROGRESS: 'The approved physical % of the activities it names (of the whole component when it names none)',
  SUPPLY: 'Pipe or equipment received at site against the scope; pipe bought by weight is turned into metres',
  TEST: 'Pipe tested against its length on the pipe network; without a network, the progress of its test activities',
};

/** A built-in payment stage: its % of the component, what moves it and, for PROGRESS and TEST, the names of the activities it reads. */
export interface StageTemplate {
  name: string;
  pct: number;
  trigger: StageTrigger;
  /** Top-level activity names (from the component's activity template) it reads; matched from the start of the name */
  activities?: string[];
}

const DESIGN: StageTemplate = { name: 'Design and drawings approved', pct: 5, trigger: 'EVENT' };
const TRIAL_RUN: StageTemplate = { name: 'Trial run of three months', pct: 5, trigger: 'EVENT' };

const TANK_UNIT: StageTemplate[] = [
  DESIGN,
  { name: 'Excavation and foundation', pct: 15, trigger: 'PROGRESS', activities: ['Excavation', 'PCC', 'Raft'] },
  { name: 'Walls', pct: 30, trigger: 'PROGRESS', activities: ['Walls'] },
  { name: 'Roof, launders and channels', pct: 15, trigger: 'PROGRESS', activities: ['Roof slab', 'Launders and channels'] },
  { name: 'Mechanism, pipes and valves', pct: 20, trigger: 'PROGRESS', activities: ['Mechanism and equipment', 'Pipes and valves'] },
  { name: 'Water test and finishing', pct: 10, trigger: 'PROGRESS', activities: ['Water-tightness test', 'Plaster, paint and finishing'] },
  TRIAL_RUN,
];

const PIPELINE: StageTemplate[] = [
  { name: 'Design and alignment approved', pct: 5, trigger: 'EVENT' },
  { name: 'Pipes supplied', pct: 55, trigger: 'SUPPLY' },
  {
    name: 'Laid and jointed',
    pct: 25,
    trigger: 'PROGRESS',
    activities: ['Trench excavation', 'Bedding', 'Pipe lowering, laying and jointing', 'Valves, specials and chambers', 'Backfilling and compaction', 'Road restoration over the trench', 'Thrust blocks and anchors'],
  },
  { name: 'Hydraulic test', pct: 10, trigger: 'TEST', activities: ['Hydraulic testing'] },
  { name: 'Trial run', pct: 5, trigger: 'EVENT' },
];

const GENERAL: StageTemplate[] = [DESIGN, { name: 'Works', pct: 90, trigger: 'PROGRESS' }, { name: 'Completion', pct: 5, trigger: 'EVENT' }];

/**
 * The usual state tender pattern by kind of component; every stage can be changed per project. A tank pays 5% on design,
 * 10% excavation, 10% foundation, 20% staging, 10% lower dome, 10% walls, 10% top dome, 10% pipes and valves, 10%
 * finishing and water test and 5% three months after; a pipeline 5% design, 55% on supply, 25% laid, 10% tested, 5% trial run.
 */
export const STAGE_TEMPLATES: Record<WorkElementType, StageTemplate[]> = {
  OHT: [
    DESIGN,
    { name: 'Excavation', pct: 10, trigger: 'PROGRESS', activities: ['Excavation'] },
    { name: 'Foundation', pct: 10, trigger: 'PROGRESS', activities: ['PCC and raft'] },
    { name: 'Staging', pct: 20, trigger: 'PROGRESS', activities: ['Staging', 'Bottom ring beam'] },
    { name: 'Lower dome', pct: 10, trigger: 'PROGRESS', activities: ['Conical wall and lower dome'] },
    { name: 'Container walls', pct: 10, trigger: 'PROGRESS', activities: ['Container wall'] },
    { name: 'Top dome', pct: 10, trigger: 'PROGRESS', activities: ['Top ring beam and top dome', 'Staircase and gallery'] },
    { name: 'Pipes and valves', pct: 10, trigger: 'PROGRESS', activities: ['Pipes and valves'] },
    { name: 'Finishing and water test', pct: 10, trigger: 'PROGRESS', activities: ['Plaster, paint and waterproofing', 'Water-tightness test'] },
    { name: 'Three months after commissioning', pct: 5, trigger: 'EVENT' },
  ],
  SUMP: TANK_UNIT,
  WTP_UNIT: TANK_UNIT,
  STP_UNIT: TANK_UNIT,
  INTAKE_WELL: [
    DESIGN,
    { name: 'Well curb and steining', pct: 30, trigger: 'PROGRESS', activities: ['Cofferdam and sinking island', 'Well curb', 'Steining'] },
    { name: 'Sinking and bottom plug', pct: 20, trigger: 'PROGRESS', activities: ['Sinking to founding level', 'Bottom plug'] },
    { name: 'Top slab and pump house', pct: 20, trigger: 'PROGRESS', activities: ['Top slab', 'Pump house on the well'] },
    { name: 'Approach bridge', pct: 15, trigger: 'PROGRESS', activities: ['Approach bridge'] },
    { name: 'Inlets and finishing', pct: 5, trigger: 'PROGRESS', activities: ['Inlet pipes and screens', 'Painting and finishing'] },
    TRIAL_RUN,
  ],
  PUMP_HOUSE: [
    DESIGN,
    { name: 'Foundation and plinth', pct: 20, trigger: 'PROGRESS', activities: ['Excavation', 'PCC', 'Foundation and plinth'] },
    { name: 'Superstructure', pct: 35, trigger: 'PROGRESS', activities: ['Columns and beams', 'Roof slab', 'Brick masonry'] },
    { name: 'Finishing', pct: 15, trigger: 'PROGRESS', activities: ['Plaster and paint', 'Doors, windows and flooring'] },
    { name: 'Pumps and motors erected', pct: 20, trigger: 'PROGRESS', activities: ['Pumps and motors erected'] },
    TRIAL_RUN,
  ],
  RISING_MAIN: PIPELINE,
  FEEDER_MAIN: PIPELINE,
  PIPE_ZONE: PIPELINE,
  EM_PACKAGE: [
    { name: 'Design and quality plan approved', pct: 5, trigger: 'EVENT' },
    { name: 'Supplied to site', pct: 55, trigger: 'PROGRESS', activities: ['Manufacture and inspection', 'Supplied to site'] },
    { name: 'Erected', pct: 20, trigger: 'PROGRESS', activities: ['Erection'] },
    { name: 'Tested and commissioned', pct: 15, trigger: 'PROGRESS', activities: ['Testing and commissioning'] },
    TRIAL_RUN,
  ],
  HT_FEEDER: [
    { name: 'Survey and approval', pct: 5, trigger: 'EVENT' },
    { name: 'Poles and conductor', pct: 55, trigger: 'PROGRESS', activities: ['Poles erected', 'Conductor strung'] },
    { name: 'Transformer and substation', pct: 25, trigger: 'PROGRESS', activities: ['Transformer and substation'] },
    { name: 'Tested and charged', pct: 15, trigger: 'PROGRESS', activities: ['Testing and charging'] },
  ],
  APPROACH_BRIDGE: GENERAL,
  WTP: GENERAL,
  HOUSE_CONNECTIONS: GENERAL,
  ROAD_RESTORATION: GENERAL,
  BLOCK: GENERAL,
  FLOOR: GENERAL,
  ROAD_STRETCH: GENERAL,
  CROSSING: GENERAL,
  GENERAL,
};

/** Kinds of component the standard break-up pays by measured quantities at the unit rates, outside the lump sum's shares. */
export const UNIT_RATE_ELEMENT_TYPES: WorkElementType[] = ['HOUSE_CONNECTIONS', 'ROAD_RESTORATION', 'HT_FEEDER'];

/** Withholding for milestone slippage when the contract gives no tiers of its own: behind by 0–25% of the target, 2.5% of the work not done, and so on. */
export const DEFAULT_SLIPPAGE_TIERS: { fromPct: number; toPct: number | null; withheldPct: number }[] = [
  { fromPct: 0, toPct: 25, withheldPct: 2.5 },
  { fromPct: 25, toPct: 50, withheldPct: 5 },
  { fromPct: 50, toPct: 75, withheldPct: 7.5 },
  { fromPct: 75, toPct: null, withheldPct: 10 },
];

/** The mobilisation advance is usually recovered from 10% of the contract executed and finished by 80%. */
export const ADVANCE_WINDOW_DEFAULT = { fromPct: 10, toPct: 80 };

// ---------------------------------------------------------------------------------------------------------------------
// What the API serves

export interface BillingStageDto {
  id: string;
  componentId: string;
  name: string;
  pct: string;
  trigger: StageTrigger;
  activityIds: string[];
  /** The named activities, for the editor and the hint */
  activityNames: string[];
  itemIds: string[];
  itemNames: string[];
  scopeQty: string | null;
  achievedOn: string | null;
  evidence: string | null;
  /** Lump sum × the component's share × the stage's % */
  value: string;
  /** What the evidence gives today, % of the stage, and what it read */
  evidencePct: number;
  evidenceText: string;
  /** Certified (else claimed) on approved bills so far, % of the stage */
  billedPct: number;
}

export interface BillingComponentDto {
  id: string;
  parentId: string | null;
  code: string;
  name: string;
  sharePct: string | null;
  basis: BillingBasis;
  workElementId: string | null;
  workElementLabel: string | null;
  /** Share of the lump sum after its parent's (a sub-component), % */
  effectiveSharePct: number;
  /** Its value: lump sum × its effective share (stages components only) */
  value: string | null;
  /** Billed on approved bills, % of its value (stages) */
  billedPct: number;
  stages: BillingStageDto[];
}

export interface SlippageTierDto {
  fromPct: string;
  toPct: string | null;
  withheldPct: string;
}

export interface MilestoneRowDto {
  componentId: string;
  code: string;
  name: string;
  /** Cumulative target by the end of each month of `months`, % of the component's value; null where none is set */
  targets: (number | null)[];
  /** Billed up to the end of each month (approved bills by their measurements date), % of its value; null for months to come */
  actual: (number | null)[];
}

export interface BillingBreakupDto {
  projectId: string;
  /** Lump-sum projects bill by stages once their break-up has components */
  stageBilling: boolean;
  contractModel: 'ITEM_RATE' | 'LUMP_SUM' | 'EPC';
  /** The lump sum the components share (the contract value when not set) */
  lumpSum: string | null;
  lumpSumSet: boolean;
  tenderFactor: string;
  advanceRecoveryFromPct: string | null;
  advanceRecoveryToPct: string | null;
  components: BillingComponentDto[];
  /** What keeps the break-up from adding up, in words ("The components' shares make 98.5%, not 100%") */
  problems: string[];
  tiers: SlippageTierDto[];
  /** True while the tiers are the defaults, not the contract's own */
  defaultTiers: boolean;
  /** First days of the months of the grid, YYYY-MM-DD, from the start to the completion date */
  months: string[];
  grid: MilestoneRowDto[];
  /** Any RA bill on the project: the standard break-up can then no longer replace one that bills have used */
  hasBills: boolean;
  /** Components and stages (those who prepare bills) */
  canEdit: boolean;
  /** Terms, the milestone grid and the tiers (those who change the contract) */
  canEditTerms: boolean;
}

/** One payment stage on an RA bill. */
export interface RaBillStageLineDto {
  id: string;
  stageId: string;
  componentCode: string;
  componentName: string;
  stageName: string;
  trigger: StageTrigger;
  /** Stage's % of its component, and its value */
  stagePct: string;
  stageValue: string;
  prevPct: string;
  suggestedPct: string;
  thisPct: string;
  uptoPct: string;
  claimedByHand: boolean;
  note: string | null;
  certifiedPct: string | null;
  prevAmount: string;
  amount: string;
  evidenceText: string;
}

/** The milestone slippage behind an RA bill's withholding, per component behind its target. */
export interface SlippageLineDto {
  componentId: string;
  code: string;
  name: string;
  targetPct: number;
  actualPct: number;
  /** Behind the target by this % of it */
  behindPct: number;
  tierPct: number;
  withheld: string;
}
