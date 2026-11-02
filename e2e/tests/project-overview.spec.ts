import { expect, test } from '@playwright/test';
import { api, apiToken, signIn } from './helpers';

type Project = { id: string; code: string; name: string; members: { userId: string; fullName: string }[] };

/**
 * A project's overview in five seconds: on track or behind in words first, agreeing with the header's chips, figures
 * against their plan, progress once, one completion date with its basis, and removing a team member behind a menu that
 * asks first.
 */
test('the overview leads with on track or behind, and figures against plan', async ({ page }) => {
  const token = await apiToken('pm@demo.com');
  const road = (await api<{ items: { id: string; code: string }[] }>(token, '/projects?pageSize=100')).items.find((p) => p.code === 'RD-2026-01')!;
  const dash = await api<{ physicalProgressPct: number; plannedProgressPct?: number | null }>(token, `/dashboard/projects/${road.id}`);
  expect(dash.plannedProgressPct).not.toBeNull();

  await signIn(page, 'pm@demo.com');
  await page.goto(`/projects/${road.id}?tab=overview`);
  const status = page.getByTestId('project-status');
  await expect(status).toContainText(/^(On track|No dated plan yet|Past its completion date|Plan ends \d+ days? after the completion date|Behind plan|\d+ activit(y|ies) late|Cost [\d.]+% of work done|Billed [\d.]+% of work done)/);
  // The first line reads every chip: it says on track only when none of them is amber or red.
  const chips = page.getByRole('list', { name: 'Project health' }).first();
  await expect(chips).toContainText('Schedule');
  const levels = await chips.locator('[data-level]').evaluateAll((els) => els.map((e) => e.getAttribute('data-level')));
  if (levels.some((l) => l === 'error' || l === 'warning')) await expect(status).not.toContainText(/^On track/);
  await expect(chips).not.toContainText('of the value of work done');

  // One completion date, said with its basis the same way in the first line and in Project details.
  const details = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Project details' }) });
  const completion = (await details.locator('.ant-descriptions-item').filter({ hasText: 'Completion date' }).locator('.ant-descriptions-item-content').innerText()).trim();
  expect(completion).toMatch(/^\d{2} \w{3,4} \d{4}( \(\d{2} \w{3,4} \d{4} \+ \d+ days? extension\))?$/);
  await expect(status).toContainText(`Completion date ${completion}`);

  // Progress shows once: in the figures against the plan, not again in the header's bar.
  const panel = page.getByRole('tabpanel', { name: 'Overview' }).last();
  await expect(panel.locator('.figure-cell').filter({ hasText: 'Physical progress' })).toContainText(/\d+(\.\d)?% planned by now/);
  await expect(page.getByRole('progressbar', { name: /^Physical progress/ })).toHaveCount(0);
  await expect(panel.locator('.figure-cell').filter({ hasText: 'Work done to date' })).toContainText(/of ₹\s[\d.]+\s(Cr|L) BOQ value/);
  // Billed reads against the work done, as the header's chip does.
  await expect(panel.locator('.figure-cell').filter({ hasText: 'Billed to date' })).toContainText(/of ₹\s[\d.]+\s(Cr|L) work done/);

  // The Schedule tab says the completion date the same way.
  await page.goto(`/projects/${road.id}?tab=schedule`);
  await expect(page.getByTestId('schedule-summary')).toContainText(`Completion date ${completion}`);
  // Elsewhere the header shows the bar, read as the rest of the page reads a percentage.
  await expect(page.getByRole('progressbar', { name: /^Physical progress \d+(\.\d)?%$/ })).toBeVisible();
  await page.goto(`/projects/${road.id}?tab=overview`);
  // The project's approvals are a line of what waits, not a figure tile of their own.
  await expect(page.getByRole('tabpanel', { name: 'Overview' }).last().getByText('Pending approvals', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('tabpanel', { name: 'Overview' }).last().getByText('Financial progress', { exact: true })).toHaveCount(0);
});

test('the team card keeps remove in a menu that names the person and the project', async ({ page }) => {
  const token = await apiToken('pm@demo.com');
  const listed = (await api<{ items: { id: string; code: string }[] }>(token, '/projects?pageSize=100')).items.find((p) => p.code === 'RD-2026-01')!;
  const road = await api<Project>(token, `/projects/${listed.id}`);
  const member = road.members[0];
  expect(member).toBeDefined();

  await signIn(page, 'pm@demo.com');
  await page.goto(`/projects/${road.id}?tab=overview`);
  const team = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Team', exact: true }) });
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
