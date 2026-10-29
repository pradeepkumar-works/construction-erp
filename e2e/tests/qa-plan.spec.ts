import { expect, test } from '@playwright/test';
import { api, apiToken, localToday, signIn } from './helpers';

type Pour = { id: string; pourNo: string; projectId: string; activityId: string; status: string; cubeSetsDue: number; flags: string[]; cardPassed: boolean };
type Due = { rows: { line: { id: string; testType: string; projectId: string }; required: number; taken: number; short: number }[]; required: number; taken: number };
type Cubes = { projectName: string; grade: string; results: unknown[]; acceptance: { verdict: string; meanNeeded: number; individualMin: number } }[];

/**
 * QA/QC part 1 (item 137): the building's project manager plans a pour, records it poured without a passed card, and
 * the register flags it and counts the cube sets IS 456 asks for; the building's M25 cubes are checked against Table 11;
 * tests due add up; a site engineer cannot change the quality plan.
 */
test('a pour poured without its card is flagged, cubes are checked by IS 456 and tests due add up', async ({ page }) => {
  const location = `E2E slab ${Date.now()}`;
  const pm = await apiToken('pm2@demo.com');
  const seeded = (await api<{ items: Pour[] }>(pm, '/qa/pours?pageSize=50')).items;
  expect(seeded.length).toBeGreaterThan(0);
  const { projectId, activityId } = seeded[0];

  const pour = await api<Pour>(pm, '/qa/pours', { method: 'POST', body: { projectId, activityId, date: localToday(), location, grade: 'M25', plannedVolume: '12' } });
  expect(pour).toMatchObject({ status: 'PLANNED', cubeSetsDue: 2, flags: [] });
  const poured = await api<Pour>(pm, `/qa/pours/${pour.id}/poured`, { method: 'POST', body: { volume: '12.5' } });
  expect(poured.status).toBe('POURED');
  expect(poured.flags).toEqual(expect.arrayContaining(['NO_CARD', 'CUBES_SHORT']));

  // M25 with Table 8's SD of 4: the mean of four needs max(25 + 0.825 × 4 = 28.3 → 28.5, 28), each result 22.
  const cubes = await api<Cubes>(pm, `/qa/cubes?projectId=${projectId}`);
  const m25 = cubes.find((c) => c.grade === 'M25');
  expect(m25?.results.length).toBeGreaterThan(0);
  expect(m25?.acceptance).toMatchObject({ meanNeeded: 28.5, individualMin: 22 });
  expect(['PASS', 'FAIL', 'WAITING']).toContain(m25?.acceptance.verdict);

  const due = await api<Due>(pm, `/qa/tests-due?projectId=${projectId}`);
  expect(due.rows.length).toBeGreaterThan(0);
  expect(due.required).toBe(due.rows.reduce((s, r) => s + r.required, 0));

  // Plan lines are the QA/QC engineer's and the managers'.
  const engineer = await apiToken('engineer@demo.com');
  await expect(api(engineer, '/qa/plan-lines', { method: 'POST', body: { projectId, testType: 'CUBE', source: 'WORK', frequency: 'IS456', grade: 'M30' } })).rejects.toThrow(/403/);

  await signIn(page, 'pm2@demo.com');
  await page.goto('/pours');
  await expect(page.getByRole('heading', { name: 'Pour register', level: 1 })).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: location });
  await expect(row).toBeVisible();
  await expect(row.getByText('Poured without a passed card')).toBeVisible();

  await page.goto('/tests-due');
  await expect(page.getByRole('heading', { name: 'Tests due', level: 1 })).toBeVisible();
});
