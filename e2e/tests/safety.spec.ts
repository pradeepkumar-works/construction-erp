import { expect, test } from '@playwright/test';
import { api, apiToken, chooseOption, signIn } from './helpers';

interface Page<T> {
  items: T[];
  total: number;
}
type Project = { id: string; code: string };
type Incident = { id: string; incidentNo: string; status: string; type: string; rootCause: string | null; injuredCount: number };
type Permit = { id: string; permitNo: string; status: string; precautions: string[]; expired: boolean };
type Note = { type: string; title: string; entityType: string | null; entityId: string | null };
type Summary = { toolboxTalksThisMonth: number; attendeesThisMonth: number; permitsRequested: number; openIncidents: number };

const building = async (token: string) => (await api<Page<Project>>(token, '/projects?pageSize=100')).items.find((p) => p.code === 'BL-2026-02')!;

/**
 * Safety: the site engineer reports an incident from the project's Safety tab; the safety officer hears of
 * it and closes it with the root cause and the corrective action. Older phone builds do not get the new notification type.
 */
test('an incident is reported at site and closed by the safety officer', async ({ page }) => {
  const engineer = await apiToken('engineer2@demo.com');
  const officer = await apiToken('safety@demo.com');
  const project = await building(engineer);
  const where = `E2E stair ${Date.now()}`;

  await signIn(page, 'engineer2@demo.com');
  await page.goto(`/projects/${project.id}?tab=safety`);
  await page.getByRole('button', { name: /Report incident/ }).click();
  const form = page.locator('.ant-drawer-open').filter({ hasText: 'Report incident' });
  await chooseOption(form.getByLabel('Type'), 'First aid');
  await form.getByLabel('Where').fill(where);
  await form.getByLabel('What happened').fill('Mason twisted an ankle on loose stair shuttering.');
  await form.getByLabel('Names').fill('Ravi (mason)');
  await form.getByRole('button', { name: 'Report' }).click();
  await expect(page.getByText(/INC-\d{4}-\d{4} reported/)).toBeVisible();
  await expect(page.locator('.incident-list').getByText(where)).toBeVisible();

  const mine = (await api<Page<Incident>>(officer, `/safety/incidents?projectId=${project.id}&q=${encodeURIComponent(where)}`)).items[0];
  expect(mine.injuredCount).toBe(1);
  const notes = await api<{ items: Note[] }>(officer, '/notifications?allTypes=true&limit=20');
  expect(notes.items.some((n) => n.type === 'SAFETY' && n.entityId === mine.id && n.entityType === 'SAFETY_INCIDENT')).toBe(true);
  const legacy = await api<{ items: Note[] }>(officer, '/notifications?limit=50');
  expect(legacy.items.every((n) => n.type !== 'SAFETY')).toBe(true);

  // Site staff cannot close it; the safety officer can, with the root cause and the action.
  await expect(api(engineer, `/safety/incidents/${mine.id}/close`, { method: 'POST', body: { rootCause: 'x', correctiveAction: 'y' } })).rejects.toThrow(/403/);
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
  await signIn(page, 'safety@demo.com');
  await page.goto(`/safety?tab=incidents&id=${mine.id}`);
  const drawer = page.locator('.incident-drawer');
  await expect(drawer.getByText(where)).toBeVisible();
  await drawer.getByRole('button', { name: 'Close incident' }).click();
  const close = page.locator('.ant-modal').filter({ hasText: `Close ${mine.incidentNo}` });
  await close.getByLabel('Root cause').fill('Shuttering of the stair landing not nailed down.');
  await close.getByLabel('Corrective action').fill('Stair shuttering checked by the carpenter foreman before use.');
  await close.getByRole('button', { name: 'Close incident' }).click();
  await expect(page.getByText(`${mine.incidentNo} closed`)).toBeVisible();
  const closed = await api<Incident>(officer, `/safety/incidents/${mine.id}`);
  expect(closed.status).toBe('CLOSED');

  await api(officer, `/safety/incidents/${mine.id}`, { method: 'DELETE' });
});

test('a permit to work is asked for, issued by the safety officer and closed', async ({ page }) => {
  const engineer = await apiToken('engineer2@demo.com');
  const officer = await apiToken('safety@demo.com');
  const project = await building(engineer);
  const where = `E2E lift shaft ${Date.now()}`;

  await signIn(page, 'engineer2@demo.com');
  await page.goto(`/projects/${project.id}?tab=safety`);
  await page.getByRole('tab', { name: /Permits to work/ }).click();
  await page.getByRole('button', { name: /Request permit/ }).click();
  const form = page.locator('.ant-drawer-open').filter({ hasText: 'Request permit to work' });
  await chooseOption(form.getByLabel('Work', { exact: true }), 'Hot work');
  await form.getByLabel('Where').fill(where);
  await form.getByLabel('The work').fill('Cutting the shaft door frames');
  await form.getByLabel('Fire extinguisher at the spot').check();
  await form.getByRole('button', { name: 'Request permit' }).click();
  await expect(page.getByText(/PTW-\d{4}-\d{4} requested/)).toBeVisible();

  const permit = (await api<Page<Permit>>(officer, `/safety/permits?projectId=${project.id}&q=${encodeURIComponent(where)}`)).items[0];
  expect(permit.status).toBe('REQUESTED');
  expect(permit.precautions).toContain('Fire extinguisher at the spot');
  await expect(api(engineer, `/safety/permits/${permit.id}/issue`, { method: 'POST', body: {} })).rejects.toThrow(/403/);

  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
  await signIn(page, 'safety@demo.com');
  await page.goto(`/safety?tab=permits&id=${permit.id}`);
  const drawer = page.locator('.permit-drawer');
  await drawer.getByRole('button', { name: 'Issue' }).click();
  const issue = page.locator('.ant-modal').filter({ hasText: `Issue ${permit.permitNo}` });
  await issue.getByLabel('Area cleared of flammable material').check();
  await issue.getByLabel('Conditions').fill('Fire watch till 30 minutes after.');
  await issue.getByRole('button', { name: 'Issue permit' }).click();
  await expect(page.getByText(`${permit.permitNo} issued`)).toBeVisible();

  const issued = await api<Permit>(engineer, `/safety/permits/${permit.id}`);
  expect(issued.status).toBe('ISSUED');
  expect(issued.precautions).toEqual(expect.arrayContaining(['Fire extinguisher at the spot', 'Area cleared of flammable material']));
  const notes = await api<{ items: Note[] }>(engineer, '/notifications?allTypes=true&limit=20');
  expect(notes.items.some((n) => n.title === `Permit ${permit.permitNo} issued`)).toBe(true);
  const done = await api<Permit>(engineer, `/safety/permits/${permit.id}/close`, { method: 'POST', body: { note: 'Frames cut, area checked' } });
  expect(done.status).toBe('CLOSED');

  await api(officer, `/safety/permits/${permit.id}`, { method: 'DELETE' });
});

test('a toolbox talk counts on the safety summary', async ({ page }) => {
  const engineer = await apiToken('engineer2@demo.com');
  const project = await building(engineer);
  const before = await api<Summary>(engineer, `/safety/summary?projectId=${project.id}`);

  await signIn(page, 'engineer2@demo.com');
  await page.goto(`/projects/${project.id}?tab=safety`);
  await page.getByRole('tab', { name: 'Toolbox talks' }).click();
  await page.getByRole('button', { name: /Record talk/ }).click();
  const form = page.locator('.ant-modal').filter({ hasText: 'Record toolbox talk' });
  await form.getByLabel('Topic').fill('E2E: scaffold safety');
  await form.getByLabel('Attended').fill('27');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/TBT-\d{4}-\d{4} saved/)).toBeVisible();
  await expect(page.locator('.safety-summary').getByText(`${before.attendeesThisMonth + 27} attended`)).toBeVisible();

  const after = await api<Summary>(engineer, `/safety/summary?projectId=${project.id}`);
  expect(after.toolboxTalksThisMonth).toBe(before.toolboxTalksThisMonth + 1);

  const accounts = await apiToken('accounts@demo.com');
  await expect(api(accounts, '/safety/talks', { method: 'POST', body: { projectId: project.id, date: '2026-01-01', topic: 'x', conductedBy: 'y', attendeeCount: 1 } })).rejects.toThrow(/403/);

  const talk = (await api<Page<{ id: string; topic: string }>>(engineer, `/safety/talks?projectId=${project.id}&q=${encodeURIComponent('E2E: scaffold')}`)).items[0];
  await api(engineer, `/safety/talks/${talk.id}`, { method: 'DELETE' });
});
