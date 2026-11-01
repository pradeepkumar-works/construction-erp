import { NotFoundException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Figure, FigureInput, ModuleHomeDto, ModuleKey, ModuleProgressDto, ModuleWaitingDto, ProgressNoteKey, ProjectProgressDto, SubmissionType } from '@erp/shared';
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
  byProgressOrder,
  contractTime,
  figure,
  formatINRCompact,
  isCompanyWide,
  isGuest,
  isModuleKey,
  plural,
  portfolioProgress,
  progressNotes,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { SubmissionLifecycleService } from '../common/submission-lifecycle.service';
import { dateOnly, dec, money, parseDate } from '../common/serialize';
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
import { plannedProgress } from '../common/progress';
import { CorrespondenceService } from '../correspondence/correspondence.service';
import { DesignControlService } from '../design/design-control.service';

type D = Prisma.Decimal;
const ZERO = new Prisma.Decimal(0);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/**
 * Module home pages: for one sidebar section, its figures, what waits for the caller in it, and the caller's
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
      .map((w) => ({ ...w, amount: w.amount === null ? null : money(w.amount) }));
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
          billed: seesFinancial ? money(billed) : null,
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
  private progressFigures(p: ModuleProgressDto): Figure[] {
    const n = p.projects.length;
    if (!n) return [];
    const notes = p.projects.map(progressNotes);
    const projects = (key: ProgressNoteKey) => notes.filter((ns) => ns.some((x) => x.key === key)).length;
    const facts: FigureInput[] = [
      figure('physicalProgress', p.physicalPct ?? 0, { count: n }),
      p.seesFinancial && figure('financialProgress', p.financialPct ?? { none: 'No contract values yet' }),
      figure('projectsBehindPlan', projects('behind'), { versus: { of: n } }),
      p.seesFinancial && figure('projectsBillingBehind', projects('billingBehind'), { versus: { of: n } }),
    ];
    return facts.filter((f): f is Figure => !!f);
  }

  /** One area module's figures; department screens pick theirs from these (`departmentFigures`). */
  async figures(user: RequestUser, key: ModuleKey, today: string, projectId?: string): Promise<Figure[]> {
    const facts = await this.facts(user, key, today, projectId);
    return facts.filter((f): f is Figure => !!f);
  }

  private async facts(user: RequestUser, key: ModuleKey, today: string, projectId?: string): Promise<FigureInput[]> {
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

  private async site(user: RequestUser, today: string, projectId?: string): Promise<FigureInput[]> {
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
    const activeIds = new Set(active.map((p) => p.id));
    const done = reported?.filter((r) => activeIds.has(r.projectId)).length ?? 0;
    return [
      reported && figure('dailyReports', done, { when: 'today', versus: { of: figure('activeProjects', active.length) }, attention: done < active.length ? 'watch' : undefined }),
      labourSheets && labourNamed !== null && figure('labour', (labourSheets._sum.totalWorkers ?? 0) + labourNamed, { when: 'today' }),
      risks &&
        figure(
          'openRisks',
          risks.reduce((s, r) => s + r._count._all, 0),
          { versus: { part: figure('openDelays', risks.find((r) => r.kind === 'DELAY')?._count._all ?? 0) } },
        ),
    ];
  }

  private async quality(user: RequestUser, projectId?: string): Promise<FigureInput[]> {
    if (!canReportSafety(user.roleKey)) return [];
    return [figure('openNcrs', await this.prisma.ncr.count({ where: { ...this.where(user, projectId), status: { not: 'CLOSED' } } }))];
  }

  private async safety(user: RequestUser, today: string, projectId?: string): Promise<FigureInput[]> {
    if (!canReportSafety(user.roleKey) || !moduleOn(user, 'safety')) return [];
    const monthStart = parseDate(`${today.slice(0, 7)}-01`);
    const incidents = await this.prisma.safetyIncident.count({ where: { ...this.where(user, projectId), date: { gte: monthStart, lte: parseDate(today) } } });
    return [figure('safetyIncidents', incidents, { when: { month: today.slice(0, 7) } })];
  }

  /** The design dashboard's totals (`DesignControlService.dashboard`). */
  private async design(user: RequestUser, projectId?: string): Promise<FigureInput[]> {
    if (isGuest(user.roleKey)) return [];
    const t = (await this.designControl.dashboard(user, projectId)).totals;
    return [
      figure('drawingsLate', t.drawingsLate, { versus: { of: figure('drawingsAwaited', t.drawingsAwaited) } }),
      figure('reviewsLate', t.reviewsLate, { versus: { of: figure('underReview', t.underReview) } }),
      figure('commentsToAnswer', t.commentsToAnswer, { count: t.withUs }),
      figure('copiesToRecall', t.copiesToRecall, { versus: { part: figure('recallsLate', t.recallsLate) } }),
    ];
  }

  private async correspondence(user: RequestUser): Promise<FigureInput[]> {
    const s = await this.letters.summary(user);
    const register = canViewLetters(user.roleKey);
    return [
      figure('lettersMarkedToYou', s.markedToMe, { versus: { part: figure('lettersPastActionDate', s.markedToMeOverdue) } }),
      s.toSign > 0 && figure('lettersToSign', s.toSign),
      register && figure('repliesDue', s.repliesDue, { versus: { part: figure('repliesOverdue', s.repliesOverdue) } }),
      register && figure('lettersNotMarked', s.unmarked),
      register && figure('noticesWithoutProof', s.proofMissing),
    ];
  }

  private async materials(user: RequestUser, projectId?: string): Promise<FigureInput[]> {
    const role = user.roleKey;
    const onSite = canReportSafety(role);
    const where = this.where(user, projectId);
    const seesStock = onSite || canPurchase(role) || canViewCost(role);
    const [openRequests, low] = await Promise.all([
      onSite || canPurchase(role) ? this.prisma.materialRequest.count({ where: { ...where, status: 'SUBMITTED' } }) : null,
      seesStock ? this.stock.balances(user, { lowOnly: true, page: 1, pageSize: 1, ...(projectId ? { projectId } : {}) }) : null,
    ]);
    return [openRequests !== null && figure('materialRequestsToApprove', openRequests), low && figure('itemsBelowMinimum', low.total)];
  }

  private async plant(user: RequestUser, today: string, projectId?: string): Promise<FigureInput[]> {
    const role = user.roleKey;
    if (!canReportSafety(role) && !canPurchase(role)) return [];
    const where = this.where(user, projectId);
    const [jobCards, fuel] = await Promise.all([
      this.prisma.maintenanceJob.count({ where: { organizationId: user.organizationId, status: 'OPEN', ...(projectId ? { projectId } : { OR: [{ projectId: null }, { project: this.access.projectWhere(user) }] }) } }),
      this.prisma.stockEntry.count({ where: { ...where, type: 'ISSUE', equipmentId: { not: null }, date: parseDate(today) } }),
    ]);
    return [figure('openJobCards', jobCards), figure('fuelIssues', fuel, { when: 'today' })];
  }

  private async purchases(user: RequestUser, projectId?: string): Promise<FigureInput[]> {
    if (!canViewPurchaseOrders(user.roleKey)) return [];
    const { totals } = await this.purchaseOrders.status(user, { show: 'PENDING', ...(projectId ? { projectId } : {}) });
    return [figure('ordersToReceive', totals.pendingValue, { count: totals.pending }), figure('lateDeliveries', totals.late)];
  }

  private async accounts(user: RequestUser, projectId?: string): Promise<FigureInput[]> {
    const role = user.roleKey;
    const [payables, requests] = await Promise.all([
      canViewPayables(role) ? this.payables.summary(user, projectId ? { projectId } : {}) : null,
      canViewPaymentRequests(role) ? this.prisma.paymentRequest.count({ where: { ...this.where(user, projectId), status: 'APPROVED', paidDate: null } }) : null,
    ]);
    return [
      payables && figure('weOwe', payables.totals.outstanding, { versus: { part: figure('weOweOverdue', payables.totals.overdue) } }),
      requests !== null && figure('paymentRequestsToPay', requests),
    ];
  }

  private async billing(user: RequestUser, projectId?: string): Promise<FigureInput[]> {
    const role = user.roleKey;
    const [receivables, variations, compliance] = await Promise.all([
      canViewContract(role) ? this.receivables.summary(user, projectId ? { projectId } : {}) : null,
      canViewVariations(role) ? this.prisma.variation.count({ where: { ...this.where(user, projectId), status: 'SUBMITTED' } }) : null,
      canViewCompliance(role) && moduleOn(user, 'compliance') ? this.compliance.list(user, projectId ? { projectId } : {}) : null,
    ]);
    const t = receivables?.totals;
    return [
      t && figure('clientsOwe', t.outstanding, { versus: { part: figure('clientsOweOver90', t.ageing.over90) } }),
      t && figure('billsNotSent', t.notSent),
      t && figure('retentionWithClients', t.retentionHeld),
      variations !== null && figure('variationsWithClient', variations),
      compliance && figure('guaranteesExpired', compliance.totals.expired),
      compliance && figure('guaranteesExpiring', compliance.totals.expiring),
    ];
  }

  /** RMC: the plants the caller sees (or the one asked for). */
  private async rmc(user: RequestUser, today: string, projectId?: string): Promise<FigureInput[]> {
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
    const m3 = (v: D | null) => dec(v ?? ZERO);
    const pourToday = open.filter((o) => o.pourDate && o.pourDate.getTime() === day.getTime()).length;
    const billsRmc = canBillRmc(role);
    return [
      figure('cubicMetresSent', m3(poured._sum.quantity), { when: 'today', count: poured._count._all, versus: { part: figure('trucksInTransit', onTheWay) } }),
      figure('concreteOrdersOpen', open.length, { versus: { part: figure('poursToday', pourToday) } }),
      canApproveMixDesign(role) && figure('mixDesignsToApprove', designs),
      billsRmc && figure('challansNotBilled', unbilled._count._all, { versus: { part: figure('cubicMetresNotBilled', m3(unbilled._sum.quantity)) } }),
      billsRmc && figure('rmcCustomersOwe', money(bills.reduce((s, b) => s.add(b.receipts.reduce((r, x) => r.sub(x.amount), b.total)), ZERO))),
    ];
  }

  /** The books are the company's, so these do not follow the header's project. */
  private async bookFigures(user: RequestUser): Promise<FigureInput[]> {
    if (!moduleOn(user, 'books')) return [];
    const [f, s] = await Promise.all([this.books.figures(user), this.statements.figures(user)]);
    if (!f || !s) return [];
    return [
      figure('bankAndCash', money(new Prisma.Decimal(f.cash).add(f.bank)), { versus: { part: figure('bankLinesToMatch', s.unmatchedBankLines) } }),
      figure('profitThisYear', s.profitThisYear),
      canApproveVouchers(user.roleKey) && figure('vouchersToApprove', f.toApprove),
      figure('recordsNotPosted', f.held),
    ];
  }

  private async people(user: RequestUser, today: string, projectId?: string): Promise<FigureInput[]> {
    const role = user.roleKey;
    if (!canMarkStaff(role) && !canManageStaff(role) && !canViewLabourSummary(role)) return [];
    const day = parseDate(today);
    const everyone = isCompanyWide(role) || canManageStaff(role);
    const ids = projectId ? [projectId] : (await this.prisma.project.findMany({ where: this.access.projectWhere(user), select: { id: true } })).map((p) => p.id);
    const staffWhere = { organizationId: user.organizationId, ...(projectId ? { projectId } : everyone ? {} : { projectId: { in: ids } }) };
    const month = today.slice(0, 7);
    const monthStart = parseDate(`${month}-01`);
    const [onRoll, marks, onLeave, joined, summary] = await Promise.all([
      this.prisma.employee.count({ where: { ...staffWhere, isActive: true, OR: [{ leftOn: null }, { leftOn: { gte: day } }] } }),
      this.prisma.staffAttendance.groupBy({ by: ['status'], where: { ...staffWhere, date: day }, _count: { _all: true } }),
      this.prisma.leaveRequest.count({ where: { organizationId: user.organizationId, status: 'APPROVED', fromDate: { lte: day }, toDate: { gte: day }, employee: staffWhere } }),
      this.prisma.employee.count({ where: { ...staffWhere, joinedOn: { gte: monthStart, lte: day } } }),
      this.staff.summary(user),
    ]);
    const marked = marks.reduce((s, m) => s + m._count._all, 0);
    const absent = marks.find((m) => m.status === 'ABSENT')?._count._all ?? 0;
    const unmarked = Math.max(0, onRoll - marked - onLeave);
    const roll = figure('staffOnRoll', onRoll);
    const out: FigureInput[] = [
      figure('staffPresent', marked - absent, unmarked ? { when: 'today', attention: { level: 'watch', because: `${plural(unmarked, 'person', 'people')} not marked yet` } } : { when: 'today', versus: { of: roll } }),
      figure('staffOnLeave', onLeave, { when: 'today', versus: { part: figure('staffAbsent', absent) } }),
      figure('staffJoined', joined, { when: { month }, versus: { of: roll } }),
      summary.leaveToDecide !== undefined && figure('leaveToDecide', summary.leaveToDecide),
      summary.overtimeToDecide !== undefined && figure('overtimeToDecide', summary.overtimeToDecide),
    ];
    // Salary runs: drafts for HR, submitted ones for management, approved ones for accounts.
    if (canViewPayroll(role) && moduleOn(user, 'payroll') && !projectId) {
      const runs = await this.payrollRuns.waiting(user);
      const net = runs.reduce((t, r) => t + Number(r.net), 0);
      const step = canApprovePayroll(role) && runs.some((r) => r.status === 'SUBMITTED') ? 'to approve' : canPayPayroll(role) && runs.some((r) => r.status === 'APPROVED') ? 'to pay' : 'in draft';
      out.push(figure('salaryRunsWaiting', runs.length, runs.length ? { attention: { level: 'watch', because: `${runs.map((r) => r.runNo).join(', ')} ${step}, ${formatINRCompact(net)} net` } } : undefined));
    }
    return out;
  }
}
