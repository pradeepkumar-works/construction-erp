/**
 * The integration layer's tests: secrets and pairing codes, keys sealed under INTEGRATION_KEY, a
 * connection's health and a Connector's state, a batch of readings and a generic message, with no database. CI runs
 * it after the build:
 *
 *   node dist/scripts/integrations-test.js
 */
import assert from 'node:assert/strict';
import { integrationKindFromSlug, integrationKindSlug, INTEGRATION_KINDS } from '@erp/shared';
import {
  agentState,
  bearer,
  connectionHealth,
  DETAIL_MAX_CHARS,
  hashSecret,
  logDetail,
  looksLikeToken,
  newSecret,
  normalisePairCode,
  openSecret,
  PAIR_ALPHABET,
  pairCode,
  readBatch,
  readGeneric,
  sealSecret,
  TOKEN_PREFIX,
} from '../integrations/integration-rules';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);
const now = new Date('2026-10-29T10:00:00Z');
const minAgo = (m: number) => new Date(now.getTime() - m * 60_000);

test('secrets are long, URL-safe and kept only as their sha256', () => {
  const s = newSecret();
  assert.match(s, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(newSecret(), s);
  assert.equal(hashSecret(s).length, 64);
  assert.equal(hashSecret(s), hashSecret(s));
  const t = newSecret(TOKEN_PREFIX);
  assert.ok(looksLikeToken(t));
  assert.ok(!looksLikeToken('nct_short'));
  assert.ok(!looksLikeToken(s));
  assert.equal(bearer(`Bearer ${t}`), t);
  assert.equal(bearer(`bearer  ${t}`), t);
  assert.equal(bearer('Basic abc'), null);
  assert.equal(bearer(undefined), null);
});

test('pairing codes: XXXX-XXXX from letters and digits that cannot be misread, typed any way', () => {
  const c = pairCode(Buffer.from([0, 1, 2, 30, 31, 62, 200, 255]));
  assert.match(c, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(c.slice(0, 4), 'ABC' + PAIR_ALPHABET[30]);
  for (const ch of 'O0I1L') assert.ok(!PAIR_ALPHABET.includes(ch));
  assert.equal(normalisePairCode(c.toLowerCase().replace('-', ' ')), c);
  assert.equal(normalisePairCode(c.replace('-', '')), c);
  assert.equal(normalisePairCode('ABCD-EFG0'), null, 'a zero is not in a code');
  assert.equal(normalisePairCode('ABC-DEF'), null);
});

test('keys sealed under INTEGRATION_KEY open with it and with nothing else', () => {
  const sealed = sealSecret('api-key-1234', 'server passphrase');
  assert.match(sealed, /^v1:[^:]+:[^:]+:[^:]+$/);
  assert.ok(!sealed.includes('api-key'));
  assert.equal(openSecret(sealed, 'server passphrase'), 'api-key-1234');
  assert.equal(openSecret(sealed, 'another passphrase'), null);
  const [v, iv, tag, data] = sealed.split(':');
  const flipped = data.slice(0, -1) + (data.endsWith('A') ? 'B' : 'A');
  assert.equal(openSecret([v, iv, tag, flipped].join(':'), 'server passphrase'), null, 'a changed secret does not open');
  assert.equal(openSecret('garbage', 'server passphrase'), null);
  assert.notEqual(sealSecret('same', 'k'), sealSecret('same', 'k'), 'a fresh iv each time');
});

test('health: off, waiting, failing, quiet, working', () => {
  const base = { isActive: true, lastEventAt: minAgo(5), lastSuccessAt: minAgo(5), lastErrorAt: null, quietAfterMin: 60 };
  assert.equal(connectionHealth(base, now), 'LIVE');
  assert.equal(connectionHealth({ ...base, isActive: false }, now), 'OFF');
  assert.equal(connectionHealth({ ...base, lastEventAt: null, lastSuccessAt: null }, now), 'NOT_SET_UP');
  assert.equal(connectionHealth({ ...base, lastErrorAt: minAgo(1), lastEventAt: minAgo(1) }, now), 'FAILING');
  assert.equal(connectionHealth({ ...base, lastErrorAt: minAgo(10) }, now), 'LIVE', 'a success after the failure');
  assert.equal(connectionHealth({ ...base, lastEventAt: minAgo(61), lastSuccessAt: minAgo(61) }, now), 'QUIET');
  assert.equal(connectionHealth({ ...base, lastEventAt: minAgo(2), lastSuccessAt: null, lastErrorAt: minAgo(2) }, now), 'FAILING');
});

test('a Connector: waiting to pair, code expired, online, offline after three missed minutes, removed', () => {
  const a = { revokedAt: null, pairedAt: null, pairCodeExpiresAt: new Date(now.getTime() + 60_000), lastSeenAt: null };
  assert.equal(agentState(a, now), 'WAITING_TO_PAIR');
  assert.equal(agentState({ ...a, pairCodeExpiresAt: minAgo(1) }, now), 'CODE_EXPIRED');
  const paired = { ...a, pairedAt: minAgo(100), pairCodeExpiresAt: null };
  assert.equal(agentState({ ...paired, lastSeenAt: minAgo(2) }, now), 'ONLINE');
  assert.equal(agentState({ ...paired, lastSeenAt: minAgo(4) }, now), 'OFFLINE');
  assert.equal(agentState({ ...paired, lastSeenAt: null }, now), 'OFFLINE');
  assert.equal(agentState({ ...paired, revokedAt: minAgo(1), lastSeenAt: minAgo(1) }, now), 'REVOKED');
});

test('a batch of readings: good ones taken, each bad one named with how to fix it', () => {
  const { readings, problems } = readBatch(
    [
      { id: 'r1', connectionId: 'c1', at: '2026-10-29T15:20:00+05:30', payload: { weight: 12.4 } },
      { id: '', connectionId: 'c1', at: now.toISOString(), payload: {} },
      { id: 'r3', at: now.toISOString(), payload: {} },
      { id: 'r4', connectionId: 'c1', at: 'yesterday', payload: {} },
      { id: 'r5', connectionId: 'c1', at: '2026-10-29T10:10:00Z', payload: {} },
      { id: 'r6', connectionId: 'c1', at: '2026-10-20T10:00:00Z', payload: {} },
      { id: 'r7', connectionId: 'c1', at: now.toISOString(), payload: [1, 2] },
      { id: ' r8 ', connectionId: 'c1', at: '2026-10-29T09:59:00Z', payload: { ok: true } },
    ],
    now,
  );
  assert.deepEqual(readings.map((r) => r.id), ['r1', 'r8']);
  assert.equal(readings[0].at.toISOString(), '2026-10-29T09:50:00.000Z');
  assert.equal(problems.length, 6);
  assert.match(problems[0], /^Reading 2: send an id/);
  assert.match(problems[1], /^Reading 3: say which connection/);
  assert.match(problems[2], /^Reading 4: send its time as an ISO date/);
  assert.match(problems[3], /ahead of the server/);
  assert.match(problems[4], /older than 7 days/);
  assert.match(problems[5], /must be a JSON object/);
});

test('a generic message: its id, the device it names and a line for the log', () => {
  const m = readGeneric({ id: 'evt-9', imei: 867530912345678, deviceName: 'Excavator tracker', ignition: true, engineHours: 4182.6 });
  assert.deepEqual(m, { externalId: 'evt-9', deviceId: '867530912345678', deviceLabel: 'Excavator tracker', summary: 'From Excavator tracker: 5 fields (id, imei, deviceName, ignition, engineHours)' });
  assert.equal(readGeneric({ id: 'a' }, 'from-header').externalId, 'from-header');
  assert.equal(readGeneric({ event_id: 'e1', device_id: 'D1' }).deviceId, 'D1');
  assert.equal(readGeneric([1, 2]).summary, 'An empty message');
  assert.equal(readGeneric({ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 }).summary, '6 fields (a, b, c, d, e…)');
  assert.equal(readGeneric({ deviceId: { nested: true } }).deviceId, null);
});

test('the log keeps a message as sent, cut when it is large', () => {
  assert.deepEqual(logDetail({ a: 1 }), { a: 1 });
  assert.equal(logDetail(undefined), null);
  const big = logDetail({ text: 'x'.repeat(10_000) }) as { cut: boolean; length: number; start: string };
  assert.equal(big.cut, true);
  assert.equal(big.start.length, DETAIL_MAX_CHARS);
});

test('every kind has a web address slug that reads back', () => {
  for (const k of INTEGRATION_KINDS) assert.equal(integrationKindFromSlug(integrationKindSlug(k)), k);
  assert.equal(integrationKindSlug('GENERIC_WEBHOOK'), 'generic-webhook');
  assert.equal(integrationKindFromSlug('tally'), null);
});

let failed = 0;
for (const [name, fn] of cases) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`✗ ${name}\n  ${(e as Error).message.split('\n').join('\n  ')}`);
  }
}
console.log(`\nIntegrations: ${cases.length - failed} of ${cases.length} tests pass`);
process.exit(failed ? 1 : 0);
