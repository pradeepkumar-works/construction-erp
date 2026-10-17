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
};
type CashFlow = { periods: { net: string; cumulative: string; remainingBudget: string }[]; projectsWithoutBudget: { projectCode: string }[] };

/**
 * Budget and forecast (v4 item 38): the project manager budgets the water supply project (seeded without a budget) by
 * cost head and fills the BOQ budget rates at 80% of the client's rate. The forecast at completion and the cash-flow
 * forecast follow. The budget is taken off again at the end so the test can run twice.
 */
test('a budget by cost head and BOQ budget rates give a forecast and a cash flow', async ({ page }) => {
  const pm = await apiToken('pm@demo.com');
  const project = (await api<Page<{ id: string; code: string }>>(pm, '/projects?pageSize=100')).items.find((p) => p.code === 'WS-2026-03')!;
  const restore = await api<Budget>(pm, `/cost/projects/${project.id}/budget`);

  try {
    await signIn(page, 'pm@demo.com');
    await page.goto(`/projects/${project.id}?tab=budget`);
    await page.getByRole('button', { name: /(Set|Edit) budget$/ }).click();
    const modal = formPanel(page, 'Budget: WS-2026-03');
    await modal.getByLabel('Material issued', { exact: true }).fill('60000000');
    await modal.getByLabel('Subcontractors', { exact: true }).fill('50000000');
    await modal.getByLabel('Machinery', { exact: true }).fill('20000000');
    await modal.getByLabel('Labour', { exact: true }).fill('25000000');
    await modal.getByLabel('Site expenses', { exact: true }).fill('10000000');
    await modal.getByRole('button', { name: 'Fill', exact: true }).click();
    await modal.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Budget saved')).toBeVisible();

    await expect(page.getByText(/16,50,00,000/).first()).toBeVisible();
    const b = await api<Budget>(pm, `/cost/projects/${project.id}/budget`);
    expect(b.hasHeadBudget).toBe(true);
    expect(Number(b.budgetAtCompletion)).toBe(165000000);
    expect(b.itemsWithoutBudgetRate).toBe(0);
    for (const i of b.boqItems.filter((x) => restore.boqItems.find((r) => r.boqItemId === x.boqItemId)?.budgetRate === null)) {
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
    await api(pm, `/cost/projects/${project.id}/budget`, {
      method: 'PUT',
      body: {
        heads: restore.hasHeadBudget ? undefined : null,
        items: restore.boqItems.map((i) => ({ boqItemId: i.boqItemId, budgetRate: i.budgetRate })),
      },
    });
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
