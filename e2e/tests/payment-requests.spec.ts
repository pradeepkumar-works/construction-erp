import { expect, test } from '@playwright/test';
import { API_URL, api, apiToken, signIn } from './helpers';

interface Page<T> {
  items: T[];
}
type Request = { id: string; requestNo: string; kind: string; status: string; purchaseOrderId: string | null; targetLabel: string; amount: string; outstanding: string };
type Order = { id: string; poNo: string; advancePaid: string; advanceRequested: string };

/**
 * Payment requests (v5 item 90): the building project's PM asks for an advance on an approved PO from the order itself,
 * management approves it, and accounts pays it from the Payment requests tab in Payables; the PO then shows it paid.
 */
test('ask for an advance on a PO, approve it and pay it', async ({ page }) => {
  const md = await apiToken('md@demo.com');
  const accounts = await apiToken('accounts@demo.com');
  // The seed's advance request on the building PO names the order.
  const seeded = (await api<Page<Request>>(md, '/payment-requests?kind=PO_ADVANCE&pageSize=50')).items.find((r) => r.purchaseOrderId)!;
  const poId = seeded.purchaseOrderId!;
  const before = await api<Order>(md, `/purchase-orders/${poId}`);
  const reason = `E2E advance ${Date.now()}`;

  await signIn(page, 'pm2@demo.com');
  await page.goto(`/purchase-orders/${poId}`);
  await page.getByRole('button', { name: 'Request advance' }).click();
  const modal = page.locator('.ant-modal').filter({ hasText: `Request advance · ${before.poNo}` });
  await modal.getByLabel('Amount').fill('1500');
  await modal.getByLabel('Reason').fill(reason);
  await modal.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(page.getByText(/PR-\d{4}-\d{4} submitted for approval/)).toBeVisible();

  const mine = (await api<Page<Request & { reason: string }>>(md, `/payment-requests?q=${encodeURIComponent(reason)}`)).items[0];
  expect(mine.status).toBe('SUBMITTED');
  expect(Number(mine.amount)).toBe(1500);

  // Asking for more than the order has left is refused.
  const pm2 = await apiToken('pm2@demo.com');
  const over = await fetch(`${API_URL}/payment-requests`, {
    method: 'POST',
    headers: { authorization: `Bearer ${pm2}`, 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'PO_ADVANCE', purchaseOrderId: poId, amount: '999999999.00', reason: 'Too much' }),
  });
  expect(over.status).toBe(400);

  // Paying before approval is refused.
  const early = await fetch(`${API_URL}/vendor-payments`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accounts}`, 'content-type': 'application/json' },
    body: JSON.stringify({ paymentRequestId: mine.id, paymentDate: new Date().toISOString().slice(0, 10), amount: '1500', mode: 'BANK' }),
  });
  expect(early.status).toBe(400);

  await api(md, `/approvals/payment_request/${mine.id}/review`, { method: 'POST', body: { decision: 'APPROVE' } });

  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
  await signIn(page, 'accounts@demo.com');
  await page.goto('/payables?tab=requests');
  await page.getByLabel('Search payment requests').fill(mine.requestNo);
  const row = page.locator('tr').filter({ hasText: mine.requestNo });
  await row.getByRole('button', { name: 'Pay' }).click();
  const pay = page.locator('.ant-modal').filter({ hasText: mine.requestNo });
  await expect(pay.getByText('left to pay')).toBeVisible();
  await pay.getByLabel('UTR / cheque / voucher no.').fill('E2E-ADV-1');
  await pay.getByRole('button', { name: 'Record payment' }).click();
  await expect(page.getByText(`paid against Advance on ${before.poNo}`)).toBeVisible();

  const after = await api<Order>(md, `/purchase-orders/${poId}`);
  expect(Number(after.advancePaid) - Number(before.advancePaid)).toBe(1500);
  const done = await api<Request & { paidDate: string | null }>(md, `/payment-requests/${mine.id}`);
  expect(done.paidDate).not.toBeNull();
});

/** An admin makes every payment need an approved request from Approval rules; accounts can then no longer pay a bill directly. */
test('payments need an approved request when the company says so', async ({ page }) => {
  const admin = await apiToken('admin@demo.com');
  const accounts = await apiToken('accounts@demo.com');
  const bill = (await api<Page<{ id: string }>>(accounts, '/vendor-bills?status=APPROVED&pageSize=1')).items[0];
  const direct = () =>
    fetch(`${API_URL}/vendor-payments`, {
      method: 'POST',
      headers: { authorization: `Bearer ${accounts}`, 'content-type': 'application/json' },
      body: JSON.stringify({ vendorBillId: bill.id, paymentDate: new Date().toISOString().slice(0, 10), amount: '1', mode: 'BANK' }),
    });
  try {
    await signIn(page, 'admin@demo.com');
    await page.goto('/approval-rules');
    const rule = page.getByRole('switch', { name: 'Payments need an approved payment request' });
    await expect(rule).not.toBeChecked();
    await rule.click();
    await expect(page.getByText('Payments now need an approved payment request')).toBeVisible();
    await expect(rule).toBeChecked();

    const refused = await direct();
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { message: string }).message).toContain('approved payment request');

    await rule.click();
    await expect(page.getByText('Accounts can pay approved bills directly')).toBeVisible();
  } finally {
    await api(admin, '/approval-rules', { method: 'PUT', body: { paymentsNeedRequest: false } });
  }
});
