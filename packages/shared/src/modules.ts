import type { SubmissionType } from './enums';
import { NAV_TREE } from './navigation';
import type { ModuleProgressDto } from './project-progress';

/**
 * Module screens (v6 item 98, launcher phase 1): every module on Home that is not a page itself has a screen at
 * `/modules/<key>`, with a tile for each of its pages (from the navigation tree) above its figures from
 * `GET /dashboard/modules/:key`. Each figure is left out for a role that may not see its list, and covers only the projects
 * the caller sees (or the header's project). The keys are the modules' ids in `NAV_TREE`.
 */
export const MODULE_KEYS = ['projects', 'site', 'quality', 'documents', 'materials', 'plant', 'purchases', 'subcontracts', 'billing', 'tenders', 'rmc', 'accounts', 'people', 'payroll', 'reports', 'admin'] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

const moduleNode = (key: ModuleKey) => {
  const node = NAV_TREE.find((n) => n.id === key && n.parent === null);
  if (!node) throw new Error(`Module ${key} is not in NAV_TREE`);
  return node;
};

/** The module's name: its tile on Home, its sidebar section, its screen's title and in Search. */
export const MODULE_LABELS = Object.fromEntries(MODULE_KEYS.map((k) => [k, moduleNode(k).label])) as Record<ModuleKey, string>;

/** One line under the module's title. */
export const MODULE_INTROS = Object.fromEntries(MODULE_KEYS.map((k) => [k, moduleNode(k).description])) as Record<ModuleKey, string>;

/** The submission types each module's "Waiting for you" counts. */
export const MODULE_SUBMISSION_TYPES: Record<ModuleKey, SubmissionType[]> = {
  projects: [],
  site: ['DPR', 'PROGRESS', 'MEASUREMENT', 'EXPENSE'],
  quality: ['INSPECTION'],
  documents: [],
  materials: ['MATERIAL_REQUEST'],
  plant: ['MACHINERY'],
  purchases: ['PURCHASE_ORDER', 'VENDOR_BILL'],
  subcontracts: ['WORK_ORDER', 'SUBCONTRACT_BILL'],
  billing: ['BILL'],
  tenders: [],
  rmc: [],
  accounts: ['PAYMENT_REQUEST'],
  people: [],
  payroll: [],
  reports: [],
  admin: [],
};

export const isModuleKey = (k: string): k is ModuleKey => (MODULE_KEYS as readonly string[]).includes(k);

/** How a figure is shown: a count, rupees, a count out of a total ("4 of 6"), or a percentage. */
export type ModuleFigureFormat = 'count' | 'money' | 'ratio' | 'percent';
/** `warning` and `danger` mark a figure that needs someone (always said in words too, in `note`). */
export type ModuleFigureTone = 'default' | 'warning' | 'danger';

export interface ModuleFigureDto {
  key: string;
  label: string;
  /** A count or rupees as a string; for `ratio`, the part */
  value: string;
  /** For `ratio`: the whole */
  of?: number | null;
  format: ModuleFigureFormat;
  /** What the figure stands against, or why it needs someone ("3 overdue", "2 sites not reported") */
  note?: string | null;
  /** Rupees the note's `{money}` stands for, formatted by the client */
  noteMoney?: string | null;
  tone?: ModuleFigureTone;
  /** The list behind the figure */
  href: string;
}

export interface ModuleWaitingDto {
  type: SubmissionType;
  count: number;
  /** Days the oldest has waited */
  oldestDays: number;
  /** Sum of the amounts, for roles that see cost; null otherwise */
  amount: string | null;
}

export interface ModuleHomeDto {
  module: ModuleKey;
  date: string;
  figures: ModuleFigureDto[];
  /** Entries in this module the caller can decide now, most first */
  waiting: ModuleWaitingDto[];
  /** The caller's own entries in this module that were sent back or turned down */
  sentBack: { type: SubmissionType; count: number }[];
  /** The caller's entries in this module still waiting with someone else */
  waitingWithOthers: number;
  /** Projects only: each contract project's physical and financial progress (`project-progress.ts`) */
  progress?: ModuleProgressDto;
}
