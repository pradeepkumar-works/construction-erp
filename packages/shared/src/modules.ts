import type { SubmissionType } from './enums';
import type { Figure } from './figures';
import { NAV_TREE } from './navigation';
import type { ModuleProgressDto } from './project-progress';
import type { OtherDecisionGroupDto, OtherDecisionKind } from './approvals';

/**
 * Module screens: every module on Home that is not a page itself has a screen at
 * `/modules/<key>`, with a tile for each of its pages (from the navigation tree) above its figures from
 * `GET /dashboard/modules/:key`. Each figure is left out for a role that may not see its list, and covers only the projects
 * the caller sees (or the header's project). The keys are the modules' ids in `NAV_TREE`.
 */
export const MODULE_KEYS = ['projects', 'site', 'quality', 'safety', 'documents', 'correspondence', 'materials', 'plant', 'purchases', 'subcontracts', 'billing', 'tenders', 'rmc', 'accounts', 'people', 'payroll', 'reports', 'admin'] as const;
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
  safety: [],
  documents: [],
  correspondence: [],
  materials: ['MATERIAL_REQUEST'],
  plant: ['MACHINERY'],
  purchases: ['SUPPLIER_CHOICE', 'PURCHASE_ORDER', 'VENDOR_BILL'],
  subcontracts: ['WORK_ORDER', 'WO_AMENDMENT', 'SUBCONTRACT_BILL'],
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
  /** Headline figures (`figure()`), each behind the permission of the list it counts */
  figures: Figure[];
  /** Entries in this module the caller can decide now, most first */
  waiting: ModuleWaitingDto[];
  /** The caller's own entries in this module that were sent back or turned down */
  sentBack: { type: SubmissionType; count: number }[];
  /** The caller's entries in this module still waiting with someone else */
  waitingWithOthers: number;
  /** Projects only: each contract project's physical and financial progress (`project-progress.ts`) */
  progress?: ModuleProgressDto;
  /** Decisions with an approval of their own that wait on the caller in this module (leave, salary runs…), as Approvals lists them */
  others: OtherDecisionGroupDto[];
}

/** The decisions outside the submission queue that each module's screen shows as waiting (`OTHER_DECISION_KINDS`). */
export const MODULE_OTHER_DECISIONS: Partial<Record<ModuleKey, readonly OtherDecisionKind[]>> = {
  people: ['LEAVE', 'OVERTIME', 'CORRECTION'],
  payroll: ['PAYROLL_RUN'],
  accounts: ['VOUCHER'],
  correspondence: ['LETTER'],
};
