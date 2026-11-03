import { expect, test, type Page } from '@playwright/test';
import { api, apiToken, homeHeading, signIn } from './helpers';

/** Launcher Home: modules as tiles with what waits, Pinned on the account, Recent, and the search box. */

interface Launcher {
  pins: { id: string; label: string }[];
  recent: { label: string; href: string }[];
}

/** The project manager starts each test with nothing pinned (pins live on the account, not the browser). */
async function clearPins(email: string) {
  const token = await apiToken(email);
  const { pins } = await api<Launcher>(token, '/launcher');
  for (const p of pins) await api(token, `/launcher/pins/${p.id}`, { method: 'DELETE' });
  return token;
}

const modules = (page: Page) => page.getByRole('group', { name: 'All modules' });
const pinned = (page: Page) => page.getByRole('group', { name: 'Pinned' });

test('Home shows every department the role can open, with what waits there, and My work leads the sidebar', async ({ page }) => {
  await signIn(page, 'pm@demo.com');
  await expect(page).toHaveTitle('Home · Nirmaan');
  await expect(homeHeading(page)).toBeVisible();
  // The department menu is the standard: Home's tiles are the company's department modules.
  for (const name of ['Project management', 'Quality', 'Purchase management', 'Store and inventory', 'Accounts and finance', 'HR and payroll']) {
    await expect(modules(page).getByRole('link', { name: new RegExp(`^${name}`) })).toBeVisible();
  }
  await expect(modules(page).getByRole('link', { name: /^Purchase management, \d+ waiting$/ })).toBeVisible();

  await modules(page).getByRole('link', { name: /^Purchase management/ }).click();
  await expect(page).toHaveURL(/\/modules\/purchase-management$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Purchase management' })).toBeVisible();

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'My work', exact: true }).click();
  await expect(page).toHaveURL(/\/my-work$/);
  await expect(page.getByRole('heading', { level: 1, name: 'My work' })).toBeVisible();
});

test('a page pinned from its tile is on Home on every browser, can be moved, and Undo brings back an unpin', async ({ page, browser }) => {
  await clearPins('pm@demo.com');
  await signIn(page, 'pm@demo.com');
  await expect(page.getByText('Keep the pages you use every day here')).toBeVisible();

  // Pin Correspondence from its tile's menu, then Daily reports from its page.
  await modules(page).getByRole('button', { name: 'More for Correspondence' }).click();
  await page.getByRole('menuitem', { name: 'Pin to Home' }).click();
  await expect(pinned(page).getByRole('link', { name: /^Correspondence/ })).toBeVisible();
  await page.goto('/dpr');
  await page.getByRole('button', { name: 'Pin to Home' }).click();
  await expect(page.getByRole('button', { name: 'Pin to Home' })).toHaveAttribute('aria-pressed', 'true');

  // Another browser signed in as the same person has them too, in the same order.
  const other = await browser.newPage();
  await signIn(other, 'pm@demo.com');
  await expect(pinned(other).getByRole('link')).toHaveText([/^Correspondence/, /^Daily reports/]);
  await other.close();

  // Move Daily reports first, with the keyboard way.
  await page.goto('/');
  await page.getByRole('button', { name: 'Edit pins' }).click();
  await page.getByRole('button', { name: 'Move Daily reports left' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(pinned(page).getByRole('link')).toHaveText([/^Daily reports/, /^Correspondence/]);
  await page.reload();
  await expect(pinned(page).getByRole('link')).toHaveText([/^Daily reports/, /^Correspondence/]);

  // Unpin from the menu; Undo puts it back where it was.
  await pinned(page).getByRole('button', { name: 'More for Daily reports' }).click();
  await page.getByRole('menuitem', { name: 'Unpin' }).click();
  await expect(pinned(page).getByRole('link')).toHaveText([/^Correspondence/]);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(pinned(page).getByRole('link')).toHaveText([/^Daily reports/, /^Correspondence/]);
  await clearPins('pm@demo.com');
});

test('Recent shows the pages opened last, and the search box finds pages by their words', async ({ page }) => {
  await signIn(page, 'pm@demo.com');
  await page.goto('/purchase-orders');
  await expect(page.getByRole('heading', { level: 1, name: 'Purchase orders' })).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Recent' }).getByRole('link').first()).toContainText('Purchase orders');

  const search = page.getByLabel('Search modules and pages');
  await search.fill('cement');
  await expect(page.getByRole('group', { name: 'Pages matching cement' }).getByRole('link', { name: /^Stock on hand/ })).toBeVisible();
  await search.fill('zzqx');
  await expect(page.getByText('No page is called “zzqx”')).toBeVisible();
  await page.getByRole('button', { name: 'Search records for “zzqx”' }).click();
  await expect(page.getByRole('combobox', { name: /Search/ })).toHaveValue('zzqx');
});

test('Home draws its modules within a second', async ({ page }) => {
  await signIn(page, 'pm@demo.com');
  // Time a return to Home, not the runner's first fetch of its code: the visit after signing in loads every part of the
  // page once, so the timed load below measures Home itself. The budget stays one second.
  await expect(modules(page).getByRole('link').first()).toBeVisible();
  await page.addInitScript(() => {
    const w = window as unknown as { __tiles?: number };
    new MutationObserver((_m, obs) => {
      if (document.querySelector('[aria-label="All modules"] a')) {
        w.__tiles = performance.now();
        obs.disconnect();
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto('/');
  await expect(modules(page).getByRole('link').first()).toBeVisible();
  const at = await page.evaluate(() => (window as unknown as { __tiles?: number }).__tiles ?? Infinity);
  expect(at, 'ms from navigation to the first module tile').toBeLessThan(1000);
});
