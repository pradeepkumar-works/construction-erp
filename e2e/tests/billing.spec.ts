import { createHmac } from 'crypto';
import http from 'http';
import { expect, test } from '@playwright/test';
import { API_URL, PASSWORD, api, apiToken, signIn } from './helpers';

/*
 * Plans and billing (v3 item 34). The e2e API runs with billing on (test Razorpay keys, ₹1,500 per active project per
 * month, a seller GSTIN in Odisha) and RAZORPAY_API_URL pointing at the fake orders endpoint started here. Checkout is
 * replaced by a stand-in that answers the way Razorpay's does, signed with the test key secret.
 */
const KEY_SECRET = 'e2e-razorpay-secret';
const WEBHOOK_SECRET = 'e2e-webhook-secret';
const hmac = (secret: string, payload: string) => createHmac('sha256', secret).update(payload).digest('hex');

let razorpay: http.Server;
test.beforeAll(async () => {
  razorpay = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (req.method !== 'POST' || req.url !== '/v1/orders') return res.writeHead(404).end('{}');
      const o = JSON.parse(body) as { amount: number; receipt: string };
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ id: `order_e2e${Date.now()}${Math.floor(Math.random() * 1000)}`, amount: o.amount, currency: 'INR', receipt: o.receipt, status: 'created' }));
    });
  });
  await new Promise<void>((r) => razorpay.listen(4010, r));
});
test.afterAll(() => new Promise<void>((r) => razorpay.close(() => r())));

type Me = { organizationId: string; billing?: { status: string; trialEndsAt: string | null; paidUntil: string | null } };

async function newCompany(name: string) {
  const stamp = Date.now();
  const email = `billing-${stamp}@e2e.test`;
  const res = await fetch(`${API_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ organizationName: `${name} ${stamp}`, fullName: 'Meera Admin', email, password: PASSWORD }),
  });
  expect(res.ok).toBe(true);
  const token = await apiToken(email);
  return { email, token, me: await api<Me>(token, '/auth/me') };
}

const yesterday = () => new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

test('a company whose trial has ended is read-only until an admin pays', async ({ page }) => {
  const { email, token, me } = await newCompany('E2E Billing');
  expect(me.billing?.status).toBe('TRIAL');
  const staff = await apiToken('admin@demo.com');
  await api(staff, `/platform/companies/${me.organizationId}/trial`, { method: 'POST', body: { until: yesterday() } });

  // Read-only: everyone sees why, and writes are refused.
  const write = await fetch(`${API_URL}/approval-rules`, { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ rules: [] }) });
  expect(write.status).toBe(402);
  await signIn(page, email);
  await expect(page.getByText(/is read-only: the .* free trial has ended/)).toBeVisible();

  // Checkout stand-in: opens, "pays", and hands back what Razorpay would, signed with the key secret.
  await page.exposeFunction('fakeRazorpayPay', (orderId: string) => {
    const paymentId = `pay_e2e${Date.now()}`;
    return { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: hmac(KEY_SECRET, `${orderId}|${paymentId}`) };
  });
  await page.route('https://checkout.razorpay.com/v1/checkout.js', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `window.Razorpay = function (o) { this.o = o; };
        window.Razorpay.prototype.on = function () {};
        window.Razorpay.prototype.open = function () { var o = this.o; window.fakeRazorpayPay(o.order_id).then(function (r) { o.handler(r); }); };`,
    }),
  );

  await page.getByRole('button', { name: 'Renew' }).click();
  await expect(page).toHaveURL(/\/billing$/);
  await expect(page.getByRole('button', { name: /Pay ₹/ })).toBeDisabled();
  await page.getByLabel('Legal name').fill('E2E Billing Constructions Pvt Ltd');
  await page.getByLabel('Billing address').fill('Plot 4, Saheed Nagar, Bhubaneswar 751007');
  await page.getByLabel('State (place of supply)').fill('Odisha');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Save details' }).click();
  await expect(page.getByText('Invoice details saved')).toBeVisible();

  // One active project's worth (the minimum) at ₹1,500, plus CGST and SGST inside Odisha.
  await expect(page.getByText('CGST 9% + SGST 9%')).toBeVisible();
  await page.getByRole('button', { name: 'Pay ₹ 1,770.00' }).click();
  await expect(page.getByText(/Payment received. Paid until/)).toBeVisible();
  const invoiceRow = page.locator('.ant-table-row').filter({ hasText: /NIR\d{4}-\d{5}/ });
  await expect(invoiceRow).toHaveCount(1);
  await expect(page.getByText(/is read-only/)).toHaveCount(0);

  const popup = page.waitForEvent('popup');
  await invoiceRow.getByRole('button', { name: 'Print' }).click();
  const invoice = await popup;
  await expect(invoice.getByText('Tax invoice')).toBeVisible();
  await expect(invoice.getByText('E2E Billing Constructions Pvt Ltd')).toBeVisible();
  await invoice.close();

  const after = await api<Me>(token, '/auth/me');
  expect(after.billing?.status).toBe('ACTIVE');
  const log = await api<{ action: string }[]>(token, '/company-data/log');
  expect(log.some((l) => l.action === 'SUBSCRIPTION_PAID')).toBe(true);
});

test("Razorpay's webhook records a payment whose browser closed, once", async () => {
  const { token } = await newCompany('E2E Webhook');
  await api(token, '/billing/details', { method: 'PUT', body: { name: 'E2E Webhook Pvt Ltd', gstin: '27AAACW1234F1Z5', address: 'Pune' } });
  const summary = await api<{ yearly: { igst: string; total: string } }>(token, '/billing');
  expect(summary.yearly.igst).toBe('2700.00'); // Maharashtra buyer: IGST, and a year is charged as ten months
  const order = await api<{ orderId: string; amount: number }>(token, '/billing/orders', { method: 'POST', body: { months: 12 } });
  expect(order.amount).toBe(1770000);

  const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: `pay_hook${Date.now()}`, order_id: order.orderId, status: 'captured' } } } });
  const send = (sig: string) => fetch(`${API_URL}/billing/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-razorpay-signature': sig }, body });
  expect((await send('forged')).status).toBe(400);
  expect((await send(hmac(WEBHOOK_SECRET, body))).status).toBe(200);
  expect((await send(hmac(WEBHOOK_SECRET, body))).status).toBe(200);

  const invoices = await api<{ total: string; periodFrom: string; periodTo: string }[]>(token, '/billing/invoices');
  expect(invoices).toHaveLength(1);
  expect(invoices[0].total).toBe('17700.00');
  const me = await api<Me>(token, '/auth/me');
  expect(me.billing?.paidUntil).toBe(invoices[0].periodTo);
});

test('the demo company is not charged, and only admins see billing', async ({ page }) => {
  const admin = await api<Me>(await apiToken('admin@demo.com'), '/auth/me');
  expect(admin.billing?.status).toBe('EXEMPT');
  const pm = await apiToken('pm@demo.com');
  const denied = await fetch(`${API_URL}/billing`, { headers: { authorization: `Bearer ${pm}` } });
  expect(denied.status).toBe(403);
  await signIn(page, 'pm@demo.com');
  await expect(page.getByRole('link', { name: 'Billing', exact: true })).toHaveCount(0);
});
