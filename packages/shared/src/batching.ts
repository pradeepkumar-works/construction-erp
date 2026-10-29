import { itemSimilarity } from './doc-read';
import { kgPerUnit } from './weighbridge';

/**
 * A batching plant's controller (item 149): the batch reports it writes to a folder, read by the Connector and taken in
 * as rows of named columns. What each column means is the plant's choice, made once from a real file (`BatchColumnMap`);
 * `readBatchRow` reads a row through it, `guessColumns` offers a first map, and `suggestOrder` the order a batch was for.
 * Pure: tested in `apps/api/src/scripts/batching-test.ts`.
 */

/** What a column of the batch report can be, besides a material weighed. */
export const BATCH_FIELDS = ['BATCH_NO', 'DATE', 'TIME', 'QUANTITY', 'MIX', 'TRUCK', 'ORDER'] as const;
export type BatchField = (typeof BATCH_FIELDS)[number];
export const BATCH_FIELD_LABELS: Record<BatchField, string> = {
  BATCH_NO: "The controller's batch number",
  DATE: 'Date (or date and time)',
  TIME: 'Time',
  QUANTITY: 'Cubic metres batched',
  MIX: 'Mix or recipe',
  TRUCK: 'Truck',
  ORDER: 'Order or docket',
};
/** The columns a batch cannot be read without. */
export const BATCH_REQUIRED: BatchField[] = ['BATCH_NO', 'QUANTITY'];

/** A column of the report that is a material weighed: its item, and how many of the column's units make one of the item's. */
export interface BatchMaterialColumn {
  column: string;
  itemId: string;
  /** The column's figure (kg, as most controllers print) for one of the item's units: 50 for a bag of cement, 1600 for a cum of sand */
  perUnit: number;
}

export interface BatchColumnMap {
  fields: Partial<Record<BatchField, string>>;
  materials: BatchMaterialColumn[];
}

/** A batching plant connection's settings: where the controller writes its reports, and the columns once matched. */
export interface BatchingConfig {
  folder: string;
  extensions: string[];
  /** On the first run, files changed in these many days are read; older ones are left */
  sinceDays: number;
  columns: BatchColumnMap | null;
}

export const BATCH_EXTENSIONS = ['csv', 'txt', 'tsv'] as const;
export const BATCH_SINCE_DAYS = 2;
/** A batch made at the plant with no challan after this long is named on the RMC page */
export const BATCH_NO_CHALLAN_HOURS = 4;
/** A material weighed further than this from the design is marked on the batch */
export const BATCH_VARIANCE_PCT = 3;

const LITRE_UNITS = new Set(['l', 'ltr', 'ltrs', 'litre', 'litres', 'liter', 'liters']);
const BAG_UNITS = new Set(['bag', 'bags']);

/** The column's figure for one of an item's units when the column is in kg: a weight's own, a litre as a kg, a bag of cement 50; else to be typed. */
export function defaultPerUnit(unit: string | null | undefined): number | null {
  const u = (unit ?? '').trim().toLowerCase();
  if (BAG_UNITS.has(u)) return 50;
  if (LITRE_UNITS.has(u)) return 1;
  return kgPerUnit(u);
}

/** A figure as a controller prints it: "1,234.5", "1234,5", " 6.00 ", "-". Null when it is no number. */
export function readFigure(text: string | null | undefined): number | null {
  let t = (text ?? '').trim().replace(/\s/g, '');
  if (!t || !/\d/.test(t)) return null;
  t = t.replace(/[^\d.,-]/g, '');
  if (t.includes('.') && t.includes(',')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (t.includes(',')) t = /,\d{3}$/.test(t) && !/^-?0,/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * A date, a date and time, or a time as a controller prints it: 29-10-2026, 29/10/2026 08:15, 2026-10-29 08:15:30,
 * 29.10.26 8:15 PM. Day first where it could be either (as in India). Read as India time. Null when it is no date.
 */
export function readStamp(dateText: string | null | undefined, timeText?: string | null): Date | null {
  const text = `${(dateText ?? '').trim()} ${(timeText ?? '').trim()}`.trim();
  let y: number, mo: number, d: number;
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(text);
  if (m) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else {
    m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(text);
    if (!m) return null;
    [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (y < 100) y += 2000;
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const rest = text.slice(m[0].length);
  const t = /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?/i.exec(rest);
  let h = t ? Number(t[1]) : 0;
  const min = t ? Number(t[2]) : 0;
  const s = t?.[3] ? Number(t[3]) : 0;
  if (t?.[4]) {
    const pm = /^p/i.test(t[4]);
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
  }
  if (h > 23 || min > 59 || s > 59) return null;
  const at = new Date(Date.UTC(y, mo - 1, d, h, min, s) - 330 * 60_000);
  return Number.isNaN(at.getTime()) || new Date(at.getTime() + 330 * 60_000).getUTCDate() !== d ? null : at;
}

export interface BatchRowRead {
  batchNo: string | null;
  at: Date | null;
  quantity: number | null;
  mix: string | null;
  truck: string | null;
  orderRef: string | null;
  /** Each mapped material in its item's unit, rounded to 3 places; a blank or zero column is left out */
  materials: { itemId: string; actualQty: number }[];
  /** What keeps the row from being dispatched, in words */
  problems: string[];
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** One row of the report through the plant's column map. */
export function readBatchRow(fields: Record<string, string>, map: BatchColumnMap | null): BatchRowRead {
  const out: BatchRowRead = { batchNo: null, at: null, quantity: null, mix: null, truck: null, orderRef: null, materials: [], problems: [] };
  if (!map) {
    out.problems.push('The columns are not matched yet');
    return out;
  }
  const value = (f: BatchField) => {
    const col = map.fields[f];
    const v = col ? fields[col] : undefined;
    return v === undefined ? null : v.trim() || null;
  };
  out.batchNo = value('BATCH_NO')?.slice(0, 40) ?? null;
  if (!out.batchNo) out.problems.push('No batch number in the row');
  const q = readFigure(value('QUANTITY'));
  out.quantity = q !== null && q > 0 && q <= 20 ? r3(q) : null;
  if (out.quantity === null) out.problems.push(q === null ? 'No cubic metres in the row' : `${q} m³ is not a truck's load`);
  const date = value('DATE');
  out.at = date ? readStamp(date, value('TIME')) : null;
  out.mix = value('MIX')?.slice(0, 60) ?? null;
  out.truck = value('TRUCK')?.replace(/\s+/g, ' ').toUpperCase().slice(0, 30) ?? null;
  out.orderRef = value('ORDER')?.slice(0, 60) ?? null;
  for (const m of map.materials) {
    const raw = fields[m.column];
    const n = readFigure(raw);
    if (n === null || n === 0) continue;
    if (n < 0 || m.perUnit <= 0) {
      out.problems.push(`${m.column} reads ${raw?.trim()}`);
      continue;
    }
    out.materials.push({ itemId: m.itemId, actualQty: r3(n / m.perUnit) });
  }
  return out;
}

/** What a header looks like it means, for a first map the plant then checks. */
const FIELD_GUESSES: [BatchField, RegExp][] = [
  ['BATCH_NO', /\b(batch|docket|ticket|dc|challan)\s*(no|number|id|#)?\b|^(no|sr\.?\s*no|id)$/i],
  ['DATE', /\b(date|day)\b/i],
  ['TIME', /\btime\b/i],
  ['QUANTITY', /\b(qty|quantity|m3|m³|cum|cu\.?\s*m|volume|load)\b/i],
  ['MIX', /\b(recipe|mix|grade|design)\b/i],
  ['TRUCK', /\b(truck|vehicle|tm|transit|mixer)\b/i],
  ['ORDER', /\b(order|customer|client|so|po|site)\b/i],
];

/** The words of a header that name a material, without its unit and the controller's own words ("CEM 1 act (kg)" → "cem 1"). */
const materialWords = (header: string) =>
  header
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/\b(act|actual|set|target|wt|weight|kgs?|kg|ltr|l|tgt)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const ALIASES: [RegExp, RegExp][] = [
  [/\b(cem|cement|opc|ppc)\d*\b/, /\bcement\b/i],
  [/\b(sand|fa|fine)\b/, /\bsand\b/i],
  [/\b(fly ?ash|ash|pfa)\b/, /\bfly ?ash\b/i],
  [/\b(ggbs|slag)\b/, /\b(ggbs|slag)\b/i],
  [/\b(admix|adm|chem|pce|sp)\b/, /\badmix/i],
  [/\b(20|ca1|agg ?1)\b/, /\b20\s*mm\b|\b20mm\b/i],
  [/\b(10|12|ca2|agg ?2)\b/, /\b(10|12)\s*mm\b|\b(10|12)mm\b/i],
];

export interface GuessItem {
  id: string;
  name: string;
  unit: string;
}

/**
 * A first map from a report's headers: each field to the first header that looks like it, and each other header to the
 * item it most looks like (by the usual names: cement, sand, 20 mm…), with the kg per unit where the unit says. Each
 * header and each item is used once; nothing is guessed for a header that looks like nothing.
 */
export function guessColumns(headers: string[], items: GuessItem[]): BatchColumnMap {
  const fields: Partial<Record<BatchField, string>> = {};
  const used = new Set<string>();
  for (const [f, re] of FIELD_GUESSES) {
    const h = headers.find((x) => !used.has(x) && re.test(x));
    if (h) {
      fields[f] = h;
      used.add(h);
    }
  }
  const materials: BatchMaterialColumn[] = [];
  const taken = new Set<string>();
  for (const h of headers) {
    if (used.has(h)) continue;
    const words = materialWords(h);
    if (!words || /\b(water|moisture|total|set|target)\b/.test(words)) continue;
    let best: { item: GuessItem; score: number } | null = null;
    for (const item of items) {
      if (taken.has(item.id)) continue;
      const alias = ALIASES.some(([hw, iw]) => hw.test(words) && iw.test(item.name)) ? 0.8 : 0;
      const score = Math.max(alias, itemSimilarity(words, item.name));
      if (score >= 0.5 && (!best || score > best.score)) best = { item, score };
    }
    if (!best) continue;
    taken.add(best.item.id);
    used.add(h);
    materials.push({ column: h, itemId: best.item.id, perUnit: defaultPerUnit(best.item.unit) ?? 0 });
  }
  return { fields, materials };
}

/** What is wrong with a column map before it is saved, in words, or null. */
export function columnMapProblem(map: BatchColumnMap, headers: string[] | null): string | null {
  for (const f of BATCH_REQUIRED) if (!map.fields[f]) return `Choose the column for ${BATCH_FIELD_LABELS[f].toLowerCase()}`;
  const cols = [...Object.values(map.fields), ...map.materials.map((m) => m.column)].filter((c): c is string => !!c);
  const twice = cols.find((c, i) => cols.indexOf(c) !== i);
  if (twice) return `${twice} is chosen twice; give each column one meaning`;
  const items = map.materials.map((m) => m.itemId);
  if (items.some((id, i) => items.indexOf(id) !== i)) return 'A material is chosen for two columns; give each its own';
  const bad = map.materials.find((m) => !(m.perUnit > 0) || m.perUnit > 100_000);
  if (bad) return `Type how much of ${bad.column} makes one of its item's units (50 kg for a bag, about 1,600 kg for a cum of sand)`;
  if (headers) {
    const missing = cols.find((c) => !headers.includes(c));
    if (missing) return `${missing} is not a column of the report`;
  }
  return null;
}

export interface SuggestOrder {
  id: string;
  orderNo: string;
  mixDesignCode: string;
  grade: string;
  /** Cubic metres the order can still take */
  left: number;
  customer: string;
}

/**
 * The order a batch was made for: one whose number the batch's order column names; else the only order of its mix
 * (the design's code or its grade) with room for the load; else the only order with room at all. Null when it cannot tell.
 */
export function suggestOrder(row: Pick<BatchRowRead, 'mix' | 'orderRef' | 'quantity'>, orders: SuggestOrder[]): SuggestOrder | null {
  const room = orders.filter((o) => row.quantity === null || o.left + 1e-9 >= row.quantity);
  const ref = row.orderRef?.toUpperCase().replace(/\s+/g, '');
  if (ref) {
    const named = room.filter((o) => ref.includes(o.orderNo.toUpperCase().replace(/\s+/g, '')) || ref.includes(o.orderNo.split('-').pop()!));
    if (named.length === 1) return named[0];
  }
  const mix = row.mix?.toUpperCase().replace(/[\s_]+/g, '');
  if (mix) {
    const same = room.filter((o) => {
      const code = o.mixDesignCode.toUpperCase().replace(/[\s_]+/g, '');
      const grade = o.grade.toUpperCase().replace(/\s+/g, '');
      return mix === code || mix.includes(code) || code.includes(mix) || new RegExp(`(^|[^0-9A-Z])${grade}([^0-9]|$)`).test(mix) || mix === grade;
    });
    if (same.length === 1) return same[0];
    if (same.length > 1) return null;
  }
  return room.length === 1 ? room[0] : null;
}

/** A row the board shows: what was read, its order, and what keeps it from a challan. */
export interface PlantBatchRowDto {
  id: string;
  connectionId: string;
  plantId: string;
  takenAt: string;
  file: string | null;
  line: number | null;
  batchNo: string | null;
  at: string | null;
  quantity: string | null;
  mix: string | null;
  truck: string | null;
  orderRef: string | null;
  materials: { itemId: string; itemName: string; unit: string; actualQty: string }[];
  problems: string[];
  /** The order it looks to be for */
  suggestedOrderId: string | null;
  /** Made long enough ago with no challan that it should have one (BATCH_NO_CHALLAN_HOURS) */
  late: boolean;
  rmcBatchId: string | null;
  rmcBatchNo: string | null;
  dismissedAt: string | null;
  dismissReason: string | null;
}

export interface PlantControllerDto {
  connectionId: string;
  name: string;
  plantId: string;
  plantName: string;
  health: string;
  lastEventAt: string | null;
  folder: string;
  columns: BatchColumnMap | null;
  /** The columns of the newest report read, for matching */
  headers: string[];
  /** A row of the newest report, to show beside each column */
  sample: Record<string, string> | null;
}

export interface PlantBatchBoardDto {
  controllers: PlantControllerDto[];
  waiting: PlantBatchRowDto[];
  done: PlantBatchRowDto[];
  /** Waiting longer than BATCH_NO_CHALLAN_HOURS */
  late: number;
  canDispatch: boolean;
  canMatch: boolean;
}
