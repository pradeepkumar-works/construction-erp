import { expect, test, type Page } from '@playwright/test';
import { api, apiToken, chooseOption, localToday, signIn, uniqueQty } from './helpers';

/**
 * Feedback, undo and safe deletes: a delete asks by name and can be undone for ten seconds, a new entry's
 * notice opens it, an approval shows at once, and a failed request says so in plain words with a Retry that works.
 */

type Project = { id: string; code: string };
type Activity = { id: string; name: string };

/** The notice bar at the top of the page (antd message), holding `text`. */
const notice = (page: Page, text: string | RegExp) => page.locator('.ant-message-notice').filter({ hasText: text });

async function submitProgress() {
  const engineer = await apiToken('engineer@demo.com');
  const road = (await api<{ items: Project[] }>(engineer, '/projects?pageSize=100')).items.find((p) => p.code === 'RD-2026-01')!;
  const gsb = (await api<Activity[]>(engineer, `/projects/${road.id}/activities`)).find((a) => a.name === 'GSB laying')!;
  const remarks = `e2e feedback ${uniqueQty()}`;
  const e = await api<{ id: string }>(engineer, '/progress', { method: 'POST', body: { projectId: road.id, activityId: gsb.id, date: localToday(), quantity: uniqueQty(), remarks } });
  return { id: e.id, remarks };
}

/** The progress list narrowed to one entry by its remarks, as the project manager sees it. */
async function progressRow(page: Page, remarks: string) {
  await page.goto(`/progress?q=${encodeURIComponent(remarks)}`);
  const row = page.locator('.ant-table-tbody tr.ant-table-row');
  await expect(row).toHaveCount(1);
  return row;
}

async function approveFromRow(page: Page, row: ReturnType<Page['locator']>) {
  await row.getByRole('button', { name: 'Actions' }).click();
  await page.getByRole('menuitem', { name: 'Approve' }).click();
  await page.locator('.ant-modal').filter({ hasText: 'Note (optional)' }).getByRole('button', { name: 'Approve' }).click();
}

test('a delete asks with its name, says it is gone, and Undo brings it back', async ({ page }) => {
  const name = `E2E Undo Traders ${Date.now() % 100000}`;
  const procurement = await apiToken('procurement@demo.com');
  await api(procurement, '/vendors', { method: 'POST', body: { name, kinds: ['SUPPLIER'] } });

  await signIn(page, 'procurement@demo.com');
  await page.goto(`/vendors?q=${encodeURIComponent(name)}`);
  const row = page.getByRole('row').filter({ hasText: name });
  await expect(row).toHaveCount(1);

  await row.getByRole('button', { name: `Delete ${name}` }).click();
  const confirm = page.locator('.ant-popconfirm').filter({ hasText: `Delete vendor ${name}?` });
  await expect(confirm).toBeVisible();
  const del = confirm.getByRole('button', { name: 'Delete', exact: true });
  await expect(del).toHaveClass(/ant-btn-dangerous/);
  await del.click();

  const gone = notice(page, `Vendor ${name} deleted`);
  await expect(gone).toBeVisible();
  // Good news is polite: it does not interrupt a screen reader.
  await expect(gone).toHaveAttribute('role', 'status');
  await expect(row).toHaveCount(0);

  await gone.getByRole('button', { name: 'Undo' }).click();
  await expect(notice(page, 'Brought back')).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: name })).toHaveCount(1);
  const back = await api<{ items: { name: string }[] }>(procurement, `/vendors?q=${encodeURIComponent(name)}`);
  expect(back.items.map((v) => v.name)).toEqual([name]);
});

test('a failed delete says why in the confirmation and stays open', async ({ page }) => {
  const name = `E2E Kept Traders ${Date.now() % 100000}`;
  const procurement = await apiToken('procurement@demo.com');
  await api(procurement, '/vendors', { method: 'POST', body: { name, kinds: ['SUPPLIER'] } });

  await signIn(page, 'procurement@demo.com');
  await page.goto(`/vendors?q=${encodeURIComponent(name)}`);
  const row = page.getByRole('row').filter({ hasText: name });
  await page.route('**/api/vendors/*', (route) => (route.request().method() === 'DELETE' ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"statusCode":500,"message":"Internal server error"}' }) : route.continue()));
  await row.getByRole('button', { name: `Delete ${name}` }).click();
  const confirm = page.locator('.ant-popconfirm').filter({ hasText: `Delete vendor ${name}?` });
  // While it runs the button also holds antd's "loading" icon, which lingers in the DOM while it fades out.
  const del = confirm.getByRole('button', { name: /Delete$/ });
  await del.click();
  await expect(confirm.getByRole('alert')).toHaveText('Something went wrong on our side. Try again.');
  await expect(confirm).toBeVisible();
  await expect(row).toHaveCount(1);

  // Pressing Delete again is the retry.
  await page.unroute('**/api/vendors/*');
  await expect(del).not.toHaveClass(/ant-btn-loading/);
  await del.click();
  await expect(notice(page, `Vendor ${name} deleted`)).toBeVisible();
  await expect(row).toHaveCount(0);
});

test('a new entry says what was made, and View opens it', async ({ page }) => {
  const remarks = `e2e view ${uniqueQty()}`;
  await signIn(page, 'engineer@demo.com');
  await page.goto('/progress');
  await page.getByRole('button', { name: 'New progress entry' }).click();
  const modal = page.locator('.ant-modal').filter({ hasText: 'New progress entry' });
  await chooseOption(modal.getByLabel('Project'), 'RD-2026-01');
  await chooseOption(modal.getByLabel('Activity'));
  await modal.getByLabel(/Quantity executed/).fill(uniqueQty());
  await modal.getByLabel('Remarks').fill(remarks);
  await modal.getByRole('button', { name: 'Submit' }).click();

  const made = notice(page, 'Progress entry submitted for approval');
  await expect(made).toBeVisible();
  await made.getByRole('button', { name: 'View' }).click();
  await expect(page).toHaveURL(/\/progress\/[0-9a-f-]{36}$/);
  await expect(page.getByText(remarks)).toBeVisible();
});

test('approving shows the new status at once, before the server answers', async ({ page }) => {
  const entry = await submitProgress();
  await signIn(page, 'pm@demo.com');
  const row = await progressRow(page, entry.remarks);
  await expect(row).toContainText('Pending Approval');

  let release: () => void = () => undefined;
  const held = new Promise<void>((r) => (release = r));
  await page.route('**/api/approvals/progress/*/review', async (route) => {
    await held;
    await route.continue();
  });
  await approveFromRow(page, row);
  // The request is still held: the row already says Approved.
  await expect(row).toContainText('Approved');
  await expect(notice(page, /^Approved$/)).toHaveCount(0);
  release();
  await expect(notice(page, /^Approved$/)).toBeVisible();
  const pm = await apiToken('pm@demo.com');
  expect((await api<{ status: string }>(pm, `/progress/${entry.id}`)).status).toBe('APPROVED');
});

test('an approval that cannot reach the server goes back, says so in plain words, and Retry sends it', async ({ page }) => {
  const entry = await submitProgress();
  await signIn(page, 'pm@demo.com');
  const row = await progressRow(page, entry.remarks);

  await page.route('**/api/approvals/progress/*/review', (route) => route.abort('internetdisconnected'));
  await approveFromRow(page, row);
  const failed = notice(page, 'Could not reach Nirmaan. Your changes are kept; check your connection and try again.');
  await expect(failed).toBeVisible();
  await expect(row).toContainText('Pending Approval');
  const pm = await apiToken('pm@demo.com');
  expect((await api<{ status: string }>(pm, `/progress/${entry.id}`)).status).toBe('SUBMITTED');

  await page.unroute('**/api/approvals/progress/*/review');
  await failed.getByRole('button', { name: 'Retry' }).click();
  await expect(row).toContainText('Approved');
  await expect(notice(page, /^Approved$/)).toBeVisible();
  expect((await api<{ status: string }>(pm, `/progress/${entry.id}`)).status).toBe('APPROVED');
});
