import { expect, test } from '@playwright/test';
import { api, apiToken, chooseOption, signIn, formPanel } from './helpers';

interface Page<T> {
  items: T[];
}
type Mr = { id: string; requestNo: string; items: { id: string }[] };
type Po = { id: string; poNo: string; status: string; lines: { id: string; quantity: string; rate: string }[] };
type Bill = { id: string; billNo: string; matched: boolean; exceptions: string[]; dueDate: string; invoiceDate: string };

/**
 * Purchase orders (v3 item 21): procurement enters two quotations on an approved request, raises the PO on the cheaper
 * one from the comparative statement, management approves it, the store receives part of it against the PO, and
 * accounts records the vendor's invoice, which matches the PO and the GRN. Billing more than was received is flagged.
 */
test('quotation to PO to GRN to a matched vendor bill', async ({ page, browser }) => {
  const engineer = await apiToken('engineer@demo.com');
  const pm = await apiToken('pm@demo.com');
  const md = await apiToken('md@demo.com');
  const store = await apiToken('store@demo.com');
  const accounts = await apiToken('accounts@demo.com');
  const procurement = await apiToken('procurement@demo.com');
  const projects = await api<Page<{ id: string; code: string }>>(engineer, '/projects?pageSize=100');
  const road = projects.items.find((p) => p.code === 'RD-2026-01')!;
  const vendors = (await api<Page<{ id: string; name: string }>>(procurement, '/vendors?pageSize=100')).items;
  const other = vendors.find((v) => v.name === 'Kalinga Safety Store')!;

  // An approved request with one line
  const mr = await api<Mr>(engineer, '/material-requests', {
    method: 'POST',
    body: { projectId: road.id, requiredDate: new Date().toISOString().slice(0, 10), items: [{ itemName: 'Binding wire 18 SWG (e2e)', unit: 'Kg', quantity: '100' }], submit: true },
  });
  await api(pm, `/approvals/material_request/${mr.id}/review`, { method: 'POST', body: { decision: 'APPROVE' } });
  // The dearer quotation goes in through the API, the cheaper one through the form.
  await api(procurement, '/quotations', {
    method: 'POST',
    body: { materialRequestId: mr.id, vendorId: other.id, quoteDate: new Date().toISOString().slice(0, 10), lines: [{ materialRequestItemId: mr.items[0].id, rate: '92', gstRate: '18' }] },
  });

  await signIn(page, 'procurement@demo.com');
  await page.goto(`/requests-to-order/${mr.id}?tab=quotations`);
  await page.getByRole('button', { name: 'Record quotation' }).click();
  let modal = formPanel(page, 'Record quotation');
  await chooseOption(modal.getByLabel('Vendor'), 'Sahoo Auto');
  await modal.getByLabel('Their quotation no.').fill('SAP/E2E/1');
  await modal.getByLabel('Rate for Binding wire 18 SWG (e2e)').fill('85');
  await modal.getByRole('button', { name: 'Save quotation' }).click();
  await expect(page.getByText('Quotation from Sahoo Auto Parts added')).toBeVisible();

  // The cheaper quotation is L1; finalise it and make the PO on it.
  await page.getByRole('tab', { name: /Finalise L1/ }).click();
  await page.getByRole('row').filter({ hasText: 'Sahoo Auto Parts' }).getByRole('button', { name: 'Finalise L1', exact: true }).click();
  await page.getByRole('button', { name: 'New purchase order on Sahoo Auto Parts' }).click();
  modal = formPanel(page, `Purchase order for ${mr.requestNo}`);
  await expect(modal.getByLabel('Rate of line 1')).toHaveValue('85');
  await expect(modal.getByLabel('Quantity of line 1')).toHaveValue('100');
  await modal.getByRole('button', { name: 'Save and submit' }).click();
  await expect(page.getByText(/PO-\d{4}-\d{4} submitted for approval/)).toBeVisible();

  const po = (await api<Page<Po>>(procurement, `/purchase-orders?materialRequestId=${mr.id}`)).items[0];
  expect(po.status).toBe('SUBMITTED');
  expect(po.lines[0].rate).toBe('85.00');
  // Ordering more than the request needs is refused.
  await expect(
    api(procurement, '/purchase-orders', { method: 'POST', body: { projectId: road.id, vendorId: other.id, materialRequestId: mr.id, lines: [{ materialRequestItemId: mr.items[0].id, quantity: '1', rate: '90' }] } }),
  ).rejects.toThrow(/fully ordered/);

  await api(md, `/approvals/purchase_order/${po.id}/review`, { method: 'POST', body: { decision: 'APPROVE' } });
  await api(store, '/stock/receipts', { method: 'POST', body: { purchaseOrderId: po.id, date: new Date().toISOString().slice(0, 10), lines: [{ purchaseOrderLineId: po.lines[0].id, quantity: '60' }] } });

  // Accounts records the invoice for the 60 kg received, in a session of their own.
  const accountsContext = await browser.newContext();
  page = await accountsContext.newPage();
  await signIn(page, 'accounts@demo.com');
  await page.goto(`/purchase-orders?id=${po.id}`);
  const poDrawer = page.locator('.ant-drawer').filter({ hasText: po.poNo });
  await expect(poDrawer.getByText('GRN-', { exact: false }).first()).toBeVisible();
  await poDrawer.getByRole('button', { name: 'Record vendor bill' }).click();
  modal = formPanel(page, 'Record vendor bill');
  await expect(modal.getByLabel('Quantity billed of Binding wire 18 SWG (e2e)')).toHaveValue('60');
  const invoiceNo = `E2E-${Date.now()}`;
  await modal.getByLabel("Vendor's invoice no.").fill(invoiceNo);
  await modal.getByRole('button', { name: 'Save and submit' }).click();
  await expect(page.getByText(/VB-\d{4}-\d{4} submitted for approval$/)).toBeVisible();

  const bill = (await api<Page<Bill>>(accounts, `/vendor-bills?q=${invoiceNo}`)).items[0];
  expect(bill.matched).toBe(true);
  // Sahoo Auto Parts is a micro enterprise: due within 45 days whatever the PO says.
  expect((Date.parse(bill.dueDate) - Date.parse(bill.invoiceDate)) / 86400000).toBeLessThanOrEqual(45);

  // A second invoice for the same 60 kg is billed over what was received.
  const again = await api<Bill>(accounts, '/vendor-bills', {
    method: 'POST',
    body: { purchaseOrderId: po.id, invoiceNo: `${invoiceNo}-2`, invoiceDate: new Date().toISOString().slice(0, 10), lines: [{ purchaseOrderLineId: po.lines[0].id, quantity: '60', rate: '85' }] },
  });
  expect(again.matched).toBe(false);
  expect(again.exceptions.join(' ')).toContain('on other bills');
  await api(accounts, `/vendor-bills/${again.id}`, { method: 'DELETE' });
  await accountsContext.close();
});

test('a site engineer sees purchase orders but not vendor bills', async ({ page }) => {
  await signIn(page, 'engineer@demo.com');
  await expect(page.getByRole('link', { name: 'Purchase orders' })).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Vendor bills' })).toHaveCount(0);
});
