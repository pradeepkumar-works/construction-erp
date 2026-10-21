import { expect, test } from '@playwright/test';
import { api, apiToken, axeViolations, signIn } from './helpers';

type Site = { projectId: string; projectName: string; lat: string; lng: string; radiusM: number; strict: boolean };
type Me = { employee: { id: string; projectId: string } | null; site: Site | null; balances: { type: string; entitled: number | null; left: number | null }[] };
type Day = {
  id: string;
  employeeName: string;
  date: string;
  overtimeHours: string | null;
  overtimeStatus: string | null;
  canDecideOvertime: boolean;
  checkInPlace: { distanceM: number | null; inside: boolean | null } | null;
};
type Register = { rows: { employee: { id: string; employeeCode: string; fullName: string }; attendance: Day | null }[] };
type Payroll = { rows: { employeeCode: string; present: number; overtimeHours: number; overtimePendingHours: number; lopDays: number; leave: Record<string, number> }[] };

/** Today and yesterday where the API keeps its calendar (India). */
const istDay = (offset = 0) => new Date(Date.now() + 330 * 60_000 + offset * 86_400_000).toISOString().slice(0, 10);
const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

/**
 * GPS check-in (v5 item 97): the building site has a location and a 200 m radius. With the refusal switched on, a
 * check-in without a position or from a kilometre away is refused with a message that says what to do; one from 55 m
 * is inside. The site manager's register shows where it was.
 */
test('a check-in records where the phone is, and a strict site refuses one from outside', async () => {
  const admin = await apiToken('admin@demo.com');
  const pm2 = await apiToken('pm2@demo.com');
  const se2 = await apiToken('engineer2@demo.com');
  const me = await api<Me>(se2, '/staff/me');
  const site = me.site!;
  expect(site).toMatchObject({ radiusM: 200, strict: false });
  const today = istDay();
  await api(pm2, '/staff/register', { method: 'PUT', body: { projectId: me.employee!.projectId, date: today, entries: [{ employeeId: me.employee!.id, status: null }] } });

  // Half a location, or refusing without one, is not saved.
  await expect(api(admin, `/projects/${site.projectId}`, { method: 'PATCH', body: { siteLat: null } })).rejects.toThrow(/both the latitude and the longitude/);
  await api(admin, `/projects/${site.projectId}`, { method: 'PATCH', body: { siteCheckInStrict: true } });
  try {
    expect((await api<Me>(se2, '/staff/me')).site!.strict).toBe(true);
    await expect(api(se2, '/staff/me/check-in', { method: 'POST', body: {} })).rejects.toThrow(/checks your location at check-in\. Allow location/);
    const lat = Number(site.lat);
    const lng = Number(site.lng);
    await expect(api(se2, '/staff/me/check-in', { method: 'POST', body: { lat: lat + 0.009, lng, accuracyM: 15 } })).rejects.toThrow(/You are 1(\.0)? km from .*check in from within 200 m/);
    const day = await api<Day>(se2, '/staff/me/check-in', { method: 'POST', body: { lat: lat + 0.0005, lng, accuracyM: 30 } });
    expect(day.checkInPlace).toMatchObject({ inside: true });
    expect(day.checkInPlace!.distanceM).toBeGreaterThan(50);
    expect(day.checkInPlace!.distanceM).toBeLessThan(60);
  } finally {
    await api(admin, `/projects/${site.projectId}`, { method: 'PATCH', body: { siteCheckInStrict: false } });
  }
  const reg = await api<Register>(pm2, `/staff/register?projectId=${site.projectId}&date=${today}`);
  expect(reg.rows.find((r) => r.employee.id === me.employee!.id)!.attendance!.checkInPlace).toMatchObject({ inside: true });

  // Without the refusal a check-in from outside is taken and flagged.
  await api(pm2, '/staff/register', { method: 'PUT', body: { projectId: me.employee!.projectId, date: today, entries: [{ employeeId: me.employee!.id, status: null }] } });
  const flagged = await api<Day>(se2, '/staff/me/check-in', { method: 'POST', body: { lat: Number(site.lat) + 0.02, lng: Number(site.lng), accuracyM: 10 } });
  expect(flagged.checkInPlace).toMatchObject({ inside: false });
});

/**
 * Overtime approval (v5 item 97): overtime the site supervisor marks waits for the project manager; the manager's own
 * entries are approved as saved. Payroll pays approved overtime only and shows what still waits.
 */
test('overtime waits for the site manager and payroll pays approved overtime only', async ({ page }) => {
  const tl = await apiToken('tl@demo.com');
  const pm = await apiToken('pm@demo.com');
  const hr = await apiToken('hr@demo.com');
  const yesterday = istDay(-1);
  const month = yesterday.slice(0, 7);
  const projectId = (await api<{ items: { id: string; code: string }[] }>(pm, '/projects?pageSize=100')).items.find((p) => p.code === 'RD-2026-01')!.id;
  const reg = await api<Register>(tl, `/staff/register?projectId=${projectId}&date=${yesterday}`);
  const emp = (code: string) => reg.rows.find((r) => r.employee.employeeCode === code)!.employee;
  const [bikash, sanjay, laxmidhar] = [emp('EMP-014'), emp('EMP-015'), emp('EMP-016')];
  const payroll = async () => (await api<Payroll>(hr, `/payroll/staff?month=${month}`)).rows;
  const row = (rows: Payroll['rows'], code: string) => rows.find((r) => r.employeeCode === code)!;

  // Start from no overtime on the day, then the supervisor marks some.
  const clear = [bikash, sanjay, laxmidhar].map((e) => ({ employeeId: e.id, status: 'PRESENT', overtimeHours: null }));
  await api(pm, '/staff/register', { method: 'PUT', body: { projectId, date: yesterday, entries: clear } });
  const before = await payroll();
  await api(tl, '/staff/register', {
    method: 'PUT',
    body: { projectId, date: yesterday, entries: [{ employeeId: bikash.id, status: 'PRESENT', overtimeHours: 2 }, { employeeId: laxmidhar.id, status: 'PRESENT', overtimeHours: 1 }] },
  });
  await api(pm, '/staff/register', { method: 'PUT', body: { projectId, date: yesterday, entries: [{ employeeId: sanjay.id, status: 'PRESENT', overtimeHours: 1.5 }] } });
  const marked = await api<Register>(pm, `/staff/register?projectId=${projectId}&date=${yesterday}`);
  const status = (id: string) => marked.rows.find((r) => r.employee.id === id)!.attendance!.overtimeStatus;
  expect([status(bikash.id), status(laxmidhar.id), status(sanjay.id)]).toEqual(['PENDING', 'PENDING', 'APPROVED']);
  const waiting = row(await payroll(), 'EMP-014');
  expect(waiting.overtimePendingHours).toBe(row(before, 'EMP-014').overtimePendingHours + 2);
  expect(waiting.overtimeHours).toBe(row(before, 'EMP-014').overtimeHours);
  expect(row(await payroll(), 'EMP-015').overtimeHours).toBe(row(before, 'EMP-015').overtimeHours + 1.5);

  // The supervisor cannot decide it; the project manager approves Bikash's on the Staff page.
  const toDecide = await api<Day[]>(pm, '/staff/overtime');
  const bikashDay = toDecide.find((d) => d.employeeName === bikash.fullName && d.date === yesterday)!;
  expect(bikashDay.canDecideOvertime).toBe(true);
  await expect(api(tl, `/staff/attendance/${bikashDay.id}/overtime/approve`, { method: 'POST', body: {} })).rejects.toThrow(/403/);
  const summary = await api<{ overtimeToDecide: number }>(pm, '/staff/summary');
  expect(summary.overtimeToDecide).toBe(toDecide.length);

  await signIn(page, 'pm@demo.com');
  await page.goto('/staff?tab=overtime');
  await expect(page.getByRole('tab', { name: /Overtime/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('cell', { name: /Bikash Swain/ }).first()).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
  await page.getByRole('button', { name: `Approve Bikash Swain's overtime on ${fmt(yesterday)}` }).click();
  await expect(page.getByText('2 h overtime approved for Bikash Swain')).toBeVisible();

  // Laxmidhar's is rejected with a reason; neither waits any more.
  const lDay = (await api<Day[]>(pm, '/staff/overtime')).find((d) => d.employeeName === laxmidhar.fullName && d.date === yesterday)!;
  await expect(api(pm, `/staff/attendance/${lDay.id}/overtime/reject`, { method: 'POST', body: {} })).rejects.toThrow(/400/);
  expect((await api<Day>(pm, `/staff/attendance/${lDay.id}/overtime/reject`, { method: 'POST', body: { note: 'Not agreed in advance' } })).overtimeStatus).toBe('REJECTED');
  await expect(api(pm, `/staff/attendance/${lDay.id}/overtime/approve`, { method: 'POST', body: {} })).rejects.toThrow(/already been decided/);

  const after = await payroll();
  expect(row(after, 'EMP-014').overtimeHours).toBe(row(before, 'EMP-014').overtimeHours + 2);
  expect(row(after, 'EMP-014').overtimePendingHours).toBe(row(before, 'EMP-014').overtimePendingHours);
  expect(row(after, 'EMP-016').overtimeHours).toBe(row(before, 'EMP-016').overtimeHours);
  expect(row(after, 'EMP-016').overtimePendingHours).toBe(row(before, 'EMP-016').overtimePendingHours);
});

/**
 * On duty and tour (v5 item 97): approved like leave, but there is no balance to run out and payroll counts the day
 * present and paid.
 */
test('on-duty days count as present and paid, with no balance', async () => {
  const se2 = await apiToken('engineer2@demo.com');
  const pm2 = await apiToken('pm2@demo.com');
  const hr = await apiToken('hr@demo.com');
  const me = await api<Me>(se2, '/staff/me');
  expect(me.balances.find((b) => b.type === 'ON_DUTY')).toMatchObject({ entitled: null, left: null });

  // A Wednesday about seven weeks out that is not a holiday.
  const d = new Date(`${istDay()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 49);
  let date = '';
  for (;;) {
    while (d.getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() + 1);
    date = d.toISOString().slice(0, 10);
    const holidays = (await api<{ date: string }[]>(se2, `/staff/holidays?year=${date.slice(0, 4)}`)).map((h) => h.date);
    if (!holidays.includes(date)) break;
    d.setUTCDate(d.getUTCDate() + 7);
  }
  const reason = `E2E on duty ${Date.now()}`;
  const payroll = async () => (await api<Payroll>(hr, `/payroll/staff?month=${date.slice(0, 7)}`)).rows.find((r) => r.employeeCode === 'EMP-007')!;
  const before = await payroll();
  const leave = await api<{ id: string; status: string }>(se2, '/staff/leave', { method: 'POST', body: { type: 'ON_DUTY', fromDate: date, toDate: date, halfDay: false, reason } });
  try {
    await api(pm2, `/staff/leave/${leave.id}/approve`, { method: 'POST', body: {} });
    const after = await payroll();
    expect(after.leave.ON_DUTY).toBe(before.leave.ON_DUTY + 1);
    expect(after.present).toBe(before.present + 1);
    expect(after.lopDays).toBe(before.lopDays);
  } finally {
    await api(hr, `/staff/leave/${leave.id}/cancel`, { method: 'POST' });
  }
});
