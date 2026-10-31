import { expect, test, type Page } from '@playwright/test';
import { API_URL, api, apiToken, axeViolations, chooseOption, settle, signIn } from './helpers';

type Doc = { id: string; docNo: string; projectId: string; revisions: { id: string; current: boolean; attachments: { id: string }[] }[] };
type Takeoff = { id: string; takeoffNo: number; kind: string; value: string; label: string; mbNo: string | null };
type Takeoffs = { scales: { page: number; lengthM: string }[]; takeoffs: Takeoff[] };

const findDoc = async (token: string, docNo: string) => {
  const id = (await api<{ items: { id: string; docNo: string }[] }>(token, `/documents?q=${docNo}`)).items.find((d) => d.docNo === docNo)!.id;
  return api<Doc>(token, `/documents/${id}`);
};
const call = (token: string, method: string, path: string, body?: unknown) =>
  fetch(`${API_URL}${path}`, { method, headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });

async function sheetReady(page: Page) {
  await settle(page);
  await expect(page.locator('.drawing-viewport canvas')).toBeVisible();
  await expect.poll(() => page.locator('.drawing-viewport canvas').evaluate((c: HTMLCanvasElement) => c.width)).toBeGreaterThan(100);
}

/** A point of the toilet block DXF in millimetres, on screen: the sheet is the drawing's extents and a 3 % margin (as seeded). */
async function atMm(page: Page, x: number, y: number) {
  const box = (await page.locator('.drawing-viewport svg').boundingBox())!;
  const m = 12950 * 0.03;
  const [minX, maxY, w, h] = [-450 - m, 10450 + m, 12900 + 2 * m, 12950 + 2 * m];
  return { x: box.x + box.width * ((x - minX) / w), y: box.y + box.height * ((maxY - y) / h) };
}

/**
 * Measuring on drawings, on the hospital's toilet block DXF (ARC-110: its scale along the 12 m wall and four
 * measures seeded). The project manager reads the measures and their totals, measures the 12 m wall and counts two
 * columns, and puts the wall into the measurement book; through the API, a new scale works the lengths out again, a length
 * needs a scale, a BOQ quantity comes from measures of one kind and only those who keep the BOQ set it.
 */
test.describe.serial('measuring on drawings', () => {
  const stamp = Date.now();

  test('the measures and the scale on a sheet, with their totals', async ({ page }) => {
    const pm = await apiToken('pm2@demo.com');
    const doc = await findDoc(pm, 'ARC-110');
    await signIn(page, 'pm2@demo.com');
    await page.goto(`/documents/drawing?id=${doc.id}&panel=measures`);
    await sheetReady(page);
    await expect(page.getByText('Scale: 12 m between two points', { exact: false })).toBeVisible();
    const list = page.getByRole('list', { name: 'Measures' });
    await expect(list.getByRole('listitem').filter({ hasText: 'Partition between store and janitor' })).toContainText('3.77 m');
    await expect(list.getByRole('listitem').filter({ hasText: 'Gents toilet floor' })).toContainText('28.43 m²');
    await expect(list.getByRole('listitem').filter({ hasText: 'Store floor' })).toContainText('14.21 m²');
    await expect(list.getByRole('listitem').filter({ hasText: 'Doors D1' })).toContainText('3 nos');
    // The two floors together, and ticking them adds them up.
    await expect(page.getByText(/Areas\s*42\.64 m²/)).toBeVisible();
    await page.getByRole('checkbox', { name: /^Tick T\d+$/ }).nth(1).check();
    await page.getByRole('checkbox', { name: /^Tick T\d+$/ }).nth(2).check();
    await expect(page.getByText('2 ticked: 42.64 m²')).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
  });

  test('a length and a count are measured, and the length goes into the measurement book', async ({ page }) => {
    await signIn(page, 'pm2@demo.com');
    const pm = await apiToken('pm2@demo.com');
    const doc = await findDoc(pm, 'ARC-110');
    await page.goto(`/documents/drawing?id=${doc.id}`);
    await sheetReady(page);

    // The north wall, 12 m, clicked at both ends; a second click on the end finishes it.
    await page.getByRole('button', { name: 'Measure a length' }).click();
    await expect(page.getByRole('radio', { name: 'Measures' })).toBeChecked();
    const a = await atMm(page, 0, 8000);
    const b = await atMm(page, 12000, 8000);
    await page.mouse.click(a.x, a.y);
    await page.mouse.click(b.x, b.y);
    await expect(page.getByText(/^1[12](\.\d+)? m · 2 points$/)).toBeVisible();
    await page.mouse.click(b.x, b.y);
    const named = page.locator('.ant-modal').filter({ hasText: 'New length' });
    await expect(named.getByText(/^1[12](\.\d+)? m$/)).toBeVisible();
    await named.getByRole('button', { name: 'Save' }).click();
    await expect(named.getByText('Say what it is, e.g. "Plinth beam, grid A"', { exact: true })).toBeVisible();
    await named.getByLabel('What it is').fill(`North wall ${stamp}`);
    await named.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/^T\d+ saved: 1[12](\.\d+)? m$/)).toBeVisible();
    const saved = (await api<Takeoffs>(pm, `/documents/${doc.id}/takeoffs`)).takeoffs.find((t) => t.label === `North wall ${stamp}`)!;
    // Clicked on screen, so within a few centimetres of the 12 m it is.
    expect(Math.abs(Number(saved.value) - 12)).toBeLessThan(0.15);

    // Two columns counted, Enter finishes.
    await page.getByRole('button', { name: 'Count', exact: true }).click();
    for (const [x, y] of [[0, 0], [4000, 0]]) {
      const p = await atMm(page, x, y);
      await page.mouse.click(p.x, p.y);
    }
    await page.locator('.drawing-viewport').press('Enter');
    const count = page.locator('.ant-modal').filter({ hasText: 'New count' });
    await expect(count.getByText('2 nos')).toBeVisible();
    await count.getByLabel('What it is').fill(`Columns C1 ${stamp}`);
    await count.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/^T\d+ saved: 2 nos$/)).toBeVisible();

    // The wall into the measurement book: its line is filled in, and the measure shows the sheet it went into.
    await page.getByRole('button', { name: 'Done' }).click();
    const item = page.getByRole('list', { name: 'Measures' }).getByRole('listitem').filter({ hasText: `North wall ${stamp}` });
    await item.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Add to measurement book' }).click();
    const mb = page.locator('.ant-drawer-open').filter({ hasText: 'New measurement' });
    await expect(mb).toBeVisible();
    await expect(mb.locator('input[value^="North wall"]')).toHaveValue(`North wall ${stamp}`);
    await chooseOption(mb.getByLabel('BOQ item'), '');
    await mb.getByLabel('Location').fill('Toilet block, north wall');
    await mb.getByRole('button', { name: 'Submit' }).click();
    await expect(item.getByText(/^In MB/)).toBeVisible();
    expect((await api<Takeoffs>(pm, `/documents/${doc.id}/takeoffs`)).takeoffs.find((t) => t.id === saved.id)!.mbNo).toMatch(/^MB/);
    // The sheet keeps its lines; the demo drawing goes back to its own measures.
    for (const t of (await api<Takeoffs>(pm, `/documents/${doc.id}/takeoffs`)).takeoffs.filter((x) => x.label.endsWith(String(stamp)))) await api(pm, `/documents/${doc.id}/takeoffs/${t.id}`, { method: 'DELETE' });
  });

  test('a new scale works lengths out again; BOQ quantities come from measures of one kind, set by those who keep the BOQ', async () => {
    const pm = await apiToken('pm2@demo.com');
    const site = await apiToken('engineer2@demo.com');
    const doc = await findDoc(pm, 'ARC-101');
    const rev = doc.revisions.find((r) => r.current)!;
    const file = rev.attachments[0].id;
    // A page of its own each run, so it starts with no scale.
    const page = 1 + (stamp % 4000);
    const base = { revisionId: rev.id, attachmentId: file, page };

    const noScale = await call(pm, 'POST', `/documents/${doc.id}/takeoffs`, { ...base, kind: 'LENGTH', points: [[0.1, 0.2], [0.35, 0.2]], label: 'Plinth beam' });
    expect(noScale.status).toBe(400);
    expect((await noScale.json()).message).toBe('Set the scale on this sheet first: click two points a known distance apart');

    await api(pm, `/documents/${doc.id}/takeoffs/scale`, { method: 'PUT', body: { attachmentId: file, page, points: [[0.1, 0.5], [0.6, 0.5]], lengthM: 10, aspect: 1 } });
    let res = await api<Takeoffs>(pm, `/documents/${doc.id}/takeoffs`, { method: 'POST', body: { ...base, kind: 'LENGTH', points: [[0.1, 0.2], [0.35, 0.2]], label: `Plinth beam ${stamp}` } });
    const beam = res.takeoffs.find((t) => t.label === `Plinth beam ${stamp}`)!;
    expect(beam.value).toBe('5.000');
    res = await api<Takeoffs>(pm, `/documents/${doc.id}/takeoffs`, { method: 'POST', body: { ...base, kind: 'AREA', points: [[0.1, 0.1], [0.3, 0.1], [0.3, 0.2], [0.1, 0.2]], label: `Slab panel ${stamp}` } });
    const slab = res.takeoffs.find((t) => t.label === `Slab panel ${stamp}`)!;
    expect(slab.value).toBe('8.000');
    // The same two points are 20 m apart after all: the beam doubles and the slab is four times as big.
    res = await api<Takeoffs>(pm, `/documents/${doc.id}/takeoffs/scale`, { method: 'PUT', body: { attachmentId: file, page, points: [[0.1, 0.5], [0.6, 0.5]], lengthM: 20, aspect: 1 } });
    expect(res.takeoffs.find((t) => t.id === beam.id)!.value).toBe('10.000');
    expect(res.takeoffs.find((t) => t.id === slab.id)!.value).toBe('32.000');

    // A BOQ item of its own, set from the slab times its 150 mm thickness.
    const item = await api<{ id: string }>(pm, `/projects/${doc.projectId}/boq`, { method: 'POST', body: { itemNo: `E2E-${stamp}`, description: 'RCC M25 in slab (e2e)', unit: 'cum', rate: '7500', originalQty: '1' } });
    try {
      const mixed = await call(pm, 'PUT', `/documents/${doc.id}/takeoffs/boq`, { ids: [beam.id, slab.id], boqItemId: item.id, field: 'REVISED' });
      expect(mixed.status).toBe(400);
      expect((await mixed.json()).message).toBe('Pick measures of one kind: lengths, areas or counts do not add together');
      const bySite = await call(site, 'PUT', `/documents/${doc.id}/takeoffs/boq`, { ids: [slab.id], boqItemId: item.id, field: 'REVISED', factor: 0.15 });
      expect(bySite.status).toBe(403);
      await api(pm, `/documents/${doc.id}/takeoffs/boq`, { method: 'PUT', body: { ids: [slab.id], boqItemId: item.id, field: 'REVISED', factor: 0.15 } });
      const boq = await api<{ id: string; revisedQty: string | null }[]>(pm, `/projects/${doc.projectId}/boq`);
      expect(Number(boq.find((b) => b.id === item.id)!.revisedQty)).toBe(4.8);
    } finally {
      await api(pm, `/projects/${doc.projectId}/boq/${item.id}`, { method: 'DELETE' });
    }

    // Site measures too, but only whoever measured it (or document control) renames or deletes it.
    const renameBySite = await call(site, 'PATCH', `/documents/${doc.id}/takeoffs/${beam.id}`, { label: 'Mine now' });
    expect(renameBySite.status).toBe(403);
    await api(pm, `/documents/${doc.id}/takeoffs/${beam.id}`, { method: 'DELETE' });
    await api(pm, `/documents/${doc.id}/takeoffs/${slab.id}`, { method: 'DELETE' });
  });
});
