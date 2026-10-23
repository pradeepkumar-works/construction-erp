import { expect, test } from '@playwright/test';
import { api, apiToken, formPanel, signIn } from './helpers';

/**
 * Early warnings (AI items 73 and 119). The demo seed's dates are relative to today, so its schedule and stock always
 * give the MD some warnings. Each card leads with its action and keeps its working under Why; a dismissal says what
 * became of the warning (Known needs a note), holds for the company, counts in the track record, and Restore brings
 * the warning back.
 */

test.use({ contextOptions: { reducedMotion: 'reduce' } });

type WatchList = { kinds: string[]; open: { key: string; kind: string; title: string; action: string; working: string[] }[]; dismissed: { key: string }[] };

test('the MD sees warnings with their action and working, dismisses one as Known with a note and restores it', async ({ page }) => {
  const md = await apiToken('md@demo.com');
  const before = await api<WatchList>(md, '/warnings');
  expect(before.open.length).toBeGreaterThan(0);

  await signIn(page, 'md@demo.com');
  await expect(page.getByText('Watch list', { exact: true }).first()).toBeVisible();
  await page.goto('/watch-list');
  await expect(page.getByRole('heading', { name: 'Watch list' })).toBeVisible();
  const first = before.open[0];
  // Two warnings can share a title (the same activity name on two projects), so the card is found by its key.
  const card = page.locator(`[data-warning-key="${first.key}"]`);
  await expect(card).toBeVisible();
  await expect(card.getByText(first.action)).toBeVisible();
  await card.getByRole('button', { name: 'Why: the working' }).click();
  await expect(card.getByText(first.working[0])).toBeVisible();

  await card.getByRole('button', { name: 'Dismiss' }).click();
  const modal = formPanel(page, 'Dismiss this warning');
  await modal.getByRole('button', { name: 'Dismiss' }).click();
  await expect(modal.getByText('Choose what became of it')).toBeVisible();
  await modal.getByRole('radio', { name: /Known and accepted/ }).check();
  await modal.getByRole('button', { name: 'Dismiss' }).click();
  await expect(modal.getByText('Say why it can be left as it is')).toBeVisible();
  await modal.getByLabel('Why it can be left').fill('Second crew starts Monday');
  await modal.getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.getByText('Dismissed for everyone in the company')).toBeVisible();

  const admin = await apiToken('admin@demo.com');
  expect((await api<WatchList>(admin, '/warnings')).dismissed.some((w) => w.key === first.key)).toBe(true);

  await page.getByRole('tab', { name: /Dismissed/ }).click();
  const gone = page.locator(`[data-warning-key="${first.key}"]`);
  await expect(gone.getByText('Second crew starts Monday')).toBeVisible();
  await expect(gone.getByText(/^Known and accepted: dismissed by/)).toBeVisible();
  await gone.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByText('Back on the watch list')).toBeVisible();

  // The outcome stays in the kind's track record after the restore.
  await page.getByRole('tab', { name: /Track record/ }).click();
  await expect(page.locator(`[data-record-kind="${first.kind}"]`).getByText(/^Right \d+ of the last \d+|^Right the one time/)).toBeVisible();
  expect((await api<WatchList>(md, '/warnings')).open.some((w) => w.key === first.key)).toBe(true);
});

test('the store manager sees only stock, machines and fuel; a site engineer has no watch list', async ({ page }) => {
  const store = await api<WatchList>(await apiToken('store@demo.com'), '/warnings');
  expect(store.kinds).toEqual(['STOCK', 'MACHINE', 'FUEL_NORM']);
  expect(store.open.every((w) => w.kind === 'STOCK' || w.kind === 'MACHINE' || w.kind === 'FUEL_NORM')).toBe(true);

  await signIn(page, 'engineer@demo.com');
  await page.goto('/watch-list');
  await expect(page.getByText('The watch list is for managers, stores, purchase and accounts')).toBeVisible();
});
