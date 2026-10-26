import { expect, test } from '@playwright/test';
import { api, apiToken } from './helpers';

interface Page<T> {
  items: T[];
}
type Mr = { id: string; requestNo: string; items: { id: string }[] };
type Po = { id: string; poNo: string; lines: { id: string }[] };
type Bill = { id: string; billNo: string; matched: boolean; exceptions: string[] };
type Notification = { title: string; body: string; type: string; entityId: string | null };

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Finding 18 of the October review: a supplier's bill that misses its order is purchase's and the project manager's to
 * settle, not the approver's alone. Accounts records a bill for more than the store received and submits it; purchase
 * is told what the mismatch is, with the bill to open.
 */
test('a vendor bill that misses its order is handed to purchase and the project manager', async () => {
  const engineer = await apiToken('engineer@demo.com');
  const pm = await apiToken('pm@demo.com');
  const md = await apiToken('md@demo.com');
  const store = await apiToken('store@demo.com');
  const accounts = await apiToken('accounts@demo.com');
  const procurement = await apiToken('procurement@demo.com');
  const road = (await api<Page<{ id: string; code: string }>>(engineer, '/projects?pageSize=100')).items.find((p) => p.code === 'RD-2026-01')!;
  const vendor = (await api<Page<{ id: string; name: string }>>(procurement, '/vendors?pageSize=100')).items.find((v) => v.name === 'Kalinga Safety Store')!;

  const mr = await api<Mr>(engineer, '/material-requests', {
    method: 'POST',
    body: { projectId: road.id, requiredDate: today(), items: [{ itemName: 'Safety net 5 m (e2e handoff)', unit: 'Sqm', quantity: '100' }], submit: true },
  });
  await api(pm, `/approvals/material_request/${mr.id}/review`, { method: 'POST', body: { decision: 'APPROVE' } });
  const po = await api<Po>(procurement, '/purchase-orders', {
    method: 'POST',
    body: { projectId: road.id, vendorId: vendor.id, materialRequestId: mr.id, lines: [{ materialRequestItemId: mr.items[0].id, quantity: '100', rate: '120' }], submit: true },
  });
  await api(md, `/approvals/purchase_order/${po.id}/review`, { method: 'POST', body: { decision: 'APPROVE' } });
  // Only 40 of the 100 Sqm arrived.
  await api(store, '/stock/receipts', { method: 'POST', body: { purchaseOrderId: po.id, date: today(), lines: [{ purchaseOrderLineId: po.lines[0].id, quantity: '40' }] } });

  // The vendor invoices all 100 at a rate above the order: two mismatches, and the bill still goes for approval.
  const invoiceNo = `E2E-HANDOFF-${Date.now()}`;
  const bill = await api<Bill>(accounts, '/vendor-bills', {
    method: 'POST',
    body: { purchaseOrderId: po.id, invoiceNo, invoiceDate: today(), lines: [{ purchaseOrderLineId: po.lines[0].id, quantity: '100', rate: '135' }], submit: true },
  });
  expect(bill.matched).toBe(false);
  expect(bill.exceptions.length).toBeGreaterThan(1);

  const handoff = (await api<{ items: Notification[] }>(procurement, '/notifications?limit=50')).items.find((n) => n.entityId === bill.id && n.type === 'HANDOFF');
  expect(handoff, 'purchase is told the bill misses its order').toBeTruthy();
  expect(handoff!.title).toContain(`${bill.billNo} does not match the order`);
  expect(handoff!.body).toContain(invoiceNo);
  expect(handoff!.body).toContain('Settle it with the vendor');
  // The mismatch itself is in the notice, so purchase need not open the bill to know what it is.
  expect(handoff!.body).toMatch(/received|above the order/);

  await api(accounts, `/vendor-bills/${bill.id}`, { method: 'DELETE' }).catch(() => undefined);
});
