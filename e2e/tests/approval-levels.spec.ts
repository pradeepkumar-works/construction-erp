import { expect, test } from '@playwright/test';
import { api, apiToken, localToday, signIn } from './helpers';

type Rule = { roleKey: string; type: string; maxAmount: string | null; level?: number; minAmount?: string | null };
type Matrix = { custom: boolean; rules: Rule[]; escalations: { type: string; remindAfterHours: number | null; escalateAfterHours: number | null }[] };
type Stage = { level: number; levels: number; status: string; canReview: boolean; reason: string | null; waitingWith: string[]; steps: { level: number; action: string; byName: string | null }[] };
type Waiting = { type: string; id: string; level: number; levels: number; waitingWith: string[] };
type Pending = { type: string; id: string; level?: number; levels?: number };

const NAME = 'Shuttering plywood, second level (e2e)';

/**
 * Approval levels: above an amount a site expense needs a second approval by management after the first
 * (the project manager's or accounts'). The entry waits at level 1, then level 2; the level-1 roles cannot decide the
 * second level; the submitter sees whose queue it is in. The matrix is put back as it was.
 */
test('a site expense above the amount goes to management after the project manager', async ({ page }) => {
  const admin = await apiToken('admin@demo.com');
  const engineer = await apiToken('engineer@demo.com');
  const pm = await apiToken('pm@demo.com');
  const accounts = await apiToken('accounts@demo.com');
  const md = await apiToken('md@demo.com');
  const before = await api<Matrix>(admin, '/approval-rules');
  for (const e of (await api<{ items: { id: string }[] }>(engineer, `/expenses?q=${encodeURIComponent(NAME)}&pageSize=50`)).items) await api(engineer, `/expenses/${e.id}`, { method: 'DELETE' }).catch(() => undefined);

  try {
    const rules = [...before.rules, { roleKey: 'MANAGEMENT', type: 'EXPENSE', maxAmount: null, level: 2, minAmount: '15000' }];
    const saved = await api<Matrix>(admin, '/approval-rules', { method: 'PUT', body: { rules } });
    expect(saved.rules.some((r) => r.type === 'EXPENSE' && r.level === 2 && r.minAmount === '15000.00')).toBe(true);

    const [project] = (await api<{ items: { id: string }[] }>(engineer, '/projects?pageSize=1')).items;
    const x = await api<{ id: string }>(engineer, '/expenses', {
      method: 'POST',
      body: { projectId: project.id, date: localToday(), category: 'MATERIAL_LOCAL', description: NAME, amount: '18000', paymentMode: 'CASH', submit: true },
    });

    // The submitter sees it waiting at level 1 of 2, with the project manager.
    const mine = (await api<Waiting[]>(engineer, '/approvals/waiting')).find((w) => w.id === x.id);
    expect(mine).toMatchObject({ type: 'EXPENSE', level: 1, levels: 2 });
    expect(mine!.waitingWith).toContain('Project Manager');
    expect((await api<Pending[]>(accounts, '/approvals/pending')).find((p) => p.id === x.id), 'accounts approves level 1 too').toMatchObject({ level: 1, levels: 2 });

    // The project manager approves level 1 on the record page; it stays waiting, now for management.
    await signIn(page, 'pm@demo.com');
    await page.goto(`/expenses/${x.id}`);
    const levels = page.getByTestId('approval-levels');
    await expect(levels.getByRole('list', { name: 'Approval levels' })).toContainText('Level 1: waiting');
    await page.getByRole('toolbar', { name: 'Record actions' }).getByRole('button', { name: 'Approve' }).click();
    await page.locator('.ant-modal').getByRole('button', { name: 'Approve' }).click();
    await expect(page.locator('.ant-message').getByText('Approved level 1 of 2. It goes to level 2 next.')).toBeVisible();

    const pmStage = await api<Stage>(pm, `/approvals/expense/${x.id}/stage`);
    expect(pmStage).toMatchObject({ status: 'SUBMITTED', level: 2, levels: 2, canReview: false });
    expect(pmStage.reason).toMatch(/You approved an earlier level/);
    expect(pmStage.steps).toEqual([expect.objectContaining({ level: 1, action: 'APPROVED' })]);
    await page.reload();
    await expect(levels).toContainText('Waiting with Management');
    await expect(levels).toContainText('You cannot decide it now.');
    await expect(page.getByRole('toolbar', { name: 'Record actions' }).getByRole('button', { name: 'Approve' })).toHaveCount(0);

    // It has left accounts' queue; management finds it at level 2 and approves it: now it is approved.
    expect((await api<Pending[]>(accounts, '/approvals/pending')).some((p) => p.id === x.id)).toBe(false);
    expect((await api<Pending[]>(md, '/approvals/pending')).find((p) => p.id === x.id)).toMatchObject({ level: 2, levels: 2 });
    await api(md, `/approvals/expense/${x.id}/review`, { method: 'POST', body: { decision: 'APPROVE' } });
    const done = await api<Stage>(engineer, `/approvals/expense/${x.id}/stage`);
    expect(done.status).toBe('APPROVED');
    expect(done.steps.map((s) => s.level)).toEqual([1, 2]);
    expect((await api<Waiting[]>(engineer, '/approvals/waiting')).some((w) => w.id === x.id)).toBe(false);
  } finally {
    await api(admin, '/approval-rules', { method: 'PUT', body: { rules: before.custom ? before.rules : [] } });
  }
});

test('the approval rules page sets a second approval and escalation per type', async ({ page }) => {
  const admin = await apiToken('admin@demo.com');
  const before = await api<Matrix>(admin, '/approval-rules');
  try {
    await signIn(page, 'admin@demo.com');
    await page.goto('/approval-rules');
    const card = page.locator('.ant-card').filter({ hasText: 'Higher approval levels and escalation' });
    await expect(card).toBeVisible();
    await card.getByLabel('Site Expense escalate after hours').fill('48');
    await card.getByLabel('Site Expense remind approvers after hours').fill('24');
    await page.getByRole('button', { name: 'Save rules' }).click();
    await expect(page.locator('.ant-message').getByText('Approval rules saved')).toBeVisible();
    const after = await api<Matrix>(admin, '/approval-rules');
    expect(after.escalations).toContainEqual({ type: 'EXPENSE', remindAfterHours: 24, escalateAfterHours: 48 });
    // Timing reminders alone leaves the rules as they were.
    expect(after.custom).toBe(before.custom);
  } finally {
    await api(admin, '/approval-rules', { method: 'PUT', body: { escalations: before.escalations } });
  }
});
