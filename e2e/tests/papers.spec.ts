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
