import { expect, test } from '@playwright/test';
import { api, apiToken, signIn } from './helpers';

type Page<T> = { items: T[] };

// The papers that leave the company print on its letterhead: name, GSTIN and PAN at the head, the paper's own number.

test('a measurement sheet prints as a measurement book page on the letterhead', async ({ page }) => {
  const token = await apiToken('qs@demo.com');
  const head = await api<{ gstin: string | null }>(token, '/company-data/letterhead');
  expect(head.gstin).toBeTruthy();
  const sheets = await api<Page<{ id: string; mbNo: string }>>(token, '/measurements?pageSize=5');
  const sheet = sheets.items[0];
  await signIn(page, 'qs@demo.com');
  await page.goto(`/measurements/${sheet.id}`);
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: /Print$/ }).click();
  const paper = await popup;
  await expect(paper.getByRole('heading', { name: 'Measurement book' })).toBeVisible();
  await expect(paper.getByText(sheet.mbNo, { exact: true })).toBeVisible();
  await expect(paper.getByText(`GSTIN ${head.gstin}`, { exact: false }).first()).toBeVisible();
  await paper.close();
});

test('a debit note prints with both GSTINs and its total in words', async ({ page }) => {
  const token = await apiToken('accounts@demo.com');
  const notes = await api<Page<{ id: string; noteNo: string; vendorGstin: string | null }>>(token, '/debit-notes?pageSize=5');
  const note = notes.items[0];
  await signIn(page, 'accounts@demo.com');
  await page.goto(`/debit-notes/${note.id}`);
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: /Print$/ }).click();
  const paper = await popup;
  await expect(paper.getByRole('heading', { name: 'Debit note' })).toBeVisible();
  await expect(paper.getByText(note.noteNo, { exact: true })).toBeVisible();
  if (note.vendorGstin) await expect(paper.getByText(`GSTIN ${note.vendorGstin}`)).toBeVisible();
  await expect(paper.getByText(/^Rupees .* Only$/)).toBeVisible();
  await paper.close();
});

test('the books export and print: day book lines to Excel, a party ledger as a statement to confirm', async ({ page }) => {
  const token = await apiToken('accounts@demo.com');
  const accounts = await api<{ id: string; name: string; group: string; debit: string; credit: string }[]>(token, '/books/accounts');
  const party = accounts.find((a) => a.group === 'SUNDRY_CREDITORS' && Number(a.debit) + Number(a.credit) > 0)!;
  await signIn(page, 'accounts@demo.com');

  await page.goto('/books?tab=day');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export to Excel' }).click();
  expect((await downloading).suggestedFilename()).toMatch(/^day-book-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.xlsx$/);

  await page.goto(`/books?tab=ledgers&account=${party.id}`);
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: /Print$/ }).click();
  const paper = await popup;
  await expect(paper.getByRole('heading', { name: 'Statement of account' })).toBeVisible();
  await expect(paper.getByRole('heading', { name: 'Balance confirmation' })).toBeVisible();
  await expect(paper.getByText(`Confirmed for ${party.name}`)).toBeVisible();
  await paper.close();
});

test('a tender prints its priced BOQ without the costs, and exports the rate analysis', async ({ page }) => {
  const token = await apiToken('qs@demo.com');
  const list = await api<{ items: { id: string; tenderNo: string; status: string }[] }>(token, '/tenders?status=all&pageSize=50');
  let tender: { id: string; tenderNo: string; items: unknown[] } | undefined;
  for (const t of list.items) {
    const d = await api<{ id: string; tenderNo: string; items: unknown[] }>(token, `/tenders/${t.id}`);
    if (d.items.length) {
      tender = d;
      break;
    }
  }
  await signIn(page, 'qs@demo.com');
  await page.goto(`/tenders/${tender!.id}`);
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: /Print priced BOQ$/ }).click();
  const paper = await popup;
  await expect(paper.getByRole('heading', { name: 'Priced bill of quantities' })).toBeVisible();
  await expect(paper.getByText('Overheads')).toHaveCount(0);
  await paper.close();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export to Excel' }).click();
  expect((await downloading).suggestedFilename()).toBe(`tender-${tender!.tenderNo}.xlsx`);
});
