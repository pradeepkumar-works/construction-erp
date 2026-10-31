import type { RoleKey } from './enums';
import { MANPOWER_CATEGORIES } from './labels';
import * as P from './permissions';

/**
 * Masters (ARCHITECTURE "Masters"): the lists a company keeps itself. Each department's menu has a Masters
 * sub-module naming the pages that are masters (items, vendors, the chart of accounts…), and Administration › Masters
 * lists them all. The simple lists here are words a form suggests (trades, designations, categories): their standard
 * entries live in code and a company's rows lay over them by code, so a company renames or switches off a standard entry
 * and adds its own, and a new company starts with the standard list without a seed.
 *
 * Records keep the words, not a key (a trade on an attendance line is "Mason"), so an entry in use is not renamed: add the
 * new one and switch the old one off, as with units.
 */

export const MASTER_LISTS = ['trade', 'designation', 'department', 'itemCategory', 'equipmentCategory', 'letterCategory', 'ncrCategory', 'ncrRootCause', 'instrumentKind', 'vertical'] as const;
export type MasterList = (typeof MASTER_LISTS)[number];

export interface MasterStandardEntry {
  code: string;
  name: string;
  nameHi?: string;
}

export interface MasterListDef {
  key: MasterList;
  /** The page's title, plural ("Trades") */
  label: string;
  /** One entry ("trade"), for buttons and messages */
  singular: string;
  description: string;
  /** Its address under /masters */
  slug: string;
  /** The navigation node that opens it */
  node: string;
  /** What records carry its words, for "In use" */
  usedOn: string;
  /** Who adds, renames and switches entries off */
  manage: (role: RoleKey) => boolean;
  standard: MasterStandardEntry[];
}

/** A list's entry as a code: lower case words joined by hyphens ("Bar bender" → "bar-bender"). */
export function masterCode(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

const entries = (...xs: (string | [string, string])[]): MasterStandardEntry[] =>
  xs.map((x) => (Array.isArray(x) ? { code: masterCode(x[0]), name: x[0], nameHi: x[1] } : { code: masterCode(x), name: x }));

const TRADE_HI: Record<string, string> = {
  Mason: 'राजमिस्त्री',
  Carpenter: 'बढ़ई',
  'Bar Bender': 'सरिया बाँधने वाला',
  Helper: 'हेल्पर',
  Operator: 'ऑपरेटर',
  Driver: 'ड्राइवर',
  Electrician: 'बिजली मिस्त्री',
  Plumber: 'प्लंबर',
  Supervisor: 'सुपरवाइज़र',
  Other: 'अन्य',
};

export const MASTER_LIST_DEFS: Record<MasterList, MasterListDef> = {
  trade: {
    key: 'trade',
    label: 'Trades',
    singular: 'trade',
    description: 'Kinds of labour on the head count, roll call, workers and labour rates.',
    slug: 'trade',
    node: 'site.trades',
    usedOn: 'attendance lines, workers and labour rates',
    manage: (role) => P.canSetLabourRates(role),
    standard: [
      ...MANPOWER_CATEGORIES.filter((c) => c !== 'Other').map((c) => ({ code: masterCode(c), name: c, nameHi: TRADE_HI[c] })),
      ...entries(['Fitter', 'फिटर'], ['Welder', 'वेल्डर'], ['Painter', 'पेंटर'], ['Other', 'अन्य']),
    ],
  },
  designation: {
    key: 'designation',
    label: 'Designations',
    singular: 'designation',
    description: 'Job titles on employee records.',
    slug: 'designation',
    node: 'people.designations',
    usedOn: 'employees',
    manage: (role) => P.canManageStaff(role),
    standard: entries(
      'Managing director',
      'Project manager',
      'Planning engineer',
      'Site engineer',
      'Junior engineer',
      'Site supervisor',
      'Foreman',
      'Quantity surveyor',
      'QA/QC engineer',
      'Lab technician',
      'Safety officer',
      'Surveyor',
      'Design engineer',
      'CAD draughtsperson',
      'Document controller',
      'Store keeper',
      'Purchase officer',
      'Accounts manager',
      'Accounts executive',
      'HR manager',
      'Office assistant',
      'Driver',
    ),
  },
  department: {
    key: 'department',
    label: 'Departments',
    singular: 'department',
    description: 'The departments people work in, on employee records.',
    slug: 'department',
    node: 'people.departments',
    usedOn: 'employees',
    manage: (role) => P.canManageStaff(role),
    standard: entries(
      'Management',
      'Execution',
      'Planning and estimation',
      'Contracts',
      'Purchase',
      'Stores',
      'Plant and machinery',
      'Quality',
      'Design',
      'Safety',
      'Accounts',
      'Human resources',
      'Administration',
    ),
  },
  itemCategory: {
    key: 'itemCategory',
    label: 'Item categories',
    singular: 'item category',
    description: 'Groups of the item master, for stock reports and reorder.',
    slug: 'item-category',
    node: 'materials.itemCategories',
    usedOn: 'items',
    manage: (role) => P.canManageStore(role),
    standard: entries(
      'Cement',
      'Steel',
      'Aggregate and sand',
      'Bricks and blocks',
      'Ready-mix concrete',
      'Pipes and fittings',
      'Electrical',
      'Plumbing and sanitary',
      'Paint and chemicals',
      'Water treatment chemicals',
      'Hardware',
      'Shuttering and scaffolding',
      'Fuel',
      'Spares & lubricants',
      'Safety gear',
      'Consumables',
    ),
  },
  equipmentCategory: {
    key: 'equipmentCategory',
    label: 'Equipment categories',
    singular: 'equipment category',
    description: 'Kinds of machine on the equipment register, rates and norms.',
    slug: 'equipment-category',
    node: 'plant.equipmentCategories',
    usedOn: 'machines',
    manage: (role) => P.canManageEquipment(role),
    standard: entries('Earthmoving', 'Compaction', 'Concreting', 'Lifting', 'Transport', 'Power', 'Pumping', 'Piling and drilling', 'Road work', 'Survey instruments'),
  },
  letterCategory: {
    key: 'letterCategory',
    label: 'Letter categories',
    singular: 'letter category',
    description: 'What a letter is about. Notices, claims, extension of time, hindrance and replies to show cause are contractual: they can need approval and proof of delivery.',
    slug: 'letter-category',
    node: 'correspondence.categories',
    usedOn: 'letters',
    manage: (role) => P.canHeadLetters(role),
    standard: entries(
      'General',
      'Notice',
      'Claim',
      'Extension of time',
      'Hindrance',
      'Reply to show cause',
      'Bill and payment',
      'Drawing and design',
      'Quality',
      'Safety',
      'Variation',
      'Guarantee and insurance',
      'Statutory and tax',
      'Bank',
      'Invitation and meeting',
    ),
  },
  ncrCategory: {
    key: 'ncrCategory',
    label: 'NCR categories',
    singular: 'NCR category',
    description: 'What kind of non-conformance an NCR records, for the monthly report and the trend by category.',
    slug: 'ncr-category',
    node: 'quality.ncrCategories',
    usedOn: 'NCRs',
    manage: (role) => P.canManageChecklists(role),
    standard: entries(
      ['Workmanship', 'कारीगरी'],
      ['Material', 'सामग्री'],
      ['Dimensions and levels', 'माप और लेवल'],
      ['Concrete strength', 'कंक्रीट की मज़बूती'],
      ['Reinforcement', 'सरिया'],
      ['Shuttering', 'शटरिंग'],
      ['Finishes', 'फिनिशिंग'],
      ['Testing not done', 'टेस्ट नहीं हुआ'],
      ['Documentation', 'दस्तावेज़'],
      ['Drawing not followed', 'ड्रॉइंग के अनुसार नहीं'],
      ['Safety', 'सुरक्षा'],
    ),
  },
  ncrRootCause: {
    key: 'ncrRootCause',
    label: 'NCR root causes',
    singular: 'root cause',
    description: 'Why a non-conformance happened, chosen when site answers the NCR, so the same causes can be fixed at their source.',
    slug: 'ncr-root-cause',
    node: 'quality.rootCauses',
    usedOn: 'NCRs',
    manage: (role) => P.canManageChecklists(role),
    standard: entries(
      ['Workmanship or skill', 'कारीगरी या कौशल'],
      ['Supervision', 'निगरानी'],
      ['Method not followed', 'तरीका नहीं अपनाया'],
      ['Material defect', 'सामग्री में दोष'],
      ['Wrong or late drawing', 'गलत या देर से ड्रॉइंग'],
      ['Equipment', 'मशीन'],
      ['Weather', 'मौसम'],
      ['Subcontractor', 'पेटी ठेकेदार'],
      ['Design', 'डिज़ाइन'],
      ['Other', 'अन्य'],
    ),
  },
  instrumentKind: {
    key: 'instrumentKind',
    label: 'Instrument kinds',
    singular: 'instrument kind',
    description: 'Lab and survey instruments kept in the calibration register, each with how often it is calibrated.',
    slug: 'instrument-kind',
    node: 'quality.instrumentKinds',
    usedOn: 'instruments',
    manage: (role) => P.canManageChecklists(role),
    standard: entries(
      'Compression testing machine',
      'Cube moulds',
      'Slump cone',
      'Weighing scale',
      'Batching plant',
      'Sieves',
      'Oven',
      'Total station',
      'Auto level',
      'Pressure gauge',
      'Thermometer',
      'Proving ring',
    ),
  },
  vertical: {
    key: 'vertical',
    label: 'Verticals',
    singular: 'vertical',
    description: "The company's business lines. Each project and tender belongs to one; the header, lists, department screens and reports can show one vertical at a time.",
    slug: 'vertical',
    node: 'projects.verticals',
    usedOn: 'projects and tenders',
    manage: (role) => P.canEditProjects(role),
    standard: entries(['Water', 'जल'], ['Buildings', 'भवन'], ['Irrigation', 'सिंचाई'], ['Roads and bridges', 'सड़क और पुल']),
  },
};

export const masterListBySlug = (slug: string): MasterListDef | undefined => Object.values(MASTER_LIST_DEFS).find((d) => d.slug === slug);

/** Anyone on the company's staff reads the masters; each list says who changes it. */
export const canViewMasters = (role: RoleKey) => !P.isGuest(role);
export const canManageMaster = (role: RoleKey, list: MasterList) => MASTER_LIST_DEFS[list].manage(role);

/** A company's row for a list: a standard code (renamed, switched off or reordered) or one of its own. */
export interface MasterRow {
  code: string;
  name: string;
  nameHi: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface MasterEntryDto {
  code: string;
  name: string;
  nameHi: string | null;
  isActive: boolean;
  /** From the standard list (switched off, never deleted), or the company's own */
  standard: boolean;
  /** Records carrying the name, or null when not counted */
  inUse: number | null;
}

export interface MasterListDto {
  key: MasterList;
  label: string;
  singular: string;
  description: string;
  usedOn: string;
  canManage: boolean;
  entries: MasterEntryDto[];
}

/** Each list's entries in use and in all, for Administration › Masters. */
export interface MasterCountsDto {
  lists: { key: MasterList; active: number; total: number }[];
}

/**
 * The list as the company has it: the standard entries in their order, each replaced by the company's row of the same code,
 * then the company's own entries by their order and name.
 */
export function mergeMaster(list: MasterList, rows: MasterRow[]): Omit<MasterEntryDto, 'inUse'>[] {
  const own = new Map(rows.map((r) => [r.code, r]));
  const std = MASTER_LIST_DEFS[list].standard.map((s) => {
    const r = own.get(s.code);
    return { code: s.code, name: r?.name ?? s.name, nameHi: r ? r.nameHi : (s.nameHi ?? null), isActive: r?.isActive ?? true, standard: true };
  });
  const standardCodes = new Set(MASTER_LIST_DEFS[list].standard.map((s) => s.code));
  const added = rows
    .filter((r) => !standardCodes.has(r.code))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((r) => ({ code: r.code, name: r.name, nameHi: r.nameHi, isActive: r.isActive, standard: false }));
  return [...std, ...added];
}

/** The names a form suggests: the entries switched on. */
export const masterNames = (entries: { name: string; isActive: boolean }[]) => entries.filter((e) => e.isActive).map((e) => e.name);

export const MASTER_NAME_MAX = 80;

/**
 * What is wrong with an entry about to be saved, or null. `editing` is the code being changed (null for a new one);
 * `inUse` how many records carry its present name.
 */
export function masterProblem(
  entry: { name: string; nameHi?: string | null },
  current: { code: string; name: string }[],
  editing: { code: string; name: string; inUse: number } | null,
): string | null {
  const name = entry.name.trim();
  if (!name) return 'Enter the name';
  if (name.length > MASTER_NAME_MAX) return `Keep the name to ${MASTER_NAME_MAX} characters`;
  if ((entry.nameHi ?? '').trim().length > MASTER_NAME_MAX) return `Keep the Hindi name to ${MASTER_NAME_MAX} characters`;
  if (!masterCode(name)) return 'Use letters or numbers in the name';
  const clash = current.find((c) => c.code !== editing?.code && c.name.trim().toLowerCase() === name.toLowerCase());
  if (clash) return `${clash.name} is already in the list`;
  if (editing && editing.inUse > 0 && editing.name.trim().toLowerCase() !== name.toLowerCase()) {
    return `${editing.inUse} record${editing.inUse === 1 ? '' : 's'} use ${editing.name}; add the new name and switch this one off`;
  }
  return null;
}

/** The code a new entry gets: from its name, and unique in the list (a second "Fitter" made "fitter-2"). */
export function newMasterCode(name: string, taken: Iterable<string>): string {
  const base = masterCode(name);
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) if (!used.has(`${base}-${i}`)) return `${base}-${i}`;
}
