import type { CompanyKind } from './enums';
import type { StatementLine } from './statements';

/**
 * Consolidated accounts (item 192, ARCHITECTURE "Consolidated accounts"): the group's profit and loss and balance sheet
 * from each company's own statements, summed by statement line, less what passed between sister companies. A sister is
 * a vendor or client in a company's books that its admin named as another company of the group (`SisterLink`).
 */

/**
 * How far each company's figures run. BOOKS: every company to the period's end, as its books stand. LOCK: each company
 * stops at its own lock (the day its books are locked up to), so only final figures are consolidated; a company with
 * no lock runs to the period's end.
 */
export const CONSOLIDATION_BASES = ['BOOKS', 'LOCK'] as const;
export type ConsolidationBasis = (typeof CONSOLIDATION_BASES)[number];
export const CONSOLIDATION_BASIS_LABELS: Record<ConsolidationBasis, string> = { BOOKS: 'Period end', LOCK: "Each company's lock" };

export interface ConsolidationCompanyDto {
  id: string;
  name: string;
  kind: CompanyKind;
  /** Its profit and loss runs from `from` to `to` and its balance sheet is as on `to`; `to` before `from` is no period. */
  from: string;
  to: string;
  /** The day its books are locked up to */
  lockedUpTo: string | null;
  /** The latest financial year it closed (`2025-26`) */
  closedYear: string | null;
  /** Its own balance sheet's assets less liabilities; zero when its books balance */
  difference: string;
}

/** One row of a consolidated statement: each company's figure (by company id), what came out between sisters, and the group's. */
export interface ConsolidatedRowDto {
  key: string;
  /** The statement line, or null for a total */
  line: StatementLine | null;
  label: string;
  companies: Record<string, string>;
  /** Taken out between sisters: negative takes away from the line */
  eliminated: string;
  group: string;
  total: boolean;
}

export interface ConsolidatedSectionDto {
  key: string;
  label: string;
  side: 'LIABILITY' | 'ASSET';
  rows: ConsolidatedRowDto[];
  total: ConsolidatedRowDto;
}

export interface SisterSideDto {
  companyId: string;
  name: string;
  amount: string;
  /** The company named the other as a sister in its books; without that its figure is nothing */
  named: boolean;
}

/**
 * Two sisters' figures for one thing that should agree. BALANCE: A is the sister that is owed; what A's books say B owes
 * it, and what B's books say it owes A. SALES: what A sold to B (its income through B's ledger) and what B bought from A
 * (its expense through A's).
 */
export interface SisterPairDto {
  key: string;
  kind: 'BALANCE' | 'SALES';
  a: SisterSideDto;
  b: SisterSideDto;
  /** Taken out of both companies' lines */
  eliminated: string;
  /** a less b: zero when the two agree */
  difference: string;
}

export interface ConsolidationDto {
  from: string;
  to: string;
  basis: ConsolidationBasis;
  companies: ConsolidationCompanyDto[];
  /** Income lines, total income, expense lines, total expenses, profit before tax, tax, profit */
  profitLoss: ConsolidatedRowDto[];
  balanceSheet: { sections: ConsolidatedSectionDto[]; totalLiabilities: ConsolidatedRowDto; totalAssets: ConsolidatedRowDto };
  pairs: SisterPairDto[];
}

/** What a company's column says about how final its figures are, with days written by `day`. */
export function consolidationNote(c: Pick<ConsolidationCompanyDto, 'to' | 'lockedUpTo' | 'closedYear'>, basis: ConsolidationBasis, periodTo: string, day: (d: string) => string): string {
  const parts: string[] = [];
  if (!c.lockedUpTo) parts.push('Books not locked');
  else if (c.lockedUpTo >= periodTo) parts.push(`Locked up to ${day(c.lockedUpTo)}`);
  else if (basis === 'LOCK') parts.push(`Stops at its lock, ${day(c.lockedUpTo)}`);
  else parts.push(`Locked up to ${day(c.lockedUpTo)}, later entries can change`);
  if (c.closedYear) parts.push(`${c.closedYear} closed`);
  return parts.join('. ');
}

/** A company's party named as a sister, on the Sister companies page. */
export interface SisterLinkDto {
  id: string;
  party: 'VENDOR' | 'CLIENT';
  partyId: string;
  partyName: string;
  sisterId: string;
  sisterName: string;
  /** The sister is no longer in this group, so the link counts for nothing */
  outsideGroup: boolean;
}

/** A sister's link that names this company, read from the sister's books. */
export interface SisterNamedByDto {
  companyId: string;
  companyName: string;
  party: 'VENDOR' | 'CLIENT';
  partyName: string;
}

export interface SisterLinksDto {
  links: SisterLinkDto[];
  namedBy: SisterNamedByDto[];
  /** The other companies of the group, to name */
  sisters: { id: string; name: string }[];
  /** Vendors and clients not yet named, to choose from */
  vendors: { id: string; name: string }[];
  clients: { id: string; name: string }[];
}

export interface SisterLinkInput {
  vendorId?: string;
  clientId?: string;
  sisterId: string;
}
