import { expect, test } from '@playwright/test';
import { API_URL, api, apiToken, chooseOption, localToday, signIn } from './helpers';

interface Page<T> {
  items: T[];
}
type Request = { id: string; requestNo: string; kind: string; status: string; reason: string | null; amount: string; paidAmount: string; outstanding: string; paidDate: string | null; imprestId: string | null };
type Imprest = { id: string; projectId: string; cashInHand: string };
type Project = { id: string; code: string };

const post = (token: string, path: string, body: unknown) =>
  fetch(`${API_URL}${path}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });

/**
 * Site fund requests (v6 item 107): the highway's engineer asks head office for wages money into their imprest from
 * Site imprest, management approves it, and accounts release it from the request; the holder's cash in hand goes up.
 */
test('a site asks for funds into its imprest, and accounts release them once approved', async ({ page }) => {
  const engineer = await apiToken('engineer@demo.com');
  const md = await apiToken('md@demo.com');
  const imprest = (await api<Imprest[]>(engineer, '/imprests?mine=true')).find((i) => i)!;
  const before = Number(imprest.cashInHand);
  const reason = `E2E wages ${Date.now()}`;

  await signIn(page, 'engineer@demo.com');
  await page.goto('/imprest?tab=funds');
  await page.getByRole('button', { name: 'Request funds' }).first().click();
  const modal = page.locator('.ant-modal').filter({ hasText: 'Request funds' });
  await chooseOption(modal.getByLabel('For the site'), 'RD-2026-01');
  // Wages is the first purpose.
  await chooseOption(modal.getByLabel('For', { exact: true }));
  // The site's one imprest is picked by itself.
  await expect(modal.getByText(/Priya Mohanty · /)).toBeVisible();
  await modal.getByLabel('Amount').fill('15000');
  await modal.getByLabel('What it is for').fill(reason);
  await modal.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(page.getByText(/PR-\d{4}-\d{4} submitted for approval/)).toBeVisible();

  const mine = (await api<Page<Request>>(engineer, `/payment-requests?kind=FUND_REQUEST&q=${encodeURIComponent(reason)}`)).items[0];
  expect(mine.status).toBe('SUBMITTED');
  expect(mine.imprestId).toBe(imprest.id);
  await api(md, `/approvals/payment_request/${mine.id}/review`, { method: 'POST', body: { decision: 'APPROVE' } });

  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
  await signIn(page, 'accounts@demo.com');
  await page.goto(`/payment-requests/${mine.id}`);
  await page.getByRole('button', { name: /^Release / }).click();
  const release = page.locator('.ant-modal').filter({ hasText: `Release · ${mine.requestNo}` });
  await release.getByLabel('Reference').fill('E2E NEFT');
  await release.getByRole('button', { name: 'Release' }).click();
  await expect(page.getByText(new RegExp(`${mine.requestNo}: released into`))).toBeVisible();

  const after = await api<Request>(md, `/payment-requests/${mine.id}`);
  expect(Number(after.paidAmount)).toBe(15000);
  expect(after.paidDate).toBeTruthy();
  const held = await api<Imprest>(engineer, `/imprests/${imprest.id}`);
  expect(Number(held.cashInHand)).toBe(before + 15000);
});

/**
 * A fund request to a party is paid on account under Payables, not released; site staff see only fund requests; and
 * a fund request names exactly one of an imprest or a party.
 */
test('a fund request to a party is paid on account; site staff see only fund requests', async () => {
  const engineer = await apiToken('engineer@demo.com');
  const md = await apiToken('md@demo.com');
  const accounts = await apiToken('accounts@demo.com');
  const road = (await api<{ items: Project[] }>(engineer, '/projects?pageSize=100')).items.find((p) => p.code === 'RD-2026-01')!;
  const imprest = (await api<Imprest[]>(engineer, '/imprests?mine=true')).find((i) => i.projectId === road.id)!;
  const vendor = (await api<{ items: { id: string; name: string }[] }>(engineer, '/vendors?q=Maa%20Tarini&pageSize=5')).items[0];
  expect(vendor).toBeTruthy();

  const both = await post(engineer, '/payment-requests', { kind: 'FUND_REQUEST', projectId: road.id, purpose: 'WAGES', imprestId: imprest.id, vendorId: vendor.id, amount: '1000', reason: 'Both' });
  expect(both.status).toBe(400);

  const created = await api<Request>(engineer, '/payment-requests', {
    method: 'POST',
    body: { kind: 'FUND_REQUEST', projectId: road.id, purpose: 'PETTY_CONTRACTOR', vendorId: vendor.id, amount: '8000', reason: `E2E on account ${Date.now()}`, submit: true },
  });
  expect(created.status).toBe('SUBMITTED');
  await api(md, `/approvals/payment_request/${created.id}/review`, { method: 'POST', body: { decision: 'APPROVE' } });

  // Released only into an imprest: this one is paid under Payables.
  expect((await post(accounts, `/payment-requests/${created.id}/release`, { date: localToday() })).status).toBe(400);
  const payment = await api<{ billLabel: string }>(accounts, '/vendor-payments', { method: 'POST', body: { paymentRequestId: created.id, paymentDate: localToday(), amount: '8000', mode: 'BANK', reference: 'E2E UTR' } });
  expect(payment.billLabel).toBe(`On account (${created.requestNo})`);
  const paid = await api<Request>(accounts, `/payment-requests/${created.id}`);
  expect(Number(paid.paidAmount)).toBe(8000);
  expect(paid.paidDate).toBeTruthy();

  // The engineer asks for payments only as fund requests, and sees no others.
  const seen = await api<Page<Request>>(engineer, '/payment-requests?pageSize=100');
  expect(seen.items.length).toBeGreaterThan(0);
  expect(seen.items.every((r) => r.kind === 'FUND_REQUEST')).toBe(true);
});
