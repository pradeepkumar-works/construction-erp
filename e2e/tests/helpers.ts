import { expect, type Locator, type Page } from '@playwright/test';

export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4000/api';
export const PASSWORD = 'password123';

/** Today as the sites see it (the browser runs in Asia/Kolkata, as does the API's "today"), YYYY-MM-DD. */
export const localToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/** Sign in through the login form and wait for the dashboard. */
export async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(/^Welcome, /)).toBeVisible();
}

/** A bearer token for setting up or checking data through the API. */
export async function apiToken(email: string, password = PASSWORD): Promise<string> {
  const res = await fetch(`${API_URL}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  if (!res.ok) throw new Error(`login ${email}: ${res.status}`);
  return ((await res.json()) as { accessToken: string }).accessToken;
}

export async function api<T>(token: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: init.method ?? 'GET',
    headers: { authorization: `Bearer ${token}`, ...(init.body ? { 'content-type': 'application/json' } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

/** Pick an option in an antd Select: type to filter, then Enter takes the first match (or the first option when `text` is empty). */
export async function chooseOption(field: Locator, text = '') {
  await field.click();
  if (text) await field.fill(text);
  await field.page().locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-active').filter({ visible: true }).last().waitFor();
  await field.press('Enter');
}

/** The Approvals queue lists oldest first; flip it so a just-submitted entry is on the first page. */
export async function newestFirst(page: Page) {
  const order = page.getByRole('radiogroup', { name: 'Order' }).or(page.locator('[aria-label="Order"]'));
  await order.getByText('Newest first', { exact: true }).click();
}

/** An entry in the Approvals inbox's queue, by text in its title; `open` picks it, showing it in the pane beside. */
export function queueItem(page: Page, text: string | RegExp) {
  const item = page.locator('[data-queue-item]').filter({ hasText: text });
  return { item, open: () => item.getByRole('button').first().click(), decision: page.getByRole('toolbar', { name: 'Decision' }) };
}

/** A quantity no other entry will have (three decimals), so a test can find its own row by it. */
export const uniqueQty = () => String(Number((100 + Math.random() * 800).toFixed(3)));

/** Opens a tab of the project page: its group across the top, then the tab inside the group (UI roadmap item 56). */
export async function openProjectTab(page: Page, group: string, tab?: string) {
  await page.getByTestId('project-workspace-bar').getByRole('tab', { name: group, exact: true }).click();
  if (tab) await projectTabs(page, group).getByText(tab, { exact: true }).click();
}

/** The tabs inside a group of the project page, once the group is open. */
export const projectTabs = (page: Page, group: string) => page.getByRole('radiogroup', { name: `${group} tabs` });

/** An open form by its title, whether it sits in a modal (short forms) or a drawer (long ones). */
export function formPanel(page: Page, title: string | RegExp): Locator {
  return page
    .locator('.ant-modal, .ant-drawer-content-wrapper')
    .filter({ has: page.locator('.ant-modal-title, .ant-drawer-title').filter({ hasText: title }) });
}
