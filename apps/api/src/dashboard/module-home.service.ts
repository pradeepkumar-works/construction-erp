import { NotFoundException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ModuleFigureDto, ModuleHomeDto, ModuleKey, ModuleProgressDto, ModuleWaitingDto, ProjectProgressDto, SubmissionType } from '@erp/shared';
import {
  MODULE_SUBMISSION_TYPES,
  canMarkStaff,
  canApprovePayroll,
  canPayPayroll,
  canViewPayroll,
  canApproveVouchers,
  canApproveMixDesign,
  canBillRmc,
  canViewRmc,
  canManageStaff,
  canPurchase,
  canReportSafety,
  canViewCompliance,
  canViewContract,
  canViewLetters,
  canViewCost,
  canViewLabourSummary,
  canViewPayables,
  canViewPaymentRequests,
  canViewPurchaseOrders,
  canViewVariations,
  canViewWorkers,
  BEHIND_TOLERANCE_PCT,
  byProgressOrder,
  contractTime,
  isCompanyWide,
  isGuest,
  isModuleKey,
  portfolioProgress,
  progressNotes,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { SubmissionLifecycleService } from '../common/submission-lifecycle.service';
import { dateOnly, money, parseDate } from '../common/serialize';
import { todayIn } from '../notifications/time';
import { ReceivablesService } from '../receivables/receivables.service';
import { PayablesService } from '../payables/payables.service';
import { PurchaseOrdersService } from '../purchasing/purchase-orders.service';
import { ComplianceService } from '../compliance/compliance.service';
import { StockService } from '../stock/stock.service';
import { StaffService } from '../staff/staff.service';
import { PayrollRunService } from '../payroll/payroll-run.service';
import { BooksService } from '../books/books.service';
import { StatementsService } from '../statements/statements.service';
import { moduleOn } from '../common/module-switch.guard';
import { ProjectsService } from '../projects/projects.service';
import { plannedProgress } from './dashboard.service';
import { CorrespondenceService } from '../correspondence/correspondence.service';
import { DesignControlService } from '../design/design-control.service';

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
    private books: BooksService,
    private statements: StatementsService,
    private projects: ProjectsService,
    private letters: CorrespondenceService,
    private designControl: DesignControlService,
  ) {}

  async home(user: RequestUser, key: string, projectId?: string): Promise<ModuleHomeDto> {
    if (!isModuleKey(key)) throw new NotFoundException('There is no such module');
    if (projectId) await this.access.assertCanAccessProject(user, projectId);
    const today = todayIn();
    const types = new Set<SubmissionType>(MODULE_SUBMISSION_TYPES[key]);
    const inModule = <T extends { type: SubmissionType; projectId?: string | null }>(rows: T[]) =>
      rows.filter((r) => types.has(r.type) && (!projectId || !r.projectId || r.projectId === projectId));

    const progress = key === 'projects' && !isGuest(user.roleKey) ? await this.progress(user, today, projectId) : undefined;
    const [figures, pending, sentBack, waiting] = await Promise.all([
      progress ? this.progressFigures(progress) : this.figures(user, key, today, projectId),
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
      ...(progress ? { progress } : {}),
    };
  }

  /**
   * Progress by project (`project-progress.ts`): every contract project the caller sees (or the header's one) that is not
   * closed, with its physical progress against the share planned by today, and for those who see bills its approved RA
   * bills against the revised contract value, the same figures My work's "Billed to date" adds up.
   */
  private async progress(user: RequestUser, today: string, projectId?: string): Promise<ModuleProgressDto> {
    const seesFinancial = canViewContract(user.roleKey);
    const projects = (await this.projects.listAll(user)).filter((p) => p.type !== 'STORE' && p.type !== 'PLANT' && p.status !== 'CLOSED' && (!projectId || p.id === projectId));
    const ids = projects.map((p) => p.id);
    const [items, activities, bills, milestones, delays, handovers] = ids.length
      ? await Promise.all([
          this.prisma.boqItem.findMany({ where: { projectId: { in: ids } }, select: { id: true, rate: true } }),
          // The leaves only: an activity with sub-activities takes no progress (Work breakdown)
          this.prisma.activity.findMany({ where: { projectId: { in: ids }, subActivities: { none: {} } }, select: { projectId: true, boqItemId: true, plannedQty: true, plannedStart: true, plannedEnd: true } }),
          seesFinancial ? this.prisma.raBill.groupBy({ by: ['projectId'], where: { organizationId: user.organizationId, projectId: { in: ids }, status: 'APPROVED' }, _sum: { grossAmount: true } }) : [],
          this.prisma.milestone.groupBy({ by: ['projectId'], where: { projectId: { in: ids } }, _max: { dueDate: true } }),
          // Extensions of time live in the delay register, as the contract's dates read them
          this.prisma.risk.findMany({ where: { projectId: { in: ids }, kind: 'DELAY', OR: [{ eotClaimed: true }, { eotGrantedDays: { not: null } }] }, select: { projectId: true, eotGrantedDays: true } }),
          this.prisma.projectHandover.findMany({ where: { projectId: { in: ids } }, select: { projectId: true, completedOn: true } }),
        ])
      : [[], [], [], [], [], []];
    const rates = new Map(items.map((b) => [b.id, new Prisma.Decimal(b.rate)]));
    const billedOf = new Map(bills.map((b) => [b.projectId, b._sum.grossAmount ?? ZERO]));
    const dueOf = new Map(milestones.map((m) => [m.projectId, dateOnly(m._max.dueDate)]));
    const completedOf = new Map(handovers.map((h) => [h.projectId, dateOnly(h.completedOn)]));
    const rows: ProjectProgressDto[] = projects
      .map((p) => {
        const contract = p.revisedContractValue ? new Prisma.Decimal(p.revisedContractValue) : null;
        const billed = billedOf.get(p.id) ?? ZERO;
        const own = activities.filter((a) => a.projectId === p.id).map((a) => ({ plannedQty: a.plannedQty.toString(), boqItemId: a.boqItemId, plannedStart: dateOnly(a.plannedStart), plannedEnd: dateOnly(a.plannedEnd) }));
        const planned = plannedProgress(own, rates, today);
        // The Gantt's planned finish, as the watch list reads it: the latest activity end or milestone due date
        const planFinish = [...own.map((a) => a.plannedEnd), dueOf.get(p.id) ?? null].reduce<string | null>((m, d) => (d && (!m || d > m) ? d : m), null);
        const eots = delays.filter((d) => d.projectId === p.id);
        const granted = eots.filter((d) => d.eotGrantedDays !== null);
        const eotDays = granted.reduce((s, d) => s + d.eotGrantedDays!, 0);
        const completedOn = completedOf.get(p.id) ?? null;
        return {
          projectId: p.id,
          code: p.code,
          name: p.name,
          status: p.status,
          physicalPct: p.physicalProgressPct,
          plannedPct: planned,
          financialPct: seesFinancial && contract?.gt(0) ? Math.round(billed.div(contract).mul(1000).toNumber()) / 10 : null,
          contractValue: seesFinancial ? p.revisedContractValue : null,
          billed: seesFinancial ? money(billed)! : null,
          startDate: p.startDate,
          endDate: p.endDate,
          eotDays,
          eotCount: granted.length,
          eotPending: eots.length - granted.length,
          planFinish,
          completedOn,
          ...contractTime({ startDate: p.startDate, endDate: p.endDate, eotDays, completedOn }, today),
        };
      })
      .sort(byProgressOrder);
    // Weighed by the contract values whether or not the caller sees them, so everyone reads the same physical figure.
    const contractOf = new Map(projects.map((p) => [p.id, p.revisedContractValue ? Number(p.revisedContractValue) : null]));
    const totals = portfolioProgress(rows.map((r) => ({ physicalPct: r.physicalPct, contractValue: contractOf.get(r.projectId) ?? null, billed: r.billed === null ? null : Number(r.billed) })));
    return { projects: rows, ...totals, financialPct: seesFinancial ? totals.financialPct : null, seesFinancial };
  }

  /** The Projects screen's figures: the projects' progress together, and how many are behind plan or behind on billing. */
  private progressFigures(p: ModuleProgressDto): ModuleFigureDto[] {
    const n = p.projects.length;
    if (!n) return [];
    const notes = p.projects.map(progressNotes);
    const behind = notes.filter((ns) => ns.some((x) => x.key === 'behind')).length;
    const unbilled = notes.filter((ns) => ns.some((x) => x.key === 'billingBehind')).length;
    const out: ModuleFigureDto[] = [
      { key: 'physical', label: 'Physical progress', value: String(p.physicalPct ?? 0), format: 'percent', note: p.weighting === 'contract' && n > 1 ? `${plural(n, 'project')}, weighted by contract value` : plural(n, 'project'), href: '/projects' },
    ];
    if (p.seesFinancial)
      out.push(
        p.financialPct === null
          ? { key: 'financial', label: 'Financial progress', value: '0', format: 'percent', note: 'No contract values yet', href: '/projects' }
          : { key: 'financial', label: 'Financial progress', value: String(p.financialPct), format: 'percent', note: 'Approved RA bills against contract', href: '/bills' },
      );
    out.push({ key: 'behind', label: 'Behind plan', value: String(behind), of: n, format: 'ratio', tone: behind ? 'warning' : 'default', note: behind ? `More than ${BEHIND_TOLERANCE_PCT} points behind the plan` : 'None behind the plan', href: '/projects' });
    if (p.seesFinancial)
      out.push({ key: 'billingBehind', label: 'Billing behind', value: String(unbilled), of: n, format: 'ratio', tone: unbilled ? 'warning' : 'default', note: unbilled ? 'Work done and not billed' : 'Billing keeps up', href: '/bills' });
    return out;
  }

  private async figures(user: RequestUser, key: ModuleKey, today: string, projectId?: string): Promise<ModuleFigureDto[]> {
    switch (key) {
      case 'site':
        return this.site(user, today, projectId);
      case 'quality':
        return this.quality(user, projectId);
      case 'safety':
        return this.safety(user, today, projectId);
      case 'correspondence':
        return this.correspondence(user);
      case 'documents':
        return this.design(user, projectId);
      case 'materials':
        return this.materials(user, projectId);
      case 'plant':
        return this.plant(user, today, projectId);
      case 'purchases':
        return this.purchases(user, projectId);
      case 'billing':
        return this.billing(user, projectId);
      case 'rmc':
        return this.rmc(user, today, projectId);
      case 'accounts':
        return [...(await this.accounts(user, projectId)), ...(await this.bookFigures(user))];
      case 'people':
        return this.people(user, today, projectId);
      default:
        // Projects, Subcontracts, Payroll, Reports and Admin show their pages and what waits, no figures yet.
        return [];
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
    const [active, reported, labourSheets, labourNamed, risks] = await Promise.all([
      this.prisma.project.findMany({ where: { ...this.access.projectWhere(user), status: 'ACTIVE', ...(projectId ? { id: projectId } : {}) }, select: { id: true } }),
      onSite ? this.prisma.dailyReport.findMany({ where: { ...where, date: day }, distinct: ['projectId'], select: { projectId: true } }) : null,
      onSite || canViewWorkers(role) ? this.prisma.attendanceSheet.aggregate({ where: { ...where, date: day }, _sum: { totalWorkers: true } }) : null,
      onSite || canViewWorkers(role) ? this.prisma.workerAttendance.count({ where: { ...where, date: day, status: { in: ['PRESENT', 'HALF_DAY'] } } }) : null,
      onSite || canViewContract(role) ? this.prisma.risk.groupBy({ by: ['kind'], where: { ...where, status: { not: 'CLOSED' } }, _count: { _all: true } }) : null,
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
    return out;
  }

  private async quality(user: RequestUser, projectId?: string): Promise<ModuleFigureDto[]> {
    if (!canReportSafety(user.roleKey)) return [];
    const ncrs = await this.prisma.ncr.count({ where: { ...this.where(user, projectId), status: { not: 'CLOSED' } } });
    return [count('openNcrs', 'Open NCRs', ncrs, '/inspections?tab=ncrs', { tone: ncrs ? 'warning' : 'default', note: ncrs ? 'Waiting for action or closing' : 'None open' })];
  }

  private async safety(user: RequestUser, today: string, projectId?: string): Promise<ModuleFigureDto[]> {
    if (!canReportSafety(user.roleKey) || !moduleOn(user, 'safety')) return [];
    const monthStart = parseDate(`${today.slice(0, 7)}-01`);
    const incidents = await this.prisma.safetyIncident.count({ where: { ...this.where(user, projectId), date: { gte: monthStart, lte: parseDate(today) } } });
    return [count('incidents', 'Safety incidents this month', incidents, '/safety', { tone: incidents ? 'danger' : 'default', note: incidents ? 'Reported since the 1st' : 'None since the 1st' })];
  }

  /** The design dashboard's totals (`DesignControlService.dashboard`), each linking to its list. */
  private async design(user: RequestUser, projectId?: string): Promise<ModuleFigureDto[]> {
    if (isGuest(user.roleKey)) return [];
    const t = (await this.designControl.dashboard(user, projectId)).totals;
    const scope = projectId ? `&projectId=${projectId}` : '';
    return [
      count('drawingsLate', 'Drawings late', t.drawingsLate, `/drawing-schedule?state=LATE${scope}`, {
        tone: t.drawingsLate ? 'danger' : 'default',
        note: t.drawingsAwaited ? `${t.drawingsAwaited} awaited in all` : 'None awaited',
      }),
      count('reviewsLate', 'Approvals past the reply date', t.reviewsLate, `/design-submissions?status=LATE${scope}`, {
        tone: t.reviewsLate ? 'warning' : 'default',
        note: t.underReview ? `${t.underReview} with the reviewer` : 'Nothing with a reviewer',
      }),
      count('commentsToAnswer', 'Review comments to answer', t.commentsToAnswer, `/design-submissions?status=WITH_US${scope}`, {
        tone: t.commentsToAnswer ? 'warning' : 'default',
        note: t.withUs ? `${t.withUs} submission${t.withUs === 1 ? '' : 's'} to revise` : 'Before the next submission',
      }),
      count('copiesToRecall', 'Superseded copies to recall', t.copiesToRecall, `/controlled-copies?state=TO_RECALL${scope}`, {
        tone: t.recallsLate ? 'danger' : t.copiesToRecall ? 'warning' : 'default',
        note: t.recallsLate ? `${t.recallsLate} out longer than a week` : t.copiesToRecall ? 'Old prints still on site' : 'Every copy on site is current',
      }),
    ];
  }

  private async correspondence(user: RequestUser): Promise<ModuleFigureDto[]> {
    const s = await this.letters.summary(user);
    const out: ModuleFigureDto[] = [
      count('markedToMe', 'Letters marked to you', s.markedToMe, '/correspondence?mine=1', {
        tone: s.markedToMeOverdue ? 'danger' : s.markedToMe ? 'warning' : 'default',
        note: s.markedToMeOverdue ? `${plural(s.markedToMeOverdue, 'letter')} past the action date` : s.markedToMe ? 'Waiting for you to act' : 'Nothing marked to you',
      }),
    ];
    if (s.toSign) out.push(count('toSign', 'Letters to sign', s.toSign, '/correspondence/outward?toSign=1', { tone: 'warning', note: 'Numbered once you approve' }));
    if (!canViewLetters(user.roleKey)) return out;
    out.push(
      count('lettersDue', 'Letters waiting for our reply', s.repliesDue, '/correspondence?awaiting=1', {
        tone: s.repliesOverdue ? 'danger' : s.repliesDue ? 'warning' : 'default',
        note: s.repliesOverdue ? `${plural(s.repliesOverdue, 'reply', 'replies')} past the date asked` : s.repliesDue ? 'Replies asked by a date' : 'Nothing waiting',
      }),
      count('unmarked', 'Received, not marked to anyone', s.unmarked, '/correspondence?unmarked=1', { tone: s.unmarked ? 'warning' : 'default', note: s.unmarked ? 'Mark each to someone with an action' : 'All marked' }),
      count('proofMissing', 'Notices without proof of delivery', s.proofMissing, '/correspondence/outward?proof=1', { tone: s.proofMissing ? 'danger' : 'default', note: s.proofMissing ? 'Keep the receipt or acknowledged copy' : 'Every notice has its proof' }),
    );
    return out;
  }

  private async materials(user: RequestUser, projectId?: string): Promise<ModuleFigureDto[]> {
    const role = user.roleKey;
    const onSite = canReportSafety(role);
    const where = this.where(user, projectId);
    const seesStock = onSite || canPurchase(role) || canViewCost(role);
    const [openRequests, low] = await Promise.all([
      onSite || canPurchase(role) ? this.prisma.materialRequest.count({ where: { ...where, status: 'SUBMITTED' } }) : null,
      seesStock ? this.stock.balances(user, { lowOnly: true, page: 1, pageSize: 1, ...(projectId ? { projectId } : {}) }) : null,
    ]);
    const out: ModuleFigureDto[] = [];
    if (openRequests !== null) out.push(count('openRequests', 'Material requests to approve', openRequests, '/material-requests', { note: 'Raised by the sites, not yet decided' }));
    if (low) out.push(count('lowStock', 'Items below minimum', low.total, '/stock?low=1', { tone: low.total ? 'warning' : 'default', note: low.total ? 'Order or transfer before they run out' : 'All above their minimum' }));
    return out;
  }

  private async plant(user: RequestUser, today: string, projectId?: string): Promise<ModuleFigureDto[]> {
    const role = user.roleKey;
    if (!canReportSafety(role) && !canPurchase(role)) return [];
    const where = this.where(user, projectId);
    const [jobCards, fuel] = await Promise.all([
      this.prisma.maintenanceJob.count({ where: { organizationId: user.organizationId, status: 'OPEN', ...(projectId ? { projectId } : { OR: [{ projectId: null }, { project: this.access.projectWhere(user) }] }) } }),
      this.prisma.stockEntry.count({ where: { ...where, type: 'ISSUE', equipmentId: { not: null }, date: parseDate(today) } }),
    ]);
    return [
      count('jobCards', 'Open job cards', jobCards, '/machinery?tab=maintenance', { note: 'Services and breakdowns not closed' }),
      count('fuelToday', 'Fuel issues today', fuel, '/machinery?tab=fuel', { note: 'Diesel issued to machines' }),
    ];
  }

  private async purchases(user: RequestUser, projectId?: string): Promise<ModuleFigureDto[]> {
    if (!canViewPurchaseOrders(user.roleKey)) return [];
    const orders = await this.purchaseOrders.status(user, { show: 'PENDING', ...(projectId ? { projectId } : {}) });
    return [
      rupees('ordersOpen', 'Orders to receive', orders.totals.pendingValue, '/purchase-orders', { note: plural(orders.totals.pending, 'order') }),
      count('ordersLate', 'Late deliveries', orders.totals.late, '/purchase-orders', { tone: orders.totals.late ? 'warning' : 'default', note: orders.totals.late ? 'Past their delivery date' : 'None late' }),
    ];
  }

  private async accounts(user: RequestUser, projectId?: string): Promise<ModuleFigureDto[]> {
    const role = user.roleKey;
    const [payables, requests] = await Promise.all([
      canViewPayables(role) ? this.payables.summary(user, projectId ? { projectId } : {}) : null,
      canViewPaymentRequests(role) ? this.prisma.paymentRequest.count({ where: { ...this.where(user, projectId), status: 'APPROVED', paidDate: null } }) : null,
    ]);
    const out: ModuleFigureDto[] = [];
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
      canViewCompliance(role) && moduleOn(user, 'compliance') ? this.compliance.list(user, projectId ? { projectId } : {}) : null,
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

  /** RMC (v6 item 104): the plants the caller sees (or the one asked for). */
  private async rmc(user: RequestUser, today: string, projectId?: string): Promise<ModuleFigureDto[]> {
    const role = user.roleKey;
    if (!canViewRmc(role) || !moduleOn(user, 'rmc')) return [];
    const org = user.organizationId;
    const plant = { ...this.access.projectWhere(user), type: 'PLANT' as const, ...(projectId ? { id: projectId } : {}) };
    const day = parseDate(today);
    const [poured, onTheWay, open, designs, unbilled, bills] = await Promise.all([
      this.prisma.rmcBatch.aggregate({ where: { organizationId: org, plant, date: day, status: { not: 'REJECTED' } }, _sum: { quantity: true }, _count: { _all: true } }),
      this.prisma.rmcBatch.count({ where: { organizationId: org, plant, status: 'DISPATCHED' } }),
      this.prisma.rmcOrder.findMany({ where: { organizationId: org, plant, status: 'CONFIRMED' }, select: { pourDate: true } }),
      this.prisma.mixDesign.count({ where: { organizationId: org, plant, status: 'DRAFT' } }),
      this.prisma.rmcBatch.aggregate({ where: { organizationId: org, plant, status: 'DELIVERED', invoiceId: null, order: { clientId: { not: null } } }, _sum: { quantity: true }, _count: { _all: true } }),
      this.prisma.rmcInvoice.findMany({ where: { organizationId: org, plant, status: 'ISSUED' }, select: { total: true, receipts: { select: { amount: true } } } }),
    ]);
    const m3 = (v: D | null) => (v ?? ZERO).toFixed(3).replace(/\.?0+$/, '') || '0';
    const pourToday = open.filter((o) => o.pourDate && o.pourDate.getTime() === day.getTime()).length;
    const out: ModuleFigureDto[] = [
      count('poured', 'Concrete sent today (m³)', 0, '/rmc?tab=day', { value: m3(poured._sum.quantity), note: `${plural(poured._count._all, 'truck')}${onTheWay ? `, ${onTheWay} on the way` : ''}` }),
      count('openOrders', 'Open orders', open.length, '/rmc?tab=orders', { note: pourToday ? `${pourToday} to pour today` : 'None due today' }),
    ];
    if (canApproveMixDesign(role)) out.push(count('designs', 'Mix designs to approve', designs, '/rmc?tab=designs', { tone: designs ? 'warning' : 'default', note: designs ? 'Waiting for quality' : 'Nothing waiting' }));
    if (canBillRmc(role)) {
      const due = bills.reduce((s, b) => s.add(b.receipts.reduce((r, x) => r.sub(x.amount), b.total)), ZERO);
      out.push(count('unbilled', 'Challans not billed', unbilled._count._all, '/rmc?tab=bills', { tone: unbilled._count._all ? 'warning' : 'default', note: unbilled._count._all ? `${m3(unbilled._sum.quantity)} m³ delivered` : 'Every delivery is billed' }));
      out.push(rupees('due', 'Due from RMC customers', due, '/rmc?tab=bills', { note: 'On bills issued, less money received' }));
    }
    return out;
  }

  /** The books are the company's, so these do not follow the header's project. */
  private async bookFigures(user: RequestUser): Promise<ModuleFigureDto[]> {
    if (!moduleOn(user, 'books')) return [];
    const [f, s] = await Promise.all([this.books.figures(user), this.statements.figures(user)]);
    if (!f || !s) return [];
    const profit = Number(s.profitThisYear);
    const out: ModuleFigureDto[] = [
      rupees('cash', 'Cash in hand', f.cash, '/books?tab=cash', { note: 'In the books today, the whole company' }),
      rupees('bank', 'In the bank', f.bank, '/books?tab=cash', { note: 'In the books today, before reconciliation' }),
    ];
    if (canApproveVouchers(user.roleKey)) out.push(count('toApprove', 'Vouchers to approve', f.toApprove, '/books?tab=vouchers', { tone: f.toApprove ? 'warning' : 'default', note: f.toApprove ? 'Made by accounts, waiting for you' : 'Nothing waiting' }));
    out.push(count('held', 'Records not posted', f.held, '/books?tab=day', { tone: f.held ? 'warning' : 'default', note: f.held ? 'They do not balance; open the day book to see why' : 'Every record is in the books' }));
    out.push(rupees('profit', profit < 0 ? 'Loss this year' : 'Profit this year', String(Math.abs(profit)), '/statements?tab=pl', { tone: profit < 0 ? 'danger' : 'default', note: 'From 1 April, before tax' }));
    out.push(count('unmatched', 'Bank lines to match', s.unmatchedBankLines, '/statements?tab=bank', { tone: s.unmatchedBankLines ? 'warning' : 'default', note: s.unmatchedBankLines ? 'On the bank statement, not yet in the books' : 'Every imported line is matched' }));
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
    if (canViewPayroll(role) && moduleOn(user, 'payroll') && !projectId) {
      const runs = await this.payrollRuns.waiting(user);
      const net = runs.reduce((t, r) => t + Number(r.net), 0);
      const step = canApprovePayroll(role) && runs.some((r) => r.status === 'SUBMITTED') ? 'to approve' : canPayPayroll(role) && runs.some((r) => r.status === 'APPROVED') ? 'to pay' : 'in draft';
      out.push(count('salaryRuns', 'Salary runs waiting', runs.length, '/payroll?tab=runs', runs.length ? { tone: 'warning', note: `${runs.map((r) => r.runNo).join(', ')} ${step}: {money}`, noteMoney: String(net) } : { note: 'Nothing waiting on you' }));
    }
    return out;
  }
}
