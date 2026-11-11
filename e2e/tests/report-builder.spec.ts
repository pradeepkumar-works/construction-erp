import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import * as XLSX from 'xlsx';
import type { ManagementReportDto, ProjectDetail, PurchaseOrderDto, ReportSourceDto, SavedReportDto } from '../../packages/shared/src';
import { API_URL, PASSWORD, api, apiToken, axeViolations, chooseOption, formPanel, localToday, measureTargets, pageOverflow, setAppearance, settle, signIn } from './helpers';

/**
 * Reports you build (ARCHITECTURE "Reports you build"): a report over purchase orders built, saved, opened again, sent to
 * Excel and emailed on a schedule, each reader seeing it with their own access. Everything happens in a company of its
 * own, so the demo data stays as it is. `RPT_TRUNK_API` (another API at trunk on the same database) makes lane 1 compare
 * the procurement report there; `RPT_API_LOG` (the API's log, with `EMAIL_PROVIDER=log`) makes lane 7 count the emails;
 * `RPT_SHOTS` is where the screenshots go.
 */
test.describe.configure({ mode: 'serial' });

const stamp = Date.now();
const admin = { email: `rpt-admin-${stamp}@e2e.test`, token: '', id: '' };
const engineer = { email: `rpt-engineer-${stamp}@e2e.test`, token: '', id: '' };
let roadId = '';
let bridgeId = '';
const vendors: { id: string; name: string }[] = [];
const orders: PurchaseOrderDto[] = [];
let savedId = '';
let sharedId = '';

const shot = async (page: Page, info: TestInfo, name: string) => page.screenshot({ path: process.env.RPT_SHOTS ? path.join(process.env.RPT_SHOTS, name) : info.outputPath(name), fullPage: true, animations: 'disabled' });

async function raw(token: string, p: string, method: string, body?: unknown, base = API_URL) {
  return fetch(`${base}${p}`, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
}

const day = (n: number) => {
  const [y, m, d] = localToday().split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10);
};
const from = day(20);
const to = day(0);
/** Rupee strings summed exactly, in paise. */
const paise = (v: unknown) => {
  const [r, p = ''] = String(v ?? '0').split('.');
  const neg = r.startsWith('-');
  const n = BigInt(r.replace('-', '') || '0') * 100n + BigInt((p + '00').slice(0, 2));
  return neg ? -n : n;
};
const sumPaise = (vs: unknown[]) => vs.reduce<bigint>((a, v) => a + paise(v), 0n);

const BY_VENDOR = { source: 'purchase-orders', columns: ['poNo', 'poDate', 'project', 'vendor', 'status', 'total'], filters: [], groupBy: 'vendor', totals: ['total'], sort: { column: 'total', desc: true } };

test.beforeAll(async () => {
  const res = await fetch(`${API_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ organizationName: `E2E Reports ${stamp}`, fullName: 'Asha Admin', email: admin.email, password: PASSWORD }),
  });
  expect(res.ok).toBe(true);
  admin.token = await apiToken(admin.email);
  admin.id = (await api<{ id: string }>(admin.token, '/auth/me')).id;
  roadId = (await api<ProjectDetail>(admin.token, '/projects', { method: 'POST', body: { code: 'RPT-01', name: 'E2E reports road', type: 'ROAD' } })).id;
  bridgeId = (await api<ProjectDetail>(admin.token, '/projects', { method: 'POST', body: { code: 'RPT-02', name: 'E2E reports bridge', type: 'BUILDING' } })).id;
  engineer.id = (await api<{ id: string }>(admin.token, '/users', { method: 'POST', body: { email: engineer.email, fullName: 'Ravi Site', roleKey: 'SITE_ENGINEER', password: PASSWORD, projectIds: [roadId] } })).id;
  engineer.token = await apiToken(engineer.email);
  for (const name of ['Maa Tarini Traders', 'Utkal Cement Agency']) vendors.push({ id: (await api<{ id: string }>(admin.token, '/vendors', { method: 'POST', body: { name } })).id, name });
  // Rates with paise, so a total in floats would drift.
  const lines = [
    { projectId: roadId, vendor: 0, qty: '7.5', rate: '385.55', at: 1 },
    { projectId: roadId, vendor: 1, qty: '12.25', rate: '419.15', at: 2 },
    { projectId: bridgeId, vendor: 0, qty: '3.333', rate: '1999.99', at: 3 },
    { projectId: bridgeId, vendor: 1, qty: '40', rate: '62.37', at: 4 },
    { projectId: roadId, vendor: 0, qty: '1.111', rate: '77.77', at: 5 },
  ];
  for (const l of lines)
    orders.push(
      await api<PurchaseOrderDto>(admin.token, '/purchase-orders', {
        method: 'POST',
        body: { projectId: l.projectId, vendorId: vendors[l.vendor].id, poDate: day(l.at), lines: [{ itemName: 'Cement OPC 53', unit: 'Bag', quantity: l.qty, rate: l.rate, gstRate: '18' }] },
      }),
    );
});

test('lane 1: the procurement management report reads as it did at trunk', async ({ page }, info) => {
  const strip = (r: ManagementReportDto) => ({ ...r, generatedAt: undefined });
  const head = await api<ManagementReportDto>(admin.token, `/management/reports/procurement?from=${from}&to=${to}`);
  expect(head.sections.length).toBeGreaterThan(0);
  if (process.env.RPT_TRUNK_API) {
    const trunk = await raw(admin.token, `/management/reports/procurement?from=${from}&to=${to}`, 'GET', undefined, process.env.RPT_TRUNK_API);
    expect(trunk.status).toBe(200);
    expect(strip(head)).toEqual(strip((await trunk.json()) as ManagementReportDto));
  }
  await signIn(page, admin.email);
  await settle(page, `/management/reports/procurement?from=${from}&to=${to}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Procurement spend' })).toBeVisible();
  await shot(page, info, 'rpt-mgmt.png');
});

test("lane 2: orders by vendor total what the order list holds for the same vendor", async ({ page }, info) => {
  const run = await api<ManagementReportDto>(admin.token, '/report-builder/run', { method: 'POST', body: { definition: BY_VENDOR, from, to } });
  const groups = run.sections.find((s) => s.key === 'groups')!;
  expect(groups.columns.map((c) => c.label)).toEqual(['Vendor', 'Orders', 'Order value']);
  for (const v of vendors) {
    const list = await api<{ items: PurchaseOrderDto[] }>(admin.token, `/purchase-orders?vendorId=${v.id}&from=${from}&to=${to}&pageSize=500`);
    const row = groups.rows.find((r) => r['group:vendor'] === v.name)!;
    expect(row._count).toBe(list.items.length);
    expect(paise(row.total)).toBe(sumPaise(list.items.map((o) => o.total)));
    // A condition on the vendor gives the same as the list's own filter.
    const one = await api<ManagementReportDto>(admin.token, '/report-builder/run', { method: 'POST', body: { definition: { ...BY_VENDOR, groupBy: null, filters: [{ column: 'vendor', op: 'is', value: v.name }] }, from, to } });
    expect(paise(one.sections[0].total!.total)).toBe(sumPaise(list.items.map((o) => o.total)));
  }
  expect(paise(groups.total!.total)).toBe(sumPaise(orders.map((o) => o.total)));

  // The same report built on the screen.
  await signIn(page, admin.email);
  await settle(page, '/my-reports');
  await page.getByRole('button', { name: 'New report' }).first().click();
  const form = formPanel(page, 'New report');
  await form.getByLabel('Name').fill('Orders by vendor');
  await expect(form.getByLabel('Over')).toBeVisible();
  await expect(form.locator('.ant-select-selection-item').filter({ hasText: 'Order value' }).first()).toBeVisible();
  await chooseOption(form.getByLabel('Sort by'), 'Order value');
  await form.getByLabel('Largest or latest first').check();
  await shot(page, info, 'rpt-build.png');
  await form.getByRole('button', { name: 'Save report' }).click();
  await page.waitForURL(/\/my-reports\/[0-9a-f-]{36}$/);
  savedId = page.url().split('/').pop()!;
});

test('lane 3: a saved report opens again with the same definition', async ({ page }, info) => {
  const saved = await api<SavedReportDto>(admin.token, `/report-builder/reports/${savedId}`);
  expect(saved.name).toBe('Orders by vendor');
  expect(saved.definition).toEqual(BY_VENDOR);
  // Saved again through the API, it comes back as sent.
  const changed = { ...BY_VENDOR, filters: [{ column: 'total', op: 'atLeast', value: '1000' }] };
  await api(admin.token, `/report-builder/reports/${savedId}`, { method: 'PATCH', body: { name: 'Orders by vendor', shared: false, definition: changed } });
  expect((await api<SavedReportDto>(admin.token, `/report-builder/reports/${savedId}`)).definition).toEqual(changed);
  await api(admin.token, `/report-builder/reports/${savedId}`, { method: 'PATCH', body: { name: 'Orders by vendor', shared: false, definition: BY_VENDOR } });

  await signIn(page, admin.email);
  await settle(page, `/my-reports/${savedId}?from=${from}&to=${to}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Orders by vendor' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Maa Tarini Traders' }).first()).toBeVisible();
  await shot(page, info, 'rpt-saved.png');
  await page.getByRole('button', { name: 'More actions for this report' }).click();
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  const form = formPanel(page, 'Edit Orders by vendor');
  await expect(form.getByLabel('Name')).toHaveValue('Orders by vendor');
  await expect(form.locator('.ant-form-item').filter({ hasText: 'Group by' })).toContainText('Vendor');
  await form.getByRole('button', { name: 'Cancel' }).click();
});

test('lane 4: the Excel sheet holds what the table shows', async ({ page }, info) => {
  const run = await api<ManagementReportDto>(admin.token, `/report-builder/reports/${savedId}/run?from=${from}&to=${to}`);
  await signIn(page, admin.email);
  await settle(page, `/my-reports/${savedId}?from=${from}&to=${to}`);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Excel' }).click();
  const file = await downloading;
  const book = XLSX.read(await readFile((await file.path())!), { type: 'buffer' });
  for (const s of run.sections) {
    const sheet = book.Sheets[s.title];
    expect(sheet, `sheet ${s.title}`).toBeTruthy();
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, raw: true, defval: '' });
    const header = rows[0].map(String);
    const money = s.columns.findIndex((c) => c.key === 'total');
    expect(header[money]).toBe('Order value (₹)');
    const body = rows.slice(1).filter((r) => r.some((c) => c !== ''));
    expect(body.length).toBe(s.rows.length + (s.total ? 1 : 0));
    s.rows.forEach((r, i) => expect(Math.round(Number(body[i][money]) * 100)).toBe(Number(paise(r.total))));
    expect(Math.round(Number(body[body.length - 1][money]) * 100)).toBe(Number(paise(s.total!.total)));
  }
  await shot(page, info, 'rpt-excel.png');
});

test('lane 5: a site engineer sees only their own projects in a shared report', async ({ page }, info) => {
  sharedId = (await api<SavedReportDto>(admin.token, '/report-builder/reports', { method: 'POST', body: { name: 'Orders by project', shared: true, definition: { ...BY_VENDOR, groupBy: 'project', sort: null } } })).id;
  const run = await api<ManagementReportDto>(engineer.token, `/report-builder/reports/${sharedId}/run?from=${from}&to=${to}`);
  const rows = run.sections.find((s) => s.key === 'rows')!.rows;
  const own = await api<{ items: PurchaseOrderDto[] }>(engineer.token, `/purchase-orders?from=${from}&to=${to}&pageSize=500`);
  expect(rows.length).toBe(own.items.length);
  expect(rows.length).toBeGreaterThan(0);
  expect(new Set(rows.map((r) => r.project))).toEqual(new Set(['E2E reports road']));
  // The engineer may read it, not change it.
  expect((await raw(engineer.token, `/report-builder/reports/${sharedId}`, 'PATCH', { name: 'Mine now', shared: true, definition: BY_VENDOR })).status).toBe(403);
  await signIn(page, engineer.email);
  await settle(page, `/my-reports/${sharedId}?from=${from}&to=${to}`);
  await expect(page.getByRole('cell', { name: 'E2E reports bridge' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Schedule' })).toHaveCount(0);
  await shot(page, info, 'rpt-engineer.png');
});

test('lane 6: contract columns are not offered without the right to see the contract', async ({ page }, info) => {
  const columns = (s: ReportSourceDto[]) => s.find((x) => x.key === 'projects')!.columns.map((c) => c.key);
  expect(columns(await api<ReportSourceDto[]>(admin.token, '/report-builder/sources'))).toContain('contractValue');
  expect(columns(await api<ReportSourceDto[]>(engineer.token, '/report-builder/sources'))).not.toContain('contractValue');
  const asked = await raw(engineer.token, '/report-builder/run', 'POST', { definition: { source: 'projects', columns: ['code', 'contractValue'], filters: [], groupBy: null, totals: [], sort: null } });
  expect(asked.status).toBe(400);
  expect(await asked.text()).toContain('Your role does not see Contract value');
  await signIn(page, engineer.email);
  await settle(page, '/my-reports');
  await page.getByRole('button', { name: 'New report' }).first().click();
  const form = formPanel(page, 'New report');
  await form.getByLabel('Over').click();
  await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option[title="Projects"]').click();
  await expect(form.locator('.ant-select-selection-item').filter({ hasText: 'Code' }).first()).toBeVisible();
  await form.getByLabel('Columns, in order').click();
  await form.getByLabel('Columns, in order').fill('Contract');
  await expect(page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').filter({ hasText: 'Contract value' })).toHaveCount(0);
  await form.getByLabel('Columns, in order').fill('');
  await shot(page, info, 'rpt-hidden.png');
  await page.keyboard.press('Escape');
});

test('lane 7: a weekly schedule sends each person one copy for the week, however often the job runs', async ({ page }, info) => {
  const [y, m, d] = localToday().split('-').map(Number);
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  await signIn(page, admin.email);
  await settle(page, `/my-reports/${savedId}?from=${from}&to=${to}`);
  await page.getByRole('button', { name: 'Schedule' }).click();
  const dialog = formPanel(page, 'Schedule');
  await chooseOption(dialog.getByLabel('To'), 'Ravi Site');
  await dialog.locator('.ant-modal-title').click();
  await expect(page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')).toHaveCount(0);
  await shot(page, info, 'rpt-schedule.png');
  await dialog.getByRole('button', { name: 'Save schedule' }).click();
  await expect(dialog).toBeHidden();
  // Today's weekday, so the week before today is owed now.
  await api(admin.token, `/report-builder/reports/${savedId}/schedule`, { method: 'PUT', body: { frequency: 'WEEKLY', weekday, recipientIds: [admin.id, engineer.id] } });
  const saved = await api<SavedReportDto>(admin.token, `/report-builder/reports/${savedId}`);
  expect(saved.schedule?.recipients.map((r) => r.name).sort()).toEqual(['Asha Admin', 'Ravi Site']);

  const job = async () => {
    const res = await fetch(`${API_URL}/notifications/jobs/report-schedules?date=${localToday()}`, { headers: { 'x-cron-secret': 'e2e-cron' } });
    expect(res.status, await res.clone().text()).toBe(200);
    return (await res.json()) as { sent: number; emailed: number; failed: number };
  };
  const first = await job();
  const second = await job();
  expect(first.sent).toBeGreaterThanOrEqual(2);
  expect(second.sent).toBe(0);
  expect(second.emailed).toBe(0);
  const notices = async (token: string) =>
    (await api<{ items: { entityType: string | null; entityId: string | null; body: string }[] }>(token, '/notifications?limit=200')).items.filter((n) => n.entityType === 'SAVED_REPORT' && n.entityId === savedId);
  const mine = await notices(admin.token);
  const theirs = await notices(engineer.token);
  expect(mine).toHaveLength(1);
  expect(theirs).toHaveLength(1);
  // Each copy is run as its reader: the engineer's counts only the road's orders of the week.
  const week = orders.filter((o) => o.poDate >= day(7) && o.poDate <= day(1));
  expect(mine[0].body).toContain(`${week.length} orders`);
  expect(theirs[0].body).toContain(`${week.filter((o) => o.projectId === roadId).length} orders`);
  if (process.env.RPT_API_LOG) {
    const log = await readFile(process.env.RPT_API_LOG, 'utf8');
    expect(log.split(`[email not configured] to=${engineer.email} subject="Orders by vendor`).length - 1).toBe(1);
  }
});

test("lane 8: a company's own field on orders is a column with its values", async ({ page }, info) => {
  await api(admin.token, '/custom-fields', { method: 'POST', body: { entity: 'PURCHASE_ORDER', label: 'Cost centre', kind: 'TEXT' } });
  await api(admin.token, `/purchase-orders/${orders[0].id}`, { method: 'PATCH', body: { customValues: { costCentre: 'CC-17 Earthwork' } } });
  const source = (await api<ReportSourceDto[]>(admin.token, '/report-builder/sources')).find((s) => s.key === 'purchase-orders')!;
  expect(source.columns.find((c) => c.key === 'cf:costCentre')).toMatchObject({ label: 'Cost centre', kind: 'text' });
  const id = (await api<SavedReportDto>(admin.token, '/report-builder/reports', { method: 'POST', body: { name: 'Orders by cost centre', shared: false, definition: { source: 'purchase-orders', columns: ['poNo', 'cf:costCentre', 'total'], filters: [], groupBy: 'cf:costCentre', totals: ['total'], sort: null } } })).id;
  await signIn(page, admin.email);
  await settle(page, `/my-reports/${id}?from=${from}&to=${to}`);
  await expect(page.getByRole('cell', { name: 'CC-17 Earthwork' }).first()).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Not set' }).first()).toBeVisible();
  await shot(page, info, 'rpt-custom.png');
});

test('lane 9: a definition with a column the source does not have is refused', async ({ page }, info) => {
  for (const column of ['passwordHash', '__proto__', 'constructor', 'toString']) {
    const res = await raw(admin.token, '/report-builder/run', 'POST', { definition: { ...BY_VENDOR, columns: ['poNo', column] } });
    expect(res.status, column).toBe(400);
  }
  const filter = await raw(admin.token, '/report-builder/run', 'POST', { definition: { ...BY_VENDOR, filters: [{ column: 'vendor', op: 'raw', value: "' OR 1=1" }] } });
  expect(filter.status).toBe(400);
  const before = (await api<{ total: number }>(admin.token, '/report-builder/reports?pageSize=1')).total;
  // The form is sent with a column added on the way, as a tampered client would.
  await signIn(page, admin.email);
  await page.route('**/report-builder/reports', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const body = route.request().postDataJSON() as { definition: { columns: string[] } };
    body.definition.columns.push('passwordHash');
    await route.continue({ postData: JSON.stringify(body) });
  });
  await settle(page, '/my-reports');
  await page.getByRole('button', { name: 'New report' }).first().click();
  const form = formPanel(page, 'New report');
  await form.getByLabel('Name').fill('Tampered');
  await expect(form.locator('.ant-select-selection-item').filter({ hasText: 'Order value' }).first()).toBeVisible();
  await form.getByRole('button', { name: 'Save report' }).click();
  await expect(form.getByText('Purchase orders has no column “passwordHash”')).toBeVisible();
  await shot(page, info, 'rpt-tamper.png');
  expect((await api<{ total: number }>(admin.token, '/report-builder/reports?pageSize=1')).total).toBe(before);
});

test('lane 10: My reports and a report pass the route walk checks at 1440 and 390 in both themes', async ({ browser, baseURL }, info) => {
  test.setTimeout(300_000);
  const pages = ['/my-reports', `/my-reports/${savedId}?from=${from}&to=${to}`];
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
          const title = await page.title();
          if (!/^Orders by vendor|^My reports/.test(title)) found.push(at(`tab title ${title}`));
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
        if (view.key === '390-dark' && url !== '/my-reports') await shot(page, info, 'rpt-walk-390-dark.png');
      }
    } finally {
      await context.close();
    }
  }
  expect(found).toEqual([]);
});
