import { expect, test } from '@playwright/test';
import { homeHeading, signIn } from './helpers';

test('a project manager signs in and lands on Home', async ({ page }) => {
  await signIn(page, 'pm@demo.com');
  await expect(homeHeading(page)).toBeVisible();
  await expect(page.getByRole('group', { name: 'All modules' }).getByRole('link', { name: /^My work/ })).toBeVisible();
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
  await expect(page.getByRole('heading', { level: 1, name: 'The ERP that reads your sites' })).toBeVisible();
  await page.getByRole('link', { name: 'Try the demo' }).first().click();
  await expect(page).toHaveURL(/\/login/);
});

test('a signed-out visit to the bare domain shows the product page, and its module tabs switch', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/welcome/);
  await expect(page.getByRole('heading', { name: 'Everything a site sends to the office' })).toBeVisible();
  await page.getByRole('tab', { name: 'Get paid' }).click();
  await expect(page.getByRole('heading', { name: 'RA bills straight from the measurement book' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Everything a site sends to the office' })).toBeHidden();
});

test("the product page works out a running bill on the demo highway's terms", async ({ page }) => {
  await page.goto('/welcome');
  const value = page.getByLabel('Value of work measured, in rupees');
  const pays = page.locator('#money .lw-figure-number');
  // 25 lakh plus 18% GST, less 20% in retention, advance, TDS, GST TDS and cess.
  await value.fill('25 lakh');
  await expect(pays).toContainText('24,50,000');
  await value.fill('1.2 cr');
  await expect(pays).toContainText('1,17,60,000');
  await value.fill('next week');
  await expect(page.getByText('Type a value of work, such as 6,36,400 or 25 lakh, to see the bill.')).toBeVisible();
});

test('the product page answers from the demo and opens the demo as the chosen person', async ({ page }) => {
  await page.goto('/welcome');
  await page.getByRole('button', { name: 'Which delay notices are due?' }).click();
  await expect(page.getByText('RISK-2026-0008', { exact: false }).first()).toBeVisible();
  await page.getByLabel('Demo account').selectOption('qs');
  await page.getByRole('button', { name: 'Open the demo today' }).click();
  await expect(page).toHaveURL(/\/login\?demo=qs/);
});
