import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

/**
 * WCAG 2.2 AA (UI roadmap item 65): axe finds nothing on the main pages, in the light and the dark theme.
 * Excluded: antd's zero-height table measure row (aria-hidden, never shown) and the tab bar's own overflow menu,
 * both inside antd and not ours to change.
 */
// The sign-in page rises in on load; axe measures colours mid-animation otherwise.
test.use({ contextOptions: { reducedMotion: 'reduce' } });

const PAGES = ['/', '/projects', '/dpr', '/material-requests', '/purchase-orders', '/bills', '/approvals', '/notifications', '/risks', '/vendors'];

async function violations(page: Page) {
  // Colours are measured once nothing is fading or sliding in (looping ones, such as a spinner, never finish).
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity));
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .exclude('.ant-table-measure-row')
    .exclude('.ant-tabs-nav-operations')
    .analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`);
}

test('the sign-in page passes axe', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

for (const mode of ['light', 'dark'] as const) {
  test(`the main pages pass axe in the ${mode} theme`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.addInitScript((m) => window.localStorage.setItem('nirmaan.appearance', JSON.stringify({ mode: m, density: 'comfortable' })), mode);
    await signIn(page, 'pm@demo.com');
    const found: string[] = [];
    for (const path of PAGES) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
      found.push(...(await violations(page)).map((v) => `${path} ${v}`));
    }
    expect(found).toEqual([]);
  });
}

test('Tab first reaches Skip to content, which moves focus to the page', async ({ page }) => {
  await signIn(page, 'pm@demo.com');
  await page.goto('/projects');
  await page.waitForLoadState('networkidle');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
});

