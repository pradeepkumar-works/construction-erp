import { expect, test } from '@playwright/test';
import { api, apiToken, signIn } from './helpers';

/**
 * Ask the contract (AI item 75): a search of filed contracts lands on the page that says it, and the page view shows
 * that page's text with Previous and Next. The sample road contract (RD-AGR-01) has liquidated damages on page 4.
 */

type Hit = { source: string; title: string; page: number | null; href: string };

test('a search for the LD cap opens the road contract at page 4 and steps to page 5', async ({ page }) => {
  const md = await apiToken('md@demo.com');
  const { hits } = await api<{ hits: Hit[] }>(md, `/documents/search?q=${encodeURIComponent('liquidated damages maximum')}`);
  const hit = hits.find((h) => h.title.startsWith('RD-AGR-01'));
  expect(hit, 'the road contract is found').toBeTruthy();
  expect(hit!.page).toBe(4);

  await signIn(page, 'md@demo.com');
  await page.goto(hit!.href);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('RD-AGR-01');
  await expect(page.getByText('Page 4 of 6').first()).toBeVisible();
  await expect(page.getByText(/Clause 12\. Liquidated damages/).first()).toBeVisible();
  await expect(page.getByText(/maximum of 10%/).first()).toBeVisible();

  await page.getByRole('link', { name: 'Next page' }).click();
  await expect(page).toHaveURL(/page=5/);
  await expect(page.getByText('Page 5 of 6').first()).toBeVisible();
  await expect(page.getByText(/Clause 16\. Payments/).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open the document' })).toHaveAttribute('href', /\/documents\?id=/);
});

test('the engineer cannot open a page of a contract outside their projects', async () => {
  const md = await apiToken('md@demo.com');
  const { hits } = await api<{ hits: Hit[] }>(md, `/documents/search?q=${encodeURIComponent('security deposit percentage')}`);
  const hospital = hits.find((h) => h.title.startsWith('HB-AGR-01'));
  expect(hospital).toBeTruthy();
  const file = new URL(hospital!.href, 'http://x').searchParams.get('file');
  const se = await apiToken('engineer@demo.com');
  const res = await api(se, `/documents/files/${file}/pages/1`).catch((e: Error) => e);
  expect(String(res)).toMatch(/404/);
});
