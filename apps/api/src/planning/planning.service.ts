import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ActivityDto, BoqItemDto } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { dateOnly, dec, money, parseDate, pct } from '../common/serialize';
import { BulkBoqDto, CreateActivityDto, CreateBoqItemDto, UpdateActivityDto, UpdateBoqItemDto } from './planning.dto';

const D = (v: string | number | Prisma.Decimal) => new Prisma.Decimal(v);

@Injectable()
export class PlanningService {
  constructor(private prisma: PrismaService, private access: ProjectAccessService, private audit: AuditService) {}

  // ---------- BOQ ----------

  async listBoq(user: RequestUser, projectId: string): Promise<BoqItemDto[]> {
    await this.access.assertCanAccessProject(user, projectId);
    const items = await this.prisma.boqItem.findMany({
      where: { projectId },
      include: {
        activities: { include: { progressEntries: { where: { status: 'APPROVED' }, select: { quantity: true } } } },
        measurements: { where: { status: { in: ['APPROVED', 'SUBMITTED'] } }, select: { status: true, totalQty: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { itemNo: 'asc' }],
    });
    return items.map((i) => {
      const executed = i.activities.flatMap((a) => a.progressEntries).reduce((s, e) => s.add(e.quantity), D(0));
      const effectiveQty = i.revisedQty ?? i.originalQty;
      const measured = i.measurements.filter((m) => m.status === 'APPROVED').reduce((s, m) => s.add(m.totalQty), D(0));
      const pendingMeasured = i.measurements.filter((m) => m.status === 'SUBMITTED').reduce((s, m) => s.add(m.totalQty), D(0));
      return {
        id: i.id,
        projectId: i.projectId,
        itemNo: i.itemNo,
        description: i.description,
        unit: i.unit,
        rate: money(i.rate)!,
        originalQty: dec(i.originalQty)!,
        revisedQty: dec(i.revisedQty),
        executedQty: dec(executed)!,
        balanceQty: dec(effectiveQty.sub(executed))!,
        amount: money(i.rate.mul(effectiveQty))!,
        measuredQty: dec(measured)!,
        measuredAmount: money(i.rate.mul(measured))!,
        pendingMeasuredQty: dec(pendingMeasured)!,
        sortOrder: i.sortOrder,
      };
    });
  }

  async createBoq(user: RequestUser, projectId: string, dto: CreateBoqItemDto) {
    await this.access.assertCanAccessProject(user, projectId);
    const dup = await this.prisma.boqItem.findFirst({ where: { projectId, itemNo: dto.itemNo } });
    if (dup) throw new ConflictException(`BOQ item ${dto.itemNo} already exists`);
    const row = await this.prisma.boqItem.create({
      data: {
        organizationId: user.organizationId,
        projectId,
        itemNo: dto.itemNo,
        description: dto.description,
        unit: dto.unit,
        rate: D(dto.rate),
        originalQty: D(dto.originalQty),
        revisedQty: dto.revisedQty ? D(dto.revisedQty) : null,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    await this.audit.log(user, 'BOQ_ITEM', row.id, 'CREATED', dto.itemNo);
    return (await this.listBoq(user, projectId)).find((i) => i.id === row.id);
  }

  /** Bulk create (used by Excel/CSV import on the web). Skips item numbers that already exist. */
  async bulkBoq(user: RequestUser, projectId: string, dto: BulkBoqDto) {
    await this.access.assertCanAccessProject(user, projectId);
    const existing = new Set((await this.prisma.boqItem.findMany({ where: { projectId }, select: { itemNo: true } })).map((i) => i.itemNo));
    const toCreate = dto.items.filter((i) => !existing.has(i.itemNo));
    await this.prisma.boqItem.createMany({
      data: toCreate.map((i, idx) => ({
        organizationId: user.organizationId,
        projectId,
        itemNo: i.itemNo,
        description: i.description,
        unit: i.unit,
        rate: D(i.rate),
        originalQty: D(i.originalQty),
        revisedQty: i.revisedQty ? D(i.revisedQty) : null,
        sortOrder: i.sortOrder ?? existing.size + idx,
      })),
    });
    await this.audit.log(user, 'PROJECT', projectId, 'BOQ_IMPORTED', `${toCreate.length} items`);
    return { created: toCreate.length, skipped: dto.items.length - toCreate.length };
  }

  async updateBoq(user: RequestUser, projectId: string, id: string, dto: UpdateBoqItemDto) {
    await this.access.assertCanAccessProject(user, projectId);
    const item = await this.prisma.boqItem.findFirst({ where: { id, projectId } });
    if (!item) throw new NotFoundException('BOQ item not found');
    const data: Prisma.BoqItemUpdateInput = {};
    if (dto.itemNo !== undefined) data.itemNo = dto.itemNo;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.unit !== undefined) data.unit = dto.unit;
    if (dto.rate !== undefined) data.rate = D(dto.rate);
    if (dto.originalQty !== undefined) data.originalQty = D(dto.originalQty);
    if (dto.revisedQty !== undefined) data.revisedQty = dto.revisedQty ? D(dto.revisedQty) : null;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    await this.prisma.boqItem.update({ where: { id }, data });
    await this.audit.log(user, 'BOQ_ITEM', id, 'UPDATED');
    return (await this.listBoq(user, projectId)).find((i) => i.id === id);
  }

  async deleteBoq(user: RequestUser, projectId: string, id: string) {
    await this.access.assertCanAccessProject(user, projectId);
    await this.prisma.boqItem.deleteMany({ where: { id, projectId } });
    await this.audit.log(user, 'BOQ_ITEM', id, 'DELETED');
    return { ok: true };
  }

  // ---------- Activities ----------

  private toActivityDto(a: Prisma.ActivityGetPayload<{ include: { boqItem: true; responsible: true; progressEntries: { select: { quantity: true } } } }>): ActivityDto {
    const executed = a.progressEntries.reduce((s, e) => s.add(e.quantity), D(0));
    const progressPct = pct(executed, a.plannedQty);
    const today = new Date();
    const isDelayed = !!a.plannedEnd && a.plannedEnd < today && progressPct < 100;
    return {
      id: a.id,
      projectId: a.projectId,
      boqItemId: a.boqItemId,
      boqItemNo: a.boqItem?.itemNo ?? null,
      name: a.name,
      unit: a.unit,
      plannedQty: dec(a.plannedQty)!,
      executedQty: dec(executed)!,
      progressPct,
      plannedStart: dateOnly(a.plannedStart),
      plannedEnd: dateOnly(a.plannedEnd),
      responsibleId: a.responsibleId,
      responsibleName: a.responsible?.fullName ?? null,
      isDelayed,
      sortOrder: a.sortOrder,
    };
  }

  private activityInclude = { boqItem: true, responsible: true, progressEntries: { where: { status: 'APPROVED' as const }, select: { quantity: true } } };

  async listActivities(user: RequestUser, projectId: string): Promise<ActivityDto[]> {
    await this.access.assertCanAccessProject(user, projectId);
    const rows = await this.prisma.activity.findMany({ where: { projectId }, include: this.activityInclude, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    return rows.map((r) => this.toActivityDto(r));
  }

  async createActivity(user: RequestUser, projectId: string, dto: CreateActivityDto): Promise<ActivityDto> {
    await this.access.assertCanAccessProject(user, projectId);
    const row = await this.prisma.activity.create({
      data: {
        organizationId: user.organizationId,
        projectId,
        name: dto.name,
        unit: dto.unit,
        plannedQty: D(dto.plannedQty),
        boqItemId: dto.boqItemId ?? null,
        plannedStart: dto.plannedStart ? parseDate(dto.plannedStart) : null,
        plannedEnd: dto.plannedEnd ? parseDate(dto.plannedEnd) : null,
        responsibleId: dto.responsibleId ?? null,
        sortOrder: dto.sortOrder ?? 0,
      },
      include: this.activityInclude,
    });
    await this.audit.log(user, 'ACTIVITY', row.id, 'CREATED', dto.name);
    return this.toActivityDto(row);
  }

  async updateActivity(user: RequestUser, projectId: string, id: string, dto: UpdateActivityDto): Promise<ActivityDto> {
    await this.access.assertCanAccessProject(user, projectId);
    const existing = await this.prisma.activity.findFirst({ where: { id, projectId } });
    if (!existing) throw new NotFoundException('Activity not found');
    const data: Prisma.ActivityUncheckedUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.unit !== undefined) data.unit = dto.unit;
    if (dto.plannedQty !== undefined) data.plannedQty = D(dto.plannedQty);
    if (dto.boqItemId !== undefined) data.boqItemId = dto.boqItemId;
    if (dto.plannedStart !== undefined) data.plannedStart = dto.plannedStart ? parseDate(dto.plannedStart) : null;
    if (dto.plannedEnd !== undefined) data.plannedEnd = dto.plannedEnd ? parseDate(dto.plannedEnd) : null;
    if (dto.responsibleId !== undefined) data.responsibleId = dto.responsibleId;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    const row = await this.prisma.activity.update({ where: { id }, data, include: this.activityInclude });
    await this.audit.log(user, 'ACTIVITY', id, 'UPDATED');
    return this.toActivityDto(row);
  }

  async deleteActivity(user: RequestUser, projectId: string, id: string) {
    await this.access.assertCanAccessProject(user, projectId);
    await this.prisma.activity.deleteMany({ where: { id, projectId } });
    await this.audit.log(user, 'ACTIVITY', id, 'DELETED');
    return { ok: true };
  }
}
