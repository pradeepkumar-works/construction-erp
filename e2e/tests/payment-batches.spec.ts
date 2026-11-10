import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { BookVoucherDto, PaymentBatchDetailDto, PaymentBatchDto, UtrImportResultDto, VendorPaymentDto } from '../../packages/shared/src';
import { API_URL, api, apiToken, chooseOption, formPanel, signIn } from './helpers';

type Page_<T> = { items: T[] };
type Vendor = { id: string; name: string; bankAccountNo: string | null; bankIfsc: string | null };
type Project = { id: string; code: string; type: string };
type Request = { id: string; requestNo: string; status: string; amount: string };

const send = (token: string, method: string, path: string, body?: unknown) =>
  fetch(`${API_URL}${path}`, { method, headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
/** A picture of the page for the review: into PAY_SHOTS when set, else the test's output. */
const shot = (page: Page, name: string) => page.screenshot({ path: process.env.PAY_SHOTS ? join(process.env.PAY_SHOTS, name) : test.info().outputPath(name), fullPage: true });

test.describe.configure({ mode: 'serial' });
// The pull request's desktop width, tall enough that the record's sticky actions sit below its lines, and no motion, so
// the screenshots never catch a tag between two colours.
test.use({ viewport: { width: 1440, height: 1100 }, contextOptions: { reducedMotion: 'reduce' } });

let accounts: string;
let md: string;
let project: Project;
let banked: Vendor[];
let unbanked: Vendor;

/** A fund request paying the vendor on account, asked for by accounts and, unless `submitOnly`, approved by management. */
async function request(vendor: Vendor, amount: string, submitOnly = false): Promise<Request> {
  const r = await api<Request>(accounts, '/payment-requests', { method: 'POST', body: { kind: 'FUND_REQUEST', projectId: project.id, vendorId: vendor.id, purpose: 'OTHER', amount, mode: 'BANK', reason: `E2E bank payment ${Date.now()}` } });
  if (r.status === 'DRAFT') await api(accounts, `/payment-requests/${r.id}/submit`, { method: 'POST' });
  if (!submitOnly) await api(md, `/approvals/payment_request/${r.id}/review`, { method: 'POST', body: { decision: 'APPROVE' } });
  return api<Request>(md, `/payment-requests/${r.id}`);
}

const newBatch = (format = 'GENERIC') => api<PaymentBatchDetailDto>(accounts, '/payment-batches', { method: 'POST', body: { debitAccount: '50200012345678', format } });

test.beforeAll(async () => {
  accounts = await apiToken('accounts@demo.com');
  md = await apiToken('md@demo.com');
  const vendors = (await api<Page_<Vendor>>(md, '/vendors?pageSize=100')).items;
  banked = vendors.filter((v) => v.bankAccountNo && v.bankIfsc).slice(0, 3);
  unbanked = vendors.find((v) => !v.bankIfsc)!;
  expect(banked).toHaveLength(3);
  expect(unbanked).toBeTruthy();
  project = (await api<Page_<Project>>(md, '/projects?pageSize=50')).items.find((p) => p.type === 'BUILDING')!;
  // Batches an earlier run left open would hold requests: an export without a UTR is undone, and drafts go.
  for (const b of await api<PaymentBatchDto[]>(accounts, '/payment-batches')) {
    if (b.status === 'EXPORTED' && !b.paid) await api(accounts, `/payment-batches/${b.id}/undo-export`, { method: 'POST' });
    if (b.status !== 'SETTLED' && !b.paid) await api(accounts, `/payment-batches/${b.id}`, { method: 'DELETE' });
  }
});

test('lanes 2, 3, 4, 6 and 7: a batch of approved requests, its file, a vendor left out, RTGS from two lakh, the UTRs read back', async ({ page }) => {
  const lakh = await request(banked[0], '100000');
  const three = await request(banked[1], '300000');
  const small = await request(banked[2], '25000.50');
  const noIfsc = await request(unbanked, '5000');

  await signIn(page, 'accounts@demo.com');
  await page.goto('/bank-payments');
  await expect(page.getByRole('heading', { level: 1, name: 'Bank payments' })).toBeVisible();
  await page.getByRole('button', { name: 'New bank payment' }).first().click();
  const make = formPanel(page, 'New bank payment');
  await make.getByLabel('Debit account').fill('50200012345678');
  await expect(make.getByLabel('Bank file layout').locator('xpath=ancestor::*[contains(@class,"ant-select")][1]')).toContainText('Generic NEFT and RTGS');
  await make.getByRole('button', { name: 'Make batch' }).click();
  await expect(page).toHaveURL(/\/bank-payments\/[0-9a-f-]{36}$/);
  const id = page.url().split('/').pop()!;

  await page.getByRole('button', { name: 'Add requests' }).click();
  const add = formPanel(page, /^Add payment requests/);
  for (const r of [lakh, three, small, noIfsc]) await chooseOption(add.getByLabel('Approved payment requests'), r.requestNo);
  await add.locator('.ant-modal-title').click();
  await add.getByRole('button', { name: 'Add to batch' }).click();
  await expect(add).toBeHidden();

  // Lane 2: the batch pays the three requests whose vendors have bank details, their whole amounts.
  const draft = await api<PaymentBatchDetailDto>(accounts, `/payment-batches/${id}`);
  expect(draft.items).toHaveLength(4);
  expect(draft.total).toBe((100000 + 300000 + 25000.5).toFixed(2));
  expect(draft.inFile).toBe(3);
  const row = (no: string) => page.locator('tr').filter({ hasText: no });
  for (const r of [lakh, three, small]) await expect(row(r.requestNo).getByText('Ready')).toBeVisible();
  await shot(page, 'pay-batch.png');

  // Lane 6: RTGS from two lakh, NEFT below.
  expect(draft.items.find((l) => l.requestNo === three.requestNo)!.mode).toBe('RTGS');
  expect(draft.items.find((l) => l.requestNo === lakh.requestNo)!.mode).toBe('NEFT');
  await expect(row(three.requestNo).getByRole('cell', { name: 'RTGS', exact: true })).toBeVisible();
  await expect(row(lakh.requestNo).getByRole('cell', { name: 'NEFT', exact: true })).toBeVisible();
  await shot(page, 'pay-rtgs.png');

  // Lane 4: the vendor without an IFSC is listed as missing.
  await expect(row(noIfsc.requestNo).getByText('Bank details missing')).toBeVisible();
  await expect(page.getByText(/left out of the file: the vendor has no bank account or IFSC/)).toBeVisible();
  await shot(page, 'pay-missing.png');

  // Lane 3: Make bank file records the payments and downloads the generic file, one row per paid line in column order.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Make bank file' }).click();
  await page.locator('.ant-modal-confirm').getByRole('button', { name: 'Make bank file' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^PB-\d{4}-\d{4}-generic\.csv$/);
  const csv = await readFile((await file.path())!, 'utf8');
  const rows = csv.trimEnd().split('\r\n').map((l) => l.split(','));
  expect(rows[0]).toEqual(['Payment type', 'Debit account', 'Beneficiary name', 'Beneficiary account', 'IFSC', 'Amount', 'Narration', 'Reference']);
  expect(rows).toHaveLength(4);
  const byRef = new Map(rows.slice(1).map((r) => [r[7], r]));
  expect(byRef.get(three.requestNo)!.slice(0, 2)).toEqual(['RTGS', '50200012345678']);
  expect(byRef.get(three.requestNo)![5]).toBe('300000.00');
  expect(byRef.get(lakh.requestNo)![0]).toBe('NEFT');
  expect(byRef.get(small.requestNo)![5]).toBe('25000.50');
  expect(byRef.get(small.requestNo)![4]).toBe(banked[2].bankIfsc!.replace(/\s+/g, '').toUpperCase());
  expect(byRef.has(noIfsc.requestNo)).toBe(false);
  const exported = await api<PaymentBatchDetailDto>(accounts, `/payment-batches/${id}`);
  expect(exported.status).toBe('EXPORTED');
  expect(exported.items.find((l) => l.requestNo === noIfsc.requestNo)!.state).toBe('LEFT_OUT');
  const paid = exported.items.filter((l) => l.vendorPaymentId);
  expect(paid).toHaveLength(3);
  for (const l of paid) {
    const p = await api<VendorPaymentDto>(accounts, `/vendor-payments/${l.vendorPaymentId}`);
    expect(p).toMatchObject({ amount: l.amount, mode: 'BANK', reference: null, requestNo: l.requestNo });
  }
  // The left-out request is free for another batch.
  const other = await newBatch();
  await api(accounts, `/payment-batches/${other.id}/lines`, { method: 'POST', body: { paymentRequestIds: [noIfsc.id] } });
  await api(accounts, `/payment-batches/${other.id}`, { method: 'DELETE' });
  const filePage = await page.context().newPage();
  await filePage.setContent(`<pre style="font: 14px/1.6 monospace; padding: 24px">${csv.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`);
  await filePage.screenshot({ path: process.env.PAY_SHOTS ? join(process.env.PAY_SHOTS, 'pay-file.png') : test.info().outputPath('pay-file.png') });
  await filePage.close();

  // Lane 7: paste the bank's UTRs; every payment shows its UTR and the batch is settled.
  const utrs = paid.map((l, i) => [l.requestNo, `HDFCN5${Date.now().toString().slice(-9)}${String(i).padStart(4, '0')}`]);
  await page.getByRole('button', { name: 'Import UTRs' }).click();
  const imp = formPanel(page, /^Import UTRs/);
  await imp.getByText('Paste UTRs', { exact: true }).click();
  await imp.getByRole('textbox', { name: /UTRs/ }).fill(utrs.map((u) => u.join(' ')).join('\n'));
  await imp.getByRole('button', { name: 'Import UTRs' }).click();
  await expect(imp).toBeHidden();
  await expect(page.getByText('Settled', { exact: true }).first()).toBeVisible();
  for (const [no, utr] of utrs) await expect(row(no).getByText(utr)).toBeVisible();
  await shot(page, 'pay-utr.png');
  const settled = await api<PaymentBatchDetailDto>(accounts, `/payment-batches/${id}`);
  expect(settled.status).toBe('SETTLED');
  expect(settled.paid).toBe(3);

  // The bank book has each payment with its UTR.
  await api(accounts, '/books/post', { method: 'POST' });
  const book = await api<Page_<BookVoucherDto>>(accounts, '/books/day-book?source=PAYMENT&pageSize=200');
  for (const l of settled.items.filter((x) => x.vendorPaymentId)) {
    const v = book.items.find((x) => x.sourceId === l.vendorPaymentId)!;
    expect(v.reference).toBe(l.utr);
    expect(v.narration).toContain(l.utr!);
    expect(Number(v.lines.find((x) => /bank/i.test(x.accountName))?.credit)).toBeCloseTo(Number(l.amount), 2);
  }

  // Importing again changes nothing, and a settled batch takes no more.
  const again = await send(accounts, 'POST', `/payment-batches/${id}/utrs`, { cells: utrs.map((u) => [u.join(' ')]) });
  expect(again.status).toBe(400);
});

test('lane 5: a request already in an open batch is refused with that batch named', async ({ page }) => {
  const r = await request(banked[0], '1500');
  const first = await newBatch();
  await api(accounts, `/payment-batches/${first.id}/lines`, { method: 'POST', body: { paymentRequestIds: [r.id] } });
  const second = await newBatch('HDFC');
  const refused = await send(accounts, 'POST', `/payment-batches/${second.id}/lines`, { paymentRequestIds: [r.id] });
  expect(refused.status).toBe(400);
  expect(((await refused.json()) as { message: string }).message).toBe(`${r.requestNo} is already in ${first.batchNo}; a request is paid in one batch at a time`);

  await signIn(page, 'accounts@demo.com');
  await page.goto(`/bank-payments/${second.id}`);
  await page.getByRole('button', { name: 'Add requests' }).click();
  const add = formPanel(page, /^Add payment requests/);
  await add.getByLabel('Approved payment requests').click();
  await add.getByLabel('Approved payment requests').fill(r.requestNo);
  const option = page.locator('.ant-select-item-option').filter({ hasText: r.requestNo });
  await expect(option).toContainText(`in ${first.batchNo}`);
  await expect(option).toHaveClass(/ant-select-item-option-disabled/);
  await shot(page, 'pay-twice.png');

  // Two people adding the same request to two batches at once: one wins.
  const r2 = await request(banked[1], '1600');
  const both = await Promise.all([first, second].map((b) => send(accounts, 'POST', `/payment-batches/${b.id}/lines`, { paymentRequestIds: [r2.id] })));
  expect(both.map((x) => x.status).sort()).toEqual([201, 400]);
  for (const b of [first, second]) await api(accounts, `/payment-batches/${b.id}`, { method: 'DELETE' });
});

test('a file made twice at once pays once, and Undo export takes the payments off', async () => {
  const r = await request(banked[2], '2500');
  const b = await newBatch();
  await api(accounts, `/payment-batches/${b.id}/lines`, { method: 'POST', body: { paymentRequestIds: [r.id] } });
  const both = await Promise.all([1, 2].map(() => send(accounts, 'POST', `/payment-batches/${b.id}/export`)));
  const codes = both.map((x) => x.status).sort();
  expect(codes[0]).toBe(201);
  expect([400, 409]).toContain(codes[1]);
  const payments = await api<Page_<VendorPaymentDto>>(accounts, `/vendor-payments?paymentRequestId=${r.id}`);
  expect(payments.items).toHaveLength(1);
  const undone = await api<PaymentBatchDetailDto>(accounts, `/payment-batches/${b.id}/undo-export`, { method: 'POST' });
  expect(undone.status).toBe('DRAFT');
  expect((await api<Page_<VendorPaymentDto>>(accounts, `/vendor-payments?paymentRequestId=${r.id}`)).items).toHaveLength(0);
  expect((await api<{ paidAmount: string }>(md, `/payment-requests/${r.id}`)).paidAmount).toBe('0.00');
  await api(accounts, `/payment-batches/${b.id}`, { method: 'DELETE' });
});

test('lane 8: with payments needing a request, an unapproved request cannot join a batch', async ({ page }) => {
  const admin = await apiToken('admin@demo.com');
  const rules = await api<{ paymentsNeedRequest: boolean }>(admin, '/approval-rules');
  await api(admin, '/approval-rules', { method: 'PUT', body: { paymentsNeedRequest: true } });
  try {
    const waiting = await request(banked[0], '1700', true);
    expect(waiting.status).toBe('SUBMITTED');
    const b = await newBatch();
    const refused = await send(accounts, 'POST', `/payment-batches/${b.id}/lines`, { paymentRequestIds: [waiting.id] });
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { message: string }).message).toBe(`${waiting.requestNo} is not approved yet; only approved requests are paid`);
    await signIn(page, 'accounts@demo.com');
    await page.goto(`/bank-payments/${b.id}`);
    await page.getByRole('button', { name: 'Add requests' }).click();
    const add = formPanel(page, /^Add payment requests/);
    await add.getByLabel('Approved payment requests').click();
    await add.getByLabel('Approved payment requests').fill(waiting.requestNo);
    await expect(page.locator('.ant-select-item-option').filter({ hasText: waiting.requestNo })).toHaveCount(0);
    await shot(page, 'pay-unapproved.png');
    await api(accounts, `/payment-batches/${b.id}`, { method: 'DELETE' });
    await api(md, `/payment-requests/${waiting.id}`, { method: 'DELETE' });
  } finally {
    await api(admin, '/approval-rules', { method: 'PUT', body: { paymentsNeedRequest: rules.paymentsNeedRequest } });
  }
});

test('lane 9: a site engineer has no bank payments in the menu and its API refuses', async ({ page }) => {
  const engineer = await apiToken('engineer@demo.com');
  for (const path of ['/payment-batches', '/payment-batches/requests']) expect((await send(engineer, 'GET', path)).status).toBe(403);
  expect((await send(engineer, 'POST', '/payment-batches', { debitAccount: '50200012345678', format: 'GENERIC' })).status).toBe(403);
  await signIn(page, 'engineer@demo.com');
  await expect(page.getByRole('link', { name: 'Bank payments' })).toHaveCount(0);
  await page.goto('/bank-payments');
  await expect(page.getByText('Bank payments are made by accounts')).toBeVisible();
  await shot(page, 'pay-engineer.png');
});
