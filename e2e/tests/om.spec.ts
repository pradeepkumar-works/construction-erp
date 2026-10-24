import { expect, test } from '@playwright/test';
import type { OmDto, RaBillDto, WatchListDto } from '../../packages/shared/src';
import { api, apiToken, axeViolations, signIn } from './helpers';

/**
 * Operation and maintenance (item 131) on the water supply scheme handed over 19 months ago: the seed gives it five
 * years of O&M paid quarterly, a reading for every day (pressure short twice in September and twice this month), the
 * staff recorded each month (a pump operator short in August), chemicals issued against their norm and six O&M bills,
 * the last a draft. Everything a test adds is removed again.
 */

type Project = { id: string; code: string };
const CODE = 'WS-2025-05';

test('daily service levels and staff drive the quarterly O&M bill of a handed-over water scheme', async ({ page }) => {
  const pm = await apiToken('pm2@demo.com');
  const qs = await apiToken('qs@demo.com');
  const engineer = await apiToken('engineer2@demo.com');
  const scheme = (await api<{ items: Project[] }>(pm, '/projects?pageSize=100')).items.find((p) => p.code === CODE)!;
  const base = `/projects/${scheme.id}/om`;

  // What the tab reads: year 2 quarter 3 running, the last quarter's draft bill with its staff short and penalty.
  const data = await api<OmDto>(pm, base);
  expect(data.handedOverOn).not.toBeNull();
  expect(data.contract!.years).toBe(5);
  expect(data.contract!.yearPcts.map(Number)).toEqual([3, 3.25, 3.5, 3.75, 4]);
  expect(data.current!.label).toBe('Year 2, quarter 3');
  const last = data.periods.find((p) => p.year === 2 && p.instalment === 2)!;
  expect(last.status).toBe('BILLED');
  expect(last.billState).toBe('Draft');
  expect(Number(last.staffDeduction)).toBe(16000);
  expect(Number(last.penalty)).toBe(5000);
  expect(data.periods.filter((p) => p.billState === 'Paid').length).toBe(5);
  expect(data.months.find((m) => m.month === data.month)!.benchmarks.find((b) => b.key === 'PRESSURE')!.failures).toBe(2);
  expect(data.chemicals.find((c) => c.itemName === 'Bleaching powder')!.status).toBe('OVER');

  // Who does what: engineers log, managers set the terms; a QS cannot.
  expect(data.canManage && data.canBill).toBe(true);
  const asEngineer = await api<OmDto>(engineer, base);
  expect(asEngineer.canLog).toBe(true);
  expect(asEngineer.canManage).toBe(false);
  await expect(api(qs, `${base}/contract`, { method: 'PUT', body: {} })).rejects.toThrow(/40[03]/);

  // A reading: not for tomorrow, not in a billed period, not more water supplied than produced.
  const day = (offset: number) => new Date(Date.parse(`${data.today}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
  const reading = { producedKl: '6500', suppliedKl: '5600', residualChlorine: '0.4', tailPressureM: '5.1', complaintsReceived: 3, complaintsClosed48h: 3 };
  await expect(api(engineer, `${base}/days`, { method: 'PUT', body: { ...reading, date: day(1) } })).rejects.toThrow(/400/);
  await expect(api(engineer, `${base}/days`, { method: 'PUT', body: { ...reading, date: last.to } })).rejects.toThrow(/409/);
  await expect(api(engineer, `${base}/days`, { method: 'PUT', body: { ...reading, date: data.today, suppliedKl: '7200' } })).rejects.toThrow(/400/);
  const logged = await api<OmDto>(engineer, `${base}/days`, { method: 'PUT', body: { ...reading, date: data.today } });
  const mine = logged.days.find((d) => d.date === data.today)!;
  expect(mine.failures).toEqual(['PRESSURE']);
  expect(logged.months.find((m) => m.month === data.today.slice(0, 7))!.benchmarks.find((b) => b.key === 'PRESSURE')!.failures).toBe(3);
  await api(engineer, `${base}/days/${mine.id}`, { method: 'DELETE' });

  // The running quarter cannot be billed yet, nor anything while the last bill is a draft.
  await expect(api(qs, '/ra-bills', { method: 'POST', body: { projectId: scheme.id, billDate: data.today, omYear: 2, omInstalment: 3 } })).rejects.toThrow(/40[09]/);

  // The draft bill: the instalment less staff short, the penalty among its deductions, no retention.
  const bill = await api<RaBillDto>(pm, `/ra-bills/${last.billId}`);
  expect(bill.billLabel).toBe('O&M bill 6');
  expect(bill.om!.label).toBe('Year 2, quarter 2');
  expect(Number(bill.grossAmount)).toBe(Number(bill.om!.instalmentAmount) - 16000);
  expect(Number(bill.deductions.find((d) => d.key === 'omPenalty')!.amount)).toBe(5000);
  expect(Number(bill.deductions.find((d) => d.key === 'retention')?.amount ?? 0)).toBe(0);
  expect(bill.om!.staff.map((l) => l.role)).toEqual(['Pump operator']);

  // The watch list tells the project manager what the running quarter is losing.
  const watch = await api<WatchListDto>(pm, '/warnings');
  expect(watch.open.some((w) => w.kind === 'OM_SERVICE' && w.projectId === scheme.id)).toBe(true);

  // On screen: the tab, its periods and the bill's O&M section.
  await signIn(page, 'pm2@demo.com');
  await page.goto(`/projects/${scheme.id}?tab=om`);
  await expect(page.getByText('Now in')).toBeVisible();
  await expect(page.getByText(/^Benchmarks in /)).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
  await page.getByText(/^Periods and bills/).click();
  await expect(page.getByRole('link', { name: 'O&M bill 6' })).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
  await page.getByText('Terms', { exact: true }).click();
  await expect(page.getByText('Service level benchmarks')).toBeVisible();
  await page.goto(`/bills/${last.billId}`);
  await expect(page.getByText('Operation and maintenance').first()).toBeVisible();
  await expect(page.getByText('Service level penalties').first()).toBeVisible();
});
