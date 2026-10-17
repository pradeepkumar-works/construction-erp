import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

/**
 * Targets and type (UX item 82), in comfortable and compact density:
 * - every control is at least 24 by 24 px, or so spaced that a 24 px circle on its centre touches no other control
 *   (WCAG 2.5.8 and its spacing exception). A link in running text (a paragraph, a list item's sentence) is exempt, and so
 *   is a link in a table cell when the row itself opens the record;
 * - no text on the page is set below 12 px.
 * A control is measured where it takes the click: a checkbox by its label, a select or date field by its box, a tab by
 * the tab around its text.
 */
test.use({ contextOptions: { reducedMotion: 'reduce' } });

const PAGES = ['/', '/dpr', '/bills', '/projects'];

interface Finding {
  what: string;
  size: string;
}

/** Runs in the page: the undersized controls and the text under 12 px. */
function measure(): { targets: Finding[]; text: Finding[] } {
  const SELECTOR = 'button, a, input, [role=button], [role=tab], [role=checkbox], .ant-select-selector, .ant-segmented-item';
  // The element that takes the click for each kind of control: antd 6 draws a select without `.ant-select-selector`, so
  // its search input is measured by the select's box, and a pagination link by its list item.
  const HIT_AREA = '.ant-checkbox-wrapper, .ant-radio-wrapper, .ant-select, .ant-picker, .ant-input-affix-wrapper, .ant-input-number, .ant-tabs-tab, .ant-pagination-item';
  const hitArea = (el: Element) => (el.matches('input, [role=tab], .ant-pagination-item > a') ? el.closest(HIT_AREA) : null) ?? el;
  // antd internals that are not targets: the table's zero-height measure row and the tab bar's hidden overflow button.
  const IGNORE = '.ant-table-measure-row, .ant-tabs-nav-operations-hidden, [aria-hidden="true"]';

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

  const small = (r: DOMRect) => r.width < 23.5 || r.height < 23.5;
  const centre = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  const distanceToRect = (p: { x: number; y: number }, r: DOMRect) => Math.hypot(Math.max(r.left - p.x, 0, p.x - r.right), Math.max(r.top - p.y, 0, p.y - r.bottom));
  const targets: Finding[] = [];
  for (const b of boxes) {
    if (b.inline || !small(b.rect)) continue;
    const c = centre(b.rect);
    const crowded = boxes.some((o) => {
      if (o === b || o.el.contains(b.el) || b.el.contains(o.el)) return false;
      if (distanceToRect(c, o.rect) < 12) return true;
      if (!small(o.rect) || o.inline) return false;
      const oc = centre(o.rect);
      return Math.hypot(c.x - oc.x, c.y - oc.y) < 24;
    });
    if (crowded) targets.push({ what: b.what, size: `${Math.round(b.rect.width)}x${Math.round(b.rect.height)}` });
  }

  const text: Finding[] = [];
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

async function settle(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(page.locator('.ant-skeleton')).toHaveCount(0);
}

for (const density of ['comfortable', 'compact'] as const) {
  test(`controls are at least 24 px and text at least 12 px, ${density}`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.addInitScript((d) => window.localStorage.setItem('nirmaan.appearance', JSON.stringify({ mode: 'light', density: d })), density);
    await signIn(page, 'pm@demo.com');

    await settle(page, '/projects');
    const project = await page.locator('.ant-table-tbody a[href^="/projects/"]').first().getAttribute('href');
    expect(project).toBeTruthy();

    const found: string[] = [];
    for (const path of [...PAGES, project!]) {
      await settle(page, path);
      const { targets, text } = await page.evaluate(measure);
      found.push(...targets.map((t) => `${path} target ${t.what} ${t.size}`), ...text.map((t) => `${path} text ${t.what} ${t.size}`));
    }
    expect(found).toEqual([]);
  });
}
