import { expect, test } from '@playwright/test';
import { api, apiToken, localToday } from './helpers';

type Structure = { id: string; effectiveFrom: string; basic: string; hra: string; conveyance: string; special: string; ctcAnnual: string; note: string | null };
type Event = { id: string; letterNo: string };

/**
 * An increment changes the pay, not just the CTC on the record: a salary structure from its date, grown in step from the
 * one in force, which payroll reads. Taking the increment back takes the structure with it.
 */
test('an increment gives a new salary structure, and taking it back removes it', async () => {
  const hr = await apiToken('hr@demo.com');
  const today = localToday();
  const person = await api<{ id: string }>(hr, '/staff/employees', {
    method: 'POST',
    body: { fullName: `Increment Test ${Date.now() % 100000}`, designation: 'Site engineer', joinedOn: '2026-01-01' },
  });
  await api(hr, '/payroll/structures', { method: 'POST', body: { employeeId: person.id, effectiveFrom: '2026-01-01', basic: 20000, hra: 8000, conveyance: 1600, special: 4400 } });
  const structures = () => api<Structure[]>(hr, `/payroll/structures?employeeId=${person.id}`);
  const [first] = await structures();
  expect(Number(first.ctcAnnual)).toBeLessThan(600000);

  const inc = await api<Event>(hr, `/staff/employees/${person.id}/events`, { method: 'POST', body: { type: 'INCREMENT', effectiveDate: today, toCtc: 600000 } });
  const [next, before] = await structures();
  expect(before.id).toBe(first.id);
  expect(next.effectiveFrom).toBe(today);
  expect(Math.abs(Number(next.ctcAnnual) - 600000)).toBeLessThanOrEqual(12);
  expect(next.conveyance).toBe(first.conveyance);
  expect(Number(next.basic) / Number(next.hra)).toBeCloseTo(20000 / 8000, 1);
  expect(next.note).toBe(`Increment letter ${inc.letterNo}`);

  await api(hr, `/staff/events/${inc.id}`, { method: 'DELETE' });
  expect((await structures()).map((s) => s.id)).toEqual([first.id]);
});
