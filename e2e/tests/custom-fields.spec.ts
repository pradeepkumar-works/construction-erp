import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import * as XLSX from 'xlsx';
import type { CustomFieldDto, DailyReportDto, ProjectDetail, PurchaseOrderDto, VendorDto } from '../../packages/shared/src';
import { API_URL, PASSWORD, api, apiToken, axeViolations, formPanel, measureTargets, pageOverflow, setAppearance, settle, signIn } from './helpers';

/**
 * A company's own fields (ARCHITECTURE "Custom fields"): an admin adds them in Company settings › Fields, and vendors,
 * projects and purchase orders ask for them, keep them, show them and export them. Everything happens in a company of
 * its own, so the demo data stays as it is. `CF_TRUNK_API` (another API at trunk on the same database) makes lane 1 file
 * the same DPR there and compare; `CF_SHOTS` is where the screenshots go.
 */
test.describe.configure({ mode: 'serial' });

const stamp = Date.now();
const admin = { email: `cf-admin-${stamp}@e2e.test`, token: '' };
const buyer = { email: `cf-buyer-${stamp}@e2e.test`, token: '' };
let roadId = '';
let road2Id = '';
let vendorId = '';
let orderId = '';

const shot = async (page: Page, info: TestInfo, name: string) => page.screenshot({ path: process.env.CF_SHOTS ? path.join(process.env.CF_SHOTS, name) : info.outputPath(name), fullPage: true, animations: 'disabled' });

async function raw(token: string, p: string, method: string, body?: unknown) {
  return fetch(`${API_URL}${p}`, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

test.beforeAll(async () => {
  const res = await fetch(`${API_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ organizationName: `E2E Custom fields ${stamp}`, fullName: 'Asha Admin', email: admin.email, password: PASSWORD }),
  });
  expect(res.ok).toBe(true);
  admin.token = await apiToken(admin.email);
  await api(admin.token, '/users', { method: 'POST', body: { email: buyer.email, fullName: 'Bikash Buyer', roleKey: 'PROCUREMENT_MANAGER', password: PASSWORD } });
  buyer.token = await apiToken(buyer.email);
  roadId = (await api<ProjectDetail>(admin.token, '/projects', { method: 'POST', body: { code: 'CF-01', name: 'E2E custom fields road', type: 'ROAD' } })).id;
  road2Id = (await api<ProjectDetail>(admin.token, '/projects', { method: 'POST', body: { code: 'CF-02', name: 'E2E custom fields bypass', type: 'ROAD' } })).id;
});

test("lane 1: a DPR's own fields save as they did before the lift", async ({ page }, info) => {
  const extra = { rainHours: '3.5', trafficDiversion: 'Yes', notAField: 'dropped' };
  const golden = { rainHours: 3.5, trafficDiversion: true };
  const file = async (base: string, projectId: string, date: string) => {
    const res = await fetch(`${base}/dpr`, {
      method: 'POST',
      headers: { authorization: `Bearer ${admin.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ projectId, date, workExecuted: 'Wet mix macadam laid, km 2.1 to 2.4', weather: 'SUNNY', extra, submit: false }),
    });
    expect(res.status, await res.clone().text()).toBe(201);
    return (await res.json()) as DailyReportDto;
  };
  const head = await file(API_URL, roadId, daysAgo(2));
  expect(head.extra).toEqual(golden);
  const bad = await raw(admin.token, '/dpr', 'POST', { projectId: roadId, date: daysAgo(3), workExecuted: 'Kerb', extra: { rainHours: 30 }, submit: false });
  expect(bad.status).toBe(400);
  expect(await bad.text()).toContain('Rain hours: enter a number from 0 to 24 h');
  if (process.env.CF_TRUNK_API) {
    const trunk = await file(process.env.CF_TRUNK_API, road2Id, daysAgo(2));
    expect(trunk.extra).toEqual(head.extra);
  }
  await signIn(page, admin.email);
  await settle(page, `/dpr/${head.id}`);
  await expect(page.getByText('3.5 h', { exact: true })).toBeVisible();
  await shot(page, info, 'cf-dpr.png');
});

test('lane 2: an admin adds an MSME number field to vendors', async ({ page }, info) => {
  await signIn(page, admin.email);
  await settle(page, '/company-settings?tab=fields');
  const vendors = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Vendors', exact: true }) });
  await vendors.getByRole('button', { name: 'New field' }).click();
  const dialog = formPanel(page, 'New field on vendors');
  await dialog.getByLabel('Name').fill('MSME number');
  await dialog.getByRole('button', { name: 'Save field' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('table', { name: 'Fields on vendors' }).getByRole('cell', { name: 'MSME number', exact: true })).toBeVisible();
  const fields = await api<CustomFieldDto[]>(admin.token, '/custom-fields?entity=VENDOR');
  expect(fields.map((f) => [f.key, f.kind, f.archived])).toEqual([['msmeNumber', 'TEXT', false]]);
  await shot(page, info, 'cf-add.png');
  await api(admin.token, '/custom-fields', { method: 'POST', body: { entity: 'VENDOR', label: 'Turnover', kind: 'NUMBER', unit: 'Cr', min: 0 } });
});

test('lane 3: a new vendor takes the field and its record shows it', async ({ page }, info) => {
  await signIn(page, admin.email);
  await settle(page, '/vendors');
  await page.getByRole('button', { name: 'New vendor' }).first().click();
  const form = formPanel(page, 'New vendor');
  await form.getByLabel('Vendor name').fill('Maa Tarini Traders');
  await expect(form.getByRole('heading', { name: 'More details' })).toBeVisible();
  await form.getByLabel('MSME number').fill('UDYAM-OD-19-0012345');
  await form.getByLabel('Turnover').fill('12.5');
  await form.getByRole('button', { name: 'Save vendor' }).click();
  await expect(form).toBeHidden();
  const v = (await api<{ items: VendorDto[] }>(admin.token, '/vendors?q=Tarini')).items[0];
  vendorId = v.id;
  expect(v.customValues).toEqual({ msmeNumber: 'UDYAM-OD-19-0012345', turnover: 12.5 });
  await page.getByRole('button', { name: 'Edit Maa Tarini Traders' }).click();
  const record = formPanel(page, 'Edit Maa Tarini Traders');
  await expect(record.getByLabel('MSME number')).toHaveValue('UDYAM-OD-19-0012345');
  await record.getByLabel('Turnover').scrollIntoViewIfNeeded();
  await shot(page, info, 'cf-vendor.png');
  await record.getByRole('button', { name: 'Cancel' }).click();
});

test('lane 4: the field is a list column and goes to Excel', async ({ page }, info) => {
  await signIn(page, admin.email);
  await settle(page, '/vendors');
  const header = page.locator('.ant-table-thead th').filter({ hasText: /^MSME number$/ });
  await expect(header).toHaveCount(0);
  await page.getByRole('button', { name: 'Columns' }).click();
  await page.getByRole('checkbox', { name: 'MSME number' }).check();
  await page.keyboard.press('Escape');
  await expect(header).toBeVisible();
  const cell = page.getByRole('cell', { name: 'UDYAM-OD-19-0012345' });
  await expect(cell).toBeVisible();
  // The chosen column sits at the end, past a sideways scroll; show it beside the pinned actions.
  await cell.evaluate((el) => {
    let box: HTMLElement | null = el.parentElement;
    while (box && box.scrollWidth <= box.clientWidth) box = box.parentElement;
    if (box) box.scrollLeft = box.scrollWidth;
  });
  await shot(page, info, 'cf-column.png');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export to Excel' }).click();
  const file = await downloading;
  const book = XLSX.read(await readFile((await file.path())!), { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json<string[]>(book.Sheets[book.SheetNames[0]], { header: 1, raw: false, defval: '' });
  const at = rows[0].indexOf('MSME number');
  expect(at).toBeGreaterThan(-1);
  expect(rows[0]).toContain('Turnover');
  expect(rows.find((r) => r[0] === 'Maa Tarini Traders')?.[at]).toBe('UDYAM-OD-19-0012345');
});

test('lane 5: a required choice on orders holds the order at submit, naming the field', async ({ page }, info) => {
  await signIn(page, admin.email);
  await settle(page, '/company-settings?tab=fields');
  const orders = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Purchase orders', exact: true }) });
  await orders.getByRole('button', { name: 'New field' }).click();
  const dialog = formPanel(page, 'New field on purchase orders');
  await dialog.getByLabel('Name').fill('Funding');
  await dialog.getByLabel('Kind').click();
  await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option[title="Choice"]').click();
  const choices = dialog.getByLabel('Choices');
  await choices.fill('Own funds');
  await choices.press('Enter');
  await choices.fill('Bank loan');
  await choices.press('Enter');
  await dialog.getByLabel('Required').check();
  await dialog.getByRole('button', { name: 'Save field' }).click();
  await expect(dialog).toBeHidden();
  const [funding] = await api<CustomFieldDto[]>(admin.token, '/custom-fields?entity=PURCHASE_ORDER');
  expect(funding).toMatchObject({ key: 'funding', kind: 'CHOICE', required: true, options: ['Own funds', 'Bank loan'] });

  // Save and submit without it is refused before anything is written: no stray draft is left behind.
  const ordersBefore = (await api<{ total: number }>(buyer.token, '/purchase-orders?pageSize=1')).total;
  const saveAndSubmit = await raw(buyer.token, '/purchase-orders', 'POST', {
    id: crypto.randomUUID(),
    projectId: roadId,
    vendorId,
    submit: true,
    lines: [{ itemName: 'Cement OPC 53', unit: 'Bag', quantity: '100', rate: '385', gstRate: '28' }],
  });
  expect(saveAndSubmit.status).toBe(400);
  expect(await saveAndSubmit.text()).toContain('Choose Funding');
  expect((await api<{ total: number }>(buyer.token, '/purchase-orders?pageSize=1')).total).toBe(ordersBefore);

  // A draft saves without it; sending it for approval is refused, naming the field.
  const po = await api<PurchaseOrderDto>(buyer.token, '/purchase-orders', {
    method: 'POST',
    body: { projectId: roadId, vendorId, lines: [{ itemName: 'Cement OPC 53', unit: 'Bag', quantity: '100', rate: '385', gstRate: '28' }] },
  });
  orderId = po.id;
  expect(po.status).toBe('DRAFT');
  const refused = await raw(buyer.token, `/purchase-orders/${po.id}/submit`, 'POST');
  expect(refused.status).toBe(400);
  expect(await refused.text()).toContain('Choose Funding before sending the purchase order for approval');
  const wrong = await raw(buyer.token, `/purchase-orders/${po.id}`, 'PATCH', { customValues: { funding: 'Grant' } });
  expect(wrong.status).toBe(400);
  expect(await wrong.text()).toContain('Funding: choose one of Own funds, Bank loan');

  await settle(page, `/purchase-orders/${po.id}`);
  await page.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(page.getByText(/Choose Funding before sending the purchase order for approval/).first()).toBeVisible();
  await shot(page, info, 'cf-required.png');

  await api(buyer.token, `/purchase-orders/${po.id}`, { method: 'PATCH', body: { customValues: { funding: 'bank loan' } } });
  const sent = await api<PurchaseOrderDto>(buyer.token, `/purchase-orders/${po.id}/submit`, { method: 'POST' });
  expect(sent.status).toBe('SUBMITTED');
  expect(sent.customValues).toEqual({ funding: 'Bank loan' });
});

test('lane 6: an archived field stays on old records, read only', async ({ page }, info) => {
  await signIn(page, admin.email);
  await settle(page, '/company-settings?tab=fields');
  const row = page.getByRole('table', { name: 'Fields on vendors' }).getByRole('row', { name: /MSME number/ });
  await row.getByRole('button', { name: 'Archive' }).click();
  await expect(row.getByText('Archived', { exact: true })).toBeVisible();
  const kept = await api<VendorDto>(admin.token, `/vendors/${vendorId}`, { method: 'PATCH', body: { customValues: { msmeNumber: 'CHANGED', turnover: 14 } } });
  expect(kept.customValues).toEqual({ msmeNumber: 'UDYAM-OD-19-0012345', turnover: 14 });
  await settle(page, '/vendors');
  await page.getByRole('button', { name: 'Edit Maa Tarini Traders' }).click();
  const record = formPanel(page, 'Edit Maa Tarini Traders');
  await expect(record.getByText('UDYAM-OD-19-0012345', { exact: true })).toBeVisible();
  await expect(record.getByText('Archived: kept on this record, no longer asked for')).toBeVisible();
  await expect(record.getByRole('textbox', { name: 'MSME number' })).toHaveCount(0);
  await record.getByLabel('Turnover').scrollIntoViewIfNeeded();
  await shot(page, info, 'cf-archive.png');
  await record.getByRole('button', { name: 'Cancel' }).click();
});

test('lane 7: a number field takes only a number in its range, and the API says how to fix one that is not', async ({ page }, info) => {
  await signIn(page, admin.email);
  await settle(page, '/vendors');
  await page.getByRole('button', { name: 'New vendor' }).first().click();
  const form = formPanel(page, 'New vendor');
  await form.getByLabel('Vendor name').fill('Utkal Hire Agency');
  // The DPR's number box: letters are not taken, and a number below the smallest becomes the smallest.
  const turnover = form.getByLabel('Turnover');
  await turnover.fill('twelve crore');
  await turnover.press('Tab');
  await expect(turnover).toHaveValue('');
  await turnover.fill('-5');
  await turnover.press('Tab');
  await expect(turnover).toHaveValue('0');
  await turnover.scrollIntoViewIfNeeded();
  await shot(page, info, 'cf-number.png');
  const refused = await raw(admin.token, '/vendors', 'POST', { name: 'Utkal Hire Agency', customValues: { turnover: 'twelve crore' } });
  expect(refused.status).toBe(400);
  expect(await refused.text()).toContain('Turnover: enter a number of 0 Cr or more');
  await turnover.fill('8');
  await form.getByRole('button', { name: 'Save vendor' }).click();
  await expect(form).toBeHidden();
  const saved = (await api<{ items: VendorDto[] }>(admin.token, '/vendors?q=Utkal')).items[0];
  expect(saved.customValues).toEqual({ turnover: 8 });
});

test('lane 8: someone who is not an admin is not offered the fields and the API refuses them', async ({ page }, info) => {
  await signIn(page, buyer.email);
  await page.goto('/company-settings?tab=fields');
  await expect(page.getByText('Only an admin can change the company settings')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Fields' })).toHaveCount(0);
  await shot(page, info, 'cf-nonadmin.png');
  const add = await raw(buyer.token, '/custom-fields', 'POST', { entity: 'VENDOR', label: 'Rating', kind: 'TEXT' });
  expect(add.status).toBe(403);
  const [turnover] = (await api<CustomFieldDto[]>(buyer.token, '/custom-fields?entity=VENDOR')).filter((f) => f.key === 'turnover');
  expect((await raw(buyer.token, `/custom-fields/${turnover.id}`, 'PATCH', { required: true })).status).toBe(403);
  expect((await raw(buyer.token, `/custom-fields/${turnover.id}/archive`, 'POST')).status).toBe(403);
});

test("lane 9: a project's date field shows in the company's date format", async ({ page }, info) => {
  await api(admin.token, '/custom-fields', { method: 'POST', body: { entity: 'PROJECT', label: 'Agreement signed on', kind: 'DATE' } });
  const bad = await raw(admin.token, `/projects/${roadId}`, 'PATCH', { customValues: { agreementSignedOn: '03/11/2026' } });
  expect(bad.status).toBe(400);
  expect(await bad.text()).toContain('Agreement signed on: give the date as YYYY-MM-DD');
  await signIn(page, admin.email);
  await settle(page, `/projects/${roadId}`);
  await page.getByRole('button', { name: /Edit$/ }).first().click();
  const form = formPanel(page, /Edit/);
  const date = form.getByLabel('Agreement signed on');
  await date.fill('03 Nov 2026');
  await date.press('Enter');
  await form.getByRole('button', { name: /^Save/ }).click();
  await expect(form).toBeHidden();
  const p = await api<ProjectDetail>(admin.token, `/projects/${roadId}`);
  expect(p.customValues).toEqual({ agreementSignedOn: '2026-11-03' });
  await settle(page, `/projects/${roadId}`);
  const details = page.locator('section').filter({ has: page.getByRole('heading', { name: 'More details' }) });
  await expect(details.getByText('03 Nov 2026', { exact: true })).toBeVisible();
  await shot(page, info, 'cf-project.png');
});

test('lane 10: the changed pages pass the route walk checks at 1440 and 390 in both themes', async ({ browser, baseURL }, info) => {
  test.setTimeout(300_000);
  const pages = ['/company-settings?tab=fields', '/vendors', '/projects', '/purchase-orders', `/purchase-orders/${orderId}`, `/projects/${roadId}`];
  const views = [
    { key: '1440-light', mode: 'light' as const, viewport: { width: 1440, height: 900 }, touch: false },
    { key: '1440-dark', mode: 'dark' as const, viewport: { width: 1440, height: 900 }, touch: false },
    { key: '390-light', mode: 'light' as const, viewport: { width: 390, height: 844 }, touch: true },
    { key: '390-dark', mode: 'dark' as const, viewport: { width: 390, height: 844 }, touch: true },
  ];
  const found: string[] = [];
  for (const view of views) {
    const context = await browser.newContext({ baseURL, viewport: view.viewport, hasTouch: view.touch, reducedMotion: 'reduce' });
    try {
      const page = await context.newPage();
      await setAppearance(page, view.mode);
      await signIn(page, admin.email);
      for (const url of pages) {
        await settle(page, url);
        const at = (what: string) => `${view.key} ${url} ${what}`;
        if (view.key === '1440-light') {
          const h1 = await page.locator('h1').count();
          if (h1 !== 1) found.push(at(`has ${h1} <h1>`));
        }
        found.push(...(await axeViolations(page)).map((v) => at(`axe ${v}`)));
        if (view.mode === 'light') {
          const min = view.touch ? 44 : 24;
          const { targets, text } = await page.evaluate(measureTargets, min);
          found.push(...targets.map((t) => at(`target under ${min} px: ${t.what} ${t.size}`)), ...text.map((t) => at(`text under 12 px: ${t.what} ${t.size}`)));
          if (view.touch) {
            const over = await pageOverflow(page);
            if (over > 0) found.push(at(`scrolls sideways by ${over} px`));
          }
        }
        if (view.key === '390-dark' && url === '/company-settings?tab=fields') await shot(page, info, 'cf-walk-390-dark.png');
      }
    } finally {
      await context.close();
    }
  }
  expect(found).toEqual([]);
});
