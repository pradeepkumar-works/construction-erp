import { expect, test } from '@playwright/test';
import { api, apiToken, homeHeading, signIn } from './helpers';

type Card = { count: number; items: { label: string; href: string }[] };
type MyWork = Partial<Record<'toOrder' | 'dueThisWeek' | 'staffToDecide' | 'certifiedToReceive' | 'toMatch' | 'receivables', Card>>;

const myWork = async (email: string) => api<MyWork>(await apiToken(email), '/dashboard/my-work');

/**
 * My work queues (finding 8 of the October review): each desk sees the list it works through, purchase what is left to
 * order, the store what is due this week, HR the leave and overtime to decide, accounts the certified bills and the
 * goods with no bill yet; and Home leads with the most pressing of them.
 */
test('each desk gets its own queue on My work', async () => {
  const [purchase, store, hr, accounts, engineer] = await Promise.all(['procurement@demo.com', 'store@demo.com', 'hr@demo.com', 'accounts@demo.com', 'engineer@demo.com'].map(myWork));

  expect(purchase.toOrder).toBeDefined();
  expect(purchase.dueThisWeek).toBeDefined();
  expect(purchase.certifiedToReceive).toBeUndefined();
  for (const i of purchase.toOrder!.items) expect(i.href).toMatch(/^\/material-requests\//);

  expect(store.dueThisWeek).toBeDefined();
  expect(store.toOrder).toBeUndefined();

  expect(hr.staffToDecide).toBeDefined();
  expect(hr.toMatch).toBeUndefined();
  for (const i of hr.staffToDecide!.items) expect(i.href).toMatch(/^\/staff\?tab=(leave|overtime)/);

  expect(accounts.certifiedToReceive).toBeDefined();
  expect(accounts.toMatch).toBeDefined();
  expect(accounts.toOrder).toBeUndefined();
  // Certified bills are the open client bills the client has accepted: never more of them than of the open ones.
  expect(accounts.certifiedToReceive!.count).toBeLessThanOrEqual(accounts.receivables!.count);

  // A site engineer has none of the office queues (and no leave to decide in the demo).
  expect([engineer.toOrder, engineer.toMatch, engineer.certifiedToReceive, engineer.staffToDecide]).toEqual([undefined, undefined, undefined, undefined]);
});

test('Home leads with what waits for you', async ({ page }) => {
  const work = await myWork('procurement@demo.com');
  await signIn(page, 'procurement@demo.com');
  await expect(homeHeading(page)).toBeVisible();
  const waiting = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Waiting for you' }) });
  await expect(waiting).toBeVisible();
  if (work.toOrder!.count > 0) {
    const link = waiting.getByRole('link', { name: /Requests to order/ });
    await expect(link).toContainText(String(work.toOrder!.count));
    await link.click();
    await expect(page).toHaveURL(/\/material-requests\?status=APPROVED/);
  } else {
    await expect(waiting.getByRole('link', { name: /All my work|Open My work/ })).toBeVisible();
  }
});
