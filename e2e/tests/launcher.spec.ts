import { expect, test, type Page } from '@playwright/test';
import { api, apiToken, homeHeading, signIn } from './helpers';

/** Launcher Home (phase 2): modules as tiles with what waits, Pinned on the account, Recent, and the search box. */

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

test('Home shows every module the role can open, with what waits, and My work is one of them', async ({ page }) => {
  const token = await apiToken('pm@demo.com');
  const pending = await api<unknown[]>(token, '/approvals/pending');
  await signIn(page, 'pm@demo.com');
  await expect(page).toHaveTitle('Home · Nirmaan');
  await expect(homeHeading(page)).toBeVisible();
  for (const name of ['My work', 'Projects', 'Site', 'Materials', 'Purchases']) await expect(modules(page).getByRole('link', { name: new RegExp(`^${name}`) })).toBeVisible();
  if (pending.length) await expect(modules(page).getByRole('link', { name: `Approvals, ${pending.length} waiting` })).toBeVisible();

  await modules(page).getByRole('link', { name: /^My work/ }).click();
  await expect(page).toHaveURL(/\/my-work$/);
  await expect(page.getByRole('heading', { level: 1, name: 'My work' })).toBeVisible();
});

test('a page pinned from its tile is on Home on every browser, can be moved, and Undo brings back an unpin', async ({ page, browser }) => {
  await clearPins('pm@demo.com');
  await signIn(page, 'pm@demo.com');
  await expect(page.getByText('Keep the pages you use every day here')).toBeVisible();

  // Pin Site from its tile's menu, then Daily reports from its page.
  await modules(page).getByRole('button', { name: 'More for Site' }).click();
  await page.getByRole('menuitem', { name: 'Pin to Home' }).click();
  await expect(pinned(page).getByRole('link', { name: /^Site/ })).toBeVisible();
  await page.goto('/dpr');
  await page.getByRole('button', { name: 'Pin to Home' }).click();
  await expect(page.getByRole('button', { name: 'Pin to Home' })).toHaveAttribute('aria-pressed', 'true');

  // Another browser signed in as the same person has them too, in the same order.
  const other = await browser.newPage();
  await signIn(other, 'pm@demo.com');
  await expect(pinned(other).getByRole('link')).toHaveText([/^Site/, /^Daily reports/]);
  await other.close();

  // Move Daily reports first, with the keyboard way.
  await page.goto('/');
  await page.getByRole('button', { name: 'Edit pins' }).click();
  await page.getByRole('button', { name: 'Move Daily reports left' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(pinned(page).getByRole('link')).toHaveText([/^Daily reports/, /^Site/]);
  await page.reload();
  await expect(pinned(page).getByRole('link')).toHaveText([/^Daily reports/, /^Site/]);

  // Unpin from the menu; Undo puts it back where it was.
  await pinned(page).getByRole('button', { name: 'More for Daily reports' }).click();
  await page.getByRole('menuitem', { name: 'Unpin' }).click();
  await expect(pinned(page).getByRole('link')).toHaveText([/^Site/]);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(pinned(page).getByRole('link')).toHaveText([/^Daily reports/, /^Site/]);
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
