/**
 * Tests for the intelligence quick wins (the ideas page "Nirmaan intelligence map"): the pure rules behind each, so they need
 * no database. Each quick win adds its block here.
 *
 *   node dist/scripts/intelligence-test.js
 */
import assert from 'node:assert/strict';
import { insightKeysFor } from '@erp/shared';

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
