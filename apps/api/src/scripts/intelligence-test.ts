/**
 * Tests for the intelligence quick wins (the ideas page "Nirmaan intelligence map"): the pure rules behind each, so they need
 * no database. Each quick win adds its block here.
 *
 *   node dist/scripts/intelligence-test.js
 */
import assert from 'node:assert/strict';
import { insightKeysFor, watchListKinds } from '@erp/shared';
import { CUBE_7DAY_SHARE, cubeEarly, headsBehind, marginAt, marginFade, marginStep } from '../warnings/warning-rules';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

// ── Q0: the watch list's Other checks ──────────────────────────────────────────────────────────────────────────────
test('Q0: an admin gets every check, Ask Nirmaan included', () => {
  assert.deepEqual(insightKeysFor('ADMIN'), ['leakage', 'cashForecast', 'billingReadiness', 'attendanceCheck', 'ai']);
});
test('Q0: accounts see the cash forecast and never the Ask Nirmaan switch', () => {
  const keys = insightKeysFor('ACCOUNTS_MANAGER');
  assert.ok(keys.includes('cashForecast'));
  assert.ok(!keys.includes('ai'));
});
test('Q0: a site engineer gets no check whose page refuses them', () => {
  const keys = insightKeysFor('SITE_ENGINEER');
  assert.ok(!keys.includes('cashForecast'));
  assert.ok(!keys.includes('billingReadiness'));
  assert.ok(!keys.includes('ai'));
});

// ── Q1: margin fade ────────────────────────────────────────────────────────────────────────────────────────────────
// A job budgeted at 80 against a contract of 100: on budget the margin is 20%.
const BAC = 80;
const CV = 100;
const pt = (month: string, ev: number, ac: number) => ({ month, ev, ac });

test('Q1: on budget the forecast margin is the contract less the budget', () => {
  const m = marginAt(pt('2026-06', 40, 40), BAC, CV);
  assert.ok(m);
  assert.equal(m.eac, 80);
  assert.equal(m.marginPct, 20);
});
test('Q1: too little earned, or cost records far off, gives no forecast', () => {
  assert.equal(marginAt(pt('2026-06', 5, 5), BAC, CV), null, 'under a tenth earned');
  assert.equal(marginAt(pt('2026-06', 40, 10), BAC, CV), null, 'CPI 4: costs not yet booked');
  assert.equal(marginAt(pt('2026-06', 40, 100), BAC, CV), null, 'CPI 0.4: earned value not yet entered');
});
test('Q1: a margin falling over three months warns, with the drop in points and rupees', () => {
  const f = marginFade([pt('2026-06', 20, 20), pt('2026-07', 30, 31), pt('2026-08', 40, 42.5), pt('2026-09', 50, 54)], BAC, CV);
  assert.ok(f);
  assert.equal(f.from.month, '2026-06');
  assert.equal(f.to.month, '2026-09');
  assert.equal(f.from.marginPct, 20);
  assert.equal(f.to.marginPct, 13.6);
  assert.equal(f.dropPts, 6.4);
  assert.equal(f.dropInr, 6);
  assert.equal(marginStep(f.dropPts), 6);
});
test('Q1: a small dip, or one already recovering, does not warn', () => {
  assert.equal(marginFade([pt('2026-08', 40, 40), pt('2026-09', 50, 51)], BAC, CV), null, 'under two points');
  assert.equal(marginFade([pt('2026-07', 30, 30), pt('2026-08', 40, 46), pt('2026-09', 50, 54)], BAC, CV), null, 'August was lower than September');
});
test('Q1: months before the window do not count', () => {
  assert.equal(marginFade([pt('2026-01', 10, 8.5), pt('2026-09', 50, 50.5)], BAC, CV), null);
});
test('Q1: the heads behind it are those over their budget for the work earned', () => {
  const heads = headsBehind([{ head: 'MATERIAL', spent: 30, budget: 40 }, { head: 'LABOUR', spent: 20, budget: 20 }, { head: 'MACHINERY', spent: 6, budget: 10 }, { head: 'OTHER', spent: 3, budget: null }], 0.5);
  assert.deepEqual(heads.map((h) => [h.head, h.over]), [['MATERIAL', 10], ['LABOUR', 10]], 'worst two; Machinery is over by less, Other has no budget');
});
test('Q1: the margin warning goes to those who see cost and approve', () => {
  assert.ok(watchListKinds('MANAGEMENT').includes('MARGIN_FADE'));
  assert.ok(watchListKinds('PROJECT_MANAGER').includes('MARGIN_FADE'));
  assert.ok(!watchListKinds('STORE_MANAGER').includes('MARGIN_FADE'));
  assert.ok(!watchListKinds('SITE_ENGINEER').includes('MARGIN_FADE'));
});

// ── Q2: cubes weak at 7 days ───────────────────────────────────────────────────────────────────────────────────────
const cube = (at7: number | null, at28: number | null = null) => [{ label: '7 days', value: at7 }, { label: '28 days', value: at28 }];

test('Q2: a 7-day result pointing under the mark warns, with the projection and the shortfall', () => {
  const e = cubeEarly(cube(16.2), 25);
  assert.ok(e);
  assert.equal(CUBE_7DAY_SHARE, 0.67);
  assert.equal(e.projected, 24.2);
  assert.equal(e.shortBy, 0.8);
});
test('Q2: a 7-day result on course does not warn', () => {
  assert.equal(cubeEarly(cube(17.6), 25), null, '17.6 points to 26.3');
  assert.equal(cubeEarly(cube(22.4), 30), null, '22.4 points to 33.4');
});
test('Q2: nothing to say before the 7-day result or after the 28-day one', () => {
  assert.equal(cubeEarly(cube(null), 25), null);
  assert.equal(cubeEarly(cube(16.1, 23.8), 25), null, 'the test is judged by its 28-day result now');
  assert.equal(cubeEarly(cube(16.2), null), null, 'no mark to judge against');
});
test('Q2: the demo history bears the share out', () => {
  // 7-day and 28-day pairs from the demo sites: each 28-day result is within 2 N/mm² of the 7-day one ÷ 0.67.
  for (const [at7, at28] of [[18.9, 28.6], [18.8, 27.8], [19.6, 31.2], [20.1, 29.4], [16.1, 23.8]]) assert.ok(Math.abs(at7 / CUBE_7DAY_SHARE - at28) < 2, `${at7} → ${at28}`);
});
test('Q2: the cube warning goes to QA/QC and the approvers', () => {
  assert.ok(watchListKinds('QA_QC_ENGINEER').includes('CUBE_7DAY_LOW'));
  assert.ok(watchListKinds('PROJECT_MANAGER').includes('CUBE_7DAY_LOW'));
  assert.ok(!watchListKinds('ACCOUNTS_MANAGER').includes('CUBE_7DAY_LOW'));
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
  } catch (e) {
    failed++;
    console.error(`✗ ${name}\n  ${(e as Error).message}`);
  }
}
console.log(`Intelligence quick wins: ${tests.length - failed} of ${tests.length} tests pass`);
if (failed) process.exit(1);
