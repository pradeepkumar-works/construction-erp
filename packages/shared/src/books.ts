import type { StatementLine } from './statements';

/**
 * Books of account (v6 item 102): the chart of accounts, vouchers (posted by the modules or made by accounts with
 * approval), and the day book, cash and bank books and ledgers built from them. The posting rules are the API's
 * posting service, shared with the Tally export; this holds the groups, labels and the shapes the screens use.
 */

/** Account groups, as Tally names its primary groups so accountants find them where they expect. */
export const ACCOUNT_GROUPS = [
  'CAPITAL_ACCOUNT',
  'RESERVES_SURPLUS',
  'LOANS_LIABILITY',
  'SECURED_LOANS',
  'UNSECURED_LOANS',
  'CURRENT_LIABILITIES',
  'DUTIES_TAXES',
  'PROVISIONS',
  'SUNDRY_CREDITORS',
  'FIXED_ASSETS',
  'INVESTMENTS',
  'CURRENT_ASSETS',
  'BANK_ACCOUNTS',
  'CASH_IN_HAND',
  'DEPOSITS_ASSET',
  'LOANS_ADVANCES_ASSET',
  'STOCK_IN_HAND',
  'SUNDRY_DEBTORS',
  'SALES_ACCOUNTS',
  'DIRECT_INCOMES',
  'INDIRECT_INCOMES',
  'PURCHASE_ACCOUNTS',
  'DIRECT_EXPENSES',
  'INDIRECT_EXPENSES',
  'SUSPENSE',
] as const;
export type AccountGroup = (typeof ACCOUNT_GROUPS)[number];
export const ACCOUNT_GROUP_LABELS: Record<AccountGroup, string> = {
  CAPITAL_ACCOUNT: 'Capital Account',
  RESERVES_SURPLUS: 'Reserves & Surplus',
  LOANS_LIABILITY: 'Loans (Liability)',
  SECURED_LOANS: 'Secured Loans',
  UNSECURED_LOANS: 'Unsecured Loans',
  CURRENT_LIABILITIES: 'Current Liabilities',
  DUTIES_TAXES: 'Duties & Taxes',
  PROVISIONS: 'Provisions',
  SUNDRY_CREDITORS: 'Sundry Creditors',
  FIXED_ASSETS: 'Fixed Assets',
  INVESTMENTS: 'Investments',
  CURRENT_ASSETS: 'Current Assets',
  BANK_ACCOUNTS: 'Bank Accounts',
  CASH_IN_HAND: 'Cash-in-Hand',
  DEPOSITS_ASSET: 'Deposits (Asset)',
  LOANS_ADVANCES_ASSET: 'Loans & Advances (Asset)',
  STOCK_IN_HAND: 'Stock-in-Hand',
  SUNDRY_DEBTORS: 'Sundry Debtors',
  SALES_ACCOUNTS: 'Sales Accounts',
  DIRECT_INCOMES: 'Direct Incomes',
  INDIRECT_INCOMES: 'Indirect Incomes',
  PURCHASE_ACCOUNTS: 'Purchase Accounts',
  DIRECT_EXPENSES: 'Direct Expenses',
  INDIRECT_EXPENSES: 'Indirect Expenses',
  SUSPENSE: 'Suspense A/c',
};
/** The group whose Tally name this is (the Tally export's ledgers carry Tally group names). */
export const accountGroupOf = (tallyGroup: string): AccountGroup =>
  (Object.entries(ACCOUNT_GROUP_LABELS).find(([, l]) => l === tallyGroup)?.[0] as AccountGroup | undefined) ?? 'SUSPENSE';

/** What the balance of a group is: the balance sheet's two sides, or the profit and loss account's. */
export type AccountNature = 'ASSET' | 'LIABILITY' | 'INCOME' | 'EXPENSE';
export const ACCOUNT_GROUP_NATURE: Record<AccountGroup, AccountNature> = {
  CAPITAL_ACCOUNT: 'LIABILITY',
  RESERVES_SURPLUS: 'LIABILITY',
  LOANS_LIABILITY: 'LIABILITY',
  SECURED_LOANS: 'LIABILITY',
  UNSECURED_LOANS: 'LIABILITY',
  CURRENT_LIABILITIES: 'LIABILITY',
  DUTIES_TAXES: 'LIABILITY',
  PROVISIONS: 'LIABILITY',
  SUNDRY_CREDITORS: 'LIABILITY',
  FIXED_ASSETS: 'ASSET',
  INVESTMENTS: 'ASSET',
  CURRENT_ASSETS: 'ASSET',
  BANK_ACCOUNTS: 'ASSET',
  CASH_IN_HAND: 'ASSET',
  DEPOSITS_ASSET: 'ASSET',
  LOANS_ADVANCES_ASSET: 'ASSET',
  STOCK_IN_HAND: 'ASSET',
  SUNDRY_DEBTORS: 'ASSET',
  SALES_ACCOUNTS: 'INCOME',
  DIRECT_INCOMES: 'INCOME',
  INDIRECT_INCOMES: 'INCOME',
  PURCHASE_ACCOUNTS: 'EXPENSE',
  DIRECT_EXPENSES: 'EXPENSE',
  INDIRECT_EXPENSES: 'EXPENSE',
  SUSPENSE: 'ASSET',
};
export const ACCOUNT_NATURE_LABELS: Record<AccountNature, string> = { ASSET: 'Assets', LIABILITY: 'Liabilities', INCOME: 'Income', EXPENSE: 'Expenses' };
/** Cash and bank accounts: the ones a payment, receipt or contra moves money through. */
export const isMoneyGroup = (g: AccountGroup) => g === 'BANK_ACCOUNTS' || g === 'CASH_IN_HAND';

export const BOOK_VOUCHER_TYPES = ['JOURNAL', 'PAYMENT', 'RECEIPT', 'CONTRA', 'SALES', 'PURCHASE', 'DEBIT_NOTE', 'CREDIT_NOTE'] as const;
export type BookVoucherType = (typeof BOOK_VOUCHER_TYPES)[number];
export const BOOK_VOUCHER_TYPE_LABELS: Record<BookVoucherType, string> = {
  JOURNAL: 'Journal',
  PAYMENT: 'Payment',
  RECEIPT: 'Receipt',
  CONTRA: 'Contra',
  SALES: 'Sales',
  PURCHASE: 'Purchase',
  DEBIT_NOTE: 'Debit note',
  CREDIT_NOTE: 'Credit note',
};
/** What accounts may make by hand; the rest come from the modules. */
export const MANUAL_VOUCHER_TYPES = ['JOURNAL', 'PAYMENT', 'RECEIPT', 'CONTRA'] as const satisfies readonly BookVoucherType[];
export type ManualVoucherType = (typeof MANUAL_VOUCHER_TYPES)[number];
/** Number prefix of a hand-made voucher: JV/2026-27/0001. */
export const MANUAL_VOUCHER_PREFIX: Record<ManualVoucherType, string> = { JOURNAL: 'JV', PAYMENT: 'PV', RECEIPT: 'RV', CONTRA: 'CV' };
export const MANUAL_VOUCHER_HELP: Record<ManualVoucherType, string> = {
  JOURNAL: 'Adjustments between accounts: provisions, transfers, corrections.',
  PAYMENT: 'Money paid out of cash or a bank account.',
  RECEIPT: 'Money received into cash or a bank account.',
  CONTRA: 'Money moved between cash and bank accounts.',
};

export const BOOK_VOUCHER_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export type BookVoucherStatus = (typeof BOOK_VOUCHER_STATUSES)[number];
export const BOOK_VOUCHER_STATUS_LABELS: Record<BookVoucherStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Waiting for approval',
  APPROVED: 'In the books',
  REJECTED: 'Sent back',
  CANCELLED: 'Cancelled',
};

/** Where a voucher came from: made by hand, or posted from a module's record. */
export const BOOK_SOURCES = ['MANUAL', 'SALES', 'RECEIPT', 'PURCHASE', 'SUBCONTRACT', 'PAYMENT', 'EXPENSE', 'DEBIT_NOTE', 'SALARY', 'SALARY_PAYMENT', 'STAFF_LOAN', 'RMC_SALE', 'RMC_RECEIPT', 'OPENING', 'YEAR_CLOSE'] as const;
export type BookSource = (typeof BOOK_SOURCES)[number];
export const BOOK_SOURCE_LABELS: Record<BookSource, string> = {
  MANUAL: 'Made by hand',
  SALES: 'RA bill',
  RECEIPT: 'Money received',
  PURCHASE: 'Vendor bill',
  SUBCONTRACT: 'Subcontractor bill',
  PAYMENT: 'Payment to a vendor',
  EXPENSE: 'Site expense',
  DEBIT_NOTE: 'Debit note',
  SALARY: 'Salary run',
  SALARY_PAYMENT: 'Salary paid',
  STAFF_LOAN: 'Loan to staff',
  RMC_SALE: 'RMC bill',
  RMC_RECEIPT: 'RMC money received',
  OPENING: 'Opening balances',
  YEAR_CLOSE: 'Year close',
};
/** Vouchers the books make themselves (opening balances, the year's close), which the posting run leaves alone. */
export const BOOK_OWN_SOURCES = ['MANUAL', 'OPENING', 'YEAR_CLOSE'] as const satisfies readonly BookSource[];

export interface LedgerAccountDto {
  id: string;
  /** The posting key (`PURCHASE`, `VENDOR:<id>`, …); a hand-made account's is `ACCOUNT:<id>` */
  key: string;
  name: string;
  code: string | null;
  group: AccountGroup;
  nature: AccountNature;
  /** Made by the posting service for a module's ledger; its key never changes */
  isSystem: boolean;
  isActive: boolean;
  description: string | null;
  /** Where the statements show it, when accounts chose a line other than its group's */
  statementLine: StatementLine | null;
  /** Totals in the books up to the date asked (all dates when none) */
  debit: string;
  credit: string;
  /** Debit less credit: positive is a debit balance */
  balance: string;
  entries: number;
}

export interface BookLineDto {
  id: string;
  accountId: string;
  accountName: string;
  projectId: string | null;
  projectCode: string | null;
  debit: string | null;
  credit: string | null;
  narration: string | null;
}

export interface BookVoucherDto {
  id: string;
  voucherNo: string;
  type: BookVoucherType;
  date: string;
  source: BookSource;
  sourceId: string | null;
  reference: string | null;
  party: string | null;
  narration: string;
  projectId: string | null;
  projectName: string | null;
  amount: string;
  status: BookVoucherStatus;
  preparedByName: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  reviewNote: string | null;
  canEdit: boolean;
  canSubmit: boolean;
  canDecide: boolean;
  canCancel: boolean;
  lines: BookLineDto[];
}

export interface LedgerEntryDto {
  lineId: string;
  voucherId: string;
  voucherNo: string;
  type: BookVoucherType;
  source: BookSource;
  date: string;
  /** The other accounts of the voucher ("Purchase of Materials", or "Several" with the first) */
  against: string;
  narration: string;
  projectCode: string | null;
  debit: string | null;
  credit: string | null;
  /** Running balance after this entry, debit positive */
  balance: string;
}

export interface LedgerDto {
  account: LedgerAccountDto;
  from: string | null;
  to: string;
  /** Balance before `from`, debit positive */
  opening: string;
  debit: string;
  credit: string;
  closing: string;
  entries: LedgerEntryDto[];
  /** True when there are more entries than shown (the oldest are left out) */
  truncated: boolean;
}

export interface BooksHeldDto {
  source: BookSource;
  sourceId: string;
  date: string;
  number: string;
  party: string;
  reason: string;
}

export interface BooksStatusDto {
  lastPostedAt: string | null;
  vouchers: number;
  /** Module records that could not be posted, with why */
  held: BooksHeldDto[];
  toApprove: number;
}

export interface BooksPostResultDto {
  added: number;
  changed: number;
  removed: number;
  held: number;
}
