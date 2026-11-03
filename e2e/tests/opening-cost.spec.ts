import { expect, test } from '@playwright/test';
import { API_URL, api, apiToken, formPanel, signIn } from './helpers';

interface Page<T> {
  items: T[];
}
type Heads = { expenses: string; material: string; machinery: string; labour: string; subcontract: string };
type Opening = {
  missing: boolean;
  ranBefore: boolean;
  enteredOn: string;
  opening: { asOf: string; heads: Heads; total: string; workDone: string | null; notes: string | null } | null;
};
type Cost = { cost: { total: string }; opening: { asOf: string; cost: { total: string } } | null };
type Portfolio = { totals: { openingMissing: number }; projects: { code: string; money: { openingMissing: boolean; cost: string }; reasons: { key: string; text: string }[] }[] };
type CashFlow = { projectsWithoutBudget: { projectCode: string; why: string }[]; projectsAtCostRatio: { projectCode: string }[] };

/**
 * Opening cost: the Devgarh water supply project (WS-2026-04) ran for months before it came on Nirmaan. With its opening
 * cost taken off, the Budget tab and the Overview say so, the management dashboard watches it and the cash flow leaves
 * its billing out; the project manager records it again from the Budget tab and cost to date counts it from its day.
 * The seeded opening cost is put back at the end so the test can run twice.
 */
test('a project that ran before Nirmaan is flagged until its opening cost is recorded, and cost counts it', async ({ page }) => {
  const pm = await apiToken('pm@demo.com');
  const md = await apiToken('md@demo.com');
  const project = (await api<Page<{ id: string; code: string }>>(pm, '/projects?pageSize=100')).items.find((p) => p.code === 'WS-2026-04')!;
  const seeded = await api<Opening>(pm, `/cost/projects/${project.id}/opening`);
  expect(seeded.ranBefore).toBe(true);
  expect(seeded.opening).not.toBeNull();

  try {
    const before = await api<Cost>(pm, `/cost/projects/${project.id}`);
    const removed = await api<Opening>(pm, `/cost/projects/${project.id}/opening`, { method: 'DELETE' });
    expect(removed.missing).toBe(true);
    const without = await api<Cost>(pm, `/cost/projects/${project.id}`);
    expect(without.opening).toBeNull();
    expect(Number(before.cost.total) - Number(without.cost.total)).toBeCloseTo(Number(seeded.opening!.total), 0);

    // The dashboard watches it, and the cash flow leaves out its billing still to come.
    const portfolio = await api<Portfolio>(md, '/management/portfolio');
    const row = portfolio.projects.find((p) => p.code === 'WS-2026-04')!;
    expect(row.money.openingMissing).toBe(true);
    expect(portfolio.totals.openingMissing).toBeGreaterThan(0);
    expect(row.reasons.some((r) => r.key === 'cost' && /No opening cost/.test(r.text))).toBe(true);
    const flow = await api<CashFlow>(pm, `/cost/cash-flow?projectId=${project.id}`);
    expect(flow.projectsWithoutBudget).toEqual([{ projectId: project.id, projectCode: 'WS-2026-04', why: 'openingMissing' }]);

    await signIn(page, 'pm@demo.com');
    await page.goto(`/projects/${project.id}?tab=overview`);
    await expect(page.getByText('The project ran before it came on Nirmaan and has no opening cost')).toBeVisible();

    await page.goto(`/projects/${project.id}?tab=budget`);
    await expect(page.getByText('This project ran before it came on Nirmaan and has no opening cost')).toBeVisible();
    await page.getByRole('button', { name: 'Record opening cost' }).click();
    const form = formPanel(page, 'Opening cost: WS-2026-04');
    await form.getByLabel('Material issued', { exact: true }).fill('60000000');
    await form.getByLabel('Subcontractors', { exact: true }).fill('30000000');
    await form.getByLabel('Labour', { exact: true }).fill('15000000');
    await form.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Opening cost saved')).toBeVisible();
    await expect(page.getByText('Recorded by', { exact: false })).toBeVisible();

    const recorded = await api<Opening>(pm, `/cost/projects/${project.id}/opening`);
    expect(recorded.missing).toBe(false);
    expect(Number(recorded.opening!.total)).toBe(105_000_000);
    expect(recorded.opening!.asOf).toBe(recorded.enteredOn);
    const after = await api<Cost>(pm, `/cost/projects/${project.id}`);
    expect(Number(after.cost.total) - Number(without.cost.total)).toBeCloseTo(105_000_000, 0);
    expect(after.opening?.asOf).toBe(recorded.enteredOn);

    // A date before the project started is refused, with how to fix it.
    const res = await fetch(`${API_URL}/cost/projects/${project.id}/opening`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${pm}`, 'content-type': 'application/json' },
      body: JSON.stringify({ asOf: '2020-01-01', heads: { expenses: '0', material: '1', machinery: '0', labour: '0', subcontract: '0' } }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { message: string }).message).toBe('The figures cannot stand at a date before the project started');
  } finally {
    const o = seeded.opening!;
    await api(pm, `/cost/projects/${project.id}/opening`, { method: 'PUT', body: { asOf: o.asOf, heads: o.heads, workDone: o.workDone, notes: o.notes } });
  }
});
