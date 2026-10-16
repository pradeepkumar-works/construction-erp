import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

/** Relative luminance (0 black to 1 white) of an element's computed background. */
async function backgroundLuminance(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((el) => {
    const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g) ?? ['255', '255', '255'];
    const [r, g, b] = m.slice(0, 3).map(Number);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  });
}

/** Opens the account menu unless it is open already. */
async function openAccountMenu(page: Page) {
  if (!(await page.getByRole('menuitem', { name: 'Sign out' }).isVisible())) await page.locator('[data-tour="account"]').click({ timeout: 1500 });
}

async function pick(page: Page, menu: string, choice: string) {
  const item = page.getByRole('menuitem', { name: choice, exact: true }).or(page.getByRole('menuitem', { name: `check ${choice}`, exact: true }));
  // A submenu opens on hover and can close again before the click lands (the pointer crosses the other submenu, or
  // the page under the menu is still settling), so open, hover and click until the click goes through.
  await expect(async () => {
    await openAccountMenu(page);
    await page.getByRole('menuitem', { name: menu }).hover();
    await item.click({ timeout: 1500 });
  }).toPass();
}

test('dark mode and compact density are chosen from the account menu and kept after a reload', async ({ page }) => {
  await signIn(page, 'pm@demo.com');
  await expect(page.getByText('My work', { exact: true })).toBeVisible();
  expect(await backgroundLuminance(page, '.ant-card')).toBeGreaterThan(0.9);

  await pick(page, 'Appearance', 'Dark');
  await expect.poll(() => backgroundLuminance(page, '.ant-card')).toBeLessThan(0.2);

  await page.goto('/dpr');
  const newDpr = page.getByRole('button', { name: 'New DPR' });
  const comfortable = (await newDpr.boundingBox())?.height ?? 0;
  await pick(page, 'Density', 'Compact');
  await expect.poll(async () => (await newDpr.boundingBox())?.height ?? 0).toBeLessThan(comfortable);

  await page.reload();
  await expect(newDpr).toBeVisible();
  expect((await newDpr.boundingBox())?.height ?? 0).toBeLessThan(comfortable);
  await expect.poll(() => backgroundLuminance(page, '.ant-card')).toBeLessThan(0.2);

  // The sign-in page stays light whatever the signed-in app uses.
  await expect(async () => {
    await openAccountMenu(page);
    await page.getByRole('menuitem', { name: 'Sign out' }).click({ timeout: 1500 });
    await expect(page).toHaveURL(/\/login/, { timeout: 3000 });
  }).toPass();
  expect(await backgroundLuminance(page, '.auth')).toBeGreaterThan(0.9);
});

test('the design reference shows the theme tokens', async ({ page }) => {
  await signIn(page, 'pm@demo.com');
  await page.goto('/design');
  await expect(page.getByRole('heading', { name: 'Design reference' })).toBeVisible();
  await expect(page.locator('[data-token="colorPrimary"]')).toBeVisible();
});
