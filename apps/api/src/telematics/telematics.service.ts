import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  FUEL_TOLERANCE_DEFAULT_PCT,
  fuelSlipGap,
  hoursAboveEngine,
  litresPerHour,
  machineSiteRadius,
  rateAboveNorm,
  type FuelDispenseDto,
  type MachineDayDto,
  type MachineDaysDto,
  type MachineEngineDto,
  type MachineFuelDto,
} from '@erp/shared';
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
  fuelEventCounts,
  fuelEventsOf,
  fuelMovesOf,
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
const dayInclude = { equipment: { select: { code: true, name: true, fuelNorm: true, fuelNormUnit: true, fuelTolerancePct: true } }, project: { select: { name: true, siteRadiusM: true, siteLat: true } } } as const;
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
    fuelStart: n(r.fuelStart),
    fuelEnd: n(r.fuelEnd),
    fuelAt: r.fuelAt,
    fuelEvents: fuelEventsOf(r.fuelEvents),
  };
}

const readingFigures = { at: true, hourMeter: true, idleMeter: true, fuelUsed: true, fuelPct: true, fuelLitres: true, lat: true, lng: true, engineOn: true } as const;
type ReadingRow = Prisma.MachineReadingGetPayload<{ select: typeof readingFigures }>;
const figuresOf = (x: ReadingRow) => ({ at: x.at, hourMeter: n(x.hourMeter), idleMeter: n(x.idleMeter), fuelUsed: n(x.fuelUsed), fuelPct: n(x.fuelPct), fuelLitres: n(x.fuelLitres), lat: n(x.lat), lng: n(x.lng), engineOn: x.engineOn });

/**
 * A day's tank beside the fuel slips made out to the machine that day, and its litres an hour against its
 * norm; null for a machine whose tracker reads no fuel level.
 */
export function fuelOf(r: DayRow, slipLitres: number, norm: { fuelNorm: Prisma.Decimal | null; fuelNormUnit: string | null; fuelTolerancePct: Prisma.Decimal | null } | null): MachineFuelDto | null {
  const s = toState(r);
  if (s.fuelStart === null) return null;
  const moves = fuelMovesOf(s);
  const gap = fuelSlipGap(moves.filled, slipLitres);
  const rate = litresPerHour(fuelUsedOf(s), engineHoursOf(s));
  const perHour = norm?.fuelNormUnit === 'LITRES_PER_HOUR' && norm.fuelNorm ? Number(norm.fuelNorm) : null;
  return {
    startLitres: d2(s.fuelStart, 1),
    endLitres: d2(s.fuelEnd, 1),
    filledLitres: moves.filled.toFixed(1),
    drainedLitres: moves.drained.toFixed(1),
    events: s.fuelEvents.filter(fuelEventCounts).map((e) => ({
      kind: e.kind,
      startAt: e.startAt.toISOString(),
      endAt: e.endAt.toISOString(),
      litres: Math.abs(e.after - e.before).toFixed(1),
      before: e.before.toFixed(1),
      after: e.after.toFixed(1),
      engineOn: e.engineOn,
    })),
    slipLitres: slipLitres.toFixed(1),
    unslippedLitres: d2(gap.unslipped, 1),
    notInTankLitres: d2(gap.notInTank, 1),
    litresPerHour: d2(rate, 1),
    norm: d2(perHour, 1),
    aboveNormPct: rateAboveNorm(rate, perHour, norm?.fuelTolerancePct ? Number(norm.fuelTolerancePct) : FUEL_TOLERANCE_DEFAULT_PCT),
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
    fuelUsedLitres: d2(fuelUsedOf(s), 1),
    farthestM: r.farthestM,
    outsideSite: r.outsideReadings > 0,
    readings: r.readings,
    firstAt: r.firstAt.toISOString(),
    lastAt: r.lastAt.toISOString(),
  };
}

/**
 * Machine telematics (ARCHITECTURE "Machine telematics"): each reading a tracker or a maker's feed sends is
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
  private async siteOf(tx: Tx, equipmentId: string, fallbackProjectId: string | null): Promise<{ projectId: string | null; site: Site | null; tank: number | null }> {
    const eq = await tx.equipment.findUnique({ where: { id: equipmentId }, select: { projectId: true, fuelTankLitres: true } });
    const projectId = eq?.projectId ?? fallbackProjectId;
    const tank = n(eq?.fuelTankLitres ?? null);
    if (!projectId) return { projectId: null, site: null, tank };
    const p = await tx.project.findUnique({ where: { id: projectId }, select: { siteLat: true, siteLng: true, siteRadiusM: true } });
    return { projectId, site: p?.siteLat && p.siteLng ? { lat: Number(p.siteLat), lng: Number(p.siteLng), radiusM: machineSiteRadius(p.siteRadiusM) } : null, tank };
  }

  /** The day before's closing figures, so the hours start where the meter stood at midnight. */
  private async carryFor(tx: Tx, equipmentId: string, date: string): Promise<Carry | null> {
    const prev = await tx.machineDay.findUnique({ where: { equipmentId_date: { equipmentId, date: parseDate(addDays(date, -1)) } } });
    return prev ? { meter: n(prev.meterEnd), meterAt: prev.meterAt, idle: n(prev.idleEnd), fuelUsed: n(prev.fuelUsedEnd), fuel: n(prev.fuelEnd), fuelAt: prev.fuelAt, engineOn: prev.lastEngineOn } : null;
  }

  /** A reading in time order folds into its day; one older than the day's last is a rebuild of the day from its readings. */
  private async moveDay(organizationId: string, equipmentId: string, projectHint: string | null, r: MachineReadingIn) {
    const date = dayOf(r.at, JOB_TIMEZONE);
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, equipmentId);
      const existing = await tx.machineDay.findUnique({ where: { equipmentId_date: { equipmentId, date: parseDate(date) } } });
      if (existing && r.at < existing.lastAt) return this.rebuildDayIn(tx, organizationId, equipmentId, date, projectHint);
      const { projectId, site, tank } = await this.siteOf(tx, equipmentId, projectHint);
      const carry = existing ? null : await this.carryFor(tx, equipmentId, date);
      const s = foldReading(existing ? toState(existing) : null, r, { date, site, carry, tank });
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
      select: readingFigures,
      orderBy: { at: 'asc' },
    });
    const key = { equipmentId_date: { equipmentId, date: parseDate(date) } };
    if (!readings.length) {
      await tx.machineDay.deleteMany({ where: { equipmentId, date: parseDate(date) } });
      return;
    }
    const { projectId, site, tank } = await this.siteOf(tx, equipmentId, projectHint);
    const carry = await this.carryFor(tx, equipmentId, date);
    const s = rollUpDay(readings.map(figuresOf), { date, site, carry, tank })!;
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

  private where(user: RequestUser): Prisma.MachineDayWhereInput {
    return this.access.submissionWhere(user);
  }

  private dayDto(r: DayWithNames, log: { id: string; status: string; hoursWorked: Prisma.Decimal; idleHours: Prisma.Decimal } | undefined, slipLitres: number): MachineDayDto {
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
      fuel: fuelOf(r, slipLitres, r.equipment),
    };
  }

  /** Litres issued into each machine on each day (`equipmentId|YYYY-MM-DD`), from fuel slips however they were made. */
  async slipsFor(rows: Pick<DayRow, 'equipmentId' | 'date'>[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (!rows.length) return out;
    const entries = await this.prisma.stockEntry.findMany({
      where: { type: 'ISSUE', OR: rows.map((r) => ({ equipmentId: r.equipmentId, date: r.date })) },
      select: { equipmentId: true, date: true, lines: { where: { item: { isFuel: true } }, select: { quantity: true } } },
    });
    for (const e of entries) {
      const k = `${e.equipmentId}|${dateOnly(e.date)}`;
      out.set(k, (out.get(k) ?? 0) + e.lines.reduce((t, l) => t + Math.abs(Number(l.quantity)), 0));
    }
    return out;
  }

  /** A fuel dispenser's fills not on a slip yet, whenever they were, at the sites the user sees. */
  async pendingDispenses(user: RequestUser, q: { projectId?: string }): Promise<FuelDispenseDto[]> {
    const rows = await this.prisma.fuelDispense.findMany({
      where: {
        organizationId: user.organizationId,
        stockEntryId: null,
        connection: { project: { ...this.access.projectWhere(user), ...(q.projectId ? { id: q.projectId } : {}) } },
      },
      include: { connection: { select: { name: true } }, deviceLink: { select: { externalId: true, label: true, equipment: { select: { code: true } } } } },
      orderBy: { at: 'desc' },
      take: 200,
    });
    return rows.map((d) => ({
      id: d.id,
      connectionName: d.connection.name,
      at: d.at.toISOString(),
      tag: d.deviceLink.externalId,
      tagLabel: d.deviceLink.label,
      equipmentCode: d.deviceLink.equipment?.code ?? null,
      litres: Number(d.litres).toFixed(1),
      meter: dec(d.meter),
      problem: d.problem ?? (d.deviceLink.equipment ? 'Not issued yet' : 'The tag is not matched to a machine'),
    }));
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
    const [logs, slips, dispenses] = await Promise.all([
      this.logsFor(rows),
      this.slipsFor(rows),
      this.pendingDispenses(user, { projectId: q.projectId }),
    ]);
    const key = (r: DayRow) => `${r.equipmentId}|${dateOnly(r.date)}`;
    return { days: rows.map((r) => this.dayDto(r, logs.get(key(r)), slips.get(key(r)) ?? 0)), machines: machines.length, unmatchedDevices: unmatched, dispenses };
  }

  /**
   * The days of the sites' machines whose tracker reads the tank, with each day's tank against its slips, for the
   * watch list.
   */
  async fuelDays(projectIds: string[], from: string, to: string) {
    if (!projectIds.length) return [];
    const rows = await this.prisma.machineDay.findMany({
      where: { projectId: { in: projectIds }, fuelStart: { not: null }, date: { gte: parseDate(from), lte: parseDate(to) } },
      include: dayInclude,
      orderBy: { date: 'asc' },
    });
    const slips = await this.slipsFor(rows);
    return rows.map((r) => ({ equipmentId: r.equipmentId, code: r.equipment.code, name: r.equipment.name, projectId: r.projectId, date: dateOnly(r.date)!, fuel: fuelOf(r, slips.get(`${r.equipmentId}|${dateOnly(r.date)}`) ?? 0, r.equipment)! }));
  }

  /** Fuel burnt by the tank (or the maker's counter) on each day of the machines, `equipmentId|YYYY-MM-DD`, for the fuel norm. */
  async burntOn(equipmentIds: string[], from: string, to: string): Promise<Map<string, number>> {
    if (!equipmentIds.length) return new Map();
    const rows = await this.prisma.machineDay.findMany({ where: { equipmentId: { in: equipmentIds }, date: { gte: parseDate(from), lte: parseDate(to) } } });
    const out = new Map<string, number>();
    for (const r of rows) {
      const burnt = fuelUsedOf(toState(r));
      if (burnt !== null && burnt > 0) out.set(`${r.equipmentId}|${dateOnly(r.date)}`, burnt);
    }
    return out;
  }

  /** GET /telematics/day: one machine's day, for the log form to fill from; null when nothing was read. */
  async day(user: RequestUser, equipmentId: string, date: string): Promise<MachineDayDto | null> {
    const r = await this.prisma.machineDay.findFirst({ where: { organizationId: user.organizationId, equipmentId, date: parseDate(date) }, include: dayInclude });
    if (!r) return null;
    const [logs, slips] = await Promise.all([this.logsFor([r]), this.slipsFor([r])]);
    return this.dayDto(r, logs.get(`${r.equipmentId}|${date}`), slips.get(`${r.equipmentId}|${date}`) ?? 0);
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
