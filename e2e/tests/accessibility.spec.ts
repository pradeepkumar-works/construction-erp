import { expect, test } from '@playwright/test';
import { axeViolations, setAppearance, signIn } from './helpers';

/**
 * WCAG 2.2 AA (UI roadmap item 65): axe finds nothing on the main pages, in the light and the dark theme. The route walk
 * (`route-walk.spec.ts`, item 89) runs the same check on every sidebar page, at desktop and phone width.
 */
// The sign-in page rises in on load; axe measures colours mid-animation otherwise.
test.use({ contextOptions: { reducedMotion: 'reduce' } });

const PAGES = ['/', '/projects', '/dpr', '/material-requests', '/purchase-orders', '/bills', '/approvals', '/notifications', '/risks', '/vendors', '/watch-list'];

test('the sign-in page passes axe', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
});

test('the product page passes axe, at desktop and phone width', async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/welcome');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Every section's parts in place before axe looks (they rise in as they scroll into view).
    await page.evaluate(() => document.querySelectorAll('.rv').forEach((e) => e.classList.add('in')));
    expect(await axeViolations(page)).toEqual([]);
  }
});

for (const mode of ['light', 'dark'] as const) {
  test(`the main pages pass axe in the ${mode} theme`, async ({ page }) => {
    test.setTimeout(180_000);
    await setAppearance(page, mode);
    await signIn(page, 'pm@demo.com');
    // The pointer stays where Sign in was clicked; off the page's content, it opens no tooltip for axe to measure.
    await page.mouse.move(0, 0);
    const found: string[] = [];
    for (const path of PAGES) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
      found.push(...(await axeViolations(page)).map((v) => `${path} ${v}`));
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

