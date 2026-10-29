import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hoursAboveEngine, machineSiteRadius, type MachineDayDto, type MachineDaysDto, type MachineEngineDto } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectAccessService } from '../common/project-access.service';
import { RequestUser } from '../common/current-user';
import { dateOnly, dec, parseDate } from '../common/serialize';
import { JOB_TIMEZONE, todayIn } from '../notifications/time';
import {
  dayBounds,
  dayOf,
  engineHoursOf,
  foldReading,
  fuelUsedOf,
  idleHoursOf,
  READING_KEEP_DAYS,
  rollUpDay,
  dayRowData,
  type Carry,
  type DayState,
  type MachineReadingIn,
  type Site,
} from './telematics-rules';

type Tx = Prisma.TransactionClient;
type DayRow = Prisma.MachineDayGetPayload<object>;
const dayInclude = { equipment: { select: { code: true, name: true } }, project: { select: { name: true, siteRadiusM: true, siteLat: true } } } as const;
type DayWithNames = Prisma.MachineDayGetPayload<{ include: typeof dayInclude }>;

const n = (v: Prisma.Decimal | null) => (v === null ? null : Number(v));
const d2 = (v: number | null, places = 2) => (v === null ? null : v.toFixed(places));
const addDays = (ymd: string, days: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

function toState(r: DayRow): DayState {
  return {
    date: dateOnly(r.date)!,
    firstAt: r.firstAt,
    lastAt: r.lastAt,
    readings: r.readings,
    meterStart: n(r.meterStart),
    meterEnd: n(r.meterEnd),
    meterAt: r.meterAt,
    idleStart: n(r.idleStart),
    idleEnd: n(r.idleEnd),
    fuelUsedStart: n(r.fuelUsedStart),
    fuelUsedEnd: n(r.fuelUsedEnd),
    onSeconds: r.onSeconds,
    lastEngineOn: r.lastEngineOn,
    meterRejected: r.meterRejected,
    farthestM: r.farthestM,
    outsideReadings: r.outsideReadings,
    lastLat: n(r.lastLat),
    lastLng: n(r.lastLng),
  };
}


/** The engine's figures for a day as the screens show them. */
export function engineOf(r: DayRow): MachineEngineDto {
  const s = toState(r);
  return {
    engineHours: engineHoursOf(s).toFixed(2),
    idleHours: d2(idleHoursOf(s)),
    meterStart: dec(r.meterStart),
    meterEnd: dec(r.meterEnd),
    fuelUsedLitres: d2(fuelUsedOf(s), 3),
    farthestM: r.farthestM,
    outsideSite: r.outsideReadings > 0,
    readings: r.readings,
    firstAt: r.firstAt.toISOString(),
    lastAt: r.lastAt.toISOString(),
  };
}

/**
 * Machine telematics (item 146, ARCHITECTURE "Machine telematics"): each reading a tracker or a maker's feed sends is
 * kept for READING_KEEP_DAYS and moves its machine's day on, through the pure `telematics-rules.ts`. The day's log, the
 * hire bill's checks and the service schedule read the days from here.
 */
@Injectable()
export class TelematicsService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
  ) {}

  /** Keep one reading of a device; when the device is matched to a machine, its day moves on. */
  async record(organizationId: string, link: { id: string; equipmentId: string | null; projectId: string | null }, r: MachineReadingIn): Promise<{ duplicate: boolean }> {
    try {
      await this.prisma.machineReading.create({
        data: {
          organizationId,
          deviceLinkId: link.id,
          equipmentId: link.equipmentId,
          at: r.at,
          hourMeter: r.hourMeter,
          idleMeter: r.idleMeter,
          fuelPct: r.fuelPct,
          fuelLitres: r.fuelLitres,
          fuelUsed: r.fuelUsed,
          lat: r.lat,
          lng: r.lng,
          engineOn: r.engineOn,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { duplicate: true };
      throw e;
    }
    if (link.equipmentId) await this.moveDay(organizationId, link.equipmentId, link.projectId, r);
    return { duplicate: false };
  }

  private lock(tx: Tx, equipmentId: string) {
    return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`telematics:${equipmentId}`}))`;
  }

  /** Where the machine works and the point and radius it is held to: its deployment, else the device's site. */
  private async siteOf(tx: Tx, equipmentId: string, fallbackProjectId: string | null): Promise<{ projectId: string | null; site: Site | null }> {
    const eq = await tx.equipment.findUnique({ where: { id: equipmentId }, select: { projectId: true } });
    const projectId = eq?.projectId ?? fallbackProjectId;
    if (!projectId) return { projectId: null, site: null };
    const p = await tx.project.findUnique({ where: { id: projectId }, select: { siteLat: true, siteLng: true, siteRadiusM: true } });
    return { projectId, site: p?.siteLat && p.siteLng ? { lat: Number(p.siteLat), lng: Number(p.siteLng), radiusM: machineSiteRadius(p.siteRadiusM) } : null };
  }

  /** The day before's closing figures, so the hours start where the meter stood at midnight. */
  private async carryFor(tx: Tx, equipmentId: string, date: string): Promise<Carry | null> {
    const prev = await tx.machineDay.findUnique({ where: { equipmentId_date: { equipmentId, date: parseDate(addDays(date, -1)) } } });
    return prev ? { meter: n(prev.meterEnd), meterAt: prev.meterAt, idle: n(prev.idleEnd), fuelUsed: n(prev.fuelUsedEnd) } : null;
  }

  /** A reading in time order folds into its day; one older than the day's last is a rebuild of the day from its readings. */
  private async moveDay(organizationId: string, equipmentId: string, projectHint: string | null, r: MachineReadingIn) {
    const date = dayOf(r.at, JOB_TIMEZONE);
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, equipmentId);
      const existing = await tx.machineDay.findUnique({ where: { equipmentId_date: { equipmentId, date: parseDate(date) } } });
      if (existing && r.at < existing.lastAt) return this.rebuildDayIn(tx, organizationId, equipmentId, date, projectHint);
      const { projectId, site } = await this.siteOf(tx, equipmentId, projectHint);
      const carry = existing ? null : await this.carryFor(tx, equipmentId, date);
      const s = foldReading(existing ? toState(existing) : null, r, { date, site, carry });
      await tx.machineDay.upsert({
        where: { equipmentId_date: { equipmentId, date: parseDate(date) } },
        create: { organizationId, equipmentId, projectId, date: parseDate(date), ...dayRowData(s) },
        update: dayRowData(s),
      });
    });
  }

  private async rebuildDayIn(tx: Tx, organizationId: string, equipmentId: string, date: string, projectHint: string | null) {
    const [start, end] = dayBounds(date, JOB_TIMEZONE);
    const readings = await tx.machineReading.findMany({
      where: { equipmentId, at: { gte: start, lt: end } },
      select: { at: true, hourMeter: true, idleMeter: true, fuelUsed: true, lat: true, lng: true, engineOn: true },
      orderBy: { at: 'asc' },
    });
    const key = { equipmentId_date: { equipmentId, date: parseDate(date) } };
    if (!readings.length) {
      await tx.machineDay.deleteMany({ where: { equipmentId, date: parseDate(date) } });
      return;
    }
    const { projectId, site } = await this.siteOf(tx, equipmentId, projectHint);
    const carry = await this.carryFor(tx, equipmentId, date);
    const s = rollUpDay(
      readings.map((x) => ({ at: x.at, hourMeter: n(x.hourMeter), idleMeter: n(x.idleMeter), fuelUsed: n(x.fuelUsed), lat: n(x.lat), lng: n(x.lng), engineOn: x.engineOn })),
      { date, site, carry },
    )!;
    await tx.machineDay.upsert({ where: key, create: { organizationId, equipmentId, projectId, date: parseDate(date), ...dayRowData(s) }, update: dayRowData(s) });
  }

  /**
   * A device matched to a machine (or the match changed): its kept readings move to the machine, and every day they
   * fall on is built again for the machine it left and the one it joined, oldest first so each day carries the last.
   */
  async rematch(organizationId: string, link: { id: string; projectId: string | null }, from: string | null, to: string | null) {
    if (from === to) return;
    await this.prisma.machineReading.updateMany({ where: { deviceLinkId: link.id }, data: { equipmentId: to } });
    const rows = await this.prisma.$queryRaw<{ day: string }[]>`
      SELECT DISTINCT to_char(("at" AT TIME ZONE 'UTC') AT TIME ZONE ${JOB_TIMEZONE}, 'YYYY-MM-DD') AS day
      FROM "MachineReading" WHERE "deviceLinkId" = ${link.id} ORDER BY day`;
    for (const equipmentId of [from, to]) {
      if (!equipmentId) continue;
      for (const { day } of rows) await this.prisma.$transaction(async (tx) => {
        await this.lock(tx, equipmentId);
        await this.rebuildDayIn(tx, organizationId, equipmentId, day, link.projectId);
      });
    }
  }

  /** Readings older than READING_KEEP_DAYS go; the days built from them stay. */
  async prune(now = new Date()) {
    const r = await this.prisma.machineReading.deleteMany({ where: { at: { lt: new Date(now.getTime() - READING_KEEP_DAYS * 86_400_000) } } });
    return r.count;
  }

  /* ---------- what the screens read ---------- */

  private where(user: RequestUser): Prisma.MachineDayWhereInput {
    return this.access.submissionWhere(user);
  }

  private dayDto(r: DayWithNames, log: { id: string; status: string; hoursWorked: Prisma.Decimal; idleHours: Prisma.Decimal } | undefined): MachineDayDto {
    const engine = engineOf(r);
    return {
      id: r.id,
      equipmentId: r.equipmentId,
      equipmentCode: r.equipment.code,
      equipmentName: r.equipment.name,
      projectId: r.projectId,
      projectName: r.project?.name ?? null,
      date: dateOnly(r.date)!,
      ...engine,
      siteRadiusM: r.project?.siteLat ? machineSiteRadius(r.project.siteRadiusM) : null,
      lastLat: dec(r.lastLat),
      lastLng: dec(r.lastLng),
      log: log ? { id: log.id, status: log.status, hoursWorked: log.hoursWorked.toString(), idleHours: log.idleHours.toString() } : null,
      hoursAbove: log ? hoursAboveEngine(Number(log.hoursWorked) + Number(log.idleHours), Number(engine.engineHours)) : null,
    };
  }

  private async logsFor(rows: DayRow[]) {
    if (!rows.length) return new Map<string, { id: string; status: string; hoursWorked: Prisma.Decimal; idleHours: Prisma.Decimal }>();
    const logs = await this.prisma.machineryLog.findMany({
      where: { OR: rows.map((r) => ({ equipmentId: r.equipmentId, date: r.date })), status: { not: 'REJECTED' } },
      select: { id: true, equipmentId: true, date: true, status: true, hoursWorked: true, idleHours: true },
    });
    return new Map(logs.map((l) => [`${l.equipmentId}|${dateOnly(l.date)}`, l]));
  }

  /** GET /telematics/days: each tracked machine's days in the range (the last week by default), with its log beside it. */
  async days(user: RequestUser, q: { projectId?: string; equipmentId?: string; from?: string; to?: string }): Promise<MachineDaysDto> {
    const to = q.to ?? todayIn();
    const from = q.from ?? addDays(to, -6);
    const where: Prisma.MachineDayWhereInput = { ...this.where(user), date: { gte: parseDate(from), lte: parseDate(to) } };
    if (q.projectId) where.projectId = q.projectId;
    if (q.equipmentId) where.equipmentId = q.equipmentId;
    const [rows, machines, unmatched] = await Promise.all([
      this.prisma.machineDay.findMany({ where, include: dayInclude, orderBy: [{ date: 'desc' }, { equipment: { code: 'asc' } }], take: 1000 }),
      this.prisma.deviceLink.findMany({ where: { organizationId: user.organizationId, equipmentId: { not: null } }, distinct: ['equipmentId'], select: { equipmentId: true } }),
      this.prisma.deviceLink.count({ where: { organizationId: user.organizationId, equipmentId: null, connection: { kind: { in: ['MACHINE_FEED', 'GPS_TRACKER'] } } } }),
    ]);
    const logs = await this.logsFor(rows);
    return { days: rows.map((r) => this.dayDto(r, logs.get(`${r.equipmentId}|${dateOnly(r.date)}`))), machines: machines.length, unmatchedDevices: unmatched };
  }

  /** GET /telematics/day: one machine's day, for the log form to fill from; null when nothing was read. */
  async day(user: RequestUser, equipmentId: string, date: string): Promise<MachineDayDto | null> {
    const r = await this.prisma.machineDay.findFirst({ where: { organizationId: user.organizationId, equipmentId, date: parseDate(date) }, include: dayInclude });
    if (!r) return null;
    return this.dayDto(r, (await this.logsFor([r])).get(`${r.equipmentId}|${date}`));
  }

  /** The engine's figures for a log's machine and day, for its record. */
  async engineFor(equipmentId: string, date: Date): Promise<MachineEngineDto | null> {
    const r = await this.prisma.machineDay.findUnique({ where: { equipmentId_date: { equipmentId, date } } });
    return r ? engineOf(r) : null;
  }

  /** Engine hours by day (YYYY-MM-DD) for a machine's days, for a hire bill's check. */
  async engineHoursOn(equipmentId: string, dates: Date[]): Promise<Map<string, number>> {
    if (!dates.length) return new Map();
    const rows = await this.prisma.machineDay.findMany({ where: { equipmentId, date: { in: dates } } });
    return new Map(rows.map((r) => [dateOnly(r.date)!, engineHoursOf(toState(r))]));
  }
}
