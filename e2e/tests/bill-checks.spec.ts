import { expect, test } from '@playwright/test';
import { api, apiToken, queueItem, signIn } from './helpers';

/**
 * Bill checks before approval (AI item 69) on the demo company's seeded anomalies: a second copy of the road supplier's
 * invoice, an expense paid in cash above ₹10,000, and a clean approved bill. CI runs the API with AI_PROVIDER=fake, whose
 * summary line is the rules' own draft.
 */

type Page<T> = { items: T[] };
const checks = (page: import('@playwright/test').Page) => page.locator('.bill-checks');

async function idOf(path: string, q: string) {
  const token = await apiToken('md@demo.com');
  return (await api<Page<{ id: string }>>(token, `${path}?q=${encodeURIComponent(q)}`)).items[0].id;
}

test('a vendor bill shows what is wrong, and an approver accepts a flag with a note and reopens it', async ({ page }) => {
  const id = await idOf('/vendor-bills', 'KBA-26-27-0213');
  await signIn(page, 'md@demo.com');
  await page.goto(`/vendor-bills/${id}`);
  const box = checks(page);
  await expect(box.getByRole('alert')).toContainText('things to look at');
  const duplicate = box.locator('.bill-check-flag').filter({ hasText: 'Invoice KBA-26-27-0213 already billed on VB-' });
  await expect(duplicate).toBeVisible();
  await expect(box.locator('.bill-check-flag').filter({ hasText: 'is already billed on VB-' }).first()).toBeVisible();
  await expect(box.getByRole('list', { name: 'Checks passed' })).toContainText('Rates within the PO');

  await duplicate.getByRole('button', { name: 'Accept' }).click();
  const modal = page.getByRole('dialog', { name: 'Accept this flag' });
  await modal.getByLabel('Why it is all right').fill('Checked with the vendor: copy sent by post, to be rejected');
  await modal.getByRole('button', { name: 'Accept flag' }).click();
  await expect(duplicate).toContainText('Accepted by');
  await expect(duplicate).toContainText('copy sent by post');

  await duplicate.getByRole('button', { name: 'Reopen' }).click();
  await expect(duplicate.getByRole('button', { name: 'Accept' })).toBeVisible();
  await expect(duplicate).not.toContainText('Accepted by');
});

test('the approvals inbox shows the checks beside the entry', async ({ page }) => {
  await signIn(page, 'md@demo.com');
  await page.goto('/approvals');
  await queueItem(page, 'KBA-26-27-0213').open();
  await expect(checks(page).locator('.bill-check-flag').filter({ hasText: 'already billed on VB-' }).first()).toBeVisible();
});

test('an expense paid in cash above the limit is flagged; someone who cannot approve it gets no Accept', async ({ page }) => {
  const id = await idOf('/expenses', 'JCB hire for trench backfilling');
  await signIn(page, 'engineer@demo.com');
  await page.goto(`/expenses/${id}`);
  const flag = checks(page).locator('.bill-check-flag').filter({ hasText: '₹14,500 paid in cash, above the ₹10,000 limit' });
  await expect(flag).toBeVisible();
  await expect(flag).toContainText('section 40A(3)');
  await expect(flag.getByRole('button', { name: 'Accept' })).toHaveCount(0);
});

test('a clean approved bill shows only ticks', async ({ page }) => {
  const id = await idOf('/vendor-bills', 'KBA/26-27/0213');
  await signIn(page, 'md@demo.com');
  await page.goto(`/vendor-bills/${id}`);
  await expect(checks(page).getByRole('alert')).toContainText(/All \d+ checks pass/);
  await expect(checks(page).locator('.bill-check-flag')).toHaveCount(0);
});
