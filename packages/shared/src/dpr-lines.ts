/**
 * DPR work lines (ARCHITECTURE "Structured DPR"). A DPR's work is a list of lines, each against an activity
 * or sub-activity of the work breakdown, with its location, crew, machines and material. Each line is a progress entry
 * of the DPR: it is submitted, approved and sent back with the DPR. The arithmetic here is pure, so the API, the web
 * and the phone agree on it.
 */
import type { PipeNodeKind, PipeStage, WorkLocation } from './enums';
import type { AttachmentDto, MachineryLine, ManpowerLine } from './types';
import type { DprExtra, DprFormDto } from './dpr-form';

export interface DprMaterialDto {
  itemId: string;
  itemName: string;
  unit: string;
  quantity: string;
}

export interface DprLineDto {
  /** The line's progress entry */
  id: string;
  activityId: string;
  activityName: string;
  /** The activity this is a sub-activity of ("Staging lift 4"), else null */
  parentActivityName: string | null;
  unit: string;
  /** The component and sub-component the activity sits in, else null */
  componentCode: string | null;
  componentName: string | null;
  subComponentCode: string | null;
  subComponentName: string | null;
  quantity: string;
  location: string | null;
  chainageFrom: number | null;
  chainageTo: number | null;
  floor: string | null;
  village: string | null;
  labour: ManpowerLine[];
  machines: MachineryLine[];
  materials: DprMaterialDto[];
  workOrderId: string | null;
  workOrderNo: string | null;
  remarks: string | null;
  /** The pipe stage the activity stands for, and the segment or valve node the line was on */
  pipeStage: PipeStage | null;
  pipeSegmentId: string | null;
  /** "P-27, J-12 to J-13" */
  segmentLabel: string | null;
  segmentDiameterMm: number | null;
  pipeNodeId: string | null;
  nodeCode: string | null;
  /** The activity's planned quantity */
  scope: string;
  /** Approved before this line: other entries up to the DPR's date, and earlier lines of this DPR on the same activity */
  previous: string;
  /** previous + this line */
  cumulative: string;
  /** cumulative ÷ scope, %, to one decimal; null with nothing planned */
  pct: number | null;
  /** scope − cumulative (negative when the work ran over the scope) */
  balance: string;
  /** The line's values of the form's own fields, by key */
  extra: DprExtra;
  /** The line's photo, when the form asks for one */
  attachments: AttachmentDto[];
}

/** A work line as the forms send it. `id` keeps a line's progress entry when the DPR is edited. */
export interface DprLineInput {
  id?: string;
  activityId: string;
  quantity: string;
  location?: string | null;
  chainageFrom?: number | null;
  chainageTo?: number | null;
  floor?: string | null;
  village?: string | null;
  labour?: ManpowerLine[];
  machines?: MachineryLine[];
  materials?: { itemId: string; quantity: string }[];
  workOrderId?: string | null;
  remarks?: string | null;
  /** On a pipe stage activity: the segment worked on, and the valve fixed or the end the work started from */
  pipeSegmentId?: string | null;
  pipeNodeId?: string | null;
  /** Values of the form's own line fields, by key */
  extra?: Record<string, unknown>;
  /** The line's photos (uploaded attachments) */
  attachmentIds?: string[];
}

/** Material one unit of the activity uses: its own norm, else its BOQ item's reconciliation norm. */
export interface DprNormDto {
  itemId: string;
  itemName: string;
  unit: string;
  qtyPerUnit: string;
}

/** An activity a DPR line can be written against: one that takes progress (no sub-activities of its own). */
export interface DprActivityOptionDto {
  id: string;
  name: string;
  parentActivityName: string | null;
  unit: string;
  componentCode: string | null;
  componentName: string | null;
  subComponentCode: string | null;
  subComponentName: string | null;
  plannedQty: string;
  /** Approved so far */
  doneQty: string;
  /** Planned to be worked on within a week of the day (the look-ahead), and not finished: listed first */
  lookAhead: boolean;
  holdPoint: boolean;
  norms: DprNormDto[];
  /** The pipe stage the activity stands for: its lines name a segment of `zoneId` (a valve node for VALVES) */
  pipeStage: PipeStage | null;
  zoneId: string | null;
}

/** A segment a DPR line can be on, with what its stages already hold (approved and waiting) so the form shows what is left. */
export interface DprSegmentOptionDto {
  id: string;
  zoneId: string;
  code: string;
  fromNodeId: string;
  fromCode: string;
  toNodeId: string;
  toCode: string;
  lengthM: string;
  diameterMm: number;
  held: Partial<Record<PipeStage, number>>;
}

export interface DprValveOptionDto {
  id: string;
  zoneId: string;
  code: string;
  kind: PipeNodeKind;
  fixed: boolean;
}

/** What a project's DPR form offers: GET /dpr/work-options. */
export interface DprWorkOptionsDto {
  activities: DprActivityOptionDto[];
  items: { id: string; name: string; unit: string }[];
  workOrders: { id: string; woNo: string; title: string; vendorName: string }[];
  /** The company records progress only as DPR work lines */
  progressFromDpr: boolean;
  /** Proposed pipe segments and valve points of the project's zones and mains */
  segments: DprSegmentOptionDto[];
  valves: DprValveOptionDto[];
  /** The DPR form of the project's type, the version a new report is made on */
  form: DprFormDto;
  /** Where the project's work is located, for a line's chainage, floor or village */
  sector: { locations: WorkLocation[]; chainageStart: number | null; chainageEnd: number | null; floors: string[]; villages: string[] };
}

const num = (s: string | number | null | undefined) => {
  const n = typeof s === 'number' ? s : Number(s ?? 0);
  return Number.isFinite(n) ? n : 0;
};
/** Quantities are kept to three places, as strings (Decimal(18,3)). */
export const qty3 = (n: number) => (Math.round(n * 1000) / 1000).toString();

/** "Staging lift 4 › concrete" (a sub-activity named "Staging lift 4: concrete" too), or the activity's own name. */
export function dprActivityLabel(a: { name: string; parentActivityName: string | null }): string {
  if (!a.parentActivityName) return a.name;
  const prefix = `${a.parentActivityName}: `;
  return `${a.parentActivityName} › ${a.name.startsWith(prefix) ? a.name.slice(prefix.length) : a.name}`;
}

/** "Overhead tanks › OHT-2 450 KL", "Overhead tanks", or "Outside the breakdown". */
export function componentLabel(a: { componentName: string | null; subComponentName: string | null }): string {
  if (!a.componentName) return OUTSIDE_BREAKDOWN;
  return a.subComponentName ? `${a.componentName} › ${a.subComponentName}` : a.componentName;
}
export const OUTSIDE_BREAKDOWN = 'Outside the breakdown';

/**
 * Up to previous, cumulative, % and balance of each line. `previous` is what was approved on the line's activity
 * before the DPR (its other entries up to the DPR's date); two lines of one DPR on the same activity add up in order.
 */
export function lineFigures(
  lines: { activityId: string; quantity: string | number }[],
  scope: Map<string, number>,
  previous: Map<string, number>,
): { previous: string; cumulative: string; pct: number | null; balance: string }[] {
  const running = new Map(previous);
  return lines.map((l) => {
    const before = running.get(l.activityId) ?? 0;
    const cumulative = before + num(l.quantity);
    running.set(l.activityId, cumulative);
    const planned = scope.get(l.activityId) ?? 0;
    return {
      previous: qty3(before),
      cumulative: qty3(cumulative),
      pct: planned > 0 ? Math.round((cumulative / planned) * 1000) / 10 : null,
      balance: qty3(planned - cumulative),
    };
  });
}

/** Material a line's quantity uses by the norms, to three places; nothing for a quantity of 0 or less. */
export function suggestMaterials(quantity: string | number, norms: { itemId: string; qtyPerUnit: string | number }[]): { itemId: string; quantity: string }[] {
  const q = num(quantity);
  if (q <= 0) return [];
  return norms.map((n) => ({ itemId: n.itemId, quantity: qty3(q * num(n.qtyPerUnit)) })).filter((m) => num(m.quantity) > 0);
}

/** Total of a crew. */
export const crewTotal = (labour: ManpowerLine[] | null | undefined) => (labour ?? []).reduce((s, m) => s + Math.max(0, Math.round(num(m.count))), 0);

/**
 * The crew on the lines against the day's head count (the DPR's manpower, from attendance): how many on the lines,
 * how many on site, and the difference (positive when people on site are on no line, negative when the lines name
 * more people than were on site). Null head count when the DPR has none.
 */
export function crewCheck(lines: { labour: ManpowerLine[] | null | undefined }[], headCount: ManpowerLine[] | null | undefined): { onLines: number; headCount: number | null; difference: number | null } {
  const onLines = lines.reduce((s, l) => s + crewTotal(l.labour), 0);
  const total = headCount?.length ? crewTotal(headCount) : null;
  return { onLines, headCount: total, difference: total === null ? null : total - onLines };
}

/** Machine hours on the lines, by machine name, in the order first named. */
export function machineHours(lines: { machines: MachineryLine[] | null | undefined }[]): MachineryLine[] {
  const out = new Map<string, number>();
  for (const l of lines) for (const m of l.machines ?? []) if (m.name?.trim()) out.set(m.name.trim(), (out.get(m.name.trim()) ?? 0) + Math.max(0, num(m.hours)));
  return [...out].map(([name, hours]) => ({ name, hours: Math.round(hours * 100) / 100 }));
}

/** Material used on the lines, added up by item, in the order first used. */
export function materialUsed(lines: { materials: DprMaterialDto[] }[]): DprMaterialDto[] {
  const out = new Map<string, DprMaterialDto>();
  for (const l of lines)
    for (const m of l.materials) {
      const had = out.get(m.itemId);
      out.set(m.itemId, had ? { ...had, quantity: qty3(num(had.quantity) + num(m.quantity)) } : { ...m });
    }
  return [...out.values()];
}

/** Where a line was done, in words: the location, else the chainage, floor or village. */
export function lineLocation(l: { location: string | null; chainageFrom: number | null; chainageTo: number | null; floor: string | null; village: string | null; segmentLabel?: string | null; nodeCode?: string | null }): string | null {
  const pipe = l.segmentLabel ?? l.nodeCode ?? null;
  if (pipe) return l.location?.trim() && !l.location.includes(pipe) ? `${pipe}, ${l.location.trim()}` : pipe;
  if (l.location?.trim()) return l.location.trim();
  if (l.chainageFrom !== null && l.chainageTo !== null) return `Ch ${l.chainageFrom} to ${l.chainageTo} m`;
  return l.floor?.trim() || l.village?.trim() || null;
}

/** "11.5 m³" without trailing zeros. */
const amount = (q: string | number, unit: string) => `${Number(num(q).toFixed(3))} ${unit}`.trim();

/**
 * The DPR's "work executed" written from its lines, for a report that has lines but no text of its own (lists, search
 * and the old print read it): "Staging lift 4 › concrete 11.5 m³ at Lift 4 of 6; Trench 96 m at P-28".
 */
export function workSummary(lines: { activityName: string; parentActivityName: string | null; quantity: string | number; unit: string; location: string | null }[]): string {
  return lines
    .map((l) => `${dprActivityLabel({ name: l.activityName, parentActivityName: l.parentActivityName })} ${amount(l.quantity, l.unit)}${l.location?.trim() ? ` at ${l.location.trim()}` : ''}`)
    .join('; ');
}

/** The summary a DPR writes of its own lines, each where `lineLocation` says (the segment first for pipe work). */
export const linesSummary = (lines: DprLineDto[]) =>
  workSummary(lines.map((l) => ({ activityName: l.activityName, parentActivityName: l.parentActivityName, quantity: l.quantity, unit: l.unit, location: lineLocation(l) })));

/** Lines grouped by component › sub-component, in the order the groups first appear (the record and the print). */
export function groupLines<T extends { componentCode: string | null; componentName: string | null; subComponentCode: string | null; subComponentName: string | null }>(
  lines: T[],
): { key: string; label: string; lines: T[] }[] {
  const groups = new Map<string, { key: string; label: string; lines: T[] }>();
  for (const l of lines) {
    const key = `${l.componentCode ?? ''}/${l.subComponentCode ?? ''}`;
    const g = groups.get(key) ?? { key, label: componentLabel(l), lines: [] };
    g.lines.push(l);
    groups.set(key, g);
  }
  return [...groups.values()];
}

/** Why a line cannot be saved, in words that say what to do; null when it can. */
export function dprLineProblem(l: { activityId?: string | null; quantity?: string | number | null }, n: number): string | null {
  if (!l.activityId) return `Line ${n}: choose the activity`;
  const q = Number(l.quantity);
  if (l.quantity === null || l.quantity === undefined || l.quantity === '' || !Number.isFinite(q)) return `Line ${n}: enter the quantity done today`;
  if (q <= 0) return `Line ${n}: the quantity must be more than 0`;
  return null;
}

type PickActivity = Pick<DprActivityOptionDto, 'componentCode' | 'componentName' | 'subComponentCode' | 'subComponentName'>;
/** The pick of an activity outside the breakdown, and of activities on a component itself rather than a sub-component. */
export const PICK_OUTSIDE = '~';
export const PICK_WHOLE = '=';
export const componentPickOf = (a: PickActivity) => a.componentCode ?? PICK_OUTSIDE;
export const subPickOf = (a: PickActivity) => a.subComponentCode ?? PICK_WHOLE;
const byPick = (x: string, y: string) => Number(x === PICK_OUTSIDE) - Number(y === PICK_OUTSIDE) || x.localeCompare(y, undefined, { numeric: true });

export interface PickChoice {
  key: string;
  name: string | null;
  /** Activities under it */
  count: number;
}

/** The components the project's activities sit in, in code order, outside the breakdown last; empty with no breakdown. */
export function componentChoices(activities: PickActivity[]): PickChoice[] {
  if (!activities.some((a) => a.componentCode)) return [];
  const seen = new Map<string, PickChoice>();
  for (const a of activities) {
    const k = componentPickOf(a);
    const c = seen.get(k) ?? { key: k, name: a.componentName, count: 0 };
    c.count += 1;
    seen.set(k, c);
  }
  return [...seen.values()].sort((x, y) => byPick(x.key, y.key));
}

/** The sub-components of a component, and the component as a whole when activities sit on it directly; empty with none. */
export function subComponentChoices(activities: PickActivity[], component: string | null): PickChoice[] {
  const acts = activities.filter((a) => component !== null && componentPickOf(a) === component);
  if (!acts.some((a) => a.subComponentCode)) return [];
  const seen = new Map<string, PickChoice>();
  for (const a of acts) {
    const k = subPickOf(a);
    const c = seen.get(k) ?? { key: k, name: a.subComponentName, count: 0 };
    c.count += 1;
    seen.set(k, c);
  }
  return [...seen.values()].sort((x, y) => Number(x.key === PICK_WHOLE) - Number(y.key === PICK_WHOLE) || x.key.localeCompare(y.key, undefined, { numeric: true }));
}

/** The activities a line may take, narrowed by the component and sub-component picked (null: any). */
export function activitiesFor<T extends PickActivity>(activities: T[], component: string | null, sub: string | null): T[] {
  return activities.filter((a) => (component === null || componentPickOf(a) === component) && (sub === null || subPickOf(a) === sub));
}

/** Where a line stands in the breakdown: its activity's own place once chosen, else what was picked. */
export const linePick = (picked: { component: string | null; sub: string | null }, activity: PickActivity | undefined) =>
  activity ? { component: componentPickOf(activity), sub: subPickOf(activity) } : picked;
