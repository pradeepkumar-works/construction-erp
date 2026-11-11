/**
 * Sign-in guard tests: five wrong passwords lock an email for 15 minutes from the
 * fifth, old failures fall out of the window, an address trying many emails is held off, and reset links are limited.
 * A deployed API refuses to start without its own JWT secret.
 *
 *   node dist/scripts/login-guard-test.js
 */
import assert from 'node:assert/strict';
import { ADDRESS_FAILURES, blockMessage, LOCK_AFTER_FAILURES, loginBlock, resetAllowed, SSO_STARTS_PER_ADDRESS, ssoBlock } from '../auth/login-guard-rules';
import { jwtSecret, jwtSecretProblem } from '../common/jwt-secret';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

const now = new Date('2026-10-26T10:00:00Z');
const ago = (min: number) => new Date(now.getTime() - min * 60_000);
const times = (n: number, startMin: number, stepMin = 0.5) => Array.from({ length: n }, (_, i) => ago(startMin - i * stepMin));

test('four wrong passwords still let the fifth try in', () => {
  assert.equal(loginBlock({ emailFailures: times(LOCK_AFTER_FAILURES - 1, 3), addressFailures: [], now }), null);
});

test('the fifth wrong password locks the email for 15 minutes from it', () => {
  const failures = [ago(10), ago(8), ago(6), ago(4), ago(2)];
  const b = loginBlock({ emailFailures: failures, addressFailures: [], now });
  assert.deepEqual(b, { reason: 'ACCOUNT', until: new Date(ago(2).getTime() + 15 * 60_000) });
});

test('the lock ends 15 minutes after the fifth failure', () => {
  const failures = [ago(14.9), ago(14.8), ago(14.7), ago(14.6), ago(14.5)];
  assert.equal(loginBlock({ emailFailures: failures, addressFailures: [], now: new Date(ago(14.5).getTime() + 15 * 60_000 + 1) }), null);
});

test('failures older than the window do not count', () => {
  assert.equal(loginBlock({ emailFailures: [ago(40), ago(30), ago(20), ago(16), ago(1)], addressFailures: [], now }), null);
});

test('an address trying many emails is held off until its failures fall below the limit', () => {
  const failures = times(ADDRESS_FAILURES, 14, 0.4);
  const b = loginBlock({ emailFailures: [], addressFailures: failures, now });
  assert.equal(b?.reason, 'ADDRESS');
  assert.deepEqual(b?.until, new Date(ago(14).getTime() + 15 * 60_000));
  assert.equal(loginBlock({ emailFailures: [], addressFailures: failures.slice(1), now }), null);
});

test('reset links: five an hour per email, twenty per address', () => {
  assert.ok(resetAllowed({ emailRequests: times(4, 50, 10), addressRequests: [], now }));
  assert.ok(!resetAllowed({ emailRequests: times(5, 50, 10), addressRequests: [], now }));
  assert.ok(resetAllowed({ emailRequests: [ago(70), ago(65), ago(61), ago(62), ago(63)], addressRequests: [], now }));
  assert.ok(!resetAllowed({ emailRequests: [], addressRequests: times(20, 59, 2), now }));
});

test('the refusal says when to try again and how to get back in', () => {
  const at = () => '3:45 pm';
  assert.match(blockMessage({ reason: 'ACCOUNT', until: now }, at), /Try again after 3:45 pm, or reset your password/);
  assert.match(blockMessage({ reason: 'ADDRESS', until: now }, at), /from this network\. Try again after 3:45 pm/);
});

test('single sign-on: an address is held off by its probing failures or by too many starts, never by a password', () => {
  assert.equal(ssoBlock({ addressFailures: times(ADDRESS_FAILURES - 1, 10, 0.2), addressStarts: times(SSO_STARTS_PER_ADDRESS - 1, 10, 0.1), now }), null);
  assert.equal(ssoBlock({ addressFailures: times(ADDRESS_FAILURES, 10, 0.2), addressStarts: [], now })?.reason, 'ADDRESS');
  const starts = times(SSO_STARTS_PER_ADDRESS, 12, 0.1);
  const b = ssoBlock({ addressFailures: [], addressStarts: starts, now });
  assert.equal(b?.reason, 'ADDRESS');
  assert.equal(b?.until.getTime(), ago(12).getTime() + 15 * 60_000, 'until the oldest start in the window ages out');
  assert.equal(ssoBlock({ addressFailures: [], addressStarts: times(SSO_STARTS_PER_ADDRESS, 30, 0.1), now }), null, 'old starts do not count');
  // An office whose people's single sign-ons were refused by the provider counts nothing toward a password:
  // the password check reads only failed passwords (LOGIN_FAILED), as loginBlock is given them.
  assert.equal(loginBlock({ emailFailures: [], addressFailures: [], now }), null);
});

test('a deployed API will not sign tokens with the secret in the repository', () => {
  for (const env of [{ NODE_ENV: 'production' }, { VERCEL: '1' }, { VERCEL: '1', JWT_SECRET: 'dev-secret' }, { NODE_ENV: 'production', JWT_SECRET: '  ' }]) {
    assert.match(jwtSecretProblem(env) ?? '', /JWT_SECRET is not set/);
    assert.throws(() => jwtSecret(env), /JWT_SECRET is not set/);
  }
});

test('a deployed API with its own secret signs with it; a local run keeps the fallback', () => {
  assert.equal(jwtSecret({ VERCEL: '1', JWT_SECRET: 'a-long-random-string' }), 'a-long-random-string');
  assert.equal(jwtSecretProblem({ NODE_ENV: 'production', JWT_SECRET: 'a-long-random-string' }), null);
  assert.equal(jwtSecret({}), 'dev-secret');
  assert.equal(jwtSecret({ JWT_SECRET: 'e2e-secret' }), 'e2e-secret');
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${name}\n     ${(e as Error).message}`);
  }
}
console.log(`\n${tests.length - failed} of ${tests.length} passed`);
if (failed) process.exit(1);
