import { expect, test } from '@playwright/test';
import { openProjectTab, projectTabs, signIn } from './helpers';

/** Billing: the client master and a project's contract terms. */
test('the project manager sees the client master and the road contract', async ({ page }) => {
  await signIn(page, 'pm@demo.com');
  await page.goto('/clients');
  await expect(page.getByText('Odisha Works Department', { exact: true })).toBeVisible();
  await expect(page.getByText('21AAAGO1234F1Z5')).toBeVisible();

  await page.goto('/projects');
  await page.getByText('RD-2026-01').first().click();
  await openProjectTab(page, 'Money', 'Contract');
  await expect(page.getByText('04/EE/R&B/2025-26', { exact: false })).toBeVisible();
  await expect(page.getByText('Extensions of time')).toBeVisible();
  await page.getByRole('button', { name: 'Edit contract' }).click();
  const modal = page.locator('.ant-drawer-open').filter({ hasText: 'Contract: RD-2026-01' });
  await expect(modal.getByLabel('Retention %')).toHaveValue('5');
  await modal.getByRole('button', { name: 'Cancel' }).click();
});

test('a site engineer has no Contract tab', async ({ page }) => {
  await signIn(page, 'engineer@demo.com');
  await page.goto('/projects');
  await page.getByText('RD-2026-01').first().click();
  await openProjectTab(page, 'Plan');
  await expect(projectTabs(page, 'Plan').getByText('BOQ', { exact: true })).toBeVisible();
  await openProjectTab(page, 'Money');
  await expect(projectTabs(page, 'Money').getByText('Expenses', { exact: true })).toBeVisible();
  await expect(projectTabs(page, 'Money').getByText('Contract', { exact: true })).toHaveCount(0);
});
