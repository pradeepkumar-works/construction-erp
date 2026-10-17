import { expect, test } from '@playwright/test';
import { api, apiToken, chooseOption, formPanel, signIn } from './helpers';

interface Page<T> {
  items: T[];
}
type Boq = { id: string; itemNo: string; originalQty: string; revisedQty: string | null; rate: string };
type Summary = { projectId: string; approved: string; revisedContractValue: string | null };

/**
 * Variation register (v4 item 37): the QS claims more WMM and a new item on the road project, sends it to the client
 * and records the client's approval at a lower rate for the new item. The BOQ gets the quantities and the new item,
 * and the revised contract value goes up by what was approved.
 */
test('a variation approved by the client revises the BOQ and the contract value', async ({ page }) => {
  const qs = await apiToken('qs@demo.com');
  const road = (await api<Page<{ id: string; code: string }>>(qs, '/projects?pageSize=100')).items.find((p) => p.code === 'RD-2026-01')!;
  const boqBefore = await api<Boq[]>(qs, `/projects/${road.id}/boq`);
  const wmm = boqBefore.find((b) => b.itemNo === '3.02')!;
  const before = (await api<Summary[]>(qs, `/variations/summary?projectId=${road.id}`))[0];
  const itemNo = `E2E.${Date.now() % 100000}`;

  await signIn(page, 'qs@demo.com');
  await page.goto(`/projects/${road.id}?tab=variations`);
  await page.getByRole('button', { name: 'New variation' }).click();
  const modal = formPanel(page, 'New variation');
  await modal.getByLabel('Title').fill('E2E: more WMM and a drain');
  const lines = modal.locator('.variation-line');
  await chooseOption(lines.nth(0).getByLabel('BOQ item'), 'Wet Mix');
  await lines.nth(0).getByLabel(/Quantity added/).fill('50');
  await modal.getByRole('button', { name: 'Add item' }).click();
  await chooseOption(lines.nth(1).getByLabel('BOQ item'), 'New item');
  await lines.nth(1).getByLabel('Item no.').fill(itemNo);
  await lines.nth(1).getByLabel('Description').fill('Lined drain at the toll plaza');
  await lines.nth(1).getByLabel('Unit').fill('Rmt');
  await lines.nth(1).getByLabel('Quantity').fill('20');
  await lines.nth(1).getByLabel('Proposed rate').fill('1500');
  await modal.getByRole('button', { name: 'Prepare' }).click();

  const drawer = page.locator('.ant-drawer').filter({ hasText: 'E2E: more WMM and a drain' });
  await expect(drawer.getByText('Draft', { exact: true })).toBeVisible();
  await drawer.getByRole('button', { name: 'Send to client' }).click();
  const send = page.locator('.ant-modal').filter({ hasText: 'to the client' });
  await send.getByLabel('Our letter reference').fill('E2E/VAR/1');
  await send.getByRole('button', { name: 'Record' }).click();
  await expect(drawer.getByText('With client', { exact: true })).toBeVisible();

  await drawer.getByRole('button', { name: 'Record decision' }).click();
  const decide = page.locator('.ant-modal').filter({ hasText: "Client's decision" });
  await decide.getByLabel("Client's order or letter").fill('EE/E2E/9');
  await decide.getByLabel('Rate', { exact: true }).fill('1400');
  await decide.getByRole('button', { name: 'Record' }).click();
  await expect(drawer.getByText('Approved by client', { exact: true })).toBeVisible();

  const boqAfter = await api<Boq[]>(qs, `/projects/${road.id}/boq`);
  const wmmAfter = boqAfter.find((b) => b.id === wmm.id)!;
  expect(Number(wmmAfter.revisedQty)).toBe(Number(wmm.revisedQty ?? wmm.originalQty) + 50);
  const added = boqAfter.find((b) => b.itemNo === itemNo)!;
  expect(Number(added.revisedQty)).toBe(20);
  expect(Number(added.rate)).toBe(1400);
  const after = (await api<Summary[]>(qs, `/variations/summary?projectId=${road.id}`))[0];
  const approved = 50 * Number(wmm.rate) + 20 * 1400;
  expect(Number(after.approved) - Number(before.approved)).toBeCloseTo(approved, 2);
  expect(Number(after.revisedContractValue) - Number(before.revisedContractValue)).toBeCloseTo(approved, 2);
});

test('an extra item gets its quantity only from a variation', async () => {
  const qs = await apiToken('qs@demo.com');
  const road = (await api<Page<{ id: string; code: string }>>(qs, '/projects?pageSize=100')).items.find((p) => p.code === 'RD-2026-01')!;
  const kerb = (await api<Boq[]>(qs, `/projects/${road.id}/boq`)).find((b) => b.itemNo === '6.02')!;
  expect(Number(kerb.revisedQty ?? kerb.originalQty)).toBe(0);
  await expect(api(qs, `/projects/${road.id}/boq/${kerb.id}`, { method: 'PATCH', body: { revisedQty: '10' } })).rejects.toThrow(/400/);
  const engineer = await apiToken('engineer@demo.com');
  await expect(api(engineer, '/variations')).rejects.toThrow(/403/);
});
