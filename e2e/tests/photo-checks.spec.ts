import { expect, test } from '@playwright/test';
import { API_URL, api, apiToken, localToday, signIn, uniqueQty } from './helpers';

/**
 * Site photo checks (AI item 76). The test model reads a photo from words in its file name, so "nohelmet" in the name
 * stands for workers without helmets, and "leak" for a leaking bathroom slab.
 */

type Project = { id: string; code: string; type: string };
type Activity = { id: string; name: string };

/** A valid 1×1 PNG. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function upload(token: string, name: string): Promise<string> {
  const form = new FormData();
  form.append('file', new Blob([PNG], { type: 'image/png' }), name);
  const res = await fetch(`${API_URL}/uploads`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
  expect(res.ok, await res.clone().text()).toBe(true);
  return ((await res.json()) as { id: string }).id;
}

test("a progress entry's photo gets a caption and a helmet flag on its page", async ({ page }) => {
  const engineer = await apiToken('engineer@demo.com');
  const road = (await api<{ items: Project[] }>(engineer, '/projects?pageSize=100')).items.find((p) => p.code === 'RD-2026-01')!;
  const gsb = (await api<Activity[]>(engineer, `/projects/${road.id}/activities`)).find((a) => a.name === 'GSB laying')!;
  const photo = await upload(engineer, `gsb-nohelmet-${Date.now()}.png`);
  const entry = await api<{ id: string }>(engineer, '/progress', { method: 'POST', body: { projectId: road.id, activityId: gsb.id, date: localToday(), quantity: uniqueQty(), remarks: 'e2e photo check', attachmentIds: [photo] } });

  await signIn(page, 'pm@demo.com');
  await page.goto(`/progress/${entry.id}`);
  const checks = page.getByRole('region', { name: 'Photo checks by Ask Nirmaan' });
  await expect(checks).toContainText('Workers placing reinforcement on the slab');
  await expect(checks).toContainText('Workers without helmets');
  await expect(checks).toContainText('92% sure');
  await expect(checks).toContainText('never holds up a submission');
  // Advice only: the entry can still be approved.
  await expect(page.getByRole('toolbar', { name: 'Record actions' }).getByRole('button', { name: 'Approve' })).toBeEnabled();
  // A project manager may switch the project's flags off; here they only see the switch.
  await expect(checks.getByRole('switch', { name: 'Photo flags on this project' })).toBeChecked();
});

test('Describe from photo fills in a new snag from its photo, and nothing is saved until Report', async ({ page }) => {
  const engineer2 = await apiToken('engineer2@demo.com');
  const building = (await api<{ items: Project[] }>(engineer2, '/projects?pageSize=100')).items.find((p) => p.type === 'BUILDING')!;
  const before = await api<{ total: number }>(engineer2, `/defects?projectId=${building.id}&pageSize=1`);

  await signIn(page, 'engineer2@demo.com');
  await page.goto(`/projects/${building.id}?tab=handover`);
  await page.getByRole('button', { name: 'Report snag' }).click();
  const form = page.locator('.ant-drawer-open').filter({ hasText: 'Report a snag or defect' });
  await form.locator('input[type=file]').setInputFiles({ name: 'bathroom-leak.png', mimeType: 'image/png', buffer: PNG });
  await form.getByRole('button', { name: 'Describe from photo' }).click();
  await expect(form.getByLabel('What is wrong')).toHaveValue('Water leak below the bathroom slab');
  await expect(form.getByLabel('Where')).toHaveValue('Ground floor, below bathroom');
  await expect(form.getByLabel('Details')).toHaveValue(/Damp patch/);
  await expect(form).toContainText('Check it before you save');
  const after = await api<{ total: number }>(engineer2, `/defects?projectId=${building.id}&pageSize=1`);
  expect(after.total).toBe(before.total);
});
