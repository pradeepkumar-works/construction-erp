import { expect, test } from '@playwright/test';
import { api, apiToken, formPanel, signIn } from './helpers';

interface Page<T> {
  items: T[];
}
type Budget = {
  hasHeadBudget: boolean;
  budgetAtCompletion: string | null;
  boqBudget: string | null;
  itemsWithoutBudgetRate: number;
  boqItems: { boqItemId: string; rate: string; budgetRate: string | null }[];
  forecastAtCompletion: string | null;
  actualCost: string;
  pctComplete: number;
  inForce: { id: string; versionNo: number } | null;
  open: { id: string; versionNo: number; status: string } | null;
  versions: { versionNo: number }[];
};
type CashFlow = { periods: { net: string; cumulative: string; remainingBudget: string }[]; projectsWithoutBudget: { projectCode: string }[] };

/**
 * Budget versions and the forecast: the project manager prepares a version of the water supply project's budget (seeded
 * without one) by cost head, fills the BOQ budget rates at 80% of the client's rate and sends it. Nothing moves until
 * management approves it; then the forecast at completion and the cash-flow forecast follow. Approved versions stay as
 * history, so a second run revises the budget instead of setting it.
 */
test('a budget version by cost head and BOQ budget rates, once approved, gives a forecast and a cash flow', async ({ page }) => {
  const pm = await apiToken('pm@demo.com');
  const md = await apiToken('md@demo.com');
  const project = (await api<Page<{ id: string; code: string }>>(pm, '/projects?pageSize=100')).items.find((p) => p.code === 'WS-2026-03')!;
  const before = await api<Budget>(pm, `/cost/projects/${project.id}/budget`);
  const revising = before.versions.length > 0;

  try {
    await signIn(page, 'pm@demo.com');
    await page.goto(`/projects/${project.id}?tab=budget`);
    await page.getByRole('button', { name: revising ? 'Revise budget' : 'Set budget' }).click();
    const versionNo = Math.max(0, ...before.versions.map((v) => v.versionNo)) + 1;
    const form = formPanel(page, `Budget version ${versionNo}: WS-2026-03`);
    if (revising) {
      await form.getByLabel('Reason').click();
      await page.locator('.ant-select-item-option', { hasText: 'Rate change' }).click();
    }
    await form.getByLabel('Material issued', { exact: true }).fill('60000000');
    await form.getByLabel('Subcontractors', { exact: true }).fill('50000000');
    await form.getByLabel('Machinery', { exact: true }).fill('20000000');
    await form.getByLabel('Labour', { exact: true }).fill('25000000');
    await form.getByLabel('Site expenses', { exact: true }).fill('10000000');
    await form.getByRole('button', { name: 'Fill', exact: true }).click();
    await form.getByRole('button', { name: 'Save and send for approval' }).click();
    await expect(page.getByText(`Version ${versionNo} sent to management for approval`)).toBeVisible();

    // Sent, not approved: the figures stay on the version in force.
    const sent = await api<Budget>(pm, `/cost/projects/${project.id}/budget`);
    expect(sent.open?.status).toBe('SUBMITTED');
    expect(sent.budgetAtCompletion).toBe(before.budgetAtCompletion);
    // Nobody decides a version they prepared.
    await expect(api(pm, `/cost/budget-versions/${sent.open!.id}/decide`, { method: 'POST', body: { decision: 'APPROVE' } })).rejects.toThrow(/403/);
    await api(md, `/cost/budget-versions/${sent.open!.id}/decide`, { method: 'POST', body: { decision: 'APPROVE' } });

    await page.reload();
    await expect(page.getByText(new RegExp(`Version ${versionNo} in force`))).toBeVisible();
    await expect(page.getByText(/16,50,00,000/).first()).toBeVisible();
    const b = await api<Budget>(pm, `/cost/projects/${project.id}/budget`);
    expect(b.inForce?.versionNo).toBe(versionNo);
    expect(b.open).toBeNull();
    expect(b.hasHeadBudget).toBe(true);
    expect(Number(b.budgetAtCompletion)).toBe(165000000);
    expect(b.itemsWithoutBudgetRate).toBe(0);
    for (const i of b.boqItems.filter((x) => before.boqItems.find((r) => r.boqItemId === x.boqItemId)?.budgetRate === null)) {
      expect(Number(i.budgetRate)).toBeCloseTo(Number(i.rate) * 0.8, 1);
    }
    // Forecast = actual so far + the budget for the work left.
    // % complete comes back rounded to one decimal, so allow 0.1% of the budget.
    expect(Math.abs(Number(b.forecastAtCompletion) - (Number(b.actualCost) + 165000000 * (1 - b.pctComplete / 100)))).toBeLessThan(165000);

    const flow = await api<CashFlow>(pm, `/cost/cash-flow?projectId=${project.id}`);
    expect(flow.periods).toHaveLength(6);
    expect(flow.projectsWithoutBudget).toHaveLength(0);
    expect(flow.periods.some((p) => Number(p.remainingBudget) > 0)).toBe(true);
    await expect(page.locator('.cash-flow tbody tr.ant-table-row')).toHaveCount(6);
  } finally {
    // A version left open by a failed run would block the next one; an approved one is history and stays.
    const after = await api<Budget>(pm, `/cost/projects/${project.id}/budget`);
    if (after.open && after.open.status !== 'SUBMITTED') await api(pm, `/cost/budget-versions/${after.open.id}`, { method: 'DELETE' });
    else if (after.open) await api(md, `/cost/budget-versions/${after.open.id}/decide`, { method: 'POST', body: { decision: 'RETURN', note: 'Test run ended' } }).then(() => api(pm, `/cost/budget-versions/${after.open!.id}`, { method: 'DELETE' }));
  }
});

test('cash flow by month and week on the cost page, for approvers and accounts only', async ({ page }) => {
  const accounts = await apiToken('accounts@demo.com');
  const monthly = await api<CashFlow>(accounts, '/cost/cash-flow');
  let running = 0;
  for (const p of monthly.periods) {
    running += Number(p.net);
    expect(Number(p.cumulative)).toBeCloseTo(running, 0);
  }

  await signIn(page, 'accounts@demo.com');
  await page.goto('/cost');
  await page.getByRole('tab', { name: 'Cash flow' }).click();
  const panel = page.locator('.cash-flow');
  await expect(panel.locator('tbody tr.ant-table-row')).toHaveCount(6);
  await panel.getByText('Next 12 weeks').click();
  await expect(panel.locator('tbody tr.ant-table-row')).toHaveCount(12);

  const engineer = await apiToken('engineer@demo.com');
  await expect(api(engineer, '/cost/cash-flow')).rejects.toThrow(/403/);
});
