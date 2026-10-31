import { expect, test, type Page } from '@playwright/test';
import { API_URL, PASSWORD, api, apiToken, chooseOption, localToday, signIn } from './helpers';

type Order = { kind: 'PO' | 'WO'; id: string; number: string; closed: boolean; lines: { id: string; itemName: string; toSend: string }[] };
type Dispatch = { id: string; dispatchNo: string; status: string; grn: { entryNo: string } | null };
type Invoice = { id: string; invoiceNo: string; stage: string; returnNote: string | null };
type Note = { title: string; type: string };

/** A valid 1×1 PNG. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function upload(token: string, name: string): Promise<string> {
  const form = new FormData();
  form.append('file', new Blob([PNG], { type: 'image/png' }), name);
  const res = await fetch(`${API_URL}/uploads`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
  expect(res.ok, await res.clone().text()).toBe(true);
  return ((await res.json()) as { id: string }).id;
}

/** A supplier lands on their portal, not the company's home. */
async function signInSupplier(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('supplier@demo.com');
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/supplier$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
}

/**
 * Supplier portal (v6 item 105): the supplier sends a dispatch note with a truck, the store receives the GRN from that
 * note, and the supplier sees it received. An invoice they send reaches accounts in the Supplier inbox, who return it with
 * what to fix; the supplier is told.
 */
test('a dispatch note becomes a GRN and a returned invoice reaches the supplier', async ({ page, browser }) => {
  const sup = await apiToken('supplier@demo.com');
  const po = (await api<Order[]>(sup, '/supplier/orders')).find((o) => o.kind === 'PO' && !o.closed && o.lines.some((l) => Number(l.toSend) >= 1))!;
  expect(po, 'a purchase order on the demo supplier with material left to send').toBeTruthy();
  const line = po.lines.find((l) => Number(l.toSend) >= 1)!;
  const dispatchNo = `E2E/DC/${Date.now()}`;

  // The supplier sends one unit with a truck.
  await signInSupplier(page);
  await page.goto('/supplier/orders');
  await page.getByRole('button', { name: 'Send a dispatch note' }).first().click();
  const drawer = page.locator('.ant-drawer').filter({ hasText: 'Send a dispatch note' });
  await chooseOption(drawer.getByLabel('Purchase order'), po.number);
  await drawer.getByLabel(`Quantity of ${line.itemName} sent`).fill('1');
  await drawer.getByLabel('Your challan no.').fill(dispatchNo);
  await drawer.getByLabel('Vehicle no.').fill('OD02E2E9');
  await drawer.getByRole('button', { name: 'Send dispatch note' }).click();
  await expect(page.getByText(`Dispatch note ${dispatchNo} sent for ${po.number}`)).toBeVisible();

  // The store receives against the PO and picks the note: the quantity, challan and vehicle fill in.
  const storeContext = await browser.newContext();
  const store = await storeContext.newPage();
  await signIn(store, 'store@demo.com');
  await store.goto(`/purchase-orders/${po.id}`);
  await store.getByRole('button', { name: 'Receive material' }).click();
  const grn = store.locator('.ant-modal').filter({ hasText: 'Receive material (GRN)' });
  await chooseOption(grn.getByLabel("Supplier's dispatch note"), dispatchNo);
  await expect(grn.getByLabel('Challan / invoice no.')).toHaveValue(dispatchNo);
  await expect(grn.getByLabel('Vehicle no.')).toHaveValue('OD02E2E9');
  await grn.getByRole('button', { name: 'Save GRN' }).click();
  await expect(store.getByText(/saved: 1 item received/)).toBeVisible();
  await storeContext.close();

  const sent = (await api<Dispatch[]>(sup, '/supplier/dispatches')).find((d) => d.dispatchNo === dispatchNo)!;
  expect(sent.status).toBe('RECEIVED');
  await page.goto('/supplier/orders?tab=dispatches');
  const row = page.getByRole('row').filter({ hasText: dispatchNo });
  await expect(row.getByText('Received')).toBeVisible();
  await expect(row.getByText(sent.grn!.entryNo)).toBeVisible();

  // An invoice sent from the portal; accounts return it from the Supplier inbox.
  const invoiceNo = `E2E/INV/${Date.now()}`;
  const file = await upload(sup, `${invoiceNo.replaceAll('/', '-')}.png`);
  await api(sup, '/supplier/invoices', { method: 'POST', body: { purchaseOrderId: po.id, invoiceNo, invoiceDate: localToday(), amount: 1180, gstAmount: 180, attachmentIds: [file] } });

  const accContext = await browser.newContext();
  const acc = await accContext.newPage();
  await signIn(acc, 'accounts@demo.com');
  await acc.goto('/supplier-inbox');
  await acc.getByRole('link', { name: invoiceNo }).or(acc.getByRole('button', { name: invoiceNo })).first().click();
  const inv = acc.locator('.ant-drawer').filter({ hasText: `Invoice ${invoiceNo}` });
  await expect(inv.getByRole('button', { name: 'Record vendor bill' })).toBeVisible();
  await inv.getByRole('button', { name: 'Return', exact: true }).click();
  const back = acc.locator('.ant-modal').filter({ hasText: `Return invoice ${invoiceNo}` });
  await back.getByLabel('What to fix').fill('Our GSTIN is missing on the invoice');
  await back.getByRole('button', { name: 'Return to vendor' }).click();
  await expect(acc.getByText(`${invoiceNo} returned to`)).toBeVisible();
  await accContext.close();

  const mine = (await api<Invoice[]>(sup, '/supplier/invoices')).find((i) => i.invoiceNo === invoiceNo)!;
  expect(mine.stage).toBe('RETURNED');
  expect(mine.returnNote).toBe('Our GSTIN is missing on the invoice');
  const notes = await api<{ items: Note[] }>(sup, '/notifications?limit=20');
  expect(notes.items.some((n) => n.type === 'SUPPLIER' && n.title === `Invoice ${invoiceNo} returned`)).toBe(true);
  await page.goto('/supplier/invoices');
  await expect(page.getByRole('row').filter({ hasText: invoiceNo }).getByRole('button', { name: `Send ${invoiceNo} again` })).toBeVisible();
});

/** The supplier sees their portal only: the company's pages send them back, and its API refuses them. */
test('a supplier login stays inside the supplier portal', async ({ page }) => {
  const sup = await apiToken('supplier@demo.com');
  const res = await fetch(`${API_URL}/projects`, { headers: { authorization: `Bearer ${sup}` } });
  expect(res.status).toBe(403);
  const staff = await apiToken('accounts@demo.com');
  const refused = await fetch(`${API_URL}/supplier/home`, { headers: { authorization: `Bearer ${staff}` } });
  expect(refused.status).toBe(403);

  await signInSupplier(page);
  await page.goto('/projects');
  await expect(page).toHaveURL(/\/supplier$/);
  const nav = page.getByRole('navigation').first();
  await expect(nav.getByRole('link', { name: 'Payments' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Projects' })).toHaveCount(0);
});
