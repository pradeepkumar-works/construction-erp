import { expect, test } from '@playwright/test';
import { chooseOption, signIn, formPanel, menuSettled, openNewMenu } from './helpers';

/** The header (UI roadmap item 54): project switcher, + New, favourites, recent pages in Search, Help. */
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
  await openNewMenu(page);
  await page.getByRole('menuitem', { name: 'Daily report' }).click();
  await expect(page).toHaveURL(/\/dpr$/);
  await expect(page.getByRole('dialog')).toContainText('New daily report');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();

  await openNewMenu(page);
  await page.getByRole('menuitem', { name: 'Indent' }).click();
  await expect(page).toHaveURL(/\/material-requests$/);
  await expect(formPanel(page, 'New indent')).toBeVisible();
});

test('a page pinned to Home is under Pinned, and the last pages opened lead Search', async ({ page }) => {
  await signIn(page, 'pm@demo.com');
  await page.goto('/stock');
  const pinButton = page.getByRole('button', { name: 'Pin to Home' });
  if ((await pinButton.getAttribute('aria-pressed')) === 'true') await pinButton.click();
  await expect(pinButton).toHaveAttribute('aria-pressed', 'false');
  await pinButton.click();
  await expect(pinButton).toHaveAttribute('aria-pressed', 'true');
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('button', { name: 'Pinned', exact: true })).toBeVisible();
  await expect(nav.locator('#nav-pinned')).toContainText('Stock');
  // Unpinned again, so other tests start with the project manager's own pins.
  await pinButton.click();
  await expect(pinButton).toHaveAttribute('aria-pressed', 'false');

  await page.goto('/dpr');
  await expect(page.getByRole('heading', { name: 'Daily reports' })).toBeVisible();
  await page.goto('/attendance');
  await expect(page.getByRole('heading', { name: 'Attendance', level: 1 })).toBeVisible();
  // Recent is no longer a sidebar section (UX item 87): Search shows it before anything is typed, newest first, without
  // the page that is open.
  await expect(nav.getByRole('button', { name: 'Recent', exact: true })).toHaveCount(0);
  await page.keyboard.press('Control+k');
  const options = page.locator('#palette-results').getByRole('option');
  await expect(page.locator('#palette-results li').first()).toHaveText('Recent');
  await expect(options.nth(0)).toContainText('Daily reports');
  await expect(options.nth(1)).toContainText('Stock');
  await expect(options.nth(0)).not.toContainText('Attendance');
});

test('Help shows the keyboard shortcuts on ? and what is new', async ({ page }) => {
  await signIn(page, 'pm@demo.com');
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Help' }).click();
  await menuSettled(page);
  await page.getByRole('menuitem', { name: /What's new/ }).click();
  await expect(page.getByRole('dialog', { name: "What's new" })).toContainText('A new header');
});
