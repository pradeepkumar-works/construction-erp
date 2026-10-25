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
  await expect(page.getByRole('heading', { level: 1, name: 'From site to Tally.' })).toBeVisible();
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
  const value = page.getByLabel('Value of work measured this bill, in rupees');
  const pays = page.getByRole('row', { name: /The client pays/ });
  // The day's WMM: 6,36,400 plus 18% GST, less 20% in retention, advance, TDS, GST TDS and cess.
  await expect(pays).toContainText('6,23,672');
  await value.fill('25 lakh');
  await expect(pays).toContainText('24,50,000');
  await page.getByRole('button', { name: /GSB laying/ }).click();
  await expect(value).toHaveValue('6,46,800');
  await value.fill('next week');
  await expect(page.getByText('Type a value of work, such as 6,36,400 or 25 lakh, to see the bill.')).toBeVisible();
});
