import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

/** List pages (UI roadmap item 55): views, filters in the URL, saved and shared views, columns, rows, selection. */

const rows = (page: Page) => page.locator('.ant-table-tbody .ant-table-row');

test('a view sets the filters, which go in the address bar and come back from a link', async ({ page }) => {
  await signIn(page, 'pm@demo.com');
  await page.goto('/dpr');
  await page.getByRole('tab', { name: 'Waiting for me' }).click();
  await expect(page).toHaveURL(/\/dpr\?status=SUBMITTED$/);
  await expect(page.getByRole('tab', { name: 'Waiting for me' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.ant-tag').filter({ hasText: 'Status: Pending Approval' })).toBeVisible();

  // A link with filters opens the list filtered, with the chips to take them off.
  await page.goto('/dpr?status=APPROVED&from=2026-01-01');
  await expect(page.locator('.ant-tag').filter({ hasText: 'From 01 Jan 2026' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'false');
  await page.getByRole('button', { name: 'Clear all' }).click();
  await expect(page).toHaveURL(/\/dpr$/);
  await expect(page.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true');
});

test('a view saved and shared shows for the company, and only its owner can change it', async ({ page, browser }) => {
  const name = `Approved RA bills ${Date.now() % 100000}`;
  await signIn(page, 'pm@demo.com');
  await page.goto('/bills?status=APPROVED');
  await page.getByRole('button', { name: 'Save view' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByLabel('Share with the company').check();
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  const tab = page.getByRole('tab', { name });
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'Save view' })).toBeDisabled();

  // Someone else in the company sees it, without the menu to change it.
  const other = await browser.newPage();
  await signIn(other, 'md@demo.com');
  await other.goto('/bills');
  await other.getByRole('tab', { name }).click();
  await expect(other).toHaveURL(/status=APPROVED/);
  await expect(other.getByRole('button', { name: `${name} view options` })).toHaveCount(0);
  await other.close();

  // The owner deletes it.
  await page.getByRole('button', { name: `${name} view options` }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  // The one delete confirmation (UX item 86): it names the view, and once it is gone the notice offers Undo.
  const confirm = page.getByRole('dialog').filter({ hasText: `Delete the view “${name}”?` });
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(confirm).toHaveCount(0);
  await expect(page.getByRole('tab', { name })).toHaveCount(0);
  await expect(page.locator('.ant-message-notice').filter({ hasText: `The view “${name}” deleted` }).getByRole('button', { name: 'Undo' })).toBeVisible();
});

test('columns can be hidden and stay hidden, and Reset brings them back', async ({ page }) => {
  await signIn(page, 'pm@demo.com');
  await page.goto('/dpr');
  const header = page.locator('.ant-table-thead th').filter({ hasText: /^Work executed$/ });
  await expect(header).toBeVisible();
  await page.getByRole('button', { name: 'Columns' }).click();
  await page.getByRole('checkbox', { name: 'Work executed' }).uncheck();
  await expect(header).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.ant-table-thead th').filter({ hasText: /^Date$/ })).toBeVisible();
  await expect(header).toHaveCount(0);
  await page.getByRole('button', { name: 'Columns' }).click();
  await page.getByRole('button', { name: 'Reset columns' }).click();
  await expect(header).toBeVisible();
});

test('clicking a row opens it, and selected rows get the bulk bar', async ({ page }) => {
  await signIn(page, 'pm@demo.com');
  await page.goto('/material-requests');
  await expect(rows(page).first()).toBeVisible();
  const requestNo = (await rows(page).first().locator('td').nth(1).innerText()).trim();
  await rows(page).first().locator('td').nth(3).click();
  await expect(page.locator('.ant-drawer')).toContainText(requestNo);
  await page.keyboard.press('Escape');

  await rows(page).first().getByRole('button', { name: 'Actions' }).click();
  await expect(page.getByRole('menuitem', { name: /Open$/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Open full page' })).toBeVisible();
  await page.keyboard.press('Escape');

  await rows(page).nth(0).locator('.ant-checkbox-input').check();
  await rows(page).nth(1).locator('.ant-checkbox-input').check();
  const bar = page.getByRole('toolbar', { name: 'Selected rows' });
  await expect(bar).toContainText('2 selected');
  const download = page.waitForEvent('download');
  await bar.getByRole('button', { name: 'Export' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.xlsx$/);
  await expect(bar).toBeHidden();
});

test('figures add up in a total row for the page', async ({ page }) => {
  await signIn(page, 'pm@demo.com');
  await page.goto('/dpr');
  await expect(rows(page).nth(1)).toBeVisible();
  const summary = page.locator('.ant-table-summary');
  await expect(summary).toContainText('Page total');
  // The manpower total is the sum of the rows' manpower.
  const index = await page.locator('.ant-table-thead th').allInnerTexts().then((h) => h.findIndex((t) => t.trim() === 'Manpower'));
  const cells = await rows(page).evaluateAll((trs, i) => trs.map((tr) => Number((tr.children[i] as HTMLElement).innerText.trim() || 0)), index);
  await expect(summary.locator('td').nth(index)).toHaveText(String(cells.reduce((a, b) => a + b, 0)));
});

test('the other approval lists have the same views, chips, columns and totals', async ({ page }) => {
  await signIn(page, 'md@demo.com');
  for (const path of ['/vendor-bills', '/work-orders', '/subcontract-bills', '/expenses', '/measurements', '/machinery', '/inspections']) {
    await page.goto(path);
    await expect(page.getByRole('tab', { name: 'Sent back' }), path).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Mine' }), path).toBeVisible();
    await expect(page.getByRole('button', { name: 'Columns' }), path).toBeVisible();
  }

  // A list's own view goes in the address bar and shows as a chip.
  await page.goto('/vendor-bills');
  await page.getByRole('tab', { name: 'Does not match' }).click();
  await expect(page).toHaveURL(/\/vendor-bills\?exceptions=1$/);
  await expect(page.locator('.ant-tag').filter({ hasText: 'Does not match' })).toBeVisible();

  // Dates now filter work orders too; the chip takes them off.
  await page.goto('/work-orders?from=2026-01-01');
  await expect(page.locator('.ant-tag').filter({ hasText: 'From 01 Jan 2026' })).toBeVisible();
  await page.getByLabel('Remove From 01 Jan 2026').click();
  await expect(page).toHaveURL(/\/work-orders$/);

  // Expenses add up on the page, and a row opens its entry.
  await page.goto('/expenses');
  await expect(rows(page).nth(1)).toBeVisible();
  await expect(page.locator('.ant-table-summary')).toContainText('Page total');
  const expenseNo = (await rows(page).first().locator('td.mono').first().innerText()).trim();
  await rows(page).first().locator('td').nth(2).click();
  await expect(page.locator('.ant-drawer')).toContainText(expenseNo);
});

test('projects, clients, vendors and users have views, chips and columns too', async ({ page }) => {
  await signIn(page, 'admin@demo.com');
  await page.goto('/projects');
  await page.getByRole('tab', { name: 'Active' }).click();
  await expect(page).toHaveURL(/\/projects\?status=ACTIVE$/);
  await expect(page.locator('.ant-tag').filter({ hasText: 'Status: Active' })).toBeVisible();
  // A row opens its project.
  await rows(page).first().locator('td').nth(3).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}/);

  await page.goto('/vendors');
  await page.getByRole('tab', { name: 'Subcontractors' }).click();
  await expect(page).toHaveURL(/\/vendors\?kind=SUBCONTRACTOR$/);
  await expect(page.locator('.ant-tag').filter({ hasText: 'Supplies: Subcontractor' })).toBeVisible();
  await expect(rows(page).first()).toContainText('Subcontractor');

  await page.goto('/clients');
  await expect(page.getByRole('button', { name: 'Columns' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Including inactive' })).toBeVisible();

  await page.goto('/users?roleKey=SITE_ENGINEER');
  await expect(page.locator('.ant-tag').filter({ hasText: 'Role: Site Engineer' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Site engineers' })).toHaveAttribute('aria-selected', 'true');
  // Clicking a user opens the edit form.
  await rows(page).first().locator('td').nth(2).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('registers have views, and lists in a tab keep chips and columns', async ({ page }) => {
  await signIn(page, 'pm@demo.com');
  await page.goto('/risks');
  // The register opens on what is still open, under its own name.
  await expect(page.getByRole('tab', { name: 'Open', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Delays' }).click();
  await expect(page).toHaveURL(/\/risks\?kind=DELAY$/);
  await expect(page.locator('.ant-tag').filter({ hasText: 'Delays' })).toBeVisible();

  await page.goto('/stock');
  await page.getByRole('tab', { name: 'Receipts and issues' }).click();
  const register = page.getByRole('tabpanel', { name: 'Receipts and issues' });
  await expect(register.getByRole('button', { name: 'Columns' })).toBeVisible();
  const chip = register.locator('.ant-tag').filter({ hasText: 'Type: Issue' });
  // Under trace recording a click in this tab's drop-downs is sometimes lost (not seen by hand), so pick again if needed.
  await expect(async () => {
    if (!(await page.locator('.ant-select-dropdown:visible').count())) await register.getByRole('combobox', { name: 'Type' }).click();
    await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: /^Issue$/ }).click();
    await expect(chip).toBeVisible({ timeout: 2000 });
  }).toPass();
  // A tab list keeps its filters to itself: only the open tab goes in the address bar (UX item 84).
  await expect(page).toHaveURL(/\/stock\?sub=register$/);
});
