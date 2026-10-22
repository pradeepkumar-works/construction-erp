import { expect, test } from '@playwright/test';
import { API_URL, api, apiToken, chooseOption, localToday, signIn } from './helpers';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
/** YYYY-MM-DD as the date pickers take it: DD MMM YYYY. */
const typed = (d: string) => `${d.slice(8, 10)} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
const inr = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type SorItem = { id: string; code: string; rate: string };
type Bid = { id: string | null; bidderName: string; amount: string; rank: number; us: boolean };
type Tender = {
  id: string;
  tenderNo: string;
  status: string;
  sorBookId: string | null;
  quotedAmount: string | null;
  rank: number | null;
  bids: Bid[];
  items: { id: string; itemNo: string; quotedRate: string | null; lines: unknown[] }[];
  totals: { sorAmount: string | null; quotedAmount: string | null; quotedPct: string | null; analysedCount: number };
  emd: { id: string; status: string } | null;
};

const post = (token: string, path: string, body: unknown = {}) =>
  fetch(`${API_URL}${path}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });

/**
 * Tender bidding (v6 item 110): the QS records a tender from Tenders, adds a bid item from the schedule of rates,
 * quotes 2% below the SOR and records the bid submitted; the quote is the SOR value less 2%.
 */
test('the QS records a tender, prices an item from the SOR, quotes below it and submits', async ({ page }) => {
  const qs = await apiToken('qs@demo.com');
  const title = `E2E road ${Date.now()}`;
  const today = localToday();

  await signIn(page, 'qs@demo.com');
  await page.goto('/tenders');
  await expect(page.getByRole('heading', { level: 1, name: 'Tenders' })).toBeVisible();
  await page.getByRole('button', { name: 'Record tender' }).first().click();
  const form = page.locator('.ant-drawer-open').filter({ hasText: 'New tender' });
  await form.getByLabel('Name of work').fill(title);
  await form.getByLabel('NIT number').fill('E2E/NIT/1');
  await form.getByLabel('Submit by').fill(typed(shift(today, 10)));
  await form.getByLabel('Submit by').press('Enter');
  await form.getByRole('button', { name: 'Record tender' }).click();
  await expect(page.getByText(/Tender TND-\d{4}-\d{4} recorded: price its bid BOQ next/)).toBeVisible();
  await expect(page).toHaveURL(/\/tenders\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  const id = page.url().split('/').pop()!;
  const fresh = await api<Tender>(qs, `/tenders/${id}`);
  expect(fresh.status).toBe('PREPARING');
  const sor = (await api<{ items: SorItem[] }>(qs, `/sor-items?bookId=${fresh.sorBookId}&q=5.3`)).items.find((i) => i.code === '5.3')!;
  const rate = Number(sor.rate);

  await page.getByRole('button', { name: 'Add item' }).click();
  const drawer = page.locator('.ant-drawer-open').filter({ hasText: 'Add a bid item' });
  await chooseOption(drawer.getByLabel('SOR item'), '5.3');
  await expect(drawer.getByLabel('Description')).toHaveValue(/RCC M25/);
  await drawer.getByLabel('Quantity').fill('100');
  await drawer.getByRole('button', { name: 'Add item' }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByRole('button', { name: /RCC M25/ })).toBeVisible();

  await page.getByLabel('Percentage on the SOR (minus for below)').fill('-2');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Quoting 2.00% below the SOR').first()).toBeVisible();
  const quote = Math.round(rate * 100 * 0.98 * 100) / 100;
  await expect(page.getByText(new RegExp(`₹\\s?${inr(quote).replace(/[.,]/g, (c) => `\\${c}`)}`)).first()).toBeVisible();

  await page.getByRole('button', { name: 'Record bid submitted' }).click();
  const submit = page.locator('.ant-modal').filter({ hasText: 'Record bid submitted' });
  await submit.getByRole('button', { name: 'Record submitted' }).click();
  await expect(page.getByText(/Bid for TND-\d{4}-\d{4} recorded as submitted/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Record won' })).toBeVisible();

  const done = await api<Tender>(qs, `/tenders/${id}`);
  expect(done.status).toBe('SUBMITTED');
  expect(done.totals.quotedPct).toBe('-2.00');
  expect(Number(done.quotedAmount)).toBeCloseTo(quote, 2);
  // Its pricing is fixed once the bid is in.
  expect((await fetch(`${API_URL}/tenders/${id}`, { method: 'PATCH', headers: { authorization: `Bearer ${qs}`, 'content-type': 'application/json' }, body: JSON.stringify({ quotedPct: -5 }) })).status).toBe(409);
  // Tidy up: back to preparing, then delete.
  expect((await post(qs, `/tenders/${id}/status`, { status: 'PREPARING', on: today })).status).toBe(201);
  expect((await fetch(`${API_URL}/tenders/${id}`, { method: 'DELETE', headers: { authorization: `Bearer ${qs}` } })).status).toBe(200);
});

/**
 * The bids at opening rank ours among the others; a result needs the bid in first; a won tender becomes a project with
 * its BOQ at the quoted rates and the EMD moved to it, once; site staff cannot see tenders.
 */
test('bids rank at opening, a won tender becomes a project once, and site staff are kept out', async () => {
  const qs = await apiToken('qs@demo.com');
  const md = await apiToken('md@demo.com');
  const engineer = await apiToken('engineer@demo.com');
  const today = localToday();
  const books = await api<{ id: string; name: string }[]>(qs, '/sor-books');
  const book = books.find((b) => b.name.startsWith('Odisha'))!;
  const sor = (await api<{ items: SorItem[] }>(qs, `/sor-items?bookId=${book.id}&q=2.1`)).items.find((i) => i.code === '2.1')!;

  const t = await api<Tender>(qs, '/tenders', {
    method: 'POST',
    body: { title: `E2E culvert ${Date.now()}`, clientName: 'E2E Division', bidType: 'PERCENTAGE', sorBookId: book.id, submitBy: shift(today, 5), overheadPct: 10, profitPct: 8, emdAmount: 25000, emdReference: `E2E-DD-${Date.now()}` },
  });
  expect(t.emd?.status).toBe('ACTIVE');
  await api(qs, `/tenders/${t.id}/items`, { method: 'POST', body: { itemNo: '1', qty: 1000, sorItemId: sor.id } });
  await api(qs, `/tenders/${t.id}`, { method: 'PATCH', body: { quotedPct: -1 } });
  // A result before the bid is in is refused.
  expect((await post(qs, `/tenders/${t.id}/status`, { status: 'WON', on: today })).status).toBe(409);
  await api(qs, `/tenders/${t.id}/submit`, { method: 'POST', body: { submittedOn: today } });

  await api(qs, `/tenders/${t.id}/bids`, { method: 'POST', body: { bidderName: 'E2E Lower', pct: -3 } });
  await api(qs, `/tenders/${t.id}/bids`, { method: 'POST', body: { bidderName: 'E2E Higher', pct: 4 } });
  const ranked = await api<Tender>(qs, `/tenders/${t.id}`);
  expect(ranked.rank).toBe(2);
  expect(ranked.bids.map((b) => [b.bidderName, b.rank])).toEqual([
    ['E2E Lower', 1],
    [ranked.bids[1].bidderName, 2],
    ['E2E Higher', 3],
  ]);
  expect(ranked.bids[1].us).toBe(true);

  await api(qs, `/tenders/${t.id}/status`, { method: 'POST', body: { status: 'WON', on: today, note: 'L1 withdrew' } });
  // The QS prices; admin and management open projects.
  expect((await post(qs, `/tenders/${t.id}/project`, { code: 'E2E-X', type: 'ROAD' })).status).toBe(403);
  const code = `E2E-T${String(Date.now()).slice(-6)}`;
  const made = await api<{ projectId: string; projectCode: string }>(md, `/tenders/${t.id}/project`, { method: 'POST', body: { code, type: 'ROAD', startDate: today } });
  expect(made.projectCode).toBe(code);
  const boq = await api<{ itemNo?: string; rate: string; quantity?: string; qty?: string }[] | { items: { rate: string }[] }>(md, `/projects/${made.projectId}/boq`);
  const rows = Array.isArray(boq) ? boq : boq.items;
  expect(rows).toHaveLength(1);
  expect(Number(rows[0].rate)).toBeCloseTo(Math.round(Number(sor.rate) * 0.99 * 100) / 100, 2);
  const after = await api<Tender & { projectId: string }>(qs, `/tenders/${t.id}`);
  expect(after.projectId).toBe(made.projectId);
  // Once only.
  expect((await post(md, `/tenders/${t.id}/project`, { code: `${code}B`, type: 'ROAD' })).status).toBe(409);

  expect((await fetch(`${API_URL}/tenders`, { headers: { authorization: `Bearer ${engineer}` } })).status).toBe(403);
  expect((await fetch(`${API_URL}/sor-books`, { headers: { authorization: `Bearer ${engineer}` } })).status).toBe(403);
});
