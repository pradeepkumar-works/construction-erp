import { expect, test } from '@playwright/test';
import { api, apiToken, signIn } from './helpers';

type Project = { id: string; name: string; projectManagerId: string | null; members: { userId: string }[] };

/**
 * A project manager sees only the projects they manage or are on, so one who saves a new project under someone else
 * (or no one) joins its team; before, the page the save led to said "Not found".
 */
test('a project manager can open a project they made for another manager', async ({ page }) => {
  const stamp = Date.now();
  const pm = await apiToken('pm@demo.com');
  const users = (await api<{ items: { id: string; email: string }[] }>(pm, '/users?pageSize=100')).items;
  const me = users.find((u) => u.email === 'pm@demo.com')!;
  const other = users.find((u) => u.email === 'pm2@demo.com')!;

  const handed = await api<Project>(pm, '/projects', {
    method: 'POST',
    body: { code: `CRT-${stamp}`, name: `E2E handed over ${stamp}`, type: 'BUILDING', projectManagerId: other.id, siteLat: 17.744504, siteLng: 83.323514, siteRadiusM: 600 },
  });
  expect(handed.projectManagerId).toBe(other.id);
  expect(handed.members.map((m) => m.userId)).toContain(me.id);
  expect((await api<Project>(pm, `/projects/${handed.id}`)).id).toBe(handed.id);

  const unmanaged = await api<Project>(pm, '/projects', { method: 'POST', body: { code: `CRN-${stamp}`, name: `E2E no manager ${stamp}`, type: 'ROAD' } });
  expect((await api<Project>(pm, `/projects/${unmanaged.id}`)).id).toBe(unmanaged.id);

  // Their own project needs no extra seat on the team.
  const own = await api<Project>(pm, '/projects', { method: 'POST', body: { code: `CRO-${stamp}`, name: `E2E own ${stamp}`, type: 'ROAD', projectManagerId: me.id } });
  expect(own.members.map((m) => m.userId)).not.toContain(me.id);

  await signIn(page, 'pm@demo.com');
  await page.goto(`/projects/${handed.id}`);
  await expect(page.getByRole('heading', { level: 1, name: new RegExp(handed.name) })).toBeVisible();
  await expect(page.getByText('Not found')).toHaveCount(0);
});
