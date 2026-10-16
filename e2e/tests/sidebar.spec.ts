import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('quick-jump opens a page or a project from the keyboard', async ({ page }) => {
  await signIn(page, 'pm@demo.com');
  await page.keyboard.press('Control+k');
  const search = page.getByRole('combobox', { name: 'Search pages and projects' });
  await expect(search).toBeFocused();
  await search.fill('mb');
  await expect(page.getByRole('option').first()).toContainText('Measurement Book');
  await search.press('Enter');
  await expect(page).toHaveURL(/\/measurements$/);

  await page.getByRole('button', { name: /Search or jump to/ }).click();
  await search.fill('puri');
  await expect(page.getByRole('option').first()).toBeVisible();
  await search.press('Enter');
  await expect(page).toHaveURL(/\/projects\/[\w-]+$/);
});

test('sections fold and stay folded, and the rail opens a section beside it', async ({ page }) => {
  await signIn(page, 'pm@demo.com');
  const site = page.getByRole('button', { name: 'Site', exact: true });
  await expect(site).toHaveAttribute('aria-expanded', 'true');
  await site.click();
  await expect(site).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('link', { name: 'Daily Reports', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Site', exact: true })).toHaveAttribute('aria-expanded', 'false');

  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await page.getByRole('button', { name: 'Site', exact: true }).click();
  await page.getByRole('link', { name: 'Quality' }).click();
  await expect(page).toHaveURL(/\/inspections$/);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
});
