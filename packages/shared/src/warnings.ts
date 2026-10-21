import type { RoleKey } from './enums';
import { canApprove, canManageMaintenance, canManageStore, canPurchase, canSetMaterialNorms, canViewCost } from './permissions';

/**
 * Early warnings (AI roadmap item 73): plain forecasts over the records, shown as the Watch list (a My work card and its
 * own page) and a weekly notification. Each kind is calculated in `apps/api/src/warnings/warning-rules.ts`.
 */
export const WARNING_KINDS = ['SCHEDULE', 'CASH', 'VENDOR', 'STOCK', 'MACHINE', 'DPR', 'MATERIAL_OVERUSE'] as const;
export type WarningKind = (typeof WARNING_KINDS)[number];

export const WARNING_KIND_LABELS: Record<WarningKind, string> = {
  SCHEDULE: 'Finish slipping',
  CASH: 'Cash gap',
  VENDOR: 'Vendor trending worse',
  STOCK: 'Stock running out',
  MACHINE: 'Machine idle or breaking down',
  DPR: 'DPRs missing',
  MATERIAL_OVERUSE: 'Material used over the norm',
};

/** The warning kinds a role sees: each is the business of the role that can act on it. */
export function watchListKinds(role: RoleKey): WarningKind[] {
  const out: WarningKind[] = [];
  if (canApprove(role)) out.push('SCHEDULE');
  if (canViewCost(role)) out.push('CASH');
  if (canPurchase(role)) out.push('VENDOR');
  if (canManageStore(role)) out.push('STOCK');
  if (canManageMaintenance(role)) out.push('MACHINE');
  if (canApprove(role)) out.push('DPR');
  if (canSetMaterialNorms(role)) out.push('MATERIAL_OVERUSE');
  return out;
}

export const canSeeWatchList = (role: RoleKey) => watchListKinds(role).length > 0;

/** Shortest reason accepted when dismissing a warning. */
export const WARNING_DISMISS_MIN = 3;

export interface WarningFact {
  label: string;
  value: string;
}

export interface WarningLink {
  label: string;
  href: string;
}

export interface WarningDto {
  /**
   * Names the warning and the figures it fired on (`stock:<project>:<item>:<month>`), so a dismissal holds while the
   * figures stay about the same and the warning comes back when they move on.
   */
  key: string;
  kind: WarningKind;
  title: string;
  /** One sentence: what the figures say will happen. */
  detail: string;
  facts: WarningFact[];
  links: WarningLink[];
  projectId: string | null;
  projectName: string | null;
  /** Dismissed by someone in the company, with their reason. */
  dismissed: { reason: string; byName: string; at: string } | null;
}

export interface WatchListDto {
  asOf: string;
  kinds: WarningKind[];
  open: WarningDto[];
  dismissed: WarningDto[];
}
