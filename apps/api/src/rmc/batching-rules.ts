/**
 * Batching plant rules (ARCHITECTURE "Batching plant controller"): a batching plant connection's settings, its
 * column map, and a row the Connector read from the controller's batch report. Pure: tested in
 * `src/scripts/batching-test.ts`. Reading a row through the map, the first map and the order a batch was for are in
 * `@erp/shared/batching.ts`.
 */
import { BATCH_EXTENSIONS, BATCH_FIELDS, BATCH_SINCE_DAYS, columnMapProblem, type BatchColumnMap, type BatchField, type BatchingConfig } from '@erp/shared';

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** A folder on the plant's computer as Windows writes it (D:\Batch Reports, \\PLANT-PC\Reports) or Linux does (/home/plant/reports). */
const WINDOWS_PATH = /^([A-Za-z]:\\|\\\\[^\\/:*?"<>|]+\\[^\\/:*?"<>|]+)[^:*?"<>|]*$/;
const POSIX_PATH = /^\/[^\0]*$/;

/** A column map, checked: the fields it names, the materials with their units; null when there is none yet. */
export function readColumnMap(raw: unknown, headers: string[] | null = null): { columns: BatchColumnMap | null; problem?: undefined } | { columns?: undefined; problem: string } {
  if (raw === undefined || raw === null) return { columns: null };
  if (!isObj(raw)) return { problem: 'The columns are not a map of fields and materials' };
  const fields: Partial<Record<BatchField, string>> = {};
  const rawFields = isObj(raw.fields) ? raw.fields : {};
  for (const f of BATCH_FIELDS) {
    const v = rawFields[f];
    if (typeof v === 'string' && v.trim()) fields[f] = v.trim().slice(0, 60);
  }
  const rawMaterials = Array.isArray(raw.materials) ? raw.materials : [];
  if (rawMaterials.length > 20) return { problem: 'Match up to 20 materials' };
  const materials = [];
  for (const m of rawMaterials) {
    if (!isObj(m) || typeof m.column !== 'string' || !m.column.trim() || typeof m.itemId !== 'string') return { problem: 'Each material names its column and its item' };
    materials.push({ column: m.column.trim().slice(0, 60), itemId: m.itemId, perUnit: num(m.perUnit) ?? 0 });
  }
  const columns: BatchColumnMap = { fields, materials };
  const problem = columnMapProblem(columns, headers);
  return problem ? { problem } : { columns };
}

/** A batching plant connection's settings, checked before they are saved; a map already matched is kept unless one is given. */
export function readBatchingConfig(raw: unknown, kept: unknown = null): { config: BatchingConfig; problem?: undefined } | { config?: undefined; problem: string } {
  const c = isObj(raw) ? raw : {};
  let folder = typeof c.folder === 'string' ? c.folder.trim() : '';
  // A trailing slash is dropped, except from a drive's own (D:\) or the root.
  if (folder.length > 3) folder = folder.replace(/[\\/]+$/, '');
  if (!folder || folder.length > 200 || !(WINDOWS_PATH.test(folder) || POSIX_PATH.test(folder)) || /(^|[\\/])\.\.([\\/]|$)/.test(folder))
    return { problem: 'Type the folder the controller writes its batch reports to, in full, such as D:\\Batch Reports' };
  const rawExt = Array.isArray(c.extensions) && c.extensions.length ? c.extensions : ['csv', 'txt'];
  const extensions = [...new Set(rawExt.map((e) => String(e).trim().toLowerCase().replace(/^\./, '')))];
  const bad = extensions.find((e) => !BATCH_EXTENSIONS.includes(e as (typeof BATCH_EXTENSIONS)[number]));
  if (bad) return { problem: `The Connector reads ${BATCH_EXTENSIONS.join(', ')} files, not ${bad}. Set the controller to export its reports as CSV` };
  const sinceDays = c.sinceDays === undefined || c.sinceDays === null ? BATCH_SINCE_DAYS : num(c.sinceDays);
  if (sinceDays === null || !Number.isInteger(sinceDays) || sinceDays < 1 || sinceDays > 30) return { problem: 'The days of old reports to read must be between 1 and 30' };
  const map = readColumnMap(c.columns !== undefined ? c.columns : isObj(kept) ? kept.columns : null);
  if (map.problem !== undefined) return { problem: map.problem };
  return { config: { folder, extensions, sinceDays, columns: map.columns } };
}

export interface PlantRowIn {
  key: string;
  file: string | null;
  line: number | null;
  fields: Record<string, string>;
}

const MAX_FIELDS = 60;

/** One row from the Connector's batch report reader: `{ key, file, line, fields: { column: text } }`. */
export function readPlantRow(payload: unknown): { row: PlantRowIn; problem?: undefined } | { row?: undefined; problem: string } {
  if (!isObj(payload)) return { problem: 'The reading is not a JSON object' };
  const key = typeof payload.key === 'string' ? payload.key.trim() : '';
  if (!key || key.length > 100) return { problem: 'No key for the row; update the Connector' };
  if (!isObj(payload.fields)) return { problem: 'No columns in the row; update the Connector' };
  const entries = Object.entries(payload.fields);
  if (!entries.length) return { problem: 'The row has no columns' };
  if (entries.length > MAX_FIELDS) return { problem: `The row has ${entries.length} columns; up to ${MAX_FIELDS} are read` };
  const fields: Record<string, string> = {};
  for (const [k, v] of entries) {
    if (!k.trim() || k.length > 60) return { problem: 'A column name is blank or longer than 60 characters' };
    if (v !== null && typeof v !== 'string' && typeof v !== 'number') return { problem: `${k} is not text or a number` };
    fields[k] = v === null ? '' : String(v).slice(0, 200);
  }
  const line = num(payload.line);
  return {
    row: {
      key,
      file: typeof payload.file === 'string' && payload.file.trim() ? payload.file.trim().slice(0, 200) : null,
      line: line !== null && Number.isInteger(line) && line > 0 ? line : null,
      fields,
    },
  };
}
