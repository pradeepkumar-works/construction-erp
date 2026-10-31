import { expect, test } from '@playwright/test';
import { api, apiToken, signIn, formPanel } from './helpers';

interface Page<T> {
  items: T[];
}
type Vendor = { id: string; name: string; gstin: string | null };

const NAME = 'E2E Hardware Mart';

/**
 * Vendor master (v3 item 20): procurement adds a vendor with its GSTIN, bank and MSME details; an expense that types the
 * vendor's name links to it and takes its GSTIN, and a site engineer cannot see the bank details.
 */
test('add a vendor and an expense typed with its name links to it', async ({ page }) => {
  const procurement = await apiToken('procurement@demo.com');
  const engineer = await apiToken('engineer@demo.com');
  // Clean up an earlier run: its expense first, then the vendor.
  for (const e of (await api<Page<{ id: string }>>(engineer, `/expenses?q=${encodeURIComponent(NAME)}&pageSize=50`)).items) await api(engineer, `/expenses/${e.id}`, { method: 'DELETE' });
  for (const v of (await api<Page<Vendor>>(procurement, `/vendors?q=${encodeURIComponent(NAME)}&includeInactive=true`)).items) await api(procurement, `/vendors/${v.id}`, { method: 'DELETE' });

  await signIn(page, 'procurement@demo.com');
  await page.goto('/vendors');
  await page.getByRole('button', { name: 'New vendor' }).click();
  const modal = formPanel(page, 'New vendor');
  await modal.getByLabel('Vendor name').fill(NAME);
  await modal.getByLabel('GSTIN').fill('21aabfe1234q1z7');
  await modal.getByLabel('MSME (Udyam)').click();
  await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').getByText('Micro', { exact: true }).click();
  await modal.getByLabel('Udyam registration no.').fill('UDYAM-OD-19-0099999');
  await modal.getByLabel('Account number').fill('112233445566');
  await modal.getByLabel('IFSC').fill('sbin0009999');
  await modal.getByRole('button', { name: 'Save vendor' }).click();
  await expect(page.getByText(`${NAME} added`)).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: NAME });
  await expect(row.getByText('21AABFE1234Q1Z7')).toBeVisible();
  await expect(row.getByText('SBIN0009999', { exact: false })).toBeVisible();
  await expect(row.getByText('Micro')).toBeVisible();

  const projects = await api<Page<{ id: string; code: string }>>(engineer, '/projects?pageSize=100');
  const road = projects.items.find((p) => p.code === 'RD-2026-01')!;
  const today = new Date().toISOString().slice(0, 10);
  const expense = await api<{ vendor: string; vendorId: string | null; vendorGstin: string | null }>(engineer, '/expenses', {
    method: 'POST',
    body: { projectId: road.id, date: today, category: 'MATERIAL_LOCAL', description: 'Hacksaw blades (e2e)', vendor: NAME.toLowerCase(), amount: '500', submit: false },
  });
  expect(expense.vendor).toBe(NAME);
  expect(expense.vendorId).not.toBeNull();
  expect(expense.vendorGstin).toBe('21AABFE1234Q1Z7');

  const seen = (await api<Page<Vendor & { bankAccountNo: string | null }>>(engineer, `/vendors?q=${encodeURIComponent(NAME)}`)).items[0];
  expect(seen.bankAccountNo).toBeNull();
});

test('a site engineer has no vendors page', async ({ page }) => {
  await signIn(page, 'engineer@demo.com');
  await expect(page.getByRole('link', { name: 'Vendors' })).toHaveCount(0);
});
