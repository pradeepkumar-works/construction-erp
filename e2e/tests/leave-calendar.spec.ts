import { expect, test } from '@playwright/test';
import { api, apiToken, signIn } from './helpers';

type Me = { employee: { id: string; projectId: string } | null; year: number; yearLabel: string; weeklyOff: number };
type Calendar = { yearStart: number; weeklyOff: number; sites: { projectId: string; projectName: string; weeklyOff: number | null }[] };

/** Today where the API keeps its calendar (India). */
const todayIst = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** A Thursday about six weeks out, and the Saturday after it, with no holiday on the Thursday or the Saturday. */
async function thursdayToSaturday(token: string) {
  const d = new Date(`${todayIst()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 42);
  for (;;) {
    while (d.getUTCDay() !== 4) d.setUTCDate(d.getUTCDate() + 1);
    const thu = d.toISOString().slice(0, 10);
    const sat = new Date(d.getTime() + 2 * 86_400_000).toISOString().slice(0, 10);
    const holidays = (await api<{ date: string }[]>(token, `/staff/holidays?year=${thu.slice(0, 4)}`)).map((h) => h.date);
    if (!holidays.includes(thu) && !holidays.includes(sat) && thu.slice(0, 4) === sat.slice(0, 4)) return [thu, sat];
    d.setUTCDate(d.getUTCDate() + 7);
  }
}

/**
 * The leave year and the weekly off: HR moves the leave year to April to March in Payroll settings and gives the
 * engineer's site Friday as its weekly off under Holidays; the engineer's leave year is named 2026-27 and a Thursday to
 * Saturday leave takes two days, Friday not counted.
 */
test('HR sets an April to March leave year and a site’s weekly off, and leave follows', async ({ page, browser }) => {
  const hr = await apiToken('hr@demo.com');
  const se = await apiToken('engineer@demo.com');
  const me = await api<Me>(se, '/staff/me');
  const site = me.employee!.projectId;
  try {
    await signIn(page, 'hr@demo.com');
    await page.goto('/payroll?tab=settings');
    await expect(page.getByRole('cell', { name: 'January to December' })).toBeVisible();
    await page.getByRole('button', { name: /Change settings/ }).click();
    const drawer = page.getByRole('dialog', { name: /Payroll settings/ });
    await drawer.getByLabel('Leave year').click();
    await page.locator('.ant-select-dropdown:visible').getByTitle('April to March').click();
    await expect(drawer.locator('.ant-form-item').filter({ hasText: 'Leave year' }).locator('.ant-select').first()).toContainText('April to March');
    await drawer.getByRole('button', { name: /Save settings/ }).click();
    await expect(page.getByRole('cell', { name: 'April to March' })).toBeVisible();
    expect((await api<Calendar>(hr, '/staff/weekly-offs')).yearStart).toBe(4);

    const today = todayIst();
    const startYear = Number(today.slice(5, 7)) >= 4 ? Number(today.slice(0, 4)) : Number(today.slice(0, 4)) - 1;
    const label = `${startYear}-${String(startYear + 1).slice(2)}`;
    const mine = await api<Me>(se, '/staff/me');
    expect(mine.year).toBe(startYear);
    expect(mine.yearLabel).toBe(label);

    // The engineer's site keeps Friday off.
    await page.goto('/staff?tab=holidays');
    await expect(page.getByText(/Sundays are the weekly off/)).toBeVisible();
    await page.getByRole('button', { name: 'Weekly offs' }).click();
    const modal = page.getByRole('dialog', { name: 'Weekly offs' });
    const calendar = await api<Calendar>(hr, '/staff/weekly-offs');
    const siteName = calendar.sites.find((x) => x.projectId === site)!.projectName;
    const field = modal.locator('.ant-form-item').filter({ hasText: siteName });
    await field.getByRole('combobox').click();
    await page.locator('.ant-select-dropdown:visible').getByTitle('Friday').click();
    await expect(field.locator('.ant-select').first()).toContainText('Friday');
    await modal.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(`Friday at ${siteName}`)).toBeVisible();
    expect((await api<Me>(se, '/staff/me')).weeklyOff).toBe(5);
    // Only HR sets them.
    await expect(api(se, '/staff/weekly-offs', { method: 'PUT', body: { weeklyOff: 1 } })).rejects.toThrow(/403/);

    // The engineer sees the leave year's name, and Friday is not leave.
    const [thu, sat] = await thursdayToSaturday(se);
    const ctx = await browser.newContext();
    const engineer = await ctx.newPage();
    await signIn(engineer, 'engineer@demo.com');
    await engineer.goto('/staff');
    await expect(engineer.getByText(`Leave left in ${label}`)).toBeVisible();
    await engineer.getByRole('button', { name: 'Apply for leave' }).click();
    const apply = engineer.locator('.ant-modal').filter({ hasText: 'Apply for leave' });
    await apply.getByLabel('From').fill(fmt(thu));
    await apply.getByLabel('From').press('Enter');
    await apply.getByLabel('To', { exact: true }).fill(fmt(sat));
    await apply.getByLabel('To', { exact: true }).press('Enter');
    await expect(apply.getByText('Takes 2 days (Fridays and holidays not counted).')).toBeVisible();
    await ctx.close();
  } finally {
    await api(hr, '/payroll/settings', { method: 'PUT', body: { leaveYearStart: 1 } });
    await api(hr, '/staff/weekly-offs', { method: 'PUT', body: { sites: [{ projectId: site, weeklyOff: null }] } });
  }
});

/** Payroll's screen: what is due (months not run, PF and ESI, leavers) and the salaries pipeline on HR and payroll. */
test('the payroll screen and HR and payroll show what is due', async ({ page }) => {
  const hr = await apiToken('hr@demo.com');
  type Home = { figures: { id: string }[]; others: { kind: string; count: number }[] };
  const payroll = await api<Home>(hr, '/dashboard/modules/payroll');
  expect(payroll.figures.map((f) => f.id)).toEqual(expect.arrayContaining(['salaryRunsWaiting', 'salaryMonthsNotRun', 'leaversNotSettled']));
  const people = await api<Home>(hr, '/dashboard/modules/people');
  const leave = people.figures.length ? people.others.find((g) => g.kind === 'LEAVE') : undefined;
  type Department = { pipelines: { key: string; stages: { key: string }[] }[] };
  const dept = await api<Department>(hr, '/dashboard/departments/hr-payroll');
  expect(dept.pipelines.map((p) => p.key)).toEqual(['salaries']);
  expect(dept.pipelines[0].stages.map((s) => s.key)).toEqual(['TO_PREPARE', 'DRAFT', 'APPROVAL', 'TO_PAY']);

  await signIn(page, 'hr@demo.com');
  await page.goto('/modules/payroll');
  await expect(page.getByRole('heading', { level: 1, name: 'Payroll overview' })).toBeVisible();
  // A leaver not settled is a figure; with none, the strip's clear line says so.
  await expect(page.getByText(/Leavers not settled|[Ee]very leaver settled/).first()).toBeVisible();
  await expect(page.getByText('Waiting for you')).toBeVisible();
  if (leave) {
    await page.goto('/modules/people');
    await page.getByRole('link', { name: new RegExp(`^Leave: ${leave.count} to decide`) }).click();
    await expect(page).toHaveURL(/\/staff\?tab=leave/);
  }
});
