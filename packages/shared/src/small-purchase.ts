/**
 * Small purchase items (v5 item 95): stock on hand at every site for a material request's lines (issue or transfer
 * first, buy the rest), the last purchase orders of an item, and enquiries emailed to vendors with a link to quote.
 */

/** How many earlier purchase orders the forms show for an item. */
export const LAST_RATES_COUNT = 5;

/** Days an enquiry stays open by default. */
export const ENQUIRY_DEFAULT_DAYS = 3;

/** Stock of one request line's item at one site. */
export interface SiteStockDto {
  projectId: string;
  projectName: string;
  balance: string;
  /** This user keeps that site's store, so may send from it */
  canSend: boolean;
  /** A central store (v6 item 106), listed to everyone who looks at a request */
  store?: boolean;
}

export interface RequestLineStockDto {
  materialRequestItemId: string;
  itemName: string;
  unit: string;
  /** The item in the item master by name and unit; null when no store has ever held it */
  itemId: string | null;
  /** Still to arrange: requested less ordered, received without an order and met from stock */
  toOrderQty: string;
  /** Met from stock so far (issued here or transferred in) */
  coveredQty: string;
  /** In the request's own site store now */
  here: string;
  /** Other sites the user can see that hold it, most first */
  others: SiteStockDto[];
}

/** GET /material-requests/:id/stock */
export interface MaterialRequestStockDto {
  materialRequestId: string;
  projectId: string;
  /** The user keeps the request's own store, so may issue from it */
  canIssue: boolean;
  lines: RequestLineStockDto[];
}

/** One earlier approved purchase order line of an item. */
export interface LastRateDto {
  purchaseOrderId: string;
  poNo: string;
  poDate: string;
  vendorName: string;
  projectName: string;
  quantity: string;
  rate: string;
  gstRate: string;
}

/** GET /purchase-orders/last-rates: per `name|unit` key (lower case), the last approved orders, newest first. */
export type LastRatesDto = Record<string, LastRateDto[]>;

/** The key a last-rates answer uses for an item. */
export const lastRateKey = (itemName: string, unit: string) => `${itemName.trim().toLowerCase()}|${unit.trim().toLowerCase()}`;

export type EnquiryVendorState = 'SENT' | 'NOT_SENT' | 'OPENED' | 'QUOTED' | 'EXPIRED';

export const ENQUIRY_VENDOR_STATE_LABELS: Record<EnquiryVendorState, string> = {
  SENT: 'Emailed',
  NOT_SENT: 'Not emailed',
  OPENED: 'Opened',
  QUOTED: 'Quoted',
  EXPIRED: 'Closed without a quote',
};

export interface EnquiryVendorDto {
  vendorId: string;
  vendorName: string;
  email: string | null;
  /** The vendor master's phone, for sending the link on WhatsApp (finding 12 of the October review) */
  phone: string | null;
  state: EnquiryVendorState;
  emailedAt: string | null;
  emailError: string | null;
  openedAt: string | null;
  respondedAt: string | null;
  quotationId: string | null;
  /** Only in the answer to sending: the link to pass on by hand (phone, WhatsApp) when it was not emailed */
  link?: string | null;
}

export interface EnquiryDto {
  id: string;
  materialRequestId: string;
  closesOn: string;
  message: string | null;
  createdByName: string;
  createdAt: string;
  vendors: EnquiryVendorDto[];
}

/** What the supplier's page shows: GET /public/quotes/:token. */
export interface PublicEnquiryDto {
  organizationName: string;
  projectName: string;
  siteAddress: string | null;
  vendorName: string;
  requestNo: string;
  requiredDate: string;
  closesOn: string;
  message: string | null;
  /** Set once the supplier has quoted: the link then only shows this */
  respondedAt: string | null;
  lines: { materialRequestItemId: string; itemName: string; specification: string | null; unit: string; quantity: string }[];
}

/** POST /public/quotes/:token */
export interface PublicQuoteInput {
  quoteRef?: string;
  validUntil?: string;
  deliveryDays?: number;
  paymentTerms?: string;
  freight?: string;
  remarks?: string;
  lines: { materialRequestItemId: string; rate: string; gstRate: string; remarks?: string }[];
}
