import { expect, test } from '@playwright/test';
import { api, apiToken, signIn } from './helpers';

/** Search everything (UI roadmap item 62): records by number or name, recent records and actions in Ctrl K. */

type Page<T> = { items: T[] };
type SearchResult = { hits: { kind: string; title: string; href: string }[] };

test('a number finds its record, which then shows under Recent', async ({ page }) => {
  const md = await apiToken('md@demo.com');
  const po = (await api<Page<{ id: string; poNo: string }>>(md, '/purchase-orders?pageSize=1')).items[0];
  await signIn(page, 'md@demo.com');
  await page.keyboard.press('Control+k');
  const search = page.getByRole('combobox', { name: 'Search', exact: true });
  await search.fill(po.poNo);
  const hit = page.getByRole('option').filter({ hasText: po.poNo });
  await expect(hit).toBeVisible();
  await expect(page.locator('#palette-results')).toContainText('Purchase orders');
  await search.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/purchase-orders/${po.id}$`));

  await page.keyboard.press('Control+k');
  await expect(page.locator('#palette-results')).toContainText('Recent');
  await expect(page.getByRole('option').first()).toContainText(po.poNo);
});

test('search follows the same rules as the lists', async () => {
  const md = await apiToken('md@demo.com');
  const engineer = await apiToken('engineer@demo.com');
  const all = await api<SearchResult>(md, '/search?q=kalinga');
  expect(all.hits.some((h) => h.kind === 'vendor')).toBe(true);
  // A site engineer has no vendors page, so vendors are not searched for them.
  const theirs = await api<SearchResult>(engineer, '/search?q=kalinga');
  expect(theirs.hits.some((h) => h.kind === 'vendor')).toBe(false);
  // Too short to look.
  expect((await api<SearchResult>(md, '/search?q=k')).hits).toHaveLength(0);
});

test('"new DPR for" a project starts the report there', async ({ page }) => {
  const pm = await apiToken('pm@demo.com');
  const project = (await api<Page<{ id: string; code: string; name: string }>>(pm, '/projects?pageSize=1&sortBy=code')).items[0];
  await signIn(page, 'pm@demo.com');
  await page.keyboard.press('Control+k');
  const search = page.getByRole('combobox', { name: 'Search', exact: true });
  await search.fill(`new dpr for ${project.code}`);
  await expect(page.getByRole('option').first()).toContainText(`New daily report (DPR) for ${project.name}`);
  await search.press('Enter');
  await expect(page).toHaveURL(/\/dpr$/);
  const form = page.getByRole('dialog', { name: 'New daily report' });
  await expect(form).toBeVisible();
  await expect(form).toContainText(project.name);
});
