import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { API_URL, api, apiToken, signIn } from './helpers';

/**
 * Ask Nirmaan (AI item 67). CI runs the API with AI_PROVIDER=fake: a scripted stand-in for the model that calls one
 * real tool picked from the question's words and lists what came back as links. So these tests cover the panel,
 * streaming, the tools' access rules, citations, history and the admin switch, but not the model's wording.
 */

// Colours are measured once nothing is sliding in.
test.use({ contextOptions: { reducedMotion: 'reduce' } });

type Status = { enabled: boolean; reason: string | null; questionsLeftToday: number; canManage: boolean };

// On a wide screen the panel is a column beside the page (a complementary landmark), not a dialog over it.
const panel = (page: Page) => page.getByRole('complementary', { name: 'Ask Nirmaan' });

async function ask(page: Page, question: string) {
  const box = panel(page).getByPlaceholder('Ask about projects, bills, orders, stock…');
  await box.fill(question);
  await box.press('Enter');
}

/** Reads the whole answer stream of POST /ai/ask. */
async function askApi(token: string, question: string) {
  const res = await fetch(`${API_URL}/ai/ask`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  return { status: res.status, body: await res.text() };
}

test('the panel answers with links to the records it used, and they open', async ({ page }) => {
  await signIn(page, 'pm@demo.com');
  await page.keyboard.press('Control+j');
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).getByText('Try asking')).toBeVisible();
  await ask(page, 'Which projects are we running?');

  await expect(panel(page).getByText(/Here is what I found \(\d+\)/)).toBeVisible();
  const sources = panel(page).getByLabel('Records used');
  await expect(sources.getByRole('link').first()).toBeVisible();
  // Only the projects this project manager can see are cited.
  const pm = await apiToken('pm@demo.com');
  const theirs = (await api<{ items: { id: string }[] }>(pm, '/projects?pageSize=100')).items.map((p) => `/projects/${p.id}`);
  for (const href of await sources.getByRole('link').evaluateAll((els) => els.map((e) => e.getAttribute('href')))) expect(theirs).toContain(href);

  await panel(page).getByRole('button', { name: 'Helpful', exact: true }).click();
  await expect(panel(page).getByRole('button', { name: 'Helpful', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await sources.getByRole('link').first().click();
  await expect(page).toHaveURL(/\/projects\/[\w-]+$/);
  // The panel stays open beside the page on a wide screen.
  await expect(panel(page)).toBeVisible();
});

test('a site engineer is told when a question is outside their role', async ({ page }) => {
  await signIn(page, 'engineer@demo.com');
  await page.getByRole('button', { name: 'Ask Nirmaan', exact: true }).click();
  await ask(page, 'What is the cost and margin on our projects?');
  await expect(panel(page).getByText(/can't show that/)).toBeVisible();
  await expect(panel(page)).toContainText('outside what their role can see');
});

test('Ctrl K hands a question to Ask Nirmaan, and the conversation is kept in history', async ({ page }) => {
  await signIn(page, 'md@demo.com');
  await page.keyboard.press('Control+k');
  const question = `Which purchase orders are open ${Date.now()}?`;
  await page.getByRole('combobox', { name: 'Search', exact: true }).fill(question);
  const option = page.getByRole('option', { name: /^Ask Nirmaan/ });
  await expect(option).toBeVisible();
  await option.click();
  await expect(panel(page).getByText(question)).toBeVisible();
  await expect(panel(page).getByRole('button', { name: 'Copy answer' })).toBeVisible();

  await panel(page).getByRole('button', { name: 'New conversation' }).click();
  await expect(panel(page).getByText('Try asking')).toBeVisible();
  await panel(page).getByRole('button', { name: 'Past conversations' }).click();
  const row = panel(page).getByRole('button', { name: question, exact: true });
  await expect(row).toBeVisible();
  await row.click();
  await expect(panel(page).getByText(question)).toBeVisible();

  // Deleting it takes it off the list.
  await panel(page).getByRole('button', { name: 'Past conversations' }).click();
  await panel(page).getByRole('button', { name: `Delete “${question}”` }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(panel(page).getByRole('button', { name: question, exact: true })).toHaveCount(0);
});

test('guests cannot ask, and nobody can ask once an admin switches it off', async () => {
  // Guests only reach the client portal's routes.
  const client = await apiToken('client@demo.com');
  expect((await fetch(`${API_URL}/ai/status`, { headers: { authorization: `Bearer ${client}` } })).status).toBe(403);
  expect((await askApi(client, 'Show me the bills')).status).toBe(403);

  const admin = await apiToken('admin@demo.com');
  const pm = await apiToken('pm@demo.com');
  await api(admin, '/ai/settings', { method: 'PATCH', body: { enabled: false } });
  try {
    expect(await api<Status>(pm, '/ai/status')).toMatchObject({ enabled: false, reason: 'COMPANY_OFF', canManage: false });
    const refused = await askApi(pm, 'Show me the bills');
    expect(refused.status).toBe(403);
    expect(refused.body).toContain('switched off');
  } finally {
    await api(admin, '/ai/settings', { method: 'PATCH', body: { enabled: true } });
  }
  expect((await api<Status>(pm, '/ai/status')).enabled).toBe(true);
});

test('an admin sees the switch, the allowance and this month’s use', async ({ page }) => {
  await signIn(page, 'admin@demo.com');
  await page.goto('/ai-settings');
  await expect(page.getByRole('heading', { name: 'Ask Nirmaan' })).toBeVisible();
  const toggle = page.getByRole('switch', { name: 'On for everyone in the company' });
  await expect(toggle).toBeChecked();
  await expect(page.getByRole('spinbutton', { name: 'Monthly allowance' })).toBeVisible();
  await expect(page.getByText('This month', { exact: true })).toBeVisible();
  // Not for other roles.
  const pm = await apiToken('pm@demo.com');
  const res = await fetch(`${API_URL}/ai/settings`, { headers: { authorization: `Bearer ${pm}` } });
  expect(res.status).toBe(403);
});

test('the panel passes axe', async ({ page }) => {
  await signIn(page, 'pm@demo.com');
  await page.keyboard.press('Control+j');
  await ask(page, 'What is waiting for my approval?');
  await expect(panel(page).getByRole('button', { name: 'Copy answer' })).toBeVisible();
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity));
  const result = await new AxeBuilder({ page }).include('.ask-panel').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
});
