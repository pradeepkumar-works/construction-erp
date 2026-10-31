import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  MANUAL_PAYSLIP_CODES,
  PAYSLIP_CODES,
  canApprovePayroll,
  canPayPayroll,
  canRunPayroll,
  canViewPayroll,
  type ManualPayslipCode,
  type PayrollRunDetailDto,
  type PayrollRunDto,
  type PayslipCode,
  type PayslipDto,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { AuditService } from '../common/audit.service';
import { dec, iso, money, dateOnly, parseDate } from '../common/serialize';
import { PayrollService } from '../staff/payroll.service';
import { computePayslip } from './payroll-rules';
import { SalaryService, monthEnd, toRulesStructure } from './salary.service';
import type { CreateRunDto, PayRunDto, PayslipAdjustmentsDto, RunQuery } from './payroll.dto';

const runInclude = {
  project: { select: { name: true, code: true } },
  preparedBy: { select: { fullName: true } },
  approvedBy: { select: { fullName: true } },
  paidBy: { select: { fullName: true } },
  _count: { select: { payslips: true } },
} satisfies Prisma.PayrollRunInclude;
type RunRow = Prisma.PayrollRunGetPayload<{ include: typeof runInclude }>;
const slipInclude = { lines: { orderBy: { sortOrder: 'asc' } }, run: { select: { runNo: true, month: true, status: true } } } satisfies Prisma.PayslipInclude;
type SlipRow = Prisma.PayslipGetPayload<{ include: typeof slipInclude }>;

const ORDER = Object.keys(PAYSLIP_CODES) as PayslipCode[];
const isManual = (c: string): c is ManualPayslipCode => (MANUAL_PAYSLIP_CODES as readonly string[]).includes(c);

/**
 * Salary runs: HR prepares a month's run for the company or one site from approved attendance and each
 * person's salary structure, adds arrears or deductions by hand, and submits it; management approves or sends it back;
 * accounts pays it with the bank file and the run is locked. Every step is in the audit log. Staff see their own payslips
 * once the run is approved.
 */
@Injectable()
export class PayrollRunService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private salary: SalaryService,
    private inputs: PayrollService,
  ) {}

  private toRunDto(r: RunRow, user: RequestUser): PayrollRunDto {
    return {
      id: r.id,
      runNo: r.runNo,
      month: r.month,
      projectId: r.projectId,
      projectName: r.project?.name ?? null,
      status: r.status,
      employees: r._count.payslips,
      gross: money(r.gross)!,
      deductions: money(r.deductions)!,
      net: money(r.net)!,
      employerCost: money(r.employerCost)!,
      preparedByName: r.preparedBy.fullName,
      submittedAt: iso(r.submittedAt),
      approvedByName: r.approvedBy?.fullName ?? null,
      approvedAt: iso(r.approvedAt),
      reviewNote: r.reviewNote,
      paidOn: dateOnly(r.paidOn),
      paymentRef: r.paymentRef,
      paidByName: r.paidBy?.fullName ?? null,
      createdAt: iso(r.createdAt)!,
      can: {
        edit: r.status === 'DRAFT' && canRunPayroll(user.roleKey),
        submit: r.status === 'DRAFT' && canRunPayroll(user.roleKey) && r._count.payslips > 0,
        approve: r.status === 'SUBMITTED' && canApprovePayroll(user.roleKey),
        pay: r.status === 'APPROVED' && canPayPayroll(user.roleKey),
        remove: r.status === 'DRAFT' && canRunPayroll(user.roleKey),
      },
    };
  }

  toSlipDto(s: SlipRow): PayslipDto {
    return {
      id: s.id,
      runId: s.runId,
      runNo: s.run.runNo,
      month: s.run.month,
      status: s.run.status,
      employeeId: s.employeeId,
      employeeCode: s.employeeCode,
      employeeName: s.employeeName,
      designation: s.designation,
      projectName: s.projectName,
      pan: s.pan,
      uan: s.uan,
      esiNumber: s.esiNumber,
      bankName: s.bankName,
      bankAccountNo: s.bankAccountNo,
      bankIfsc: s.bankIfsc,
      monthDays: dec(s.monthDays)!,
      paidDays: dec(s.paidDays)!,
      lopDays: dec(s.lopDays)!,
      overtimeHours: dec(s.overtimeHours)!,
      gross: money(s.gross)!,
      deductions: money(s.deductions)!,
      net: money(s.net)!,
      employerCost: money(s.employerCost)!,
      pfWages: money(s.pfWages)!,
      esiWages: money(s.esiWages)!,
      lines: s.lines.map((l) => ({ id: l.id, kind: l.kind, code: l.code, label: l.label, amount: money(l.amount)!, manual: l.manual })),
    };
  }

  private async runFor(user: RequestUser, id: string) {
    const r = await this.prisma.payrollRun.findFirst({ where: { id, organizationId: user.organizationId }, include: runInclude });
    if (!r) throw new NotFoundException('Salary run not found');
    return r;
  }

  async list(user: RequestUser, q: RunQuery): Promise<PayrollRunDto[]> {
    this.salary.assertView(user);
    const rows = await this.prisma.payrollRun.findMany({ where: { organizationId: user.organizationId, ...(q.month ? { month: q.month } : {}) }, include: runInclude, orderBy: [{ month: 'desc' }, { runNo: 'asc' }], take: 60 });
    return rows.map((r) => this.toRunDto(r, user));
  }

  async detail(user: RequestUser, id: string): Promise<PayrollRunDetailDto> {
    this.salary.assertView(user);
    const r = await this.runFor(user, id);
    const slips = await this.prisma.payslip.findMany({ where: { runId: id }, include: slipInclude, orderBy: { employeeCode: 'asc' } });
    // Who is on the rolls for the run but has no salary structure.
    let skipped: PayrollRunDetailDto['skipped'] = [];
    if (r.status === 'DRAFT') {
      const rows = (await this.inputs.staffMonth(user, r.month, r.projectId ?? undefined)).rows;
      const inRun = new Set(slips.map((s) => s.employeeId));
      skipped = rows.filter((x) => !inRun.has(x.employeeId)).map((x) => ({ employeeId: x.employeeId, employeeCode: x.employeeCode, fullName: x.fullName, reason: 'No salary structure for the month' }));
    }
    return { ...this.toRunDto(r, user), payslips: slips.map((s) => this.toSlipDto(s)), skipped };
  }

  /** Prepare a month's run: the company's, or one site's when the company runs payroll site by site. */
  async create(user: RequestUser, dto: CreateRunDto): Promise<PayrollRunDetailDto> {
    if (!canRunPayroll(user.roleKey)) throw new ForbiddenException('Only HR or an admin prepares the salary run');
    const projectId = dto.projectId ?? null;
    const existing = await this.prisma.payrollRun.findMany({ where: { organizationId: user.organizationId, month: dto.month }, select: { projectId: true, runNo: true } });
    if (existing.some((x) => x.projectId === null)) throw new BadRequestException(`${dto.month} already has the company's salary run (${existing.find((x) => !x.projectId)!.runNo}). Open it instead.`);
    if (!projectId && existing.length) throw new BadRequestException(`${dto.month} already has site runs (${existing.map((x) => x.runNo).join(', ')}). Prepare the remaining sites one by one.`);
    if (projectId && existing.some((x) => x.projectId === projectId)) throw new BadRequestException(`That site already has a run for ${dto.month}. Open it instead.`);
    const project = projectId ? await this.prisma.project.findFirst({ where: { id: projectId, organizationId: user.organizationId }, select: { code: true } }) : null;
    if (projectId && !project) throw new BadRequestException('Project not found');
    const runNo = `SAL-${dto.month}${project ? `-${project.code}` : ''}`;
    const run = await this.prisma.payrollRun.create({ data: { organizationId: user.organizationId, runNo, month: dto.month, projectId, preparedById: user.id } });
    await this.compute(user, run.id);
    await this.audit.log(user, 'PAYROLL_RUN', run.id, 'CREATED', runNo);
    return this.detail(user, run.id);
  }

  /** Work the run out again from attendance, structures and loans; lines added by hand are kept. */
  async recompute(user: RequestUser, id: string): Promise<PayrollRunDetailDto> {
    const r = await this.runFor(user, id);
    if (!canRunPayroll(user.roleKey)) throw new ForbiddenException('Only HR or an admin prepares the salary run');
    if (r.status !== 'DRAFT') throw new BadRequestException('Only a draft run can be worked out again. Ask for it to be sent back first.');
    await this.compute(user, id);
    await this.audit.log(user, 'PAYROLL_RUN', id, 'UPDATED', 'Worked out again');
    return this.detail(user, id);
  }

  private async compute(user: RequestUser, runId: string, onlyEmployeeId?: string) {
    const run = await this.prisma.payrollRun.findUniqueOrThrow({ where: { id: runId } });
    const rows = (await this.inputs.staffMonth(user, run.month, run.projectId ?? undefined)).rows.filter((x) => !onlyEmployeeId || x.employeeId === onlyEmployeeId);
    const ids = rows.map((x) => x.employeeId);
    const [settings, structures, loans, employees, old] = await Promise.all([
      this.salary.rules(user.organizationId),
      this.salary.structureOn(ids, monthEnd(run.month)),
      this.salary.openLoans(ids, run.month),
      this.prisma.employee.findMany({ where: { id: { in: ids } }, select: { id: true, gender: true, pan: true, uan: true, esiNumber: true, bankName: true, bankAccountNo: true, bankIfsc: true } }),
      this.prisma.payslip.findMany({ where: { runId, ...(onlyEmployeeId ? { employeeId: onlyEmployeeId } : {}) }, include: { lines: { where: { manual: true } } } }),
    ]);
    const [y, m] = run.month.split('-').map(Number);
    const calendarDays = new Date(Date.UTC(y, m, 0)).getUTCDate();
    await this.prisma.$transaction(async (tx) => {
      await tx.payslip.deleteMany({ where: { runId, ...(onlyEmployeeId ? { employeeId: onlyEmployeeId } : {}) } });
      for (const row of rows) {
        const s = structures.find((x) => x.employeeId === row.employeeId);
        if (!s) continue;
        const e = employees.find((x) => x.id === row.employeeId)!;
        const manual = (old.find((o) => o.employeeId === row.employeeId)?.lines ?? []).filter((l) => isManual(l.code)).map((l) => ({ code: l.code as ManualPayslipCode, label: l.label, amount: Number(l.amount) }));
        const slip = computePayslip({
          month: run.month,
          calendarDays,
          daysOnRolls: row.calendarDays,
          lopDays: row.lopDays,
          overtimeHours: row.overtimeHours,
          structure: toRulesStructure(s),
          settings,
          gender: e.gender,
          manual,
          loans: loans.filter((l) => l.employeeId === row.employeeId),
        });
        await tx.payslip.create({
          data: {
            organizationId: user.organizationId,
            runId,
            employeeId: row.employeeId,
            structureId: s.id,
            employeeCode: row.employeeCode,
            employeeName: row.fullName,
            designation: row.designation,
            projectName: row.projectName,
            pan: e.pan,
            uan: e.uan,
            esiNumber: e.esiNumber,
            bankName: e.bankName,
            bankAccountNo: e.bankAccountNo,
            bankIfsc: e.bankIfsc,
            monthDays: slip.monthDays,
            paidDays: slip.paidDays,
            lopDays: slip.lopDays,
            overtimeHours: row.overtimeHours,
            gross: slip.gross,
            deductions: slip.deductions,
            net: slip.net,
            employerCost: slip.employerCost,
            pfWages: slip.pfWages,
            esiWages: slip.esiWages,
            lines: { create: slip.lines.map((l) => ({ organizationId: user.organizationId, kind: l.kind, code: l.code, label: l.label, amount: l.amount, manual: !!l.manual, loanId: l.loanId ?? null, sortOrder: ORDER.indexOf(l.code) })) },
          },
        });
      }
      const t = await tx.payslip.aggregate({ where: { runId }, _sum: { gross: true, deductions: true, net: true, employerCost: true } });
      await tx.payrollRun.update({ where: { id: runId }, data: { gross: t._sum.gross ?? 0, deductions: t._sum.deductions ?? 0, net: t._sum.net ?? 0, employerCost: Prisma.Decimal.add(t._sum.gross ?? 0, t._sum.employerCost ?? 0) } });
    });
  }

  /** Replace the lines HR added by hand to one payslip (arrears, bonus, other earnings and deductions) and work it out again. */
  async adjust(user: RequestUser, payslipId: string, dto: PayslipAdjustmentsDto): Promise<PayslipDto> {
    if (!canRunPayroll(user.roleKey)) throw new ForbiddenException('Only HR or an admin changes payslips');
    const s = await this.prisma.payslip.findFirst({ where: { id: payslipId, organizationId: user.organizationId }, include: { run: true } });
    if (!s) throw new NotFoundException('Payslip not found');
    if (s.run.status !== 'DRAFT') throw new BadRequestException('The run is past draft. Ask for it to be sent back to change a payslip.');
    await this.prisma.payslipLine.deleteMany({ where: { payslipId, manual: true } });
    await this.prisma.payslipLine.createMany({
      data: dto.lines.map((l) => ({ organizationId: user.organizationId, payslipId, kind: PAYSLIP_CODES[l.code].kind, code: l.code, label: l.label?.trim() || PAYSLIP_CODES[l.code].label, amount: l.amount, manual: true })),
    });
    await this.compute(user, s.runId, s.employeeId);
    await this.audit.log(user, 'PAYROLL_RUN', s.runId, 'UPDATED', `${s.employeeName}: ${dto.lines.map((l) => `${l.label || PAYSLIP_CODES[l.code].label} ₹${l.amount}`).join(', ') || 'manual lines removed'}`);
    return this.payslip(user, (await this.prisma.payslip.findFirstOrThrow({ where: { runId: s.runId, employeeId: s.employeeId }, select: { id: true } })).id);
  }

  async submit(user: RequestUser, id: string) {
    const r = await this.runFor(user, id);
    if (!this.toRunDto(r, user).can.submit) throw new BadRequestException(r.status !== 'DRAFT' ? 'This run has already been submitted' : r._count.payslips ? 'Only HR or an admin submits the salary run' : 'No payslips in this run. Add salary structures first.');
    await this.prisma.payrollRun.update({ where: { id }, data: { status: 'SUBMITTED', submittedAt: new Date(), reviewNote: null } });
    await this.audit.log(user, 'PAYROLL_RUN', id, 'SUBMITTED', r.runNo);
    return this.detail(user, id);
  }

  async approve(user: RequestUser, id: string, note?: string) {
    const r = await this.runFor(user, id);
    if (!canApprovePayroll(user.roleKey)) throw new ForbiddenException('Only management or an admin approves the salary run');
    if (r.status !== 'SUBMITTED') throw new BadRequestException('Only a submitted run can be approved');
    await this.prisma.payrollRun.update({ where: { id }, data: { status: 'APPROVED', approvedById: user.id, approvedAt: new Date(), reviewNote: note ?? null } });
    await this.audit.log(user, 'PAYROLL_RUN', id, 'APPROVED', note ?? r.runNo);
    return this.detail(user, id);
  }

  async sendBack(user: RequestUser, id: string, note: string) {
    const r = await this.runFor(user, id);
    const may = (r.status === 'SUBMITTED' && canApprovePayroll(user.roleKey)) || (r.status === 'APPROVED' && (canApprovePayroll(user.roleKey) || canPayPayroll(user.roleKey)));
    if (!may) throw new BadRequestException(r.status === 'PAID' ? 'A paid run is locked' : 'Only management (or accounts before paying) can send the run back');
    if (r.tallyExportId) throw new BadRequestException('Its salary journal has gone to Tally. Undo that Tally export first, then send the run back.');
    await this.prisma.payrollRun.update({ where: { id }, data: { status: 'DRAFT', reviewNote: note, approvedById: null, approvedAt: null, submittedAt: null } });
    await this.audit.log(user, 'PAYROLL_RUN', id, 'CHANGES_REQUESTED', note);
    return this.detail(user, id);
  }

  async pay(user: RequestUser, id: string, dto: PayRunDto) {
    const r = await this.runFor(user, id);
    if (!canPayPayroll(user.roleKey)) throw new ForbiddenException('Only accounts or an admin marks salaries paid');
    if (r.status !== 'APPROVED') throw new BadRequestException('Only an approved run can be paid');
    await this.prisma.payrollRun.update({ where: { id }, data: { status: 'PAID', paidById: user.id, paidOn: parseDate(dto.paidOn), paymentRef: dto.paymentRef ?? null } });
    await this.audit.log(user, 'PAYROLL_RUN', id, 'PAID', `${dto.paidOn}${dto.paymentRef ? ` (${dto.paymentRef})` : ''}`);
    return this.detail(user, id);
  }

  async remove(user: RequestUser, id: string) {
    const r = await this.runFor(user, id);
    if (!this.toRunDto(r, user).can.remove) throw new BadRequestException('Only a draft run can be deleted');
    await this.prisma.payrollRun.delete({ where: { id } });
    await this.audit.log(user, 'PAYROLL_RUN', id, 'DELETED', r.runNo);
    return { ok: true };
  }

  /** One payslip: payroll roles see any; a person sees their own once the run is approved. */
  async payslip(user: RequestUser, id: string): Promise<PayslipDto> {
    const s = await this.prisma.payslip.findFirst({ where: { id, organizationId: user.organizationId }, include: { ...slipInclude, employee: { select: { userId: true } } } });
    if (!s) throw new NotFoundException('Payslip not found');
    const own = s.employee.userId === user.id && (s.run.status === 'APPROVED' || s.run.status === 'PAID');
    if (!canViewPayroll(user.roleKey) && !own) throw new NotFoundException('Payslip not found');
    return this.toSlipDto(s);
  }

  /** The caller's own payslips from approved and paid runs, newest first. */
  async mine(user: RequestUser): Promise<PayslipDto[]> {
    const rows = await this.prisma.payslip.findMany({
      where: { organizationId: user.organizationId, employee: { userId: user.id }, run: { status: { in: ['APPROVED', 'PAID'] } } },
      include: slipInclude,
      orderBy: { run: { month: 'desc' } },
      take: 24,
    });
    return rows.map((s) => this.toSlipDto(s));
  }

  /** What waits on the caller in payroll, for the People home. */
  async waiting(user: RequestUser) {
    const statuses = [...(canApprovePayroll(user.roleKey) ? (['SUBMITTED'] as const) : []), ...(canPayPayroll(user.roleKey) ? (['APPROVED'] as const) : []), ...(canRunPayroll(user.roleKey) ? (['DRAFT'] as const) : [])];
    if (!statuses.length) return [];
    return this.prisma.payrollRun.findMany({ where: { organizationId: user.organizationId, status: { in: [...statuses] } }, select: { status: true, net: true, runNo: true } });
  }

  private async filesFor(user: RequestUser, id: string) {
    this.salary.assertView(user);
    const r = await this.runFor(user, id);
    const slips = await this.prisma.payslip.findMany({ where: { runId: id }, include: slipInclude, orderBy: { employeeCode: 'asc' } });
    return { r, slips };
  }

  /** The bank's bulk transfer file: one NEFT line per employee with an account (CSV). */
  async bankFile(user: RequestUser, id: string) {
    const { r, slips } = await this.filesFor(user, id);
    if (r.status !== 'APPROVED' && r.status !== 'PAID') throw new BadRequestException('The bank file is made once the run is approved');
    const s = await this.salary.settingsRow(user.organizationId);
    const csv = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Payment type', 'Debit account', 'Beneficiary name', 'Beneficiary account', 'IFSC', 'Amount', 'Narration', 'Employee code'].join(',')];
    const missing: string[] = [];
    for (const p of slips) {
      if (Number(p.net) <= 0) continue;
      if (!p.bankAccountNo || !p.bankIfsc) {
        missing.push(`${p.employeeName} (${p.employeeCode})`);
        continue;
      }
      lines.push(['NEFT', s?.debitAccountNo ?? '', p.employeeName, p.bankAccountNo, p.bankIfsc, Number(p.net).toFixed(2), `Salary ${r.month}`, p.employeeCode].map(csv).join(','));
    }
    return { fileName: `${r.runNo}-bank.csv`, mimeType: 'text/csv', content: lines.join('\r\n') + '\r\n', missing };
  }

  /** EPFO's electronic challan cum return (ECR 2.0): one #~# separated line per member with a UAN. */
  async ecr(user: RequestUser, id: string) {
    const { r, slips } = await this.filesFor(user, id);
    const amt = (code: string, p: SlipRow) => Math.round(Number(p.lines.find((l) => l.code === code)?.amount ?? 0));
    const st = await this.salary.rules(user.organizationId);
    const missing: string[] = [];
    const rows: string[] = [];
    for (const p of slips) {
      const pf = amt('PF', p);
      if (!pf) continue;
      if (!p.uan) {
        missing.push(`${p.employeeName} (${p.employeeCode})`);
        continue;
      }
      const epfWages = Math.round(Number(p.pfWages));
      const epsWages = Math.min(epfWages, st.pfWageCeiling);
      const eps = amt('EPS_EMPLOYER', p);
      const ncp = Math.round(Number(p.lopDays));
      rows.push([p.uan, p.employeeName.toUpperCase(), Math.round(Number(p.gross)), epfWages, epsWages, epsWages, pf, eps, pf - eps, ncp, 0].join('#~#'));
    }
    return { fileName: `${r.runNo}-ECR.txt`, mimeType: 'text/plain', content: rows.join('\n') + (rows.length ? '\n' : ''), missing };
  }

  /** ESIC's monthly contribution sheet: IP number, name, days paid and wages (CSV). */
  async esi(user: RequestUser, id: string) {
    const { r, slips } = await this.filesFor(user, id);
    const lines = [['IP number', 'IP name', 'Days paid', 'Total monthly wages', 'Employee contribution', 'Employer contribution'].join(',')];
    const missing: string[] = [];
    for (const p of slips) {
      if (!Number(p.esiWages)) continue;
      if (!p.esiNumber) missing.push(`${p.employeeName} (${p.employeeCode})`);
      const ee = p.lines.find((l) => l.code === 'ESI')?.amount ?? 0;
      const er = p.lines.find((l) => l.code === 'ESI_EMPLOYER')?.amount ?? 0;
      lines.push([p.esiNumber ?? '', `"${p.employeeName}"`, Math.floor(Number(p.paidDays)), Math.round(Number(p.esiWages)), Number(ee).toFixed(0), Number(er).toFixed(0)].join(','));
    }
    return { fileName: `${r.runNo}-ESI.csv`, mimeType: 'text/csv', content: lines.join('\r\n') + '\r\n', missing };
  }
}
