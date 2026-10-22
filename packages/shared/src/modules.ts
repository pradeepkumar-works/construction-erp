import type { SubmissionType } from './enums';

/**
 * Module home pages (v6 item 98): every sidebar section is a module with an overview page at `/modules/<key>`, from
 * `GET /dashboard/modules/:key`. Each figure is left out for a role that may not see its list, and covers only the
 * projects the caller sees (or the header's project).
 */
export const MODULE_KEYS = ['site', 'materials', 'purchases', 'billing', 'people'] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

/** The module's name: the same as its sidebar section, its page title and in Search. */
export const MODULE_LABELS: Record<ModuleKey, string> = {
  site: 'Site',
  materials: 'Materials and plant',
  purchases: 'Purchases',
  billing: 'Billing',
  people: 'People',
};

/** One line under the module's title. */
export const MODULE_INTROS: Record<ModuleKey, string> = {
  site: 'Daily reports, attendance, progress, quality, safety and site cash at your sites.',
  materials: 'Material requests, stock at each site, machines and fuel.',
  purchases: 'Orders, supplier and subcontractor bills, and what we owe.',
  billing: 'Client bills, variations, what clients owe us, guarantees and tax.',
  people: 'Staff, attendance, leave and payroll inputs.',
};

/** The submission types each module's "Waiting for you" counts. */
export const MODULE_SUBMISSION_TYPES: Record<ModuleKey, SubmissionType[]> = {
  site: ['DPR', 'PROGRESS', 'MEASUREMENT', 'INSPECTION', 'EXPENSE'],
  materials: ['MATERIAL_REQUEST', 'MACHINERY'],
  purchases: ['PURCHASE_ORDER', 'VENDOR_BILL', 'WORK_ORDER', 'SUBCONTRACT_BILL', 'PAYMENT_REQUEST'],
  billing: ['BILL'],
  people: [],
};

export const isModuleKey = (k: string): k is ModuleKey => (MODULE_KEYS as readonly string[]).includes(k);

/** How a figure is shown: a count, rupees, or a count out of a total ("4 of 6"). */
export type ModuleFigureFormat = 'count' | 'money' | 'ratio';
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
}
