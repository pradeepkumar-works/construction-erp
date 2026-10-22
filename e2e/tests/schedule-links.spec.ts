import { expect, test } from '@playwright/test';
import { API_URL, api, apiToken, chooseOption, PASSWORD, signIn } from './helpers';

type GanttActivity = { id: string; name: string; plannedStart: string; plannedEnd: string; critical: boolean; totalFloat: number | null; linkStartsOn: string | null };
type Gantt = { activities: GanttActivity[]; links: { id: string }[]; summary: { links: number; critical: number; linkConflicts: number } };
type Lookahead = { weeks: { activities: { name: string; readiness: string; waitingOn: string[] }[] }[] };
type ImportResult = { created: number; updated: number; links: number; activities: { name: string; action: string }[] };

const iso = (offset: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

const call = (token: string, method: string, path: string, body?: unknown) =>
  fetch(`${API_URL}${path}`, { method, headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });

/**
 * Schedule links (v6 item 114), in a company of its own so the demo plan is left alone: the planner ties pile caps to
 * piling on the Gantt, a loop is refused, Move them puts the activities on their link dates, the look-ahead shows pile
 * caps waiting on piling, and the plan goes out as XER and comes back with a new activity.
 */
test('links are added on the Gantt, loops refused, activities moved to their link dates and the plan imported back', async ({ page }) => {
  const stamp = Date.now();
  const email = `linker-${stamp}@e2e.test`;
  const res = await fetch(`${API_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ organizationName: `E2E Linkers ${stamp}`, fullName: 'Lata Linker', email, password: PASSWORD }),
  });
  expect(res.ok).toBe(true);
  const owner = await apiToken(email);
  const project = await api<{ id: string }>(owner, '/projects', { method: 'POST', body: { code: 'LNK-01', name: 'E2E links project', type: 'BUILDING', startDate: iso(-30), endDate: iso(200) } });
  const add = (name: string, from: number, to: number) =>
    api<{ id: string }>(owner, `/projects/${project.id}/activities`, { method: 'POST', body: { name, unit: 'job', plannedQty: '1', plannedStart: iso(from), plannedEnd: iso(to) } });
  const piling = await add('Piling', -5, 8);
  const caps = await add('Pile caps', 2, 11);
  const columns = await add('Columns', 6, 20);

  await signIn(page, email);
  await page.goto(`/projects/${project.id}?tab=schedule`);
  await page.getByRole('button', { name: 'Links of Pile caps' }).click();
  const drawer = page.locator('.ant-drawer-open').filter({ hasText: 'Waits on' });
  await drawer.getByRole('button', { name: 'Add predecessor' }).click();
  const form = page.locator('.ant-modal').filter({ hasText: 'What Pile caps waits on' });
  await chooseOption(form.getByLabel('Waits on'), 'Piling');
  await form.getByRole('button', { name: 'Add link' }).click();
  await expect(page.getByText('Link added')).toBeVisible();
  await expect(drawer).toContainText('Piling');
  await expect(drawer).toContainText('FS');
  await drawer.getByRole('button', { name: 'Close' }).click();

  // Columns after pile caps through the API; columns back to piling would be a loop.
  await api(owner, `/projects/${project.id}/links`, { method: 'POST', body: { predecessorId: caps.id, successorId: columns.id, type: 'FS', lagDays: 0 } });
  const loop = await call(owner, 'POST', `/projects/${project.id}/links`, { predecessorId: columns.id, successorId: piling.id, type: 'SS', lagDays: 0 });
  expect(loop.status).toBe(400);
  expect((await loop.json()).message).toMatch(/loop: .*Piling/);

  let g = await api<Gantt>(owner, `/projects/${project.id}/gantt`);
  expect(g.summary.links).toBe(2);
  expect(g.summary.linkConflicts).toBe(2);
  expect(g.activities.find((a) => a.id === caps.id)!.linkStartsOn).toBe(iso(9));

  // The look-ahead shows pile caps waiting on piling.
  await page.goto(`/projects/${project.id}?tab=lookahead`);
  const row = page.locator(`.lookahead-table tr[data-row-key="${caps.id}"]`);
  await expect(row).toContainText('Waiting');
  await expect(row).toContainText('On Piling');
  const la = await api<Lookahead>(owner, `/projects/${project.id}/lookahead`);
  expect(la.weeks.flatMap((w) => w.activities).find((a) => a.name === 'Pile caps')).toMatchObject({ readiness: 'WAITING', waitingOn: ['Piling'] });

  // Move them puts both on their link dates, their lengths kept.
  await page.goto(`/projects/${project.id}?tab=schedule`);
  await expect(page.locator('.link-conflicts')).toContainText('2 activities are planned to start before their links allow');
  await page.locator('.link-conflicts').getByRole('button', { name: 'Move them' }).click();
  await page.locator('.ant-modal').getByRole('button', { name: 'Move 2 activities' }).click();
  await expect(page.getByText('2 activities moved')).toBeVisible();
  await expect(page.locator('.link-conflicts')).toHaveCount(0);
  g = await api<Gantt>(owner, `/projects/${project.id}/gantt`);
  const byName = (n: string) => g.activities.find((a) => a.name === n)!;
  expect([byName('Pile caps').plannedStart, byName('Pile caps').plannedEnd]).toEqual([iso(9), iso(18)]);
  expect([byName('Columns').plannedStart, byName('Columns').plannedEnd]).toEqual([iso(19), iso(33)]);
  expect(g.activities.every((a) => a.critical)).toBe(true);

  // Out as P6 XER; back in with one activity renamed, which comes in as a new one.
  const file = await api<{ fileName: string; content: string }>(owner, `/projects/${project.id}/schedule/export?format=XER`);
  expect(file.fileName).toBe('LNK-01-schedule.xer');
  expect(file.content).toContain('PR_FS');
  const changed = file.content.replace('\tColumns\t', '\tColumns and beams\t');
  await page.getByRole('button', { name: 'Import' }).click();
  const imp = page.locator('.ant-modal').filter({ hasText: 'Import a schedule' });
  await imp.getByText('Primavera P6 XER').click();
  await imp.locator('input[type=file]').setInputFiles({ name: 'plan.xer', mimeType: 'text/plain', buffer: Buffer.from(changed) });
  await expect(imp).toContainText('3 activities read: 1 to add, 0 with new dates, 2 unchanged; 2 links.');
  await imp.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByText('Schedule imported: 1 added, 0 with new dates, 2 links')).toBeVisible();
  g = await api<Gantt>(owner, `/projects/${project.id}/gantt`);
  expect(g.activities.map((a) => a.name).sort()).toEqual(['Columns', 'Columns and beams', 'Pile caps', 'Piling']);
  expect(g.summary.links).toBe(3);

  // A dry run of the MS Project XML of the same plan changes nothing.
  const xml = await api<{ content: string }>(owner, `/projects/${project.id}/schedule/export?format=MSP_XML`);
  const dry = await api<ImportResult>(owner, `/projects/${project.id}/schedule/import`, { method: 'POST', body: { format: 'MSP_XML', content: xml.content, dryRun: true } });
  expect([dry.created, dry.updated]).toEqual([0, 0]);
  expect((await call(owner, 'POST', `/projects/${project.id}/schedule/import`, { format: 'XER', content: '<Project/>' })).status).toBe(400);
});

test('only project editors change links; anyone on the project reads the look-ahead and exports', async () => {
  const pm = await apiToken('pm@demo.com');
  const road = (await api<{ items: { id: string; code: string }[] }>(pm, '/projects')).items.find((p) => p.code === 'RD-2026-01')!;
  const g = await api<Gantt>(pm, `/projects/${road.id}/gantt`);
  expect(g.summary.links).toBeGreaterThan(0);
  const accounts = await apiToken('accounts@demo.com');
  expect((await call(accounts, 'POST', `/projects/${road.id}/schedule/apply-links`)).status).toBe(403);
  expect((await call(accounts, 'DELETE', `/projects/${road.id}/links/${g.links[0].id}`)).status).toBe(403);
  const engineer = await apiToken('engineer@demo.com');
  expect((await call(engineer, 'GET', `/projects/${road.id}/lookahead`)).status).toBe(200);
  expect((await call(engineer, 'GET', `/projects/${road.id}/schedule/export?format=MSP_XML`)).status).toBe(200);
});
