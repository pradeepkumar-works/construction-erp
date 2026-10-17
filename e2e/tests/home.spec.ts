import { expect, test } from '@playwright/test';
import { api, apiToken, signIn } from './helpers';

type Card = { count: number; amount: string | null; items: { label: string; href: string }[] };
type MyWork = { approvals?: { type: string; count: number }[]; payablesDue?: Card; receivables?: Card; dprsMissing?: Card; sentBack?: Card };
type Trends = { months: string[]; workDone: string[]; cashIn?: string[]; cashOut?: string[]; cost?: string[]; sCurve: unknown[] };

const section = (page: import('@playwright/test').Page, name: string) => page.getByRole('region', { name, exact: true });

/**
 * Home dashboards by role (UI roadmap item 59): the page leads with what waits for the user (My work), then the KPI
 * tiles and charts their role cares about. The API leaves out what a role cannot see, so the page cannot show it.
 */
test('accounts lead with money due and see cash flow', async ({ page }) => {
  const token = await apiToken('accounts@demo.com');
  const work = await api<MyWork>(token, '/dashboard/my-work');
  expect(work.payablesDue).toBeDefined();
  expect(work.receivables).toBeDefined();
  const trends = await api<Trends>(token, '/dashboard/trends');
  expect(trends.months).toHaveLength(6);
  expect(trends.cashIn).toHaveLength(6);
  expect(trends.cost).toHaveLength(6);

  await signIn(page, 'accounts@demo.com');
  const mine = page.locator('.ant-card').filter({ has: page.getByText('My work', { exact: true }) });
  await expect(mine.getByRole('region').first()).toHaveAccessibleName('Payments due this week');
  await expect(section(page, 'Bills awaiting payment')).toContainText(String(work.receivables!.count));
  await expect(page.getByText('Vendor payable', { exact: true })).toBeVisible();
  await expect(page.getByText(/^Received in [A-Z][a-z]{2,3}$/)).toBeVisible();
  await expect(page.getByText(/^Cost in [A-Z][a-z]{2,3}$/)).toBeVisible();
  await expect(page.getByRole('img', { name: /^Cash in and out\. / })).toBeVisible();
  await expect(page.getByRole('img', { name: /^Cost by head\. / })).toBeVisible();
});

test('a project manager sees approvals, missing DPRs and the progress curve', async ({ page }) => {
  const token = await apiToken('pm@demo.com');
  const work = await api<MyWork>(token, '/dashboard/my-work');
  expect(work.approvals).toBeDefined();
  expect(work.dprsMissing).toBeDefined();

  await signIn(page, 'pm@demo.com');
  const approvals = section(page, 'Waiting for your approval');
  await expect(approvals).toBeVisible();
  await expect(approvals.getByRole('link', { name: 'Waiting for your approval' })).toHaveAttribute('href', '/approvals');
  await expect(section(page, 'DPRs not filed today')).toBeVisible();
  await expect(page.getByText(/^Work done in [A-Z][a-z]{2,3}$/)).toBeVisible();
  await expect(page.getByText('Pending approvals', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: /^Planned against actual progress\. / })).toBeVisible();
});

test('a site engineer sees no money', async ({ page }) => {
  const token = await apiToken('engineer@demo.com');
  const work = await api<MyWork>(token, '/dashboard/my-work');
  expect(work.receivables ?? work.payablesDue).toBeUndefined();
  const trends = await api<Trends>(token, '/dashboard/trends');
  expect(trends.cashIn ?? trends.cashOut ?? trends.cost).toBeUndefined();

  await signIn(page, 'engineer@demo.com');
  await expect(page.getByText('My work', { exact: true })).toBeVisible();
  await expect(page.getByText('Delayed activities', { exact: true })).toBeVisible();
  await expect(page.getByText('Vendor payable')).toHaveCount(0);
  await expect(page.getByText('Bills awaiting payment')).toHaveCount(0);
  await expect(page.getByRole('img', { name: /^Cash in and out\. / })).toHaveCount(0);
});
