import { expect, test } from '@playwright/test';
import { api, apiToken, signIn } from './helpers';

type Dashboard = {
  payables?: { outstanding: string };
  monthCost?: { month: string; total: string };
  monthBilling?: { month: string; bills: number };
  financialProgress?: { pct: number | null };
};

/**
 * Dashboard finance tiles (v4 item 36): accounts sees vendor payable, this month's expense and billing, and financial
 * progress; a site engineer sees none of them, and the API leaves them out for that role.
 */
test('finance tiles on the company dashboard follow the role', async ({ page }) => {
  const accounts = await apiToken('accounts@demo.com');
  const data = await api<Dashboard>(accounts, '/dashboard/company');
  expect(data.payables).toBeDefined();
  expect(data.monthCost?.month).toMatch(/^\d{4}-\d{2}$/);
  expect(data.monthBilling).toBeDefined();
  expect(data.financialProgress).toBeDefined();

  await signIn(page, 'accounts@demo.com');
  await expect(page.getByText('Vendor Payable')).toBeVisible();
  await expect(page.getByText(/^Expense in [A-Z][a-z]{2} \d{4}$/)).toBeVisible();
  await expect(page.getByText(/^Billed in [A-Z][a-z]{2} \d{4}$/)).toBeVisible();
  const progress = page.locator('.kpi-card').filter({ hasText: 'Financial Progress' });
  await expect(progress).toContainText(/billed of/);
  if (data.financialProgress?.pct !== null) await expect(progress).toContainText(`${data.financialProgress!.pct}%`);
});

test('a site engineer sees no finance tiles', async ({ page }) => {
  const engineer = await apiToken('engineer@demo.com');
  const own = await api<Dashboard>(engineer, '/dashboard/company');
  expect(own.payables ?? own.monthCost ?? own.monthBilling ?? own.financialProgress).toBeUndefined();
  await signIn(page, 'engineer@demo.com');
  await expect(page.getByText('Delayed Activities')).toBeVisible();
  await expect(page.getByText('Vendor Payable')).toHaveCount(0);
  await expect(page.getByText('Financial Progress')).toHaveCount(0);
});
