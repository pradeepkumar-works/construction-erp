import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CompanyTodayDto, DueRowDto, HomeTrendsDto, MyWorkCard, MyWorkDto, MyWorkItem, PurchaseTodayDto, ReceiptWait, SubmissionType } from '@erp/shared';
import {
  COMPANY_TODAY_ROWS,
  COMPLIANCE_DOC_KIND_LABELS,
  DEFAULT_CLIENT_PAYMENT_DAYS,
  LEAVE_TYPE_LABELS,
  ORDER_STAGE_LABELS,
  type OrderStage,
  billLabel,
  canApprove,
  canCheckGrn,
  canRaiseDebitNote,
  canPurchase,
  canRecordMeetings,
  canViewMeetings,
  canReportSafety,
  canViewLabourSummary,
  canKeepStock,
  canManageStaff,
  canManageStore,
  canSeeWatchList,
  canViewCompliance,
  canViewContract,
  canViewCost,
  canViewPayables,
  canViewPurchaseOrders,
  canRecordReceipt,
  canRecordVendorBill,
  canSignLetters,
  canViewLetters,
  canRaiseNcr,
  QA_AUDIT_KIND_LABELS,
  isCompanyWide,
  isGuest,
  seesCompanyToday,
  submissionHref,
  submitsDpr,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { SubmissionLifecycleService } from '../common/submission-lifecycle.service';
import { ApprovalRightsService } from '../common/approval-rights.service';
import { dateOnly, dec, formatDay, money, parseDate } from '../common/serialize';
import { todayIn } from '../notifications/time';
import { ReceivablesService } from '../receivables/receivables.service';
import { PayablesService } from '../payables/payables.service';
import { CostService } from '../cost/cost.service';
import { PurchaseOrdersService } from '../purchasing/purchase-orders.service';
import { ComplianceService } from '../compliance/compliance.service';
import { StockService } from '../stock/stock.service';
import { ProjectsService } from '../projects/projects.service';
import { WarningsService } from '../warnings/warnings.service';
import { FleetService } from '../machinery/fleet.service';
import { RequestsToOrderService } from '../purchasing/requests-to-order.service';
import { MeetingsService } from '../meetings/meetings.service';
import { CorrespondenceService } from '../correspondence/correspondence.service';
import { QaAuditsService } from '../qa/audits.service';
import { moduleOn } from '../common/module-switch.guard';

type D = Prisma.Decimal;
const ZERO = new Prisma.Decimal(0);
const TOP = 3;
const monthOf = (d: Date) => d.toISOString().slice(0, 7);
const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
/** A My work card; `urgency` is how many days its most pressing entry is overdue or late (see MyWorkCard.urgencyDays). */
const card = (count: number, items: MyWorkItem[], amount: D | null = null, urgency: number | null = 0): MyWorkCard => ({
  count,
  amount: amount === null ? null : money(amount)!,
  items: items.slice(0, TOP),
  urgencyDays: count > 0 ? urgency : null,
});
const most = (xs: number[]) => (xs.length ? Math.max(...xs) : null);
/** Whole days from one YYYY-MM-DD to another. */
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
/** A client bill counts as late once it is past the last ageing bucket the receivables page flags (over 90 days). */
const RECEIVABLE_LATE_AFTER = 90;
/** The day before a YYYY-MM-DD. */
const dayBefore = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
const sumOf = <T>(rows: T[], f: (r: T) => D) => rows.reduce((s, r) => s.add(f(r)), ZERO);
/** A YYYY-MM-DD `n` days on. */
const daysAfter = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** A GRN starts to press once a supplier bill should have come in: two weeks after the goods. */
const MATCH_LATE_AFTER = 14;
/** Material is tested before it goes into the work: a GRN unchecked after two days presses. */
const CHECK_LATE_AFTER = 2;
/** A debit note goes with the next payment run: a week after the rejection or return. */
const DEBIT_LATE_AFTER = 7;

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
    private warnings: WarningsService,
    private fleet: FleetService,
    private meetings: MeetingsService,
    private toOrderList: RequestsToOrderService,
    private letters: CorrespondenceService,
    private qaAudits: QaAuditsService,
  ) {}

  async myWork(user: RequestUser): Promise<MyWorkDto> {
    const role = user.roleKey;
    const today = todayIn();
    const rights = await this.rights.rightsFor(user.organizationId, role);
    const seesDue = canViewPurchaseOrders(role) && (canPurchase(role) || canKeepStock(role));
    const matches = canRecordVendorBill(role) && canViewPayables(role);
    const checks = canCheckGrn(role) && role !== 'ADMIN' && role !== 'MANAGEMENT';
    const [pending, missing, sentBack, waiting, receivables, payables, expiring, expired, late, low, watch, actions, toOrder, orders, staff, unmatched, unchecked, toDebit, incoming, letters, findings] = await Promise.all([
      rights.length ? this.lifecycle.pending(user) : null,
      canApprove(role) || submitsDpr(role) ? this.dprsMissing(user, today) : null,
      this.lifecycle.mine(user, ['REJECTED', 'CHANGES_REQUESTED']),
      this.lifecycle.waiting(user),
      canViewContract(role) ? this.receivables.summary(user) : null,
      canViewPayables(role) ? this.payables.summary(user) : null,
      canViewCompliance(role) && moduleOn(user, 'compliance') ? this.compliance.list(user, { state: 'EXPIRING' }) : null,
      canViewCompliance(role) && moduleOn(user, 'compliance') ? this.compliance.list(user, { state: 'EXPIRED' }) : null,
      canViewPurchaseOrders(role) ? this.purchaseOrders.status(user, { show: 'LATE' }) : null,
      canKeepStock(role) || canManageStore(role) ? this.stock.balances(user, { lowOnly: true, page: 1, pageSize: TOP }) : null,
      canSeeWatchList(role) ? this.warnings.open(user) : null,
      canViewMeetings(role) && moduleOn(user, 'meetings') ? this.meetings.actions(user, { mine: true, status: 'open' }) : null,
      canPurchase(role) ? this.toOrderList.rows(user) : null,
      seesDue ? this.purchaseOrders.status(user, { show: 'PENDING' }) : null,
      this.staffToDecide(user),
      matches ? this.grnsToMatch(user, today) : null,
      checks ? this.receiptsWaiting(user, 'CHECK', today) : null,
      canRaiseDebitNote(role) ? this.receiptsWaiting(user, 'DEBIT_NOTE', today) : null,
      canKeepStock(role) ? this.stock.incomingTransfers(user, {}) : null,
      isGuest(role) ? null : this.letters.forMe(user),
      canRaiseNcr(role) ? this.qaAudits.openFindings(user) : null,
    ]);
    // The store receives on its own Stock page; purchase follows its orders under Purchases.
    const storeSide = canKeepStock(role) && !canPurchase(role);

    const out: MyWorkDto = {};
    if (pending) {
      const counts = new Map<SubmissionType, number>();
      for (const p of pending) counts.set(p.type, (counts.get(p.type) ?? 0) + 1);
      out.approvals = [...counts.entries()].map(([type, count]) => ({ type, count }));
      // `pending` is oldest first: how long the first has waited is how pressing the approvals are.
      out.approvalsWaitingDays = pending.length ? Math.max(0, daysBetween(todayIn(undefined, new Date(pending[0].submittedAt)), today)) : null;
    }
    if (watch) out.watchList = card(watch.length, watch.map((w) => ({ label: w.title, note: w.action, projectName: w.projectName, amount: null, href: '/watch-list' })));
    if (missing) out.dprsMissing = card(missing.length, missing.map((p) => ({ label: p.name, note: `No DPR for today`, projectName: null, amount: null, href: `/projects/${p.id}?tab=dpr` })));
    out.sentBack = card(
      sentBack.length,
      sentBack.map((s) => ({ label: s.title, note: 'Sent back to you', projectName: s.projectName, amount: s.amount, href: submissionHref(s.type, s.id) })),
    );
    // Waiting with others (v5 item 94): oldest first; it starts to press after two days at one level.
    const waited = (since: string) => Math.max(0, daysBetween(todayIn(undefined, new Date(since)), today));
    out.waitingWithOthers = card(
      waiting.length,
      waiting.map((w) => ({
        label: w.title,
        note: [w.levels > 1 ? `Level ${w.level} of ${w.levels}` : null, w.waitingWith.length ? `with ${w.waitingWith.join(', ')}` : 'No approver yet', waited(w.waitingSince) ? days(waited(w.waitingSince)) : 'since today'].filter(Boolean).join(' · '),
        projectName: w.projectName,
        amount: w.amount,
        href: submissionHref(w.type, w.id),
      })),
      null,
      most(waiting.map((w) => waited(w.waitingSince) - 2)),
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
        most(open.map((b) => b.daysOutstanding - RECEIVABLE_LATE_AFTER)),
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
        most(due.map((b) => -b.daysToDue)),
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
        null,
        most(docs.map((d) => -(d.daysLeft ?? 0))),
      );
    }
    if (late) {
      out.lateDeliveries = card(
        late.rows.length,
        late.rows.map((r) => ({ label: `${r.poNo} · ${r.vendorName}`, note: `${days(r.daysLate)} late`, projectName: r.projectName, amount: r.pendingValue, href: `/purchase-orders/${r.purchaseOrderId}` })),
        late.rows.reduce((s, r) => s.add(r.pendingValue), ZERO),
        most(late.rows.map((r) => r.daysLate)),
      );
      if (storeSide) out.lateDeliveries.href = '/stock?sub=deliveries';
    }
    if (low) {
      out.lowStock = card(
        low.total,
        low.items.map((b) => ({ label: b.itemName, note: `${b.balance} ${b.unit} left, minimum ${b.minQty ?? '-'}`, projectName: b.projectName, amount: null, href: '/stock' })),
      );
    }
    // Meeting actions (v6 item 112): for the roles that hold meetings always, for anyone else once they own one.
    if (actions && (canRecordMeetings(role) || actions.items.length)) {
      const open = actions.items;
      out.meetingActions = card(
        open.length,
        open.map((a) => ({
          label: a.text,
          note: [a.meetingNo, a.daysOverdue ? `${days(a.daysOverdue)} overdue` : a.daysOverdue === 0 ? 'Due today' : a.daysLeft !== null ? `Due in ${days(a.daysLeft)}` : 'No date'].join(' · '),
          projectName: a.projectName,
          amount: null,
          href: `/meetings/${a.meetingId}`,
        })),
        null,
        most(open.filter((a) => a.dueOn).map((a) => a.daysOverdue ?? -(a.daysLeft ?? 0))),
      );
    }
    // Letters (item 136): for those who keep or sign letters always, for anyone else once one is marked to them.
    if (letters && (canViewLetters(role) || canSignLetters(role) || letters.total)) {
      out.letters = card(
        letters.total,
        letters.items.map((l) => {
          const late = l.due ? daysBetween(l.due, today) : null;
          const when = l.toSign ? (late !== null && late > 0 ? `waiting ${days(late)}` : 'waiting since today') : late === null ? 'No date' : late > 0 ? `${days(late)} overdue` : late === 0 ? 'Due today' : `Due in ${days(-late)}`;
          return { label: `${l.letterNo ?? 'Draft'} · ${l.party}`, note: [l.toSign ? 'To sign' : l.action, l.subject, when].filter(Boolean).join(' · '), projectName: l.projectName, amount: null, href: `/correspondence/${l.id}` };
        }),
        null,
        most(letters.items.filter((l) => l.due).map((l) => daysBetween(l.due!, today))),
      );
      out.letters.href = '/correspondence?mine=1';
    }
    // The queues each desk works through (finding 8 of the October review).
    if (toOrder) {
      const late = (r: { requiredDate: string }) => daysBetween(r.requiredDate, today);
      const needed = (r: { requiredDate: string }) => (late(r) > 0 ? `needed ${days(late(r))} ago` : late(r) === 0 ? 'needed today' : `needed in ${days(-late(r))}`);
      // What purchase can act on first: an order to raise, then an L1 to finalise, then quotations to get; a choice
      // waiting for its approver is someone else's move, so it comes last.
      const rank: Record<OrderStage, number> = { READY: 0, TO_FINALISE: 1, TO_ENQUIRE: 2, AWAITING_QUOTES: 3, AWAITING_APPROVAL: 4 };
      const sorted = [...toOrder].sort((a, b) => rank[a.stage] - rank[b.stage] || late(b) - late(a));
      out.toOrder = card(
        toOrder.length,
        sorted.map((r) => ({
          label: r.requestNo,
          note: `${ORDER_STAGE_LABELS[r.stage]} · ${needed(r)}`,
          projectName: r.projectName,
          amount: r.stage === 'READY' || r.stage === 'TO_FINALISE' || r.stage === 'AWAITING_APPROVAL' ? (r.l1?.total ?? null) : null,
          href: `/requests-to-order/${r.id}`,
        })),
        null,
        most(toOrder.map(late)),
      );
    }
    if (orders) {
      const week = daysAfter(today, 7);
      const due = orders.rows.filter((r) => r.deliveryBy && r.deliveryBy >= today && r.deliveryBy <= week).sort((a, b) => a.deliveryBy!.localeCompare(b.deliveryBy!));
      const left = (r: { deliveryBy: string | null }) => daysBetween(today, r.deliveryBy!);
      out.dueThisWeek = card(
        due.length,
        due.map((r) => ({
          label: `${r.poNo} · ${r.vendorName}`,
          note: [left(r) === 0 ? 'Due today' : `Due in ${days(left(r))}`, r.state === 'PARTLY_RECEIVED' ? `${r.receivedPct}% received` : null].filter(Boolean).join(' · '),
          projectName: r.projectName,
          amount: canViewCost(role) || canPurchase(role) ? r.pendingValue : null,
          href: `/purchase-orders/${r.purchaseOrderId}`,
        })),
        null,
        most(due.map((r) => -left(r))),
      );
      if (storeSide) out.dueThisWeek.href = '/stock?sub=deliveries';
    }
    if (staff.count > 0 || canManageStaff(role)) out.staffToDecide = card(staff.count, staff.items, null, most(staff.items.map((i) => i.waited)));
    if (receivables && canRecordReceipt(role)) {
      const certified = receivables.openBills.filter((b) => b.certifiedDate).sort((a, b) => a.certifiedDate!.localeCompare(b.certifiedDate!));
      const since = (b: { certifiedDate: string | null }) => daysBetween(b.certifiedDate!, today);
      out.certifiedToReceive = card(
        certified.length,
        certified.map((b) => ({
          label: [b.billLabel, b.clientName].filter(Boolean).join(' · '),
          note: since(b) === 0 ? 'Certified today' : `Certified ${days(since(b))} ago`,
          projectName: b.projectName,
          amount: b.outstanding,
          href: `/bills/${b.billId}`,
        })),
        sumOf(certified, (b) => new Prisma.Decimal(b.outstanding)),
        most(certified.map((b) => since(b) - DEFAULT_CLIENT_PAYMENT_DAYS)),
      );
    }
    if (unmatched) {
      const ago = (d: string) => daysBetween(d, today);
      out.toMatch = card(
        unmatched.length,
        unmatched.map((g) => ({
          label: `${g.entryNo} · ${g.vendorName}`,
          note: [g.poNo, ago(g.date) === 0 ? 'received today' : `received ${days(ago(g.date))} ago`].join(' · '),
          projectName: g.projectName,
          amount: money(g.value),
          href: `/vendor-bills?tab=to-bill`,
        })),
        sumOf(unmatched, (g) => g.value),
        most(unmatched.map((g) => ago(g.date) - MATCH_LATE_AFTER)),
      );
    }
    // Receipts waiting on the desks after the store, each in its own place (Quality, Vendor bills, Debit notes).
    if (unchecked && (role === 'QA_QC_ENGINEER' || unchecked.length)) {
      const ago = (d: string) => daysBetween(d, today);
      out.grnsToCheck = card(
        unchecked.length,
        unchecked.map((g) => ({ label: [g.entryNo, g.from].filter(Boolean).join(' · '), note: ago(g.date) === 0 ? 'received today' : `received ${days(ago(g.date))} ago`, projectName: g.projectName, amount: null, href: '/inspections?tab=grns' })),
        null,
        most(unchecked.map((g) => ago(g.date) - CHECK_LATE_AFTER)),
      );
    }
    // Audit and visit findings (item 137): QA/QC always, the managers once one is open.
    if (findings && (role === 'QA_QC_ENGINEER' || findings.length)) {
      out.findingsToClose = card(
        findings.length,
        findings.map((f) => ({
          label: `${f.auditNo} · ${f.text}`,
          note: f.overdueDays ? `${QA_AUDIT_KIND_LABELS[f.kind]}, ${days(f.overdueDays)} overdue` : `${QA_AUDIT_KIND_LABELS[f.kind]}, ${f.ageDays === 0 ? 'today' : `${days(f.ageDays)} ago`}`,
          projectName: f.projectName,
          amount: null,
          href: `/qa-audits?id=${f.auditId}`,
        })),
        null,
        most(findings.map((f) => f.overdueDays ?? -1)),
      );
    }
    if (toDebit && (role === 'ACCOUNTS_MANAGER' || toDebit.length)) {
      const ago = (d: string) => daysBetween(d, today);
      out.toDebit = card(
        toDebit.length,
        toDebit.map((g) => ({ label: [g.entryNo, g.from].filter(Boolean).join(' · '), note: `${g.type === 'RETURN_TO_VENDOR' ? 'Returned to the supplier' : 'Rejected at QA/QC'} ${ago(g.date) === 0 ? 'today' : `${days(ago(g.date))} ago`}`, projectName: g.projectName, amount: null, href: '/payables?tab=debit-notes&sub=to-raise' })),
        null,
        most(toDebit.map((g) => ago(g.date) - DEBIT_LATE_AFTER)),
      );
    }
    if (incoming && (role === 'STORE_MANAGER' || incoming.length)) {
      const ago = (d: string) => daysBetween(d, today);
      out.transfersToReceive = card(
        incoming.length,
        incoming.map((t) => ({ label: `${t.entryNo} from ${t.projectName}`, note: `${ago(t.date) === 0 ? 'Sent today' : `Sent ${days(ago(t.date))} ago`}: ${t.lines.map((l) => l.itemName).slice(0, 2).join(', ')}`, projectName: t.toProjectName, amount: null, href: `/stock${t.toProjectId ? `?projectId=${t.toProjectId}` : ''}` })),
        null,
        most(incoming.map((t) => ago(t.date) - 1)),
      );
    }
    return out;
  }

  /** Receipts waiting on a desk (`StockService.waitingWhere`), oldest first, with who they came from. */
  private async receiptsWaiting(user: RequestUser, kind: ReceiptWait, today: string) {
    const rows = await this.prisma.stockEntry.findMany({
      where: { ...this.access.submissionWhere(user), ...this.stock.waitingWhere(kind, today) },
      select: { entryNo: true, date: true, type: true, supplier: true, vendor: { select: { name: true } }, project: { select: { name: true } }, purchaseOrder: { select: { vendor: { select: { name: true } } } } },
      orderBy: { date: 'asc' },
    });
    return rows.map((g) => ({ entryNo: g.entryNo, date: dateOnly(g.date)!, type: g.type, from: g.purchaseOrder?.vendor.name ?? g.vendor?.name ?? g.supplier, projectName: g.project.name }));
  }

  /** Leave and overtime waiting on the caller (the same rule as the Staff page's Waiting on me), oldest first. */
  private async staffToDecide(user: RequestUser): Promise<{ count: number; items: (MyWorkItem & { waited: number })[] }> {
    const where = { organizationId: user.organizationId, employee: this.access.leaveDeciderWhere(user) };
    const today = todayIn();
    const [leave, overtime, leaveCount, overtimeCount] = await Promise.all([
      this.prisma.leaveRequest.findMany({ where: { ...where, status: 'PENDING' }, select: { id: true, type: true, fromDate: true, toDate: true, days: true, createdAt: true, employee: { select: { fullName: true, project: { select: { name: true } } } } }, orderBy: { createdAt: 'asc' }, take: TOP }),
      this.prisma.staffAttendance.findMany({ where: { ...where, overtimeStatus: 'PENDING' }, select: { date: true, overtimeHours: true, employee: { select: { fullName: true, project: { select: { name: true } } } } }, orderBy: { date: 'asc' }, take: TOP }),
      this.prisma.leaveRequest.count({ where: { ...where, status: 'PENDING' } }),
      this.prisma.staffAttendance.count({ where: { ...where, overtimeStatus: 'PENDING' } }),
    ]);
    const span = (from: string, to: string) => (from === to ? formatDay(from) : `${formatDay(from)} to ${formatDay(to)}`);
    const items = [
      ...leave.map((l) => ({
        label: `${l.employee.fullName} · ${LEAVE_TYPE_LABELS[l.type]}`,
        note: `${span(dateOnly(l.fromDate)!, dateOnly(l.toDate)!)}, ${Number(l.days)} day${l.days.eq(1) ? '' : 's'}`,
        projectName: l.employee.project?.name ?? null,
        amount: null,
        href: `/staff?tab=leave&leave=${l.id}`,
        waited: daysBetween(todayIn(undefined, l.createdAt), today) - 2,
      })),
      ...overtime.map((o) => ({
        label: `${o.employee.fullName} · Overtime`,
        note: `${Number(o.overtimeHours ?? 0)} hours on ${formatDay(dateOnly(o.date)!)}`,
        projectName: o.employee.project?.name ?? null,
        amount: null,
        href: '/staff?tab=overtime',
        waited: daysBetween(dateOnly(o.date)!, today) - 2,
      })),
    ].sort((a, b) => b.waited - a.waited);
    return { count: leaveCount + overtimeCount, items };
  }

  /** GRNs against an order in the last 90 days whose order has no supplier bill yet, oldest first, valued at the order's rates. */
  private async grnsToMatch(user: RequestUser, today: string) {
    const rows = await this.prisma.stockEntry.findMany({
      where: {
        ...this.access.submissionWhere(user),
        ...this.stock.waitingWhere('BILL', today),
      },
      select: {
        id: true,
        entryNo: true,
        date: true,
        purchaseOrderId: true,
        project: { select: { name: true } },
        purchaseOrder: { select: { poNo: true, vendor: { select: { name: true } } } },
        lines: { select: { quantity: true, purchaseOrderLine: { select: { rate: true } } } },
      },
      orderBy: { date: 'asc' },
    });
    return rows.map((g) => ({
      entryNo: g.entryNo,
      date: dateOnly(g.date)!,
      purchaseOrderId: g.purchaseOrderId!,
      poNo: g.purchaseOrder!.poNo,
      vendorName: g.purchaseOrder!.vendor.name,
      projectName: g.project.name,
      value: g.lines.reduce((s, l) => s.add(l.quantity.mul(l.purchaseOrderLine?.rate ?? ZERO)), ZERO),
    }));
  }

  /**
   * The company's day for the phone's Home (v5 item 96): money in and out today against yesterday, what is owed both
   * ways, attendance, fuel, the purchase pipeline and approvals by module. Each part is gated by the same helper as its
   * module and covers only the caller's projects.
   */
  async companyToday(user: RequestUser): Promise<CompanyTodayDto> {
    const role = user.roleKey;
    if (!seesCompanyToday(role)) throw new ForbiddenException('The company view is for owners, directors, accounts and project managers');
    const today = todayIn();
    const yesterday = dayBefore(today);
    const days2 = { gte: parseDate(yesterday), lte: parseDate(today) };
    const projects = await this.prisma.project.findMany({ where: this.access.projectWhere(user), select: { id: true, name: true, status: true, clientName: true, clientPaymentDays: true, client: { select: { name: true } } }, orderBy: { code: 'asc' } });
    const ids = projects.map((p) => p.id);
    const inProjects = { organizationId: user.organizationId, projectId: { in: ids } };
    const seesMachinery = canReportSafety(role) || canPurchase(role);

    const [payments, receipts, receivables, payables, attendance, fuel, purchase, submitted, waiting] = await Promise.all([
      canViewPayables(role)
        ? this.prisma.vendorPayment.findMany({
            where: { ...inProjects, paymentDate: days2 },
            select: {
              paymentDate: true,
              amount: true,
              reference: true,
              project: { select: { name: true } },
              vendor: { select: { name: true } },
              vendorBill: { select: { id: true, billNo: true } },
              subcontractBill: { select: { id: true, billNo: true, workOrder: { select: { woNo: true } } } },
              purchaseOrder: { select: { id: true, poNo: true } },
              workOrder: { select: { id: true, woNo: true } },
            },
          })
        : null,
      canViewContract(role)
        ? this.prisma.receipt.findMany({
            where: { ...inProjects, receiptDate: days2 },
            select: { receiptDate: true, amount: true, reference: true, projectId: true, project: { select: { name: true } }, bill: { select: { id: true, billNo: true, isFinal: true, omYear: true } } },
          })
        : null,
      canViewContract(role) ? this.receivables.summary(user) : null,
      canViewPayables(role) ? this.payables.summary(user) : null,
      canViewLabourSummary(role) ? this.attendanceToday(user, projects, today) : null,
      seesMachinery ? this.fleet.fuelPosition(user, { date: today }) : null,
      canViewPurchaseOrders(role) ? this.purchaseToday(user, today) : null,
      this.lifecycle.submitted(user),
      this.lifecycle.waiting(user),
    ]);

    const out: CompanyTodayDto = { date: today, yesterday };
    const isToday = (d: Date) => d.toISOString().slice(0, 10) === today;
    if (payments) {
      const now = payments.filter((p) => isToday(p.paymentDate));
      out.payments = {
        today: money(sumOf(now, (p) => p.amount))!,
        yesterday: money(sumOf(payments.filter((p) => !isToday(p.paymentDate)), (p) => p.amount))!,
        countToday: now.length,
        rows: [...now]
          .sort((a, b) => b.amount.cmp(a.amount))
          .slice(0, COMPANY_TODAY_ROWS)
          .map((p) => ({
            party: p.vendor.name,
            reference: p.vendorBill?.billNo ?? (p.subcontractBill ? `${p.subcontractBill.workOrder.woNo} bill ${p.subcontractBill.billNo}` : null) ?? p.purchaseOrder?.poNo ?? p.workOrder?.woNo ?? p.reference,
            projectName: p.project.name,
            amount: money(p.amount)!,
            href: p.vendorBill
              ? submissionHref('VENDOR_BILL', p.vendorBill.id)
              : p.subcontractBill
                ? submissionHref('SUBCONTRACT_BILL', p.subcontractBill.id)
                : p.purchaseOrder
                  ? submissionHref('PURCHASE_ORDER', p.purchaseOrder.id)
                  : p.workOrder
                    ? submissionHref('WORK_ORDER', p.workOrder.id)
                    : null,
          })),
      };
    }
    if (receipts) {
      const client = new Map(projects.map((p) => [p.id, p.client?.name ?? p.clientName ?? p.name]));
      const now = receipts.filter((r) => isToday(r.receiptDate));
      out.receipts = {
        today: money(sumOf(now, (r) => r.amount))!,
        yesterday: money(sumOf(receipts.filter((r) => !isToday(r.receiptDate)), (r) => r.amount))!,
        countToday: now.length,
        rows: [...now]
          .sort((a, b) => b.amount.cmp(a.amount))
          .slice(0, COMPANY_TODAY_ROWS)
          .map((r) => ({
            party: client.get(r.projectId) ?? r.project.name,
            reference: r.bill ? billLabel(r.bill.billNo, r.bill.isFinal, r.bill.omYear !== null) : r.reference,
            projectName: r.project.name,
            amount: money(r.amount)!,
            href: r.bill ? `/bills/${r.bill.id}` : null,
          })),
      };
    }
    if (receivables) {
      // A client bill is overdue once it is past the project's payment days (30 when not set) from the day it was sent.
      const termsOf = new Map(projects.map((p) => [p.id, p.clientPaymentDays ?? DEFAULT_CLIENT_PAYMENT_DAYS]));
      const rows: DueRowDto[] = receivables.openBills
        .map((b) => ({
          label: [b.billLabel, b.clientName].filter(Boolean).join(' · '),
          projectName: b.projectName,
          outstanding: b.outstanding,
          daysOverdue: b.daysOutstanding - (termsOf.get(b.projectId) ?? DEFAULT_CLIENT_PAYMENT_DAYS),
          href: `/bills/${b.billId}`,
        }))
        .sort((a, b) => b.daysOverdue - a.daysOverdue);
      const overdue = rows.filter((r) => r.daysOverdue > 0);
      out.receivables = { outstanding: receivables.totals.outstanding, overdue: money(sumOf(overdue, (r) => new Prisma.Decimal(r.outstanding)))!, overdueCount: overdue.length, rows: rows.slice(0, COMPANY_TODAY_ROWS) };
    }
    if (payables) {
      const rows: DueRowDto[] = payables.openBills.map((b) => ({ label: `${b.billLabel} · ${b.vendorName}`, projectName: b.projectName, outstanding: b.outstanding, daysOverdue: -b.daysToDue, href: submissionHref(b.billType, b.billId) }));
      out.payables = { outstanding: payables.totals.outstanding, overdue: payables.totals.overdue, overdueCount: rows.filter((r) => r.daysOverdue > 0).length, rows: rows.slice(0, COMPANY_TODAY_ROWS) };
    }
    if (attendance) out.attendance = attendance;
    if (fuel) {
      const items = new Map<string, { itemName: string; unit: string; issued: D; closing: D; sitesBelowMin: number }>();
      for (const r of fuel.rows) {
        const i = items.get(r.itemId) ?? { itemName: r.itemName, unit: r.unit, issued: ZERO, closing: ZERO, sitesBelowMin: 0 };
        i.issued = i.issued.add(r.issuedToMachines);
        i.closing = i.closing.add(r.closing);
        if (r.minLevel !== null && new Prisma.Decimal(r.closing).lt(r.minLevel)) i.sitesBelowMin += 1;
        items.set(r.itemId, i);
      }
      out.fuel = {
        items: [...items.values()].map((i) => ({ ...i, issued: dec(i.issued)!, closing: dec(i.closing)! })),
        rows: fuel.rows
          .map((r) => ({ projectId: r.projectId, projectName: r.projectName, itemName: r.itemName, unit: r.unit, issued: r.issuedToMachines, closing: r.closing, belowMin: r.minLevel !== null && new Prisma.Decimal(r.closing).lt(r.minLevel) }))
          .sort((a, b) => Number(b.belowMin) - Number(a.belowMin) || new Prisma.Decimal(a.closing).cmp(b.closing)),
      };
    }
    if (purchase) out.purchase = purchase;

    // Approvals by module: everything waiting in the caller's projects, whoever decides it. Amounts for roles that see cost.
    const seesAmounts = canViewCost(role);
    const waitedDays = (since: string) => Math.max(0, daysBetween(todayIn(undefined, new Date(since)), today));
    const modules = new Map<SubmissionType, { type: SubmissionType; count: number; amount: D | null; oldestDays: number }>();
    for (const p of submitted) {
      const m = modules.get(p.type) ?? { type: p.type, count: 0, amount: null, oldestDays: 0 };
      m.count += 1;
      if (seesAmounts && p.amount !== null) m.amount = (m.amount ?? ZERO).add(p.amount);
      m.oldestDays = Math.max(m.oldestDays, waitedDays(p.submittedAt));
      modules.set(p.type, m);
    }
    const anyAmount = [...modules.values()].some((m) => m.amount !== null);
    out.approvals = {
      total: submitted.length,
      amount: seesAmounts && anyAmount ? money([...modules.values()].reduce((s, m) => s.add(m.amount ?? ZERO), ZERO))! : null,
      oldestDays: submitted.length ? waitedDays(submitted[0].submittedAt) : null,
      modules: [...modules.values()].sort((a, b) => b.count - a.count || b.oldestDays - a.oldestDays).map((m) => ({ ...m, amount: m.amount === null ? null : money(m.amount)! })),
    };
    const withAmount = waiting.filter((w) => w.amount !== null);
    out.waitingWithOthers = {
      count: waiting.length,
      amount: withAmount.length ? money(sumOf(withAmount, (w) => new Prisma.Decimal(w.amount!)))! : null,
      oldestDays: waiting.length ? waitedDays(waiting[0].waitingSince) : null,
    };
    return out;
  }

  /** Staff present (company-wide roles: everyone; a project manager: those posted at their sites) and labour per active site. */
  private async attendanceToday(user: RequestUser, projects: { id: string; name: string; status: string }[], today: string): Promise<NonNullable<CompanyTodayDto['attendance']>> {
    const day = parseDate(today);
    const active = projects.filter((p) => p.status === 'ACTIVE');
    const ids = projects.map((p) => p.id);
    const everyone = isCompanyWide(user.roleKey);
    const staffWhere = { organizationId: user.organizationId, ...(everyone ? {} : { projectId: { in: ids } }) };
    const [staff, marks, sheets, workers] = await Promise.all([
      this.prisma.employee.count({ where: { ...staffWhere, isActive: true, OR: [{ leftOn: null }, { leftOn: { gte: day } }] } }),
      this.prisma.staffAttendance.findMany({ where: { ...staffWhere, date: day }, select: { status: true, projectId: true } }),
      this.prisma.attendanceSheet.findMany({ where: { organizationId: user.organizationId, projectId: { in: ids }, date: day }, select: { projectId: true, totalWorkers: true } }),
      this.prisma.workerAttendance.groupBy({ by: ['projectId'], where: { organizationId: user.organizationId, projectId: { in: ids }, date: day, status: { in: ['PRESENT', 'HALF_DAY'] } }, _count: { _all: true } }),
    ]);
    const present = marks.filter((m) => m.status !== 'ABSENT');
    const labourAt = new Map<string, number>();
    for (const s of sheets) labourAt.set(s.projectId, (labourAt.get(s.projectId) ?? 0) + s.totalWorkers);
    for (const w of workers) labourAt.set(w.projectId, (labourAt.get(w.projectId) ?? 0) + w._count._all);
    const staffAt = new Map<string, number>();
    for (const m of present) if (m.projectId) staffAt.set(m.projectId, (staffAt.get(m.projectId) ?? 0) + 1);
    const rows = active
      .map((p) => ({ projectId: p.id, projectName: p.name, staffPresent: staffAt.get(p.id) ?? 0, labour: labourAt.get(p.id) ?? 0, reported: labourAt.has(p.id) || staffAt.has(p.id) }))
      .sort((a, b) => Number(a.reported) - Number(b.reported) || b.labour - a.labour);
    return {
      staffPresent: present.length,
      staffAbsent: marks.length - present.length,
      staffTotal: staff,
      labour: [...labourAt.values()].reduce((s, n) => s + n, 0),
      sitesReported: rows.filter((r) => r.reported).length,
      sites: active.length,
      rows,
    };
  }

  /** Requests still to order, orders still to come (late first), and today's receipts. */
  private async purchaseToday(user: RequestUser, today: string): Promise<PurchaseTodayDto> {
    const day = parseDate(today);
    const where = this.access.submissionWhere(user);
    const [orders, toOrder, grnsToday, unchecked] = await Promise.all([
      this.purchaseOrders.status(user, { show: 'PENDING' }),
      canPurchase(user.roleKey) ? this.toOrderList.rows(user) : Promise.resolve([]),
      this.prisma.stockEntry.count({ where: { ...where, type: 'RECEIPT', date: day } }),
      this.prisma.stockEntry.count({ where: { ...where, type: 'RECEIPT', purchaseOrderId: { not: null }, qcStatus: null, date: { gte: new Date(day.getTime() - 30 * 86_400_000) } } }),
    ]);
    const late = orders.rows.filter((r) => r.daysLate > 0);
    const rows: PurchaseTodayDto['rows'] = [
      ...late.map((r) => ({ kind: 'ORDER' as const, label: `${r.poNo} · ${r.vendorName}`, projectName: r.projectName, amount: r.pendingValue, daysLate: r.daysLate, href: `/purchase-orders/${r.purchaseOrderId}` })),
      ...toOrder.map((r) => ({ kind: 'REQUEST' as const, label: r.requestNo, projectName: r.projectName, amount: null, daysLate: Math.max(0, daysBetween(r.requiredDate, today)), href: `/requests-to-order/${r.id}` })),
    ].slice(0, COMPANY_TODAY_ROWS);
    return {
      requestsToOrder: toOrder.length,
      ordersOpen: orders.totals.pending,
      ordersOpenValue: orders.totals.pendingValue,
      ordersLate: orders.totals.late,
      grnsToday,
      grnsAwaitingCheck: unchecked,
      rows,
    };
  }

  private async dprsMissing(user: RequestUser, today: string) {
    const projects = await this.prisma.project.findMany({
      // A central store files no DPR (v6 item 106).
      where: { ...this.access.projectWhere(user), status: 'ACTIVE', type: { not: 'STORE' }, dailyReports: { none: { date: parseDate(today) } } },
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
