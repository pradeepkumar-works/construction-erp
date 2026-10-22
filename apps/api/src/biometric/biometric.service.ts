import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import {
  STANDARD_DAY_HOURS,
  WORKER_SHIFT_HOURS,
  canManageBiometric,
  overtimeHours,
  workerOvertime,
  type BiometricDeviceDto,
  type BiometricIngestResultDto,
  type BiometricPunchDto,
  type BiometricPunchResult,
  type BiometricUserDto,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { AuditService } from '../common/audit.service';
import { dateOnly, iso, parseDate } from '../common/serialize';
import { setTenant, withoutTenant } from '../prisma/tenant-context';
import { todayIn } from '../notifications/time';
import { AttendanceService } from '../attendance/attendance.service';
import { WorkersService } from '../workers/workers.service';
import { cleanPin, codeNumber, dayFromPunches, localToUtc, parseAdmsAttlog, parsePunchFile, webhookLocal, type RawPunch } from './biometric-rules';
import type { CreateDeviceDto, ImportPunchesDto, PunchQuery, UpdateDeviceDto, WebhookPunchesDto } from './biometric.dto';

type Device = Prisma.BiometricDeviceGetPayload<{ include: { project: { select: { name: true } } } }>;

/** How far back a new match goes to mark days from punches already received. */
const REMATCH_DAYS = 62;

/**
 * Biometric attendance (v6 item 101). Devices send punches by ADMS (the iclock push protocol of ZKTeco, eSSL and others),
 * by webhook with the device's key, or HR imports a punch file. Each punch is kept once; a user number matched to an
 * employee or a worker turns their punches of a day into that day's attendance (in at the first, out at the last).
 */
@Injectable()
export class BiometricService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private attendance: AttendanceService,
    private workers: WorkersService,
  ) {}

  private assertManage(user: RequestUser) {
    if (!canManageBiometric(user.roleKey)) throw new ForbiddenException('Only HR, management or an admin can manage biometric devices');
  }

  /* ---------- devices ---------- */

  private toDeviceDto(d: Device, today: number): BiometricDeviceDto {
    return {
      id: d.id,
      name: d.name,
      model: d.model,
      protocol: d.protocol,
      serialNo: d.serialNo,
      apiKey: d.protocol === 'WEBHOOK' ? d.apiKey : null,
      projectId: d.projectId,
      projectName: d.project?.name ?? null,
      utcOffsetMin: d.utcOffsetMin,
      isActive: d.isActive,
      lastSeenAt: iso(d.lastSeenAt),
      lastPunchAt: iso(d.lastPunchAt),
      punchesToday: today,
      createdAt: d.createdAt.toISOString(),
    };
  }

  async devices(user: RequestUser): Promise<BiometricDeviceDto[]> {
    this.assertManage(user);
    const [rows, today] = await Promise.all([
      this.prisma.biometricDevice.findMany({ where: { organizationId: user.organizationId }, include: { project: { select: { name: true } } }, orderBy: { name: 'asc' } }),
      this.prisma.biometricPunch.groupBy({ by: ['deviceId'], where: { organizationId: user.organizationId, date: parseDate(todayIn()) }, _count: { _all: true } }),
    ]);
    const n = new Map(today.map((t) => [t.deviceId, t._count._all]));
    return rows.map((d) => this.toDeviceDto(d, n.get(d.id) ?? 0));
  }

  private async deviceFor(user: RequestUser, id: string) {
    const d = await this.prisma.biometricDevice.findFirst({ where: { id, organizationId: user.organizationId }, include: { project: { select: { name: true } } } });
    if (!d) throw new NotFoundException('Device not found');
    return d;
  }

  private async checkDevice(user: RequestUser, dto: { projectId?: string | null; serialNo?: string | null }, id?: string) {
    if (dto.projectId && !(await this.prisma.project.findFirst({ where: { id: dto.projectId, organizationId: user.organizationId }, select: { id: true } }))) throw new BadRequestException('Project not found');
    if (dto.serialNo) {
      const other = await withoutTenant(() => this.prisma.biometricDevice.findUnique({ where: { serialNo: dto.serialNo! }, select: { id: true, organizationId: true } }));
      if (other && other.id !== id)
        throw new BadRequestException(other.organizationId === user.organizationId ? 'A device with this serial number is already registered. Open it instead.' : 'This serial number is registered by another company. Check it on the device (Menu > System info > Device info).');
    }
  }

  async createDevice(user: RequestUser, dto: CreateDeviceDto) {
    this.assertManage(user);
    const serialNo = dto.protocol === 'ADMS' ? dto.serialNo?.trim().toUpperCase() || null : null;
    if (dto.protocol === 'ADMS' && !serialNo) throw new BadRequestException('Enter the serial number shown on the device (Menu > System info > Device info)');
    await this.checkDevice(user, { projectId: dto.projectId, serialNo });
    const row = await this.prisma.biometricDevice.create({
      data: {
        organizationId: user.organizationId,
        name: dto.name.trim(),
        model: dto.model?.trim() || null,
        protocol: dto.protocol,
        serialNo,
        apiKey: dto.protocol === 'WEBHOOK' ? newKey() : null,
        projectId: dto.projectId ?? null,
        utcOffsetMin: dto.utcOffsetMin ?? 330,
        createdById: user.id,
      },
      include: { project: { select: { name: true } } },
    });
    await this.audit.log(user, 'BIOMETRIC_DEVICE', row.id, 'CREATED', row.name);
    return this.toDeviceDto(row, 0);
  }

  async updateDevice(user: RequestUser, id: string, dto: UpdateDeviceDto) {
    this.assertManage(user);
    const d = await this.deviceFor(user, id);
    const serialNo = d.protocol === 'ADMS' && dto.serialNo !== undefined ? dto.serialNo?.trim().toUpperCase() || null : undefined;
    if (d.protocol === 'ADMS' && serialNo === null) throw new BadRequestException('Enter the serial number shown on the device');
    await this.checkDevice(user, { projectId: dto.projectId, serialNo }, id);
    const row = await this.prisma.biometricDevice.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        model: dto.model === undefined ? undefined : dto.model?.trim() || null,
        serialNo,
        projectId: dto.projectId,
        utcOffsetMin: dto.utcOffsetMin,
        isActive: dto.isActive,
      },
      include: { project: { select: { name: true } } },
    });
    await this.audit.log(user, 'BIOMETRIC_DEVICE', id, 'UPDATED', dto.isActive === false ? 'Switched off' : dto.isActive === true ? 'Switched on' : null);
    return this.toDeviceDto(row, 0);
  }

  async newKey(user: RequestUser, id: string) {
    this.assertManage(user);
    const d = await this.deviceFor(user, id);
    if (d.protocol !== 'WEBHOOK') throw new BadRequestException('Only a webhook device has a key');
    const row = await this.prisma.biometricDevice.update({ where: { id }, data: { apiKey: newKey() }, include: { project: { select: { name: true } } } });
    await this.audit.log(user, 'BIOMETRIC_DEVICE', id, 'UPDATED', 'New key');
    return this.toDeviceDto(row, 0);
  }

  async removeDevice(user: RequestUser, id: string) {
    this.assertManage(user);
    const d = await this.deviceFor(user, id);
    if (await this.prisma.biometricPunch.count({ where: { deviceId: id } }))
      throw new BadRequestException(`${d.name} has punches that marked attendance. Switch it off instead, so they stay on record.`);
    await this.prisma.biometricDevice.delete({ where: { id } });
    await this.audit.log(user, 'BIOMETRIC_DEVICE', id, 'DELETED', d.name);
    return { ok: true };
  }

  /* ---------- device users ---------- */

  async users(user: RequestUser): Promise<BiometricUserDto[]> {
    this.assertManage(user);
    const since = parseDate(addDays(todayIn(), -30));
    const [maps, seen, open, last] = await Promise.all([
      this.prisma.biometricUser.findMany({
        where: { organizationId: user.organizationId },
        include: { employee: { select: { employeeCode: true, fullName: true } }, worker: { select: { workerNo: true, name: true } } },
      }),
      this.prisma.biometricPunch.groupBy({ by: ['pin'], where: { organizationId: user.organizationId, date: { gte: since } }, _count: { _all: true } }),
      this.prisma.biometricPunch.groupBy({ by: ['pin'], where: { organizationId: user.organizationId, result: 'UNMATCHED' }, _count: { _all: true } }),
      this.prisma.biometricPunch.groupBy({ by: ['pin'], where: { organizationId: user.organizationId }, _max: { punchedAt: true } }),
    ]);
    const pins = new Set([...maps.map((m) => m.pin), ...last.map((l) => l.pin)]);
    const map = new Map(maps.map((m) => [m.pin, m]));
    const count = (rows: { pin: string; _count: { _all: number } }[]) => new Map(rows.map((r) => [r.pin, r._count._all]));
    const seenN = count(seen);
    const openN = count(open);
    const lastAt = new Map(last.map((l) => [l.pin, l._max.punchedAt]));
    return [...pins]
      .map((pin) => {
        const m = map.get(pin);
        return {
          pin,
          employeeId: m?.employeeId ?? null,
          employeeCode: m?.employee?.employeeCode ?? null,
          employeeName: m?.employee?.fullName ?? null,
          workerId: m?.workerId ?? null,
          workerNo: m?.worker?.workerNo ?? null,
          workerName: m?.worker?.name ?? null,
          punches: seenN.get(pin) ?? 0,
          unmatched: openN.get(pin) ?? 0,
          lastPunchAt: iso(lastAt.get(pin) ?? null),
        };
      })
      .sort((a, b) => Number(!!a.employeeId || !!a.workerId) - Number(!!b.employeeId || !!b.workerId) || a.pin.localeCompare(b.pin, 'en', { numeric: true }));
  }

  /** Match a user number to an employee or a worker (or neither, to clear it); its punches of the last two months are marked again. */
  async matchUser(user: RequestUser, rawPin: string, dto: { employeeId?: string | null; workerId?: string | null }) {
    this.assertManage(user);
    const pin = cleanPin(rawPin);
    if (!pin) throw new BadRequestException('Enter the user number');
    if (dto.employeeId && dto.workerId) throw new BadRequestException('A user number is one person: choose an employee or a worker');
    if (dto.employeeId && !(await this.prisma.employee.findFirst({ where: { id: dto.employeeId, organizationId: user.organizationId }, select: { id: true } }))) throw new BadRequestException('Employee not found');
    if (dto.workerId && !(await this.prisma.worker.findFirst({ where: { id: dto.workerId, organizationId: user.organizationId }, select: { id: true } }))) throw new BadRequestException('Worker not found');
    const taken = dto.employeeId || dto.workerId ? await this.prisma.biometricUser.findFirst({ where: { organizationId: user.organizationId, pin: { not: pin }, ...(dto.employeeId ? { employeeId: dto.employeeId } : { workerId: dto.workerId }) } }) : null;
    if (taken) throw new BadRequestException(`They already have user number ${taken.pin}. Clear that one first, or enrol them under it on the device.`);
    if (!dto.employeeId && !dto.workerId) await this.prisma.biometricUser.deleteMany({ where: { organizationId: user.organizationId, pin } });
    else
      await this.prisma.biometricUser.upsert({
        where: { organizationId_pin: { organizationId: user.organizationId, pin } },
        create: { organizationId: user.organizationId, pin, employeeId: dto.employeeId ?? null, workerId: dto.workerId ?? null },
        update: { employeeId: dto.employeeId ?? null, workerId: dto.workerId ?? null },
      });
    await this.audit.log(user, 'BIOMETRIC_USER', pin, 'UPDATED', dto.employeeId ? `Matched to employee ${dto.employeeId}` : dto.workerId ? `Matched to worker ${dto.workerId}` : 'Cleared');
    const marked = await this.reapply(user.organizationId, [pin], parseDate(addDays(todayIn(), -REMATCH_DAYS)));
    return { pin, marked };
  }

  /** Match every unmatched user number that reads as an active employee's code number (EMP-014 is 14), or else a worker's. */
  async matchByCode(user: RequestUser) {
    this.assertManage(user);
    const org = user.organizationId;
    const [maps, pins, employees, workers] = await Promise.all([
      this.prisma.biometricUser.findMany({ where: { organizationId: org }, select: { pin: true, employeeId: true, workerId: true } }),
      this.prisma.biometricPunch.findMany({ where: { organizationId: org, result: 'UNMATCHED' }, distinct: ['pin'], select: { pin: true } }),
      this.prisma.employee.findMany({ where: { organizationId: org, isActive: true }, select: { id: true, employeeCode: true } }),
      this.prisma.worker.findMany({ where: { organizationId: org, isActive: true }, select: { id: true, workerNo: true } }),
    ]);
    const mapped = new Set(maps.map((m) => m.pin));
    const taken = new Set(maps.flatMap((m) => [m.employeeId, m.workerId]).filter(Boolean));
    const byCode = (rows: { id: string; code: string }[]) => {
      const out = new Map<string, string | null>();
      for (const r of rows) {
        const n = codeNumber(r.code);
        if (n) out.set(n, out.has(n) ? null : r.id);
      }
      return out;
    };
    const emp = byCode(employees.map((e) => ({ id: e.id, code: e.employeeCode })));
    const wrk = byCode(workers.map((w) => ({ id: w.id, code: w.workerNo })));
    const made: { pin: string; employeeId: string | null; workerId: string | null }[] = [];
    for (const { pin } of pins) {
      if (mapped.has(pin)) continue;
      const e = emp.get(pin);
      const w = e ? null : wrk.get(pin);
      if (e && !taken.has(e)) made.push({ pin, employeeId: e, workerId: null });
      else if (w && !taken.has(w)) made.push({ pin, employeeId: null, workerId: w });
    }
    if (made.length) {
      await this.prisma.biometricUser.createMany({ data: made.map((m) => ({ organizationId: org, ...m })), skipDuplicates: true });
      await this.audit.log(user, 'BIOMETRIC_USER', 'match-by-code', 'UPDATED', `${made.length} user numbers matched by code`);
    }
    const marked = made.length ? await this.reapply(org, made.map((m) => m.pin), parseDate(addDays(todayIn(), -REMATCH_DAYS))) : 0;
    return { matched: made.length, marked };
  }

  /* ---------- punches ---------- */

  async punches(user: RequestUser, q: PunchQuery): Promise<BiometricPunchDto[]> {
    this.assertManage(user);
    const where: Prisma.BiometricPunchWhereInput = { organizationId: user.organizationId, date: parseDate(q.date ?? todayIn()) };
    if (q.deviceId) where.deviceId = q.deviceId;
    if (q.result) where.result = q.result;
    if (q.pin) where.pin = cleanPin(q.pin);
    const [rows, maps] = await Promise.all([
      this.prisma.biometricPunch.findMany({ where, include: { device: { select: { name: true } } }, orderBy: [{ punchedAt: 'desc' }, { id: 'asc' }], take: 1000 }),
      this.prisma.biometricUser.findMany({ where: { organizationId: user.organizationId }, include: { employee: { select: { employeeCode: true, fullName: true } }, worker: { select: { workerNo: true, name: true } } } }),
    ]);
    const who = new Map(maps.map((m) => [m.pin, m.employee ? { name: m.employee.fullName, code: m.employee.employeeCode } : m.worker ? { name: m.worker.name, code: m.worker.workerNo } : null]));
    return rows.map((p) => ({
      id: p.id,
      deviceId: p.deviceId,
      deviceName: p.device.name,
      pin: p.pin,
      personName: who.get(p.pin)?.name ?? null,
      personCode: who.get(p.pin)?.code ?? null,
      date: dateOnly(p.date)!,
      time: p.time,
      result: p.result,
      note: p.note,
    }));
  }

  /** A punch file from the device or its software, for a device registered for it. */
  async importFile(user: RequestUser, dto: ImportPunchesDto): Promise<BiometricIngestResultDto> {
    this.assertManage(user);
    const d = await this.deviceFor(user, dto.deviceId);
    const { punches, errors } = parsePunchFile(dto.text);
    if (!punches.length) throw new BadRequestException(errors[0] ?? 'No punches in the file. It needs a user number and a date and time on each line.');
    const result = await this.ingest(d, punches);
    await this.audit.log(user, 'BIOMETRIC_DEVICE', d.id, 'IMPORTED', `${result.added} new punches of ${result.received}`);
    return { ...result, errors };
  }

  /* ---------- what devices send (no login) ---------- */

  /** An ADMS device by its serial number, when registered and switched on; it is marked as seen. */
  async admsDevice(serialNo: string | undefined) {
    const sn = serialNo?.trim().toUpperCase();
    const d = sn ? await withoutTenant(() => this.prisma.biometricDevice.findUnique({ where: { serialNo: sn }, include: { project: { select: { name: true } } } })) : null;
    if (!d || !d.isActive || d.protocol !== 'ADMS') throw new UnauthorizedException('Unknown device');
    setTenant(d.organizationId);
    await this.prisma.biometricDevice.update({ where: { id: d.id }, data: { lastSeenAt: new Date() } });
    return d;
  }

  /** The ATTLOG table an ADMS device uploads. */
  async admsAttlog(d: Device, body: string) {
    return this.ingest(d, parseAdmsAttlog(body));
  }

  /** Punches posted as JSON with the device's key. */
  async webhook(key: string | undefined, dto: WebhookPunchesDto): Promise<BiometricIngestResultDto> {
    const d = key ? await withoutTenant(() => this.prisma.biometricDevice.findUnique({ where: { apiKey: key }, include: { project: { select: { name: true } } } })) : null;
    if (!d || !d.isActive || d.protocol !== 'WEBHOOK') throw new UnauthorizedException('Unknown device key. Copy the key from the device in Biometric devices.');
    setTenant(d.organizationId);
    await this.prisma.biometricDevice.update({ where: { id: d.id }, data: { lastSeenAt: new Date() } });
    const punches: RawPunch[] = [];
    const errors: string[] = [];
    dto.punches.forEach((p, i) => {
      const local = webhookLocal(p.time, d.utcOffsetMin);
      const pin = cleanPin(String(p.pin));
      if (local && pin) punches.push({ pin, local });
      else errors.push(`Punch ${i + 1}: ${pin ? `the time "${p.time}" does not read; send YYYY-MM-DDTHH:mm:ss` : 'no user number'}`);
    });
    return { ...(await this.ingest(d, punches)), errors };
  }

  /* ---------- turning punches into attendance ---------- */

  /** Keep each punch once, then mark the days they fall on. */
  private async ingest(d: Pick<Device, 'id' | 'organizationId' | 'utcOffsetMin'>, raw: RawPunch[]): Promise<BiometricIngestResultDto> {
    const today = todayIn();
    const rows = raw
      .filter((p) => p.local.slice(0, 10) <= today)
      .map((p) => ({ organizationId: d.organizationId, deviceId: d.id, pin: p.pin, punchedAt: localToUtc(p.local, d.utcOffsetMin), date: parseDate(p.local.slice(0, 10)), time: p.local.slice(11, 16), result: 'UNMATCHED' as const }));
    const added = rows.length ? (await this.prisma.biometricPunch.createMany({ data: rows, skipDuplicates: true })).count : 0;
    if (added) {
      const latest = rows.reduce((m, r) => (r.punchedAt > m ? r.punchedAt : m), rows[0].punchedAt);
      await this.prisma.biometricDevice.update({ where: { id: d.id }, data: { lastPunchAt: latest } });
    }
    const days = new Map<string, { pin: string; date: Date }>();
    for (const r of rows) days.set(`${r.pin}|${dateOnly(r.date)}`, { pin: r.pin, date: r.date });
    const results = { APPLIED: 0, UNMATCHED: 0, LOCKED: 0, SKIPPED: 0 };
    for (const { pin, date } of days.values()) {
      const r = await this.applyDay(d.organizationId, pin, date);
      results[r.result] += r.count;
    }
    return { received: raw.length, added, duplicates: rows.length - added, applied: results.APPLIED, unmatched: results.UNMATCHED, notMarked: results.LOCKED + results.SKIPPED, errors: [] };
  }

  /** Mark again every day these user numbers punched since `from`; returns how many days were marked. */
  private async reapply(organizationId: string, pins: string[], from: Date) {
    const days = await this.prisma.biometricPunch.findMany({ where: { organizationId, pin: { in: pins }, date: { gte: from } }, distinct: ['pin', 'date'], select: { pin: true, date: true } });
    let marked = 0;
    for (const k of days) if ((await this.applyDay(organizationId, k.pin, k.date)).result === 'APPLIED') marked++;
    return marked;
  }

  /**
   * One user number's day: every punch on every device of the company, in at the first and out at the last. An employee's
   * check-in and check-out are set (overtime past a standard day waits for approval, as from the app); a worker is marked
   * at the device's site and the day's head count follows.
   */
  private async applyDay(organizationId: string, pin: string, date: Date): Promise<{ result: BiometricPunchResult; count: number }> {
    const punches = await this.prisma.biometricPunch.findMany({
      where: { organizationId, pin, date },
      include: { device: { select: { id: true, projectId: true, createdById: true } } },
      orderBy: { punchedAt: 'asc' },
    });
    const set = async (result: BiometricPunchResult, note: string | null = null) => {
      await this.prisma.biometricPunch.updateMany({ where: { id: { in: punches.map((p) => p.id) } }, data: { result, note } });
      return { result, count: punches.length };
    };
    if (!punches.length) return { result: 'SKIPPED', count: 0 };
    const map = await this.prisma.biometricUser.findUnique({
      where: { organizationId_pin: { organizationId, pin } },
      include: { employee: { select: { id: true, isActive: true, leftOn: true, projectId: true } }, worker: { select: { id: true, name: true } } },
    });
    if (!map?.employee && !map?.worker) return set('UNMATCHED');
    const first = punches[0];
    const by = { id: first.device.createdById, organizationId };

    if (map.employee) {
      const e = map.employee;
      if (e.leftOn && e.leftOn < date) return set('SKIPPED', 'Left before this day');
      const day = dayFromPunches(punches.map((p) => `${p.time}:00`), STANDARD_DAY_HOURS);
      const checkIn = first.punchedAt;
      const last = punches[punches.length - 1].punchedAt;
      const checkOut = day.outTime ? last : null;
      const cur = await this.prisma.staffAttendance.findUnique({ where: { employeeId_date: { employeeId: e.id, date } } });
      const inAt = cur?.checkIn && cur.checkIn < checkIn ? cur.checkIn : checkIn;
      const outAt = checkOut && (!cur?.checkOut || cur.checkOut < checkOut) ? checkOut : cur?.checkOut ?? null;
      const ot = overtimeHours(inAt.toISOString(), outAt?.toISOString() ?? null);
      const sameOt = cur && Number(cur.overtimeHours ?? 0) === Number(ot ?? 0);
      const hours = outAt ? (outAt.getTime() - inAt.getTime()) / 3_600_000 : null;
      const data = {
        checkIn: inAt,
        checkOut: outAt,
        status: hours !== null && hours < STANDARD_DAY_HOURS / 2 ? ('HALF_DAY' as const) : ('PRESENT' as const),
        overtimeHours: ot,
        ...(sameOt ? {} : { overtimeStatus: ot ? ('PENDING' as const) : null, overtimeDecidedById: null, overtimeDecidedAt: null }),
        biometricDeviceId: first.device.id,
      };
      if (cur) await this.prisma.staffAttendance.update({ where: { id: cur.id }, data });
      else await this.prisma.staffAttendance.create({ data: { organizationId, employeeId: e.id, date, projectId: first.device.projectId ?? e.projectId, markedById: by.id, ...data } });
      return set('APPLIED');
    }

    const w = map.worker!;
    const projectId = punches.find((p) => p.device.projectId)?.device.projectId;
    if (!projectId) return set('SKIPPED', 'The device has no site, so a worker cannot be marked from it');
    const elsewhere = await this.prisma.workerAttendance.findFirst({ where: { workerId: w.id, date, projectId: { not: projectId } }, select: { project: { select: { name: true } } } });
    if (elsewhere) return set('SKIPPED', `Already marked at ${elsewhere.project.name}`);
    try {
      await this.attendance.assertUnlocked(projectId, date);
    } catch {
      return set('LOCKED', 'The DPR for the day is approved');
    }
    const day = dayFromPunches(punches.map((p) => `${p.time}:00`), WORKER_SHIFT_HOURS);
    const inTime = day.inTime.slice(0, 5);
    const outTime = day.outTime?.slice(0, 5) ?? null;
    const ot = workerOvertime(inTime, outTime);
    const data = { status: day.status, inTime, outTime, otHours: ot || null, biometricDeviceId: first.device.id };
    await this.prisma.$transaction(
      async (tx) => {
        await tx.workerAttendance.upsert({
          where: { workerId_date: { workerId: w.id, date } },
          create: { organizationId, workerId: w.id, projectId, date, markedById: by.id, ...data },
          update: data,
        });
        await this.workers.recountHeadCount(tx, by, projectId, date);
      },
      { timeout: 30_000 },
    );
    return set('APPLIED');
  }
}

const newKey = () => `bio_${randomBytes(24).toString('base64url')}`;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
