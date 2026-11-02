import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

/** Views that fit the data: a pipeline opens on its board, each stage headed by its count, and the view chosen stays in the address. */

const board = (page: Page) => page.getByRole('region', { name: 'Tenders by stage' });
const viewItem = (page: Page, name: 'Board' | 'Table') => page.locator('.ant-segmented-item').filter({ hasText: name });

test('tenders open on the board of stages, switch to the table and back, and the choice survives a reload', async ({ page }) => {
  await signIn(page, 'md@demo.com');
  await page.goto('/tenders');
  await expect(page.getByRole('heading', { level: 1, name: 'Tenders' })).toBeVisible();
  for (const stage of ['Preparing', 'Submitted', 'Bids opened', 'Won', 'Lost'])
    await expect(board(page).getByRole('region', { name: new RegExp(`^${stage}, \\d+ tenders?\\b`) }), `${stage} column with its count`).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Board' })).toBeChecked();

  await viewItem(page, 'Table').click();
  await expect(page).toHaveURL(/\/tenders\?view=table$/);
  await expect(page.locator('.ant-table')).toBeVisible();
  await expect(board(page)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Table' })).toBeChecked();
  await expect(page.locator('.ant-table')).toBeVisible();
  await expect(board(page)).toHaveCount(0);

  await viewItem(page, 'Board').click();
  await expect(page).toHaveURL(/\/tenders$/);
  await expect(board(page)).toBeVisible();
  await page.reload();
  await expect(board(page)).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Board' })).toBeChecked();
});
