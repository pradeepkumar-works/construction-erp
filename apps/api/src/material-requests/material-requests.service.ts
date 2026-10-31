import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { asMasterNames } from '../stock/item-master';
import type { MaterialRequestDto, MaterialRequestSortField, Paginated, SortOrder } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { SubmissionLifecycleService } from '../common/submission-lifecycle.service';
import { AttachmentsService, ATTACHMENT_FIELDS } from '../common/attachments.service';
import { dateOnly, dec, iso, parseDate } from '../common/serialize';
import { isUniqueViolation } from '../common/idempotency';
import { ilike, pageArgs, paginated, searchWords, istDayRange } from '../common/paging';
import { CreateMaterialRequestDto, ListMaterialRequestQuery, UpdateMaterialRequestDto } from './material-requests.dto';
import { orderedOn, sum, toOrderOf } from '../purchasing/purchase-math';

const include = {
  project: { select: { name: true } },
  submittedBy: { select: { fullName: true } },
  reviewedBy: { select: { fullName: true } },
  items: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      stockTxns: { select: { quantity: true, purchaseOrderLineId: true } },
      covers: { select: { quantity: true } },
      poLines: {
        where: { purchaseOrder: { status: { not: 'REJECTED' as const } } },
        select: { quantity: true, purchaseOrder: { select: { closedAt: true } }, stockTxns: { select: { quantity: true } } },
      },
    },
  },
  attachments: { select: ATTACHMENT_FIELDS },
} satisfies Prisma.MaterialRequestInclude;
type Row = Prisma.MaterialRequestGetPayload<{ include: typeof include }>;

const ORDER: Record<MaterialRequestSortField, (o: SortOrder) => Prisma.MaterialRequestOrderByWithRelationInput[]> = {
  createdAt: (o) => [{ createdAt: o }],
  requestNo: (o) => [{ requestNo: o }],
  requiredDate: (o) => [{ requiredDate: o }, { createdAt: 'desc' }],
  priority: (o) => [{ priority: o }, { requiredDate: 'asc' }],
  status: (o) => [{ status: o }, { createdAt: 'desc' }],
  project: (o) => [{ project: { name: o } }, { createdAt: 'desc' }],
  submittedBy: (o) => [{ submittedBy: { fullName: o } }, { createdAt: 'desc' }],
};
const DESC_DEFAULT = new Set<string>(['createdAt', 'requestNo', 'requiredDate', 'priority']);

@Injectable()
export class MaterialRequestsService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private lifecycle: SubmissionLifecycleService,
    private attachments: AttachmentsService,
  ) {}

  toDto(r: Row): MaterialRequestDto {
    return {
      id: r.id,
      projectId: r.projectId,
      projectName: r.project.name,
      requestNo: r.requestNo,
      requiredDate: dateOnly(r.requiredDate),
      priority: r.priority,
      remarks: r.remarks,
      items: r.items.map((i) => ({
        id: i.id,
        itemName: i.itemName,
        specification: i.specification,
        unit: i.unit,
        quantity: dec(i.quantity),
        receivedQty: dec(i.stockTxns.reduce((s, t) => s.add(t.quantity), new Prisma.Decimal(0))),
        orderedQty: dec(sum(i.poLines, orderedOn)),
        coveredQty: dec(sum(i.covers, (c) => c.quantity)),
        toOrderQty: dec(toOrderOf(i)),
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
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
    };
  }

  /** MR-YYYY-0001 style numbering, per organisation. */
  private async nextRequestNo(organizationId: string): Promise<string> {
    const year = new Date().getUTCFullYear();
    const prefix = `MR-${year}-`;
    const last = await this.prisma.materialRequest.findFirst({ where: { organizationId, requestNo: { startsWith: prefix } }, orderBy: { requestNo: 'desc' }, select: { requestNo: true } });
    const n = last ? parseInt(last.requestNo.slice(prefix.length), 10) + 1 : 1;
    return `${prefix}${String(n).padStart(4, '0')}`;
  }

  async list(user: RequestUser, q: ListMaterialRequestQuery): Promise<Paginated<MaterialRequestDto>> {
    const where: Prisma.MaterialRequestWhereInput = { ...this.access.submissionWhere(user) };
    if (q.projectId) where.projectId = q.projectId;
    if (q.status) where.status = q.status;
    if (q.mine) where.submittedById = user.id;
    // Raised on these days.
    const days = istDayRange(q.from, q.to);
    if (days) where.createdAt = days;
    const words = searchWords(q.q);
    if (words.length)
      where.AND = words.map((w) => ({
        OR: [{ requestNo: ilike(w) }, { remarks: ilike(w) }, { items: { some: { itemName: ilike(w) } } }, { project: { name: ilike(w) } }, { submittedBy: { fullName: ilike(w) } }],
      }));
    const sortBy = q.sortBy ?? 'createdAt';
    const order = q.sortOrder ?? (DESC_DEFAULT.has(sortBy) ? 'desc' : 'asc');
    const args = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.materialRequest.findMany({ where, include, orderBy: [...ORDER[sortBy](order), { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.materialRequest.count({ where }),
    ]);
    return paginated(rows.map((r) => this.toDto(r)), total, args);
  }

  async get(user: RequestUser, id: string): Promise<MaterialRequestDto> {
    const row = await this.prisma.materialRequest.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include });
    if (!row) throw new NotFoundException('Material request not found');
    return this.toDto(row);
  }

  /** Idempotent create: a request that already exists under the client-supplied id is returned as is. */
  private async findExisting(user: RequestUser, id: string | undefined) {
    if (!id) return null;
    const row = await this.prisma.materialRequest.findFirst({ where: { id, organizationId: user.organizationId }, select: { id: true } });
    return row ? this.get(user, row.id) : null;
  }

  async create(user: RequestUser, dto: CreateMaterialRequestDto): Promise<MaterialRequestDto> {
    const existing = await this.findExisting(user, dto.id);
    if (existing) return existing;
    await this.access.assertCanAccessProject(user, dto.projectId);
    let row: { id: string; requestNo: string };
    try {
      row = await this.prisma.materialRequest.create({
        data: {
          id: dto.id,
          organizationId: user.organizationId,
          projectId: dto.projectId,
          requestNo: await this.nextRequestNo(user.organizationId),
          requiredDate: parseDate(dto.requiredDate),
          priority: dto.priority ?? 'NORMAL',
          remarks: dto.remarks ?? null,
          submittedById: user.id,
          status: 'DRAFT',
          items: {
            create: (await asMasterNames(this.prisma, user.organizationId, dto.items)).map((i, idx) => ({ itemName: i.itemName, specification: i.specification ?? null, unit: i.unit, quantity: new Prisma.Decimal(i.quantity), sortOrder: idx })),
          },
        },
        select: { id: true, requestNo: true },
      });
    } catch (e) {
      if (isUniqueViolation(e) && dto.id) {
        const winner = await this.findExisting(user, dto.id);
        if (winner) return winner;
      }
      throw e;
    }
    await this.attachments.link(user, 'materialRequestId', row.id, dto.attachmentIds);
    await this.audit.log(user, 'MATERIAL_REQUEST', row.id, 'CREATED', row.requestNo);
    if (dto.submit !== false) await this.lifecycle.submit(user, 'MATERIAL_REQUEST', row.id);
    return this.get(user, row.id);
  }

  async update(user: RequestUser, id: string, dto: UpdateMaterialRequestDto): Promise<MaterialRequestDto> {
    const row = await this.lifecycle.load(user, 'MATERIAL_REQUEST', id);
    await this.lifecycle.assertEditable(user, row);
    const data: Prisma.MaterialRequestUncheckedUpdateInput = {};
    if (dto.requiredDate !== undefined) data.requiredDate = parseDate(dto.requiredDate);
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.remarks !== undefined) data.remarks = dto.remarks;
    await this.prisma.$transaction(async (tx) => {
      await tx.materialRequest.update({ where: { id }, data });
      if (dto.items) {
        await tx.materialRequestItem.deleteMany({ where: { requestId: id } });
        await tx.materialRequestItem.createMany({
          data: (await asMasterNames(tx, user.organizationId, dto.items)).map((i, idx) => ({ requestId: id, itemName: i.itemName, specification: i.specification ?? null, unit: i.unit, quantity: new Prisma.Decimal(i.quantity), sortOrder: idx })),
        });
      }
    });
    await this.attachments.sync(user, 'materialRequestId', id, dto.attachmentIds);
    await this.audit.log(user, 'MATERIAL_REQUEST', id, 'UPDATED');
    if (dto.submit) await this.lifecycle.submit(user, 'MATERIAL_REQUEST', id);
    return this.get(user, id);
  }

  async submit(user: RequestUser, id: string) {
    await this.lifecycle.submit(user, 'MATERIAL_REQUEST', id);
    return this.get(user, id);
  }

  async remove(user: RequestUser, id: string) {
    const row = await this.lifecycle.load(user, 'MATERIAL_REQUEST', id);
    await this.lifecycle.assertEditable(user, row);
    await this.prisma.materialRequest.delete({ where: { id } });
    await this.audit.log(user, 'MATERIAL_REQUEST', id, 'DELETED');
    return { ok: true };
  }
}
