import { expect, test } from '@playwright/test';
import { api, apiToken, menuSettled, signIn } from './helpers';

/**
 * Every page named and reachable by keyboard (UX item 81): a tab title and one heading per page, one breadcrumb,
 * focus on the new page's heading, rows that open from the keyboard, and single-key shortcuts that can be turned off.
 */

test('each page has its own tab title, one h1 and one breadcrumb', async ({ page }) => {
  await signIn(page, 'pm@demo.com');
  await expect(page.locator('h1')).toHaveCount(1);

  await page.goto('/dpr');
  await expect(page).toHaveTitle('Daily reports · Nirmaan');
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveText('Daily reports');

  // A record's page is named after the record, and the header's breadcrumb carries its kind (no second one on the page).
  const md = await apiToken('md@demo.com');
  const bill = (await api<{ items: { id: string }[] }>(md, '/ra-bills?pageSize=1')).items[0];
  await page.goto(`/bills/${bill.id}`);
  await expect(page.getByRole('group', { name: 'Stage' })).toBeVisible();
  const heading = (await page.locator('h1').innerText()).trim();
  await expect(page).toHaveTitle(/ · Nirmaan$/);
  expect(heading.startsWith((await page.title()).replace(/ · Nirmaan$/, ''))).toBe(true);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('.ant-breadcrumb')).toHaveCount(1);
  await expect(page.locator('.ant-breadcrumb li').last()).toHaveText('RA bill');
});

test('moving to another page puts focus on its heading', async ({ page }) => {
  await signIn(page, 'pm@demo.com');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Daily reports' }).click();
  await expect(page.locator('h1')).toHaveText('Daily reports');
  await expect(page.locator('h1')).toBeFocused();
});

test('list rows open from the keyboard, and records without a page of their own can be reached by Tab', async ({ page }) => {
  await signIn(page, 'pm@demo.com');
  await page.goto('/dpr');
  const rows = page.locator('.ant-table-tbody > tr[data-row-key]');
  await expect(rows.nth(1)).toBeVisible();
  // The rows are one Tab stop.
  await expect(page.locator('.ant-table-tbody > tr[tabindex="0"]')).toHaveCount(1);
  await rows.first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(rows.nth(1)).toBeFocused();
  await page.keyboard.press('k');
  await expect(rows.first()).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.ant-drawer-open').getByRole('group', { name: 'Stage' })).toBeVisible();
  await page.keyboard.press('Escape');

  // Risks have no page yet: the name is a button that looks like a link, so it takes focus and opens on Enter.
  await page.goto('/risks');
  const name = page.locator('.ant-table-row [role="button"]').first();
  await name.focus();
  await expect(name).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.ant-drawer-open')).toBeVisible();
});

test('single-key shortcuts can be turned off, and Ask is on Alt J', async ({ page }) => {
  await signIn(page, 'pm@demo.com');
  await page.keyboard.press('?');
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Alt');
  await dialog.getByRole('switch', { name: 'Single-key shortcuts' }).click();
  await expect(dialog.getByRole('switch', { name: 'Single-key shortcuts' })).not.toBeChecked();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // ? and J no longer do anything; arrows still move through a list.
  await page.keyboard.press('?');
  await expect(dialog).toBeHidden();
  await page.goto('/dpr');
  const rows = page.locator('.ant-table-tbody > tr[data-row-key]');
  await expect(rows.nth(1)).toBeVisible();
  await rows.first().focus();
  await page.keyboard.press('j');
  await expect(rows.first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(rows.nth(1)).toBeFocused();

  // Still off after a reload, and back on from Help.
  await page.reload();
  await page.getByRole('button', { name: 'Help' }).click();
  await menuSettled(page);
  await page.getByRole('menuitem', { name: /Keyboard shortcuts/ }).click();
  await expect(dialog.getByRole('switch', { name: 'Single-key shortcuts' })).not.toBeChecked();
  await dialog.getByRole('switch', { name: 'Single-key shortcuts' }).click();
  await expect(dialog.getByRole('switch', { name: 'Single-key shortcuts' })).toBeChecked();
});

test('a dark-mode page starts dark before the app loads', async ({ page }) => {
  await signIn(page, 'pm@demo.com');
  await page.evaluate(() => localStorage.setItem('nirmaan.appearance', JSON.stringify({ mode: 'dark', density: 'comfortable' })));
  await page.goto('/dpr', { waitUntil: 'commit' });
  await page.waitForFunction(() => document.documentElement.dataset.theme !== undefined);
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0B1119');

  // The public pages stay light.
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: 'Privacy', level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBeUndefined();
});
