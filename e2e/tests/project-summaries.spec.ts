import { expect, test } from '@playwright/test';
import { api, apiToken, openProjectTab, projectTabs, signIn } from './helpers';
import type { ProjectAreaDto } from '../../packages/shared/src/project-areas';

/** The project page's Plan, Site, Materials and Money groups open on a summary: figures, what waits, warnings, the group's tabs. */

async function rdProject(email: string): Promise<{ token: string; id: string }> {
  const token = await apiToken(email);
  const { items } = await api<{ items: { id: string; code: string }[] }>(token, '/projects?pageSize=100');
  const id = items.find((p) => p.code === 'RD-2026-01')?.id;
  expect(id, 'RD-2026-01 is in the demo seed').toBeTruthy();
  return { token, id: id! };
}

test('each area group opens on its summary, which answers first and links into the group', async ({ page }) => {
  await signIn(page, 'pm@demo.com');
  await page.goto('/projects');
  await page.getByText('RD-2026-01').first().click();

  for (const group of ['Plan', 'Site', 'Materials', 'Money']) {
    await openProjectTab(page, group);
    await expect(page).toHaveURL(new RegExp(`\\?tab=${group.toLowerCase()}-summary$`));
    await expect(projectTabs(page, group).getByRole('radio').first()).toHaveAccessibleName('Summary');
    const panel = page.getByRole('tabpanel', { name: `${group} summary` });
    await expect(panel.getByRole('region', { name: `${group} figures` })).toBeVisible();
    await expect(panel.getByRole('navigation', { name: `${group} pages` })).toBeVisible();
  }

  // Money says what is billed against the contract and what the client owes, then opens a tab of its group.
  const money = page.getByRole('tabpanel', { name: 'Money summary' });
  const figures = money.getByRole('region', { name: 'Money figures' });
  await expect(figures).toContainText('Billed to date');
  await expect(figures).toContainText('contract value');
  await expect(figures).toContainText('Clients owe');
  await money.getByRole('navigation', { name: 'Money pages' }).getByRole('link', { name: /^RA bills/ }).click();
  await expect(page).toHaveURL(/\?tab=bills$/);
  await expect(projectTabs(page, 'Money').getByRole('radio', { name: 'RA bills' })).toBeChecked();

  // The plan's finish stands against the completion date; Overview has no summary.
  await openProjectTab(page, 'Plan');
  await expect(page.getByRole('tabpanel', { name: 'Plan summary' })).toContainText(/plan (finishes on|has no finish date)/);
  await page.getByTestId('project-workspace-bar').getByRole('tab', { name: 'Overview', exact: true }).click();
  await expect(page.getByRole('radiogroup', { name: 'Overview tabs' })).toHaveCount(0);
});

test('a summary shows only what the role may see', async ({ page }) => {
  const pm = await rdProject('pm@demo.com');
  const money = await api<ProjectAreaDto>(pm.token, `/dashboard/projects/${pm.id}/areas/money`);
  expect(money.figures.map((f) => f.id)).toEqual(expect.arrayContaining(['billed', 'clientsOwe', 'marginToDate']));
  const plan = await api<ProjectAreaDto>(pm.token, `/dashboard/projects/${pm.id}/areas/plan`);
  expect(plan.waiting, 'nothing in the plan goes for approval').toBeNull();
  expect(plan.figures.map((f) => f.id)).toEqual(['physicalProgress', 'planPastCompletion', 'delayedActivities', 'boqValue']);

  const engineer = await rdProject('engineer@demo.com');
  const theirs = await api<ProjectAreaDto>(engineer.token, `/dashboard/projects/${engineer.id}/areas/money`);
  expect(theirs.figures.map((f) => f.id), 'a site engineer sees no bills or margin').toEqual(['approvalsWaiting']);
  expect(theirs.waiting?.every((w) => w.type !== 'BILL')).toBe(true);
  await expect(api(engineer.token, `/dashboard/projects/${engineer.id}/areas/handover`)).rejects.toThrow(/400/);

  await signIn(page, 'engineer@demo.com');
  await page.goto(`/projects/${engineer.id}?tab=money-summary`);
  const panel = page.getByRole('tabpanel', { name: 'Money summary' });
  await expect(panel.getByRole('navigation', { name: 'Money pages' }).getByRole('link', { name: /^Site expenses/ })).toBeVisible();
  await expect(panel.getByRole('navigation', { name: 'Money pages' }).getByRole('link', { name: /^RA bills/ })).toHaveCount(0);
  await expect(panel.getByRole('region', { name: 'Money figures' })).not.toContainText('Billed');
});
