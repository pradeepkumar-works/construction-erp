/**
 * The statements' tests: where accounts land in Schedule III, the comparative year, the year's closing
 * lines, reading bank statements as banks give them, matching them to the bank book and the reconciliation, with no
 * database. CI runs it after the build:
 *
 *   node dist/scripts/statements-test.js
 */
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { ACCOUNT_GROUPS, BALANCE_SHEET_SECTIONS, PROFIT_LOSS_EXPENSES, PROFIT_LOSS_INCOME, STATEMENT_LINES, statementLineFits, statementLineOf } from '@erp/shared';
import { autoMatch, bankAmount, bankDate, closingLines, dayBefore, fyBetween, fyRange, readStatement, reconcile, rowFingerprint, statementLines, yearBefore, type AccountFigure } from '../statements/statements-rules';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);

test('every group lands on a Schedule III line of its own kind, and every line shows exactly once', () => {
  for (const g of ACCOUNT_GROUPS) {
    const line = statementLineOf({ key: 'X', group: g, statementLine: null }, 0);
    assert.ok(STATEMENT_LINES.includes(line), g);
  }
  const shown = [...PROFIT_LOSS_INCOME, ...PROFIT_LOSS_EXPENSES, 'TAX', ...BALANCE_SHEET_SECTIONS.flatMap((s) => s.lines)];
  assert.deepEqual([...shown].sort(), [...STATEMENT_LINES].sort());
  assert.equal(statementLineFits('EMPLOYEE', 'EXPENSE'), true);
  assert.equal(statementLineFits('EMPLOYEE', 'ASSET'), false);
  assert.equal(statementLineFits('CASH', 'LIABILITY'), true);
});

test('salaries are employee benefits, and balances on the other side move across', () => {
  assert.equal(statementLineOf({ key: 'SALARIES', group: 'INDIRECT_EXPENSES', statementLine: null }, 100), 'EMPLOYEE');
  assert.equal(statementLineOf({ key: 'ACCOUNT:1', group: 'INDIRECT_EXPENSES', statementLine: 'FINANCE' }, 100), 'FINANCE');
  assert.equal(statementLineOf({ key: 'BANK', group: 'BANK_ACCOUNTS', statementLine: null }, 500), 'CASH');
  assert.equal(statementLineOf({ key: 'BANK', group: 'BANK_ACCOUNTS', statementLine: null }, -500), 'SHORT_BORROWINGS');
  assert.equal(statementLineOf({ key: 'VENDOR:1', group: 'SUNDRY_CREDITORS', statementLine: null }, -10), 'TRADE_PAYABLES');
  assert.equal(statementLineOf({ key: 'VENDOR:1', group: 'SUNDRY_CREDITORS', statementLine: null }, 10), 'SHORT_LOANS');
  assert.equal(statementLineOf({ key: 'CLIENT:1', group: 'SUNDRY_DEBTORS', statementLine: null }, -10), 'OTHER_CURRENT_LIABILITIES');
  assert.equal(statementLineOf({ key: 'INPUT_CGST', group: 'DUTIES_TAXES', statementLine: null }, 10), 'OTHER_CURRENT_ASSETS');
});

test('statement lines add up in their own sense, with the comparative separately', () => {
  const a = (accountId: string, key: string, group: AccountFigure['group'], balance: number, previous: number): AccountFigure => ({ accountId, name: accountId, key, group, statementLine: null, balance: D(balance), previous: D(previous) });
  const lines = statementLines(
    [a('Works', 'SALES', 'SALES_ACCOUNTS', -1000, -800), a('Interest', 'X', 'INDIRECT_INCOMES', -50, 0), a('Bank', 'BANK', 'BANK_ACCOUNTS', 300, -20), a('Cash', 'CASH', 'CASH_IN_HAND', 40, 10)],
    ['REVENUE', 'OTHER_INCOME', 'CASH', 'SHORT_BORROWINGS'],
  );
  const by = Object.fromEntries(lines.map((l) => [l.line, l]));
  assert.deepEqual([by.REVENUE.amount, by.REVENUE.previous], ['1000.00', '800.00']);
  assert.deepEqual([by.OTHER_INCOME.amount, by.OTHER_INCOME.previous], ['50.00', '0.00']);
  // Overdrawn a year before: the bank was a borrowing then, cash and bank now.
  assert.deepEqual([by.CASH.amount, by.CASH.previous], ['340.00', '10.00']);
  assert.deepEqual([by.SHORT_BORROWINGS.amount, by.SHORT_BORROWINGS.previous], ['0.00', '20.00']);
  assert.deepEqual(by.CASH.accounts.map((x) => x.name), ['Bank', 'Cash']);
});

test('years run April to March, and the comparative is a year before', () => {
  assert.deepEqual(fyRange('2025-26'), { from: '2025-04-01', to: '2026-03-31' });
  assert.deepEqual(fyBetween('2024-05-10', '2026-10-22'), ['2024-25', '2025-26', '2026-27']);
  assert.equal(yearBefore('2028-02-29'), '2027-02-28');
  assert.equal(yearBefore('2026-10-22'), '2025-10-22');
  assert.equal(dayBefore('2026-04-01'), '2026-03-31');
  assert.equal(dayBefore('2028-03-01'), '2028-02-29');
});

test("a year's close empties income and expenses per project into the profit and loss account", () => {
  const { lines, profit } = closingLines(
    [
      { accountId: 'sales', projectId: 'p1', balance: D(-1000) },
      { accountId: 'sub', projectId: 'p1', balance: D(600) },
      { accountId: 'rent', projectId: null, balance: D(150) },
      { accountId: 'nil', projectId: null, balance: D(0) },
    ],
    'pl',
  );
  assert.equal(profit.toFixed(2), '250.00');
  assert.deepEqual(
    lines.map((l) => [l.accountId, l.projectId, l.debit.toFixed(2), l.credit.toFixed(2)]),
    [
      ['sales', 'p1', '1000.00', '0.00'],
      ['sub', 'p1', '0.00', '600.00'],
      ['rent', null, '0.00', '150.00'],
      ['pl', null, '0.00', '250.00'],
    ],
  );
  const loss = closingLines([{ accountId: 'rent', projectId: null, balance: D(90) }], 'pl');
  assert.equal(loss.profit.toFixed(2), '-90.00');
  assert.deepEqual(loss.lines.at(-1)!.debit.toFixed(2), '90.00');
});

test("banks' dates and amounts are read as Indian banks write them", () => {
  assert.equal(bankDate('05/04/2026'), '2026-04-05');
  assert.equal(bankDate('05-04-26'), '2026-04-05');
  assert.equal(bankDate('5-Apr-2026'), '2026-04-05');
  assert.equal(bankDate('05 Apr 2026'), '2026-04-05');
  assert.equal(bankDate('2026-04-05'), '2026-04-05');
  assert.equal(bankDate('05/04/2026 10:31:00'), '2026-04-05');
  assert.equal(bankDate('31/02/2026'), null);
  assert.equal(bankDate('Opening balance'), null);
  assert.equal(bankAmount('1,23,456.50')!.toFixed(2), '123456.50');
  assert.equal(bankAmount('25,000.00 Cr')!.toFixed(2), '25000.00');
  assert.equal(bankAmount('1,200.00 Dr')!.toFixed(2), '-1200.00');
  assert.equal(bankAmount('-'), null);
  assert.equal(bankAmount(''), null);
  assert.equal(bankAmount(1500)!.toFixed(2), '1500.00');
});

test('a statement with withdrawal and deposit columns is read from below its header', () => {
  const read = readStatement([
    ['HDFC BANK Ltd.', '', '', '', '', '', ''],
    ['Statement of account', '', '', '', '', '', ''],
    ['Date', 'Narration', 'Chq./Ref.No.', 'Value Dt', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance'],
    ['01/10/26', 'NEFT-SHREE CEMENT', 'N274262', '01/10/26', '1,18,000.00', '', '4,82,000.00'],
    ['03/10/26', 'RTGS CR-PUBLIC WORKS DEPT', 'UTR99887', '03/10/26', '', '12,50,000.00', '17,32,000.00'],
    ['03/10/26', 'CHQ PAID 000123', '000123', '03/10/26', '', '', '17,32,000.00'],
    ['', 'STATEMENT SUMMARY', '', '', '1,18,000.00', '12,50,000.00', ''],
  ]);
  assert.equal(read.rows.length, 2);
  assert.deepEqual(read.problems, ['Row 6: no withdrawal or deposit']);
  const [a, b] = read.rows;
  assert.deepEqual([a.date, a.description, a.reference, a.withdrawal.toFixed(2), a.deposit.toFixed(2), a.balance!.toFixed(2)], ['2026-10-01', 'NEFT-SHREE CEMENT', 'N274262', '118000.00', '0.00', '482000.00']);
  assert.deepEqual([b.deposit.toFixed(2), b.seq], ['1250000.00', 1]);
});

test('a statement with one amount column and Dr or Cr is read too', () => {
  const read = readStatement([
    ['Transaction Date', 'Description', 'Amount', 'Dr / Cr', 'Balance'],
    ['10-Oct-2026', 'IMPS bank charges', '17.70', 'DR', '9,982.30'],
    ['11-Oct-2026', 'Interest credit', '120', 'CR', '10,102.30'],
  ]);
  assert.deepEqual(
    read.rows.map((r) => [r.withdrawal.toFixed(2), r.deposit.toFixed(2)]),
    [
      ['17.70', '0.00'],
      ['0.00', '120.00'],
    ],
  );
  assert.throws(() => readStatement([['Name', 'Phone']]), /no header row/);
});

test('the same row twice in a file keeps both; the same file twice adds nothing', () => {
  const r = { date: '2026-10-01', description: 'Charges', reference: null, withdrawal: D(10), deposit: D(0), balance: null };
  assert.notEqual(rowFingerprint(r, 0), rowFingerprint(r, 1));
  assert.equal(rowFingerprint(r, 0), rowFingerprint({ ...r, description: 'Charges' }, 0));
});

test('matching pairs the same amount on the same side within the days, preferring the named reference', () => {
  const s = (id: string, date: string, out: number, inn: number, description = '', reference: string | null = null) => ({ id, date, description, reference, withdrawal: D(out), deposit: D(inn) });
  const b = (id: string, date: string, dr: number, cr: number, voucherNo = id, reference: string | null = null) => ({ id, date, voucherNo, reference, debit: D(dr), credit: D(cr) });
  const pairs = autoMatch(
    [s('s1', '2026-10-10', 5000, 0, 'CHQ 000456'), s('s2', '2026-10-12', 0, 20000), s('s3', '2026-10-30', 999, 0), s('s4', '2026-10-05', 300, 0)],
    [b('b1', '2026-10-08', 0, 5000), b('b2', '2026-10-09', 0, 5000, 'PV/2026-27/0002', '000456'), b('b3', '2026-10-11', 20000, 0), b('b4', '2026-09-01', 0, 999), b('b5', '2026-10-05', 300, 0)],
  );
  assert.deepEqual(pairs, [
    { statementLineId: 's1', bookLineId: 'b2' },
    { statementLineId: 's2', bookLineId: 'b3' },
  ]);
  // Two equal cheques: each statement line takes the nearest free one.
  const two = autoMatch([s('x', '2026-10-10', 100, 0), s('y', '2026-10-20', 100, 0)], [b('p', '2026-10-18', 0, 100), b('q', '2026-10-09', 0, 100)]);
  assert.deepEqual(two, [
    { statementLineId: 'x', bookLineId: 'q' },
    { statementLineId: 'y', bookLineId: 'p' },
  ]);
});

test('the reconciliation adds back cheques not presented and takes out deposits not cleared', () => {
  const r = reconcile({
    asOn: '2026-10-31',
    booksBalance: D(100_000),
    statementFrom: '2026-10-01',
    book: [
      { date: '2026-09-20', debit: D(0), credit: D(7000), clearedOn: null }, // before the statement: taken as cleared
      { date: '2026-10-28', debit: D(0), credit: D(15000), clearedOn: null }, // cheque not presented
      { date: '2026-10-30', debit: D(40000), credit: D(0), clearedOn: '2026-11-02' }, // cleared after the day
      { date: '2026-10-10', debit: D(0), credit: D(5000), clearedOn: '2026-10-12' },
    ],
    statement: [
      { date: '2026-10-12', withdrawal: D(5000), deposit: D(0), matched: true, balance: D(70_000), seq: 0 },
      { date: '2026-10-31', withdrawal: D(250), deposit: D(0), matched: false, balance: D(74_750), seq: 1 },
      { date: '2026-11-02', withdrawal: D(0), deposit: D(40000), matched: true, balance: D(114_750), seq: 2 },
    ],
  });
  assert.equal(r.notPresented.toFixed(2), '15000.00');
  assert.equal(r.notCleared.toFixed(2), '40000.00');
  assert.equal(r.bankOnlyWithdrawals.toFixed(2), '250.00');
  assert.equal(r.expectedBankBalance.toFixed(2), '74750.00');
  assert.equal(r.statementBalance!.toFixed(2), '74750.00');
  assert.equal(r.difference!.toFixed(2), '0.00');
});

let failed = 0;
for (const [name, fn] of cases) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`✗ ${name}\n  ${(e as Error).message.split('\n').join('\n  ')}`);
  }
}
console.log(`\nStatements: ${cases.length - failed} of ${cases.length} tests pass`);
process.exit(failed ? 1 : 0);
