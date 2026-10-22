import { expect, test } from '@playwright/test';
import { api, apiToken, signIn } from './helpers';

type ModuleHome = {
  module: string;
  figures: { key: string; label: string; value: string; of?: number | null; href: string }[];
  waiting: { type: string; count: number }[];
};

/**
 * Module home pages (v6 item 98): each sidebar section leads with its overview. The project manager's Site home shows the
 * site figures and what waits for them there; accounts get the money figures of Purchases and none of the site ones; a
 * module a role does not use is not found.
 */
test('each module has a home with its figures, what waits, and its pages', async ({ page }) => {
  const pm = await apiToken('pm@demo.com');
  const site = await api<ModuleHome>(pm, '/dashboard/modules/site');
  expect(site.figures.map((f) => f.key)).toEqual(expect.arrayContaining(['dprToday', 'openRisks']));
  const dpr = site.figures.find((f) => f.key === 'dprToday')!;
  expect(Number(dpr.value)).toBeLessThanOrEqual(dpr.of ?? 0);

  const accounts = await apiToken('accounts@demo.com');
  const buying = await api<ModuleHome>(accounts, '/dashboard/modules/purchases');
  expect(buying.figures.map((f) => f.key)).toEqual(expect.arrayContaining(['payable', 'payableOverdue']));
  const accountsSite = await api<ModuleHome>(accounts, '/dashboard/modules/site');
  expect(accountsSite.figures.map((f) => f.key)).not.toContain('dprToday');
  await expect(api(pm, '/dashboard/modules/nowhere')).rejects.toThrow(/404/);

  await signIn(page, 'pm@demo.com');
  const nav = page.getByRole('navigation', { name: /main/i }).or(page.locator('nav').first());
  await nav.getByRole('link', { name: 'Site overview' }).first().click();
  await expect(page).toHaveURL(/\/modules\/site$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Site' })).toBeVisible();
  await expect(page).toHaveTitle(/^Site overview/);
  await expect(page.getByText('Daily reports today')).toBeVisible();
  await expect(page.getByText('Waiting for you')).toBeVisible();
  // The module's pages, each a card with what it is for.
  const pages = page.getByRole('region', { name: /^Pages in site$/i }).or(page.locator('.ant-card').filter({ hasText: 'Pages in site' }));
  await expect(pages.getByRole('link', { name: /Daily reports/ })).toBeVisible();
  if (site.waiting.length) {
    await page.getByRole('link', { name: new RegExp(`${site.waiting[0].count} .* to approve`) }).first().click();
    await expect(page).toHaveURL(new RegExp(`/approvals\\?type=${site.waiting[0].type}`));
  }

  await page.goto('/modules/nowhere');
  await expect(page.getByText('This module is not in your menu')).toBeVisible();
});
