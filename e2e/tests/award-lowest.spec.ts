import { expect, test } from '@playwright/test';
import { api, apiToken, signIn } from './helpers';

interface Page<T> {
  items: T[];
}
type Mr = { id: string; requestNo: string; items: { id: string; itemName: string }[] };
type Po = { id: string; poNo: string; status: string; vendorName: string; deliveryAddress: string | null; lines: { itemName: string; quantity: string; rate: string }[] };

/**
 * Award the lowest rate per item: the comparative statement marks the cheapest rate
 * for each item, but an order goes to one vendor, so the buyer used to raise each one by hand. One button now splits
 * the request between the winners, and the orders take the project's own delivery address.
 */
test('the request splits between the vendors who quoted lowest, and the orders know where to deliver', async ({ page }) => {
  const engineer = await apiToken('engineer@demo.com');
  const pm = await apiToken('pm@demo.com');
  const procurement = await apiToken('procurement@demo.com');
  const road = (await api<Page<{ id: string; code: string; siteAddress: string | null }>>(engineer, '/projects?pageSize=100')).items.find((p) => p.code === 'RD-2026-01')!;
  const vendors = (await api<Page<{ id: string; name: string }>>(procurement, '/vendors?pageSize=100')).items;
  const safety = vendors.find((v) => v.name === 'Kalinga Safety Store')!;
  const auto = vendors.find((v) => v.name === 'Sahoo Auto Parts')!;
  const stamp = Date.now();
  const [gloves, boots] = [`Hand gloves (e2e ${stamp})`, `Safety boots (e2e ${stamp})`];

  const mr = await api<Mr>(engineer, '/material-requests', {
    method: 'POST',
    body: {
      projectId: road.id,
      requiredDate: new Date().toISOString().slice(0, 10),
      items: [
        { itemName: gloves, unit: 'Nos', quantity: '100' },
        { itemName: boots, unit: 'Nos', quantity: '40' },
      ],
      submit: true,
    },
  });
  await api(pm, `/approvals/material_request/${mr.id}/review`, { method: 'POST', body: { decision: 'APPROVE' } });
  // Each vendor is cheaper on one item: gloves from the safety store, boots from the other.
  const quote = (vendorId: string, rates: string[], freight: string) =>
    api(procurement, '/quotations', {
      method: 'POST',
      body: {
        materialRequestId: mr.id,
        vendorId,
        quoteDate: new Date().toISOString().slice(0, 10),
        freight,
        lines: mr.items.map((i, n) => ({ materialRequestItemId: i.id, rate: rates[n], gstRate: '18' })),
      },
    });
  await quote(safety.id, ['45', '1150'], '0');
  await quote(auto.id, ['52', '980'], '500');

  await signIn(page, 'procurement@demo.com');
  await page.goto(`/requests-to-order/${mr.id}`);
  await page.getByRole('button', { name: 'Finalise L1 per item' }).click();
  await expect(page.getByRole('tab', { name: /Purchase order/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Make the draft orders' }).click();
  const modal = page.getByRole('dialog', { name: `Finalise L1 per item on ${mr.requestNo}` });
  await expect(modal.getByRole('row', { name: /Hand gloves/ })).toContainText('Kalinga Safety Store');
  await expect(modal.getByRole('row', { name: /Safety boots/ })).toContainText('Sahoo Auto Parts');
  // 100 × 45 and 40 × 980 + 500 freight, against the whole lot from the cheapest single quotation.
  await expect(modal).toContainText('less than ordering it all from');
  await modal.getByRole('button', { name: 'Make 2 draft orders' }).click();
  await expect(page.getByText(/2 draft orders made: PO-\d{4}-\d{4}, PO-\d{4}-\d{4}/)).toBeVisible();

  const orders = (await api<Page<Po>>(procurement, `/purchase-orders?materialRequestId=${mr.id}&pageSize=10`)).items;
  expect(orders).toHaveLength(2);
  const safetyOrder = orders.find((o) => o.vendorName === 'Kalinga Safety Store')!;
  const autoOrder = orders.find((o) => o.vendorName === 'Sahoo Auto Parts')!;
  expect(safetyOrder.status).toBe('DRAFT');
  expect(safetyOrder.lines.map((l) => [l.itemName, l.rate])).toEqual([[gloves, '45.00']]);
  expect(autoOrder.lines.map((l) => [l.itemName, l.rate])).toEqual([[boots, '980.00']]);
  // Nobody typed an address: both orders go to the project's own.
  expect([safetyOrder.deliveryAddress, autoOrder.deliveryAddress]).toEqual([road.siteAddress, road.siteAddress]);
  expect(road.siteAddress).toBeTruthy();
});
