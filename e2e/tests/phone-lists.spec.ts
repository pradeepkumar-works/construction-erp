import { expect, test, type Page } from '@playwright/test';
import { newestFirst, pageOverflow, signIn } from './helpers';

// UX item 84: lists on a phone are cards with their filters in a drawer, a record keeps its actions in reach, the header
// fits; on a laptop the DPR list fits without sideways scroll; the finance pages, tabs and the Approvals filters live in
// the URL so a reload keeps them.

const PHONE = { width: 390, height: 844 };

/** No sideways scroll on the page itself. */
const noPageOverflow = async (page: Page) => expect(await pageOverflow(page)).toBe(0);

test.describe('on a phone', () => {
  test.use({ viewport: PHONE });

  test('the DPR list is a list of cards, each opening its record', async ({ page }) => {
    await signIn(page, 'pm@demo.com');
    await page.goto('/dpr');
    const cards = page.getByRole('list').filter({ has: page.locator('.list-card') });
    await expect(cards.getByRole('listitem').first()).toBeVisible();
    await expect(page.locator('.ant-table')).toHaveCount(0);
    await noPageOverflow(page);

    // One control per card, and the card is a touch-sized target.
    const first = cards.getByRole('listitem').first();
    await expect(first.getByRole('link')).toHaveCount(1);
    const box = await first.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.x + box!.width).toBeLessThanOrEqual(PHONE.width);

    // A tap anywhere on the card opens the record, as a click on a table row does.
    await first.click({ position: { x: box!.width - 24, y: box!.height / 2 } });
    await expect(page.locator('.ant-drawer-open').filter({ has: page.getByRole('heading') }).first()).toBeVisible();
  });

  test('the filters open from the bottom, count what is on and stay in the URL', async ({ page }) => {
    await signIn(page, 'pm@demo.com');
    await page.goto('/dpr');
    await expect(page.locator('.list-card').first()).toBeVisible();
    // The status picker is in the drawer, not on the strip.
    await expect(page.getByRole('combobox', { name: 'Status' })).toBeHidden();
    await page.getByRole('button', { name: /Filters/ }).click();
    const drawer = page.getByRole('dialog', { name: /Filters/ });
    await expect(drawer).toBeVisible();
    await drawer.getByRole('combobox', { name: 'Status' }).click();
    await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: /^Approved$/ }).click();
    await expect(page).toHaveURL(/status=APPROVED/);
    await drawer.getByRole('button', { name: 'Apply' }).click();
    await expect(drawer).toBeHidden();
    await expect(page.getByRole('button', { name: /Filters \(1\)/ })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('button', { name: /Filters \(1\)/ })).toBeVisible();
    await page.getByRole('button', { name: /Filters/ }).click();
    // The drawer's own Clear, not the status picker's clear icon.
    await page.getByRole('dialog', { name: /Filters/ }).locator('.ant-drawer-footer').getByRole('button', { name: 'Clear' }).click();
    await expect(page).not.toHaveURL(/status=/);
    await expect(page.getByRole('button', { name: /^(filter )?Filters$/ })).toBeVisible();
  });

  test("a record's own page keeps its actions at the bottom of the screen", async ({ page }) => {
    await signIn(page, 'pm@demo.com');
    await page.goto('/dpr');
    const href = await page.locator('.list-card a').first().getAttribute('href');
    expect(href).toMatch(/^\/dpr\//);
    await page.goto(href!);
    const bar = page.getByRole('toolbar', { name: 'Record actions' });
    await expect(bar).toBeVisible();
    await expect(bar.getByRole('link', { name: /Back to/ })).toBeVisible();
    const box = await bar.boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(PHONE.height);
    expect(box!.y).toBeGreaterThan(PHONE.height / 2);
    await noPageOverflow(page);
  });

  test('the header fits, with Help in the account menu', async ({ page }) => {
    await signIn(page, 'pm@demo.com');
    const header = page.locator('.ant-layout-header');
    const { scroll, client } = await header.evaluate((h) => ({ scroll: h.scrollWidth, client: h.clientWidth }));
    expect(scroll).toBeLessThanOrEqual(client);
    await noPageOverflow(page);
    await expect(header.getByRole('button', { name: 'Help', exact: true })).toHaveCount(0);
    await header.locator('[data-tour="account"]').click();
    await expect(page.getByRole('menuitem', { name: /Help/ })).toBeVisible();
  });

  test('the finance lists are cards too', async ({ page }) => {
    await signIn(page, 'accounts@demo.com');
    for (const path of ['/payables', '/receivables']) {
      await page.goto(path);
      await expect(page.locator('.list-card, .list-cards-empty').first()).toBeVisible();
      await expect(page.locator('.ant-table')).toHaveCount(0);
      await noPageOverflow(page);
    }
  });
});

test('on a laptop the DPR list fits without sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page, 'pm@demo.com');
  await page.goto('/dpr');
  await expect(page.locator('.ant-table-tbody .ant-table-row').first()).toBeVisible();
  const table = page.locator('.ant-table-content, .ant-table-body').first();
  const { scroll, client } = await table.evaluate((e) => ({ scroll: e.scrollWidth, client: e.clientWidth }));
  expect(scroll).toBeLessThanOrEqual(client);
  // The columns that matter stay; the rest wait for a wider screen or the Columns menu.
  for (const name of ['Date', 'Project', 'Work executed', 'Status']) await expect(page.getByRole('columnheader', { name, exact: true })).toBeVisible();
});

test('payables and receivables are lists with columns, and keep their search over a reload', async ({ page }) => {
  await signIn(page, 'accounts@demo.com');
  for (const [path, label] of [
    ['/payables', 'Search the due list'],
    ['/receivables', 'Search open bills'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('button', { name: /Columns/ }).first()).toBeVisible();
    await page.getByRole('searchbox', { name: label }).or(page.getByRole('textbox', { name: label })).first().fill('zz-none');
    await expect(page).toHaveURL(/[?&]q=zz-none/);
    await page.reload();
    await expect(page.getByRole('searchbox', { name: label }).or(page.getByRole('textbox', { name: label })).first()).toHaveValue('zz-none');
  }
});

test('a tab inside a page stays open over a reload', async ({ page }) => {
  await signIn(page, 'safety@demo.com');
  await page.goto('/safety');
  await page.getByRole('tab', { name: 'Toolbox talks' }).click();
  await expect(page).toHaveURL(/[?&]sub=talks/);
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Toolbox talks' })).toHaveAttribute('aria-selected', 'true');
});

test('the Approvals inbox keeps its search and order in the URL', async ({ page }) => {
  await signIn(page, 'pm@demo.com');
  await page.goto('/approvals');
  await page.getByRole('textbox', { name: 'Search the queue' }).or(page.getByRole('searchbox', { name: 'Search the queue' })).first().fill('DPR');
  await newestFirst(page);
  await expect(page).toHaveURL(/[?&]q=DPR/);
  await expect(page).toHaveURL(/[?&]order=newest/);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Search the queue' }).or(page.getByRole('searchbox', { name: 'Search the queue' })).first()).toHaveValue('DPR');
});
