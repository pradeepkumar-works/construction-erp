import { expect, test } from '@playwright/test';
import { api, apiToken, chooseOption, signIn } from './helpers';

type Me = { employee: { id: string; projectId: string } | null; balances: { type: string; taken: number; pending: number }[] };
type Leave = { id: string; status: string; days: string; employeeName: string; reason: string };
type Register = { rows: { employee: { id: string; fullName: string }; attendance: { status: string } | null }[] };

/** Today where the API keeps its calendar (India). */
const todayIst = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** A Monday about six weeks out whose Monday and Tuesday are not holidays. */
async function twoWorkingDays(token: string) {
  const d = new Date(`${todayIst()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 42);
  for (;;) {
    while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
    const mon = d.toISOString().slice(0, 10);
    const tue = new Date(d.getTime() + 86_400_000).toISOString().slice(0, 10);
    const holidays = (await api<{ date: string }[]>(token, `/staff/holidays?year=${mon.slice(0, 4)}`)).map((h) => h.date);
    if (!holidays.includes(mon) && !holidays.includes(tue) && mon.slice(0, 4) === tue.slice(0, 4)) return [mon, tue];
    d.setUTCDate(d.getUTCDate() + 7);
  }
}

/**
 * Staff and leave (v3 item 29): a site engineer checks in and applies for leave, cannot approve it herself, and her
 * project manager approves it; the site in-charge marks the staff register; HR adds a staff member.
 */
test.describe.serial('staff attendance and leave', () => {
  const reason = `E2E leave ${Date.now()}`;

  test('an engineer checks in and applies for leave, and her project manager approves it', async ({ page, browser }) => {
    const se = await apiToken('engineer@demo.com');
    const pm = await apiToken('pm@demo.com');
    const hr = await apiToken('hr@demo.com');
    // Leave left over from an earlier run would overlap.
    for (const l of (await api<{ items: Leave[] }>(hr, `/staff/leave?q=${encodeURIComponent('E2E leave')}&pageSize=100`)).items)
      if (l.status === 'PENDING' || l.status === 'APPROVED') await api(hr, `/staff/leave/${l.id}/cancel`, { method: 'POST' });
    const me = await api<Me>(se, '/staff/me');
    // Start the day unmarked so the check-in button shows.
    await api(pm, '/staff/register', { method: 'PUT', body: { projectId: me.employee!.projectId, date: todayIst(), entries: [{ employeeId: me.employee!.id, status: null }] } });
    const casualBefore = me.balances.find((b) => b.type === 'CASUAL')!;
    const [from, to] = await twoWorkingDays(se);

    await signIn(page, 'engineer@demo.com');
    await page.getByRole('link', { name: 'Staff & Leave' }).click();
    await page.getByRole('button', { name: 'Check in' }).click();
    await expect(page.getByText('Checked in', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Check out' })).toBeVisible();

    await page.getByRole('button', { name: 'Apply for leave' }).click();
    const modal = page.locator('.ant-modal').filter({ hasText: 'Apply for leave' });
    await modal.getByLabel('From').fill(fmt(from));
    await modal.getByLabel('From').press('Enter');
    await modal.getByLabel('To', { exact: true }).fill(fmt(to));
    await modal.getByLabel('To', { exact: true }).press('Enter');
    await modal.getByLabel('Reason').fill(reason);
    await expect(modal.getByText(/Takes 2 days/)).toBeVisible();
    await modal.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByText('Leave applied: 2 days')).toBeVisible();

    const mine = (await api<{ items: Leave[] }>(se, `/staff/leave?q=${encodeURIComponent(reason)}`)).items;
    expect(mine).toHaveLength(1);
    const id = mine[0].id;
    await expect(api(se, `/staff/leave/${id}/approve`, { method: 'POST', body: {} })).rejects.toThrow(/403/);
    const pmNotes = (await api<{ items: { title: string }[] }>(pm, '/notifications')).items;
    expect(pmNotes.some((n) => n.title === 'Priya Mohanty applied for casual leave')).toBe(true);

    const pmPage = await (await browser.newContext()).newPage();
    await signIn(pmPage, 'pm@demo.com');
    await pmPage.goto(`/staff?tab=leave&leave=${id}`);
    const drawer = pmPage.locator('.ant-drawer-open');
    await expect(drawer.getByText(reason)).toBeVisible();
    await drawer.getByRole('button', { name: 'Approve' }).click();
    await expect(pmPage.getByText('Leave approved for Priya Mohanty')).toBeVisible();

    const after = (await api<Me>(se, '/staff/me')).balances.find((b) => b.type === 'CASUAL')!;
    expect(after.taken).toBe(casualBefore.taken + 2);
    const seNotes = (await api<{ items: { title: string }[] }>(se, '/notifications')).items;
    expect(seNotes.some((n) => n.title === 'Casual leave approved')).toBe(true);
    // HR can withdraw approved leave, which gives the days back.
    expect((await api<Leave>(hr, `/staff/leave/${id}/cancel`, { method: 'POST' })).status).toBe('CANCELLED');
  });

  test('the site in-charge marks the register and HR adds a staff member', async ({ page, browser }) => {
    const tl = await apiToken('tl@demo.com');
    const projectId = (await api<Me>(tl, '/staff/me')).employee!.projectId;
    await signIn(page, 'tl@demo.com');
    await page.goto('/staff?tab=register');
    const row = page.getByRole('row', { name: /Laxmidhar Nayak/ });
    await row.getByText('Absent', { exact: true }).click();
    await page.getByRole('button', { name: /^Save/ }).click();
    await expect(page.getByText(/Register saved for/)).toBeVisible();
    const reg = await api<Register>(tl, `/staff/register?projectId=${projectId}&date=${todayIst()}`);
    const laxmidhar = reg.rows.find((r) => r.employee.fullName === 'Laxmidhar Nayak')!;
    expect(laxmidhar.attendance?.status).toBe('ABSENT');
    await api(tl, '/staff/register', { method: 'PUT', body: { projectId, date: todayIst(), entries: [{ employeeId: laxmidhar.employee.id, status: null }] } });

    const name = `E2E Surveyor ${Date.now()}`;
    const hrPage = await (await browser.newContext()).newPage();
    await signIn(hrPage, 'hr@demo.com');
    await hrPage.goto('/staff?tab=staff');
    await hrPage.getByRole('button', { name: 'Add staff' }).click();
    const modal = hrPage.locator('.ant-modal').filter({ hasText: 'Add staff' });
    await modal.getByLabel('Name').fill(name);
    await modal.getByLabel('Designation').fill('Surveyor');
    await chooseOption(modal.getByLabel('Posted at'), 'WS-2026-03');
    await modal.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(hrPage.getByText(new RegExp(`${name} added as EMP-\\d+`))).toBeVisible();
    const hr = await apiToken('hr@demo.com');
    const added = (await api<{ items: { id: string; projectName: string | null }[] }>(hr, `/staff/employees?q=${encodeURIComponent(name)}`)).items;
    expect(added).toHaveLength(1);
    expect(added[0].projectName).toBe('Jajpur Rural Piped Water Supply Scheme');
    // Records are never deleted: mark the test one as left.
    await api(hr, `/staff/employees/${added[0].id}`, { method: 'PATCH', body: { leftOn: todayIst() } });
  });
});
