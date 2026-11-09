import { expect, test } from '@playwright/test';
import { API_URL, api, apiToken, localToday, signIn, uniqueQty } from './helpers';

/** Stored files (Aadhaar and PAN scans among them) open only through the signed link a signed-in reader is given. */

const API_ORIGIN = API_URL.replace(/\/api\/?$/, '');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

type Attachment = { id: string; url: string; fileName: string };

async function upload(token: string, name: string): Promise<Attachment> {
  const form = new FormData();
  form.append('file', new Blob([PNG], { type: 'image/png' }), name);
  const res = await fetch(`${API_URL}/uploads`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
  expect(res.ok, await res.clone().text()).toBe(true);
  return (await res.json()) as Attachment;
}

const absolute = (url: string) => (/^https?:\/\//.test(url) ? url : `${API_ORIGIN}${url}`);

test('a file opens from its signed link and not from its id alone', async () => {
  const engineer = await apiToken('engineer@demo.com');
  const file = await upload(engineer, `file-link-${Date.now()}.png`);

  const signed = await fetch(absolute(file.url));
  expect(signed.status).toBe(200);
  expect(signed.headers.get('content-type')).toContain('image/png');
  expect(signed.headers.get('cache-control')).toMatch(/^private/);
  expect(Buffer.from(await signed.arrayBuffer()).equals(PNG)).toBe(true);

  const bare = await fetch(`${API_ORIGIN}/api/uploads/${file.id}/content`);
  expect(bare.status).toBe(403);
  expect(((await bare.json()) as { message: string }).message).toContain('Open the file from its page');

  const url = new URL(absolute(file.url));
  url.searchParams.set('s', `${url.searchParams.get('s')!.slice(0, -2)}AA`);
  expect((await fetch(url)).status).toBe(403);

  const later = new URL(absolute(file.url));
  later.searchParams.set('e', String(Number(later.searchParams.get('e')) + 3600));
  expect((await fetch(later)).status).toBe(403);
});

test("a record's photo still shows on its page", async ({ page }) => {
  const engineer = await apiToken('engineer@demo.com');
  const road = (await api<{ items: { id: string; code: string }[] }>(engineer, '/projects?pageSize=100')).items.find((p) => p.code === 'RD-2026-01')!;
  const gsb = (await api<{ id: string; name: string }[]>(engineer, `/projects/${road.id}/activities`)).find((a) => a.name === 'GSB laying')!;
  const photo = await upload(engineer, `gsb-file-link-${Date.now()}.png`);
  const entry = await api<{ id: string }>(engineer, '/progress', { method: 'POST', body: { projectId: road.id, activityId: gsb.id, date: localToday(), quantity: uniqueQty(), remarks: 'e2e file link', attachmentIds: [photo.id] } });

  await signIn(page, 'pm@demo.com');
  await page.goto(`/progress/${entry.id}`);
  const img = page.locator(`img[alt="${photo.fileName}"]`).first();
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBe(1);
});
