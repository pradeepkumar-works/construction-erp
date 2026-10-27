import { expect, test } from '@playwright/test';
import { api, apiToken } from './helpers';

type Day = { date: string; dprStatus: string | null; locked: boolean; lockedByRun: string | null; sheet: { id: string } | null };

/**
 * Attendance first (finding 7 of the October review): the site often sends the DPR before the head count, so a day's
 * attendance stays open after its DPR is approved and locks only when payroll for the month is approved.
 */
test('attendance stays open after the DPR is approved and locks with the month’s payroll', async () => {
  const engineer = await apiToken('engineer@demo.com');
  const admin = await apiToken('admin@demo.com');
  const road = (await api<{ items: { id: string; code: string }[] }>(engineer, '/projects')).items.find((p) => p.code === 'RD-2026-01')!;

  const approved = (await api<{ items: { date: string }[] }>(engineer, `/dpr?projectId=${road.id}&status=APPROVED&pageSize=1`)).items[0];
  const open = await api<Day>(engineer, `/attendance/day?projectId=${road.id}&date=${approved.date}`);
  expect(open.dprStatus).toBe('APPROVED');
  expect(open.locked).toBe(false);
  if (open.sheet) {
    await api(engineer, `/attendance/${open.sheet.id}`, { method: 'PATCH', body: { remarks: 'Counted again after the DPR' } });
    await api(engineer, `/attendance/${open.sheet.id}`, { method: 'PATCH', body: { remarks: null } });
  }

  // The demo's paid salary run closes its month.
  const runs = await api<{ items: { runNo: string; month: string; status: string; projectId: string | null }[] } | { runNo: string; month: string; status: string; projectId: string | null }[]>(admin, '/payroll/runs');
  const paid = (Array.isArray(runs) ? runs : runs.items).find((r) => r.status === 'PAID' && r.projectId === null)!;
  const day = `${paid.month}-15`;
  const closed = await api<Day>(engineer, `/attendance/day?projectId=${road.id}&date=${day}`);
  expect([closed.locked, closed.lockedByRun]).toEqual([true, paid.runNo]);
  await expect(api(engineer, '/attendance', { method: 'POST', body: { projectId: road.id, date: day, lines: [{ contractor: 'Departmental', category: 'Mason', count: 4 }] } })).rejects.toThrow(/409/);
});
