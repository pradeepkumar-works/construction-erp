import type { SubmissionStatus } from './enums';
import type { AttachmentDto, PasswordLinkDto } from './types';
import type { PublicEnquiryDto } from './small-purchase';

/**
 * The supplier portal (v6 item 105): a supplier's or subcontractor's own login, tied to one vendor. They quote on the
 * enquiries sent to them, accept the purchase and work orders raised on them, send dispatch notes the store fills its
 * GRN from, send invoices that accounts turn into bills (or return), and see their bills, payments and statement. A
 * change to their details, above all their bank account, waits for the company's approval.
 */

/** What a supplier's invoice is waiting for. BILLED and PAID are read from the bill accounts made from it. */
export const SUPPLIER_INVOICE_STATUSES = ['SUBMITTED', 'RETURNED', 'WITHDRAWN'] as const;
export type SupplierInvoiceStatus = (typeof SUPPLIER_INVOICE_STATUSES)[number];
export const SUPPLIER_INVOICE_STAGES = ['SUBMITTED', 'BILLED', 'PAID', 'RETURNED', 'WITHDRAWN'] as const;
export type SupplierInvoiceStage = (typeof SUPPLIER_INVOICE_STAGES)[number];
export const SUPPLIER_INVOICE_STAGE_LABELS: Record<SupplierInvoiceStage, string> = {
  SUBMITTED: 'With accounts',
  BILLED: 'Bill recorded',
  PAID: 'Paid',
  RETURNED: 'Returned',
  WITHDRAWN: 'Withdrawn',
};

export const SUPPLIER_CHANGE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type SupplierChangeStatus = (typeof SUPPLIER_CHANGE_STATUSES)[number];
export const SUPPLIER_CHANGE_STATUS_LABELS: Record<SupplierChangeStatus, string> = { PENDING: 'Waiting for approval', APPROVED: 'Approved', REJECTED: 'Not accepted' };

/** The vendor details a supplier may ask to change, in the order the profile shows them. */
export const SUPPLIER_PROFILE_FIELDS = ['contactPerson', 'email', 'phone', 'address', 'gstin', 'pan', 'msmeCategory', 'udyamNo', 'bankAccountName', 'bankAccountNo', 'bankIfsc', 'bankName'] as const;
export type SupplierProfileField = (typeof SUPPLIER_PROFILE_FIELDS)[number];
export const SUPPLIER_PROFILE_LABELS: Record<SupplierProfileField, string> = {
  contactPerson: 'Contact person',
  email: 'Email',
  phone: 'Phone',
  address: 'Address',
  gstin: 'GSTIN',
  pan: 'PAN',
  msmeCategory: 'MSME category',
  udyamNo: 'Udyam number',
  bankAccountName: 'Account name',
  bankAccountNo: 'Account number',
  bankIfsc: 'IFSC',
  bankName: 'Bank',
};
/** A change to any of these is a new bank account: only those who pay vendors approve it. */
export const SUPPLIER_BANK_FIELDS: SupplierProfileField[] = ['bankAccountName', 'bankAccountNo', 'bankIfsc', 'bankName'];

/** What a supplier-portal notification points at; PORTAL_* ones are the supplier's own, the others the company's. */
export type SupplierNoticeEntity = 'SUPPLIER_INVOICE' | 'SUPPLIER_CHANGE' | 'PORTAL_PO' | 'PORTAL_WO' | 'PORTAL_INVOICE' | 'PORTAL_CHANGE' | 'PORTAL_ENQUIRY' | 'PORTAL_PAYMENT';

/** GET /supplier/home */
export interface SupplierHomeDto {
  organizationName: string;
  vendor: { id: string; name: string; gstin: string | null; msme: boolean };
  enquiriesOpen: number;
  ordersToAccept: number;
  /** Purchase orders with something still to send */
  ordersOpen: number;
  invoicesWithAccounts: number;
  invoicesReturned: number;
  changesPending: number;
  /** What the company owes on approved bills, after payments and deductions */
  due: string;
  /** Of that, past its due date */
  overdue: string;
  lastPayment: { date: string; amount: string } | null;
}

/** An enquiry sent to the supplier's vendor: the quote page's fields, answered from the portal. */
export interface SupplierEnquiryDto extends PublicEnquiryDto {
  id: string;
  sentAt: string;
  /** Still taking quotes: not answered, not past its closing day, the request still approved */
  open: boolean;
}

export interface SupplierOrderLineDto {
  id: string;
  itemName: string;
  specification: string | null;
  unit: string;
  quantity: string;
  rate: string;
  amount: string;
  /** PO lines: on dispatch notes not yet received or cancelled */
  onTheWay: string;
  /** PO lines: received at site (GRNs, net of returns) */
  received: string;
  /** PO lines: still to send (ordered − received − on the way) */
  toSend: string;
}

/** A purchase order (PO) or work order (WO) raised on the supplier, once approved. */
export interface SupplierOrderDto {
  kind: 'PO' | 'WO';
  id: string;
  number: string;
  date: string;
  projectName: string;
  /** PO: where to deliver; WO: the work order's title */
  title: string;
  deliveryAddress: string | null;
  /** PO: deliver by; WO: finish by */
  dueBy: string | null;
  paymentTerms: string | null;
  paymentDays: number | null;
  /** PO: total with GST and freight; WO: value before GST */
  amount: string;
  acceptedAt: string | null;
  acceptedBy: string | null;
  supplierNote: string | null;
  closed: boolean;
  lines: SupplierOrderLineDto[];
}

export type SupplierDispatchStatus = 'ON_THE_WAY' | 'RECEIVED' | 'CANCELLED';
export const SUPPLIER_DISPATCH_STATUS_LABELS: Record<SupplierDispatchStatus, string> = { ON_THE_WAY: 'In transit', RECEIVED: 'Received', CANCELLED: 'Cancelled' };

/** A dispatch note: what the supplier sent against a PO. The store's GRN is filled from it. */
export interface SupplierDispatchDto {
  id: string;
  dispatchNo: string;
  date: string;
  purchaseOrderId: string;
  poNo: string;
  projectName: string;
  vehicleNo: string | null;
  lrNo: string | null;
  transporter: string | null;
  remarks: string | null;
  status: SupplierDispatchStatus;
  grn: { id: string; entryNo: string; date: string } | null;
  lines: { purchaseOrderLineId: string; itemName: string; unit: string; quantity: string }[];
  createdAt: string;
}

/** A supplier's invoice, as they and accounts see it. */
export interface SupplierInvoiceDto {
  id: string;
  vendorId: string;
  vendorName: string;
  invoiceNo: string;
  invoiceDate: string;
  /** With GST, as on the invoice */
  amount: string;
  gstAmount: string | null;
  purchaseOrderId: string | null;
  poNo: string | null;
  workOrderId: string | null;
  woNo: string | null;
  projectId: string | null;
  projectName: string | null;
  notes: string | null;
  status: SupplierInvoiceStatus;
  stage: SupplierInvoiceStage;
  returnNote: string | null;
  sentBy: string;
  createdAt: string;
  /** The bill accounts recorded from it (same vendor and invoice number) */
  bill: { kind: 'VENDOR_BILL' | 'SUBCONTRACT_BILL'; id: string; billNo: string; status: SubmissionStatus; payable: string; paid: string } | null;
  attachments: AttachmentDto[];
}

export type SupplierStatementKind = 'BILL' | 'PAYMENT' | 'ADVANCE' | 'DEBIT_NOTE';
export const SUPPLIER_STATEMENT_KIND_LABELS: Record<SupplierStatementKind, string> = { BILL: 'Bill', PAYMENT: 'Payment', ADVANCE: 'Advance', DEBIT_NOTE: 'Debit note' };

/** One line of the supplier's statement: a bill they are owed (credit) or money paid or held back (debit). */
export interface SupplierStatementRowDto {
  date: string;
  kind: SupplierStatementKind;
  ref: string;
  description: string;
  /** Paid to them, deducted, or a debit note */
  debit: string;
  /** Billed */
  credit: string;
  /** What is owed to them after this line; negative when they have been paid ahead (an advance) */
  balance: string;
}

export interface SupplierBillDto {
  kind: 'VENDOR_BILL' | 'SUBCONTRACT_BILL';
  id: string;
  /** Our bill number and their invoice number */
  ref: string;
  invoiceNo: string | null;
  date: string;
  dueDate: string;
  projectName: string;
  /** What the bill is worth to them after recoveries and debit notes */
  payable: string;
  paid: string;
  due: string;
  status: SubmissionStatus;
}

export interface SupplierPaymentDto {
  id: string;
  date: string;
  amount: string;
  tds: string;
  otherDeduction: string;
  mode: string;
  reference: string | null;
  against: string;
}

/** GET /supplier/statement */
export interface SupplierStatementDto {
  from: string | null;
  to: string;
  rows: SupplierStatementRowDto[];
  billed: string;
  paid: string;
  /** TDS and other deductions at payment, and debit notes */
  deducted: string;
  balance: string;
  /** Retention held on subcontract bills, released at the end of the work */
  retentionHeld: string;
  bills: SupplierBillDto[];
  payments: SupplierPaymentDto[];
}

export interface SupplierChangeDto {
  id: string;
  vendorId: string;
  vendorName: string;
  changes: { field: SupplierProfileField; label: string; from: string | null; to: string | null }[];
  /** Touches the bank account */
  bank: boolean;
  status: SupplierChangeStatus;
  note: string | null;
  decisionNote: string | null;
  requestedBy: string;
  createdAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
}

/** The supplier's own view of their vendor record (bank number masked but for the last four digits). */
export interface SupplierProfileDto {
  vendorId: string;
  name: string;
  values: Record<SupplierProfileField, string | null>;
  changes: SupplierChangeDto[];
}

/** A login on the supplier portal, as the company sees it on the vendor. */
export interface SupplierLoginDto {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  invitePending: boolean;
  createdAt: string;
}

/** GET /supplier-portal/vendors/:id: the vendor's logins and the changes they asked for. */
export interface VendorPortalDto {
  vendorId: string;
  vendorName: string;
  logins: SupplierLoginDto[];
  changes: SupplierChangeDto[];
}

/** POST /supplier-portal/vendors/:id/logins */
export interface SupplierInviteResultDto {
  login: SupplierLoginDto;
  /** The set-password link (emailed when email is set up; pass it on by hand otherwise) */
  invite: PasswordLinkDto;
}
