import { expect, test } from '@playwright/test';
import { API_URL, PASSWORD, api, apiToken, signIn } from './helpers';

type Project = { id: string };
type Plan = { matches: { itemNo: string; normKey: string; hasNorms: boolean }[]; unmatchedCount: number; newItems: { name: string }[] };
type Reconciliation = { norms: { boqItemNo: string; itemName: string; qtyPerUnit: string; wastagePct: string }[] };

/**
 * The standard norms library: a new project's reconciliation was empty, because a
 * norm had to be typed for every BOQ item first. The library now reads the BOQ and offers the usual figures.
 */
test('a new project adopts the standard norms and its reconciliation has something to check', async ({ page }) => {
  const stamp = Date.now();
  const email = `norms-${stamp}@e2e.test`;
  const res = await fetch(`${API_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ organizationName: `E2E Norms ${stamp}`, fullName: 'Meera Surveyor', email, password: PASSWORD }),
  });
  expect(res.ok).toBe(true);
  const owner = await apiToken(email);

  const project = await api<Project>(owner, '/projects', { method: 'POST', body: { code: 'NRM-01', name: 'E2E building package', type: 'BUILDING' } });
  for (const item of [
    { itemNo: '1.01', description: 'Earthwork in excavation in ordinary soil', unit: 'Cum', rate: '210', originalQty: '2400' },
    { itemNo: '2.01', description: 'Providing and laying PCC 1:4:8 under footings', unit: 'Cum', rate: '4850', originalQty: '180' },
    { itemNo: '2.02', description: 'RCC M25 in columns and beams', unit: 'Cum', rate: '7400', originalQty: '640' },
    { itemNo: '3.01', description: 'Brick work in cement mortar 1:6 in superstructure', unit: 'Cum', rate: '6200', originalQty: '420' },
  ])
    await api(owner, `/projects/${project.id}/boq`, { method: 'POST', body: item });

  // The plan before anything is written: three of the four recognised, and the items it would add.
  const plan = await api<Plan>(owner, `/reconciliation/projects/${project.id}/standard-norms`);
  expect(plan.matches.map((m) => [m.itemNo, m.normKey])).toEqual([
    ['2.01', 'pcc-m75'],
    ['2.02', 'rcc-m25'],
    ['3.01', 'brickwork'],
  ]);
  expect(plan.unmatchedCount).toBe(1);
  expect(plan.newItems.map((i) => i.name)).toContain('OPC 53 Grade Cement');

  await signIn(page, email);
  await page.goto(`/projects/${project.id}?tab=reconciliation`);
  await page.getByRole('button', { name: 'Add standard norms' }).first().click();
  const modal = page.getByRole('dialog', { name: 'Add standard norms' });
  await expect(modal.getByRole('row', { name: /RCC M25 in columns/ })).toContainText('8.8 Bags');
  await expect(modal).toContainText('will be added to the item master');
  await modal.getByRole('button', { name: 'Add norms to 3 BOQ items' }).click();
  await expect(page.getByText(/norms set on 3 BOQ items/)).toBeVisible();

  // The norms are on the project, cement counted in bags per cum.
  const after = await api<Reconciliation>(owner, `/reconciliation/projects/${project.id}`);
  const cement = after.norms.filter((n) => n.itemName === 'OPC 53 Grade Cement');
  expect(cement.map((n) => [n.boqItemNo, n.qtyPerUnit])).toEqual([
    ['2.01', '3.4'],
    ['2.02', '8.8'],
    ['3.01', '1.26'],
  ]);
  expect(cement[0].wastagePct).toBe('2');

  // Adopting again changes nothing, so a surveyor's own figures are safe.
  const second = await api<Plan>(owner, `/reconciliation/projects/${project.id}/standard-norms`);
  expect(second.matches.every((m) => m.hasNorms)).toBe(true);
  const again = await api<{ boqItems: number; skipped: number }>(owner, `/reconciliation/projects/${project.id}/standard-norms`, { method: 'POST', body: {} });
  expect([again.boqItems, again.skipped]).toEqual([0, 3]);
});
