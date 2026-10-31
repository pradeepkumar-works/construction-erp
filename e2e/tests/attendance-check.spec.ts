import { expect, test } from '@playwright/test';
import { api, apiToken, signIn } from './helpers';

/**
 * Attendance cross-check. Sri Jagannath's labour bill on the road site asks more helper man-days than the
 * head count and roll call hold: the page flags it with its working, the bill's own checks flag the line (counts only)
 * and the watch list carries it for the approver. Three helpers marked present without a punch are named to the project
 * manager, and only counted for management. A site engineer is refused.
 */

test.use({ contextOptions: { reducedMotion: 'reduce' } });

type Line = { trade: string | null; billed: number; supported: number | null; excess: number; flagged: boolean };
type Bill = { billId: string; label: string; to: string; lines: Line[] };
type Flag = { kind: string; title: string; billId: string | null; workers: { name: string }[] | null };
type Check = { month: string; bills: Bill[]; flags: Flag[]; days: { date: string }[] };

async function roadCheck(email: string) {
  const token = await apiToken(email);
  const projects = await api<{ items: { id: string; code: string }[] }>(token, '/projects?pageSize=50');
  const road = projects.items.find((p) => p.code === 'RD-2026-01')!;
  const now = await api<Check>(token, `/attendance-check?projectId=${road.id}`);
  return { token, road, now };
}

test('the padded labour bill and the unpunched helpers come up for the project manager, with names', async ({ page }) => {
  const { road, now } = await roadCheck('pm@demo.com');
  await expect(api(await apiToken('engineer@demo.com'), '/attendance-check')).rejects.toThrow(/403/);
  const bill = now.bills.find((b) => b.lines.some((l) => l.flagged));
  test.skip(!bill, 'The seeded labour bill is not in this month');
  const helper = bill!.lines.find((l) => l.flagged)!;
  const miss = now.flags.find((f) => f.kind === 'NO_PUNCH');

  await signIn(page, 'pm@demo.com');
  await page.goto(`/attendance-check?projectId=${road.id}`);
  await expect(page.getByRole('heading', { name: 'Attendance cross-check', level: 1 })).toBeVisible();
  const card = page.locator('[data-flag-key^="bill:"]').filter({ hasText: bill!.label });
  await expect(card.getByRole('heading', { name: `${bill!.label} bills ${helper.billed} helper man-days; the records show at most ${helper.supported}` })).toBeVisible();
  await card.getByRole('button', { name: 'Why: the working' }).click();
  await expect(card.getByText(/^Supported: the higher of the head count and the roll call/)).toBeVisible();
  await expect(card.getByRole('link', { name: bill!.label })).toHaveAttribute('href', `/subcontract-bills/${bill!.billId}`);
  if (miss) {
    const missCard = page.locator('[data-flag-key^="nopunch:"]').first();
    await expect(missCard.getByText(miss.title)).toBeVisible();
    await expect(missCard.getByText(miss.workers![0].name, { exact: false })).toBeVisible();
  }
  // The bills table and each day of the project.
  await expect(page.getByRole('heading', { name: 'Man-day bills', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Each day', level: 2 })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'DPR manpower' })).toBeVisible();
});

test('management sees the count without names; the bill flags its own line and the watch list carries it', async ({ page }) => {
  const { token, road, now } = await roadCheck('md@demo.com');
  const bill = now.bills.find((b) => b.lines.some((l) => l.flagged));
  test.skip(!bill, 'The seeded labour bill is not in this month');
  expect(now.flags.filter((f) => f.kind === 'NO_PUNCH').every((f) => f.workers === null)).toBe(true);
  const watch = await api<{ open: { kind: string; links: { href: string }[] }[]; dismissed: { kind: string; links: { href: string }[] }[] }>(token, '/warnings');
  expect([...watch.open, ...watch.dismissed].some((w) => w.kind === 'MANDAYS_ABOVE' && w.links.some((l) => l.href === `/subcontract-bills/${bill!.billId}`))).toBe(true);

  await signIn(page, 'md@demo.com');
  await page.goto(`/attendance-check?projectId=${road.id}`);
  const missCard = page.locator('[data-flag-key^="nopunch:"]').first();
  if (await missCard.count()) await expect(missCard.getByText('Workers:')).toHaveCount(0);

  await page.goto(`/subcontract-bills/${bill!.billId}`);
  const helper = bill!.lines.find((l) => l.flagged)!;
  await expect(page.getByText(new RegExp(`^Line \\d+ bills ${helper.billed} man-days; the site's attendance for .* supports ${helper.supported}$`))).toBeVisible();
});
