/** A weighbridge indicator's frames read, and a truck weighed once when its weight holds. Run: npm test */
import assert from 'node:assert/strict';
import { readFrame, splitFrames, WeightWatch, type Frame } from './weight';

// Lines end in CR, LF or ETX; a frame between STX and ETX loses its STX; an unfinished line waits.
assert.deepEqual(splitFrames('ST,GS,+0026420kg\r\n  26430\r\x02 26440\x03W: 264'), { frames: ['ST,GS,+0026420kg', '26430', '26440'], rest: 'W: 264' });
assert.equal(splitFrames('x'.repeat(600)).rest.length, 128);

// The formats indicators send.
assert.deepEqual(readFrame('ST,GS,+0026420kg'), { kg: 26420, stable: true });
assert.deepEqual(readFrame('US,GS,+0026380kg'), { kg: 26380, stable: false });
assert.deepEqual(readFrame('  26420'), { kg: 26420, stable: null });
assert.deepEqual(readFrame('W: 26.42 t'), { kg: 26420, stable: null });
assert.deepEqual(readFrame('ST,NT,-0000020kg'), { kg: -20, stable: true });
assert.equal(readFrame('ST,GS,OL'), null);
assert.equal(readFrame('-------'), null);

// A truck drives on, settles and is weighed once; it stays, drives off, the next one comes.
const watch = new WeightWatch(200, 3);
const t0 = Date.parse('2026-10-29T08:00:00Z');
const feed = (s: number, f: Frame) => watch.feed(new Date(t0 + s * 1000), f);
const st = (kg: number): Frame => ({ kg, stable: null });
assert.equal(feed(0, st(0)), null);
assert.equal(feed(1, st(9_200)), null); // front axle
assert.equal(feed(2, st(21_400)), null);
assert.equal(feed(3, st(26_410)), null); // settling
assert.equal(feed(4, st(26_420)), null);
assert.equal(feed(5, { kg: 26_420, stable: false }), null); // the indicator says it is moving: start again
assert.equal(feed(6, st(26_420)), null);
assert.equal(feed(8, st(26_425)), null);
assert.deepEqual(feed(9, st(26_420)), { at: new Date(t0 + 9000), weightKg: 26_420, stableSeconds: 3 });
assert.equal(feed(30, st(26_420)), null); // still on the bridge: no second weighing
assert.equal(feed(40, st(150)), null); // off
assert.equal(feed(41, st(8_280)), null);
assert.deepEqual(feed(45, st(8_280)), { at: new Date(t0 + 45000), weightKg: 8_280, stableSeconds: 4 });
console.log('Connector weighbridge frames: all tests pass');
