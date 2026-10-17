import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  EQUIPMENT_DOC_TYPE_LABELS,
  MAINTENANCE_KIND_LABELS,
  canManageMaintenance,
  expiryState,
  isCompanyWide,
  type DriverDto,
  type EquipmentDocumentDto,
  type MaintenanceJobDto,
  type MaintenanceSummaryDto,
  type Paginated,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { AttachmentsService, ATTACHMENT_FIELDS } from '../common/attachments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StockService } from '../stock/stock.service';
import { dateOnly, dec, iso, money, parseDate } from '../common/serialize';
import { isUniqueViolation } from '../common/idempotency';
import { nextDocNo } from '../common/doc-number';
import { ilike, pageArgs, paginated, searchWords } from '../common/paging';
import { todayIn } from '../notifications/time';
import { latestDocIds, serviceStatuses } from './service-status';
import {
  CloseJobDto,
  CreateDocumentDto,
  CreateDriverDto,
  CreateJobDto,
  IssueSparesDto,
  ListDocumentsQuery,
  ListDriversQuery,
  ListJobsQuery,
  UpdateDocumentDto,
  UpdateDriverDto,
  UpdateJobDto,
} from './maintenance.dto';

const D = Prisma.Decimal;
const ZERO = new D(0);

const jobInclude = {
  equipment: { select: { code: true, name: true } },
  project: { select: { name: true } },
  reportedBy: { select: { fullName: true } },
  closedBy: { select: { fullName: true } },
  attachments: { select: ATTACHMENT_FIELDS },
  spareIssues: {
    select: { id: true, entryNo: true, date: true, lines: { select: { itemId: true, quantity: true, item: { select: { name: true, unit: true, rate: true } } }, orderBy: { sortOrder: 'asc' } } },
    orderBy: { date: 'asc' },
  },
} satisfies Prisma.MaintenanceJobInclude;
type JobRow = Prisma.MaintenanceJobGetPayload<{ include: typeof jobInclude }>;

const docInclude = { equipment: { select: { code: true, name: true } }, attachments: { select: ATTACHMENT_FIELDS } } satisfies Prisma.EquipmentDocumentInclude;
type DocRow = Prisma.EquipmentDocumentGetPayload<{ include: typeof docInclude }>;

const driverInclude = { equipment: { select: { code: true, name: true } } } satisfies Prisma.DriverInclude;
type DriverRow = Prisma.DriverGetPayload<{ include: typeof driverInclude }>;

const blank = (v: string | null | undefined) => (v ? v : null);
const decOrNull = (v: string | null | undefined) => (v === null || v === undefined || v === '' ? null : new D(v));
const nonNegative = (v: Prisma.Decimal | null, what: string) => {
  if (v && v.lt(0)) throw new BadRequestException(`${what} cannot be negative`);
  return v;
};

/**
 * Machinery maintenance (v4 item 42): job cards for services and breakdowns, spares issued from the store against
 * them, service schedules by working hours or days, the register of vehicle papers that expire, and drivers.
 * Site staff report breakdowns; the store manager or an approver raises services, closes job cards and keeps the
 * papers. A closed service resets the machine's schedule. Papers and licences expiring and services falling due are
 * alerted by the daily machinery job (NotificationJobsService.machineryDue).
 */
@Injectable()
export class MaintenanceService {
  private readonly log = new Logger(MaintenanceService.name);

  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private attachments: AttachmentsService,
    private notifications: NotificationsService,
    private stock: StockService,
  ) {}

  /* ---------- job cards ---------- */

  private jobDto(r: JobRow): MaintenanceJobDto {
    const spares = r.spareIssues.flatMap((e) =>
      e.lines.map((l) => {
        const qty = l.quantity.abs();
        return {
          entryId: e.id,
          entryNo: e.entryNo,
          date: dateOnly(e.date)!,
          itemId: l.itemId,
          itemName: l.item.name,
          unit: l.item.unit,
          quantity: dec(qty)!,
          value: l.item.rate ? money(qty.mul(l.item.rate)) : null,
        };
      }),
    );
    const sparesValue = spares.reduce((s, x) => (x.value ? s.plus(x.value) : s), ZERO);
    return {
      id: r.id,
      jobNo: r.jobNo,
      equipmentId: r.equipmentId,
      equipmentCode: r.equipment.code,
      equipmentName: r.equipment.name,
      projectId: r.projectId,
      projectName: r.project?.name ?? null,
      kind: r.kind,
      status: r.status,
      date: dateOnly(r.date)!,
      meterReading: dec(r.meterReading),
      description: r.description,
      workshop: r.workshop,
      workDone: r.workDone,
      closedDate: dateOnly(r.closedDate),
      downtimeHours: dec(r.downtimeHours),
      labourCost: money(r.labourCost)!,
      partsCost: money(r.partsCost)!,
      sparesValue: money(sparesValue)!,
      totalCost: money(r.labourCost.plus(r.partsCost).plus(sparesValue))!,
      spares,
      reportedById: r.reportedById,
      reportedByName: r.reportedBy.fullName,
      closedByName: r.closedBy?.fullName ?? null,
      attachments: r.attachments.map((a) => this.attachments.toDto(a)),
      createdAt: iso(r.createdAt)!,
      updatedAt: iso(r.updatedAt)!,
    };
  }

  async listJobs(user: RequestUser, q: ListJobsQuery): Promise<Paginated<MaintenanceJobDto>> {
    const and: Prisma.MaintenanceJobWhereInput[] = [this.access.maintenanceWhere(user)];
    if (q.equipmentId) and.push({ equipmentId: q.equipmentId });
    if (q.projectId) and.push({ projectId: q.projectId });
    if (q.kind) and.push({ kind: q.kind });
    if (q.status) and.push({ status: q.status });
    if (q.from || q.to) and.push({ date: { ...(q.from ? { gte: parseDate(q.from) } : {}), ...(q.to ? { lte: parseDate(q.to) } : {}) } });
    for (const w of searchWords(q.q))
      and.push({
        OR: [{ jobNo: ilike(w) }, { equipment: { code: ilike(w) } }, { equipment: { name: ilike(w) } }, { description: ilike(w) }, { workshop: ilike(w) }, { workDone: ilike(w) }],
      });
    const where: Prisma.MaintenanceJobWhereInput = { AND: and };
    const args = pageArgs(q);
    const order = q.sortOrder ?? 'desc';
    const [rows, total] = await Promise.all([
      // Open job cards first, then newest.
      this.prisma.maintenanceJob.findMany({ where, include: jobInclude, orderBy: [{ status: 'asc' }, { date: order }, { jobNo: order }], skip: args.skip, take: args.take }),
      this.prisma.maintenanceJob.count({ where }),
    ]);
    return paginated(rows.map((r) => this.jobDto(r)), total, args);
  }

  async getJob(user: RequestUser, id: string): Promise<MaintenanceJobDto> {
    const row = await this.prisma.maintenanceJob.findFirst({ where: { AND: [{ id }, this.access.maintenanceWhere(user)] }, include: jobInclude });
    if (!row) throw new NotFoundException('Job card not found');
    return this.jobDto(row);
  }

  private async machine(user: RequestUser, equipmentId: string) {
    const eq = await this.prisma.equipment.findFirst({ where: { id: equipmentId, organizationId: user.organizationId }, select: { id: true, code: true, name: true, isActive: true, projectId: true } });
    if (!eq) throw new NotFoundException('Equipment not found');
    return eq;
  }

  private checkDate(date: string, what = 'The date') {
    if (parseDate(date).getTime() > Date.now() + 36 * 3600 * 1000) throw new BadRequestException(`${what} cannot be in the future`);
  }

  async createJob(user: RequestUser, dto: CreateJobDto): Promise<MaintenanceJobDto> {
    if (dto.id) {
      const existing = await this.prisma.maintenanceJob.findFirst({ where: { id: dto.id, organizationId: user.organizationId }, select: { id: true } });
      if (existing) return this.getJob(user, existing.id);
    }
    const eq = await this.machine(user, dto.equipmentId);
    if (!eq.isActive) throw new BadRequestException('This machine is marked inactive');
    if (dto.kind === 'BREAKDOWN') await this.access.assertCanReportBreakdown(user, eq.projectId);
    else await this.access.assertCanManageMaintenance(user, eq.projectId);
    this.checkDate(dto.date);
    const meter = nonNegative(decOrNull(dto.meterReading), 'Meter reading');
    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        const jobNo = await nextDocNo(tx, user.organizationId, 'MNT', async (prefix) => {
          const last = await tx.maintenanceJob.findFirst({ where: { organizationId: user.organizationId, jobNo: { startsWith: prefix } }, orderBy: { jobNo: 'desc' }, select: { jobNo: true } });
          return last?.jobNo ?? null;
        });
        const row = await tx.maintenanceJob.create({
          data: {
            id: dto.id,
            organizationId: user.organizationId,
            equipmentId: eq.id,
            projectId: eq.projectId,
            jobNo,
            kind: dto.kind,
            date: parseDate(dto.date),
            meterReading: meter,
            description: dto.description,
            workshop: blank(dto.workshop),
            reportedById: user.id,
          },
          select: { id: true },
        });
        return row.id;
      });
    } catch (e) {
      if (isUniqueViolation(e) && dto.id) return this.getJob(user, dto.id);
      throw e;
    }
    await this.attachments.link(user, 'maintenanceJobId', id, dto.attachmentIds);
    await this.audit.log(user, 'MAINTENANCE_JOB', id, 'CREATED');
    const job = await this.getJob(user, id);
    if (job.kind === 'BREAKDOWN') await this.notifyBreakdown(user, job);
    return job;
  }

  /** Who may change an open job card: whoever reported it, or a maintenance manager. */
  private async editable(user: RequestUser, id: string) {
    const job = await this.getJob(user, id);
    if (job.status !== 'OPEN') throw new ConflictException(`${job.jobNo} is closed`);
    if (job.reportedById !== user.id) await this.access.assertCanManageMaintenance(user, job.projectId);
    return job;
  }

  async updateJob(user: RequestUser, id: string, dto: UpdateJobDto): Promise<MaintenanceJobDto> {
    const job = await this.editable(user, id);
    if (dto.kind === 'SERVICE' && job.kind !== 'SERVICE') await this.access.assertCanManageMaintenance(user, job.projectId);
    if (dto.date !== undefined) this.checkDate(dto.date);
    const data: Prisma.MaintenanceJobUncheckedUpdateInput = {};
    if (dto.kind !== undefined) data.kind = dto.kind;
    if (dto.date !== undefined) data.date = parseDate(dto.date);
    if (dto.meterReading !== undefined) data.meterReading = nonNegative(decOrNull(dto.meterReading), 'Meter reading');
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.workshop !== undefined) data.workshop = blank(dto.workshop);
    await this.prisma.maintenanceJob.update({ where: { id }, data });
    await this.attachments.sync(user, 'maintenanceJobId', id, dto.attachmentIds);
    await this.audit.log(user, 'MAINTENANCE_JOB', id, 'UPDATED');
    return this.getJob(user, id);
  }

  /** Close with the work done and its cost. A service also restarts the machine's schedule from this date. */
  async closeJob(user: RequestUser, id: string, dto: CloseJobDto): Promise<MaintenanceJobDto> {
    const job = await this.getJob(user, id);
    if (job.status !== 'OPEN') throw new ConflictException(`${job.jobNo} is already closed`);
    await this.access.assertCanManageMaintenance(user, job.projectId);
    this.checkDate(dto.closedDate, 'The closing date');
    if (dto.closedDate < job.date) throw new BadRequestException('The job cannot be closed before it was opened');
    const meter = dto.meterReading !== undefined ? nonNegative(decOrNull(dto.meterReading), 'Meter reading') : decOrNull(job.meterReading);
    const closed = parseDate(dto.closedDate);
    await this.prisma.$transaction(async (tx) => {
      await tx.maintenanceJob.update({
        where: { id },
        data: {
          status: 'CLOSED',
          closedDate: closed,
          workDone: dto.workDone,
          downtimeHours: nonNegative(decOrNull(dto.downtimeHours), 'Downtime'),
          labourCost: nonNegative(decOrNull(dto.labourCost), 'Labour cost') ?? ZERO,
          partsCost: nonNegative(decOrNull(dto.partsCost), 'Parts cost') ?? ZERO,
          meterReading: meter,
          ...(dto.workshop !== undefined ? { workshop: blank(dto.workshop) } : {}),
          closedById: user.id,
        },
      });
      if (job.kind === 'SERVICE')
        // A late-entered older service does not move the schedule back.
        await tx.equipment.updateMany({
          where: { id: job.equipmentId, OR: [{ lastServiceDate: null }, { lastServiceDate: { lte: closed } }] },
          data: { lastServiceDate: closed, lastServiceMeter: meter },
        });
    });
    await this.audit.log(user, 'MAINTENANCE_JOB', id, 'CLOSED', dto.workDone);
    return this.getJob(user, id);
  }

  /** Spares from the store of the project the machine was at, recorded as a stock issue linked to the job card. */
  async issueSpares(user: RequestUser, id: string, dto: IssueSparesDto): Promise<MaintenanceJobDto> {
    const job = await this.getJob(user, id);
    if (dto.id && job.spares.some((s) => s.entryId === dto.id)) return job;
    if (job.status !== 'OPEN') throw new ConflictException(`${job.jobNo} is closed; spares are issued while the job is open`);
    if (!job.projectId) throw new BadRequestException('This machine is in the yard; spares are issued from a project store. Enter bought parts as parts cost when closing.');
    await this.access.assertCanManageMaintenance(user, job.projectId);
    await this.stock.issue(
      user,
      { id: dto.id, projectId: job.projectId, date: dto.date, issuedTo: `${job.equipmentCode} (${job.jobNo})`, remarks: `Spares for ${MAINTENANCE_KIND_LABELS[job.kind].toLowerCase()} ${job.jobNo}`, lines: dto.lines },
      { maintenanceJobId: id },
    );
    return this.getJob(user, id);
  }

  /** Delete a wrong job card: a maintenance manager, and only while no spares are issued against it. */
  async removeJob(user: RequestUser, id: string) {
    const job = await this.getJob(user, id);
    await this.access.assertCanManageMaintenance(user, job.projectId);
    if (job.spares.length) throw new ConflictException(`Spares were issued against ${job.jobNo}; delete those stock issues first`);
    await this.prisma.maintenanceJob.delete({ where: { id } });
    await this.audit.log(user, 'MAINTENANCE_JOB', id, 'DELETED');
    return { ok: true };
  }

  private async notifyBreakdown(user: RequestUser, job: MaintenanceJobDto) {
    try {
      const userIds = (await this.access.maintenanceWatchers(user.organizationId, job.projectId)).filter((u) => u !== user.id);
      await this.notifications.notify({
        organizationId: user.organizationId,
        userIds,
        type: 'MACHINERY',
        title: `Breakdown: ${job.equipmentCode} ${job.equipmentName}`,
        body: `${job.jobNo}${job.projectName ? ` at ${job.projectName}` : ''} on ${job.date}, reported by ${job.reportedByName}. ${job.description.length > 140 ? `${job.description.slice(0, 137)}...` : job.description}`,
        projectId: job.projectId,
        entityType: 'MAINTENANCE_JOB',
        entityId: job.id,
        dedupeKey: `BREAKDOWN:${job.id}`,
      });
    } catch (e) {
      this.log.warn(`Breakdown notification failed: ${(e as Error).message}`);
    }
  }

  /* ---------- summary ---------- */

  /** Machines a user's summary covers: all for company-wide roles; others the machines at their projects (and the yard for maintenance managers). */
  private equipmentWhere(user: RequestUser, projectId?: string): Prisma.EquipmentWhereInput {
    const base: Prisma.EquipmentWhereInput = { organizationId: user.organizationId, ...(projectId ? { projectId } : {}) };
    if (isCompanyWide(user.roleKey)) return base;
    return { ...base, OR: [{ project: this.access.projectWhere(user) }, ...(canManageMaintenance(user.roleKey) ? [{ projectId: null }] : [])] };
  }

  async summary(user: RequestUser, projectId?: string): Promise<MaintenanceSummaryDto> {
    const today = todayIn();
    const machines = this.equipmentWhere(user, projectId);
    const soon = parseDate(today);
    soon.setUTCDate(soon.getUTCDate() + 30);
    const monthStart = parseDate(`${today.slice(0, 8)}01`);
    const jobsWhere: Prisma.MaintenanceJobWhereInput = { AND: [this.access.maintenanceWhere(user), projectId ? { projectId } : {}] };
    const [service, docs, drivers, openJobs, openBreakdowns, closed] = await Promise.all([
      serviceStatuses(this.prisma, machines, today),
      this.latestDocs(user.organizationId, { equipment: { ...machines, isActive: true }, validTo: { lte: soon } }),
      this.prisma.driver.findMany({
        where: { organizationId: user.organizationId, isActive: true, licenceValidTo: { lte: soon }, ...(projectId ? { equipment: { projectId } } : {}) },
        include: driverInclude,
        orderBy: { licenceValidTo: 'asc' },
      }),
      this.prisma.maintenanceJob.count({ where: { AND: [jobsWhere, { status: 'OPEN' }] } }),
      this.prisma.maintenanceJob.count({ where: { AND: [jobsWhere, { status: 'OPEN', kind: 'BREAKDOWN' }] } }),
      this.prisma.maintenanceJob.findMany({ where: { AND: [jobsWhere, { status: 'CLOSED', closedDate: { gte: monthStart } }] }, include: jobInclude }),
    ]);
    const closedDtos = closed.map((r) => this.jobDto(r));
    return {
      service,
      documentsDue: docs.map((d) => this.docDto(d, today)).sort((a, b) => a.daysLeft - b.daysLeft),
      licencesDue: drivers.map((d) => this.driverDto(d, today)),
      openJobs,
      openBreakdowns,
      closedThisMonth: closedDtos.length,
      downtimeHoursThisMonth: dec(closedDtos.reduce((s, j) => s.plus(j.downtimeHours ?? 0), ZERO))!,
      costThisMonth: money(closedDtos.reduce((s, j) => s.plus(j.totalCost), ZERO))!,
    };
  }

  /* ---------- documents ---------- */

  private docDto(r: DocRow, today = todayIn()): EquipmentDocumentDto {
    const validTo = dateOnly(r.validTo)!;
    const e = expiryState(validTo, today)!;
    return {
      id: r.id,
      equipmentId: r.equipmentId,
      equipmentCode: r.equipment.code,
      equipmentName: r.equipment.name,
      type: r.type,
      number: r.number,
      issuer: r.issuer,
      validFrom: dateOnly(r.validFrom),
      validTo,
      notes: r.notes,
      state: e.state,
      daysLeft: e.daysLeft,
      attachments: r.attachments.map((a) => this.attachments.toDto(a)),
      createdAt: iso(r.createdAt)!,
    };
  }

  private async latestDocs(organizationId: string, where: Prisma.EquipmentDocumentWhereInput) {
    const ids = await latestDocIds(this.prisma, organizationId);
    return this.prisma.equipmentDocument.findMany({ where: { ...where, organizationId, id: { in: ids } }, include: docInclude, orderBy: { validTo: 'asc' } });
  }

  async listDocuments(user: RequestUser, q: ListDocumentsQuery): Promise<Paginated<EquipmentDocumentDto>> {
    const today = todayIn();
    const and: Prisma.EquipmentDocumentWhereInput[] = [{ organizationId: user.organizationId }];
    if (q.equipmentId) and.push({ equipmentId: q.equipmentId });
    if (q.type) and.push({ type: q.type });
    if (q.latestOnly !== false) and.push({ id: { in: await latestDocIds(this.prisma, user.organizationId) } });
    if (q.state) {
      const t = parseDate(today);
      const soon = parseDate(today);
      soon.setUTCDate(soon.getUTCDate() + 30);
      and.push({ validTo: q.state === 'EXPIRED' ? { lt: t } : q.state === 'EXPIRING' ? { gte: t, lte: soon } : { gt: soon } });
    }
    for (const w of searchWords(q.q)) and.push({ OR: [{ equipment: { code: ilike(w) } }, { equipment: { name: ilike(w) } }, { number: ilike(w) }, { issuer: ilike(w) }] });
    const where: Prisma.EquipmentDocumentWhereInput = { AND: and };
    const args = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.equipmentDocument.findMany({ where, include: docInclude, orderBy: [{ validTo: q.sortOrder ?? 'asc' }, { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.equipmentDocument.count({ where }),
    ]);
    return paginated(rows.map((r) => this.docDto(r, today)), total, args);
  }

  async getDocument(user: RequestUser, id: string): Promise<EquipmentDocumentDto> {
    const row = await this.prisma.equipmentDocument.findFirst({ where: { id, organizationId: user.organizationId }, include: docInclude });
    if (!row) throw new NotFoundException('Document not found');
    return this.docDto(row);
  }

  private checkValidity(from: string | null | undefined, to: string) {
    if (from && from > to) throw new BadRequestException('Valid from is after valid to');
  }

  async createDocument(user: RequestUser, dto: CreateDocumentDto): Promise<EquipmentDocumentDto> {
    await this.access.assertCanManageMaintenance(user, null);
    await this.machine(user, dto.equipmentId);
    this.checkValidity(dto.validFrom, dto.validTo);
    const row = await this.prisma.equipmentDocument.create({
      data: {
        organizationId: user.organizationId,
        equipmentId: dto.equipmentId,
        type: dto.type,
        number: blank(dto.number),
        issuer: blank(dto.issuer),
        validFrom: dto.validFrom ? parseDate(dto.validFrom) : null,
        validTo: parseDate(dto.validTo),
        notes: blank(dto.notes),
      },
      select: { id: true },
    });
    await this.attachments.link(user, 'equipmentDocId', row.id, dto.attachmentIds);
    await this.audit.log(user, 'EQUIPMENT_DOCUMENT', row.id, 'CREATED', EQUIPMENT_DOC_TYPE_LABELS[dto.type]);
    return this.getDocument(user, row.id);
  }

  async updateDocument(user: RequestUser, id: string, dto: UpdateDocumentDto): Promise<EquipmentDocumentDto> {
    await this.access.assertCanManageMaintenance(user, null);
    const current = await this.getDocument(user, id);
    this.checkValidity(dto.validFrom !== undefined ? dto.validFrom : current.validFrom, dto.validTo ?? current.validTo);
    const data: Prisma.EquipmentDocumentUpdateInput = {};
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.number !== undefined) data.number = blank(dto.number);
    if (dto.issuer !== undefined) data.issuer = blank(dto.issuer);
    if (dto.validFrom !== undefined) data.validFrom = dto.validFrom ? parseDate(dto.validFrom) : null;
    if (dto.validTo !== undefined) data.validTo = parseDate(dto.validTo);
    if (dto.notes !== undefined) data.notes = blank(dto.notes);
    await this.prisma.equipmentDocument.update({ where: { id }, data });
    await this.attachments.sync(user, 'equipmentDocId', id, dto.attachmentIds);
    await this.audit.log(user, 'EQUIPMENT_DOCUMENT', id, 'UPDATED');
    return this.getDocument(user, id);
  }

  async removeDocument(user: RequestUser, id: string) {
    await this.access.assertCanManageMaintenance(user, null);
    await this.getDocument(user, id);
    await this.prisma.equipmentDocument.delete({ where: { id } });
    await this.audit.log(user, 'EQUIPMENT_DOCUMENT', id, 'DELETED');
    return { ok: true };
  }

  /* ---------- drivers ---------- */

  private driverDto(r: DriverRow, today = todayIn()): DriverDto {
    const validTo = dateOnly(r.licenceValidTo);
    const e = expiryState(validTo, today);
    return {
      id: r.id,
      name: r.name,
      phone: r.phone,
      licenceNo: r.licenceNo,
      licenceClass: r.licenceClass,
      licenceValidTo: validTo,
      licenceState: e?.state ?? null,
      daysLeft: e?.daysLeft ?? null,
      equipmentId: r.equipmentId,
      equipmentCode: r.equipment?.code ?? null,
      equipmentName: r.equipment?.name ?? null,
      isActive: r.isActive,
      notes: r.notes,
    };
  }

  async listDrivers(user: RequestUser, q: ListDriversQuery): Promise<Paginated<DriverDto>> {
    const and: Prisma.DriverWhereInput[] = [{ organizationId: user.organizationId }];
    if (!q.includeInactive) and.push({ isActive: true });
    if (q.equipmentId) and.push({ equipmentId: q.equipmentId });
    for (const w of searchWords(q.q)) and.push({ OR: [{ name: ilike(w) }, { phone: ilike(w) }, { licenceNo: ilike(w) }, { equipment: { code: ilike(w) } }] });
    const where: Prisma.DriverWhereInput = { AND: and };
    const args = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.driver.findMany({ where, include: driverInclude, orderBy: [{ name: q.sortOrder ?? 'asc' }, { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.driver.count({ where }),
    ]);
    const today = todayIn();
    return paginated(rows.map((r) => this.driverDto(r, today)), total, args);
  }

  async getDriver(user: RequestUser, id: string): Promise<DriverDto> {
    const row = await this.prisma.driver.findFirst({ where: { id, organizationId: user.organizationId }, include: driverInclude });
    if (!row) throw new NotFoundException('Driver not found');
    return this.driverDto(row);
  }

  private async driverData(user: RequestUser, dto: UpdateDriverDto): Promise<Prisma.DriverUncheckedUpdateInput> {
    const data: Prisma.DriverUncheckedUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.phone !== undefined) data.phone = blank(dto.phone);
    if (dto.licenceNo !== undefined) data.licenceNo = blank(dto.licenceNo?.toUpperCase());
    if (dto.licenceClass !== undefined) data.licenceClass = blank(dto.licenceClass);
    if (dto.licenceValidTo !== undefined) data.licenceValidTo = dto.licenceValidTo ? parseDate(dto.licenceValidTo) : null;
    if (dto.equipmentId !== undefined) {
      if (dto.equipmentId) await this.machine(user, dto.equipmentId);
      data.equipmentId = dto.equipmentId;
    }
    if (dto.notes !== undefined) data.notes = blank(dto.notes);
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    return data;
  }

  async createDriver(user: RequestUser, dto: CreateDriverDto): Promise<DriverDto> {
    await this.access.assertCanManageMaintenance(user, null);
    const data = await this.driverData(user, dto);
    const row = await this.prisma.driver.create({ data: { ...(data as Prisma.DriverUncheckedCreateInput), organizationId: user.organizationId, name: dto.name }, select: { id: true } });
    await this.audit.log(user, 'DRIVER', row.id, 'CREATED');
    return this.getDriver(user, row.id);
  }

  async updateDriver(user: RequestUser, id: string, dto: UpdateDriverDto): Promise<DriverDto> {
    await this.access.assertCanManageMaintenance(user, null);
    await this.getDriver(user, id);
    await this.prisma.driver.update({ where: { id }, data: await this.driverData(user, dto) });
    await this.audit.log(user, 'DRIVER', id, 'UPDATED');
    return this.getDriver(user, id);
  }

  async removeDriver(user: RequestUser, id: string) {
    await this.access.assertCanManageMaintenance(user, null);
    await this.getDriver(user, id);
    await this.prisma.driver.delete({ where: { id } });
    await this.audit.log(user, 'DRIVER', id, 'DELETED');
    return { ok: true };
  }
}
