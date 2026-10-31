import { expect, test } from '@playwright/test';
import { api, apiToken, signIn } from './helpers';

interface Page<T> {
  items: T[];
}
type Mr = { id: string; requestNo: string; items: { id: string; itemName: string }[] };
type Row = { stage: string; needsApproval: boolean; final: { vendorName: string | null; approval: { choiceId: string; status: string } | null } | null };
type Matrix = { ordersNeedApprovedChoice: boolean };

/**
 * Orders wait for an approved supplier choice (Admin › Approval rules): finalising L1 sends the choice to the approver,
 * no order can be raised on the request until it is approved, and then only on the approved supplier.
 */
test('a finalised supplier waits for approval before the order', async ({ browser, page }) => {
  const admin = await apiToken('admin@demo.com');
  const engineer = await apiToken('engineer@demo.com');
  const pm = await apiToken('pm@demo.com');
  const procurement = await apiToken('procurement@demo.com');
  const before = await api<Matrix>(admin, '/approval-rules');
  await api(admin, '/approval-rules', { method: 'PUT', body: { ordersNeedApprovedChoice: true } });
  try {
    const road = (await api<Page<{ id: string; code: string }>>(engineer, '/projects?pageSize=100')).items.find((p) => p.code === 'RD-2026-01')!;
    const vendors = (await api<Page<{ id: string; name: string }>>(procurement, '/vendors?pageSize=100')).items;
    const safety = vendors.find((v) => v.name === 'Kalinga Safety Store')!;
    const auto = vendors.find((v) => v.name === 'Sahoo Auto Parts')!;
    const mr = await api<Mr>(engineer, '/material-requests', {
      method: 'POST',
      body: { projectId: road.id, requiredDate: new Date().toISOString().slice(0, 10), items: [{ itemName: `Safety shoes (choice ${Date.now()})`, unit: 'Nos', quantity: '30' }], submit: true },
    });
    await api(pm, `/approvals/material_request/${mr.id}/review`, { method: 'POST', body: { decision: 'APPROVE' } });
    const quote = (vendorId: string, rate: string) =>
      api(procurement, '/quotations', {
        method: 'POST',
        body: { materialRequestId: mr.id, vendorId, quoteDate: new Date().toISOString().slice(0, 10), freight: '0', lines: [{ materialRequestItemId: mr.items[0].id, rate, gstRate: '18' }] },
      });
    await quote(safety.id, '900');
    await quote(auto.id, '950');
    const row = () => api<Row>(procurement, `/material-requests/${mr.id}/to-order`);
    expect((await row()).needsApproval).toBe(true);

    // Purchase finalises L1 on the screen; it goes for approval and the screen says so.
    await signIn(page, 'procurement@demo.com');
    await page.goto(`/requests-to-order/${mr.id}`);
    await expect(page.getByRole('tab', { name: /Finalise and approve/ })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('button', { name: 'Finalise L1' }).first().click();
    await expect(page.getByText('Waiting for approval:')).toBeVisible();
    const waiting = await row();
    expect(waiting.stage).toBe('AWAITING_APPROVAL');
    const choiceId = waiting.final!.approval!.choiceId;

    // No order on the request until it is approved.
    const po = (vendorId: string) =>
      api(procurement, '/purchase-orders', {
        method: 'POST',
        body: { projectId: road.id, vendorId, materialRequestId: mr.id, lines: [{ materialRequestItemId: mr.items[0].id, quantity: '30', rate: '900' }] },
      });
    await expect(po(safety.id)).rejects.toThrow(/waiting for approval/);

    // The project manager approves it from the choice's own page, in a session of their own.
    const pmContext = await browser.newContext();
    const pmPage = await pmContext.newPage();
    await signIn(pmPage, 'pm@demo.com');
    await pmPage.goto(`/supplier-choices/${choiceId}`);
    await expect(pmPage.getByRole('heading', { level: 1 })).toContainText(mr.requestNo);
    await expect(pmPage.getByText('Is L1')).toBeVisible();
    await pmPage.getByRole('toolbar', { name: 'Record actions' }).getByRole('button', { name: 'Approve' }).click();
    await pmPage.locator('.ant-modal').getByRole('button', { name: 'Approve' }).click();
    await pmContext.close();
    await expect.poll(async () => (await row()).stage).toBe('READY');

    // Then the order goes only to the approved supplier.
    await expect(po(auto.id)).rejects.toThrow(/approved supplier/);
    await po(safety.id);
  } finally {
    await api(admin, '/approval-rules', { method: 'PUT', body: { ordersNeedApprovedChoice: before.ordersNeedApprovedChoice } });
  }
});
