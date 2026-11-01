import { expect, test } from '@playwright/test';
import { api, apiToken, localToday, signIn } from './helpers';

interface Page<T> {
  items: T[];
}
type Project = { id: string; code: string };
type Component = { id: string; name: string; sharePct: string; baseIndex: string };
type Contract = { priceVariation: boolean; pvBaseDate: string | null; pvComponents: Component[] };
type Bill = {
  id: string;
  billLabel: string;
  status: string;
  grossAmount: string;
  pvAmount: string;
  gstRate: string;
  gstAmount: string;
  totalDeductions: string;
  netPayable: string;
  invoiceAmount: string;
  pvLines: { name: string; amount: string }[];
};

const restoreBody = (c: Contract) => ({ pvBaseDate: c.pvBaseDate, components: c.pvComponents.map(({ name, sharePct, baseIndex }) => ({ name, sharePct, baseIndex })) });

async function roadProject(token: string) {
  return (await api<Page<Project>>(token, '/projects?pageSize=100')).items.find((p) => p.code === 'RD-2026-01')!;
}

/** Price variation: the formula on the contract tab, each component a share of the work value with a base index. */
test('a project manager sets the price variation formula', async ({ page }) => {
  const pm = await apiToken('pm@demo.com');
  const road = await roadProject(pm);
  const before = await api<Contract>(pm, `/projects/${road.id}/contract`);
  expect(before.priceVariation).toBe(true);
  try {
    await signIn(page, 'pm@demo.com');
    await page.goto(`/projects/${road.id}?tab=contract`);
    await page.getByRole('button', { name: 'Edit formula' }).click();
    const modal = page.locator('.ant-modal').filter({ hasText: 'Price variation formula' });
    await modal.getByRole('button', { name: 'Remove component' }).first().click();
    await modal.getByRole('button', { name: 'Add component' }).click();
    const last = modal.locator('.pv-form .ant-space').filter({ has: page.getByRole('button', { name: 'Remove component' }) }).last();
    await last.locator('input').nth(0).fill('Sand (e2e)');
    await last.locator('input').nth(1).fill('12');
    await last.locator('input').nth(2).fill('100');
    await modal.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Price variation formula saved')).toBeVisible();
    const table = page.locator('.pv-formula');
    await expect(table).toContainText('Sand (e2e)');
    await expect(table).toContainText('12%');

    // Shares past 100% are refused.
    await expect(
      api(pm, `/projects/${road.id}/contract/price-variation`, { method: 'PUT', body: { components: [{ name: 'A', sharePct: '60', baseIndex: '100' }, { name: 'B', sharePct: '50', baseIndex: '100' }] } }),
    ).rejects.toThrow(/100%/);
    // Site engineers cannot change it.
    const engineer = await apiToken('engineer@demo.com');
    await expect(api(engineer, `/projects/${road.id}/contract/price-variation`, { method: 'PUT', body: { components: [] } })).rejects.toThrow(/403/);
  } finally {
    await api(pm, `/projects/${road.id}/contract/price-variation`, { method: 'PUT', body: restoreBody(before) });
  }
});

/**
 * The quantity surveyor fills in this month's indices on a draft bill: each component adds work value × share ×
 * (current − base) / base, and GST and the deductions are on work value + price variation.
 */
test('price variation on an RA bill from the indices', async ({ page }) => {
  const qs = await apiToken('qs@demo.com');
  const pm = await apiToken('pm@demo.com');
  const road = await roadProject(qs);
  for (const b of (await api<Page<Bill>>(qs, `/ra-bills?projectId=${road.id}&pageSize=100`)).items) {
    if (b.status !== 'APPROVED') await api(qs, `/ra-bills/${b.id}`, { method: 'DELETE' });
  }
  const contract = await api<Contract>(pm, `/projects/${road.id}/contract`);
  const [first, ...rest] = contract.pvComponents;
  expect(first).toBeTruthy();
  const boq = await api<{ id: string; itemNo: string }[]>(qs, `/projects/${road.id}/boq`);
  const wmm = boq.find((b) => b.itemNo === '3.02')!;
  const today = localToday();
  const sheet = await api<{ id: string }>(qs, '/measurements', {
    method: 'POST',
    body: { projectId: road.id, boqItemId: wmm.id, date: today, location: 'Ch 0+400 to 0+450 (e2e PV)', lines: [{ description: 'WMM base course', nos: '1', length: '50', breadth: '7', depth: '0.25' }] },
  });
  await api(pm, `/approvals/measurement/${sheet.id}/review`, { method: 'POST', body: { decision: 'APPROVE' } });
  const bill = await api<Bill>(qs, '/ra-bills', { method: 'POST', body: { projectId: road.id, billDate: today } });
  try {
    await signIn(page, 'qs@demo.com');
    await page.goto(`/bills?id=${bill.id}`);
    const drawer = page.locator('.ant-drawer').filter({ hasText: 'Abstract of cost' });
    await drawer.getByRole('button', { name: 'Enter indices' }).click();
    const modal = page.locator('.ant-modal').filter({ hasText: `Price variation on ${bill.billLabel}` });
    // The first component's index is up 10%; the others did not move.
    const up = (Number(first.baseIndex) * 1.1).toFixed(3);
    await modal.getByLabel(new RegExp(`^${first.name.replace(/[()]/g, '\\$&')} \\(`)).fill(up);
    for (const c of rest) await modal.getByLabel(new RegExp(`^${c.name.replace(/[()]/g, '\\$&')} \\(`)).fill(c.baseIndex);
    await modal.getByLabel('Source').fill('RBI WPI (e2e)');
    await modal.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(new RegExp(`Price variation .* added to ${bill.billLabel}`))).toBeVisible();
    await expect(drawer.locator('.bill-pv')).toContainText(first.name);

    const b = await api<Bill>(qs, `/ra-bills/${bill.id}`);
    const gross = Number(b.grossAmount);
    const pv = Number(b.pvAmount);
    expect(pv).toBeCloseTo((gross * Number(first.sharePct)) / 100 / 10, 0);
    expect(b.pvLines.filter((l) => Number(l.amount) !== 0)).toHaveLength(1);
    expect(Number(b.gstAmount)).toBeCloseTo(((gross + pv) * Number(b.gstRate)) / 100, 1);
    expect(Number(b.netPayable)).toBeCloseTo(gross + pv + Number(b.gstAmount) - Number(b.totalDeductions), 1);
    expect(Number(b.invoiceAmount)).toBeCloseTo(gross + pv + Number(b.gstAmount), 1);

    // Taking it off puts the bill back on work value alone.
    const cleared = await api<Bill>(qs, `/ra-bills/${bill.id}/price-variation`, { method: 'PUT', body: { indices: [] } });
    expect(Number(cleared.pvAmount)).toBe(0);
    expect(cleared.pvLines).toHaveLength(0);
  } finally {
    await api(qs, `/ra-bills/${bill.id}`, { method: 'DELETE' });
  }
});
