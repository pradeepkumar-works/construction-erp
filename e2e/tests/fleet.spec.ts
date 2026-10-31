import { expect, test } from '@playwright/test';
import { api, apiToken, chooseOption, formPanel, localToday, signIn } from './helpers';

interface Page<T> {
  items: T[];
}
type Project = { id: string; code: string };
type Machine = { id: string; code: string };
type FuelRow = { projectId: string; itemId: string; itemName: string; issuedToMachines: string; closing: string };
type FuelPosition = { rows: FuelRow[]; issues: { entryNo: string; equipmentCode: string | null; litres: string; meterReading: string | null }[] };
type Parts = { parts: { id: string; position: string | null; removedOn: string | null; life: string | null }[] };
type Utilisation = { rows: { code: string; utilisationPct: number | null }[] };
type Warnings = { open: { kind: string; title: string }[] };

const road = async (token: string) => (await api<Page<Project>>(token, '/projects?pageSize=100')).items.find((p) => p.code === 'RD-2026-01')!;
const machine = async (token: string, code: string) => (await api<Page<Machine>>(token, `/equipment?pageSize=100&q=${code}`)).items.find((e) => e.code === code)!;

/**
 * Fuel and fleet use (v5 item 93): the store manager puts diesel into the grader from the project's Fuel tab, and the
 * day's fuel position counts it as gone into machines.
 */
test('issue diesel into a machine and see it in the fuel position', async ({ page }) => {
  const store = await apiToken('store@demo.com');
  const project = await road(store);
  const position = () => api<FuelPosition>(store, `/fleet/fuel-position?projectId=${project.id}`);
  const seeded = (await position()).rows.find((r) => /diesel/i.test(r.itemName))!;
  // The 20 litres this test issues come in first, so the seed's own fills never leave too little and the stock ends as it began.
  const pm = await apiToken('pm@demo.com');
  await api(pm, '/stock/adjustments', { method: 'POST', body: { projectId: project.id, date: localToday(), reason: 'OTHER', remarks: 'E2E: diesel for the fuel issue', lines: [{ itemId: seeded.itemId, quantity: '20' }] } });
  const before = (await position()).rows.find((r) => r.itemId === seeded.itemId)!;
  expect(Number(before.closing)).toBeGreaterThanOrEqual(20);

  await signIn(page, 'store@demo.com');
  await page.goto(`/projects/${project.id}?tab=machinery&sub=fuel`);
  await expect(page.getByRole('heading', { name: /Fuel position on/ })).toBeVisible();
  await page.getByRole('button', { name: 'Fuel issue' }).click();
  const form = formPanel(page, 'Fuel issue');
  await chooseOption(form.getByLabel('Machine'), 'GRD-01');
  await form.getByLabel('Quantity').fill('20');
  await form.getByLabel('Hour meter').fill('2400');
  await form.getByRole('button', { name: 'Save fuel issue' }).click();
  await expect(page.getByText(/ISS-.+ saved: 20 Ltr into GRD-01/)).toBeVisible();

  const after = await position();
  const diesel = after.rows.find((r) => r.itemId === before.itemId)!;
  expect(Number(diesel.issuedToMachines)).toBeCloseTo(Number(before.issuedToMachines) + 20, 3);
  const slip = after.issues.find((i) => i.equipmentCode === 'GRD-01' && Number(i.litres) === 20 && Number(i.meterReading) === 2400)!;
  expect(slip).toBeTruthy();
  await expect(page.getByRole('row').filter({ hasText: slip.entryNo })).toBeVisible();

  // Only fuel goes in this way: cement is refused.
  const grader = await machine(store, 'GRD-01');
  const cement = (await api<Page<{ itemId: string; itemName: string }>>(store, `/stock/balances?projectId=${project.id}&pageSize=200`)).items.find((b) => /cement/i.test(b.itemName));
  if (cement)
    await expect(
      api(store, '/stock/fuel-issues', { method: 'POST', body: { projectId: project.id, date: localToday(), equipmentId: grader.id, itemId: cement.itemId, quantity: '1' } }),
    ).rejects.toThrow(/400/);
});

/** A norm set below what the excavator burns puts it on the watch list; utilisation never reads over 100%. */
test('a machine off its fuel norm is on the watch list', async ({ page }) => {
  const md = await apiToken('md@demo.com');
  const warnings = await api<Warnings>(md, '/warnings');
  expect(warnings.open.some((w) => w.kind === 'FUEL_NORM' && /^EXC-01 .+ more fuel than its norm/.test(w.title))).toBe(true);
  const use = await api<Utilisation>(md, '/fleet/utilisation');
  expect(use.rows.length).toBeGreaterThan(0);
  expect(use.rows.every((r) => r.utilisationPct === null || r.utilisationPct <= 100)).toBe(true);

  await signIn(page, 'md@demo.com');
  await page.goto('/watch-list');
  await expect(page.getByText(/EXC-01 .+ is using more fuel than its norm/)).toBeVisible();
  await page.goto('/machinery?tab=utilisation');
  await page.getByText('All time', { exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'EXC-01' })).toBeVisible();
});

/** Tyres and batteries (v5 item 93): fit a spare tyre to the grader, take it off with its reason, and see its life. */
test('fit a tyre to a machine and take it off', async ({ page }) => {
  const store = await apiToken('store@demo.com');
  const grader = await machine(store, 'GRD-01');
  const parts = () => api<Parts>(store, `/equipment/${grader.id}/parts`);
  for (const p of (await parts()).parts.filter((x) => x.position === 'Spare')) await api(store, `/equipment/${grader.id}/parts/${p.id}`, { method: 'DELETE' });

  await signIn(page, 'store@demo.com');
  await page.goto('/machinery?tab=equipment');
  await page.getByRole('button', { name: 'Tyres and batteries of GRD-01' }).click();
  const drawer = page.locator('.ant-drawer-content-wrapper').filter({ hasText: 'Tyres and batteries · GRD-01' });
  await expect(drawer.getByRole('cell', { name: /Rear right back/ }).first()).toBeVisible();
  await drawer.getByRole('button', { name: 'Fit a tyre or battery' }).click();
  const fit = formPanel(page, 'Fit to GRD-01');
  await fit.getByLabel('Position').fill('Spare');
  await fit.getByLabel('Make').fill('MRF Muscle Grip 14.00-24');
  await fit.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Tyre (Spare) fitted to GRD-01')).toBeVisible();

  await drawer.getByRole('button', { name: 'Take off Spare' }).click();
  const off = formPanel(page, 'Take off Spare');
  await off.getByLabel('Why it came off').fill('Kept back at the yard as the spare');
  await off.getByRole('button', { name: 'Take it off' }).click();
  await expect(page.getByText('Tyre (Spare) taken off GRD-01')).toBeVisible();
  const spare = (await parts()).parts.find((p) => p.position === 'Spare')!;
  expect(spare.removedOn).toBe(localToday());
  await expect(drawer.getByRole('row').filter({ hasText: 'Kept back at the yard' })).toBeVisible();

  await api(store, `/equipment/${grader.id}/parts/${spare.id}`, { method: 'DELETE' });
});
