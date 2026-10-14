/** Plans and billing (v3 item 34): a free trial, then a monthly price per active project (or per user), paid through Razorpay. */
import type { BillingPaymentStatus } from './enums';
import type { BillingStateDto, BillingStatus } from './types';

/** What the price is counted by: projects in ACTIVE status, or active staff users (guests are free). */
export type BillingUnit = 'PROJECT' | 'USER';
export const BILLING_UNIT_LABELS: Record<BillingUnit, { one: string; many: string }> = {
  PROJECT: { one: 'active project', many: 'active projects' },
  USER: { one: 'user', many: 'users' },
};

export const BILLING_STATUS_LABELS: Record<BillingStatus, string> = {
  TRIAL: 'Free trial',
  ACTIVE: 'Subscribed',
  READ_ONLY: 'Read-only (unpaid)',
  EXEMPT: 'No charge',
};

/** GST on the subscription (SaaS is 18%): CGST + SGST inside the seller's state, IGST outside it. */
export const BILLING_GST_PCT = 18;
/** Paying for a year charges this many months. */
export const BILLING_YEAR_CHARGED_MONTHS = 10;
/** Admins are reminded this many days before the trial or the paid period ends. */
export const BILLING_REMIND_DAYS = 7;


export interface BillingAmountDto {
  months: 1 | 12;
  /** Months charged (a year charges BILLING_YEAR_CHARGED_MONTHS) */
  chargedMonths: number;
  taxable: string;
  cgst: string;
  sgst: string;
  igst: string;
  total: string;
}

export interface BillingDetailsDto {
  /** Legal name for the invoice */
  name: string;
  gstin: string | null;
  address: string | null;
  /** GST state code (place of supply) */
  stateCode: string | null;
}

export interface BillingSummaryDto extends BillingStateDto {
  unit: BillingUnit;
  /** Price per unit per month, before GST */
  unitPrice: string;
  /** Units the next payment is for (at least one) */
  units: number;
  monthly: BillingAmountDto;
  yearly: BillingAmountDto;
  details: BillingDetailsDto;
  /** Whether the invoice details are complete enough to pay */
  detailsComplete: boolean;
  seller: { name: string; gstin: string; address: string; stateCode: string };
  /** Razorpay key id for Checkout */
  keyId: string;
}

/** What the browser needs to open Razorpay Checkout for one payment. */
export interface BillingOrderDto {
  paymentId: string;
  orderId: string;
  /** In paise */
  amount: number;
  currency: 'INR';
  keyId: string;
  description: string;
  prefill: { name: string; email: string };
}

export interface BillingInvoiceDto {
  id: string;
  status: BillingPaymentStatus;
  invoiceNo: string | null;
  invoiceDate: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  unit: BillingUnit;
  units: number;
  months: number;
  chargedMonths: number;
  rate: string;
  taxable: string;
  cgst: string;
  sgst: string;
  igst: string;
  total: string;
  buyer: BillingDetailsDto;
  seller: { name: string; gstin: string; address: string; stateCode: string; sac: string };
  razorpayPaymentId: string | null;
  paidAt: string | null;
}
