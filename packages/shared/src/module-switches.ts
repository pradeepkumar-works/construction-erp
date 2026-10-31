import type { RoleKey } from './enums';
import type { ModuleKey } from './modules';

/**
 * Module switches (v6 item 117): the parts of the product a company may not use. An admin turns one off; it leaves the
 * sidebar, Search, the New menu and Ask, its pages say it is off, and the API refuses its routes. Nothing is deleted, so
 * turning it on again brings everything back. The plan (`MODULE_TIERS`, set from the console) decides which a company has.
 * Daily reports, progress, requests, orders, bills and the rest of the core are never switched off.
 */
export const SWITCHABLE_MODULES = [
  'meetings',
  'material_approvals',
  'safety',
  'imprest',
  'compliance',
  'tenders',
  'subcontract_enquiries',
  'books',
  'payroll',
  'biometric',
  'rmc',
  'machine_loans',
] as const;
export type SwitchableModule = (typeof SWITCHABLE_MODULES)[number];

export interface SwitchableModuleInfo {
  label: string;
  description: string;
  /** Its pages on the web and the phone: a path is the module's when it is one of these or under one */
  paths: string[];
  /** The sidebar section it sits in */
  section: ModuleKey;
}

export const SWITCHABLE_MODULE_INFO: Record<SwitchableModule, SwitchableModuleInfo> = {
  meetings: { label: 'Meetings', description: 'Minutes of meetings and the actions they give out.', paths: ['/meetings'], section: 'site' },
  material_approvals: { label: 'Material approvals', description: 'Approved makes, and make and sample approvals from the client.', paths: ['/material-approvals'], section: 'materials' },
  safety: { label: 'Safety', description: 'Incidents and near misses, toolbox talks, permits to work and PPE.', paths: ['/safety', '/ppe'], section: 'safety' },
  imprest: { label: 'Site imprest', description: 'Petty cash floats at sites, top-ups and fund requests.', paths: ['/imprest'], section: 'site' },
  compliance: { label: 'Guarantees and licences', description: 'Bank guarantees, insurance and licences with their expiry reminders.', paths: ['/compliance'], section: 'billing' },
  tenders: { label: 'Tenders', description: 'Bids, their estimates and the schedule of rates.', paths: ['/tenders', '/schedule-of-rates'], section: 'tenders' },
  subcontract_enquiries: { label: 'Subcontract enquiries', description: 'Quotes from subcontractors set side by side.', paths: ['/subcontract-enquiries'], section: 'subcontracts' },
  books: { label: 'Books', description: 'Vouchers, cash and bank books, ledgers and the financial statements.', paths: ['/books', '/statements'], section: 'accounts' },
  payroll: { label: 'Payroll', description: 'Salary and wage runs, payslips and statutory deductions.', paths: ['/payroll', '/payslips'], section: 'payroll' },
  biometric: { label: 'Biometric devices', description: 'Fingerprint and face machines that mark attendance.', paths: ['/biometric'], section: 'people' },
  rmc: { label: 'RMC plant', description: 'Ready-mix concrete: quotes, orders, batches, challans and cube tests.', paths: ['/rmc'], section: 'rmc' },
  machine_loans: { label: 'Machine loans', description: 'Equipment finance with its EMI schedule.', paths: ['/machine-loans'], section: 'accounts' },
};

/** Who may turn modules on and off: admins. */
export const canManageModules = (role: RoleKey) => role === 'ADMIN';

/** The plans' module sets, smallest first. A company with no plan set has every module. */
export const MODULE_TIERS = ['ESSENTIALS', 'BUSINESS', 'ENTERPRISE'] as const;
export type ModuleTier = (typeof MODULE_TIERS)[number];

export const MODULE_TIER_LABELS: Record<ModuleTier, string> = {
  ESSENTIALS: 'Essentials',
  BUSINESS: 'Business',
  ENTERPRISE: 'Enterprise',
};

const ESSENTIALS: SwitchableModule[] = ['meetings', 'material_approvals', 'safety', 'imprest', 'compliance'];
const BUSINESS: SwitchableModule[] = [...ESSENTIALS, 'tenders', 'subcontract_enquiries', 'books', 'payroll', 'biometric'];

/** The modules each plan includes. */
export const MODULE_TIER_MODULES: Record<ModuleTier, readonly SwitchableModule[]> = {
  ESSENTIALS,
  BUSINESS,
  ENTERPRISE: SWITCHABLE_MODULES,
};

export const isSwitchableModule = (k: string): k is SwitchableModule => (SWITCHABLE_MODULES as readonly string[]).includes(k);

/** Whether the company's plan includes the module (no plan set: all of them). */
export const inTier = (tier: ModuleTier | null | undefined, key: SwitchableModule) => !tier || MODULE_TIER_MODULES[tier].includes(key);

/** The modules off for a company: those it turned off, and those its plan leaves out. In `SWITCHABLE_MODULES` order. */
export function modulesOffFor(org: { modulesOff: readonly string[]; moduleTier: ModuleTier | null }): SwitchableModule[] {
  return SWITCHABLE_MODULES.filter((k) => org.modulesOff.includes(k) || !inTier(org.moduleTier, k));
}

/** The switchable module a page belongs to, or null for the core. Query and hash are ignored. */
export function moduleOfPath(path: string): SwitchableModule | null {
  const p = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  for (const k of SWITCHABLE_MODULES) if (SWITCHABLE_MODULE_INFO[k].paths.some((x) => p === x || p.startsWith(`${x}/`))) return k;
  return null;
}

/** Whether a page is off for someone whose company has these modules off. */
export const pathIsOff = (path: string, off: readonly string[] | undefined) => {
  const m = moduleOfPath(path);
  return !!m && !!off?.includes(m);
};

export interface ModuleSwitchDto {
  key: SwitchableModule;
  label: string;
  description: string;
  /** The company's plan includes it */
  inPlan: boolean;
  /** In use: in the plan and not turned off */
  on: boolean;
}

export interface ModuleSwitchesDto {
  tier: ModuleTier | null;
  modules: ModuleSwitchDto[];
}
