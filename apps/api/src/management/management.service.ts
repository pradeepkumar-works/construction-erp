import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  COST_HEADS,
  COST_HEAD_LABELS,
  canSeeCashForecast,
  canSeeManagement,
  revisedCompletion,
  type AttentionItemDto,
  type PendingApprovalDto,
  type PortfolioDto,
  type PortfolioMonthDto,
  type PortfolioProjectDetailDto,
  type PortfolioProjectDto,
  type PortfolioTotalsDto,
  type PortfolioVerticalDto,
  type ProjectSummary,
  byVertical,
  inVertical,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { SubmissionLifecycleService } from '../common/submission-lifecycle.service';
import { dateOnly, money, parseDate } from '../common/serialize';
import { todayIn } from '../notifications/time';
import { ProjectsService } from '../projects/projects.service';
import { MastersService } from '../masters/masters.service';
import { ReceivablesService } from '../receivables/receivables.service';
import { invoiceOf, RECEIPT_SUMS, settlement } from '../receivables/bill-settlement';
import { BudgetService } from '../cost/budget.service';
import { CostService, total } from '../cost/cost.service';
import { CashForecastService } from '../cash-forecast/cash-forecast.service';
import { plannedProgress } from '../dashboard/dashboard.service';
import { approvalAgeing, byUrgency, contractWorkDone, daysBetween, forecastCost, healthOf, lastMonths, paidWork, pctOf, scheduleOf, unbilledDays, workDoneValue } from './management-rules';

const N = (v: Prisma.Decimal | number | string | null | undefined) => Number(v ?? 0);
const m = (n: number) => money(new Prisma.Decimal(n.toFixed(2)));

/** Everything one project's row is built from, before it is a DTO. */
interface Built {
  rows: PortfolioProjectDto[];
  pending: PendingApprovalDto[];
}

/**
 * Management dashboard (ARCHITECTURE "Management dashboard and reports"): every contract project the caller sees, with
 * its schedule, the money from work done through to cash, cost and what is committed, approvals waiting and risks open,
 * and why it needs attention. Figures come from the modules' own services (projects, receivables, budget and cost, the
 * approvals queue, the cash forecast); the arithmetic is `management-rules.ts`.
 */
@Injectable()
export class ManagementService {
  constructor(
    private prisma: PrismaService,
    private projects: ProjectsService,
    private receivables: ReceivablesService,
    private budget: BudgetService,
    private cost: CostService,
    private lifecycle: SubmissionLifecycleService,
    private cash: CashForecastService,
    private masters: MastersService,
  ) {}

  assertSee(user: RequestUser) {
    if (!canSeeManagement(user.roleKey)) throw new ForbiddenException('The management dashboard is for management, accounts and project managers');
  }

  /** The contract projects the caller sees, as the project list has them: a store or yard and an RMC plant have no
   *  contract, schedule or client bills. */
  async contractProjects(user: RequestUser, projectId?: string, vertical?: string): Promise<ProjectSummary[]> {
    const all = await this.projects.listAll(user);
    return all.filter((p) => p.type !== 'STORE' && p.type !== 'PLANT' && (!projectId || p.id === projectId) && inVertical(p.verticalCode, vertical));
  }

  /** The portfolio's money by vertical (item 167), in the master's order. */
  private async byVertical(organizationId: string, rows: PortfolioProjectDto[]): Promise<PortfolioVerticalDto[]> {
    const verticals = await this.masters.entriesFor(organizationId, 'vertical');
    return byVertical(rows, (r) => r.verticalCode, verticals).map((g) => {
      const sum = (k: keyof PortfolioProjectDto['money']) => g.rows.reduce((s, r) => s + N(r.money[k] as string | null), 0);
      const workDone = sum('workDone');
      const margin = sum('margin');
      return {
        code: g.code,
        name: g.name,
        projects: g.rows.length,
        contractValue: m(sum('contractValue')),
        orderBook: m(g.rows.reduce((s, r) => s + (r.money.contractValue ? Math.max(0, N(r.money.contractValue) - N(r.money.billed)) : 0), 0)),
        workDone: m(workDone),
        billed: m(sum('billed')),
        outstanding: m(sum('outstanding')),
        cost: m(sum('cost')),
        margin: m(margin),
        marginPct: pctOf(margin, workDone),
      };
    });
  }

  async portfolio(user: RequestUser, vertical?: string): Promise<PortfolioDto> {
    this.assertSee(user);
    const today = todayIn();
    const projects = await this.contractProjects(user, undefined, vertical);
    const ids = projects.map((p) => p.id);
    const months = lastMonths(today, 12);
    const [{ rows, pending }, trend, forecast] = await Promise.all([
      this.build(user, projects, today),
      this.months(user.organizationId, ids, months),
      canSeeCashForecast(user.roleKey) ? this.cash.forecast(user).catch(() => null) : Promise.resolve(null),
    ]);
    const sum = (k: keyof PortfolioProjectDto['money']) => rows.reduce((s, r) => s + N(r.money[k] as string | null), 0);
    const contractValue = sum('contractValue');
    const billed = sum('billed');
    const workDone = sum('workDone');
    const margin = sum('margin');
    const totals: PortfolioTotalsDto = {
      projects: rows.length,
      active: rows.filter((r) => r.status === 'ACTIVE').length,
      contractValue: m(contractValue),
      orderBook: m(rows.reduce((s, r) => s + (r.money.contractValue ? Math.max(0, N(r.money.contractValue) - N(r.money.billed)) : 0), 0)),
      workDone: m(workDone),
      measured: m(sum('measured')),
      billed: m(billed),
      certified: m(sum('certified')),
      paid: m(sum('paid')),
      unbilled: m(sum('unbilled')),
      outstanding: m(sum('outstanding')),
      over90: m(sum('over90')),
      retentionHeld: m(sum('retentionHeld')),
      received: m(sum('received')),
      cost: m(sum('cost')),
      committed: m(sum('committed')),
      margin: m(margin),
      marginPct: pctOf(margin, workDone),
    };
    const attention: AttentionItemDto[] = rows
      .flatMap((r) => r.reasons.map((x) => ({ projectId: r.projectId, projectCode: r.code, projectName: r.name, level: x.level, key: x.key, text: x.text })))
      .sort(byUrgency);
    return {
      asOf: today,
      vertical: vertical || null,
      totals,
      verticals: await this.byVertical(user.organizationId, rows),
      projects: rows,
      approvals: approvalAgeing(pending, today),
      months: trend,
      cash: forecast ? { today: forecast.opening.total, lowest: forecast.lowest.closing.likely, lowestWeek: forecast.lowest.week, firstShort: forecast.firstShort } : null,
      attention,
    };
  }

  async project(user: RequestUser, projectId: string): Promise<PortfolioProjectDetailDto> {
    this.assertSee(user);
    const today = todayIn();
    const [project] = await this.contractProjects(user, projectId);
    if (!project) throw new NotFoundException('Project not found');
    const months = lastMonths(today, 12);
    const since = parseDate(`${months[0]}-01`);
    const [{ rows, pending }, trend, forecasts, executed, receivables, risks, pos, wos] = await Promise.all([
      this.build(user, [project], today),
      this.months(user.organizationId, [projectId], months),
      this.budget.forecasts(user.organizationId, [{ id: projectId, contractValue: project.contractValue ? new Prisma.Decimal(project.contractValue) : null }]),
      this.cost.compute(user.organizationId, [projectId], { gte: since }),
      this.receivables.summary(user, { projectId }),
      this.prisma.risk.findMany({ where: { projectId, status: { not: 'CLOSED' } }, orderBy: [{ score: 'desc' }, { riskNo: 'asc' }], select: { id: true, riskNo: true, title: true, kind: true, score: true, daysLost: true, dueDate: true } }),
      this.prisma.purchaseOrder.findMany({
        where: { projectId, status: 'APPROVED', closedAt: null },
        select: { id: true, poNo: true, poDate: true, subtotal: true, freight: true, vendor: { select: { name: true } }, vendorBills: { where: { status: 'APPROVED' }, select: { subtotal: true, freight: true } } },
        orderBy: { poDate: 'desc' },
      }),
      this.prisma.workOrder.findMany({
        where: { projectId, status: 'APPROVED', closedAt: null },
        select: { id: true, woNo: true, woDate: true, value: true, vendor: { select: { name: true } }, bills: { where: { status: 'APPROVED' }, select: { grossAmount: true } } },
        orderBy: { woDate: 'desc' },
      }),
    ]);
    const f = forecasts.get(projectId)!;
    const done = project.physicalProgressPct;
    const heads = COST_HEADS.map((h) => {
      const budget = f.headBudget ? N(f.headBudget[h]) : null;
      const actual = N(f.heads[h]);
      const fc = forecastCost(actual, budget, done);
      return { head: h, label: COST_HEAD_LABELS[h], budget: budget === null ? null : m(budget), actual: m(actual), forecast: fc === null ? null : m(fc) };
    });
    const acc = executed.get(projectId)!;
    const orders = [
      ...pos.map((p) => {
        const value = N(p.subtotal) + N(p.freight);
        const billed = p.vendorBills.reduce((s, b) => s + N(b.subtotal) + N(b.freight), 0);
        return { kind: 'PO' as const, id: p.id, number: p.poNo, vendorName: p.vendor.name, date: dateOnly(p.poDate), value: m(value), billed: m(billed), open: m(Math.max(0, value - billed)) };
      }),
      ...wos.map((w) => {
        const value = N(w.value);
        const billed = w.bills.reduce((s, b) => s + N(b.grossAmount), 0);
        return { kind: 'WO' as const, id: w.id, number: w.woNo, vendorName: w.vendor.name, date: dateOnly(w.woDate), value: m(value), billed: m(billed), open: m(Math.max(0, value - billed)) };
      }),
    ].filter((o) => N(o.open) > 0);
    return {
      asOf: today,
      project: rows[0],
      heads,
      months: trend.map((t) => ({ ...t, workDone: m(N(acc.months.get(t.month)?.executed)) })),
      openBills: receivables.openBills.map((b) => ({ billId: b.billId, label: b.billLabel, stage: b.stage, sentDate: b.sentDate, outstanding: b.outstanding, daysOutstanding: b.daysOutstanding })),
      waiting: pending.map((p) => ({ type: p.type, id: p.id, title: p.title, submittedByName: p.submittedByName, submittedAt: p.submittedAt, days: Math.max(0, daysBetween(p.submittedAt.slice(0, 10), today)), amount: p.amount })),
      risks: risks.map((r) => ({ id: r.id, riskNo: r.riskNo, title: r.title, kind: r.kind, score: r.score, daysLost: r.daysLost, dueDate: dateOnly(r.dueDate) })),
      orders,
    };
  }

  /** The rows of the dashboard for these projects, in their list order, and every entry waiting in them. */
  async build(user: RequestUser, projects: ProjectSummary[], today: string): Promise<Built> {
    const ids = projects.map((p) => p.id);
    if (!ids.length) return { rows: [], pending: [] };
    const organizationId = user.organizationId;
    const [extra, boq, activities, progress, measured, bills, receivables, forecasts, pos, wos, risks, submitted] = await Promise.all([
      this.prisma.project.findMany({ where: { id: { in: ids } }, select: { id: true, lumpSumValue: true, client: { select: { name: true } }, risks: { where: { eotGrantedDays: { not: null } }, select: { eotGrantedDays: true } } } }),
      this.prisma.boqItem.findMany({ where: { projectId: { in: ids } }, select: { id: true, projectId: true, rate: true, originalQty: true, revisedQty: true } }),
      this.prisma.activity.findMany({ where: { projectId: { in: ids } }, select: { id: true, projectId: true, boqItemId: true, plannedQty: true, plannedStart: true, plannedEnd: true, _count: { select: { subActivities: true } } } }),
      this.prisma.progressEntry.groupBy({ by: ['activityId'], where: { organizationId, projectId: { in: ids }, status: 'APPROVED' }, _sum: { quantity: true } }),
      this.prisma.measurementSheet.groupBy({ by: ['boqItemId'], where: { organizationId, projectId: { in: ids }, status: 'APPROVED' }, _sum: { totalQty: true } }),
      this.prisma.raBill.findMany({
        where: { organizationId, projectId: { in: ids }, status: 'APPROVED' },
        select: { projectId: true, grossAmount: true, pvAmount: true, gstAmount: true, stage: true, certifiedDate: true, measuredUpTo: true, receipts: { select: RECEIPT_SUMS } },
      }),
      this.receivables.summary(user),
      this.budget.forecasts(organizationId, projects.map((p) => ({ id: p.id, contractValue: p.contractValue ? new Prisma.Decimal(p.contractValue) : null }))),
      this.prisma.purchaseOrder.findMany({
        where: { organizationId, projectId: { in: ids }, status: 'APPROVED', closedAt: null },
        select: { projectId: true, subtotal: true, freight: true, vendorBills: { where: { status: 'APPROVED' }, select: { subtotal: true, freight: true } } },
      }),
      this.prisma.workOrder.findMany({
        where: { organizationId, projectId: { in: ids }, status: 'APPROVED', closedAt: null },
        select: { projectId: true, value: true, bills: { where: { status: 'APPROVED' }, select: { grossAmount: true } } },
      }),
      this.prisma.risk.findMany({ where: { organizationId, projectId: { in: ids }, status: { not: 'CLOSED' } }, select: { projectId: true, score: true } }),
      this.lifecycle.submitted(user),
    ]);
    const idSet = new Set(ids);
    const pending = submitted.filter((p) => idSet.has(p.projectId));
    const extraOf = new Map(extra.map((e) => [e.id, e]));
    const progressQty = new Map(progress.map((g) => [g.activityId, N(g._sum.quantity)]));
    const measuredQty = new Map(measured.map((g) => [g.boqItemId, N(g._sum.totalQty)]));
    const receivableOf = new Map(receivables.projects.map((r) => [r.projectId, r]));
    const over90Of = new Map<string, number>();
    for (const b of receivables.openBills) if (b.daysOutstanding > 90) over90Of.set(b.projectId, (over90Of.get(b.projectId) ?? 0) + N(b.outstanding));

    return {
      pending,
      rows: projects.map((p) => {
        // Work done: each BOQ item at the larger of its progress (through its activities) and its measurement.
        const items = boq.filter((b) => b.projectId === p.id);
        const acts = activities.filter((a) => a.projectId === p.id);
        const progressOfItem = new Map<string, number>();
        for (const a of acts) if (a.boqItemId) progressOfItem.set(a.boqItemId, (progressOfItem.get(a.boqItemId) ?? 0) + (progressQty.get(a.id) ?? 0));
        const e = extraOf.get(p.id);
        const boqWork = workDoneValue(items.map((b) => ({ rate: N(b.rate), progressQty: progressOfItem.get(b.id) ?? 0, measuredQty: measuredQty.get(b.id) ?? 0 })));
        const workDone = contractWorkDone(p.contractModel, boqWork, p.physicalProgressPct, e?.lumpSumValue ? N(e.lumpSumValue) : p.revisedContractValue ? N(p.revisedContractValue) : null);
        const measuredValue = items.reduce((s, b) => s + (measuredQty.get(b.id) ?? 0) * N(b.rate), 0);
        const boqValue = items.reduce((s, b) => s + N(b.revisedQty ?? b.originalQty) * N(b.rate), 0);

        // Bills: work value billed, of it certified, and of it settled by the client.
        let billed = 0;
        let certified = 0;
        let paid = 0;
        let billedUpTo: string | null = null;
        for (const b of bills) {
          if (b.projectId !== p.id) continue;
          const work = N(b.grossAmount) + N(b.pvAmount);
          billed += work;
          if (b.certifiedDate || b.stage === 'CERTIFIED' || b.stage === 'PAID') certified += work;
          paid += paidWork(work, N(invoiceOf(b)), N(settlement(b.receipts).settled));
          const upTo = dateOnly(b.measuredUpTo);
          if (!billedUpTo || upTo > billedUpTo) billedUpTo = upTo;
        }
        const unbilled = Math.max(0, workDone - billed);
        const days = unbilledDays(unbilled, billedUpTo, p.startDate, today);

        // Schedule.
        const leaves = acts.filter((a) => a._count.subActivities === 0);
        const dated = leaves.filter((a) => a.plannedStart && a.plannedEnd);
        const rates = new Map(items.map((b) => [b.id, new Prisma.Decimal(b.rate)]));
        const planned = plannedProgress(
          leaves.map((a) => ({ plannedQty: a.plannedQty.toString(), boqItemId: a.boqItemId, plannedStart: dateOnly(a.plannedStart), plannedEnd: dateOnly(a.plannedEnd) })),
          rates,
          today,
        );
        const late = leaves.filter((a) => a.plannedEnd && dateOnly(a.plannedEnd) < today && (progressQty.get(a.id) ?? 0) < N(a.plannedQty)).length;
        const plannedFinish = dated.reduce<string | null>((max, a) => {
          const e = dateOnly(a.plannedEnd)!;
          return !max || e > max ? e : max;
        }, null);
        const completionDate = revisedCompletion(p.endDate, e?.risks.reduce((s, r) => s + (r.eotGrantedDays ?? 0), 0) ?? 0);
        const schedule = scheduleOf({ status: p.status, done: p.physicalProgressPct, planned, startDate: p.startDate, completionDate, plannedFinish, late, scheduled: dated.length, today: today });

        // Cost, commitments and the forecast.
        const f = forecasts.get(p.id)!;
        const cost = N(total(f.heads));
        const committed =
          pos.filter((o) => o.projectId === p.id).reduce((s, o) => s + Math.max(0, N(o.subtotal) + N(o.freight) - o.vendorBills.reduce((t, b) => t + N(b.subtotal) + N(b.freight), 0)), 0) +
          wos.filter((o) => o.projectId === p.id).reduce((s, o) => s + Math.max(0, N(o.value) - o.bills.reduce((t, b) => t + N(b.grossAmount), 0)), 0);
        const budget = f.bac ? N(f.bac) : null;
        const fc = forecastCost(cost, budget, p.physicalProgressPct);
        const contractValue = p.revisedContractValue ? N(p.revisedContractValue) : null;
        const forecastMargin = fc !== null && contractValue !== null ? contractValue - fc : null;
        const margin = workDone - cost;

        const r = receivableOf.get(p.id);
        const waiting = pending.filter((x) => x.projectId === p.id);
        const oldestDays = waiting.length ? Math.max(...waiting.map((x) => Math.max(0, daysBetween(x.submittedAt.slice(0, 10), today)))) : null;
        const projectRisks = risks.filter((x) => x.projectId === p.id);
        const highRisks = projectRisks.filter((x) => x.score >= 15).length;
        const over90 = over90Of.get(p.id) ?? 0;
        const { level, reasons } = healthOf({
          schedule,
          contractValue,
          workDone,
          cost,
          forecastMargin,
          unbilled,
          unbilledDays: days,
          billedUpTo,
          over90,
          approvalsWaiting: waiting.length,
          approvalsOldestDays: oldestDays,
          highRisks,
        });
        return {
          projectId: p.id,
          code: p.code,
          name: p.name,
          type: p.type,
          verticalCode: p.verticalCode,
          status: p.status,
          clientName: e?.client?.name ?? p.clientName,
          projectManagerName: p.projectManagerName,
          schedule,
          money: {
            contractValue: contractValue === null ? null : m(contractValue),
            boqValue: m(boqValue),
            workDone: m(workDone),
            measured: m(measuredValue),
            billed: m(billed),
            certified: m(certified),
            paid: m(paid),
            unbilled: m(unbilled),
            billedUpTo,
            unbilledDays: days,
            outstanding: r?.outstanding ?? '0.00',
            over90: m(over90),
            retentionHeld: r?.retentionHeld ?? '0.00',
            received: r?.received ?? '0.00',
            cost: m(cost),
            committed: m(committed),
            budget: budget === null ? null : m(budget),
            forecastCost: fc === null ? null : m(fc),
            margin: m(margin),
            marginPct: pctOf(margin, workDone),
            forecastMargin: forecastMargin === null ? null : m(forecastMargin),
          },
          approvals: { waiting: waiting.length, oldestDays },
          risks: { open: projectRisks.length, high: highRisks },
          health: level,
          reasons,
        };
      }),
    };
  }

  /** Billed, received and cost by month over these projects. */
  async months(organizationId: string, ids: string[], months: string[]): Promise<PortfolioMonthDto[]> {
    const since = parseDate(`${months[0]}-01`);
    const [acc, bills, receipts] = await Promise.all([
      this.cost.compute(organizationId, ids, { gte: since }),
      this.prisma.raBill.findMany({ where: { organizationId, projectId: { in: ids }, status: 'APPROVED', billDate: { gte: since } }, select: { billDate: true, grossAmount: true, pvAmount: true } }),
      this.prisma.receipt.findMany({ where: { organizationId, projectId: { in: ids }, receiptDate: { gte: since } }, select: { receiptDate: true, amount: true } }),
    ]);
    return months.map((month) => {
      const cost = [...acc.values()].reduce((s, a) => {
        const h = a.months.get(month)?.heads;
        return s + (h ? N(total(h)) : 0);
      }, 0);
      const billed = bills.filter((b) => dateOnly(b.billDate).startsWith(month)).reduce((s, b) => s + N(b.grossAmount) + N(b.pvAmount), 0);
      const received = receipts.filter((r) => dateOnly(r.receiptDate).startsWith(month)).reduce((s, r) => s + N(r.amount), 0);
      return { month, billed: m(billed), received: m(received), cost: m(cost) };
    });
  }
}
