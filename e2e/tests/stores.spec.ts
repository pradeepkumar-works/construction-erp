import { expect, test } from '@playwright/test';
import { api, apiToken, chooseOption, localToday, signIn } from './helpers';

interface Page<T> {
  items: T[];
  total: number;
}
type Project = { id: string; code: string };
type Balance = { itemId: string; itemName: string; balance: string; issued: string; transferred: string };
type Entry = { id: string; entryNo: string; type: string; toProjectName: string | null; transferInNo: string | null; lines: { itemId: string; quantity: string }[] } | null;

const balances = async (token: string, projectId: string) => (await api<Page<Balance>>(token, `/stock/balances?projectId=${projectId}&pageSize=200`)).items;
const balanceOf = async (token: string, projectId: string, itemId: string) => Number((await balances(token, projectId)).find((b) => b.itemId === itemId)?.balance ?? 0);

/**
 * Stores round-out (v4 item 39): the PM sends material from the road project to the water supply project, which
 * receives it from the "on the way" banner on its stock tab. Stock leaves one store and arrives at the other.
 */
test('a transfer leaves one store and is received at the other', async ({ page }) => {
  const pm = await apiToken('pm@demo.com');
  const projects = (await api<Page<Project>>(pm, '/projects?pageSize=100')).items;
  const road = projects.find((p) => p.code === 'RD-2026-01')!;
  const ws = projects.find((p) => p.code === 'WS-2026-03')!;

  await signIn(page, 'pm@demo.com');
  await page.goto(`/projects/${road.id}?tab=stock`);
  const modal = page.locator('.ant-modal').filter({ hasText: 'Transfer to a site or store' });
  // A click while the menu is still opening can be lost, so open it and pick again until the form is up.
  await expect(async () => {
    if (!(await modal.isVisible())) {
      const item = page.getByRole('menuitem', { name: 'Transfer to a site or store' });
      if (!(await item.isVisible())) await page.getByRole('button', { name: /More/ }).click({ timeout: 2000 });
      await item.click({ timeout: 2000 });
    }
    await expect(modal.getByLabel('To site or store')).toBeVisible({ timeout: 3000 });
  }).toPass();
  await chooseOption(modal.getByLabel('To site or store'), 'WS-2026-03');
  await chooseOption(modal.locator('.stock-move-line').first().getByRole('combobox'), 'Aggregate');
  await modal.locator('.stock-move-line').first().getByLabel('Quantity').fill('3');
  const roadBefore = (await balances(pm, road.id)).find((b) => b.itemName.startsWith('Aggregate'))!;
  const wsBefore = await balanceOf(pm, ws.id, roadBefore.itemId);
  await modal.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(/sent to Jajpur/)).toBeVisible();
  expect(await balanceOf(pm, road.id, roadBefore.itemId)).toBe(Number(roadBefore.balance) - 3);

  const incoming = await api<NonNullable<Entry>[]>(pm, `/stock/transfers/incoming?projectId=${ws.id}`);
  const mine = incoming.find((t) => t.lines.some((l) => l.itemId === roadBefore.itemId && Number(l.quantity) === -3))!;
  expect(mine).toBeTruthy();

  await page.goto(`/projects/${ws.id}?tab=stock`);
  const banner = page.locator('.incoming-transfers');
  await banner.locator('div').filter({ hasText: mine.entryNo }).getByRole('button', { name: 'Receive' }).last().click();
  await page.locator('.ant-modal').filter({ hasText: `Receive ${mine.entryNo}` }).getByRole('button', { name: 'Receive' }).click();
  await expect(page.getByText(/received at Jajpur/)).toBeVisible();
  expect(await balanceOf(pm, ws.id, roadBefore.itemId)).toBe(wsBefore + 3);

  const out = await api<NonNullable<Entry>>(pm, `/stock/entries/${mine.id}`);
  expect(out.transferInNo).toMatch(/^TRI-/);
  await expect(api(pm, `/stock/transfers/${mine.id}/receive`, { method: 'POST', body: { date: localToday() } })).rejects.toThrow(/409/);
});

test('returns from site come off the material cost; returns to the supplier cannot exceed stock', async () => {
  const pm = await apiToken('pm@demo.com');
  const road = (await api<Page<Project>>(pm, '/projects?pageSize=100')).items.find((p) => p.code === 'RD-2026-01')!;
  const items = (await api<Page<{ id: string; name: string; rate: string | null }>>(pm, '/stock/items?pageSize=200')).items;
  const cement = (await balances(pm, road.id)).find((b) => b.itemName.startsWith('OPC 53') && Number(b.issued) >= 1)!;
  const rate = Number(items.find((i) => i.id === cement.itemId)!.rate);
  const cost = async () => Number((await api<{ cost: { material: string } }>(pm, `/cost/projects/${road.id}`)).cost.material);
  const before = await cost();
  const today = localToday();
  const back = await api<NonNullable<Entry>>(pm, '/stock/site-returns', { method: 'POST', body: { projectId: road.id, date: today, issuedTo: 'E2E gang', lines: [{ itemId: cement.itemId, quantity: '1' }] } });
  expect(back.entryNo).toMatch(/^RFS-/);
  expect(await cost()).toBeCloseTo(before - rate, 2);

  const tooMuch = String(Number(cement.balance) + 1000);
  await expect(api(pm, '/stock/vendor-returns', { method: 'POST', body: { projectId: road.id, date: today, supplier: 'Utkal Cement Traders', remarks: 'E2E: too much', lines: [{ itemId: cement.itemId, quantity: tooMuch }] } })).rejects.toThrow(
    /409/,
  );

  // Older phone builds list only receipts, issues and adjustments.
  const legacy = await api<Page<NonNullable<Entry>>>(pm, `/stock/entries?projectId=${road.id}&pageSize=100`);
  expect(legacy.items.every((e) => ['RECEIPT', 'ISSUE', 'ADJUSTMENT'].includes(e.type))).toBe(true);
  const all = await api<Page<NonNullable<Entry>>>(pm, `/stock/entries?projectId=${road.id}&pageSize=100&allTypes=true`);
  expect(all.items.some((e) => e.type === 'RETURN_FROM_SITE')).toBe(true);

  // Undo the return so the project's cost is as seeded.
  await api(pm, `/stock/entries/${back.id}`, { method: 'DELETE' });
});

test('a stock count posts the differences as one adjustment, and stock value shows by age', async ({ page }) => {
  const pm = await apiToken('pm@demo.com');
  const road = (await api<Page<Project>>(pm, '/projects?pageSize=100')).items.find((p) => p.code === 'RD-2026-01')!;
  const first = (await balances(pm, road.id)).sort((a, b) => a.itemName.localeCompare(b.itemName))[0];

  await signIn(page, 'pm@demo.com');
  await page.goto(`/projects/${road.id}?tab=stock`);
  await page.getByRole('button', { name: /More/ }).click();
  await page.getByRole('menuitem', { name: 'Stock count' }).click();
  const modal = page.locator('.ant-modal').filter({ hasText: 'Stock count' });
  await modal.getByLabel(`Counted ${first.itemName}`).fill(String(Number(first.balance) + 2));
  await expect(modal.getByText('1 counted, 1 differs')).toBeVisible();
  await modal.getByRole('button', { name: 'Post count' }).click();
  await page.locator('.ant-modal-confirm').getByRole('button', { name: 'Post' }).click();
  await expect(page.getByText(/posted: 1 item corrected/)).toBeVisible();
  expect(await balanceOf(pm, road.id, first.itemId)).toBe(Number(first.balance) + 2);

  // A count that matches changes nothing; then put the stock back as it was.
  const same = await api<{ entry: Entry }>(pm, '/stock/counts', { method: 'POST', body: { projectId: road.id, date: localToday(), lines: [{ itemId: first.itemId, countedQty: String(Number(first.balance) + 2) }] } });
  expect(same.entry).toBeNull();
  await api(pm, '/stock/counts', { method: 'POST', body: { projectId: road.id, date: localToday(), lines: [{ itemId: first.itemId, countedQty: first.balance }] } });

  await page.getByRole('tab', { name: 'Value and ageing' }).click();
  await expect(page.locator('.stock-valuation').getByText('Stock value')).toBeVisible();
  const value = await api<{ totalValue: string; ageingValue: string[] }>(pm, `/stock/valuation?projectId=${road.id}`);
  expect(value.ageingValue.reduce((s, v) => s + Number(v), 0)).toBeCloseTo(Number(value.totalValue), 0);

  const engineer = await apiToken('engineer@demo.com');
  await expect(api(engineer, '/stock/valuation')).rejects.toThrow(/403/);
});
