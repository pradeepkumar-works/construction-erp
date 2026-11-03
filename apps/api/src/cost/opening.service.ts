import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { COST_HEADS, canSetBudget, canViewCost, openingMissing, openingProblem, ranBeforeNirmaan, type CostHead, type ProjectOpeningDto } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { dateOnly, iso, money, parseDate } from '../common/serialize';
import { todayIn } from '../notifications/time';
import { SetOpeningDto } from './cost.dto';

const Dec = Prisma.Decimal;

/**
 * Opening cost (ARCHITECTURE "Opening cost"): what a project had spent, by head, and done when it came on Nirmaan. The
 * cost service counts it on its date, so cost to date, margin, the budget forecast and the cash flow all read it; this
 * service records it and says which projects ran before they came on and have none (`openingMissing` in @erp/shared).
 */
@Injectable()
export class OpeningService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
  ) {}

  /** The projects among these that ran before they came on Nirmaan and have no opening cost. */
  async missing(projectIds: string[]): Promise<Set<string>> {
    if (!projectIds.length) return new Set();
    const rows = await this.prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, type: true, startDate: true, createdAt: true, opening: { select: { id: true } } },
    });
    return new Set(
      rows.filter((p) => openingMissing({ type: p.type, startDate: dateOnly(p.startDate), enteredOn: dateOnly(p.createdAt), hasOpening: !!p.opening })).map((p) => p.id),
    );
  }

  async get(user: RequestUser, projectId: string): Promise<ProjectOpeningDto> {
    if (!canViewCost(user.roleKey)) throw new ForbiddenException('Project cost is for approvers and accounts');
    await this.access.assertCanAccessProject(user, projectId);
    const p = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, code: true, type: true, startDate: true, createdAt: true, opening: { include: { updatedBy: { select: { fullName: true } } } } },
    });
    if (!p) throw new NotFoundException('Project not found');
    const enteredOn = dateOnly(p.createdAt);
    const startDate = dateOnly(p.startDate);
    const o = p.opening;
    const heads = o ? (Object.fromEntries(COST_HEADS.map((h) => [h, money(o[h])])) as Record<CostHead, string>) : null;
    return {
      projectId: p.id,
      projectCode: p.code,
      startDate,
      enteredOn,
      ranBefore: ranBeforeNirmaan(startDate, enteredOn),
      missing: openingMissing({ type: p.type, startDate, enteredOn, hasOpening: !!o }),
      opening:
        o && heads
          ? {
              asOf: dateOnly(o.asOf),
              heads,
              total: money(COST_HEADS.reduce((s, h) => s.plus(o[h]), new Dec(0))),
              workDone: money(o.workDone),
              notes: o.notes,
              updatedAt: iso(o.updatedAt),
              updatedByName: o.updatedBy.fullName,
            }
          : null,
    };
  }

  async set(user: RequestUser, projectId: string, dto: SetOpeningDto): Promise<ProjectOpeningDto> {
    if (!canSetBudget(user.roleKey)) throw new ForbiddenException('Only admin, management or the project manager can record the opening cost');
    await this.access.assertCanAccessProject(user, projectId);
    const p = await this.prisma.project.findUnique({ where: { id: projectId }, select: { startDate: true } });
    if (!p) throw new NotFoundException('Project not found');
    const problem = openingProblem({ asOf: dto.asOf, heads: dto.heads, workDone: dto.workDone }, { startDate: dateOnly(p.startDate) }, todayIn());
    if (problem) throw new BadRequestException(problem);
    const heads = Object.fromEntries(COST_HEADS.map((h) => [h, new Dec(dto.heads[h]).toDecimalPlaces(2)])) as Record<CostHead, Prisma.Decimal>;
    const data = {
      asOf: parseDate(dto.asOf),
      ...heads,
      workDone: dto.workDone === null || dto.workDone === undefined || dto.workDone === '' ? null : new Dec(dto.workDone).toDecimalPlaces(2),
      notes: dto.notes?.trim() || null,
      updatedById: user.id,
    };
    await this.prisma.projectOpening.upsert({ where: { projectId }, create: { organizationId: user.organizationId, projectId, ...data }, update: data });
    const total = COST_HEADS.reduce((s, h) => s.plus(heads[h]), new Dec(0));
    await this.audit.log(user, 'PROJECT', projectId, 'OPENING_COST_SET', `Opening cost ${total.toFixed(2)} as of ${dto.asOf}${data.workDone ? `, work done ${data.workDone.toFixed(2)}` : ''}`);
    return this.get(user, projectId);
  }

  async remove(user: RequestUser, projectId: string): Promise<ProjectOpeningDto> {
    if (!canSetBudget(user.roleKey)) throw new ForbiddenException('Only admin, management or the project manager can remove the opening cost');
    await this.access.assertCanAccessProject(user, projectId);
    const { count } = await this.prisma.projectOpening.deleteMany({ where: { projectId } });
    if (count) await this.audit.log(user, 'PROJECT', projectId, 'OPENING_COST_REMOVED');
    return this.get(user, projectId);
  }
}
