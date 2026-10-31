import { expect, test } from '@playwright/test';
import { formPanel, signIn } from './helpers';

/**
 * Forms v2 (UI roadmap item 60): long forms open in a drawer with their actions in a footer that stays put; a new
 * entry's draft survives a refresh; closing with changes asks first; a failed submit lists what is missing; Enter in a
 * line table moves down and adds a line; Ctrl Enter submits.
 */
test('a new daily report keeps its draft through a refresh, and Start over clears it', async ({ page }) => {
  await signIn(page, 'engineer@demo.com');
  await page.goto('/dpr');
  await page.getByRole('button', { name: /New daily report/ }).click();
  let form = formPanel(page, 'New daily report');
  await expect(form).toBeVisible();
  const text = `Draft check ${Date.now()}`;
  await form.getByLabel('Work executed').fill(text);
  await expect(form.getByText('Draft kept on this device')).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: /New daily report/ }).click();
  form = formPanel(page, 'New daily report');
  await expect(form.getByText(/^Brought back what you typed/)).toBeVisible();
  await expect(form.getByLabel('Work executed')).toHaveValue(text);

  // Closing with changes asks first; the draft stays either way.
  await form.getByLabel('Work executed').fill(`${text} and more`);
  await page.keyboard.press('Escape');
  const confirm = page.locator('.ant-modal-confirm').filter({ hasText: 'Close this form?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Keep editing' }).click();
  await expect(form.getByLabel('Work executed')).toHaveValue(`${text} and more`);

  await form.getByRole('button', { name: 'Start over' }).click();
  await expect(form.getByLabel('Work executed')).toHaveValue('');
  await form.getByRole('button', { name: 'Cancel' }).click();
  await expect(form).toBeHidden();
  await page.getByRole('button', { name: /New daily report/ }).click();
  await expect(formPanel(page, 'New daily report').getByText(/^Brought back what you typed/)).toHaveCount(0);
});

test('a failed submit lists what is missing, and Enter in the item table adds a line', async ({ page }) => {
  await signIn(page, 'engineer@demo.com');
  await page.goto('/material-requests');
  await page.getByRole('button', { name: 'New indent' }).first().click();
  const form = formPanel(page, 'New indent');
  await expect(form).toBeVisible();

  // Enter on the last line's quantity adds a line and moves to it.
  await form.getByLabel('Item of line 1').fill('Binding wire');
  await form.getByLabel('Quantity of line 1').click();
  await page.keyboard.press('Enter');
  await expect(form.getByLabel('Item of line 2')).toBeFocused();

  // Ctrl Enter submits; line 2 has no item, so the summary names it and the form stays open.
  await page.keyboard.press('Control+Enter');
  const summary = form.locator('.ant-alert-error');
  await expect(summary).toContainText(/needs? attention/);
  await expect(summary.getByRole('link', { name: 'Item, line 2' })).toBeVisible();
  await expect(summary.getByRole('link', { name: 'Project' })).toBeVisible();
  // The summary follows the fields as they are fixed.
  await form.getByRole('button', { name: 'Remove Item line 2' }).click();
  await expect(summary.getByRole('link', { name: 'Item, line 2' })).toHaveCount(0);
  await expect(summary.getByRole('link', { name: 'Project' })).toBeVisible();
});
