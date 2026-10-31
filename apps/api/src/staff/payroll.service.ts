import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LEAVE_TYPES, canViewLabourSummary, countsAsPresent, canViewPayroll, isWeeklyOff, type ContractorMonthDto, type ContractorMonthRowDto, type LeaveType, type PayrollDto, type PayrollRowDto } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { dateOnly, money, parseDate } from '../common/serialize';
import { todayIn } from '../notifications/time';

const DAY = 86_400_000;
const key = (s: string) => s.trim().toLowerCase();

/** First and last day of a YYYY-MM month. */
function monthRange(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new BadRequestException('Month must be YYYY-MM');
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

const days = (from: string, to: string) => {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`), end = Date.parse(`${to}T00:00:00Z`); t <= end; t += DAY) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
};

/**
 * Payroll inputs (no statutory calculations): per employee per month the days on the rolls, Sundays and holidays,
 * days present, approved leave by type, absences, days not marked, overtime and loss-of-pay days; and per labour
 * contractor the man-days by trade from the attendance register, priced at the trade's daily rate.
 */
@Injectable()
export class PayrollService {
  constructor(private prisma: PrismaService, private access: ProjectAccessService) {}

  async staffMonth(user: RequestUser, month: string, projectId?: string): Promise<PayrollDto> {
    if (!canViewPayroll(user.roleKey)) throw new ForbiddenException('Only HR, accounts, management or an admin can see payroll inputs');
    const { from, to } = monthRange(month);
    const start = parseDate(from);
    const end = parseDate(to);
    const employees = await this.prisma.employee.findMany({
      where: {
        organizationId: user.organizationId,
        ...(projectId ? { projectId } : {}),
        // On the rolls for some part of the month.
        AND: [{ OR: [{ joinedOn: null }, { joinedOn: { lte: end } }] }, { OR: [{ leftOn: null }, { leftOn: { gte: start } }] }],
        OR: [{ isActive: true }, { leftOn: { not: null } }],
      },
      include: { project: { select: { name: true } } },
      orderBy: { employeeCode: 'asc' },
    });
    const ids = employees.map((e) => e.id);
    const [attendance, leave, holidays] = await Promise.all([
      this.prisma.staffAttendance.findMany({ where: { employeeId: { in: ids }, date: { gte: start, lte: end } }, select: { employeeId: true, date: true, status: true, overtimeHours: true, overtimeStatus: true, projectId: true } }),
      this.prisma.leaveRequest.findMany({ where: { employeeId: { in: ids }, status: 'APPROVED', fromDate: { lte: end }, toDate: { gte: start } }, select: { employeeId: true, type: true, fromDate: true, toDate: true, halfDay: true } }),
      this.prisma.holiday.findMany({ where: { organizationId: user.organizationId, date: { gte: start, lte: end } }, select: { date: true, projectId: true } }),
    ]);
    const today = todayIn();
    const isHoliday = (d: string, site: string | null) => holidays.some((h) => dateOnly(h.date) === d && (h.projectId === null || h.projectId === site));

    const rows = employees.map((e): PayrollRowDto => {
      const att = new Map(attendance.filter((a) => a.employeeId === e.id).map((a) => [dateOnly(a.date)!, a]));
      const onLeave = new Map<string, { type: LeaveType; half: boolean }>();
      for (const l of leave.filter((x) => x.employeeId === e.id)) for (const d of days(dateOnly(l.fromDate)!, dateOnly(l.toDate)!)) onLeave.set(d, { type: l.type, half: l.halfDay });
      const first = e.joinedOn && dateOnly(e.joinedOn)! > from ? dateOnly(e.joinedOn)! : from;
      const last = e.leftOn && dateOnly(e.leftOn)! < to ? dateOnly(e.leftOn)! : to;
      const r = { calendarDays: 0, offDays: 0, workingDays: 0, present: 0, absent: 0, notMarked: 0, offDaysWorked: 0, overtimeHours: 0, overtimePendingHours: 0, lopDays: 0 };
      const byType = Object.fromEntries(LEAVE_TYPES.map((t) => [t, 0])) as Record<LeaveType, number>;
      for (const d of days(first, last)) {
        r.calendarDays += 1;
        const a = att.get(d);
        // Only approved overtime is paid; what waits is shown apart, rejected is dropped.
        if (a?.overtimeHours && a.overtimeStatus === 'PENDING') r.overtimePendingHours += Number(a.overtimeHours);
        else if (a?.overtimeHours && a.overtimeStatus !== 'REJECTED') r.overtimeHours += Number(a.overtimeHours);
        if (isWeeklyOff(d) || isHoliday(d, a?.projectId ?? e.projectId)) {
          r.offDays += 1;
          if (a && a.status !== 'ABSENT') r.offDaysWorked += a.status === 'HALF_DAY' ? 0.5 : 1;
          continue;
        }
        r.workingDays += 1;
        const l = onLeave.get(d);
        const share = l ? (l.half ? 0.5 : 1) : 0;
        if (l) {
          byType[l.type] += share;
          if (l.type === 'UNPAID') r.lopDays += share;
          // On duty and tour are work away from the site: present and paid.
          if (countsAsPresent(l.type)) r.present += share;
          if (share === 1) continue;
        }
        // What is left of the day (all of it, or the other half of a half-day leave).
        const rest = 1 - share;
        // Days still to come this month are not missing yet.
        if (!a) r.notMarked += d <= today ? rest : 0;
        else if (a.status === 'ABSENT') {
          r.absent += rest;
          r.lopDays += rest;
        } else if (a.status === 'HALF_DAY' && !l) {
          r.present += 0.5;
          r.absent += 0.5;
          r.lopDays += 0.5;
        } else r.present += rest;
      }
      return {
        employeeId: e.id,
        employeeCode: e.employeeCode,
        fullName: e.fullName,
        designation: e.designation,
        department: e.department,
        projectId: e.projectId,
        projectName: e.project?.name ?? null,
        joinedOn: dateOnly(e.joinedOn),
        leftOn: dateOnly(e.leftOn),
        ...r,
        leave: byType,
        paidDays: r.calendarDays - r.lopDays,
      };
    });
    return { month, from, to, rows };
  }

  async contractorMonth(user: RequestUser, month: string, projectId?: string): Promise<ContractorMonthDto> {
    if (!canViewLabourSummary(user.roleKey)) throw new ForbiddenException('Your role cannot see the labour contractor summary');
    const { from, to } = monthRange(month);
    const projects: Prisma.ProjectWhereInput = { ...this.access.projectWhere(user), ...(projectId ? { id: projectId } : {}) };
    const [lines, rates, workOrders] = await Promise.all([
      this.prisma.attendanceLine.findMany({
        where: { sheet: { date: { gte: parseDate(from), lte: parseDate(to) }, project: projects } },
        select: { contractor: true, vendorId: true, category: true, count: true, sheet: { select: { date: true, projectId: true, project: { select: { code: true, name: true } } } } },
      }),
      this.prisma.labourRate.findMany({ where: { organizationId: user.organizationId } }),
      this.prisma.workOrder.findMany({ where: { organizationId: user.organizationId, status: 'APPROVED', project: projects }, select: { projectId: true, vendorId: true }, distinct: ['projectId', 'vendorId'] }),
    ]);
    const rateOf = new Map(rates.map((r) => [key(r.category), r.dailyRate]));
    const contracted = new Set(workOrders.map((w) => `${w.projectId}:${w.vendorId}`));
    const groups = new Map<string, ContractorMonthRowDto & { dates: Set<string> }>();
    for (const l of lines) {
      const k = `${key(l.contractor)}|${l.sheet.projectId}|${key(l.category)}`;
      const g =
        groups.get(k) ??
        ({
          contractor: l.contractor,
          vendorId: l.vendorId,
          projectId: l.sheet.projectId,
          projectCode: l.sheet.project.code,
          projectName: l.sheet.project.name,
          category: l.category,
          manDays: 0,
          days: 0,
          dailyRate: null,
          amount: null,
          onWorkOrder: !!l.vendorId && contracted.has(`${l.sheet.projectId}:${l.vendorId}`),
          dates: new Set<string>(),
        } as ContractorMonthRowDto & { dates: Set<string> });
      g.manDays += l.count;
      g.dates.add(dateOnly(l.sheet.date)!);
      g.vendorId = g.vendorId ?? l.vendorId;
      groups.set(k, g);
    }
    const rows = [...groups.values()]
      .map(({ dates, ...g }) => {
        const rate = rateOf.get(key(g.category));
        return { ...g, days: dates.size, dailyRate: rate ? money(rate) : null, amount: rate ? money(rate.mul(g.manDays)) : null };
      })
      .sort((a, b) => a.contractor.localeCompare(b.contractor) || a.projectCode.localeCompare(b.projectCode) || a.category.localeCompare(b.category));
    return { month, from, to, rows };
  }
}
