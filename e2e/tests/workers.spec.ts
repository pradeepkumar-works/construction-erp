import { expect, test } from '@playwright/test';
import { API_URL, api, apiToken, localToday, PASSWORD, signIn } from './helpers';

type Line = { contractor: string; category: string; count: number };
type RollCall = { rows: { workerId: string; name: string; status: string | null; otHours: string | null; activityId: string | null }[]; headCount: Line[] | null; totals: { present: number; halfDay: number; absent: number } };
type Worker = { id: string; workerNo: string; name: string; idNumber: string | null; effectiveOtRate: string };

const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Named worker register: workers by name, the roll call, the head count it keeps in step, and the muster. */
test('a site team marks the roll call of named workers and the head count follows', async ({ page }) => {
  // A company of its own, so the roll call does not touch the demo head counts.
  const stamp = Date.now();
  const email = `labour-${stamp}@e2e.test`;
  const res = await fetch(`${API_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ organizationName: `E2E Labour ${stamp}`, fullName: 'Lata Labour', email, password: PASSWORD }),
  });
  expect(res.ok).toBe(true);
  const owner = await apiToken(email);
  const today = localToday();
  const project = await api<{ id: string }>(owner, '/projects', { method: 'POST', body: { code: 'WRK-01', name: 'E2E worker project', type: 'BUILDING', startDate: shift(today, -30), endDate: shift(today, 200) } });
  const act = await api<{ id: string }>(owner, `/projects/${project.id}/activities`, { method: 'POST', body: { name: 'Brickwork', unit: 'Cum', plannedQty: '300', plannedStart: shift(today, -10), plannedEnd: shift(today, 40) } });
  // Today's head count already has a departmental supervisor and five of Kalia's masons; the roll call replaces the masons.
  await api(owner, '/attendance', { method: 'POST', body: { projectId: project.id, date: today, lines: [{ contractor: 'Departmental', category: 'Supervisor', count: 1 }, { contractor: 'Kalia Contractors', category: 'Mason', count: 5 }] } });
  const add = (name: string, trade: string, dailyWage: string, extra: Record<string, unknown> = {}) =>
    api<Worker>(owner, '/workers', { method: 'POST', body: { name, contractor: 'Kalia Contractors', trade, dailyWage, projectId: project.id, joinedOn: shift(today, -20), ...extra } });
  const mason = await add('Bhagaban Sahu', 'Mason', '800', { idType: 'AADHAAR', idNumber: '1234 5678 9012' });
  expect(mason.workerNo).toBe('W-0001');
  expect(mason.idNumber).toBe('XXXX-XXXX-9012');
  expect(mason.effectiveOtRate).toBe('100.00');
  const helper = await add('Dukhi Nayak', 'Helper', '600');
  const gone = await add('Rabi Mallick', 'Helper', '600');
  await api(owner, `/workers/${gone.id}`, { method: 'PATCH', body: { leftOn: shift(today, -1) } });

  await signIn(page, email);
  await page.goto(`/projects/${project.id}?tab=attendance`);
  await page.locator('.attendance-tabs').getByRole('tab', { name: 'Workers' }).click();
  await page.getByRole('button', { name: 'New worker' }).click();
  const form = page.locator('.ant-drawer-open').filter({ hasText: 'New worker' });
  await form.getByLabel('Name', { exact: true }).fill('Sania Barik');
  await form.getByLabel('Labour contractor').fill('Kalia Contractors');
  await form.getByLabel('Trade').fill('Helper');
  await form.getByRole('spinbutton', { name: /^Daily wage/ }).fill('600');
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Worker W-0004 added')).toBeVisible();
  await expect(page.locator('.worker-list tr').filter({ hasText: 'Sania Barik' })).toContainText('Kalia Contractors');

  await page.locator('.attendance-tabs').getByRole('tab', { name: 'Roll call' }).click();
  const roll = page.locator('.roll-call');
  const row = (name: string) => roll.locator('tr').filter({ hasText: name });
  await expect(row('Bhagaban Sahu')).toBeVisible();
  await expect(row('Rabi Mallick')).toHaveCount(0);
  await row('Bhagaban Sahu').locator('.roll-mark label').filter({ hasText: /^P$/ }).click();
  await row('Bhagaban Sahu').getByLabel('In', { exact: true }).fill('08:00');
  await row('Bhagaban Sahu').getByLabel('Out', { exact: true }).fill('19:00');
  await row('Dukhi Nayak').locator('.roll-mark label').filter({ hasText: /^H$/ }).click();
  await row('Sania Barik').locator('.roll-mark label').filter({ hasText: /^A$/ }).click();
  await roll.getByRole('button', { name: /Save roll call/ }).click();
  await expect(page.getByText('Roll call saved. Head count for the day: 3')).toBeVisible();
  await expect(roll.locator('.roll-call-summary')).toContainText('1 present · 1 half day · 1 absent');

  const saved = await api<RollCall>(owner, `/workers/roll-call?projectId=${project.id}&date=${today}`);
  expect(saved.rows.find((r) => r.name === 'Bhagaban Sahu')?.otHours).toBe('2');
  const day = await api<{ sheet: { lines: Line[] } }>(owner, `/attendance/day?projectId=${project.id}&date=${today}`);
  expect(day.sheet.lines.map((l) => `${l.contractor}/${l.category}/${l.count}`).sort()).toEqual(['Departmental/Supervisor/1', 'Kalia Contractors/Helper/1', 'Kalia Contractors/Mason/1']);

  // Tag the mason's day to the brickwork; output per man-day counts it.
  await api(owner, '/workers/roll-call', { method: 'PUT', body: { projectId: project.id, date: today, entries: [{ workerId: mason.id, status: 'PRESENT', inTime: '08:00', outTime: '19:00', activityId: act.id }] } });
  const output = await api<{ rows: { activityName: string; manDays: number }[]; untaggedManDays: number }>(owner, `/workers/output?projectId=${project.id}&from=${shift(today, -6)}&to=${today}`);
  expect(output.rows).toEqual([expect.objectContaining({ activityName: 'Brickwork', manDays: 1 })]);
  expect(output.untaggedManDays).toBe(0.5);

  // The muster: 1 day at ₹800 plus 2 hours at ₹100, and half a day at ₹600.
  await page.locator('.attendance-tabs').getByRole('tab', { name: 'Muster and output' }).click();
  await expect(page.locator('.muster-table tr').filter({ hasText: 'Bhagaban Sahu' })).toContainText('₹ 1,000');
  await expect(page.locator('.muster-summary')).toContainText('₹ 1,300');
  await expect(page.locator('.output-table')).toContainText('Brickwork');

  await expect(api(owner, '/workers/roll-call', { method: 'PUT', body: { projectId: project.id, date: shift(today, 1), entries: [] } })).rejects.toThrow(/400/);
  await expect(api(owner, `/workers/${mason.id}`, { method: 'DELETE' })).rejects.toThrow(/409/);
});

test('quantity surveyors see the register but cannot mark the roll call', async () => {
  const qs = await apiToken('qs@demo.com');
  const road = (await api<{ items: { id: string; code: string }[] }>(qs, '/projects')).items.find((p) => p.code === 'RD-2026-01')!;
  const today = localToday();
  const roll = await api<RollCall>(qs, `/workers/roll-call?projectId=${road.id}&date=${today}`);
  expect(roll.rows.length).toBeGreaterThan(0);
  await expect(api(qs, '/workers/roll-call', { method: 'PUT', body: { projectId: road.id, date: today, entries: [] } })).rejects.toThrow(/403/);
  await expect(api(await apiToken('store@demo.com'), `/workers?projectId=${road.id}`)).rejects.toThrow(/403/);
});
