import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { API_URL, api, apiToken, signIn } from './helpers';

type Preview = { vouchers: { kind: string; number: string }[] };
const upTo = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth() + 1, 0)).toISOString().slice(0, 10);
};

/**
 * Tally export: accounts renames the sales ledger, exports everything waiting up to this month as
 * TallyPrime XML (the file carries the company and the renamed ledger), exported receipts are locked, and undoing the
 * export puts the vouchers back in the queue.
 */
test('export vouchers to Tally, lock them, and undo the export', async ({ page }) => {
  const accounts = await apiToken('accounts@demo.com');
  // Start with nothing exported on a re-run.
  for (const e of await api<{ id: string }[]>(accounts, '/tally/exports')) await api(accounts, `/tally/exports/${e.id}`, { method: 'DELETE' });
  await api(accounts, '/tally/settings', { method: 'PUT', body: { companyName: '', ledgers: { SALES: null } } });
  const waiting = (await api<Preview>(accounts, `/tally/preview?upTo=${upTo()}`)).vouchers;
  expect(waiting.some((v) => v.kind === 'SALES')).toBe(true);
  expect(waiting.some((v) => v.kind === 'RECEIPT')).toBe(true);

  await signIn(page, 'accounts@demo.com');
  await page.getByRole('link', { name: 'Tally export' }).click();
  await page.getByRole('tab', { name: 'Ledgers' }).click();
  await page.getByPlaceholder('The company open in Tally').fill('E2E Infra Pvt Ltd');
  await page.getByLabel('Tally ledger for Work value of RA bills').fill('Contract Receipts');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Tally settings saved')).toBeVisible();

  await page.getByRole('tab', { name: 'To export' }).click();
  const exportButton = page.getByRole('button', { name: `Export ${waiting.length} vouchers` });
  await expect(exportButton).toBeEnabled();
  const sale = page.locator('tr.ant-table-row').filter({ hasText: waiting.find((v) => v.kind === 'SALES')!.number });
  // Oldest first, 25 a page: the sale may be on a later page behind the machine loans' EMIs.
  for (let i = 0; i < 10 && !(await sale.isVisible()); i++) await page.locator('.ant-pagination-next').first().click();
  await sale.locator('.ant-table-row-expand-icon').click();
  await expect(page.getByRole('cell', { name: 'Contract Receipts' }).first()).toBeVisible();

  await exportButton.click();
  const downloading = page.waitForEvent('download');
  await page.locator('.ant-popconfirm').getByRole('button', { name: 'Export' }).click();
  const xml = readFileSync((await (await downloading).path())!, 'utf8');
  expect(xml).toContain('<SVCURRENTCOMPANY>E2E Infra Pvt Ltd</SVCURRENTCOMPANY>');
  expect(xml).toContain('<LEDGERNAME>Contract Receipts</LEDGERNAME>');
  expect(xml.match(/<VOUCHER /g)?.length).toBe(waiting.length);
  await expect(page.getByText('Nothing new to export up to this month')).toBeVisible();

  // An exported receipt cannot be changed.
  const receipt = (await api<{ items: { id: string; exportedToTally: boolean }[] }>(accounts, '/receipts?pageSize=100')).items.find((r) => r.exportedToTally)!;
  const del = await fetch(`${API_URL}/receipts/${receipt.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${accounts}` } });
  expect(del.status).toBe(400);
  await page.goto('/receivables');
  await page.getByRole('tab', { name: 'Money received' }).click();
  await expect(page.getByText('In Tally').first()).toBeVisible();

  // Undo: the vouchers wait for the next export again.
  await page.goto('/tally');
  await page.getByRole('tab', { name: 'Exports' }).click();
  await page.getByRole('button', { name: 'Undo' }).first().click();
  await page.locator('.ant-popconfirm').getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Export undone')).toBeVisible();
  expect((await api<Preview>(accounts, `/tally/preview?upTo=${upTo()}`)).vouchers.length).toBe(waiting.length);
  await api(accounts, '/tally/settings', { method: 'PUT', body: { companyName: '', ledgers: { SALES: null } } });
});

test('a site engineer cannot export to Tally', async ({ page }) => {
  const engineer = await apiToken('engineer@demo.com');
  expect((await fetch(`${API_URL}/tally/preview?upTo=${upTo()}`, { headers: { authorization: `Bearer ${engineer}` } })).status).toBe(403);
  await signIn(page, 'engineer@demo.com');
  await expect(page.getByRole('link', { name: 'Tally export' })).toHaveCount(0);
});
