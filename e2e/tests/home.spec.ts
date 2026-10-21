import { expect, test } from '@playwright/test';
import { api, apiToken, signIn } from './helpers';

type Card = { count: number; amount: string | null; items: { label: string; href: string }[]; urgencyDays?: number | null };
type MyWork = { approvals?: { type: string; count: number }[]; approvalsWaitingDays?: number | null } & Partial<Record<CardKey, Card>>;
type CardKey = 'watchList' | 'dprsMissing' | 'sentBack' | 'waitingWithOthers' | 'receivables' | 'payablesDue' | 'expiring' | 'lateDeliveries' | 'lowStock';
type Trends = { months: string[]; workDone: string[]; cashIn?: string[]; cashOut?: string[]; cost?: string[]; sCurve: unknown[] };

const section = (page: import('@playwright/test').Page, name: string) => page.getByRole('region', { name, exact: true });

/** My work's card titles, and the project manager's layout order (`homeLayout`), which breaks ties in urgency. */
const TITLES: Record<CardKey | 'approvals', string> = {
  approvals: 'Waiting for your approval',
  watchList: 'Watch list',
  dprsMissing: 'DPRs not filed today',
  sentBack: 'Sent back to you',
  waitingWithOthers: 'Waiting with others',
  receivables: 'Bills awaiting payment',
  payablesDue: 'Payments due this week',
  expiring: 'Guarantees and policies expiring',
  lateDeliveries: 'Late deliveries',
  lowStock: 'Below minimum stock',
};
const MANAGER_ORDER: (CardKey | 'approvals')[] = ['approvals', 'watchList', 'dprsMissing', 'lateDeliveries', 'expiring', 'lowStock', 'payablesDue', 'receivables', 'sentBack', 'waitingWithOthers'];

/** "Oct" for the API's YYYY-MM, as the tiles write it. */
const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });

/**
 * Home dashboards by role (UI roadmap item 59): the page leads with what waits for the user (My work), then the KPI
 * tiles and charts their role cares about. The API leaves out what a role cannot see, so the page cannot show it.
 */
test('accounts lead with money due and see cash flow', async ({ page }) => {
  const token = await apiToken('accounts@demo.com');
  const work = await api<MyWork>(token, '/dashboard/my-work');
  expect(work.payablesDue).toBeDefined();
  expect(work.receivables).toBeDefined();
  const trends = await api<Trends>(token, '/dashboard/trends');
  expect(trends.months).toHaveLength(6);
  expect(trends.cashIn).toHaveLength(6);
  expect(trends.cost).toHaveLength(6);

  await signIn(page, 'accounts@demo.com');
  const mine = page.locator('.ant-card').filter({ has: page.getByText('My work', { exact: true }) });
  await expect(mine.getByRole('region').first()).toHaveAccessibleName('Payments due this week');
  await expect(section(page, 'Bills awaiting payment')).toContainText(String(work.receivables!.count));
  await expect(page.getByText('Vendor payable', { exact: true })).toBeVisible();
  await expect(page.getByText(/^Received in [A-Z][a-z]{2,3}$/)).toBeVisible();
  await expect(page.getByText(/^Cost in [A-Z][a-z]{2,3}$/)).toBeVisible();
  await expect(page.getByRole('img', { name: /^Cash in and out\. / })).toBeVisible();
  await expect(page.getByRole('img', { name: /^Cost by head\. / })).toBeVisible();
});

test('a project manager sees approvals, missing DPRs and the progress curve', async ({ page }) => {
  const token = await apiToken('pm@demo.com');
  const work = await api<MyWork>(token, '/dashboard/my-work');
  expect(work.approvals).toBeDefined();
  expect(work.dprsMissing).toBeDefined();

  await signIn(page, 'pm@demo.com');
  const approvals = section(page, 'Waiting for your approval');
  await expect(approvals).toBeVisible();
  await expect(approvals.getByRole('link', { name: 'Waiting for your approval' })).toHaveAttribute('href', '/approvals');
  // Missing DPRs are a card while any is missing; once every site has filed, they are named in the "Nothing else waiting" line.
  if (work.dprsMissing!.count > 0) await expect(section(page, 'DPRs not filed today')).toBeVisible();
  else await expect(page.getByText(/^Nothing else waiting: .*\bDPRs\b/)).toBeVisible();
  await expect(page.getByText(/^Work done in [A-Z][a-z]{2,3}$/)).toBeVisible();
  // The approvals tile gave way to progress against plan (UX item 85): done against planned, not a lone number.
  await expect(page.getByText('Progress against plan', { exact: true })).toBeVisible();
  await expect(page.locator('.kpi-card').filter({ hasText: 'Progress against plan' })).toContainText(/\d+(\.\d)?% planned by now/);
  await expect(page.getByRole('img', { name: /^Planned against actual progress\. / })).toBeVisible();
});

test('the approvals count shows once on home outside the sidebar', async ({ page }) => {
  const token = await apiToken('pm@demo.com');
  const work = await api<MyWork>(token, '/dashboard/my-work');
  const total = (work.approvals ?? []).reduce((n, a) => n + a.count, 0);
  expect(total).toBeGreaterThan(0);

  await signIn(page, 'pm@demo.com');
  const main = page.locator('#main-content');
  await expect(section(page, 'Waiting for your approval')).toContainText(String(total));
  await expect(main.locator('.kpi-card').first()).toBeVisible();
  await expect(main.getByText(String(total), { exact: true })).toHaveCount(1);
  await expect(main.getByText(/pending approvals?/i)).toHaveCount(0);
  await expect(main.getByRole('columnheader', { name: 'Pending' })).toHaveCount(0);
});

test("my work leads with what waits longest for the project manager", async ({ page }) => {
  const token = await apiToken('pm@demo.com');
  const work = await api<MyWork>(token, '/dashboard/my-work');
  const count = (k: CardKey | 'approvals') => (k === 'approvals' ? (work.approvals ?? []).reduce((n, a) => n + a.count, 0) : (work[k]?.count ?? 0));
  const urgency = (k: CardKey | 'approvals') => (k === 'approvals' ? work.approvalsWaitingDays : work[k]?.urgencyDays) ?? 0;
  const busy = MANAGER_ORDER.filter((k) => (k === 'approvals' ? work.approvals : work[k]) !== undefined && count(k) > 0);
  expect(busy.length).toBeGreaterThan(1);
  const expected = [...busy].sort((a, b) => urgency(b) - urgency(a) || MANAGER_ORDER.indexOf(a) - MANAGER_ORDER.indexOf(b));
  // The seed has a vendor bill overdue by days, more than any approval has waited: urgency, not the layout, leads.
  expect(urgency(expected[0])).toBeGreaterThan(urgency('approvals'));

  await signIn(page, 'pm@demo.com');
  const mine = page.locator('.ant-card').filter({ has: page.getByText('My work', { exact: true }) });
  const regions = mine.getByRole('region');
  await expect(regions.first()).toHaveAccessibleName(TITLES[expected[0]]);
  await expect(regions).toHaveCount(busy.length);
  for (let i = 0; i < expected.length; i++) await expect(regions.nth(i)).toHaveAccessibleName(TITLES[expected[i]]);
  // Cards with nothing waiting are one line, not empty cards.
  const clear = MANAGER_ORDER.filter((k) => (k === 'approvals' ? work.approvals : work[k]) !== undefined && count(k) === 0);
  if (clear.length) await expect(mine.getByText(/^Nothing else waiting: /)).toBeVisible();
  await expect(mine.getByText('Nothing to do.', { exact: true })).toHaveCount(0);
});

test('a month with nothing billed yet says so in words, with no trend', async ({ page }) => {
  // The first days of a month: nothing billed yet while last month had bills, and no cash moved in six months.
  await page.route(/\/api\/dashboard\/trends(\?|$)/, async (route) => {
    const res = await route.fetch();
    const body = (await res.json()) as Trends & { billed?: string[] };
    const zeros = (xs?: string[]) => xs?.map(() => '0.00');
    const billed = body.billed ? [...body.billed.slice(0, -2), '2549610.00', '0.00'] : undefined;
    await route.fulfill({ response: res, json: { ...body, billed, cashIn: zeros(body.cashIn), cashOut: zeros(body.cashOut) } });
  });
  const token = await apiToken('md@demo.com');
  const trends = await api<Trends>(token, '/dashboard/trends');
  const month = monthName(trends.months[trends.months.length - 1]);

  await signIn(page, 'md@demo.com');
  const billed = page.locator('.kpi-card').filter({ hasText: `Billed in ${month}` });
  await expect(billed).toContainText(`No bills raised in ${month} yet`);
  await expect(billed).not.toContainText('%');
  await expect(billed).not.toContainText('down');
  await expect(billed.locator('.ant-typography-danger')).toHaveCount(0);
  const received = page.locator('.kpi-card').filter({ hasText: `Received in ${month}` });
  await expect(received).toContainText(`No receipts in ${month} yet`);
  await expect(received).not.toContainText('%');
  // A chart of nothing but zeros says so, and what will appear there.
  const cash = page.locator('.ant-card').filter({ has: page.getByText('Cash in and out', { exact: true }) });
  await expect(cash).toContainText('Nothing to chart yet.');
  await expect(page.getByRole('img', { name: /^Cash in and out\. / })).toHaveCount(0);
});

test('a site engineer sees no money', async ({ page }) => {
  const token = await apiToken('engineer@demo.com');
  const work = await api<MyWork>(token, '/dashboard/my-work');
  expect(work.receivables ?? work.payablesDue).toBeUndefined();
  const trends = await api<Trends>(token, '/dashboard/trends');
  expect(trends.cashIn ?? trends.cashOut ?? trends.cost).toBeUndefined();

  await signIn(page, 'engineer@demo.com');
  await expect(page.getByText('My work', { exact: true })).toBeVisible();
  await expect(page.getByText('Delayed activities', { exact: true })).toBeVisible();
  await expect(page.locator('.kpi-card').filter({ hasText: 'Delayed activities' })).toContainText(/due to finish by today|None was due/);
  await expect(page.getByText('Vendor payable')).toHaveCount(0);
  await expect(page.getByText('Bills awaiting payment')).toHaveCount(0);
  await expect(page.getByRole('img', { name: /^Cash in and out\. / })).toHaveCount(0);
});
