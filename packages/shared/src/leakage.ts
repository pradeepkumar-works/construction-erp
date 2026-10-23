import type { RoleKey } from './enums';
import { canManageEquipment, canManageMaintenance, canManageStore, canPurchase, canSetMaterialNorms, canViewCost, canViewPurchaseOrders, canViewReconciliation } from './permissions';

/**
 * Leakage checks (AI item 121): where material, money and fuel go missing on a site, as a month's flags with the rupees
 * at risk. Material is the reconciliation against the company's other sites, rates are purchase order lines against
 * what another site paid, fuel is the norm and fuel issued to a machine with no log, and idle hire is a hired machine
 * paid for hours it did not work. The rules are in `apps/api/src/leakage/leakage-rules.ts`.
 */

/** A rate is checked against what other sites paid in the days before its order. */
export const RATE_WINDOW_DAYS = 30;
/** A rate this much above the lowest another site paid is flagged (a rupee or two of rounding is not). */
export const RATE_ABOVE_MIN_PCT = 2;
/** A site's material use (used ÷ allowed) this many points above the company's median for the item is flagged. */
export const SITE_RATIO_ABOVE_PTS = 10;
/** The median needs this many sites using the item, the one checked included. */
export const SITE_RATIO_MIN_SITES = 2;
/** A machine on a monthly hire idle this many days in a month is flagged. */
export const IDLE_MIN_DAYS = 4;
/** Fuel issued into a machine on a day it has no log is flagged from this many litres. */
export const FUEL_NO_LOG_MIN_LITRES = 20;

export const LEAKAGE_SECTIONS = ['material', 'rates', 'fuel', 'idle'] as const;
export type LeakageSection = (typeof LEAKAGE_SECTIONS)[number];

export const LEAKAGE_SECTION_LABELS: Record<LeakageSection, string> = {
  material: 'Material used',
  rates: 'Rates paid',
  fuel: 'Fuel',
  idle: 'Idle hired machines',
};

/**
 * What each role sees: material for the store, the QS, approvers and accounts; rates for purchasers and those who see
 * cost; fuel and idle hire for whoever runs the machines, and accounts.
 */
export function leakageSections(role: RoleKey): LeakageSection[] {
  const out: LeakageSection[] = [];
  if (canViewReconciliation(role) && (canManageStore(role) || canSetMaterialNorms(role) || canViewCost(role))) out.push('material');
  if (canViewPurchaseOrders(role) && (canPurchase(role) || canViewCost(role))) out.push('rates');
  if (canManageMaintenance(role) || canViewCost(role)) out.push('fuel', 'idle');
  return out;
}

export const canSeeLeakage = (role: RoleKey) => leakageSections(role).length > 0;
/** Material and fuel at item rates: who sees stock value. */
export const canSeeLeakageStockValue = (role: RoleKey) => canManageStore(role) || canViewCost(role);
/** Idle hire at the hire rate: who sees hire rates. */
export const canSeeLeakageHireValue = (role: RoleKey) => canManageEquipment(role) || canViewCost(role);

/** One earlier order another site placed: what the rate is checked against. */
export interface RateQuote {
  purchaseOrderId: string;
  poNo: string;
  poDate: string;
  projectId: string;
  projectName: string;
  vendorName: string;
  rate: number;
}

export interface RateAbove {
  /** The lowest rate another site paid in the window */
  best: RateQuote;
  /** (rate − best) ÷ best, in % */
  abovePct: number;
}

/**
 * Whether a rate is above what another site paid for the same item: the lowest of `others` placed by a different
 * project, on or before the order's date and within RATE_WINDOW_DAYS of it, beaten by more than RATE_ABOVE_MIN_PCT.
 * Used by the purchase order form, its record, the leakage page and the watch list, so all four agree.
 */
export function rateAboveOthers(line: { rate: number; projectId: string; poDate: string }, others: RateQuote[]): RateAbove | null {
  if (!(line.rate > 0)) return null;
  const start = new Date(`${line.poDate}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - RATE_WINDOW_DAYS);
  const from = start.toISOString().slice(0, 10);
  let best: RateQuote | null = null;
  for (const o of others) {
    if (o.projectId === line.projectId || o.poDate > line.poDate || o.poDate < from || !(o.rate > 0)) continue;
    if (!best || o.rate < best.rate || (o.rate === best.rate && o.poDate > best.poDate)) best = o;
  }
  if (!best) return null;
  const abovePct = ((line.rate - best.rate) / best.rate) * 100;
  return abovePct > RATE_ABOVE_MIN_PCT ? { best, abovePct } : null;
}

/** A rate check on a purchase order line, for its record and the approval pane. */
export interface PoLineRateCheckDto {
  bestRate: string;
  abovePct: number;
  /** (rate − best) × quantity, ₹ */
  extra: string;
  purchaseOrderId: string;
  poNo: string;
  poDate: string;
  projectName: string;
  vendorName: string;
}

/** GET /purchase-orders/rate-check: per `name|unit` key (lower case), the orders other sites placed in the window. */
export type RateBenchmarksDto = Record<string, RateQuote[]>;

/** A record a flag rests on: opened from the flag. */
export interface LeakageLinkDto {
  label: string;
  href: string;
}

export interface LeakageFlagDto {
  /** Stable for the flag's figures, for row keys */
  key: string;
  section: LeakageSection;
  projectId: string | null;
  projectCode: string | null;
  projectName: string | null;
  title: string;
  /** One sentence: what the figures say */
  detail: string;
  /** Quantity at risk in words ("42 bags", "6 idle days") */
  quantity: string;
  /** ₹ at risk; null when the caller does not see rates or none is known */
  valueInr: number | null;
  /** The rule and its numbers, a line each */
  working: string[];
  links: LeakageLinkDto[];
}

export interface LeakageDto {
  /** YYYY-MM */
  month: string;
  from: string;
  /** The month's last day, or today while it runs */
  to: string;
  sections: LeakageSection[];
  flags: LeakageFlagDto[];
  /** ₹ at risk per section, and in all; null where values are hidden */
  totals: Record<LeakageSection, number | null>;
  totalInr: number | null;
  /** Projects looked at */
  projects: number;
  /** Values the caller sees */
  canSeeStockValue: boolean;
  canSeeHireValue: boolean;
}
