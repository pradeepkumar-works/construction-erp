import { expect, test } from '@playwright/test';
import { api, apiToken, chooseOption, formPanel, localToday, signIn } from './helpers';

type Account = { id: string; key: string; name: string; group: string; debit: string; credit: string; balance: string };
type Line = { accountName: string; debit: string | null; credit: string | null };
type Voucher = { id: string; voucherNo: string; type: string; source: string; status: string; amount: string; narration: string; lines: Line[] };
type Page<T> = { items: T[]; total: number };
type Ledger = { opening: string; closing: string; entries: { voucherNo: string; against: string; debit: string | null; credit: string | null; balance: string }[] };

const sum = (xs: (string | null)[]) => Math.round(xs.reduce((s, x) => s + Number(x ?? 0), 0) * 100) / 100;

/**
 * The books (v6 item 102): the modules' records are posted and the books balance; a vendor bill is a purchase voucher;
 * accounts make a payment voucher on the page and management approves it, after which it is in the office rent ledger;
 * a journal that moves money is refused; and a site role cannot see the books.
 */
test('the modules post into balanced books, and a hand-made voucher counts once management approves it', async ({ page }) => {
  const accounts = await apiToken('accounts@demo.com');
  const md = await apiToken('md@demo.com');
  const pm = await apiToken('pm@demo.com');
  const today = localToday();

  await api(accounts, '/books/post', { method: 'POST' });
  const chart = await api<Account[]>(accounts, '/books/accounts');
  expect(sum(chart.map((a) => a.debit))).toBe(sum(chart.map((a) => a.credit)));
  const purchases = await api<Page<Voucher>>(accounts, '/books/day-book?source=PURCHASE&pageSize=50');
  expect(purchases.total).toBeGreaterThan(0);
  // A bill for goods, hire or repairs (the sister companies' fees go to a site expense head instead)
  const bill = purchases.items.find((v) => v.lines.some((l) => l.accountName === 'Purchase of Materials' || l.accountName === 'Machinery Hire Charges' || l.accountName === 'Repairs to Machinery'))!;
  expect(bill).toBeDefined();
  expect(bill.type).toBe('PURCHASE');
  expect(sum(bill.lines.map((l) => l.debit))).toBe(sum(bill.lines.map((l) => l.credit)));

  const bank = chart.find((a) => a.key === 'BANK')!;
  const rent = chart.find((a) => a.name === 'Office Rent')!;
  const refused = await fetch(`${process.env.E2E_API_URL ?? 'http://localhost:4000/api'}/books/vouchers`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accounts}`, 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'JOURNAL', date: today, narration: 'Wrong kind', lines: [{ accountId: rent.id, debit: 10 }, { accountId: bank.id, credit: 10 }] }),
  });
  expect(refused.status).toBe(400);
  expect((await refused.json()).message).toContain('payment, receipt or contra');
  expect((await fetch(`${process.env.E2E_API_URL ?? 'http://localhost:4000/api'}/books/status`, { headers: { authorization: `Bearer ${pm}` } })).status).toBe(403);

  // Accounts make a payment voucher on the page and send it for approval.
  const narration = `Courier charges ${Date.now()}`;
  await signIn(page, 'accounts@demo.com');
  await page.goto('/books?tab=vouchers');
  await expect(page.getByRole('heading', { level: 1, name: 'Books' })).toBeVisible();
  await page.getByRole('button', { name: 'New voucher' }).click();
  const form = formPanel(page, 'New voucher');
  await form.getByText('Payment', { exact: true }).click();
  await chooseOption(form.getByLabel('Account').nth(0), 'Office Rent');
  await form.getByLabel('Debit').nth(0).fill('2500');
  await chooseOption(form.getByLabel('Account').nth(1), 'Bank Account');
  await form.getByLabel('Credit').nth(1).fill('2500');
  await form.getByLabel('Narration').fill(narration);
  await form.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(page.getByText(/^PV\/\d{4}-\d{2}\/\d{4} submitted for approval$/)).toBeVisible();
  const mine = await api<Page<Voucher>>(accounts, `/books/vouchers?q=${encodeURIComponent(narration)}`);
  const v = mine.items[0];
  expect(v.status).toBe('SUBMITTED');
  expect(v.amount).toBe('2500.00');

  // Accounts cannot approve their own; management does, from the page.
  const self = await fetch(`${process.env.E2E_API_URL ?? 'http://localhost:4000/api'}/books/vouchers/${v.id}/approve`, { method: 'POST', headers: { authorization: `Bearer ${accounts}`, 'content-type': 'application/json' }, body: '{}' });
  expect(self.status).toBe(403);
  await page.context().clearCookies();
  await signIn(page, 'md@demo.com');
  await page.goto('/books?tab=vouchers');
  await page.getByRole('button', { name: v.voucherNo }).click();
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText(`${v.voucherNo} approved and in the books`)).toBeVisible();

  const ledger = await api<Ledger>(md, `/books/ledger?accountId=${rent.id}&from=${today}&to=${today}`);
  const entry = ledger.entries.find((e) => e.voucherNo === v.voucherNo)!;
  expect(entry).toMatchObject({ against: 'Bank Account', debit: '2500.00', credit: null });

  // Cancelling takes it out of the books again, so the test leaves the rent as it found it.
  await api(md, `/books/vouchers/${v.id}/cancel`, { method: 'POST', body: { note: 'Test voucher' } });
  const after = await api<Ledger>(md, `/books/ledger?accountId=${rent.id}&from=${today}&to=${today}`);
  expect(after.entries.find((e) => e.voucherNo === v.voucherNo)).toBeUndefined();
});
