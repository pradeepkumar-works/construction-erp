import { expect, test } from '@playwright/test';
import { api, apiToken, signIn } from './helpers';

/**
 * The morning brief (AI item 74). Ask Nirmaan is on for the DEMO company, so the MD is offered the brief on the home
 * page; asking for it writes today's at once (the test model returns the rules' own lines), and Turn off stops it.
 */

test.use({ contextOptions: { reducedMotion: 'reduce' } });

type BriefStatus = { available: boolean; optedIn: boolean; brief: { lines: { text: string; href: string | null }[] } | null };

test('the MD asks for the morning brief, sees three lines with links and turns it off', async ({ page }) => {
  const md = await apiToken('md@demo.com');
  await api(md, '/briefs/me', { method: 'PUT', body: { morningBrief: false } });
  try {
    await signIn(page, 'md@demo.com');
    await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('nirmaan.morningBrief.')).forEach((k) => localStorage.removeItem(k)));
    await page.reload();
    await page.getByRole('button', { name: 'Get the morning brief' }).click();

    const card = page.locator('.ant-card').filter({ hasText: 'Your morning brief' });
    await expect(card).toBeVisible();
    const status = await api<BriefStatus>(md, '/briefs/today');
    expect(status.optedIn).toBe(true);
    const lines = status.brief?.lines ?? [];
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length).toBeLessThanOrEqual(3);
    await expect(card.getByRole('listitem')).toHaveCount(lines.length);
    const linked = lines.find((l) => l.href);
    if (linked) await expect(card.getByRole('link', { name: linked.text })).toHaveAttribute('href', linked.href!);
    await expect(card.getByText(/Written by Ask Nirmaan from your records/)).toBeVisible();

    await card.getByRole('button', { name: 'Turn off' }).click();
    await expect(page.getByRole('button', { name: 'Get the morning brief' })).toBeVisible();
    expect((await api<BriefStatus>(md, '/briefs/today')).optedIn).toBe(false);
  } finally {
    await api(md, '/briefs/me', { method: 'PUT', body: { morningBrief: false } });
  }
});
