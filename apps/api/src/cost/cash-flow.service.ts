import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CashFlowDto, CashFlowGranularity } from '@erp/shared';
import { DEFAULT_CLIENT_PAYMENT_DAYS, canViewCost, revisedCompletion } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { dateOnly, money, parseDate } from '../common/serialize';
import { ReceivablesService } from '../receivables/receivables.service';
import { PayablesService } from '../payables/payables.service';
import { BudgetService } from './budget.service';
import { ZERO } from './cost.service';
import { CashFlowQuery } from './cost.dto';

type D = Prisma.Decimal;
const Dec = Prisma.Decimal;
const DAY = 24 * 3600 * 1000;
const PERIODS: Record<CashFlowGranularity, number> = { MONTH: 6, WEEK: 12 };
/** A project past (or without) its completion date is assumed to finish over this many days. */
const OVERRUN_DAYS = 91;

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);

interface Period {
  start: Date;
  end: Date;
  clientBills: D;
  retentionRelease: D;
  futureBilling: D;
  vendorBills: D;
  remainingBudget: D;
}

/**
 * Cash-flow forecast (v4 item 38), by month or week from today. Money in: RA bills not yet paid, expected the client's
 * payment days after they were sent; retention and deposit released at the end of the defect liability period; and the
 * work still to bill, spread evenly to completion and paid the client's payment days later, net of the deductions the
 * contract sets. Money out: vendor and subcontractor bills by due date, and the forecast to complete spread evenly to
 * completion. Anything overdue is put in the first period.
 */
@Injectable()
export class CashFlowService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private receivables: ReceivablesService,
    private payables: PayablesService,
    private budget: BudgetService,
  ) {}

  private periods(today: Date, granularity: CashFlowGranularity): Period[] {
    const out: Period[] = [];
    let start: Date;
    if (granularity === 'MONTH') start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    else start = addDays(today, -((today.getUTCDay() + 6) % 7));
    for (let i = 0; i < PERIODS[granularity]; i++) {
      const next = granularity === 'MONTH' ? new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)) : addDays(start, 7);
      out.push({ start, end: addDays(next, -1), clientBills: ZERO, retentionRelease: ZERO, futureBilling: ZERO, vendorBills: ZERO, remainingBudget: ZERO });
      start = next;
    }
    return out;
  }

  async forecast(user: RequestUser, q: CashFlowQuery): Promise<CashFlowDto> {
    if (!canViewCost(user.roleKey)) throw new ForbiddenException('The cash-flow forecast is for approvers and accounts');
    if (q.projectId) await this.access.assertCanAccessProject(user, q.projectId);
    const granularity = q.granularity ?? 'MONTH';
    const asOf = new Date().toISOString().slice(0, 10);
    const today = parseDate(asOf);
    const periods = this.periods(today, granularity);
    const horizonEnd = periods[periods.length - 1].end;
    let overdueIn = ZERO;
    let overdueOut = ZERO;
    /** The period a date falls in: overdue dates go in the first, dates past the horizon nowhere. */
    const periodOf = (d: Date) => (d < periods[0].start ? periods[0] : d > horizonEnd ? null : periods.find((p) => d <= p.end)!);

    const projects = await this.prisma.project.findMany({
      where: { ...this.access.projectWhere(user), ...(q.projectId ? { id: q.projectId } : {}) },
      select: {
        id: true,
        code: true,
        status: true,
        contractValue: true,
        endDate: true,
        clientPaymentDays: true,
        gstRate: true,
        retentionPct: true,
        securityDepositPct: true,
        tdsPct: true,
        gstTdsPct: true,
        labourCessPct: true,
        risks: { where: { eotGrantedDays: { not: null } }, select: { eotGrantedDays: true } },
      },
      orderBy: { code: 'asc' },
    });
    const ids = projects.map((p) => p.id);
    const payDays = new Map(projects.map((p) => [p.id, p.clientPaymentDays ?? DEFAULT_CLIENT_PAYMENT_DAYS]));
    const [recv, pay, unsent, billed, forecasts] = await Promise.all([
      this.receivables.summary(user, q.projectId ? { projectId: q.projectId } : {}),
      this.payables.summary(user, q.projectId ? { projectId: q.projectId } : {}),
      this.prisma.raBill.findMany({
        where: { projectId: { in: ids }, status: 'APPROVED', OR: [{ stage: 'NOT_SENT' }, { sentDate: null }] },
        select: { projectId: true, billDate: true, grossAmount: true, pvAmount: true, gstAmount: true },
      }),
      this.prisma.raBill.groupBy({ by: ['projectId'], where: { projectId: { in: ids }, status: 'APPROVED' }, _sum: { grossAmount: true } }),
      this.budget.forecasts(user.organizationId, projects),
    ]);

    // Money in: bills already approved.
    for (const b of recv.openBills) {
      const due = addDays(parseDate(b.sentDate), payDays.get(b.projectId) ?? DEFAULT_CLIENT_PAYMENT_DAYS);
      const p = periodOf(due);
      if (!p) continue;
      const amount = new Dec(b.outstanding);
      p.clientBills = p.clientBills.plus(amount);
      if (due < today) overdueIn = overdueIn.plus(amount);
    }
    for (const b of unsent) {
      const due = addDays(b.billDate, payDays.get(b.projectId) ?? DEFAULT_CLIENT_PAYMENT_DAYS);
      const p = periodOf(due);
      if (!p) continue;
      const amount = b.grossAmount.plus(b.pvAmount).plus(b.gstAmount);
      p.clientBills = p.clientBills.plus(amount);
      if (due < today) overdueIn = overdueIn.plus(amount);
    }
    for (const r of recv.projects) {
      const held = new Dec(r.retentionHeld).plus(r.depositHeld);
      if (!r.retentionReleaseDate || held.lte(0)) continue;
      const due = parseDate(r.retentionReleaseDate);
      const p = periodOf(due);
      if (!p) continue;
      p.retentionRelease = p.retentionRelease.plus(held);
      if (due < today) overdueIn = overdueIn.plus(held);
    }
    // Money out: bills already approved.
    for (const b of pay.openBills) {
      const due = parseDate(b.dueDate);
      const p = periodOf(due);
      if (!p) continue;
      const amount = new Dec(b.outstanding);
      p.vendorBills = p.vendorBills.plus(amount);
      if (due < today) overdueOut = overdueOut.plus(amount);
    }

    // Work still to do: billed and spent evenly from today to completion.
    const billedOf = new Map(billed.map((b) => [b.projectId, b._sum.grossAmount ?? ZERO]));
    const projectsWithoutBudget: CashFlowDto['projectsWithoutBudget'] = [];
    const projectsWithoutEndDate: CashFlowDto['projectsWithoutEndDate'] = [];
    /** Spread `amount` evenly over the days from..to and add each period's share (shifted by `lag` days) to `field`. */
    const spread = (amount: D, from: Date, to: Date, lag: number, field: 'futureBilling' | 'remainingBudget') => {
      const days = Math.round((to.getTime() - from.getTime()) / DAY) + 1;
      if (days <= 0 || amount.lte(0)) return;
      const perDay = amount.div(days);
      for (const p of periods) {
        const s = Math.max(from.getTime(), addDays(p.start, -lag).getTime());
        const e = Math.min(to.getTime(), addDays(p.end, -lag).getTime());
        if (e < s) continue;
        p[field] = p[field].plus(perDay.mul(Math.round((e - s) / DAY) + 1));
      }
    };
    for (const p of projects) {
      if (p.status === 'COMPLETED' || p.status === 'CLOSED') continue;
      const f = forecasts.get(p.id)!;
      const completion = revisedCompletion(dateOnly(p.endDate), p.risks.reduce((s, r) => s + (r.eotGrantedDays ?? 0), 0));
      let to = completion ? parseDate(completion) : null;
      if (!to || to < today) {
        to = addDays(today, OVERRUN_DAYS - 1);
        projectsWithoutEndDate.push({ projectId: p.id, projectCode: p.code });
      }
      if (f.revisedContractValue) {
        const remaining = Dec.max(ZERO, f.revisedContractValue.minus(billedOf.get(p.id) ?? ZERO));
        const netOfDeductions = new Dec(100).plus(p.gstRate).minus(p.retentionPct).minus(p.securityDepositPct).minus(p.tdsPct).minus(p.gstTdsPct).minus(p.labourCessPct).div(100);
        spread(remaining.mul(netOfDeductions), today, to, payDays.get(p.id)!, 'futureBilling');
      }
      if (f.eac) spread(Dec.max(ZERO, f.eac.minus(f.actual)), today, to, 0, 'remainingBudget');
      else projectsWithoutBudget.push({ projectId: p.id, projectCode: p.code });
    }

    let cumulative = ZERO;
    return {
      asOf,
      granularity,
      projectId: q.projectId ?? null,
      periods: periods.map((p) => {
        const inTotal = p.clientBills.plus(p.retentionRelease).plus(p.futureBilling);
        const outTotal = p.vendorBills.plus(p.remainingBudget);
        const net = inTotal.minus(outTotal);
        cumulative = cumulative.plus(net);
        return {
          start: dateOnly(p.start)!,
          end: dateOnly(p.end)!,
          clientBills: money(p.clientBills)!,
          retentionRelease: money(p.retentionRelease)!,
          futureBilling: money(p.futureBilling)!,
          inTotal: money(inTotal)!,
          vendorBills: money(p.vendorBills)!,
          remainingBudget: money(p.remainingBudget)!,
          outTotal: money(outTotal)!,
          net: money(net)!,
          cumulative: money(cumulative)!,
        };
      }),
      overdueIn: money(overdueIn)!,
      overdueOut: money(overdueOut)!,
      projectsWithoutBudget,
      projectsWithoutEndDate,
    };
  }
}
