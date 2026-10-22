import type { AccountGroup, AccountNature, LedgerAccountDto } from './books';

/**
 * Financial statements (v6 item 103): the trial balance, profit and loss and balance sheet in Schedule III order, the
 * bank reconciliation, opening balances, the lock date and the year's close. The figures are the books' approved
 * vouchers; this holds the statement lines, where each group lands, and the shapes the screens use.
 */

/** The lines of Schedule III (Division I) the statements show, profit and loss first, then the balance sheet. */
export const STATEMENT_LINES = [
  'REVENUE',
  'OTHER_INCOME',
  'MATERIALS',
  'INVENTORY_CHANGE',
  'CONSTRUCTION',
  'EMPLOYEE',
  'FINANCE',
  'DEPRECIATION',
  'OTHER_EXPENSES',
  'TAX',
  'SHARE_CAPITAL',
  'RESERVES',
  'LONG_BORROWINGS',
  'SHORT_BORROWINGS',
  'TRADE_PAYABLES',
  'OTHER_CURRENT_LIABILITIES',
  'SHORT_PROVISIONS',
  'PPE',
  'CWIP',
  'INVESTMENTS',
  'LONG_LOANS',
  'INVENTORIES',
  'TRADE_RECEIVABLES',
  'CASH',
  'SHORT_LOANS',
  'OTHER_CURRENT_ASSETS',
] as const;
export type StatementLine = (typeof STATEMENT_LINES)[number];
export const STATEMENT_LINE_LABELS: Record<StatementLine, string> = {
  REVENUE: 'Revenue from operations',
  OTHER_INCOME: 'Other income',
  MATERIALS: 'Cost of materials consumed',
  INVENTORY_CHANGE: 'Changes in inventories of work-in-progress',
  CONSTRUCTION: 'Construction and site expenses',
  EMPLOYEE: 'Employee benefits expense',
  FINANCE: 'Finance costs',
  DEPRECIATION: 'Depreciation and amortisation expense',
  OTHER_EXPENSES: 'Other expenses',
  TAX: 'Tax expense',
  SHARE_CAPITAL: 'Share capital',
  RESERVES: 'Reserves and surplus',
  LONG_BORROWINGS: 'Long-term borrowings',
  SHORT_BORROWINGS: 'Short-term borrowings',
  TRADE_PAYABLES: 'Trade payables',
  OTHER_CURRENT_LIABILITIES: 'Other current liabilities',
  SHORT_PROVISIONS: 'Short-term provisions',
  PPE: 'Property, plant and equipment',
  CWIP: 'Capital work-in-progress',
  INVESTMENTS: 'Non-current investments',
  LONG_LOANS: 'Long-term loans and advances',
  INVENTORIES: 'Inventories',
  TRADE_RECEIVABLES: 'Trade receivables',
  CASH: 'Cash and cash equivalents',
  SHORT_LOANS: 'Short-term loans and advances',
  OTHER_CURRENT_ASSETS: 'Other current assets',
};
/** What a line's figure is: income and expenses (profit and loss) or the balance sheet's two sides. */
export const STATEMENT_LINE_NATURE: Record<StatementLine, AccountNature> = {
  REVENUE: 'INCOME',
  OTHER_INCOME: 'INCOME',
  MATERIALS: 'EXPENSE',
  INVENTORY_CHANGE: 'EXPENSE',
  CONSTRUCTION: 'EXPENSE',
  EMPLOYEE: 'EXPENSE',
  FINANCE: 'EXPENSE',
  DEPRECIATION: 'EXPENSE',
  OTHER_EXPENSES: 'EXPENSE',
  TAX: 'EXPENSE',
  SHARE_CAPITAL: 'LIABILITY',
  RESERVES: 'LIABILITY',
  LONG_BORROWINGS: 'LIABILITY',
  SHORT_BORROWINGS: 'LIABILITY',
  TRADE_PAYABLES: 'LIABILITY',
  OTHER_CURRENT_LIABILITIES: 'LIABILITY',
  SHORT_PROVISIONS: 'LIABILITY',
  PPE: 'ASSET',
  CWIP: 'ASSET',
  INVESTMENTS: 'ASSET',
  LONG_LOANS: 'ASSET',
  INVENTORIES: 'ASSET',
  TRADE_RECEIVABLES: 'ASSET',
  CASH: 'ASSET',
  SHORT_LOANS: 'ASSET',
  OTHER_CURRENT_ASSETS: 'ASSET',
};
/** Profit and loss lines go only to income or expense accounts, balance sheet lines only to assets or liabilities. */
export const statementLineFits = (line: StatementLine, nature: AccountNature) =>
  (STATEMENT_LINE_NATURE[line] === 'INCOME' || STATEMENT_LINE_NATURE[line] === 'EXPENSE') === (nature === 'INCOME' || nature === 'EXPENSE');

/** The balance sheet's headings in Schedule III order, each with its lines. */
export const BALANCE_SHEET_SECTIONS: { key: string; label: string; side: 'LIABILITY' | 'ASSET'; lines: StatementLine[] }[] = [
  { key: 'FUNDS', label: "Shareholders' funds", side: 'LIABILITY', lines: ['SHARE_CAPITAL', 'RESERVES'] },
  { key: 'NON_CURRENT_LIABILITIES', label: 'Non-current liabilities', side: 'LIABILITY', lines: ['LONG_BORROWINGS'] },
  { key: 'CURRENT_LIABILITIES', label: 'Current liabilities', side: 'LIABILITY', lines: ['SHORT_BORROWINGS', 'TRADE_PAYABLES', 'OTHER_CURRENT_LIABILITIES', 'SHORT_PROVISIONS'] },
  { key: 'NON_CURRENT_ASSETS', label: 'Non-current assets', side: 'ASSET', lines: ['PPE', 'CWIP', 'INVESTMENTS', 'LONG_LOANS'] },
  { key: 'CURRENT_ASSETS', label: 'Current assets', side: 'ASSET', lines: ['INVENTORIES', 'TRADE_RECEIVABLES', 'CASH', 'SHORT_LOANS', 'OTHER_CURRENT_ASSETS'] },
];
export const PROFIT_LOSS_INCOME: StatementLine[] = ['REVENUE', 'OTHER_INCOME'];
export const PROFIT_LOSS_EXPENSES: StatementLine[] = ['MATERIALS', 'INVENTORY_CHANGE', 'CONSTRUCTION', 'EMPLOYEE', 'FINANCE', 'DEPRECIATION', 'OTHER_EXPENSES'];

/** The line each group lands on when its balance is the group's usual side. */
const GROUP_LINE: Record<AccountGroup, StatementLine> = {
  CAPITAL_ACCOUNT: 'SHARE_CAPITAL',
  RESERVES_SURPLUS: 'RESERVES',
  LOANS_LIABILITY: 'LONG_BORROWINGS',
  SECURED_LOANS: 'LONG_BORROWINGS',
  UNSECURED_LOANS: 'LONG_BORROWINGS',
  CURRENT_LIABILITIES: 'OTHER_CURRENT_LIABILITIES',
  DUTIES_TAXES: 'OTHER_CURRENT_LIABILITIES',
  PROVISIONS: 'SHORT_PROVISIONS',
  SUNDRY_CREDITORS: 'TRADE_PAYABLES',
  FIXED_ASSETS: 'PPE',
  INVESTMENTS: 'INVESTMENTS',
  CURRENT_ASSETS: 'OTHER_CURRENT_ASSETS',
  BANK_ACCOUNTS: 'CASH',
  CASH_IN_HAND: 'CASH',
  DEPOSITS_ASSET: 'LONG_LOANS',
  LOANS_ADVANCES_ASSET: 'SHORT_LOANS',
  STOCK_IN_HAND: 'INVENTORIES',
  SUNDRY_DEBTORS: 'TRADE_RECEIVABLES',
  SALES_ACCOUNTS: 'REVENUE',
  DIRECT_INCOMES: 'REVENUE',
  INDIRECT_INCOMES: 'OTHER_INCOME',
  PURCHASE_ACCOUNTS: 'MATERIALS',
  DIRECT_EXPENSES: 'CONSTRUCTION',
  INDIRECT_EXPENSES: 'OTHER_EXPENSES',
  SUSPENSE: 'OTHER_CURRENT_LIABILITIES',
};
/** Ledgers the modules post that Schedule III shows on a line of their own, not their group's. */
const KEY_LINE: Record<string, StatementLine> = { SALARIES: 'EMPLOYEE', EMPLOYER_PF: 'EMPLOYEE', EMPLOYER_ESI: 'EMPLOYEE' };

/**
 * Where an account shows in the statements: the line accounts chose for it, else its group's, with a balance on the
 * other side moved across as accountants do (an overdrawn bank is a borrowing, an advance to a supplier is a loan and
 * advance, an advance from a client a current liability, GST credit a current asset). `balance` is debit positive.
 */
export function statementLineOf(a: { key: string; group: AccountGroup; statementLine: StatementLine | null }, balance: number): StatementLine {
  if (a.statementLine) return a.statementLine;
  const line = KEY_LINE[a.key] ?? GROUP_LINE[a.group];
  if (balance > 0 && (a.group === 'SUNDRY_CREDITORS' || a.group === 'CURRENT_LIABILITIES')) return 'SHORT_LOANS';
  if (balance > 0 && (a.group === 'DUTIES_TAXES' || a.group === 'SUSPENSE')) return 'OTHER_CURRENT_ASSETS';
  if (balance < 0 && a.group === 'SUNDRY_DEBTORS') return 'OTHER_CURRENT_LIABILITIES';
  if (balance < 0 && a.group === 'BANK_ACCOUNTS') return 'SHORT_BORROWINGS';
  return line;
}

// ----- Screens -----

export interface TrialBalanceRowDto {
  accountId: string;
  name: string;
  code: string | null;
  group: AccountGroup;
  /** Balance before `from`, debit positive */
  opening: string;
  debit: string;
  credit: string;
  closing: string;
}
export interface TrialBalanceDto {
  from: string;
  to: string;
  projectId: string | null;
  rows: TrialBalanceRowDto[];
  /** Debit and credit totals of the opening, the period and the closing columns */
  totals: { openingDebit: string; openingCredit: string; debit: string; credit: string; closingDebit: string; closingCredit: string };
}

/** The period's movement (debit positive) of each account on each project; `none` is head office. */
export interface TrialBalanceByProjectDto {
  from: string;
  to: string;
  projects: { id: string; code: string; name: string }[];
  rows: { accountId: string; name: string; group: AccountGroup; cells: Record<string, string>; total: string }[];
}

export interface StatementAccountDto {
  accountId: string;
  name: string;
  /** In the line's own sense: income and liabilities credit positive, expenses and assets debit positive */
  amount: string;
  previous: string;
}
export interface StatementLineDto {
  line: StatementLine;
  label: string;
  amount: string;
  /** The same period a year before (Schedule III's comparative) */
  previous: string;
  accounts: StatementAccountDto[];
}

export interface ProfitLossDto {
  from: string;
  to: string;
  previousFrom: string;
  previousTo: string;
  projectId: string | null;
  income: StatementLineDto[];
  expenses: StatementLineDto[];
  totalIncome: { amount: string; previous: string };
  totalExpenses: { amount: string; previous: string };
  profitBeforeTax: { amount: string; previous: string };
  tax: StatementLineDto;
  profit: { amount: string; previous: string };
  /** Each project's figures when asked for by project; `none` is head office */
  byProject?: { projects: { id: string; code: string; name: string }[]; lines: { line: StatementLine; cells: Record<string, string> }[]; profit: Record<string, string> };
}

export interface BalanceSheetSectionDto {
  key: string;
  label: string;
  side: 'LIABILITY' | 'ASSET';
  lines: StatementLineDto[];
  total: { amount: string; previous: string };
}
export interface BalanceSheetDto {
  asOn: string;
  previousAsOn: string;
  sections: BalanceSheetSectionDto[];
  totalLiabilities: { amount: string; previous: string };
  totalAssets: { amount: string; previous: string };
  /** Profit of the years not yet closed, inside reserves and surplus */
  profitNotClosed: { amount: string; previous: string };
  /** Assets less liabilities; zero when the books balance */
  difference: string;
}

// ----- Bank reconciliation -----

/** One row of a bank statement, read from the bank's CSV or Excel file. */
export interface StatementRowInput {
  date: string;
  description: string;
  reference?: string | null;
  withdrawal?: number | string | null;
  deposit?: number | string | null;
  balance?: number | string | null;
}

export interface BankStatementLineDto {
  id: string;
  date: string;
  description: string;
  reference: string | null;
  withdrawal: string | null;
  deposit: string | null;
  balance: string | null;
  bookLineId: string | null;
  /** The voucher it was matched to */
  voucherNo: string | null;
  voucherDate: string | null;
  matchedBy: 'AUTO' | 'HAND' | null;
}

export interface BankBookLineDto {
  lineId: string;
  voucherId: string;
  voucherNo: string;
  date: string;
  against: string;
  narration: string;
  reference: string | null;
  /** Money into the bank (a debit in the books) */
  deposit: string | null;
  withdrawal: string | null;
  statementLineId: string | null;
  statementDate: string | null;
}

export interface BankReconciliationDto {
  account: Pick<LedgerAccountDto, 'id' | 'name' | 'balance'>;
  asOn: string;
  /** The statement's first day; book entries before it are taken as cleared */
  statementFrom: string | null;
  booksBalance: string;
  /** Paid in the books, not yet through the bank (cheques issued, not presented) */
  notPresented: string;
  /** Received in the books, not yet credited by the bank */
  notCleared: string;
  /** On the statement only: deposits (interest, a client paying straight in) and withdrawals (charges) */
  bankOnlyDeposits: string;
  bankOnlyWithdrawals: string;
  /** What the bank should show from the books and the items above */
  expectedBankBalance: string;
  /** What the statement shows on that day, when it has balances */
  statementBalance: string | null;
  difference: string | null;
  statement: BankStatementLineDto[];
  book: BankBookLineDto[];
}

export interface BankImportResultDto {
  added: number;
  skipped: number;
  matched: number;
}

// ----- Opening balances, the lock and the year's close -----

export interface FinancialYearDto {
  /** 2025-26 */
  code: string;
  from: string;
  to: string;
  closed: boolean;
  closedAt: string | null;
  closedByName: string | null;
  /** Profit (credit positive) the close carried to reserves, or the year's so far */
  profit: string;
  /** Why it cannot be closed now, if so */
  blockers: string[];
  canClose: boolean;
  canReopen: boolean;
}

export interface OpeningLineDto {
  accountId: string;
  name: string;
  group: AccountGroup;
  debit: string | null;
  credit: string | null;
}

export interface BooksYearDto {
  /** The day the books in Nirmaan begin: module records before it are in the opening balances instead */
  booksFrom: string | null;
  lockedUpTo: string | null;
  opening: OpeningLineDto[];
  openingDebit: string;
  openingCredit: string;
  years: FinancialYearDto[];
  canChangeOpening: boolean;
  canLock: boolean;
}
