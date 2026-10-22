import { expect, test } from '@playwright/test';
import { API_URL, api, apiToken, chooseOption, newestFirst, queueItem, signIn } from './helpers';

type Project = { id: string; code: string };
type Activity = { id: string; name: string; holdPoint: boolean; checklistTemplateId: string | null };
type Inspection = { id: string; inspectionNo: string; status: string; checklist: { item: string; result: string | null; remark: string | null }[] };

const today = () => new Date().toISOString().slice(0, 10);
const roadProject = async (token: string) => (await api<{ items: Project[] }>(token, '/projects?pageSize=50')).items.find((p) => p.code === 'RD-2026-01')!;

/**
 * Inspections (v3 item 26): site requests one from the web, QA/QC records the checklist and sends it back for
 * re-inspection, site requests it again, and QA/QC passes it.
 */
test.describe.serial('inspection from request to pass', () => {
  const location = `E2E bay ${Date.now()}`;
  let id = '';

  test('the site engineer requests an inspection', async ({ page }) => {
    await signIn(page, 'engineer@demo.com');
    await page.getByRole('link', { name: 'Quality', exact: true }).click();
    await page.getByRole('button', { name: 'Request inspection' }).click();
    const modal = page.locator('.ant-modal').filter({ hasText: 'Request inspection' });
    await chooseOption(modal.getByLabel('Project'), 'RD-2026-01');
    await chooseOption(modal.getByLabel('Activity'), 'GSB laying');
    await expect(modal.getByLabel('Checklist').locator('..')).toContainText('GSB / WMM layer');
    await modal.getByLabel('Location').fill(location);
    await modal.getByRole('button', { name: 'Request inspection' }).click();
    await expect(page.getByText(/INS-\d{4}-\d{4} requested/)).toBeVisible();
    const qa = await apiToken('qaqc@demo.com');
    const mine = (await api<{ items: (Inspection & { location: string })[] }>(qa, `/inspections?q=${encodeURIComponent(location)}`)).items;
    expect(mine).toHaveLength(1);
    id = mine[0].id;
    expect(mine[0].status).toBe('SUBMITTED');
    expect(mine[0].checklist.length).toBeGreaterThan(0);
  });

  test('QA/QC marks a point not OK and asks for re-inspection', async ({ page }) => {
    await signIn(page, 'qaqc@demo.com');
    await page.goto('/approvals');
    await newestFirst(page);
    const entry = queueItem(page, location);
    await entry.open();
    await entry.decision.getByRole('button', { name: 'Record the checklist' }).click();
    const drawer = page.locator('.ant-drawer-open');
    await drawer.getByRole('button', { name: 'Mark the rest OK' }).click();
    await drawer.getByRole('radiogroup', { name: 'Result of Layer thickness' }).getByText('Not OK').click();
    await drawer.getByLabel('Remark on Layer thickness').fill('Short by 20 mm at the edge');
    await expect(drawer.getByRole('button', { name: 'Pass' })).toBeDisabled();
    await drawer.getByRole('button', { name: 'Re-inspect' }).click();
    await page.locator('.ant-modal').getByRole('button', { name: 'Re-inspect' }).click();
    await expect(page.getByText(/sent back for re-inspection/)).toBeVisible();
    const x = await api<Inspection>(await apiToken('qaqc@demo.com'), `/inspections/${id}`);
    expect(x.status).toBe('CHANGES_REQUESTED');
    expect(x.checklist.find((c) => c.item === 'Layer thickness')).toMatchObject({ result: 'FAIL', remark: 'Short by 20 mm at the edge' });
  });

  test('site requests it again and QA/QC passes it', async ({ page }) => {
    const eng = await apiToken('engineer@demo.com');
    await api(eng, `/inspections/${id}`, { method: 'PATCH', body: { remarks: 'Edge made up and rolled', submit: true } });
    await signIn(page, 'qaqc@demo.com');
    await page.goto('/inspections');
    await page.getByPlaceholder('Search no., location, activity').fill(location);
    await page.locator('tr').filter({ hasText: location }).getByText(location).click();
    const drawer = page.locator('.ant-drawer-open');
    await drawer.getByRole('radiogroup', { name: 'Result of Layer thickness' }).getByText('OK', { exact: true }).click();
    await drawer.getByRole('button', { name: 'Pass' }).click();
    await page.locator('.ant-modal').getByRole('button', { name: 'Pass' }).click();
    await expect(page.getByText(/INS-\d{4}-\d{4} passed/)).toBeVisible();
    await expect(drawer.locator('.ant-tag').getByText('Passed', { exact: true })).toBeVisible();
    expect((await api<Inspection>(eng, `/inspections/${id}`)).status).toBe('APPROVED');
  });
});

test('a hold point holds progress until an inspection passes there', async () => {
  const pm = await apiToken('pm@demo.com');
  const eng = await apiToken('engineer@demo.com');
  const qa = await apiToken('qaqc@demo.com');
  const project = await roadProject(pm);
  const activities = await api<Activity[]>(pm, `/projects/${project.id}/activities`);
  let hold = activities.find((a) => a.name === 'E2E hold point');
  if (!hold) hold = await api<Activity>(pm, `/projects/${project.id}/activities`, { method: 'POST', body: { name: 'E2E hold point', unit: 'Cum', plannedQty: '1000', holdPoint: true, sortOrder: 999 } });
  const at = `E2E chainage ${Date.now()}`;
  const progress = await api<{ id: string }>(eng, '/progress', { method: 'POST', body: { projectId: project.id, activityId: hold.id, date: today(), quantity: '5', location: at } });
  const blocked = await fetch(`${API_URL}/approvals/progress/${progress.id}/review`, {
    method: 'POST',
    headers: { authorization: `Bearer ${pm}`, 'content-type': 'application/json' },
    body: JSON.stringify({ decision: 'APPROVE' }),
  });
  expect(blocked.status).toBe(400);
  expect((await blocked.json()).message).toContain('hold point');

  const ins = await api<Inspection>(eng, '/inspections', { method: 'POST', body: { projectId: project.id, activityId: hold.id, date: today(), location: at.toUpperCase(), items: ['Level checked'] } });
  // Neither the generic review nor a site engineer can pass an inspection.
  const generic = await fetch(`${API_URL}/approvals/inspection/${ins.id}/review`, { method: 'POST', headers: { authorization: `Bearer ${qa}`, 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'APPROVE' }) });
  expect(generic.status).toBe(400);
  const bySite = await fetch(`${API_URL}/inspections/${ins.id}/inspect`, { method: 'POST', headers: { authorization: `Bearer ${eng}`, 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'APPROVE', results: [{ result: 'PASS' }] }) });
  expect(bySite.status).toBe(403);
  await api(qa, `/inspections/${ins.id}/inspect`, { method: 'POST', body: { decision: 'APPROVE', results: [{ result: 'PASS' }] } });

  await api(pm, `/approvals/progress/${progress.id}/review`, { method: 'POST', body: { decision: 'APPROVE' } });
});
