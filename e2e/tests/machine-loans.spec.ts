import { expect, test } from '@playwright/test';
import { API_URL, api, apiToken, chooseOption, localToday, signIn } from './helpers';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
/** YYYY-MM-DD as the date pickers take it: DD MMM YYYY. */
const typed = (d: string) => `${d.slice(8, 10)} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

type Emi = { id: string; no: number; dueDate: string; principal: string; interest: string; emi: string; opening: string; stage: string; paidOn: string | null };
type Loan = { id: string; loanNo: string; status: string; emi: string; emisPaid: number; emiCount: number; outstanding: string; interestPaid: string; emis: Emi[] };
type Equipment = { id: string; code: string; name: string; ownership: string };
type Voucher = { kind: string; sourceId: string; entries: { ledgerKey: string; debit: string | null; credit: string | null }[] };

const post = (token: string, path: string, body: unknown = {}) =>
  fetch(`${API_URL}${path}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });

/**
 * Machine finance (v6 item 108): accounts record a loan on an owned machine from Machine loans (the form works the EMI
 * out), record the first EMI paid from the loan's page, and the payment reaches the Tally export as principal to the
 * loan and interest to finance costs.
 */
test('accounts record a machine loan, pay its first EMI, and it posts principal and interest', async ({ page }) => {
  const accounts = await apiToken('accounts@demo.com');
  const machine = (await api<{ items: Equipment[] }>(accounts, '/equipment?ownership=OWNED&pageSize=100')).items.find((e) => e.code !== 'TIP-07')!;
  const loanNo = `E2E-${Date.now()}`;
  const today = localToday();

  await signIn(page, 'accounts@demo.com');
  await page.goto('/machine-loans');
  await expect(page.getByRole('heading', { level: 1, name: 'Machine loans' })).toBeVisible();
  await page.getByRole('button', { name: 'Record machine loan' }).first().click();
  const form = page.locator('.ant-drawer-open').filter({ hasText: 'Record machine loan' });
  await chooseOption(form.getByLabel('Machine', { exact: true }), machine.code);
  await form.getByLabel('Lender', { exact: true }).fill('E2E Finance');
  await form.getByLabel('Loan account no.').fill(loanNo);
  await form.getByLabel('Amount').fill('1000000');
  await form.getByLabel('Rate a year').fill('10');
  await form.getByLabel('Tenure').fill('12');
  await form.getByLabel('Sanctioned on').fill(typed(shift(today, -40)));
  await form.getByLabel('Sanctioned on').press('Enter');
  await form.getByLabel('First EMI on').fill(typed(shift(today, -10)));
  await form.getByLabel('First EMI on').press('Enter');
  // ₹10 lakh at 10% for 12 months.
  await expect(form.getByText(/Works out to ₹\s?87,916\.00/)).toBeVisible();
  await expect(form.getByText(/12 EMIs from .* interest ₹\s?54,990\.57 in all/)).toBeVisible();
  await form.getByRole('button', { name: 'Record loan' }).click();
  await expect(page.getByText(new RegExp(`Loan ${loanNo} recorded: 12 EMIs of ₹\\s?87,916\\.00`))).toBeVisible();
  await expect(page).toHaveURL(/\/machine-loans\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(loanNo);
  // The first EMI fell due 10 days ago: it is overdue.
  await expect(page.getByRole('row').filter({ hasText: typed(shift(today, -10)) }).getByText('Overdue')).toBeVisible();

  await page.getByRole('button', { name: 'Pay EMI 1' }).click();
  const pay = page.locator('.ant-modal').filter({ hasText: `Pay EMI 1 · ${loanNo}` });
  await expect(pay.getByText(/principal ₹\s?79,582\.67, interest ₹\s?8,333\.33/)).toBeVisible();
  await pay.getByLabel('Reference').fill('E2E NACH');
  await pay.getByRole('button', { name: 'Record payment' }).click();
  await expect(page.getByText(`EMI 1 of loan ${loanNo} recorded paid`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pay EMI 2' })).toBeVisible();

  const id = page.url().split('/').pop()!;
  const loan = await api<Loan>(accounts, `/machine-loans/${id}`);
  expect(loan.emisPaid).toBe(1);
  expect(loan.outstanding).toBe('920417.33');
  expect(loan.interestPaid).toBe('8333.33');
  const vouchers = (await api<{ vouchers: Voucher[] }>(accounts, `/tally/preview?upTo=${today}`)).vouchers;
  const emi = vouchers.find((v) => v.kind === 'LOAN_EMI' && v.sourceId === loan.emis[0].id)!;
  expect(emi).toBeTruthy();
  expect(emi.entries.find((l) => l.ledgerKey === `LOAN:${id}`)?.debit).toBe('79582.67');
  expect(emi.entries.find((l) => l.ledgerKey === 'LOAN_INTEREST')?.debit).toBe('8333.33');
  expect(emi.entries.find((l) => l.ledgerKey === 'BANK')?.credit).toBe('87916.00');
  const taken = vouchers.find((v) => v.kind === 'MACHINE_LOAN' && v.sourceId === id)!;
  expect(taken.entries.find((l) => l.ledgerKey === 'MACHINERY')?.debit).toBe('1000000.00');

  // Tidy up: undo the payment and delete the loan, as a mistaken entry would be.
  expect((await post(accounts, `/machine-loans/${id}/undo-pay`)).status).toBe(201);
  expect((await fetch(`${API_URL}/machine-loans/${id}`, { method: 'DELETE', headers: { authorization: `Bearer ${accounts}` } })).status).toBe(200);
});

/**
 * EMIs are paid in order and not ahead of the day; closing early repays what is owed and an undo brings the schedule
 * back; the seeded HDFC loan's unpaid EMI is on the watch list; site staff cannot see loans.
 */
test('EMIs go in order, a loan closes early and reopens on undo, and an overdue EMI is on the watch list', async () => {
  const accounts = await apiToken('accounts@demo.com');
  const engineer = await apiToken('engineer@demo.com');
  const machine = (await api<{ items: Equipment[] }>(accounts, '/equipment?ownership=OWNED&pageSize=100')).items[0];
  const today = localToday();
  const created = await api<Loan>(accounts, '/machine-loans', {
    method: 'POST',
    body: { equipmentId: machine.id, lenderName: 'E2E Bank', loanNo: `E2E-C-${Date.now()}`, amount: 600000, ratePct: 12, tenureMonths: 6, sanctionDate: shift(today, -70), firstEmiDate: shift(today, -40), disbursal: 'BANK' },
  });
  expect(created.emiCount).toBe(6);

  expect((await post(accounts, `/machine-loans/${created.id}/pay`, { no: 2, paidOn: today })).status).toBe(400);
  expect((await post(accounts, `/machine-loans/${created.id}/pay`, { paidOn: shift(today, 1) })).status).toBe(400);
  const one = await api<Loan>(accounts, `/machine-loans/${created.id}/pay`, { method: 'POST', body: { paidOn: shift(today, -40), mode: 'BANK' } });
  expect(one.emisPaid).toBe(1);

  const closed = await api<Loan>(accounts, `/machine-loans/${created.id}/foreclose`, { method: 'POST', body: { paidOn: today, interest: 5000 } });
  expect(closed.status).toBe('CLOSED');
  expect(closed.outstanding).toBe('0.00');
  expect(closed.emiCount).toBe(2);
  expect(closed.emis[1].interest).toBe('5000.00');
  expect(closed.emis[1].principal).toBe(one.emis[1].opening);

  const reopened = await api<Loan>(accounts, `/machine-loans/${created.id}/undo-pay`, { method: 'POST' });
  expect(reopened.status).toBe('ACTIVE');
  expect(reopened.emiCount).toBe(6);
  expect(reopened.emis[1].emi).toBe(one.emis[1].emi);

  const watch = await api<{ open: { kind: string; title: string }[] }>(accounts, '/warnings');
  expect(watch.open.some((w) => w.kind === 'LOAN_EMI' && w.title.includes('HDFC Bank'))).toBe(true);

  expect((await fetch(`${API_URL}/machine-loans`, { headers: { authorization: `Bearer ${engineer}` } })).status).toBe(403);

  await post(accounts, `/machine-loans/${created.id}/undo-pay`);
  await fetch(`${API_URL}/machine-loans/${created.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${accounts}` } });
});
