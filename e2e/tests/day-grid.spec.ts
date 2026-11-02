import { expect, test } from '@playwright/test';
import { api, apiToken, signIn } from './helpers';

interface Project {
  id: string;
  code: string;
  name: string;
  type: string;
  status: string;
}

// Daily reports opens on Days (ARCHITECTURE "Views that fit the data"): a row per site, filed or not, so the site that
// did not report is on the list with its days missing; a cell opens that report, and Table is one click away.
test('Daily reports opens on sites by days, a cell opens its report, and Table is a click away', async ({ page }) => {
  const md = await apiToken('md@demo.com');
  const projects = (await api<{ items: Project[] }>(md, '/projects?pageSize=500')).items;
  const sites = projects.filter((p) => p.status === 'ACTIVE' && p.type !== 'STORE' && p.type !== 'PLANT');
  expect(sites.length).toBeGreaterThan(1);

  await signIn(page, 'md@demo.com');
  await page.goto('/dpr');
  const grid = page.getByRole('region', { name: 'Daily reports by site and day' });
  await expect(grid).toBeVisible();
  const views = page.getByRole('radiogroup', { name: 'View' });
  await expect(views.getByRole('radio', { name: /Days/ })).toBeChecked();

  // Every active site has a row, and the one that missed the most days leads with how many.
  const rows = grid.locator('tbody tr');
  await expect(rows).toHaveCount(sites.length);
  await expect(rows.first().getByRole('rowheader')).toContainText(/\d+ days? missing/);
  await expect(rows.first().locator('td').filter({ hasText: 'No daily report' }).first()).toBeAttached();

  // Each cell is one mark, told apart by shape and colour, and the key above says what each mark and the empty cell mean.
  const key = page.getByRole('list', { name: 'Key' });
  for (const word of ['Approved', 'Waiting for approval', 'Sent back or rejected', 'No daily report']) await expect(key).toContainText(word);

  // A cell is a button named for its site, day and state, and opens that report in the drawer.
  const cell = grid.getByRole('button', { name: /^Daily report, .+, \d{2} \w{3}, / }).first();
  await expect(cell).toBeVisible();
  await cell.click();
  await expect(page.locator('.ant-drawer-open').getByRole('group', { name: 'Stage' })).toBeVisible();
  await page.keyboard.press('Escape');

  // Table keeps its rows and filters, and the address says so.
  await views.getByText('Table').click();
  await expect(page).toHaveURL(/view=table/);
  await expect(page.locator('.ant-table-tbody > tr[data-row-key]').first()).toBeVisible();
  await expect(grid).toHaveCount(0);
});
