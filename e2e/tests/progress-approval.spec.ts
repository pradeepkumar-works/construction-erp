import { expect, test } from '@playwright/test';
import { api, apiToken, chooseOption, newestFirst, signIn, uniqueQty } from './helpers';

interface Entry { id: string; quantity: string; status: string; remarks: string | null }

/** The site-to-office loop: a site engineer reports progress, the project manager approves it. */
test.describe.serial('progress entry from submission to approval', () => {
  const qty = uniqueQty();
  const remarks = `e2e progress ${qty}`;

  test('the site engineer submits a progress entry', async ({ page }) => {
    await signIn(page, 'engineer@demo.com');
    await page.goto('/progress');
    await page.getByRole('button', { name: 'New progress entry' }).click();
    const modal = page.locator('.ant-modal').filter({ hasText: 'New progress entry' });
    await chooseOption(modal.getByLabel('Project'), 'RD-2026-01');
    await chooseOption(modal.getByLabel('Activity'));
    await modal.getByLabel(/Quantity executed/).fill(qty);
    await modal.getByLabel('Remarks').fill(remarks);
    await modal.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByText('Progress entry submitted for approval')).toBeVisible();
  });

  test('the project manager approves it from the queue', async ({ page }) => {
    await signIn(page, 'pm@demo.com');
    await page.goto('/approvals');
    await newestFirst(page);
    const row = page.locator('tr').filter({ hasText: `: ${qty} ` });
    await expect(row).toHaveCount(1);
    await row.getByRole('button', { name: 'Review' }).click();
    const drawer = page.locator('.ant-drawer-open');
    await expect(drawer.getByText(remarks)).toBeVisible();
    await drawer.getByRole('button', { name: 'Approve' }).click();
    await page.locator('.ant-modal').getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText('Approved', { exact: true }).first()).toBeVisible();
    await expect(page.locator('tr').filter({ hasText: `: ${qty} ` })).toHaveCount(0);
  });

  test('the entry shows as approved for the engineer', async () => {
    const token = await apiToken('engineer@demo.com');
    const list = await api<{ items: Entry[] }>(token, `/progress?mine=true&pageSize=50&sortBy=date&sortOrder=desc`);
    const mine = list.items.find((e) => e.remarks === remarks);
    expect(mine?.status).toBe('APPROVED');
    expect(Number(mine?.quantity)).toBe(Number(qty));
  });
});
