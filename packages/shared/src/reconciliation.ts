/**
 * Material reconciliation: what the work done should have used against what the store issued to site.
 *
 * A norm says how much of a store item one unit of a BOQ item uses (8.2 bags of cement per cum of M25, say) and how
 * much wastage over that is allowed. Theoretical consumption = approved progress on the BOQ item × the norm, summed
 * over the BOQ items that use the item. Consumed = issued to site − returned from site. Transfers to other projects,
 * returns to the supplier and stock adjustments are not consumption.
 *
 * Rate analysis adds the labour and machine hours one unit takes (`BoqResource`), so the estimate can build
 * each BOQ item's rate from its resources at current rates. A starter library of common items is at the end.
 */
import type { BoqResourceKind, EquipmentRateUnit, StockAdjustmentReason } from './enums';
import { DAYS_PER_MONTH } from './cost';
import type { ActivityNormDto, FrontFlag } from './stock-against-dpr';

/** Consumption this far below theoretical is flagged too: progress may be over-reported or issues not recorded. */
export const RECONCILIATION_UNDER_PCT = 5;

export const RECONCILIATION_STATUSES = ['OVER', 'UNDER', 'WITHIN', 'NO_WORK'] as const;
export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number];

export const RECONCILIATION_STATUS_LABELS: Record<ReconciliationStatus, string> = {
  OVER: 'Over allowance',
  UNDER: 'Below theoretical',
  WITHIN: 'Within allowance',
  NO_WORK: 'No work yet',
};

/** What each status asks someone to do, for the page's legend and tooltips. */
export const RECONCILIATION_STATUS_HINTS: Record<ReconciliationStatus, string> = {
  OVER: 'More was used than the work allows, wastage included. Check for wastage, theft or issues booked to the wrong project.',
  UNDER: `Less was used than the work needs (by more than ${RECONCILIATION_UNDER_PCT}%). Check that progress is not over-reported and that every issue is recorded.`,
  WITHIN: 'Consumption is within the norm and its wastage allowance.',
  NO_WORK: 'No approved progress and nothing consumed yet.',
};

export interface MaterialNormDto {
  id: string;
  boqItemId: string;
  boqItemNo: string;
  boqDescription: string;
  boqUnit: string;
  itemId: string;
  itemName: string;
  itemUnit: string;
  /** Item units per unit of the BOQ item, up to six decimals */
  qtyPerUnit: string;
  /** Allowed wastage in % */
  wastagePct: string;
  note: string | null;
  updatedByName: string | null;
  updatedAt: string;
}

/** One BOQ item's (or, for an activity's own norm, one activity's) share of an item's theoretical consumption. */
export interface ReconciliationLineDto {
  normId: string;
  /** null on an activity's own norm */
  boqItemId: string | null;
  activityId: string | null;
  /** The BOQ item number, or the activity's component code */
  itemNo: string;
  /** The BOQ item's description, or the activity's name */
  description: string;
  unit: string;
  executedQty: string;
  qtyPerUnit: string;
  wastagePct: string;
  theoreticalQty: string;
}

export interface ReconciliationItemDto {
  itemId: string;
  itemName: string;
  unit: string;
  /** Item rate; null when there is none or the viewer may not see cost */
  rate: string | null;
  theoreticalQty: string;
  /** Theoretical plus the allowed wastage */
  allowedQty: string;
  issuedQty: string;
  returnedQty: string;
  /** Issued − returned */
  consumedQty: string;
  /** Consumed − theoretical (positive = used more) */
  varianceQty: string;
  /** Variance over theoretical in %, one decimal; null with no theoretical quantity */
  variancePct: number | null;
  status: ReconciliationStatus;
  /** Consumed beyond the allowed quantity (0 when within) */
  excessQty: string;
  /** excessQty × rate; null without a rate or for viewers without cost */
  excessValue: string | null;
  lines: ReconciliationLineDto[];
  /** The store's book for the period: before it, received in it (receipts and transfers in) and after it */
  openingQty: string;
  receivedQty: string;
  closingQty: string;
  /** What approved DPR lines in the period say they used */
  usedQty: string;
  /** Approved DPR line quantities × the norms: what those lines should have used */
  neededQty: string;
  /** Needed plus the norms' wastage */
  neededAllowedQty: string;
  /** Used − needed, and in % of needed (one decimal; null with nothing needed) */
  usedVarianceQty: string;
  usedVariancePct: number | null;
  /** Used against needed; null when no DPR in the period reports material */
  usedStatus: ReconciliationStatus | null;
  /**
   * Should be lying at the work front at the period's end: issued − returned from a week before the first DPR that
   * reported material, less all the DPRs say was used since; null until a DPR reports material
   */
  atFrontQty: string | null;
  front: FrontFlag | null;
}

/** An item issued to site that no norm covers, so it cannot be reconciled yet. */
export interface UnreconciledItemDto {
  itemId: string;
  itemName: string;
  unit: string;
  consumedQty: string;
  /** Used per approved DPR lines in the period */
  usedQty: string;
  atFrontQty: string | null;
  front: FrontFlag | null;
}

export interface ProjectReconciliationDto {
  projectId: string;
  projectCode: string;
  projectName: string;
  /** Period (inclusive); null from = since the start, to = up to today */
  from: string | null;
  to: string;
  items: ReconciliationItemDto[];
  unreconciled: UnreconciledItemDto[];
  norms: MaterialNormDto[];
  /** Norms set on activities, for work with no BOQ item of its own */
  activityNorms: ActivityNormDto[];
  /** BOQ items with approved progress in the period and no norm */
  boqItemsWithoutNorm: number;
  /** The first day a DPR line reported material: the work front counts from it (issues from a week before) */
  frontFrom: string | null;
  /** Items issued and never reported used, and used beyond what was issued */
  notReportedCount: number;
  usedNotIssuedCount: number;
  overCount: number;
  underCount: number;
  /** Total excess value; null for viewers without cost */
  excessValue: string | null;
  canEditNorms: boolean;
  canSeeValues: boolean;
}

/** A material over its allowance by at least this % of the allowed quantity goes on the watch list. */
export const MATERIAL_OVERUSE_MIN_PCT = 3;

/** One labour or machine line of a BOQ item's rate analysis. */
export interface BoqResourceDto {
  id: string;
  boqItemId: string;
  kind: BoqResourceKind;
  /** The trade or the equipment category */
  name: string;
  /** Man-days or machine hours per unit of the BOQ item, up to six decimals */
  qtyPerUnit: string;
  note: string | null;
  updatedByName: string | null;
  updatedAt: string;
}

/** The unit a resource is counted in. */
export const BOQ_RESOURCE_UNITS: Record<BoqResourceKind, string> = { LABOUR: 'day', EQUIPMENT: 'hour' };

/** Hours a machine works in a day, to price day and month hire rates by the hour. */
export const HOURS_PER_SHIFT = 8;

/** An equipment rate as a rate per working hour. */
export function equipmentHourlyRate(rate: number, unit: EquipmentRateUnit): number {
  if (unit === 'HOUR') return rate;
  if (unit === 'DAY') return rate / HOURS_PER_SHIFT;
  return rate / DAYS_PER_MONTH / HOURS_PER_SHIFT;
}

export type EstimateLineKind = 'MATERIAL' | BoqResourceKind;

/** One line of a BOQ item's built-up rate: a material norm, a trade or a machine category. */
export interface EstimateLineDto {
  kind: EstimateLineKind;
  /** The norm's or the resource's id */
  id: string;
  /** Store items only */
  itemId: string | null;
  name: string;
  unit: string;
  qtyPerUnit: string;
  /** Materials only */
  wastagePct: string | null;
  /** Per unit of the BOQ item, wastage included */
  quantity: string;
  /** Item rate, labour daily rate or machine hourly rate; null when none is set, or for viewers without cost */
  rate: string | null;
  amount: string | null;
  note: string | null;
}

export interface EstimateItemDto {
  boqItemId: string;
  itemNo: string;
  description: string;
  unit: string;
  /** Revised quantity, or the original */
  quantity: string;
  lines: EstimateLineDto[];
  /** The rest are null for viewers without cost */
  boqRate: string | null;
  material: string | null;
  labour: string | null;
  equipment: string | null;
  /** material + labour + equipment, per unit */
  cost: string | null;
  overheads: string | null;
  profit: string | null;
  /** cost + overheads + profit, per unit; null with no rate analysis */
  builtUpRate: string | null;
  /** BOQ rate − built-up rate; negative when the BOQ rate does not cover it */
  margin: string | null;
  /** margin over the BOQ rate in %, one decimal */
  marginPct: number | null;
  /** Lines the estimate could not price */
  unpriced: number;
}

export interface ProjectEstimateDto {
  projectId: string;
  projectCode: string;
  projectName: string;
  overheadPct: string;
  profitPct: string;
  items: EstimateItemDto[];
  /** Items with at least one line of rate analysis */
  analysedCount: number;
  /** Over the analysed items: BOQ amount and the amount at built-up rates (null without cost) */
  boqAmount: string | null;
  estimateAmount: string | null;
  /** Trades with a labour rate and the company's equipment categories, to pick resources from */
  labourCategories: string[];
  equipmentCategories: string[];
  canEdit: boolean;
  canSeeValues: boolean;
}

/** What a rate-analysis copy, library entry or Excel import did. */
export interface RateAnalysisResultDto {
  added: number;
  updated: number;
  /** Lines left out, with why ("Sand: no store item matches") */
  skipped: string[];
}

/** One material of a subcontractor's reconciliation, line by BOQ item. */
export interface SubconMaterialLineDto {
  boqItemNo: string;
  description: string;
  unit: string;
  measuredQty: string;
  qtyPerUnit: string;
  wastagePct: string;
  theoreticalQty: string;
}

export interface SubconMaterialDto {
  itemId: string;
  itemName: string;
  unit: string;
  rate: string | null;
  theoreticalQty: string;
  allowedQty: string;
  /** Issued to their work order */
  issuedQty: string;
  varianceQty: string;
  variancePct: number | null;
  status: ReconciliationStatus;
  excessQty: string;
  excessValue: string | null;
  /** Already raised for recovery (not cancelled) */
  recoveredQty: string;
  /** Excess not yet raised for recovery */
  toRecoverQty: string;
  lines: SubconMaterialLineDto[];
}

export interface ExcessRecoveryDto {
  id: string;
  workOrderId: string;
  itemId: string;
  itemName: string;
  unit: string;
  quantity: string;
  rate: string;
  amount: string;
  note: string | null;
  /** The bill that takes it off; null until the next bill is prepared or re-saved */
  billId: string | null;
  billLabel: string | null;
  billStatus: string | null;
  createdByName: string;
  createdAt: string;
  /** Until the bill that takes it is approved */
  canCancel: boolean;
}

export interface SubconReconciliationDto {
  workOrderId: string;
  woNo: string;
  title: string;
  vendorName: string;
  closed: boolean;
  /** The bill being prepared on the work order, which a new recovery joins */
  openBill: { id: string; label: string; status: string } | null;
  items: SubconMaterialDto[];
  overCount: number;
  /** Excess not yet raised, at item rates; null without cost */
  toRecoverValue: string | null;
  recoveries: ExcessRecoveryDto[];
}

/** Material issued to each subcontractor against what their measured work should have taken, since the start. */
export interface ProjectSubconReconciliationDto {
  projectId: string;
  workOrders: SubconReconciliationDto[];
  canRecover: boolean;
  canSeeValues: boolean;
}

export interface WastageRowDto {
  /** null for adjustments made before reasons were asked */
  reason: StockAdjustmentReason | null;
  itemId: string;
  itemName: string;
  unit: string;
  /** Taken off stock (as a positive quantity) and added to it */
  lostQty: string;
  gainedQty: string;
  rate: string | null;
  /** lost × rate; null without a rate or cost */
  lostValue: string | null;
  entries: number;
}

export interface WastageReasonDto {
  reason: StockAdjustmentReason | null;
  lostValue: string | null;
  entries: number;
}

/** Stock adjustments in a period by reason and item, opening stock left out. */
export interface WastageReportDto {
  projectId: string;
  from: string | null;
  to: string;
  rows: WastageRowDto[];
  byReason: WastageReasonDto[];
  lostValue: string | null;
  canSeeValues: boolean;
}

// Starter library

/** A material of a library entry: any word set in `match` found in a store item's name picks it, if its unit agrees. */
export interface RateLibraryMaterial {
  label: string;
  match: string[][];
  unit: string;
  qtyPerUnit: number;
  wastagePct: number;
}

export interface RateLibraryResource {
  kind: BoqResourceKind;
  name: string;
  qtyPerUnit: number;
  note?: string;
}

export interface RateLibraryEntry {
  key: string;
  name: string;
  unit: string;
  /** Word sets that suggest the entry for a BOQ item's description */
  match: string[][];
  materials: RateLibraryMaterial[];
  resources: RateLibraryResource[];
}

const CEMENT = (qty: number): RateLibraryMaterial => ({ label: 'Cement', match: [['cement']], unit: 'bag', qtyPerUnit: qty, wastagePct: 2 });
const SAND = (qty: number): RateLibraryMaterial => ({ label: 'Sand', match: [['sand']], unit: 'cum', qtyPerUnit: qty, wastagePct: 5 });
const AGG20 = (qty: number): RateLibraryMaterial => ({ label: 'Coarse aggregate 20 mm', match: [['aggregate', '20'], ['metal', '20']], unit: 'cum', qtyPerUnit: qty, wastagePct: 3 });
const CONCRETE_GANG = (mason: number, helper: number, mixer: number): RateLibraryResource[] => [
  { kind: 'LABOUR', name: 'Mason', qtyPerUnit: mason },
  { kind: 'LABOUR', name: 'Helper', qtyPerUnit: helper },
  { kind: 'EQUIPMENT', name: 'Concreting', qtyPerUnit: mixer, note: 'Mixer and vibrator' },
];
const rcc = (grade: string, cement: number, sand: number, agg: number): RateLibraryEntry => ({
  key: `RCC_${grade}`,
  name: `RCC ${grade} (concrete only)`,
  unit: 'cum',
  match: [['rcc', grade.toLowerCase()], [grade.toLowerCase()]],
  materials: [CEMENT(cement), SAND(sand), AGG20(agg)],
  resources: CONCRETE_GANG(0.25, 2.5, 0.8),
});

/**
 * Starting figures for common items, per unit, to be checked against the company's own rate analysis (or the CPWD
 * DAR it follows). Shuttering and reinforcement are items of their own. Labour names are trades as in labour rates;
 * machine names are equipment categories.
 */
export const RATE_LIBRARY: RateLibraryEntry[] = [
  {
    key: 'PCC_148',
    name: 'PCC 1:4:8 (M7.5)',
    unit: 'cum',
    match: [['pcc', '1:4:8'], ['m7.5'], ['lean', 'concrete']],
    materials: [CEMENT(3.4), SAND(0.47), { label: 'Coarse aggregate 40 mm', match: [['aggregate', '40'], ['metal', '40']], unit: 'cum', qtyPerUnit: 0.94, wastagePct: 3 }],
    resources: CONCRETE_GANG(0.17, 2, 0.4),
  },
  { key: 'PCC_124', name: 'PCC 1:2:4 (M15)', unit: 'cum', match: [['pcc', '1:2:4'], ['m15']], materials: [CEMENT(6.34), SAND(0.44), AGG20(0.88)], resources: CONCRETE_GANG(0.17, 2, 0.4) },
  rcc('M20', 8.06, 0.42, 0.84),
  rcc('M25', 8.2, 0.41, 0.83),
  rcc('M30', 8.8, 0.4, 0.8),
  {
    key: 'STEEL',
    name: 'Reinforcement steel, cut, bent and placed',
    unit: 'MT',
    match: [['reinforcement'], ['tmt'], ['steel', 'bar']],
    materials: [
      { label: 'Reinforcement steel', match: [['tmt'], ['steel'], ['reinforcement']], unit: 'MT', qtyPerUnit: 1, wastagePct: 3 },
      { label: 'Binding wire', match: [['binding', 'wire']], unit: 'kg', qtyPerUnit: 10, wastagePct: 5 },
    ],
    resources: [
      { kind: 'LABOUR', name: 'Bar Bender', qtyPerUnit: 7 },
      { kind: 'LABOUR', name: 'Helper', qtyPerUnit: 7 },
    ],
  },
  {
    key: 'BRICK_16',
    name: 'Brick masonry in CM 1:6',
    unit: 'cum',
    match: [['brick']],
    materials: [{ label: 'Bricks', match: [['brick']], unit: 'nos', qtyPerUnit: 500, wastagePct: 3 }, CEMENT(1.25), SAND(0.28)],
    resources: [
      { kind: 'LABOUR', name: 'Mason', qtyPerUnit: 0.75 },
      { kind: 'LABOUR', name: 'Helper', qtyPerUnit: 1.75 },
    ],
  },
  {
    key: 'PLASTER_12',
    name: 'Cement plaster 12 mm in CM 1:6',
    unit: 'sqm',
    match: [['plaster']],
    materials: [CEMENT(0.07), SAND(0.017)],
    resources: [
      { kind: 'LABOUR', name: 'Mason', qtyPerUnit: 0.065 },
      { kind: 'LABOUR', name: 'Helper', qtyPerUnit: 0.08 },
    ],
  },
  {
    key: 'WBM',
    name: 'Water bound macadam, grading II',
    unit: 'cum',
    match: [['wbm'], ['water', 'bound']],
    materials: [
      { label: 'Stone aggregate 63-45 mm', match: [['aggregate', '63'], ['metal', '63'], ['stone', 'aggregate']], unit: 'cum', qtyPerUnit: 1.21, wastagePct: 3 },
      { label: 'Screenings', match: [['screening']], unit: 'cum', qtyPerUnit: 0.3, wastagePct: 3 },
    ],
    resources: [
      { kind: 'LABOUR', name: 'Helper', qtyPerUnit: 0.6 },
      { kind: 'EQUIPMENT', name: 'Compaction', qtyPerUnit: 0.12, note: 'Roller' },
    ],
  },
  {
    key: 'GSB',
    name: 'Granular sub-base',
    unit: 'cum',
    match: [['gsb'], ['granular', 'sub']],
    materials: [{ label: 'GSB material', match: [['gsb'], ['granular']], unit: 'cum', qtyPerUnit: 1.25, wastagePct: 3 }],
    resources: [
      { kind: 'LABOUR', name: 'Helper', qtyPerUnit: 0.1 },
      { kind: 'EQUIPMENT', name: 'Earthmoving', qtyPerUnit: 0.03, note: 'Grader' },
      { kind: 'EQUIPMENT', name: 'Compaction', qtyPerUnit: 0.06, note: 'Roller' },
    ],
  },
  {
    key: 'DBM',
    name: 'Dense bituminous macadam',
    unit: 'MT',
    match: [['dbm'], ['dense', 'bituminous']],
    materials: [
      { label: 'Bitumen', match: [['bitumen']], unit: 'MT', qtyPerUnit: 0.045, wastagePct: 1 },
      { label: 'Aggregate', match: [['aggregate', '20'], ['aggregate']], unit: 'cum', qtyPerUnit: 0.62, wastagePct: 3 },
    ],
    resources: [
      { kind: 'LABOUR', name: 'Helper', qtyPerUnit: 0.15 },
      { kind: 'EQUIPMENT', name: 'Paving', qtyPerUnit: 0.02, note: 'Hot mix plant and paver' },
      { kind: 'EQUIPMENT', name: 'Compaction', qtyPerUnit: 0.03, note: 'Rollers' },
    ],
  },
  {
    key: 'PIPE',
    name: 'Pipe lowering, laying and jointing',
    unit: 'm',
    match: [['pipe'], ['hdpe'], ['laying', 'main']],
    materials: [{ label: 'Pipe', match: [['pipe'], ['hdpe']], unit: 'm', qtyPerUnit: 1, wastagePct: 1 }],
    resources: [
      { kind: 'LABOUR', name: 'Plumber', qtyPerUnit: 0.03 },
      { kind: 'LABOUR', name: 'Helper', qtyPerUnit: 0.06 },
      { kind: 'EQUIPMENT', name: 'Earthmoving', qtyPerUnit: 0.02, note: 'Backhoe for lowering' },
    ],
  },
];

const UNIT_ALIASES: Record<string, string> = {
  m3: 'cum', cum: 'cum', cubicmetre: 'cum', cubicmeter: 'cum', cumt: 'cum',
  m2: 'sqm', sqm: 'sqm', sqmt: 'sqm', squaremetre: 'sqm', squaremeter: 'sqm',
  m: 'm', rmt: 'm', rm: 'm', mtr: 'm', metre: 'm', meter: 'm', runningmetre: 'm', lm: 'm',
  mt: 't', t: 't', tonne: 't', ton: 't', tonnes: 't', tons: 't',
  kg: 'kg', kgs: 'kg', l: 'l', ltr: 'l', litre: 'l', liter: 'l', bag: 'bag', bags: 'bag',
  no: 'no', nos: 'no', number: 'no', numbers: 'no', each: 'no', pcs: 'no', pc: 'no',
};

/** Whether two units name the same thing ("Bags" and "bag", "Rmt" and "m", "Cum" and "m3"). */
export function sameUnit(a: string, b: string): boolean {
  const key = (u: string) => {
    const k = u.toLowerCase().replace(/[^a-z0-9]/g, '');
    return UNIT_ALIASES[k] ?? UNIT_ALIASES[k.replace(/s$/, '')] ?? k;
  };
  return key(a) === key(b);
}

const hasWords = (text: string, sets: string[][]) => {
  const t = text.toLowerCase();
  return sets.some((words) => words.every((w) => t.includes(w)));
};

/** The library entry a BOQ item's description and unit suggest, if any. */
export function suggestRateLibrary(description: string, unit: string): RateLibraryEntry | null {
  return RATE_LIBRARY.find((e) => sameUnit(e.unit, unit) && hasWords(description, e.match)) ?? RATE_LIBRARY.find((e) => hasWords(description, e.match)) ?? null;
}

/**
 * The store item a library material picks: one whose name has a word set and whose unit agrees, preferring the most
 * words in common with the BOQ item's description (so a 400 mm pipe item picks the 400 mm pipe), then the shortest name.
 */
export function pickLibraryItem<T extends { name: string; unit: string }>(m: RateLibraryMaterial, items: T[], description: string): { item: T | null; wrongUnit: T | null } {
  const named = items.filter((i) => hasWords(i.name, m.match));
  const words = new Set(description.toLowerCase().split(/[^a-z0-9.:]+/).filter((w) => w.length > 1));
  const score = (i: T) => i.name.toLowerCase().split(/[^a-z0-9.:]+/).filter((w) => words.has(w)).length;
  const fit = named.filter((i) => sameUnit(i.unit, m.unit)).sort((a, b) => score(b) - score(a) || a.name.length - b.name.length);
  return { item: fit[0] ?? null, wrongUnit: fit.length ? null : (named[0] ?? null) };
}

// The standard norms library

/** One material the library would set on a BOQ item, and the master item it lands on. */
export interface StandardNormMaterialDto {
  /** The store item as the library names it */
  item: string;
  unit: string;
  qtyPerUnit: string;
  wastagePct: string;
  /** The item master's own item, or null when adopting would add it */
  itemId: string | null;
  itemName: string | null;
}

/** One BOQ item the library recognises, and what it would be given. */
export interface StandardNormMatchDto {
  boqItemId: string;
  itemNo: string;
  description: string;
  unit: string;
  normKey: string;
  normLabel: string;
  note: string;
  /** It already has norms of its own, so adopting leaves it alone unless it is told to replace them */
  hasNorms: boolean;
  materials: StandardNormMaterialDto[];
}

/** What adopting the library would do to a project, before anything is written. */
export interface StandardNormPlanDto {
  projectId: string;
  matches: StandardNormMatchDto[];
  /** BOQ items the library does not recognise, which stay for the quantity surveyor */
  unmatchedCount: number;
  /** Store items adopting would add to the item master, by name */
  newItems: { name: string; unit: string }[];
  /** Whether this user may adopt them */
  canAdopt: boolean;
}

/** What adopting actually did. */
export interface StandardNormResultDto {
  /** BOQ items given norms */
  boqItems: number;
  /** Norms written, new and changed together */
  norms: number;
  /** Store items added to the master */
  newItems: number;
  /** BOQ items left alone because they already had norms */
  skipped: number;
}
