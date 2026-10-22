import { expect, test, type Page } from '@playwright/test';
import { api, apiToken, signIn } from './helpers';

/**
 * Navigation and words (UX item 87): each role's sidebar holds its own modules, sections remember being closed, Recent
 * lives in Search, every sidebar link is named like the page it opens, and the header's New is not the page's primary.
 */

const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Main' });
const link = (page: Page, name: string) => sidebar(page).getByRole('link', { name, exact: true });

test("a site engineer's sidebar has no finance module", async ({ page }) => {
  await signIn(page, 'engineer@demo.com');
  // What the engineer works with is there, so the checks below are not passing on an empty sidebar.
  for (const name of ['Daily reports', 'Progress entries', 'Attendance', 'Material requests', 'Safety']) await expect(link(page, name)).toBeVisible();
  for (const name of ['Vendor bills', 'Payables', 'RA bills', 'Receivables', 'GST registers', 'Tally export', 'Project cost', 'Payroll', 'Approvals']) {
    await expect(link(page, name)).toHaveCount(0);
  }
  await expect(sidebar(page).getByRole('button', { name: 'Billing', exact: true })).toHaveCount(0);
});

test("an accountant's sidebar has no site-only module", async ({ page }) => {
  await signIn(page, 'accounts@demo.com');
  for (const name of ['Payables', 'Receivables', 'Vendor bills', 'GST registers', 'Tally export', 'Site expenses', 'Project cost']) await expect(link(page, name)).toBeVisible();
  for (const name of ['Daily reports', 'Progress entries', 'Measurement book', 'Quality', 'Safety', 'Machinery', 'Material requests']) {
    await expect(link(page, name)).toHaveCount(0);
  }
});

test('a closed section stays closed after a reload, and opens itself on one of its pages', async ({ page }) => {
  await signIn(page, 'pm@demo.com');
  const purchases = () => sidebar(page).getByRole('button', { name: 'Purchases', exact: true });
  await expect(purchases()).toHaveAttribute('aria-expanded', 'true');
  await purchases().click();
  await expect(purchases()).toHaveAttribute('aria-expanded', 'false');
  await expect(link(page, 'Vendor bills')).toHaveCount(0);

  await page.reload();
  await expect(purchases()).toHaveAttribute('aria-expanded', 'false');

  // Arriving on one of its pages opens it, without forgetting it was closed.
  await page.goto('/payables');
  await expect(purchases()).toHaveAttribute('aria-expanded', 'true');
  await expect(link(page, 'Payables')).toHaveAttribute('aria-current', 'page');
  await page.goto('/');
  await expect(purchases()).toHaveAttribute('aria-expanded', 'false');
});

test('Search with nothing typed shows a record opened lately', async ({ page }) => {
  const md = await apiToken('md@demo.com');
  const bill = (await api<{ items: { id: string }[] }>(md, '/ra-bills?pageSize=1')).items[0];
  await signIn(page, 'pm@demo.com');
  await page.goto(`/bills/${bill.id}`);
  await expect(page.getByRole('group', { name: 'Stage' })).toBeVisible();
  const title = (await page.locator('h1 [translate="no"]').first().innerText()).trim();
  expect(title.length).toBeGreaterThan(0);

  await page.goto('/');
  await expect(page.getByText(/^Welcome, /)).toBeVisible();
  await page.keyboard.press('Control+k');
  const list = page.locator('#palette-results');
  await expect(list.locator('li').first()).toHaveText('Recent');
  await expect(list.getByRole('option').first()).toContainText(title);
  await list.getByRole('option').first().click();
  await expect(page).toHaveURL(new RegExp(`/bills/${bill.id}$`));
});

test("each sidebar link is named like the page it opens", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, 'pm@demo.com');
  const links = await sidebar(page)
    .getByRole('link')
    .evaluateAll((els) =>
      els.map((a) => ({
        href: a.getAttribute('href') ?? '',
        // The link's words, without its icon or the pending count beside Approvals.
        label: (a.querySelector('span[class*="label"]')?.textContent ?? '').trim(),
      })),
    );
  expect(links.length).toBeGreaterThan(20);
  for (const { href, label } of links) {
    // Home greets the person by name instead.
    if (href === '/') continue;
    await page.goto(href);
    await expect(page.locator('h1'), `${href}`).toHaveText(label);
    await expect(page).toHaveTitle(`${label} · Nirmaan`);
  }
});

test("the header's New is secondary to the page's own", async ({ page }) => {
  await signIn(page, 'engineer@demo.com');
  await page.goto('/dpr');
  const pageNew = page.locator('#main-content').getByRole('button', { name: 'New daily report' }).first();
  await expect(pageNew).toBeVisible();
  await expect(pageNew).toHaveClass(/ant-btn-primary/);
  await expect(page.locator('[data-tour="new"]')).not.toHaveClass(/ant-btn-primary/);
  await expect(page.locator('header .ant-btn-primary')).toHaveCount(0);
});
