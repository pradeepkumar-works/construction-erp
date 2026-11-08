/**
 * The books' tests: what a hand-made voucher must be, voucher numbers by financial year, running balances,
 * and that every ledger the posting service uses has a group in the chart of accounts, with no database. CI runs it
 * after the build:
 *
 *   node dist/scripts/books-test.js
 */
import assert from 'node:assert/strict';
import { ACCOUNT_GROUP_LABELS, ACCOUNT_GROUP_NATURE, ACCOUNT_GROUPS, TALLY_CLIENT_GROUP, TALLY_EXPENSE_GROUP, TALLY_FIXED_LEDGERS, TALLY_VENDOR_GROUP, accountGroupOf } from '@erp/shared';
import { Prisma } from '@prisma/client';
import { againstOf, fyCode, runningBalances, voucherHash, voucherNumber, voucherProblem, voucherSeq } from '../books/books-rules';
import { holdLostLines, raBillSaleLines } from '../posting/client-bill-lines';
import { billOwed } from '../receivables/bill-settlement';
import { balanced } from '../tally/vouchers';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);

test('a journal balances, one side per line, and leaves cash and bank alone', () => {
  assert.equal(voucherProblem('JOURNAL', [{ group: 'INDIRECT_EXPENSES', debit: 1000, credit: 0 }, { group: 'PROVISIONS', debit: 0, credit: 1000 }]), null);
  assert.match(voucherProblem('JOURNAL', [{ group: 'INDIRECT_EXPENSES', debit: 1000, credit: 0 }])!, /at least two lines/);
  assert.equal(voucherProblem('JOURNAL', [{ group: 'INDIRECT_EXPENSES', debit: 1000, credit: 0 }, { group: 'PROVISIONS', debit: 0, credit: 999.5 }]), 'Debits ₹1000.00 and credits ₹999.50 differ by ₹0.50');
  assert.equal(voucherProblem('JOURNAL', [{ group: 'INDIRECT_EXPENSES', debit: 10, credit: 10 }, { group: 'PROVISIONS', debit: 0, credit: 0 }]), 'Line 1: enter a debit or a credit, not both');
  assert.equal(voucherProblem('JOURNAL', [{ group: 'INDIRECT_EXPENSES', debit: 10, credit: 0 }, { group: 'PROVISIONS', debit: 0, credit: 0 }]), 'Line 2: enter a debit or a credit, not neither');
  assert.match(voucherProblem('JOURNAL', [{ group: 'INDIRECT_EXPENSES', debit: 10, credit: 0 }, { group: 'BANK_ACCOUNTS', debit: 0, credit: 10 }])!, /payment, receipt or contra/);
});

test('payments, receipts and contras move money the right way', () => {
  const rent = { group: 'INDIRECT_EXPENSES' as const, debit: 85000, credit: 0 };
  assert.equal(voucherProblem('PAYMENT', [rent, { group: 'BANK_ACCOUNTS', debit: 0, credit: 85000 }]), null);
  assert.match(voucherProblem('PAYMENT', [rent, { group: 'SUNDRY_CREDITORS', debit: 0, credit: 85000 }])!, /credits the cash or bank/);
  assert.equal(voucherProblem('RECEIPT', [{ group: 'CASH_IN_HAND', debit: 500, credit: 0 }, { group: 'SUNDRY_DEBTORS', debit: 0, credit: 500 }]), null);
  assert.match(voucherProblem('RECEIPT', [{ group: 'SUNDRY_DEBTORS', debit: 500, credit: 0 }, { group: 'CASH_IN_HAND', debit: 0, credit: 500 }])!, /debits the cash or bank/);
  assert.equal(voucherProblem('CONTRA', [{ group: 'CASH_IN_HAND', debit: 200000, credit: 0 }, { group: 'BANK_ACCOUNTS', debit: 0, credit: 200000 }]), null);
  assert.match(voucherProblem('CONTRA', [{ group: 'CASH_IN_HAND', debit: 5, credit: 0 }, { group: 'CAPITAL_ACCOUNT', debit: 0, credit: 5 }])!, /between cash and bank accounts only/);
});

test('voucher numbers count per type within the April to March year', () => {
  assert.equal(fyCode('2026-04-01'), '2026-27');
  assert.equal(fyCode('2027-03-31'), '2026-27');
  assert.equal(fyCode('2026-03-31'), '2025-26');
  assert.equal(fyCode('2099-12-31'), '2099-00');
  assert.equal(voucherNumber('JOURNAL', '2026-10-22', 7), 'JV/2026-27/0007');
  assert.equal(voucherNumber('CONTRA', '2027-01-05', 12345), 'CV/2026-27/12345');
  assert.equal(voucherSeq('PAYMENT', '2026-10-22', 'PV/2026-27/0042'), 42);
  assert.equal(voucherSeq('PAYMENT', '2026-10-22', 'PV/2025-26/0042'), 0);
  assert.equal(voucherSeq('PAYMENT', '2026-10-22', 'RV/2026-27/0042'), 0);
});

test('running balance from the opening, debit positive', () => {
  const b = runningBalances(1000, [
    { debit: 500, credit: 0 },
    { debit: 0, credit: 2000 },
    { debit: '0.25', credit: 0 },
  ]).map((d) => d.toFixed(2));
  assert.deepEqual(b, ['1500.00', '-500.00', '-499.75']);
});

test('what a ledger line was against: the other side, or the first of several', () => {
  const lines = [
    { accountId: 'v', name: 'Shree Cement', debit: 0 },
    { accountId: 'p', name: 'Purchase of Materials', debit: 100 },
    { accountId: 'g', name: 'Input CGST', debit: 9 },
    { accountId: 'h', name: 'Input SGST', debit: 9 },
  ];
  assert.equal(againstOf(lines, { accountId: 'v', debit: 0 }), 'Purchase of Materials and 2 more');
  assert.equal(againstOf(lines, { accountId: 'p', debit: 100 }), 'Shree Cement');
});

test('a posted voucher is rewritten only when what it was built from changes', () => {
  const v = { date: '2026-10-01', number: 'VB-1', reference: 'INV 9', narration: 'Invoice 9', projectId: 'p1', lines: [{ key: 'PURCHASE', projectId: 'p1', amount: '100.00' }] };
  assert.equal(voucherHash(v), voucherHash({ ...v, lines: [...v.lines] }));
  assert.notEqual(voucherHash(v), voucherHash({ ...v, lines: [{ ...v.lines[0], amount: '100.01' }] }));
});

test('an RA bill debits the client what it owes, the secured advance and amounts withheld on their own ledgers', () => {
  const D = (v: string) => new Prisma.Decimal(v);
  const name = (key: string, fallback?: string) => fallback ?? key;
  const client = { key: 'CLIENT:1', name: 'Works Department' };
  const b = { grossAmount: D('1000000'), pvAmount: D('20000'), gstAmount: D('183600'), securedAdvance: D('369000'), securedAdvanceRecovered: D('246000'), withheld: D('185000'), withheldReleased: D('148000') };
  const lines = raBillSaleLines(name, b, client);
  const on = (ls: typeof lines, key: string) => ls.find((l) => l.ledgerKey === key)?.amount.toFixed(2);
  assert.ok(balanced(lines));
  assert.equal(on(lines, 'CLIENT:1'), billOwed(b).toFixed(2));
  assert.equal(on(lines, 'SALES'), '-1020000.00');
  assert.equal(on(lines, 'SECURED_ADVANCE'), '-123000.00', 'Cr the advance paid less the one recovered');
  assert.equal(on(lines, 'WITHHELD_BY_CLIENT'), '37000.00', 'Dr what is withheld less what is released');
  const used = raBillSaleLines(name, { ...b, securedAdvance: D('0'), withheld: D('0') }, client);
  assert.ok(balanced(used));
  assert.equal(on(used, 'SECURED_ADVANCE'), '246000.00', 'material used: the advance comes back off the liability');
  assert.equal(on(used, 'WITHHELD_BY_CLIENT'), '-148000.00');
  const plain = raBillSaleLines(name, { ...b, securedAdvance: D('0'), securedAdvanceRecovered: D('0'), withheld: D('0'), withheldReleased: D('0') }, client);
  assert.deepEqual(plain.map((l) => l.ledgerKey).sort(), ['CLIENT:1', 'OUTPUT_CGST', 'OUTPUT_SGST', 'SALES']);
  const lost = holdLostLines(name, D('37000'));
  assert.ok(balanced(lost));
  assert.deepEqual(lost.map((l) => [l.ledgerKey, l.amount.toFixed(2)]), [['CLIENT_DEDUCTIONS', '37000.00'], ['WITHHELD_BY_CLIENT', '-37000.00']]);
  for (const k of ['SECURED_ADVANCE', 'WITHHELD_BY_CLIENT']) assert.ok(TALLY_FIXED_LEDGERS.some((l) => l.key === k), k);
});

test('every ledger the posting service uses has its group in the chart of accounts', () => {
  for (const l of TALLY_FIXED_LEDGERS) assert.notEqual(accountGroupOf(l.group), 'SUSPENSE', `${l.key} (${l.group})`);
  for (const g of [TALLY_CLIENT_GROUP, TALLY_VENDOR_GROUP, TALLY_EXPENSE_GROUP]) assert.notEqual(accountGroupOf(g), 'SUSPENSE', g);
  for (const g of ACCOUNT_GROUPS) assert.ok(ACCOUNT_GROUP_LABELS[g] && ACCOUNT_GROUP_NATURE[g], g);
  assert.equal(accountGroupOf('Cash-in-Hand'), 'CASH_IN_HAND');
  assert.equal(accountGroupOf('Nonsense'), 'SUSPENSE');
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
console.log(`\nBooks: ${cases.length - failed} of ${cases.length} tests pass`);
process.exit(failed ? 1 : 0);
