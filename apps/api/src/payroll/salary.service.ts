import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type PayrollSettings, type SalaryStructure } from '@prisma/client';
import { canRunPayroll, canViewPayroll, type PayrollSettingsDto, type SalaryStructureDto, type StaffLoanDto } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { AuditService } from '../common/audit.service';
import { dateOnly, iso, money, parseDate } from '../common/serialize';
import { DEFAULT_SETTINGS, monthlyTds, structureCost, type RulesSettings, type RulesStructure } from './payroll-rules';
import type { CreateSalaryStructureDto, CreateStaffLoanDto, LoanQuery, PayrollSettingsDto as SettingsBody, StructureQuery } from './payroll.dto';

const n = (v: Prisma.Decimal | number | null | undefined) => Number(v ?? 0);
/** The last day of a YYYY-MM month. */
export const monthEnd = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0));
};

export const toRulesSettings = (s: PayrollSettings | null): RulesSettings =>
  s
    ? {
        pfEmployeePct: n(s.pfEmployeePct),
        pfEmployerPct: n(s.pfEmployerPct),
        epsPct: n(s.epsPct),
        pfWageCeiling: n(s.pfWageCeiling),
        pfCapAtCeiling: s.pfCapAtCeiling,
        esiEmployeePct: n(s.esiEmployeePct),
        esiEmployerPct: n(s.esiEmployerPct),
        esiGrossCeiling: n(s.esiGrossCeiling),
        ptState: s.ptState,
        paidDaysBasis: s.paidDaysBasis,
        overtimeMultiplier: n(s.overtimeMultiplier),
      }
    : DEFAULT_SETTINGS;

export const toRulesStructure = (s: SalaryStructure): RulesStructure => ({
  basic: n(s.basic),
  da: n(s.da),
  hra: n(s.hra),
  conveyance: n(s.conveyance),
  special: n(s.special),
  otherEarnings: n(s.otherEarnings),
  pf: s.pf,
  esi: s.esi,
  pt: s.pt,
  taxRegime: s.taxRegime,
  declaredDeductions: n(s.declaredDeductions),
  otherIncome: n(s.otherIncome),
});

const structureInclude = { employee: { select: { fullName: true, employeeCode: true, gender: true } }, createdBy: { select: { fullName: true } } } satisfies Prisma.SalaryStructureInclude;
type StructureRow = Prisma.SalaryStructureGetPayload<{ include: typeof structureInclude }>;
const loanInclude = { employee: { select: { fullName: true, employeeCode: true, settlement: { select: { status: true } } } }, createdBy: { select: { fullName: true } }, lines: { select: { amount: true, payslip: { select: { run: { select: { status: true } } } } } } } satisfies Prisma.StaffLoanInclude;
type LoanRow = Prisma.StaffLoanGetPayload<{ include: typeof loanInclude }>;

/**
 * Payroll's masters (v6 item 100): the company's settings, each employee's salary structure from a date, and loans and
 * advances recovered from salary. HR keeps them; management, accounts and admins read them.
 */
@Injectable()
export class SalaryService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  assertView(user: RequestUser) {
    if (!canViewPayroll(user.roleKey)) throw new ForbiddenException('Only HR, accounts, management or an admin can see salaries');
  }
  assertRun(user: RequestUser) {
    if (!canRunPayroll(user.roleKey)) throw new ForbiddenException('Only HR or an admin can change salaries and loans');
  }

  /* ---------- settings ---------- */

  async settingsRow(orgId: string) {
    return this.prisma.payrollSettings.findUnique({ where: { organizationId: orgId } });
  }

  async rules(orgId: string): Promise<RulesSettings> {
    return toRulesSettings(await this.settingsRow(orgId));
  }

  async settings(user: RequestUser): Promise<PayrollSettingsDto> {
    this.assertView(user);
    const s = await this.settingsRow(user.organizationId);
    const r = toRulesSettings(s);
    return {
      pfEmployeePct: String(r.pfEmployeePct),
      pfEmployerPct: String(r.pfEmployerPct),
      epsPct: String(r.epsPct),
      pfWageCeiling: money(r.pfWageCeiling),
      pfCapAtCeiling: r.pfCapAtCeiling,
      esiEmployeePct: String(r.esiEmployeePct),
      esiEmployerPct: String(r.esiEmployerPct),
      esiGrossCeiling: money(r.esiGrossCeiling),
      ptState: r.ptState,
      paidDaysBasis: r.paidDaysBasis,
      overtimeMultiplier: String(r.overtimeMultiplier),
      debitAccountNo: s?.debitAccountNo ?? null,
      debitBankName: s?.debitBankName ?? null,
    };
  }

  async saveSettings(user: RequestUser, dto: SettingsBody): Promise<PayrollSettingsDto> {
    this.assertRun(user);
    const data = Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined));
    await this.prisma.payrollSettings.upsert({ where: { organizationId: user.organizationId }, create: { organizationId: user.organizationId, ...data }, update: data });
    await this.audit.log(user, 'PAYROLL_SETTINGS', user.organizationId, 'UPDATED', Object.keys(data).join(', '));
    return this.settings(user);
  }

  /* ---------- salary structures ---------- */

  private toStructureDto(s: StructureRow, st: RulesSettings): SalaryStructureDto {
    const r = toRulesStructure(s);
    const c = structureCost(r, st);
    return {
      id: s.id,
      employeeId: s.employeeId,
      employeeCode: s.employee.employeeCode,
      employeeName: s.employee.fullName,
      effectiveFrom: dateOnly(s.effectiveFrom),
      basic: money(s.basic),
      da: money(s.da),
      hra: money(s.hra),
      conveyance: money(s.conveyance),
      special: money(s.special),
      otherEarnings: money(s.otherEarnings),
      gross: money(c.gross),
      employeePf: money(c.employeePf),
      employerPf: money(c.employerPf),
      employeeEsi: money(c.employeeEsi),
      employerEsi: money(c.employerEsi),
      ctcAnnual: money(c.ctcAnnual),
      pf: s.pf,
      esi: s.esi,
      pt: s.pt,
      taxRegime: s.taxRegime,
      declaredDeductions: money(s.declaredDeductions),
      otherIncome: money(s.otherIncome),
      monthlyTds: money(monthlyTds(r, st, s.employee.gender)),
      note: s.note,
      createdByName: s.createdBy.fullName,
      createdAt: iso(s.createdAt),
    };
  }

  /** With an employee: their structures, newest first. Without: each employee's structure in force today. */
  async structures(user: RequestUser, q: StructureQuery): Promise<SalaryStructureDto[]> {
    this.assertView(user);
    const st = await this.rules(user.organizationId);
    if (q.employeeId) {
      const rows = await this.prisma.salaryStructure.findMany({ where: { organizationId: user.organizationId, employeeId: q.employeeId }, include: structureInclude, orderBy: { effectiveFrom: 'desc' } });
      return rows.map((s) => this.toStructureDto(s, st));
    }
    const rows = await this.prisma.salaryStructure.findMany({
      where: { organizationId: user.organizationId, effectiveFrom: { lte: new Date() }, employee: { isActive: true } },
      include: structureInclude,
      orderBy: [{ employeeId: 'asc' }, { effectiveFrom: 'desc' }],
      distinct: ['employeeId'],
    });
    return rows.map((s) => this.toStructureDto(s, st)).sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));
  }

  /** The structure in force on a day (the latest from on or before it). */
  structureOn(employeeIds: string[], day: Date) {
    return this.prisma.salaryStructure.findMany({ where: { employeeId: { in: employeeIds }, effectiveFrom: { lte: day } }, orderBy: [{ employeeId: 'asc' }, { effectiveFrom: 'desc' }], distinct: ['employeeId'] });
  }

  async createStructure(user: RequestUser, dto: CreateSalaryStructureDto): Promise<SalaryStructureDto> {
    this.assertRun(user);
    const e = await this.prisma.employee.findFirst({ where: { id: dto.employeeId, organizationId: user.organizationId }, select: { id: true, fullName: true } });
    if (!e) throw new NotFoundException('Employee not found');
    const from = parseDate(dto.effectiveFrom);
    // A run already approved or paid for that month or later keeps what it paid.
    const locked = await this.prisma.payslip.findFirst({ where: { employeeId: e.id, run: { status: { in: ['APPROVED', 'PAID'] }, month: { gte: dto.effectiveFrom.slice(0, 7) } } }, select: { run: { select: { month: true } } } });
    if (locked) throw new BadRequestException(`${e.fullName}'s salary for ${locked.run.month} is already approved. Start the new structure from a later month.`);
    const data = {
      basic: dto.basic,
      da: dto.da ?? 0,
      hra: dto.hra ?? 0,
      conveyance: dto.conveyance ?? 0,
      special: dto.special ?? 0,
      otherEarnings: dto.otherEarnings ?? 0,
      pf: dto.pf ?? true,
      esi: dto.esi ?? true,
      pt: dto.pt ?? true,
      taxRegime: dto.taxRegime ?? 'NEW',
      declaredDeductions: dto.declaredDeductions ?? 0,
      otherIncome: dto.otherIncome ?? 0,
      note: dto.note ?? null,
    };
    const st = await this.rules(user.organizationId);
    const ctc = structureCost({ ...data, taxRegime: data.taxRegime }, st).ctcAnnual;
    const saved = await this.prisma.$transaction(async (tx) => {
      const row = await tx.salaryStructure.upsert({
        where: { employeeId_effectiveFrom: { employeeId: e.id, effectiveFrom: from } },
        create: { organizationId: user.organizationId, employeeId: e.id, effectiveFrom: from, createdById: user.id, ...data },
        update: { ...data, createdById: user.id },
        include: structureInclude,
      });
      // The staff record's CTC follows the structure in force today.
      if (from <= new Date()) {
        const latest = await tx.salaryStructure.findFirst({ where: { employeeId: e.id, effectiveFrom: { lte: new Date() } }, orderBy: { effectiveFrom: 'desc' }, select: { id: true } });
        if (latest?.id === row.id) await tx.employee.update({ where: { id: e.id }, data: { ctcAnnual: ctc } });
      }
      return row;
    });
    await this.audit.log(user, 'EMPLOYEE', e.id, 'UPDATED', `Salary structure from ${dto.effectiveFrom}: gross ₹${(saved.basic.toNumber() + data.da + data.hra + data.conveyance + data.special + data.otherEarnings).toFixed(0)} a month`);
    return this.toStructureDto(saved, st);
  }

  async removeStructure(user: RequestUser, id: string) {
    this.assertRun(user);
    const s = await this.prisma.salaryStructure.findFirst({ where: { id, organizationId: user.organizationId }, include: { _count: { select: { payslips: true } } } });
    if (!s) throw new NotFoundException('Salary structure not found');
    if (s._count.payslips) throw new BadRequestException('Salary has been worked out on this structure. Add a new one from a later date instead.');
    await this.prisma.salaryStructure.delete({ where: { id } });
    await this.audit.log(user, 'EMPLOYEE', s.employeeId, 'UPDATED', `Salary structure from ${dateOnly(s.effectiveFrom)} removed`);
    return { ok: true };
  }

  /* ---------- loans and advances ---------- */

  /** Recovered so far: in runs past draft, or all of it once their settlement is approved. */
  private recovered(l: LoanRow) {
    if (l.employee.settlement && l.employee.settlement.status !== 'DRAFT') return n(l.amount);
    return l.lines.filter((x) => x.payslip.run.status !== 'DRAFT').reduce((t, x) => t + n(x.amount), 0);
  }

  private toLoanDto(l: LoanRow): StaffLoanDto {
    const recovered = this.recovered(l);
    return {
      id: l.id,
      employeeId: l.employeeId,
      employeeCode: l.employee.employeeCode,
      employeeName: l.employee.fullName,
      kind: l.kind,
      issuedOn: dateOnly(l.issuedOn),
      amount: money(l.amount),
      emi: money(l.emi),
      startMonth: l.startMonth,
      recovered: money(recovered),
      balance: money(Math.max(0, n(l.amount) - recovered)),
      note: l.note,
      createdByName: l.createdBy.fullName,
      createdAt: iso(l.createdAt),
    };
  }

  async loans(user: RequestUser, q: LoanQuery): Promise<StaffLoanDto[]> {
    this.assertView(user);
    const rows = await this.prisma.staffLoan.findMany({ where: { organizationId: user.organizationId, ...(q.employeeId ? { employeeId: q.employeeId } : {}) }, include: loanInclude, orderBy: [{ issuedOn: 'desc' }] });
    const out = rows.map((l) => this.toLoanDto(l));
    return q.open ? out.filter((l) => Number(l.balance) > 0) : out;
  }

  /** Open loans of these employees whose recovery has started by the month, with what is left, oldest first. */
  async openLoans(employeeIds: string[], month: string) {
    const rows = await this.prisma.staffLoan.findMany({ where: { employeeId: { in: employeeIds }, startMonth: { lte: month } }, include: loanInclude, orderBy: { issuedOn: 'asc' } });
    return rows.map((l) => ({ id: l.id, employeeId: l.employeeId, kind: l.kind, emi: n(l.emi), balance: Math.max(0, n(l.amount) - this.recovered(l)) })).filter((l) => l.balance > 0);
  }

  async createLoan(user: RequestUser, dto: CreateStaffLoanDto): Promise<StaffLoanDto> {
    this.assertRun(user);
    const e = await this.prisma.employee.findFirst({ where: { id: dto.employeeId, organizationId: user.organizationId }, select: { id: true, isActive: true, fullName: true } });
    if (!e) throw new NotFoundException('Employee not found');
    if (!e.isActive) throw new BadRequestException(`${e.fullName} has left. Recover what they owe in their full and final settlement.`);
    if (dto.emi > dto.amount) throw new BadRequestException('The monthly recovery cannot be more than the amount');
    if (dto.startMonth < dto.issuedOn.slice(0, 7)) throw new BadRequestException('Start recovering in the month it is given or later');
    const row = await this.prisma.staffLoan.create({
      data: { organizationId: user.organizationId, employeeId: e.id, kind: dto.kind, issuedOn: parseDate(dto.issuedOn), amount: dto.amount, emi: dto.emi, startMonth: dto.startMonth, note: dto.note ?? null, createdById: user.id },
      include: loanInclude,
    });
    await this.audit.log(user, 'EMPLOYEE', e.id, 'UPDATED', `${dto.kind === 'LOAN' ? 'Loan' : 'Advance'} of ₹${dto.amount} from ${dto.startMonth}`);
    return this.toLoanDto(row);
  }

  async removeLoan(user: RequestUser, id: string) {
    this.assertRun(user);
    const l = await this.prisma.staffLoan.findFirst({ where: { id, organizationId: user.organizationId }, include: loanInclude });
    if (!l) throw new NotFoundException('Loan not found');
    if (l.lines.length) throw new BadRequestException('Some of it has been recovered in a salary run, so it stays on record');
    await this.prisma.staffLoan.delete({ where: { id } });
    await this.audit.log(user, 'EMPLOYEE', l.employeeId, 'UPDATED', `${l.kind === 'LOAN' ? 'Loan' : 'Advance'} of ₹${n(l.amount)} removed`);
    return { ok: true };
  }
}
