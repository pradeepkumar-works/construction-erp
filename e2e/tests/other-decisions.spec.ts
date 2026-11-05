import { expect, test } from '@playwright/test';
import { api, apiToken, signIn } from './helpers';

type Group = { kind: string; count: number; amount: string | null; href: string; items: { id: string; title: string; href: string }[] };

/** Today where the API keeps its calendar (India). */
const istDay = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

/**
 * The Approvals inbox also lists the decisions that have an approval of their own: leave and overtime for HR once the
 * manager recommended it, and vouchers for management, each linking to where it is decided. Accounts approves no
 * voucher and decides no leave, so has none.
 */
test('Approvals lists leave, overtime and vouchers waiting on the caller, each opening where it is decided', async ({ page }) => {
  const hr = await apiToken('hr@demo.com');
  const md = await apiToken('md@demo.com');
  const accounts = await apiToken('accounts@demo.com');
  const se2 = await apiToken('engineer2@demo.com');
  const pm2 = await apiToken('pm2@demo.com');

  // A day on duty, about nine weeks out on a Thursday that is not a holiday, waits on the manager first.
  const d = new Date(`${istDay()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 63);
  let date = '';
  for (;;) {
    while (d.getUTCDay() !== 4) d.setUTCDate(d.getUTCDate() + 1);
    date = d.toISOString().slice(0, 10);
    const holidays = (await api<{ date: string }[]>(se2, `/staff/holidays?year=${date.slice(0, 4)}`)).map((h) => h.date);
    if (!holidays.includes(date)) break;
    d.setUTCDate(d.getUTCDate() + 7);
  }
  const applied = await api<{ id: string }>(se2, '/staff/leave', { method: 'POST', body: { type: 'ON_DUTY', fromDate: date, toDate: date, halfDay: false, reason: `E2E inbox ${Date.now()}` } });
  try {
    const leaveIds = async (token: string) => (await api<Group[]>(token, '/approvals/others')).find((g) => g.kind === 'LEAVE')?.items.map((i) => i.id) ?? [];
    expect(await leaveIds(pm2)).toContain(applied.id);
    expect(await leaveIds(hr)).not.toContain(applied.id);
    await api(pm2, `/staff/leave/${applied.id}/approve`, { method: 'POST', body: {} });
    expect(await leaveIds(pm2)).not.toContain(applied.id);

    const hrGroups = await api<Group[]>(hr, '/approvals/others');
    const leave = hrGroups.find((g) => g.kind === 'LEAVE');
    expect(leave?.count).toBeGreaterThan(0);
    expect(leave!.items[0].href).toBe(`/staff?tab=leave&leave=${leave!.items[0].id}`);
    expect(hrGroups.map((g) => g.kind)).not.toContain('VOUCHER');

    const mdGroups = await api<Group[]>(md, '/approvals/others');
    const vouchers = mdGroups.find((g) => g.kind === 'VOUCHER');
    expect(vouchers?.count).toBeGreaterThan(0);
    expect(Number(vouchers!.amount)).toBeGreaterThan(0);
    expect((await api<Group[]>(accounts, '/approvals/others')).map((g) => g.kind)).toEqual([]);

    // HR approves no submission: the sidebar still offers Approvals, which shows these.
    await signIn(page, 'hr@demo.com');
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Approvals', exact: true }).click();
    const others = page.getByRole('region', { name: 'Leave' });
    await expect(page.getByText('Also waiting for you')).toBeVisible();
    await expect(page.getByText('Nothing waits on you here')).toHaveCount(0);
    await others.getByRole('link', { name: leave!.items[0].title }).click();
    await expect(page).toHaveURL(new RegExp(`/staff\\?tab=leave&leave=${leave!.items[0].id}`));
  } finally {
    await api(hr, `/staff/leave/${applied.id}/cancel`, { method: 'POST' });
  }
});

/** Someone who approves submissions has the queue and pane filling the window, so the same decisions are one line above it. */
test('an approver sees the other decisions as one line above the queue', async ({ page }) => {
  await signIn(page, 'md@demo.com');
  await page.goto('/approvals');
  const line = page.getByRole('region', { name: 'Also waiting for you' });
  await expect(line.getByRole('link', { name: /^Vouchers · \d+ · ₹/ })).toHaveAttribute('href', '/books?tab=vouchers');
  await expect(page.getByRole('region', { name: 'Approval queue' })).toBeVisible();
});
