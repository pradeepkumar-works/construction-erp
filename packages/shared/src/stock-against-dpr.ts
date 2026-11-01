/**
 * Stock against the DPR: the reconciliation's views beside Materials. The DPR's work lines say what they used;
 * issued less returned less used is what should be lying at the work front; the work done × the norms is what the lines
 * should have used. Per structure (component × material), per pipe size (zone × diameter and material), per
 * house-connection kit, and a list of the day-to-day exceptions. Arithmetic in apps/api/src/reconciliation/reconciliation-rules.ts.
 */
import type { PipeMaterial } from './enums';
import { PIPE_MATERIAL_LABELS } from './labels';
import type { ReconciliationStatus } from './reconciliation';

/** What the work front says about an item: used on DPRs beyond what was issued, or issued and never reported as used. */
export const FRONT_FLAGS = ['USED_NOT_ISSUED', 'NOT_REPORTED'] as const;
export type FrontFlag = (typeof FRONT_FLAGS)[number];
export const FRONT_FLAG_LABELS: Record<FrontFlag, string> = {
  USED_NOT_ISSUED: 'Used, not issued',
  NOT_REPORTED: 'Issued, not reported used',
};
export const FRONT_FLAG_HINTS: Record<FrontFlag, string> = {
  USED_NOT_ISSUED: 'The DPRs say more was used than the store issued. An issue may not be entered, or the DPR overstates use.',
  NOT_REPORTED: 'The store issued it but no DPR line says it was used. Ask the site engineer to report it on the lines.',
};

/** A norm on an activity: store item per unit of the activity's own work, for work with no BOQ item of its own. */
export interface ActivityNormDto {
  id: string;
  activityId: string;
  activityName: string;
  activityUnit: string;
  /** Component › sub-component the activity sits in */
  elementLabel: string | null;
  itemId: string;
  itemName: string;
  itemUnit: string;
  qtyPerUnit: string;
  wastagePct: string;
  note: string | null;
  updatedByName: string | null;
  updatedAt: string;
}

// Pipe sizes

/** Words that make an item a fitting, not pipe, though its name carries a size. */
const FITTING_WORDS = /\b(tee|bend|elbow|reducer|coupler|coupling|flange|saddle|valve|cap|adaptor|adapter|ferrule|collar|socket|union|spigot|plug|clamp|gasket|ring|stub|tail|tapping|meter|kit|joint)s?\b/i;

const MATERIAL_WORDS: [RegExp, PipeMaterial][] = [
  [/\bmdpe\b/i, 'MDPE'],
  [/\bhdpe\b|\bpe ?100\b|\bpe ?80\b/i, 'HDPE'],
  [/\bdi\b|\bductile\b|\bk ?[79]\b/i, 'DI'],
  [/\bci\b|\bcast iron\b/i, 'CI'],
  [/\bms\b|\bmild steel\b|\bsteel pipe\b/i, 'MS'],
  [/\bu?pvc\b/i, 'PVC'],
  [/\bgrp\b|\bfrp\b/i, 'GRP'],
];

/**
 * The size an item lays as: its own fields when set, else read from its name ("HDPE PE100 110mm PN6" is HDPE 110 mm,
 * "DI K7 pipe DN 250" is DI 250 mm). Fittings and anything without both a material and a size are not pipe.
 */
export function pipeSizeOf(item: { name: string; pipeDiameterMm?: number | null; pipeMaterial?: PipeMaterial | null }): { diameterMm: number; material: PipeMaterial } | null {
  if (item.pipeDiameterMm && item.pipeMaterial) return { diameterMm: item.pipeDiameterMm, material: item.pipeMaterial };
  const name = item.name;
  if (FITTING_WORDS.test(name)) return null;
  const material = item.pipeMaterial ?? MATERIAL_WORDS.find(([re]) => re.test(name))?.[1] ?? null;
  const size = item.pipeDiameterMm ?? Number(/(\d{2,4})\s*mm\b/i.exec(name)?.[1] ?? /\bdn\s*(\d{2,4})\b/i.exec(name)?.[1] ?? /\b(\d{2,4})\s*(?:od|nb|dia)\b/i.exec(name)?.[1] ?? NaN);
  if (!material || !Number.isFinite(size) || size < 15 || size > 4000) return null;
  return { diameterMm: size, material };
}

export const pipeSizeLabel = (s: { diameterMm: number; material: PipeMaterial }) => `${PIPE_MATERIAL_LABELS[s.material]} ${s.diameterMm} mm`;

/**
 * An item's quantity in metres of pipe: metres as they are, kilograms and tonnes through the item's weight per metre.
 * null when the unit is neither or the weight is missing.
 */
export function pipeMetres(qty: number, unit: string, kgPerMetre: number | null | undefined): number | null {
  const u = unit.toLowerCase().replace(/[^a-z]/g, '');
  if (['m', 'mtr', 'mtrs', 'metre', 'metres', 'meter', 'meters', 'rm', 'rmt', 'lm', 'runningmetre', 'rmtr'].includes(u)) return qty;
  if (!kgPerMetre || kgPerMetre <= 0) return null;
  if (['kg', 'kgs', 'kilogram', 'kilograms'].includes(u)) return qty / kgPerMetre;
  if (['t', 'mt', 'tonne', 'tonnes', 'ton', 'tons'].includes(u)) return (qty * 1000) / kgPerMetre;
  return null;
}

/** Cut wastage allowed on pipe by material, % of the metres laid (pipe comes in lengths; cuts at bends and fittings are lost). */
export const PIPE_CUT_WASTAGE_PCT: Record<PipeMaterial, number> = { HDPE: 1.5, MDPE: 2, DI: 1, CI: 1, MS: 1, PVC: 2, GRP: 1, OTHER: 2 };

// Report shapes

/** One material of one component or sub-component: what its work needs, what its DPR lines used and what was issued to it. */
export interface StructureItemDto {
  itemId: string;
  itemName: string;
  unit: string;
  /** The activities' planned quantity × the norms: the whole structure's need */
  designQty: string;
  /** Approved DPR line quantities in the period × the norms */
  neededQty: string;
  allowedQty: string;
  /** Used per the approved DPR lines in the period */
  usedQty: string;
  /** Issued to this element or its activities in the period, less returns */
  issuedQty: string;
  /** Should still be at the structure: issued to it from a week before the first DPR that reported material, less all used since; null before */
  atFrontQty: string | null;
  /** Used − needed in % of needed; null with nothing needed */
  variancePct: number | null;
  status: ReconciliationStatus;
  lines: StructureLineDto[];
}

/** One activity's share: its approved DPR quantity, the norm, and the use achieved per unit (bags per m³, say). */
export interface StructureLineDto {
  activityId: string;
  activityName: string;
  unit: string;
  plannedQty: string;
  /** Approved on DPR lines in the period */
  placedQty: string;
  qtyPerUnit: string;
  wastagePct: string;
  usedQty: string;
  /** Used ÷ placed, six decimals; null with nothing placed or nothing reported used */
  achievedPerUnit: string | null;
}

export interface StructureElementDto {
  elementId: string;
  code: string;
  name: string;
  /** Component › sub-component */
  label: string;
  items: StructureItemDto[];
  overCount: number;
}

export interface ProjectStructureReconDto {
  projectId: string;
  projectCode: string;
  from: string | null;
  to: string;
  elements: StructureElementDto[];
  /** Issues in the period not tied to a component or an activity: they count in Materials but not here */
  untiedIssues: number;
}

export const PIPE_FLAGS = ['LAID_ABOVE_ISSUED', 'WASTAGE_ABOVE'] as const;
export type PipeFlag = (typeof PIPE_FLAGS)[number];
export const PIPE_FLAG_LABELS: Record<PipeFlag, string> = {
  LAID_ABOVE_ISSUED: 'Laid above issued',
  WASTAGE_ABOVE: 'Wastage above allowed',
};
export const PIPE_FLAG_HINTS: Record<PipeFlag, string> = {
  LAID_ABOVE_ISSUED: 'More pipe is in the ground than the store issued. An issue may be missing or booked to another zone.',
  WASTAGE_ABOVE: 'The DPR lines used more pipe per metre laid than the cut wastage allowed for the material.',
};

/** One pipe size, over the project or in one zone. Metres throughout; pipe bought by weight is turned into metres. */
export interface PipeReconRowDto {
  key: string;
  diameterMm: number;
  material: PipeMaterial;
  label: string;
  /** Proposed length in the network */
  scopeM: number;
  /** Project row: on the project's approved purchase orders; null on a zone row */
  orderedM: number | null;
  /** Project row: received at site (receipts and transfers in, less returns to the supplier) */
  receivedM: number | null;
  /** Issued (to the zone, on a zone row) less returned from site */
  issuedM: number;
  /** Project row: book balance in the store */
  inStoreM: number | null;
  laidM: number;
  testedM: number;
  /** Reported used on DPR lines that laid this size, against the metres those lines laid */
  usedM: number;
  laidWithUseM: number;
  /** (used − laid) ÷ laid on those lines, %, one decimal; null with nothing reported */
  wastagePct: number | null;
  allowedWastagePct: number;
  /** Issued − laid − cut wastage: pipe on site not in the ground */
  atSiteM: number;
  balanceToLayM: number;
  /** Project row: scope with the wastage allowed, less what is ordered or received (the larger); null on a zone row */
  balanceToBuyM: number | null;
  flags: PipeFlag[];
}

export interface PipeZoneReconDto {
  zoneId: string;
  code: string;
  label: string;
  rows: PipeReconRowDto[];
  /** Issues to the zone that are not of a pipe size (fittings, specials) are left out; this says whether any issue is tied to it */
  hasIssues: boolean;
}

export interface ProjectPipeReconDto {
  projectId: string;
  projectCode: string;
  to: string;
  sizes: PipeReconRowDto[];
  zones: PipeZoneReconDto[];
  /** Pipe items whose unit cannot be turned into metres (bought by weight with no weight per metre) */
  unconverted: { itemId: string; itemName: string; unit: string }[];
}

export const KIT_STATUSES = ['SHORT', 'OVER', 'OK'] as const;
export type KitStatus = (typeof KIT_STATUSES)[number];
export const KIT_STATUS_LABELS: Record<KitStatus, string> = { SHORT: 'Short', OVER: 'Issued above the work', OK: 'Matches' };

/** One component of a kit: per connection, needed for the connections done, issued and reported used. */
export interface KitComponentDto {
  itemId: string;
  itemName: string;
  unit: string;
  perKit: string;
  wastagePct: string;
  neededQty: string;
  issuedQty: string;
  usedQty: string;
  /** Issued − needed: negative when short */
  differenceQty: string;
  /** Whole kits the shortfall stands for */
  kitsShort: number;
  status: KitStatus;
}

/** A house-connection activity whose norms make a kit (saddle, ferrule, service pipe, valve, elbows). */
export interface KitReconDto {
  activityId: string;
  activityName: string;
  elementLabel: string | null;
  unit: string;
  /** Connections approved, all time */
  doneQty: string;
  plannedQty: string;
  components: KitComponentDto[];
  /** The largest shortfall of any component, in kits */
  kitsShort: number;
}

export interface ProjectKitReconDto {
  projectId: string;
  projectCode: string;
  kits: KitReconDto[];
}

export const RECON_EXCEPTION_KINDS = ['USE_WITHOUT_ISSUE', 'ISSUE_WITHOUT_WORK', 'LAID_ABOVE_ISSUED'] as const;
export type ReconExceptionKind = (typeof RECON_EXCEPTION_KINDS)[number];
export const RECON_EXCEPTION_LABELS: Record<ReconExceptionKind, string> = {
  USE_WITHOUT_ISSUE: 'Used with nothing issued',
  ISSUE_WITHOUT_WORK: 'Issued with no work',
  LAID_ABOVE_ISSUED: 'Pipe laid above issued',
};
/** Days before a use that an issue to the same place may cover it, and days after an issue that work must start. */
export const USE_ISSUE_DAYS = 7;
export const ISSUE_WORK_DAYS = 3;

export interface ReconExceptionDto {
  key: string;
  kind: ReconExceptionKind;
  date: string;
  elementId: string | null;
  elementLabel: string | null;
  itemId: string | null;
  itemName: string | null;
  unit: string | null;
  qty: string | null;
  text: string;
  /** The DPR or stock entry it comes from, to open */
  dprId: string | null;
  entryId: string | null;
  entryNo: string | null;
}

export interface ProjectReconExceptionsDto {
  projectId: string;
  projectCode: string;
  from: string | null;
  to: string;
  rows: ReconExceptionDto[];
  /** Whether any issue in the period names a component or activity; without that only pipe can be checked */
  tiesIssues: boolean;
}
