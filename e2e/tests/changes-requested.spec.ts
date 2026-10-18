import { expect, test } from '@playwright/test';
import { API_URL, api, apiToken, newestFirst, queueItem, signIn, formPanel } from './helpers';

interface Project { id: string; code: string }
interface MaterialRequest { id: string; requestNo: string; status: string; reviewNote: string | null }

/** An approver sends a request back with a reason; the engineer edits it and resubmits. */
test.describe.serial('material request: changes requested, then resubmitted', () => {
  let mr: MaterialRequest;
  const reason = `e2e: split the cement into two deliveries ${Date.now()}`;

  test.beforeAll(async () => {
    const token = await apiToken('engineer@demo.com');
    const projects = await api<{ items: Project[] }>(token, '/projects?pageSize=50');
    const road = projects.items.find((p) => p.code === 'RD-2026-01')!;
    const due = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
    mr = await api<MaterialRequest>(token, '/material-requests', {
      method: 'POST',
      body: { projectId: road.id, requiredDate: due, priority: 'NORMAL', remarks: 'e2e request', items: [{ itemName: 'OPC 53 Grade Cement', unit: 'Bags', quantity: '120' }], submit: true },
    });
    expect(mr.status).toBe('SUBMITTED');
  });

  test('the API refuses to reject or send back without a reason', async () => {
    const pm = await apiToken('pm@demo.com');
    for (const [decision, message] of [
      ['REQUEST_CHANGES', 'Say what needs changing'],
      ['REJECT', 'Say why you are rejecting it'],
    ] as const) {
      const res = await fetch(`${API_URL}/approvals/material_request/${mr.id}/review`, {
        method: 'POST',
        headers: { authorization: `Bearer ${pm}`, 'content-type': 'application/json' },
        body: JSON.stringify({ decision, note: '  ' }),
      });
      expect(res.status).toBe(400);
      expect(((await res.json()) as { message: string }).message).toContain(message);
    }
    expect((await api<MaterialRequest>(pm, `/material-requests/${mr.id}`)).status).toBe('SUBMITTED');
  });

  test('the project manager requests changes with a reason', async ({ page }) => {
    await signIn(page, 'pm@demo.com');
    await page.goto('/approvals');
    await newestFirst(page);
    const entry = queueItem(page, mr.requestNo);
    await entry.open();
    await entry.decision.getByRole('button', { name: /Request changes/ }).click();
    const modal = page.locator('.ant-modal').filter({ hasText: 'Reason' });
    await modal.getByRole('button', { name: 'Request changes' }).click();
    await expect(modal.getByText('Say what needs changing')).toBeVisible();
    await modal.getByLabel('Reason').fill(reason);
    await modal.getByRole('button', { name: 'Request changes' }).click();
    await expect(page.getByText('Changes requested', { exact: true }).first()).toBeVisible();
  });

  test('the engineer sees the reason, edits the request and resubmits it', async ({ page }) => {
    await signIn(page, 'engineer@demo.com');
    await page.goto('/material-requests');
    const row = page.locator('tr').filter({ hasText: mr.requestNo });
    await expect(row.getByText('Changes Requested', { exact: false })).toBeVisible();
    await row.getByRole('button', { name: 'Actions' }).click();
    await page.getByRole('menuitem', { name: 'Edit & resubmit' }).click();
    const modal = formPanel(page, mr.requestNo);
    await expect(modal.getByText(reason)).toBeVisible();
    await modal.getByRole('button', { name: 'Resubmit request' }).click();
    await expect(modal).toBeHidden();

    const token = await apiToken('engineer@demo.com');
    const after = await api<MaterialRequest>(token, `/material-requests/${mr.id}`);
    expect(after.status).toBe('SUBMITTED');
    const audit = await api<{ action: string }[]>(token, `/approvals/material_request/${mr.id}/audit`);
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(['CHANGES_REQUESTED', 'RESUBMITTED']));
  });
});
