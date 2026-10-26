import { expect, test } from '@playwright/test';
import { API_URL, api, apiToken, signIn } from './helpers';

interface Page<T> {
  items: T[];
}
type OpenBill = { billType: string; billId: string; billLabel: string; outstanding: string; msmeFlag: boolean };
type Payment = { id: string; reference: string | null };

/**
 * Payables (v3 item 23): the seed's road PO bill is half paid and due soon to a small enterprise. Accounts pays part of
 * the balance from the due list, overpaying is refused, then the rest from the bill itself and the bill is paid.
 */
test('pay an approved vendor bill from the due list until it is paid', async ({ page }) => {
  const accounts = await apiToken('accounts@demo.com');
  const seeded = (await api<Page<{ vendorBillId: string }>>(accounts, '/vendor-payments?q=SBIN526287700412')).items[0];
  const billId = seeded.vendorBillId;
  // Start from the seeded half payment on a re-run.
  for (const p of (await api<Page<Payment>>(accounts, `/vendor-payments?vendorBillId=${billId}&pageSize=100`)).items) {
    if (p.reference?.startsWith('E2E-')) await api(accounts, `/vendor-payments/${p.id}`, { method: 'DELETE' });
  }
  const open = (await api<{ openBills: OpenBill[] }>(accounts, '/payables')).openBills.find((b) => b.billId === billId)!;
  expect(Number(open.outstanding)).toBeGreaterThan(1000);
  expect(open.msmeFlag).toBe(true);

  // Paying more than is outstanding is refused.
  const over = await fetch(`${API_URL}/vendor-payments`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accounts}`, 'content-type': 'application/json' },
    body: JSON.stringify({ vendorBillId: billId, paymentDate: new Date().toISOString().slice(0, 10), amount: String(Number(open.outstanding) + 500), mode: 'BANK' }),
  });
  expect(over.status).toBe(400);

  await signIn(page, 'accounts@demo.com');
  await page.getByRole('link', { name: 'Payables', exact: true }).click();
  await expect(page.getByText('MSME at risk', { exact: true }).first()).toBeVisible();
  const row = page.locator('tr').filter({ hasText: open.billLabel });
  await row.getByRole('button', { name: 'Pay' }).click();
  let modal = page.locator('.ant-modal').filter({ hasText: `· ${open.billLabel}` });
  await expect(modal.getByLabel('Amount paid')).toHaveValue(new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(Number(open.outstanding)));
  await modal.getByLabel('Amount paid').fill('1000');
  await modal.getByLabel('UTR / cheque / voucher no.').fill('E2E-PAY-1');
  await modal.getByRole('button', { name: 'Record payment' }).click();
  await expect(page.getByText(`paid against ${open.billLabel}`)).toBeVisible();

  await page.getByRole('tab', { name: 'Payments' }).click();
  await expect(page.getByText('E2E-PAY-1').first()).toBeVisible();

  // The balance from the bill itself.
  await page.goto(`/vendor-bills?id=${billId}`);
  const drawer = page.locator('.ant-drawer').filter({ hasText: 'Invoice total' });
  await expect(drawer.locator('.ant-drawer-title').getByText('Part paid')).toBeVisible();
  await expect(drawer.locator('.ant-table').getByText('E2E-PAY-1')).toBeVisible();
  await drawer.getByRole('button', { name: 'Record payment' }).click();
  modal = page.locator('.ant-modal').filter({ hasText: `· ${open.billLabel}` });
  await expect(modal.getByLabel('Amount paid')).toHaveValue(new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(Number(open.outstanding) - 1000));
  await modal.getByLabel('UTR / cheque / voucher no.').fill('E2E-PAY-2');
  await modal.getByRole('button', { name: 'Record payment' }).click();
  await expect(drawer.locator('.ant-drawer-title').getByText('Paid', { exact: true })).toBeVisible();
  expect((await api<{ openBills: OpenBill[] }>(accounts, '/payables')).openBills.some((b) => b.billId === billId)).toBe(false);
});

test('a site engineer has no payables', async ({ page }) => {
  const engineer = await apiToken('engineer@demo.com');
  expect((await fetch(`${API_URL}/payables`, { headers: { authorization: `Bearer ${engineer}` } })).status).toBe(403);
  await signIn(page, 'engineer@demo.com');
  await expect(page.getByRole('link', { name: 'Payables', exact: true })).toHaveCount(0);
});
