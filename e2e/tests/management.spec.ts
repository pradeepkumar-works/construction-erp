import { expect, test } from '@playwright/test';
import { api, apiToken, signIn } from './helpers';

/**
 * Management dashboard and reports. The MD sees every contract project with its health and money, opens one
 * to see why, and opens the Monthly MIS with Print and Excel; the totals add up to the projects; an engineer, who does
 * not see project cost, is refused.
 */

test.use({ contextOptions: { reducedMotion: 'reduce' } });

type Money = { workDone: string; billed: string; unbilled: string; outstanding: string };
type Portfolio = {
  totals: { projects: number; billed: string; workDone: string; unbilled: string; outstanding: string };
  projects: { projectId: string; code: string; type: string; health: string; reasons: { text: string }[]; money: Money }[];
  attention: { projectCode: string; text: string }[];
};
type Report = { title: string; sections: { key: string; rows: Record<string, unknown>[] }[] };

const sum = (p: Portfolio, k: keyof Money) => p.projects.reduce((s, x) => s + Number(x.money[k]), 0);

test('the MD sees every contract project, opens one and the Monthly MIS', async ({ page }) => {
  const md = await apiToken('md@demo.com');
  const p = await api<Portfolio>(md, '/management/portfolio');
  // Stores and plants have no contract; the totals are the projects' own.
  expect(p.projects.every((x) => x.type !== 'STORE' && x.type !== 'PLANT')).toBe(true);
  expect(p.totals.projects).toBe(p.projects.length);
  for (const k of ['billed', 'workDone', 'unbilled', 'outstanding'] as const) expect(Math.abs(sum(p, k) - Number(p.totals[k]))).toBeLessThan(1);
  // Every reason is on the attention list, and a project with none is on course.
  expect(p.attention.length).toBe(p.projects.reduce((s, x) => s + x.reasons.length, 0));
  for (const x of p.projects) expect(x.health === 'good').toBe(x.reasons.length === 0);

  await signIn(page, 'md@demo.com');
  await page.goto('/management');
  await expect(page.getByRole('heading', { name: 'Management dashboard', level: 1 })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Portfolio figures' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Money from contract to paid' })).toBeVisible();
  const first = p.projects[0];
  await page.getByRole('link', { name: first.code, exact: true }).first().click();
  await expect(page).toHaveURL(new RegExp(`/management/projects/${first.projectId}`));
  await expect(page.getByText('Cost by head against budget')).toBeVisible();
  await expect(page.getByRole('tab', { name: /Waiting for approval/ })).toBeVisible();

  await page.goto('/management/reports/mis');
  await expect(page.getByRole('heading', { name: 'Monthly MIS', level: 1 })).toBeVisible();
  await expect(page.getByText('Where each project stands today')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print' })).toBeEnabled();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Excel' }).click();
  expect((await download).suggestedFilename()).toMatch(/^monthly-mis-\d{4}-\d{2}-\d{2}\.xlsx$/);
});

test('every report answers, and only those who see project cost get them', async () => {
  const accounts = await apiToken('accounts@demo.com');
  for (const key of ['mis', 'profit-loss', 'wip', 'receivables', 'payables', 'procurement', 'labour', 'stock', 'approvals']) {
    const r = await api<Report>(accounts, `/management/reports/${key}`);
    expect(r.title.length).toBeGreaterThan(0);
    expect(r.sections.length).toBeGreaterThan(0);
  }
  await expect(api(accounts, '/management/reports/nothing')).rejects.toThrow(/400/);
  const engineer = await apiToken('engineer@demo.com');
  await expect(api(engineer, '/management/portfolio')).rejects.toThrow(/403/);
  await expect(api(engineer, '/management/reports/mis')).rejects.toThrow(/403/);
});
