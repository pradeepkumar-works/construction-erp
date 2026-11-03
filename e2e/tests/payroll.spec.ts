import { expect, test } from '@playwright/test';
import { api, apiToken, localToday, signIn } from './helpers';

type Payroll = { month: string; rows: { employeeCode: string; fullName: string; paidDays: number; calendarDays: number; lopDays: number }[] };

/** This month where the API keeps its calendar (India), as YYYY-MM and as the picker shows it. */
const now = new Date(Date.now() + 330 * 60_000);
const month = now.toISOString().slice(0, 7);
const monthLabel = now.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Payroll inputs: HR exports the month's sheet; the labour contractors' month is priced at trade rates. */
test('HR exports the payroll inputs and sees the labour contractors month', async ({ page }) => {
  const hr = await apiToken('hr@demo.com');
  const sheet = await api<Payroll>(hr, `/payroll/staff?month=${month}`);
  const priya = sheet.rows.find((r) => r.employeeCode === 'EMP-006')!;
  expect(priya.paidDays).toBe(priya.calendarDays - priya.lopDays);

  await signIn(page, 'hr@demo.com');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Payroll', exact: true }).click();
  await page.getByRole('tab', { name: 'Staff inputs' }).click();
  await page.getByLabel('Month').click();
  await page.getByLabel('Month').fill(monthLabel);
  await page.getByLabel('Month').press('Enter');
  const row = page.getByRole('row', { name: /EMP-006/ });
  await expect(row.getByText('Priya Mohanty')).toBeVisible();
  await expect(row.getByRole('cell', { name: String(priya.paidDays), exact: true }).first()).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export to Excel' }).click();
  expect((await download).suggestedFilename()).toBe(`payroll-inputs-${month}.xlsx`);

  await page.getByRole('tab', { name: 'Labour contractors' }).click();
  await expect(page.getByText('Departmental').first()).toBeVisible();
  await expect(page.getByRole('row', { name: /Supervisor/ }).first()).toContainText('₹');

  const se = await apiToken('engineer@demo.com');
  await expect(api(se, `/payroll/staff?month=${month}`)).rejects.toThrow(/403/);
});

type Slip = { id: string; employeeCode: string; employeeName: string; month: string; gross: string; net: string; lines: { code: string; amount: string; manual: boolean }[] };
type Run = { id: string; runNo: string; month: string; status: string; employees: number; net: string; payslips: Slip[]; skipped: unknown[] };
type File = { fileName: string; content: string; missing: string[] };

/**
 * Salary runs: HR prepares the month from attendance and salary structures and adds a bonus by hand,
 * management approves (HR cannot), the bank, PF and ESI files come out of the approved run, and each person sees their own
 * payslip; the run goes back to HR and is deleted so the month is free again.
 */
test('HR prepares the salary run, management approves it and staff see their payslips', async ({ page }) => {
  const hr = await apiToken('hr@demo.com');
  const md = await apiToken('md@demo.com');
  const pm = await apiToken('pm@demo.com');
  const runs = await api<Run[]>(hr, '/payroll/runs');
  // A run left over from an earlier try goes first.
  for (const r of runs.filter((x) => x.month === month)) {
    if (r.status !== 'DRAFT') await api(md, `/payroll/runs/${r.id}/send-back`, { method: 'POST', body: { note: 'Test reset' } });
    await api(hr, `/payroll/runs/${r.id}`, { method: 'DELETE' });
  }
  await expect(api(pm, '/payroll/runs')).rejects.toThrow(/403/);

  const run = await api<Run>(hr, '/payroll/runs', { method: 'POST', body: { month } });
  expect(run.runNo).toBe(`SAL-${month}`);
  expect(run.employees).toBeGreaterThan(10);
  const priya = run.payslips.find((p) => p.employeeCode === 'EMP-006')!;
  expect(priya.lines.map((l) => l.code)).toEqual(expect.arrayContaining(['BASIC', 'HRA', 'PF']));

  // A bonus added by hand stays when the run is worked out again.
  const bonus = await api<Slip>(hr, `/payroll/payslips/${priya.id}/adjustments`, { method: 'PUT', body: { lines: [{ code: 'BONUS', label: 'Festival bonus', amount: 5000 }] } });
  expect(Number(bonus.gross)).toBe(Number(priya.gross) + 5000);
  const again = await api<Run>(hr, `/payroll/runs/${run.id}/recompute`, { method: 'POST' });
  expect(again.payslips.find((p) => p.employeeCode === 'EMP-006')!.lines.find((l) => l.code === 'BONUS')?.manual).toBe(true);

  // Approval: HR submits but cannot approve; the MD approves.
  await api(hr, `/payroll/runs/${run.id}/submit`, { method: 'POST' });
  await expect(api(hr, `/payroll/runs/${run.id}/approve`, { method: 'POST', body: {} })).rejects.toThrow(/403/);
  const approved = await api<Run>(md, `/payroll/runs/${run.id}/approve`, { method: 'POST', body: {} });
  expect(approved.status).toBe('APPROVED');
  // Each step tells whoever acts next: management to approve, then accounts to pay and HR that it went through.
  type Notice = { title: string; entityType: string | null; entityId: string | null };
  const told = async (token: string, title: RegExp) =>
    (await api<{ items: Notice[] }>(token, '/notifications?limit=30&typesVersion=8')).items.some((n) => n.entityType === 'PAYROLL_RUN' && n.entityId === run.id && title.test(n.title));
  expect(await told(md, new RegExp(`^Salary run SAL-${month} for .+ waits for your approval$`))).toBe(true);
  expect(await told(await apiToken('accounts@demo.com'), new RegExp(`^Salary run SAL-${month} for .+ approved: pay ₹`))).toBe(true);
  expect(await told(hr, /approved: pay/)).toBe(true);

  const bank = await api<File>(hr, `/payroll/runs/${run.id}/bank-file`);
  expect(bank.fileName).toBe(`SAL-${month}-bank.csv`);
  expect(bank.content.split('\r\n')[0]).toContain('Beneficiary account');
  const ecr = await api<File>(hr, `/payroll/runs/${run.id}/ecr`);
  expect(ecr.content.split('\n')[0].split('#~#')).toHaveLength(11);

  // The project manager sees their own payslip for the month, and nobody else's.
  const mine = await api<Slip[]>(pm, '/payroll/my-payslips');
  expect(mine.find((p) => p.month === month)).toBeTruthy();
  expect(new Set(mine.map((p) => p.employeeCode)).size).toBe(1);
  await expect(api(pm, `/payroll/payslips/${priya.id}`)).rejects.toThrow(/404/);

  // On the page: the run with its payslips, and the payslip with the bonus.
  await signIn(page, 'hr@demo.com');
  await page.goto('/payroll');
  await expect(page.getByRole('tab', { name: 'Salary runs', selected: true })).toBeVisible();
  await page.getByRole('row', { name: new RegExp(`SAL-${month}`) }).first().click();
  const drawer = page.locator('.ant-drawer').filter({ hasText: `SAL-${month}` });
  await expect(drawer.getByText('Approved, to pay').first()).toBeVisible();
  await drawer.getByRole('row', { name: /EMP-006/ }).click();
  const slip = page.getByRole('dialog', { name: /Priya Mohanty: payslip for/ });
  await expect(slip.getByText('Festival bonus (added)')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(slip).toBeHidden();

  // Back to HR, then deleted, so the month is free for the next try.
  await api(md, `/payroll/runs/${run.id}/send-back`, { method: 'POST', body: { note: 'Test done' } });
  await api(hr, `/payroll/runs/${run.id}`, { method: 'DELETE' });
});

type Settlement = { id: string; settlementNo: string; employeeCode: string; status: string; noticeShortDays: number; loanRecovery: string; net: string };

/**
 * Full and final: once someone's resignation is recorded they are due a settlement; HR works it out on the page
 * (notice short, the loan still owed), only management approves it, and the exit cannot be taken back while it exists.
 */
test('HR works out a full and final settlement for someone who resigned', async ({ page }) => {
  const hr = await apiToken('hr@demo.com');
  type Employee = { id: string; employeeCode: string; fullName: string };
  const ramesh = (await api<{ items: Employee[] }>(hr, '/staff/employees?pageSize=100')).items.find((e) => e.employeeCode === 'EMP-008')!;
  const today = localToday();
  const noticeOn = new Date(Date.parse(`${today}T00:00:00Z`) - 10 * 86_400_000).toISOString().slice(0, 10);
  const exit = await api<{ id: string }>(hr, `/staff/employees/${ramesh.id}/events`, { method: 'POST', body: { type: 'RESIGNED', effectiveDate: today, noticeGivenOn: noticeOn, note: 'Moving back home' } });

  await signIn(page, 'hr@demo.com');
  await page.goto('/payroll?tab=settlements');
  await expect(page.getByRole('tab', { name: 'Full and final', selected: true })).toBeVisible();
  await page.getByRole('button', { name: `Prepare settlement for ${ramesh.fullName}` }).click();
  await page.getByRole('dialog', { name: `Full and final settlement for ${ramesh.fullName}` }).getByRole('button', { name: 'Prepare settlement' }).click();
  await expect(page.getByText(/FNF-EMP-008 worked out/)).toBeVisible();

  const s = (await api<Settlement[]>(hr, '/payroll/settlements')).find((x) => x.employeeCode === 'EMP-008')!;
  expect(s.status).toBe('DRAFT');
  expect(s.noticeShortDays).toBe(19);
  expect(Number(s.loanRecovery)).toBeGreaterThan(0);
  await expect(api(hr, `/payroll/settlements/${s.id}/approve`, { method: 'POST' })).rejects.toThrow(/403/);
  await expect(api(hr, `/staff/events/${exit.id}`, { method: 'DELETE' })).rejects.toThrow(/400/);

  await page.getByRole('row', { name: /FNF-EMP-008/ }).click();
  const modal = page.getByRole('dialog', { name: new RegExp(`FNF-EMP-008: ${ramesh.fullName}`) });
  await expect(modal.getByText('Notice short by 19 days')).toBeVisible();
  await modal.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).last().click();
  await expect(page.getByText('Settlement deleted')).toBeVisible();
  await api(hr, `/staff/events/${exit.id}`, { method: 'DELETE' });

  // The settings HR runs payroll with.
  await page.goto('/payroll?tab=settings');
  await expect(page.getByText('Odisha')).toBeVisible();
  await expect(page.getByText(/HDFC Bank 50200012345678/)).toBeVisible();
});

test("HR sets the company's leave days and an employee's opening leave, and the balances follow", async ({ page }) => {
  const hr = await apiToken('hr@demo.com');
  type Employee = { id: string; employeeCode: string };
  type Balance = { type: string; entitled: number | null };
  const emp = (await api<{ items: Employee[] }>(hr, '/staff/employees?pageSize=100')).items.find((e) => e.employeeCode === 'EMP-008')!;
  const casual = async () => (await api<Balance[]>(hr, `/staff/leave/balances?employeeId=${emp.id}`)).find((b) => b.type === 'CASUAL')!.entitled;
  expect(await casual()).toBe(12);
  try {
    await signIn(page, 'hr@demo.com');
    await page.goto('/payroll?tab=settings');
    await expect(page.getByText('12 casual, 12 sick, 15 earned')).toBeVisible();
    await page.getByRole('button', { name: /Change settings/ }).click();
    const drawer = page.getByRole('dialog', { name: /Payroll settings/ });
    await drawer.getByLabel('Casual leave a year').fill('10');
    await drawer.getByLabel('Earned leave carried into next year').fill('30');
    await drawer.getByRole('button', { name: /Save settings/ }).click();
    await expect(page.getByText('10 casual, 12 sick, 15 earned')).toBeVisible();
    await expect(page.getByText('Up to 30 days')).toBeVisible();
    expect(await casual()).toBe(10);

    // Leave taken before Nirmaan counts as taken; earned leave brought forward adds to the year.
    const year = Number(new Date().toISOString().slice(0, 4));
    const left = async (type: string) => (await api<(Balance & { left: number | null; takenBefore: number })[]>(hr, `/staff/leave/balances?employeeId=${emp.id}&year=${year}`)).find((b) => b.type === type)!;
    const before = await left('CASUAL');
    await page.goto(`/staff?tab=staff&employee=${emp.id}`);
    const staffDrawer = page.getByRole('dialog', { name: /EMP-008/ });
    await staffDrawer.getByRole('tab', { name: 'Attendance and leave', exact: true }).click();
    await staffDrawer.getByRole('button', { name: 'Opening leave' }).click();
    const modal = page.getByRole('dialog', { name: /Opening leave for/ });
    await modal.getByLabel('Casual leave taken').fill('2');
    await modal.getByLabel(/Earned leave brought forward/).fill('20');
    await modal.getByRole('button', { name: /Save opening leave/ }).click();
    await expect(page.getByText(/Opening leave for .* saved/)).toBeVisible();
    await expect(page.getByText('Taken counts 2 days from before Nirmaan.')).toBeVisible();
    const after = await left('CASUAL');
    expect(after.takenBefore).toBe(2);
    expect(after.left).toBe(before.left! - 2);
    expect((await left('EARNED')).entitled).toBe(15 + 20); // in place of the 15 the carry of 30 would bring
    await expect(api(await apiToken('pm@demo.com'), `/staff/employees/${emp.id}/leave-opening`, { method: 'PUT', body: { year, lines: [] } })).rejects.toThrow(/403/);
  } finally {
    await api(hr, '/payroll/settings', { method: 'PUT', body: { casualLeaveDays: 12, earnedCarryMax: 0 } });
    const year = Number(new Date().toISOString().slice(0, 4));
    await api(hr, `/staff/employees/${emp.id}/leave-opening`, { method: 'PUT', body: { year, lines: ['CASUAL', 'SICK', 'EARNED'].map((type) => ({ type, takenBefore: 0, broughtForward: null })) } });
  }
});
