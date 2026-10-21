/** Tally export (TallyPrime XML): voucher kinds and the ledgers Nirmaan posts to, with their default names and groups. */
import type { ExpenseCategory } from './enums';
import { EXPENSE_CATEGORY_LABELS } from './labels';

/** What a Nirmaan record becomes in Tally. */
export const TALLY_VOUCHER_KINDS = ['SALES', 'RECEIPT', 'PURCHASE', 'SUBCONTRACT', 'PAYMENT', 'EXPENSE', 'DEBIT_NOTE'] as const;
export type TallyVoucherKind = (typeof TALLY_VOUCHER_KINDS)[number];
export const TALLY_VOUCHER_KIND_LABELS: Record<TallyVoucherKind, string> = {
  SALES: 'RA bills',
  RECEIPT: 'Money received',
  PURCHASE: 'Vendor bills',
  SUBCONTRACT: 'Subcontractor bills',
  PAYMENT: 'Payments to vendors',
  EXPENSE: 'Site expenses',
  DEBIT_NOTE: 'Debit notes',
};
/** The Tally voucher type each kind is imported as. */
export const TALLY_VOUCHER_TYPES: Record<TallyVoucherKind, string> = {
  SALES: 'Sales',
  RECEIPT: 'Receipt',
  PURCHASE: 'Purchase',
  SUBCONTRACT: 'Journal',
  PAYMENT: 'Payment',
  EXPENSE: 'Payment',
  DEBIT_NOTE: 'Debit Note',
};

/** A ledger Nirmaan posts to that is not a client, vendor or expense category. */
export interface TallyFixedLedger {
  key: string;
  /** What Nirmaan posts to it */
  use: string;
  /** Default ledger name in Tally */
  name: string;
  /** Tally group the ledger masters export puts it under */
  group: string;
}

export const TALLY_FIXED_LEDGERS: TallyFixedLedger[] = [
  { key: 'SALES', use: 'Work value of RA bills', name: 'Works Contract Receipts', group: 'Sales Accounts' },
  { key: 'OUTPUT_CGST', use: 'GST on RA bills (within the state)', name: 'Output CGST', group: 'Duties & Taxes' },
  { key: 'OUTPUT_SGST', use: 'GST on RA bills (within the state)', name: 'Output SGST', group: 'Duties & Taxes' },
  { key: 'OUTPUT_IGST', use: 'GST on RA bills (other states)', name: 'Output IGST', group: 'Duties & Taxes' },
  { key: 'TDS_RECEIVABLE', use: 'Income-tax TDS deducted by clients', name: 'TDS Receivable', group: 'Current Assets' },
  { key: 'GST_TDS_RECEIVABLE', use: 'GST TDS deducted by clients', name: 'GST TDS Receivable', group: 'Current Assets' },
  { key: 'RETENTION_RECEIVABLE', use: 'Retention kept by clients', name: 'Retention Money with Clients', group: 'Current Assets' },
  { key: 'DEPOSIT_RECEIVABLE', use: 'Security deposit kept by clients', name: 'Security Deposit with Clients', group: 'Current Assets' },
  { key: 'CLIENT_ADVANCE', use: 'Mobilisation advance recovered by clients', name: 'Mobilisation Advance from Clients', group: 'Current Liabilities' },
  { key: 'LABOUR_CESS', use: 'Labour welfare cess deducted by clients', name: 'Labour Welfare Cess', group: 'Direct Expenses' },
  { key: 'CLIENT_DEDUCTIONS', use: 'Other deductions by clients', name: 'Deductions by Clients', group: 'Indirect Expenses' },
  { key: 'PURCHASE', use: 'Material on vendor bills', name: 'Purchase of Materials', group: 'Purchase Accounts' },
  { key: 'FREIGHT', use: 'Freight on vendor bills', name: 'Freight Inward', group: 'Direct Expenses' },
  { key: 'MACHINE_HIRE', use: 'Hire bills for hired machines', name: 'Machinery Hire Charges', group: 'Direct Expenses' },
  { key: 'REPAIRS', use: 'Workshop bills for job cards', name: 'Repairs to Machinery', group: 'Direct Expenses' },
  { key: 'FUEL_RECOVERY', use: 'Diesel recovered on hire bills', name: 'Diesel Recovered from Hire Agencies', group: 'Direct Expenses' },
  { key: 'INPUT_CGST', use: 'GST on bills and expenses (within the state)', name: 'Input CGST', group: 'Duties & Taxes' },
  { key: 'INPUT_SGST', use: 'GST on bills and expenses (within the state)', name: 'Input SGST', group: 'Duties & Taxes' },
  { key: 'INPUT_IGST', use: 'GST on bills and expenses (other states)', name: 'Input IGST', group: 'Duties & Taxes' },
  { key: 'SUBCONTRACT', use: 'Work value of subcontractor bills', name: 'Subcontract Charges', group: 'Direct Expenses' },
  { key: 'TDS_PAYABLE', use: 'TDS deducted from subcontractors and vendors', name: 'TDS Payable', group: 'Duties & Taxes' },
  { key: 'RETENTION_PAYABLE', use: 'Retention kept from subcontractors', name: 'Retention Money from Subcontractors', group: 'Current Liabilities' },
  { key: 'SUB_ADVANCE', use: 'Advance recovered from subcontractors', name: 'Advances to Subcontractors', group: 'Loans & Advances (Asset)' },
  { key: 'MATERIAL_RECOVERY', use: 'Material recovered from subcontractors', name: 'Material Recovered from Subcontractors', group: 'Direct Expenses' },
  { key: 'VENDOR_DEDUCTIONS', use: 'Other deductions from vendors and subcontractors', name: 'Deductions from Vendors', group: 'Indirect Incomes' },
  { key: 'BANK', use: 'Payments and receipts by bank, UPI or card', name: 'Bank Account', group: 'Bank Accounts' },
  { key: 'CASH', use: 'Cash payments and receipts', name: 'Cash', group: 'Cash-in-Hand' },
  { key: 'SITE_CREDITORS', use: 'Expenses on credit from a vendor not in the vendor master', name: 'Site Creditors', group: 'Sundry Creditors' },
];

/** Ledger keys for the parties and categories: `CLIENT:<id>`, `VENDOR:<id>`, `EXPENSE:<category>`. */
export const tallyClientKey = (id: string) => `CLIENT:${id}`;
export const tallyVendorKey = (id: string) => `VENDOR:${id}`;
export const tallyExpenseKey = (c: ExpenseCategory) => `EXPENSE:${c}`;
export const TALLY_EXPENSE_GROUP = 'Direct Expenses';
export const TALLY_CLIENT_GROUP = 'Sundry Debtors';
export const TALLY_VENDOR_GROUP = 'Sundry Creditors';
export const tallyExpenseDefault = (c: ExpenseCategory) => `Site ${EXPENSE_CATEGORY_LABELS[c]}`;
