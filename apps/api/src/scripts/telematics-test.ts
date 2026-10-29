/**
 * Machine telematics' tests (item 146): a GPS tracker's message (flat and Traccar), a maker's fleet snapshot
 * (ISO 15143-3), a feed's settings, and a machine's day rolled up from its readings, with no database. CI runs it
 * after the build:
 *
 *   node dist/scripts/telematics-test.js
 */
import assert from 'node:assert/strict';
import { engineLogDraft, hoursAboveEngine, machineSiteRadius } from '@erp/shared';
import {
  dayBounds,
  dayOf,
  engineHoursOf,
  feedDue,
  feedHttpProblem,
  feedUrlProblem,
  foldReading,
  fuelUsedOf,
  idleHoursOf,
  litres,
  readFeedConfig,
  readFeedMachine,
  readFeedPage,
  readTracker,
  rollUpDay,
  type DayState,
  type ReadingFigures,
} from '../telematics/telematics-rules';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);

const NOW = new Date('2026-10-20T12:00:00Z');
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000);

/* ---------- a tracker's message ---------- */

test('a flat tracker message: imei, epoch seconds, ignition as 1, the hour meter', () => {
  const r = readTracker({ imei: '867530912345678', ts: Math.floor(ago(10).getTime() / 1000), lat: '12.971599', lon: 77.594566, acc: 1, engineHours: 4182.6, vehicleNo: 'EXC-01' }, NOW);
  assert.ok(r.reading);
  assert.equal(r.reading.deviceId, '867530912345678');
  assert.equal(r.reading.label, 'EXC-01');
  assert.equal(r.reading.at.toISOString(), ago(10).toISOString());
  assert.equal(r.reading.lat, 12.971599);
  assert.equal(r.reading.lng, 77.594566);
  assert.equal(r.reading.engineOn, true);
  assert.equal(r.reading.hourMeter, 4182.6);
});

test('field names in any case and with _ or -: device_id, Engine_Hours, IGNITION "OFF"', () => {
  const r = readTracker({ device_id: 'T-9', time: ago(5).toISOString(), Engine_Hours: '12.5', IGNITION: 'OFF' }, NOW);
  assert.equal(r.reading?.deviceId, 'T-9');
  assert.equal(r.reading?.hourMeter, 12.5);
  assert.equal(r.reading?.engineOn, false);
});

test('engine seconds become hours; a message with no time is as of when it came', () => {
  const r = readTracker({ deviceId: 'T-1', engineSeconds: 36_000, ignition: true }, NOW);
  assert.equal(r.reading?.hourMeter, 10);
  assert.equal(r.reading?.at.toISOString(), NOW.toISOString());
});

test("Traccar's event forwarding: position and device, hours in milliseconds", () => {
  const r = readTracker(
    { position: { deviceId: 7, fixTime: ago(3).toISOString(), latitude: 28.6, longitude: 77.2, attributes: { ignition: true, hours: 15_062_400_000 } }, device: { id: 7, name: 'Roller', uniqueId: '867530998765432' } },
    NOW,
  );
  assert.equal(r.reading?.deviceId, '867530998765432');
  assert.equal(r.reading?.label, 'Roller');
  assert.equal(r.reading?.hourMeter, 4184);
  assert.equal(r.reading?.engineOn, true);
});

test('a tracker message that cannot be used says why', () => {
  assert.equal(readTracker([{ deviceId: 'x' }], NOW).problem, 'Send one reading in each message, not a list');
  assert.equal(readTracker({ lat: 1, lng: 2 }, NOW).problem, 'No deviceId (or imei or serial) in the message');
  assert.match(readTracker({ deviceId: 'x', time: 'yesterday', ignition: true }, NOW).problem!, /could not be read/);
  assert.match(readTracker({ deviceId: 'x', time: ago(8 * 1440).toISOString(), ignition: true }, NOW).problem!, /more than 7 days ago/);
  assert.match(readTracker({ deviceId: 'x', time: ago(-30).toISOString(), ignition: true }, NOW).problem!, /ahead of the clock/);
  assert.equal(readTracker({ deviceId: 'x', lat: 12 }, NOW).problem, 'The position has a latitude or a longitude but not both');
  assert.equal(readTracker({ deviceId: 'x', battery: 80 }, NOW).problem, 'Nothing to read: no position, ignition, hour meter or fuel');
});

test('0, 0 is no fix, not a place in the sea', () => {
  const r = readTracker({ deviceId: 'x', lat: 0, lng: 0, ignition: true }, NOW);
  assert.equal(r.reading?.lat, null);
  assert.equal(r.reading?.lng, null);
});

/* ---------- a maker's feed ---------- */

const machine = (serial: string, hour: number, at: string, extra: Record<string, unknown> = {}) => ({
  EquipmentHeader: { OEMName: 'CAT', Model: '320', SerialNumber: serial },
  Location: { datetime: at, Latitude: 12.9716, Longitude: 77.5946 },
  CumulativeOperatingHours: { datetime: at, Hour: hour },
  CumulativeIdleHours: { datetime: at, Hour: hour / 5 },
  FuelUsed: { datetime: at, FuelUnits: 'litre', FuelConsumed: 40_000 },
  FuelRemaining: { datetime: at, Percent: 62 },
  EngineStatus: { datetime: at, Running: true },
  ...extra,
});

test('a machine in an ISO 15143-3 snapshot: meter, idle, fuel, position, running', () => {
  const r = readFeedMachine(machine('CAT0320DKXYZ01', 5210.4, ago(20).toISOString()), NOW);
  assert.ok(r.reading);
  assert.equal(r.reading.deviceId, 'CAT0320DKXYZ01');
  assert.equal(r.reading.label, 'CAT 320 CAT0320DKXYZ01');
  assert.equal(r.reading.hourMeter, 5210.4);
  assert.equal(r.reading.idleMeter, 1042.08);
  assert.equal(r.reading.fuelUsed, 40_000);
  assert.equal(r.reading.fuelPct, 62);
  assert.equal(r.reading.engineOn, true);
  assert.equal(r.externalId, `CAT0320DKXYZ01@${ago(20).toISOString()}`);
});

test('the same snapshot read twice gives the same id; the reading is as of its latest figure', () => {
  const m = machine('S1', 100, ago(90).toISOString(), { EngineStatus: { datetime: ago(30).toISOString(), Running: false } });
  const a = readFeedMachine(m, NOW);
  const b = readFeedMachine(m, new Date(NOW.getTime() + 3_600_000));
  assert.equal(a.externalId, b.externalId);
  assert.equal(a.reading?.at.toISOString(), ago(30).toISOString());
});

test('camelCase feeds and gallons read too', () => {
  const r = readFeedMachine({ equipmentHeader: { make: 'Komatsu', model: 'PC210', pin: 'KMTPC210X' }, cumulativeOperatingHours: { dateTime: ago(5).toISOString(), hour: '812' }, fuelUsed: { fuelUnits: 'US gallon', fuelConsumed: 100, datetime: ago(5).toISOString() } }, NOW);
  assert.equal(r.reading?.deviceId, 'KMTPC210X');
  assert.equal(r.reading?.hourMeter, 812);
  assert.equal(r.reading?.fuelUsed, 378.541);
  assert.equal(litres(10, 'Liters'), 10);
});

test('a machine with no serial or no time says so', () => {
  assert.match(readFeedMachine({ EquipmentHeader: { Model: 'X' } }, NOW).problem!, /no serial number/);
  assert.equal(readFeedMachine({ EquipmentHeader: { SerialNumber: 'S2', Model: 'X' } }, NOW).problem, 'X S2: no time on any figure');
});

test('a snapshot page: its machines, and the next page only on the same server', () => {
  const base = 'https://api.maker.example/aemp/Fleet/1';
  const p = readFeedPage({ Version: '1', Links: [{ rel: 'self', href: base }, { rel: 'Next', href: '/aemp/Fleet/2' }], Equipment: [machine('A', 1, ago(1).toISOString())] }, base);
  assert.equal(p.machines.length, 1);
  assert.equal(p.next, 'https://api.maker.example/aemp/Fleet/2');
  assert.equal(readFeedPage({ Links: [{ rel: 'next', href: 'https://elsewhere.example/x' }], Equipment: [] }, base).next, null);
  assert.equal(readFeedPage({ Fleet: { Equipment: [] } }, base).problem, null);
  assert.match(readFeedPage({ error: 'nope' }, base).problem!, /no Equipment list/);
});

test("a feed's address must be https on the internet", () => {
  assert.equal(feedUrlProblem('https://api.maker.example/aemp/Fleet/1'), null);
  assert.equal(feedUrlProblem('http://api.maker.example/x'), "The feed's address must start with https://");
  assert.match(feedUrlProblem('https://localhost/x')!, /on the internet/);
  assert.match(feedUrlProblem('https://192.168.1.20/x')!, /private address/);
  assert.match(feedUrlProblem('https://10.0.0.5/x')!, /private address/);
  assert.match(feedUrlProblem('https://[::1]/x')!, /private address/);
  assert.match(feedUrlProblem('https://user:pw@api.maker.example/x')!, /key or password box/);
  assert.equal(feedUrlProblem(''), "Enter the feed's address");
});

test("a feed's settings: each way of signing in needs its own", () => {
  assert.deepEqual(readFeedConfig({ url: ' https://api.maker.example/f ', auth: 'bearer' }, true), { config: { url: 'https://api.maker.example/f', auth: 'BEARER' }, problem: null });
  assert.equal(readFeedConfig({ url: 'https://api.maker.example/f', auth: 'BEARER' }, false).problem, 'Enter the API key');
  assert.equal(readFeedConfig({ url: 'https://api.maker.example/f', auth: 'BASIC' }, false).problem, 'Enter the user name and password as user:password');
  assert.equal(readFeedConfig({ url: 'https://api.maker.example/f', auth: 'OAUTH', tokenUrl: 'https://login.maker.example/token' }, true).problem, 'Enter the client id the maker gave you');
  assert.match(readFeedConfig({ url: 'https://api.maker.example/f', auth: 'OAUTH', tokenUrl: 'http://x.example', clientId: 'c' }, true).problem!, /token's address must start with https/);
  assert.equal(readFeedConfig({ url: 'https://api.maker.example/f', auth: 'TOKEN' }, true).problem, 'Choose how Nirmaan signs in to the feed');
  const ok = readFeedConfig({ url: 'https://api.maker.example/f', auth: 'OAUTH', tokenUrl: 'https://login.maker.example/token', clientId: ' c1 ', scope: '' }, true);
  assert.deepEqual(ok.config, { url: 'https://api.maker.example/f', auth: 'OAUTH', tokenUrl: 'https://login.maker.example/token', clientId: 'c1', scope: undefined });
});

test('a feed is read once an hour, and its refusals say what to do', () => {
  assert.equal(feedDue(null, NOW), true);
  assert.equal(feedDue(ago(30), NOW), false);
  assert.equal(feedDue(ago(59), NOW), true);
  assert.match(feedHttpProblem(401), /refused the sign-in \(401\)/);
  assert.match(feedHttpProblem(404), /not found/);
  assert.match(feedHttpProblem(503), /read again in an hour/);
});

/* ---------- a machine's day ---------- */

const SITE = { lat: 12.9716, lng: 77.5946, radiusM: machineSiteRadius(300) };
const at = (hhmm: string) => new Date(`2026-10-20T${hhmm}:00+05:30`);
const fig = (hhmm: string, f: Partial<ReadingFigures>): ReadingFigures => ({ at: at(hhmm), hourMeter: null, idleMeter: null, fuelUsed: null, lat: null, lng: null, engineOn: null, ...f });
const ctx = { date: '2026-10-20', site: SITE, carry: null };

test('the engine hours are the hour meter moved over the day; idle and fuel likewise', () => {
  const d = rollUpDay(
    [
      fig('08:00', { hourMeter: 4180, idleMeter: 900, fuelUsed: 30_000, engineOn: true, lat: 12.9716, lng: 77.5946 }),
      fig('13:00', { hourMeter: 4184.5, idleMeter: 900.8, fuelUsed: 30_060 }),
      fig('18:00', { hourMeter: 4187.5, idleMeter: 901.5, fuelUsed: 30_110, engineOn: false }),
    ],
    ctx,
  )!;
  assert.equal(engineHoursOf(d), 7.5);
  assert.equal(idleHoursOf(d), 1.5);
  assert.equal(fuelUsedOf(d), 110);
  assert.equal(d.readings, 3);
  assert.equal(d.outsideReadings, 0);
  assert.deepEqual(engineLogDraft({ engineHours: '7.50', idleHours: '1.50', meterStart: '4180.00', meterEnd: '4187.50' }), { hoursWorked: 6, idleHours: 1.5, meterStart: 4180, meterEnd: 4187.5 });
});

test('folding readings one by one gives the same day as rolling them up at once', () => {
  const rs = [fig('07:00', { hourMeter: 10, engineOn: true }), fig('07:10', { engineOn: true }), fig('09:00', { hourMeter: 12 }), fig('09:05', { engineOn: false, lat: 13.2, lng: 77.6 })];
  const folded = rs.reduce<DayState | null>((d, r) => foldReading(d, r, ctx), null);
  assert.deepEqual(folded, rollUpDay([...rs].reverse(), ctx));
});

test("the day starts from the day before's closing meter, so night hours are not lost", () => {
  const carry = { meter: 4187.5, meterAt: new Date('2026-10-19T12:30:00Z'), idle: 901.5, fuelUsed: 30_110 };
  const d = rollUpDay([fig('09:00', { hourMeter: 4189 }), fig('17:00', { hourMeter: 4195 })], { ...ctx, carry })!;
  assert.equal(d.meterStart, 4187.5);
  assert.equal(engineHoursOf(d), 7.5);
});

test('a meter that goes back or jumps more than the time passed is left out and counted', () => {
  const d = rollUpDay([fig('08:00', { hourMeter: 100 }), fig('09:00', { hourMeter: 99 }), fig('10:00', { hourMeter: 350 }), fig('11:00', { hourMeter: 102.5 })], ctx)!;
  assert.equal(d.meterRejected, 2);
  assert.equal(engineHoursOf(d), 2.5);
});

test('a tracker with no meter: ignition on between close readings counts, a long silence does not', () => {
  const d = rollUpDay(
    [fig('08:00', { engineOn: true }), fig('08:10', { engineOn: true }), fig('08:20', { engineOn: false }), fig('09:00', { engineOn: true }), fig('11:00', { engineOn: true }), fig('11:05', { engineOn: false })],
    ctx,
  )!;
  // 08:00 to 08:20 and 11:00 to 11:05; the two silent hours from 09:00 count for nothing.
  assert.equal(d.onSeconds, 25 * 60);
  assert.equal(engineHoursOf(d), 0.42);
});

test("a machine is held to its site's radius, never nearer than 2 km", () => {
  assert.equal(machineSiteRadius(300), 2000);
  assert.equal(machineSiteRadius(5000), 5000);
  assert.equal(machineSiteRadius(null), 2000);
  const d = rollUpDay([fig('08:00', { lat: 12.9716, lng: 77.5946 }), fig('12:00', { lat: 12.98, lng: 77.5946 }), fig('15:00', { lat: 13.02, lng: 77.5946 })], ctx)!;
  assert.equal(d.outsideReadings, 1);
  assert.ok(d.farthestM! > 5000 && d.farthestM! < 5500);
  assert.equal(rollUpDay([fig('08:00', { lat: 13.02, lng: 77.5946 })], { ...ctx, site: null })!.farthestM, null);
});

test("a log's hours above the engine's are flagged beyond half an hour", () => {
  assert.equal(hoursAboveEngine(8, 7.6), null);
  assert.equal(hoursAboveEngine(10, 7.5), 2.5);
  assert.equal(hoursAboveEngine(10, null), null);
});

test('days are taken in the company time zone', () => {
  assert.equal(dayOf(new Date('2026-10-19T19:00:00Z'), 'Asia/Kolkata'), '2026-10-20');
  assert.equal(dayOf(new Date('2026-10-19T18:00:00Z'), 'Asia/Kolkata'), '2026-10-19');
  const [s, e] = dayBounds('2026-10-20', 'Asia/Kolkata');
  assert.equal(s.toISOString(), '2026-10-19T18:30:00.000Z');
  assert.equal(e.toISOString(), '2026-10-20T18:30:00.000Z');
  assert.equal(dayBounds('2026-10-20', 'UTC')[0].toISOString(), '2026-10-20T00:00:00.000Z');
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
console.log(`\nTelematics: ${cases.length - failed} of ${cases.length} tests pass`);
process.exit(failed ? 1 : 0);
