import { expect, test, type Page } from '@playwright/test';
import type { BookVoucherDto, DepreciationRunDetailDto, DepreciationRunDto, EquipmentDto, FixedAssetDetailDto, FixedAssetListDto, ProfitLossDto } from '../../packages/shared/src';
import { bookDepreciation, type DepreciableAsset } from '../../packages/shared/src/fixed-assets';
import { API_URL, api, apiToken, chooseOption, formPanel, localToday, signIn } from './helpers';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const typed = (d: string) => `${d.slice(8, 10)} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
const today = localToday();
const lastFrom = (() => {
  const [y, m] = today.split('-').map(Number);
  return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`;
})();
const lastTo = new Date(Date.UTC(Number(lastFrom.slice(0, 4)), Number(lastFrom.slice(5, 7)), 0)).toISOString().slice(0, 10);
const fyFrom = `${Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 4 ? 1 : 0)}-04-01`;
const lastLabel = new Date(`${lastFrom}T00:00:00Z`).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

type Page_<T> = { items: T[] };
const send = (token: string, method: string, path: string, body?: unknown) =>
  fetch(`${API_URL}${path}`, { method, headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
const schedule = (a: FixedAssetDetailDto): DepreciableAsset => ({
  cost: Number(a.cost),
  residual: Number(a.residual),
  lifeYears: a.lifeYears,
  method: a.method,
  putToUseOn: a.putToUseOn,
  opening: a.openingAsOf ? { asOf: a.openingAsOf, amount: Number(a.openingDepreciation) } : null,
  disposedOn: a.disposedOn,
});

/** A picture of the page for the review, kept with the test's output. */
const shot = (page: Page, name: string) => page.screenshot({ path: test.info().outputPath(name), fullPage: true });

test.describe.configure({ mode: 'serial' });

let accounts: string;
let md: string;
let computer: FixedAssetDetailDto;
let run: DepreciationRunDetailDto;

/**
 * The spec leaves the demo as it found it and can run again: last month's run comes out (latest first), the lock comes
 * off, and the assets an earlier run made and never charged go.
 */
test.beforeAll(async () => {
  accounts = await apiToken('accounts@demo.com');
  md = await apiToken('md@demo.com');
  await api(md, '/statements/lock', { method: 'PUT', body: { lockedUpTo: null } });
  for (const r of await api<DepreciationRunDto[]>(accounts, '/fixed-assets/runs')) {
    if (r.to < lastFrom) continue;
    if (r.status === 'POSTED') await api(accounts, `/fixed-assets/runs/${r.id}/undo-post`, { method: 'POST' });
    await api(accounts, `/fixed-assets/runs/${r.id}`, { method: 'DELETE' });
  }
  const mine = await api<FixedAssetListDto>(accounts, '/fixed-assets?status=ACTIVE&pageSize=100&q=E2E');
  const machine = await api<FixedAssetListDto>(accounts, '/fixed-assets?status=ACTIVE&pageSize=100&q=WS-DG-01');
  for (const a of [...mine.items, ...machine.items]) if (!a.charged) await api(accounts, `/fixed-assets/${a.id}`, { method: 'DELETE' });
});

test.afterAll(async () => {
  await api(md, '/statements/lock', { method: 'PUT', body: { lockedUpTo: null } });
});

test('lane 2: accounts add a computer at 60000 for 3 years from 1 April, at its full cost and numbered in the FA series', async ({ page }) => {
  const projects = (await api<Page_<{ id: string; code: string; name: string }>>(accounts, '/projects?pageSize=100')).items;
  const road = projects.find((p) => p.code === 'RD-2026-01')!;
  await signIn(page, 'accounts@demo.com');
  await page.goto('/fixed-assets');
  await expect(page.getByRole('heading', { level: 1, name: 'Fixed assets' })).toBeVisible();
  await expect(page.getByText('Equals the balance sheet’s property, plant and equipment today.')).toBeVisible();
  await page.getByRole('button', { name: 'New fixed asset' }).first().click();
  const form = formPanel(page, 'New fixed asset');
  await form.getByLabel('Name').fill(`E2E site laptop ${Date.now()}`);
  await chooseOption(form.getByLabel('Class'), 'Computers');
  await expect(form.getByLabel('Useful life')).toHaveValue('3');
  await chooseOption(form.getByLabel('Where it is'), road.name);
  await form.getByRole('spinbutton', { name: /Cost$/ }).fill('60000');
  await form.getByRole('spinbutton', { name: /Cost$/ }).blur();
  await form.getByLabel('Put to use on').fill(typed(fyFrom));
  await form.getByLabel('Put to use on').press('Enter');
  await form.getByRole('button', { name: 'Add asset' }).click();
  await expect(page).toHaveURL(/\/fixed-assets\/[0-9a-f-]{36}$/);
  const id = page.url().split('/').pop()!;
  computer = await api<FixedAssetDetailDto>(accounts, `/fixed-assets/${id}`);
  expect(computer.assetNo).toMatch(/^FA-\d{4}-\d{4}$/);
  expect(computer).toMatchObject({ cost: '60000.00', residual: '3000.00', lifeYears: 3, method: 'SLM', bookValue: '60000.00', putToUseOn: fyFrom, projectId: road.id });
  await expect(page.getByRole('heading', { level: 1 })).toContainText(computer.assetNo);
  await expect(page.getByText(/₹\s?60,000/).first()).toBeVisible();
  await shot(page, 'fa-new.png');
});

test('lane 3: an owned machine becomes an asset from Plant, and a hired one offers no Make fixed asset', async ({ page }) => {
  const fleet = (await api<Page_<EquipmentDto>>(accounts, '/equipment?pageSize=100')).items;
  const owned = fleet.find((e) => e.code === 'WS-DG-01')!;
  const hired = fleet.find((e) => e.ownership === 'HIRED')!;
  expect(owned.asset ?? null).toBeNull();
  await signIn(page, 'accounts@demo.com');
  await page.goto('/machinery?tab=equipment');
  await expect(page.getByRole('cell', { name: hired.code, exact: true })).toBeVisible();
  // Accounts manage no machine, so a hired one has no actions at all; where it has some, Make fixed asset is not one.
  const hiredMenu = page.getByRole('button', { name: `Actions for ${hired.code}` });
  if (await hiredMenu.count()) {
    await hiredMenu.click();
    await expect(page.getByRole('menuitem', { name: 'Make fixed asset' })).toHaveCount(0);
    await page.keyboard.press('Escape');
  }
  await page.getByRole('button', { name: `Actions for ${owned.code}` }).click();
  await page.getByRole('menuitem', { name: 'Make fixed asset' }).click();
  const form = formPanel(page, `Make asset · ${owned.code}`);
  await expect(form.getByLabel('Name')).toHaveValue(`${owned.code} ${owned.name}`);
  await chooseOption(form.getByLabel('Class'), 'Plant and machinery');
  await form.getByRole('spinbutton', { name: /Cost$/ }).fill('780000');
  await form.getByRole('spinbutton', { name: /Cost$/ }).blur();
  await form.getByLabel('Put to use on').fill(typed(fyFrom));
  await form.getByLabel('Put to use on').press('Enter');
  await form.getByRole('button', { name: 'Add asset' }).click();
  await expect(page).toHaveURL(/\/fixed-assets\/[0-9a-f-]{36}$/);
  const made = await api<FixedAssetDetailDto>(accounts, `/fixed-assets/${page.url().split('/').pop()}`);
  expect(made).toMatchObject({ equipmentId: owned.id, equipmentCode: owned.code, fundedBy: 'IN_BOOKS', projectId: owned.projectId });
  await page.getByRole('button', { name: /^Details \(\d+\)/ }).click();
  await expect(page.getByRole('link', { name: owned.code })).toBeVisible();
  await shot(page, 'fa-from-machine.png');

  const again = await send(accounts, 'POST', '/fixed-assets', { name: 'Twice', assetClass: 'PLANT_GENERAL', cost: 1000, putToUseOn: fyFrom, fundedBy: 'IN_BOOKS', equipmentId: owned.id });
  expect(again.status).toBe(409);
  const refused = await send(accounts, 'POST', '/fixed-assets', { name: 'Hired', assetClass: 'EARTH_MOVING', cost: 1000, putToUseOn: fyFrom, fundedBy: 'IN_BOOKS', equipmentId: hired.id });
  expect(refused.status).toBe(400);
  expect((await refused.json()).message).toContain('is hired');
});

test('lane 4: last month’s run is prepared as a draft, each line the schedule’s charge and the total shown', async ({ page }) => {
  await signIn(page, 'accounts@demo.com');
  await page.goto('/fixed-assets?tab=runs');
  await page.getByRole('button', { name: 'Prepare depreciation' }).first().click();
  const form = formPanel(page, 'Prepare depreciation');
  await form.getByRole('button', { name: 'Prepare run' }).click();
  await expect(page).toHaveURL(/\/fixed-assets\/runs\/[0-9a-f-]{36}$/);
  run = await api<DepreciationRunDetailDto>(accounts, `/fixed-assets/runs/${page.url().split('/').pop()}`);
  expect(run).toMatchObject({ from: lastFrom, to: lastTo, status: 'DRAFT', period: lastLabel, postProblem: null });
  expect(run.lines.length).toBeGreaterThan(3);
  for (const l of run.lines) {
    const a = await api<FixedAssetDetailDto>(accounts, `/fixed-assets/${l.assetId}`);
    expect(Number(l.amount), `${a.assetNo} ${l.from} to ${l.to}`).toBeCloseTo(bookDepreciation(schedule(a), l.from, l.to), 2);
  }
  // The computer was entered after April to the month before were posted: its line catches up from 1 April.
  const caught = run.lines.find((l) => l.assetId === computer.id)!;
  expect(caught.from).toBe(fyFrom);
  expect(Number(caught.amount)).toBeCloseTo(bookDepreciation(schedule(computer), fyFrom, lastTo), 2);
  expect(Number(run.total)).toBeCloseTo(run.lines.reduce((s, l) => s + Number(l.amount), 0), 2);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(`Depreciation · ${lastLabel}`);
  await expect(page.getByRole('button', { name: /^Post ₹/ })).toBeEnabled();
  await expect(page.getByRole('row').filter({ hasText: computer.assetNo }).getByText('caught up')).toBeVisible();
  await shot(page, 'fa-run-draft.png');
});

test('lane 8: with the books locked at last month’s end the run cannot post, and the lock is named', async ({ page }) => {
  await api(md, '/statements/lock', { method: 'PUT', body: { lockedUpTo: lastTo } });
  const refused = await send(accounts, 'POST', `/fixed-assets/runs/${run.id}/post`);
  expect(refused.status).toBe(400);
  expect((await refused.json()).message).toMatch(/The books are locked up to .*, so depreciation for .* cannot go in/);
  await signIn(page, 'accounts@demo.com');
  await page.goto(`/fixed-assets/runs/${run.id}`);
  await expect(page.getByText('It cannot be posted yet')).toBeVisible();
  await expect(page.getByText(/The books are locked up to/)).toBeVisible();
  await expect(page.getByRole('button', { name: /^Post ₹/ })).toBeDisabled();
  await shot(page, 'fa-locked.png');
  await api(md, '/statements/lock', { method: 'PUT', body: { lockedUpTo: null } });
  expect((await api<DepreciationRunDetailDto>(accounts, `/fixed-assets/runs/${run.id}`)).status).toBe('DRAFT');
});

test('lane 5: the run posts as one balanced journal in the day book, and cannot post twice', async ({ page }) => {
  await signIn(page, 'accounts@demo.com');
  await page.goto(`/fixed-assets/runs/${run.id}`);
  await page.getByRole('button', { name: /^Post ₹/ }).click();
  await expect(page.getByText(new RegExp(`Depreciation for ${lastLabel} is in the books`))).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo posting' })).toBeVisible();
  const posted = await api<DepreciationRunDetailDto>(accounts, `/fixed-assets/runs/${run.id}`);
  expect(posted.status).toBe('POSTED');
  const book = await api<Page_<BookVoucherDto>>(accounts, '/books/day-book?source=DEPRECIATION&pageSize=100');
  const mine = book.items.filter((v) => v.sourceId === run.id);
  expect(mine).toHaveLength(1);
  const v = mine[0];
  expect(v).toMatchObject({ type: 'JOURNAL', date: lastTo, narration: `Depreciation for ${lastLabel}`, projectId: null });
  const dr = v.lines.reduce((s, l) => s + Number(l.debit ?? 0), 0);
  const cr = v.lines.reduce((s, l) => s + Number(l.credit ?? 0), 0);
  expect(dr).toBeCloseTo(cr, 2);
  expect(dr).toBeCloseTo(Number(posted.total), 2);
  expect(v.lines.find((l) => l.debit)?.accountName).toBe('Depreciation');
  expect(v.lines.find((l) => l.credit)?.accountName).toBe('Accumulated Depreciation');
  await expect(page.getByText(posted.voucherNo!, { exact: true })).toBeVisible();
  await shot(page, 'fa-run-posted.png');

  const twice = await send(accounts, 'POST', `/fixed-assets/runs/${run.id}/post`);
  expect(twice.status).toBe(409);
  expect((await twice.json()).message).toBe(`Depreciation for ${lastLabel} is already in the books`);
  const register = await api<FixedAssetListDto>(accounts, '/fixed-assets?pageSize=1');
  const check = await api<{ register: string; ppe: string }>(accounts, '/fixed-assets/books-check');
  expect(check.register).toBe(register.summary.bookValue);
});

test('lane 1: profit and loss shows the posted depreciation on its own line', async ({ page }) => {
  const runs = await api<DepreciationRunDto[]>(accounts, '/fixed-assets/runs');
  const inYear = runs.filter((r) => r.status === 'POSTED' && r.from >= fyFrom).reduce((s, r) => s + Number(r.total), 0);
  const pl = await api<ProfitLossDto>(accounts, `/statements/profit-loss?from=${fyFrom}&to=${today}`);
  const line = pl.expenses.find((e) => e.line === 'DEPRECIATION')!;
  expect(Number(line.amount)).toBeCloseTo(inYear, 2);
  await signIn(page, 'accounts@demo.com');
  await page.goto('/statements?tab=pl');
  await expect(page.getByRole('cell', { name: 'Depreciation and amortisation expense' })).toBeVisible();
  await shot(page, 'fa-pl.png');
});

test('lane 6: a move to another site is kept with both sites and the day', async ({ page }) => {
  const projects = (await api<Page_<{ id: string; code: string; name: string }>>(accounts, '/projects?pageSize=100')).items;
  const hospital = projects.find((p) => p.code === 'BL-2026-02')!;
  await signIn(page, 'accounts@demo.com');
  await page.goto(`/fixed-assets/${computer.id}`);
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  const form = formPanel(page, `Move · ${computer.assetNo}`);
  await chooseOption(form.getByLabel('Move to'), hospital.name);
  await form.getByRole('button', { name: 'Move asset' }).click();
  await expect(page.getByText(`${computer.assetNo} moved to ${hospital.name}`)).toBeVisible();
  const moved = await api<FixedAssetDetailDto>(accounts, `/fixed-assets/${computer.id}`);
  expect(moved.projectId).toBe(hospital.id);
  expect(moved.transfers[0]).toMatchObject({ on: today, fromName: computer.projectName, toName: hospital.name });
  const row = page.getByRole('row').filter({ hasText: hospital.name });
  await expect(row.getByText(computer.projectName!)).toBeVisible();
  await expect(row.getByText(typed(today))).toBeVisible();
  await shot(page, 'fa-transfer.png');
});

test('lane 7: sold below its book value, the asset reads Disposed and its voucher books the loss', async ({ page }) => {
  const before = await api<FixedAssetDetailDto>(accounts, `/fixed-assets/${computer.id}`);
  const proceeds = 20000;
  const loss = Number(before.bookValue) - proceeds;
  expect(loss).toBeGreaterThan(0);
  await signIn(page, 'accounts@demo.com');
  await page.goto(`/fixed-assets/${computer.id}`);
  await page.getByRole('button', { name: 'Sell or scrap' }).click();
  const form = formPanel(page, `Sell or scrap · ${computer.assetNo}`);
  await form.getByLabel('It fetched').fill(String(proceeds));
  await form.getByLabel('It fetched').blur();
  await expect(form.getByText(/a loss of ₹/)).toBeVisible();
  await form.getByRole('button', { name: 'Dispose of asset' }).click();
  await expect(page.getByText(`${computer.assetNo} disposed`)).toBeVisible();
  await expect(page.locator('.ant-tag').filter({ hasText: 'Disposed' }).first()).toBeVisible();
  const gone = await api<FixedAssetDetailDto>(accounts, `/fixed-assets/${computer.id}`);
  expect(gone).toMatchObject({ status: 'DISPOSED', disposedOn: today, bookValue: '0.00' });
  expect(Number(gone.disposalResult)).toBeCloseTo(-loss, 2);
  const book = await api<Page_<BookVoucherDto>>(accounts, '/books/day-book?source=ASSET_DISPOSAL&pageSize=100');
  const v = book.items.find((x) => x.sourceId === computer.id)!;
  expect(v.type).toBe('RECEIPT');
  expect(Number(v.lines.find((l) => /loss/i.test(l.accountName))?.debit)).toBeCloseTo(loss, 2);
  expect(v.lines.reduce((s, l) => s + Number(l.debit ?? 0) - Number(l.credit ?? 0), 0)).toBeCloseTo(0, 2);
  await shot(page, 'fa-dispose.png');
});

test('lane 9: a site engineer has no register in the menu and its API refuses', async ({ page }) => {
  const engineer = await apiToken('engineer@demo.com');
  for (const path of ['/fixed-assets', '/fixed-assets/runs', '/fixed-assets/books-check']) expect((await send(engineer, 'GET', path)).status).toBe(403);
  await signIn(page, 'engineer@demo.com');
  await expect(page.getByRole('link', { name: 'Fixed assets' })).toHaveCount(0);
  await page.goto('/fixed-assets');
  await expect(page.getByText('The fixed asset register is kept by accounts')).toBeVisible();
  await shot(page, 'fa-engineer.png');
});
