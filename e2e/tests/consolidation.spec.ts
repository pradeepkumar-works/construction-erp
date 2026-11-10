import path from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { API_URL, PASSWORD, api, apiToken, axeViolations, chooseOption, companyToken, localToday, measureTargets, pageOverflow, setAppearance, settle, signIn } from './helpers';

/**
 * Consolidated accounts (item 192, ARCHITECTURE "Consolidated accounts") on the demo group: Demo Infra Holdings above
 * Demo Infra Projects, Buildcon, Design Consultants and Quality Labs. `admin@demo.com` runs the group; the seed names the
 * sisters in each company's books and has Demo Infra Projects raise a debit note on the lab that the lab has not booked.
 * Every company's sign-in is undone after use (`companyToken`), and what a test adds is its own (a vendor, a company).
 */

const HOLDING = 'Demo Infra Holdings Pvt Ltd';
const PROJECTS = 'Demo Infra Projects Pvt Ltd';
const BUILDCON = 'Demo Buildcon Pvt Ltd';
const DESIGN = 'Demo Design Consultants Pvt Ltd';
const LAB = 'Demo Quality Labs Pvt Ltd';
const ADMIN = 'admin@demo.com';

interface Row { key: string; line: string | null; label: string; companies: Record<string, string>; eliminated: string; group: string; total: boolean }
interface Side { companyId: string; name: string; amount: string; named: boolean }
interface Pair { key: string; kind: 'BALANCE' | 'SALES' | 'INTEREST'; a: Side; b: Side; eliminated: string; difference: string }
interface Company { id: string; name: string; from: string; to: string; lockedUpTo: string | null; closedYear: string | null; booksFrom: string | null; suspended: boolean; difference: string }
interface Consolidation {
  companies: Company[];
  profitLoss: Row[];
  balanceSheet: { sections: { key: string; side: string; rows: Row[]; total: Row }[]; totalLiabilities: Row; totalAssets: Row };
  pairs: Pair[];
}
interface Line { line: string; amount: string }
interface BalanceSheet { sections: { lines: Line[]; total: { amount: string } }[]; totalAssets: { amount: string }; totalLiabilities: { amount: string } }
interface ProfitLoss { income: Line[]; expenses: Line[]; tax: Line; profit: { amount: string } }

const today = localToday();
const from = `${Number(today.slice(5, 7)) >= 4 ? today.slice(0, 4) : Number(today.slice(0, 4)) - 1}-04-01`;
const rupees = (v: string) => Math.round(Number(v) * 100);
const sum = (vs: string[]) => vs.reduce((s, v) => s + rupees(v), 0);

let holding: string | undefined;
const holdingToken = async () => (holding ??= await companyToken(ADMIN, HOLDING));
const consolidation = async (q = '') => api<Consolidation>(await holdingToken(), `/group/consolidation?from=${from}&to=${today}${q}`);
const companyOf = (d: Consolidation, name: string) => d.companies.find((c) => c.name === name)!;
const pairOf = (d: Consolidation, kind: Pair['kind'], a: string, b: string) => d.pairs.find((p) => p.kind === kind && p.a.name === a && p.b.name === b);

/** Screenshots for the plan's lanes go where SHOTS_DIR says (the review folder), else beside the test's results. */
const shot = (page: Page, name: string) => page.screenshot({ path: process.env.SHOTS_DIR ? path.join(process.env.SHOTS_DIR, name) : test.info().outputPath(name), fullPage: true, animations: 'disabled' });

/** A browser context signed in as the token's company (as the company switcher leaves it). */
async function signedIn(context: BrowserContext, token: string, baseURL: string) {
  await context.addCookies([{ name: 'erp_token', value: encodeURIComponent(token), url: baseURL }]);
  await context.addInitScript((t) => window.localStorage.setItem('erp_token', t), token);
}

const statementRow = (page: Page, label: string) => page.getByRole('row').filter({ has: page.getByRole('cell', { name: label, exact: true }) });

test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1440, height: 900 } });

test('lane 1: each company column is that company’s own balance sheet and profit and loss', async ({ page, context, baseURL }) => {
  const d = await consolidation();
  expect(d.companies.map((c) => c.name)).toEqual([HOLDING, BUILDCON, DESIGN, PROJECTS, LAB]);
  const bsRows = [...d.balanceSheet.sections.flatMap((s) => s.rows)];
  for (const c of d.companies) {
    const token = await companyToken(ADMIN, c.name);
    const bs = await api<BalanceSheet>(token, `/statements/balance-sheet?asOn=${today}`);
    const pl = await api<ProfitLoss>(token, `/statements/profit-loss?from=${from}&to=${today}`);
    for (const l of bs.sections.flatMap((s) => s.lines)) expect(bsRows.find((r) => r.line === l.line)?.companies[c.id], `${c.name} ${l.line}`).toBe(l.amount);
    for (const l of [...pl.income, ...pl.expenses, pl.tax]) expect(d.profitLoss.find((r) => r.line === l.line)?.companies[c.id], `${c.name} ${l.line}`).toBe(l.amount);
    expect(d.balanceSheet.totalAssets.companies[c.id]).toBe(bs.totalAssets.amount);
    expect(d.balanceSheet.totalLiabilities.companies[c.id]).toBe(bs.totalLiabilities.amount);
    expect(d.profitLoss.find((r) => r.key === 'PROFIT')!.companies[c.id]).toBe(pl.profit.amount);
  }

  // The holding's own balance sheet page beside its column on the consolidated one.
  await signedIn(context, await holdingToken(), baseURL!);
  await settle(page, '/group/consolidated?tab=bs');
  await expect(page.getByRole('columnheader', { name: PROJECTS })).toBeVisible();
  await shot(page, 'grp-own.png');
});

test('lane 2: the group’s profit and loss is the companies’ sum less what passed between sisters', async ({ page, context, baseURL }) => {
  const d = await consolidation();
  for (const r of d.profitLoss) expect(rupees(r.group), r.key).toBe(sum(Object.values(r.companies)) + rupees(r.eliminated));
  const sales = d.pairs.filter((p) => p.kind === 'SALES');
  expect(sales.length).toBeGreaterThan(0);
  const income = d.profitLoss.find((r) => r.key === 'TOTAL_INCOME')!;
  const expenses = d.profitLoss.find((r) => r.key === 'TOTAL_EXPENSES')!;
  expect(rupees(income.eliminated)).toBe(-sum(sales.map((p) => p.eliminated)));
  expect(rupees(expenses.eliminated)).toBe(-sum(sales.map((p) => p.eliminated)));
  // A sale and its purchase come out alike, so the group's profit is the companies' own.
  expect(rupees(d.profitLoss.find((r) => r.key === 'PROFIT')!.eliminated)).toBe(0);

  await signedIn(context, await holdingToken(), baseURL!);
  await settle(page, '/group/consolidated');
  await expect(page.getByRole('heading', { level: 1, name: 'Consolidated accounts' })).toBeVisible();
  await expect(page).toHaveTitle(/Consolidated accounts/);
  for (const name of [HOLDING, BUILDCON, DESIGN, PROJECTS, LAB]) await expect(page.getByRole('columnheader', { name })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Between sisters' })).toBeVisible();
  await expect(statementRow(page, 'Profit for the period')).toBeVisible();
  await expect(statementRow(page, 'Total income').getByRole('cell').last()).not.toHaveText('');
  await shot(page, 'grp-pl.png');
});

test('lane 3: the group’s balance sheet balances after the sisters’ balances come out', async ({ page, context, baseURL }) => {
  const d = await consolidation();
  const { totalAssets, totalLiabilities } = d.balanceSheet;
  for (const c of d.companies) expect(c.difference, c.name).toBe('0.00');
  expect(totalAssets.group).toBe(totalLiabilities.group);
  const balances = d.pairs.filter((p) => p.kind === 'BALANCE');
  expect(rupees(totalAssets.eliminated)).toBe(-sum(balances.map((p) => p.eliminated)));
  expect(totalLiabilities.eliminated).toBe(totalAssets.eliminated);

  await signedIn(context, await holdingToken(), baseURL!);
  await settle(page, '/group/consolidated?tab=bs');
  const assets = statementRow(page, 'Total assets');
  const liabilities = statementRow(page, 'Total equity and liabilities');
  await expect(assets).toBeVisible();
  await expect(assets.getByRole('cell').last()).toHaveText((await liabilities.getByRole('cell').last().textContent())!);
  await shot(page, 'grp-bs.png');
});

test('lane 4: a vendor named as a sister in the holding shows on both companies’ pages', async ({ page, context, browser, baseURL }) => {
  const stamp = Date.now();
  const vendor = `E2E Sister Lab ${stamp}`;
  const token = await holdingToken();
  const created = await api<{ id: string }>(token, '/vendors', { method: 'POST', body: { name: vendor } });
  try {
    await signedIn(context, token, baseURL!);
    await settle(page, '/group/sisters');
    await expect(page.getByRole('heading', { level: 1, name: 'Sister companies' })).toBeVisible();
    await page.getByRole('button', { name: 'Name a sister company' }).click();
    const form = page.getByRole('dialog', { name: 'Name a sister company' });
    await chooseOption(form.getByLabel('Vendor or client'), vendor);
    await chooseOption(form.getByLabel('Sister company'), 'Quality Labs');
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(form).toBeHidden();
    const row = page.getByRole('row').filter({ hasText: vendor });
    await expect(row).toContainText(LAB);
    await shot(page, 'grp-link.png');

    // While it is named, the vendor cannot be deleted: the link would point at nothing.
    const refused = await fetch(`${API_URL}/vendors/${created.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
    expect(refused.status).toBe(409);
    expect(await refused.text()).toContain('Remove it under Sister companies first');

    // The lab's own page lists it under the links its sisters keep.
    const lab = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
    try {
      await signedIn(lab, await companyToken(ADMIN, LAB), baseURL!);
      const labPage = await lab.newPage();
      await settle(labPage, '/group/sisters');
      await expect(labPage.getByRole('row').filter({ hasText: vendor })).toContainText(HOLDING);
    } finally {
      await lab.close();
    }

    await row.getByRole('button', { name: `Remove ${vendor}` }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Stop naming' }).click();
    await expect(page.getByRole('row').filter({ hasText: vendor })).toHaveCount(0);
  } finally {
    const links = await api<{ links: { id: string; partyId: string }[] }>(token, '/group/sisters');
    for (const l of links.links.filter((x) => x.partyId === created.id)) await api(token, `/group/sisters/${l.id}`, { method: 'DELETE' });
    await api(token, `/vendors/${created.id}`, { method: 'DELETE' }).catch(() => undefined);
  }
});

test('lane 5: a sale between sisters that both books hold comes out in full', async ({ page, context, baseURL }) => {
  const d = await consolidation();
  const sale = pairOf(d, 'SALES', DESIGN, PROJECTS)!;
  expect(sale, 'Design Consultants sold to Demo Infra Projects').toBeTruthy();
  expect(rupees(sale.a.amount)).toBeGreaterThan(0);
  expect(sale.b.amount).toBe(sale.a.amount);
  expect(sale.eliminated).toBe(sale.a.amount);
  expect(sale.difference).toBe('0.00');

  await signedIn(context, await holdingToken(), baseURL!);
  await settle(page, '/group/consolidated?tab=sisters');
  await expect(page.getByRole('row').filter({ hasText: `${DESIGN} sold to ${PROJECTS}` })).toBeVisible();
  await shot(page, 'grp-elim.png');
});

test('lane 6: a balance the sisters do not agree on shows both figures and the difference', async ({ page, context, baseURL }) => {
  const d = await consolidation();
  // Demo Infra Projects' debit note on the lab's unpaid bill: its books owe the lab 5,900 (5,000 and GST) less than the
  // lab's say. What both hold comes out; the 5,900 stays in as the difference.
  const owed = pairOf(d, 'BALANCE', LAB, PROJECTS)!;
  expect(owed, 'Demo Infra Projects owes the lab').toBeTruthy();
  expect(rupees(owed.a.amount) - rupees(owed.b.amount)).toBe(590000);
  expect(owed.eliminated).toBe(owed.b.amount);
  expect(owed.difference).toBe('5900.00');
  // The same note is a sale the lab made that Demo Infra Projects' books hold 5,000 less of.
  const sale = pairOf(d, 'SALES', LAB, PROJECTS)!;
  expect(rupees(sale.difference)).toBe(500000);
  expect(sale.eliminated).toBe(sale.b.amount);

  await signedIn(context, await holdingToken(), baseURL!);
  await settle(page, '/group/consolidated?tab=sisters');
  await expect(page.getByRole('tab', { name: /Between sisters/ })).toContainText(/differences? to look into/);
  const row = page.getByRole('row').filter({ hasText: `${PROJECTS} owes ${LAB}` });
  await expect(row).toBeVisible();
  await expect(row.getByRole('cell').last()).not.toHaveText(/^\s*0(\.00)?\s*$/);
  await shot(page, 'grp-mismatch.png');
});

test('lane 7: someone of a child company only is not offered the page, and the API refuses them', async ({ page }) => {
  const child = await apiToken('buildcon@demo.com');
  const res = await fetch(`${API_URL}/group/consolidation?from=${from}&to=${today}`, { headers: { authorization: `Bearer ${child}` } });
  expect(res.status).toBe(403);
  // The group's own admin, signed in to a child company, is refused too: the page is the holding's.
  const inChild = await companyToken(ADMIN, PROJECTS);
  expect((await fetch(`${API_URL}/group/consolidation?from=${from}&to=${today}`, { headers: { authorization: `Bearer ${inChild}` } })).status).toBe(403);

  await signIn(page, 'buildcon@demo.com');
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Consolidated accounts' })).toHaveCount(0);
  await settle(page, '/group/consolidated');
  await expect(page.getByText('Group admins in the holding company only')).toBeVisible();
  await shot(page, 'grp-child.png');
});

test('lane 8: a company with locked books stops at its lock and says so', async ({ page, context, baseURL }) => {
  const design = await companyToken(ADMIN, DESIGN);
  const year = await api<{ lockedUpTo: string | null }>(design, '/statements/year');
  expect(year.lockedUpTo, 'Design Consultants starts with no lock').toBeNull();
  // The end of June, or yesterday early in the year (a lock goes up to today at the latest).
  const lock = [`${from.slice(0, 4)}-06-30`, new Date(Date.parse(today) - 86_400_000).toISOString().slice(0, 10)].sort()[0];
  await api(design, '/statements/lock', { method: 'PUT', body: { lockedUpTo: lock } });
  try {
    const books = await consolidation();
    const atEnd = companyOf(books, DESIGN);
    expect(atEnd).toMatchObject({ lockedUpTo: lock, to: today });
    const stops = await consolidation('&basis=LOCK');
    const locked = companyOf(stops, DESIGN);
    expect(locked).toMatchObject({ lockedUpTo: lock, from, to: lock });
    // Its column is its own balance sheet as on its lock; the others still run to the period's end.
    const own = await api<BalanceSheet>(design, `/statements/balance-sheet?asOn=${lock}`);
    expect(stops.balanceSheet.totalAssets.companies[locked.id]).toBe(own.totalAssets.amount);
    expect(companyOf(stops, PROJECTS).to).toBe(today);

    await signedIn(context, await holdingToken(), baseURL!);
    await settle(page, '/group/consolidated?tab=bs');
    const notes = page.getByTestId('company-notes');
    await expect(notes).toContainText(`${DESIGN}: Locked up to`);
    await expect(notes).toContainText('later entries can change');
    await page.getByRole('radiogroup', { name: 'Figures to' }).getByText(/^Each company.s lock$/).click();
    await expect(notes).toContainText(`${DESIGN}: Stops at its lock`);
    await expect(notes).toContainText('Figures to');
    await shot(page, 'grp-locked.png');
  } finally {
    await api(design, '/statements/lock', { method: 'PUT', body: { lockedUpTo: null } });
  }
});

test('lane 9: a company outside the group never appears and cannot be named a sister', async ({ page, context, baseURL }) => {
  const stamp = Date.now();
  const outside = `E2E Outside ${stamp}`;
  const signup = await fetch(`${API_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ organizationName: outside, fullName: 'Asha Outside', email: `outside-${stamp}@e2e.test`, password: PASSWORD }),
  });
  expect(signup.ok).toBe(true);
  const own = (await signup.json()) as { accessToken: string };
  const me = await api<{ organizationId: string }>(own.accessToken, '/auth/me');

  const d = await consolidation();
  expect(d.companies.map((c) => c.id)).not.toContain(me.organizationId);
  expect(d.companies.filter((c) => c.name.startsWith('E2E'))).toEqual([]);
  expect(d.pairs.flatMap((p) => [p.a.companyId, p.b.companyId])).not.toContain(me.organizationId);
  for (const r of d.profitLoss) expect(Object.keys(r.companies)).not.toContain(me.organizationId);

  // A vendor in the holding cannot be named as the outside company.
  const token = await holdingToken();
  const vendor = await api<{ id: string }>(token, '/vendors', { method: 'POST', body: { name: `E2E Outside Vendor ${stamp}` } });
  try {
    const res = await fetch(`${API_URL}/group/sisters`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ vendorId: vendor.id, sisterId: me.organizationId }),
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('Choose a company of your group');
  } finally {
    await api(token, `/vendors/${vendor.id}`, { method: 'DELETE' }).catch(() => undefined);
  }

  await signedIn(context, token, baseURL!);
  await settle(page, '/group/consolidated?tab=bs');
  await expect(page.getByRole('columnheader', { name: HOLDING })).toBeVisible();
  await expect(page.getByText(outside)).toHaveCount(0);
  await shot(page, 'grp-outside.png');
});

test('lane 10: the new pages pass the route walk’s checks at 1440 and 390 in both themes', async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const token = await holdingToken();
  const found: string[] = [];
  for (const view of [
    { key: '1440-light', mode: 'light', viewport: { width: 1440, height: 900 }, touch: false },
    { key: '1440-dark', mode: 'dark', viewport: { width: 1440, height: 900 }, touch: false },
    { key: '390-light', mode: 'light', viewport: { width: 390, height: 844 }, touch: true },
    { key: '390-dark', mode: 'dark', viewport: { width: 390, height: 844 }, touch: true },
  ] as const) {
    for (const url of ['/group/consolidated', '/group/consolidated?tab=bs', '/group/consolidated?tab=sisters', '/group/sisters']) {
      const context = await browser.newContext({ baseURL, viewport: view.viewport, hasTouch: view.touch, reducedMotion: 'reduce' });
      try {
        await signedIn(context, token, baseURL!);
        const page = await context.newPage();
        await setAppearance(page, view.mode);
        await settle(page, url);
        const at = (what: string) => `${view.key} ${url} ${what}`;
        expect(await page.locator('h1').count(), at('one h1')).toBe(1);
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
        if (view.key === '390-dark' && url === '/group/consolidated') await shot(page, 'grp-walk-390-dark.png');
      } finally {
        await context.close();
      }
    }
  }
  expect(found).toEqual([]);
});
