/**
 * Machine telematics' tests: a GPS tracker's message (flat and Traccar), a maker's fleet snapshot
 * (ISO 15143-3), a feed's settings, and a machine's day rolled up from its readings; and the tank's refills
 * and drains, fuel burnt, the slips and the norm, and a fuel dispenser's message. No database. CI runs it
 * after the build:
 *
 *   node dist/scripts/telematics-test.js
 */
import assert from 'node:assert/strict';
import { engineLogDraft, fuelSlipGap, hoursAboveEngine, litresPerHour, machineSiteRadius, rateAboveNorm } from '@erp/shared';
import {
  dayBounds,
  dayOf,
  engineHoursOf,
  feedDue,
  feedHttpProblem,
  feedUrlProblem,
  dayRowData,
  foldReading,
  fuelEventsOf,
  fuelMovesOf,
  fuelStepKind,
  fuelUsedOf,
  idleHoursOf,
  litres,
  readFeedConfig,
  readFeedMachine,
  readDispense,
  readFeedPage,
  readTracker,
  tankLitres,
  rollUpDay,
  type DayState,
  type ReadingFigures,
} from '../telematics/telematics-rules';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);

const NOW = new Date('2026-10-20T12:00:00Z');
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000);

// A tracker's message

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

// A maker's feed

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

// A machine's day

const SITE = { lat: 12.9716, lng: 77.5946, radiusM: machineSiteRadius(300) };
const at = (hhmm: string) => new Date(`2026-10-20T${hhmm}:00+05:30`);
const fig = (hhmm: string, f: Partial<ReadingFigures>): ReadingFigures => ({ at: at(hhmm), hourMeter: null, idleMeter: null, fuelUsed: null, fuelPct: null, fuelLitres: null, lat: null, lng: null, engineOn: null, ...f });
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

// The tank

const tankCtx = { ...ctx, tank: 300 };

test("a fuel sensor's % reads as litres through the tank's size; litres it sends are taken as they are", () => {
  assert.equal(tankLitres({ fuelPct: 50, fuelLitres: null }, 300), 150);
  assert.equal(tankLitres({ fuelPct: 50, fuelLitres: null }, null), null);
  assert.equal(tankLitres({ fuelPct: 50, fuelLitres: 142.36 }, 300), 142.4);
});

test('a refill read minute by minute is one refill, from the level before it to the last rise', () => {
  const d = rollUpDay(
    [
      fig('08:00', { fuelPct: 20, engineOn: false }),
      fig('08:01', { fuelPct: 35, engineOn: false }),
      fig('08:02', { fuelPct: 52, engineOn: false }),
      fig('08:03', { fuelPct: 61, engineOn: false }),
      fig('08:04', { fuelPct: 61.5, engineOn: true }),
      fig('17:00', { fuelPct: 30, engineOn: false }),
    ],
    tankCtx,
  )!;
  const refills = d.fuelEvents.filter((e) => e.kind === 'REFILL');
  assert.equal(refills.length, 1);
  assert.equal(refills[0].before, 60);
  assert.equal(refills[0].after, 183);
  assert.equal(refills[0].startAt.toISOString(), at('08:00').toISOString());
  assert.equal(refills[0].endAt.toISOString(), at('08:03').toISOString());
  assert.deepEqual(fuelMovesOf(d), { filled: 123, drained: 0 });
  // 60 at the start + 123 filled − 90 left = 93 burnt.
  assert.equal(fuelUsedOf(d), 93);
});

test('a fall with the engine off is a drain; slosh and an engine burning are not', () => {
  const d = rollUpDay(
    [
      fig('18:00', { fuelLitres: 200, engineOn: false }),
      fig('18:30', { fuelLitres: 197, engineOn: false }),
      fig('22:00', { fuelLitres: 196, engineOn: false }),
      fig('23:00', { fuelLitres: 150, engineOn: false }),
      fig('23:10', { fuelLitres: 151, engineOn: false }),
    ],
    tankCtx,
  )!;
  assert.equal(d.fuelEvents.length, 1);
  assert.equal(d.fuelEvents[0].kind, 'DRAIN');
  assert.equal(d.fuelEvents[0].before - d.fuelEvents[0].after, 46);
  assert.equal(d.fuelEvents[0].engineOn, false);
  assert.deepEqual(fuelMovesOf(d), { filled: 0, drained: 46 });
  assert.equal(fuelUsedOf(d), 3);
  // Burning 20 litres an hour is the engine; 40 litres in 15 minutes is not.
  assert.equal(fuelStepKind(200, 180, 1, true, true, 300), null);
  assert.equal(fuelStepKind(200, 160, 0.25, true, true, 300), 'DRAIN');
  // An unknown engine is no drain unless it was fast.
  assert.equal(fuelStepKind(200, 180, 2, null, null, 300), null);
  // Off at both readings, but its hour meter moved between them: it ran, so it burnt the fuel.
  assert.equal(fuelStepKind(200, 180, 2, false, false, 300), 'DRAIN');
  assert.equal(fuelStepKind(200, 180, 2, false, false, 300, true), null);
  const ran = rollUpDay([fig('17:00', { fuelLitres: 200, hourMeter: 100, engineOn: false }), fig('19:00', { fuelLitres: 175, hourMeter: 101.5, engineOn: false })], tankCtx)!;
  assert.equal(ran.fuelEvents.length, 0);
  // The step grows with the tank: 3% of 1,000 litres.
  assert.equal(fuelStepKind(500, 525, 0.1, false, false, 1000), null);
  assert.equal(fuelStepKind(500, 531, 0.1, false, false, 1000), 'REFILL');
});

test('a run too small to count is dropped once another starts; events round-trip through their JSON', () => {
  const d = rollUpDay(
    [
      fig('08:00', { fuelLitres: 100, engineOn: false }),
      fig('08:05', { fuelLitres: 108, engineOn: false }),
      fig('09:00', { fuelLitres: 107, engineOn: false }),
      fig('10:00', { fuelLitres: 180, engineOn: false }),
    ],
    tankCtx,
  )!;
  assert.equal(d.fuelEvents.length, 1);
  assert.equal(d.fuelEvents[0].after - d.fuelEvents[0].before, 73);
  const back = fuelEventsOf(JSON.parse(JSON.stringify(dayRowData(d).fuelEvents)));
  assert.deepEqual(back, d.fuelEvents);
  assert.deepEqual(fuelEventsOf([{ kind: 'LEAK', before: 1, after: 2 }, 'x']), []);
});

test("the tank carries over from the day before's last reading, so a fill just after midnight is still a fill", () => {
  const carry = { meter: null, meterAt: null, idle: null, fuelUsed: null, fuel: 40, fuelAt: new Date(at('00:00').getTime() - 10 * 60_000), engineOn: false };
  const d = rollUpDay([fig('00:20', { fuelLitres: 190, engineOn: false }), fig('18:00', { fuelLitres: 120, engineOn: true })], { ...tankCtx, carry })!;
  assert.equal(d.fuelStart, 40);
  assert.equal(fuelMovesOf(d).filled, 150);
  assert.equal(fuelUsedOf(d), 70);
});

test("the maker's fuel-used counter comes before the tank", () => {
  const d = rollUpDay([fig('08:00', { fuelLitres: 200, fuelUsed: 1000 }), fig('18:00', { fuelLitres: 100, fuelUsed: 1060 })], tankCtx)!;
  assert.equal(fuelUsedOf(d), 60);
});

test('the tank against the slips, and litres an hour against the norm', () => {
  assert.deepEqual(fuelSlipGap(120, 120), { unslipped: null, notInTank: null });
  assert.deepEqual(fuelSlipGap(120, 105), { unslipped: null, notInTank: null });
  assert.deepEqual(fuelSlipGap(150, 0), { unslipped: 150, notInTank: null });
  assert.deepEqual(fuelSlipGap(60, 200), { unslipped: null, notInTank: 140 });
  // 10% of a big fill: 500 filled against 460 on slips is within it.
  assert.deepEqual(fuelSlipGap(500, 460), { unslipped: null, notInTank: null });
  assert.equal(litresPerHour(90, 6), 15);
  assert.equal(litresPerHour(10, 0.5), null);
  assert.equal(litresPerHour(null, 6), null);
  assert.equal(rateAboveNorm(15, 12, 15), 25);
  assert.equal(rateAboveNorm(13, 12, 15), null);
  assert.equal(rateAboveNorm(15, null, 15), null);
});

test("Traccar's fuel attribute is the tank in litres", () => {
  const r = readTracker({ position: { fixTime: ago(1).toISOString(), latitude: 12.97, longitude: 77.59, attributes: { ignition: false, fuel: 182.5 } }, device: { uniqueId: 'T-9' } }, NOW);
  assert.equal(r.reading?.fuelLitres, 182.5);
});

// A fuel dispenser's fill

test("a dispenser's fill: its id, the tag, the time, the litres and the meter", () => {
  const r = readDispense({ transactionId: 'TX-1001', rfid: 'E200 3412', time: ago(5).toISOString(), litres: '120.5', hourMeter: 4183.2, vehicleName: 'Excavator 1' }, NOW);
  assert.ok(r.dispense);
  assert.equal(r.dispense.externalId, 'TX-1001');
  assert.equal(r.dispense.tag, 'E200 3412');
  assert.equal(r.dispense.tagLabel, 'Excavator 1');
  assert.equal(r.dispense.litres, 120.5);
  assert.equal(r.dispense.meter, 4183.2);
  assert.equal(r.dispense.at.toISOString(), ago(5).toISOString());
});

test('a fill with no id is known by its tag and time; gallons are litres', () => {
  const r = readDispense({ vehicleNo: 'KA01AB1234', quantity: 10, unit: 'gal' }, NOW);
  assert.equal(r.dispense?.externalId, `KA01AB1234@${NOW.toISOString()}`);
  assert.equal(r.dispense?.litres, 37.854);
});

test("a fill with no tag, no litres, too many litres or from long ago is refused with what to do", () => {
  assert.match(readDispense({ litres: 50 }, NOW).problem!, /No tag/);
  assert.match(readDispense({ tag: 'A' }, NOW).problem!, /No litres/);
  assert.match(readDispense({ tag: 'A', litres: 0 }, NOW).problem!, /more than 0/);
  assert.match(readDispense({ tag: 'A', litres: 9000 }, NOW).problem!, /more than a machine's tank/);
  assert.match(readDispense({ tag: 'A', litres: 50, time: '2026-08-01T10:00:00Z' }, NOW).problem!, /more than 30 days ago/);
  assert.match(readDispense([{ tag: 'A' }], NOW).problem!, /one fill in each message/);
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
