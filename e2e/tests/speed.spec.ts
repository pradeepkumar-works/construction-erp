import { expect, test, type Page } from '@playwright/test';
import { formPanel, signIn } from './helpers';

/** Speed you can feel (item 83): lists keep their rows while paging, pickers search as you type, home does not jump. */

const rows = (page: Page) => page.locator('.ant-table-tbody .ant-table-row');

test('paging a list keeps the rows on screen while the next page loads', async ({ page }) => {
  await signIn(page, 'pm@demo.com');
  await page.goto('/progress');
  await expect(rows(page).first()).toBeVisible();
  const firstOnPage1 = await rows(page).first().getAttribute('data-row-key');

  // Hold page 2 back until the page has been checked mid-load.
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route(/\/api\/progress\?.*page=2/, async (route) => {
    await held;
    await route.continue();
  });

  await page.locator('.ant-pagination').getByTitle('2', { exact: true }).click();
  // Mid-load: the old rows stay, under the table's own spinner, with no placeholder blocks in their place.
  await expect(page.locator('.ant-table-wrapper .ant-spin-spinning')).toBeVisible();
  await expect(rows(page).first()).toHaveAttribute('data-row-key', firstOnPage1!);
  await expect(page.locator('.ant-table-wrapper .ant-skeleton')).toHaveCount(0);

  release();
  await expect(rows(page).first()).not.toHaveAttribute('data-row-key', firstOnPage1!);
  await expect(page.locator('.ant-table-wrapper .ant-spin-spinning')).toHaveCount(0);
});

test('a picker searches as you type and never loads the whole master', async ({ page }) => {
  const asked: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/')) asked.push(r.url());
  });
  await signIn(page, 'admin@demo.com');
  await page.goto('/projects');
  await page.getByRole('button', { name: 'New project' }).first().click();
  const form = formPanel(page, 'New project');
  const manager = form.getByLabel('Project manager');
  await manager.click();
  await manager.fill('kavi');
  await expect(page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').getByText('Kavita Rao (Project Manager)')).toBeVisible();
  await manager.press('Enter');
  await expect(form.locator('.ant-form-item').filter({ hasText: 'Project manager' })).toContainText('Kavita Rao (Project Manager)');

  // The search went to the server, and no picker asked for a whole master (the header's project list is the one large page).
  expect(asked.some((u) => /\/api\/users\?.*q=kavi/.test(u))).toBe(true);
  expect(asked.filter((u) => /pageSize=500/.test(u) && !/\/api\/projects\?/.test(u))).toEqual([]);
});

test('home draws without layout shift above the charts', async ({ page }) => {
  await signIn(page, 'md@demo.com');
  // A fresh load of home, with every layout shift counted from the first paint (as Chrome's CLS does, without scrolling).
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number };
    w.__cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!e.hadRecentInput) w.__cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto('/');
  await expect(page.getByText(/^Welcome, /)).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(page.getByText('Projects by Type')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
  expect(cls).toBeLessThan(0.1);
});
