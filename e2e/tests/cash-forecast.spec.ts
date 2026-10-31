import { expect, test } from '@playwright/test';
import { api, apiToken, formPanel, signIn } from './helpers';

/**
 * Cash forecast and billing readiness. Accounts see 13 weeks of bank and cash with every receipt and
 * payment behind them; a project manager sees billing readiness but not the forecast, and Draft reminder opens the
 * letter form filled in from the bill and the contract's payment clause (nothing is saved).
 */

test.use({ contextOptions: { reducedMotion: 'reduce' } });

type Range = { low: number; likely: number; high: number };
type Forecast = { opening: { total: number }; weeks: { start: string; closing: Range; in: Range; out: Range }[]; items: { key: string; label: string }[] };
type Readiness = { rows: { projectCode: string; unpaid: { billId: string; label: string }[] }[] };

test('accounts see 13 weeks of bank and cash, with every receipt and payment behind them', async ({ page }) => {
  const accounts = await apiToken('accounts@demo.com');
  const f = await api<Forecast>(accounts, '/cash-forecast');
  expect(f.weeks).toHaveLength(13);
  let running = f.opening.total;
  for (const w of f.weeks) {
    running += w.in.likely - w.out.likely;
    expect(Math.abs(running - w.closing.likely)).toBeLessThan(1);
    expect(w.closing.low).toBeLessThanOrEqual(w.closing.likely + 0.5);
  }

  await signIn(page, 'accounts@demo.com');
  await page.goto('/cash-forecast');
  await expect(page.getByRole('heading', { name: 'Cash forecast', level: 1 })).toBeVisible();
  await expect(page.getByText('Bank and cash today')).toBeVisible();
  await expect(page.getByText('Balance at each week’s end')).toBeVisible();
  if (f.items.length) await expect(page.getByRole('link', { name: f.items[0].label }).first()).toBeVisible();
  await page.getByRole('radiogroup', { name: 'Show balance at each week’s end as' }).getByText('Table').click();
  await expect(page.getByRole('columnheader', { name: 'Week of' })).toBeVisible();

  // A project manager has billing readiness, not the forecast.
  await expect(api(await apiToken('pm2@demo.com'), '/cash-forecast')).rejects.toThrow(/403/);
});

test('Draft reminder opens a letter to the client quoting the contract’s payment clause', async ({ page }) => {
  const pm2 = await apiToken('pm2@demo.com');
  const ready = await api<Readiness>(pm2, '/billing-readiness');
  const building = ready.rows.find((r) => r.projectCode === 'BL-2026-02');

  await signIn(page, 'pm2@demo.com');
  await page.goto('/billing-readiness');
  await expect(page.getByRole('heading', { name: 'Billing readiness', level: 1 })).toBeVisible();
  // RA bill 1 of the building site is sent and unpaid, unless the receivables test has just recorded it paid.
  const bill = building?.unpaid[0];
  if (!bill) {
    await expect(page.locator('[data-project="BL-2026-02"]').getByText('Sent, not paid:')).toHaveCount(0);
    return;
  }
  const letters = (await api<{ total: number }>(pm2, '/letters?pageSize=1')).total;
  await page.locator(`[data-bill="${bill.billId}"]`).getByRole('button', { name: 'Draft reminder' }).click();
  await expect(page).toHaveURL(/\/correspondence\/outward/);
  const form = formPanel(page, 'New letter');
  await expect(form.getByText(/Drafted from the bill and clause 7\.2 of HB-AGR-01/)).toBeVisible();
  await expect(form.getByLabel('Subject')).toHaveValue(`Payment of ${bill.label} for District Hospital Block B (G+3)`);
  await expect(form.getByRole('combobox', { name: /^\W*To$/ })).toHaveValue('Dept. of Health & Family Welfare');
  await expect(form.getByLabel('Letter text')).toHaveValue(/7\.2 The Department shall pay a running account bill within 30 days of its submission/);
  await form.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('dialog', { name: 'Close this form?' }).getByRole('button', { name: 'Close' }).click();
  expect((await api<{ total: number }>(pm2, '/letters?pageSize=1')).total).toBe(letters);
});
