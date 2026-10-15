import { expect, test } from '@playwright/test';
import { API_URL, PASSWORD, apiToken, signIn } from './helpers';

const login = (email: string) =>
  fetch(`${API_URL}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) });

/**
 * Platform admin (v3 item 35). In the e2e run admin@demo.com is staff (PLATFORM_ADMIN_EMAILS). A new company's admin
 * allows support; staff open it read-only from the console, cannot change anything, and the visit is in the company's
 * log. Then staff suspend the company and nobody in it can sign in until the suspension is lifted.
 */
test('staff view a company read-only once its admin allows it, and suspend it', async ({ page, browser }) => {
  const stamp = Date.now();
  const company = `E2E Support ${stamp}`;
  const email = `support-${stamp}@e2e.test`;
  const res = await fetch(`${API_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ organizationName: company, fullName: 'Asha Admin', email, password: PASSWORD }),
  });
  expect(res.ok).toBe(true);

  // Without the company's consent staff cannot open it.
  await signIn(page, 'admin@demo.com');
  await page.goto('/platform');
  await page.getByPlaceholder('Search name or code').fill(company);
  await page.getByText(company).click();
  const drawer = page.locator('.ant-drawer').filter({ hasText: 'Support access' });
  await expect(drawer.getByText('Not allowed')).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Open read-only' })).toBeDisabled();

  // The company's admin allows support from Data & Privacy.
  const owner = await (await browser.newContext()).newPage();
  await signIn(owner, email);
  await owner.goto('/company-data');
  await owner.getByRole('button', { name: /Allow support for 7 days/ }).click();
  await expect(owner.getByText(/Allowed until .* by Asha Admin/)).toBeVisible();

  // Staff open it read-only: a banner says whose data it is, and nothing can be changed.
  await page.reload();
  await page.getByPlaceholder('Search name or code').fill(company);
  await page.getByText(company).click();
  await drawer.getByRole('button', { name: 'Open read-only' }).click();
  await expect(page.getByText(new RegExp(`Viewing ${company} as .* support, read-only`))).toBeVisible();
  const supportToken = await page.evaluate(() => localStorage.getItem('erp_token'));
  const write = await fetch(`${API_URL}/projects`, {
    method: 'POST',
    headers: { authorization: `Bearer ${supportToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Should not exist', code: 'NO-1' }),
  });
  expect(write.status).toBe(403);
  expect((await write.json()).message).toBe('Support access is read-only');
  await page.getByRole('button', { name: 'Exit' }).click();
  await expect(page).toHaveURL(/\/platform$/);

  // The visit is in the company's log.
  await owner.reload();
  await expect(owner.getByRole('cell', { name: 'Support visit' })).toBeVisible();

  // Suspended: nobody in the company can sign in; lifted: they can again.
  await page.getByPlaceholder('Search name or code').fill(company);
  await page.getByText(company).click();
  await drawer.getByRole('button', { name: 'Suspend' }).click();
  const modal = page.locator('.ant-modal').filter({ hasText: `Suspend ${company}` });
  await modal.getByLabel('Reason').fill('Payment overdue (e2e)');
  await modal.getByRole('button', { name: 'Suspend' }).click();
  await expect(page.getByText(`${company} is suspended`)).toBeVisible();
  const refused = await login(email);
  expect(refused.status).toBe(403);
  expect((await refused.json()).message).toMatch(/is suspended/);
  await drawer.getByRole('button', { name: 'Lift suspension' }).click();
  await expect(page.getByText(`${company} can sign in again`)).toBeVisible();
  expect((await login(email)).ok).toBe(true);
});

test('only staff have the console', async ({ page }) => {
  const pm = await apiToken('pm@demo.com');
  const denied = await fetch(`${API_URL}/platform/companies`, { headers: { authorization: `Bearer ${pm}` } });
  expect(denied.status).toBe(403);
  await signIn(page, 'pm@demo.com');
  await expect(page.getByRole('link', { name: /console/ })).toHaveCount(0);
});
