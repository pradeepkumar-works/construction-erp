import { expect, test } from '@playwright/test';
import { api, apiToken, chooseOption, signIn, uniqueQty } from './helpers';

interface Page<T> {
  items: T[];
}
type Project = { id: string; code: string };
type Activity = { id: string; name: string };
type Entry = { id: string; activityId: string; floor: string | null; chainageFrom: number | null; chainageTo: number | null; location: string | null };
type Sector = {
  strip: { name: string; coveredM: number; pendingM: number; segments: { entryId: string; status: string }[] }[] | null;
  matrix: { rows: string[]; cells: { row: string; activityId: string; pendingQty: string }[] } | null;
  pipeline: { stages: { laidM: string; testedM: string }; villages: { village: string; laidM: string }[] } | null;
};

const project = async (token: string, code: string) => (await api<Page<Project>>(token, '/projects?pageSize=100')).items.find((p) => p.code === code)!;

/** Sector progress views (v4 item 41): the road strip chart, the building floor matrix and the water pipeline. */
test('road progress placed by chainage shows on the strip, and chainage off the road is refused', async ({ page }) => {
  const engineer = await apiToken('engineer@demo.com');
  const road = await project(engineer, 'RD-2026-01');
  const gsb = (await api<Activity[]>(engineer, `/projects/${road.id}/activities`)).find((a) => a.name === 'GSB laying')!;
  const entry = await api<Entry>(engineer, '/progress', { method: 'POST', body: { projectId: road.id, activityId: gsb.id, date: new Date().toISOString().slice(0, 10), quantity: uniqueQty(), chainageFrom: 26100, chainageTo: 26400 } });
  expect(entry.location).toBe('Ch 26+100 to 26+400');
  await expect(api(engineer, '/progress', { method: 'POST', body: { projectId: road.id, activityId: gsb.id, date: new Date().toISOString().slice(0, 10), quantity: '1', chainageFrom: 30000 } })).rejects.toThrow(/400.*outside the project/);

  const sector = await api<Sector>(engineer, `/projects/${road.id}/sector-progress`);
  const layer = sector.strip!.find((l) => l.name === 'GSB laying')!;
  expect(layer.segments.some((s) => s.entryId === entry.id && s.status === 'SUBMITTED')).toBe(true);
  expect(layer.pendingM).toBeGreaterThanOrEqual(300);

  await signIn(page, 'pm@demo.com');
  await page.goto(`/projects/${road.id}?tab=sector`);
  const row = page.locator('.strip-row[data-activity="GSB laying"]');
  await expect(row).toBeVisible();
  await expect(row.locator('.strip-approved').first()).toBeVisible();
  await expect(row.locator('.strip-submitted')).not.toHaveCount(0);
  await page.locator('.chainage-strip').screenshot({ path: 'test-results/sector-road.png' });

  // Out of the way: rejected entries leave the strip.
  await api(await apiToken('pm@demo.com'), `/approvals/progress/${entry.id}/review`, { method: 'POST', body: { decision: 'REJECT', note: 'E2E clean-up' } });
});

test('a building entry tagged with a floor fills the floor matrix', async ({ page }) => {
  const engineer = await apiToken('engineer2@demo.com');
  const hospital = await project(engineer, 'BL-2026-02');
  const qty = uniqueQty();

  await signIn(page, 'engineer2@demo.com');
  await page.goto(`/projects/${hospital.id}?tab=progress`);
  await page.getByRole('button', { name: 'New progress entry' }).click();
  const modal = page.locator('.ant-modal').filter({ hasText: 'New progress entry' });
  await chooseOption(modal.getByLabel('Activity'), 'Brick masonry');
  await modal.getByLabel(/Quantity done/).fill(qty);
  await chooseOption(modal.getByLabel('Floor'), 'First floor');
  await modal.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText('Progress entry submitted for approval')).toBeVisible();

  const mine = (await api<Page<Entry & { quantity: string }>>(engineer, `/progress?projectId=${hospital.id}&mine=true&status=SUBMITTED&pageSize=50`)).items.find((e) => Number(e.quantity) === Number(qty))!;
  expect(mine.floor).toBe('First floor');
  expect(mine.location).toBe('First floor');

  await page.goto(`/projects/${hospital.id}?tab=sector`);
  const matrix = page.locator('.sector-matrix');
  await expect(matrix.getByRole('row', { name: /^Foundation/ })).toContainText('3,200');
  await expect(matrix.getByRole('row', { name: /^First floor/ })).toContainText('waiting');
  await page.locator('.sector-panel').screenshot({ path: 'test-results/sector-building.png' });

  await api(await apiToken('pm2@demo.com'), `/approvals/progress/${mine.id}/review`, { method: 'POST', body: { decision: 'REJECT', note: 'E2E clean-up' } });

  // A floor the project does not have is refused.
  const draft = await api<Entry>(engineer, '/progress', { method: 'POST', body: { projectId: hospital.id, activityId: mine.activityId, date: new Date().toISOString().slice(0, 10), quantity: '1', submit: false } });
  await expect(api(engineer, `/progress/${draft.id}`, { method: 'PATCH', body: { floor: 'Basement 3' } })).rejects.toThrow(/400.*not one of the project's floors/);
  await api(engineer, `/progress/${draft.id}`, { method: 'DELETE' });
});

test('water supply shows pipe laid and tested by village, and sector settings save', async ({ page }) => {
  const pm = await apiToken('pm@demo.com');
  const scheme = await project(pm, 'WS-2026-03');
  const sector = await api<Sector>(pm, `/projects/${scheme.id}/sector-progress`);
  expect(Number(sector.pipeline!.stages.laidM)).toBeGreaterThan(0);
  expect(Number(sector.pipeline!.stages.testedM)).toBeGreaterThan(0);
  expect(sector.pipeline!.villages.find((v) => v.village === 'Barabati')!.laidM).not.toBe('0');

  await signIn(page, 'pm@demo.com');
  await page.goto(`/projects/${scheme.id}?tab=sector`);
  await expect(page.locator('.village-pipeline').getByRole('row', { name: /Barabati/ })).toBeVisible();
  await expect(page.locator('.stage-testedM')).toContainText('Tested');
  await page.locator('.sector-panel').screenshot({ path: 'test-results/sector-water.png' });

  const village = `E2E Pada ${Date.now() % 10000}`;
  await page.getByRole('button', { name: 'Set villages' }).click();
  const modal = page.locator('.ant-modal').filter({ hasText: 'Set villages' });
  await modal.getByLabel('Villages').fill(village);
  await modal.getByLabel('Villages').press('Enter');
  await modal.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Villages saved')).toBeVisible();
  await expect(page.locator('.village-pipeline').getByRole('row', { name: new RegExp(village) })).toBeVisible();

  const after = await api<{ villages: string[] }>(pm, `/projects/${scheme.id}`);
  expect(after.villages).toContain(village);
  await api(pm, `/projects/${scheme.id}`, { method: 'PATCH', body: { villages: after.villages.filter((v) => v !== village) } });
});
