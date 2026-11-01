'use client';

import { useEffect } from 'react';

/**
 * Two keyboard fixes for markup antd draws itself, applied once for the whole app (`<A11yPatches />` in `Providers`), so no page or table needs to do anything:
 *
 * 1. A box that scrolls can be scrolled with the arrow keys only once something in it takes focus (WCAG 2.1.1, axe
 *    `scrollable-region-focusable`). A table wider than its column (`.ant-table-content` / `.ant-table-body` under
 *    `scroll`) or a box marked `data-scroll-region`, with nothing focusable inside (a read-only table, a chart strip),
 *    becomes a Tab stop itself: `tabIndex=0`, `role="region"` and a name from its own `aria-label`, its section's
 *    heading, or "Table". It is undone when the box stops scrolling, so a table that fits adds no Tab stop.
 * 2. A table with a fixed header or sideways scroll draws a hidden, zero-height copy of its header row to measure the
 *    columns (`.ant-table-measure-row`, `aria-hidden`), select-all checkbox included. That copy is taken out of the Tab
 *    order (`tabIndex=-1`), so keyboard focus never lands on something a screen reader is told is not there (axe
 *    `aria-hidden-focus`).
 */
const SCROLLERS = '.ant-table-content, .ant-table-body, [data-scroll-region]';
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const MARK = 'data-scroll-focus';

function regionName(el: HTMLElement): string {
  const box = el.closest('section, .ant-card, [role="tabpanel"], [role="dialog"]');
  const heading = box?.querySelector('h1, h2, h3, h4, .ant-card-head-title, [role="heading"]')?.textContent?.trim();
  return heading ? `${heading} table` : 'Table';
}

function updateScroller(el: HTMLElement) {
  const scrolls = el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
  const marked = el.hasAttribute(MARK);
  // Focusable content other than the box itself (once marked, the box matches `[tabindex]` too); the measure row's
  // copies do not count, as they are taken out of the Tab order below.
  const hasFocusable = [...el.querySelectorAll(FOCUSABLE)].some((c) => c !== el && !c.closest('.ant-table-measure-row'));
  if (scrolls && !hasFocusable) {
    if (marked || el.hasAttribute('tabindex')) return; // done already, or the page made it focusable itself
    // Remember what was ours to undo: "role" and/or "name".
    const added = [!el.getAttribute('role') && 'role', !el.getAttribute('aria-label') && 'name'].filter(Boolean).join(' ');
    el.setAttribute(MARK, added);
    el.tabIndex = 0;
    if (added.includes('role')) el.setAttribute('role', 'region');
    if (added.includes('name')) el.setAttribute('aria-label', regionName(el));
  } else if (marked) {
    const added = el.getAttribute(MARK) ?? '';
    el.removeAttribute('tabindex');
    if (added.includes('role')) el.removeAttribute('role');
    if (added.includes('name')) el.removeAttribute('aria-label');
    el.removeAttribute(MARK);
  }
}

function scan() {
  document.querySelectorAll<HTMLElement>('.ant-table-measure-row').forEach((row) => {
    row.querySelectorAll<HTMLElement>(FOCUSABLE).forEach((el) => {
      el.tabIndex = -1;
    });
  });
  document.querySelectorAll<HTMLElement>(SCROLLERS).forEach(updateScroller);
}

export function useA11yPatches() {
  useEffect(() => {
    let frame = 0;
    const run = () => {
      frame = 0;
      scan();
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(run);
    };
    // Only content changes are watched, so the attributes set here do not wake it again.
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
}

export function A11yPatches() {
  useA11yPatches();
  return null;
}
