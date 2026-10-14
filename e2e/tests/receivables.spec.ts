import { expect, test } from '@playwright/test';
import { api, apiToken, signIn } from './helpers';

interface Page<T> {
  items: T[];
}
type OpenBill = { billId: string; projectCode: string; outstanding: string };

/**
 * Receivables (v3 item 19): accounts records a part payment against the building project's first bill (sent by the
 * seed) with the client's deductions, then the balance, and the bill is paid and leaves the open bills.
 */
test('record payments against a sent RA bill until it is paid', async ({ page }) => {
  const accounts = await apiToken('accounts@demo.com');
  const projects = await api<Page<{ id: string; code: string }>>(accounts, '/projects?pageSize=100');
  const building = projects.items.find((p) => p.code === 'BL-2026-02')!;
  const bill = (await api<Page<{ id: string; billNo: number }>>(accounts, `/ra-bills?projectId=${building.id}&sortBy=billNo&sortOrder=asc`)).items[0];
  // Start from an unpaid bill on a re-run.
  const receipts = (await api<Page<{ id: string; kind: string }>>(accounts, `/receipts?projectId=${building.id}&pageSize=100`)).items;
  for (const r of [...receipts.filter((x) => x.kind !== 'BILL'), ...receipts.filter((x) => x.kind === 'BILL')]) {
    await api(accounts, `/receipts/${r.id}`, { method: 'DELETE' });
  }

  await signIn(page, 'accounts@demo.com');
  await page.goto(`/bills?id=${bill.id}`);
  const drawer = page.locator('.ant-drawer').filter({ hasText: 'Abstract of cost' });
  await drawer.getByRole('button', { name: 'Record payment' }).click();
  let modal = page.locator('.ant-modal').filter({ hasText: 'Payment received' });
  // The first payment comes with the bill's deductions filled in; the client pays part of the rest.
  await expect(modal.getByLabel('Retention (₹)')).not.toHaveValue('');
  await modal.getByLabel('Amount received (₹)').fill('100000');
  await modal.getByLabel('UTR / cheque / advice no.').fill('E2E-UTR-1');
  await modal.getByRole('button', { name: 'Record' }).click();
  await expect(page.getByText(/recorded against RA bill 1/)).toBeVisible();
  await expect(drawer.getByText('E2E-UTR-1', { exact: true })).toBeVisible();
  await expect(drawer.getByText('Sent to client')).toBeVisible();

  const open = (await api<{ openBills: OpenBill[] }>(accounts, '/receivables')).openBills.find((b) => b.billId === bill.id);
  expect(Number(open?.outstanding)).toBeGreaterThan(0);

  // The second payment is the balance.
  await drawer.getByRole('button', { name: 'Record payment' }).click();
  modal = page.locator('.ant-modal').filter({ hasText: 'Payment received' });
  await expect(modal.getByLabel('Amount received (₹)')).toHaveValue(Number(open!.outstanding).toFixed(2));
  await modal.getByRole('button', { name: 'Record' }).click();
  await expect(drawer.locator('.ant-drawer-title').getByText('Paid')).toBeVisible();

  await page.goto('/receivables');
  await expect(page.getByText('Outstanding', { exact: true }).first()).toBeVisible();
  await page.getByRole('tab', { name: 'Money received' }).click();
  await expect(page.getByText('E2E-UTR-1').first()).toBeVisible();
  expect((await api<{ openBills: OpenBill[] }>(accounts, '/receivables')).openBills.some((b) => b.billId === bill.id)).toBe(false);
});

test('a site engineer has no receivables', async ({ page }) => {
  await signIn(page, 'engineer@demo.com');
  await expect(page.getByRole('link', { name: 'Receivables' })).toHaveCount(0);
});
