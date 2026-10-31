import { expect, test } from '@playwright/test';
import { API_URL, api, apiToken, chooseOption, localToday, signIn } from './helpers';

type Revision = { revision: number; outcome: string | null; comments: string | null };
type Approval = { id: string; marNo: string; status: string; revision: number; make: string; revisions: Revision[]; approvedMakeId: string | null; canRecord: boolean; canResubmit: boolean };
type Make = { id: string; material: string; make: string; source: string; approvalId: string | null };
type Warning = { index: number; reason: string; approved: string[]; pendingMarNo: string | null };
type Project = { id: string; code: string };

const call = (token: string, method: string, path: string, body?: unknown) =>
  fetch(`${API_URL}${path}`, { method, headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });

async function hospital(token: string) {
  const projects = await api<{ items: Project[] } | Project[]>(token, '/projects?pageSize=100');
  return (Array.isArray(projects) ? projects : projects.items).find((p) => p.code === 'BL-2026-02')!;
}

/**
 * Material approvals: the QA/QC engineer asks the PMC to approve a make, records that it came back to
 * revise, resubmits it as R1 in another make, and records the approval; the make is then on the project's approved makes.
 */
test('a make is requested, sent back, resubmitted as R1 and approved onto the project’s list', async ({ page }) => {
  const material = `E2E tile adhesive ${Date.now()}`;

  await signIn(page, 'qaqc@demo.com');
  await page.goto('/material-approvals');
  await expect(page.getByRole('heading', { level: 1, name: 'Material approvals' })).toBeVisible();
  await page.getByRole('button', { name: 'Request approval' }).first().click();
  const form = page.locator('.ant-drawer-open').filter({ hasText: 'Request material approval' });
  await chooseOption(form.getByLabel('Project'), 'BL-2026-02');
  await form.getByLabel('Material', { exact: true }).fill(material);
  await form.getByLabel('Make', { exact: true }).fill('Roff');
  await form.getByLabel('Model, grade or range').fill('Ultrabond, type 1');
  await form.getByLabel('To', { exact: true }).fill('Lakshmi Menon, PMC');
  await form.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText(/Request MAR-\d{4}-\d{4} saved as a draft/)).toBeVisible();
  await expect(page).toHaveURL(/\/material-approvals\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1, name: material })).toBeVisible();

  // Submit R0.
  await page.getByRole('button', { name: 'Submit' }).click();
  const submit = page.locator('.ant-modal').filter({ hasText: 'Submit for approval' });
  await submit.getByLabel('Covering note').fill('Data sheet and a 20 kg bag at the PMC office.');
  await submit.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(page.getByText(/R0 sent to Lakshmi Menon, PMC/)).toBeVisible();
  await expect(page.locator('.ant-tag').filter({ hasText: /^Under review$/ }).first()).toBeVisible();

  // It comes back to revise.
  await page.getByRole('button', { name: 'Record outcome' }).click();
  const review = page.locator('.ant-modal').filter({ hasText: 'Record the outcome of R0' });
  await review.getByLabel('Outcome').click();
  await page.locator('.ant-select-dropdown:visible').getByText('Revise and resubmit', { exact: true }).click();
  await review.getByRole('button', { name: 'Record' }).click();
  await expect(review.getByText('Write the reviewer’s comments', { exact: true })).toBeVisible();
  await review.getByLabel('Reviewer’s comments').fill('Use a type 2 adhesive for the large tiles.');
  await review.getByRole('button', { name: 'Record' }).click();
  await expect(page.getByText('Back with us to revise and resubmit.')).toBeVisible();

  // R1 in another make.
  await page.getByRole('button', { name: 'Resubmit as R1' }).click();
  const again = page.locator('.ant-modal').filter({ hasText: 'Resubmit as R1' });
  await again.getByLabel('Make', { exact: true }).fill('MYK Laticrete');
  await again.getByLabel('Model, grade or range').fill('335, type 2');
  await again.getByLabel('What changed').fill('Type 2 adhesive, as asked.');
  await again.getByRole('button', { name: 'Resubmit' }).click();
  await expect(page.getByText(/R1 sent to Lakshmi Menon, PMC/)).toBeVisible();

  await page.getByRole('button', { name: 'Record outcome' }).click();
  const approve = page.locator('.ant-modal').filter({ hasText: 'Record the outcome of R1' });
  await approve.getByLabel('Outcome').click();
  await page.locator('.ant-select-dropdown:visible').getByText('Approved', { exact: true }).click();
  await approve.getByLabel('Letter or mail reference').fill('PMC/MA/E2E');
  await approve.getByRole('button', { name: 'Record' }).click();
  await expect(page.getByText(`MYK Laticrete is an approved make for ${material} on BL-2026-02.`)).toBeVisible();
  await expect(page.getByText('R1, submitted')).toBeVisible();
  await expect(page.getByText('R0, submitted')).toBeVisible();

  // It is on the project's approved makes.
  await page.goto(`/material-approvals?view=makes&q=${encodeURIComponent(material)}`);
  await expect(page.getByRole('tab', { name: 'Approved makes', selected: true })).toBeVisible();
  await expect(page.getByText('MYK Laticrete').first()).toBeVisible();
  await expect(page.getByText('Approved on request').first()).toBeVisible();
});

/**
 * The rules through the API: an outcome only on a request under review, comments for anything but a plain approval,
 * order lines checked against the approved makes (a make under review named), and only those who keep the list
 * changing it, never a make approved on a request.
 */
test('outcomes, the order line check and the approved makes follow the rules', async () => {
  const qaqc = await apiToken('qaqc@demo.com');
  const md = await apiToken('md@demo.com');
  const qs = await apiToken('qs@demo.com');
  const bl = await hospital(qaqc);
  const today = localToday();
  const material = `E2E grout ${Date.now()}`;

  // The contract lists one make; a guest of the client sees nothing here.
  const listed = await call(md, 'POST', '/material-approvals/makes', { projectId: bl.id, material, make: 'Ardex', note: 'E2E' });
  expect(listed.status).toBe(201);
  const contractMake = (await listed.json()) as Make;
  expect((await call(qs, 'POST', '/material-approvals/makes', { projectId: bl.id, material, make: 'Bostik' })).status).toBe(403);
  expect((await call(await apiToken('pmc@demo.com'), 'GET', '/material-approvals')).status).toBe(403);

  // A draft gets no outcome; once under review, revise needs comments.
  const created = await call(qaqc, 'POST', '/material-approvals', { projectId: bl.id, material, make: 'Fosroc', toParty: 'PMC' });
  expect(created.status).toBe(201);
  const a = (await created.json()) as Approval;
  expect((await call(qaqc, 'POST', `/material-approvals/${a.id}/review`, { outcome: 'APPROVED', reviewedOn: today })).status).toBe(400);
  expect((await call(qaqc, 'POST', `/material-approvals/${a.id}/submit`, { submittedOn: today })).status).toBe(201);
  expect((await call(qaqc, 'POST', `/material-approvals/${a.id}/review`, { outcome: 'REVISE_RESUBMIT', reviewedOn: today })).status).toBe(400);
  expect((await call(qaqc, 'PATCH', `/material-approvals/${a.id}`, { make: 'Sika' })).status).toBe(409);

  // An order line in the requested make is flagged, naming the request under review; the listed make passes.
  const check = async () =>
    (await (await call(qaqc, 'POST', '/material-approvals/make-check', { projectId: bl.id, lines: [{ itemName: material, make: 'Ardex' }, { itemName: material, make: 'Fosroc' }, { itemName: material }] })).json()) as Warning[];
  const before = await check();
  expect(before.map((w) => [w.index, w.reason, w.pendingMarNo])).toEqual([
    [1, 'NOT_APPROVED', a.marNo],
    [2, 'NO_MAKE', null],
  ]);

  // Approved as noted: the make joins the list and the line passes; that make cannot be removed by hand.
  const noted = await call(qaqc, 'POST', `/material-approvals/${a.id}/review`, { outcome: 'APPROVED_AS_NOTED', reviewedOn: today, comments: 'Grey shade only' });
  expect(noted.status).toBe(201);
  const done = (await noted.json()) as Approval;
  expect(done.status).toBe('APPROVED_AS_NOTED');
  expect(done.approvedMakeId).toBeTruthy();
  expect((await check()).map((w) => w.index)).toEqual([2]);
  expect((await call(md, 'DELETE', `/material-approvals/makes/${done.approvedMakeId}`)).status).toBe(409);
  expect((await call(qaqc, 'POST', `/material-approvals/${a.id}/submit`, { submittedOn: today })).status).toBe(400);
  expect((await call(qaqc, 'DELETE', `/material-approvals/${a.id}`)).status).toBe(409);

  // The contract's make comes off the list.
  expect((await call(md, 'DELETE', `/material-approvals/makes/${contractMake.id}`)).status).toBe(200);
  const makes = await api<Make[]>(qaqc, `/material-approvals/makes?q=${encodeURIComponent(material)}`);
  expect(makes.map((m) => [m.make, m.source])).toEqual([['Fosroc', 'APPROVAL']]);
});
