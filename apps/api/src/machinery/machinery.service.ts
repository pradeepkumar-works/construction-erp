import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  canManageEquipment,
  canManageMachineLoans,
  machineryLogProblem,
  type EquipmentDto,
  type EquipmentSortField,
  type MachineryLogDto,
  type MachineryLogSortField,
  type Paginated,
  type SortOrder,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { SubmissionLifecycleService } from '../common/submission-lifecycle.service';
import { VendorsService } from '../vendors/vendors.service';
import { AttachmentsService, ATTACHMENT_FIELDS } from '../common/attachments.service';
import { dateOnly, dec, iso, money, parseDate } from '../common/serialize';
import { isUniqueViolation } from '../common/idempotency';
import { ilike, pageArgs, paginated, searchWords } from '../common/paging';
import { CreateEquipmentDto, CreateMachineryLogDto, ListEquipmentQuery, ListMachineryLogsQuery, UpdateEquipmentDto, UpdateMachineryLogDto } from './machinery.dto';

type Tx = Prisma.TransactionClient;

const logInclude = {
  project: { select: { name: true } },
  equipment: { select: { code: true, name: true, ownership: true } },
  activity: { select: { name: true } },
  vendorBill: { select: { billNo: true } },
  submittedBy: { select: { fullName: true } },
  reviewedBy: { select: { fullName: true } },
  attachments: { select: ATTACHMENT_FIELDS },
} satisfies Prisma.MachineryLogInclude;
type LogRow = Prisma.MachineryLogGetPayload<{ include: typeof logInclude }>;

const equipmentInclude = {
  project: { select: { name: true } },
  logs: { where: { status: { not: 'REJECTED' } }, select: { date: true }, orderBy: { date: 'desc' }, take: 1 },
  loans: { where: { status: 'ACTIVE' }, select: { id: true, lenderName: true }, orderBy: { sanctionDate: 'desc' }, take: 1 },
} satisfies Prisma.EquipmentInclude;
type EquipmentRow = Prisma.EquipmentGetPayload<{ include: typeof equipmentInclude }>;

const LOG_ORDER: Record<MachineryLogSortField, (o: SortOrder) => Prisma.MachineryLogOrderByWithRelationInput[]> = {
  date: (o) => [{ date: o }, { createdAt: o }],
  createdAt: (o) => [{ createdAt: o }],
  submittedAt: (o) => [{ submittedAt: { sort: o, nulls: 'last' } }],
  hoursWorked: (o) => [{ hoursWorked: o }],
  status: (o) => [{ status: o }, { date: 'desc' }],
  project: (o) => [{ project: { name: o } }, { date: 'desc' }],
  equipment: (o) => [{ equipment: { code: o } }, { date: 'desc' }],
  submittedBy: (o) => [{ submittedBy: { fullName: o } }, { date: 'desc' }],
};
const LOG_DESC_DEFAULT = new Set<string>(['date', 'createdAt', 'submittedAt', 'hoursWorked']);

const EQUIPMENT_ORDER: Record<EquipmentSortField, (o: SortOrder) => Prisma.EquipmentOrderByWithRelationInput[]> = {
  code: (o) => [{ code: o }],
  name: (o) => [{ name: o }],
  category: (o) => [{ category: { sort: o, nulls: 'last' } }, { code: 'asc' }],
  ownership: (o) => [{ ownership: o }, { code: 'asc' }],
  project: (o) => [{ project: { name: o } }, { code: 'asc' }],
  createdAt: (o) => [{ createdAt: o }],
};

const decimalOrNull = (v: string | null | undefined) => (v === null || v === undefined || v === '' ? null : new Prisma.Decimal(v));

/**
 * Equipment master and the daily machinery log. A log is a site submission (approval lifecycle, audit, notifications)
 * with one rule of its own: a machine has at most one log per day that is not rejected.
 */
@Injectable()
export class MachineryService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private lifecycle: SubmissionLifecycleService,
    private attachments: AttachmentsService,
    private vendors: VendorsService,
  ) {}

  /* ---------- equipment ---------- */

  toEquipmentDto(user: RequestUser, r: EquipmentRow): EquipmentDto {
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      category: r.category,
      ownership: r.ownership,
      supplier: r.supplier,
      vendorId: r.vendorId,
      registrationNo: r.registrationNo,
      rate: canManageEquipment(user.roleKey) ? money(r.rate) : null,
      rateUnit: r.rateUnit,
      hireMinHours: dec(r.hireMinHours),
      hireFuelBy: r.hireFuelBy,
      hireOperator: r.hireOperator,
      projectId: r.projectId,
      projectName: r.project?.name ?? null,
      isActive: r.isActive,
      lastLogDate: dateOnly(r.logs[0]?.date),
      serviceIntervalHours: dec(r.serviceIntervalHours),
      serviceIntervalDays: r.serviceIntervalDays,
      lastServiceDate: dateOnly(r.lastServiceDate),
      lastServiceMeter: dec(r.lastServiceMeter),
      fuelNorm: dec(r.fuelNorm),
      fuelNormUnit: r.fuelNormUnit,
      fuelTolerancePct: dec(r.fuelTolerancePct),
      // Machine finance (v6 item 108): only those who keep the loans see that a machine is financed.
      loan: canManageMachineLoans(user.roleKey) && r.loans[0] ? { id: r.loans[0].id, lenderName: r.loans[0].lenderName } : null,
      createdAt: iso(r.createdAt)!,
    };
  }

  async listEquipment(user: RequestUser, q: ListEquipmentQuery): Promise<Paginated<EquipmentDto>> {
    const where: Prisma.EquipmentWhereInput = { organizationId: user.organizationId };
    if (!q.includeInactive) where.isActive = true;
    if (q.projectId) where.projectId = q.projectId;
    if (q.ownership) where.ownership = q.ownership;
    const words = searchWords(q.q);
    if (words.length)
      where.AND = words.map((w) => ({
        OR: [{ code: ilike(w) }, { name: ilike(w) }, { category: ilike(w) }, { supplier: ilike(w) }, { registrationNo: ilike(w) }],
      }));
    const sortBy = q.sortBy ?? 'code';
    const order = q.sortOrder ?? (sortBy === 'createdAt' ? 'desc' : 'asc');
    const args = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.equipment.findMany({ where, include: equipmentInclude, orderBy: [...EQUIPMENT_ORDER[sortBy](order), { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.equipment.count({ where }),
    ]);
    return paginated(rows.map((r) => this.toEquipmentDto(user, r)), total, args);
  }

  async getEquipment(user: RequestUser, id: string): Promise<EquipmentDto> {
    const row = await this.prisma.equipment.findFirst({ where: { id, organizationId: user.organizationId }, include: equipmentInclude });
    if (!row) throw new NotFoundException('Equipment not found');
    return this.toEquipmentDto(user, row);
  }

  private async equipmentData(user: RequestUser, dto: UpdateEquipmentDto): Promise<Prisma.EquipmentUncheckedUpdateInput> {
    const data: Prisma.EquipmentUncheckedUpdateInput = {};
    if (dto.code !== undefined) data.code = dto.code.toUpperCase();
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.category !== undefined) data.category = dto.category || null;
    if (dto.ownership !== undefined) data.ownership = dto.ownership;
    const vendor = await this.vendors.resolve(user, dto.vendorId, dto.supplier);
    if (vendor) Object.assign(data, { supplier: vendor.name, vendorId: vendor.vendorId });
    if (dto.registrationNo !== undefined) data.registrationNo = dto.registrationNo || null;
    if (dto.rate !== undefined) {
      const rate = decimalOrNull(dto.rate);
      if (rate && rate.lt(0)) throw new BadRequestException('Rate cannot be negative');
      data.rate = rate;
    }
    if (dto.rateUnit !== undefined) data.rateUnit = dto.rateUnit;
    if (dto.hireMinHours !== undefined) {
      const h = decimalOrNull(dto.hireMinHours);
      if (h && h.lt(0)) throw new BadRequestException('Minimum hours cannot be negative');
      data.hireMinHours = h && h.isZero() ? null : h;
    }
    if (dto.hireFuelBy !== undefined) data.hireFuelBy = dto.hireFuelBy;
    if (dto.hireOperator !== undefined) data.hireOperator = dto.hireOperator;
    if (dto.projectId !== undefined) {
      if (dto.projectId) await this.access.assertCanAccessProject(user, dto.projectId);
      data.projectId = dto.projectId;
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.serviceIntervalHours !== undefined) {
      const h = decimalOrNull(dto.serviceIntervalHours);
      if (h && h.lte(0)) throw new BadRequestException('Service interval must be more than 0 hours');
      data.serviceIntervalHours = h;
    }
    if (dto.serviceIntervalDays !== undefined) data.serviceIntervalDays = dto.serviceIntervalDays;
    if (dto.lastServiceDate !== undefined) {
      if (dto.lastServiceDate && parseDate(dto.lastServiceDate).getTime() > Date.now() + 36 * 3600 * 1000) throw new BadRequestException('The last service date cannot be in the future');
      data.lastServiceDate = dto.lastServiceDate ? parseDate(dto.lastServiceDate) : null;
    }
    if (dto.lastServiceMeter !== undefined) data.lastServiceMeter = decimalOrNull(dto.lastServiceMeter);
    if (dto.fuelNorm !== undefined) {
      const norm = decimalOrNull(dto.fuelNorm);
      if (norm && norm.lte(0)) throw new BadRequestException('The fuel norm must be more than 0');
      data.fuelNorm = norm;
    }
    if (dto.fuelNormUnit !== undefined) data.fuelNormUnit = dto.fuelNormUnit;
    if (dto.fuelTolerancePct !== undefined) {
      const t = decimalOrNull(dto.fuelTolerancePct);
      if (t && (t.lte(0) || t.gt(100))) throw new BadRequestException('The tolerance is a % from 1 to 100');
      data.fuelTolerancePct = t;
    }
    if ((dto.fuelNorm ?? null) !== null && dto.fuelNormUnit === null) throw new BadRequestException('Say whether the fuel norm is litres an hour or km a litre');
    return data;
  }

  async createEquipment(user: RequestUser, dto: CreateEquipmentDto): Promise<EquipmentDto> {
    this.access.assertCanManageEquipment(user);
    const data = await this.equipmentData(user, dto);
    try {
      const row = await this.prisma.equipment.create({
        data: { ...(data as Prisma.EquipmentUncheckedCreateInput), organizationId: user.organizationId, code: dto.code.toUpperCase(), name: dto.name },
        select: { id: true },
      });
      await this.audit.log(user, 'EQUIPMENT', row.id, 'CREATED');
      return this.getEquipment(user, row.id);
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(`Equipment code ${dto.code.toUpperCase()} is already used`);
      throw e;
    }
  }

  async updateEquipment(user: RequestUser, id: string, dto: UpdateEquipmentDto): Promise<EquipmentDto> {
    this.access.assertCanManageEquipment(user);
    await this.getEquipment(user, id);
    const data = await this.equipmentData(user, dto);
    try {
      await this.prisma.equipment.update({ where: { id }, data });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(`Equipment code ${String(data.code)} is already used`);
      throw e;
    }
    await this.audit.log(user, 'EQUIPMENT', id, 'UPDATED');
    return this.getEquipment(user, id);
  }

  /** Only machines that were never logged can be deleted; otherwise deactivate them. */
  async removeEquipment(user: RequestUser, id: string) {
    this.access.assertCanManageEquipment(user);
    await this.getEquipment(user, id);
    const logs = await this.prisma.machineryLog.count({ where: { equipmentId: id } });
    if (logs > 0) throw new ConflictException(`This machine has ${logs} log(s); mark it inactive instead of deleting it`);
    await this.prisma.equipment.delete({ where: { id } });
    await this.audit.log(user, 'EQUIPMENT', id, 'DELETED');
    return { ok: true };
  }

  /* ---------- logs ---------- */

  /** Fuel issued from the store into each log's machine on its day (v5 item 93), by log id. */
  private async fuelIssued(rows: LogRow[]): Promise<Map<string, string>> {
    if (!rows.length) return new Map();
    const entries = await this.prisma.stockEntry.findMany({
      where: { type: 'ISSUE', equipmentId: { in: [...new Set(rows.map((r) => r.equipmentId))] }, date: { in: [...new Set(rows.map((r) => r.date.getTime()))].map((t) => new Date(t)) } },
      select: { equipmentId: true, date: true, lines: { select: { quantity: true } } },
    });
    const sum = new Map<string, Prisma.Decimal>();
    for (const e of entries) {
      const k = `${e.equipmentId}|${e.date.getTime()}`;
      sum.set(k, e.lines.reduce((s, l) => s.sub(l.quantity), sum.get(k) ?? new Prisma.Decimal(0)));
    }
    const out = new Map<string, string>();
    for (const r of rows) {
      const v = sum.get(`${r.equipmentId}|${r.date.getTime()}`);
      if (v) out.set(r.id, dec(v)!);
    }
    return out;
  }

  toDto(r: LogRow, fuelIssued?: Map<string, string>): MachineryLogDto {
    return {
      id: r.id,
      projectId: r.projectId,
      projectName: r.project.name,
      equipmentId: r.equipmentId,
      equipmentCode: r.equipment.code,
      equipmentName: r.equipment.name,
      ownership: r.equipment.ownership,
      date: dateOnly(r.date)!,
      hoursWorked: dec(r.hoursWorked)!,
      idleHours: dec(r.idleHours)!,
      breakdownHours: dec(r.breakdownHours)!,
      dieselLitres: dec(r.dieselLitres),
      fuelIssuedLitres: fuelIssued?.get(r.id) ?? null,
      meterStart: dec(r.meterStart),
      meterEnd: dec(r.meterEnd),
      operatorName: r.operatorName,
      activityId: r.activityId,
      activityName: r.activity?.name ?? null,
      workDone: r.workDone,
      breakdownNote: r.breakdownNote,
      remarks: r.remarks,
      vendorBillId: r.vendorBillId,
      vendorBillNo: r.vendorBill?.billNo ?? null,
      status: r.status,
      submittedById: r.submittedById,
      submittedByName: r.submittedBy.fullName,
      submittedAt: iso(r.submittedAt),
      reviewedById: r.reviewedById,
      reviewedByName: r.reviewedBy?.fullName ?? null,
      reviewedAt: iso(r.reviewedAt),
      reviewNote: r.reviewNote,
      attachments: r.attachments.map((a) => this.attachments.toDto(a)),
      createdAt: iso(r.createdAt)!,
      updatedAt: iso(r.updatedAt)!,
    };
  }

  async list(user: RequestUser, q: ListMachineryLogsQuery): Promise<Paginated<MachineryLogDto>> {
    const where: Prisma.MachineryLogWhereInput = { ...this.access.submissionWhere(user) };
    if (q.projectId) where.projectId = q.projectId;
    if (q.equipmentId) where.equipmentId = q.equipmentId;
    if (q.status) where.status = q.status;
    if (q.mine) where.submittedById = user.id;
    if (q.breakdownOnly) where.breakdownHours = { gt: 0 };
    if (q.from || q.to) where.date = { ...(q.from ? { gte: parseDate(q.from) } : {}), ...(q.to ? { lte: parseDate(q.to) } : {}) };
    const words = searchWords(q.q);
    if (words.length)
      where.AND = words.map((w) => ({
        OR: [
          { equipment: { code: ilike(w) } },
          { equipment: { name: ilike(w) } },
          { operatorName: ilike(w) },
          { workDone: ilike(w) },
          { project: { name: ilike(w) } },
          { submittedBy: { fullName: ilike(w) } },
        ],
      }));
    const sortBy = q.sortBy ?? 'date';
    const order = q.sortOrder ?? (LOG_DESC_DEFAULT.has(sortBy) ? 'desc' : 'asc');
    const args = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.machineryLog.findMany({ where, include: logInclude, orderBy: [...LOG_ORDER[sortBy](order), { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.machineryLog.count({ where }),
    ]);
    const fuel = await this.fuelIssued(rows);
    return paginated(rows.map((r) => this.toDto(r, fuel)), total, args);
  }

  async get(user: RequestUser, id: string): Promise<MachineryLogDto> {
    const row = await this.prisma.machineryLog.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include: logInclude });
    if (!row) throw new NotFoundException('Machinery log not found');
    return this.toDto(row, await this.fuelIssued([row]));
  }

  /** Logs may be back-dated but not set in the future (a day of slack covers time zones). */
  private checkDate(date: string) {
    if (parseDate(date).getTime() > Date.now() + 36 * 3600 * 1000) throw new BadRequestException('The date cannot be in the future');
  }

  private checkHours(l: Parameters<typeof machineryLogProblem>[0]) {
    const problem = machineryLogProblem(l);
    if (problem) throw new BadRequestException(problem);
  }

  /** Serialises writes per machine so the one-log-per-day rule holds under concurrent submissions. */
  private lock(tx: Tx, equipmentId: string) {
    return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`machinery:${equipmentId}`}))`;
  }

  private async assertNoOtherLog(tx: Tx, equipmentId: string, date: Date, exceptId?: string) {
    const other = await tx.machineryLog.findFirst({
      where: { equipmentId, date, status: { not: 'REJECTED' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { project: { select: { name: true } }, submittedBy: { select: { fullName: true } } },
    });
    if (other) throw new ConflictException(`This machine already has a log for ${dateOnly(date)} (${other.project.name}, by ${other.submittedBy.fullName})`);
  }

  private async findEquipment(user: RequestUser, equipmentId: string) {
    const eq = await this.prisma.equipment.findFirst({ where: { id: equipmentId, organizationId: user.organizationId }, select: { id: true, isActive: true } });
    if (!eq) throw new NotFoundException('Equipment not found');
    if (!eq.isActive) throw new BadRequestException('This machine is marked inactive');
    return eq;
  }

  private async assertActivity(projectId: string, activityId: string | null | undefined) {
    if (!activityId) return;
    const a = await this.prisma.activity.findFirst({ where: { id: activityId, projectId }, select: { id: true } });
    if (!a) throw new NotFoundException('Activity not found in this project');
  }

  /** Idempotent create: a log that already exists under the client-supplied id is returned as is. */
  private async findExisting(user: RequestUser, id: string | undefined) {
    if (!id) return null;
    const row = await this.prisma.machineryLog.findFirst({ where: { id, organizationId: user.organizationId }, select: { id: true } });
    return row ? this.get(user, row.id) : null;
  }

  async create(user: RequestUser, dto: CreateMachineryLogDto): Promise<MachineryLogDto> {
    const existing = await this.findExisting(user, dto.id);
    if (existing) return existing;
    await this.access.assertCanLogMachinery(user, dto.projectId);
    await this.findEquipment(user, dto.equipmentId);
    await this.assertActivity(dto.projectId, dto.activityId);
    this.checkDate(dto.date);
    this.checkHours(dto);
    const date = parseDate(dto.date);
    let id: string | null;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        await this.lock(tx, dto.equipmentId);
        // A retry of the same offline log that waited on the lock: the first one already created it.
        if (dto.id && (await tx.machineryLog.count({ where: { id: dto.id } }))) return null;
        await this.assertNoOtherLog(tx, dto.equipmentId, date);
        const row = await tx.machineryLog.create({
          data: {
            id: dto.id,
            organizationId: user.organizationId,
            projectId: dto.projectId,
            equipmentId: dto.equipmentId,
            date,
            hoursWorked: new Prisma.Decimal(dto.hoursWorked),
            idleHours: new Prisma.Decimal(dto.idleHours || 0),
            breakdownHours: new Prisma.Decimal(dto.breakdownHours || 0),
            dieselLitres: decimalOrNull(dto.dieselLitres),
            meterStart: decimalOrNull(dto.meterStart),
            meterEnd: decimalOrNull(dto.meterEnd),
            operatorName: dto.operatorName || null,
            activityId: dto.activityId || null,
            workDone: dto.workDone || null,
            breakdownNote: dto.breakdownNote || null,
            remarks: dto.remarks || null,
            submittedById: user.id,
            status: 'DRAFT',
          },
          select: { id: true },
        });
        return row.id;
      });
    } catch (e) {
      if (isUniqueViolation(e) && dto.id) {
        const winner = await this.findExisting(user, dto.id);
        if (winner) return winner;
      }
      throw e;
    }
    if (!id) return this.get(user, dto.id!);
    await this.attachments.link(user, 'machineryLogId', id, dto.attachmentIds);
    await this.audit.log(user, 'MACHINERY', id, 'CREATED');
    if (dto.submit !== false) await this.lifecycle.submit(user, 'MACHINERY', id);
    return this.get(user, id);
  }

  async update(user: RequestUser, id: string, dto: UpdateMachineryLogDto): Promise<MachineryLogDto> {
    const row = await this.lifecycle.load(user, 'MACHINERY', id);
    await this.lifecycle.assertEditable(user, row);
    const current = await this.prisma.machineryLog.findUniqueOrThrow({ where: { id } });
    if (dto.projectId !== undefined && dto.projectId !== current.projectId) throw new BadRequestException('A log cannot be moved to another project; delete it and log again');
    const equipmentId = dto.equipmentId ?? current.equipmentId;
    if (dto.equipmentId !== undefined && dto.equipmentId !== current.equipmentId) await this.findEquipment(user, dto.equipmentId);
    if (dto.activityId !== undefined) await this.assertActivity(current.projectId, dto.activityId);
    if (dto.date !== undefined) this.checkDate(dto.date);
    const pick = <K extends keyof UpdateMachineryLogDto>(k: K, fallback: unknown) => (dto[k] !== undefined ? dto[k] : fallback);
    this.checkHours({
      hoursWorked: pick('hoursWorked', current.hoursWorked.toString()) as string,
      idleHours: pick('idleHours', current.idleHours.toString()) as string,
      breakdownHours: pick('breakdownHours', current.breakdownHours.toString()) as string,
      meterStart: pick('meterStart', current.meterStart?.toString() ?? null) as string | null,
      meterEnd: pick('meterEnd', current.meterEnd?.toString() ?? null) as string | null,
      breakdownNote: pick('breakdownNote', current.breakdownNote) as string | null,
    });
    const data: Prisma.MachineryLogUncheckedUpdateInput = {};
    if (dto.equipmentId !== undefined) data.equipmentId = dto.equipmentId;
    if (dto.date !== undefined) data.date = parseDate(dto.date);
    if (dto.hoursWorked !== undefined) data.hoursWorked = new Prisma.Decimal(dto.hoursWorked);
    if (dto.idleHours !== undefined) data.idleHours = new Prisma.Decimal(dto.idleHours || 0);
    if (dto.breakdownHours !== undefined) data.breakdownHours = new Prisma.Decimal(dto.breakdownHours || 0);
    if (dto.dieselLitres !== undefined) data.dieselLitres = decimalOrNull(dto.dieselLitres);
    if (dto.meterStart !== undefined) data.meterStart = decimalOrNull(dto.meterStart);
    if (dto.meterEnd !== undefined) data.meterEnd = decimalOrNull(dto.meterEnd);
    if (dto.operatorName !== undefined) data.operatorName = dto.operatorName || null;
    if (dto.activityId !== undefined) data.activityId = dto.activityId || null;
    if (dto.workDone !== undefined) data.workDone = dto.workDone || null;
    if (dto.breakdownNote !== undefined) data.breakdownNote = dto.breakdownNote || null;
    if (dto.remarks !== undefined) data.remarks = dto.remarks || null;
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, equipmentId);
      // A rejected log being fixed counts again once edited, so the day must still be free.
      await this.assertNoOtherLog(tx, equipmentId, (data.date as Date | undefined) ?? current.date, id);
      await tx.machineryLog.update({ where: { id }, data });
    });
    await this.attachments.sync(user, 'machineryLogId', id, dto.attachmentIds);
    await this.audit.log(user, 'MACHINERY', id, 'UPDATED');
    if (dto.submit) await this.lifecycle.submit(user, 'MACHINERY', id);
    return this.get(user, id);
  }

  async submit(user: RequestUser, id: string) {
    const current = await this.lifecycle.load(user, 'MACHINERY', id);
    if (current.status === 'REJECTED') {
      const log = await this.prisma.machineryLog.findUniqueOrThrow({ where: { id }, select: { equipmentId: true, date: true } });
      await this.prisma.$transaction(async (tx) => {
        await this.lock(tx, log.equipmentId);
        await this.assertNoOtherLog(tx, log.equipmentId, log.date, id);
      });
    }
    await this.lifecycle.submit(user, 'MACHINERY', id);
    return this.get(user, id);
  }

  async remove(user: RequestUser, id: string) {
    const row = await this.lifecycle.load(user, 'MACHINERY', id);
    await this.lifecycle.assertEditable(user, row);
    await this.prisma.machineryLog.delete({ where: { id } });
    await this.audit.log(user, 'MACHINERY', id, 'DELETED');
    return { ok: true };
  }
}
