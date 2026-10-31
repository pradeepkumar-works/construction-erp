import { expect, test } from '@playwright/test';
import { API_URL, api, apiToken, chooseOption, formPanel, localToday, signIn } from './helpers';

type Account = { id: string; key: string; name: string; group: string };
type Voucher = { id: string; voucherNo: string; status: string };
type Page<T> = { items: T[]; total: number };
type Pair = { amount: string; previous: string };
type Bank = { booksBalance: string; notPresented: string; bankOnlyWithdrawals: string; statementBalance: string | null; difference: string | null; statement: { id: string; description: string; bookLineId: string | null }[] };

/**
 * Financial statements (v6 item 103): the trial balance and balance sheet balance and profit and loss adds up; a bank
 * statement imported on the page matches what agrees, a bank charge becomes a voucher and is matched by hand, and the
 * reconciliation comes to nothing; a voucher in the locked period is refused.
 */
test('the statements balance, and a bank statement reconciles to nothing', async ({ page }) => {
  const accounts = await apiToken('accounts@demo.com');
  const md = await apiToken('md@demo.com');
  const today = localToday();
  const stamp = Date.now();

  // The statements add up.
  const tb = await api<{ totals: Record<string, string> }>(accounts, `/statements/trial-balance?from=2000-04-01&to=${today}`);
  expect(tb.totals.debit).toBe(tb.totals.credit);
  expect(tb.totals.closingDebit).toBe(tb.totals.closingCredit);
  const bs = await api<{ difference: string; totalAssets: Pair; totalLiabilities: Pair }>(accounts, `/statements/balance-sheet?asOn=${today}`);
  expect(bs.difference).toBe('0.00');
  expect(bs.totalAssets.amount).toBe(bs.totalLiabilities.amount);
  const pl = await api<{ totalIncome: Pair; totalExpenses: Pair; profit: Pair; tax: Pair }>(accounts, `/statements/profit-loss?from=2000-04-01&to=${today}`);
  expect(Number(pl.profit.amount)).toBeCloseTo(Number(pl.totalIncome.amount) - Number(pl.totalExpenses.amount) - Number(pl.tax.amount), 2);
  const pm = await apiToken('pm@demo.com');
  expect((await fetch(`${API_URL}/statements/balance-sheet?asOn=${today}`, { headers: { authorization: `Bearer ${pm}` } })).status).toBe(403);

  // A bank account of its own, with money brought in and a cheque not yet presented.
  const chart = await api<Account[]>(accounts, '/books/accounts');
  const capital = chart.find((a) => a.group === 'CAPITAL_ACCOUNT')!;
  const rent = chart.find((a) => a.name === 'Office Rent')!;
  const bank = await api<Account>(accounts, '/books/accounts', { method: 'POST', body: { name: `E2E Bank ${stamp}`, group: 'BANK_ACCOUNTS' } });
  const charges = chart.find((a) => a.name === 'Bank Charges') ?? (await api<Account>(accounts, '/books/accounts', { method: 'POST', body: { name: 'Bank Charges', group: 'INDIRECT_EXPENSES' } }));
  const voucher = async (type: string, narration: string, lines: unknown[]) => {
    const v = await api<Voucher>(accounts, '/books/vouchers', { method: 'POST', body: { type, date: today, narration, lines } });
    await api(accounts, `/books/vouchers/${v.id}/submit`, { method: 'POST' });
    return api<Voucher>(md, `/books/vouchers/${v.id}/approve`, { method: 'POST', body: {} });
  };
  const brought = await voucher('RECEIPT', `Capital into the e2e bank ${stamp}`, [{ accountId: bank.id, debit: 100000 }, { accountId: capital.id, credit: 100000 }]);
  const cheque = await voucher('PAYMENT', `Rent by cheque ${stamp}`, [{ accountId: rent.id, debit: 25000 }, { accountId: bank.id, credit: 25000 }]);

  // The bank's statement: the money in, and its charges; the cheque has not come through.
  const d = `${today.slice(8, 10)}/${today.slice(5, 7)}/${today.slice(0, 4)}`;
  const csv = ['"E2E BANK LTD"', 'Date,Narration,Chq./Ref.No.,Withdrawal Amt.,Deposit Amt.,Closing Balance', `${d},NEFT CR-PROMOTERS ${stamp},UTR${stamp},,"1,00,000.00","1,00,000.00"`, `${d},SMS AND NEFT CHARGES ${stamp},,295.00,,"99,705.00"`].join('\n');

  await signIn(page, 'accounts@demo.com');
  await page.goto('/statements?tab=bank');
  await expect(page.getByRole('heading', { level: 1, name: 'Financial statements' })).toBeVisible();
  await chooseOption(page.getByRole('combobox', { name: 'Bank account' }), `E2E Bank ${stamp}`);
  await page.getByRole('button', { name: 'Import statement' }).click();
  const imp = formPanel(page, 'Import a bank statement');
  await imp.locator('input[type=file]').setInputFiles({ name: 'statement.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(imp.getByText('statement.csv: 4 rows')).toBeVisible();
  await imp.getByRole('button', { name: 'Import and match' }).click();
  await expect(page.getByText('2 lines added, 1 matched to the books')).toBeVisible();

  let brs = await api<Bank>(accounts, `/statements/bank?accountId=${bank.id}&asOn=${today}`);
  expect(brs).toMatchObject({ booksBalance: '75000.00', notPresented: '25000.00', bankOnlyWithdrawals: '295.00', statementBalance: '99705.00', difference: '0.00' });

  // The charge becomes a payment voucher from the statement line, and once approved it is matched by hand.
  const row = page.getByRole('row', { name: new RegExp(`SMS AND NEFT CHARGES ${stamp}`) });
  await row.getByRole('button', { name: 'Make voucher' }).click();
  const form = formPanel(page, 'New voucher');
  await chooseOption(form.getByLabel('Account').nth(0), 'Bank Charges');
  await form.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(page.getByText(/^PV\/\d{4}-\d{2}\/\d{4} submitted for approval$/)).toBeVisible();
  const made = (await api<Page<Voucher>>(accounts, `/books/vouchers?q=${encodeURIComponent(`SMS AND NEFT CHARGES ${stamp}`)}`)).items[0];
  await api(md, `/books/vouchers/${made.id}/approve`, { method: 'POST', body: {} });
  await page.reload();
  await chooseOption(page.getByRole('combobox', { name: 'Bank account' }), `E2E Bank ${stamp}`);
  await page.getByRole('row', { name: new RegExp(`SMS AND NEFT CHARGES ${stamp}`) }).getByRole('button', { name: 'Match…' }).click();
  const picker = page.getByRole('dialog', { name: /Match ₹\s?295\.00 paid/ });
  await picker.getByRole('row', { name: new RegExp(made.voucherNo.replace(/\//g, '\\/')) }).click();
  await picker.getByRole('button', { name: 'Match' }).click();
  await expect(page.getByText('Matched', { exact: true })).toBeVisible();

  brs = await api<Bank>(accounts, `/statements/bank?accountId=${bank.id}&asOn=${today}`);
  expect(brs).toMatchObject({ booksBalance: '74705.00', notPresented: '25000.00', bankOnlyWithdrawals: '0.00', difference: '0.00' });
  expect(brs.statement.every((s) => s.bookLineId)).toBe(true);
  await expect(page.getByText('The books agree with the bank')).toBeVisible();

  // The statements' tabs show on the page.
  await page.getByRole('tab', { name: 'Balance sheet' }).click();
  await expect(page.getByRole('cell', { name: 'Equity and liabilities' })).toBeVisible();
  await page.getByRole('tab', { name: 'Trial balance' }).click();
  await expect(page.getByText('Debits equal credits')).toBeVisible();

  // Locked up to three days ago, a voucher dated then is refused; the lock comes off again. Three, not two: the seed dates
  // the waiting electricity bill yesterday by UTC, which is two days before today in India between 6:30 pm and midnight UTC.
  const before = new Date(Date.parse(`${today}T00:00:00Z`) - 3 * 86_400_000).toISOString().slice(0, 10);
  await api(md, '/statements/lock', { method: 'PUT', body: { lockedUpTo: before } });
  const refused = await fetch(`${API_URL}/books/vouchers`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accounts}`, 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'JOURNAL', date: before, narration: 'Too late', lines: [{ accountId: rent.id, debit: 1 }, { accountId: charges.id, credit: 1 }] }),
  });
  expect(refused.status).toBe(400);
  expect((await refused.json()).message).toContain('The books are locked up to');
  await api(md, '/statements/lock', { method: 'PUT', body: { lockedUpTo: null } });

  // Leave the books as they were: the vouchers cancelled (which unmatches them) and the account closed.
  for (const v of [brought, cheque, made]) await api(md, `/books/vouchers/${v.id}/cancel`, { method: 'POST', body: { note: 'Test voucher' } });
  await api(accounts, `/books/accounts/${bank.id}`, { method: 'PATCH', body: { isActive: false } });
});
