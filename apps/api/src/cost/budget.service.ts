import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { BudgetBoqItemDto, BudgetHeadDto, CostHead, ProjectBudgetDto } from '@erp/shared';
import { COST_HEADS, canSetBudget, canViewCost } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { dec, iso, money } from '../common/serialize';
import { VariationsService } from '../variations/variations.service';
import { CostService, Heads, ZERO, total } from './cost.service';
import { SetBudgetDto } from './cost.dto';

type D = Prisma.Decimal;
const Dec = Prisma.Decimal;
const ONE = new Dec(1);
const qtyOf = (b: { originalQty: D; revisedQty: D | null }) => b.revisedQty ?? b.originalQty;

/** Budget, actual and forecast of one project, before it is turned into a DTO. */
export interface Forecast {
  projectId: string;
  heads: Heads;
  headBudget: Heads | null;
  boqBudget: D | null;
  boqValue: D;
  executed: D;
  /** 0 to 1 */
  pct: D;
  bac: D | null;
  actual: D;
  eac: D | null;
  revisedContractValue: D | null;
}

/**
 * Budget and forecast to complete (v4 item 38). A project's budget is set by cost head, and BOQ items can carry a
 * budgeted cost per unit. % complete is the executed value (approved progress × BOQ rate) over the BOQ value, the budget
 * at completion is the cost-head total (else the BOQ budget), and the forecast at completion is the actual cost to date
 * plus the budget for the work still to do.
 */
@Injectable()
export class BudgetService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private cost: CostService,
    private variations: VariationsService,
  ) {}

  /** Budget, actual and forecast for each project, all time. */
  async forecasts(organizationId: string, projects: { id: string; contractValue: D | null }[]): Promise<Map<string, Forecast>> {
    const ids = projects.map((p) => p.id);
    const [accs, boq, budgets, approved] = await Promise.all([
      this.cost.compute(organizationId, ids, undefined),
      this.prisma.boqItem.findMany({ where: { projectId: { in: ids } }, select: { projectId: true, rate: true, originalQty: true, revisedQty: true, budgetRate: true } }),
      this.prisma.projectBudget.findMany({ where: { projectId: { in: ids } } }),
      this.variations.approvedByProject(ids),
    ]);
    const budgetOf = new Map(budgets.map((b) => [b.projectId, b]));
    const out = new Map<string, Forecast>();
    for (const p of projects) {
      const acc = accs.get(p.id)!;
      let boqValue = ZERO;
      let boqBudget: D | null = null;
      for (const b of boq) {
        if (b.projectId !== p.id) continue;
        boqValue = boqValue.plus(qtyOf(b).mul(b.rate));
        if (b.budgetRate !== null) boqBudget = (boqBudget ?? ZERO).plus(qtyOf(b).mul(b.budgetRate));
      }
      const hb = budgetOf.get(p.id);
      const headBudget: Heads | null = hb ? { expenses: hb.expenses, material: hb.material, machinery: hb.machinery, labour: hb.labour, subcontract: hb.subcontract } : null;
      const pct = boqValue.gt(0) ? Dec.min(ONE, acc.executed.div(boqValue)) : ZERO;
      const bac = headBudget ? total(headBudget) : boqBudget;
      const actual = total(acc.heads);
      out.set(p.id, {
        projectId: p.id,
        heads: acc.heads,
        headBudget,
        boqBudget: boqBudget?.toDecimalPlaces(2) ?? null,
        boqValue,
        executed: acc.executed,
        pct,
        bac,
        actual,
        eac: bac ? actual.plus(bac.mul(ONE.minus(pct))).toDecimalPlaces(2) : null,
        revisedContractValue: p.contractValue ? p.contractValue.plus(approved.get(p.id) ?? ZERO) : null,
      });
    }
    return out;
  }

  async get(user: RequestUser, projectId: string): Promise<ProjectBudgetDto> {
    if (!canViewCost(user.roleKey)) throw new ForbiddenException('Project cost is for approvers and accounts');
    await this.access.assertCanAccessProject(user, projectId);
    const p = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, code: true, name: true, contractValue: true, budget: { select: { notes: true, updatedAt: true, updatedBy: { select: { fullName: true } } } } },
    });
    if (!p) throw new NotFoundException('Project not found');
    const [f, items, progress, activities] = await Promise.all([
      this.forecasts(user.organizationId, [p]).then((m) => m.get(p.id)!),
      this.prisma.boqItem.findMany({ where: { projectId }, orderBy: [{ sortOrder: 'asc' }, { itemNo: 'asc' }] }),
      this.prisma.progressEntry.groupBy({ by: ['activityId'], where: { projectId, status: 'APPROVED' }, _sum: { quantity: true } }),
      this.prisma.activity.findMany({ where: { projectId, boqItemId: { not: null } }, select: { id: true, boqItemId: true } }),
    ]);
    const boqOfActivity = new Map(activities.map((a) => [a.id, a.boqItemId!]));
    const executedQty = new Map<string, D>();
    for (const g of progress) {
      const id = boqOfActivity.get(g.activityId);
      if (id) executedQty.set(id, (executedQty.get(id) ?? ZERO).plus(g._sum.quantity ?? ZERO));
    }
    const boqItems: BudgetBoqItemDto[] = items.map((b) => {
      const qty = qtyOf(b);
      const done = executedQty.get(b.id) ?? ZERO;
      return {
        boqItemId: b.id,
        itemNo: b.itemNo,
        description: b.description,
        unit: b.unit,
        qty: dec(qty)!,
        rate: money(b.rate)!,
        amount: money(qty.mul(b.rate))!,
        budgetRate: money(b.budgetRate),
        budgetAmount: b.budgetRate !== null ? money(qty.mul(b.budgetRate)) : null,
        plannedMarginPct: b.budgetRate !== null && b.rate.gt(0) ? Math.round(b.rate.minus(b.budgetRate).div(b.rate).mul(1000).toNumber()) / 10 : null,
        executedQty: dec(done)!,
        earnedBudget: b.budgetRate !== null ? money(done.mul(b.budgetRate)) : null,
      };
    });
    const heads: BudgetHeadDto[] = COST_HEADS.map((head: CostHead) => {
      const budget = f.headBudget?.[head] ?? null;
      const actual = f.heads[head];
      const earned = budget ? budget.mul(f.pct) : null;
      return {
        head,
        budget: money(budget),
        actual: money(actual)!,
        earned: money(earned),
        forecast: budget ? money(actual.plus(budget.minus(earned!))) : null,
        variance: earned ? money(earned.minus(actual)) : null,
      };
    });
    const earned = f.bac ? f.bac.mul(f.pct) : null;
    return {
      projectId: p.id,
      projectCode: p.code,
      projectName: p.name,
      hasHeadBudget: !!f.headBudget,
      heads,
      boqBudget: money(f.boqBudget),
      boqItems,
      itemsWithoutBudgetRate: items.filter((b) => b.budgetRate === null && qtyOf(b).gt(0)).length,
      boqValue: money(f.boqValue)!,
      executedValue: money(f.executed)!,
      pctComplete: Math.round(f.pct.mul(1000).toNumber()) / 10,
      budgetAtCompletion: money(f.bac),
      earnedBudget: money(earned),
      actualCost: money(f.actual)!,
      costVariance: earned ? money(earned.minus(f.actual)) : null,
      forecastAtCompletion: money(f.eac),
      forecastToComplete: f.eac ? money(f.eac.minus(f.actual)) : null,
      revisedContractValue: money(f.revisedContractValue),
      forecastMargin: f.eac && f.revisedContractValue ? money(f.revisedContractValue.minus(f.eac)) : null,
      notes: p.budget?.notes ?? null,
      updatedAt: iso(p.budget?.updatedAt ?? null),
      updatedByName: p.budget?.updatedBy.fullName ?? null,
    };
  }

  async set(user: RequestUser, projectId: string, dto: SetBudgetDto): Promise<ProjectBudgetDto> {
    if (!canSetBudget(user.roleKey)) throw new ForbiddenException('Only admin, management or the project manager can set the budget');
    await this.access.assertCanAccessProject(user, projectId);
    const amount = (v: string, what: string) => {
      const n = new Dec(v).toDecimalPlaces(2);
      if (n.isNegative()) throw new BadRequestException(`${what} cannot be negative`);
      return n;
    };
    const heads = dto.heads ? Object.fromEntries(COST_HEADS.map((h) => [h, amount(dto.heads![h], 'A budget')])) as Record<CostHead, D> : dto.heads;
    const items = dto.items ?? [];
    if (new Set(items.map((i) => i.boqItemId)).size !== items.length) throw new BadRequestException('A BOQ item is listed twice');
    if (items.length) {
      const found = await this.prisma.boqItem.count({ where: { projectId, id: { in: items.map((i) => i.boqItemId) } } });
      if (found !== items.length) throw new BadRequestException('A BOQ item is not in this project');
    }
    const notes = dto.notes === undefined ? undefined : dto.notes?.trim() || null;
    await this.prisma.$transaction(async (tx) => {
      if (heads === null) await tx.projectBudget.deleteMany({ where: { projectId } });
      else if (heads)
        await tx.projectBudget.upsert({
          where: { projectId },
          create: { organizationId: user.organizationId, projectId, ...heads, notes: notes ?? null, updatedById: user.id },
          update: { ...heads, ...(notes !== undefined ? { notes } : {}), updatedById: user.id },
        });
      else if (notes !== undefined) await tx.projectBudget.updateMany({ where: { projectId }, data: { notes, updatedById: user.id } });
      for (const i of items) await tx.boqItem.update({ where: { id: i.boqItemId }, data: { budgetRate: i.budgetRate === null ? null : amount(i.budgetRate, 'A budget rate') } });
    });
    const what = [heads === null ? 'cost-head budget removed' : heads ? `cost-head budget ${total(heads as Heads).toFixed(2)}` : null, items.length ? `${items.length} BOQ budget rate(s)` : null].filter(Boolean).join(', ');
    await this.audit.log(user, 'PROJECT', projectId, 'BUDGET_UPDATED', what || null);
    return this.get(user, projectId);
  }
}
