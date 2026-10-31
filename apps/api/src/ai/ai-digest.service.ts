import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { submissionHref } from '@erp/shared';
import type { RequestUser } from '../common/current-user';
import { SubmissionLifecycleService } from '../common/submission-lifecycle.service';
import { ProjectsService } from '../projects/projects.service';
import { ProgressService } from '../progress/progress.service';
import { DprService } from '../dpr/dpr.service';
import { AttendanceService } from '../attendance/attendance.service';
import { MachineryService } from '../machinery/machinery.service';
import { StockService } from '../stock/stock.service';
import { RisksService } from '../risks/risks.service';
import { MaterialRequestsService } from '../material-requests/material-requests.service';
import { VendorBillsService } from '../purchasing/vendor-bills.service';
import { SubcontractBillsService } from '../subcontracts/subcontract-bills.service';
import { RaBillsService } from '../ra-bills/ra-bills.service';
import { ScheduleService } from '../planning/schedule.service';
import { todayIn } from '../notifications/time';

/** Rows a list section keeps; the totals are over every row. */
const ROWS = 15;
/** Rows read from one list: a week of a busy site fits. */
const READ = 100;

const n = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? 0 : Number(v));
const round = (v: number, places = 3) => Math.round(v * 10 ** places) / 10 ** places;
const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const within = (date: string | null | undefined, from: string, to: string) => !!date && date.slice(0, 10) >= from && date.slice(0, 10) <= to;

/**
 * Runs one section of a digest. A section the user's role may not see comes back as a note instead of failing the
 * whole digest, so a site engineer's weekly summary still has the site parts.
 */
async function section<T>(fn: () => Promise<T>): Promise<T | { notAllowed: string }> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ForbiddenException) return { notAllowed: 'Outside what this role can see' };
    throw e;
  }
}

/**
 * The digests behind "Summarise this week", "Explain" on a late activity and "What changed" on an RA bill.
 * Each gathers in one call what the answer needs from the same list services the pages use, with the asking user,
 * so access rules apply unchanged and the model reads one result instead of making eight calls.
 */
@Injectable()
export class AiDigestService {
  constructor(
    private lifecycle: SubmissionLifecycleService,
    private projects: ProjectsService,
    private progress: ProgressService,
    private dpr: DprService,
    private attendance: AttendanceService,
    private machinery: MachineryService,
    private stock: StockService,
    private risks: RisksService,
    private mrs: MaterialRequestsService,
    private vendorBills: VendorBillsService,
    private subBills: SubcontractBillsService,
    private raBills: RaBillsService,
    private schedule: ScheduleService,
  ) {}

  /** A project's week (or any period up to 31 days): work against plan, labour, machines, materials, bills, risks, decisions. */
  async week(user: RequestUser, projectId: string, from?: string, to?: string) {
    const end = to ?? todayIn();
    const start = from ?? addDays(end, -6);
    if (start > end) throw new BadRequestException('from must be on or before to');
    if (addDays(start, 31) < end) throw new BadRequestException('Ask for 31 days or fewer; for longer, use monthly_trends or project_cost');
    const project = await this.projects.get(user, projectId);
    const range = { projectId, from: start, to: end, page: 1, pageSize: READ };

    const [progress, gantt, dprs, sheets, logs, receipts, vendorBills, subBills, risks, pending] = await Promise.all([
      this.progress.list(user, range as never),
      this.schedule.gantt(user, projectId),
      this.dpr.list(user, range as never),
      this.attendance.list(user, range as never),
      this.machinery.list(user, range as never),
      section(() => this.stock.list(user, { ...range, type: 'RECEIPT' } as never)),
      section(() => this.vendorBills.list(user, range as never)),
      section(() => this.subBills.list(user, range as never)),
      this.risks.list(user, { projectId, page: 1, pageSize: READ, sortBy: 'createdAt', sortOrder: 'desc' } as never),
      this.lifecycle.pending(user),
    ]);

    const byActivity = new Map<string, { activity: string; unit: string; quantity: number; approved: number; entries: number }>();
    for (const p of progress.items.filter((p) => within(p.date, start, end) && p.status !== 'REJECTED' && p.status !== 'DRAFT')) {
      const a = byActivity.get(p.activityId) ?? { activity: p.activityName, unit: p.unit, quantity: 0, approved: 0, entries: 0 };
      a.quantity = round(a.quantity + n(p.quantity));
      if (p.status === 'APPROVED') a.approved = round(a.approved + n(p.quantity));
      a.entries += 1;
      byActivity.set(p.activityId, a);
    }

    const labour = new Map<string, number>();
    let manDays = 0;
    for (const s of sheets.items.filter((s) => within(s.date, start, end))) {
      for (const l of s.lines) {
        labour.set(l.category, (labour.get(l.category) ?? 0) + l.count);
        manDays += l.count;
      }
    }

    const weekLogs = logs.items.filter((l) => within(l.date, start, end) && l.status !== 'REJECTED' && l.status !== 'DRAFT');
    const dprDays = new Set(dprs.items.filter((d) => within(d.date, start, end) && d.status !== 'DRAFT').map((d) => d.date.slice(0, 10)));
    const missingDprDays: string[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) if (!dprDays.has(d)) missingDprDays.push(d);
    const bills = <T extends { id: string; status: string }>(page: { items: T[] } | { notAllowed: string }, date: (b: T) => string | null, row: (b: T) => object, href: (id: string) => string) => {
      if ('notAllowed' in page) return page;
      const rows = page.items.filter((b) => within(date(b), start, end) && b.status !== 'DRAFT');
      return { count: rows.length, items: rows.slice(0, ROWS).map((b) => ({ ...row(b), status: b.status, href: href(b.id) })) };
    };

    return {
      project: { id: project.id, code: project.code, name: project.name, href: `/projects/${project.id}` },
      from: start,
      to: end,
      workDone: {
        note: 'Quantities from progress entries in the period that are approved or waiting for approval; approved is the part already approved.',
        entries: progress.items.filter((p) => within(p.date, start, end)).length,
        byActivity: [...byActivity.values()].sort((a, b) => b.entries - a.entries),
      },
      againstPlan: {
        physicalProgressPct: project.physicalProgressPct,
        behindOrLate: gantt.activities
          .filter((a) => a.state === 'BEHIND' || a.state === 'LATE')
          .slice(0, ROWS)
          .map((a) => ({ activityId: a.id, activity: a.name, state: a.state, progressPct: a.progressPct, expectedPct: a.expectedPct, plannedEnd: a.plannedEnd, finishSlipDays: a.finishSlipDays })),
        dueInPeriod: gantt.activities
          .filter((a) => within(a.plannedEnd, start, end))
          .map((a) => ({ activity: a.name, plannedEnd: a.plannedEnd, progressPct: a.progressPct, state: a.state })),
        milestonesInPeriod: gantt.milestones.filter((m) => within(m.dueDate, start, end) || within(m.achievedOn, start, end)).map((m) => ({ name: m.name, dueDate: m.dueDate, achievedOn: m.achievedOn, state: m.state })),
      },
      dailyReports: {
        filed: dprDays.size,
        daysWithoutDpr: missingDprDays,
        issues: dprs.items
          .filter((d) => within(d.date, start, end) && d.issues)
          .slice(0, ROWS)
          .map((d) => ({ date: d.date, issues: d.issues, weather: d.weather, href: `/dpr/${d.id}` })),
      },
      labour: { manDays, byTrade: [...labour.entries()].map(([trade, days]) => ({ trade, manDays: days })).sort((a, b) => b.manDays - a.manDays) },
      machines: {
        dayLogs: weekLogs.length,
        hoursWorked: round(weekLogs.reduce((s, l) => s + n(l.hoursWorked), 0), 1),
        idleHours: round(weekLogs.reduce((s, l) => s + n(l.idleHours), 0), 1),
        breakdownHours: round(weekLogs.reduce((s, l) => s + n(l.breakdownHours), 0), 1),
        dieselLitres: round(weekLogs.reduce((s, l) => s + n(l.dieselLitres), 0), 1),
        breakdowns: weekLogs.filter((l) => n(l.breakdownHours) > 0).slice(0, ROWS).map((l) => ({ date: l.date, machine: `${l.equipmentCode} ${l.equipmentName}`, hours: l.breakdownHours, note: l.breakdownNote, href: `/machinery/${l.id}` })),
      },
      materialsReceived:
        'notAllowed' in receipts
          ? receipts
          : {
              count: receipts.items.filter((r) => within(r.date, start, end)).length,
              receipts: receipts.items
                .filter((r) => within(r.date, start, end))
                .slice(0, ROWS)
                .map((r) => ({ entryNo: r.entryNo, date: r.date, supplier: r.supplier, poNo: r.poNo, qcStatus: r.qcStatus, lines: r.lines.map((l) => ({ item: l.itemName, quantity: l.quantity, unit: l.unit, rejectedQty: l.rejectedQty })), href: '/stock' })),
            },
      vendorBills: bills(vendorBills, (b) => b.invoiceDate, (b) => ({ billNo: b.billNo, vendor: b.vendorName, invoiceNo: b.invoiceNo, invoiceDate: b.invoiceDate, total: b.total, exceptions: b.exceptions }), (id) => `/vendor-bills/${id}`),
      subcontractBills: bills(subBills, (b) => b.billDate, (b) => ({ billNo: b.billNo, vendor: b.vendorName, woNo: b.woNo, billDate: b.billDate, grossAmount: b.grossAmount, netPayable: b.netPayable }), (id) => `/subcontract-bills/${id}`),
      newRisks: risks.items
        .filter((r) => within(r.createdAt, start, end))
        .slice(0, ROWS)
        .map((r) => ({ riskNo: r.riskNo, kind: r.kind, category: r.category, title: r.title, score: r.score, daysLost: r.daysLost, activity: r.activityName, status: r.status, href: `/risks?id=${r.id}` })),
      needsDecision: {
        note: 'Entries on this project waiting for this user to approve, oldest first.',
        approvalsWaiting: pending
          .filter((p) => p.projectId === projectId)
          .slice(0, ROWS)
          .map((p) => ({ type: p.type, title: p.title, submittedBy: p.submittedByName, submittedAt: p.submittedAt, amount: p.amount, href: submissionHref(p.type, p.id) })),
        overdueRiskActions: risks.items
          .filter((r) => r.overdue)
          .slice(0, ROWS)
          .map((r) => ({ riskNo: r.riskNo, title: r.title, owner: r.ownerName, dueDate: r.dueDate, href: `/risks?id=${r.id}` })),
      },
    };
  }

  /** Why activities are late: the plan, recent progress, delay entries, DPR issues, materials waiting and breakdowns. */
  async activities(user: RequestUser, projectId: string, activityId?: string) {
    const today = todayIn();
    const since = addDays(today, -30);
    const gantt = await this.schedule.gantt(user, projectId);
    const picked = activityId ? gantt.activities.filter((a) => a.id === activityId) : gantt.activities.filter((a) => a.state === 'BEHIND' || a.state === 'LATE').slice(0, 10);
    if (activityId && !picked.length) throw new NotFoundException('No such activity on this project');
    const recent = { projectId, from: since, to: today, page: 1, pageSize: READ };

    const [risks, dprs, logs, mrs, progress] = await Promise.all([
      this.risks.list(user, { projectId, page: 1, pageSize: READ } as never),
      this.dpr.list(user, recent as never),
      this.machinery.list(user, recent as never),
      this.mrs.list(user, { projectId, page: 1, pageSize: READ } as never),
      Promise.all(picked.map((a) => this.progress.list(user, { projectId, activityId: a.id, page: 1, pageSize: 10 } as never))),
    ]);

    return {
      today,
      activities: picked.map((a, i) => {
        const entries = progress[i].items.filter((p) => p.status !== 'REJECTED' && p.status !== 'DRAFT');
        const last30 = entries.filter((p) => within(p.date, since, today));
        return {
          activityId: a.id,
          activity: a.name,
          unit: a.unit,
          state: a.state,
          progressPct: a.progressPct,
          expectedPct: a.expectedPct,
          plannedStart: a.plannedStart,
          plannedEnd: a.plannedEnd,
          baselineEnd: a.baselineEnd,
          actualStart: a.actualStart,
          finishSlipDays: a.finishSlipDays,
          responsible: a.responsibleName,
          lastProgressOn: entries[0]?.date ?? null,
          progressEntriesLast30Days: last30.length,
          quantityLast30Days: round(last30.reduce((s, p) => s + n(p.quantity), 0)),
          delayEntries: risks.items
            .filter((r) => r.activityId === a.id)
            .map((r) => ({ riskNo: r.riskNo, kind: r.kind, category: r.category, title: r.title, description: r.description, status: r.status, daysLost: r.daysLost, responsibleParty: r.responsibleParty, href: `/risks?id=${r.id}` })),
          breakdowns: logs.items
            .filter((l) => l.activityId === a.id && n(l.breakdownHours) > 0)
            .map((l) => ({ date: l.date, machine: `${l.equipmentCode} ${l.equipmentName}`, hours: l.breakdownHours, note: l.breakdownNote, href: `/machinery/${l.id}` })),
        };
      }),
      projectWide: {
        note: 'Not tied to one activity: read them for anything that explains the delay.',
        dprIssuesLast30Days: dprs.items
          .filter((d) => d.issues && d.status !== 'DRAFT')
          .slice(0, ROWS)
          .map((d) => ({ date: d.date, issues: d.issues, href: `/dpr/${d.id}` })),
        openDelaysAndRisks: risks.items
          .filter((r) => !r.activityId && (r.status === 'OPEN' || r.status === 'MONITORING'))
          .slice(0, ROWS)
          .map((r) => ({ riskNo: r.riskNo, kind: r.kind, title: r.title, daysLost: r.daysLost, href: `/risks?id=${r.id}` })),
        materialRequestsWaiting: mrs.items
          .filter((m) => m.status === 'SUBMITTED' || (m.status === 'APPROVED' && m.requiredDate < today))
          .slice(0, ROWS)
          .map((m) => ({ requestNo: m.requestNo, status: m.status, requiredDate: m.requiredDate, priority: m.priority, items: m.items, href: `/material-requests/${m.id}` })),
      },
    };
  }

  /** An RA bill against the one before it on the same project: item by item, and the totals. The latest bill when billId is left out. */
  async raBillChanges(user: RequestUser, projectId: string, billId?: string) {
    const list = await this.raBills.list(user, { projectId, page: 1, pageSize: READ } as never);
    const ordered = [...list.items].sort((a, b) => a.billNo - b.billNo);
    const current = billId ? ordered.find((b) => b.id === billId) : ordered[ordered.length - 1];
    if (!current) throw new NotFoundException(billId ? 'No such RA bill on this project' : 'This project has no RA bills yet');
    const before = ordered.filter((b) => b.billNo < current.billNo).pop();
    const [bill, prev] = await Promise.all([this.raBills.get(user, current.id), before ? this.raBills.get(user, before.id) : null]);
    const prevItems = new Map((prev?.items ?? []).map((i) => [i.boqItemId, i]));
    const items = bill.items
      .map((i) => {
        const p = prevItems.get(i.boqItemId);
        const thisQty = n(i.certifiedQty ?? i.thisQty);
        const lastQty = p ? n(p.certifiedQty ?? p.thisQty) : 0;
        return {
          itemNo: i.itemNo,
          description: i.description,
          unit: i.unit,
          rate: i.rate,
          qtyThisBill: thisQty,
          qtyLastBill: lastQty,
          amountThisBill: i.amount,
          amountLastBill: p?.amount ?? '0.00',
          uptoQty: i.uptoQty,
          boqQty: i.boqQty,
          excessQty: i.excessQty,
          extraItem: i.extraItem,
          newThisBill: lastQty === 0 && thisQty > 0,
        };
      })
      .filter((i) => i.qtyThisBill !== 0 || i.qtyLastBill !== 0)
      .sort((a, b) => Math.abs(n(b.amountThisBill) - n(b.amountLastBill)) - Math.abs(n(a.amountThisBill) - n(a.amountLastBill)));
    const thisIds = new Set(bill.items.map((i) => i.boqItemId));
    const head = (b: typeof bill) => ({
      bill: b.billLabel,
      billDate: b.billDate,
      measuredUpTo: b.measuredUpTo,
      status: b.status,
      stage: b.stage,
      grossAmount: b.grossAmount,
      priceVariation: b.pvAmount,
      gstAmount: b.gstAmount,
      totalDeductions: b.totalDeductions,
      deductions: b.deductions,
      netPayable: b.netPayable,
      measurementCount: b.measurementCount,
      remarks: b.remarks,
      href: `/bills/${b.id}`,
    });
    return {
      project: { id: projectId, code: bill.projectCode, href: `/projects/${projectId}` },
      thisBill: head(bill),
      lastBill: prev ? head(prev) : null,
      note: prev ? 'Items sorted by how much their amount changed from the last bill.' : 'This is the first bill on the project, so there is nothing before it to compare with.',
      items: items.slice(0, 40),
      itemsOnlyInLastBill: (prev?.items ?? [])
        .filter((i) => !thisIds.has(i.boqItemId) && n(i.certifiedQty ?? i.thisQty) > 0)
        .map((i) => ({ itemNo: i.itemNo, description: i.description, qtyLastBill: n(i.certifiedQty ?? i.thisQty), amountLastBill: i.amount })),
    };
  }
}
