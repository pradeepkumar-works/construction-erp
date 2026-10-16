import { expect, test } from '@playwright/test';
import { api, apiToken, signIn } from './helpers';

interface Project { id: string; code: string }
interface MaterialRequest { id: string; requestNo: string; status: string }
interface Note { id: string; type: string; entityId: string | null; readAt: string | null; body: string }
interface NoteList { items: Note[]; unreadCount: number; unreadByTab: Record<'FOR_ME' | 'APPROVALS' | 'REMINDERS', number> }

/** Notifications centre (UI roadmap item 63): tabs by kind, grouped by day, and a submission opens over the page. */
test.describe.serial('notifications centre', () => {
  let mr: MaterialRequest;
  let pm: string;

  test.beforeAll(async () => {
    const engineer = await apiToken('engineer@demo.com');
    const projects = await api<{ items: Project[] }>(engineer, '/projects?pageSize=50');
    const road = projects.items.find((p) => p.code === 'RD-2026-01')!;
    const due = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
    mr = await api<MaterialRequest>(engineer, '/material-requests', {
      method: 'POST',
      body: { projectId: road.id, requiredDate: due, priority: 'NORMAL', remarks: 'e2e notifications centre', items: [{ itemName: 'OPC 53 Grade Cement', unit: 'Bags', quantity: '40' }], submit: true },
    });
    pm = await apiToken('pm@demo.com');
  });

  test('the API files a submission under Approvals and counts unread per tab', async () => {
    await expect.poll(async () => (await api<NoteList>(pm, '/notifications?allTypes=true&tab=APPROVALS&limit=50')).items.some((n) => n.entityId === mr.id)).toBe(true);
    const approvals = await api<NoteList>(pm, '/notifications?allTypes=true&tab=APPROVALS&limit=50');
    expect(approvals.items.every((n) => ['SUBMISSION_SUBMITTED', 'APPROVAL_DIGEST'].includes(n.type))).toBe(true);
    expect(approvals.unreadByTab.APPROVALS).toBeGreaterThan(0);
    expect(approvals.unreadByTab.FOR_ME + approvals.unreadByTab.APPROVALS + approvals.unreadByTab.REMINDERS).toBe(approvals.unreadCount);
    const reminders = await api<NoteList>(pm, '/notifications?allTypes=true&tab=REMINDERS&limit=50');
    expect(reminders.items.some((n) => n.entityId === mr.id)).toBe(false);
  });

  test('the bell opens the drawer, and the request opens over the page', async ({ page }) => {
    await signIn(page, 'pm@demo.com');
    await page.goto('/projects');
    await page.getByRole('button', { name: /^Notifications/ }).click();
    const drawer = page.getByRole('dialog', { name: 'Notifications' });
    await expect(drawer.getByRole('tab', { name: /For me/ })).toBeVisible();
    await expect(drawer.getByRole('tab', { name: /Reminders/ })).toBeVisible();
    await drawer.getByRole('tab', { name: /Approvals/ }).click();
    await expect(drawer.getByRole('region', { name: 'Today' })).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Mark all read' })).toBeEnabled();
    const row = drawer.locator('[data-unread]').filter({ hasText: mr.requestNo }).first();
    await row.click();
    await expect(page.getByRole('dialog').filter({ hasText: mr.requestNo }).filter({ hasNotText: 'For me' })).toBeVisible();
    await expect(page).toHaveURL(/\/projects$/);
    await expect.poll(async () => (await api<NoteList>(pm, '/notifications?allTypes=true&tab=APPROVALS&limit=50')).items.find((n) => n.entityId === mr.id)?.readAt).toBeTruthy();
  });

  test('being offline shows in the message bar', async ({ page, context }) => {
    await signIn(page, 'engineer@demo.com');
    const bar = page.getByRole('region', { name: 'Messages' });
    await context.setOffline(true);
    await expect(bar.getByText(/You are offline/)).toBeVisible();
    await context.setOffline(false);
    await expect(bar).toHaveCount(0);
  });
});
