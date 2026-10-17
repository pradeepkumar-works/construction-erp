import { expect, test } from '@playwright/test';
import { api, apiToken, localToday, signIn, uniqueQty } from './helpers';

/** Record pages (UI roadmap item 57): each entry at its own address, with its stage, sections, activity and actions. */

type Project = { id: string; code: string };
type Activity = { id: string; name: string };

test('a progress entry is approved from its own page, and the stage bar and activity follow', async ({ page }) => {
  const engineer = await apiToken('engineer@demo.com');
  const road = (await api<{ items: Project[] }>(engineer, '/projects?pageSize=100')).items.find((p) => p.code === 'RD-2026-01')!;
  const gsb = (await api<Activity[]>(engineer, `/projects/${road.id}/activities`)).find((a) => a.name === 'GSB laying')!;
  const remarks = `e2e record page ${uniqueQty()}`;
  const entry = await api<{ id: string }>(engineer, '/progress', { method: 'POST', body: { projectId: road.id, activityId: gsb.id, date: localToday(), quantity: uniqueQty(), remarks } });

  await signIn(page, 'pm@demo.com');
  await page.goto(`/progress/${entry.id}`);
  await expect(page.getByRole('heading', { name: /Progress entry · GSB laying/ })).toBeVisible();
  const stage = page.getByRole('group', { name: 'Stage' });
  await expect(stage).toContainText('Waiting');
  await expect(page.getByText(remarks)).toBeVisible();

  const footer = page.getByRole('toolbar', { name: 'Record actions' });
  await footer.getByRole('button', { name: 'Approve' }).click();
  await page.locator('.ant-modal').getByRole('button', { name: 'Approve' }).click();
  await expect(stage).toContainText('Approved');
  await expect(page.locator('.ant-card').filter({ hasText: 'Activity' }).last()).toContainText('Approved by');
  await expect(footer.getByRole('button', { name: 'Approve' })).toHaveCount(0);
});

test('a quick look opens the full page, whose link can be copied and whose sections are a click away', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await signIn(page, 'pm@demo.com');
  await page.goto('/bills');
  await page.locator('.ant-table-row a[href^="/bills/"]').first().click();
  const drawer = page.locator('.ant-drawer-open');
  await expect(drawer.getByRole('group', { name: 'Stage' })).toBeVisible();
  await drawer.getByRole('link', { name: 'Open full page' }).click();
  await expect(page).toHaveURL(/\/bills\/[0-9a-f-]{36}$/);
  const url = page.url();

  await expect(page.getByRole('group', { name: 'Stage' })).toContainText('Submitted');
  await page.locator('.ant-anchor').getByText(/^Measurements billed/).click();
  await expect(page.locator('#record-measurements')).toBeInViewport();

  await page.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.getByText('Link copied')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);

  await page.getByRole('toolbar', { name: 'Record actions' }).getByRole('link', { name: 'RA Bills' }).click();
  await expect(page).toHaveURL(/\/bills$/);
});

// Subcontractor bills are left out: the demo data has none, so subcontracts.spec checks the page of the one it makes.
test('the other approval types have their own pages too', async ({ page }) => {
  const md = await apiToken('md@demo.com');
  const pages: { list: string; api: string; heading: RegExp }[] = [
    { list: '/expenses', api: '/expenses', heading: /^Site expense · EXP-/ },
    { list: '/machinery', api: '/machinery-logs', heading: /^Machinery log · / },
    { list: '/measurements', api: '/measurements', heading: /^Measurement · / },
    { list: '/vendor-bills', api: '/vendor-bills', heading: /^VB-\d{4}-\d{4} · / },
    { list: '/work-orders', api: '/work-orders', heading: /^WO-/ },
    { list: '/inspections', api: '/inspections', heading: /^Inspection · INS-/ },
  ];
  await signIn(page, 'md@demo.com');
  for (const p of pages) {
    const first = (await api<{ items: { id: string }[] }>(md, `${p.api}?pageSize=1`)).items[0];
    expect(first, p.api).toBeTruthy();
    await page.goto(`${p.list}/${first.id}`);
    await expect(page.getByRole('heading', { name: p.heading }), p.list).toBeVisible();
    await expect(page.getByRole('group', { name: 'Stage' }), p.list).toBeVisible();
    // The footer leads back to the list.
    await expect(page.getByRole('toolbar', { name: 'Record actions' }).locator(`a[href="${p.list}"]`), p.list).toHaveCount(1);
  }

  // The list's number is a real link to the page, while a plain click still opens the quick look.
  await page.goto('/vendor-bills');
  const link = page.locator('.ant-table-row a[href^="/vendor-bills/"]').first();
  await link.click();
  await expect(page.locator('.ant-drawer-open').getByRole('group', { name: 'Stage' })).toBeVisible();
});
