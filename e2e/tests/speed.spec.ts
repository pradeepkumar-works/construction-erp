import { expect, test, type Page } from '@playwright/test';
import { api, apiToken, formPanel, settle, signIn, webVitalBudgets } from './helpers';

/**
 * Speed you can feel: lists keep their rows while paging, pickers search as you type, home does not jump, and
 * the main pages keep to the Web Vitals budgets.
 */

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

test('My work draws without layout shift above the charts', async ({ page }) => {
  await signIn(page, 'md@demo.com');
  // A fresh load of My work, with every layout shift counted from the first paint (as Chrome's CLS does, without scrolling).
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number };
    w.__cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!e.hadRecentInput) w.__cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto('/my-work');
  await expect(page.getByRole('heading', { level: 1, name: 'My work' })).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(page.getByText('Projects by type')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
  expect(cls).toBeLessThan(0.1);
});

/**
 * The budgets in `apps/web/src/lib/vitals.ts`, measured by the app's own reporting (next/web-vitals into
 * `reportWebVital`, which sends `POST /api/vitals` when the tab is hidden) on home, a list, a record and Approvals, each
 * opened fresh and used once (the search palette, and a row on the list).
 * CI shares two to four slow cores between Postgres, the API, the web server and the browser, with no GPU, so the timed
 * vitals (LCP, INP) get VITALS_SLACK times their budget (2 unless set). A real phone has its own costs (the network, a
 * slower CPU) that this does not measure; the field reports from `/api/vitals` cover those. Layout shift is not a matter
 * of speed and keeps its budget as it is.
 */
test('home, a list, a record and Approvals keep to the Web Vitals budgets', async ({ page }) => {
  test.setTimeout(120_000);
  const budgets = webVitalBudgets();
  const slack = Number(process.env.VITALS_SLACK ?? 2);
  const reports: { name: 'LCP' | 'CLS' | 'INP'; value: number; path: string }[] = [];
  await page.route(/\/api\/vitals$/, async (route) => {
    const data = new URLSearchParams(route.request().postData() ?? '').get('data');
    if (data) reports.push(...JSON.parse(data));
    await route.fulfill({ status: 204 });
  });

  const token = await apiToken('pm@demo.com');
  const dpr = (await api<{ items: { id: string }[] }>(token, '/dpr?pageSize=1')).items[0];
  await signIn(page, 'pm@demo.com');
  const pages = [
    { path: '/', route: '/' },
    { path: '/dpr', route: '/dpr', row: true },
    { path: `/dpr/${dpr.id}`, route: '/dpr/:id' },
    { path: '/approvals', route: '/approvals' },
  ];
  const over: string[] = [];
  for (const p of pages) {
    await page.goto(p.path);
    await settle(page);
    // One real use of the page: open the search palette and close it; on the list, open a row too.
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('combobox', { name: 'Search', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    if (p.row) {
      await page.locator('.ant-table-tbody > tr[data-row-key]').first().click();
      await expect(page.locator('.ant-drawer-open')).toBeVisible();
      await page.keyboard.press('Escape');
    }
    // The tab "hides": web-vitals reports what it has, and the app sends it.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
    });
    await expect.poll(() => reports.filter((r) => r.path === p.route).map((r) => r.name).sort().join(','), { message: `vitals reported for ${p.route}` }).toMatch(/CLS.*LCP/);
    for (const r of reports.filter((x) => x.path === p.route)) {
      const allowed = r.name === 'CLS' ? budgets.CLS : budgets[r.name] * slack;
      if (r.value > allowed) over.push(`${p.route} ${r.name} ${r.value} (budget ${budgets[r.name]}${r.name === 'CLS' ? '' : `, ×${slack} on CI = ${allowed}`})`);
    }
    test.info().annotations.push({ type: 'vitals', description: `${p.route} ${reports.filter((r) => r.path === p.route).map((r) => `${r.name} ${r.value}`).join(', ')}` });
  }
  expect(over).toEqual([]);
});
