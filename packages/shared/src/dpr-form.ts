/**
 * The DPR form of a project type (ARCHITECTURE "DPR form per project type"). Each type has one form
 * definition, which the web form, the phone form, the record page, the print and the export all draw from: which
 * built-in fields show, which are required and what they are called, how a work line is picked and what it shows, and up
 * to 20 fields of the company's own. Every save is a new version (`DprFormConfig`), and a DPR keeps the version it was
 * made on; a DPR with none was made on its type's standard form.
 *
 * The standard forms below are what a company uses until it saves its own, matched by the type's code, so nothing is
 * seeded. Values of the company's own fields are kept in `extra` (on the report for the day, on each line for a line),
 * keyed by the field's key, which never changes once saved; only its label does.
 */
import { MANPOWER_CATEGORIES } from './labels';
import { STANDARD_TYPE_FOR } from './project-types';
import type { ProjectType } from './enums';

/** The built-in fields a form can show, hide, require, rename and reorder. Project and date are always there. */
export const DPR_BUILT_IN_KEYS = ['weather', 'siteCondition', 'lines', 'manpower', 'machinery', 'materialReceived', 'testsConducted', 'safetyObservations', 'issues', 'nextDayPlan', 'photos'] as const;
export type DprBuiltInKey = (typeof DPR_BUILT_IN_KEYS)[number];

/** Where a field sits on the form, the record and the print. */
export const DPR_SECTIONS = ['DAY', 'WORK', 'CREW', 'NOTES'] as const;
export type DprSection = (typeof DPR_SECTIONS)[number];
export const DPR_SECTION_LABELS: Record<DprSection, string> = { DAY: 'The day', WORK: 'Work done', CREW: 'Manpower and machinery', NOTES: 'Notes' };

export interface DprBuiltInInfo {
  label: string;
  section: DprSection;
  canHide: boolean;
  /** Said when the field is required and empty */
  missing: string;
}

export const DPR_BUILT_INS: Record<DprBuiltInKey, DprBuiltInInfo> = {
  weather: { label: 'Weather', section: 'DAY', canHide: true, missing: 'Choose the weather' },
  siteCondition: { label: 'Site condition', section: 'DAY', canHide: true, missing: 'Describe the site condition' },
  // Hidden only when the company records progress some other way too (`progressFromDpr` off).
  lines: { label: 'Work lines', section: 'WORK', canHide: true, missing: 'Add a work line for the work done today' },
  manpower: { label: 'Manpower', section: 'CREW', canHide: true, missing: 'Add the manpower on site today' },
  machinery: { label: 'Machinery', section: 'CREW', canHide: true, missing: 'Add the machinery used today' },
  materialReceived: { label: 'Material received', section: 'NOTES', canHide: true, missing: 'Say what material was received' },
  testsConducted: { label: 'Tests conducted', section: 'NOTES', canHide: true, missing: 'Say which tests were done' },
  safetyObservations: { label: 'Safety observations', section: 'NOTES', canHide: true, missing: 'Note the safety observations' },
  // The hindrance register reads it, so it always shows; it can be renamed and required.
  issues: { label: 'Issues / hindrances', section: 'NOTES', canHide: false, missing: 'Say what held up the work, or write None' },
  nextDayPlan: { label: 'Next day plan', section: 'NOTES', canHide: true, missing: 'Write the plan for the next day' },
  photos: { label: 'Site photos', section: 'NOTES', canHide: true, missing: 'Add site photos' },
};

export interface DprFieldSetting {
  key: DprBuiltInKey;
  show: boolean;
  /** For photos, `minPhotos` says how many instead */
  required: boolean;
  /** The company's own name for it; null keeps the standard one */
  label: string | null;
}

/** The kinds of field a company can add. */
export const DPR_FIELD_KINDS = ['TEXT', 'LONG_TEXT', 'NUMBER', 'YES_NO', 'CHOICE', 'DATE', 'TIME'] as const;
export type DprFieldKind = (typeof DPR_FIELD_KINDS)[number];
export const DPR_FIELD_KIND_LABELS: Record<DprFieldKind, string> = {
  TEXT: 'Short text',
  LONG_TEXT: 'Long text',
  NUMBER: 'Number',
  YES_NO: 'Yes or no',
  CHOICE: 'Choice',
  DATE: 'Date',
  TIME: 'Time',
};
export const DPR_FIELD_SCOPES = ['DAY', 'LINE'] as const;
export type DprFieldScope = (typeof DPR_FIELD_SCOPES)[number];
export const DPR_FIELD_SCOPE_LABELS: Record<DprFieldScope, string> = { DAY: 'The day', LINE: 'Each work line' };

/** A field of the company's own. */
export interface DprOwnField {
  /** camelCase, fixed once saved: the values are kept under it */
  key: string;
  label: string;
  /** Shown on the phone in Hindi; the English label when empty */
  labelHi: string | null;
  kind: DprFieldKind;
  scope: DprFieldScope;
  required: boolean;
  /** NUMBER only */
  unit: string | null;
  min: number | null;
  max: number | null;
  /** CHOICE only */
  options: string[];
}

/** The parts a work line can show besides its activity, where and how much. */
export const DPR_LINE_PARTS = ['crew', 'machines', 'material', 'workOrder', 'remarks', 'photo'] as const;
export type DprLinePart = (typeof DPR_LINE_PARTS)[number];
export const DPR_LINE_PART_LABELS: Record<DprLinePart, string> = { crew: 'Crew', machines: 'Machines', material: 'Material used', workOrder: 'Work order', remarks: 'Remark', photo: 'Photo' };

/** How a line's activity is picked: component, sub-component, then activity, or one list grouped by component. */
export const DPR_PICKERS = ['CASCADE', 'GROUPED'] as const;
export type DprPicker = (typeof DPR_PICKERS)[number];
export const DPR_PICKER_LABELS: Record<DprPicker, string> = { CASCADE: 'Component, then sub-component, then activity', GROUPED: 'One activity list, grouped by component' };

export interface DprLineSettings {
  picker: DprPicker;
  parts: DprLinePart[];
  /** The trades offered for manpower and a line's crew */
  crewCategories: string[];
  /** Machines offered by name; anything can still be typed */
  machineNames: string[];
}

export interface DprFormDef {
  /** Every built-in field once, in the order the form shows them within their section */
  fields: DprFieldSetting[];
  /** Site photos a report needs, 0 to 10 */
  minPhotos: number;
  lines: DprLineSettings;
  own: DprOwnField[];
}

/** One saved version of a type's form, or its standard form (`id` null, version 0). */
export interface DprFormDto {
  id: string | null;
  typeCode: string;
  version: number;
  standard: boolean;
  def: DprFormDef;
  createdAt: string | null;
  createdByName: string | null;
}

/** A saved version of a type's form, with how many reports were made on it. */
export interface DprFormVersionDto {
  id: string;
  version: number;
  createdAt: string;
  createdByName: string | null;
  reports: number;
}

/** A type's DPR form tab: the form new reports take, its saved versions newest first, and the company's setting. */
export interface DprFormVersionsDto {
  form: DprFormDto;
  versions: DprFormVersionDto[];
  progressFromDpr: boolean;
}

export const MAX_OWN_FIELDS = 20;
export const MAX_CHOICE_OPTIONS = 20;
export const MAX_PHOTOS_REQUIRED = 10;
export const MAX_CREW_CATEGORIES = 30;
export const MAX_MACHINE_NAMES = 30;
const LABEL_MAX = 60;
const OWN_KEY = /^[a-z][A-Za-z0-9]{0,29}$/;
/** Longest text a company's own text field keeps */
export const MAX_OWN_TEXT = 1000;

/** The form a DPR was made on before DPR forms per type, and the one a type has when nothing else applies. */
export const STANDARD_DPR_FORM: DprFormDef = {
  fields: DPR_BUILT_IN_KEYS.map((key) => ({ key, show: true, required: false, label: null })),
  minPhotos: 0,
  lines: { picker: 'CASCADE', parts: ['crew', 'machines', 'material', 'workOrder', 'remarks'], crewCategories: [...MANPOWER_CATEGORIES], machineNames: [] },
  own: [],
};

const own = (key: string, label: string, labelHi: string, kind: DprFieldKind, extra: Partial<DprOwnField> = {}): DprOwnField => ({
  key,
  label,
  labelHi,
  kind,
  scope: 'DAY',
  required: false,
  unit: null,
  min: null,
  max: null,
  options: [],
  ...extra,
});
const withOwn = (fields: DprOwnField[]): DprFormDef => ({ ...STANDARD_DPR_FORM, own: fields });
const trenchOpen = own('trenchOpenRmt', 'Trench left open overnight', 'रात भर खुली छोड़ी गई खाई', 'NUMBER', { unit: 'Rmt', min: 0 });

/**
 * The standard form of each standard type (the design's "Default templates shipped"): today's form, plus the figures
 * such a site is usually asked for every day. None is required, so a report made on one looks like one made before.
 */
export const STANDARD_DPR_FORMS: Record<string, DprFormDef> = {
  ROAD: withOwn([own('rainHours', 'Rain hours', 'बारिश के घंटे', 'NUMBER', { unit: 'h', min: 0, max: 24 }), own('trafficDiversion', 'Traffic diversion in place', 'यातायात डायवर्जन लगा है', 'YES_NO')]),
  BUILDING: withOwn([own('cubeSets', 'Cube sets cast', 'ढाले गए क्यूब सेट', 'NUMBER', { unit: 'Nos', min: 0 })]),
  WATER_SUPPLY: withOwn([trenchOpen, own('connectionsHandedOver', 'Consumer connections handed over', 'सौंपे गए उपभोक्ता कनेक्शन', 'NUMBER', { unit: 'Nos', min: 0 })]),
  TRANSMISSION_MAIN: withOwn([trenchOpen]),
  SEWERAGE: withOwn([own('dewateringHours', 'Dewatering pump hours', 'डीवाटरिंग पंप के घंटे', 'NUMBER', { unit: 'h', min: 0, max: 24 }), trenchOpen]),
  GENERAL: STANDARD_DPR_FORM,
};

/** A type's standard form: its own, else that of the standard type of what it is built on, else the plain one. */
export const standardDprForm = (typeCode: string | null, baseType?: ProjectType | null): DprFormDef =>
  (typeCode ? STANDARD_DPR_FORMS[typeCode] : undefined) ?? (baseType ? STANDARD_DPR_FORMS[STANDARD_TYPE_FOR[baseType] ?? ''] : undefined) ?? STANDARD_DPR_FORM;

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max = LABEL_MAX): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const uniqueNames = (list: unknown, max: number): string[] => {
  const out: string[] = [];
  for (const v of Array.isArray(list) ? list : []) {
    const s = str(v, 40);
    if (s && !out.some((o) => o.toLowerCase() === s.toLowerCase())) out.push(s);
  }
  return out.slice(0, max);
};

/**
 * A stored or sent definition made whole: every built-in field once (missing ones added after, in the standard order),
 * the rules a field cannot break kept (issues always shows; a hidden field is not required; photos are required by
 * count), unknown keys dropped. A form saved before a new built-in field existed reads with it shown.
 */
export function normaliseDprForm(raw: unknown): DprFormDef {
  const r = isObject(raw) ? raw : {};
  const seen = new Set<DprBuiltInKey>();
  const fields: DprFieldSetting[] = [];
  for (const f of Array.isArray(r.fields) ? r.fields : []) {
    if (!isObject(f) || !(DPR_BUILT_IN_KEYS as readonly unknown[]).includes(f.key)) continue;
    const key = f.key as DprBuiltInKey;
    if (seen.has(key)) continue;
    seen.add(key);
    const show = DPR_BUILT_INS[key].canHide ? f.show !== false : true;
    fields.push({ key, show, required: show && key !== 'photos' && f.required === true, label: str(f.label) });
  }
  for (const key of DPR_BUILT_IN_KEYS) if (!seen.has(key)) fields.push({ key, show: true, required: false, label: null });
  const l = isObject(r.lines) ? r.lines : {};
  const parts = Array.isArray(l.parts) ? DPR_LINE_PARTS.filter((p) => (l.parts as unknown[]).includes(p)) : [...STANDARD_DPR_FORM.lines.parts];
  const crew = uniqueNames(l.crewCategories, MAX_CREW_CATEGORIES);
  const minPhotos = Math.min(MAX_PHOTOS_REQUIRED, Math.max(0, Math.round(numOrNull(r.minPhotos) ?? 0)));
  const ownFields: DprOwnField[] = [];
  for (const f of Array.isArray(r.own) ? r.own : []) {
    if (!isObject(f) || typeof f.key !== 'string') continue;
    const kind = (DPR_FIELD_KINDS as readonly unknown[]).includes(f.kind) ? (f.kind as DprFieldKind) : 'TEXT';
    ownFields.push({
      key: f.key,
      label: str(f.label) ?? f.key,
      labelHi: str(f.labelHi),
      kind,
      scope: f.scope === 'LINE' ? 'LINE' : 'DAY',
      required: f.required === true,
      unit: kind === 'NUMBER' ? str(f.unit, 12) : null,
      min: kind === 'NUMBER' ? numOrNull(f.min) : null,
      max: kind === 'NUMBER' ? numOrNull(f.max) : null,
      options: kind === 'CHOICE' ? uniqueNames(f.options, MAX_CHOICE_OPTIONS) : [],
    });
  }
  return {
    fields,
    minPhotos: fields.find((f) => f.key === 'photos')?.show ? minPhotos : 0,
    lines: {
      picker: l.picker === 'GROUPED' ? 'GROUPED' : 'CASCADE',
      parts,
      crewCategories: crew.length ? crew : [...MANPOWER_CATEGORIES],
      machineNames: uniqueNames(l.machineNames, MAX_MACHINE_NAMES),
    },
    own: ownFields,
  };
}

/** Why a definition cannot be saved, in words that say what to fix; empty when it can. */
export function dprFormProblems(def: DprFormDef, opts: { progressFromDpr?: boolean } = {}): string[] {
  const out: string[] = [];
  const builtIns = new Set<string>();
  for (const f of def.fields) {
    if (builtIns.has(f.key)) out.push(`${DPR_BUILT_INS[f.key].label} is on the form twice`);
    builtIns.add(f.key);
    if (!f.show && !DPR_BUILT_INS[f.key].canHide) out.push(`${DPR_BUILT_INS[f.key].label} always shows: the hindrance register reads it`);
    if (f.label !== null && (!f.label.trim() || f.label.length > LABEL_MAX)) out.push(`Give ${DPR_BUILT_INS[f.key].label} a name of 1 to ${LABEL_MAX} letters`);
  }
  for (const key of DPR_BUILT_IN_KEYS) if (!builtIns.has(key)) out.push(`${DPR_BUILT_INS[key].label} is missing from the form`);
  const lines = def.fields.find((f) => f.key === 'lines');
  if (lines && !lines.show && opts.progressFromDpr) out.push('Work lines stay on: the company records progress only from the DPR');
  if (!Number.isInteger(def.minPhotos) || def.minPhotos < 0 || def.minPhotos > MAX_PHOTOS_REQUIRED) out.push(`Ask for 0 to ${MAX_PHOTOS_REQUIRED} site photos`);
  if (!def.lines.crewCategories.length) out.push('Give at least one crew category');
  if (def.lines.crewCategories.length > MAX_CREW_CATEGORIES) out.push(`Keep crew categories to ${MAX_CREW_CATEGORIES}`);
  if (def.lines.machineNames.length > MAX_MACHINE_NAMES) out.push(`Keep machine names to ${MAX_MACHINE_NAMES}`);
  if (def.own.length > MAX_OWN_FIELDS) out.push(`A form takes up to ${MAX_OWN_FIELDS} fields of the company's own`);
  const keys = new Set<string>();
  const labels = new Map<string, string>();
  for (const [i, f] of def.own.entries()) {
    const name = f.label?.trim() || `Field ${i + 1}`;
    if (!OWN_KEY.test(f.key)) out.push(`${name}: its key must be letters and digits, starting with a small letter`);
    if (keys.has(f.key)) out.push(`${name}: another field has the key ${f.key}`);
    if ((DPR_BUILT_IN_KEYS as readonly string[]).includes(f.key)) out.push(`${name}: ${f.key} is a built-in field's key; choose another`);
    keys.add(f.key);
    if (!f.label?.trim() || f.label.length > LABEL_MAX) out.push(`Field ${i + 1}: give it a name of 1 to ${LABEL_MAX} letters`);
    const where = `${f.scope}:${f.label.trim().toLowerCase()}`;
    if (f.label.trim() && labels.has(where)) out.push(`${name} is on the form twice; give one another name`);
    labels.set(where, f.key);
    if (f.labelHi && f.labelHi.length > LABEL_MAX) out.push(`${name}: keep the Hindi name to ${LABEL_MAX} letters`);
    if (f.kind === 'CHOICE') {
      if (f.options.length < 2) out.push(`${name}: give at least two choices`);
      if (f.options.length > MAX_CHOICE_OPTIONS) out.push(`${name}: keep it to ${MAX_CHOICE_OPTIONS} choices`);
    }
    if (f.kind === 'NUMBER' && f.min !== null && f.max !== null && f.min > f.max) out.push(`${name}: the smallest value is more than the largest`);
    if (f.unit && f.unit.length > 12) out.push(`${name}: keep the unit to 12 letters`);
  }
  return out;
}

/**
 * Why a new version cannot replace the one before, beyond its own problems: a field already used keeps its kind, as
 * the reports made on the old version keep their values under its key. A field of another kind needs a new key.
 */
export function dprFormChangeProblems(before: DprFormDef, after: DprFormDef): string[] {
  const out: string[] = [];
  for (const f of after.own) {
    const was = before.own.find((b) => b.key === f.key);
    if (was && was.kind !== f.kind) out.push(`${f.label} was ${DPR_FIELD_KIND_LABELS[was.kind].toLowerCase()}; add a new field rather than change its kind`);
    if (was && was.scope !== f.scope) out.push(`${f.label} was asked for ${DPR_FIELD_SCOPE_LABELS[was.scope].toLowerCase()}; add a new field rather than move it`);
  }
  return out;
}

/** A key for a new field from its name, not one of `taken`: "Rain hours" → rainHours, then rainHours2. */
export function ownFieldKey(label: string, taken: Iterable<string>): string {
  const words = label
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9 ]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  let base = words.map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())).join('');
  if (!/^[a-z]/.test(base)) base = `field${base.charAt(0).toUpperCase()}${base.slice(1)}`;
  base = base.slice(0, 26) || 'field';
  const used = new Set(taken);
  for (const k of DPR_BUILT_IN_KEYS) used.add(k);
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) if (!used.has(`${base}${i}`)) return `${base}${i}`;
}

// Reading a form

export const dprSetting = (def: DprFormDef, key: DprBuiltInKey): DprFieldSetting => def.fields.find((f) => f.key === key) ?? { key, show: true, required: false, label: null };
/** What the form calls a built-in field. */
export const dprLabel = (def: DprFormDef, key: DprBuiltInKey): string => dprSetting(def, key).label ?? DPR_BUILT_INS[key].label;
/** Whether the form shows a field; work lines always do when the company records progress only from the DPR. */
export const dprShows = (def: DprFormDef, key: DprBuiltInKey, opts: { progressFromDpr?: boolean } = {}): boolean => (key === 'lines' && opts.progressFromDpr) || dprSetting(def, key).show;
export const dprRequires = (def: DprFormDef, key: DprBuiltInKey): boolean => (key === 'photos' ? def.minPhotos > 0 : dprSetting(def, key).show && dprSetting(def, key).required);
/** The built-in fields of a section the form shows, in its order. */
export const dprSectionFields = (def: DprFormDef, section: DprSection, opts: { progressFromDpr?: boolean } = {}): DprBuiltInKey[] =>
  def.fields.filter((f) => DPR_BUILT_INS[f.key].section === section && dprShows(def, f.key, opts)).map((f) => f.key);
export const dprLineShows = (def: DprFormDef, part: DprLinePart): boolean => def.lines.parts.includes(part);
export const ownFieldsOf = (def: DprFormDef, scope: DprFieldScope): DprOwnField[] => def.own.filter((f) => f.scope === scope);
/** A field's name in the language shown. */
export const ownFieldLabel = (f: Pick<DprOwnField, 'label' | 'labelHi'>, language: 'en' | 'hi' = 'en'): string => (language === 'hi' && f.labelHi ? f.labelHi : f.label);

// Values of the company's own fields

export type DprExtraValue = string | number | boolean;
export type DprExtra = Record<string, DprExtraValue>;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && !v.trim());

/** What a field's range says, for a message: "from 0 to 24 h", "of 0 or more". */
const rangeText = (f: DprOwnField) => {
  const u = f.unit ? ` ${f.unit}` : '';
  if (f.min !== null && f.max !== null) return ` from ${f.min} to ${f.max}${u}`;
  if (f.min !== null) return ` of ${f.min}${u} or more`;
  if (f.max !== null) return ` up to ${f.max}${u}`;
  return '';
};

/**
 * One scope's values read against its fields: what is kept (each value as its kind keeps it; blank ones and keys the
 * form does not have dropped) and what is wrong with the rest. `required` checks the fields that must be filled, which
 * the API does only when the report is sent for approval. `prefix` starts each message ("Line 2: ").
 */
export function readExtra(fields: DprOwnField[], raw: unknown, opts: { required?: boolean; prefix?: string } = {}): { values: DprExtra; problems: string[] } {
  const values: DprExtra = {};
  const problems: string[] = [];
  const src = isObject(raw) ? raw : {};
  const p = opts.prefix ?? '';
  for (const f of fields) {
    const v = src[f.key];
    if (isBlank(v)) {
      if (opts.required && f.required) problems.push(`${p}${f.kind === 'YES_NO' || f.kind === 'CHOICE' ? 'Choose' : 'Fill in'} ${f.label}`);
      continue;
    }
    switch (f.kind) {
      case 'NUMBER': {
        const n = numOrNull(v);
        if (n === null) problems.push(`${p}${f.label}: enter a number${rangeText(f)}`);
        else if ((f.min !== null && n < f.min) || (f.max !== null && n > f.max)) problems.push(`${p}${f.label}: enter a number${rangeText(f)}`);
        else values[f.key] = Math.round(n * 1000) / 1000;
        break;
      }
      case 'YES_NO':
        if (typeof v === 'boolean') values[f.key] = v;
        else if (v === 'true' || v === 'yes' || v === 'Yes') values[f.key] = true;
        else if (v === 'false' || v === 'no' || v === 'No') values[f.key] = false;
        else problems.push(`${p}${f.label}: choose yes or no`);
        break;
      case 'CHOICE': {
        const s = String(v).trim();
        const match = f.options.find((o) => o.toLowerCase() === s.toLowerCase());
        if (match) values[f.key] = match;
        else problems.push(`${p}${f.label}: choose one of ${f.options.join(', ')}`);
        break;
      }
      case 'DATE':
        if (typeof v === 'string' && DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`))) values[f.key] = v;
        else problems.push(`${p}${f.label}: give the date as YYYY-MM-DD`);
        break;
      case 'TIME':
        if (typeof v === 'string' && TIME.test(v)) values[f.key] = v;
        else problems.push(`${p}${f.label}: give the time as HH:MM, 24-hour`);
        break;
      default: {
        if (typeof v !== 'string' && typeof v !== 'number') {
          problems.push(`${p}${f.label}: write it as text`);
          break;
        }
        const s = String(v).trim();
        const max = f.kind === 'LONG_TEXT' ? MAX_OWN_TEXT : 200;
        if (s.length > max) problems.push(`${p}${f.label}: keep it to ${max} letters`);
        else values[f.key] = s;
      }
    }
  }
  return { values, problems };
}

/**
 * The report's own-field values against its form: the day's and each line's, cleaned, with every problem. Shared by
 * the API (which refuses a report with problems), the web form and the phone form.
 */
export function dprExtraProblems(def: DprFormDef, values: { day: unknown; lines: unknown[] }, opts: { required?: boolean } = {}): { day: DprExtra; lines: DprExtra[]; problems: string[] } {
  const day = readExtra(ownFieldsOf(def, 'DAY'), values.day, opts);
  const lineFields = ownFieldsOf(def, 'LINE');
  const lines = values.lines.map((l, i) => readExtra(lineFields, l, { ...opts, prefix: `Line ${i + 1}: ` }));
  return { day: day.values, lines: lines.map((l) => l.values), problems: [...day.problems, ...lines.flatMap((l) => l.problems)] };
}

/** What a report has of the built-in fields, to check the required ones. */
export interface DprFilled {
  weather: unknown;
  siteCondition: unknown;
  lines: number;
  manpower: number;
  machinery: number;
  materialReceived: unknown;
  testsConducted: unknown;
  safetyObservations: unknown;
  issues: unknown;
  nextDayPlan: unknown;
  photos: number;
}

/** What to say when a required built-in field is empty: its own words, or "Fill in …" under the name the form gives it. */
export const dprMissing = (def: DprFormDef, key: DprBuiltInKey): string => (dprSetting(def, key).label ? `Fill in ${dprSetting(def, key).label}` : DPR_BUILT_INS[key].missing);

/** The required built-in fields a report sent for approval leaves empty, in words that say what to do. */
export function dprRequiredProblems(def: DprFormDef, r: DprFilled, opts: { progressFromDpr?: boolean } = {}): string[] {
  const out: string[] = [];
  const missing = (key: DprBuiltInKey) => dprMissing(def, key);
  for (const f of def.fields) {
    if (f.key === 'photos' || !dprShows(def, f.key, opts) || !f.required) continue;
    const v = r[f.key];
    const empty = typeof v === 'number' ? v <= 0 : isBlank(v);
    if (empty) out.push(missing(f.key));
  }
  if (dprShows(def, 'photos', opts) && def.minPhotos > 0 && r.photos < def.minPhotos) out.push(def.minPhotos === 1 ? 'Add a site photo' : `Add at least ${def.minPhotos} site photos`);
  return out;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** A value as the record, print and export show it: "4.5 h", "Yes", "3 Nov 2026". */
export function extraText(f: Pick<DprOwnField, 'kind' | 'unit'>, v: DprExtraValue | null | undefined): string {
  if (v === null || v === undefined || v === '') return '';
  if (f.kind === 'YES_NO') return v === true ? 'Yes' : v === false ? 'No' : String(v);
  if (f.kind === 'NUMBER') return `${Number(Number(v).toFixed(3))}${f.unit ? ` ${f.unit}` : ''}`;
  if (f.kind === 'DATE' && typeof v === 'string' && DATE.test(v)) {
    const [y, m, d] = v.split('-').map(Number);
    return `${d} ${MONTHS[m - 1]} ${y}`;
  }
  return String(v);
}

/** The fields of a report's form that hold a value, in the form's order, with the value in words. */
export const filledExtra = (fields: DprOwnField[], values: DprExtra | null | undefined): { field: DprOwnField; text: string }[] =>
  fields.flatMap((f) => {
    const text = extraText(f, values?.[f.key]);
    return text ? [{ field: f, text }] : [];
  });

/**
 * Values given by the field's name (Ask Nirmaan's drafts and WhatsApp entries) put under the
 * fields' keys; a name matches a field's English or Hindi name, or its key, ignoring case. Unknown names are left out.
 */
export function extraByLabel(fields: DprOwnField[], byName: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!byName) return out;
  const norm = (s: string) => s.trim().toLowerCase();
  for (const [name, v] of Object.entries(byName)) {
    const f = fields.find((x) => norm(x.label) === norm(name) || (x.labelHi && norm(x.labelHi) === norm(name)) || x.key === name);
    if (f && !isBlank(v)) out[f.key] = v;
  }
  return out;
}
