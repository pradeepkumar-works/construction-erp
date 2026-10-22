import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  canManageMachineLoans,
  type EquipmentLoanDetailDto,
  type EquipmentLoanDto,
  type EquipmentLoanListDto,
  type LenderOutstandingDto,
  type LoanEmiDto,
  type LoanPreviewDto,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { AuditService } from '../common/audit.service';
import { dateOnly, formatDay, iso, money, parseDate } from '../common/serialize';
import { searchWords, ilike } from '../common/paging';
import { todayIn } from '../notifications/time';
import { CreateEquipmentLoanDto, EquipmentLoanQuery, ForecloseDto, LoanPreviewQuery, PayEmiDto, UpdateEquipmentLoanDto } from './machine-loans.dto';
import { emiFor, emiStage, foreclosure, interestPerHour, loanPosition, payProblem, schedule, scheduleFrom, termsProblem, type LoanTerms, type ScheduleRow } from './loan-rules';

type Tx = Prisma.TransactionClient;
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

const loanInclude = {
  equipment: { select: { code: true, name: true, project: { select: { name: true } } } },
  createdBy: { select: { fullName: true } },
  emis: { include: { paidBy: { select: { fullName: true } } }, orderBy: { no: 'asc' } },
} satisfies Prisma.EquipmentLoanInclude;
type LoanRow = Prisma.EquipmentLoanGetPayload<{ include: typeof loanInclude }>;

const termsOf = (l: { amount: Prisma.Decimal; ratePct: Prisma.Decimal; tenureMonths: number; emi: Prisma.Decimal; firstEmiDate: Date }): LoanTerms => ({
  amount: l.amount,
  ratePct: l.ratePct,
  tenureMonths: l.tenureMonths,
  emi: l.emi,
  firstEmiDate: dateOnly(l.firstEmiDate)!,
});
const emiState = (e: LoanRow['emis'][number]) => ({ no: e.no, dueDate: dateOnly(e.dueDate)!, principal: e.principal, interest: e.interest, emi: e.emi, paidOn: dateOnly(e.paidOn) });
const rowData = (organizationId: string, loanId: string, r: ScheduleRow): Prisma.LoanEmiCreateManyInput => ({
  organizationId,
  loanId,
  no: r.no,
  dueDate: parseDate(r.dueDate),
  opening: r.opening,
  principal: r.principal,
  interest: r.interest,
  emi: r.emi,
  closing: r.closing,
});

/**
 * Machine finance (v6 item 108): loans on financed machines, their EMI schedules (`loan-rules.ts`), EMIs paid in order
 * (or the loan closed early), and what is owed by lender. The posting service books the loan and each EMI paid; the
 * interest is the machine's cost of finance. Kept and seen by admin, management and accounts.
 */
@Injectable()
export class MachineLoansService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private assertCan(user: RequestUser) {
    if (!canManageMachineLoans(user.roleKey)) throw new ForbiddenException('Machine loans are kept by admin, management and accounts');
  }

  private toDto(r: LoanRow, today: string): EquipmentLoanDto {
    const p = loanPosition(r.amount, r.emis.map(emiState), today);
    return {
      id: r.id,
      equipmentId: r.equipmentId,
      equipmentCode: r.equipment.code,
      equipmentName: r.equipment.name,
      projectName: r.equipment.project?.name ?? null,
      lenderName: r.lenderName,
      vendorId: r.vendorId,
      loanNo: r.loanNo,
      sanctionDate: dateOnly(r.sanctionDate)!,
      amount: money(r.amount)!,
      ratePct: r.ratePct.toFixed(2),
      tenureMonths: r.tenureMonths,
      emi: money(r.emi)!,
      firstEmiDate: dateOnly(r.firstEmiDate)!,
      disbursal: r.disbursal,
      status: r.status,
      closedOn: dateOnly(r.closedOn),
      note: r.note,
      emisPaid: p.emisPaid,
      emiCount: r.emis.length,
      principalRepaid: money(p.principalRepaid)!,
      interestPaid: money(p.interestPaid)!,
      outstanding: money(p.outstanding)!,
      overdueCount: p.overdueCount,
      overdueAmount: money(p.overdueAmount)!,
      nextDue: p.next ? { no: p.next.no, dueDate: p.next.dueDate, emi: money(D(p.next.emi))!, stage: p.next.stage } : null,
      createdByName: r.createdBy.fullName,
      createdAt: iso(r.createdAt)!,
    };
  }

  async list(user: RequestUser, q: EquipmentLoanQuery): Promise<EquipmentLoanListDto> {
    this.assertCan(user);
    const today = todayIn();
    const words = searchWords(q.q);
    const all = await this.prisma.equipmentLoan.findMany({
      where: {
        organizationId: user.organizationId,
        ...(q.equipmentId ? { equipmentId: q.equipmentId } : {}),
        ...(words.length ? { AND: words.map((w) => ({ OR: [{ lenderName: ilike(w) }, { loanNo: ilike(w) }, { equipment: { code: ilike(w) } }, { equipment: { name: ilike(w) } }] })) } : {}),
      },
      include: loanInclude,
      orderBy: [{ status: 'asc' }, { sanctionDate: 'desc' }],
    });
    const rows = all.map((r) => ({ r, dto: this.toDto(r, today), p: loanPosition(r.amount, r.emis.map(emiState), today) }));
    // The summary is the running loans, whatever the status filter shows.
    const running = rows.filter((x) => x.r.status === 'ACTIVE');
    const lenders = new Map<string, LenderOutstandingDto & { o: Prisma.Decimal; d: Prisma.Decimal; s: Prisma.Decimal }>();
    for (const { r, p } of running) {
      const l = lenders.get(r.lenderName) ?? { lenderName: r.lenderName, loans: 0, outstanding: '0', overdueAmount: '0', dueIn30: '0', o: D(0), d: D(0), s: D(0) };
      l.loans++;
      l.o = l.o.add(p.outstanding);
      l.d = l.d.add(p.overdueAmount);
      l.s = l.s.add(p.dueIn30);
      lenders.set(r.lenderName, l);
    }
    const sum = (f: (p: (typeof rows)[number]['p']) => Prisma.Decimal.Value, xs = running) => xs.reduce((s, x) => s.add(f(x.p)), D(0));
    return {
      items: rows.filter((x) => !q.status || x.r.status === q.status).map((x) => x.dto),
      summary: {
        loans: running.length,
        outstanding: money(sum((p) => p.outstanding))!,
        overdueCount: running.reduce((s, x) => s + x.p.overdueCount, 0),
        overdueAmount: money(sum((p) => p.overdueAmount))!,
        dueIn30: money(sum((p) => p.dueIn30))!,
        interestThisYear: money(sum((p) => p.interestThisYear, rows))!,
        lenders: [...lenders.values()]
          .sort((a, b) => b.o.cmp(a.o))
          .map(({ o, d, s, ...l }) => ({ ...l, outstanding: money(o)!, overdueAmount: money(d)!, dueIn30: money(s)! })),
      },
    };
  }

  /** A loan by its id, or by the id of one of its EMIs (a posted EMI in the books links here). */
  private async row(user: RequestUser, id: string, db: Tx | PrismaService = this.prisma): Promise<LoanRow> {
    const r = await db.equipmentLoan.findFirst({ where: { organizationId: user.organizationId, OR: [{ id }, { emis: { some: { id } } }] }, include: loanInclude });
    if (!r) throw new NotFoundException('Loan not found');
    return r;
  }

  async get(user: RequestUser, id: string): Promise<EquipmentLoanDetailDto> {
    this.assertCan(user);
    const r = await this.row(user, id);
    const today = todayIn();
    const p = loanPosition(r.amount, r.emis.map(emiState), today);
    const hours = await this.prisma.machineryLog.aggregate({ where: { organizationId: user.organizationId, equipmentId: r.equipmentId, status: 'APPROVED', date: { gte: r.sanctionDate } }, _sum: { hoursWorked: true } });
    const worked = hours._sum.hoursWorked ?? D(0);
    const emis: LoanEmiDto[] = r.emis.map((e) => ({
      id: e.id,
      no: e.no,
      dueDate: dateOnly(e.dueDate)!,
      opening: money(e.opening)!,
      principal: money(e.principal)!,
      interest: money(e.interest)!,
      emi: money(e.emi)!,
      closing: money(e.closing)!,
      stage: emiStage({ dueDate: dateOnly(e.dueDate)!, paidOn: dateOnly(e.paidOn) }, today),
      paidOn: dateOnly(e.paidOn),
      mode: e.mode,
      reference: e.reference,
      paidByName: e.paidBy?.fullName ?? null,
    }));
    return {
      ...this.toDto(r, today),
      emis,
      interestToCome: money(p.interestToCome)!,
      hoursWorked: worked.toFixed(2),
      interestPerHour: money(interestPerHour(p.interestPaid, worked)),
      canManage: true,
    };
  }

  /** The EMI and schedule terms would give, for the form to show as it is typed. */
  preview(user: RequestUser, q: LoanPreviewQuery): LoanPreviewDto {
    this.assertCan(user);
    const terms = { ...q, emi: q.emi ?? null };
    const problem = termsProblem(terms);
    const rows = problem ? [] : schedule(terms);
    return {
      emi: money(q.emi ? D(q.emi) : emiFor(q.amount, q.ratePct, q.tenureMonths))!,
      totalInterest: money(rows.reduce((s, r) => s.add(r.interest), D(0)))!,
      rows: rows.map((r) => ({ no: r.no, dueDate: r.dueDate, principal: money(r.principal)!, interest: money(r.interest)!, emi: money(r.emi)!, closing: money(r.closing)! })),
      problem,
    };
  }

  private async assertEquipment(user: RequestUser, equipmentId: string) {
    const e = await this.prisma.equipment.findFirst({ where: { id: equipmentId, organizationId: user.organizationId }, select: { ownership: true } });
    if (!e) throw new BadRequestException('Choose a machine of the company');
    if (e.ownership !== 'OWNED') throw new BadRequestException('A hired machine is not the company’s to finance. Mark it owned first.');
  }

  private async assertVendor(user: RequestUser, vendorId: string | null | undefined) {
    if (!vendorId) return;
    const v = await this.prisma.vendor.findFirst({ where: { id: vendorId, organizationId: user.organizationId }, select: { id: true } });
    if (!v) throw new BadRequestException('Choose a vendor of the company, or leave the lender as typed');
  }

  /** Nothing is booked on or before the day the books are locked up to. */
  private async assertOpen(organizationId: string, day: string, what: string) {
    const st = await this.prisma.booksState.findUnique({ where: { organizationId }, select: { lockedUpTo: true } });
    const locked = dateOnly(st?.lockedUpTo);
    if (locked && day <= locked) throw new BadRequestException(`The books are locked up to ${formatDay(locked)}, so ${what} cannot be dated then. Ask management to move the lock.`);
  }

  private unique(e: unknown, loanNo: string): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(`Loan ${loanNo} is already recorded`);
    throw e;
  }

  async create(user: RequestUser, dto: CreateEquipmentLoanDto): Promise<EquipmentLoanDetailDto> {
    this.assertCan(user);
    await this.assertEquipment(user, dto.equipmentId);
    await this.assertVendor(user, dto.vendorId);
    const problem = termsProblem({ ...dto, emi: dto.emi ?? null });
    if (problem) throw new BadRequestException(problem);
    await this.assertOpen(user.organizationId, dto.sanctionDate, 'the loan');
    const emi = dto.emi ? D(dto.emi) : emiFor(dto.amount, dto.ratePct, dto.tenureMonths);
    const rows = schedule({ ...dto, emi });
    const id = await this.prisma
      .$transaction(async (tx) => {
        const loan = await tx.equipmentLoan.create({
          data: {
            organizationId: user.organizationId,
            equipmentId: dto.equipmentId,
            lenderName: dto.lenderName,
            vendorId: dto.vendorId ?? null,
            loanNo: dto.loanNo,
            sanctionDate: parseDate(dto.sanctionDate),
            amount: D(dto.amount),
            ratePct: D(dto.ratePct),
            tenureMonths: dto.tenureMonths,
            emi,
            firstEmiDate: parseDate(dto.firstEmiDate),
            disbursal: dto.disbursal ?? 'MACHINE_COST',
            note: dto.note || null,
            createdById: user.id,
          },
        });
        await tx.loanEmi.createMany({ data: rows.map((r) => rowData(user.organizationId, loan.id, r)) });
        return loan.id;
      })
      .catch((e) => this.unique(e, dto.loanNo));
    await this.audit.log(user, 'EQUIPMENT_LOAN', id, 'CREATED', `${dto.lenderName} ${dto.loanNo}: ₹${D(dto.amount).toFixed(2)} at ${dto.ratePct}% for ${dto.tenureMonths} months, EMI ₹${emi.toFixed(2)}`);
    return this.get(user, id);
  }

  async update(user: RequestUser, id: string, dto: UpdateEquipmentLoanDto): Promise<EquipmentLoanDetailDto> {
    this.assertCan(user);
    const r = await this.row(user, id);
    const termsChange = ['amount', 'ratePct', 'tenureMonths', 'emi', 'firstEmiDate', 'sanctionDate', 'equipmentId', 'disbursal'].some((k) => dto[k as keyof UpdateEquipmentLoanDto] !== undefined);
    if (termsChange) {
      if (r.emis.some((e) => e.paidOn)) throw new BadRequestException('EMIs are paid on this loan, so its terms stay as they are. Change the lender, account number or note only.');
      if (r.tallyExportId) throw new BadRequestException('The loan has gone to Tally. Undo that export to change its terms.');
    }
    if (dto.equipmentId) await this.assertEquipment(user, dto.equipmentId);
    if (dto.vendorId !== undefined) await this.assertVendor(user, dto.vendorId);
    const sanctionDate = dto.sanctionDate ?? dateOnly(r.sanctionDate)!;
    const terms: LoanTerms = {
      amount: dto.amount ?? r.amount,
      ratePct: dto.ratePct ?? r.ratePct,
      tenureMonths: dto.tenureMonths ?? r.tenureMonths,
      // A change to the amount, rate or tenure works the EMI out again unless one is given.
      emi: dto.emi !== undefined ? dto.emi : dto.amount !== undefined || dto.ratePct !== undefined || dto.tenureMonths !== undefined ? null : r.emi,
      firstEmiDate: dto.firstEmiDate ?? dateOnly(r.firstEmiDate)!,
    };
    if (termsChange) {
      const problem = termsProblem({ ...terms, sanctionDate });
      if (problem) throw new BadRequestException(problem);
      await this.assertOpen(user.organizationId, sanctionDate, 'the loan');
    }
    const emi = terms.emi ? D(terms.emi) : emiFor(terms.amount, terms.ratePct, terms.tenureMonths);
    await this.prisma
      .$transaction(async (tx) => {
        await tx.equipmentLoan.update({
          where: { id: r.id },
          data: {
            ...(dto.lenderName !== undefined ? { lenderName: dto.lenderName } : {}),
            ...(dto.vendorId !== undefined ? { vendorId: dto.vendorId } : {}),
            ...(dto.loanNo !== undefined ? { loanNo: dto.loanNo } : {}),
            ...(dto.note !== undefined ? { note: dto.note || null } : {}),
            ...(termsChange
              ? {
                  equipmentId: dto.equipmentId ?? r.equipmentId,
                  disbursal: dto.disbursal ?? r.disbursal,
                  sanctionDate: parseDate(sanctionDate),
                  amount: D(terms.amount),
                  ratePct: D(terms.ratePct),
                  tenureMonths: terms.tenureMonths,
                  emi,
                  firstEmiDate: parseDate(terms.firstEmiDate),
                }
              : {}),
          },
        });
        if (termsChange) {
          await tx.loanEmi.deleteMany({ where: { loanId: r.id } });
          await tx.loanEmi.createMany({ data: schedule({ ...terms, emi }).map((x) => rowData(user.organizationId, r.id, x)) });
        }
      })
      .catch((e) => this.unique(e, dto.loanNo ?? r.loanNo));
    await this.audit.log(user, 'EQUIPMENT_LOAN', r.id, 'UPDATED', termsChange ? `Terms: ₹${D(terms.amount).toFixed(2)} at ${D(terms.ratePct).toFixed(2)}% for ${terms.tenureMonths} months, EMI ₹${emi.toFixed(2)}` : null);
    return this.get(user, r.id);
  }

  async remove(user: RequestUser, id: string) {
    this.assertCan(user);
    const r = await this.row(user, id);
    if (r.emis.some((e) => e.paidOn)) throw new BadRequestException('EMIs are paid on this loan, so it stays on record');
    if (r.tallyExportId) throw new BadRequestException('The loan has gone to Tally. Undo that export first.');
    await this.prisma.equipmentLoan.delete({ where: { id: r.id } });
    await this.audit.log(user, 'EQUIPMENT_LOAN', r.id, 'DELETED', `${r.lenderName} ${r.loanNo}`);
    return { ok: true };
  }

  /** Record an EMI paid (the next one unpaid unless `no` says which); the last one paid closes the loan. */
  async pay(user: RequestUser, id: string, dto: PayEmiDto): Promise<EquipmentLoanDetailDto> {
    this.assertCan(user);
    const today = todayIn();
    await this.assertOpen(user.organizationId, dto.paidOn, 'an EMI');
    const loanId = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`LOAN:${id}`}))`;
      const r = await this.row(user, id, tx);
      if (r.status === 'CLOSED') throw new BadRequestException('This loan is repaid');
      const states = r.emis.map(emiState);
      const no = dto.no ?? states.find((e) => !e.paidOn)?.no;
      if (!no) throw new BadRequestException('Every EMI of this loan is paid');
      const problem = payProblem(states, no, dto.paidOn, dateOnly(r.sanctionDate)!, today);
      if (problem) throw new BadRequestException(problem);
      await tx.loanEmi.update({ where: { loanId_no: { loanId: r.id, no } }, data: { paidOn: parseDate(dto.paidOn), mode: dto.mode ?? 'BANK', reference: dto.reference || null, paidById: user.id } });
      if (!states.some((e) => !e.paidOn && e.no !== no)) await tx.equipmentLoan.update({ where: { id: r.id }, data: { status: 'CLOSED', closedOn: parseDate(dto.paidOn) } });
      return r.id;
    });
    await this.audit.log(user, 'EQUIPMENT_LOAN', loanId, 'EMI_PAID', `EMI ${dto.no ?? 'next'} paid on ${dto.paidOn}${dto.reference ? `, ${dto.reference}` : ''}`);
    return this.get(user, loanId);
  }

  /** Repay all that is owed with the next EMI: it carries the whole balance (and the lender's interest), the rest go. */
  async foreclose(user: RequestUser, id: string, dto: ForecloseDto): Promise<EquipmentLoanDetailDto> {
    this.assertCan(user);
    const today = todayIn();
    await this.assertOpen(user.organizationId, dto.paidOn, 'the closing payment');
    const loanId = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`LOAN:${id}`}))`;
      const r = await this.row(user, id, tx);
      if (r.status === 'CLOSED') throw new BadRequestException('This loan is repaid');
      const next = r.emis.find((e) => !e.paidOn)!;
      const problem = payProblem(r.emis.map(emiState), next.no, dto.paidOn, dateOnly(r.sanctionDate)!, today);
      if (problem) throw new BadRequestException(problem);
      const f = foreclosure(next, dto.interest);
      await tx.loanEmi.deleteMany({ where: { loanId: r.id, no: { gt: next.no } } });
      await tx.loanEmi.update({
        where: { id: next.id },
        data: { principal: f.principal, interest: f.interest, emi: f.emi, closing: f.closing, paidOn: parseDate(dto.paidOn), mode: dto.mode ?? 'BANK', reference: dto.reference || null, paidById: user.id },
      });
      await tx.equipmentLoan.update({ where: { id: r.id }, data: { status: 'CLOSED', closedOn: parseDate(dto.paidOn) } });
      return { id: r.id, f, no: next.no };
    });
    await this.audit.log(user, 'EQUIPMENT_LOAN', loanId.id, 'FORECLOSED', `Closed with EMI ${loanId.no}: ₹${loanId.f.principal.toFixed(2)} principal + ₹${loanId.f.interest.toFixed(2)} interest on ${dto.paidOn}`);
    return this.get(user, loanId.id);
  }

  /**
   * Undo the last EMI recorded paid (entered by mistake), unless Tally has it or the books are locked over it. A
   * foreclosure undone puts the schedule's later EMIs back as they were.
   */
  async undoPay(user: RequestUser, id: string): Promise<EquipmentLoanDetailDto> {
    this.assertCan(user);
    const loanId = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`LOAN:${id}`}))`;
      const r = await this.row(user, id, tx);
      const last = [...r.emis].reverse().find((e) => e.paidOn);
      if (!last) throw new BadRequestException('No EMI of this loan is paid');
      if (last.tallyExportId) throw new BadRequestException(`EMI ${last.no} has gone to Tally. Undo that export first.`);
      await this.assertOpen(user.organizationId, dateOnly(last.paidOn)!, 'an EMI');
      await tx.loanEmi.deleteMany({ where: { loanId: r.id, no: { gte: last.no } } });
      await tx.loanEmi.createMany({ data: scheduleFrom(termsOf(r), last.no).map((x) => rowData(user.organizationId, r.id, x)) });
      await tx.equipmentLoan.update({ where: { id: r.id }, data: { status: 'ACTIVE', closedOn: null } });
      return { id: r.id, no: last.no };
    });
    await this.audit.log(user, 'EQUIPMENT_LOAN', loanId.id, 'EMI_UNDONE', `EMI ${loanId.no} back to unpaid`);
    return this.get(user, loanId.id);
  }
}
