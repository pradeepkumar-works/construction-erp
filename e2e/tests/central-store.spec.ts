import { expect, test } from '@playwright/test';
import { API_URL, api, apiToken, chooseOption, localToday, signIn } from './helpers';

type Project = { id: string; code: string; name: string };
type Store = { id: string; code: string; name: string; outInTransit: number; inInTransit: number; canKeep: boolean };
type Entry = { id: string; entryNo: string; toProjectId: string | null; lines: { itemName: string; quantity: string }[] };
type Other = { projectId: string; projectName: string; balance: string; canSend: boolean; store?: boolean };
type RequestStock = { lines: { itemName: string; others: Other[] }[] };

const storeOf = async (token: string) => (await api<Store[]>(token, '/stock/stores')).find((s) => s.code === 'CS-01')!;

/**
 * Central store (v6 item 106): the store manager opens the Khordha store from Central stores and sends steel to the
 * highway by transfer; it is on the road until the site receives it.
 */
test('the central store sends steel to a site, which receives it', async ({ page }) => {
  const store = await apiToken('store@demo.com');
  const road = (await api<{ items: Project[] }>(store, '/projects?pageSize=100')).items.find((p) => p.code === 'RD-2026-01')!;
  const before = await storeOf(store);
  expect(before.canKeep).toBe(true);

  await signIn(page, 'store@demo.com');
  await page.goto('/stores');
  await page.getByRole('link', { name: `Open store: ${before.name}` }).click();
  await expect(page).toHaveURL(new RegExp(`/stores/${before.id}`));
  await expect(page.getByRole('heading', { level: 1, name: before.name })).toBeVisible();
  await page.getByRole('button', { name: /More/ }).click();
  await page.getByRole('menuitem', { name: 'Transfer to a site or store' }).click();
  const modal = page.locator('.ant-modal').filter({ hasText: 'Transfer to a site or store' });
  await chooseOption(modal.getByLabel('To site or store'), 'RD-2026-01');
  await chooseOption(modal.locator('.stock-move-line').first().getByRole('combobox'), 'TMT');
  await modal.locator('.stock-move-line').first().getByLabel('Quantity').fill('1');
  await modal.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(/sent to Bhubaneswar/)).toBeVisible();
  expect((await storeOf(store)).outInTransit).toBe(before.outInTransit + 1);

  const incoming = await api<Entry[]>(store, `/stock/transfers/incoming?projectId=${road.id}`);
  const sent = incoming.find((t) => t.lines.some((l) => l.itemName.startsWith('TMT') && Number(l.quantity) === -1))!;
  expect(sent).toBeTruthy();
  await api(store, `/stock/transfers/${sent.id}/receive`, { method: 'POST', body: { date: localToday() } });
  expect((await storeOf(store)).outInTransit).toBe(before.outInTransit);
});

/**
 * A site's material request lists what the central store holds even to an engineer who is not one of its keepers;
 * only the store's keepers may send from it. A store's project page is its store page.
 */
test("a site's request sees the central store's stock; only its keepers send from it", async ({ page }) => {
  const engineer = await apiToken('engineer@demo.com');
  const pm = await apiToken('pm@demo.com');
  const store = await apiToken('store@demo.com');
  const road = (await api<{ items: Project[] }>(engineer, '/projects?pageSize=100')).items.find((p) => p.code === 'RD-2026-01')!;
  const due = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
  const mr = await api<{ id: string }>(engineer, '/material-requests', {
    method: 'POST',
    body: { projectId: road.id, requiredDate: due, priority: 'NORMAL', remarks: 'e2e central store', items: [{ itemName: 'OPC 53 Grade Cement', unit: 'Bags', quantity: '50' }], submit: true },
  });
  await api(pm, `/approvals/material_request/${mr.id}/review`, { method: 'POST', body: { decision: 'APPROVE' } });

  const seen = await api<RequestStock>(engineer, `/material-requests/${mr.id}/stock`);
  const atStore = seen.lines[0].others.find((o) => o.store)!;
  expect(atStore.projectName).toBe('Khordha Central Store');
  expect(atStore.canSend).toBe(false);
  const kept = await api<RequestStock>(store, `/material-requests/${mr.id}/stock`);
  expect(kept.lines[0].others.find((o) => o.store)!.canSend).toBe(true);

  const refused = await fetch(`${API_URL}/stock/stores`, { headers: { authorization: `Bearer ${engineer}` } });
  expect(refused.status).toBe(403);

  const md = await apiToken('md@demo.com');
  const cs = await storeOf(md);
  await signIn(page, 'md@demo.com');
  await page.goto(`/projects/${cs.id}`);
  await expect(page).toHaveURL(new RegExp(`/stores/${cs.id}`));
  await expect(page.getByRole('heading', { level: 1, name: cs.name })).toBeVisible();
});
