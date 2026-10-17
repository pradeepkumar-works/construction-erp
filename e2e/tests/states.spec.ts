import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

/** Empty, missing and forbidden states (UI roadmap item 64). */
test.describe('page states', () => {
  test('an unknown address gets a 404 page with a way home', async ({ page }) => {
    await signIn(page, 'pm@demo.com');
    await page.goto('/no-such-page');
    await expect(page.getByText("This page doesn't exist")).toBeVisible();
    await page.getByRole('link', { name: 'Go to home' }).click();
    await expect(page).not.toHaveURL(/no-such-page/);
  });

  test('a record that is not there, and a page the role may not open, say so', async ({ page }) => {
    await signIn(page, 'engineer@demo.com');
    await page.goto('/purchase-orders/00000000-0000-4000-8000-000000000000');
    await expect(page.getByText('Not found', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Go to home' })).toBeVisible();
    await page.goto('/receivables');
    await expect(page.getByText("You don't have access to this").first()).toBeVisible();
  });

  test('a list filtered to nothing offers Clear filters', async ({ page }) => {
    await signIn(page, 'pm@demo.com');
    await page.goto('/risks?q=zz-nothing-matches-this');
    const clear = page.getByRole('button', { name: 'Clear filters' });
    await expect(clear).toBeVisible();
    await clear.click();
    await expect(page).not.toHaveURL(/zz-nothing/);
  });
});
