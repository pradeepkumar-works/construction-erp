/**
 * Machine telematics (item 146, ARCHITECTURE "Machine telematics"). A machine's tracker or its maker's feed sends its
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
}

export interface MachineDaysDto {
  days: MachineDayDto[];
  /** Machines with a matched tracker or feed */
  machines: number;
  /** Devices a connection reports on that are not matched to a machine yet (Admin, Connections, Devices) */
  unmatchedDevices: number;
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
