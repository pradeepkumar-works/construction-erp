import { expect, test, type Page } from '@playwright/test';
import { API_URL, api, apiToken, axeViolations, chooseOption, settle, signIn } from './helpers';

type Doc = { id: string; docNo: string; openMarkups: number };
type Mark = { id: string; markupNo: number; kind: string; status: string; note: string | null; revision: string; points: [number, number][]; rfiNo: string | null };

const findDoc = async (token: string, docNo: string) => (await api<{ items: Doc[] }>(token, `/documents?q=${docNo}`)).items.find((d) => d.docNo === docNo)!;

/** Waits for the sheet to be drawn: the viewer's spinners gone and the canvas holding the page. */
async function sheetReady(page: Page) {
  await settle(page);
  await expect(page.locator('.drawing-viewport canvas')).toBeVisible();
  await expect.poll(() => page.locator('.drawing-viewport canvas').evaluate((c: HTMLCanvasElement) => c.width)).toBeGreaterThan(100);
}

/** A point on the drawing, as fractions of the sheet's box on screen. */
async function at(page: Page, fx: number, fy: number) {
  const box = (await page.locator('.drawing-viewport svg').boundingBox())!;
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

/**
 * Drawing viewer and markup on the demo hospital's ground floor plan (ARC-101, two revisions, marks seeded):
 * the project manager sees this revision's marks and the one carried open from R0, adds a comment pin and a cloud,
 * resolves the pin, compares the revisions, and opens the CAD drawing with its layers. Site can mark up too but not
 * change another person's mark.
 */
test.describe.serial('drawing viewer and markup', () => {
  const note = `E2E check sleeve ${Date.now()}`;
  let docId = '';

  test('marks on the current revision, with the open one from the earlier revision carried', async ({ page }) => {
    const pm = await apiToken('pm2@demo.com');
    docId = (await findDoc(pm, 'ARC-101')).id;
    await signIn(page, 'pm2@demo.com');
    await page.goto(`/documents?id=${docId}`);
    await page.locator('.ant-drawer-open').getByRole('link', { name: /View and mark up/ }).click();
    await expect(page).toHaveURL(/\/documents\/drawing\?/);
    await sheetReady(page);
    await expect(page.getByRole('heading', { level: 1, name: 'ARC-101 Ground floor plan' })).toBeVisible();
    await expect(page).toHaveTitle(/ARC-101 drawing/);
    const list = page.getByRole('list', { name: 'Marks' });
    await expect(list.getByText('Toilet block now at grid 5', { exact: false })).toBeVisible();
    // M2 was made on R0 and is still open, so it shows here, dashed, with its revision.
    const carried = list.getByRole('listitem').filter({ hasText: 'Sill level of this window' });
    await expect(carried.getByText('R0', { exact: true })).toBeVisible();
    // M1 was resolved on R0 and stays behind.
    await expect(list.getByText('Waiting area too small', { exact: false })).toHaveCount(0);
    await page.getByRole('switch').click();
    await expect(carried).toHaveCount(0);
    await page.getByRole('switch').click();
    expect(await axeViolations(page)).toEqual([]);
  });

  test('a comment pin and a cloud are added, and the pin resolved', async ({ page }) => {
    await signIn(page, 'pm2@demo.com');
    await page.goto(`/documents/drawing?id=${docId}`);
    await sheetReady(page);

    await page.getByRole('button', { name: 'Comment pin', exact: true }).click();
    const p = await at(page, 0.3, 0.35);
    await page.mouse.click(p.x, p.y);
    const modal = page.locator('.ant-modal').filter({ hasText: 'Comment on the drawing' });
    await modal.getByRole('button', { name: 'Save mark' }).click();
    await expect(modal.getByText('Write the comment, e.g. what to check or change').first()).toBeVisible();
    await modal.getByLabel('Comment').fill(note);
    await modal.getByRole('button', { name: 'Save mark' }).click();
    await expect(page.getByText(/^M\d+ saved$/)).toBeVisible();
    await expect(page.getByRole('list', { name: 'Marks' }).getByText(note)).toBeVisible();

    await page.getByRole('button', { name: 'Cloud', exact: true }).click();
    await page.getByRole('button', { name: 'Blue ink' }).click();
    const a = await at(page, 0.55, 0.55);
    const b = await at(page, 0.7, 0.7);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 6 });
    await page.mouse.up();
    const cloud = page.locator('.ant-modal').filter({ hasText: 'Cloud: comment' });
    await cloud.getByRole('button', { name: 'Save mark' }).click();
    await expect(cloud).toBeHidden();

    const pm = await apiToken('pm2@demo.com');
    const marks = await api<Mark[]>(pm, `/documents/${docId}/markups`);
    const pin = marks.find((m) => m.note === note)!;
    expect(pin.kind).toBe('PIN');
    expect(pin.revision).toBe('R1');
    expect(pin.points[0][0]).toBeCloseTo(0.3, 1);
    expect(pin.points[0][1]).toBeCloseTo(0.35, 1);
    const drawnCloud = marks[marks.length - 1];
    expect(drawnCloud.kind).toBe('CLOUD');
    expect(drawnCloud.points[1][0]).toBeCloseTo(0.7, 1);

    // Resolving the pin, with what was done.
    const item = page.getByRole('list', { name: 'Marks' }).getByRole('listitem').filter({ hasText: note });
    await item.getByRole('button', { name: 'Resolve' }).click();
    const resolve = page.locator('.ant-modal').filter({ hasText: `Resolve M${pin.markupNo}` });
    await resolve.getByLabel('What was done (optional)').fill('Sleeve fixed at site');
    await resolve.getByRole('button', { name: 'Resolve' }).click();
    await expect(page.getByText(`M${pin.markupNo} resolved`)).toBeVisible();
    await expect(item.getByText('Resolved', { exact: true })).toBeVisible();
    const history = await api<{ action: string }[]>(pm, `/documents/${docId}/history`);
    expect(history.some((h) => h.action === 'MARKUP_RESOLVED')).toBe(true);
  });

  test('revisions are compared, and site may mark but not change another person’s mark', async ({ page }) => {
    await signIn(page, 'pm2@demo.com');
    await page.goto(`/documents/drawing?id=${docId}`);
    await sheetReady(page);
    await chooseOption(page.getByLabel('Compare with another revision'));
    await expect(page.getByText('Only on R0 (older)')).toBeVisible();
    await expect(page.getByText('Only on R1 (newer)')).toBeVisible();

    const se = await apiToken('engineer2@demo.com');
    const pm = await apiToken('pm2@demo.com');
    const detail = await api<{ current: { id: string; attachments: { id: string }[] } }>(se, `/documents/${docId}`);
    const mine = await api<Mark>(se, `/documents/${docId}/markups`, {
      method: 'POST',
      body: { revisionId: detail.current.id, attachmentId: detail.current.attachments[0].id, kind: 'ARROW', points: [[0.1, 0.1], [0.2, 0.2]], color: 'GREEN', note: 'E2E site arrow' },
    });
    expect(mine.status).toBe('OPEN');
    const pmMark = (await api<Mark[]>(pm, `/documents/${docId}/markups`)).find((m) => m.note === note)!;
    const refused = await fetch(`${API_URL}/documents/${docId}/markups/${pmMark.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${se}` } });
    expect(refused.status).toBe(403);
    const bad = await fetch(`${API_URL}/documents/${docId}/markups`, {
      method: 'POST',
      headers: { authorization: `Bearer ${se}`, 'content-type': 'application/json' },
      body: JSON.stringify({ revisionId: detail.current.id, attachmentId: detail.current.attachments[0].id, kind: 'PIN', points: [[0.5, 0.5]] }),
    });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { message: string }).message).toBe('Write the comment');
    await api(se, `/documents/${docId}/markups/${mine.id}`, { method: 'DELETE' });
  });

  test('a DXF drawing opens with its layers, and DXF files upload', async ({ page }) => {
    const pm = await apiToken('pm2@demo.com');
    const cad = await findDoc(pm, 'ARC-110');
    await signIn(page, 'pm2@demo.com');
    await page.goto(`/documents/drawing?id=${cad.id}`);
    await sheetReady(page);
    await page.getByRole('button', { name: 'Layers' }).click();
    const walls = page.getByRole('checkbox', { name: 'WALLS' });
    await expect(walls).toBeChecked();
    await walls.uncheck();
    await expect(walls).not.toBeChecked();

    const form = new FormData();
    form.append('file', new Blob(['0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n'], { type: 'application/octet-stream' }), 'plan.dxf');
    const res = await fetch(`${API_URL}/uploads`, { method: 'POST', headers: { authorization: `Bearer ${pm}` }, body: form });
    expect(res.status).toBe(201);
    expect(((await res.json()) as { mimeType: string }).mimeType).toBe('image/vnd.dxf');
  });
});
