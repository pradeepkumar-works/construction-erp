/**
 * Machine telematics (item 146, ARCHITECTURE "Machine telematics"), as plain functions tested in
 * `src/scripts/telematics-test.ts`: reading a GPS tracker's message and a maker's fleet feed (AEMP 2.0, ISO 15143-3),
 * checking a feed's settings, and rolling a machine's readings up into its day.
 */
import { FEED_AUTHS, distanceMetres, type FeedAuth, type MachineFeedConfig } from '@erp/shared';

/** One reading, whichever way it came: the device it is from and what it says. */
export interface MachineReadingIn {
  deviceId: string;
  label: string | null;
  at: Date;
  /** Cumulative engine hours and idle hours */
  hourMeter: number | null;
  idleMeter: number | null;
  fuelPct: number | null;
  fuelLitres: number | null;
  /** Fuel used since new, litres */
  fuelUsed: number | null;
  lat: number | null;
  lng: number | null;
  engineOn: boolean | null;
}

export type ReadResult = { reading: MachineReadingIn; problem?: undefined } | { reading?: undefined; problem: string };

/** Raw readings are kept this long; each machine's day stays. */
export const READING_KEEP_DAYS = 90;
/** A reading older than this, or later than the clock by more than the second, is refused. */
const MAX_AGE_MS = 7 * 86_400_000;
const MAX_AHEAD_MS = 5 * 60_000;
/** Ignition on at two readings this close counts as running between them; a longer silence counts as nothing. */
export const MAX_ON_GAP_S = 15 * 60;
/** A maker's feed is read at most this often, and at most this many pages each time. */
export const FEED_EVERY_MIN = 60;
export const FEED_MAX_PAGES = 20;
export const FEED_TIMEOUT_MS = 20_000;

const LITRES_PER_US_GALLON = 3.785411784;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** A field by any of its names, ignoring case and _ or -: deviceId, device_id and DeviceID are one. */
export function field(obj: unknown, ...names: string[]): unknown {
  if (!isObj(obj)) return undefined;
  const want = new Set(names.map((n) => n.toLowerCase().replace(/[_-]/g, '')));
  for (const [k, v] of Object.entries(obj)) if (want.has(k.toLowerCase().replace(/[_-]/g, '')) && v !== null && v !== undefined && v !== '') return v;
  return undefined;
}

export function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v.trim()))) return Number(v.trim());
  return null;
}

export function bool(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1 ? true : v === 0 ? false : null;
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  if (['1', 'true', 'on', 'yes', 'running', 'run', 'started'].includes(s)) return true;
  if (['0', 'false', 'off', 'no', 'stopped', 'stop', 'idle_off'].includes(s)) return false;
  return null;
}

/** An ISO time, or seconds or milliseconds since 1970. */
export function timeOf(v: unknown): Date | null {
  if (typeof v === 'number' && Number.isFinite(v)) {
    const d = new Date(v > 1e12 ? v : v * 1000);
    return v > 1e9 ? d : null;
  }
  if (typeof v === 'string' && v.trim()) {
    if (/^\d+(\.\d+)?$/.test(v.trim())) return timeOf(Number(v.trim()));
    const d = new Date(v.trim());
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

const text = (v: unknown, max = 120): string | null => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, max) || null : null);

/** Checks every reader shares: a time within the window, a position on the earth, something worth keeping. */
function finish(r: MachineReadingIn, now: Date): ReadResult {
  if (now.getTime() - r.at.getTime() > MAX_AGE_MS) return { problem: `The reading is from ${r.at.toISOString().slice(0, 10)}, more than 7 days ago` };
  if (r.at.getTime() - now.getTime() > MAX_AHEAD_MS) return { problem: "The reading's time is ahead of the clock; check the device's clock" };
  if ((r.lat === null) !== (r.lng === null)) return { problem: 'The position has a latitude or a longitude but not both' };
  if (r.lat !== null && r.lng !== null) {
    if (Math.abs(r.lat) > 90 || Math.abs(r.lng) > 180) return { problem: `${r.lat}, ${r.lng} is not a position on the earth` };
    // 0, 0 is what a tracker sends before it has a fix.
    if (r.lat === 0 && r.lng === 0) Object.assign(r, { lat: null, lng: null });
  }
  if (r.hourMeter !== null && r.hourMeter < 0) return { problem: 'The hour meter cannot be below zero' };
  if (r.fuelPct !== null && (r.fuelPct < 0 || r.fuelPct > 100)) r.fuelPct = null;
  if (r.hourMeter === null && r.engineOn === null && r.lat === null && r.idleMeter === null && r.fuelUsed === null && r.fuelPct === null && r.fuelLitres === null)
    return { problem: 'Nothing to read: no position, ignition, hour meter or fuel' };
  return { reading: r };
}

/**
 * A GPS tracker service's message: flat JSON with a deviceId (or imei, serial), its time, latitude and longitude,
 * ignition and an hour meter where the tracker reads one; or Traccar's event forwarding ({ position, device }), whose
 * `hours` is in milliseconds. A message with no time is taken as of when it came.
 */
export function readTracker(payload: unknown, receivedAt: Date): ReadResult {
  if (Array.isArray(payload)) return { problem: 'Send one reading in each message, not a list' };
  if (!isObj(payload)) return { problem: 'The message is not a JSON object' };
  const pos = field(payload, 'position');
  if (isObj(pos) && field(pos, 'latitude', 'fixTime', 'attributes') !== undefined) {
    const dev = field(payload, 'device');
    const attrs = field(pos, 'attributes');
    const deviceId = text(field(dev, 'uniqueId') ?? field(pos, 'deviceId'));
    if (!deviceId) return { problem: 'No device uniqueId in the message' };
    const ms = num(field(attrs, 'hours'));
    const at = timeOf(field(pos, 'fixTime', 'deviceTime', 'serverTime')) ?? receivedAt;
    return finish(
      {
        deviceId,
        label: text(field(dev, 'name')),
        at,
        hourMeter: ms === null ? null : Math.round((ms / 3_600_000) * 100) / 100,
        idleMeter: null,
        fuelPct: null,
        fuelLitres: null,
        fuelUsed: null,
        lat: num(field(pos, 'latitude')),
        lng: num(field(pos, 'longitude')),
        engineOn: bool(field(attrs, 'ignition')),
      },
      receivedAt,
    );
  }
  const deviceId = text(field(payload, 'deviceId', 'imei', 'serial', 'serialNumber', 'uniqueId', 'device'));
  if (!deviceId) return { problem: 'No deviceId (or imei or serial) in the message' };
  const where = field(payload, 'location', 'gps', 'coordinates');
  const lat = num(field(payload, 'lat', 'latitude') ?? field(where, 'lat', 'latitude'));
  const lng = num(field(payload, 'lng', 'lon', 'long', 'longitude') ?? field(where, 'lng', 'lon', 'long', 'longitude'));
  const rawTime = field(payload, 'time', 'timestamp', 'at', 'gpsTime', 'fixTime', 'datetime', 'dateTime', 'ts');
  const at = rawTime === undefined ? receivedAt : timeOf(rawTime);
  if (!at) return { problem: `The time ${JSON.stringify(rawTime).slice(0, 40)} could not be read; send ISO time or seconds since 1970` };
  const seconds = num(field(payload, 'engineSeconds', 'hourMeterSeconds'));
  const hours = num(field(payload, 'engineHours', 'hourMeter', 'hourmeter', 'hours', 'operatingHours', 'runHours', 'smu'));
  return finish(
    {
      deviceId,
      label: text(field(payload, 'deviceName', 'label', 'name', 'vehicle', 'vehicleNo')),
      at,
      hourMeter: hours ?? (seconds === null ? null : Math.round((seconds / 3600) * 100) / 100),
      idleMeter: num(field(payload, 'idleHours', 'idleHourMeter')),
      fuelPct: num(field(payload, 'fuelPct', 'fuelPercent', 'fuelLevel', 'fuel')),
      fuelLitres: num(field(payload, 'fuelLitres', 'fuelLiters', 'fuelVolume')),
      fuelUsed: num(field(payload, 'fuelUsed', 'totalFuelUsed', 'fuelConsumed')),
      lat,
      lng,
      engineOn: bool(field(payload, 'ignition', 'acc', 'engineOn', 'engine', 'engineStatus', 'running')),
    },
    receivedAt,
  );
}

/** Litres from a feed's fuel figure and its unit (litres when it gives none). */
export function litres(v: number | null, unit: unknown): number | null {
  if (v === null) return null;
  const u = typeof unit === 'string' ? unit.trim().toLowerCase() : '';
  return /gal/.test(u) ? Math.round(v * LITRES_PER_US_GALLON * 1000) / 1000 : v;
}

/**
 * One machine in a maker's fleet snapshot (ISO 15143-3): its header (maker, model, serial number), and the latest
 * hour meter, idle hours, fuel used and left, engine running and position, each with its own time. The reading is as of
 * the latest of those times, so the same snapshot read twice gives the same id.
 */
export function readFeedMachine(entry: unknown, now: Date): ReadResult & { externalId?: string } {
  if (!isObj(entry)) return { problem: 'A machine in the feed is not a JSON object' };
  const head = field(entry, 'EquipmentHeader') ?? entry;
  const serial = text(field(head, 'SerialNumber', 'PIN', 'EquipmentID', 'UnitInstallId'));
  if (!serial) return { problem: 'A machine in the feed has no serial number, PIN or equipment id' };
  const label = [field(head, 'OEMName', 'Make'), field(head, 'Model'), serial].map((x) => text(x, 40)).filter(Boolean).join(' ');
  const loc = field(entry, 'Location');
  const op = field(entry, 'CumulativeOperatingHours');
  const idle = field(entry, 'CumulativeIdleHours');
  const used = field(entry, 'FuelUsed');
  const left = field(entry, 'FuelRemaining');
  const engine = field(entry, 'EngineStatus');
  const times = [loc, op, idle, used, left, engine].map((s) => timeOf(field(s, 'datetime', 'dateTime'))).filter((d): d is Date => !!d);
  if (!times.length) return { problem: `${label}: no time on any figure` };
  const at = new Date(Math.max(...times.map((d) => d.getTime())));
  const r = finish(
    {
      deviceId: serial,
      label: label || null,
      at,
      hourMeter: num(field(op, 'Hour', 'Hours')),
      idleMeter: num(field(idle, 'Hour', 'Hours')),
      fuelPct: num(field(left, 'Percent')),
      fuelLitres: null,
      fuelUsed: litres(num(field(used, 'FuelConsumed')), field(used, 'FuelUnits')),
      lat: num(field(loc, 'Latitude')),
      lng: num(field(loc, 'Longitude')),
      engineOn: bool(field(engine, 'Running')),
    },
    now,
  );
  if (r.problem) return { problem: `${label}: ${r.problem}` };
  return { ...r, externalId: `${serial}@${at.toISOString()}` };
}

/** The machines in one page of a fleet snapshot, and the next page's address when it is on the same server. */
export function readFeedPage(body: unknown, pageUrl: string): { machines: unknown[]; next: string | null; problem: string | null } {
  const fleet = field(body, 'Fleet') ?? body;
  const list = field(fleet, 'Equipment');
  if (!Array.isArray(list)) return { machines: [], next: null, problem: 'The feed did not answer with a fleet snapshot (no Equipment list); check its address' };
  const links = field(fleet, 'Links') ?? field(body, 'Links');
  let next: string | null = null;
  if (Array.isArray(links)) {
    const n = links.find((l) => String(field(l, 'rel') ?? '').toLowerCase() === 'next');
    const href = text(field(n, 'href'), 2000);
    if (href) {
      try {
        const u = new URL(href, pageUrl);
        if (u.origin === new URL(pageUrl).origin) next = u.toString();
      } catch {
        next = null;
      }
    }
  }
  return { machines: list, next, problem: null };
}

/* ---------- a feed's settings ---------- */

const PRIVATE_V4 = [/^10\./, /^127\./, /^0\./, /^169\.254\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];

/** A feed is read from the server, so it must be https and on the internet, never an address inside the server's own network. */
export function feedUrlProblem(raw: unknown, what = 'feed'): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return `Enter the ${what}'s address`;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return `The ${what}'s address is not a web address; copy it from the maker's portal`;
  }
  if (u.protocol !== 'https:') return `The ${what}'s address must start with https://`;
  if (u.username || u.password) return `Put the sign-in in the key or password box, not in the ${what}'s address`;
  const host = u.hostname.toLowerCase();
  if (host.startsWith('[') || PRIVATE_V4.some((re) => re.test(host))) return `The ${what}'s address must be on the internet, not a private address`;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.'))
    return `The ${what}'s address must be on the internet`;
  return null;
}

/** The feed's settings as kept, trimmed, with what is wrong with them first. */
export function readFeedConfig(config: unknown, hasCredential: boolean): { config: MachineFeedConfig | null; problem: string | null } {
  const url = text(field(config, 'url'), 2000);
  const auth = String(field(config, 'auth') ?? 'BEARER').toUpperCase() as FeedAuth;
  const problem =
    feedUrlProblem(url) ??
    (!FEED_AUTHS.includes(auth) ? 'Choose how Nirmaan signs in to the feed' : null) ??
    (auth === 'OAUTH' ? (feedUrlProblem(field(config, 'tokenUrl'), 'token') ?? (text(field(config, 'clientId')) ? null : 'Enter the client id the maker gave you')) : null) ??
    (hasCredential ? null : auth === 'BASIC' ? 'Enter the user name and password as user:password' : auth === 'OAUTH' ? 'Enter the client secret' : 'Enter the API key');
  if (problem) return { config: null, problem };
  const out: MachineFeedConfig = { url: url!, auth };
  if (auth === 'OAUTH') Object.assign(out, { tokenUrl: text(field(config, 'tokenUrl'), 2000), clientId: text(field(config, 'clientId'), 200), scope: text(field(config, 'scope'), 200) ?? undefined });
  return { config: out, problem: null };
}

/** Whether a feed is due to be read: never read, or read FEED_EVERY_MIN ago. */
export const feedDue = (lastPolledAt: Date | null, now: Date) => !lastPolledAt || now.getTime() - lastPolledAt.getTime() >= (FEED_EVERY_MIN - 2) * 60_000;

/* ---------- a machine's day ---------- */

/** A day's figures as they are kept (MachineDay), built one reading at a time. */
export interface DayState {
  date: string;
  firstAt: Date;
  lastAt: Date;
  readings: number;
  meterStart: number | null;
  meterEnd: number | null;
  meterAt: Date | null;
  idleStart: number | null;
  idleEnd: number | null;
  fuelUsedStart: number | null;
  fuelUsedEnd: number | null;
  onSeconds: number;
  lastEngineOn: boolean | null;
  meterRejected: number;
  farthestM: number | null;
  outsideReadings: number;
  lastLat: number | null;
  lastLng: number | null;
}

export type ReadingFigures = Pick<MachineReadingIn, 'at' | 'hourMeter' | 'idleMeter' | 'fuelUsed' | 'lat' | 'lng' | 'engineOn'>;

/** The day before's closing figures, so the day's hours start from where the meter stood at midnight. */
export interface Carry {
  meter: number | null;
  meterAt: Date | null;
  idle: number | null;
  fuelUsed: number | null;
}

export interface Site {
  lat: number;
  lng: number;
  radiusM: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** A cumulative figure moved on: only forward, never by more than the time allows when that is given. */
function forward(end: number | null, v: number | null, maxStep: number | null): { ok: boolean; end: number | null } {
  if (v === null) return { ok: true, end };
  if (end === null) return { ok: true, end: v };
  const step = v - end;
  // A meter reads in 0.1 h steps, so each end of a move may be up to a step out.
  if (step < -0.01 || (maxStep !== null && step > maxStep + 0.2)) return { ok: false, end };
  return { ok: true, end: Math.max(end, v) };
}

/**
 * One more reading for a machine's day, in time order. The hour meter only goes forward and never by more than the
 * time since it was last read (a reset or a wrong reading is left out and counted); ignition on at two readings close
 * together counts as running between them; the position is held to the site's radius.
 */
export function foldReading(day: DayState | null, r: ReadingFigures, ctx: { date: string; site: Site | null; carry: Carry | null }): DayState {
  const c = ctx.carry;
  const d: DayState = day
    ? { ...day }
    : {
        date: ctx.date,
        firstAt: r.at,
        lastAt: r.at,
        readings: 0,
        meterStart: c?.meter ?? null,
        meterEnd: c?.meter ?? null,
        meterAt: c?.meter !== null && c?.meter !== undefined ? c.meterAt : null,
        idleStart: c?.idle ?? null,
        idleEnd: c?.idle ?? null,
        fuelUsedStart: c?.fuelUsed ?? null,
        fuelUsedEnd: c?.fuelUsed ?? null,
        onSeconds: 0,
        lastEngineOn: null,
        meterRejected: 0,
        farthestM: null,
        outsideReadings: 0,
        lastLat: null,
        lastLng: null,
      };
  const gapS = Math.max(0, (r.at.getTime() - d.lastAt.getTime()) / 1000);
  if (day && d.lastEngineOn === true && gapS <= MAX_ON_GAP_S) d.onSeconds += Math.round(gapS);
  if (r.engineOn !== null) d.lastEngineOn = r.engineOn;

  if (r.hourMeter !== null) {
    const elapsedH = d.meterAt ? Math.max(0, (r.at.getTime() - d.meterAt.getTime()) / 3_600_000) : null;
    const m = forward(d.meterEnd, r.hourMeter, elapsedH);
    if (!m.ok) d.meterRejected++;
    else {
      if (d.meterStart === null) d.meterStart = r.hourMeter;
      d.meterEnd = m.end;
      d.meterAt = r.at;
    }
  }
  const idle = forward(d.idleEnd, r.idleMeter, null);
  if (idle.ok && r.idleMeter !== null) {
    if (d.idleStart === null) d.idleStart = r.idleMeter;
    d.idleEnd = idle.end;
  }
  const fuel = forward(d.fuelUsedEnd, r.fuelUsed, null);
  if (fuel.ok && r.fuelUsed !== null) {
    if (d.fuelUsedStart === null) d.fuelUsedStart = r.fuelUsed;
    d.fuelUsedEnd = fuel.end;
  }
  if (r.lat !== null && r.lng !== null) {
    d.lastLat = r.lat;
    d.lastLng = r.lng;
    if (ctx.site) {
      const m = Math.round(distanceMetres(ctx.site.lat, ctx.site.lng, r.lat, r.lng));
      d.farthestM = Math.max(d.farthestM ?? 0, m);
      if (m > ctx.site.radiusM) d.outsideReadings++;
    }
  }
  d.readings++;
  if (r.at < d.firstAt) d.firstAt = r.at;
  if (r.at > d.lastAt) d.lastAt = r.at;
  return d;
}

/** A day's figures as MachineDay columns (the service and the demo seed write the same). */
export const dayRowData = (s: DayState) => ({
  firstAt: s.firstAt,
  lastAt: s.lastAt,
  readings: s.readings,
  meterStart: s.meterStart,
  meterEnd: s.meterEnd,
  meterAt: s.meterAt,
  idleStart: s.idleStart,
  idleEnd: s.idleEnd,
  fuelUsedStart: s.fuelUsedStart,
  fuelUsedEnd: s.fuelUsedEnd,
  onSeconds: s.onSeconds,
  lastEngineOn: s.lastEngineOn,
  meterRejected: s.meterRejected,
  farthestM: s.farthestM,
  outsideReadings: s.outsideReadings,
  lastLat: s.lastLat,
  lastLng: s.lastLng,
});

/** A whole day from its readings, the same as folding them one by one in time order. */
export function rollUpDay(readings: ReadingFigures[], ctx: { date: string; site: Site | null; carry: Carry | null }): DayState | null {
  return [...readings].sort((a, b) => a.at.getTime() - b.at.getTime()).reduce<DayState | null>((d, r) => foldReading(d, r, ctx), null);
}

/** The engine's hours on the day: the hour meter's move, or for a tracker with no meter, its ignition time. */
export function engineHoursOf(d: Pick<DayState, 'meterStart' | 'meterEnd' | 'onSeconds'>): number {
  if (d.meterStart !== null && d.meterEnd !== null) return r2(Math.max(0, d.meterEnd - d.meterStart));
  return r2(d.onSeconds / 3600);
}

export const idleHoursOf = (d: Pick<DayState, 'idleStart' | 'idleEnd'>) => (d.idleStart !== null && d.idleEnd !== null ? r2(Math.max(0, d.idleEnd - d.idleStart)) : null);
export const fuelUsedOf = (d: Pick<DayState, 'fuelUsedStart' | 'fuelUsedEnd'>) =>
  d.fuelUsedStart !== null && d.fuelUsedEnd !== null ? Math.round(Math.max(0, d.fuelUsedEnd - d.fuelUsedStart) * 1000) / 1000 : null;

/* ---------- days in a time zone ---------- */

function offsetMs(at: Date, timeZone: string): number {
  const p: Record<string, number> = {};
  for (const x of new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(at))
    if (x.type !== 'literal') p[x.type] = Number(x.value);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(at.getTime() / 1000) * 1000;
}

/** The day (YYYY-MM-DD) a moment falls on in the time zone. */
export const dayOf = (at: Date, timeZone: string) => new Date(at.getTime() + offsetMs(at, timeZone)).toISOString().slice(0, 10);

/** When a day starts and ends in the time zone, as moments: [start, end). */
export function dayBounds(date: string, timeZone: string): [Date, Date] {
  const at = (d: string) => {
    const guess = Date.parse(`${d}T00:00:00Z`);
    return new Date(guess - offsetMs(new Date(guess - offsetMs(new Date(guess), timeZone)), timeZone));
  };
  const next = new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  return [at(date), at(next)];
}

/** What a feed's refusal means, in words an admin can act on. */
export function feedHttpProblem(status: number, what = 'feed'): string {
  if (status === 401 || status === 403) return `The ${what} refused the sign-in (${status}); check the key or password in Edit`;
  if (status === 404) return `The ${what}'s address was not found (404); copy it again from the maker's portal`;
  if (status === 429) return `The ${what} asked Nirmaan to slow down (429); it is read again in an hour`;
  if (status >= 500) return `The ${what} is down at the maker's end (${status}); it is read again in an hour`;
  return `The ${what} answered ${status}; check its address`;
}
