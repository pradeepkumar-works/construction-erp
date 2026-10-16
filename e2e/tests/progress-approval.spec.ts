import { expect, test } from '@playwright/test';
import { api, apiToken, chooseOption, newestFirst, queueItem, signIn, uniqueQty } from './helpers';

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
    const entry = queueItem(page, `: ${qty} `);
    await expect(entry.item).toHaveCount(1);
    await entry.open();
    await expect(page.getByRole('region', { name: 'Approval queue' }).locator('[aria-current="true"]')).toContainText(`: ${qty} `);
    await expect(page.getByText(remarks)).toBeVisible();
    await entry.decision.getByRole('button', { name: /Approve/ }).click();
    await page.locator('.ant-modal').getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText('Approved', { exact: true }).first()).toBeVisible();
    await expect(entry.item).toHaveCount(0);
  });

  test('the entry shows as approved for the engineer', async () => {
    const token = await apiToken('engineer@demo.com');
    const list = await api<{ items: Entry[] }>(token, `/progress?mine=true&pageSize=50&sortBy=date&sortOrder=desc`);
    const mine = list.items.find((e) => e.remarks === remarks);
    expect(mine?.status).toBe('APPROVED');
    expect(Number(mine?.quantity)).toBe(Number(qty));
  });
});
