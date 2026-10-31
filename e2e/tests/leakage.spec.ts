import { expect, test } from '@playwright/test';
import { api, apiToken, signIn } from './helpers';

/**
 * Leakage checks. The demo has material over its norms at the building site, the hired grader short of
 * the 200 hours a month it is paid for, and diesel put into the excavator on a day with no log. The page lists the
 * month's flags with their rupees and working; a purchase order above what another site paid says so on its record.
 */

test.use({ contextOptions: { reducedMotion: 'reduce' } });

type Flag = { key: string; section: string; title: string; working: string[]; valueInr: number | null };
type Leakage = { month: string; sections: string[]; flags: Flag[]; totalInr: number | null };
type Page<T> = { items: T[] };

test('the month’s leakage flags, with their rupees and the working behind each', async ({ page }) => {
  const md = await apiToken('md@demo.com');
  const data = await api<Leakage>(md, '/leakage');
  expect(data.sections).toEqual(['material', 'rates', 'fuel', 'idle']);

  await signIn(page, 'md@demo.com');
  await page.goto('/leakage');
  await expect(page.getByRole('heading', { name: 'Leakage checks', level: 1 })).toBeVisible();
  await expect(page.getByText('At risk this month')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Month' })).toBeVisible();
  if (data.flags.length) {
    const first = data.flags[0];
    const card = page.locator(`[data-flag-key="${first.key}"]`);
    await expect(card.getByRole('heading', { name: first.title })).toBeVisible();
    await card.getByRole('button', { name: 'Show how this was worked out' }).click();
    await expect(card.getByText(first.working[0], { exact: true })).toBeVisible();
  } else {
    await expect(page.getByText('Nothing found this month')).toBeVisible();
  }

  // The store manager has no rates; a site engineer has no page.
  const store = await api<Leakage>(await apiToken('store@demo.com'), '/leakage');
  expect(store.sections).toEqual(['material', 'fuel', 'idle']);
  await expect(api(await apiToken('engineer@demo.com'), '/leakage')).rejects.toThrow(/403/);
});

test('a purchase order above what another site paid says so on its record', async ({ page }) => {
  const procurement = await apiToken('procurement@demo.com');
  const projects = (await api<Page<{ id: string; code: string }>>(procurement, '/projects')).items;
  const water = projects.find((p) => p.code === 'WS-2026-03')!;
  const vendor = (await api<Page<{ id: string }>>(procurement, '/vendors?pageSize=1')).items[0];
  // The building site bought OPC 53 at ₹385 a bag last week (the seed's order).
  const po = await api<{ id: string }>(procurement, '/purchase-orders', {
    method: 'POST',
    body: { projectId: water.id, vendorId: vendor.id, lines: [{ itemName: 'OPC 53 Grade Cement', unit: 'Bags', quantity: '100', rate: '420', gstRate: '28' }] },
  });
  try {
    const record = await api<{ lines: { rateCheck: { bestRate: string; extra: string } | null }[] }>(procurement, `/purchase-orders/${po.id}`);
    // ₹385 unless another test has since bought it cheaper elsewhere
    const check = record.lines[0].rateCheck!;
    expect(Number(check.bestRate)).toBeLessThanOrEqual(385);
    expect(Number(check.extra)).toBe((420 - Number(check.bestRate)) * 100);

    await signIn(page, 'procurement@demo.com');
    await page.goto(`/purchase-orders/${po.id}`);
    await expect(page.getByText('1 line is above what another site paid in the 30 days before')).toBeVisible();
  } finally {
    await api(procurement, `/purchase-orders/${po.id}`, { method: 'DELETE' });
  }
});
