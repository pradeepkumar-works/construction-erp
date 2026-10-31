import { expect, test } from '@playwright/test';
import { openProjectTab, projectTabs, signIn } from './helpers';

/** The project page (UI roadmap item 56): six groups, health in the header, a bar that stays, the last tab kept. */

test('a project opens in groups, keeps its last tab and still takes old tab links', async ({ page }) => {
  await signIn(page, 'pm@demo.com');
  await page.goto('/projects');
  await page.getByText('RD-2026-01').first().click();
  const bar = page.getByTestId('project-workspace-bar');
  await expect(bar.getByRole('tab')).toHaveText(['Overview', 'Plan', 'Site', 'Materials', 'Money', 'Handover']);
  await expect(page.getByRole('list', { name: 'Project health' }).first()).toContainText('Schedule');

  await openProjectTab(page, 'Site', 'Daily reports');
  await expect(page).toHaveURL(/\?tab=dpr$/);
  await expect(page.getByRole('tabpanel', { name: 'Daily reports' })).toBeVisible();
  const projectUrl = page.url().replace(/\?.*$/, '');

  // A group opens on the tab last used in it.
  await openProjectTab(page, 'Money');
  await expect(page).toHaveURL(/\?tab=contract$/);
  await openProjectTab(page, 'Site');
  await expect(page).toHaveURL(/\?tab=dpr$/);

  // Coming back to the project opens the tab last used on it.
  await page.goto(projectUrl);
  await expect(projectTabs(page, 'Site').getByRole('radio', { name: 'Daily reports' })).toBeChecked();
  // ...and Overview still opens from there, though its address has no ?tab=.
  await bar.getByRole('tab', { name: 'Overview' }).click();
  await expect(page).toHaveURL(projectUrl);
  await expect(bar.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('project-status')).toBeVisible();

  // Links from before the groups still open their tab.
  await page.goto(`${projectUrl}?tab=stock`);
  await expect(bar.getByRole('tab', { name: 'Materials' })).toHaveAttribute('aria-selected', 'true');
  await expect(projectTabs(page, 'Materials').getByRole('radio', { name: 'Stock' })).toBeChecked();
});

test('scrolled down, the bar stays with the project name and the table header sits under it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 520 });
  await signIn(page, 'pm@demo.com');
  await page.goto('/projects');
  await page.getByText('RD-2026-01').first().click();
  await openProjectTab(page, 'Site', 'Progress entries');
  await expect(page.locator('.ant-table-tbody .ant-table-row').nth(3)).toBeVisible();
  const bar = page.getByTestId('project-workspace-bar');
  await expect(bar).not.toContainText('RD-2026-01');
  await page.mouse.move(800, 600);
  await page.mouse.wheel(0, 900);
  await expect(bar).toContainText('RD-2026-01');
  const barBox = (await bar.boundingBox())!;
  expect(barBox.y).toBe(56);
  await expect(async () => {
    const head = (await page.locator('.ant-table-thead').first().boundingBox())!;
    expect(Math.abs(head.y - (barBox.y + barBox.height))).toBeLessThan(2);
  }).toPass();
});
