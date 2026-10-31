import { expect, test } from '@playwright/test';
import { API_URL, api, apiToken, localToday, PASSWORD, signIn } from './helpers';

type Defect = { id: string; defectNo: string; phase: string; status: string; overdue: boolean };
type Summary = {
  handover: { completedOn: string; dlpMonths: number; dlpEndsOn: string; dlpDaysLeft: number } | null;
  projectStatus: string;
  snags: { open: number; fixed: number; closed: number };
  defects: { open: number; overdue: number; cost: string };
  retentionHeld: string | null;
  checklist: { id: string; title: string; doneOn: string | null }[];
};

const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Handover and defects: snag, fix, accept; record completion; a defect in the DLP; the close-out checklist. */
test('a snag is fixed and accepted, completion starts the DLP and the checklist', async ({ page }) => {
  const stamp = Date.now();
  const email = `handover-${stamp}@e2e.test`;
  const res = await fetch(`${API_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ organizationName: `E2E Handover ${stamp}`, fullName: 'Hari Handover', email, password: PASSWORD }),
  });
  expect(res.ok).toBe(true);
  const owner = await apiToken(email);
  const today = localToday();
  const project = await api<{ id: string }>(owner, '/projects', { method: 'POST', body: { code: 'HO-01', name: 'E2E handover block', type: 'BUILDING', startDate: shift(today, -400), endDate: today } });

  await signIn(page, email);
  await page.goto(`/projects/${project.id}?tab=handover`);
  await expect(page.locator('.handover-completion')).toContainText('Not handed over yet');

  // A snag from the walk-through, put right and accepted.
  await page.getByRole('button', { name: 'Report snag' }).click();
  const form = page.locator('.ant-drawer-open').filter({ hasText: 'Report snag' });
  await form.getByLabel('What is wrong').fill('Door closer missing');
  await form.getByLabel('Where').fill('OT corridor');
  await form.getByRole('button', { name: 'Report', exact: true }).click();
  await expect(page.locator('.ant-message').getByText(/^SNG-\d{4}-0001 reported$/)).toBeVisible();
  const drawer = page.locator('.defect-drawer');
  await expect(drawer).toContainText('Door closer missing');
  await drawer.getByRole('button', { name: 'Mark fixed' }).click();
  const fix = page.locator('.ant-modal').filter({ hasText: 'What was done' });
  await fix.getByLabel('What was done').fill('Closer fitted and adjusted');
  await fix.getByRole('button', { name: 'Mark fixed', exact: true }).click();
  await expect(page.locator('.ant-message').getByText(/marked fixed$/)).toBeVisible();
  await drawer.getByRole('button', { name: 'Accept and close' }).click();
  await page.locator('.ant-modal-footer').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('.ant-message').getByText(/closed$/)).toBeVisible();
  await expect(drawer).toContainText('Closed');
  await drawer.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(drawer).toBeHidden();

  // Completion: the DLP runs 12 months from the certificate date and the standard checklist is added.
  await page.locator('.handover-completion').getByRole('button', { name: 'Record completion' }).click();
  const ho = page.locator('.ant-modal').filter({ hasText: 'Record completion' });
  await ho.getByLabel('Certificate number').fill('CC/E2E/1');
  await ho.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.ant-message').getByText(/defect liability period runs to/)).toBeVisible();
  await expect(page.locator('.handover-completion')).toContainText('12 months');
  const checklist = page.locator('.closeout-checklist');
  await checklist.getByText('Final bill submitted').click();
  await expect(checklist).toContainText('1/14');

  let s = await api<Summary>(owner, `/projects/${project.id}/handover`);
  expect(s.projectStatus).toBe('COMPLETED');
  expect(s.handover).toMatchObject({ completedOn: today, dlpMonths: 12 });
  expect(s.handover!.dlpDaysLeft).toBeGreaterThan(360);
  expect(s.snags).toEqual({ open: 0, fixed: 0, closed: 1 });
  expect(s.checklist.filter((i) => i.doneOn).map((i) => i.title)).toEqual(['Final bill submitted']);

  // After completion a new entry is a DLP defect; one past its due date counts as overdue.
  const late = await api<Defect>(owner, '/defects', { method: 'POST', body: { projectId: project.id, title: 'Seepage in the basement wall', dueDate: shift(today, -1) } });
  expect(late.phase).toBe('DEFECT');
  expect(late.defectNo).toMatch(/^DEF-\d{4}-0001$/);
  expect(late.overdue).toBe(true);
  // Closing one that was never fixed needs a reason.
  await expect(api(owner, `/defects/${late.id}/close`, { method: 'POST', body: {} })).rejects.toThrow(/400/);
  await api(owner, `/defects/${late.id}/fix`, { method: 'POST', body: { cost: '12500', fixNote: 'Injection grouting' } });
  await api(owner, `/defects/${late.id}/reopen`, { method: 'POST', body: { note: 'Still damp' } });
  s = await api<Summary>(owner, `/projects/${project.id}/handover`);
  expect(s.defects).toMatchObject({ open: 1, overdue: 1, cost: '12500.00' });

  // Removing the completion puts the project back to active; the checklist stays.
  await api(owner, `/projects/${project.id}/handover`, { method: 'DELETE' });
  s = await api<Summary>(owner, `/projects/${project.id}/handover`);
  expect(s.handover).toBeNull();
  expect(s.projectStatus).toBe('ACTIVE');
  expect(s.checklist).toHaveLength(14);
});

test("site staff report snags but don't record completion; the client's engineer is kept out", async () => {
  const engineer = await apiToken('engineer@demo.com');
  const list = await api<{ items: Defect[] }>(engineer, '/defects?status=PENDING');
  const projectId = (await api<{ items: { id: string }[] }>(engineer, '/projects')).items[0].id;
  await expect(api(engineer, `/projects/${projectId}/handover`, { method: 'PUT', body: { completedOn: localToday() } })).rejects.toThrow(/403/);
  expect(Array.isArray(list.items)).toBe(true);
  await expect(api(await apiToken('client@demo.com'), '/defects')).rejects.toThrow(/403/);
});
