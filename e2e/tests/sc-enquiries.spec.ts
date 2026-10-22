import { expect, test } from '@playwright/test';
import { API_URL, api, apiToken, chooseOption, signIn } from './helpers';

type Quote = { id: string; vendorId: string; vendorName: string; received: boolean; total: string | null; rank: number | null; complete: boolean; awarded: boolean };
type Enquiry = {
  id: string;
  enquiryNo: string;
  projectId: string;
  status: string;
  workOrderId: string | null;
  woNo: string | null;
  decisionNote: string | null;
  items: { id: string; itemNo: string | null; boqItemId: string | null; lowestQuoteIds: string[] }[];
  quotes: Quote[];
};
type Project = { id: string; code: string };
type Vendor = { id: string; name: string };
type BoqItem = { id: string; itemNo: string };

const call = (token: string, method: string, path: string, body?: unknown) =>
  fetch(`${API_URL}${path}`, { method, headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });

async function demo(token: string) {
  const projects = await api<{ items: Project[] } | Project[]>(token, '/projects?pageSize=100');
  const project = (Array.isArray(projects) ? projects : projects.items).find((p) => p.code === 'BL-2026-02')!;
  const boq = await api<BoqItem[]>(token, `/projects/${project.id}/boq`);
  const vendors = (await api<{ items: Vendor[] }>(token, '/vendors?kinds=SUBCONTRACTOR&pageSize=100')).items;
  const vendor = (name: string) => vendors.find((v) => v.name === name)!;
  return { project, brick: boq.find((b) => b.itemNo === '4.01')!, plaster: boq.find((b) => b.itemNo === '5.01')!, kalinga: vendor('Kalinga Builders'), utkal: vendor('Utkal Shuttering Works') };
}

/**
 * Subcontract enquiries (v6 item 111): management sends brickwork and an own item to two subcontractors from Purchases,
 * enters one quote on the page and the other comes in lower, then awards the higher one: a reason is asked for, and the
 * award opens the draft work order it made at that quote's rates.
 */
test('an enquiry is quoted, compared and the chosen quote becomes a work order', async ({ page }) => {
  const md = await apiToken('md@demo.com');
  const d = await demo(md);
  const title = `E2E brickwork ${Date.now()}`;

  await signIn(page, 'md@demo.com');
  await page.goto('/subcontract-enquiries');
  await expect(page.getByRole('heading', { level: 1, name: 'Subcontract enquiries' })).toBeVisible();
  await page.getByRole('button', { name: 'New enquiry' }).first().click();
  const form = page.locator('.ant-drawer-open').filter({ hasText: 'New subcontract enquiry' });
  await chooseOption(form.getByLabel('Project'), 'BL-2026-02');
  await form.getByLabel('Work', { exact: true }).fill(title);
  await chooseOption(form.getByLabel('BOQ item of line 1'), '4.01');
  await form.getByLabel('Quantity of line 1').fill('10');
  await form.getByRole('button', { name: 'Add item' }).click();
  await form.getByLabel('Description of line 2').fill('Curing, all floors');
  await form.getByLabel('Unit of line 2').fill('LS');
  await form.getByLabel('Quantity of line 2').fill('1');
  await chooseOption(form.getByLabel('Subcontractors'), 'Kalinga Builders');
  await chooseOption(form.getByLabel('Subcontractors'), 'Utkal Shuttering');
  await form.getByRole('button', { name: 'Create enquiry' }).click();
  await expect(page.getByText(/Enquiry SCE-\d{4}-\d{4} created/)).toBeVisible();
  await expect(page).toHaveURL(/\/subcontract-enquiries\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  const id = page.url().split('/').pop()!;
  const made = await api<Enquiry>(md, `/subcontract-enquiries/${id}`);
  expect(made.items.map((i) => i.itemNo)).toEqual(['4.01', null]);
  expect(made.quotes).toHaveLength(2);

  try {
    // Kalinga's quote from the page: ₹ 5,400 a cum and ₹ 3,000 for the curing, so ₹ 57,000.
    await page.getByRole('button', { name: 'Enter quote from Kalinga Builders' }).click();
    const drawer = page.locator('.ant-drawer-open').filter({ hasText: 'Enter quote · Kalinga Builders' });
    await drawer.getByLabel(/^Rate for Brick masonry/).fill('5400');
    await drawer.getByLabel('Rate for Curing, all floors').fill('3000');
    await drawer.getByRole('button', { name: 'Save quote' }).click();
    await expect(page.getByText('Quote from Kalinga Builders saved')).toBeVisible();

    // Utkal's comes in lower (₹ 52,500) and takes L1.
    const utkal = made.quotes.find((q) => q.vendorId === d.utkal.id)!;
    const brickItem = made.items.find((i) => i.itemNo === '4.01')!.id;
    const curingItem = made.items.find((i) => i.itemNo === null)!.id;
    await api(md, `/subcontract-enquiries/${id}/quotes/${utkal.id}`, { method: 'PUT', body: { receivedOn: new Date().toISOString().slice(0, 10), gstRate: '18', rates: [{ itemId: brickItem, rate: '5000' }, { itemId: curingItem, rate: '2500' }] } });
    await page.reload();
    await expect(page.getByRole('columnheader', { name: /Utkal Shuttering Works\s*L1/ })).toBeVisible();

    // Awarding Kalinga (L2) asks why.
    await page.getByRole('button', { name: 'Award to Kalinga Builders' }).click();
    const award = page.locator('.ant-modal').filter({ hasText: 'Award ·' });
    await expect(award.getByRole('radio', { name: /Kalinga Builders/ })).toBeChecked();
    await award.getByRole('button', { name: 'Award and make the work order' }).click();
    await expect(award.getByText('Say why this quote is chosen over the lowest', { exact: true })).toBeVisible();
    await award.getByLabel('Why this quote').fill('Utkal has no masons free this month');
    await award.getByRole('button', { name: 'Award and make the work order' }).click();
    await expect(page.getByText(/Awarded: draft work order WO-\d{4}-\d{4} made/)).toBeVisible();
    await expect(page).toHaveURL(/\/work-orders\/[0-9a-f-]{36}$/);

    const done = await api<Enquiry>(md, `/subcontract-enquiries/${id}`);
    expect(done.status).toBe('AWARDED');
    expect(done.decisionNote).toBe('Utkal has no masons free this month');
    expect(done.quotes.find((q) => q.awarded)?.vendorId).toBe(d.kalinga.id);
    const wo = await api<{ status: string; vendorId: string; value: string; lines: { boqItemId: string | null; rate: string }[] }>(md, `/work-orders/${done.workOrderId}`);
    expect(wo.status).toBe('DRAFT');
    expect(wo.vendorId).toBe(d.kalinga.id);
    expect(Number(wo.value)).toBe(57000);
    expect(wo.lines.find((l) => l.boqItemId === d.brick.id)?.rate).toBe('5400.00');
    if (done.workOrderId) await api(md, `/work-orders/${done.workOrderId}`, { method: 'DELETE' });
  } finally {
    await call(md, 'DELETE', `/subcontract-enquiries/${id}`);
  }
});

/** The rules through the API: items lock once rates are in, only a complete quote is awarded, an award holds once. */
test('items lock with a quote in, only complete quotes are awarded, and others are refused', async () => {
  const md = await apiToken('md@demo.com');
  const d = await demo(md);
  const made = await api<Enquiry>(md, '/subcontract-enquiries', {
    method: 'POST',
    body: { projectId: d.project.id, title: `E2E plaster ${Date.now()}`, items: [{ boqItemId: d.plaster.id, quantity: '100' }, { boqItemId: d.brick.id, quantity: '5' }], vendorIds: [d.kalinga.id, d.utkal.id] },
  });
  const id = made.id;
  try {
    const [plaster, brick] = [made.items.find((i) => i.boqItemId === d.plaster.id)!.id, made.items.find((i) => i.boqItemId === d.brick.id)!.id];
    const q = (vendor: string) => made.quotes.find((x) => x.vendorId === vendor)!.id;
    const today = new Date().toISOString().slice(0, 10);
    // A BOQ item once only.
    expect((await call(md, 'POST', '/subcontract-enquiries', { projectId: d.project.id, title: 'Twice', items: [{ boqItemId: d.brick.id, quantity: '1' }, { boqItemId: d.brick.id, quantity: '2' }] })).status).toBe(400);
    // Kalinga prices only the plaster: not ranked, not awardable.
    await api(md, `/subcontract-enquiries/${id}/quotes/${q(d.kalinga.id)}`, { method: 'PUT', body: { receivedOn: today, gstRate: '18', rates: [{ itemId: plaster, rate: '180' }] } });
    const partial = await call(md, 'POST', `/subcontract-enquiries/${id}/award`, { quoteId: q(d.kalinga.id), note: 'x' });
    expect(partial.status).toBe(409);
    expect(await partial.text()).toMatch(/every item/);
    // With rates in, the items stay as they are.
    expect((await call(md, 'PATCH', `/subcontract-enquiries/${id}`, { items: [{ boqItemId: d.brick.id, quantity: '6' }] })).status).toBe(409);
    // Utkal prices both and is L1; the lowest needs no reason.
    await api(md, `/subcontract-enquiries/${id}/quotes/${q(d.utkal.id)}`, { method: 'PUT', body: { receivedOn: today, gstRate: '12', rates: [{ itemId: plaster, rate: '190' }, { itemId: brick, rate: '5100' }] } });
    const ranked = await api<Enquiry>(md, `/subcontract-enquiries/${id}`);
    const lowest = ranked.quotes.find((x) => x.vendorId === d.utkal.id)!;
    expect(lowest.rank).toBe(1);
    expect(lowest.total).toBe('44500.00');
    expect(ranked.quotes.find((x) => x.vendorId === d.kalinga.id)!.rank).toBeNull();
    // The plaster's lowest rate is Kalinga's partial one: each item compares every rate received.
    expect(ranked.items.find((i) => i.id === plaster)!.lowestQuoteIds).toEqual([q(d.kalinga.id)]);

    // Who may not: a site engineer reads no enquiry.
    const engineer = await apiToken('engineer@demo.com');
    expect((await call(engineer, 'GET', '/subcontract-enquiries')).status).toBe(403);
    expect((await call(engineer, 'GET', `/subcontract-enquiries/${id}`)).status).toBe(403);

    const award = await api<{ workOrderId: string; woNo: string }>(md, `/subcontract-enquiries/${id}/award`, { method: 'POST', body: { quoteId: lowest.id } });
    expect(award.woNo).toMatch(/^WO-\d{4}-\d{4}$/);
    expect((await call(md, 'POST', `/subcontract-enquiries/${id}/award`, { quoteId: lowest.id })).status).toBe(409);
    expect((await call(md, 'DELETE', `/subcontract-enquiries/${id}`)).status).toBe(409);
    const wo = await api<{ gstRate: string; value: string }>(md, `/work-orders/${award.workOrderId}`);
    expect(Number(wo.gstRate)).toBe(12);
    expect(wo.value).toBe('44500.00');
    // Its work order deleted, the enquiry can be awarded again; it stays awarded meanwhile.
    await api(md, `/work-orders/${award.workOrderId}`, { method: 'DELETE' });
    const orphan = await api<Enquiry>(md, `/subcontract-enquiries/${id}`);
    expect(orphan.status).toBe('AWARDED');
    expect(orphan.workOrderId).toBeNull();
  } finally {
    await call(md, 'DELETE', `/subcontract-enquiries/${id}`);
  }
});
