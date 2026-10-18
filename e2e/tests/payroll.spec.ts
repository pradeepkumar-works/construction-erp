import { expect, test } from '@playwright/test';
import { api, apiToken, signIn } from './helpers';

type Payroll = { month: string; rows: { employeeCode: string; fullName: string; paidDays: number; calendarDays: number; lopDays: number }[] };

/** This month where the API keeps its calendar (India), as YYYY-MM and as the picker shows it. */
const now = new Date(Date.now() + 330 * 60_000);
const month = now.toISOString().slice(0, 7);
const monthLabel = now.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Payroll inputs (v3 item 30): HR exports the month's sheet; the labour contractors' month is priced at trade rates. */
test('HR exports the payroll inputs and sees the labour contractors month', async ({ page }) => {
  const hr = await apiToken('hr@demo.com');
  const sheet = await api<Payroll>(hr, `/payroll/staff?month=${month}`);
  const priya = sheet.rows.find((r) => r.employeeCode === 'EMP-006')!;
  expect(priya.paidDays).toBe(priya.calendarDays - priya.lopDays);

  await signIn(page, 'hr@demo.com');
  await page.getByRole('link', { name: 'Payroll inputs' }).click();
  await page.getByLabel('Month').click();
  await page.getByLabel('Month').fill(monthLabel);
  await page.getByLabel('Month').press('Enter');
  const row = page.getByRole('row', { name: /EMP-006/ });
  await expect(row.getByText('Priya Mohanty')).toBeVisible();
  await expect(row.getByRole('cell', { name: String(priya.paidDays), exact: true }).first()).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Excel' }).click();
  expect((await download).suggestedFilename()).toBe(`payroll-inputs-${month}.xlsx`);

  await page.getByRole('tab', { name: 'Labour contractors' }).click();
  await expect(page.getByText('Departmental').first()).toBeVisible();
  await expect(page.getByRole('row', { name: /Supervisor/ }).first()).toContainText('₹');

  const se = await apiToken('engineer@demo.com');
  await expect(api(se, `/payroll/staff?month=${month}`)).rejects.toThrow(/403/);
});
