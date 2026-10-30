/**
 * Tender bidding (v6 item 110): the tender register (the notice, dates, EMD and result), the schedules of rates the bids
 * are priced against (a state SOR, the CPWD DSR or the company's own rates, imported from Excel), the bid BOQ priced
 * from each item's rate analysis, the quote as a percentage above or below the SOR, the bids read out at opening (L1,
 * L2…), and a won tender turned into a project with its BOQ, budget and guarantees.
 */
import type { ComplianceDocStatus } from './enums';
import type { AttachmentDto } from './types';

export const SOR_BOOK_KINDS = ['STATE', 'CPWD', 'OWN', 'OTHER'] as const;
export type SorBookKind = (typeof SOR_BOOK_KINDS)[number];
export const SOR_BOOK_KIND_LABELS: Record<SorBookKind, string> = { STATE: 'State SOR', CPWD: 'CPWD DSR', OWN: 'Own rates', OTHER: 'Other' };

export const TENDER_STATUSES = ['PREPARING', 'SUBMITTED', 'WON', 'LOST', 'DROPPED', 'CANCELLED'] as const;
export type TenderStatus = (typeof TENDER_STATUSES)[number];
export const TENDER_STATUS_LABELS: Record<TenderStatus, string> = {
  PREPARING: 'Preparing',
  SUBMITTED: 'Submitted',
  WON: 'Won',
  LOST: 'Lost',
  DROPPED: 'Not bid',
  CANCELLED: 'Cancelled',
};
/** How a tender ends: won or lost once the bids are opened, dropped before bidding, or called off by the client. */
export const TENDER_RESULTS = ['WON', 'LOST', 'DROPPED', 'CANCELLED'] as const satisfies readonly TenderStatus[];
export type TenderResult = (typeof TENDER_RESULTS)[number];
/** The register's tabs: tenders still open (preparing or awaiting the result), and those closed. */
export const TENDER_OPEN: TenderStatus[] = ['PREPARING', 'SUBMITTED'];

/** A percentage tender takes one percentage above or below the SOR on every item; an item-rate tender a rate per item. */
export const TENDER_BID_TYPES = ['PERCENTAGE', 'ITEM_RATE'] as const;
export type TenderBidType = (typeof TENDER_BID_TYPES)[number];
export const TENDER_BID_TYPE_LABELS: Record<TenderBidType, string> = { PERCENTAGE: 'Percentage on the SOR', ITEM_RATE: 'Item rate' };

export const TENDER_LINE_KINDS = ['MATERIAL', 'LABOUR', 'EQUIPMENT'] as const;
export type TenderLineKind = (typeof TENDER_LINE_KINDS)[number];
export const TENDER_LINE_KIND_LABELS: Record<TenderLineKind, string> = { MATERIAL: 'Material', LABOUR: 'Labour', EQUIPMENT: 'Machinery' };

/** A tender due within this many days is shown as due soon. */
export const TENDER_DUE_DAYS = 7;

/** "+4.50% above", "-3.20% below" or "at" the SOR, for a percentage as the API sends it. */
export function sorPctLabel(pct: string | number | null | undefined): string {
  if (pct === null || pct === undefined || pct === '') return '-';
  const n = Number(pct);
  if (!Number.isFinite(n)) return '-';
  if (Math.abs(n) < 0.005) return 'At SOR';
  return `${Math.abs(n).toFixed(2)}% ${n > 0 ? 'above' : 'below'}`;
}

/** L1, L2… by position among the bids, lowest first. */
export const rankLabel = (rank: number | null | undefined) => (rank ? `L${rank}` : '-');

export interface SorBookDto {
  id: string;
  name: string;
  kind: SorBookKind;
  edition: string | null;
  region: string | null;
  note: string | null;
  itemCount: number;
  tenderCount: number;
  updatedAt: string;
}

export interface SorItemDto {
  id: string;
  bookId: string;
  bookName: string;
  code: string;
  chapter: string | null;
  description: string;
  unit: string;
  rate: string;
}

export interface SorItemListDto {
  items: SorItemDto[];
  total: number;
}

export interface SorImportResultDto {
  added: number;
  updated: number;
  unchanged: number;
}

export interface TenderLineDto {
  id: string;
  kind: TenderLineKind;
  itemId: string | null;
  name: string;
  unit: string;
  qtyPerUnit: string;
  wastagePct: string;
  rate: string | null;
  /** The line's amount for one unit of the item (quantity with wastage × rate); null without a rate. */
  amount: string | null;
}

export interface TenderItemDto {
  id: string;
  itemNo: string;
  description: string;
  unit: string;
  qty: string;
  sorItemId: string | null;
  sorCode: string | null;
  sorRate: string | null;
  sorAmount: string | null;
  lines: TenderLineDto[];
  /** Per unit, from the rate analysis (null without one). */
  material: string | null;
  labour: string | null;
  equipment: string | null;
  cost: string | null;
  builtUpRate: string | null;
  /** The rate entered by hand on an item-rate tender (null when the built-up rate is quoted). */
  ownRate: string | null;
  /** The rate the bid quotes: the SOR rate with the tender's percentage, or the item's own or built-up rate. */
  quotedRate: string | null;
  quotedAmount: string | null;
  /** Lines without a rate. */
  unpriced: number;
}

export interface TenderBidDto {
  /** Null for our own bid. */
  id: string | null;
  bidderName: string;
  amount: string;
  /** Against the SOR value of the BOQ (or the estimate), in %. */
  pct: string | null;
  rank: number;
  us: boolean;
  note: string | null;
}

export interface TenderTotalsDto {
  itemCount: number;
  analysedCount: number;
  /** The BOQ at the SOR rates (or the estimate when the BOQ has none). */
  sorAmount: string | null;
  /** The direct cost from the rate analysis, and the overheads and profit on it. */
  costAmount: string;
  overheads: string;
  profit: string;
  builtUpAmount: string;
  quotedAmount: string | null;
  /** Each against the SOR value, in %. */
  costPct: string | null;
  builtUpPct: string | null;
  quotedPct: string | null;
  /** Quoted less cost and overheads: what the bid leaves as profit. */
  margin: string | null;
}

export interface TenderEmdDto {
  id: string;
  reference: string;
  issuer: string | null;
  amount: string | null;
  expiresOn: string | null;
  status: ComplianceDocStatus;
}

export interface TenderDto {
  id: string;
  tenderNo: string;
  nitNo: string | null;
  title: string;
  clientId: string | null;
  clientName: string | null;
  location: string | null;
  /** Its vertical (item 167), a code of the `vertical` master */
  verticalCode: string | null;
  status: TenderStatus;
  bidType: TenderBidType;
  estimatedValue: string | null;
  submitBy: string;
  submittedOn: string | null;
  openedOn: string | null;
  /** Days left to submit while preparing (negative once past). */
  daysToSubmit: number | null;
  quotedAmount: string | null;
  quotedPct: string | null;
  /** Our place among the bids once opened, and the lowest bid. */
  rank: number | null;
  bidders: number;
  l1Amount: string | null;
  l1Name: string | null;
  emdAmount: string | null;
  emdStatus: ComplianceDocStatus | null;
  projectId: string | null;
  projectCode: string | null;
}

export interface TenderDetailDto extends TenderDto {
  sorBookId: string | null;
  sorBookName: string | null;
  completionMonths: number | null;
  publishedOn: string | null;
  overheadPct: string;
  profitPct: string;
  /** The percentage stored on a percentage tender (null until set). */
  ownPct: string | null;
  tenderFee: string | null;
  emd: TenderEmdDto | null;
  resultOn: string | null;
  resultNote: string | null;
  note: string | null;
  items: TenderItemDto[];
  bids: TenderBidDto[];
  totals: TenderTotalsDto;
  attachments: AttachmentDto[];
  labourTrades: string[];
  equipmentCategories: string[];
  createdByName: string;
  createdAt: string;
  canEdit: boolean;
  canMakeProject: boolean;
}

export interface TenderSummaryDto {
  preparing: number;
  dueThisWeek: number;
  awaitingResult: number;
  /** Since 1 April. */
  wonCount: number;
  wonValue: string;
  lostCount: number;
  /** EMD still held on tenders not won (to be refunded). */
  emdOut: string;
}

export interface TenderListDto {
  items: TenderDto[];
  summary: TenderSummaryDto;
}
