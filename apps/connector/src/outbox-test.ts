/** The Connector's outbox: half-written lines left out, the newest kept when it is full, a sent batch taken off. Run: npm test */
import assert from 'node:assert/strict';
import { mkdtempSync, appendFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterSent, capOutbox, Outbox, parseOutbox, type Reading } from './outbox';

const r = (id: string): Reading => ({ id, connectionId: 'c1', at: '2026-10-29T10:00:00Z', payload: { n: id } });

assert.deepEqual(parseOutbox(`${JSON.stringify(r('a'))}\n\n{"id":"b","conn\n${JSON.stringify(r('c'))}\n`).map((x) => x.id), ['a', 'c']);
assert.deepEqual(capOutbox([r('a'), r('b'), r('c')], 2), { kept: [r('b'), r('c')], dropped: 1 });
assert.deepEqual(capOutbox([r('a')], 2).dropped, 0);
assert.deepEqual(afterSent([r('a'), r('b'), r('c')], [r('a'), r('c')]).map((x) => x.id), ['b']);

const file = join(mkdtempSync(join(tmpdir(), 'outbox-')), 'outbox.jsonl');
const box = new Outbox(file);
assert.equal(box.size(), 0);
box.add([r('1'), r('2')]);
appendFileSync(file, '{"id":"half');
box.add([r('3')]);
assert.deepEqual(box.all().map((x) => x.id), ['1', '2', '3']);
box.remove([r('1'), r('3')]);
assert.deepEqual(box.all().map((x) => x.id), ['2']);
console.log('Connector outbox: all tests pass');
