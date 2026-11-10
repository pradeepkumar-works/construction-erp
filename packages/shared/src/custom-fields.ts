/**
 * Fields of a company's own (ARCHITECTURE "Custom fields"): the kinds of field, how a value of each kind is read, and
 * the key a field keeps for good. The DPR's own fields (`dpr-form.ts`) and the fields a company adds to its vendors,
 * projects and purchase orders (`CustomFieldDef`) are the same fields read by the same rules; a record keeps its values
 * as JSON keyed by the field's key, which never changes once saved; only the label does.
 */

/** The kinds of field a company can add. */
export const FIELD_KINDS = ['TEXT', 'LONG_TEXT', 'NUMBER', 'YES_NO', 'CHOICE', 'DATE', 'TIME'] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];
export const FIELD_KIND_LABELS: Record<FieldKind, string> = {
  TEXT: 'Short text',
  LONG_TEXT: 'Long text',
  NUMBER: 'Number',
  YES_NO: 'Yes or no',
  CHOICE: 'Choice',
  DATE: 'Date',
  TIME: 'Time',
};

/** A field of the company's own. */
export interface OwnField {
  /** camelCase, fixed once saved: the values are kept under it */
  key: string;
  label: string;
  /** Shown on the phone in Hindi; the English label when empty */
  labelHi: string | null;
  kind: FieldKind;
  required: boolean;
  /** NUMBER only */
  unit: string | null;
  min: number | null;
  max: number | null;
  /** CHOICE only */
  options: string[];
}

export type FieldValue = string | number | boolean;
export type FieldValues = Record<string, FieldValue>;

/** Longest text a company's own text field keeps */
export const MAX_OWN_TEXT = 1000;

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && !v.trim());

/** A key for a new field from its name, not one of `taken`: "Rain hours" → rainHours, then rainHours2. */
export function fieldKey(label: string, taken: Iterable<string>): string {
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
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) if (!used.has(`${base}${i}`)) return `${base}${i}`;
}

/** What a field's range says, for a message: "from 0 to 24 h", "of 0 or more". */
const rangeText = (f: OwnField) => {
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
export function readExtra(fields: OwnField[], raw: unknown, opts: { required?: boolean; prefix?: string } = {}): { values: FieldValues; problems: string[] } {
  const values: FieldValues = {};
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** A value as the record, print and export show it: "4.5 h", "Yes", "3 Nov 2026". */
export function extraText(f: Pick<OwnField, 'kind' | 'unit'>, v: FieldValue | null | undefined): string {
  if (v === null || v === undefined || v === '') return '';
  if (f.kind === 'YES_NO') return v === true ? 'Yes' : v === false ? 'No' : String(v);
  if (f.kind === 'NUMBER') return `${Number(Number(v).toFixed(3))}${f.unit ? ` ${f.unit}` : ''}`;
  if (f.kind === 'DATE' && typeof v === 'string' && DATE.test(v)) {
    const [y, m, d] = v.split('-').map(Number);
    return `${d} ${MONTHS[m - 1]} ${y}`;
  }
  return String(v);
}

// The company's fields on its records

/** The records a company can add fields to. */
export const CUSTOM_FIELD_ENTITIES = ['VENDOR', 'PROJECT', 'PURCHASE_ORDER'] as const;
export type CustomFieldEntity = (typeof CUSTOM_FIELD_ENTITIES)[number];

export interface CustomFieldEntityInfo {
  /** The list's name, as the settings tab groups the fields */
  label: string;
  /** One record, in a sentence: "a vendor" */
  record: string;
  /** Required fields wait until the record is sent for approval; otherwise every save needs them */
  requiredAtSubmit: boolean;
}

export const CUSTOM_FIELD_ENTITY_INFO: Record<CustomFieldEntity, CustomFieldEntityInfo> = {
  VENDOR: { label: 'Vendors', record: 'vendor', requiredAtSubmit: false },
  PROJECT: { label: 'Projects', record: 'project', requiredAtSubmit: false },
  PURCHASE_ORDER: { label: 'Purchase orders', record: 'purchase order', requiredAtSubmit: true },
};

/** Active fields one kind of record takes; archived ones do not count. */
export const MAX_CUSTOM_FIELDS = 20;
export const MAX_CUSTOM_CHOICES = 20;
const CUSTOM_LABEL_MAX = 60;

/** A company's field as the API gives it. */
export interface CustomFieldDto extends OwnField {
  id: string;
  entity: CustomFieldEntity;
  sortOrder: number;
  /** An archived field takes no new values; records that have one still show it */
  archived: boolean;
  archivedAt: string | null;
}

/** What an admin sends to add or change a field; `key` and `kind` are set on add and never change. */
export interface CustomFieldInput {
  label: string;
  labelHi?: string | null;
  kind: FieldKind;
  required?: boolean;
  unit?: string | null;
  min?: number | null;
  max?: number | null;
  options?: string[];
}

/** A field as sent, made whole: names trimmed, the parts its kind does not use emptied, choices kept once each. */
export function normaliseCustomField(input: CustomFieldInput): Omit<OwnField, 'key'> {
  const trim = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, max) : null);
  const options: string[] = [];
  for (const o of input.kind === 'CHOICE' && Array.isArray(input.options) ? input.options : []) {
    const s = trim(o, 40);
    if (s && !options.some((x) => x.toLowerCase() === s.toLowerCase())) options.push(s);
  }
  return {
    label: typeof input.label === 'string' ? input.label.trim().replace(/\s+/g, ' ') : '',
    labelHi: trim(input.labelHi, CUSTOM_LABEL_MAX),
    kind: input.kind,
    required: input.required === true,
    unit: input.kind === 'NUMBER' ? trim(input.unit, 12) : null,
    min: input.kind === 'NUMBER' ? numOrNull(input.min) : null,
    max: input.kind === 'NUMBER' ? numOrNull(input.max) : null,
    options,
  };
}

/**
 * Why a field cannot be saved, in words that say what to fix; null when it can. `others` are the entity's other
 * fields, archived ones included (their names stay theirs while a record shows them).
 */
export function customFieldProblem(f: Omit<OwnField, 'key'>, others: Pick<CustomFieldDto, 'label' | 'archived'>[], opts: { adding?: boolean } = {}): string | null {
  if (!(FIELD_KINDS as readonly string[]).includes(f.kind)) return 'Choose what kind of field it is';
  if (!f.label || f.label.length > CUSTOM_LABEL_MAX) return `Give the field a name of 1 to ${CUSTOM_LABEL_MAX} letters`;
  if (others.some((o) => o.label.trim().toLowerCase() === f.label.toLowerCase())) return `Another field is called ${f.label}; give this one another name`;
  if (opts.adding && others.filter((o) => !o.archived).length >= MAX_CUSTOM_FIELDS) return `Keep to ${MAX_CUSTOM_FIELDS} fields; archive one you no longer use first`;
  if (f.kind === 'CHOICE' && f.options.length < 2) return `${f.label}: give at least two choices`;
  if (f.kind === 'CHOICE' && f.options.length > MAX_CUSTOM_CHOICES) return `${f.label}: keep it to ${MAX_CUSTOM_CHOICES} choices`;
  if (f.kind === 'NUMBER' && f.min !== null && f.max !== null && f.min > f.max) return `${f.label}: the smallest value is more than the largest`;
  return null;
}

/**
 * A record's values read against the company's fields, the one way they are read: the active fields through
 * `readExtra` over what the record holds (`before`) with what was sent laid on top, so a value left out stays and a
 * blank one clears it; an archived field keeps what the record holds, whatever is sent; keys of no field are dropped.
 * `required` checks the active required fields (on save, or for a purchase order when it is sent for approval).
 */
export function readCustomValues(defs: Pick<CustomFieldDto, keyof OwnField | 'archived'>[], raw: unknown, opts: { before?: unknown; required?: boolean } = {}): { values: FieldValues; problems: string[] } {
  const before = isObject(opts.before) ? opts.before : {};
  const sent = isObject(raw) ? raw : {};
  const active = defs.filter((d) => !d.archived);
  const read = readExtra(active, { ...before, ...sent }, { required: opts.required });
  const values: FieldValues = { ...read.values };
  for (const d of defs) {
    const kept = before[d.key];
    if (d.archived && (typeof kept === 'string' || typeof kept === 'number' || typeof kept === 'boolean')) values[d.key] = kept;
  }
  return { values, problems: read.problems };
}

/** The fields of a record that hold a value, in the company's order, with the value; archived ones only when filled. */
export function filledCustomValues<F extends Pick<CustomFieldDto, 'key' | 'archived'>>(defs: F[], values: FieldValues | null | undefined): { field: F; value: FieldValue }[] {
  return defs.flatMap((field) => {
    const value = values?.[field.key];
    return value === undefined || value === null || value === '' ? [] : [{ field, value }];
  });
}
