import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { PRODUCT_NAME, api, apiToken, axeViolations, measureTargets, pageOverflow, projectTabKeys, setAppearance, settle } from './helpers';
import { SCREENS_DIR, WALK_ROLES, WALK_VIEWS, navHrefs, routesFile, stateFile, type WalkRole, type WalkView } from './route-walk';

/**
 * The route walk (UX item 89): every page in the sidebar, for each role whose sidebar differs, at 1440×900 and 390×844
 * (a touch screen) in the light and the dark theme, plus every tab of a project page for the project manager.
 *
 * The pages come from the app itself: one test per link in nav.ts and per tab key in the project page's source, and
 * `route-walk.setup.ts` (one sign-in per role) saves the links each role's sidebar draws, so a role's test for a page
 * it cannot open is skipped. A new module is walked without editing this file. On each page:
 * - axe finds nothing at WCAG 2.2 AA (every view);
 * - one `<h1>`, and a tab title of its own, not just the product name (1440, light);
 * - controls at least 24 px, 44 px on the touch screen, and no text under 12 px (`measureTargets`; light views, as
 *   sizes do not change with the theme);
 * - no sideways scroll at 390 px (light);
 * - a full-page screenshot for reviewers (every view) in `route-walk/screens/<role>/<view>/`. Nothing is compared
 *   against a baseline (docs/TESTING.md says why).
 * Each test lists every finding on its page, so one run shows them all.
 */
test.describe.configure({ mode: 'parallel' });

const slug = (name: string) => (name === '/' ? 'home' : name.replace(/^\//, '').replace(/[^\w-]+/g, '_'));

const sidebars = new Map<string, string[]>();
/** The links this role's sidebar draws (saved by the setup). */
function sidebarOf(role: WalkRole): string[] {
  if (!sidebars.has(role.key)) sidebars.set(role.key, JSON.parse(fs.readFileSync(routesFile(role), 'utf8')) as string[]);
  return sidebars.get(role.key)!;
}

let projectId: string | undefined;
/** The project manager's first project, for its tabs. */
async function firstProject(role: WalkRole): Promise<string> {
  if (!projectId) projectId = (await api<{ items: { id: string }[] }>(await apiToken(role.email), '/projects?pageSize=1')).items[0]?.id;
  expect(projectId, `${role.email} has no project`).toBeTruthy();
  return projectId!;
}

/** One page in one view: what it breaks, as lines of "page check: detail". */
async function walkPage(page: Page, url: string, name: string, role: WalkRole, view: WalkView): Promise<string[]> {
  const found: string[] = [];
  const at = (what: string) => `${name} ${what}`;
  try {
    await settle(page, url);
  } catch {
    const h1 = await page.locator('h1').count();
    return [at(h1 ? 'never finished loading (a skeleton, spinner or aria-busy region stayed)' : 'has no <h1> (or never finished loading)')];
  }

  if (view.key === '1440-light') {
    const h1 = await page.locator('h1').count();
    if (h1 !== 1) found.push(at(`has ${h1} <h1> elements`));
    // The title is set once the page knows its name (a record's, say), so give it the usual wait.
    const named = await expect(page).not.toHaveTitle(new RegExp(`^\\s*(${PRODUCT_NAME})?\\s*$`)).then(() => true, () => false);
    if (!named) found.push(at(`tab title is "${(await page.title()).trim()}", not the page's own`));
  }

  found.push(...(await axeViolations(page)).map((v) => at(`axe ${v}`)));

  if (view.mode === 'light') {
    const min = view.touch ? 44 : 24;
    const { targets, text } = await page.evaluate(measureTargets, min);
    found.push(...targets.map((t) => at(`target under ${min} px: ${t.what} ${t.size}`)), ...text.map((t) => at(`text under 12 px: ${t.what} ${t.size}`)));
    if (view.viewport.width <= 390) {
      const over = await pageOverflow(page);
      if (over > 0) found.push(at(`scrolls sideways by ${over} px at ${view.viewport.width} px`));
    }
  }

  const file = path.join(SCREENS_DIR, role.key, view.key, `${slug(name)}.jpg`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage: true, animations: 'disabled', type: 'jpeg', quality: 80 });
  return found;
}

for (const role of WALK_ROLES) {
  for (const view of WALK_VIEWS) {
    test.describe(`${role.key} at ${view.key}`, () => {
      test.use({ storageState: stateFile(role), viewport: view.viewport, hasTouch: view.touch, contextOptions: { reducedMotion: 'reduce' } });

      for (const route of navHrefs()) {
        test(route, async ({ page }) => {
          test.skip(!sidebarOf(role).includes(route), `not in ${role.email}'s sidebar`);
          await setAppearance(page, view.mode);
          expect(await walkPage(page, route, route, role, view)).toEqual([]);
        });
      }

      if (role.key !== 'pm') return;
      for (const key of projectTabKeys()) {
        const name = `/projects/:id?tab=${key}`;
        test(name, async ({ page }) => {
          await setAppearance(page, view.mode);
          const id = await firstProject(role);
          const found = await walkPage(page, key === 'overview' ? `/projects/${id}` : `/projects/${id}?tab=${key}`, name, role, view);
          // A tab the role may not open falls back to the overview: note it rather than pass the overview off as the tab.
          if (key !== 'overview' && (await page.getByRole('tabpanel').first().getAttribute('aria-label')) === 'Overview') {
            test.info().annotations.push({ type: 'not offered', description: `?tab=${key} to ${role.email}` });
          }
          expect(found).toEqual([]);
        });
      }
    });
  }
}

test('every sidebar link is walked by at least one role', async () => {
  const walked = new Set(WALK_ROLES.flatMap(sidebarOf));
  const missed = navHrefs().filter((href) => !walked.has(href));
  expect(missed, 'no role in WALK_ROLES (route-walk.ts) sees these nav.ts links; add one that does').toEqual([]);
});
