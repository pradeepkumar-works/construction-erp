import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DEFAULT_CLIENT_PAYMENT_DAYS,
  FORECAST_ERROR_WEEKS,
  FORECAST_WEEKS,
  PACE_DAYS,
  billLabel,
  nextBill,
  stagesUnbilled,
  canSeeCashForecast,
  canViewContract,
  canViewLetters,
  type AiDraftDto,
  type BillingReadinessDto,
  type BillingReadinessRowDto,
  type CashFlowItemDto,
  type CashForecastDto,
  type CashWeekDto,
} from '@erp/shared';
import type { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { dateOnly, parseDate } from '../common/serialize';
import { PrismaService } from '../prisma/prisma.service';
import { todayIn } from '../notifications/time';
import { BooksService } from '../books/books.service';
import { ReceivablesService } from '../receivables/receivables.service';
import { PayablesService } from '../payables/payables.service';
import { DocumentTextService } from '../documents/document-text.service';
import { MeasurementsService } from '../measurements/measurements.service';
import { StageBillingService } from '../stage-billing/stage-billing.service';
import {
  type Dates,
  type PayTiming,
  addDays,
  around,
  chaseAndHold,
  clientBillDates,
  clientBillWhy,
  day,
  daysBetween,
  forecastError,
  forecastWeeks,
  lowestWeek,
  mondayOf,
  monthlyDates,
  paymentClause,
  nextBillDate,
  payTiming,
  purchaseOrderDates,
  rupees,
  statutoryDueDate,
  totalsByKind,
  workOrderRunRate,
} from './cash-forecast-rules';

const N = (v: Prisma.Decimal | number | string | null | undefined) => Number(v ?? 0);
const isMsme = (c: string | null | undefined) => c === 'MICRO' || c === 'SMALL';
const DEFAULT_SALARY_DAY = 7;

/** A project's client's payment timing. */
interface Clients {
  timingOf(projectId: string): PayTiming;
}

/**
 * The 13-week cash forecast and billing readiness. Every figure comes from the module's own records and
 * the books: the opening balance is the bank and cash ledgers, money in is the open client bills at each client's days
 * and the measured work not yet billed, money out is the open bills, purchase and work orders, salaries, machine loan
 * EMIs, statutory dues and approved fund requests. The arithmetic is `cash-forecast-rules.ts`.
 */
@Injectable()
export class CashForecastService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private books: BooksService,
    private receivables: ReceivablesService,
    private payables: PayablesService,
    private documents: DocumentTextService,
    private measurements: MeasurementsService,
    private stageBilling: StageBillingService,
  ) {}

  private assertSee(user: RequestUser) {
    if (!canSeeCashForecast(user.roleKey)) throw new ForbiddenException('The cash forecast is for accounts and management');
  }

  /** Bank and cash in the books at the end of a day (today when none). */
  async balance(user: RequestUser, to?: string) {
    const accounts = await this.books.accounts(user, to ? { to } : {});
    const sum = (g: string) => accounts.filter((a) => a.group === g).reduce((s, a) => s + N(a.balance), 0);
    // Duties & Taxes is a liability: a credit balance (negative) is what is owed.
    return { bank: sum('BANK_ACCOUNTS'), cash: sum('CASH_IN_HAND'), duties: -sum('DUTIES_TAXES') };
  }

  /** The forecast as of today, stored once a week so a later week can show how far it was out. */
  async forecast(user: RequestUser): Promise<CashForecastDto> {
    this.assertSee(user);
    const today = todayIn();
    const opening = await this.balance(user);
    const items = await this.items(user, today, opening.duties);
    const weeks = forecastWeeks(opening.bank + opening.cash, items, today);
    const { chase, hold, squeeze } = chaseAndHold(items, weeks);
    const lowest = lowestWeek(weeks);
    await this.snapshot(user.organizationId, today, opening.bank + opening.cash, weeks);
    const error = await this.error(user, today);
    const horizon = weeks[weeks.length - 1].end;
    return {
      asOf: today,
      opening: { bank: opening.bank, cash: opening.cash, total: opening.bank + opening.cash },
      weeks,
      items: items.filter((i) => i.likely <= horizon || i.early <= horizon).sort((a, b) => a.likely.localeCompare(b.likely) || b.amount - a.amount),
      byKind: totalsByKind(items, weeks),
      firstShort: squeeze?.start ?? null,
      lowest: { week: lowest.start, closing: lowest.closing },
      chase,
      hold,
      error,
      assumptions: [
        'Opening balance: the bank and cash-in-hand ledgers in the books today',
        'Client bills: what is still owed at the bill’s net payable, at the sent date plus the days that client has taken on average; the low and high case move it by how widely those days vary (a week at least), and by two weeks either side on the contract’s days for a client with fewer than two paid bills',
        'Measured work not billed: approved measurements in no RA bill at BOQ rates, expected in the next RA bill (the same day of the month as the last) and paid at the client’s days. Left out of the low case',
        'Vendor and subcontractor bills on their due dates; anything overdue is taken as paid this week',
        'Open purchase orders: the unbilled balance paid its days (30 when none) after delivery; open work orders at the pace of their last 90 days of bills',
        'Salaries: the latest month’s payroll each month on the day it was paid; machine loan EMIs on their due dates; statutory dues in the books on the 20th',
        'Approved advances and fund requests not yet paid, on the day they are needed',
      ],
    };
  }

  /** Every receipt and payment expected, dated early, likely and late. */
  async items(user: RequestUser, today: string, duties: number): Promise<CashFlowItemDto[]> {
    const org = user.organizationId;
    const projects = await this.prisma.project.findMany({
      where: this.access.projectWhere(user),
      select: { id: true, code: true, name: true, clientId: true, clientName: true, clientPaymentDays: true, client: { select: { name: true } } },
    });
    const ids = projects.map((p) => p.id);
    const projectOf = new Map(projects.map((p) => [p.id, p]));
    const clients = await this.clients(projects);
    const horizon = addDays(mondayOf(today), FORECAST_WEEKS * 7 - 1);
    const since90 = parseDate(addDays(today, -90));

    const [recv, pay, nets, unbilled, lastBills, orders, works, payroll, emis, requests] = await Promise.all([
      this.receivables.summary(user),
      this.payables.summary(user),
      this.prisma.raBill.findMany({ where: { projectId: { in: ids }, status: 'APPROVED', stage: { not: 'NOT_SENT' }, paidDate: null }, select: { id: true, grossAmount: true, pvAmount: true, gstAmount: true, netPayable: true } }),
      this.prisma.measurementSheet.findMany({
        where: { projectId: { in: ids }, status: 'APPROVED', raBillId: null, workOrderId: null },
        select: { projectId: true, totalQty: true, date: true, boqItem: { select: { rate: true } } },
      }),
      this.prisma.raBill.findMany({ where: { projectId: { in: ids }, status: 'APPROVED' }, orderBy: { billDate: 'desc' }, distinct: ['projectId'], select: { projectId: true, billDate: true, grossAmount: true, netPayable: true } }),
      this.prisma.purchaseOrder.findMany({
        where: { projectId: { in: ids }, status: 'APPROVED', closedAt: null },
        select: {
          id: true, poNo: true, projectId: true, poDate: true, deliveryBy: true, paymentDays: true, total: true,
          vendor: { select: { name: true, msmeCategory: true } },
          vendorBills: { where: { status: { in: ['DRAFT', 'SUBMITTED', 'APPROVED', 'CHANGES_REQUESTED'] } }, select: { total: true } },
        },
      }),
      this.prisma.workOrder.findMany({
        where: { projectId: { in: ids }, status: 'APPROVED', closedAt: null },
        select: {
          id: true, woNo: true, projectId: true, value: true, paymentDays: true,
          vendor: { select: { name: true, msmeCategory: true } },
          bills: { where: { status: { in: ['DRAFT', 'SUBMITTED', 'APPROVED', 'CHANGES_REQUESTED'] } }, select: { grossAmount: true, netPayable: true, billDate: true } },
        },
      }),
      this.prisma.payrollRun.findMany({ where: { organizationId: org, status: { in: ['APPROVED', 'PAID'] } }, orderBy: { month: 'desc' }, select: { month: true, net: true, paidOn: true } }),
      this.prisma.loanEmi.findMany({
        where: { organizationId: org, paidOn: null, dueDate: { lte: parseDate(horizon) }, loan: { status: 'ACTIVE' } },
        select: { id: true, no: true, dueDate: true, emi: true, loan: { select: { id: true, lenderName: true, equipment: { select: { name: true } } } } },
      }),
      this.prisma.paymentRequest.findMany({
        where: { projectId: { in: ids }, status: 'APPROVED', kind: { in: ['FUND_REQUEST', 'PO_ADVANCE', 'WO_ADVANCE'] } },
        select: { id: true, requestNo: true, projectId: true, kind: true, amount: true, paidAmount: true, neededBy: true, vendor: { select: { name: true, msmeCategory: true } } },
      }),
    ]);

    const items: CashFlowItemDto[] = [];
    const add = (i: Omit<CashFlowItemDto, 'early' | 'likely' | 'late' | 'overdue' | 'projectCode'> & { dates: Dates }) => {
      const { dates, ...rest } = i;
      if (!(i.amount > 0.5)) return;
      items.push({ ...rest, projectCode: i.projectId ? projectOf.get(i.projectId)?.code ?? null : null, early: dates.early, likely: dates.likely, late: dates.late, overdue: dates.overdue });
    };

    // Money in: client bills sent, at their net payable (what the client pays after deductions) less what came in.
    const netOf = new Map(nets.map((b) => [b.id, b]));
    for (const b of recv.openBills) {
      const t = clients.timingOf(b.projectId);
      const n = netOf.get(b.billId);
      const invoice = n ? N(n.grossAmount) + N(n.pvAmount) + N(n.gstAmount) : N(b.invoiceAmount);
      const share = n && invoice > 0 ? Math.min(1, N(n.netPayable) / invoice) : 1;
      add({
        key: `bill:${b.billId}`,
        kind: 'CLIENT_BILL',
        direction: 'IN',
        label: `${b.billLabel.replace('RA bill ', 'RA-')} ${b.projectName}`,
        projectId: b.projectId,
        amount: Math.round(N(b.outstanding) * share),
        uncertain: false,
        why: clientBillWhy(b.sentDate, t, today),
        msme: false,
        href: `/bills/${b.billId}`,
        dates: clientBillDates(b.sentDate, t, today),
      });
    }

    // Measured work in no bill yet: the next RA bill, paid at the client's days. Cash at the last bill's net ÷ gross.
    const lastOf = new Map(lastBills.map((b) => [b.projectId, b]));
    const mbBy = new Map<string, { value: number; sheets: number; oldest: string }>();
    for (const m of unbilled) {
      const v = mbBy.get(m.projectId) ?? { value: 0, sheets: 0, oldest: dateOnly(m.date)! };
      v.value += N(m.totalQty) * N(m.boqItem.rate);
      v.sheets += 1;
      if (dateOnly(m.date)! < v.oldest) v.oldest = dateOnly(m.date)!;
      mbBy.set(m.projectId, v);
    }
    for (const [projectId, v] of mbBy) {
      const p = projectOf.get(projectId)!;
      const last = lastOf.get(projectId);
      const ratio = last && N(last.grossAmount) > 0 ? N(last.netPayable) / N(last.grossAmount) : 1;
      const billOn = nextBillDate(last ? dateOnly(last.billDate) : null, today);
      const t = clients.timingOf(projectId);
      add({
        key: `mb:${projectId}`,
        kind: 'UNBILLED_WORK',
        direction: 'IN',
        label: `${v.sheets === 1 ? '1 measurement' : `${v.sheets} measurements`} not billed, ${p.name}`,
        projectId,
        amount: Math.round(v.value * ratio),
        uncertain: true,
        why: `In the next RA bill about ${day(billOn)}, then ${t.days} days to pay${t.own ? ' (this client’s average)' : ' (contract)'}; oldest measured ${day(v.oldest)}`,
        msme: false,
        href: `/measurements?projectId=${projectId}&status=APPROVED`,
        dates: around(addDays(billOn, t.days), t.spread, t.spread, today),
      });
    }

    // Money out: open bills on their due dates.
    for (const b of pay.openBills) {
      const due = b.dueDate;
      add({
        key: `${b.billType === 'VENDOR_BILL' ? 'vbill' : 'scbill'}:${b.billId}`,
        kind: b.billType === 'VENDOR_BILL' ? 'VENDOR_BILL' : 'SUBCONTRACT_BILL',
        direction: 'OUT',
        label: `${b.billLabel} ${b.vendorName}`,
        projectId: b.projectId,
        amount: N(b.outstanding),
        uncertain: false,
        why: due < today ? `Due ${day(due)}, ${daysBetween(due, today)} days overdue` : `Due ${day(due)}`,
        msme: isMsme(b.vendorMsme),
        href: b.billType === 'VENDOR_BILL' ? `/vendor-bills/${b.billId}` : `/subcontract-bills/${b.billId}`,
        dates: around(due, 0, 7, today),
      });
    }

    for (const o of orders) {
      const left = N(o.total) - o.vendorBills.reduce((s, b) => s + N(b.total), 0);
      const dates = purchaseOrderDates(dateOnly(o.poDate)!, dateOnly(o.deliveryBy), o.paymentDays, today);
      add({
        key: `po:${o.id}`,
        kind: 'PURCHASE_ORDER',
        direction: 'OUT',
        label: `${o.poNo} ${o.vendor.name}`,
        projectId: o.projectId,
        amount: Math.round(left),
        uncertain: false,
        why: `${rupees(left)} not billed yet; delivery ${o.deliveryBy ? `by ${day(dateOnly(o.deliveryBy)!)}` : 'two weeks after the order'}, paid ${o.paymentDays ?? 30} days after`,
        msme: isMsme(o.vendor.msmeCategory),
        href: `/purchase-orders/${o.id}`,
        dates,
      });
    }

    for (const w of works) {
      const billedGross = w.bills.reduce((s, b) => s + N(b.grossAmount), 0);
      const recent = w.bills.filter((b) => b.billDate >= since90);
      const recentNet = recent.reduce((s, b) => s + N(b.netPayable), 0);
      const recentGross = recent.reduce((s, b) => s + N(b.grossAmount), 0);
      const ratio = recentGross > 0 ? recentNet / recentGross : 1;
      const days = w.paymentDays ?? (isMsme(w.vendor.msmeCategory) ? 45 : 30);
      workOrderRunRate((N(w.value) - billedGross) * ratio, recentNet, days, today).forEach((r, i) =>
        add({
          key: `wo:${w.id}:${i}`,
          kind: 'WORK_ORDER',
          direction: 'OUT',
          label: `${w.woNo} ${w.vendor.name}`,
          projectId: w.projectId,
          amount: Math.round(r.amount),
          uncertain: false,
          why: `Bill ${i + 1} of the next three at the last 90 days’ pace (${rupees(recentNet / 3)} a month), paid ${days} days after`,
          msme: isMsme(w.vendor.msmeCategory),
          href: `/work-orders/${w.id}`,
          dates: r.dates,
        }),
      );
    }

    // Salaries: the latest month's payroll, every month on the day it was paid.
    if (payroll.length) {
      const month = payroll[0].month;
      const runs = payroll.filter((r) => r.month === month);
      const net = runs.reduce((s, r) => s + N(r.net), 0);
      const paidOn = runs.map((r) => dateOnly(r.paidOn)).find(Boolean);
      const payDay = paidOn ? Number(paidOn.slice(8, 10)) : DEFAULT_SALARY_DAY;
      for (const d of monthlyDates(payDay, today, horizon))
        add({
          key: `salary:${d.slice(0, 7)}`,
          kind: 'SALARY',
          direction: 'OUT',
          label: `Salaries for ${monthName(addDays(d, -28).slice(0, 7))}`,
          projectId: null,
          amount: Math.round(net),
          uncertain: false,
          why: `The ${monthName(month)} payroll, ${rupees(net)} net, paid on the ${payDay}${ordinal(payDay)}`,
          msme: false,
          href: '/payroll',
          dates: around(d, 2, 3, today),
        });
    }

    for (const e of emis) {
      const due = dateOnly(e.dueDate)!;
      add({
        key: `emi:${e.id}`,
        kind: 'LOAN_EMI',
        direction: 'OUT',
        label: `EMI ${e.no} ${e.loan.equipment.name}, ${e.loan.lenderName}`,
        projectId: null,
        amount: N(e.emi),
        uncertain: false,
        why: due < today ? `Due ${day(due)}, not marked paid` : `Due ${day(due)}`,
        msme: false,
        href: `/machine-loans/${e.loan.id}`,
        dates: around(due, 0, 0, today),
      });
    }

    if (duties > 0.5) {
      const due = statutoryDueDate(today);
      add({
        key: `statutory:${due}`,
        kind: 'STATUTORY',
        direction: 'OUT',
        label: 'Duties and taxes in the books',
        projectId: null,
        amount: Math.round(duties),
        uncertain: false,
        why: `The Duties & Taxes balance today, paid on ${day(due)}`,
        msme: false,
        href: '/books?tab=accounts',
        dates: around(due, 0, 0, today),
      });
    }

    for (const r of requests) {
      const left = N(r.amount) - N(r.paidAmount);
      const needed = dateOnly(r.neededBy) ?? today;
      add({
        key: `request:${r.id}`,
        kind: 'PAYMENT_REQUEST',
        direction: 'OUT',
        label: `${r.requestNo}${r.vendor ? ` ${r.vendor.name}` : ''}`,
        projectId: r.projectId,
        amount: left,
        uncertain: false,
        why: r.neededBy ? `Approved, needed by ${day(needed)}` : 'Approved, not yet paid',
        msme: isMsme(r.vendor?.msmeCategory),
        href: `/payment-requests/${r.id}`,
        dates: around(needed, 0, 7, today),
      });
    }
    return items;
  }

  /** Each client's payment timing from their paid bills (company-wide, so a client's other projects count). */
  private async clients(projects: { id: string; clientId: string | null; clientName: string | null; clientPaymentDays: number | null; client: { name: string } | null }[]): Promise<Clients> {
    const keyOf = (p: { id: string; clientId: string | null; clientName: string | null }) => p.clientId ?? p.clientName?.trim().toLowerCase() ?? p.id;
    const paid = await this.prisma.raBill.findMany({
      where: { projectId: { in: projects.map((p) => p.id) }, sentDate: { not: null }, paidDate: { not: null } },
      select: { sentDate: true, paidDate: true, project: { select: { id: true, clientId: true, clientName: true } } },
    });
    const history = new Map<string, { sentDate: string; paidDate: string }[]>();
    for (const b of paid) {
      const k = keyOf(b.project);
      history.set(k, [...(history.get(k) ?? []), { sentDate: dateOnly(b.sentDate)!, paidDate: dateOnly(b.paidDate)! }]);
    }
    const byId = new Map(projects.map((p) => [p.id, p]));
    const cache = new Map<string, PayTiming>();
    return {
      timingOf: (projectId) => {
        const p = byId.get(projectId);
        if (!p) return payTiming([], DEFAULT_CLIENT_PAYMENT_DAYS);
        const k = keyOf(p);
        if (!cache.has(k)) cache.set(k, payTiming(history.get(k) ?? [], p.clientPaymentDays));
        return cache.get(k)!;
      },
    };
  }

  /** One snapshot a week: the first forecast made in it. */
  private async snapshot(organizationId: string, today: string, opening: number, weeks: CashWeekDto[]) {
    const weekStart = parseDate(mondayOf(today));
    await this.prisma.cashForecastSnapshot.upsert({
      where: { organizationId_weekStart: { organizationId, weekStart } },
      create: { organizationId, weekStart, asOf: parseDate(today), opening: new Prisma.Decimal(opening.toFixed(2)), weeks: weeks as unknown as Prisma.InputJsonValue },
      update: {},
    });
  }

  /** The forecast made four weeks ago for the week just ended, against the books' bank and cash at its end. */
  private async error(user: RequestUser, today: string) {
    const lastSunday = addDays(mondayOf(today), -1);
    const snap = await this.prisma.cashForecastSnapshot.findFirst({
      where: { organizationId: user.organizationId, weekStart: { lte: parseDate(addDays(mondayOf(today), -FORECAST_ERROR_WEEKS * 7)) } },
      orderBy: { weekStart: 'desc' },
    });
    if (!snap) return null;
    const actual = await this.balance(user, lastSunday);
    return forecastError(dateOnly(snap.asOf)!, snap.weeks as unknown as CashWeekDto[], lastSunday, actual.bank + actual.cash);
  }

  // Billing readiness

  /** Per project: approved measurements in no RA bill, approved bills not sent, sent bills not paid (late past the client's days). */
  async readiness(user: RequestUser, projectId?: string): Promise<BillingReadinessDto> {
    if (!canViewContract(user.roleKey)) throw new ForbiddenException('Your role cannot see billing');
    if (projectId) await this.access.assertCanAccessProject(user, projectId);
    const today = todayIn();
    const projects = await this.prisma.project.findMany({
      where: { ...this.access.projectWhere(user), ...(projectId ? { id: projectId } : {}), type: { notIn: ['STORE', 'PLANT'] } },
      select: { id: true, code: true, name: true, clientId: true, clientName: true, clientPaymentDays: true, client: { select: { name: true } } },
      orderBy: { code: 'asc' },
    });
    const ids = projects.map((p) => p.id);
    const clients = await this.clients(projects);
    const [sheets, notSent, recv] = await Promise.all([
      this.prisma.measurementSheet.findMany({ where: { projectId: { in: ids }, status: 'APPROVED', raBillId: null, workOrderId: null }, select: { projectId: true, totalQty: true, date: true, boqItem: { select: { rate: true } } } }),
      this.prisma.raBill.findMany({ where: { projectId: { in: ids }, status: 'APPROVED', stage: 'NOT_SENT' }, orderBy: { billDate: 'asc' }, select: { id: true, projectId: true, billNo: true, isFinal: true, omYear: true, billDate: true, netPayable: true } }),
      this.receivables.summary(user),
    ]);
    const nexts = await this.nextBills(user, ids, today);
    const rows: BillingReadinessRowDto[] = projects.map((p) => ({
      projectId: p.id,
      projectCode: p.code,
      projectName: p.name,
      clientName: p.client?.name ?? p.clientName,
      unbilledValue: 0,
      unbilledSheets: 0,
      oldestUnbilled: null,
      notSent: [],
      unpaid: [],
      next: nexts.get(p.id)!,
    }));
    const rowOf = new Map(rows.map((r) => [r.projectId, r]));
    for (const s of sheets) {
      const r = rowOf.get(s.projectId)!;
      r.unbilledValue += N(s.totalQty) * N(s.boqItem.rate);
      r.unbilledSheets += 1;
      const d = dateOnly(s.date)!;
      if (!r.oldestUnbilled || d < r.oldestUnbilled) r.oldestUnbilled = d;
    }
    for (const b of notSent) rowOf.get(b.projectId)!.notSent.push({ billId: b.id, label: billLabel(b.billNo, b.isFinal, b.omYear !== null), billDate: dateOnly(b.billDate)!, amount: N(b.netPayable) });
    for (const b of recv.openBills) {
      const r = rowOf.get(b.projectId);
      if (!r) continue;
      const t = clients.timingOf(b.projectId);
      r.unpaid.push({ billId: b.billId, label: b.billLabel, sentDate: b.sentDate, daysOutstanding: b.daysOutstanding, expectedDays: t.days, outstanding: N(b.outstanding), late: b.daysOutstanding > t.days });
    }
    for (const r of rows) r.unbilledValue = Math.round(r.unbilledValue);
    const shown = rows.filter((r) => r.unbilledSheets || r.notSent.length || r.unpaid.length || r.next.atBillBy > 0);
    return {
      asOf: today,
      billBy: nextBill({ measured: 0, toMeasure: 0, stages: 0, workLastDays: 0, today }).billBy,
      rows: shown,
      totals: {
        unbilled: shown.reduce((s, r) => s + r.unbilledValue, 0),
        notSent: shown.reduce((s, r) => s + r.notSent.reduce((a, b) => a + b.amount, 0), 0),
        unpaid: shown.reduce((s, r) => s + r.unpaid.reduce((a, b) => a + b.outstanding, 0), 0),
        pastDue: shown.reduce((s, r) => s + r.unpaid.filter((b) => b.late).reduce((a, b) => a + b.outstanding, 0), 0),
        nextNow: shown.reduce((s, r) => s + r.next.now, 0),
        nextAtBillBy: shown.reduce((s, r) => s + r.next.atBillBy, 0),
      },
    };
  }

  /**
   * Each project's next bill (`nextBill`): approved measurements in no bill, approved work no
   * sheet holds yet (`MeasurementsService.toMeasure`), lump-sum stages done beyond what was billed (`StageBillingService.breakup`),
   * and the pace of approved work over the last `PACE_DAYS` at BOQ rates, on activities in their BOQ item's own unit.
   */
  private async nextBills(user: RequestUser, ids: string[], today: string) {
    const from = parseDate(dateOnly(new Date(Date.parse(`${today}T00:00:00Z`) - (PACE_DAYS - 1) * 86_400_000))!);
    const [sheets, recent, staged] = await Promise.all([
      this.prisma.measurementSheet.findMany({ where: { projectId: { in: ids }, status: 'APPROVED', raBillId: null, workOrderId: null }, select: { projectId: true, totalQty: true, boqItem: { select: { rate: true } } } }),
      this.prisma.progressEntry.findMany({
        where: { projectId: { in: ids }, status: 'APPROVED', date: { gte: from, lte: parseDate(today) }, activity: { boqItemId: { not: null } } },
        select: { projectId: true, quantity: true, activity: { select: { unit: true, boqItem: { select: { unit: true, rate: true } } } } },
      }),
      this.prisma.billingComponent.groupBy({ by: ['projectId'], where: { projectId: { in: ids } } }),
    ]);
    const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
    const measured = new Map<string, number>();
    for (const s of sheets) add(measured, s.projectId, N(s.totalQty) * N(s.boqItem.rate));
    const work = new Map<string, number>();
    const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
    for (const e of recent) if (e.activity.boqItem && same(e.activity.unit, e.activity.boqItem.unit)) add(work, e.projectId, N(e.quantity) * N(e.activity.boqItem.rate));
    const stagedIds = new Set(staged.map((s) => s.projectId));
    const out = new Map<string, ReturnType<typeof nextBill>>();
    await Promise.all(
      ids.map(async (id) => {
        const toMeasure = (await this.measurements.toMeasure(user, id)).reduce((s, i) => s + Number(i.toMeasureAmount), 0);
        let stages = 0;
        if (stagedIds.has(id)) {
          const b = await this.stageBilling.breakup(user, id);
          if (b.stageBilling) stages = stagesUnbilled(b.components.filter((c) => !b.components.some((k) => k.parentId === c.id)).flatMap((c) => c.stages.map((st) => ({ value: Number(st.value), evidencePct: st.evidencePct, billedPct: st.billedPct }))));
        }
        out.set(id, nextBill({ measured: measured.get(id) ?? 0, toMeasure, stages, workLastDays: work.get(id) ?? 0, today }));
      }),
    );
    return out;
  }

  /**
   * A payment reminder for a sent bill not yet paid (usually one past the client's days), as an OUT letter for the project manager to check and
   * send: the bill's figures, how long it has waited and the contract's payment clause found by document search. Nothing
   * is saved; the letter form opens filled in.
   */
  async reminder(user: RequestUser, billId: string): Promise<AiDraftDto> {
    if (!canViewContract(user.roleKey) || !canViewLetters(user.roleKey)) throw new ForbiddenException('Your role cannot write payment reminders');
    const bill = await this.prisma.raBill.findFirst({
      where: { id: billId, organizationId: user.organizationId, project: this.access.projectWhere(user) },
      select: {
        id: true, billNo: true, isFinal: true, omYear: true, billDate: true, sentDate: true, netPayable: true, stage: true, paidDate: true,
        project: { select: { id: true, name: true, clientName: true, clientPaymentDays: true, agreementNo: true, client: { select: { name: true } } } },
      },
    });
    if (!bill) throw new NotFoundException('Bill not found or not accessible');
    if (bill.stage === 'NOT_SENT' || !bill.sentDate) throw new BadRequestException('Send the bill to the client before reminding them to pay it');
    if (bill.stage === 'PAID' || bill.paidDate) throw new BadRequestException('This bill is paid');
    const today = todayIn();
    const label = billLabel(bill.billNo, bill.isFinal, bill.omYear !== null);
    const sent = dateOnly(bill.sentDate);
    const party = bill.project.client?.name ?? bill.project.clientName ?? undefined;
    const open = (await this.receivables.summary(user, { projectId: bill.project.id })).openBills.find((b) => b.billId === bill.id);
    const outstanding = open ? N(open.outstanding) : N(bill.netPayable);
    const hits = (await this.documents.search(user, { query: 'payment running account bill within days interest delayed', projectId: bill.project.id, limit: 3 })).hits;
    const found = hits.filter((h) => h.source === 'DOCUMENT').map((h) => ({ hit: h, clause: paymentClause(h.text) })).find((c) => c.clause);
    const clause = found ? { ...found.clause!, docNo: found.hit.title.split(' ')[0], page: found.hit.page } : null;
    const days = bill.project.clientPaymentDays ?? clause?.days ?? null;
    const waited = sent ? daysBetween(sent, today) : null;
    const flags: { field: string; note: string }[] = [];
    if (!party) flags.push({ field: 'party', note: 'The project has no client name: say who the letter is to' });
    if (!clause) flags.push({ field: 'body', note: 'No payment clause was found in the filed contract: check the days before sending' });
    const lines = [
      `We refer to our ${label} dated ${longDate(dateOnly(bill.billDate)!)} for ${bill.project.name}${bill.project.agreementNo ? ` under agreement ${bill.project.agreementNo}` : ''}${sent ? `, submitted on ${longDate(sent)}` : ''}.`,
      '',
      `${inr(outstanding)} remains unpaid${waited !== null ? ` ${waited} days after submission` : ''}${days && waited !== null ? (waited > days ? `, beyond the ${days} days the contract allows` : `; the contract allows ${days} days`) : ''}.`,
      ...(clause ? ['', `Clause ${clause.no} of the agreement (${clause.docNo}) reads: "${clause.text}"`] : []),
      '',
      'We request you to release the payment at the earliest, so that the work continues without interruption.',
    ];
    return {
      kind: 'letter',
      title: `Payment reminder for ${label}, ${bill.project.name}`,
      projectId: bill.project.id,
      projectName: bill.project.name,
      values: { projectId: bill.project.id, direction: 'OUT', letterDate: today, party, subject: `Payment of ${label} for ${bill.project.name}`, body: lines.join('\n').slice(0, 20000), category: 'bill-and-payment' },
      flags,
      note: clause ? `Drafted from the bill and clause ${clause.no} of ${clause.docNo}, page ${clause.page}` : 'Drafted from the bill',
    };
  }
}

/** 2026-09 → "September 2026". */
const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const ordinal = (n: number) => (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
const longDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const inr = (v: number) => `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
