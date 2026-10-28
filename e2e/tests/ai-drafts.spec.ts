import { expect, test, type Page } from '@playwright/test';
import { api, apiToken, formPanel, signIn } from './helpers';

/**
 * Drafts from a sentence (AI item 71). The API runs with AI_PROVIDER=fake, which picks the draft tool and its inputs
 * from the sentence by pattern; the real tools then match the demo company's items, activities and projects. The
 * draft opens in the list's own form, filled in, with what to check marked, and nothing is saved until Submit.
 */

test.use({ contextOptions: { reducedMotion: 'reduce' } });

const panel = (page: Page) => page.getByRole('complementary', { name: 'Ask Nirmaan' });

async function ask(page: Page, question: string) {
  await page.getByRole('button', { name: 'Ask Nirmaan' }).click();
  const box = panel(page).getByPlaceholder('Ask about projects, bills, orders, stock…');
  await box.fill(question);
  await box.press('Enter');
}

type Page_<T> = { items: T[]; total: number };
type Mr = { id: string; requestNo: string; items: { itemName: string; unit: string; quantity: string }[] };

test('a sentence becomes a material request, matched to the item master, saved only on Submit', async ({ page }) => {
  const engineer = await apiToken('engineer@demo.com');
  const before = (await api<Page_<Mr>>(engineer, '/material-requests?pageSize=1')).total;

  await signIn(page, 'engineer@demo.com');
  await ask(page, 'Raise an MR for 200 bags of OPC 53 cement and 20 nos of unobtanium widgets for RD-2026-01 by 2099-01-02');
  const card = panel(page).getByRole('group', { name: 'Drafted material request' });
  await expect(card.getByText('Material request, not saved')).toBeVisible();
  await expect(card.getByText('1 thing to check when you open it')).toBeVisible();
  // The answer drafted it; nothing is saved yet.
  expect((await api<Page_<Mr>>(engineer, '/material-requests?pageSize=1')).total).toBe(before);

  await card.getByRole('button', { name: 'Open form' }).click();
  await expect(page).toHaveURL(/\/material-requests/);
  const form = page.locator('.ant-drawer').filter({ hasText: 'New material request' });
  await expect(form.getByText('Filled in by Ask Nirmaan from what you wrote')).toBeVisible();
  await expect(form.getByRole('list', { name: 'To check' })).toContainText('"unobtanium widgets" is not in the item master');
  // "OPC 53 cement" is the item master's "OPC 53 Grade Cement", in its unit.
  await expect(form.getByLabel('Item of line 1')).toHaveValue('OPC 53 Grade Cement');
  await expect(form.getByLabel('Quantity of line 1')).toHaveValue('200');
  await expect(form.getByLabel('Unit of line 1')).toHaveValue('Bags');
  // The unknown item is marked until it is changed (the item picker carries the mark on its box).
  const item2 = form.locator('.ant-select').filter({ has: page.getByLabel('Item of line 2') });
  await expect(item2).toHaveClass(/ant-select-status-warning/);
  await form.getByLabel('Item of line 2').fill('Binding wire');
  await expect(item2).not.toHaveClass(/ant-select-status-warning/);

  // Closing a drafted form asks first, like any form with changes.
  await form.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('dialog', { name: 'Close this form?' }).getByRole('button', { name: 'Keep editing' }).click();
  await expect(page.getByRole('dialog', { name: 'Close this form?' })).toBeHidden();

  await form.getByRole('button', { name: 'Submit request' }).click();
  await expect(page.getByText('Material request submitted for approval')).toBeVisible();
  const saved = (await api<Page_<Mr>>(engineer, '/material-requests?pageSize=1&sortBy=createdAt&sortOrder=desc')).items[0];
  const full = await api<Mr>(engineer, `/material-requests/${saved.id}`);
  expect(full.items.map((i) => [i.itemName, i.unit, Number(i.quantity)])).toEqual([
    ['OPC 53 Grade Cement', 'Bags', 200],
    ['Binding wire', 'Nos', 20],
  ]);
});

test("rough notes become a DPR on the list already open, keeping the manpower that was said", async ({ page }) => {
  await signIn(page, 'engineer@demo.com');
  await page.goto('/dpr');
  await ask(page, 'Write a DPR for RD-2026-01: 6 masons and 8 helpers, gsb laying 40 cum at km 14, rain stopped work at 3 pm');
  const card = panel(page).getByRole('group', { name: 'Drafted daily report' });
  await card.getByRole('button', { name: 'Open form' }).click();
  const form = page.locator('.ant-drawer').filter({ hasText: 'New daily report' });
  await expect(form.getByText('Filled in by Ask Nirmaan from what you wrote')).toBeVisible();
  await expect(form.getByLabel('Work executed')).toHaveValue(/gsb laying 40 cum at km 14/);
  await expect(form.getByText('Rainy')).toBeVisible();
  // The manpower said, not the attendance sheet's.
  await expect(form.getByRole('row', { name: /Mason .*6/ })).toBeVisible();
  await expect(form.getByRole('row', { name: /Helper .*8/ })).toBeVisible();
  await form.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('dialog', { name: 'Close this form?' }).getByRole('button', { name: 'Close' }).click();
  await expect(form).toBeHidden();
});

test('a letter is drafted for the correspondence register', async ({ page }) => {
  await signIn(page, 'pm@demo.com');
  await ask(page, 'Write a letter for RD-2026-01 about the land handover delay at km 18');
  const card = panel(page).getByRole('group', { name: 'Drafted letter' });
  await card.getByRole('button', { name: 'Open form' }).click();
  await expect(page).toHaveURL(/\/correspondence\/outward/);
  const form = formPanel(page, 'New letter');
  await expect(form.getByText('Filled in by Ask Nirmaan from what you wrote')).toBeVisible();
  await expect(form.getByLabel('Subject')).toHaveValue('the land handover delay at km 18');
  // Going out, to the project's client.
  await expect(form.getByRole('combobox', { name: /^\W*To$/ })).not.toHaveValue('');
  await expect(form.getByLabel('Letter text')).toHaveValue('We write regarding the matter above.');
  await form.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('dialog', { name: 'Close this form?' }).getByRole('button', { name: 'Close' }).click();
});
