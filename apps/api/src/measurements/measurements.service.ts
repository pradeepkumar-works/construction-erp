import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hasDimensions, measurementLineQty, type MeasurementSheetDto, type MeasurementSortField, type Paginated, type SortOrder } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { SECTOR_SELECT, locationOr, resolveSector } from '../common/sector';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { SubmissionLifecycleService } from '../common/submission-lifecycle.service';
import { AttachmentsService } from '../common/attachments.service';
import { dateOnly, dec, iso, money, parseDate } from '../common/serialize';
import { isUniqueViolation } from '../common/idempotency';
import { nextDocNo } from '../common/doc-number';
import { ilike, pageArgs, paginated, searchWords } from '../common/paging';
import { assertOpenWorkOrder } from '../subcontracts/work-orders.service';
import { CreateMeasurementDto, ListMeasurementsQuery, MeasurementLineInputDto, UpdateMeasurementDto } from './measurements.dto';

const include = {
  project: { select: { name: true } },
  boqItem: { select: { itemNo: true, description: true, unit: true, rate: true } },
  lines: { orderBy: { sortOrder: 'asc' } },
  submittedBy: { select: { fullName: true } },
  reviewedBy: { select: { fullName: true } },
  attachments: true,
  raBill: { select: { billNo: true } },
  workOrder: { select: { woNo: true, vendor: { select: { name: true } } } },
} satisfies Prisma.MeasurementSheetInclude;
type Row = Prisma.MeasurementSheetGetPayload<{ include: typeof include }>;

const ORDER: Record<MeasurementSortField, (o: SortOrder) => Prisma.MeasurementSheetOrderByWithRelationInput[]> = {
  date: (o) => [{ date: o }, { mbNo: o }],
  mbNo: (o) => [{ mbNo: o }],
  createdAt: (o) => [{ createdAt: o }],
  submittedAt: (o) => [{ submittedAt: { sort: o, nulls: 'last' } }],
  totalQty: (o) => [{ totalQty: o }],
  boqItem: (o) => [{ boqItem: { itemNo: o } }, { date: 'desc' }],
  status: (o) => [{ status: o }, { date: 'desc' }],
  project: (o) => [{ project: { name: o } }, { date: 'desc' }],
  submittedBy: (o) => [{ submittedBy: { fullName: o } }, { date: 'desc' }],
};
const DESC_DEFAULT = new Set<string>(['date', 'mbNo', 'createdAt', 'submittedAt', 'totalQty']);

const decOrNull = (v: string | null | undefined) => (v === null || v === undefined || v === '' ? null : new Prisma.Decimal(v));

/**
 * Measurement book: a BOQ item measured at a location as dimension lines (nos × L × B × D, deductions
 * negative). Approved sheets add up to the BOQ item's measured quantity, which is what gets billed.
 */
@Injectable()
export class MeasurementsService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private lifecycle: SubmissionLifecycleService,
    private attachments: AttachmentsService,
  ) {}

  toDto(r: Row): MeasurementSheetDto {
    return {
      id: r.id,
      projectId: r.projectId,
      projectName: r.project.name,
      mbNo: r.mbNo,
      raBillId: r.raBillId,
      raBillNo: r.raBill?.billNo ?? null,
      workOrderId: r.workOrderId,
      woNo: r.workOrder?.woNo ?? null,
      contractorName: r.workOrder?.vendor.name ?? null,
      subcontractBillId: r.subcontractBillId,
      date: dateOnly(r.date)!,
      boqItemId: r.boqItemId,
      boqItemNo: r.boqItem.itemNo,
      boqDescription: r.boqItem.description,
      unit: r.boqItem.unit,
      rate: money(r.boqItem.rate)!,
      location: r.location,
      chainageFrom: r.chainageFrom,
      chainageTo: r.chainageTo,
      floor: r.floor,
      village: r.village,
      remarks: r.remarks,
      totalQty: dec(r.totalQty)!,
      amount: money(r.totalQty.mul(r.boqItem.rate))!,
      lines: r.lines.map((l) => ({
        id: l.id,
        description: l.description,
        nos: dec(l.nos),
        length: dec(l.length),
        breadth: dec(l.breadth),
        depth: dec(l.depth),
        deduct: l.deduct,
        quantity: dec(l.quantity)!,
      })),
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

  async list(user: RequestUser, q: ListMeasurementsQuery): Promise<Paginated<MeasurementSheetDto>> {
    const where: Prisma.MeasurementSheetWhereInput = { ...this.access.submissionWhere(user) };
    if (q.projectId) where.projectId = q.projectId;
    if (q.boqItemId) where.boqItemId = q.boqItemId;
    if (q.workOrderId) where.workOrderId = q.workOrderId;
    if (q.status) where.status = q.status;
    if (q.mine) where.submittedById = user.id;
    if (q.from || q.to) where.date = { ...(q.from ? { gte: parseDate(q.from) } : {}), ...(q.to ? { lte: parseDate(q.to) } : {}) };
    const words = searchWords(q.q);
    if (words.length)
      where.AND = words.map((w) => ({
        OR: [
          { mbNo: ilike(w) },
          { location: ilike(w) },
          { workOrder: { woNo: ilike(w) } },
          { workOrder: { vendor: { name: ilike(w) } } },
          { remarks: ilike(w) },
          { boqItem: { itemNo: ilike(w) } },
          { boqItem: { description: ilike(w) } },
          { project: { name: ilike(w) } },
          { submittedBy: { fullName: ilike(w) } },
        ],
      }));
    const sortBy = q.sortBy ?? 'date';
    const order = q.sortOrder ?? (DESC_DEFAULT.has(sortBy) ? 'desc' : 'asc');
    const args = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.measurementSheet.findMany({ where, include, orderBy: [...ORDER[sortBy](order), { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.measurementSheet.count({ where }),
    ]);
    return paginated(rows.map((r) => this.toDto(r)), total, args);
  }

  async get(user: RequestUser, id: string): Promise<MeasurementSheetDto> {
    const row = await this.prisma.measurementSheet.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include });
    if (!row) throw new NotFoundException('Measurement not found');
    return this.toDto(row);
  }

  private checkDate(date: string) {
    if (parseDate(date).getTime() > Date.now() + 36 * 3600 * 1000) throw new BadRequestException('The date cannot be in the future');
  }

  private async assertBoqItem(projectId: string, boqItemId: string) {
    const item = await this.prisma.boqItem.findFirst({ where: { id: boqItemId, projectId }, select: { id: true } });
    if (!item) throw new NotFoundException('BOQ item not found in this project');
  }

  /** Lines with their computed quantities, and the sheet total. */
  private lines(input: MeasurementLineInputDto[]) {
    const lines = input.map((l, i) => {
      if (!hasDimensions(l)) throw new BadRequestException(`Line ${i + 1}: enter nos or at least one dimension`);
      for (const k of ['nos', 'length', 'breadth', 'depth'] as const) if (l[k] && Number(l[k]) < 0) throw new BadRequestException(`Line ${i + 1}: ${k} cannot be negative`);
      return {
        description: l.description,
        nos: decOrNull(l.nos),
        length: decOrNull(l.length),
        breadth: decOrNull(l.breadth),
        depth: decOrNull(l.depth),
        deduct: !!l.deduct,
        quantity: new Prisma.Decimal(measurementLineQty(l)),
        sortOrder: i,
      };
    });
    const total = lines.reduce((s, l) => s.add(l.quantity), new Prisma.Decimal(0));
    if (total.lte(0)) throw new BadRequestException('The measured quantity must be greater than zero');
    return { lines, total };
  }

  private async findExisting(user: RequestUser, id: string | undefined) {
    if (!id) return null;
    const row = await this.prisma.measurementSheet.findFirst({ where: { id, organizationId: user.organizationId }, select: { id: true } });
    return row ? this.get(user, row.id) : null;
  }

  async create(user: RequestUser, dto: CreateMeasurementDto): Promise<MeasurementSheetDto> {
    const existing = await this.findExisting(user, dto.id);
    if (existing) return existing;
    await this.access.assertCanMeasure(user, dto.projectId);
    await this.assertBoqItem(dto.projectId, dto.boqItemId);
    if (dto.workOrderId) await assertOpenWorkOrder(this.prisma, user.organizationId, dto.workOrderId, dto.projectId, dto.boqItemId);
    this.checkDate(dto.date);
    const { lines, total } = this.lines(dto.lines);
    const sector = await resolveSector(this.prisma, dto.projectId, dto);
    const location = locationOr(dto.location, sector);
    if (!location) throw new BadRequestException('Say where it was measured');
    let id: string | null;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        const mbNo = await nextDocNo(tx, user.organizationId, 'MB', async (prefix) =>
          (await tx.measurementSheet.findFirst({ where: { organizationId: user.organizationId, mbNo: { startsWith: prefix } }, orderBy: { mbNo: 'desc' }, select: { mbNo: true } }))?.mbNo ?? null,
        );
        if (dto.id && (await tx.measurementSheet.count({ where: { id: dto.id } }))) return null;
        const row = await tx.measurementSheet.create({
          data: {
            id: dto.id,
            organizationId: user.organizationId,
            projectId: dto.projectId,
            boqItemId: dto.boqItemId,
            workOrderId: dto.workOrderId || null,
            mbNo,
            date: parseDate(dto.date),
            location,
            ...sector,
            remarks: dto.remarks || null,
            totalQty: total,
            submittedById: user.id,
            status: 'DRAFT',
            lines: { create: lines },
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
    await this.attachments.link(user, 'measurementId', id, dto.attachmentIds);
    await this.audit.log(user, 'MEASUREMENT', id, 'CREATED');
    if (dto.submit !== false) await this.lifecycle.submit(user, 'MEASUREMENT', id);
    return this.get(user, id);
  }

  async update(user: RequestUser, id: string, dto: UpdateMeasurementDto): Promise<MeasurementSheetDto> {
    const row = await this.lifecycle.load(user, 'MEASUREMENT', id);
    await this.lifecycle.assertEditable(user, row);
    if (dto.projectId !== undefined && dto.projectId !== row.projectId) throw new BadRequestException('A measurement cannot be moved to another project');
    if (dto.boqItemId !== undefined) await this.assertBoqItem(row.projectId, dto.boqItemId);
    if (dto.date !== undefined) this.checkDate(dto.date);
    const data: Prisma.MeasurementSheetUncheckedUpdateInput = {};
    if (dto.boqItemId !== undefined) data.boqItemId = dto.boqItemId;
    if (dto.workOrderId !== undefined || dto.boqItemId !== undefined) {
      const cur = await this.prisma.measurementSheet.findUniqueOrThrow({ where: { id }, select: { workOrderId: true, boqItemId: true } });
      const workOrderId = dto.workOrderId !== undefined ? dto.workOrderId : cur.workOrderId;
      if (workOrderId) await assertOpenWorkOrder(this.prisma, user.organizationId, workOrderId, row.projectId, dto.boqItemId ?? cur.boqItemId);
      data.workOrderId = workOrderId || null;
    }
    if (dto.date !== undefined) data.date = parseDate(dto.date);
    const sector = await resolveSector(this.prisma, row.projectId, dto, (await this.prisma.measurementSheet.findUnique({ where: { id }, select: SECTOR_SELECT }))!);
    Object.assign(data, sector);
    if (dto.location !== undefined) {
      const location = locationOr(dto.location, sector);
      if (!location) throw new BadRequestException('Say where it was measured');
      data.location = location;
    }
    if (dto.remarks !== undefined) data.remarks = dto.remarks || null;
    await this.prisma.$transaction(async (tx) => {
      if (dto.lines !== undefined) {
        const { lines, total } = this.lines(dto.lines);
        await tx.measurementLine.deleteMany({ where: { sheetId: id } });
        await tx.measurementLine.createMany({ data: lines.map((l) => ({ ...l, sheetId: id })) });
        data.totalQty = total;
      }
      await tx.measurementSheet.update({ where: { id }, data });
    });
    await this.attachments.sync(user, 'measurementId', id, dto.attachmentIds);
    await this.audit.log(user, 'MEASUREMENT', id, 'UPDATED');
    if (dto.submit) await this.lifecycle.submit(user, 'MEASUREMENT', id);
    return this.get(user, id);
  }

  async submit(user: RequestUser, id: string) {
    await this.lifecycle.submit(user, 'MEASUREMENT', id);
    return this.get(user, id);
  }

  async remove(user: RequestUser, id: string) {
    const row = await this.lifecycle.load(user, 'MEASUREMENT', id);
    await this.lifecycle.assertEditable(user, row);
    await this.prisma.measurementSheet.delete({ where: { id } });
    await this.audit.log(user, 'MEASUREMENT', id, 'DELETED');
    return { ok: true };
  }
}
