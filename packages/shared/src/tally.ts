/** Tally export (TallyPrime XML): voucher kinds and the ledgers Nirmaan posts to, with their default names and groups. */
import type { ExpenseCategory } from './enums';
import { EXPENSE_CATEGORY_LABELS } from './labels';

/** What a Nirmaan record becomes in Tally. */
export const TALLY_VOUCHER_KINDS = ['SALES', 'RECEIPT', 'PURCHASE', 'SUBCONTRACT', 'PAYMENT', 'EXPENSE', 'DEBIT_NOTE', 'SALARY', 'SALARY_PAYMENT', 'STAFF_LOAN', 'RMC_SALE', 'RMC_RECEIPT', 'MACHINE_LOAN', 'LOAN_EMI'] as const;
export type TallyVoucherKind = (typeof TALLY_VOUCHER_KINDS)[number];
export const TALLY_VOUCHER_KIND_LABELS: Record<TallyVoucherKind, string> = {
  SALES: 'RA bills',
  RECEIPT: 'Money received',
  PURCHASE: 'Vendor bills',
  SUBCONTRACT: 'Subcontractor bills',
  PAYMENT: 'Payments to vendors',
  EXPENSE: 'Site expenses',
  DEBIT_NOTE: 'Debit notes',
  SALARY: 'Salary runs',
  SALARY_PAYMENT: 'Salaries paid',
  STAFF_LOAN: 'Loans to staff',
  RMC_SALE: 'RMC bills',
  RMC_RECEIPT: 'RMC money received',
  MACHINE_LOAN: 'Machine loans taken',
  LOAN_EMI: 'Machine loan EMIs paid',
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
  SALARY: 'Journal',
  SALARY_PAYMENT: 'Payment',
  STAFF_LOAN: 'Payment',
  RMC_SALE: 'Sales',
  RMC_RECEIPT: 'Receipt',
  MACHINE_LOAN: 'Journal',
  LOAN_EMI: 'Payment',
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
  { key: 'SALARIES', use: 'Gross salaries of approved salary runs', name: 'Salaries and Wages', group: 'Indirect Expenses' },
  { key: 'EMPLOYER_PF', use: "The company's PF and pension on salaries", name: 'Employer Contribution to PF', group: 'Indirect Expenses' },
  { key: 'EMPLOYER_ESI', use: "The company's ESI on salaries", name: 'Employer Contribution to ESI', group: 'Indirect Expenses' },
  { key: 'PF_PAYABLE', use: 'PF to deposit (both shares)', name: 'PF Payable', group: 'Duties & Taxes' },
  { key: 'ESI_PAYABLE', use: 'ESI to deposit (both shares)', name: 'ESI Payable', group: 'Duties & Taxes' },
  { key: 'PT_PAYABLE', use: 'Professional tax deducted from salaries', name: 'Professional Tax Payable', group: 'Duties & Taxes' },
  { key: 'SALARY_TDS_PAYABLE', use: 'Income tax deducted from salaries', name: 'TDS on Salaries Payable', group: 'Duties & Taxes' },
  { key: 'STAFF_LOANS', use: 'Loans and salary advances to staff, recovered from salary', name: 'Loans and Advances to Staff', group: 'Loans & Advances (Asset)' },
  { key: 'STAFF_RECOVERIES', use: 'Other deductions from salaries', name: 'Recoveries from Staff', group: 'Indirect Incomes' },
  { key: 'SALARY_PAYABLE', use: 'Net salaries approved, not yet paid', name: 'Salaries Payable', group: 'Current Liabilities' },
  { key: 'RMC_SALES', use: 'Concrete and pumping on RMC bills', name: 'Sales of Ready-Mix Concrete', group: 'Sales Accounts' },
  { key: 'MACHINERY', use: 'Machines bought on a loan the lender paid to the dealer', name: 'Plant and Machinery', group: 'Fixed Assets' },
  { key: 'LOAN_INTEREST', use: 'Interest in the EMIs of machine loans', name: 'Interest on Machinery Loans', group: 'Indirect Expenses' },
  { key: 'EXCHANGE_DIFFERENCE', use: 'A client in another currency paying at a rate other than the contract rate', name: 'Exchange Difference', group: 'Indirect Incomes' },
];

/** Ledger keys for the parties and categories: `CLIENT:<id>`, `VENDOR:<id>`, `EXPENSE:<category>`. */
export const tallyClientKey = (id: string) => `CLIENT:${id}`;
export const tallyVendorKey = (id: string) => `VENDOR:${id}`;
export const tallyExpenseKey = (c: ExpenseCategory) => `EXPENSE:${c}`;
/** A machine loan's own ledger, under Secured Loans: `LOAN:<id>`. */
export const tallyLoanKey = (id: string) => `LOAN:${id}`;
export const TALLY_LOAN_GROUP = 'Secured Loans';
export const loanLedgerName = (l: { lenderName: string; loanNo: string }) => `${l.lenderName} Loan ${l.loanNo}`;
export const TALLY_EXPENSE_GROUP = 'Direct Expenses';
export const TALLY_CLIENT_GROUP = 'Sundry Debtors';
export const TALLY_VENDOR_GROUP = 'Sundry Creditors';
export const tallyExpenseDefault = (c: ExpenseCategory) => `Site ${EXPENSE_CATEGORY_LABELS[c]}`;
