import path from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { API_URL, PASSWORD, api, apiToken, axeViolations, chooseOption, localToday, measureTargets, pageOverflow, setAppearance, settle, signIn } from './helpers';

/**
 * E-invoices and e-way bills (item 194), against GST_PROVIDER=fake, in a company of their own: a certified RA bill to a
 * registered client gets its IRN, ack and QR, made once, printed, locking the bill and cancelled within the day; a bill
 * to an unregistered client gets none; an RMC bill gets its IRN and its challan an e-way bill with the truck and the
 * distance; a stock transfer with no vehicle is held at the form. GST_SHOTS_DIR keeps the screenshots for a reviewer.
 */
test.describe.configure({ mode: 'serial' });

type Bill = { id: string; billLabel: string; stage: string };
type GstDoc = { id: string; status: string; number: string | null; ackNo: string | null; signedQr: string | null; validUntil: string | null; provider: string };
type GstState = { kind: string; docNo: string; offered: boolean; needed: boolean; reason: string; problems: string[]; live: GstDoc | null; history: GstDoc[]; canGenerate: boolean; canCancel: boolean };
type Entry = { id: string; entryNo: string; lines: { itemId: string; itemName: string }[] };
type Paged<T> = { items: T[] };

const shot = async (page: Page, name: string) => {
  const dir = process.env.GST_SHOTS_DIR;
  await page.screenshot({ path: dir ? path.join(dir, name) : test.info().outputPath(name), fullPage: false });
};
const call = async (token: string, method: string, url: string, body?: unknown) =>
  fetch(`${API_URL}${url}`, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

const stamp = Date.now();
const email = (who: string) => `gst-${who}-${stamp}@e2e.test`;
const ctx = {} as {
  owner: string;
  pm: string;
  b2b: Bill;
  b2c: Bill;
  rmcInvoiceId: string;
  rmcInvoiceNo: string;
  batchId: string;
  batchNo: string;
  transfer: Entry;
};

/** A certified RA bill on a new project of the client: one BOQ item, one measurement, approved, sent and certified. */
async function certifiedBill(owner: string, pm: string, pmId: string, code: string, clientId: string): Promise<Bill> {
  const project = await api<{ id: string }>(owner, '/projects', { method: 'POST', body: { code, name: `E2E GST works ${code}`, type: 'BUILDING', clientId, siteAddress: 'Plot 4, Patia, Bhubaneswar 751024' } });
  await api(owner, `/projects/${project.id}/contract`, { method: 'PUT', body: { startDate: '2026-04-01', endDate: '2027-09-30', contractValue: '50000000' } });
  await api(owner, `/projects/${project.id}/members`, { method: 'POST', body: { userIds: [pmId] } });
  const item = await api<{ id: string }>(owner, `/projects/${project.id}/boq`, { method: 'POST', body: { itemNo: '1.01', description: 'RCC M25 in columns (e2e)', unit: 'Cum', rate: '8125.50', originalQty: '500' } });
  const sheet = await api<{ id: string }>(owner, '/measurements', { method: 'POST', body: { projectId: project.id, boqItemId: item.id, date: localToday(), location: 'Columns C1 to C8', lines: [{ description: 'RCC in columns', nos: '1', length: '42.5' }] } });
  await api(pm, `/approvals/measurement/${sheet.id}/review`, { method: 'POST', body: { decision: 'APPROVE' } });
  const bill = await api<Bill>(owner, '/ra-bills', { method: 'POST', body: { projectId: project.id, billDate: localToday(), submit: true } });
  await api(pm, `/approvals/bill/${bill.id}/review`, { method: 'POST', body: { decision: 'APPROVE' } });
  await api(owner, `/ra-bills/${bill.id}/send`, { method: 'POST', body: { date: localToday() } });
  return api<Bill>(owner, `/ra-bills/${bill.id}/certify`, { method: 'POST', body: { date: localToday(), certificateNo: `CERT-${code}` } });
}

test.beforeAll(async () => {
  test.setTimeout(180_000);
  const res = await fetch(`${API_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ organizationName: `E2E GST ${stamp}`, fullName: 'Gita Admin', email: email('owner'), password: PASSWORD }),
  });
  expect(res.ok).toBe(true);
  const owner = await apiToken(email('owner'));
  const pmId = (await api<{ id: string }>(owner, '/users', { method: 'POST', body: { email: email('pm'), fullName: 'Prakash Manager', roleKey: 'PROJECT_MANAGER', password: PASSWORD } })).id;
  const pm = await apiToken(email('pm'));
  // Under e-invoicing from April, with its address and the SAC of its works bills.
  await api(owner, '/company-settings/profile', {
    method: 'PUT',
    body: { legalName: `E2E GST Infra ${stamp} Pvt Ltd`, address: 'Plot 12, Saheed Nagar, Bhubaneswar 751007', gstin: '21AABCE2026K1Z5', gstSac: '995421', einvoiceFrom: '2026-04-01' },
  });
  const registered = await api<{ id: string }>(owner, '/clients', { method: 'POST', body: { name: 'Odisha Works Department (e2e)', gstin: '21AAAGO1234F1Z5', billingAddress: 'Nirman Soudha, Unit 5, Bhubaneswar 751001' } });
  const unregistered = await api<{ id: string }>(owner, '/clients', { method: 'POST', body: { name: 'Mr R. Sahoo (e2e)', billingAddress: 'Lane 3, Jaydev Vihar, Bhubaneswar 751013', stateCode: '21' } });
  const b2b = await certifiedBill(owner, pm, pmId, 'GA-01', registered.id);
  const b2c = await certifiedBill(owner, pm, pmId, 'GB-01', unregistered.id);

  // A plant with its stock, an approved mix, an order to the registered client, one truck delivered and billed.
  const plant = await api<{ id: string }>(owner, '/projects', { method: 'POST', body: { code: 'GPL-1', name: 'E2E GST plant', type: 'PLANT', siteAddress: 'Plot 7, Mancheswar Industrial Estate, Bhubaneswar 751010' } });
  const opening = await api<Entry>(owner, '/stock/adjustments', {
    method: 'POST',
    body: {
      projectId: plant.id,
      date: localToday(),
      reason: 'OPENING',
      remarks: 'Opening stock (e2e)',
      lines: [
        { itemName: `OPC 53 cement e2e ${stamp}`, unit: 'MT', quantity: '50' },
        { itemName: `20 mm aggregate e2e ${stamp}`, unit: 'MT', quantity: '200' },
      ],
    },
  });
  const design = await api<{ id: string }>(owner, '/rmc/mix-designs', {
    method: 'POST',
    body: { plantId: plant.id, code: `M25-E2E-${stamp % 100000}`, grade: 'M25', lines: opening.lines.map((l, i) => ({ itemId: l.itemId, quantity: i === 0 ? 0.38 : 1.1 })) },
  });
  await api(owner, `/rmc/mix-designs/${design.id}/approve`, { method: 'POST' });
  const order = await api<{ id: string }>(owner, '/rmc/orders', {
    method: 'POST',
    body: { plantId: plant.id, date: localToday(), clientId: registered.id, site: 'Tower B raft, Patia, Bhubaneswar 751024', mixDesignId: design.id, quantity: 7.5, rate: 4850, pumpRate: 350, pourDate: localToday() },
  });
  await api(owner, `/rmc/orders/${order.id}/confirm`, { method: 'POST' });
  const truck = await api<{ id: string; batchNo: string }>(owner, '/rmc/batches', { method: 'POST', body: { orderId: order.id, quantity: 7.5, truck: 'OD02AB1234', pumped: true } });
  await api(owner, `/rmc/batches/${truck.id}/deliver`, { method: 'POST', body: { receivedBy: 'E2E site engineer' } });
  const invoice = await api<{ id: string; invoiceNo: string }>(owner, '/rmc/invoices', { method: 'POST', body: { orderId: order.id, date: localToday() } });

  // Steel from the first works project to the second, at the item's rate, with no vehicle on the transfer.
  const from = await api<Paged<{ id: string; code: string }>>(owner, '/projects?pageSize=20');
  const [p1, p2] = ['GA-01', 'GB-01'].map((c) => from.items.find((p) => p.code === c)!.id);
  const steel = await api<Entry>(owner, '/stock/adjustments', { method: 'POST', body: { projectId: p1, date: localToday(), reason: 'OPENING', remarks: 'Opening stock (e2e)', lines: [{ itemName: `TMT bar 16 mm e2e ${stamp}`, unit: 'MT', quantity: '5' }] } });
  await api(owner, `/stock/items/${steel.lines[0].itemId}`, { method: 'PATCH', body: { rate: '61000', hsnCode: '72142090' } });
  const transfer = await api<Entry>(owner, '/stock/transfers', { method: 'POST', body: { projectId: p1, toProjectId: p2, date: localToday(), lines: [{ itemId: steel.lines[0].itemId, quantity: '3' }] } });

  Object.assign(ctx, { owner, pm, b2b, b2c, rmcInvoiceId: invoice.id, rmcInvoiceNo: invoice.invoiceNo, batchId: truck.id, batchNo: truck.batchNo, transfer });
});

/** The record page's E-invoice card (`RecordFrame` gives each section an anchor id). */
const section = (page: Page) => page.locator('#record-gst');
const paperText = async (page: Page) => {
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: /Print$/ }).first().click();
  const paper = await popup;
  await paper.waitForLoadState('load');
  const text = (await paper.locator('body').innerText()).replace(/Generated from .*$/m, '');
  return { paper, text };
};

test('lanes 1 to 3: a certified bill prints as before, gets its IRN, ack and QR, and the same IRN again', async ({ page }) => {
  await signIn(page, email('owner'));
  await settle(page, `/bills/${ctx.b2b.id}`);
  const before = await paperText(page);
  expect(before.text).not.toContain('IRN');
  await before.paper.close();

  const s = section(page);
  await expect(s.getByText('A bill to a registered client, from a company under e-invoicing')).toBeVisible();
  const t0 = Date.now();
  await s.getByRole('button', { name: 'Generate IRN' }).click();
  await expect(page.getByText(`IRN made for RA/GA-01/1`)).toBeVisible();
  const took = Date.now() - t0;
  const made = await api<GstState>(ctx.owner, `/gst/sources/RA_BILL/${ctx.b2b.id}`);
  expect(made.live).toMatchObject({ status: 'ACTIVE', provider: 'FAKE' });
  expect(made.live!.number).toMatch(/^[0-9a-f]{64}$/);
  expect(made.live!.ackNo).toMatch(/^[1-9][0-9]{14}$/);
  await expect(s.getByText(made.live!.number!)).toBeVisible();
  await expect(s.getByText(made.live!.ackNo!)).toBeVisible();
  await expect(s.getByRole('img', { name: 'E-invoice QR code' }).or(s.locator('.ant-qrcode svg'))).toBeVisible();
  await shot(page, 'gst-irn.png');
  test.info().annotations.push({ type: 'generate-ms', description: String(took) });

  // The print adds the IRN block and the QR, and nothing else changes.
  const after = await paperText(page);
  await expect(after.paper.getByText(made.live!.number!)).toBeVisible();
  await expect(after.paper.locator('svg[aria-label="E-invoice QR code"]')).toBeVisible();
  await shot(after.paper, 'gst-print.png');
  // The block's label prints in capitals (CSS), so its words are matched without case.
  const block = /E-invoice\s+Invoice no\. RA\/GA-01\/1\s+IRN [0-9a-f]{64}\s+Ack no\. [0-9]{15}\s+Ack date [^\n]+\s+Stand-in numbers from a test server, not registered with the IRP\s*/i;
  expect(after.text.replace(block, '')).toBe(before.text);
  await after.paper.close();

  // Again: the same payload gives back the same IRN, and no second document is made.
  const again = await api<GstState>(ctx.owner, `/gst/sources/RA_BILL/${ctx.b2b.id}/generate`, { method: 'POST', body: {} });
  expect(again.live!.number).toBe(made.live!.number);
  expect(again.live!.id).toBe(made.live!.id);
  expect(again.history).toHaveLength(0);
  await page.reload();
  await settle(page);
  await expect(section(page).getByText(made.live!.number!)).toBeVisible();
  await expect(section(page).getByText('Earlier')).toHaveCount(0);
  await shot(page, 'gst-again.png');
});

test('lane 4: with a live IRN the certificate cannot be corrected, and the refusal names the IRN', async ({ page }) => {
  const live = (await api<GstState>(ctx.owner, `/gst/sources/RA_BILL/${ctx.b2b.id}`)).live!;
  const refused = await call(ctx.owner, 'POST', `/ra-bills/${ctx.b2b.id}/certify`, { date: localToday(), certificateNo: 'CERT-GA-01-B' });
  expect(refused.status).toBe(409);
  expect((await refused.json()).message).toContain(`IRN ${live.number}`);

  await signIn(page, email('owner'));
  await settle(page, `/bills/${ctx.b2b.id}`);
  await page.getByRole('button', { name: 'Correct certificate' }).click();
  const dialog = page.getByRole('dialog', { name: 'Record certificate' });
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(`This bill has e-invoice IRN ${live.number}`, { exact: false }).first()).toBeVisible();
  await shot(page, 'gst-locked.png');
});

test('lane 5: the IRN is cancelled within 24 hours and reads Cancelled; its number cannot get another', async ({ page }) => {
  await signIn(page, email('owner'));
  await settle(page, `/bills/${ctx.b2b.id}`);
  const s = section(page);
  await s.getByRole('button', { name: 'Cancel IRN' }).click();
  const dialog = page.getByRole('dialog', { name: 'Cancel IRN' });
  // The second reason, Data entry mistake: the list opens on the first, and the arrow key moves on to it.
  const reason = dialog.getByLabel('Reason');
  await chooseOption(reason);
  await reason.click();
  await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-active').filter({ visible: true }).waitFor();
  await reason.press('ArrowDown');
  await reason.press('Enter');
  await expect(dialog.getByTitle('Data entry mistake')).toBeVisible();
  await dialog.getByLabel('Remark').fill('Wrong certificate quantity typed');
  await dialog.getByRole('button', { name: 'Cancel IRN' }).click();
  await expect(s.getByText('Cancelled', { exact: true })).toBeVisible();
  await expect(s.getByText('the IRP does not take the same invoice number again', { exact: false })).toBeVisible();
  await expect(s.getByRole('button', { name: 'Generate IRN' })).toHaveCount(0);
  await shot(page, 'gst-cancel.png');
  const after = await api<GstState>(ctx.owner, `/gst/sources/RA_BILL/${ctx.b2b.id}`);
  expect(after.live).toBeNull();
  expect(after.history[0]).toMatchObject({ status: 'CANCELLED' });
  // Unlocked: the certificate can be corrected again.
  expect((await call(ctx.owner, 'POST', `/ra-bills/${ctx.b2b.id}/certify`, { date: localToday(), certificateNo: 'CERT-GA-01-B' })).ok).toBe(true);
});

test('lane 6: a bill to a client without a GSTIN is offered no e-invoice', async ({ page }) => {
  const state = await api<GstState>(ctx.owner, `/gst/sources/RA_BILL/${ctx.b2c.id}`);
  expect(state).toMatchObject({ offered: false, needed: false, canGenerate: false, live: null });
  expect(state.reason).toContain('no GSTIN');
  expect((await call(ctx.owner, 'POST', `/gst/sources/RA_BILL/${ctx.b2c.id}/generate`, {})).status).toBe(400);
  await signIn(page, email('owner'));
  await settle(page, `/bills/${ctx.b2c.id}`);
  await expect(page.getByRole('button', { name: 'Generate IRN' })).toHaveCount(0);
  // The section folds into the line for empty ones; opened, it says why.
  await page.getByRole('button', { name: 'Open E-invoice' }).click();
  await expect(section(page).getByText(state.reason)).toBeVisible();
  await shot(page, 'gst-b2c.png');
});

test('lane 7: an RMC bill gets its IRN and QR, and its tax invoice prints them on the letterhead', async ({ page }) => {
  await signIn(page, email('owner'));
  await settle(page, '/rmc?tab=bills');
  await page.getByText(ctx.rmcInvoiceNo, { exact: true }).first().click();
  const drawer = page.locator('.ant-drawer').filter({ hasText: 'Challans' });
  const s = drawer.locator('section').filter({ has: page.getByRole('heading', { name: 'E-invoice', exact: true }) });
  await s.getByRole('button', { name: 'Generate IRN' }).click();
  await expect(page.getByText(`IRN made for ${ctx.rmcInvoiceNo}`)).toBeVisible();
  const state = await api<GstState>(ctx.owner, `/gst/sources/RMC_INVOICE/${ctx.rmcInvoiceId}`);
  await expect(s.getByText(state.live!.number!)).toBeVisible();
  await expect(s.locator('.ant-qrcode')).toBeVisible();
  await shot(page, 'gst-rmc.png');
  const popup = page.waitForEvent('popup');
  await drawer.getByRole('button', { name: 'Print invoice' }).click();
  const paper = await popup;
  await expect(paper.getByRole('heading', { name: 'Tax invoice' })).toBeVisible();
  await expect(paper.getByText(state.live!.number!)).toBeVisible();
  await expect(paper.locator('svg[aria-label="E-invoice QR code"]')).toBeVisible();
  await paper.close();
  // A live IRN holds the bill: it cannot be cancelled until the IRN is.
  const refused = await call(ctx.owner, 'POST', `/rmc/invoices/${ctx.rmcInvoiceId}/cancel`, {});
  expect(refused.status).toBe(409);
  expect((await refused.json()).message).toContain(`IRN ${state.live!.number}`);
});

test('lane 8: an RMC challan gets an e-way bill with the truck and the distance, valid to midnight', async ({ page }) => {
  await signIn(page, email('owner'));
  await settle(page, '/rmc?tab=batches');
  await page.getByText(ctx.batchNo, { exact: true }).first().click();
  const drawer = page.locator('.ant-drawer').filter({ hasText: 'Weighed against the design' });
  const s = drawer.locator('section').filter({ has: page.getByRole('heading', { name: 'E-way bill', exact: true }) });
  await s.getByRole('button', { name: 'Generate e-way bill' }).click();
  const dialog = page.getByRole('dialog', { name: 'Generate e-way bill' });
  await expect(dialog.getByLabel('Vehicle no.')).toHaveValue('OD02AB1234');
  await dialog.getByLabel('Distance by road (km)').fill('18');
  await dialog.getByRole('button', { name: 'Generate' }).click();
  await expect(page.getByText(/^E-way bill \d{12} made, valid until /)).toBeVisible();
  const state = await api<GstState>(ctx.owner, `/gst/sources/RMC_BATCH/${ctx.batchId}`);
  expect(state.live).toMatchObject({ status: 'ACTIVE' });
  expect(state.live!.number).toMatch(/^[1-9][0-9]{11}$/);
  // 18 km is a day: to the midnight after today, in India.
  expect(new Date(state.live!.validUntil!).toISOString().slice(11, 19)).toBe('18:29:59');
  await expect(s.getByText(state.live!.number!)).toBeVisible();
  await expect(s.getByText('Valid until')).toBeVisible();
  await shot(page, 'gst-ewb.png');
});

test('lane 9: a stock transfer with no vehicle is held at the form, which says what to fill', async ({ page }) => {
  await signIn(page, email('owner'));
  await settle(page, '/stock?sub=register');
  // The transfer is also named in the in-transit notice above the table: open it from its row.
  await page.locator('table').getByText(ctx.transfer.entryNo, { exact: true }).click();
  const drawer = page.locator('.ant-drawer').filter({ hasText: ctx.transfer.entryNo });
  const s = drawer.locator('section').filter({ has: page.getByRole('heading', { name: 'E-way bill', exact: true }) });
  await expect(s.getByText('The goods are worth more than ₹50,000, so they need an e-way bill to move')).toBeVisible();
  await s.getByRole('button', { name: 'Generate e-way bill' }).click();
  const dialog = page.getByRole('dialog', { name: 'Generate e-way bill' });
  await expect(dialog.getByLabel('Vehicle no.')).toHaveValue('');
  await dialog.getByLabel('Distance by road (km)').fill('42');
  await dialog.getByRole('button', { name: 'Generate' }).click();
  await expect(dialog.getByText('Type the vehicle number, for example OD02AB1234', { exact: true })).toBeVisible();
  await shot(page, 'gst-ewb-missing.png');
  // The server holds it too, before anything is written.
  const refused = await call(ctx.owner, 'POST', `/gst/sources/STOCK_TRANSFER/${ctx.transfer.id}/generate`, { mode: '1', distanceKm: 42 });
  expect(refused.status).toBe(400);
  expect((await refused.json()).message).toContain('Type the vehicle number');
  expect((await api<GstState>(ctx.owner, `/gst/sources/STOCK_TRANSFER/${ctx.transfer.id}`)).history).toHaveLength(0);
});

async function phone(browser: Browser, mode: 'light' | 'dark') {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, colorScheme: mode });
  await setAppearance(context, mode);
  const page = await context.newPage();
  await signIn(page, email('owner'));
  return { context, page };
}

test('lane 10: the bill with its e-invoice section holds on a phone in both themes', async ({ browser }) => {
  test.setTimeout(120_000);
  // A live IRN on the RMC bill; the RA bill shows its cancelled one and the earlier list.
  for (const mode of ['light', 'dark'] as const) {
    const { context, page } = await phone(browser, mode);
    for (const url of [`/bills/${ctx.b2b.id}`, `/bills/${ctx.b2c.id}`]) {
      await settle(page, url);
      const found = await axeViolations(page);
      expect(found, `${url} ${mode}`).toEqual([]);
      expect(await page.locator('h1').count()).toBe(1);
      expect(await pageOverflow(page)).toBe(0);
      if (mode === 'light') {
        const { targets, text } = await page.evaluate(measureTargets, 44);
        expect(targets, `${url} targets`).toEqual([]);
        expect(text, `${url} text`).toEqual([]);
      }
    }
    if (mode === 'dark') {
      await settle(page, `/bills/${ctx.b2b.id}`);
      await section(page).scrollIntoViewIfNeeded();
      await shot(page, 'gst-walk-390-dark.png');
    }
    await context.close();
  }
});
