import { expect, test } from '@playwright/test';
import { api, apiToken, localToday, queueItem, signIn, uniqueQty } from './helpers';

/** The Approvals inbox (UI roadmap item 58): the queue beside the entry, decisions from the keyboard, bulk approval. */

type Project = { id: string; code: string };
type Activity = { id: string; name: string };
type Entry = { id: string; status: string };

async function submitProgress(n: number) {
  const engineer = await apiToken('engineer@demo.com');
  const road = (await api<{ items: Project[] }>(engineer, '/projects?pageSize=100')).items.find((p) => p.code === 'RD-2026-01')!;
  const gsb = (await api<Activity[]>(engineer, `/projects/${road.id}/activities`)).find((a) => a.name === 'GSB laying')!;
  const out: { id: string; qty: string; remarks: string }[] = [];
  for (let i = 0; i < n; i++) {
    const qty = uniqueQty();
    const remarks = `e2e inbox ${qty}`;
    const e = await api<{ id: string }>(engineer, '/progress', { method: 'POST', body: { projectId: road.id, activityId: gsb.id, date: localToday(), quantity: qty, remarks } });
    out.push({ id: e.id, qty, remarks });
  }
  return out;
}

const statusOf = async (id: string) => (await api<Entry>(await apiToken('pm@demo.com'), `/progress/${id}`)).status;

test('the project manager works through the queue from the keyboard', async ({ page }) => {
  const [first, second] = await submitProgress(2);
  await signIn(page, 'pm@demo.com');
  await page.goto('/approvals');
  const current = page.getByRole('region', { name: 'Approval queue' }).locator('[aria-current="true"]');

  const one = queueItem(page, `: ${first.qty} `);
  await one.open();
  await expect(current).toContainText(`: ${first.qty} `);
  await expect(page.getByText(first.remarks)).toBeVisible();
  await expect(page.getByRole('group', { name: 'Stage' })).toContainText('Waiting');

  await page.keyboard.press('a');
  const modal = page.locator('.ant-modal').filter({ hasText: 'Note (optional)' });
  await modal.getByLabel('Note (optional)').fill('Checked on site');
  await modal.getByLabel('Note (optional)').press('Control+Enter');
  await expect(page.getByText('Approved', { exact: true }).first()).toBeVisible();
  await expect(one.item).toHaveCount(0);
  await expect(current).toHaveCount(1);

  const two = queueItem(page, `: ${second.qty} `);
  await two.open();
  await page.keyboard.press('j');
  await expect(current).not.toContainText(`: ${second.qty} `);
  await page.keyboard.press('k');
  await expect(current).toContainText(`: ${second.qty} `);
  await page.keyboard.press('r');
  const reject = page.locator('.ant-modal').filter({ hasText: 'Reason' });
  await reject.getByLabel('Reason').fill('E2E: wrong chainage');
  await reject.getByRole('button', { name: 'Reject' }).click();
  await expect(two.item).toHaveCount(0);

  expect(await statusOf(first.id)).toBe('APPROVED');
  expect(await statusOf(second.id)).toBe('REJECTED');

  await page.getByRole('button', { name: /Reviewed today/ }).click();
  const today = page.getByRole('list', { name: 'Reviewed today' });
  await expect(today.locator('li').filter({ hasText: `: ${first.qty} ` })).toContainText('Approved');
  await expect(today.locator('li').filter({ hasText: `: ${second.qty} ` })).toContainText('Rejected');
});

test('a selection of one type is approved together', async ({ page }) => {
  const entries = await submitProgress(2);
  await signIn(page, 'pm@demo.com');
  await page.goto('/approvals');
  for (const e of entries) await page.getByRole('checkbox', { name: new RegExp(`^Select .*: ${e.qty.replace('.', '\\.')} `) }).check();

  const bar = page.getByRole('toolbar', { name: 'Selection' });
  await expect(bar).toContainText('2 selected in progress');
  const otherGroup = page.getByRole('checkbox', { name: 'Select all indents' });
  if (await otherGroup.count()) await expect(otherGroup).toBeDisabled();

  await bar.getByRole('button', { name: /Approve 2/ }).click();
  await page.locator('.ant-modal-confirm').getByRole('button', { name: 'Approve 2' }).click();
  await expect(page.getByText('Approved 2 entries')).toBeVisible();
  for (const e of entries) await expect(queueItem(page, `: ${e.qty} `).item).toHaveCount(0);
  for (const e of entries) expect(await statusOf(e.id)).toBe('APPROVED');
});
