import { expect, test } from '@playwright/test';
import { api, apiToken, homeHeading, signIn } from './helpers';

/**
 * Menu and names: an admin moves the menu into the top bar with the department modules and a name of the company's own;
 * Home then opens on the modules, and a module carries its sub-modules in the bar under the top one. Each test puts the
 * shipped menu (the sidebar) back.
 */

const DEFAULT = { layout: 'SIDEBAR', look: 'NAVY', moduleSet: 'AREAS', names: {}, personalLook: false };

test.afterEach(async () => {
  await api(await apiToken('admin@demo.com'), '/nav-settings', { method: 'PUT', body: DEFAULT });
});

test('an admin moves the menu to the top bar, and a module opens with its sub-modules', async ({ page }) => {
  await api(await apiToken('admin@demo.com'), '/nav-settings', { method: 'PUT', body: DEFAULT });
  await signIn(page, 'admin@demo.com');
  await page.goto('/menu-and-names');
  await page.getByRole('radio', { name: /^Top bar/ }).check();
  await page.getByRole('radio', { name: /^By department/ }).check();
  await page.getByRole('textbox', { name: 'Your company’s name for Store and inventory' }).fill('Stores');
  await page.getByRole('button', { name: 'Save menu' }).click();
  await expect(page.getByText('Menu saved')).toBeVisible();

  await page.getByRole('link', { name: 'Home', exact: true }).first().click();
  await expect(homeHeading(page)).toBeVisible();
  const modules = page.getByRole('group', { name: 'Modules' });
  await expect(modules.getByRole('link', { name: /^Stores/ })).toBeVisible();
  await modules.getByRole('link', { name: /^Purchase management/ }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Purchase management' })).toBeVisible();
  const bar = page.getByRole('navigation', { name: 'Purchase management' });
  await expect(bar.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
  await bar.getByRole('button', { name: 'Orders' }).click();
  await page.getByRole('menuitem', { name: 'Purchase orders' }).click();
  await expect(page).toHaveURL(/\/purchase-orders/);
  await expect(page.getByRole('heading', { level: 1, name: 'Purchase orders' })).toBeVisible();
  // The page keeps its module's bar, with its sub-module marked.
  await expect(page.getByRole('navigation', { name: 'Purchase management' }).getByRole('button', { name: 'Orders' })).toBeVisible();
});

test('a site engineer sees only the modules their role opens, under the company’s names', async ({ page }) => {
  await api(await apiToken('admin@demo.com'), '/nav-settings', { method: 'PUT', body: { ...DEFAULT, layout: 'TOP_BAR', moduleSet: 'DEPARTMENTS', names: { 'project-management': 'Sites' } } });
  await signIn(page, 'engineer@demo.com');
  const modules = page.getByRole('group', { name: 'Modules' });
  await expect(modules.getByRole('link', { name: /^Sites/ })).toBeVisible();
  await expect(modules.getByRole('link', { name: /^Administration/ })).toHaveCount(0);
  await page.goto('/modules/administration');
  await expect(page.getByText('This module is not in your menu')).toBeVisible();
});
