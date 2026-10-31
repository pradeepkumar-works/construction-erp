import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { API_URL, api, apiToken, formPanel, PASSWORD, settle, signIn } from './helpers';

type TypeDto = { code: string; name: string; baseType: string; description: string; locations: string[]; pipeNetwork: boolean; contractModel: string; kinds: string[]; breakdown: unknown[]; active: boolean };
type Structure = { elements: { name: string; kindCode: string | null; weightPct: string | null }[] };

async function company(stamp: number, tag: string) {
  const email = `type-updates-${tag}-${stamp}@e2e.test`;
  const res = await fetch(`${API_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ organizationName: `E2E Type updates ${tag} ${stamp}`, fullName: 'Uma Updates', email, password: PASSWORD }),
  });
  expect(res.ok).toBe(true);
  return { email, token: await apiToken(email) };
}

const saveBreakdown = (token: string, t: TypeDto, breakdown: unknown[]) =>
  api(token, `/project-types/${t.code}`, {
    method: 'PUT',
    body: { name: t.name, baseType: t.baseType, description: t.description, locations: t.locations, pipeNetwork: t.pipeNetwork, contractModel: t.contractModel, kinds: t.kinds, breakdown, active: t.active },
  });

/**
 * Update projects and types files (ARCHITECTURE "Updating projects from their type", "Export and import
 * of project types"): a type gains a component after a project was made from it; Update projects shows the project and
 * adds only the new component, with no weight beside the weighted ones. The type is exported and imported into a
 * second company, which previews it as new first. Both companies are fresh, so the demo data stays as it is.
 */
test('a running project gets what its type gained, and the type moves to another company', async ({ page, browser }) => {
  const stamp = Date.now();
  const a = await company(stamp, 'a');
  await api(a.token, '/project-types', { method: 'POST', body: { code: 'CULVERT_WORKS', name: 'Culvert works', baseType: 'ROAD' } });
  const box = { key: '1', parentKey: null, kind: 'CROSSING', name: 'Box culvert', count: 2, specs: null, weightPct: 30 };
  const made = (await api<TypeDto[]>(a.token, '/project-types')).find((t) => t.code === 'CULVERT_WORKS')!;
  await saveBreakdown(a.token, made, [{ ...box, weightPct: 50 }]);
  const project = await api<{ id: string }>(a.token, '/projects', {
    method: 'POST',
    body: { code: `CW-${stamp}`, name: 'E2E culverts to update', type: 'ROAD', typeCode: 'CULVERT_WORKS', breakdown: [{ key: '1', count: 2 }] },
  });

  // The type gains a protection wall after the project was made.
  const type = (await api<TypeDto[]>(a.token, '/project-types')).find((t) => t.code === 'CULVERT_WORKS')!;
  await saveBreakdown(a.token, type, [box, { key: '2', parentKey: null, kind: 'GENERAL', name: 'Protection wall', count: 1, specs: null, weightPct: 40 }]);

  await signIn(page, a.email);
  await settle(page, '/project-types/CULVERT_WORKS');
  await page.getByRole('button', { name: 'Update projects' }).click();
  const drawer = formPanel(page, 'Update projects of Culvert works');
  await expect(drawer.getByText('Only adds what a project lacks')).toBeVisible();
  await expect(drawer.getByRole('checkbox', { name: /E2E culverts to update/ })).toBeChecked();
  await drawer.getByRole('button', { name: 'Choose what it gets' }).click();
  await expect(drawer.getByRole('checkbox', { name: /Protection wall/ })).toBeChecked();
  await drawer.getByRole('button', { name: 'Update 1 project' }).click();
  await expect(drawer).toBeHidden();

  const structure = await api<Structure>(a.token, `/projects/${project.id}/structure`);
  expect(structure.elements.map((e) => [e.name, e.kindCode])).toEqual([
    ['Box culvert 1', 'CROSSING'],
    ['Box culvert 2', 'CROSSING'],
    ['Protection wall', 'GENERAL'],
  ]);
  // It joins weighted work with no weight of its own, so the project's progress does not move.
  expect(structure.elements.find((e) => e.name === 'Protection wall')!.weightPct).toBeNull();
  const again = await api<{ rows: unknown[]; upToDate: number }>(a.token, '/project-types/CULVERT_WORKS/updates');
  expect([again.rows.length, again.upToDate]).toEqual([0, 1]);

  // Export the type as a file.
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^culvert-works-\d{4}-\d{2}-\d{2}\.json$/);
  const file = JSON.parse(await readFile((await download.path())!, 'utf8')) as { format: string; types: { code: string }[] };
  expect([file.format, file.types.map((t) => t.code)]).toEqual(['nirmaan.project-types', ['CULVERT_WORKS']]);

  // A second company imports it: the preview says it is new, and nothing is saved before Import.
  const b = await company(stamp, 'b');
  const other = await browser.newPage();
  await signIn(other, b.email);
  await settle(other, '/project-types');
  await other.getByRole('button', { name: 'Import' }).click();
  const modal = formPanel(other, 'Import project types');
  await modal.locator('input[type=file]').setInputFiles((await download.path())!);
  await expect(modal.getByRole('checkbox', { name: /Culvert works/ })).toBeChecked();
  await expect(modal.getByText('New', { exact: true })).toBeVisible();
  expect((await api<TypeDto[]>(b.token, '/project-types')).map((t) => t.code)).not.toContain('CULVERT_WORKS');
  await modal.getByRole('button', { name: /^Import \d+ items?$/ }).click();
  await expect(modal).toBeHidden();
  const imported = (await api<TypeDto[]>(b.token, '/project-types')).find((t) => t.code === 'CULVERT_WORKS');
  expect(imported?.breakdown).toHaveLength(2);
  await other.close();
});
