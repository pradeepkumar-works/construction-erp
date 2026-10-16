import { expect, test } from '@playwright/test';
import { chooseOption, signIn } from './helpers';

/** The header (UI roadmap item 54): project switcher, + New, favourites and recent, Help. */
test('the project picked in the header filters every list and is kept after a reload', async ({ page }) => {
  await signIn(page, 'pm@demo.com');
  const switcher = page.getByRole('combobox', { name: 'Project', exact: true });
  await chooseOption(switcher, 'RD-2026-01');
  await expect(page.locator('header')).toContainText('RD-2026-01');

  await page.goto('/dpr');
  const filter = page.locator('.ant-card .ant-select').first();
  await expect(filter).toContainText('RD-2026-01');
  await page.goto('/material-requests');
  await expect(page.locator('.ant-card .ant-select').first()).toContainText('RD-2026-01');

  await page.reload();
  await expect(page.locator('header')).toContainText('RD-2026-01');

  // Clearing a list's filter clears the header too.
  await page.locator('.ant-card .ant-select').first().hover();
  await page.locator('.ant-card .ant-select-clear').first().click();
  await expect(page.locator('header')).toContainText('All projects');
});

test('+ New opens the form from any page, and on the list already open', async ({ page }) => {
  await signIn(page, 'pm@demo.com');
  await page.locator('[data-tour="new"]').click();
  await page.getByRole('menuitem', { name: 'Daily report' }).click();
  await expect(page).toHaveURL(/\/dpr$/);
  await expect(page.getByRole('dialog')).toContainText('New Daily Progress Report');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();

  await page.locator('[data-tour="new"]').click();
  await page.getByRole('menuitem', { name: 'Material request' }).click();
  await expect(page).toHaveURL(/\/material-requests$/);
  await expect(page.locator('.ant-modal-title')).toBeVisible();
});

test('a starred page is under Favourites and the last pages opened are under Recent', async ({ page }) => {
  await signIn(page, 'pm@demo.com');
  await page.goto('/stock');
  await page.getByRole('button', { name: 'Add to favourites' }).click();
  await expect(page.getByRole('button', { name: 'Remove from favourites' })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('button', { name: 'Favourites', exact: true })).toBeVisible();

  await page.goto('/dpr');
  await expect(page.getByRole('heading', { name: 'Daily Progress Reports' })).toBeVisible();
  await page.goto('/attendance');
  // Stock is a favourite and Attendance is the page open, so Recent has only Daily Reports.
  await expect(nav.getByRole('button', { name: 'Recent', exact: true })).toBeVisible();
  await expect(nav.locator('#nav-recent')).toContainText('Daily Reports');
  await expect(nav.locator('#nav-recent')).not.toContainText('Attendance');
  await expect(nav.locator('#nav-favourites')).toContainText('Stock');
  await expect(nav.locator('#nav-recent')).not.toContainText('Stock');
});

test('Help shows the keyboard shortcuts on ? and what is new', async ({ page }) => {
  await signIn(page, 'pm@demo.com');
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Help' }).click();
  await page.getByRole('menuitem', { name: /What's new/ }).click();
  await expect(page.getByRole('dialog', { name: "What's new" })).toContainText('A new header');
});
