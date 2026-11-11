/**
 * Where and when site photos were taken (ARCHITECTURE "Site photos", Place and time): the phone stamps the time and its
 * fix into the photo's name, the upload reads them back, and the timeline places each photo against the site's pin and
 * groups them by day. No database.
 *
 *   node dist/scripts/photo-place-test.js
 */
import assert from 'node:assert/strict';
import { distanceM, fixProblem, photoDays, photoPlace, photoPlaceWords, placeCounts, readPhotoName, withPlace } from '@erp/shared';
import { photoPlaceOf } from '../uploads/uploads.controller';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

// Puri sewerage site pin, and points around it.
const site = { lat: 19.8135, lng: 85.8312 };

test('a stamped name carries the time and the fix, and reads back', () => {
  const name = withPlace('site-20261018-143205-1.jpg', { lat: 19.81352, lng: 85.831234567, accuracyM: 12.4 });
  assert.equal(name, 'site-20261018-143205-1@19.81352,85.831235~12.jpg');
  assert.deepEqual(readPhotoName(name), { takenAt: '2026-10-18 14:32:05', fix: { lat: 19.81352, lng: 85.831235, accuracyM: 12 } });
});

test('a name with a time and no fix, or neither, reads as far as it goes', () => {
  assert.deepEqual(readPhotoName('site-20261018-143205-3.jpg'), { takenAt: '2026-10-18 14:32:05', fix: null });
  assert.deepEqual(readPhotoName('IMG_2041.jpg'), { takenAt: null, fix: null });
  assert.deepEqual(readPhotoName(null), { takenAt: null, fix: null });
  assert.equal(readPhotoName('site-20261318-143205-1.jpg').takenAt, null, 'month 13 is no time');
});

test('a southern or western fix, and one with no accuracy, keep their signs', () => {
  const name = withPlace('site-20261018-090000-1.jpg', { lat: -4.1745, lng: -73.5091, accuracyM: null });
  assert.equal(name, 'site-20261018-090000-1@-4.1745,-73.5091.jpg');
  assert.deepEqual(readPhotoName(name).fix, { lat: -4.1745, lng: -73.5091, accuracyM: null });
});

test('no fix, a 0,0 fix or one off the earth leaves the name alone', () => {
  assert.equal(withPlace('site-20261018-090000-1.jpg', null), 'site-20261018-090000-1.jpg');
  assert.equal(withPlace('site-20261018-090000-1.jpg', { lat: 0, lng: 0, accuracyM: 5 }), 'site-20261018-090000-1.jpg');
  assert.equal(fixProblem(91, 10), 'off the earth');
  assert.equal(fixProblem(Number.NaN, 10), 'not a number');
  assert.equal(readPhotoName('site-20261018-090000-1@0,0~5.jpg').fix, null, 'a phone with no fix sends 0,0');
});

test('distance is in metres along the earth', () => {
  assert.equal(distanceM(site, site), 0);
  const d = distanceM(site, { lat: 19.8225, lng: 85.8312 }); // 0.009° of latitude
  assert.ok(d > 990 && d < 1010, `about a kilometre, got ${d}`);
});

test('a photo is at the site within 500 m plus its own accuracy, else away', () => {
  const near = { lat: 19.8170, lng: 85.8312, accuracyM: 10 }; // about 390 m north
  assert.equal(photoPlace(near, site).kind, 'AT_SITE');
  const edge = { lat: 19.8190, lng: 85.8312, accuracyM: null }; // about 610 m
  assert.equal(photoPlace(edge, site).kind, 'AWAY');
  assert.equal(photoPlace({ ...edge, accuracyM: 150 }, site).kind, 'AT_SITE', 'a rough indoor fix is given its own margin');
  const far = photoPlace({ lat: 19.8260, lng: 85.8312, accuracyM: 8 }, site);
  assert.equal(far.kind, 'AWAY');
  assert.equal(photoPlaceWords(far), '1.4 km from the site');
  assert.equal(photoPlaceWords(photoPlace(edge, site)), `${distanceM(edge, site)} m from the site`);
});

test('no fix, or a site with no pin, says so instead of guessing', () => {
  assert.deepEqual(photoPlace(null, site), { kind: 'NO_FIX', distanceM: null });
  assert.deepEqual(photoPlace({ lat: 19.8, lng: 85.8, accuracyM: 5 }, null), { kind: 'NO_SITE', distanceM: null });
  assert.equal(photoPlaceWords({ kind: 'NO_FIX', distanceM: null }), 'No location');
  assert.equal(photoPlaceWords({ kind: 'NO_SITE', distanceM: null }), 'Site not pinned');
  assert.deepEqual(placeCounts([{ kind: 'AT_SITE', distanceM: 3 }, { kind: 'AWAY', distanceM: 900 }, { kind: 'NO_FIX', distanceM: null }, { kind: 'NO_SITE', distanceM: null }]), { AT_SITE: 1, AWAY: 1, NO_FIX: 2 });
});

test('the upload reads the phone clock in India into an instant, and the fix into columns', () => {
  const p = photoPlaceOf('site-20261018-143205-1@19.81352,85.831235~12.jpg');
  assert.equal(p.takenAt?.toISOString(), '2026-10-18T09:02:05.000Z');
  assert.deepEqual({ lat: p.lat, lng: p.lng, accuracyM: p.accuracyM }, { lat: 19.81352, lng: 85.831235, accuracyM: 12 });
  assert.deepEqual(photoPlaceOf('receipt.jpg'), { takenAt: null, lat: null, lng: null, accuracyM: null });
});

test('the timeline runs newest day first, each day by time, untimed photos last', () => {
  const days = photoDays([
    { id: 'a', day: '2026-10-17', time: '16:10' },
    { id: 'b', day: '2026-10-18', time: null },
    { id: 'c', day: '2026-10-18', time: '09:05' },
    { id: 'd', day: '2026-10-18', time: '14:32' },
  ]);
  assert.deepEqual(days.map((d) => [d.day, d.photos.map((p) => p.id)]), [['2026-10-18', ['c', 'd', 'b']], ['2026-10-17', ['a']]]);
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
