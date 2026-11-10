import fs from 'node:fs';
import path from 'node:path';
import { expect, test as setup } from '@playwright/test';
import { PASSWORD, enterCompany } from './helpers';
import { WALK_ROLES, navHrefs, routesFile, stateFile } from './route-walk';

/**
 * The route walk's one sign-in per role: each role signs in once, its session is saved for the walk's
 * browsers, and the links its sidebar shows are written down, so the walk visits what that role can open.
 */
setup.use({ viewport: { width: 1440, height: 900 } });

for (const role of WALK_ROLES) {
  setup(`sign in as ${role.email}${role.company ? ` in ${role.company}` : ''}`, async ({ page }) => {
    fs.mkdirSync(path.dirname(routesFile(role)), { recursive: true });
    await page.goto('/login');
    await page.getByLabel('Email').fill(role.email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link').first()).toBeVisible();
    if (role.company) {
      await enterCompany(page, role.email, role.company);
      await expect(nav.getByRole('link').first()).toBeVisible();
    }

    // Every section open (a fresh browser starts so), then the links the sidebar draws, in its order. Favourites and
    // Recent link to pages already in the sidebar; only links the navigation tree (or nav.ts, for guests) defines are walked.
    // The sidebar fills in as the company's menu and the person's group load: read it once it holds still.
    let count = -1;
    await expect.poll(async () => count === (count = await nav.locator('a[href]').count()), { intervals: [500] }).toBe(true);
    const known = new Set(navHrefs());
    const shown = await nav.locator('a[href]').evaluateAll((links) => links.map((a) => a.getAttribute('href') ?? ''));
    const before = role.company ? new Set(WALK_ROLES.slice(0, WALK_ROLES.indexOf(role)).flatMap((r) => JSON.parse(fs.readFileSync(routesFile(r), 'utf8')) as string[])) : new Set<string>();
    const routes = [...new Set(shown)].filter((href) => known.has(href) && !before.has(href));
    expect(routes.length, `${role.email} sees no sidebar links from the navigation tree`).toBeGreaterThan(0);
    fs.writeFileSync(routesFile(role), JSON.stringify(routes, null, 2));
    await page.context().storageState({ path: stateFile(role) });
  });
}

