import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test';

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

/**
 * Pick an option in an antd Select: type to filter, then Enter takes the first match (or the first option when `text` is
 * empty). It waits on this field's own list (one just closed can still be fading out), and a search-as-you-type picker
 * (item 83) offers no option until the server has answered for the words typed.
 */
export async function chooseOption(field: Locator, text = '') {
  await field.click();
  if (text) await field.fill(text);
  const page = field.page();
  const list = await field.getAttribute('aria-controls');
  const dropdown = list ? page.locator('.ant-select-dropdown').filter({ has: page.locator(`[id="${list}"]`) }) : page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
  await dropdown.locator('.ant-select-item-option-active').filter({ visible: true }).last().waitFor();
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

/** The WCAG levels axe checks (UI roadmap item 65): 2.0, 2.1 and 2.2, A and AA. */
export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** The light or dark theme and the density, set before the app loads (Profile > Appearance keeps them here). */
export async function setAppearance(target: Page | BrowserContext, mode: 'light' | 'dark', density: 'comfortable' | 'compact' = 'comfortable') {
  await target.addInitScript((a) => window.localStorage.setItem('nirmaan.appearance', JSON.stringify(a)), { mode, density });
}

/**
 * Opens a page and waits for the app's own ready signal: no loading skeleton or `aria-busy` region left (PageSkeleton,
 * DataTable's first load, the shell's), no spinner, the page's heading drawn and the web fonts in. No network-idle wait.
 */
export async function settle(page: Page, path?: string) {
  if (path !== undefined) await page.goto(path);
  await expect(page.locator('[aria-busy="true"], .ant-skeleton, .ant-spin-spinning').filter({ visible: true })).toHaveCount(0);
  await expect(page.locator('h1').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/**
 * axe's WCAG 2.2 AA findings on the page, as "rule: first three elements". Colours are measured once nothing is fading
 * or sliding in (looping ones, such as a spinner, never finish). Excluded: antd's zero-height table measure row
 * (aria-hidden, never shown) and the tab bar's own overflow menu, both inside antd and not ours to change.
 */
export async function axeViolations(page: Page): Promise<string[]> {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity));
  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).exclude('.ant-table-measure-row').exclude('.ant-tabs-nav-operations').analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`);
}

/** How far the page itself scrolls sideways, in px (0 when it fits the window). */
export const pageOverflow = (page: Page) => page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));

export interface SizeFinding {
  what: string;
  size: string;
}

/**
 * Runs in the page (`page.evaluate(measureTargets, 24)`), UX item 82: the controls smaller than `min` px that crowd
 * another, and the text set below 12 px.
 * - every control is at least `min` by `min` px (24 for a mouse, WCAG 2.5.8; 44 on a touch screen), or so spaced that a
 *   `min` px circle on its centre touches no other control (2.5.8's spacing exception). A link in running text (a
 *   paragraph, a list item's sentence) is exempt, and so is a link in a table cell when the row itself opens the record;
 * - no text on the page is set below 12 px.
 * A control is measured where it takes the click: a checkbox by its label, a select or date field by its box, a tab by
 * the tab around its text.
 */
export function measureTargets(min: number): { targets: SizeFinding[]; text: SizeFinding[] } {
  const SELECTOR = 'button, a, input, [role=button], [role=tab], [role=checkbox], .ant-select-selector, .ant-segmented-item';
  // The element that takes the click for each kind of control: antd 6 draws a select without `.ant-select-selector`, so
  // its search input is measured by the select's box, and a pagination link or arrow by its list item (which takes the click).
  const HIT_AREA = '.ant-checkbox-wrapper, .ant-radio-wrapper, .ant-select, .ant-picker, .ant-input-affix-wrapper, .ant-input-number, .ant-tabs-tab, .ant-pagination-item, .ant-pagination-prev, .ant-pagination-next';
  const hitArea = (el: Element) => (el.matches('input, [role=tab], .ant-pagination-item > a, .ant-pagination-item-link') ? el.closest(HIT_AREA) : null) ?? el;
  // antd internals that are not targets: the table's zero-height measure row and the tab bar's hidden overflow button.
  // A number field's step arrows are exempt as 2.5.8 allows for a control with an equivalent: the field itself, typed
  // into or stepped with the arrow keys.
  const IGNORE = '.ant-table-measure-row, .ant-tabs-nav-operations-hidden, .ant-input-number-actions, [aria-hidden="true"]';

  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && el.checkVisibility({ visibilityProperty: true });
  };
  const describe = (el: Element) => {
    const label = el.getAttribute('aria-label') ?? (el.textContent ?? '').trim().slice(0, 30);
    const cls = typeof el.className === 'string' ? el.className.split(' ').filter((c) => c && !c.startsWith('css-'))[0] : '';
    return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''} "${label}"`;
  };
  // In running text: a link inside a paragraph, a list item's sentence, or a table cell of a row that opens on click.
  const inline = (el: Element) => {
    if (el.tagName !== 'A') return false;
    if (el.closest('p')) return true;
    if (el.closest('tr.row-click')) return true;
    const li = el.closest('li');
    return !!li && (li.textContent ?? '').trim().length > (el.textContent ?? '').trim().length;
  };

  const seen = new Set<Element>();
  const boxes: { el: Element; rect: DOMRect; what: string; inline: boolean }[] = [];
  for (const raw of document.querySelectorAll(SELECTOR)) {
    if (raw.closest(IGNORE)) continue;
    const el = hitArea(raw);
    if (seen.has(el) || !visible(el)) continue;
    seen.add(el);
    boxes.push({ el, rect: el.getBoundingClientRect(), what: describe(raw), inline: inline(raw) });
  }

  const small = (r: DOMRect) => r.width < min - 0.5 || r.height < min - 0.5;
  const centre = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  const distanceToRect = (p: { x: number; y: number }, r: DOMRect) => Math.hypot(Math.max(r.left - p.x, 0, p.x - r.right), Math.max(r.top - p.y, 0, p.y - r.bottom));
  const targets: SizeFinding[] = [];
  for (const b of boxes) {
    if (b.inline || !small(b.rect)) continue;
    const c = centre(b.rect);
    const crowded = boxes.some((o) => {
      if (o === b || o.el.contains(b.el) || b.el.contains(o.el)) return false;
      if (distanceToRect(c, o.rect) < min / 2) return true;
      if (!small(o.rect) || o.inline) return false;
      const oc = centre(o.rect);
      return Math.hypot(c.x - oc.x, c.y - oc.y) < min;
    });
    if (crowded) targets.push({ what: b.what, size: `${Math.round(b.rect.width)}x${Math.round(b.rect.height)}` });
  }

  const text: SizeFinding[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const checked = new Set<Element>();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || checked.has(parent) || !(node.textContent ?? '').trim()) continue;
    checked.add(parent);
    if (parent.closest('script, style, noscript, .ant-table-measure-row') || !visible(parent)) continue;
    const size = parseFloat(getComputedStyle(parent).fontSize);
    if (size < 11.95) text.push({ what: describe(parent), size: `${size}px` });
  }
  return { targets, text };
}

/*
 * The web app's own source, read rather than copied, so the checks follow it: the sidebar's links (nav.ts), the project
 * page's tabs, the product name and the Web Vitals budgets.
 */
const webSource = (file: string) => fs.readFileSync(path.resolve(__dirname, '../../apps/web/src', file), 'utf8');

/** Every page the sidebar can link to (`components/shell/nav.ts`), for any role. */
export function navHrefs(): string[] {
  return [...new Set([...webSource('components/shell/nav.ts').matchAll(/href:\s*(['"`])(\/[^'"`$]*)\1/g)].map((m) => m[2]))];
}

/** The project page's tab keys, the `?tab=` values (`app/(app)/projects/[id]/page.tsx`). */
export function projectTabKeys(): string[] {
  return [...webSource('app/(app)/projects/[id]/page.tsx').matchAll(/\{\s*key:\s*'([\w-]+)',\s*group:/g)].map((m) => m[1]);
}

/** The product name tab titles end with (`packages/shared/src/brand.ts`). */
export const PRODUCT_NAME = /PRODUCT_NAME\s*=\s*'([^']+)'/.exec(fs.readFileSync(path.resolve(__dirname, '../../packages/shared/src/brand.ts'), 'utf8'))![1];

/** `WEB_VITAL_BUDGETS` from `apps/web/src/lib/vitals.ts` (item 83): LCP and INP in ms, CLS unitless. */
export function webVitalBudgets(): { LCP: number; CLS: number; INP: number } {
  const body = /WEB_VITAL_BUDGETS\s*=\s*\{([^}]*)\}/.exec(webSource('lib/vitals.ts'))![1];
  const budgets = Object.fromEntries([...body.matchAll(/(\w+):\s*([\d.]+)/g)].map((m) => [m[1], Number(m[2])]));
  for (const name of ['LCP', 'CLS', 'INP']) if (!(budgets[name] > 0)) throw new Error(`WEB_VITAL_BUDGETS has no ${name}`);
  return budgets as { LCP: number; CLS: number; INP: number };
}
