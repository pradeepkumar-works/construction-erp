import { expect, test } from '@playwright/test';
import { API_URL, PASSWORD, api, apiToken, signIn } from './helpers';

type Project = { id: string };
type Activity = { id: string; name: string; unit: string; plannedQty: string; boqItemId: string | null; plannedStart: string | null; plannedEnd: string | null };

/**
 * Linking activities to BOQ items and spreading them: a project made before its
 * dates were known gets its activities spread the moment the contract dates arrive, and the BOQ's sections offer the
 * links the planner used to make one by one.
 */
test('dates arriving spread the activities, and the BOQ sections offer their links', async ({ page }) => {
  const stamp = Date.now();
  const email = `links-${stamp}@e2e.test`;
  const res = await fetch(`${API_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ organizationName: `E2E Links ${stamp}`, fullName: 'Ravi Planner', email, password: PASSWORD }),
  });
  expect(res.ok).toBe(true);
  const owner = await apiToken(email);

  // A project with no dates: its template activities have none either.
  const project = await api<Project>(owner, '/projects', { method: 'POST', body: { code: 'LNK-01', name: 'E2E road package', type: 'ROAD', applyTemplate: true } });
  const undated = await api<Activity[]>(owner, `/projects/${project.id}/activities`);
  expect(undated.length).toBeGreaterThan(5);
  expect(undated.every((a) => a.plannedStart === null && a.plannedEnd === null)).toBe(true);

  // The contract's dates arrive: every activity is spread over the period.
  await api(owner, `/projects/${project.id}/contract`, { method: 'PUT', body: { startDate: '2026-11-01', endDate: '2027-10-31', contractValue: '84650000' } });
  const spread = await api<Activity[]>(owner, `/projects/${project.id}/activities`);
  expect(spread.every((a) => a.plannedStart && a.plannedEnd && a.plannedStart >= '2026-11-01' && a.plannedEnd <= '2027-10-31')).toBe(true);
  const earth = spread.find((a) => a.name === 'Earthwork embankment')!;
  const bc = spread.find((a) => a.name === 'BC paving')!;
  expect(earth.plannedStart! < bc.plannedStart!).toBe(true);

  // A BOQ whose sections are named after the activities.
  for (const item of [
    { itemNo: '1.01', description: 'Earthwork in embankment with borrowed earth', unit: 'Cum', rate: '245', originalQty: '18500', section: 'Earthwork embankment' },
    { itemNo: '1.02', description: 'Earthwork in cutting and disposal', unit: 'Cum', rate: '210', originalQty: '4000', section: 'Earthwork embankment' },
    { itemNo: '2.01', description: 'Granular sub-base, grading I', unit: 'Cum', rate: '1850', originalQty: '6400', section: 'GSB laying' },
  ])
    await api(owner, `/projects/${project.id}/boq`, { method: 'POST', body: item });

  await signIn(page, email);
  await page.goto(`/projects/${project.id}?tab=activities`);
  await page.getByRole('button', { name: /Link to BOQ \(\d+\)/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Link the activities to BOQ items' });
  // The largest item of a section stands for it, under the section's own name.
  await expect(dialog.getByRole('row', { name: /Earthwork embankment/ })).toContainText('1.01 Earthwork in embankment with borrowed earth');
  await expect(dialog.getByRole('row', { name: /Earthwork embankment/ })).toContainText('Cum');
  await dialog.getByRole('checkbox', { name: 'Link GSB laying' }).uncheck();
  await dialog.getByRole('button', { name: 'Link 1 activity' }).click();
  await expect(dialog).toBeHidden();

  const linked = await api<Activity[]>(owner, `/projects/${project.id}/activities`);
  const earthAfter = linked.find((a) => a.name === 'Earthwork embankment')!;
  expect(earthAfter.boqItemId).not.toBeNull();
  // An activity with no quantity of its own takes the item's.
  expect([Number(earthAfter.plannedQty), earthAfter.unit]).toEqual([18500, 'Cum']);
  expect(linked.find((a) => a.name === 'GSB laying')!.boqItemId).toBeNull();
});
