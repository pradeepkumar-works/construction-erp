import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { HomeTrendsDto, MyWorkCard, MyWorkDto, MyWorkItem, SubmissionType } from '@erp/shared';
import {
  COMPLIANCE_DOC_KIND_LABELS,
  canApprove,
  canKeepStock,
  canManageStore,
  canViewCompliance,
  canViewContract,
  canViewCost,
  canViewPayables,
  canViewPurchaseOrders,
  submissionHref,
  submitsDpr,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { SubmissionLifecycleService } from '../common/submission-lifecycle.service';
import { ApprovalRightsService } from '../common/approval-rights.service';
import { money, parseDate } from '../common/serialize';
import { todayIn } from '../notifications/time';
import { ReceivablesService } from '../receivables/receivables.service';
import { PayablesService } from '../payables/payables.service';
import { CostService } from '../cost/cost.service';
import { PurchaseOrdersService } from '../purchasing/purchase-orders.service';
import { ComplianceService } from '../compliance/compliance.service';
import { StockService } from '../stock/stock.service';
import { ProjectsService } from '../projects/projects.service';

type D = Prisma.Decimal;
const ZERO = new Prisma.Decimal(0);
const TOP = 3;
const monthOf = (d: Date) => d.toISOString().slice(0, 7);
const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
const card = (count: number, items: MyWorkItem[], amount: D | null = null): MyWorkCard => ({ count, amount: amount === null ? null : money(amount)!, items: items.slice(0, TOP) });

/** The last `n` months up to and including the one `today` is in, oldest first (YYYY-MM). */
export function lastMonths(today: string, n: number): string[] {
  const [y, m] = today.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

/** Last day of a YYYY-MM month, as a UTC date. */
const monthEnd = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0));
};

/**
 * The home page (UI roadmap item 59): My work, what the caller's role can act on, and six months of trends for the
 * KPI tiles and charts. Each part is gated by the same permission helpers as the module it summarises.
 */
@Injectable()
export class HomeService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private lifecycle: SubmissionLifecycleService,
    private rights: ApprovalRightsService,
    private receivables: ReceivablesService,
    private payables: PayablesService,
    private cost: CostService,
    private purchaseOrders: PurchaseOrdersService,
    private compliance: ComplianceService,
    private stock: StockService,
    private projectsService: ProjectsService,
  ) {}

  async myWork(user: RequestUser): Promise<MyWorkDto> {
    const role = user.roleKey;
    const today = todayIn();
    const rights = await this.rights.rightsFor(user.organizationId, role);
    const [pending, missing, sentBack, receivables, payables, expiring, expired, late, low] = await Promise.all([
      rights.length ? this.lifecycle.pending(user) : null,
      canApprove(role) || submitsDpr(role) ? this.dprsMissing(user, today) : null,
      this.lifecycle.mine(user, ['REJECTED', 'CHANGES_REQUESTED']),
      canViewContract(role) ? this.receivables.summary(user) : null,
      canViewPayables(role) ? this.payables.summary(user) : null,
      canViewCompliance(role) ? this.compliance.list(user, { state: 'EXPIRING' }) : null,
      canViewCompliance(role) ? this.compliance.list(user, { state: 'EXPIRED' }) : null,
      canViewPurchaseOrders(role) ? this.purchaseOrders.status(user, { show: 'LATE' }) : null,
      canKeepStock(role) || canManageStore(role) ? this.stock.balances(user, { lowOnly: true, page: 1, pageSize: TOP }) : null,
    ]);

    const out: MyWorkDto = {};
    if (pending) {
      const counts = new Map<SubmissionType, number>();
      for (const p of pending) counts.set(p.type, (counts.get(p.type) ?? 0) + 1);
      out.approvals = [...counts.entries()].map(([type, count]) => ({ type, count }));
    }
    if (missing) out.dprsMissing = card(missing.length, missing.map((p) => ({ label: p.name, note: `No DPR for today`, projectName: null, amount: null, href: `/projects/${p.id}?tab=dpr` })));
    out.sentBack = card(
      sentBack.length,
      sentBack.map((s) => ({ label: s.title, note: 'Sent back to you', projectName: s.projectName, amount: s.amount, href: submissionHref(s.type, s.id) })),
    );
    if (receivables) {
      const open = [...receivables.openBills].sort((a, b) => b.daysOutstanding - a.daysOutstanding);
      out.receivables = card(
        open.length,
        open.map((b) => ({
          label: [b.billLabel, b.clientName].filter(Boolean).join(' · '),
          note: b.daysOutstanding === 0 ? 'Sent today' : `${days(b.daysOutstanding)} outstanding`,
          projectName: b.projectName,
          amount: b.outstanding,
          href: `/bills/${b.billId}`,
        })),
        new Prisma.Decimal(receivables.totals.outstanding),
      );
    }
    if (payables) {
      const due = payables.openBills.filter((b) => b.daysToDue <= 7);
      out.payablesDue = card(
        due.length,
        due.map((b) => ({
          label: `${b.billLabel} · ${b.vendorName}`,
          note: b.daysToDue < 0 ? `${days(-b.daysToDue)} overdue` : b.daysToDue === 0 ? 'Due today' : `Due in ${days(b.daysToDue)}`,
          projectName: b.projectName,
          amount: b.outstanding,
          href: '/payables',
        })),
        due.reduce((s, b) => s.add(b.outstanding), ZERO),
      );
    }
    if (expiring && expired) {
      const docs = [...expired.items, ...expiring.items].sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));
      out.expiring = card(
        docs.length,
        docs.map((d) => ({
          label: `${d.category ?? COMPLIANCE_DOC_KIND_LABELS[d.kind]} · ${d.reference}`,
          note: (d.daysLeft ?? 0) < 0 ? `Expired ${days(-(d.daysLeft ?? 0))} ago` : d.daysLeft === 0 ? 'Expires today' : `Expires in ${days(d.daysLeft ?? 0)}`,
          projectName: d.projectName,
          amount: d.amount,
          href: '/compliance',
        })),
      );
    }
    if (late) {
      out.lateDeliveries = card(
        late.rows.length,
        late.rows.map((r) => ({ label: `${r.poNo} · ${r.vendorName}`, note: `${days(r.daysLate)} late`, projectName: r.projectName, amount: r.pendingValue, href: `/purchase-orders/${r.purchaseOrderId}` })),
        late.rows.reduce((s, r) => s.add(r.pendingValue), ZERO),
      );
    }
    if (low) {
      out.lowStock = card(
        low.total,
        low.items.map((b) => ({ label: b.itemName, note: `${b.balance} ${b.unit} left, minimum ${b.minQty ?? '-'}`, projectName: b.projectName, amount: null, href: '/stock' })),
      );
    }
    return out;
  }

  private async dprsMissing(user: RequestUser, today: string) {
    const projects = await this.prisma.project.findMany({
      where: { ...this.access.projectWhere(user), status: 'ACTIVE', dailyReports: { none: { date: parseDate(today) } } },
      select: { id: true, name: true },
      orderBy: { code: 'asc' },
    });
    return projects;
  }

  async trends(user: RequestUser): Promise<HomeTrendsDto> {
    const role = user.roleKey;
    const months = lastMonths(todayIn(), 6);
    const from = parseDate(`${months[0]}-01`);
    const to = monthEnd(months[months.length - 1]);
    const window = { gte: from, lte: to };
    const projects = await this.projectsService.listAll(user);
    const ids = projects.map((p) => p.id);
    const inProjects = { organizationId: user.organizationId, projectId: { in: ids } };
    const seesBills = canViewContract(role);

    const [progress, dprs, bills, receipts, payments, cost, activities, billedToDate] = await Promise.all([
      this.prisma.progressEntry.findMany({ where: { ...inProjects, status: 'APPROVED' }, select: { date: true, quantity: true, activity: { select: { id: true, boqItem: { select: { rate: true } } } } } }),
      this.prisma.dailyReport.findMany({ where: { ...inProjects, status: 'APPROVED', date: window }, select: { date: true } }),
      seesBills ? this.prisma.raBill.findMany({ where: { ...inProjects, status: 'APPROVED', billDate: window }, select: { billDate: true, grossAmount: true } }) : null,
      seesBills ? this.prisma.receipt.findMany({ where: { ...inProjects, receiptDate: window }, select: { receiptDate: true, amount: true } }) : null,
      canViewPayables(role) ? this.prisma.vendorPayment.findMany({ where: { ...inProjects, paymentDate: window }, select: { paymentDate: true, amount: true } }) : null,
      canViewCost(role) ? this.cost.monthly(user, { from: `${months[0]}-01`, to: to.toISOString().slice(0, 10) }) : null,
      this.prisma.activity.findMany({
        where: { ...inProjects, plannedStart: { not: null }, plannedEnd: { not: null }, boqItemId: { not: null } },
        select: { id: true, plannedQty: true, plannedStart: true, plannedEnd: true, boqItem: { select: { rate: true } } },
      }),
      seesBills ? this.prisma.raBill.groupBy({ by: ['projectId'], where: { ...inProjects, status: 'APPROVED' }, _sum: { grossAmount: true } }) : null,
    ]);

    const byMonth = <T>(rows: T[], date: (r: T) => Date, value: (r: T) => D) => {
      const m = new Map<string, D>();
      for (const r of rows) m.set(monthOf(date(r)), (m.get(monthOf(date(r))) ?? ZERO).add(value(r)));
      return months.map((k) => money(m.get(k) ?? ZERO)!);
    };
    const valueOf = (p: (typeof progress)[number]) => (p.activity.boqItem ? p.quantity.mul(p.activity.boqItem.rate) : ZERO);
    const inWindow = progress.filter((p) => p.date >= from && p.date <= to);

    const out: HomeTrendsDto = {
      months,
      workDone: byMonth(inWindow, (p) => p.date, valueOf),
      dprs: months.map((k) => dprs.filter((d) => monthOf(d.date) === k).length),
      sCurve: this.sCurve(activities, progress, todayIn()),
    };
    if (bills) out.billed = byMonth(bills, (b) => b.billDate, (b) => b.grossAmount);
    if (receipts) out.cashIn = byMonth(receipts, (r) => r.receiptDate, (r) => r.amount);
    if (payments) out.cashOut = byMonth(payments, (p) => p.paymentDate, (p) => p.amount);
    if (cost) {
      out.cost = months.map((k) => money(cost.months.get(k) ?? ZERO)!);
      out.costByHead = cost.heads;
    }
    if (billedToDate) {
      const billed = new Map(billedToDate.map((b) => [b.projectId, b._sum.grossAmount ?? ZERO]));
      out.billingVsContract = projects
        .filter((p) => p.revisedContractValue && Number(p.revisedContractValue) > 0)
        .map((p) => ({ projectId: p.id, projectCode: p.code, projectName: p.name, contractValue: p.revisedContractValue!, billed: money(billed.get(p.id) ?? ZERO)! }))
        .sort((a, b) => a.projectCode.localeCompare(b.projectCode));
    }
    return out;
  }

  /**
   * Planned value spread evenly over each activity's planned dates, against approved work to date, both cumulative as %
   * of the planned total, at each month end from the first planned start to the last planned end (at most 36 months).
   */
  private sCurve(
    activities: { id: string; plannedQty: D; plannedStart: Date | null; plannedEnd: Date | null; boqItem: { rate: D } | null }[],
    progress: { date: Date; quantity: D; activity: { id: string; boqItem: { rate: D } | null } }[],
    today: string,
  ): HomeTrendsDto['sCurve'] {
    const planned = activities
      .filter((a) => a.boqItem && a.plannedStart && a.plannedEnd)
      .map((a) => ({ id: a.id, value: a.plannedQty.mul(a.boqItem!.rate), start: a.plannedStart!.getTime(), end: a.plannedEnd!.getTime() + 86_400_000 }));
    const totalPlanned = planned.reduce((s, a) => s.add(a.value), ZERO);
    if (!planned.length || totalPlanned.lte(0)) return [];
    const ids = new Set(planned.map((a) => a.id));
    const done = progress.filter((p) => ids.has(p.activity.id) && p.activity.boqItem).map((p) => ({ at: p.date.getTime(), value: p.quantity.mul(p.activity.boqItem!.rate) }));
    const first = monthOf(new Date(Math.min(...planned.map((a) => a.start))));
    const last = monthOf(new Date(Math.max(...planned.map((a) => a.end - 86_400_000))));
    const thisMonth = today.slice(0, 7);
    const span: string[] = [];
    for (let m = first; m <= last && span.length < 36; ) {
      span.push(m);
      const [y, mo] = m.split('-').map(Number);
      m = new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 7);
    }
    const pct = (v: D) => Math.round(v.div(totalPlanned).mul(1000).toNumber()) / 10;
    return span.map((month) => {
      const cut = monthEnd(month).getTime() + 86_400_000;
      const plannedTo = planned.reduce((s, a) => s.add(a.value.mul(Math.min(1, Math.max(0, (cut - a.start) / (a.end - a.start))))), ZERO);
      const actualTo = month <= thisMonth ? done.filter((d) => d.at < cut).reduce((s, d) => s.add(d.value), ZERO) : null;
      return { month, planned: pct(plannedTo), actual: actualTo === null ? null : pct(actualTo) };
    });
  }
}
