import { expect, test } from '@playwright/test';
import type { DailyReportDto, DprFormVersionsDto } from '../../packages/shared/src';
import { API_URL, api, apiToken, chooseOption, formPanel, PASSWORD, settle, signIn } from './helpers';

/**
 * The DPR form per project type (ARCHITECTURE "DPR form per project type"): an admin adds a field of
 * the company's own to the road's form, the site's report asks for it and refuses to go without it, the record shows
 * it, and the report keeps its version when the form goes back to standard. A fresh company keeps the demo data as it is.
 */
test('a field of the company’s own on the road’s DPR form, and a report keeps its version', async ({ page }) => {
  const stamp = Date.now();
  const email = `dpr-form-${stamp}@e2e.test`;
  const res = await fetch(`${API_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ organizationName: `E2E DPR form ${stamp}`, fullName: 'Dev Forms', email, password: PASSWORD }),
  });
  expect(res.ok).toBe(true);
  const owner = await apiToken(email);
  const project = await api<{ id: string }>(owner, '/projects', { method: 'POST', body: { code: 'DPF-01', name: 'E2E diaphragm wall road', type: 'ROAD' } });

  // The road starts on its standard form; the admin adds a required slurry level for the day.
  await signIn(page, email);
  await settle(page, '/project-types/ROAD?tab=dpr-form');
  await expect(page.getByText(/^The standard form of Road\./)).toBeVisible();
  await page.getByRole('button', { name: 'Edit form' }).click();
  const editor = formPanel(page, 'DPR form of Road');
  await editor.getByRole('button', { name: 'Add field' }).click();
  await editor.getByLabel('Name of field 3', { exact: true }).fill('Slurry level');
  await editor.getByLabel('Unit of field 3').fill('m');
  await editor.getByLabel('Require field 3').check();
  await editor.getByRole('button', { name: 'Save form' }).click();
  await expect(editor).toBeHidden();
  await expect(page.getByText(/^Version 1, saved/)).toBeVisible();
  const saved = await api<DprFormVersionsDto>(owner, '/project-types/ROAD/dpr-form');
  expect(saved.form.version).toBe(1);
  expect(saved.form.def.own.find((f) => f.key === 'slurryLevel')).toMatchObject({ kind: 'NUMBER', scope: 'DAY', unit: 'm', required: true });

  // The site's report asks for it, and is not sent without it.
  await page.goto('/dpr');
  await page.getByRole('button', { name: /New daily report/ }).click();
  const form = formPanel(page, 'New daily report');
  await chooseOption(form.getByLabel('Project', { exact: true }), 'E2E diaphragm wall road');
  await expect(form.getByLabel('Slurry level')).toBeVisible();
  await form.getByLabel('Work done today').fill('Guide walls cast for panels 4 to 6');
  await form.getByRole('button', { name: 'Submit DPR' }).click();
  await expect(form.getByText('Fill in Slurry level', { exact: true })).toBeVisible();
  const refused = await fetch(`${API_URL}/dpr`, {
    method: 'POST',
    headers: { authorization: `Bearer ${owner}`, 'content-type': 'application/json' },
    body: JSON.stringify({ projectId: project.id, date: '2026-10-01', workExecuted: 'Trenching' }),
  });
  expect(refused.status).toBe(400);
  expect(await refused.text()).toContain('Slurry level');

  await form.getByLabel('Slurry level').fill('2.4');
  await form.getByRole('button', { name: 'Submit DPR' }).click();
  await expect(form).toBeHidden();
  const report = (await api<{ items: DailyReportDto[] }>(owner, `/dpr?projectId=${project.id}`)).items[0];
  expect(report.formId).toBe(saved.form.id);
  expect(report.extra).toEqual({ slurryLevel: 2.4 });

  // Back to the standard form: the report keeps version 1 and its slurry level.
  await api(owner, '/project-types/ROAD/dpr-form', { method: 'DELETE' });
  const after = await api<DprFormVersionsDto>(owner, '/project-types/ROAD/dpr-form');
  expect(after.form.version).toBe(2);
  expect(after.form.def.own.some((f) => f.key === 'slurryLevel')).toBe(false);
  expect(after.versions.find((v) => v.version === 1)?.reports).toBe(1);
  await settle(page, `/dpr/${report.id}`);
  await expect(page.getByText('2.4 m', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Version 1' })).toBeVisible();
});
