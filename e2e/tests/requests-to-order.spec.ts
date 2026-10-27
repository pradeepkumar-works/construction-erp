import { expect, test } from '@playwright/test';
import { api, apiToken, signIn } from './helpers';

interface Page<T> {
  items: T[];
}
type Mr = { id: string; requestNo: string; items: { id: string; itemName: string }[] };
type Row = { id: string; stage: string; l1: { vendorName: string; total: string } | null; l2: { vendorName: string; total: string } | null; final: { vendorName: string | null; rank: number | null; reason: string | null } | null };
type ToOrderPage = Page<Row> & { stages: Record<string, number> };

/**
 * Requests to order: purchase works from its own list, not from Materials. An approved request shows there at its
 * stage (no quotations, waiting for quotations, L1 to finalise, L1 finalised with the PO to raise), and its own screen
 * takes it through the enquiry, the quotations, Finalise L1 with the figures beside it, and the order.
 */
test('an approved request reaches purchase, who finalise L1 and raise the order from it', async ({ page }) => {
  const engineer = await apiToken('engineer@demo.com');
  const pm = await apiToken('pm@demo.com');
  const procurement = await apiToken('procurement@demo.com');
  const road = (await api<Page<{ id: string; code: string }>>(engineer, '/projects?pageSize=100')).items.find((p) => p.code === 'RD-2026-01')!;
  const vendors = (await api<Page<{ id: string; name: string }>>(procurement, '/vendors?pageSize=100')).items;
  const safety = vendors.find((v) => v.name === 'Kalinga Safety Store')!;
  const auto = vendors.find((v) => v.name === 'Sahoo Auto Parts')!;
  const stamp = Date.now();
  const [gloves, helmets] = [`Hand gloves (to order ${stamp})`, `Helmets (to order ${stamp})`];

  const mr = await api<Mr>(engineer, '/material-requests', {
    method: 'POST',
    body: { projectId: road.id, requiredDate: new Date().toISOString().slice(0, 10), items: [{ itemName: gloves, unit: 'Nos', quantity: '100' }, { itemName: helmets, unit: 'Nos', quantity: '20' }], submit: true },
  });
  await api(pm, `/approvals/material_request/${mr.id}/review`, { method: 'POST', body: { decision: 'APPROVE' } });
  const row = () => api<Row>(procurement, `/material-requests/${mr.id}/to-order`);
  expect((await row()).stage).toBe('TO_ENQUIRE');
  const listed = await api<ToOrderPage>(procurement, `/purchase-orders/requests-to-order?q=${encodeURIComponent(mr.requestNo)}`);
  expect(listed.items.map((r) => r.id)).toContain(mr.id);

  // The safety store is cheaper on both items, so it is L1 and the other L2.
  const quote = (vendorId: string, rates: string[]) =>
    api(procurement, '/quotations', {
      method: 'POST',
      body: { materialRequestId: mr.id, vendorId, quoteDate: new Date().toISOString().slice(0, 10), freight: '0', lines: mr.items.map((i, n) => ({ materialRequestItemId: i.id, rate: rates[n], gstRate: '18' })) },
    });
  await quote(safety.id, ['45', '300']);
  await quote(auto.id, ['50', '320']);
  const ranked = await row();
  expect(ranked.stage).toBe('TO_FINALISE');
  expect([ranked.l1?.vendorName, ranked.l2?.vendorName]).toEqual(['Kalinga Safety Store', 'Sahoo Auto Parts']);

  // Choosing the L2 needs a reason; the API refuses it bare.
  const l2 = (await api<{ quotations: { id: string; vendorName: string }[] }>(procurement, `/material-requests/${mr.id}/comparative`)).quotations.find((q) => q.vendorName === 'Sahoo Auto Parts')!;
  await expect(api(procurement, `/material-requests/${mr.id}/finalise`, { method: 'POST', body: { quotationId: l2.id } })).rejects.toThrow(/is L2, not the lowest. Say why/);

  await signIn(page, 'procurement@demo.com');
  await page.goto('/requests-to-order');
  await page.getByRole('searchbox', { name: 'Search requests to order' }).fill(mr.requestNo);
  await page.getByRole('link', { name: mr.requestNo }).click();
  await expect(page).toHaveURL(new RegExp(`/requests-to-order/${mr.id}`));
  await expect(page.getByRole('heading', { level: 1, name: mr.requestNo })).toBeVisible();

  // The request lands on Finalise L1, with the ranking and the figures to decide by.
  await expect(page.getByRole('tab', { name: /3\. Finalise L1/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('L1 for what is left')).toBeVisible();
  await page.getByRole('button', { name: 'Finalise L1' }).click();
  // Finalising moves on to the order, raised on the supplier finalised.
  await expect(page.getByRole('tab', { name: /4\. Purchase order/ })).toHaveAttribute('aria-selected', 'true');
  const ready = await row();
  expect(ready.stage).toBe('READY');
  expect([ready.final?.vendorName, ready.final?.rank]).toEqual(['Kalinga Safety Store', 1]);

  await page.getByRole('button', { name: 'Raise PO on Kalinga Safety Store' }).click();
  await expect(page.getByText(`Purchase order for ${mr.requestNo}`)).toBeVisible();
});

type Card = { count: number; items: { href: string }[] };
type MyWork = Partial<Record<'grnsToCheck' | 'toMatch' | 'toDebit' | 'transfersToReceive' | 'toOrder', Card>>;

/** Receipts after the store wait on their own desks: QA/QC checks them, accounts bills them and raises the debit notes. */
test('each desk after the store has its own queue on My work', async () => {
  const [qa, accounts] = await Promise.all(['qaqc@demo.com', 'accounts@demo.com'].map(async (e) => api<MyWork>(await apiToken(e), '/dashboard/my-work')));
  expect(qa.grnsToCheck).toBeDefined();
  for (const i of qa.grnsToCheck!.items) expect(i.href).toBe('/inspections?tab=grns');
  expect(accounts.toDebit).toBeDefined();
  expect(accounts.toMatch).toBeDefined();
  expect(accounts.grnsToCheck).toBeUndefined();
});

test('QA/QC checks material from Quality', async ({ page }) => {
  await signIn(page, 'qaqc@demo.com');
  await page.goto('/inspections?tab=grns');
  await expect(page.getByRole('tab', { name: /Material to check/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('searchbox', { name: 'Search material to check' })).toBeVisible();
});

test('accounts bill what was received and raise the debit notes from their own pages', async ({ page }) => {
  await signIn(page, 'accounts@demo.com');
  await page.goto('/vendor-bills?tab=to-bill');
  await expect(page.getByRole('tab', { name: /Received, not billed/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('searchbox', { name: 'Search goods received' })).toBeVisible();
  await page.goto('/payables?tab=debit-notes&sub=to-raise');
  await expect(page.getByRole('tab', { name: /To raise/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('searchbox', { name: 'Search rejected and returned material' })).toBeVisible();
});

test('the store sees what is on order and receives it from Stock', async ({ page }) => {
  await signIn(page, 'store@demo.com');
  await page.goto('/stock?sub=deliveries');
  await expect(page.getByRole('tab', { name: /Deliveries expected/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Approved orders with something still to come')).toBeVisible();
});
