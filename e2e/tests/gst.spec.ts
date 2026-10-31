import { statSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { API_URL, api, apiToken, signIn } from './helpers';

type Registers = {
  outward: { invoiceNo: string; section: string; taxable: string; cgst: string; sgst: string; igst: string; rate: string }[];
  inward: { ref: string; itcEligible: boolean }[];
  outwardTotals: { tax: string };
};
/** The last three months, so the seed's bills are in it whatever the day. */
const months = () => {
  const d = new Date();
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  const start = new Date(Date.UTC(d.getFullYear(), d.getMonth() - 2, 1));
  return { from: iso(start), to: iso(new Date(Date.UTC(d.getFullYear(), d.getMonth() + 1, 0))), fromMonth: iso(start).slice(0, 7), toMonth: iso(d).slice(0, 7) };
};

/** GST registers: approved RA bills as outward supplies and purchases as input tax, with the GSTR-1 workbook. */
test('GST registers show outward supplies and input tax, and download as Excel', async ({ page }) => {
  const accounts = await apiToken('accounts@demo.com');
  const { from, to, fromMonth, toMonth } = months();
  const reg = await api<Registers>(accounts, `/gst/registers?from=${from}&to=${to}`);
  expect(reg.outward.length).toBeGreaterThan(0);
  for (const r of reg.outward) {
    // Works on a site: CGST + SGST at the bill's rate.
    expect(Number(r.igst)).toBe(0);
    expect(Math.abs(Number(r.cgst) + Number(r.sgst) - (Number(r.taxable) * Number(r.rate)) / 100)).toBeLessThan(1);
  }

  await signIn(page, 'accounts@demo.com');
  await expect(page.getByRole('link', { name: 'GST registers' })).toBeVisible();
  await page.goto(`/gst?from=${fromMonth}&to=${toMonth}`);
  await expect(page.getByText('Output tax')).toBeVisible();
  await expect(page.getByRole('link', { name: reg.outward[0].invoiceNo })).toBeVisible();
  await page.getByRole('tab', { name: /Input tax/ }).click();
  if (reg.inward.length) await expect(page.getByText(reg.inward[0].ref).first()).toBeVisible();
  await page.getByRole('tab', { name: 'HSN summary' }).click();
  await expect(page.getByText('9954').first()).toBeVisible();

  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export to Excel' }).click();
  const file = await downloading;
  expect(file.suggestedFilename()).toBe(`gst-registers-${from}-to-${to}.xlsx`);
  expect(statSync((await file.path())!).size).toBeGreaterThan(1000);
});

test('a site engineer has no GST registers', async ({ page }) => {
  const engineer = await apiToken('engineer@demo.com');
  const { from, to } = months();
  expect((await fetch(`${API_URL}/gst/registers?from=${from}&to=${to}`, { headers: { authorization: `Bearer ${engineer}` } })).status).toBe(403);
  await signIn(page, 'engineer@demo.com');
  await expect(page.getByRole('link', { name: 'GST registers' })).toHaveCount(0);
});
