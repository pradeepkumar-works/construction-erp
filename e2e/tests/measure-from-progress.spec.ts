import { expect, test } from '@playwright/test';
import { API_URL, PASSWORD, api, apiToken, signIn } from './helpers';

type Project = { id: string };
type Activity = { id: string };
type Progress = { id: string };
type Sheet = { id: string; mbNo: string; totalQty: string; location: string; remarks: string | null; lines: { description: string; nos: string | null }[] };
interface Page<T> {
  items: T[];
}

/**
 * Measure from progress (finding 14 of the October review): the quantities the site got approved on its daily reports
 * were read off them and typed into the measurement book again. The book now offers the approved days no sheet holds
 * yet, and starts a sheet with them as its lines.
 */
test('the book offers the approved days, and a sheet starts from them', async ({ page }) => {
  const stamp = Date.now();
  const email = `measure-${stamp}@e2e.test`;
  const res = await fetch(`${API_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ organizationName: `E2E Measure ${stamp}`, fullName: 'Asha Surveyor', email, password: PASSWORD }),
  });
  expect(res.ok).toBe(true);
  const owner = await apiToken(email);

  const project = await api<Project>(owner, '/projects', {
    method: 'POST',
    body: { code: 'MFP-01', name: 'E2E measurement package', type: 'ROAD', startDate: '2026-09-01', endDate: '2027-08-31' },
  });
  const item = await api<{ id: string }>(owner, `/projects/${project.id}/boq`, {
    method: 'POST',
    body: { itemNo: '1.01', description: 'Earthwork in embankment with borrowed earth', unit: 'Cum', rate: '245', originalQty: '18500' },
  });
  const activity = await api<Activity>(owner, `/projects/${project.id}/activities`, {
    method: 'POST',
    body: { name: 'Earthwork in embankment', unit: 'Cum', plannedQty: '18500', boqItemId: item.id },
  });
  // Three days approved on site, in the same reach so the sheet knows where it was measured.
  const days: [string, string][] = [
    ['2026-10-05', '120'],
    ['2026-10-06', '80'],
    ['2026-10-07', '100'],
  ];
  const approvedDay = async (date: string, quantity: string, location: string) => {
    const dpr = await api<Progress>(owner, '/dpr', {
      method: 'POST',
      body: { projectId: project.id, date, lines: [{ activityId: activity.id, quantity, location }] },
    });
    await api(owner, `/approvals/dpr/${dpr.id}/review`, { method: 'POST', body: { decision: 'APPROVE' } });
  };
  for (const [date, quantity] of days) await approvedDay(date, quantity, 'Km 2+000 to 2+700 LHS');

  await signIn(page, email);
  await page.goto(`/projects/${project.id}?tab=mb`);
  await page.getByRole('button', { name: 'Measure from progress' }).click();
  const offer = page.getByRole('dialog', { name: 'Measure from progress' });
  const row = offer.getByRole('row', { name: /Earthwork in embankment/ });
  // 300 Cum approved and nothing measured, over three days.
  await expect(row).toContainText('300 Cum');
  await expect(row).toContainText('3 approved days');
  await row.getByRole('button', { name: 'Start sheet' }).click();

  // The sheet opens with a line per approved day, where the days say, and the days' total.
  const form = page.getByRole('dialog', { name: 'New measurement' });
  await expect(form.getByLabel('Location')).toHaveValue('Km 2+000 to 2+700 LHS');
  await expect(form.getByLabel('Line 1 description')).toHaveValue(/05 Oct 2026 · Km 2\+000 to 2\+700 LHS · Earthwork in embankment/);
  await expect(form.getByLabel('Line 3 nos')).toHaveValue('100');
  await expect(form).toContainText('Total 300 Cum');
  await form.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText(/MB-\d{4}-\d{4} submitted for approval/)).toBeVisible();

  const sheets = (await api<Page<Sheet>>(owner, `/measurements?projectId=${project.id}&pageSize=10`)).items;
  expect(sheets).toHaveLength(1);
  expect(Number(sheets[0].totalQty)).toBe(300);
  expect(sheets[0].lines).toHaveLength(3);
  expect(sheets[0].remarks).toContain('Measured from approved progress, 05 Oct 2026 to 07 Oct 2026 (3 days)');

  // Measured now, so the offer is down to nothing; a fourth day brings back only that day.
  expect(await api<unknown[]>(owner, `/measurements/to-measure?projectId=${project.id}`)).toEqual([]);
  await approvedDay('2026-10-08', '60', 'Km 2+700 to 2+900 LHS');
  const left = await api<{ toMeasureQty: string; entries: { date: string }[] }[]>(owner, `/measurements/to-measure?projectId=${project.id}`);
  expect(left).toHaveLength(1);
  expect([Number(left[0].toMeasureQty), left[0].entries.map((e) => e.date)]).toEqual([60, ['2026-10-08']]);
});
