import { expect, test } from '@playwright/test';
import { API_URL, api, apiToken, chooseOption, formPanel, PASSWORD, settle, signIn } from './helpers';

type TypeDto = { code: string; name: string; standard: boolean; edited: boolean; breakdown: { key: string; kind: string; count: number }[]; activities: unknown[] };
type Structure = { elements: { code: string; name: string; kindCode: string | null; elementType: string; level: string }[] };

/**
 * Project types (item 134, ARCHITECTURE "Project types"): a company starts with the standard types and kinds, makes a
 * type of its own with a starting breakdown, and a new project of that type lays the breakdown out at the counts picked.
 * The demo company's own Bridge type shows its kinds and activities. A fresh company keeps the demo data as it is.
 */
test('a type of the company’s own gives a new project its components', async ({ page }) => {
  const stamp = Date.now();
  const email = `types-${stamp}@e2e.test`;
  const res = await fetch(`${API_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ organizationName: `E2E Types ${stamp}`, fullName: 'Tara Types', email, password: PASSWORD }),
  });
  expect(res.ok).toBe(true);
  const owner = await apiToken(email);
  const types = await api<TypeDto[]>(owner, '/project-types');
  expect(types.map((t) => t.code)).toEqual(['ROAD', 'BUILDING', 'WATER_SUPPLY', 'TRANSMISSION_MAIN', 'SEWERAGE', 'GENERAL']);
  expect(types.every((t) => t.standard && !t.edited)).toBe(true);

  await signIn(page, email);
  await settle(page, '/project-types');
  await expect(page.getByRole('heading', { level: 1, name: 'Project types' })).toBeVisible();
  await page.getByRole('button', { name: 'New project type' }).click();
  const made = formPanel(page, 'New project type');
  await made.getByLabel('Name').fill('Culvert works');
  // The code follows the name.
  await expect(made.getByLabel('Code')).toHaveValue('CULVERT_WORKS');
  await chooseOption(made.getByLabel('Built on'), 'Road');
  await made.getByRole('button', { name: 'Make type' }).click();
  await expect(page).toHaveURL(/\/project-types\/CULVERT_WORKS$/);
  await expect(page.getByText('No starting components.')).toBeVisible();

  // Its breakdown: three box crossings of the built-in kind.
  await page.getByRole('button', { name: 'Edit' }).click();
  const edit = formPanel(page, 'Edit Culvert works');
  await edit.getByRole('button', { name: 'Add component' }).click();
  await chooseOption(edit.getByLabel('Component kind', { exact: true }), 'Crossing');
  await edit.getByLabel('Component name').fill('Box culvert');
  await edit.getByLabel('Usual number of copies').fill('3');
  await edit.getByRole('button', { name: 'Save type' }).click();
  await expect(edit).toBeHidden();
  await expect(page.getByRole('cell', { name: 'Box culvert' })).toBeVisible();
  const saved = (await api<TypeDto[]>(owner, '/project-types')).find((t) => t.code === 'CULVERT_WORKS')!;
  expect(saved.breakdown).toEqual([expect.objectContaining({ key: '1', kind: 'CROSSING', count: 3 })]);

  // New project offers it, with its components at their usual count; two are picked.
  await page.goto('/projects');
  await page.getByRole('button', { name: 'New project' }).first().click();
  const form = formPanel(page, 'New project');
  await form.getByLabel('Project name').fill('E2E culverts on the canal road');
  await chooseOption(form.getByLabel('Type', { exact: true }), 'Culvert works');
  await expect(form.getByLabel('Box culvert')).toHaveValue('3');
  await form.getByLabel('Box culvert').fill('2');
  await form.getByRole('button', { name: 'Create project' }).click();
  await expect(form).toBeHidden();
  const id = (await api<{ items: { id: string }[] }>(owner, '/projects?q=culverts')).items[0].id;
  const project = await api<{ type: string; typeCode: string; typeName: string }>(owner, `/projects/${id}`);
  expect([project.type, project.typeCode, project.typeName]).toEqual(['ROAD', 'CULVERT_WORKS', 'Culvert works']);
  const structure = await api<Structure>(owner, `/projects/${id}/structure`);
  expect(structure.elements.map((e) => [e.name, e.kindCode, e.elementType])).toEqual([
    ['Box culvert 1', 'CROSSING', 'CROSSING'],
    ['Box culvert 2', 'CROSSING', 'CROSSING'],
  ]);

  // A type that projects use cannot be deleted.
  await settle(page, '/project-types/CULVERT_WORKS');
  await expect(page.getByRole('button', { name: 'Delete' })).toBeDisabled();
});

test('the demo company’s Bridge type, its kinds and the old templates link', async ({ page }) => {
  await signIn(page, 'admin@demo.com');
  await settle(page, '/templates');
  await expect(page).toHaveURL(/\/project-types$/);
  await expect(page.getByRole('link', { name: 'Bridge' })).toBeVisible();
  await page.getByRole('link', { name: 'Bridge' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /Bridge/ })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Pier', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: /Activities/ }).click();
  await expect(page.getByRole('textbox', { name: 'Activity 3 name' })).toHaveValue('River diversion and cofferdams');

  // The kind's editor shows what a new pier lays out: the shaft in three 3 m lifts over its 9 m.
  await settle(page, '/project-types?tab=kinds');
  await page.getByText('Bridge pier', { exact: true }).click();
  const kind = formPanel(page, 'Edit Bridge pier');
  await expect(kind.getByText('Pier shaft lift 3', { exact: true })).toBeVisible();
  await expect(kind.getByText('Pier shaft lift 4', { exact: true })).toHaveCount(0);
});
