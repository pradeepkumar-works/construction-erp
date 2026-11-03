// Opens every sidebar page for each role, records what the page asked the API and what failed, then (for the
// clicking roles) presses each safe button on the page and records whether anything happened.
// Usage: node e2e/scripts/function-probe.mjs <out.jsonl> [role,role,...] [--click]
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const WEB = process.env.E2E_WEB_URL ?? 'http://localhost:3000';
const PASSWORD = 'password123';
const out = process.argv[2] ?? 'probe.jsonl';
const roles = (process.argv[3] ?? 'admin').split(',');
const click = process.argv.includes('--click');
const routesFile = process.env.PROBE_ROUTES;
const only = process.env.PROBE_ONLY ? new RegExp(process.env.PROBE_ONLY) : null;

// Buttons that open a form or a view: pressed. Buttons that change or send something: recorded, never pressed.
const SAFE = /^(new|add|record|request|report|raise|create|apply for|open|view|show|print|export|download|filter|more|columns|edit|compare|preview|details|history|see|draft|plan|check|find|search|refresh|expand|collapse|all|week|month|day|today|previous|next|back|help|how)\b/i;
const RISKY = /approve|reject|delete|remove|discard|pay|submit|send|post|issue|lock|close|cancel|sign out|log ?out|revoke|archive|withdraw|certify|run|mark|accept|decline|dismiss|reset|regenerate|unpin|pin|move|save|confirm|apply|import|upload|sync|disconnect|switch|stop|end|finali[sz]e|countersign|forward|return|retire|deactivate|suspend|resend|copy link/i;

const write = (row) => fs.appendFileSync(out, JSON.stringify(row) + '\n');

async function settle(page) {
  await page.waitForLoadState('domcontentloaded');
  try {
    await page.waitForFunction(() => {
      const busy = document.querySelector('[aria-busy="true"], .ant-skeleton, .ant-spin-spinning');
      return !busy && document.querySelector('h1');
    }, null, { timeout: 15000 });
  } catch { /* recorded as no h1 / still loading */ }
  await page.waitForTimeout(300);
}

async function pageFacts(page) {
  return page.evaluate(() => {
    const main = document.querySelector('main') ?? document.body;
    const text = (main.innerText || '').replace(/\s+/g, ' ');
    const h1 = document.querySelector('h1')?.textContent?.trim() ?? null;
    const empties = [...main.querySelectorAll('.ant-empty, [data-empty]')].map((e) => (e.textContent || '').trim().slice(0, 80));
    const rows = main.querySelectorAll('.ant-table-tbody tr.ant-table-row').length;
    const errorResult = [...main.querySelectorAll('.ant-result')].map((e) => (e.textContent || '').trim().slice(0, 120));
    const alerts = [...main.querySelectorAll('.ant-alert')].map((e) => (e.textContent || '').trim().slice(0, 120));
    const disabled = [...main.querySelectorAll('button[disabled]')].map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim()).filter(Boolean).slice(0, 20);
    return { h1, textLen: text.length, rows, empties, errorResult, alerts, disabled, snippet: text.slice(0, 300) };
  });
}

async function buttonsOf(page) {
  return page.evaluate(() => {
    const main = document.querySelector('main') ?? document.body;
    const seen = new Set();
    const list = [];
    for (const b of main.querySelectorAll('button, [role="button"], a.ant-btn')) {
      const r = b.getBoundingClientRect();
      if (!r.width || !r.height || b.hasAttribute('disabled') || b.getAttribute('aria-disabled') === 'true') continue;
      if (b.closest('.ant-table-tbody, .ant-pagination, .ant-tabs-nav, .ant-select, .ant-picker, .ant-modal, .ant-drawer')) continue;
      const name = (b.getAttribute('aria-label') || b.textContent || '').replace(/\s+/g, ' ').trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      b.setAttribute('data-probe', name);
      list.push(name);
    }
    return list.slice(0, 15);
  });
}

async function probeButton(page, route, name) {
  await buttonsOf(page);
  const loc = page.locator(`main [data-probe="${name.replace(/["\\]/g, '\\$&')}"]`).first();
  if (!(await loc.count())) return { name, outcome: 'not-found' };
  const before = page.url();
  let requests = 0;
  const onReq = (r) => { if (r.url().includes('/api/')) requests++; };
  page.on('request', onReq);
  await page.evaluate(() => {
    window.__muts = 0;
    window.__mo?.disconnect();
    window.__mo = new MutationObserver((m) => { window.__muts += m.length; });
    window.__mo.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
  });
  let error = null;
  try { await loc.click({ timeout: 3000 }); } catch (e) { error = String(e.message).split('\n')[0]; }
  await page.waitForTimeout(600);
  page.off('request', onReq);
  const after = await page.evaluate(() => ({
    muts: window.__muts,
    overlay: !!document.querySelector('.ant-modal-wrap:not([style*="display: none"]) .ant-modal, .ant-drawer-open, .ant-dropdown:not(.ant-dropdown-hidden), .ant-popover:not(.ant-popover-hidden), .ant-message-notice, .ant-notification-notice'),
    title: document.querySelector('.ant-modal-title, .ant-drawer-title, .ant-message-notice')?.textContent?.trim()?.slice(0, 80) ?? null,
  }));
  const navigated = page.url() !== before;
  const outcome = error ? 'click-failed' : navigated ? 'navigated' : after.overlay ? 'opened' : requests ? 'requested' : after.muts > 3 ? 'changed' : 'NOTHING';
  const row = { name, outcome, to: navigated ? page.url().replace(WEB, '') : undefined, title: after.title, requests, muts: after.muts, error };
  if (navigated || after.overlay) {
    await page.goto(WEB + route);
    await settle(page);
  }
  return row;
}

const browser = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
for (const role of roles) {
  const email = role.includes('@') ? role : `${role}@demo.com`;
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  ctx.on('page', (p) => { if (p !== page) { console.error('popup', p.url()); p.close().catch(() => {}); } });
  page.on('dialog', (d) => (d.type() === 'beforeunload' ? d.accept() : d.dismiss()).catch(() => {}));
  await page.goto(WEB + '/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 });
  await settle(page);
  const nav = page.getByRole('navigation', { name: 'Main' });
  let hrefs = [];
  if (await nav.count()) hrefs = await nav.locator('a[href]').evaluateAll((ls) => ls.map((a) => a.getAttribute('href')));
  const moduleHrefs = await page.locator('a[href^="/modules/"]').evaluateAll((ls) => ls.map((a) => a.getAttribute('href')));
  const routes = [...new Set([...hrefs, ...moduleHrefs])].filter((h) => h && h.startsWith('/') && (!only || only.test(h)));
  // Module screens list their pages: follow them too, so a top-bar menu's pages are walked.
  const extra = [];
  for (const m of routes.filter((r) => r.startsWith('/modules/'))) {
    await page.goto(WEB + m);
    await settle(page);
    extra.push(...(await page.locator('main a[href^="/"]').evaluateAll((ls) => ls.map((a) => a.getAttribute('href')))));
  }
  const listed = routesFile ? JSON.parse(fs.readFileSync(routesFile, 'utf8')).filter((h) => !only || only.test(h)) : [];
  let all = [...new Set([...listed, ...routes, ...extra.filter((h) => !h.match(/\/[0-9a-f-]{20,}/) && (!only || only.test(h)))])];
  const [shard, shards] = (process.env.PROBE_SHARD ?? '0/1').split('/').map(Number);
  all = all.filter((_, i) => i % shards === shard);
  write({ type: 'role', role: email, routes: all.length });
  for (const route of all) {
    const failed = [];
    const consoleErrors = [];
    const onRes = (r) => { if (r.url().includes('/api/') && r.status() >= 400) failed.push(`${r.status()} ${r.request().method()} ${r.url().replace(/^.*\/api/, '')}`); };
    const onCon = (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); };
    const onErr = (e) => consoleErrors.push('pageerror: ' + String(e.message).slice(0, 200));
    page.on('response', onRes); page.on('console', onCon); page.on('pageerror', onErr);
    const t0 = Date.now();
    try { await page.goto(WEB + route, { timeout: 30000 }); } catch (e) { consoleErrors.push('goto: ' + e.message.split('\n')[0]); }
    await settle(page);
    const facts = await pageFacts(page).catch((e) => ({ error: String(e) }));
    const landed = page.url().replace(WEB, '');
    let buttons;
    if (click) {
      buttons = [];
      for (const name of await buttonsOf(page)) {
        if (!SAFE.test(name) && RISKY.test(name)) { buttons.push({ name, outcome: 'skipped' }); continue; }
        const timeout = new Promise((resolve) => setTimeout(() => resolve({ name, outcome: 'probe-timeout' }), 20000));
        const row = await Promise.race([probeButton(page, route, name).catch((e) => ({ name, outcome: 'probe-error', error: String(e).slice(0, 120) })), timeout]);
        buttons.push(row);
        if (row.outcome === 'probe-timeout') { await page.goto(WEB + route).catch(() => {}); await settle(page); }
      }
    }
    page.off('response', onRes); page.off('console', onCon); page.off('pageerror', onErr);
    write({ type: 'page', role: email, route, landed: landed !== route ? landed : undefined, ms: Date.now() - t0, failed, consoleErrors: consoleErrors.slice(0, 5), ...facts, buttons });
  }
  await ctx.close();
}
await browser.close();
