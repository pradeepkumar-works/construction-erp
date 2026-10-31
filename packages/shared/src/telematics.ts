/**
 * Machine telematics (ARCHITECTURE "Machine telematics"). A machine's tracker or its maker's feed sends its
 * hour meter, ignition, fuel and position; the API's `telematics-rules.ts` reads them and rolls each machine's day up.
 * This holds what the screens share: how far from its site a machine may be, when a log's hours are above the
 * engine's, and the shapes.
 */

/** Machines work across a site, so they are flagged only beyond the site's radius and never nearer than this, in metres. */
export const MACHINE_SITE_MIN_RADIUS_M = 2000;
export const machineSiteRadius = (siteRadiusM: number | null | undefined) => Math.max(siteRadiusM ?? 0, MACHINE_SITE_MIN_RADIUS_M);

/** Hours a log may be above the engine's before it is flagged: a tracker's rounding and the minutes before its first reading. */
export const ENGINE_HOURS_TOLERANCE = 0.5;

/** How many hours a log's working and idle hours are above what the engine ran, or null when they are within it. */
export function hoursAboveEngine(logged: number, engineHours: number | null | undefined): number | null {
  if (engineHours === null || engineHours === undefined) return null;
  const above = Math.round((logged - engineHours) * 100) / 100;
  return above > ENGINE_HOURS_TOLERANCE ? above : null;
}

/** "4.2 km" or "850 m". */
export const distanceText = (m: number) => (m >= 1000 ? `${(Math.round(m / 100) / 10).toLocaleString('en-IN')} km` : `${Math.round(m)} m`);

/** What the tracker gave for one machine and day, set beside its log. */
export interface MachineEngineDto {
  engineHours: string;
  idleHours: string | null;
  meterStart: string | null;
  meterEnd: string | null;
  /** Fuel burnt: the maker's fuel-used counter, else the tank's fall less drains plus refills */
  fuelUsedLitres: string | null;
  /** Farthest from the site's point that day, in metres, and whether that was beyond its radius */
  farthestM: number | null;
  outsideSite: boolean;
  readings: number;
  firstAt: string;
  lastAt: string;
}

export interface MachineDayDto extends MachineEngineDto {
  id: string;
  equipmentId: string;
  equipmentCode: string;
  equipmentName: string;
  projectId: string | null;
  projectName: string | null;
  date: string;
  /** The radius the machine was held to, when its site has a location */
  siteRadiusM: number | null;
  lastLat: string | null;
  lastLng: string | null;
  /** The day's log, if one was made */
  log: { id: string; status: string; hoursWorked: string; idleHours: string } | null;
  /** The log's hours above the engine's beyond ENGINE_HOURS_TOLERANCE */
  hoursAbove: number | null;
  /** The tank, for a machine whose tracker reads its fuel level */
  fuel: MachineFuelDto | null;
}

export interface MachineDaysDto {
  days: MachineDayDto[];
  /** Machines with a matched tracker or feed */
  machines: number;
  /** Devices a connection reports on that are not matched to a machine yet (Admin, Connections, Devices) */
  unmatchedDevices: number;
  /** A fuel dispenser's fills that are not on a slip yet, whenever they were */
  dispenses: FuelDispenseDto[];
}

/**
 * A day's log as the tracker gives it, for the operator to confirm: the engine's hours less its idle as worked, its
 * idle, and the meter. The form fills only boxes it filled itself (ARCHITECTURE "What a form already knows").
 */
export function engineLogDraft(e: Pick<MachineEngineDto, 'engineHours' | 'idleHours' | 'meterStart' | 'meterEnd'>): { hoursWorked: number; idleHours: number; meterStart: number | null; meterEnd: number | null } {
  const engine = Number(e.engineHours);
  const idle = e.idleHours === null ? 0 : Math.min(Number(e.idleHours), engine);
  return {
    hoursWorked: Math.round((engine - idle) * 10) / 10,
    idleHours: Math.round(idle * 10) / 10,
    meterStart: e.meterStart === null ? null : Number(e.meterStart),
    meterEnd: e.meterEnd === null ? null : Number(e.meterEnd),
  };
}

/** A rise or fall of the tank counts as a refill or a drain from this many litres. */
export const FUEL_EVENT_MIN_LITRES = 20;
/** Litres filled and litres on the day's slips may differ by this much, or this share of the larger, before it is flagged. */
export const FUEL_SLIP_TOLERANCE_LITRES = 20;
export const FUEL_SLIP_TOLERANCE_PCT = 10;
/** Litres an hour are compared with the norm only over a day with at least this many engine hours. */
export const FUEL_RATE_MIN_HOURS = 1;

export const FUEL_EVENT_KINDS = ['REFILL', 'DRAIN'] as const;
export type FuelEventKind = (typeof FUEL_EVENT_KINDS)[number];
export const FUEL_EVENT_KIND_LABELS: Record<FuelEventKind, string> = { REFILL: 'Filled', DRAIN: 'Drained' };

/** A rise (refill) or fall (drain) of the tank the fuel sensor saw, from the reading before it to the last of the run. */
export interface FuelEventDto {
  kind: FuelEventKind;
  startAt: string;
  endAt: string;
  litres: string;
  before: string;
  after: string;
  /** Whether the engine was running as it went, where the tracker says */
  engineOn: boolean | null;
}

/**
 * The tank against the day's fuel slips: litres filled with no slip for them, or litres on slips that never reached the
 * tank, each only beyond FUEL_SLIP_TOLERANCE_LITRES or FUEL_SLIP_TOLERANCE_PCT of the larger.
 */
export function fuelSlipGap(filled: number, onSlips: number): { unslipped: number | null; notInTank: number | null } {
  const allowed = Math.max(FUEL_SLIP_TOLERANCE_LITRES, (Math.max(filled, onSlips) * FUEL_SLIP_TOLERANCE_PCT) / 100);
  const gap = Math.round((filled - onSlips) * 10) / 10;
  return { unslipped: gap > allowed ? gap : null, notInTank: -gap > allowed ? -gap : null };
}

/** Litres an hour over a day, or null for a day with too few engine hours to say. */
export function litresPerHour(litres: number | null, engineHours: number): number | null {
  if (litres === null || engineHours < FUEL_RATE_MIN_HOURS) return null;
  return Math.round((litres / engineHours) * 10) / 10;
}

/** How far a rate is above a litres-an-hour norm in %, or null when it is within the tolerance (or there is no norm). */
export function rateAboveNorm(rate: number | null, norm: number | null, tolerancePct: number): number | null {
  if (rate === null || !norm) return null;
  const pct = Math.round(((rate - norm) / norm) * 100);
  return pct > tolerancePct ? pct : null;
}

/** One machine's tank on a day: what the sensor saw, the day's slips beside it and what does not add up. */
export interface MachineFuelDto {
  /** Litres in the tank at the day's first and last reading */
  startLitres: string | null;
  endLitres: string | null;
  filledLitres: string;
  drainedLitres: string;
  events: FuelEventDto[];
  /** Fuel issued into the machine that day on slips (any way they were made, the dispenser's too) */
  slipLitres: string;
  unslippedLitres: string | null;
  notInTankLitres: string | null;
  /** Litres burnt an hour and the machine's norm (litres an hour), and how far above it in % when beyond its tolerance */
  litresPerHour: string | null;
  norm: string | null;
  aboveNormPct: number | null;
}

/** What a fuel dispenser sent that is not on a slip yet: its tag not matched to a machine, or the issue refused. */
export interface FuelDispenseDto {
  id: string;
  connectionName: string;
  at: string;
  tag: string;
  tagLabel: string | null;
  equipmentCode: string | null;
  litres: string;
  meter: string | null;
  problem: string;
}
