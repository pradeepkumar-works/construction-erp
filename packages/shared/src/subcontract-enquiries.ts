/**
 * Subcontract enquiries: chosen BOQ items (or the enquiry's own items) sent to several subcontractors,
 * their rates compared item by item and in total in a comparative statement, and the chosen quote made a work order.
 */
export const SC_ENQUIRY_STATUSES = ['OPEN', 'AWARDED', 'CANCELLED'] as const;
export type ScEnquiryStatus = (typeof SC_ENQUIRY_STATUSES)[number];
export const SC_ENQUIRY_STATUS_LABELS: Record<ScEnquiryStatus, string> = { OPEN: 'Open', AWARDED: 'Awarded', CANCELLED: 'Cancelled' };

export interface ScEnquiryItemDto {
  id: string;
  boqItemId: string | null;
  /** The BOQ item's number, null for the enquiry's own item. */
  itemNo: string | null;
  description: string;
  unit: string;
  quantity: string;
  /** What the client pays for the BOQ item, a ceiling for the subcontract rate. */
  clientRate: string | null;
  /** Our budgeted cost a unit for the BOQ item, what the subcontract was planned at. */
  budgetRate: string | null;
  /** The lowest rate among the quotes received, and whose (several when tied). */
  lowestRate: string | null;
  lowestQuoteIds: string[];
  /** How far the highest rate is above the lowest, in %. */
  spreadPct: string | null;
}

export interface ScQuoteDto {
  id: string;
  vendorId: string;
  vendorName: string;
  vendorPhone: string | null;
  /** Their rates are in. */
  received: boolean;
  receivedOn: string | null;
  gstRate: string;
  validUntil: string | null;
  note: string | null;
  /** Rate per enquiry item id; null where they did not quote the item. */
  rates: Record<string, string | null>;
  /** Over the items they priced, before GST. */
  total: string | null;
  gst: string | null;
  totalWithGst: string | null;
  priced: number;
  /** Every item priced: only a complete quote is ranked and can be awarded. */
  complete: boolean;
  rank: number | null;
  /** Against the client's value of the same items (BOQ items only), in %: positive is under the client's rates. */
  marginPct: string | null;
  awarded: boolean;
}

export interface ScEnquiryDto {
  id: string;
  enquiryNo: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  title: string;
  closesOn: string | null;
  status: ScEnquiryStatus;
  itemCount: number;
  invited: number;
  received: number;
  /** The lowest complete quote, before GST. */
  lowestTotal: string | null;
  lowestVendorName: string | null;
  awardedVendorName: string | null;
  awardedTotal: string | null;
  workOrderId: string | null;
  woNo: string | null;
  createdAt: string;
}

export interface ScEnquiryDetailDto extends ScEnquiryDto {
  scope: string | null;
  items: ScEnquiryItemDto[];
  /** Received quotes first, ranked; those still awaited after them. */
  quotes: ScQuoteDto[];
  /** The client's value of the BOQ items asked for. */
  clientValue: string | null;
  decisionNote: string | null;
  decidedAt: string | null;
  createdByName: string;
  /** Past its last day to quote. */
  closed: boolean;
  canEdit: boolean;
}

export interface ScEnquiryListDto {
  items: ScEnquiryDto[];
  summary: { open: number; awaitingQuotes: number; readyToAward: number; awardedThisYear: number; awardedValue: string };
}
