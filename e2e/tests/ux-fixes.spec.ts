import { expect, test } from '@playwright/test';
import { api, apiToken, signIn, homeHeading } from './helpers';

/** UX plan item 78: fixes found on the walk through the live site. */

test('the sign-in form starts empty, and a demo account fills it in', async ({ page }) => {
  await page.goto('/login');
  const email = page.getByLabel('Email');
  await expect(email).toHaveValue('');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await expect(email).toHaveAttribute('type', 'email');
  await page.getByRole('group', { name: 'Demo accounts' }).getByRole('button', { name: 'Project Manager' }).click();
  await expect(email).toHaveValue('pm@demo.com');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(homeHeading(page)).toBeVisible();
});

test('a seeded DPR with no audit log still shows when it was submitted', async ({ page }) => {
  const pm = await apiToken('pm@demo.com');
  const dpr = (await api<{ items: { id: string; status: string }[] }>(pm, '/dpr?pageSize=50')).items.find((d) => d.status === 'SUBMITTED');
  test.skip(!dpr, 'no submitted DPR in the demo data');
  await signIn(page, 'pm@demo.com');
  await page.goto(`/dpr/${dpr!.id}`);
  const activity = page.locator('.ant-card').filter({ hasText: 'Activity' }).last();
  await expect(activity).toContainText('Submitted by');
  await expect(activity).not.toContainText('No audit records');
});

test('the approval limit names each type in a sentence, keeping abbreviations', async ({ page }) => {
  await signIn(page, 'pm@demo.com');
  await page.goto('/approvals');
  const limit = page.locator('.ant-alert').filter({ hasText: 'Your approval limit' });
  await expect(limit).toContainText('RA bill up to');
  await expect(limit).not.toContainText('ra bill');
});

test('a long project name stays on one line in the header', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page, 'pm@demo.com');
  await page.goto('/projects');
  await page.locator('main a[href^="/projects/"]').first().click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}/);
  const crumbs = page.locator('header .header-crumbs');
  await expect(crumbs).toBeVisible();
  const box = await crumbs.boundingBox();
  expect(box!.height).toBeLessThanOrEqual(24);
});
