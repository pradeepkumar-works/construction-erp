import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('a project manager signs in and sees the dashboard', async ({ page }) => {
  await signIn(page, 'pm@demo.com');
  await expect(page.getByText('Active Projects')).toBeVisible();
  await expect(page.getByText('NIRMAAN').first()).toBeVisible();
});

test('a wrong password is refused with a message', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('pm@demo.com');
  await page.getByLabel('Password', { exact: true }).fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('.ant-alert-error')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test('a signed-out visitor is sent to the login page', async ({ page }) => {
  await page.goto('/approvals');
  await expect(page).toHaveURL(/\/login/);
});

test('the product page is open to visitors and leads to the demo', async ({ page }) => {
  await page.goto('/welcome');
  await expect(page.getByRole('heading', { name: 'Site to office, the same day.' })).toBeVisible();
  await page.getByRole('button', { name: 'Try the demo' }).first().click();
  await expect(page).toHaveURL(/\/login/);
});
