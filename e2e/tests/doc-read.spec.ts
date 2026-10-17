import { expect, test } from '@playwright/test';
import { api, apiToken, formPanel, signIn } from './helpers';

interface Page<T> {
  items: T[];
}
type Po = { id: string; poNo: string; lines: { id: string }[]; vendorBills?: { id: string }[] };
type Bill = { id: string; billNo: string; invoiceNo: string; attachments: { fileName: string }[] };

/** A small PNG, enough for the browser to open as a photo; the stand-in model (AI_PROVIDER=fake) "reads" it. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFElEQVR4nGP4TyJgGNUwqmH4agAAr639H708R/EAAAAASUVORK5CYII=', 'base64');

/** An approved PO from Sahoo Auto Parts for 100 kg of binding wire, 60 kg of it received. */
async function orderWithReceipt(): Promise<Po> {
  const engineer = await apiToken('engineer@demo.com');
  const pm = await apiToken('pm@demo.com');
  const md = await apiToken('md@demo.com');
  const store = await apiToken('store@demo.com');
  const procurement = await apiToken('procurement@demo.com');
  const road = (await api<Page<{ id: string; code: string }>>(engineer, '/projects?pageSize=100')).items.find((p) => p.code === 'RD-2026-01')!;
  const sahoo = (await api<Page<{ id: string; name: string }>>(procurement, '/vendors?pageSize=100')).items.find((v) => v.name === 'Sahoo Auto Parts')!;
  const mr = await api<{ id: string; items: { id: string }[] }>(engineer, '/material-requests', {
    method: 'POST',
    body: { projectId: road.id, requiredDate: new Date().toISOString().slice(0, 10), items: [{ itemName: 'Binding wire 18 SWG (e2e)', unit: 'Kg', quantity: '100' }], submit: true },
  });
  await api(pm, `/approvals/material_request/${mr.id}/review`, { method: 'POST', body: { decision: 'APPROVE' } });
  const po = await api<Po>(procurement, '/purchase-orders', {
    method: 'POST',
    body: { projectId: road.id, vendorId: sahoo.id, materialRequestId: mr.id, lines: [{ materialRequestItemId: mr.items[0].id, quantity: '100', rate: '85', gstRate: '18' }], submit: true },
  });
  await api(md, `/approvals/purchase_order/${po.id}/review`, { method: 'POST', body: { decision: 'APPROVE' } });
  await api(store, '/stock/receipts', { method: 'POST', body: { purchaseOrderId: po.id, date: new Date().toISOString().slice(0, 10), lines: [{ purchaseOrderLineId: po.lines[0].id, quantity: '60' }] } });
  return po;
}

/**
 * Reading invoices, challans and drawings (AI item 70): a photo fills the form, each value says where on the page it
 * came from, a value read with low confidence is marked to check, the bill's checks run on the draft, and nothing is
 * saved until Save. The model is the scripted stand-in, which reads binding wire from Sahoo Auto Parts off any page.
 */
test('an invoice photo fills the vendor bill, with checks on the draft, and nothing is saved before Save', async ({ page }) => {
  const po = await orderWithReceipt();
  const accounts = await apiToken('accounts@demo.com');
  const billsBefore = (await api<Po>(accounts, `/purchase-orders/${po.id}`)).vendorBills?.length ?? 0;

  await signIn(page, 'accounts@demo.com');
  await page.goto(`/purchase-orders?id=${po.id}`);
  await page.locator('.ant-drawer').filter({ hasText: po.poNo }).getByRole('button', { name: 'Record vendor bill' }).click();
  const modal = formPanel(page, 'Record vendor bill');
  const chooser = page.waitForEvent('filechooser');
  await modal.getByRole('button', { name: 'Fill from invoice' }).click();
  await (await chooser).setFiles({ name: 'sahoo-invoice.png', mimeType: 'image/png', buffer: PNG });

  await expect(modal.getByText('Filled from sahoo-invoice.png')).toBeVisible();
  await expect(modal.getByLabel("Vendor's invoice no.")).toHaveValue('SAP/26-27/0412');
  await expect(modal.getByLabel('Quantity billed of Binding wire 18 SWG (e2e)')).toHaveValue('40');
  // The date and the rate were hard to read: the date's field says so, the rate's box is amber.
  await expect(modal.getByText(/Check this: hard to read/)).toBeVisible();
  await expect(modal.locator('[class*="input-number"][class*="status-warning"]').filter({ has: page.getByLabel('Rate of Binding wire 18 SWG (e2e)') })).not.toHaveCount(0);
  // Pointing at where a value came from shows its box on the page.
  await modal.getByRole('button', { name: /From the invoice/ }).first().hover();
  await expect(modal.locator('[data-read-box]')).not.toHaveCount(0);
  // Item 69's checks run on the draft: 40 of the 60 kg received, at the PO rate, adding up to the printed total.
  const checks = modal.locator('.draft-bill-checks');
  await expect(checks.getByText(/All \d+ checks pass/)).toBeVisible();
  await expect(checks.getByRole('list', { name: 'Checks passed' })).toBeVisible();

  // Nothing is saved yet.
  expect((await api<Po>(accounts, `/purchase-orders/${po.id}`)).vendorBills?.length ?? 0).toBe(billsBefore);

  const invoiceNo = `E2E-READ-${Date.now()}`;
  await modal.getByLabel("Vendor's invoice no.").fill(invoiceNo);
  // The scan itself is attached to the bill.
  await expect(modal.locator('.ant-upload-list-item[title="sahoo-invoice.png"], .ant-upload-list-item:has([title="sahoo-invoice.png"])')).toHaveCount(1);
  await modal.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText(/VB-\d{4}-\d{4} saved as a draft/)).toBeVisible();
  const bill = (await api<Page<Bill>>(accounts, `/vendor-bills?q=${invoiceNo}`)).items[0];
  expect(bill.invoiceNo).toBe(invoiceNo);
  const full = await api<Bill>(accounts, `/vendor-bills/${bill.id}`);
  expect(full.attachments.map((a) => a.fileName)).toContain('sahoo-invoice.png');
  await api(accounts, `/vendor-bills/${bill.id}`, { method: 'DELETE' });
});

test('a challan photo fills the GRN against the order', async ({ page }) => {
  const po = await orderWithReceipt();
  await signIn(page, 'store@demo.com');
  await page.goto(`/purchase-orders?id=${po.id}`);
  await page.locator('.ant-drawer').filter({ hasText: po.poNo }).getByRole('button', { name: 'Receive material' }).click();
  const modal = formPanel(page, 'Receive material (GRN)');
  const chooser = page.waitForEvent('filechooser');
  await modal.getByRole('button', { name: 'Fill from challan' }).click();
  await (await chooser).setFiles({ name: 'challan.png', mimeType: 'image/png', buffer: PNG });

  await expect(modal.getByText('Filled from challan.png')).toBeVisible();
  await expect(modal.getByLabel('Challan / invoice no.')).toHaveValue('DC-7781');
  await expect(modal.getByLabel('Quantity received of Binding wire 18 SWG (e2e)')).toHaveValue('20');
  await expect(modal.getByText(/Check this/)).toBeVisible();
  await modal.getByRole('button', { name: 'Save GRN' }).click();
  await expect(page.getByText(/GRN-\d{4}-\d{4} saved: 1 item received|saved: 1 item received/)).toBeVisible();
});

test("a drawing's title block fills the register entry", async ({ page }) => {
  await signIn(page, 'pm@demo.com');
  await page.getByRole('link', { name: 'Documents' }).click();
  await page.getByRole('button', { name: 'Add document' }).click();
  const modal = formPanel(page, 'Add drawing or document');
  const chooser = page.waitForEvent('filechooser');
  await modal.getByRole('button', { name: 'Fill from title block' }).click();
  await (await chooser).setFiles({ name: 'column-layout.png', mimeType: 'image/png', buffer: PNG });

  await expect(modal.getByLabel('Number')).toHaveValue('BL-STR-GF-104');
  await expect(modal.getByLabel('Title')).toHaveValue('Ground floor column layout');
  await expect(modal.getByRole('textbox', { name: /^\*? ?Revision$/ })).toHaveValue('R2');
  await expect(modal.getByText('Structural')).toBeVisible();
  // The consultant's name was hard to read.
  await expect(modal.getByText(/Check this/)).toBeVisible();
  await modal.getByRole('button', { name: 'Cancel' }).click();
});
