import { expect, test } from '@playwright/test';
import { API_URL, api, apiToken, PASSWORD, signIn } from './helpers';

type Contract = { retentionPct: string; tdsPct: string; gstTdsPct: string; labourCessPct: string; defectLiabilityMonths: number | null };
type Setup = { show: boolean; done: number; total: number; steps: { key: string; done: boolean; count: number | null }[]; boqGap: { gapPct: number } | null };
type Project = { id: string; members: { userId: string }[] };

/**
 * Setting up a project: deductions start from the client's terms or the standard
 * ones, a project copies another's team and terms, the Overview's checklist ticks itself, and a BOQ far from the
 * contract value is flagged.
 */
test('a new project starts with terms, copies a team, and its checklist ticks itself', async ({ page }) => {
  const stamp = Date.now();
  const email = `setup-${stamp}@e2e.test`;
  const res = await fetch(`${API_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ organizationName: `E2E Setup ${stamp}`, fullName: 'Sunita Setup', email, password: PASSWORD }),
  });
  expect(res.ok).toBe(true);
  const owner = await apiToken(email);
  const people = await Promise.all(
    (['SITE_ENGINEER', 'STORE_MANAGER', 'QUANTITY_SURVEYOR'] as const).map((roleKey, i) =>
      api<{ id: string }>(owner, '/users', { method: 'POST', body: { email: `setup-${stamp}-${i}@e2e.test`, fullName: `Team member ${i + 1}`, roleKey, password: PASSWORD } }),
    ),
  );

  // No client: the standard deductions, not zeros.
  const first = await api<Project>(owner, '/projects', { method: 'POST', body: { code: 'SET-01', name: 'E2E first scheme', type: 'WATER_SUPPLY' } });
  const std = await api<Contract>(owner, `/projects/${first.id}/contract`);
  expect([std.retentionPct, std.tdsPct, std.gstTdsPct, std.labourCessPct].map(Number)).toEqual([5, 2, 2, 1]);

  // Several people at once; then a client with terms of its own.
  await api(owner, `/projects/${first.id}/members`, { method: 'POST', body: { userIds: people.map((p) => p.id) } });
  const client = await api<{ id: string }>(owner, '/clients', { method: 'POST', body: { name: `E2E private owner ${stamp}`, retentionPct: '10', gstTdsPct: '0', defectLiabilityMonths: 12 } });
  const own = await api<Project>(owner, '/projects', { method: 'POST', body: { code: 'SET-02', name: 'E2E private block', type: 'BUILDING', clientId: client.id } });
  const ownTerms = await api<Contract>(owner, `/projects/${own.id}/contract`);
  expect([Number(ownTerms.retentionPct), Number(ownTerms.tdsPct), Number(ownTerms.gstTdsPct), ownTerms.defectLiabilityMonths]).toEqual([10, 2, 0, 12]);

  // Copy from a project: its team and its terms.
  await api(owner, `/projects/${first.id}/contract`, { method: 'PUT', body: { retentionPct: '7.5', defectLiabilityMonths: 60 } });
  const copy = await api<Project>(owner, '/projects', { method: 'POST', body: { code: 'SET-03', name: 'E2E second scheme', type: 'WATER_SUPPLY', copyFromProjectId: first.id } });
  expect(copy.members.map((m) => m.userId).sort()).toEqual(people.map((p) => p.id).sort());
  const copied = await api<Contract>(owner, `/projects/${copy.id}/contract`);
  expect([Number(copied.retentionPct), copied.defectLiabilityMonths]).toEqual([7.5, 60]);

  // The checklist: the team is ticked; a BOQ far short of the contract value holds the BOQ step open.
  await api(owner, `/projects/${copy.id}/contract`, { method: 'PUT', body: { contractValue: '24600000', startDate: '2026-11-01', endDate: '2028-04-30' } });
  await api(owner, `/projects/${copy.id}/boq`, { method: 'POST', body: { itemNo: '1.01', description: 'DI pipe K7 150 mm, laying and jointing', unit: 'm', rate: '1296', originalQty: '10000' } });
  const setup = await api<Setup>(owner, `/projects/${copy.id}/setup`);
  expect(setup.show).toBe(true);
  const step = (key: string) => setup.steps.find((s) => s.key === key)!;
  expect(step('team').done).toBe(true);
  expect(step('dates').done).toBe(true);
  expect(step('boq').done).toBe(false);
  expect(setup.boqGap?.gapPct).toBe(-47);

  await signIn(page, email);
  await page.goto(`/projects/${copy.id}`);
  const card = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Set up this project' }) });
  await expect(card).toContainText(`${setup.done} of ${setup.total} done`);
  await expect(card.getByRole('link', { name: 'Check the BOQ against the contract value' })).toBeVisible();
  await expect(card).toContainText('47% below');
  await card.getByRole('link', { name: 'Add the activities' }).click();
  await expect(page).toHaveURL(/tab=activities/);

  // The BOQ tab says the same; the watch list carries it to the managers.
  await page.goto(`/projects/${copy.id}?tab=boq`);
  await expect(page.getByTestId('boq-gap')).toContainText('47% below');
  const watch = await api<{ open: { kind: string; projectId: string | null }[] }>(owner, '/warnings');
  expect(watch.open.some((w) => w.kind === 'BOQ_OFF_CONTRACT' && w.projectId === copy.id)).toBe(true);

  // Hidden for everyone.
  await api(owner, `/projects/${copy.id}/setup`, { method: 'PUT', body: { hidden: true } });
  expect((await api<Setup>(owner, `/projects/${copy.id}/setup`)).show).toBe(false);
});
