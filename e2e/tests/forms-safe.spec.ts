import { expect, test } from '@playwright/test';
import { api, apiToken, chooseOption, formPanel, openProjectTab, signIn } from './helpers';

/**
 * Forms that never lose work (UX item 79): errors that say how to fix them, amounts in Indian grouping, Back that closes
 * an edit only after asking, and a new DPR that starts from the previous one's gang and machines, said so.
 */

type Project = { id: string; code: string };

test('an empty submit says how to fix each field, and an amount reads in lakhs', async ({ page }) => {
  const md = await apiToken('md@demo.com');
  const road = (await api<{ items: Project[] }>(md, '/projects?pageSize=100')).items.find((p) => p.code === 'RD-2026-01')!;
  await signIn(page, 'md@demo.com');
  await page.goto(`/projects/${road.id}`);
  await openProjectTab(page, 'Plan', 'BOQ');
  await page.getByRole('button', { name: 'New BOQ item' }).click();
  const form = formPanel(page, 'New BOQ item');
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  const summary = form.locator('.ant-alert-error');
  await expect(summary.getByRole('link', { name: 'Item no.' })).toBeVisible();
  await expect(summary).toContainText('Enter the item number');

  await form.getByLabel('Rate').fill('1234567.5');
  await form.getByLabel('Description').click();
  await expect(form.getByLabel('Rate')).toHaveValue('12,34,567.5');

  // Nothing saved yet, so leaving asks before throwing it away.
  await form.getByRole('button', { name: 'Cancel' }).click();
  const confirm = page.locator('.ant-modal-confirm').filter({ hasText: 'Discard your changes?' });
  await confirm.getByRole('button', { name: 'Discard changes' }).click();
  await expect(form).toBeHidden();
});

test('Back closes an edited form only after asking, and stays on the page', async ({ page }) => {
  const md = await apiToken('md@demo.com');
  const road = (await api<{ items: Project[] }>(md, '/projects?pageSize=100')).items.find((p) => p.code === 'RD-2026-01')!;
  await signIn(page, 'md@demo.com');
  await page.goto(`/projects/${road.id}`);
  await openProjectTab(page, 'Plan', 'BOQ');
  const url = page.url();
  await page.getByRole('button', { name: /^Edit BOQ item / }).first().click();
  const form = formPanel(page, /^Edit BOQ item /);
  const description = form.getByLabel('Description');
  const before = await description.inputValue();
  await description.fill(`${before} (checked)`);

  await page.evaluate(() => window.history.back());
  const confirm = page.locator('.ant-modal-confirm').filter({ hasText: 'Discard your changes?' });
  await confirm.getByRole('button', { name: 'Keep editing' }).click();
  await expect(confirm).toHaveCount(0);
  await expect(description).toHaveValue(`${before} (checked)`);

  await page.evaluate(() => window.history.back());
  await confirm.getByRole('button', { name: 'Discard changes' }).click();
  await expect(form).toBeHidden();
  expect(page.url()).toBe(url);
});

test('a new DPR starts from the previous report\'s gang and machines, and Clear empties them', async ({ page }) => {
  await signIn(page, 'engineer@demo.com');
  await page.goto('/dpr');
  await page.getByRole('button', { name: /New daily report/ }).click();
  const form = formPanel(page, 'New daily report');
  const project = form.getByLabel('Project');
  if (await project.isVisible()) {
    if (!(await form.locator('.ant-select-selection-item').first().isVisible())) await chooseOption(project);
  }
  const copied = form.getByText(/^Copied from the DPR of /);
  await expect(copied).toBeVisible();
  await form.getByText('Clear', { exact: true }).click();
  await expect(copied).toBeHidden();
  await expect(form.getByRole('button', { name: /^Remove Machinery line/ })).toHaveCount(0);
  await form.getByRole('button', { name: 'Cancel' }).click();
  const close = page.locator('.ant-modal-confirm').filter({ hasText: 'Close this form?' });
  if (await close.isVisible()) await close.getByRole('button', { name: 'Close' }).click();
});
