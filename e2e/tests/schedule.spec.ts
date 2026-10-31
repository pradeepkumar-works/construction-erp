import { expect, test } from '@playwright/test';
import { API_URL, api, apiToken, PASSWORD, signIn } from './helpers';

type Milestone = { id: string; name: string; dueDate: string; achievedOn: string | null; state: string };
type Gantt = {
  baselineAt: string | null;
  activities: { id: string; name: string; baselineEnd: string | null; finishSlipDays: number | null }[];
  milestones: Milestone[];
  summary: { slipped: number; finishSlipDays: number | null };
};

const iso = (offset: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
const shown = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Gantt and baseline: milestones on the road project, achieved from the Gantt tab. */
test('the project manager adds a milestone and marks it achieved', async ({ page }) => {
  const pm = await apiToken('pm@demo.com');
  const road = (await api<{ items: { id: string; code: string }[] }>(pm, '/projects')).items.find((p) => p.code === 'RD-2026-01')!;
  const name = `E2E culvert CD-${Date.now() % 100000} complete`;

  await signIn(page, 'pm@demo.com');
  await page.goto(`/projects/${road.id}?tab=schedule`);
  await expect(page.locator('.baseline-info')).toContainText('Baseline frozen');
  await page.getByRole('button', { name: 'New milestone' }).click();
  const form = page.locator('.ant-modal').filter({ hasText: 'New milestone' });
  await form.getByLabel('Milestone').fill(name);
  await form.getByLabel('Due on').fill(shown(iso(-2)));
  await form.getByLabel('Due on').press('Enter');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Milestone added')).toBeVisible();

  const row = page.locator('.milestone-table tr').filter({ hasText: name });
  await expect(row).toContainText('Missed');
  await expect(page.locator('.gantt-milestone').filter({ hasText: name })).toBeVisible();
  await row.getByRole('button', { name: 'Achieved' }).click();
  const achieve = page.locator('.ant-modal').filter({ hasText: 'Mark milestone achieved' });
  await achieve.getByRole('button', { name: 'Mark achieved' }).click();
  await expect(page.getByText(`${name} marked achieved`)).toBeVisible();
  await expect(row).toContainText('Achieved late');

  const m = (await api<Milestone[]>(pm, `/projects/${road.id}/milestones`)).find((x) => x.name === name)!;
  expect(m.state).toBe('ACHIEVED_LATE');
  const engineer = await apiToken('engineer@demo.com');
  await expect(api(engineer, `/projects/${road.id}/milestones/${m.id}`, { method: 'DELETE' })).rejects.toThrow(/403/);
  await expect(api(await apiToken('qs@demo.com'), `/projects/${road.id}/baseline`, { method: 'POST', body: {} })).rejects.toThrow(/403/);
  await api(pm, `/projects/${road.id}/milestones/${m.id}`, { method: 'DELETE' });
});

test('a frozen baseline shows how far the plan has moved since', async ({ page }) => {
  // A company of its own, so freezing does not touch the demo projects' baselines.
  const stamp = Date.now();
  const email = `planner-${stamp}@e2e.test`;
  const res = await fetch(`${API_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ organizationName: `E2E Planners ${stamp}`, fullName: 'Pia Planner', email, password: PASSWORD }),
  });
  expect(res.ok).toBe(true);
  const owner = await apiToken(email);
  const project = await api<{ id: string }>(owner, '/projects', { method: 'POST', body: { code: 'GNT-01', name: 'E2E Gantt project', type: 'BUILDING', startDate: iso(-30), endDate: iso(200) } });
  const act = await api<{ id: string }>(owner, `/projects/${project.id}/activities`, { method: 'POST', body: { name: 'Raft foundation', unit: 'Cum', plannedQty: '400', plannedStart: iso(-20), plannedEnd: iso(40) } });
  await expect(api(owner, `/projects/${project.id}/baseline`, { method: 'POST', body: {} })).resolves.toBeTruthy();

  await signIn(page, email);
  await page.goto(`/projects/${project.id}?tab=schedule`);
  await page.locator('.baseline-info').getByRole('button', { name: 'Re-baseline' }).click();
  const modal = page.locator('.ant-modal').filter({ hasText: 'Replace the baseline' });
  await modal.getByPlaceholder('Revised programme approved by the client').fill('Programme agreed at kick-off');
  await modal.getByRole('button', { name: 'Replace baseline' }).click();
  await expect(page.getByText('Baseline frozen', { exact: true })).toBeVisible();
  await expect(page.locator('.baseline-info')).toContainText('Programme agreed at kick-off');

  // The plan moves ten days; the baseline stays where it was.
  await api(owner, `/projects/${project.id}/activities/${act.id}`, { method: 'PATCH', body: { plannedEnd: iso(50) } });
  const g = await api<Gantt>(owner, `/projects/${project.id}/gantt`);
  expect(g.activities[0].baselineEnd).toBe(iso(40));
  expect(g.activities[0].finishSlipDays).toBe(10);
  expect(g.summary.slipped).toBe(1);
  await page.reload();
  await expect(page.locator('.gantt-activity').filter({ hasText: 'Raft foundation' })).toContainText('+10 d');
  await expect(page.locator('.gantt-activity .gantt-baseline')).toHaveCount(1);
});
