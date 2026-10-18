import { expect, test } from '@playwright/test';
import { measureTargets, setAppearance, settle, signIn } from './helpers';

/**
 * Targets and type (UX item 82), in comfortable and compact density: every control at least 24 px (or spaced as WCAG
 * 2.5.8 allows) and no text below 12 px, as `measureTargets` in helpers.ts defines them. The route walk (item 89) runs
 * the same check on every sidebar page, at 44 px on a touch screen.
 */
test.use({ contextOptions: { reducedMotion: 'reduce' } });

const PAGES = ['/', '/dpr', '/bills', '/projects'];

for (const density of ['comfortable', 'compact'] as const) {
  test(`controls are at least 24 px and text at least 12 px, ${density}`, async ({ page }) => {
    test.setTimeout(180_000);
    await setAppearance(page, 'light', density);
    await signIn(page, 'pm@demo.com');

    await settle(page, '/projects');
    const project = await page.locator('.ant-table-tbody a[href^="/projects/"]').first().getAttribute('href');
    expect(project).toBeTruthy();

    const found: string[] = [];
    for (const path of [...PAGES, project!]) {
      await settle(page, path);
      const { targets, text } = await page.evaluate(measureTargets, 24);
      found.push(...targets.map((t) => `${path} target ${t.what} ${t.size}`), ...text.map((t) => `${path} text ${t.what} ${t.size}`));
    }
    expect(found).toEqual([]);
  });
}
