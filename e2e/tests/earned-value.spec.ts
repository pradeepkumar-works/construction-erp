import { expect, test } from '@playwright/test';
import { API_URL, api, apiToken, openProjectTab, signIn } from './helpers';

type Point = { month: string; pv: string; ev: string | null; ac: string | null };
type EarnedValue = {
  basis: string;
  bacSource: string;
  bac: string;
  pv: string;
  ev: string;
  ac: string;
  sv: string;
  cv: string;
  spi: number | null;
  cpi: number | null;
  eac: string | null;
  plannedFinish: string | null;
  forecastFinish: string | null;
  daysLate: number | null;
  curve: Point[];
  activities: { name: string; sv: string }[];
};

const n = Number;
const call = (token: string, path: string) => fetch(`${API_URL}${path}`, { headers: { authorization: `Bearer ${token}` } });

/**
 * Earned value on the demo hospital, which has a cost budget, a baseline and approved progress behind plan:
 * the figures hang together (variances, indices, the S-curve ending on today's values, activities furthest behind first),
 * the tab shows them and switches to measured work, and only people who see cost get them.
 */
test('the hospital’s earned value hangs together and shows on its own tab', async ({ page }) => {
  const md = await apiToken('md@demo.com');
  const hospital = (await api<{ items: { id: string; code: string }[] }>(md, '/projects')).items.find((p) => p.code === 'BL-2026-02')!;
  const ev = await api<EarnedValue>(md, `/cost/projects/${hospital.id}/earned-value`);
  expect(ev.basis).toBe('PROGRESS');
  expect(ev.bacSource).toBe('HEADS');
  expect(n(ev.sv)).toBeCloseTo(n(ev.ev) - n(ev.pv), 1);
  expect(n(ev.cv)).toBeCloseTo(n(ev.ev) - n(ev.ac), 1);
  expect(ev.spi).toBeCloseTo(n(ev.ev) / n(ev.pv), 2);
  expect(ev.cpi).toBeCloseTo(n(ev.ev) / n(ev.ac), 2);
  // Behind plan: the finish the pace points to is after the planned one.
  expect(ev.spi!).toBeLessThan(1);
  expect(ev.daysLate!).toBeGreaterThan(0);
  expect(ev.forecastFinish! > ev.plannedFinish!).toBe(true);
  // The S-curve's last month with figures is today's, and planned value climbs to the budget.
  const done = ev.curve.filter((p) => p.ev !== null);
  expect(n(done.at(-1)!.ev)).toBeCloseTo(n(ev.ev), 0);
  expect(n(done.at(-1)!.pv)).toBeCloseTo(n(ev.pv), 0);
  expect(n(ev.curve.at(-1)!.pv)).toBeCloseTo(n(ev.bac), 0);
  for (let i = 1; i < ev.curve.length; i++) expect(n(ev.curve[i].pv)).toBeGreaterThanOrEqual(n(ev.curve[i - 1].pv));
  // Furthest behind first.
  const svs = ev.activities.map((a) => n(a.sv));
  expect(svs).toEqual([...svs].sort((a, b) => a - b));
  expect(svs[0]).toBeLessThan(0);

  const measured = await api<EarnedValue>(md, `/cost/projects/${hospital.id}/earned-value?basis=MEASURED`);
  expect(measured.basis).toBe('MEASURED');
  expect(measured.pv).toBe(ev.pv);
  expect((await call(md, `/cost/projects/${hospital.id}/earned-value?basis=GUESS`)).status).toBe(400);

  await signIn(page, 'md@demo.com');
  await page.goto(`/projects/${hospital.id}`);
  await openProjectTab(page, 'Money', 'Earned value');
  await expect(page).toHaveURL(/tab=earned-value/);
  await expect(page.getByText('Schedule (SPI)')).toBeVisible();
  await expect(page.getByText(ev.spi!.toFixed(2), { exact: true }).first()).toBeVisible();
  await expect(page.getByText(`${ev.daysLate} days after the planned`)).toBeVisible();
  await expect(page.locator('.ev-activities').getByRole('row').nth(1)).toContainText(ev.activities[0].name);
  await page.getByRole('radiogroup', { name: 'Earned value from' }).getByText('Measured work').click();
  await expect(page.getByText('(measured work)')).toBeVisible();
});

test('earned value is for people who see cost', async () => {
  const pm = await apiToken('pm@demo.com');
  const road = (await api<{ items: { id: string; code: string }[] }>(pm, '/projects')).items.find((p) => p.code === 'RD-2026-01')!;
  expect((await call(pm, `/cost/projects/${road.id}/earned-value`)).status).toBe(200);
  const engineer = await apiToken('engineer@demo.com');
  expect((await call(engineer, `/cost/projects/${road.id}/earned-value`)).status).toBe(403);
});
