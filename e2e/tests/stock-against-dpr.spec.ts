import { expect, test } from '@playwright/test';
import type { DprWorkOptionsDto, ProjectKitReconDto, ProjectPipeReconDto, ProjectReconExceptionsDto, ProjectReconciliationDto, ProjectStructureReconDto } from '../../packages/shared/src';
import { api, apiToken, signIn } from './helpers';

/**
 * Stock against the DPR on the town water scheme: the seed plants one case of each kind. Cement on the
 * 400 KL tank's concrete runs over its mix, HDPE 110 is cut above the allowed wastage, more DI pipe is laid than was
 * issued, four house connections went in without a saddle issued, and the store issued cement to a tank with no work.
 * A norm set on an activity shows in the Materials view and goes again; nothing else is saved.
 */

type Project = { id: string; code: string };

test('the reports find the planted cases, and a norm can sit on an activity', async ({ page }) => {
  const qs = await apiToken('qs@demo.com');
  const engineer = await apiToken('engineer@demo.com');
  const town = (await api<{ items: Project[] }>(qs, '/projects?pageSize=100')).items.find((p) => p.code === 'WS-2026-04')!;
  const base = `/reconciliation/projects/${town.id}`;

  const materials = await api<ProjectReconciliationDto>(qs, base);
  const cement = materials.items.find((i) => i.itemName.startsWith('OPC 53'))!;
  expect(cement.usedStatus).toBe('OVER');
  expect(materials.activityNorms.some((n) => n.activityName.endsWith(': concrete'))).toBe(true);
  expect(materials.frontFrom).not.toBeNull();

  const structure = await api<ProjectStructureReconDto>(qs, `${base}/structure`);
  const tank = structure.elements.find((e) => e.label.includes('OHT 400'))!;
  expect(tank.items.find((i) => i.itemName.startsWith('OPC 53'))!.status).toBe('OVER');

  const pipe = await api<ProjectPipeReconDto>(qs, `${base}/pipe`);
  expect(pipe.sizes.find((s) => s.key === '200-DI')!.flags).toContain('LAID_ABOVE_ISSUED');
  expect(pipe.sizes.find((s) => s.key === '110-HDPE')!.flags).toContain('WASTAGE_ABOVE');

  const kits = await api<ProjectKitReconDto>(qs, `${base}/kits`);
  const tapping = kits.kits.find((k) => k.activityName === 'Tapping and saddle')!;
  expect(tapping.kitsShort).toBe(4);
  expect(tapping.components.find((c) => c.itemName.startsWith('HDPE tapping saddle'))!.status).toBe('SHORT');

  const exceptions = await api<ProjectReconExceptionsDto>(qs, `${base}/exceptions`);
  expect(new Set(exceptions.rows.map((r) => r.kind))).toEqual(new Set(['USE_WITHOUT_ISSUE', 'ISSUE_WITHOUT_WORK', 'LAID_ABOVE_ISSUED']));

  // A norm on an activity: the engineer can't set one, the QS can, and it shows with the activity's own norms.
  const options = await api<DprWorkOptionsDto>(qs, `/dpr/work-options?projectId=${town.id}`);
  const concrete = options.activities.find((a) => a.name.endsWith(': concrete') && (a.subComponentName ?? '').includes('OHT 650'))!;
  const plywood = (await api<{ items: { id: string; name: string }[] }>(qs, '/stock/items?pageSize=200')).items.find((i) => i.name.startsWith('Shuttering plywood'))!;
  const body = { activityId: concrete.id, itemId: plywood.id, qtyPerUnit: '0.05', wastagePct: '10' };
  await expect(api(engineer, `${base}/activity-norms`, { method: 'PUT', body })).rejects.toThrow(/403/);
  const saved = await api<{ id: string }>(qs, `${base}/activity-norms`, { method: 'PUT', body });
  try {
    expect((await api<ProjectReconciliationDto>(qs, base)).activityNorms.find((n) => n.id === saved.id)!.itemName).toBe(plywood.name);
  } finally {
    await api(qs, `${base}/activity-norms/${saved.id}`, { method: 'DELETE' });
  }
  expect((await api<ProjectReconciliationDto>(qs, base)).activityNorms.some((n) => n.id === saved.id)).toBe(false);

  // The views on the project's Reconciliation tab.
  await signIn(page, 'qs@demo.com');
  await page.goto(`/projects/${town.id}?tab=reconciliation&sub=structure`);
  await expect(page.getByText('Materials over the mix')).toBeVisible();
  await expect(page.getByText('No DPR work').first()).toBeVisible();
  await page.goto(`/projects/${town.id}?tab=reconciliation&sub=pipe`);
  await expect(page.getByText('Laid above issued').first()).toBeVisible();
  await page.goto(`/projects/${town.id}?tab=reconciliation&sub=kits`);
  await expect(page.getByText('4 kits short').first()).toBeVisible();
  await page.goto(`/projects/${town.id}?tab=reconciliation&sub=exceptions`);
  await expect(page.getByText('Issued with no work').first()).toBeVisible();
  await page.getByRole('link', { name: 'Open the DPR' }).first().click();
  await expect(page).toHaveURL(/\/dpr\//);
});
