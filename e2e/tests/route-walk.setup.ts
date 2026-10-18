import fs from 'node:fs';
import path from 'node:path';
import { expect, test as setup } from '@playwright/test';
import { PASSWORD } from './helpers';
import { WALK_ROLES, navHrefs, routesFile, stateFile } from './route-walk';

/**
 * The route walk's one sign-in per role (item 89): each role signs in once, its session is saved for the walk's
 * browsers, and the links its sidebar shows are written down, so the walk visits what that role can open.
 */
setup.use({ viewport: { width: 1440, height: 900 } });

for (const role of WALK_ROLES) {
  setup(`sign in as ${role.email}`, async ({ page }) => {
    fs.mkdirSync(path.dirname(routesFile(role)), { recursive: true });
    await page.goto('/login');
    await page.getByLabel('Email').fill(role.email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link').first()).toBeVisible();

    // Every section open (a fresh browser starts so), then the links the sidebar draws, in its order. Favourites and
    // Recent link to pages already in the sidebar; only links that nav.ts defines are walked.
    const known = new Set(navHrefs());
    const shown = await nav.locator('a[href]').evaluateAll((links) => links.map((a) => a.getAttribute('href') ?? ''));
    const routes = [...new Set(shown)].filter((href) => known.has(href));
    expect(routes.length, `${role.email} sees no sidebar links from nav.ts`).toBeGreaterThan(0);
    fs.writeFileSync(routesFile(role), JSON.stringify(routes, null, 2));
    await page.context().storageState({ path: stateFile(role) });
  });
}
