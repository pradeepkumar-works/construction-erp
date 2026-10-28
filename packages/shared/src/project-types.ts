/**
 * Project types and component kinds a company sets up itself (item 134, ARCHITECTURE "Project types"). A type is built
 * on one of the built-in kinds (`ProjectType`), which every rule that reads `Project.type` keeps reading; the type adds
 * its name, where its work is located, whether it has a pipe network, the component kinds it offers first, its starting
 * breakdown and its loose activities. A component kind is built on a `WorkElementType` (pipe network, reconciliation and
 * pipe sizes read that) and carries its spec fields and steps.
 *
 * The standard types and kinds below are what a company uses until it saves its own copy (matched by code), so a new
 * company needs no seeding, as with activity templates before them.
 */
import type { ContractModel, ProjectType, WorkElementType, WorkLocation } from './enums';
import { WORK_ELEMENT_TYPES } from './enums';
import { WORK_ELEMENT_TYPE_LABELS } from './labels';
import { LOCATIONS_OF_BASE } from './sector';
import { DEFAULT_ACTIVITY_TEMPLATES, MAX_TEMPLATE_DAYS, MAX_TEMPLATE_ITEMS, type ActivityTemplateItem } from './templates';
import { ELEMENT_SPEC_FIELDS, ELEMENT_TYPES_FOR, MAX_LIFTS, RCC_PARTS, STANDARD_STEPS, kindPlan, type ComponentStep, type ElementActivityLine, type ElementSpecField, type ElementSpecs } from './element-templates';

/** A kind of component a company lays out: its specs and its steps, built on a `WorkElementType`. */
export interface ComponentKindDef {
  /** Upper-case key, unique in the company; a built-in kind's code is its `WorkElementType` */
  code: string;
  name: string;
  elementType: WorkElementType;
  specFields: ElementSpecField[];
  steps: ComponentStep[];
  active: boolean;
}

/** One component or sub-component of a type's starting breakdown. */
export interface StartComponent {
  /** Key inside the breakdown, so a sub-component can name its component */
  key: string;
  parentKey: string | null;
  /** A component kind's code */
  kind: string;
  name: string;
  /** How many a new project usually has; 3 lays out "Overhead tank 1" to "Overhead tank 3" */
  count: number;
  specs?: ElementSpecs | null;
  /** Share of the project (or of its component) of each copy, %; null shares what is left by BOQ value */
  weightPct?: number | null;
}

export interface ProjectTypeDef {
  /** Upper-case key, unique in the company; a standard type's code is fixed */
  code: string;
  name: string;
  /** The built-in kind it is built on: `Project.type` of its projects */
  baseType: ProjectType;
  description: string;
  locations: WorkLocation[];
  pipeNetwork: boolean;
  contractModel: ContractModel;
  /** Component kinds offered first when adding a component (codes) */
  kinds: string[];
  breakdown: StartComponent[];
  /** Loose activities with their usual schedule, outside the breakdown */
  activities: ActivityTemplateItem[];
  active: boolean;
}

/** Built-in kinds a company's type may be built on: a plant or a store has no breakdown or DPR of its own. */
export const TYPE_BASES = ['ROAD', 'BUILDING', 'WATER_SUPPLY', 'SEWERAGE', 'OTHER'] as const satisfies readonly ProjectType[];
export const isTypeBase = (t: ProjectType): t is (typeof TYPE_BASES)[number] => (TYPE_BASES as readonly string[]).includes(t);

export const MAX_KIND_STEPS = 40;
export const MAX_SPEC_FIELDS = 8;
export const MAX_BREAKDOWN = 60;
export const MAX_COMPONENT_COUNT = 20;
export const CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,39}$/;
const SPEC_KEY = /^[a-z][A-Za-z]{0,29}$/;

/** The built-in kinds as data: today's templates, unchanged. */
export const STANDARD_COMPONENT_KINDS: ComponentKindDef[] = WORK_ELEMENT_TYPES.map((t) => ({
  code: t,
  name: WORK_ELEMENT_TYPE_LABELS[t],
  elementType: t,
  specFields: ELEMENT_SPEC_FIELDS[t],
  steps: STANDARD_STEPS[t],
  active: true,
}));

const c = (key: string, kind: WorkElementType, name: string, extra: Partial<StartComponent> = {}): StartComponent => ({ key, parentKey: null, kind, name, count: 1, ...extra });
const sub = (key: string, parentKey: string, kind: WorkElementType, name: string): StartComponent => ({ key, parentKey, kind, name, count: 1 });

/**
 * The six standard types (the design's "Default templates shipped"). Their loose activities are today's lists, so a
 * company that only uses them sees no change; the starting breakdown is offered at New project.
 */
export const STANDARD_PROJECT_TYPES: ProjectTypeDef[] = [
  {
    code: 'ROAD',
    name: 'Road',
    baseType: 'ROAD',
    description: 'Roads and highways, located by chainage.',
    locations: ['CHAINAGE'],
    pipeNetwork: false,
    contractModel: 'ITEM_RATE',
    kinds: ELEMENT_TYPES_FOR.ROAD,
    breakdown: [c('1', 'ROAD_STRETCH', 'Main carriageway')],
    activities: DEFAULT_ACTIVITY_TEMPLATES.ROAD,
    active: true,
  },
  {
    code: 'BUILDING',
    name: 'Building',
    baseType: 'BUILDING',
    description: 'Buildings, located by floor.',
    locations: ['FLOOR'],
    pipeNetwork: false,
    contractModel: 'ITEM_RATE',
    kinds: ELEMENT_TYPES_FOR.BUILDING,
    breakdown: [c('1', 'BLOCK', 'Main block', { specs: { floors: 3 } }), c('2', 'EM_PACKAGE', 'Building services')],
    activities: DEFAULT_ACTIVITY_TEMPLATES.BUILDING,
    active: true,
  },
  {
    code: 'WATER_SUPPLY',
    name: 'Town water scheme',
    baseType: 'WATER_SUPPLY',
    description: 'Intake to taps: treatment, storage, network and house connections, located by village.',
    locations: ['CHAINAGE', 'VILLAGE'],
    pipeNetwork: true,
    contractModel: 'ITEM_RATE',
    kinds: ELEMENT_TYPES_FOR.WATER_SUPPLY,
    breakdown: [
      c('1', 'INTAKE_WELL', 'Intake well'),
      c('2', 'PUMP_HOUSE', 'Raw water pump house'),
      c('3', 'RISING_MAIN', 'Raw water rising main'),
      c('4', 'WTP', 'Water treatment plant'),
      sub('4.1', '4', 'WTP_UNIT', 'Clariflocculator'),
      sub('4.2', '4', 'WTP_UNIT', 'Rapid sand filters'),
      c('5', 'SUMP', 'Clear water sump'),
      c('6', 'FEEDER_MAIN', 'Clear water feeder main'),
      c('7', 'OHT', 'Overhead tank', { count: 2 }),
      c('8', 'PIPE_ZONE', 'Distribution zone', { count: 2 }),
      c('9', 'HOUSE_CONNECTIONS', 'House connections'),
      c('10', 'ROAD_RESTORATION', 'Road restoration'),
      c('11', 'HT_FEEDER', 'HT power line'),
      c('12', 'EM_PACKAGE', 'Pumps and electricals'),
    ],
    activities: DEFAULT_ACTIVITY_TEMPLATES.WATER_SUPPLY,
    active: true,
  },
  {
    code: 'TRANSMISSION_MAIN',
    name: 'Transmission main',
    baseType: 'WATER_SUPPLY',
    description: 'A long pipeline from source to towns, located by chainage and pipe segment.',
    locations: ['CHAINAGE'],
    pipeNetwork: true,
    contractModel: 'ITEM_RATE',
    kinds: ['RISING_MAIN', 'FEEDER_MAIN', 'CROSSING', 'PUMP_HOUSE', 'SUMP', 'EM_PACKAGE', 'HT_FEEDER', 'ROAD_RESTORATION'],
    breakdown: [c('1', 'RISING_MAIN', 'Transmission main'), c('2', 'CROSSING', 'Crossing', { count: 2 }), c('3', 'EM_PACKAGE', 'Pumping and valves')],
    activities: [
      { name: 'Survey and alignment approval', unit: 'LS', startDay: 0, durationDays: 45 },
      { name: 'Right of way and permissions', unit: 'LS', startDay: 15, durationDays: 90 },
      { name: 'Trial run and commissioning', unit: 'LS', startDay: 330, durationDays: 45 },
    ],
    active: true,
  },
  {
    code: 'SEWERAGE',
    name: 'Sewerage',
    baseType: 'SEWERAGE',
    description: 'Sewer network, pumping stations and treatment, located by chainage.',
    locations: ['CHAINAGE'],
    pipeNetwork: true,
    contractModel: 'ITEM_RATE',
    kinds: ELEMENT_TYPES_FOR.SEWERAGE,
    breakdown: [
      c('1', 'PIPE_ZONE', 'Sewer zone', { count: 2 }),
      c('2', 'PUMP_HOUSE', 'Pumping station'),
      c('3', 'GENERAL', 'Sewage treatment plant'),
      sub('3.1', '3', 'STP_UNIT', 'Aeration tank'),
      sub('3.2', '3', 'STP_UNIT', 'Secondary clarifier'),
      c('4', 'HOUSE_CONNECTIONS', 'Property connections'),
      c('5', 'ROAD_RESTORATION', 'Road restoration'),
      c('6', 'EM_PACKAGE', 'Pumps and electricals'),
    ],
    activities: DEFAULT_ACTIVITY_TEMPLATES.SEWERAGE,
    active: true,
  },
  {
    code: 'GENERAL',
    name: 'General works',
    baseType: 'OTHER',
    description: 'Any other work; its activities are the ones the company adds.',
    locations: [],
    pipeNetwork: false,
    contractModel: 'ITEM_RATE',
    kinds: [],
    breakdown: [],
    activities: [],
    active: true,
  },
];

/** The standard type a project of a built-in kind belongs to when it names none (projects made before item 134). */
export const STANDARD_TYPE_FOR: Record<ProjectType, string | null> = {
  ROAD: 'ROAD',
  BUILDING: 'BUILDING',
  WATER_SUPPLY: 'WATER_SUPPLY',
  SEWERAGE: 'SEWERAGE',
  OTHER: 'GENERAL',
  PLANT: null,
  STORE: null,
};

/** A project's type code: its own, else the standard type of its built-in kind. */
export const typeCodeOf = (p: { type: ProjectType; typeCode?: string | null }): string | null => p.typeCode ?? STANDARD_TYPE_FOR[p.type];

/**
 * The company's library: the standard entries, each replaced by the company's row of the same code, then the company's
 * own codes. Archived ones stay in the list (marked) so old projects still find theirs.
 */
export function overlay<T extends { code: string }>(standard: T[], own: T[]): (T & { standard: boolean; edited: boolean })[] {
  const byCode = new Map(own.map((o) => [o.code, o]));
  const std = new Set(standard.map((s) => s.code));
  return [
    ...standard.map((s) => ({ ...(byCode.get(s.code) ?? s), standard: true, edited: byCode.has(s.code) })),
    ...own.filter((o) => !std.has(o.code)).map((o) => ({ ...o, standard: false, edited: true })),
  ];
}

/** What a project's type turns on (item 134): its places and its pipe network. One answer for the API, web and phone. */
export function projectFeatures(type: ProjectType, def: Pick<ProjectTypeDef, 'locations' | 'pipeNetwork'> | null | undefined): { locations: WorkLocation[]; pipeNetwork: boolean } {
  if (!def || !isTypeBase(type)) return { locations: LOCATIONS_OF_BASE[type], pipeNetwork: type === 'WATER_SUPPLY' || type === 'SEWERAGE' };
  return { locations: def.locations, pipeNetwork: def.pipeNetwork };
}

const near100 = (n: number) => Math.abs(n - 100) < 0.01;
const sum = (xs: { weightPct: number }[]) => xs.reduce((t, x) => t + (Number(x.weightPct) || 0), 0);
const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

/** What is wrong with a component kind, in words an admin can act on; empty when it is fine. */
export function componentKindProblems(kind: ComponentKindDef): string[] {
  const out: string[] = [];
  if (!CODE_PATTERN.test(kind.code)) out.push('The code is 2 to 40 capital letters, digits or _, starting with a letter, e.g. OHT_4M');
  if (!kind.name?.trim() || kind.name.trim().length < 2) out.push('Name the kind, e.g. Overhead tank');
  if (!(WORK_ELEMENT_TYPES as readonly string[]).includes(kind.elementType)) out.push('Choose what it is built on');
  if (kind.specFields.length > MAX_SPEC_FIELDS) out.push(`At most ${MAX_SPEC_FIELDS} spec fields`);
  const keys = new Set<string>();
  for (const f of kind.specFields) {
    if (!SPEC_KEY.test(f.key)) out.push(`Spec "${f.label}": its key is letters only, starting with a small letter, e.g. stagingM`);
    else if (keys.has(f.key)) out.push(`Spec key ${f.key} is used twice`);
    keys.add(f.key);
    if (!f.label?.trim()) out.push(`Spec ${f.key}: give it a label`);
    if (!f.unit?.trim()) out.push(`Spec ${f.key}: give it a unit`);
  }
  if (kind.steps.length > MAX_KIND_STEPS) out.push(`At most ${MAX_KIND_STEPS} steps`);
  const names = new Set<string>();
  for (const s of kind.steps) {
    const name = s.name?.trim() ?? '';
    if (!name) {
      out.push('Every step needs a name');
      continue;
    }
    if (names.has(name.toLowerCase())) out.push(`Step "${name}" is listed twice`);
    names.add(name.toLowerCase());
    if (!(Number(s.weightPct) > 0)) out.push(`${name}: give it a weight above 0%`);
    if ((s.kind === 'plain' || s.kind === 'group') && !s.unit?.trim()) out.push(`${name}: give it a unit`);
    if (s.kind === 'plain' && s.qtyFrom && !keys.has(s.qtyFrom)) out.push(`${name}: its quantity comes from ${s.qtyFrom}, which is not a spec of this kind`);
    if (s.kind === 'lifts') {
      if (s.over !== 'floors' && !keys.has(s.over)) out.push(`${name}: lifts are counted over a spec of this kind, e.g. a height`);
      if (s.over === 'floors' && !keys.has('floors')) out.push(`${name}: lifts by floor need a floors spec`);
    }
    if ((s.kind === 'rcc' || s.kind === 'lifts') && s.parts?.length) {
      if (!near100(sum(s.parts))) out.push(`${name}: its parts add up to ${fmt(sum(s.parts))}%, not 100%`);
      if (s.parts.some((p) => !p.name?.trim() || !p.unit?.trim())) out.push(`${name}: every part needs a name and a unit`);
    }
    if (s.kind === 'group') {
      if (!s.subs.length) out.push(`${name}: add its sub-activities`);
      else if (!near100(sum(s.subs))) out.push(`${name}: its sub-activities add up to ${fmt(sum(s.subs))}%, not 100%`);
      for (const p of s.subs) {
        if (!p.name?.trim() || !p.unit?.trim()) out.push(`${name}: every sub-activity needs a name and a unit`);
        if (p.qtyFrom && !keys.has(p.qtyFrom)) out.push(`${name} › ${p.name}: its quantity comes from ${p.qtyFrom}, which is not a spec of this kind`);
      }
    }
  }
  if (kind.steps.length && !near100(sum(kind.steps))) out.push(`The steps add up to ${fmt(sum(kind.steps))}%, not 100%`);
  return out;
}

/** What is wrong with a project type, given the company's kinds; empty when it is fine. */
export function projectTypeProblems(type: ProjectTypeDef, kinds: Pick<ComponentKindDef, 'code'>[]): string[] {
  const out: string[] = [];
  const known = new Set(kinds.map((k) => k.code));
  if (!CODE_PATTERN.test(type.code)) out.push('The code is 2 to 40 capital letters, digits or _, starting with a letter, e.g. BRIDGE');
  if (!type.name?.trim() || type.name.trim().length < 2) out.push('Name the type, e.g. Bridge');
  if (!isTypeBase(type.baseType)) out.push('Choose what it is built on: road, building, water supply, sewerage or other works');
  if (type.pipeNetwork && type.baseType !== 'WATER_SUPPLY' && type.baseType !== 'SEWERAGE') out.push('Only a water supply or sewerage type has a pipe network');
  for (const k of type.kinds) if (!known.has(k)) out.push(`Component kind ${k} is not in the company's library`);
  if (type.breakdown.length > MAX_BREAKDOWN) out.push(`At most ${MAX_BREAKDOWN} components in the starting breakdown`);
  const keys = new Set<string>();
  const top = new Set(type.breakdown.filter((b) => !b.parentKey).map((b) => b.key));
  for (const b of type.breakdown) {
    const name = b.name?.trim() || b.key;
    if (keys.has(b.key)) out.push(`Component ${b.key} appears twice`);
    keys.add(b.key);
    if (!b.name?.trim()) out.push(`Component ${b.key}: give it a name`);
    if (!known.has(b.kind)) out.push(`${name}: its kind ${b.kind} is not in the company's library`);
    if (b.parentKey && !top.has(b.parentKey)) out.push(`${name}: its component is not in the breakdown`);
    if (!Number.isInteger(b.count) || b.count < 1 || b.count > MAX_COMPONENT_COUNT) out.push(`${name}: the usual count is 1 to ${MAX_COMPONENT_COUNT}`);
    if (b.parentKey && b.count !== 1) out.push(`${name}: a sub-component is laid out once per copy of its component`);
    if (b.weightPct !== null && b.weightPct !== undefined && (b.weightPct < 0 || b.weightPct > 100)) out.push(`${name}: its weight is 0 to 100%`);
  }
  const groups = new Map<string | null, StartComponent[]>();
  for (const b of type.breakdown) groups.set(b.parentKey, [...(groups.get(b.parentKey) ?? []), b]);
  for (const [parent, list] of groups) {
    const set = list.filter((b) => b.weightPct !== null && b.weightPct !== undefined);
    const total = set.reduce((t, b) => t + Number(b.weightPct) * b.count, 0);
    if (set.length === list.length && set.length && !near100(total)) out.push(`${parent ? `Inside ${parent}, the` : 'The'} components' weights add up to ${fmt(total)}%, not 100%; leave weights empty to share by BOQ value`);
    if (set.length < list.length && total > 100.01) out.push(`${parent ? `Inside ${parent}, the` : 'The'} weights given add up to more than 100%`);
  }
  if (type.activities.length > MAX_TEMPLATE_ITEMS) out.push(`At most ${MAX_TEMPLATE_ITEMS} loose activities`);
  const acts = new Set<string>();
  for (const a of type.activities) {
    if (acts.has(a.name.toLowerCase())) out.push(`"${a.name}" is listed twice`);
    acts.add(a.name.toLowerCase());
    if (a.startDay < 0 || a.durationDays < 1 || a.startDay + a.durationDays > MAX_TEMPLATE_DAYS) out.push(`${a.name}: the start and duration fit within ${MAX_TEMPLATE_DAYS} days`);
  }
  return out;
}

/** One component a New project lays out, with its activities. */
export interface LaidOutComponent {
  key: string;
  parentKey: string | null;
  kind: string;
  elementType: WorkElementType;
  name: string;
  specs: ElementSpecs | null;
  weightPct: number | null;
  activities: ElementActivityLine[];
}

/** A New project's pick from the starting breakdown: a top-level component and how many of it. */
export interface BreakdownPick {
  key: string;
  count: number;
}

/**
 * The components a new project gets from its type (item 134): each picked component `count` times ("Overhead tank 1",
 * "Overhead tank 2"), each copy taking the weight given (per copy), and its sub-components under every copy. Kinds the company
 * archived or no longer has are skipped with the rest of their branch. When every component laid out has a weight and
 * the counts picked differ from the usual ones (three piers, not four), the weights are scaled to add up to 100% again.
 */
export function layOutBreakdown(type: Pick<ProjectTypeDef, 'breakdown'>, kinds: ComponentKindDef[], picks: BreakdownPick[]): LaidOutComponent[] {
  const byCode = new Map(kinds.map((k) => [k.code, k]));
  const out: LaidOutComponent[] = [];
  const subsOf = (key: string) => type.breakdown.filter((b) => b.parentKey === key);
  for (const pick of picks) {
    const top = type.breakdown.find((b) => b.key === pick.key && !b.parentKey);
    const kind = top && byCode.get(top.kind);
    const n = Math.max(0, Math.min(MAX_COMPONENT_COUNT, Math.floor(pick.count)));
    if (!top || !kind || !n) continue;
    const weight = top.weightPct ?? null;
    for (let i = 1; i <= n; i++) {
      const key = n === 1 ? top.key : `${top.key}#${i}`;
      out.push({ key, parentKey: null, kind: kind.code, elementType: kind.elementType, name: n === 1 ? top.name : `${top.name} ${i}`, specs: top.specs ?? null, weightPct: weight, activities: kindPlan(kind, top.specs) });
      for (const s of subsOf(top.key)) {
        const sk = byCode.get(s.kind);
        if (!sk) continue;
        out.push({ key: `${key}/${s.key}`, parentKey: key, kind: sk.code, elementType: sk.elementType, name: s.name, specs: s.specs ?? null, weightPct: s.weightPct ?? null, activities: kindPlan(sk, s.specs) });
      }
    }
  }
  const tops = out.filter((c) => !c.parentKey);
  const total = tops.reduce((t, c) => t + (c.weightPct ?? 0), 0);
  if (tops.length && tops.every((c) => c.weightPct !== null) && total > 0 && !near100(total)) {
    for (const c of tops) c.weightPct = Math.round((c.weightPct! * 10000) / total) / 100;
    // What rounding leaves goes on the last one, so they add up to 100 exactly.
    const last = tops[tops.length - 1];
    last.weightPct = Math.round((100 - tops.slice(0, -1).reduce((t, c) => t + c.weightPct!, 0)) * 100) / 100;
  }
  return out;
}

/** The defaults a New project shows: every top-level component at its usual count. */
export const defaultPicks = (type: Pick<ProjectTypeDef, 'breakdown'>): BreakdownPick[] => type.breakdown.filter((b) => !b.parentKey).map((b) => ({ key: b.key, count: b.count }));

/** A new, empty kind built on `elementType`, starting from that built-in kind's specs and steps. */
export const kindFrom = (code: string, name: string, elementType: WorkElementType): ComponentKindDef => ({
  code,
  name,
  elementType,
  specFields: ELEMENT_SPEC_FIELDS[elementType].map((f) => ({ ...f })),
  steps: JSON.parse(JSON.stringify(STANDARD_STEPS[elementType])) as ComponentStep[],
  active: true,
});

/** The parts an RCC step uses when it names none. */
export const STANDARD_RCC_PARTS = RCC_PARTS.map(({ name, unit, weightPct }) => ({ name, unit, weightPct }));
export { MAX_LIFTS };

/* ---------- API shapes ---------- */

export interface ProjectTypeDto extends ProjectTypeDef {
  /** A standard type (the company may have its own copy of it) */
  standard: boolean;
  /** The company saved its own copy */
  edited: boolean;
  /** Saves so far; a project remembers the one it was made with */
  version: number;
  projects: number;
  updatedAt: string | null;
  updatedByName: string | null;
  /** Days from the loose activities' first start to their last finish */
  spanDays: number;
}

export interface ComponentKindDto extends ComponentKindDef {
  standard: boolean;
  edited: boolean;
  version: number;
  /** Components of the company's projects laid out from it */
  components: number;
  updatedAt: string | null;
}
