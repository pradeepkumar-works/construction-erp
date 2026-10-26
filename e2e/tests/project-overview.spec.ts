import { expect, test } from '@playwright/test';
import { api, apiToken, signIn } from './helpers';

type Project = { id: string; code: string; name: string; members: { userId: string; fullName: string }[] };

/**
 * A project's overview in five seconds (UX item 85): on track or behind in words first, figures against their plan,
 * no duplicated counts, and removing a team member behind a menu that asks first.
 */
test('the overview leads with on track or behind, and figures against plan', async ({ page }) => {
  const token = await apiToken('pm@demo.com');
  const road = (await api<{ items: { id: string; code: string }[] }>(token, '/projects?pageSize=100')).items.find((p) => p.code === 'RD-2026-01')!;
  const dash = await api<{ physicalProgressPct: number; plannedProgressPct?: number | null }>(token, `/dashboard/projects/${road.id}`);
  expect(dash.plannedProgressPct).not.toBeNull();

  await signIn(page, 'pm@demo.com');
  await page.goto(`/projects/${road.id}?tab=overview`);
  const status = page.getByTestId('project-status');
  await expect(status).toContainText(/^(On track|Behind plan|Past its completion date|Plan ends \d+ days? after the completion date|No dated plan yet|On track overall, \d+ activit(y|ies) late)/);
  await expect(status).toContainText(/\d+(\.\d)?% done, \d+(\.\d)?% planned by today\./);
  const panel = page.getByRole('tabpanel', { name: 'Overview' }).last();
  await expect(panel.getByText('Progress', { exact: true }).first()).toBeVisible();
  await expect(panel.getByText(/^\d+(\.\d)?% planned by today$/)).toBeVisible();
  await expect(panel.getByText(/^of ₹\s[\d.]+\s(Cr|L) BOQ, /)).toBeVisible();
  // The project's approvals are a line of what waits, not a figure tile of their own.
  await expect(panel.getByText('Pending approvals', { exact: true })).toHaveCount(0);
  await expect(panel.getByText('Financial progress', { exact: true })).toHaveCount(0);
});

test('the team card keeps remove in a menu that names the person and the project', async ({ page }) => {
  const token = await apiToken('pm@demo.com');
  const listed = (await api<{ items: { id: string; code: string }[] }>(token, '/projects?pageSize=100')).items.find((p) => p.code === 'RD-2026-01')!;
  const road = await api<Project>(token, `/projects/${listed.id}`);
  const member = road.members[0];
  expect(member).toBeDefined();

  await signIn(page, 'pm@demo.com');
  await page.goto(`/projects/${road.id}?tab=overview`);
  const team = page.locator('section').filter({ has: page.getByRole('heading', { name: /^Team \(\d+\)$/ }) });
  await expect(team).toBeVisible();
  // No delete button on show: no red button, nothing named Remove until the menu is open.
  await expect(team.getByRole('button', { name: /remove/i })).toHaveCount(0);
  await expect(team.locator('.ant-btn-dangerous')).toHaveCount(0);

  // Reachable from the keyboard: focus the row's More button and open it with Enter.
  const more = team.getByRole('button', { name: `More actions for ${member.fullName}` });
  await more.focus();
  await page.keyboard.press('Enter');
  const remove = page.getByRole('menuitem', { name: 'Remove from project' });
  await expect(remove).toBeVisible();
  await remove.click();
  const dialog = page.getByRole('dialog').filter({ hasText: `Remove ${member.fullName} from ${road.name}?` });
  await expect(dialog).toBeVisible();
  // Keep them: the demo team stays as it is for other tests.
  await dialog.getByRole('button', { name: 'Keep' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(team.getByText(member.fullName, { exact: true })).toBeVisible();
});
