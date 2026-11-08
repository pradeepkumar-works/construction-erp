import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { BudgetBoqItemDto, BudgetFigures, BudgetHeadDto, BudgetOpenVersionDto, BudgetVersionDto, CostHead, ProjectBudgetDto } from '@erp/shared';
import {
  COST_HEADS,
  approvedVersionOf,
  budgetAmountProblem,
  budgetAtCompletionOf,
  budgetChange,
  budgetDecisionProblem,
  budgetVersionProblem,
  canApproveBudget,
  canSetBudget,
  canViewCost,
  formatINR,
  isEditableBudget,
  openVersionOf,
  variationLabel,
} from '@erp/shared';
import { activityBoqOf } from '../common/boq-links';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { isUniqueViolation } from '../common/idempotency';
import { dec, iso, money } from '../common/serialize';
import { MastersService } from '../masters/masters.service';
import { NotificationsService } from '../notifications/notifications.service';
import { VariationsService } from '../variations/variations.service';
import { type Acc, CostService, Heads, ZERO, total } from './cost.service';
import { DecideBudgetDto, SaveBudgetVersionDto } from './cost.dto';

type D = Prisma.Decimal;
const Dec = Prisma.Decimal;
const ONE = new Dec(1);
const qtyOf = (b: { originalQty: D; revisedQty: D | null }) => b.revisedQty ?? b.originalQty;
const NO_HEADS = { expenses: null, material: null, machinery: null, labour: null, subcontract: null };

/** A version's cost heads; null when it has none (the five columns are all null together). */
const headsOf = (r: Record<CostHead, D | null>): Heads | null =>
  r.expenses === null ? null : { expenses: r.expenses, material: r.material!, machinery: r.machinery!, labour: r.labour!, subcontract: r.subcontract! };

/** Heads as the pure rules read them. */
const headAmounts = (h: Heads | null): Record<CostHead, string> | null => (h ? (Object.fromEntries(COST_HEADS.map((k) => [k, h[k].toString()])) as Record<CostHead, string>) : null);

const versionInclude = {
  preparedBy: { select: { fullName: true } },
  decidedBy: { select: { fullName: true } },
  variation: { select: { varNo: true } },
  lines: { select: { boqItemId: true, budgetRate: true } },
} satisfies Prisma.ProjectBudgetInclude;
type VersionRow = Prisma.ProjectBudgetGetPayload<{ include: typeof versionInclude }>;

/** One version waiting for a decision, as the Approvals inbox lists it. */
export interface BudgetToDecide {
  id: string;
  projectId: string;
  projectName: string;
  versionNo: number;
  total: string | null;
  reasonName: string | null;
  preparedByName: string;
  submittedAt: string;
}

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
  /** The opening cost in `heads` and `executed` (ARCHITECTURE "Opening cost") */
  opening: Acc['opening'];
}

/**
 * Budget and forecast to complete. A project's budget comes in versions: each is set by cost head, with a budgeted cost
 * per unit on BOQ items, and only the approved one counts (`BoqItem.budgetRate` holds its rates). % complete is the
 * executed value (approved progress × BOQ rate) over the BOQ value, the budget at completion is the cost-head total
 * (else the BOQ budget), and the forecast at completion is the actual cost to date plus the budget for the work still to do.
 */
@Injectable()
export class BudgetService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private cost: CostService,
    private variations: VariationsService,
    private masters: MastersService,
    private notifications: NotificationsService,
  ) {}

  /** Budget, actual and forecast for each project, all time, on its approved budget. */
  async forecasts(organizationId: string, projects: { id: string; contractValue: D | null }[]): Promise<Map<string, Forecast>> {
    const ids = projects.map((p) => p.id);
    const [accs, boq, budgets, approved] = await Promise.all([
      this.cost.compute(organizationId, ids, undefined),
      this.prisma.boqItem.findMany({ where: { projectId: { in: ids } }, select: { projectId: true, rate: true, originalQty: true, revisedQty: true, budgetRate: true } }),
      this.prisma.projectBudget.findMany({ where: { projectId: { in: ids }, status: 'APPROVED' } }),
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
      const headBudget = hb ? headsOf(hb) : null;
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
        opening: acc.opening,
      });
    }
    return out;
  }

  async get(user: RequestUser, projectId: string): Promise<ProjectBudgetDto> {
    if (!canViewCost(user.roleKey)) throw new ForbiddenException('Project cost is for approvers and accounts');
    await this.access.assertCanAccessProject(user, projectId);
    const p = await this.prisma.project.findUnique({ where: { id: projectId }, select: { id: true, code: true, name: true, contractValue: true } });
    if (!p) throw new NotFoundException('Project not found');
    const [f, items, progress, boqOf, rows, reasons] = await Promise.all([
      this.forecasts(user.organizationId, [p]).then((m) => m.get(p.id)!),
      this.prisma.boqItem.findMany({ where: { projectId }, orderBy: [{ sortOrder: 'asc' }, { itemNo: 'asc' }] }),
      this.prisma.progressEntry.groupBy({ by: ['activityId'], where: { projectId, status: 'APPROVED' }, _sum: { quantity: true } }),
      activityBoqOf(this.prisma, [projectId]),
      this.prisma.projectBudget.findMany({ where: { projectId }, include: versionInclude, orderBy: { versionNo: 'asc' } }),
      this.reasonNames(user.organizationId),
    ]);
    const executedQty = new Map<string, D>();
    for (const g of progress) {
      const boq = boqOf.get(g.activityId);
      if (boq) executedQty.set(boq.boqItemId, (executedQty.get(boq.boqItemId) ?? ZERO).plus((g._sum.quantity ?? ZERO).mul(boq.perUnit)));
    }
    const boqItems: BudgetBoqItemDto[] = items.map((b) => {
      const qty = qtyOf(b);
      const done = executedQty.get(b.id) ?? ZERO;
      return {
        boqItemId: b.id,
        itemNo: b.itemNo,
        description: b.description,
        unit: b.unit,
        qty: dec(qty),
        rate: money(b.rate),
        amount: money(qty.mul(b.rate)),
        budgetRate: money(b.budgetRate),
        budgetAmount: b.budgetRate !== null ? money(qty.mul(b.budgetRate)) : null,
        plannedMarginPct: b.budgetRate !== null && b.rate.gt(0) ? Math.round(b.rate.minus(b.budgetRate).div(b.rate).mul(1000).toNumber()) / 10 : null,
        executedQty: dec(done),
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
        actual: money(actual),
        earned: money(earned),
        forecast: budget ? money(actual.plus(budget.minus(earned!))) : null,
        variance: earned ? money(earned.minus(actual)) : null,
      };
    });
    const earned = f.bac ? f.bac.mul(f.pct) : null;

    const qty = new Map(items.map((b) => [b.id, qtyOf(b)]));
    const versions = rows.map((r, i) => this.versionDto(r, rows[i - 1] ?? null, qty, reasons));
    const inForceRow = approvedVersionOf(rows);
    const openRow = openVersionOf(rows);
    const open = openRow ? this.openDto(user, openRow, versions.find((v) => v.id === openRow.id)!) : null;
    return {
      projectId: p.id,
      projectCode: p.code,
      projectName: p.name,
      hasHeadBudget: !!f.headBudget,
      heads,
      boqBudget: money(f.boqBudget),
      boqItems,
      itemsWithoutBudgetRate: items.filter((b) => b.budgetRate === null && qtyOf(b).gt(0)).length,
      boqValue: money(f.boqValue),
      executedValue: money(f.executed),
      pctComplete: Math.round(f.pct.mul(1000).toNumber()) / 10,
      budgetAtCompletion: money(f.bac),
      earnedBudget: money(earned),
      actualCost: money(f.actual),
      costVariance: earned ? money(earned.minus(f.actual)) : null,
      forecastAtCompletion: money(f.eac),
      forecastToComplete: f.eac ? money(f.eac.minus(f.actual)) : null,
      revisedContractValue: money(f.revisedContractValue),
      forecastMargin: f.eac && f.revisedContractValue ? money(f.revisedContractValue.minus(f.eac)) : null,
      notes: inForceRow?.notes ?? null,
      inForce: inForceRow ? versions.find((v) => v.id === inForceRow.id)! : null,
      versions: [...versions].reverse(),
      open,
      canRevise: canSetBudget(user.roleKey) && !openRow,
    };
  }

  /** Start a revision: a copy of the version in force (blank when there is none), with the changes in `dto`. */
  async startVersion(user: RequestUser, projectId: string, dto: SaveBudgetVersionDto): Promise<ProjectBudgetDto> {
    this.assertMaySet(user);
    await this.access.assertCanAccessProject(user, projectId);
    const rows = await this.prisma.projectBudget.findMany({ where: { projectId }, include: { lines: true } });
    const open = openVersionOf(rows);
    if (open) throw new ConflictException(`Version ${open.versionNo} of the budget is still open: finish or delete it first`);
    const from = approvedVersionOf(rows);
    const versionNo = Math.max(0, ...rows.map((r) => r.versionNo)) + 1;
    try {
      await this.prisma.$transaction(async (tx) => {
        const v = await tx.projectBudget.create({
          data: {
            organizationId: user.organizationId,
            projectId,
            versionNo,
            status: 'DRAFT',
            ...(from ? { expenses: from.expenses, material: from.material, machinery: from.machinery, labour: from.labour, subcontract: from.subcontract, notes: from.notes } : NO_HEADS),
            preparedById: user.id,
          },
        });
        // With no version yet, the BOQ budget rates set before budgets had versions are the start.
        const lines = from ? from.lines : await tx.boqItem.findMany({ where: { projectId, budgetRate: { not: null } }, select: { id: true, budgetRate: true } }).then((items) => items.map((i) => ({ boqItemId: i.id, budgetRate: i.budgetRate! })));
        if (lines.length) await tx.projectBudgetLine.createMany({ data: lines.map((l) => ({ budgetId: v.id, boqItemId: l.boqItemId, budgetRate: l.budgetRate })) });
        await this.apply(tx, user, { id: v.id, projectId, versionNo }, dto);
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('Someone else started a revision of this budget just now: open it instead');
      throw e;
    }
    await this.audit.log(user, 'PROJECT', projectId, 'BUDGET_VERSION_STARTED', `Version ${versionNo}`);
    return this.get(user, projectId);
  }

  /** Change a version still being prepared, or one returned to be fixed. */
  async updateVersion(user: RequestUser, id: string, dto: SaveBudgetVersionDto): Promise<ProjectBudgetDto> {
    const v = await this.loadForChange(user, id);
    await this.prisma.$transaction((tx) => this.apply(tx, user, v, dto));
    await this.audit.log(user, 'PROJECT', v.projectId, 'BUDGET_VERSION_UPDATED', `Version ${v.versionNo}`);
    return this.get(user, v.projectId);
  }

  async submit(user: RequestUser, id: string): Promise<ProjectBudgetDto> {
    const v = await this.loadForChange(user, id);
    const problem = budgetVersionProblem({ versionNo: v.versionNo, reasonCode: v.reasonCode, reasonNote: v.reasonNote, heads: headAmounts(headsOf(v)), lines: v.lines.map((l) => ({ budgetRate: l.budgetRate.toString() })) });
    if (problem) throw new BadRequestException(problem);
    const done = await this.prisma.projectBudget.updateMany({
      where: { id, status: { in: ['DRAFT', 'RETURNED'] } },
      data: { status: 'SUBMITTED', submittedAt: new Date(), preparedById: user.id, decidedById: null, decidedAt: null, decisionNote: null },
    });
    if (!done.count) throw new ConflictException(`Version ${v.versionNo} has been sent already`);
    const dto = await this.get(user, v.projectId);
    const sent = dto.open!;
    await this.audit.log(user, 'PROJECT', v.projectId, 'BUDGET_SUBMITTED', `Version ${v.versionNo}: ${sent.total ? formatINR(sent.total) : 'BOQ rates only'}`);
    await this.notifications.handoff({
      organizationId: user.organizationId,
      projectId: v.projectId,
      roles: ['MANAGEMENT', 'ADMIN'],
      exceptUserIds: [user.id],
      title: `Budget version ${v.versionNo} of ${dto.projectName} to approve`,
      body: [sent.total ? `${formatINR(sent.total)} at completion` : null, sent.change.total.change && v.versionNo > 1 ? `${Number(sent.change.total.change) >= 0 ? 'up' : 'down'} ${formatINR(Math.abs(Number(sent.change.total.change)))}` : null, sent.reasonName, `from ${user.fullName}`]
        .filter(Boolean)
        .join(', '),
      entityType: 'BUDGET',
      entityId: id,
      email: { href: `/projects/${v.projectId}?tab=budget`, cta: 'Review the budget' },
    });
    return dto;
  }

  /** Approve a submitted version (it comes into force, the one before is superseded) or return it to be fixed. */
  async decide(user: RequestUser, id: string, dto: DecideBudgetDto): Promise<ProjectBudgetDto> {
    const v = await this.prisma.projectBudget.findFirst({ where: { id, organizationId: user.organizationId }, include: { project: { select: { name: true } } } });
    if (!v) throw new NotFoundException('Budget version not found');
    await this.access.assertCanAccessProject(user, v.projectId);
    const note = dto.note?.trim() || null;
    const problem = budgetDecisionProblem({ version: v, deciderId: user.id, deciderRole: user.roleKey, decision: dto.decision, note });
    if (problem) {
      if (!canApproveBudget(user.roleKey)) throw new ForbiddenException(problem);
      throw v.status !== 'SUBMITTED' ? new ConflictException(problem) : new BadRequestException(problem);
    }
    const now = new Date();
    const stale = new ConflictException(`Version ${v.versionNo} has been decided already`);
    if (dto.decision === 'APPROVE') {
      await this.prisma.$transaction(async (tx) => {
        const done = await tx.projectBudget.updateMany({ where: { id, status: 'SUBMITTED' }, data: { status: 'APPROVED', decidedById: user.id, decidedAt: now, approvedAt: now, decisionNote: note } });
        if (!done.count) throw stale;
        await tx.projectBudget.updateMany({ where: { projectId: v.projectId, status: 'APPROVED', id: { not: id } }, data: { status: 'SUPERSEDED' } });
        // The BOQ items carry the approved rates, so every reader of `budgetRate` reads the version in force.
        await tx.boqItem.updateMany({ where: { projectId: v.projectId }, data: { budgetRate: null } });
        await tx.$executeRaw`UPDATE "BoqItem" b SET "budgetRate" = l."budgetRate", "updatedAt" = ${now} FROM "ProjectBudgetLine" l WHERE l."budgetId" = ${id} AND b."id" = l."boqItemId"`;
      });
    } else {
      const done = await this.prisma.projectBudget.updateMany({ where: { id, status: 'SUBMITTED' }, data: { status: 'RETURNED', decidedById: user.id, decidedAt: now, decisionNote: note } });
      if (!done.count) throw stale;
    }
    const approved = dto.decision === 'APPROVE';
    await this.audit.log(user, 'PROJECT', v.projectId, approved ? 'BUDGET_APPROVED' : 'BUDGET_RETURNED', `Version ${v.versionNo}${note ? `: ${note}` : ''}`);
    await this.notifications.handoff({
      organizationId: user.organizationId,
      projectId: v.projectId,
      roles: [],
      alsoUserIds: [v.preparedById],
      exceptUserIds: [user.id],
      title: approved ? `Budget version ${v.versionNo} of ${v.project.name} approved by ${user.fullName}` : `Budget version ${v.versionNo} of ${v.project.name} returned by ${user.fullName}: fix it and send it again`,
      body: note ? (note.length > 200 ? `${note.slice(0, 199)}…` : note) : approved ? 'It is now the budget the forecast and the cash flow read.' : '',
      entityType: 'BUDGET',
      entityId: id,
      email: { href: `/projects/${v.projectId}?tab=budget`, cta: approved ? 'Open the budget' : 'Fix the budget' },
    });
    return this.get(user, v.projectId);
  }

  /** Delete a version that was never approved: a draft, or one returned and not wanted. */
  async remove(user: RequestUser, id: string): Promise<ProjectBudgetDto> {
    const v = await this.loadForChange(user, id);
    const done = await this.prisma.projectBudget.deleteMany({ where: { id, status: { in: ['DRAFT', 'RETURNED'] } } });
    if (!done.count) throw new ConflictException(`Version ${v.versionNo} has been sent for approval: it can no longer be deleted`);
    await this.audit.log(user, 'PROJECT', v.projectId, 'BUDGET_VERSION_DELETED', `Version ${v.versionNo}`);
    return this.get(user, v.projectId);
  }

  /** Versions waiting on the caller's decision, on the projects they see (none they prepared). */
  async toDecide(user: RequestUser): Promise<BudgetToDecide[]> {
    if (!canApproveBudget(user.roleKey)) return [];
    const [rows, reasons] = await Promise.all([
      this.prisma.projectBudget.findMany({
        where: { organizationId: user.organizationId, status: 'SUBMITTED', preparedById: { not: user.id }, project: this.access.projectWhere(user) },
        include: { project: { select: { name: true } }, preparedBy: { select: { fullName: true } }, lines: { select: { budgetRate: true, boqItem: { select: { originalQty: true, revisedQty: true } } } } },
        orderBy: { submittedAt: 'asc' },
      }),
      this.reasonNames(user.organizationId),
    ]);
    return rows.map((r) => {
      const heads = headsOf(r);
      const boq = r.lines.length ? r.lines.reduce((s, l) => s.plus(qtyOf(l.boqItem).mul(l.budgetRate)), ZERO) : null;
      return {
        id: r.id,
        projectId: r.projectId,
        projectName: r.project.name,
        versionNo: r.versionNo,
        total: money(heads ? total(heads) : boq),
        reasonName: r.reasonCode ? (reasons.get(r.reasonCode) ?? r.reasonCode) : null,
        preparedByName: r.preparedBy.fullName,
        submittedAt: iso(r.submittedAt ?? r.updatedAt),
      };
    });
  }

  private assertMaySet(user: RequestUser) {
    if (!canSetBudget(user.roleKey)) throw new ForbiddenException('Only admin, management or the project manager can prepare the budget');
  }

  /** A version the caller may still change: a draft or a returned one, on a project they work on. */
  private async loadForChange(user: RequestUser, id: string) {
    this.assertMaySet(user);
    const v = await this.prisma.projectBudget.findFirst({ where: { id, organizationId: user.organizationId }, include: { lines: true } });
    if (!v) throw new NotFoundException('Budget version not found');
    await this.access.assertCanAccessProject(user, v.projectId);
    if (!isEditableBudget(v.status)) throw new ConflictException(v.status === 'SUBMITTED' ? `Version ${v.versionNo} waits for approval: it can be changed once it is returned` : `Version ${v.versionNo} has been decided and cannot be changed: start a revision`);
    return v;
  }

  /** Write `dto` onto a version; whoever changes it becomes its preparer, so they cannot approve it. */
  private async apply(tx: Prisma.TransactionClient, user: RequestUser, v: { id: string; projectId: string; versionNo: number }, dto: SaveBudgetVersionDto) {
    const items = dto.items ?? [];
    const amounts = budgetAmountProblem({ heads: dto.heads ?? null, lines: items.flatMap((i) => (i.budgetRate === null ? [] : [{ budgetRate: i.budgetRate }])) });
    if (amounts) throw new BadRequestException(amounts);
    if (new Set(items.map((i) => i.boqItemId)).size !== items.length) throw new BadRequestException('A BOQ item is listed twice');
    if (items.length && (await tx.boqItem.count({ where: { projectId: v.projectId, id: { in: items.map((i) => i.boqItemId) } } })) !== items.length) throw new BadRequestException('A BOQ item is not in this project');
    const data: Prisma.ProjectBudgetUncheckedUpdateInput = { preparedById: user.id };
    if (dto.heads === null) Object.assign(data, NO_HEADS);
    else if (dto.heads) for (const h of COST_HEADS) data[h] = new Dec(dto.heads[h]).toDecimalPlaces(2);
    if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;
    // Version 1 is the first budget, so it has no reason for a revision.
    if (dto.reasonCode !== undefined) {
      const code = v.versionNo === 1 ? null : dto.reasonCode;
      if (code && !(await this.reasonNames(user.organizationId, true)).has(code)) throw new BadRequestException('Choose a reason from the list of budget revision reasons');
      data.reasonCode = code;
    }
    if (dto.reasonNote !== undefined) data.reasonNote = v.versionNo === 1 ? null : dto.reasonNote?.trim() || null;
    if (dto.variationId !== undefined) {
      if (dto.variationId && !(await tx.variation.count({ where: { id: dto.variationId, projectId: v.projectId, status: 'APPROVED' } }))) throw new BadRequestException('Choose an approved variation of this project');
      data.variationId = dto.variationId;
    }
    await tx.projectBudget.update({ where: { id: v.id }, data });
    if (items.length) {
      await tx.projectBudgetLine.deleteMany({ where: { budgetId: v.id, boqItemId: { in: items.map((i) => i.boqItemId) } } });
      const kept = items.filter((i) => i.budgetRate !== null);
      if (kept.length) await tx.projectBudgetLine.createMany({ data: kept.map((i) => ({ budgetId: v.id, boqItemId: i.boqItemId, budgetRate: new Dec(i.budgetRate!).toDecimalPlaces(2) })) });
    }
  }

  /** The company's revision reasons by code (only the ones switched on, with `activeOnly`). */
  private async reasonNames(organizationId: string, activeOnly = false): Promise<Map<string, string>> {
    return new Map((await this.masters.entriesFor(organizationId, 'budgetRevision')).filter((e) => !activeOnly || e.isActive).map((e) => [e.code, e.name]));
  }

  private figuresOf(r: VersionRow, qty: Map<string, D>): BudgetFigures {
    const heads = headsOf(r);
    return {
      heads: heads ? (Object.fromEntries(COST_HEADS.map((h) => [h, heads[h].toNumber()])) as Record<CostHead, number>) : null,
      boqBudget: r.lines.length ? r.lines.reduce((s, l) => s.plus((qty.get(l.boqItemId) ?? ZERO).mul(l.budgetRate)), ZERO).toDecimalPlaces(2).toNumber() : null,
    };
  }

  private versionDto(r: VersionRow, before: VersionRow | null, qty: Map<string, D>, reasons: Map<string, string>): BudgetVersionDto {
    const figures = this.figuresOf(r, qty);
    const t = budgetAtCompletionOf(figures);
    return {
      id: r.id,
      versionNo: r.versionNo,
      status: r.status,
      reasonCode: r.reasonCode,
      reasonName: r.reasonCode ? (reasons.get(r.reasonCode) ?? r.reasonCode) : null,
      reasonNote: r.reasonNote,
      variationId: r.variationId,
      variationNo: r.variation ? variationLabel(r.variation.varNo) : null,
      notes: r.notes,
      total: t === null ? null : t.toFixed(2),
      preparedById: r.preparedById,
      preparedByName: r.preparedBy.fullName,
      createdAt: iso(r.createdAt),
      submittedAt: iso(r.submittedAt),
      decidedByName: r.decidedBy?.fullName ?? null,
      decidedAt: iso(r.decidedAt),
      decisionNote: r.decisionNote,
      approvedAt: iso(r.approvedAt),
      change: budgetChange(before ? this.figuresOf(before, qty) : null, figures),
    };
  }

  private openDto(user: RequestUser, r: VersionRow, v: BudgetVersionDto): BudgetOpenVersionDto {
    const heads = headsOf(r);
    const lines = r.lines.map((l) => ({ boqItemId: l.boqItemId, budgetRate: money(l.budgetRate) }));
    const editable = canSetBudget(user.roleKey) && isEditableBudget(r.status);
    return {
      ...v,
      heads: heads ? (Object.fromEntries(COST_HEADS.map((h) => [h, money(heads[h])])) as Record<CostHead, string>) : null,
      lines,
      problem: budgetVersionProblem({ versionNo: r.versionNo, reasonCode: r.reasonCode, reasonNote: r.reasonNote, heads: headAmounts(heads), lines }),
      can: { edit: editable, submit: editable, decide: budgetDecisionProblem({ version: r, deciderId: user.id, deciderRole: user.roleKey }) === null, delete: editable },
    };
  }
}
