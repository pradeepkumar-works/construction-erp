/**
 * Moving project types between companies (ARCHITECTURE "Project types", Export and import): a file of
 * types, each with its loose activities and DPR form, and the component kinds they use. Reading a file is pure and
 * strict: anything it does not know is dropped, and what is left goes through the same checks as the editors
 * (`projectTypeProblems`, `componentKindProblems`, `dprFormProblems`), so an import can never save what an admin could
 * not have typed. Group sharing copies a type to a child company through the same file.
 */
import { CONTRACT_MODELS, WORK_ELEMENT_TYPES, WORK_LOCATIONS, type ContractModel, type WorkElementType, type WorkLocation } from './enums';
import type { ComponentStep, ElementSpecField, ElementSpecs, RccPart, StepPart } from './element-templates';
import { normaliseDprForm, type DprFormDef } from './dpr-form';
import { isTypeBase, type ComponentKindDef, type ProjectTypeDef, type StartComponent } from './project-types';
import type { ActivityTemplateItem } from './templates';

export const BUNDLE_FORMAT = 'nirmaan.project-types';
export const BUNDLE_VERSION = 1;
export const MAX_BUNDLE_TYPES = 30;
export const MAX_BUNDLE_KINDS = 80;
/** A file larger than this is not a project types file (a type with everything filled is a few tens of KB). */
export const MAX_BUNDLE_BYTES = 2_000_000;

export interface BundleType extends ProjectTypeDef {
  /** Its DPR form; null keeps the standard form of what it is built on */
  dprForm: DprFormDef | null;
}

export interface TypeBundle {
  format: typeof BUNDLE_FORMAT;
  version: number;
  exportedAt: string;
  /** The company it came from, for the reader's information */
  from: string;
  types: BundleType[];
  kinds: ComponentKindDef[];
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max = 120): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : NaN);
const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number.isFinite(num(v)) ? num(v) : null);
const list = (v: unknown, max: number): unknown[] => (Array.isArray(v) ? v.slice(0, max) : []);
const oneOf = <T extends string>(v: unknown, values: readonly T[]): T | null => ((values as readonly string[]).includes(v as string) ? (v as T) : null);

const specsOf = (v: unknown): ElementSpecs | null => {
  if (!isObject(v)) return null;
  const out: ElementSpecs = {};
  for (const [k, x] of Object.entries(v).slice(0, 12)) if (/^[a-zA-Z]{1,30}$/.test(k) && Number.isFinite(num(x))) out[k] = num(x);
  return Object.keys(out).length ? out : null;
};

const partOf = (v: unknown): RccPart => (isObject(v) ? { name: text(v.name), unit: text(v.unit, 12), weightPct: num(v.weightPct) } : { name: '', unit: '', weightPct: NaN });
const subOf = (v: unknown): StepPart => {
  const p = isObject(v) ? v : {};
  return { ...partOf(p), ...(text(p.qtyFrom, 30) ? { qtyFrom: text(p.qtyFrom, 30) } : {}), ...(p.lumpSum === true ? { lumpSum: true } : {}) };
};

const stepOf = (v: unknown): ComponentStep => {
  const s = isObject(v) ? v : {};
  const name = text(s.name);
  const weightPct = num(s.weightPct);
  const parts = Array.isArray(s.parts) && s.parts.length ? { parts: list(s.parts, 12).map(partOf) } : {};
  if (s.kind === 'rcc') return { kind: 'rcc', name, weightPct, ...parts };
  if (s.kind === 'lifts') return { kind: 'lifts', name, weightPct, over: text(s.over, 30), ...parts };
  if (s.kind === 'group') return { kind: 'group', name, unit: text(s.unit, 12), weightPct, subs: list(s.subs, 20).map(subOf) };
  return { kind: 'plain', ...subOf({ ...s, name, weightPct }) };
};

/** A component kind as a file gave it, with only what a kind has. */
export function normaliseKindDef(raw: unknown): ComponentKindDef {
  const k = isObject(raw) ? raw : {};
  return {
    code: text(k.code, 40).toUpperCase(),
    name: text(k.name),
    elementType: (oneOf(k.elementType, WORK_ELEMENT_TYPES) ?? ('' as WorkElementType)),
    specFields: list(k.specFields, 12).map((f): ElementSpecField => {
      const x = isObject(f) ? f : {};
      const d = numOrNull(x.default);
      return { key: text(x.key, 30), label: text(x.label, 60), unit: text(x.unit, 12), ...(d !== null ? { default: d } : {}) };
    }),
    steps: list(k.steps, 60).map(stepOf),
    active: k.active !== false,
  };
}

/** A project type as a file gave it, with only what a type has. */
export function normaliseTypeDef(raw: unknown): BundleType {
  const t = isObject(raw) ? raw : {};
  const base = oneOf(t.baseType, ['ROAD', 'BUILDING', 'WATER_SUPPLY', 'SEWERAGE', 'OTHER', 'PLANT', 'STORE'] as const);
  return {
    code: text(t.code, 40).toUpperCase(),
    name: text(t.name),
    baseType: base && isTypeBase(base) ? base : ('' as ProjectTypeDef['baseType']),
    description: text(t.description, 500),
    locations: [...new Set(list(t.locations, 3).map((l) => oneOf(l, WORK_LOCATIONS)).filter((l): l is WorkLocation => !!l))],
    pipeNetwork: t.pipeNetwork === true,
    contractModel: oneOf(t.contractModel, CONTRACT_MODELS) ?? ('ITEM_RATE' as ContractModel),
    kinds: [...new Set(list(t.kinds, 60).map((x) => text(x, 40).toUpperCase()).filter(Boolean))],
    breakdown: list(t.breakdown, 80).map((b): StartComponent => {
      const x = isObject(b) ? b : {};
      return { key: text(x.key, 20), parentKey: text(x.parentKey, 20) || null, kind: text(x.kind, 40).toUpperCase(), name: text(x.name), count: num(x.count), specs: specsOf(x.specs), weightPct: numOrNull(x.weightPct) };
    }),
    activities: list(t.activities, 120).map((a): ActivityTemplateItem => {
      const x = isObject(a) ? a : {};
      return { name: text(x.name), unit: text(x.unit, 12), startDay: num(x.startDay), durationDays: num(x.durationDays) };
    }),
    active: t.active !== false,
    dprForm: isObject(t.dprForm) ? normaliseDprForm(t.dprForm) : null,
  };
}

/** A file read: the bundle, or why it is not one. */
export function readBundle(raw: unknown): { bundle: TypeBundle | null; problem: string | null } {
  if (!isObject(raw) || raw.format !== BUNDLE_FORMAT) return { bundle: null, problem: 'This is not a project types file. Export one from Projects › Project types and choose that file.' };
  const version = num(raw.version);
  if (!(version >= 1)) return { bundle: null, problem: 'The file does not say which version it is; export it again.' };
  if (version > BUNDLE_VERSION) return { bundle: null, problem: 'The file was made by a newer Nirmaan; ask its sender to export it again, or import it once this company is updated.' };
  const types = list(raw.types, MAX_BUNDLE_TYPES).map(normaliseTypeDef);
  const kinds = list(raw.kinds, MAX_BUNDLE_KINDS).map(normaliseKindDef);
  if (!types.length && !kinds.length) return { bundle: null, problem: 'The file has no project types or component kinds in it.' };
  return { bundle: { format: BUNDLE_FORMAT, version, exportedAt: text(raw.exportedAt, 40), from: text(raw.from), types, kinds }, problem: null };
}

/** The file name an export downloads as. */
export const bundleFileName = (what: string, date: string) => `${what.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project-types'}-${date}.json`;

export type ImportAction = 'CREATE' | 'REPLACE' | 'SAME' | 'REFUSED';
export const IMPORT_ACTION_LABELS: Record<ImportAction, string> = {
  CREATE: 'New',
  REPLACE: 'Replaces yours',
  SAME: 'Same as yours',
  REFUSED: 'Cannot import',
};

/** What the company has under a code, for the import plan. */
export interface ImportTarget {
  code: string;
  /** What it is built on: a type's base kind, a kind's element type */
  base: string;
  /** Projects of the type, or components laid out from the kind */
  used: number;
}

export interface ImportRowDto {
  what: 'TYPE' | 'KIND';
  code: string;
  name: string;
  action: ImportAction;
  /** Why it is refused, or what replacing changes */
  note: string | null;
  problems: string[];
}

/** Two definitions say the same, ignoring key order. */
export const sameDef = (a: unknown, b: unknown): boolean => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
const sortKeys = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(sortKeys) : isObject(v) ? Object.fromEntries(Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => [k, sortKeys(v[k])])) : v;

/**
 * What importing each item would do. A type or kind the company lacks is new; one it has is replaced (a new version, its
 * projects keep what they have until Update projects), unless the file says the same or what it is built on differs
 * while projects or components use it.
 */
export function importAction(item: { code: string; base: string }, current: (ImportTarget & { def: unknown }) | undefined, def: unknown, what: 'type' | 'kind'): { action: ImportAction; note: string | null } {
  if (!current) return { action: 'CREATE', note: null };
  if (sameDef(current.def, def)) return { action: 'SAME', note: null };
  if (current.base !== item.base && current.used > 0) {
    const used = what === 'type' ? `${current.used} project${current.used === 1 ? '' : 's'} use your ${item.code}` : `${current.used} component${current.used === 1 ? ' was' : 's were'} laid out from your ${item.code}`;
    return { action: 'REFUSED', note: `It is built on something else and ${used}; change the code in the file to import it as a new ${what}` };
  }
  return { action: 'REPLACE', note: current.used ? `Saved as a new version; ${what === 'type' ? 'its projects' : 'components laid out from it'} keep what they have until you update them` : null };
}
