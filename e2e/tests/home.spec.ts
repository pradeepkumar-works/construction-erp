import { expect, test } from '@playwright/test';
import { api, apiToken, signIn } from './helpers';
import { compareWaiting } from '../../packages/shared/src/waiting-rank';

type Card = { count: number; amount: string | null; items: { label: string; href: string }[]; urgencyDays?: number | null };
type MyWork = { approvals?: { type: string; count: number; amount?: string | null }[]; approvalsWaitingDays?: number | null } & Partial<Record<CardKey, Card>>;
type CardKey = 'watchList' | 'dprsMissing' | 'sentBack' | 'waitingWithOthers' | 'receivables' | 'payablesDue' | 'expiring' | 'lateDeliveries' | 'lowStock' | 'meetingActions' | 'toOrder' | 'dueThisWeek' | 'staffToDecide' | 'certifiedToReceive' | 'toMatch' | 'grnsToCheck' | 'toDebit' | 'transfersToReceive' | 'letters' | 'findingsToClose';
type Trends = { months: string[]; workDone: string[]; cashIn?: string[]; cashOut?: string[]; cost?: string[]; sCurve: unknown[] };

const section = (page: import('@playwright/test').Page, name: string) => page.getByRole('region', { name, exact: true });

/** My work's card titles, and the project manager's and accounts' layout orders (`homeLayout`), the last tie-break. */
const TITLES: Record<CardKey | 'approvals', string> = {
  approvals: 'Waiting for your approval',
  watchList: 'Watch list',
  dprsMissing: 'Daily reports not filed today',
  sentBack: 'Sent back to you',
  waitingWithOthers: 'Waiting with others',
  receivables: 'Bills waiting for payment',
  payablesDue: 'Payments due this week',
  expiring: 'Guarantees and licences expiring',
  lateDeliveries: 'Late deliveries',
  lowStock: 'Below minimum stock',
  meetingActions: 'Your actions from meetings',
  toOrder: 'Requests to order',
  dueThisWeek: 'Deliveries due this week',
  staffToDecide: 'Leave and overtime to decide',
  certifiedToReceive: 'Certified, payment to come',
  toMatch: 'Received, not billed',
  grnsToCheck: 'Material to check',
  findingsToClose: 'Audit findings to close',
  toDebit: 'Debit notes to raise',
  transfersToReceive: 'Material on the way',
  letters: 'Letters for you',
};
const MANAGER_ORDER: (CardKey | 'approvals')[] = ['approvals', 'watchList', 'meetingActions', 'letters', 'dprsMissing', 'staffToDecide', 'lateDeliveries', 'toOrder', 'grnsToCheck', 'findingsToClose', 'dueThisWeek', 'transfersToReceive', 'expiring', 'lowStock', 'payablesDue', 'receivables', 'sentBack', 'waitingWithOthers'];
const ACCOUNTS_ORDER: (CardKey | 'approvals')[] = ['payablesDue', 'certifiedToReceive', 'toMatch', 'toDebit', 'watchList', 'receivables', 'approvals', 'expiring', 'lateDeliveries', 'meetingActions', 'letters', 'sentBack', 'waitingWithOthers'];

/**
 * The cards My work shows, in its order (`rankWaiting` over `myWorkOrder`'s weights): the bigger money band first, then
 * the more days past the card's mark (an approval's mark is two days), then the role's layout.
 */
function rankedCards(work: MyWork, order: (CardKey | 'approvals')[]) {
  const count = (k: CardKey | 'approvals') => (k === 'approvals' ? (work.approvals ?? []).reduce((n, a) => n + a.count, 0) : (work[k]?.count ?? 0));
  const priced = (work.approvals ?? []).filter((a) => a.amount != null);
  const amount = (k: CardKey | 'approvals') => (k === 'approvals' ? (priced.length ? priced.reduce((t, a) => t + Number(a.amount), 0) : null) : (work[k]?.amount ?? null));
  const daysLate = (k: CardKey | 'approvals') => (k === 'approvals' ? (work.approvalsWaitingDays == null ? 0 : work.approvalsWaitingDays - 2) : (work[k]?.urgencyDays ?? 0));
  const weight = (k: CardKey | 'approvals') => ({ amount: amount(k), daysLate: daysLate(k), place: order.indexOf(k) });
  const busy = order.filter((k) => (k === 'approvals' ? work.approvals : work[k]) !== undefined && count(k) > 0);
  return { busy, ranked: [...busy].sort((a, b) => compareWaiting(weight(a), weight(b))), count };
}

/** "Oct" for the API's YYYY-MM, as the tiles write it. */
const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });

/**
 * Home dashboards by role: the page leads with what waits for the user (My work), then the KPI
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
  await page.goto('/my-work');
  const mine = page.locator('.ant-card').filter({ has: page.getByText('My work', { exact: true }) });
  // The biggest money leads, not the layout's first card: crores of client bills before a week's lakhs of payments.
  await expect(mine.getByRole('region').first()).toHaveAccessibleName(TITLES[rankedCards(work, ACCOUNTS_ORDER).ranked[0]]);
  // A card with rupees leads with them, and says its count in words.
  await expect(section(page, 'Bills waiting for payment')).toContainText(`${work.receivables!.count} bill`);
  await expect(page.getByText('We owe', { exact: true })).toBeVisible();
  await expect(page.getByText(/^Money received in [A-Z][a-z]{2,3}$/)).toBeVisible();
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
  await page.goto('/my-work');
  const approvals = section(page, 'Waiting for your approval');
  await expect(approvals).toBeVisible();
  await expect(approvals.getByRole('link', { name: 'Waiting for your approval' })).toHaveAttribute('href', '/approvals');
  // Missing DPRs are a card while any is missing; once every site has filed, they are named in the "Nothing else waiting" line.
  if (work.dprsMissing!.count > 0) await expect(section(page, 'Daily reports not filed today')).toBeVisible();
  else await expect(page.getByText(/^Nothing else waiting: .*\bDPRs\b/)).toBeVisible();
  await expect(page.getByText(/^Work done in [A-Z][a-z]{2,3}$/)).toBeVisible();
  // The approvals tile gave way to progress against plan: done against planned, not a lone number.
  await expect(page.getByText('Physical progress', { exact: true })).toBeVisible();
  await expect(page.locator('.figure-cell').filter({ hasText: 'Physical progress' })).toContainText(/\d+(\.\d)?% planned by now/);
  await expect(page.getByRole('img', { name: /^Planned against actual progress\. / })).toBeVisible();
});

test('the approvals count shows once on home outside the sidebar', async ({ page }) => {
  const token = await apiToken('pm@demo.com');
  const work = await api<MyWork>(token, '/dashboard/my-work');
  const total = (work.approvals ?? []).reduce((n, a) => n + a.count, 0);
  expect(total).toBeGreaterThan(0);

  await signIn(page, 'pm@demo.com');
  await page.goto('/my-work');
  const main = page.locator('#main-content');
  await expect(section(page, 'Waiting for your approval')).toContainText(String(total));
  await expect(main.locator('.figure-cell').first()).toBeVisible();
  await expect(main.getByText(String(total), { exact: true })).toHaveCount(1);
  await expect(main.getByText(/pending approvals?/i)).toHaveCount(0);
  await expect(main.getByRole('columnheader', { name: 'Pending' })).toHaveCount(0);
});

test('my work leads with the most money, then the latest, for the project manager', async ({ page }) => {
  const token = await apiToken('pm@demo.com');
  const work = await api<MyWork>(token, '/dashboard/my-work');
  const { busy, ranked: expected, count } = rankedCards(work, MANAGER_ORDER);
  expect(busy.length).toBeGreaterThan(1);
  // The seed has vendor bills due, worth lakhs, far down the manager's layout: money, not the layout, moves them up.
  expect(expected).not.toEqual(busy);

  await signIn(page, 'pm@demo.com');
  await page.goto('/my-work');
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
  const before = monthName(trends.months[trends.months.length - 2]);
  // A zero is a muted ₹ 0 that says what last month was, never a full-weight figure or a percentage.
  const zero = /₹\s0(?![.,\d])/;

  await signIn(page, 'md@demo.com');
  await page.goto('/my-work');
  const billed = page.locator('.figure-cell').filter({ hasText: `Billed in ${month}` });
  await expect(billed).toContainText(zero);
  await expect(billed).not.toContainText('%');
  await expect(billed).not.toContainText('down');
  await expect(billed).toContainText(` in ${before}`);
  const received = page.locator('.figure-cell').filter({ hasText: `Money received in ${month}` });
  await expect(received).toContainText(zero);
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
  await page.goto('/my-work');
  await expect(page.locator('.ant-card').filter({ has: page.getByText('My work', { exact: true }) }).first()).toBeVisible();
  // Delayed activities is a figure while any is late, else a word in the strip's quiet line.
  await expect(page.getByRole('region', { name: 'Key figures' })).toContainText(/Delayed activities.*due to finish by today|No activity delayed/);
  await expect(page.getByText('We owe', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Bills waiting for payment')).toHaveCount(0);
  await expect(page.getByRole('img', { name: /^Cash in and out\. / })).toHaveCount(0);
});
