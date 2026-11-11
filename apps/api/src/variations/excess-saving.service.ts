import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ExcessSavingDto } from '@erp/shared';
import { MEASURE_TOLERANCE_PCT, anticipatedQtyProblem, billsByStages, canManageVariations, canViewVariations, excessSaving, takesTenderFactor } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';

const N = (v: Prisma.Decimal | null | undefined) => (v ? v.toNumber() : 0);

/**
 * The excess and saving statement (ARCHITECTURE "Excess and saving statement"): each BOQ item's agreement quantity
 * against what the quantity surveyor expects it to end at, at the rate it is billed at, from `excessSaving`.
 */
@Injectable()
export class ExcessSavingService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
  ) {}

  async statement(user: RequestUser, projectId: string): Promise<ExcessSavingDto> {
    if (!canViewVariations(user.roleKey)) throw new ForbiddenException('The excess and saving statement is for the roles that see bills');
    await this.access.assertCanAccessProject(user, projectId);
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { id: true, code: true, name: true, measureTolerancePct: true, contractModel: true, tenderFactor: true } });
    if (!project) throw new NotFoundException('Project not found');
    const [items, measured] = await Promise.all([
      this.prisma.boqItem.findMany({ where: { projectId }, orderBy: [{ sortOrder: 'asc' }, { itemNo: 'asc' }] }),
      this.prisma.measurementSheet.groupBy({ by: ['boqItemId'], where: { projectId, status: 'APPROVED' }, _sum: { totalQty: true } }),
    ]);
    const measuredOf = new Map(measured.map((m) => [m.boqItemId, N(m._sum.totalQty)]));
    // The rate a bill pays: the tender premium on an item-rate contract's tendered items, as `billRate` does.
    const factor = project.tenderFactor && !billsByStages(project.contractModel) ? project.tenderFactor.toNumber() : 1;
    const rateOf = (b: (typeof items)[number]) =>
      factor !== 1 && takesTenderFactor(project.contractModel, { originalQty: N(b.originalQty), unitRate: false }) ? Math.round(N(b.rate) * factor * 100) / 100 : N(b.rate);
    const tolerancePct = project.measureTolerancePct ?? MEASURE_TOLERANCE_PCT;
    const { rows, totals } = excessSaving(
      items.map((b) => ({
        id: b.id,
        itemNo: b.itemNo,
        description: b.description,
        unit: b.unit,
        rate: rateOf(b),
        originalQty: N(b.originalQty),
        revisedQty: b.revisedQty === null ? null : N(b.revisedQty),
        anticipatedQty: b.anticipatedQty === null ? null : N(b.anticipatedQty),
        measuredQty: measuredOf.get(b.id) ?? 0,
        excessOfId: b.excessOfId,
      })),
      tolerancePct,
    );
    return { projectId, projectCode: project.code, projectName: project.name, tolerancePct, rows, totals, canEdit: canManageVariations(user.roleKey) };
  }

  /** Set (or with null, clear) what the quantity surveyor expects an item to end at; never below what is measured. */
  async setAnticipated(user: RequestUser, boqItemId: string, anticipatedQty: string | null): Promise<ExcessSavingDto> {
    if (!canManageVariations(user.roleKey)) throw new ForbiddenException('Admin, management, project managers and quantity surveyors set anticipated quantities');
    const item = await this.prisma.boqItem.findFirst({ where: { id: boqItemId, organizationId: user.organizationId }, select: { id: true, projectId: true, itemNo: true } });
    if (!item) throw new NotFoundException('BOQ item not found');
    await this.access.assertCanAccessProject(user, item.projectId);
    const measured = await this.prisma.measurementSheet.aggregate({ where: { boqItemId, status: 'APPROVED' }, _sum: { totalQty: true } });
    const problem = anticipatedQtyProblem(anticipatedQty === null ? null : Number(anticipatedQty), N(measured._sum.totalQty));
    if (problem) throw new BadRequestException(`Item ${item.itemNo}: ${problem}`);
    await this.prisma.boqItem.update({ where: { id: boqItemId }, data: { anticipatedQty: anticipatedQty === null ? null : new Prisma.Decimal(anticipatedQty) } });
    await this.audit.log(user, 'PROJECT', item.projectId, 'BOQ_ANTICIPATED_SET', anticipatedQty === null ? `Item ${item.itemNo}: anticipated quantity cleared` : `Item ${item.itemNo}: anticipated ${anticipatedQty}`);
    return this.statement(user, item.projectId);
  }
}
