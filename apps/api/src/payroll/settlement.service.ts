import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { canApprovePayroll, canPayPayroll, canRunPayroll, type FinalSettlementDto } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { AuditService } from '../common/audit.service';
import { dateOnly, iso, money, parseDate } from '../common/serialize';
import { StaffService } from '../staff/staff.service';
import { computeSettlement, structureGross } from './payroll-rules';
import { SalaryService, toRulesStructure } from './salary.service';
import type { PayRunDto, PrepareSettlementDto } from './payroll.dto';

const include = {
  employee: { select: { fullName: true, employeeCode: true, designation: true, joinedOn: true } },
  preparedBy: { select: { fullName: true } },
  approvedBy: { select: { fullName: true } },
} satisfies Prisma.FinalSettlementInclude;
type Row = Prisma.FinalSettlementGetPayload<{ include: typeof include }>;

/**
 * Full and final settlement of someone whose exit is recorded: salary for the last month's days no run
 * paid, earned leave encashed, gratuity after five years, less notice not served and loans still owed. HR prepares it,
 * management approves it, accounts pays it.
 */
@Injectable()
export class SettlementService {
  constructor(private prisma: PrismaService, private audit: AuditService, private salary: SalaryService, private staff: StaffService) {}

  private toDto(s: Row, user: RequestUser): FinalSettlementDto {
    return {
      id: s.id,
      settlementNo: s.settlementNo,
      employeeId: s.employeeId,
      employeeCode: s.employee.employeeCode,
      employeeName: s.employee.fullName,
      designation: s.employee.designation,
      joinedOn: dateOnly(s.employee.joinedOn),
      lastWorkingDay: dateOnly(s.lastWorkingDay)!,
      status: s.status,
      salaryDays: String(Number(s.salaryDays)),
      salary: money(s.salary)!,
      leaveDays: String(Number(s.leaveDays)),
      leaveEncashment: money(s.leaveEncashment)!,
      serviceYears: String(Number(s.serviceYears)),
      gratuity: money(s.gratuity)!,
      noticeShortDays: s.noticeShortDays,
      noticeRecovery: money(s.noticeRecovery)!,
      loanRecovery: money(s.loanRecovery)!,
      otherEarnings: money(s.otherEarnings)!,
      otherDeductions: money(s.otherDeductions)!,
      net: money(s.net)!,
      note: s.note,
      preparedByName: s.preparedBy.fullName,
      approvedByName: s.approvedBy?.fullName ?? null,
      approvedAt: iso(s.approvedAt),
      paidOn: dateOnly(s.paidOn),
      paymentRef: s.paymentRef,
      createdAt: iso(s.createdAt)!,
      can: {
        edit: s.status === 'DRAFT' && canRunPayroll(user.roleKey),
        approve: s.status === 'DRAFT' && canApprovePayroll(user.roleKey),
        pay: s.status === 'APPROVED' && canPayPayroll(user.roleKey),
      },
    };
  }

  async list(user: RequestUser): Promise<FinalSettlementDto[]> {
    this.salary.assertView(user);
    const rows = await this.prisma.finalSettlement.findMany({ where: { organizationId: user.organizationId }, include, orderBy: { lastWorkingDay: 'desc' } });
    return rows.map((s) => this.toDto(s, user));
  }

  /** People who have left with no settlement yet, for HR to prepare. */
  async due(user: RequestUser) {
    this.salary.assertView(user);
    const rows = await this.prisma.employee.findMany({
      where: { organizationId: user.organizationId, isActive: false, leftOn: { not: null }, settlement: null },
      select: { id: true, fullName: true, employeeCode: true, designation: true, leftOn: true },
      orderBy: { leftOn: 'desc' },
    });
    return rows.map((e) => ({ employeeId: e.id, fullName: e.fullName, employeeCode: e.employeeCode, designation: e.designation, leftOn: dateOnly(e.leftOn) }));
  }

  /** Work the settlement out (again, while a draft) from the exit, the last structure, leave and loans. */
  async prepare(user: RequestUser, dto: PrepareSettlementDto): Promise<FinalSettlementDto> {
    if (!canRunPayroll(user.roleKey)) throw new ForbiddenException('Only HR or an admin prepares a settlement');
    const e = await this.prisma.employee.findFirst({ where: { id: dto.employeeId, organizationId: user.organizationId }, include: { settlement: true } });
    if (!e) throw new NotFoundException('Employee not found');
    if (e.isActive || !e.leftOn) throw new BadRequestException(`${e.fullName} has not left. Record their exit on the staff record first.`);
    if (e.settlement && e.settlement.status !== 'DRAFT') throw new BadRequestException('The settlement is already approved');
    const lwd = dateOnly(e.leftOn)!;
    const month = lwd.slice(0, 7);
    const [structure] = await this.salary.structureOn([e.id], e.leftOn);
    if (!structure) throw new BadRequestException(`${e.fullName} has no salary structure. Add the one they left on first.`);
    const s = toRulesStructure(structure);
    const [y, m] = month.split('-').map(Number);
    const calendarDays = new Date(Date.UTC(y, m, 0)).getUTCDate();
    // The last month is paid here unless a run already paid it.
    const paidInRun = await this.prisma.payslip.findFirst({ where: { employeeId: e.id, run: { month } }, select: { id: true } });
    const exit = await this.prisma.employeeEvent.findFirst({ where: { employeeId: e.id, type: { in: ['RESIGNED', 'TERMINATED', 'RETIRED'] } }, orderBy: { effectiveDate: 'desc' }, select: { noticeGivenOn: true } });
    const balances = await this.staff.balancesFor(e.id, e.projectId, y);
    const loans = await this.salary.openLoans([e.id], '9999-12');
    const r = computeSettlement({
      joinedOn: dateOnly(e.joinedOn),
      lastWorkingDay: lwd,
      basicDa: s.basic + s.da,
      gross: structureGross(s),
      unpaidDays: paidInRun ? 0 : Number(lwd.slice(8, 10)),
      calendarDays,
      leaveDays: Math.max(0, balances.find((b) => b.type === 'EARNED')?.left ?? 0),
      noticeDays: e.noticeDays,
      noticeGivenOn: dateOnly(exit?.noticeGivenOn),
      loanBalance: loans.reduce((t, l) => t + l.balance, 0),
      otherEarnings: dto.otherEarnings,
      otherDeductions: dto.otherDeductions,
    });
    const data = { lastWorkingDay: e.leftOn, ...r, note: dto.note ?? null, preparedById: user.id };
    const row = e.settlement
      ? await this.prisma.finalSettlement.update({ where: { id: e.settlement.id }, data, include })
      : await this.prisma.finalSettlement.create({ data: { organizationId: user.organizationId, employeeId: e.id, settlementNo: `FNF-${e.employeeCode}`, ...data }, include });
    await this.audit.log(user, 'EMPLOYEE', e.id, 'UPDATED', `Full and final settlement worked out: net ₹${r.net}`);
    return this.toDto(row, user);
  }

  private async rowFor(user: RequestUser, id: string) {
    const s = await this.prisma.finalSettlement.findFirst({ where: { id, organizationId: user.organizationId }, include });
    if (!s) throw new NotFoundException('Settlement not found');
    return s;
  }

  async approve(user: RequestUser, id: string) {
    const s = await this.rowFor(user, id);
    if (!canApprovePayroll(user.roleKey)) throw new ForbiddenException('Only management or an admin approves a settlement');
    if (s.status !== 'DRAFT') throw new BadRequestException('This settlement is already approved');
    const row = await this.prisma.finalSettlement.update({ where: { id }, data: { status: 'APPROVED', approvedById: user.id, approvedAt: new Date() }, include });
    await this.audit.log(user, 'EMPLOYEE', s.employeeId, 'APPROVED', `Full and final settlement ${s.settlementNo}`);
    return this.toDto(row, user);
  }

  async pay(user: RequestUser, id: string, dto: PayRunDto) {
    const s = await this.rowFor(user, id);
    if (!canPayPayroll(user.roleKey)) throw new ForbiddenException('Only accounts or an admin marks a settlement paid');
    if (s.status !== 'APPROVED') throw new BadRequestException('Only an approved settlement can be paid');
    const row = await this.prisma.finalSettlement.update({ where: { id }, data: { status: 'PAID', paidOn: parseDate(dto.paidOn), paymentRef: dto.paymentRef ?? null }, include });
    await this.audit.log(user, 'EMPLOYEE', s.employeeId, 'PAID', `Full and final settlement ${s.settlementNo} on ${dto.paidOn}`);
    return this.toDto(row, user);
  }

  async remove(user: RequestUser, id: string) {
    const s = await this.rowFor(user, id);
    if (!canRunPayroll(user.roleKey) || s.status !== 'DRAFT') throw new BadRequestException('Only a draft settlement can be deleted');
    await this.prisma.finalSettlement.delete({ where: { id } });
    await this.audit.log(user, 'EMPLOYEE', s.employeeId, 'UPDATED', `Full and final settlement ${s.settlementNo} deleted`);
    return { ok: true };
  }
}
