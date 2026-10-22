import { NotFoundException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ModuleFigureDto, ModuleHomeDto, ModuleKey, ModuleWaitingDto, SubmissionType } from '@erp/shared';
import {
  MODULE_SUBMISSION_TYPES,
  canMarkStaff,
  canApprovePayroll,
  canPayPayroll,
  canViewPayroll,
  canManageStaff,
  canPurchase,
  canReportSafety,
  canViewCompliance,
  canViewContract,
  canViewCost,
  canViewLabourSummary,
  canViewPayables,
  canViewPaymentRequests,
  canViewPurchaseOrders,
  canViewVariations,
  canViewWorkers,
  isCompanyWide,
  isModuleKey,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { SubmissionLifecycleService } from '../common/submission-lifecycle.service';
import { money, parseDate } from '../common/serialize';
import { todayIn } from '../notifications/time';
import { ReceivablesService } from '../receivables/receivables.service';
import { PayablesService } from '../payables/payables.service';
import { PurchaseOrdersService } from '../purchasing/purchase-orders.service';
import { ComplianceService } from '../compliance/compliance.service';
import { StockService } from '../stock/stock.service';
import { StaffService } from '../staff/staff.service';
import { PayrollRunService } from '../payroll/payroll-run.service';

type D = Prisma.Decimal;
const ZERO = new Prisma.Decimal(0);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const count = (key: string, label: string, n: number, href: string, extra: Partial<ModuleFigureDto> = {}): ModuleFigureDto => ({ key, label, value: String(n), format: 'count', href, ...extra });
const rupees = (key: string, label: string, v: string | D, href: string, extra: Partial<ModuleFigureDto> = {}): ModuleFigureDto => ({ key, label, value: typeof v === 'string' ? v : money(v)!, format: 'money', href, ...extra });

/**
 * Module home pages (v6 item 98): for one sidebar section, its figures, what waits for the caller in it, and the caller's
 * own entries sent back or waiting with others. Each figure is behind the same permission helper as the list it counts,
 * and covers the projects the caller sees, or the one project asked for.
 */
@Injectable()
export class ModuleHomeService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private lifecycle: SubmissionLifecycleService,
    private receivables: ReceivablesService,
    private payables: PayablesService,
    private purchaseOrders: PurchaseOrdersService,
    private compliance: ComplianceService,
    private stock: StockService,
    private staff: StaffService,
    private payrollRuns: PayrollRunService,
  ) {}

  async home(user: RequestUser, key: string, projectId?: string): Promise<ModuleHomeDto> {
    if (!isModuleKey(key)) throw new NotFoundException('There is no such module');
    if (projectId) await this.access.assertCanAccessProject(user, projectId);
    const today = todayIn();
    const types = new Set<SubmissionType>(MODULE_SUBMISSION_TYPES[key]);
    const inModule = <T extends { type: SubmissionType; projectId?: string | null }>(rows: T[]) =>
      rows.filter((r) => types.has(r.type) && (!projectId || !r.projectId || r.projectId === projectId));

    const [figures, pending, sentBack, waiting] = await Promise.all([
      this.figures(user, key, today, projectId),
      types.size ? this.lifecycle.pending(user) : [],
      types.size ? this.lifecycle.mine(user, ['REJECTED', 'CHANGES_REQUESTED']) : [],
      types.size ? this.lifecycle.waiting(user) : [],
    ]);

    const seesAmounts = canViewCost(user.roleKey);
    const byType = new Map<SubmissionType, { type: SubmissionType; count: number; oldestDays: number; amount: D | null }>();
    for (const p of inModule(pending)) {
      const w = byType.get(p.type) ?? { type: p.type, count: 0, oldestDays: 0, amount: null };
      w.count += 1;
      w.oldestDays = Math.max(w.oldestDays, Math.max(0, daysBetween(todayIn(undefined, new Date(p.submittedAt)), today)));
      if (seesAmounts && p.amount !== null) w.amount = (w.amount ?? ZERO).add(p.amount);
      byType.set(p.type, w);
    }
    const waitingRows: ModuleWaitingDto[] = [...byType.values()]
      .sort((a, b) => b.count - a.count || b.oldestDays - a.oldestDays)
      .map((w) => ({ ...w, amount: w.amount === null ? null : money(w.amount)! }));
    const back = new Map<SubmissionType, number>();
    for (const s of inModule(sentBack)) back.set(s.type, (back.get(s.type) ?? 0) + 1);

    return {
      module: key,
      date: today,
      figures,
      waiting: waitingRows,
      sentBack: [...back.entries()].map(([type, n]) => ({ type, count: n })),
      waitingWithOthers: inModule(waiting).length,
    };
  }

  private async figures(user: RequestUser, key: ModuleKey, today: string, projectId?: string): Promise<ModuleFigureDto[]> {
    switch (key) {
      case 'site':
        return this.site(user, today, projectId);
      case 'materials':
        return this.materials(user, today, projectId);
      case 'purchases':
        return this.purchases(user, projectId);
      case 'billing':
        return this.billing(user, projectId);
      case 'people':
        return this.people(user, today, projectId);
    }
  }

  /** The caller's projects (or the one asked for), for the counts below. */
  private where(user: RequestUser, projectId?: string) {
    return { ...this.access.submissionWhere(user), ...(projectId ? { projectId } : {}) };
  }

  private async site(user: RequestUser, today: string, projectId?: string): Promise<ModuleFigureDto[]> {
    const role = user.roleKey;
    const onSite = canReportSafety(role);
    const where = this.where(user, projectId);
    const day = parseDate(today);
    const monthStart = parseDate(`${today.slice(0, 7)}-01`);
    const [active, reported, labourSheets, labourNamed, risks, ncrs, incidents] = await Promise.all([
      this.prisma.project.findMany({ where: { ...this.access.projectWhere(user), status: 'ACTIVE', ...(projectId ? { id: projectId } : {}) }, select: { id: true } }),
      onSite ? this.prisma.dailyReport.findMany({ where: { ...where, date: day }, distinct: ['projectId'], select: { projectId: true } }) : null,
      onSite || canViewWorkers(role) ? this.prisma.attendanceSheet.aggregate({ where: { ...where, date: day }, _sum: { totalWorkers: true } }) : null,
      onSite || canViewWorkers(role) ? this.prisma.workerAttendance.count({ where: { ...where, date: day, status: { in: ['PRESENT', 'HALF_DAY'] } } }) : null,
      onSite || canViewContract(role) ? this.prisma.risk.groupBy({ by: ['kind'], where: { ...where, status: { not: 'CLOSED' } }, _count: { _all: true } }) : null,
      onSite ? this.prisma.ncr.count({ where: { ...where, status: { not: 'CLOSED' } } }) : null,
      onSite ? this.prisma.safetyIncident.count({ where: { ...where, date: { gte: monthStart, lte: day } } }) : null,
    ]);
    const out: ModuleFigureDto[] = [];
    if (reported) {
      const activeIds = new Set(active.map((p) => p.id));
      const done = reported.filter((r) => activeIds.has(r.projectId)).length;
      const missing = active.length - done;
      out.push({
        key: 'dprToday',
        label: 'Daily reports today',
        value: String(done),
        of: active.length,
        format: 'ratio',
        note: missing > 0 ? `${plural(missing, 'site')} not reported` : active.length ? 'Every active site reported' : 'No active sites',
        tone: missing > 0 ? 'warning' : 'default',
        href: '/dpr',
      });
    }
    if (labourSheets && labourNamed !== null) out.push(count('labourToday', 'Labour today', (labourSheets._sum.totalWorkers ?? 0) + labourNamed, '/attendance', { note: 'Head count and roll call' }));
    if (risks) {
      const delays = risks.find((r) => r.kind === 'DELAY')?._count._all ?? 0;
      const total = risks.reduce((s, r) => s + r._count._all, 0);
      out.push(count('openRisks', 'Open delays and risks', total, '/risks', { note: delays ? `${plural(delays, 'delay')} holding up work` : 'No open delays', tone: delays ? 'warning' : 'default' }));
    }
    if (ncrs !== null) out.push(count('openNcrs', 'Open NCRs', ncrs, '/inspections?tab=ncrs', { tone: ncrs ? 'warning' : 'default', note: ncrs ? 'Waiting for action or closing' : 'None open' }));
    if (incidents !== null) out.push(count('incidents', 'Safety incidents this month', incidents, '/safety', { tone: incidents ? 'danger' : 'default', note: incidents ? 'Reported since the 1st' : 'None since the 1st' }));
    return out;
  }

  private async materials(user: RequestUser, today: string, projectId?: string): Promise<ModuleFigureDto[]> {
    const role = user.roleKey;
    const onSite = canReportSafety(role);
    const where = this.where(user, projectId);
    const seesStock = onSite || canPurchase(role) || canViewCost(role);
    const seesMachinery = onSite || canPurchase(role);
    const [openRequests, low, jobCards, fuel] = await Promise.all([
      onSite || canPurchase(role) ? this.prisma.materialRequest.count({ where: { ...where, status: 'SUBMITTED' } }) : null,
      seesStock ? this.stock.balances(user, { lowOnly: true, page: 1, pageSize: 1, ...(projectId ? { projectId } : {}) }) : null,
      seesMachinery ? this.prisma.maintenanceJob.count({ where: { organizationId: user.organizationId, status: 'OPEN', ...(projectId ? { projectId } : { OR: [{ projectId: null }, { project: this.access.projectWhere(user) }] }) } }) : null,
      seesMachinery ? this.prisma.stockEntry.count({ where: { ...where, type: 'ISSUE', equipmentId: { not: null }, date: parseDate(today) } }) : null,
    ]);
    const out: ModuleFigureDto[] = [];
    if (openRequests !== null) out.push(count('openRequests', 'Material requests to approve', openRequests, '/material-requests', { note: 'Raised by the sites, not yet decided' }));
    if (low) out.push(count('lowStock', 'Items below minimum', low.total, '/stock?low=1', { tone: low.total ? 'warning' : 'default', note: low.total ? 'Order or transfer before they run out' : 'All above their minimum' }));
    if (jobCards !== null) out.push(count('jobCards', 'Open job cards', jobCards, '/machinery?tab=maintenance', { note: 'Services and breakdowns not closed' }));
    if (fuel !== null) out.push(count('fuelToday', 'Fuel issues today', fuel, '/machinery?tab=fuel', { note: 'Diesel issued to machines' }));
    return out;
  }

  private async purchases(user: RequestUser, projectId?: string): Promise<ModuleFigureDto[]> {
    const role = user.roleKey;
    const [orders, payables, requests] = await Promise.all([
      canViewPurchaseOrders(role) ? this.purchaseOrders.status(user, { show: 'PENDING', ...(projectId ? { projectId } : {}) }) : null,
      canViewPayables(role) ? this.payables.summary(user, projectId ? { projectId } : {}) : null,
      canViewPaymentRequests(role) ? this.prisma.paymentRequest.count({ where: { ...this.where(user, projectId), status: 'APPROVED', paidDate: null } }) : null,
    ]);
    const out: ModuleFigureDto[] = [];
    if (orders) {
      out.push(rupees('ordersOpen', 'Orders to receive', orders.totals.pendingValue, '/purchase-orders', { note: plural(orders.totals.pending, 'order') }));
      out.push(count('ordersLate', 'Late deliveries', orders.totals.late, '/purchase-orders', { tone: orders.totals.late ? 'warning' : 'default', note: orders.totals.late ? 'Past their delivery date' : 'None late' }));
    }
    if (payables) {
      const overdue = new Prisma.Decimal(payables.totals.overdue);
      out.push(rupees('payable', 'We owe', payables.totals.outstanding, '/payables', { note: '{money} due in 7 days', noteMoney: payables.totals.dueSoon }));
      out.push(rupees('payableOverdue', 'Overdue to suppliers', payables.totals.overdue, '/payables', { tone: overdue.gt(0) ? 'danger' : 'default', note: overdue.gt(0) ? 'Past their due date' : 'Nothing overdue' }));
    }
    if (requests !== null) out.push(count('requestsToPay', 'Payment requests to pay', requests, '/payables?tab=requests', { note: 'Approved, not yet paid in full' }));
    return out;
  }

  private async billing(user: RequestUser, projectId?: string): Promise<ModuleFigureDto[]> {
    const role = user.roleKey;
    const [receivables, variations, compliance] = await Promise.all([
      canViewContract(role) ? this.receivables.summary(user, projectId ? { projectId } : {}) : null,
      canViewVariations(role) ? this.prisma.variation.count({ where: { ...this.where(user, projectId), status: 'SUBMITTED' } }) : null,
      canViewCompliance(role) ? this.compliance.list(user, projectId ? { projectId } : {}) : null,
    ]);
    const out: ModuleFigureDto[] = [];
    if (receivables) {
      const t = receivables.totals;
      out.push(rupees('receivable', 'Clients owe us', t.outstanding, '/receivables', { note: '{money} billed in all', noteMoney: t.billed }));
      const notSent = new Prisma.Decimal(t.notSent);
      out.push(rupees('notSent', 'Approved, not sent', t.notSent, '/bills', { tone: notSent.gt(0) ? 'warning' : 'default', note: notSent.gt(0) ? 'Send these bills to the client' : 'Every approved bill sent' }));
      out.push(rupees('retention', 'Retention held', t.retentionHeld, '/receivables', { note: 'Deducted by clients, not yet released' }));
    }
    if (variations !== null) out.push(count('variations', 'Variations with the client', variations, '/variations', { note: 'Sent, not yet decided' }));
    if (compliance) {
      const { expiring, expired } = compliance.totals;
      out.push(count('expiring', 'Guarantees and licences expiring', expiring, '/compliance', { tone: expired ? 'danger' : expiring ? 'warning' : 'default', note: expired ? `${plural(expired, 'entry', 'entries')} already expired` : 'Within the next 30 days' }));
    }
    return out;
  }

  private async people(user: RequestUser, today: string, projectId?: string): Promise<ModuleFigureDto[]> {
    const role = user.roleKey;
    if (!canMarkStaff(role) && !canManageStaff(role) && !canViewLabourSummary(role)) return [];
    const day = parseDate(today);
    const everyone = isCompanyWide(role) || canManageStaff(role);
    const ids = projectId ? [projectId] : (await this.prisma.project.findMany({ where: this.access.projectWhere(user), select: { id: true } })).map((p) => p.id);
    const staffWhere = { organizationId: user.organizationId, ...(projectId ? { projectId } : everyone ? {} : { projectId: { in: ids } }) };
    const monthStart = parseDate(`${today.slice(0, 7)}-01`);
    const [onRoll, marks, onLeave, joined, summary] = await Promise.all([
      this.prisma.employee.count({ where: { ...staffWhere, isActive: true, OR: [{ leftOn: null }, { leftOn: { gte: day } }] } }),
      this.prisma.staffAttendance.groupBy({ by: ['status'], where: { ...staffWhere, date: day }, _count: { _all: true } }),
      this.prisma.leaveRequest.count({ where: { organizationId: user.organizationId, status: 'APPROVED', fromDate: { lte: day }, toDate: { gte: day }, employee: staffWhere } }),
      this.prisma.employee.count({ where: { ...staffWhere, joinedOn: { gte: monthStart, lte: day } } }),
      this.staff.summary(user),
    ]);
    const marked = marks.reduce((s, m) => s + m._count._all, 0);
    const absent = marks.find((m) => m.status === 'ABSENT')?._count._all ?? 0;
    const present = marked - absent;
    const unmarked = Math.max(0, onRoll - marked - onLeave);
    const out: ModuleFigureDto[] = [
      { key: 'presentToday', label: 'Staff present today', value: String(present), of: onRoll, format: 'ratio', note: unmarked ? `${plural(unmarked, 'person', 'people')} not marked yet` : 'Everyone marked', tone: unmarked ? 'warning' : 'default', href: '/staff?tab=register' },
      count('onLeave', 'On leave today', onLeave, '/staff?tab=leave', { note: absent ? `${absent} absent besides` : 'Approved leave' }),
      count('joined', 'Joined this month', joined, '/staff?tab=staff', { note: `${plural(onRoll, 'person', 'people')} on the roll` }),
    ];
    if (summary.leaveToDecide !== undefined) out.push(count('leaveToDecide', 'Leave to decide', summary.leaveToDecide, '/staff?tab=leave', { tone: summary.leaveToDecide ? 'warning' : 'default', note: summary.leaveToDecide ? 'Waiting for your decision' : 'Nothing waiting' }));
    if (summary.overtimeToDecide !== undefined) out.push(count('overtimeToDecide', 'Overtime to decide', summary.overtimeToDecide, '/staff?tab=overtime', { tone: summary.overtimeToDecide ? 'warning' : 'default', note: summary.overtimeToDecide ? 'Waiting for your decision' : 'Nothing waiting' }));
    // Salary runs (v6 item 100): drafts for HR, submitted ones for management, approved ones for accounts.
    if (canViewPayroll(role) && !projectId) {
      const runs = await this.payrollRuns.waiting(user);
      const net = runs.reduce((t, r) => t + Number(r.net), 0);
      const step = canApprovePayroll(role) && runs.some((r) => r.status === 'SUBMITTED') ? 'to approve' : canPayPayroll(role) && runs.some((r) => r.status === 'APPROVED') ? 'to pay' : 'in draft';
      out.push(count('salaryRuns', 'Salary runs waiting', runs.length, '/payroll?tab=runs', runs.length ? { tone: 'warning', note: `${runs.map((r) => r.runNo).join(', ')} ${step}: {money}`, noteMoney: String(net) } : { note: 'Nothing waiting on you' }));
    }
    return out;
  }
}
