/**
 * File link tests: a stored file opens only through a link signed for that file, which lasts one to two hours and
 * is the same URL within an hour; a bare id, another file's link, an altered expiry or another key's link does not.
 *
 *   node dist/scripts/file-links-test.js
 */
import assert from 'node:assert/strict';
import { FILE_LINK_WINDOW_S, fileIdOfLink, fileLinkExpiry, fileLinkProblem, fileLinkQuery } from '../common/file-links';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

const KEY = 'a-long-random-string';
const ID = '3f0c1d2e-4b5a-4c6d-8e7f-90a1b2c3d4e5';
const OTHER = '7a6b5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d';
const T = Date.UTC(2026, 10, 9, 12, 20) / 1000;
const parts = (q: string) => Object.fromEntries(new URLSearchParams(q)) as { e: string; s: string };

test('a link opens its own file', () => {
  const { e, s } = parts(fileLinkQuery(ID, T, KEY));
  assert.equal(fileLinkProblem(ID, e, s, T, KEY), null);
});

test('a link lasts at least one hour and less than two', () => {
  const { e } = parts(fileLinkQuery(ID, T, KEY));
  const left = Number(e) - T;
  assert.ok(left > FILE_LINK_WINDOW_S && left <= 2 * FILE_LINK_WINDOW_S, `${left}s left`);
  for (const at of [T, T + 30 * 60, T + 99 * 60]) {
    const q = parts(fileLinkQuery(ID, at, KEY));
    assert.ok(Number(q.e) - at >= FILE_LINK_WINDOW_S);
  }
});

test('links made within one hour are the same URL, so the browser keeps the file cached', () => {
  const start = Math.floor(T / FILE_LINK_WINDOW_S) * FILE_LINK_WINDOW_S;
  assert.equal(fileLinkQuery(ID, start, KEY), fileLinkQuery(ID, start + FILE_LINK_WINDOW_S - 1, KEY));
  assert.notEqual(fileLinkQuery(ID, start, KEY), fileLinkQuery(ID, start + FILE_LINK_WINDOW_S, KEY));
});

test('a link stops working at its expiry', () => {
  const { e, s } = parts(fileLinkQuery(ID, T, KEY));
  assert.equal(fileLinkProblem(ID, e, s, Number(e) - 1, KEY), null);
  assert.equal(fileLinkProblem(ID, e, s, Number(e), KEY), 'expired');
  assert.equal(fileLinkExpiry(T), Number(e));
});

test('a bare id opens nothing', () => {
  assert.equal(fileLinkProblem(ID, undefined, undefined, T, KEY), 'missing');
  assert.equal(fileLinkProblem(ID, '', '', T, KEY), 'missing');
  assert.equal(fileLinkProblem(ID, ['1'], 'x', T, KEY), 'missing');
});

test("one file's link does not open another", () => {
  const { e, s } = parts(fileLinkQuery(ID, T, KEY));
  assert.equal(fileLinkProblem(OTHER, e, s, T, KEY), 'invalid');
});

test('a longer expiry written into the link is refused', () => {
  const { e, s } = parts(fileLinkQuery(ID, T, KEY));
  assert.equal(fileLinkProblem(ID, String(Number(e) + 86_400), s, T, KEY), 'invalid');
  assert.equal(fileLinkProblem(ID, `${e}.0`, s, T, KEY), 'invalid');
});

test('a link signed with another key is refused', () => {
  const { e, s } = parts(fileLinkQuery(ID, T, 'dev-secret'));
  assert.equal(fileLinkProblem(ID, e, s, T, KEY), 'invalid');
  assert.equal(fileLinkProblem(ID, e, s.slice(0, -1), T, KEY), 'invalid');
});

test('the file is read back from links kept in saved copies, signed or not', () => {
  assert.equal(fileIdOfLink(`/api/uploads/${ID}/content`), ID);
  assert.equal(fileIdOfLink(`/api/uploads/${ID}/content?e=1&s=x`), ID);
  assert.equal(fileIdOfLink(`https://api.example.com/api/uploads/${ID}/content`), ID);
  assert.equal(fileIdOfLink('https://x.public.blob.vercel-storage.com/org/2026-11-09/a.png'), null);
  assert.equal(fileIdOfLink('/uploads/org/2026-11-09/a.png'), null);
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
