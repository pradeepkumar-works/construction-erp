import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  SHIFT_HOURS,
  canIssueFuel,
  canRecordEquipmentParts,
  canViewCost,
  meterUnit,
  type EquipmentPartDto,
  type EquipmentPartsDto,
  type FleetUtilisationDto,
  type FuelIssueDto,
  type FuelPositionDto,
  type FuelPositionRowDto,
  type UtilisationGroupDto,
  type UtilisationRowDto,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { dateOnly, dec, money, parseDate } from '../common/serialize';
import { todayIn } from '../notifications/time';
import { FleetPeriodQuery, FuelIssuesQuery, FuelPositionQuery, SaveEquipmentPartDto, UpdateEquipmentPartDto } from './machinery.dto';

type Decimal = Prisma.Decimal;
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const ZERO = D(0);
const DAY = 24 * 3600 * 1000;
const decOrNull = (v: string | null | undefined) => (v === undefined ? undefined : v === null || v === '' ? null : D(v));
/** worked ÷ available in %, one decimal */
const share = (part: Decimal, whole: Decimal) => (whole.gt(0) ? Math.round(part.div(whole).mul(1000).toNumber()) / 10 : null);

const issueInclude = {
  project: { select: { id: true } },
  equipment: { select: { code: true, name: true } },
  lines: { select: { quantity: true, item: { select: { name: true, unit: true } } } },
  createdBy: { select: { fullName: true } },
} satisfies Prisma.StockEntryInclude;
type IssueRow = Prisma.StockEntryGetPayload<{ include: typeof issueInclude }>;

const partInclude = {
  maintenanceJob: { select: { jobNo: true } },
  stockEntry: { select: { entryNo: true } },
  createdBy: { select: { fullName: true } },
} satisfies Prisma.EquipmentPartInclude;
type PartRow = Prisma.EquipmentPartGetPayload<{ include: typeof partInclude }>;

/**
 * Fuel and fleet use (v5 item 93): each site's daily fuel position and the fuel issued into machines (stock entries of
 * fuel items with `equipmentId`), utilisation from the approved logs, and the tyres and batteries on each machine. The
 * fuel issue itself is `StockService.fuelIssue`, so it keeps the store's lock, numbering and stock checks.
 */
@Injectable()
export class FleetService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
  ) {}

  /* ---------- fuel ---------- */

  private toIssue(e: IssueRow): FuelIssueDto {
    const line = e.lines[0];
    return {
      entryId: e.id,
      entryNo: e.entryNo,
      date: dateOnly(e.date)!,
      projectId: e.projectId,
      equipmentId: e.equipmentId,
      equipmentCode: e.equipment?.code ?? null,
      equipmentName: e.equipment?.name ?? null,
      itemName: line?.item.name ?? '',
      unit: line?.item.unit ?? '',
      litres: dec(e.lines.reduce((s, l) => s.sub(l.quantity), ZERO))!,
      meterReading: dec(e.meterReading),
      issuedTo: e.issuedTo,
      createdByName: e.createdBy.fullName,
    };
  }

  /** GET /fleet/fuel-position: opening, in, out and closing of each fuel item at each site on a day, and its issues into machines. */
  async fuelPosition(user: RequestUser, q: FuelPositionQuery): Promise<FuelPositionDto> {
    const date = q.date ?? todayIn();
    const day = parseDate(date);
    if (q.projectId) await this.access.assertCanAccessProject(user, q.projectId);
    const [projects, items] = await Promise.all([
      this.prisma.project.findMany({ where: { ...this.access.projectWhere(user), ...(q.projectId ? { id: q.projectId } : {}) }, select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } }),
      this.prisma.item.findMany({ where: { organizationId: user.organizationId, isFuel: true }, select: { id: true, name: true, unit: true }, orderBy: { name: 'asc' } }),
    ]);
    const canIssue = canIssueFuel(user.roleKey);
    if (!projects.length || !items.length) return { date, rows: [], issues: [], canIssue };
    const where = { projectId: { in: projects.map((p) => p.id) }, itemId: { in: items.map((i) => i.id) } };
    const [before, moves, mins, issues] = await Promise.all([
      this.prisma.stockTxn.groupBy({ by: ['projectId', 'itemId'], where: { ...where, date: { lt: day } }, _sum: { quantity: true } }),
      this.prisma.stockTxn.findMany({ where: { ...where, date: day }, select: { projectId: true, itemId: true, quantity: true, type: true, entry: { select: { equipmentId: true } } } }),
      this.prisma.stockMinLevel.findMany({ where, select: { projectId: true, itemId: true, minQty: true } }),
      this.prisma.stockEntry.findMany({
        where: { projectId: where.projectId, type: 'ISSUE', equipmentId: { not: null }, date: day },
        include: issueInclude,
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const k = (p: string, i: string) => `${p}|${i}`;
    const open = new Map(before.map((b) => [k(b.projectId, b.itemId), b._sum.quantity ?? ZERO]));
    const minOf = new Map(mins.map((m) => [k(m.projectId, m.itemId), m.minQty]));
    const rows: FuelPositionRowDto[] = [];
    for (const p of projects)
      for (const i of items) {
        const opening = open.get(k(p.id, i.id)) ?? ZERO;
        const day = moves.filter((m) => m.projectId === p.id && m.itemId === i.id);
        if (opening.isZero() && !day.length) continue;
        let received = ZERO;
        let toMachines = ZERO;
        let otherOut = ZERO;
        for (const m of day) {
          if (m.quantity.gt(0)) received = received.add(m.quantity);
          else if (m.type === 'ISSUE' && m.entry.equipmentId) toMachines = toMachines.sub(m.quantity);
          else otherOut = otherOut.sub(m.quantity);
        }
        rows.push({
          projectId: p.id,
          projectCode: p.code,
          projectName: p.name,
          itemId: i.id,
          itemName: i.name,
          unit: i.unit,
          opening: dec(opening)!,
          received: dec(received)!,
          issuedToMachines: dec(toMachines)!,
          otherOut: dec(otherOut)!,
          closing: dec(opening.add(received).sub(toMachines).sub(otherOut))!,
          minLevel: dec(minOf.get(k(p.id, i.id))),
        });
      }
    return { date, rows, issues: issues.map((e) => this.toIssue(e)), canIssue };
  }

  /** GET /fleet/fuel-issues: fuel issued into machines over a period, newest first. */
  async fuelIssues(user: RequestUser, q: FuelIssuesQuery): Promise<FuelIssueDto[]> {
    if (q.projectId) await this.access.assertCanAccessProject(user, q.projectId);
    const rows = await this.prisma.stockEntry.findMany({
      where: {
        ...this.access.submissionWhere(user),
        type: 'ISSUE',
        equipmentId: q.equipmentId ?? { not: null },
        ...(q.projectId ? { projectId: q.projectId } : {}),
        date: { gte: parseDate(q.from), lte: parseDate(q.to) },
      },
      include: issueInclude,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
    return rows.map((e) => this.toIssue(e));
  }

  /* ---------- utilisation ---------- */

  /** GET /fleet/utilisation: each machine's approved logs in a period against the shift on the days it was on site. */
  async utilisation(user: RequestUser, q: FleetPeriodQuery): Promise<FleetUtilisationDto> {
    if (q.from && q.to && q.from > q.to) throw new BadRequestException('The period ends before it starts');
    if (q.projectId) await this.access.assertCanAccessProject(user, q.projectId);
    const logs = await this.prisma.machineryLog.findMany({
      where: { ...this.access.submissionWhere(user), status: 'APPROVED', date: { ...(q.from ? { gte: parseDate(q.from) } : {}), ...(q.to ? { lte: parseDate(q.to) } : {}) }, ...(q.projectId ? { projectId: q.projectId } : {}) },
      select: {
        equipmentId: true,
        date: true,
        hoursWorked: true,
        idleHours: true,
        breakdownHours: true,
        dieselLitres: true,
        project: { select: { name: true } },
        equipment: { select: { code: true, name: true, category: true, ownership: true } },
      },
      orderBy: { date: 'asc' },
    });
    const by = new Map<string, typeof logs>();
    for (const l of logs) by.set(l.equipmentId, [...(by.get(l.equipmentId) ?? []), l]);
    const rows: (UtilisationRowDto & { _a: Decimal; _w: Decimal; _i: Decimal; _b: Decimal })[] = [];
    for (const [id, ls] of by) {
      // A day on site is the shift, or the hours logged when the machine ran longer (two shifts, a long pour).
      const perDay = new Map<string, Decimal>();
      for (const l of ls) {
        const d = dateOnly(l.date)!;
        perDay.set(d, (perDay.get(d) ?? ZERO).add(l.hoursWorked).add(l.idleHours).add(l.breakdownHours));
      }
      const days = perDay.size;
      const available = [...perDay.values()].reduce((s, h) => s.add(Prisma.Decimal.max(h, SHIFT_HOURS)), ZERO);
      const worked = ls.reduce((s, l) => s.add(l.hoursWorked), ZERO);
      const idle = ls.reduce((s, l) => s.add(l.idleHours), ZERO);
      const breakdown = ls.reduce((s, l) => s.add(l.breakdownHours), ZERO);
      const fuel = ls.reduce((s, l) => s.add(l.dieselLitres ?? ZERO), ZERO);
      const eq = ls[0].equipment;
      const projectsSeen = [...new Set(ls.map((l) => l.project.name))];
      rows.push({
        equipmentId: id,
        code: eq.code,
        name: eq.name,
        category: eq.category,
        ownership: eq.ownership,
        projectName: projectsSeen.length === 1 ? projectsSeen[0] : `${projectsSeen.length} projects`,
        daysOnSite: days,
        availableHours: dec(available)!,
        workedHours: dec(worked)!,
        idleHours: dec(idle)!,
        breakdownHours: dec(breakdown)!,
        utilisationPct: share(worked, available),
        availabilityPct: share(available.sub(breakdown), available),
        fuelLitres: dec(fuel)!,
        fuelPerHour: worked.gt(0) && fuel.gt(0) ? dec(fuel.div(worked).toDecimalPlaces(2)) : null,
        _a: available,
        _w: worked,
        _i: idle,
        _b: breakdown,
      });
    }
    rows.sort((a, b) => (a.utilisationPct ?? 0) - (b.utilisationPct ?? 0) || a.code.localeCompare(b.code));
    const group = (category: string | null, rs: typeof rows): UtilisationGroupDto => {
      const a = rs.reduce((s, r) => s.add(r._a), ZERO);
      const w = rs.reduce((s, r) => s.add(r._w), ZERO);
      const b = rs.reduce((s, r) => s.add(r._b), ZERO);
      return {
        category,
        machines: rs.length,
        availableHours: dec(a)!,
        workedHours: dec(w)!,
        idleHours: dec(rs.reduce((s, r) => s.add(r._i), ZERO))!,
        breakdownHours: dec(b)!,
        utilisationPct: share(w, a),
        availabilityPct: share(a.sub(b), a),
      };
    };
    const cats = [...new Set(rows.map((r) => r.category ?? 'Other'))].sort();
    return {
      from: q.from ?? null,
      to: q.to ?? null,
      shiftHours: SHIFT_HOURS,
      rows: rows.map(({ _a, _w, _i, _b, ...r }) => r),
      categories: cats.map((c) => group(c, rows.filter((r) => (r.category ?? 'Other') === c))),
      fleet: group(null, rows),
    };
  }

  /* ---------- tyres and batteries ---------- */

  private async machine(user: RequestUser, equipmentId: string) {
    const eq = await this.prisma.equipment.findFirst({ where: { id: equipmentId, organizationId: user.organizationId }, select: { id: true, code: true, name: true, fuelNormUnit: true } });
    if (!eq) throw new NotFoundException('Machine not found');
    return eq;
  }

  /** The machine's latest meter reading: the highest of its logs' closing readings, fuel issues and job cards. */
  private async currentMeter(equipmentId: string): Promise<Decimal | null> {
    const [log, fuel, job] = await Promise.all([
      this.prisma.machineryLog.aggregate({ where: { equipmentId, status: { not: 'REJECTED' } }, _max: { meterEnd: true } }),
      this.prisma.stockEntry.aggregate({ where: { equipmentId }, _max: { meterReading: true } }),
      this.prisma.maintenanceJob.aggregate({ where: { equipmentId }, _max: { meterReading: true } }),
    ]);
    const all = [log._max.meterEnd, fuel._max.meterReading, job._max.meterReading].filter((v): v is Decimal => !!v);
    return all.length ? all.reduce((m, v) => (v.gt(m) ? v : m)) : null;
  }

  private toPart(r: PartRow, current: Decimal | null, cost: boolean, today: string): EquipmentPartDto {
    const end = r.removedMeter ?? (r.removedOn ? null : current);
    const life = r.fittedMeter && end && end.gte(r.fittedMeter) ? end.sub(r.fittedMeter) : null;
    const to = r.removedOn ? r.removedOn.getTime() : parseDate(today).getTime();
    return {
      id: r.id,
      equipmentId: r.equipmentId,
      kind: r.kind,
      position: r.position,
      make: r.make,
      serialNo: r.serialNo,
      fittedOn: dateOnly(r.fittedOn)!,
      fittedMeter: dec(r.fittedMeter),
      removedOn: dateOnly(r.removedOn),
      removedMeter: dec(r.removedMeter),
      removalReason: r.removalReason,
      cost: cost ? money(r.cost) : null,
      maintenanceJobId: r.maintenanceJobId,
      jobNo: r.maintenanceJob?.jobNo ?? null,
      stockEntryId: r.stockEntryId,
      entryNo: r.stockEntry?.entryNo ?? null,
      note: r.note,
      life: dec(life),
      lifeDays: Math.max(0, Math.round((to - r.fittedOn.getTime()) / DAY)),
      createdByName: r.createdBy.fullName,
    };
  }

  /** GET /equipment/:id/parts: the machine's tyres and batteries, on it now first. */
  async parts(user: RequestUser, equipmentId: string): Promise<EquipmentPartsDto> {
    const eq = await this.machine(user, equipmentId);
    const [rows, current] = await Promise.all([
      this.prisma.equipmentPart.findMany({ where: { equipmentId }, include: partInclude, orderBy: [{ removedOn: { sort: 'desc', nulls: 'first' } }, { kind: 'asc' }, { position: 'asc' }, { fittedOn: 'desc' }] }),
      this.currentMeter(equipmentId),
    ]);
    const cost = canViewCost(user.roleKey);
    const today = todayIn();
    return {
      equipmentId,
      code: eq.code,
      name: eq.name,
      currentMeter: dec(current),
      meterUnit: meterUnit(eq.fuelNormUnit),
      parts: rows.map((r) => this.toPart(r, current, cost, today)),
      canEdit: canRecordEquipmentParts(user.roleKey),
      canSeeCost: cost,
    };
  }

  private async partData(user: RequestUser, equipmentId: string, dto: UpdateEquipmentPartDto, current?: PartRow) {
    const fittedOn = dto.fittedOn !== undefined ? parseDate(dto.fittedOn) : current?.fittedOn;
    const removedOn = dto.removedOn !== undefined ? (dto.removedOn ? parseDate(dto.removedOn) : null) : (current?.removedOn ?? null);
    const fittedMeter = decOrNull(dto.fittedMeter) ?? (dto.fittedMeter === undefined ? (current?.fittedMeter ?? null) : null);
    const removedMeter = decOrNull(dto.removedMeter) ?? (dto.removedMeter === undefined ? (current?.removedMeter ?? null) : null);
    const tomorrow = Date.now() + 36 * 3600 * 1000;
    if (!fittedOn) throw new BadRequestException('Enter the date it was fitted');
    if (fittedOn.getTime() > tomorrow) throw new BadRequestException('The fitting date cannot be in the future');
    if (removedOn && removedOn.getTime() > tomorrow) throw new BadRequestException('The removal date cannot be in the future');
    if (removedOn && removedOn < fittedOn) throw new BadRequestException('It cannot come off before it was fitted');
    if (removedMeter && !removedOn) throw new BadRequestException('Enter the date it came off with its meter reading');
    if (fittedMeter && removedMeter && removedMeter.lt(fittedMeter)) throw new BadRequestException('The meter when it came off is below the meter when it was fitted');
    for (const [v, what] of [
      [fittedMeter, 'meter'],
      [removedMeter, 'meter'],
      [decOrNull(dto.cost), 'cost'],
    ] as const)
      if (v && v.isNegative()) throw new BadRequestException(`The ${what} cannot be negative`);
    if (dto.maintenanceJobId) {
      const job = await this.prisma.maintenanceJob.findFirst({ where: { id: dto.maintenanceJobId, equipmentId }, select: { id: true } });
      if (!job) throw new BadRequestException("The job card is not this machine's");
    }
    if (dto.stockEntryId) {
      const entry = await this.prisma.stockEntry.findFirst({ where: { id: dto.stockEntryId, organizationId: user.organizationId }, select: { id: true } });
      if (!entry) throw new BadRequestException('The store entry was not found');
    }
    const text = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null);
    return {
      ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
      position: text(dto.position),
      make: text(dto.make),
      serialNo: text(dto.serialNo),
      fittedOn,
      fittedMeter,
      removedOn,
      removedMeter,
      removalReason: text(dto.removalReason),
      cost: decOrNull(dto.cost)?.toDecimalPlaces(2),
      maintenanceJobId: dto.maintenanceJobId,
      stockEntryId: dto.stockEntryId,
      note: text(dto.note),
    };
  }

  async addPart(user: RequestUser, equipmentId: string, dto: SaveEquipmentPartDto): Promise<EquipmentPartsDto> {
    const eq = await this.machine(user, equipmentId);
    await this.access.assertCanManageMaintenance(user, null);
    const data = await this.partData(user, equipmentId, dto);
    await this.prisma.equipmentPart.create({
      data: { ...data, kind: dto.kind, fittedOn: data.fittedOn, organizationId: user.organizationId, equipmentId, createdById: user.id },
      select: { id: true },
    });
    await this.audit.log(user, 'EQUIPMENT', equipmentId, 'UPDATED', `${dto.kind === 'TYRE' ? 'Tyre' : 'Battery'} fitted to ${eq.code}${dto.position ? ` (${dto.position})` : ''}`);
    return this.parts(user, equipmentId);
  }

  async updatePart(user: RequestUser, equipmentId: string, partId: string, dto: UpdateEquipmentPartDto): Promise<EquipmentPartsDto> {
    const eq = await this.machine(user, equipmentId);
    await this.access.assertCanManageMaintenance(user, null);
    const current = await this.prisma.equipmentPart.findFirst({ where: { id: partId, equipmentId }, include: partInclude });
    if (!current) throw new NotFoundException('Part not found');
    const data = await this.partData(user, equipmentId, dto, current);
    await this.prisma.equipmentPart.update({ where: { id: partId }, data });
    const removed = !current.removedOn && data.removedOn;
    await this.audit.log(user, 'EQUIPMENT', equipmentId, 'UPDATED', `${current.kind === 'TYRE' ? 'Tyre' : 'Battery'}${current.position ? ` (${current.position})` : ''} on ${eq.code} ${removed ? 'removed' : 'changed'}`);
    return this.parts(user, equipmentId);
  }

  async removePart(user: RequestUser, equipmentId: string, partId: string): Promise<EquipmentPartsDto> {
    const eq = await this.machine(user, equipmentId);
    await this.access.assertCanManageMaintenance(user, null);
    const current = await this.prisma.equipmentPart.findFirst({ where: { id: partId, equipmentId }, select: { kind: true, position: true } });
    if (!current) throw new NotFoundException('Part not found');
    await this.prisma.equipmentPart.delete({ where: { id: partId } });
    await this.audit.log(user, 'EQUIPMENT', equipmentId, 'UPDATED', `${current.kind === 'TYRE' ? 'Tyre' : 'Battery'}${current.position ? ` (${current.position})` : ''} deleted from ${eq.code}`);
    return this.parts(user, equipmentId);
  }
}
