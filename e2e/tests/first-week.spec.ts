import { expect, test } from '@playwright/test';
import { api, apiToken, PASSWORD } from './helpers';

/** A new company signs up and gets the first-week checklist; creating a project ticks the first step. Needs ORG_SIGNUP=open on the API. */
test('a new company sees its first-week checklist, and it follows what they do', async ({ page }) => {
  const stamp = Date.now();
  const email = `owner-${stamp}@e2e.test`;
  await page.goto('/signup');
  await page.getByLabel('Company name').fill(`E2E Builders ${stamp}`);
  await page.getByLabel('Your name').fill('Asha Owner');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirm password').fill(PASSWORD);
  await page.getByRole('button', { name: /Create/ }).click();
  await expect(page).toHaveURL(/\/users/);

  await page.goto('/');
  const card = page.locator('.ant-card').filter({ hasText: 'Your first week on Nirmaan' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Day 1 of 7');
  await expect(card).toContainText('0 of 8 done');
  await expect(card.getByRole('link', { name: 'Projects' })).toBeVisible();

  // Make a project through the API (the project form is not what this test is about), then reload.
  const token = await apiToken(email);
  await api(token, '/projects', { method: 'POST', body: { code: 'E2E-01', name: 'E2E first project', type: 'BUILDING', startDate: new Date().toISOString().slice(0, 10) } });
  await page.reload();
  await expect(card).toContainText('1 of 8 done');

  // Hiding it keeps it hidden on this browser.
  await card.getByRole('button', { name: 'Hide the setup checklist' }).click();
  await expect(card).toBeHidden();
  await page.reload();
  await expect(page.getByText(/^Welcome, /)).toBeVisible();
  await expect(card).toBeHidden();
});
