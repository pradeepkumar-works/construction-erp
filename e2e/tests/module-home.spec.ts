import { expect, test } from '@playwright/test';
import { api, apiToken, signIn } from './helpers';

/** A headline figure as the API states it (`figure()` in @erp/shared): the facts, named by its measure's id. */
type Figure = { id: string; value: string | number | { none: string }; versus?: { of?: number | Figure; part?: Figure } };
type ModuleHome = {
  module: string;
  figures: Figure[];
  waiting: { type: string; count: number }[];
};

/**
 * Module screens: each sidebar section leads with its overview, its figures and what waits first, then a compact tile
 * for each of the module's pages. The project manager's Site screen shows the site figures and what waits for them
 * there; accounts get the money figures of Accounts and none of the site ones; a module a role does not use is not found,
 * and a module with one page for the role opens that page.
 */
test('each module has a screen with its tiles, figures and what waits', async ({ page }) => {
  const pm = await apiToken('pm@demo.com');
  const site = await api<ModuleHome>(pm, '/dashboard/modules/site');
  expect(site.figures.map((f) => f.id)).toEqual(expect.arrayContaining(['dailyReports', 'openRisks']));
  // Daily reports today stand against the active projects: never more reported than there are sites.
  const dpr = site.figures.find((f) => f.id === 'dailyReports')!;
  const active = dpr.versus?.of;
  expect(typeof active === 'object' && active.id).toBe('activeProjects');
  expect(Number(dpr.value)).toBeLessThanOrEqual(typeof active === 'object' ? Number(active.value) : 0);

  const accounts = await apiToken('accounts@demo.com');
  const money = await api<ModuleHome>(accounts, '/dashboard/modules/accounts');
  const weOwe = money.figures.find((f) => f.id === 'weOwe');
  expect(weOwe?.versus?.part?.id).toBe('weOweOverdue');
  const quality = await api<ModuleHome>(pm, '/dashboard/modules/quality');
  expect(quality.figures.map((f) => f.id)).toEqual(expect.arrayContaining(['openNcrs']));
  const safety = await api<ModuleHome>(pm, '/dashboard/modules/safety');
  expect(safety.figures.map((f) => f.id)).toEqual(expect.arrayContaining(['safetyIncidents']));
  const accountsSite = await api<ModuleHome>(accounts, '/dashboard/modules/site');
  expect(accountsSite.figures.map((f) => f.id)).not.toContain('dailyReports');
  await expect(api(pm, '/dashboard/modules/nowhere')).rejects.toThrow(/404/);

  await signIn(page, 'pm@demo.com');
  // The work-area module screens stay open by their address under the department menu (the standard).
  await page.goto('/modules/site');
  await expect(page.getByRole('heading', { level: 1, name: 'Site overview' })).toBeVisible();
  await expect(page).toHaveTitle(/^Site overview/);
  await expect(page.getByText('Daily reports today')).toBeVisible();
  await expect(page.getByText('Waiting for you')).toBeVisible();
  // The module's pages, each a tile with what it is for; the arrow keys move between them.
  const pages = page.getByRole('group', { name: 'Pages in site' });
  const first = pages.getByRole('link').first();
  await expect(first).toContainText('Daily reports');
  await first.focus();
  await page.keyboard.press('ArrowRight');
  await expect(pages.getByRole('link').nth(1)).toBeFocused();
  await expect(pages.locator('a[tabindex="0"]')).toHaveCount(1);
  if (site.waiting.length) {
    await page.getByRole('link', { name: new RegExp(`: ${site.waiting[0].count} to approve`) }).first().click();
    await expect(page).toHaveURL(new RegExp(`/approvals\\?type=${site.waiting[0].type}`));
  }

  // A project tab tile with no project chosen asks for the project.
  await page.goto('/modules/projects');
  const projects = page.getByRole('group', { name: 'Pages in projects' });
  await projects.getByRole('button', { name: /^BOQ\b/ }).click();
  const dialog = page.getByRole('dialog', { name: /^Choose the project for/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('combobox', { name: 'Project' }).click();
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option').first().click();
  await dialog.getByRole('button', { name: 'Open' }).click();
  await expect(page).toHaveURL(/\/projects\/[\w-]+\?tab=boq$/);

  await page.goto('/modules/nowhere');
  await expect(page.getByRole('heading', { level: 1, name: 'Not in your menu' })).toBeVisible();

  // Payroll has one page for the project manager (labour contractors' man-days): its screen opens that page.
  await page.goto('/modules/payroll');
  await expect(page).toHaveURL(/\/payroll\?tab=contractors$/);
});
