/** Search everything (UI roadmap item 62): what `GET /search` can find, in the order the palette lists them. */
export const SEARCH_KINDS = [
  'material_request',
  'purchase_order',
  'vendor_bill',
  'work_order',
  'subcontract_enquiry',
  'subcontract_bill',
  'payment_request',
  'ra_bill',
  'measurement',
  'expense',
  'inspection',
  'risk',
  'document',
  'rfi',
  'meeting',
  'material_approval',
  'vendor',
  'client',
  'tender',
  'item',
  'person',
] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

export const SEARCH_KIND_LABELS: Record<SearchKind, string> = {
  material_request: 'Material requests',
  purchase_order: 'Purchase orders',
  vendor_bill: 'Vendor bills',
  work_order: 'Work orders',
  subcontract_enquiry: 'Subcontract enquiries',
  subcontract_bill: 'Subcontractor bills',
  payment_request: 'Payment requests',
  ra_bill: 'RA bills',
  measurement: 'Measurement book',
  expense: 'Site expenses',
  inspection: 'Inspections',
  risk: 'Delays & risks',
  document: 'Documents',
  rfi: 'RFIs',
  meeting: 'Meetings',
  material_approval: 'Material approvals',
  vendor: 'Vendors',
  client: 'Clients',
  tender: 'Tenders',
  item: 'Items',
  person: 'People',
};

/** Fewest characters a search needs before the API looks. */
export const SEARCH_MIN_LENGTH = 2;

/** One record found: what to show and where it opens. */
export interface SearchHitDto {
  kind: SearchKind;
  id: string;
  /** Its number or name: "PO-2026-0012", "Kalinga Cranes". */
  title: string;
  /** A line of context: vendor, project, designation… */
  subtitle: string | null;
  /** The record's own page, or its list opened on it. */
  href: string;
  /** A submission's status, for its tag. */
  status: string | null;
}

export interface SearchResultDto {
  q: string;
  hits: SearchHitDto[];
}
