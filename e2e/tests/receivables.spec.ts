import { expect, test } from '@playwright/test';
import { api, apiToken, formPanel, signIn } from './helpers';

interface Page<T> {
  items: T[];
}
type OpenBill = { billId: string; projectCode: string; outstanding: string };

/**
 * Receivables: accounts records a part payment against the building project's first bill (sent by the
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
  await drawer.getByRole('button', { name: 'Record money received' }).click();
  let modal = formPanel(page, 'Record money received');
  // The first payment comes with the bill's deductions filled in; the client pays part of the rest.
  await expect(modal.getByLabel('Retention', { exact: true })).not.toHaveValue('');
  await modal.getByLabel('Amount received').fill('100000');
  await modal.getByLabel('UTR / cheque / advice no.').fill('E2E-UTR-1');
  await modal.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText(/recorded against RA bill 1/)).toBeVisible();
  await expect(drawer.getByText('E2E-UTR-1', { exact: true })).toBeVisible();
  await expect(drawer.getByText('Sent to client')).toBeVisible();

  const open = (await api<{ openBills: OpenBill[] }>(accounts, '/receivables')).openBills.find((b) => b.billId === bill.id);
  expect(Number(open?.outstanding)).toBeGreaterThan(0);

  // The second payment is the balance.
  await drawer.getByRole('button', { name: 'Record money received' }).click();
  modal = formPanel(page, 'Record money received');
  // The amount shows grouped the Indian way once filled in (1,23,456.5).
  await expect(modal.getByLabel('Amount received')).toHaveValue(new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(Number(open!.outstanding)));
  await modal.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(drawer.locator('.ant-drawer-title').getByText('Paid')).toBeVisible();

  await page.goto('/receivables');
  await expect(page.getByText('Outstanding', { exact: true }).first()).toBeVisible();
  await page.getByRole('tab', { name: 'Money received' }).click();
  await expect(page.getByText('E2E-UTR-1').first()).toBeVisible();
  expect((await api<{ openBills: OpenBill[] }>(accounts, '/receivables')).openBills.some((b) => b.billId === bill.id)).toBe(false);
});

test('a site engineer has no receivables', async ({ page }) => {
  await signIn(page, 'engineer@demo.com');
  await expect(page.getByRole('link', { name: 'Receivables', exact: true })).toHaveCount(0);
});
