import { expect, test } from '@playwright/test';
import { api, apiToken, signIn } from './helpers';

interface Page<T> {
  items: T[];
  total: number;
}
type Project = { id: string; code: string };
type Entry = { id: string; entryNo: string; type: string; qcStatus: string | null; qcNote: string | null; lines: { id: string; itemName: string; quantity: string; rejectedQty?: string | null }[] };
type Unit = { id: string; code: string; name: string; isActive: boolean; itemCount: number };

/**
 * Small items (v4 item 48): QA/QC accepts or rejects material on a GRN, the delivery status of approved purchase
 * orders, the unit master and financial-year ranges on the register's date filter.
 */
test('QA/QC records a GRN as partly accepted with the rejected quantity', async ({ page }) => {
  const pm = await apiToken('pm@demo.com');
  const road = (await api<Page<Project>>(pm, '/projects?pageSize=100')).items.find((p) => p.code === 'RD-2026-01')!;
  const grn = (await api<Page<Entry>>(pm, `/stock/entries?projectId=${road.id}&type=RECEIPT&pageSize=1`)).items[0];
  expect(grn).toBeTruthy();

  await signIn(page, 'qaqc@demo.com');
  await page.goto('/stock');
  await page.getByRole('tab', { name: 'Register' }).click();
  await page.getByPlaceholder('Search entry, item, supplier, MR').fill(grn.entryNo);
  await page.locator('.ant-table-row').getByText(grn.entryNo, { exact: true }).click();
  await page.getByRole('button', { name: /QA\/QC check/ }).click();
  const modal = page.locator('.ant-modal').filter({ hasText: `QA/QC check · ${grn.entryNo}` });
  await modal.getByText('Partly accepted', { exact: true }).click();
  await modal.getByLabel(`Rejected ${grn.lines[0].itemName}`).fill('1');
  await modal.getByLabel('What was wrong').fill('E2E: one unit damaged in transit');
  await modal.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(`${grn.entryNo}: partly accepted`)).toBeVisible();

  const after = await api<Entry>(pm, `/stock/entries/${grn.id}`);
  expect(after.qcStatus).toBe('PARTLY_ACCEPTED');
  expect(Number(after.lines[0].rejectedQty)).toBe(1);
  const pending = await api<Page<Entry>>(pm, `/stock/entries?projectId=${road.id}&qc=PENDING&pageSize=100`);
  expect(pending.items.some((e) => e.id === grn.id)).toBe(false);

  // The store cannot pass its own receipts; a rejection needs a reason.
  const store = await apiToken('store@demo.com');
  await expect(api(store, `/stock/entries/${grn.id}/qc`, { method: 'POST', body: { status: 'ACCEPTED' } })).rejects.toThrow(/403/);
  await expect(api(pm, `/stock/entries/${grn.id}/qc`, { method: 'POST', body: { status: 'REJECTED' } })).rejects.toThrow(/400/);
});

test('delivery status lists approved orders with what is still to come', async ({ page }) => {
  const pm = await apiToken('pm@demo.com');
  const all = await api<{ rows: { poNo: string; state: string; lines: unknown[] }[]; totals: { orders: number } }>(pm, '/purchase-orders/status?show=ALL');
  expect(all.totals.orders).toBe(all.rows.length);

  await signIn(page, 'pm@demo.com');
  await page.goto('/purchase-orders');
  await page.getByRole('tab', { name: 'Delivery status' }).click();
  await expect(page).toHaveURL(/tab=status/);
  await expect(page.locator('.procurement-summary')).toContainText('Approved orders');
  await page.locator('.procurement-status .ant-segmented').getByText('All', { exact: true }).click();
  if (all.rows.length) await expect(page.locator('.procurement-table')).toContainText(all.rows[0].poNo);
});

test('the unit master adds a unit that quantity fields then suggest', async ({ page }) => {
  const pm = await apiToken('pm@demo.com');
  const code = `E2E${Date.now() % 100000}`;
  await signIn(page, 'pm@demo.com');
  await page.goto('/stock');
  await page.getByRole('tab', { name: 'Units' }).click();
  await expect(page.locator('.units-table')).toContainText('Cubic metre');
  await page.getByRole('button', { name: 'Add unit' }).click();
  const modal = page.locator('.ant-modal').filter({ hasText: 'Add unit' });
  await modal.getByLabel('Unit', { exact: true }).fill(code);
  await modal.getByLabel('Name').fill('E2E test unit');
  await modal.getByRole('button', { name: 'OK' }).click();
  await expect(page.getByText(`${code} saved`)).toBeVisible();

  // The item form suggests it.
  await page.getByRole('tab', { name: 'Item master' }).click();
  await page.getByRole('button', { name: 'Add item' }).click();
  const item = page.locator('.ant-modal').filter({ hasText: 'Add item' });
  await item.getByLabel('Unit', { exact: true }).fill(code.slice(0, 5));
  await expect(page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')).toContainText(`${code} · E2E test unit`);
  await item.getByRole('button', { name: 'Cancel' }).click();

  const unit = (await api<Unit[]>(pm, '/units')).find((u) => u.code === code)!;
  const engineer = await apiToken('engineer@demo.com');
  await expect(api(engineer, `/units/${unit.id}`, { method: 'DELETE' })).rejects.toThrow(/403/);
  await api(pm, `/units/${unit.id}`, { method: 'DELETE' });
});

test('date filters offer financial years', async ({ page }) => {
  await signIn(page, 'pm@demo.com');
  await page.goto('/stock');
  await page.getByRole('tab', { name: 'Register' }).click();
  await page.getByPlaceholder('Start date').click();
  const fy = page.locator('.ant-picker-presets li').filter({ hasText: /^FY \d{4}-\d{2}$/ }).first();
  const label = (await fy.textContent())!;
  await fy.click();
  await expect(page.getByPlaceholder('Start date')).toHaveValue(`01 Apr ${label.slice(3, 7)}`);
  await expect(page.getByPlaceholder('End date')).toHaveValue(`31 Mar ${Number(label.slice(3, 7)) + 1}`);
});
