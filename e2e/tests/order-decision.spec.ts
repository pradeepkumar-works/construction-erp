import { expect, test } from '@playwright/test';
import { api, apiToken, signIn } from './helpers';

interface Page<T> {
  items: T[];
}
type Mr = { id: string; requestNo: string; items: { id: string; itemName: string }[] };
type Quote = { id: string; vendorName: string; total: string };
type Po = { id: string; poNo: string };

/**
 * What the approver sees on a purchase order (finding 15 of the October review): the card showed no quotes, no lowest
 * bidder and no budget, and Delete sat a tap from Approve. The order now carries the request's quotations and the
 * project's material budget, and Delete lives in the ⋯ menu.
 */
test.describe('deciding a purchase order', () => {
  let po: Po;
  let quotes: Quote[];
  const stamp = Date.now();
  const item = `Shuttering ply (e2e ${stamp})`;

  test.beforeAll(async () => {
    const engineer = await apiToken('engineer@demo.com');
    const pm = await apiToken('pm@demo.com');
    const procurement = await apiToken('procurement@demo.com');
    const road = (await api<Page<{ id: string; code: string }>>(engineer, '/projects?pageSize=100')).items.find((p) => p.code === 'RD-2026-01')!;
    const vendors = (await api<Page<{ id: string; name: string }>>(procurement, '/vendors?pageSize=100')).items;
    const [cheap, dear] = [vendors.find((v) => v.name === 'Kalinga Safety Store')!, vendors.find((v) => v.name === 'Sahoo Auto Parts')!];

    const mr = await api<Mr>(engineer, '/material-requests', {
      method: 'POST',
      body: { projectId: road.id, requiredDate: new Date().toISOString().slice(0, 10), items: [{ itemName: item, unit: 'Nos', quantity: '60' }], submit: true },
    });
    await api(pm, `/approvals/material_request/${mr.id}/review`, { method: 'POST', body: { decision: 'APPROVE' } });
    const quote = (vendorId: string, rate: string) =>
      api<Quote>(procurement, '/quotations', {
        method: 'POST',
        body: { materialRequestId: mr.id, vendorId, quoteDate: new Date().toISOString().slice(0, 10), lines: [{ materialRequestItemId: mr.items[0].id, rate, gstRate: '18' }] },
      });
    quotes = [await quote(cheap.id, '1450'), await quote(dear.id, '1620')];
    // The order goes to the cheaper quotation, as it should.
    po = await api<Po>(procurement, '/purchase-orders', {
      method: 'POST',
      body: { projectId: road.id, vendorId: cheap.id, materialRequestId: mr.id, quotationId: quotes[0].id, lines: [{ materialRequestItemId: mr.items[0].id, itemName: item, unit: 'Nos', quantity: '60', rate: '1450', gstRate: '18' }] },
    });
  });

  test('Delete is in the ⋯ menu, not a tap from Approve', async ({ page }) => {
    await signIn(page, 'procurement@demo.com');
    await page.goto(`/purchase-orders/${po.id}`);
    const bar = page.getByRole('toolbar', { name: 'Record actions' });
    await expect(bar.getByRole('button', { name: 'Submit for approval' })).toBeVisible();
    await expect(bar.getByRole('button', { name: 'Delete' })).toHaveCount(0);
    await bar.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    // The one delete confirmation, with the order named; Keep leaves it alone.
    await expect(page.getByText(`Delete purchase order ${po.poNo}?`)).toBeVisible();
    await page.getByRole('button', { name: 'Keep' }).click();
    await api(await apiToken('procurement@demo.com'), `/purchase-orders/${po.id}/submit`, { method: 'POST' });
  });

  test('the approver sees who else quoted and what it does to the budget', async ({ page }) => {
    await signIn(page, 'md@demo.com');
    await page.goto(`/purchase-orders/${po.id}`);
    const quotes = page.locator('#record-quotes');
    await expect(quotes).toBeVisible();
    const cheapRow = quotes.getByRole('row', { name: /Kalinga Safety Store/ });
    await expect(cheapRow).toContainText('Lowest');
    await expect(cheapRow).toContainText('This order');
    await expect(quotes.getByRole('row', { name: /Sahoo Auto Parts/ })).toContainText('₹');

    // The project's material budget, what it has cost and where this order takes it.
    const budget = page.locator('#record-budget');
    await expect(budget).toContainText('Material budget ₹');
    await expect(budget).toContainText('takes it to ₹');
  });
});
