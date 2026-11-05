import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  LEAVE_STATUS_LABELS,
  LEAVE_TYPE_LABELS,
  leaveYearLabel,
  leaveYearOf,
  leaveYearRange,
  OPENING_LEAVE_TYPES,
  SETTLEMENT_STATUS_LABELS,
  attendancePct,
  countsAsPresent,
  figure,
  headcountMoves,
  serviceYears,
  statutoryDueOn,
  type Figure,
  type LeaveType,
  type ManagementReportKey,
  type ReportRowDto,
  type ReportSectionDto,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { dateOnly, formatDay, parseDate } from '../common/serialize';
import { StaffService } from '../staff/staff.service';
import { PayrollService } from '../staff/payroll.service';
import { N, col, r1, r2, section } from '../management/report-kit';
import { monthName } from '../management/management-rules';

export interface HrReportPeriod {
  from: string | null;
  to: string;
}

export interface HrReportBody {
  figures: Figure[];
  sections: ReportSectionDto[];
  notes: string[];
}

const HEAD_OFFICE = 'Head office';
const staffHref = (id: string) => `/staff?tab=staff&employee=${id}`;
const person = (e: { employeeCode: string; fullName: string }) => `${e.employeeCode} · ${e.fullName}`;
/** Runs whose figures stand: approved for payment or paid. */
const SETTLED_RUNS = { in: ['APPROVED', 'PAID'] } as Prisma.EnumPayrollRunStatusFilter;
const monthsIn = (from: string, to: string) => {
  const out: string[] = [];
  for (let m = from.slice(0, 7); m <= to.slice(0, 7); ) {
    out.push(m);
    const [y, mm] = m.split('-').map(Number);
    m = mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, '0')}`;
  }
  return out;
};
const monthWords = (m: string) => monthName(m);

/**
 * The HR and payroll reports (ARCHITECTURE "Management dashboard and reports", HR and payroll reports): head count and
 * attrition, staff attendance, the leave register, PF and ESI, full and final settlements and staff cost by site. They read
 * the staff the caller sees (`staffWhere`), the month's days through `PayrollService.staffMonth`, balances through
 * `StaffService.balancesFor`, and pay only from approved and paid salary runs; the arithmetic is `@erp/shared/hr-reports.ts`.
 */
@Injectable()
export class HrReportsService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private staff: StaffService,
    private month: PayrollService,
  ) {}

  build(key: ManagementReportKey, user: RequestUser, period: HrReportPeriod, projectId?: string): Promise<HrReportBody> {
    switch (key) {
      case 'headcount':
        return this.headcount(user, period, projectId);
      case 'staff-attendance':
        return this.attendance(user, period, projectId);
      case 'leave-register':
        return this.leaveRegister(user, period, projectId);
      case 'pf-esi':
        return this.pfEsi(user, period, projectId);
      case 'settlements':
        return this.settlements(user, period, projectId);
      case 'staff-cost':
        return this.staffCost(user, period, projectId);
      default:
        throw new Error(`${key} is not an HR report`);
    }
  }

  private staffWhere(user: RequestUser, projectId?: string): Prisma.EmployeeWhereInput {
    return { ...this.access.staffWhere(user), ...(projectId ? { projectId } : {}) };
  }

  private async projectName(projectId?: string) {
    if (!projectId) return null;
    return (await this.prisma.project.findFirst({ where: { id: projectId }, select: { name: true } }))?.name ?? null;
  }

  // Head count and attrition

  private async headcount(user: RequestUser, period: HrReportPeriod, projectId?: string): Promise<HrReportBody> {
    const from = period.from!;
    const to = period.to;
    const rows = await this.prisma.employee.findMany({
      where: { ...this.staffWhere(user, projectId), OR: [{ joinedOn: null }, { joinedOn: { lte: parseDate(to) } }] },
      select: { id: true, employeeCode: true, fullName: true, designation: true, department: true, joinedOn: true, leftOn: true, exitReason: true, project: { select: { name: true } } },
      orderBy: { employeeCode: 'asc' },
    });
    const staff = rows.map((e) => ({ ...e, joinedOn: e.joinedOn ? dateOnly(e.joinedOn) : null, leftOn: e.leftOn ? dateOnly(e.leftOn) : null, place: e.project?.name ?? HEAD_OFFICE, dept: e.department?.trim() || 'No department' }));
    const all = headcountMoves(staff, from, to);
    const moveCols = [col('atStart', 'At the start', 'count'), col('joined', 'Joined', 'count'), col('left', 'Left', 'count'), col('atEnd', 'At the end', 'count'), col('attrition', 'Attrition', 'pct')];
    const groupRows = (keyOf: (e: (typeof staff)[number]) => string, label: string) =>
      [...new Set(staff.map(keyOf))]
        .sort((a, b) => (a === HEAD_OFFICE ? -1 : b === HEAD_OFFICE ? 1 : a.localeCompare(b)))
        .map((k) => {
          const m = headcountMoves(
            staff.filter((e) => keyOf(e) === k),
            from,
            to,
          );
          return { [label]: k, atStart: m.atStart, joined: m.joined, left: m.left, atEnd: m.atEnd, attrition: m.attritionPct };
        })
        .filter((r) => r.atStart || r.joined || r.left || r.atEnd);
    const joiners = staff.filter((e) => e.joinedOn && e.joinedOn >= from && e.joinedOn <= to);
    const leavers = staff.filter((e) => e.leftOn && e.leftOn >= from && e.leftOn <= to);
    return {
      figures: [figure('staffOnRoll', all.atEnd), figure('staffJoined', all.joined), figure('staffLeft', all.left), figure('attrition', all.attritionPct ?? { none: 'Nobody on the roll' })],
      sections: [
        section({ key: 'places', title: 'By site', note: 'Where each person is posted now; head office is the staff posted at no site.', columns: [col('place', 'Posted at', 'text'), ...moveCols], rows: groupRows((e) => e.place, 'place'), totals: true, empty: 'Nobody on the roll in the period.' }),
        section({ key: 'departments', title: 'By department', columns: [col('department', 'Department', 'text'), ...moveCols], rows: groupRows((e) => e.dept, 'department'), totals: true, empty: 'Nobody on the roll in the period.' }),
        section({
          key: 'joined',
          title: 'Joined',
          columns: [col('person', 'Person', 'text'), col('designation', 'Designation', 'text'), col('place', 'Posted at', 'text'), col('joinedOn', 'Joined', 'date')],
          rows: joiners.map((e) => ({ _href: staffHref(e.id), person: person(e), designation: e.designation, place: e.place, joinedOn: e.joinedOn })),
          empty: 'Nobody joined in the period.',
        }),
        section({
          key: 'left',
          title: 'Left',
          columns: [col('person', 'Person', 'text'), col('designation', 'Designation', 'text'), col('place', 'Posted at', 'text'), col('leftOn', 'Last day', 'date'), col('years', 'Years of service', 'qty'), col('reason', 'Why', 'text')],
          rows: leavers.map((e) => ({ _href: staffHref(e.id), person: person(e), designation: e.designation, place: e.place, leftOn: e.leftOn, years: serviceYears(e.joinedOn, e.leftOn!), reason: e.exitReason })),
          empty: 'Nobody left in the period.',
        }),
      ],
      notes: [
        'On the roll means joined by the day and not past the last day. The start is everyone on the roll as the period begins, so the start, plus who joined, less who left, is the end.',
        'Attrition is the people who left as a share of the average of the start and the end.',
      ],
    };
  }

  // Staff attendance

  private async attendance(user: RequestUser, period: HrReportPeriod, projectId?: string): Promise<HrReportBody> {
    const month = period.to.slice(0, 7);
    const { rows } = await this.month.staffMonth(user, month, projectId);
    const ids = rows.map((r) => r.employeeId);
    const checkIns = await this.prisma.staffAttendance.groupBy({
      by: ['employeeId'],
      where: { employeeId: { in: ids }, date: { gte: parseDate(`${month}-01`), lte: parseDate(period.to) }, checkIn: { not: null } },
      _count: { _all: true },
    });
    const checkInsOf = new Map(checkIns.map((c) => [c.employeeId, c._count._all]));
    const leaveOff = (l: Record<LeaveType, number>) => (Object.entries(l) as [LeaveType, number][]).filter(([t]) => !countsAsPresent(t)).reduce((s, [, d]) => s + d, 0);
    const onDuty = (l: Record<LeaveType, number>) => (Object.entries(l) as [LeaveType, number][]).filter(([t]) => countsAsPresent(t)).reduce((s, [, d]) => s + d, 0);
    const out = rows.map((r) => {
      const onLeave = leaveOff(r.leave);
      return {
        _href: staffHref(r.employeeId),
        person: person(r),
        place: r.projectName ?? HEAD_OFFICE,
        workingDays: r.workingDays,
        present: r1(r.present - onDuty(r.leave)),
        onDuty: r1(onDuty(r.leave)),
        leave: r1(onLeave),
        absent: r1(r.absent),
        notMarked: r1(r.notMarked),
        offWorked: r1(r.offDaysWorked),
        overtime: r1(r.overtimeHours),
        checkIns: checkInsOf.get(r.employeeId) ?? 0,
        pct: attendancePct({ present: r.present, onLeave, absent: r.absent, notMarked: r.notMarked }),
      };
    });
    const sum = (k: 'present' | 'onDuty' | 'leave' | 'absent' | 'notMarked') => out.reduce((s, r) => s + r[k], 0);
    const pct = attendancePct({ present: sum('present') + sum('onDuty'), onLeave: sum('leave'), absent: sum('absent'), notMarked: sum('notMarked') });
    return {
      figures: [figure('staffAttendance', pct ?? { none: 'No working day yet' }), figure('staffAbsent', r1(sum('absent'))), figure('staffDaysNotMarked', r1(sum('notMarked'))), figure('staffOnRoll', out.length)],
      sections: [
        section({
          key: 'people',
          title: 'Person by person',
          columns: [
            col('person', 'Person', 'text'),
            col('place', 'Posted at', 'text'),
            col('workingDays', 'Working days', 'count'),
            col('present', 'Present', 'qty'),
            col('onDuty', 'On duty or tour', 'qty'),
            col('leave', 'On leave', 'qty'),
            col('absent', 'Absent', 'qty'),
            col('notMarked', 'Not marked', 'qty'),
            col('offWorked', 'Off days worked', 'qty'),
            col('overtime', 'Overtime hours', 'qty'),
            col('checkIns', 'Checked in', 'count'),
            col('pct', 'Attendance', 'pct'),
          ],
          rows: out,
          totals: true,
          empty: 'Nobody on the roll in the month.',
        }),
      ],
      notes: [
        'Working days leave out the site’s weekly off and holidays. Present counts a half day as half; on duty and tour are work away from the site.',
        'Attendance is present, on duty and tour against the working days so far. Not marked days are not deducted from pay.',
        'Checked in is the days with a check-in from the phone or a biometric punch. Overtime is approved overtime only.',
      ],
    };
  }

  // Leave register

  private async leaveRegister(user: RequestUser, period: HrReportPeriod, projectId?: string): Promise<HrReportBody> {
    const from = period.from!;
    const to = period.to;
    // The leave year the period ends in, by the company's leave year (January or April start).
    const start = await this.staff.leaveYearStart(user.organizationId);
    const year = leaveYearOf(to, start);
    const yearFrom = leaveYearRange(year, start).from;
    const yearName = leaveYearLabel(year, start);
    const people = await this.prisma.employee.findMany({
      where: { ...this.staffWhere(user, projectId), OR: [{ leftOn: null }, { leftOn: { gte: parseDate(yearFrom) } }], AND: [{ OR: [{ joinedOn: null }, { joinedOn: { lte: parseDate(to) } }] }] },
      select: { id: true, employeeCode: true, fullName: true, projectId: true, project: { select: { name: true } } },
      orderBy: { employeeCode: 'asc' },
    });
    const balances = await Promise.all(people.map((p) => this.staff.balancesFor(p.id, p.projectId, year)));
    const types = OPENING_LEAVE_TYPES;
    const balanceRows = people.map((p, i) => {
      const b = balances[i];
      const cell = (t: LeaveType) => b.find((x) => x.type === t);
      const comp = cell('COMP_OFF');
      return {
        _href: staffHref(p.id),
        person: person(p),
        place: p.project?.name ?? HEAD_OFFICE,
        ...Object.fromEntries(types.flatMap((t) => [[`${t}_taken`, cell(t)?.taken ?? 0], [`${t}_left`, cell(t)?.left ?? null]])),
        COMP_OFF_left: comp?.left ?? null,
        pending: r1(b.reduce((s, x) => s + x.pending, 0)),
      } as ReportRowDto;
    });
    const requests = await this.prisma.leaveRequest.findMany({
      where: { employee: this.staffWhere(user, projectId), status: { in: ['APPROVED', 'PENDING'] }, fromDate: { lte: parseDate(to) }, toDate: { gte: parseDate(from) } },
      select: { id: true, type: true, fromDate: true, toDate: true, days: true, status: true, halfDay: true, employee: { select: { id: true, employeeCode: true, fullName: true } } },
      orderBy: [{ fromDate: 'asc' }],
    });
    const taken = requests.filter((r) => r.status === 'APPROVED').reduce((s, r) => s + N(r.days), 0);
    const waiting = requests.filter((r) => r.status === 'PENDING').reduce((s, r) => s + N(r.days), 0);
    const today = to;
    const onLeaveToday = new Set(requests.filter((r) => r.status === 'APPROVED' && dateOnly(r.fromDate) <= today && dateOnly(r.toDate) >= today).map((r) => r.employee.id)).size;
    const short = (t: LeaveType) => LEAVE_TYPE_LABELS[t].replace(/ leave$/, '');
    return {
      figures: [figure('leaveTaken', r1(taken)), figure('leaveWaiting', r1(waiting)), figure('staffOnLeave', onLeaveToday, { when: 'today' })],
      sections: [
        section({
          key: 'balances',
          title: `Balances for ${yearName}`,
          note: 'Taken includes days taken before Nirmaan; left is what remains after taken and waiting.',
          columns: [
            col('person', 'Person', 'text'),
            col('place', 'Posted at', 'text'),
            ...types.flatMap((t) => [col(`${t}_taken`, `${short(t)} taken`, 'qty'), col(`${t}_left`, `${short(t)} left`, 'qty')]),
            col('COMP_OFF_left', 'Comp-off left', 'qty'),
            col('pending', 'Waiting', 'qty'),
          ],
          rows: balanceRows,
          totals: true,
          empty: 'Nobody on the roll this year.',
        }),
        section({
          key: 'requests',
          title: 'Leave in the period',
          columns: [col('person', 'Person', 'text'), col('type', 'Leave', 'text'), col('fromDate', 'From', 'date'), col('toDate', 'To', 'date'), col('days', 'Days', 'qty'), col('status', 'Status', 'text')],
          rows: requests.map((r) => ({
            _href: `/staff?tab=leave&leave=${r.id}`,
            person: person(r.employee),
            type: LEAVE_TYPE_LABELS[r.type] + (r.halfDay ? ', half day' : ''),
            fromDate: dateOnly(r.fromDate),
            toDate: dateOnly(r.toDate),
            days: N(r.days),
            status: LEAVE_STATUS_LABELS[r.status],
          })),
          totals: true,
          empty: 'No leave in the period.',
        }),
      ],
      notes: [
        `Balances are for the leave year ${yearName} (${start === 1 ? 'January to December' : 'April to March'}), by the company's leave rules in Payroll settings and each person's opening leave.`,
        'Leave is counted in working days: the site’s weekly off and holidays inside a request are not leave.',
      ],
    };
  }

  // PF and ESI

  private async pfEsi(user: RequestUser, period: HrReportPeriod, projectId?: string): Promise<HrReportBody> {
    const month = period.to.slice(0, 7);
    const place = await this.projectName(projectId);
    const slips = await this.prisma.payslip.findMany({
      where: { organizationId: user.organizationId, run: { month, status: SETTLED_RUNS }, employee: this.access.staffWhere(user), ...(projectId ? { projectName: place } : {}) },
      select: { employeeId: true, employeeCode: true, employeeName: true, uan: true, esiNumber: true, pfWages: true, esiWages: true, gross: true, lines: { select: { code: true, amount: true } } },
      orderBy: { employeeCode: 'asc' },
    });
    const amt = (s: (typeof slips)[number], code: string) => N(s.lines.find((l) => l.code === code)?.amount);
    const pfRows = slips
      .filter((s) => amt(s, 'PF') || amt(s, 'PF_EMPLOYER') || amt(s, 'EPS_EMPLOYER'))
      .map((s) => {
        const ee = amt(s, 'PF');
        const epf = amt(s, 'PF_EMPLOYER');
        const eps = amt(s, 'EPS_EMPLOYER');
        return { _href: staffHref(s.employeeId), person: person({ employeeCode: s.employeeCode, fullName: s.employeeName }), uan: s.uan ?? 'No UAN', wages: N(s.pfWages), employee: ee, epf, eps, total: r2(ee + epf + eps) };
      });
    const esiRows = slips
      .filter((s) => N(s.esiWages) > 0)
      .map((s) => {
        const ee = amt(s, 'ESI');
        const er = amt(s, 'ESI_EMPLOYER');
        return { _href: staffHref(s.employeeId), person: person({ employeeCode: s.employeeCode, fullName: s.employeeName }), ip: s.esiNumber ?? 'No IP number', wages: N(s.esiWages), employee: ee, employer: er, total: r2(ee + er) };
      });
    const pf = r2(pfRows.reduce((s, r) => s + r.total, 0));
    const esi = r2(esiRows.reduce((s, r) => s + r.total, 0));
    const due = statutoryDueOn(month);
    return {
      figures: [figure('pfToDeposit', pf), figure('esiToDeposit', esi)],
      sections: [
        section({
          key: 'pf',
          title: 'Provident fund',
          note: `To deposit by ${formatDay(due)} through the ECR from the salary run.`,
          columns: [col('person', 'Person', 'text'), col('uan', 'UAN', 'text'), col('wages', 'PF wages'), col('employee', 'Employee PF'), col('epf', 'Company EPF'), col('eps', 'Pension (EPS)'), col('total', 'Total')],
          rows: pfRows,
          totals: true,
          empty: 'No PF on an approved or paid salary run this month.',
        }),
        section({
          key: 'esi',
          title: 'ESI',
          note: `To deposit by ${formatDay(due)}.`,
          columns: [col('person', 'Person', 'text'), col('ip', 'IP number', 'text'), col('wages', 'ESI wages'), col('employee', 'Employee ESI'), col('employer', 'Company ESI'), col('total', 'Total')],
          rows: esiRows,
          totals: true,
          empty: 'Nobody on ESI on an approved or paid salary run this month.',
        }),
      ],
      notes: ['From the month’s salary runs once approved or paid; a run in draft or sent for approval is left out.', 'The company’s PF is split between EPF and the pension (EPS) on wages up to the ceiling in Payroll settings.'],
    };
  }

  // Full and final settlements

  private async settlements(user: RequestUser, period: HrReportPeriod, projectId?: string): Promise<HrReportBody> {
    const rows = await this.prisma.finalSettlement.findMany({
      where: { organizationId: user.organizationId, employee: this.staffWhere(user, projectId), lastWorkingDay: { gte: parseDate(period.from!), lte: parseDate(period.to) } },
      include: { employee: { select: { id: true, employeeCode: true, fullName: true, designation: true } } },
      orderBy: { lastWorkingDay: 'asc' },
    });
    const out = rows.map((s) => ({
      _href: staffHref(s.employee.id),
      settlement: s.settlementNo,
      person: person(s.employee),
      leftOn: dateOnly(s.lastWorkingDay),
      salary: N(s.salary),
      encashment: N(s.leaveEncashment),
      gratuity: N(s.gratuity),
      other: N(s.otherEarnings),
      recovered: r2(N(s.noticeRecovery) + N(s.loanRecovery) + N(s.otherDeductions)),
      net: N(s.net),
      status: SETTLEMENT_STATUS_LABELS[s.status],
      paidOn: s.paidOn ? dateOnly(s.paidOn) : null,
    }));
    const paid = r2(rows.filter((s) => s.status === 'PAID').reduce((t, s) => t + N(s.net), 0));
    const toPay = r2(rows.filter((s) => s.status !== 'PAID').reduce((t, s) => t + N(s.net), 0));
    // Who left in the period with no settlement worked out yet.
    const left = await this.prisma.employee.findMany({
      where: { ...this.staffWhere(user, projectId), leftOn: { gte: parseDate(period.from!), lte: parseDate(period.to) }, settlement: null },
      select: { id: true, employeeCode: true, fullName: true, designation: true, leftOn: true },
      orderBy: { leftOn: 'asc' },
    });
    return {
      figures: [figure('settlementsPaid', paid), figure('settlementsToPay', toPay, { count: rows.filter((s) => s.status !== 'PAID').length })],
      sections: [
        section({
          key: 'settlements',
          title: 'Settlements',
          columns: [
            col('settlement', 'Settlement', 'text'),
            col('person', 'Person', 'text'),
            col('leftOn', 'Last day', 'date'),
            col('salary', 'Salary'),
            col('encashment', 'Leave encashed'),
            col('gratuity', 'Gratuity'),
            col('other', 'Other earnings'),
            col('recovered', 'Recovered'),
            col('net', 'Net'),
            col('status', 'Status', 'text'),
            col('paidOn', 'Paid on', 'date'),
          ],
          rows: out,
          totals: true,
          empty: 'No settlement for anyone who left in the period.',
        }),
        section({
          key: 'missing',
          title: 'Left with no settlement yet',
          columns: [col('person', 'Person', 'text'), col('designation', 'Designation', 'text'), col('leftOn', 'Last day', 'date')],
          rows: left.map((e) => ({ _href: staffHref(e.id), person: person(e), designation: e.designation, leftOn: e.leftOn ? dateOnly(e.leftOn) : null })),
          empty: 'Everyone who left has a settlement.',
        }),
      ],
      notes: ['Recovered is the notice short, loans and advances still owed, and other deductions.', 'Gratuity is paid after five years of service, at 15 days’ basic for each year.'],
    };
  }

  // Staff cost by site

  private async staffCost(user: RequestUser, period: HrReportPeriod, projectId?: string): Promise<HrReportBody> {
    const months = monthsIn(period.from!, period.to);
    const place = await this.projectName(projectId);
    const slips = await this.prisma.payslip.findMany({
      where: { organizationId: user.organizationId, run: { month: { in: months }, status: SETTLED_RUNS }, employee: this.access.staffWhere(user), ...(projectId ? { projectName: place } : {}) },
      select: { employeeId: true, projectName: true, gross: true, employerCost: true, run: { select: { month: true } } },
    });
    // A payslip's employer cost is the company's PF, pension and ESI on top of its gross.
    type Acc = { people: Set<string>; gross: number; cost: number };
    const add = (m: Map<string, Acc>, k: string, s: (typeof slips)[number]) => {
      const a = m.get(k) ?? { people: new Set<string>(), gross: 0, cost: 0 };
      a.people.add(s.employeeId);
      a.gross += N(s.gross);
      a.cost += N(s.gross) + N(s.employerCost);
      m.set(k, a);
    };
    const byPlace = new Map<string, Acc>();
    const byMonth = new Map<string, Acc>();
    for (const s of slips) {
      add(byPlace, s.projectName ?? HEAD_OFFICE, s);
      add(byMonth, s.run.month, s);
    }
    const gross = r2(slips.reduce((t, s) => t + N(s.gross), 0));
    const cost = r2(slips.reduce((t, s) => t + N(s.gross) + N(s.employerCost), 0));
    const row = (a: Acc) => ({ people: a.people.size, gross: r2(a.gross), statutory: r2(a.cost - a.gross), cost: r2(a.cost), share: cost ? r1((a.cost / cost) * 100) : null });
    const cols = [col('people', 'People', 'count'), col('gross', 'Gross pay'), col('statutory', 'Company PF and ESI'), col('cost', 'Staff cost'), col('share', 'Share', 'pct')];
    return {
      figures: [figure('staffCost', cost), figure('grossPay', gross)],
      sections: [
        section({
          key: 'places',
          title: 'By site',
          note: 'The site each person was posted at when the run was prepared; head office is the staff posted at no site.',
          columns: [col('place', 'Posted at', 'text'), ...cols],
          rows: [...byPlace.entries()].sort((a, b) => b[1].cost - a[1].cost).map(([k, a]) => ({ place: k, ...row(a) })),
          totals: true,
          empty: 'No approved or paid salary run in the period.',
        }),
        section({
          key: 'months',
          title: 'By month',
          columns: [col('month', 'Month', 'text'), ...cols],
          rows: months.filter((m) => byMonth.has(m)).map((m) => ({ month: monthWords(m), ...row(byMonth.get(m)!) })),
          totals: true,
          empty: 'No approved or paid salary run in the period.',
        }),
      ],
      notes: ['From the salary runs once approved or paid. Staff cost is gross pay plus the company’s PF, pension and ESI.'],
    };
  }
}
