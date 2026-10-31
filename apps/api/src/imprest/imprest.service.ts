import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  IMPREST_ADMIN_ROLES,
  canApprove,
  canHoldImprest,
  canManageImprest,
  imprestFigures,
  isCompanyWide,
  type RoleKey,
  type ImprestDetailDto,
  type ImprestDto,
  type ImprestEntryDto,
  type ImprestLedgerLine,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { todayIn } from '../notifications/time';
import { dateOnly, iso, money, parseDate } from '../common/serialize';
import { AdvanceDto, ListImprestsQuery, OpenImprestDto, PayDto, RejectDto, RequestTopUpDto, ReturnDto, UpdateImprestDto } from './imprest.dto';

const entryInclude = { requestedBy: { select: { fullName: true } }, decidedBy: { select: { fullName: true } }, paymentRequest: { select: { requestNo: true } } } satisfies Prisma.ImprestEntryInclude;
const include = {
  project: { select: { name: true } },
  holder: { select: { fullName: true } },
  entries: { include: entryInclude, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] },
} satisfies Prisma.ImprestInclude;
type Row = Prisma.ImprestGetPayload<{ include: typeof include }>;
type EntryRow = Prisma.ImprestEntryGetPayload<{ include: typeof entryInclude }>;

const D = (v: Prisma.Decimal | number | string) => new Prisma.Decimal(v);
const inr = (n: number | Prisma.Decimal) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/**
 * Site imprest (v4 item 45): a petty cash float held by one person at one project. Accounts advance cash (the float,
 * then top-ups the holder asks for); the holder's cash site expenses spend it; unspent cash can be handed back.
 */
@Injectable()
export class ImprestService {
  private readonly log = new Logger(ImprestService.name);

  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private notifications: NotificationsService,
  ) {}

  private entryDto(e: EntryRow): ImprestEntryDto {
    return {
      id: e.id,
      kind: e.kind,
      status: e.status,
      amount: money(e.amount),
      date: dateOnly(e.date),
      reason: e.reason,
      paidOn: dateOnly(e.paidOn),
      paymentMode: e.paymentMode,
      reference: e.reference,
      requestedByName: e.requestedBy?.fullName ?? null,
      decidedByName: e.decidedBy?.fullName ?? null,
      decidedAt: iso(e.decidedAt),
      decisionNote: e.decisionNote,
      paymentRequestId: e.paymentRequestId,
      requestNo: e.paymentRequest?.requestNo ?? null,
      createdAt: iso(e.createdAt),
    };
  }

  /** The holder's cash expenses at the project since the imprest opened. */
  private spendWhere(r: { organizationId: string; projectId: string; holderId: string; openedOn: Date }): Prisma.ExpenseWhereInput {
    return { organizationId: r.organizationId, projectId: r.projectId, submittedById: r.holderId, paymentMode: 'CASH', status: { not: 'DRAFT' }, date: { gte: r.openedOn } };
  }

  private async figures(r: Row) {
    const spend = await this.prisma.expense.groupBy({ by: ['status'], where: this.spendWhere(r), _sum: { totalAmount: true } });
    const sumOf = (pred: (s: string) => boolean) => spend.filter((x) => pred(x.status)).reduce((t, x) => t + Number(x._sum.totalAmount ?? 0), 0);
    const paid = r.entries.filter((e) => e.status === 'PAID');
    const advanced = paid.filter((e) => e.kind === 'ADVANCE').reduce((t, e) => t + Number(e.amount), 0);
    const returned = paid.filter((e) => e.kind === 'RETURN').reduce((t, e) => t + Number(e.amount), 0);
    return imprestFigures(Number(r.floatAmount), advanced, returned, sumOf((s) => s === 'APPROVED'), sumOf((s) => s === 'SUBMITTED' || s === 'CHANGES_REQUESTED'), sumOf((s) => s === 'REJECTED'));
  }

  private async toDto(r: Row): Promise<ImprestDto> {
    const f = await this.figures(r);
    const open = r.entries.find((e) => e.status === 'REQUESTED');
    const lastAdvance = [...r.entries].reverse().find((e) => e.kind === 'ADVANCE' && e.status === 'PAID');
    return {
      id: r.id,
      projectId: r.projectId,
      projectName: r.project.name,
      holderId: r.holderId,
      holderName: r.holder.fullName,
      floatAmount: money(r.floatAmount),
      openedOn: dateOnly(r.openedOn),
      closedOn: dateOnly(r.closedOn),
      isActive: r.isActive,
      note: r.note,
      advanced: f.advanced.toFixed(2),
      returned: f.returned.toFixed(2),
      approvedSpend: f.approvedSpend.toFixed(2),
      pendingSpend: f.pendingSpend.toFixed(2),
      disallowed: f.disallowed.toFixed(2),
      cashInHand: f.cashInHand.toFixed(2),
      topUpDue: f.topUpDue.toFixed(2),
      low: f.low,
      openRequest: open ? this.entryDto(open) : null,
      lastAdvanceOn: lastAdvance ? dateOnly(lastAdvance.paidOn ?? lastAdvance.date) : null,
      createdAt: iso(r.createdAt),
    };
  }

  /** Accounts and approvers see the imprests of projects they can see; everyone else only their own. */
  private visibleWhere(user: RequestUser): Prisma.ImprestWhereInput {
    if (canManageImprest(user.roleKey) || canApprove(user.roleKey)) return { organizationId: user.organizationId, project: this.access.projectWhere(user) };
    return { organizationId: user.organizationId, holderId: user.id };
  }

  private async load(user: RequestUser, id: string) {
    const r = await this.prisma.imprest.findFirst({ where: { id, ...this.visibleWhere(user) }, include });
    if (!r) throw new NotFoundException('Imprest not found');
    return r;
  }

  private assertAdmin(user: RequestUser) {
    if (!canManageImprest(user.roleKey)) throw new ForbiddenException('Only accounts and the company admins can do this with an imprest');
  }

  private positive(v: string, what: string) {
    const d = D(v);
    if (d.lte(0)) throw new BadRequestException(`${what} must be more than zero`);
    return d.toDecimalPlaces(2);
  }

  async list(user: RequestUser, q: ListImprestsQuery): Promise<ImprestDto[]> {
    const where: Prisma.ImprestWhereInput = { ...this.visibleWhere(user), isActive: q.active ?? true };
    if (q.projectId) where.projectId = q.projectId;
    if (q.mine) where.holderId = user.id;
    const rows = await this.prisma.imprest.findMany({ where, include, orderBy: [{ project: { name: 'asc' } }, { holder: { fullName: 'asc' } }] });
    return Promise.all(rows.map((r) => this.toDto(r)));
  }

  async get(user: RequestUser, id: string): Promise<ImprestDetailDto> {
    const r = await this.load(user, id);
    const dto = await this.toDto(r);
    const expenses = await this.prisma.expense.findMany({ where: this.spendWhere(r), select: { id: true, expenseNo: true, date: true, description: true, totalAmount: true, status: true, createdAt: true }, orderBy: [{ date: 'asc' }, { expenseNo: 'asc' }] });
    type Item = { date: string; at: number; line: Omit<ImprestLedgerLine, 'balance'> };
    const items: Item[] = [
      ...r.entries
        .filter((e) => e.status === 'PAID')
        .map((e) => {
          const date = dateOnly(e.kind === 'ADVANCE' ? (e.paidOn ?? e.date) : e.date);
          const amt = money(e.amount);
          return {
            date,
            at: e.createdAt.getTime(),
            line: {
              date,
              kind: e.kind,
              ref: e.reference,
              description: e.kind === 'ADVANCE' ? (e.reason ? `Cash advanced: ${e.reason}` : 'Cash advanced') : `Cash returned${e.reason ? `: ${e.reason}` : ''}`,
              status: null,
              cashIn: e.kind === 'ADVANCE' ? amt : '0.00',
              cashOut: e.kind === 'RETURN' ? amt : '0.00',
              expenseId: null,
            },
          };
        }),
      ...expenses.map((x) => ({
        date: dateOnly(x.date),
        at: x.createdAt.getTime(),
        line: {
          date: dateOnly(x.date),
          kind: 'EXPENSE' as const,
          ref: x.expenseNo,
          description: x.description,
          status: x.status,
          cashIn: '0.00',
          // A turned-down voucher is shown but does not reduce the cash in hand: the holder has to account for it.
          cashOut: x.status === 'REJECTED' ? '0.00' : money(x.totalAmount),
          expenseId: x.id,
        },
      })),
    ];
    items.sort((a, b) => a.date.localeCompare(b.date) || a.at - b.at);
    let bal = 0;
    const ledger = items.map(({ line }) => {
      bal = Math.round((bal + Number(line.cashIn) - Number(line.cashOut)) * 100) / 100;
      return { ...line, balance: bal.toFixed(2) };
    });
    return { ...dto, entries: [...r.entries].reverse().map((e) => this.entryDto(e)), ledger };
  }

  async open(user: RequestUser, dto: OpenImprestDto): Promise<ImprestDetailDto> {
    this.assertAdmin(user);
    await this.access.assertCanAccessProject(user, dto.projectId);
    const float = this.positive(dto.floatAmount, 'The float');
    const holder = await this.prisma.user.findFirst({ where: { id: dto.holderId, organizationId: user.organizationId, isActive: true }, select: { id: true, fullName: true, role: { select: { key: true } } } });
    if (!holder) throw new BadRequestException('That person is not an active user of your company');
    if (!canHoldImprest(holder.role.key as RoleKey)) throw new BadRequestException(`${holder.fullName} does not pay site expenses, so cannot hold an imprest`);
    const onProject = await this.prisma.project.findFirst({
      where: { id: dto.projectId, organizationId: user.organizationId, ...(isCompanyWide(holder.role.key as RoleKey) ? {} : { OR: [{ projectManagerId: holder.id }, { members: { some: { userId: holder.id } } }] }) },
      select: { id: true },
    });
    if (!onProject) throw new BadRequestException(`${holder.fullName} is not on this project's team`);
    const existing = await this.prisma.imprest.findUnique({ where: { projectId_holderId: { projectId: dto.projectId, holderId: dto.holderId } }, select: { id: true, isActive: true } });
    if (existing?.isActive) throw new ConflictException(`${holder.fullName} already holds an imprest at this project`);
    const today = todayIn();
    const id = await this.prisma.$transaction(async (tx) => {
      const r = existing
        ? await tx.imprest.update({ where: { id: existing.id }, data: { isActive: true, closedOn: null, floatAmount: float, note: dto.note ?? null }, select: { id: true } })
        : await tx.imprest.create({
            data: { organizationId: user.organizationId, projectId: dto.projectId, holderId: dto.holderId, floatAmount: float, openedOn: parseDate(dto.openedOn ?? today), note: dto.note ?? null, createdById: user.id },
            select: { id: true },
          });
      if (dto.payFloat)
        await tx.imprestEntry.create({
          data: { organizationId: user.organizationId, imprestId: r.id, kind: 'ADVANCE', status: 'PAID', amount: float, date: parseDate(today), paidOn: parseDate(today), paymentMode: dto.paymentMode ?? 'CASH', reference: dto.reference || null, reason: 'Float', decidedById: user.id, decidedAt: new Date() },
        });
      return r.id;
    });
    await this.audit.log(user, 'IMPREST', id, existing ? 'REOPENED' : 'OPENED', `${holder.fullName}, float ${inr(float)}${dto.payFloat ? ', paid' : ''}`);
    return this.get(user, id);
  }

  async update(user: RequestUser, id: string, dto: UpdateImprestDto): Promise<ImprestDetailDto> {
    this.assertAdmin(user);
    const r = await this.load(user, id);
    const data: Prisma.ImprestUpdateInput = {};
    if (dto.floatAmount !== undefined) data.floatAmount = this.positive(dto.floatAmount, 'The float');
    if (dto.note !== undefined) data.note = dto.note || null;
    if (dto.isActive === false && r.isActive) {
      const f = await this.figures(r);
      if (f.cashInHand !== 0) throw new ConflictException(`${r.holder.fullName} still has ${inr(f.cashInHand)} of it. Record that cash coming back (or the bills for it) before closing.`);
      if (r.entries.some((e) => e.status === 'REQUESTED')) throw new ConflictException('A top-up is waiting: pay it or turn it down first.');
      data.isActive = false;
      data.closedOn = parseDate(todayIn());
    }
    if (dto.isActive === true && !r.isActive) {
      data.isActive = true;
      data.closedOn = null;
    }
    await this.prisma.imprest.update({ where: { id }, data });
    const action = dto.isActive === false && r.isActive ? 'CLOSED' : dto.isActive === true && !r.isActive ? 'REOPENED' : 'UPDATED';
    await this.audit.log(user, 'IMPREST', id, action, dto.floatAmount !== undefined ? `Float ${inr(D(dto.floatAmount))}` : null);
    return this.get(user, id);
  }

  /** The holder (or accounts) asks for cash; by default what brings the cash in hand back to the float. */
  async requestTopUp(user: RequestUser, id: string, dto: RequestTopUpDto): Promise<ImprestDetailDto> {
    const r = await this.load(user, id);
    if (r.holderId !== user.id && !canManageImprest(user.roleKey)) throw new ForbiddenException('Only the holder can ask for a top-up');
    if (!r.isActive) throw new ConflictException('This imprest is closed');
    if (r.entries.some((e) => e.status === 'REQUESTED')) throw new ConflictException('A top-up is already waiting to be paid');
    const f = await this.figures(r);
    const amount = dto.amount !== undefined ? this.positive(dto.amount, 'The top-up') : D(f.topUpDue);
    if (amount.lte(0)) throw new BadRequestException('The cash in hand is already at the float. Enter an amount to ask for more.');
    const today = todayIn();
    const e = await this.prisma.imprestEntry.create({
      data: { organizationId: user.organizationId, imprestId: id, kind: 'ADVANCE', status: 'REQUESTED', amount, date: parseDate(today), reason: dto.reason || null, requestedById: user.id },
    });
    await this.audit.log(user, 'IMPREST', id, 'TOP_UP_REQUESTED', `${inr(amount)}${dto.reason ? `: ${dto.reason}` : ''}`);
    await this.notifyAdmins(user, r, `Top-up asked for: ${inr(amount)}`, `${r.holder.fullName} at ${r.project.name} has ${inr(f.cashInHand)} in hand of a ${inr(r.floatAmount)} float${dto.reason ? `. ${dto.reason}` : ''}.`, `IMPREST_TOPUP:${e.id}`);
    return this.get(user, id);
  }

  /** Accounts give cash without a request (the float, or an extra advance). */
  async advance(user: RequestUser, id: string, dto: AdvanceDto): Promise<ImprestDetailDto> {
    this.assertAdmin(user);
    const r = await this.load(user, id);
    if (!r.isActive) throw new ConflictException('This imprest is closed');
    const amount = this.positive(dto.amount, 'The advance');
    const paidOn = parseDate(dto.paidOn ?? todayIn());
    await this.prisma.imprestEntry.create({
      data: { organizationId: user.organizationId, imprestId: id, kind: 'ADVANCE', status: 'PAID', amount, date: paidOn, paidOn, paymentMode: dto.paymentMode ?? 'BANK', reference: dto.reference || null, reason: dto.note || null, decidedById: user.id, decidedAt: new Date() },
    });
    await this.audit.log(user, 'IMPREST', id, 'ADVANCED', inr(amount));
    await this.notifyHolder(user, r, `Cash advanced: ${inr(amount)}`, `For your imprest at ${r.project.name}${dto.reference ? ` (${dto.reference})` : ''}.`);
    return this.get(user, id);
  }

  private async loadEntry(user: RequestUser, entryId: string) {
    this.assertAdmin(user);
    const e = await this.prisma.imprestEntry.findFirst({ where: { id: entryId, organizationId: user.organizationId }, select: { id: true, imprestId: true, status: true, amount: true } });
    if (!e) throw new NotFoundException('Top-up not found');
    const r = await this.load(user, e.imprestId);
    if (e.status !== 'REQUESTED') throw new ConflictException('This top-up has already been decided');
    return { e, r };
  }

  async pay(user: RequestUser, entryId: string, dto: PayDto): Promise<ImprestDetailDto> {
    const { e, r } = await this.loadEntry(user, entryId);
    const amount = dto.amount !== undefined ? this.positive(dto.amount, 'The amount') : e.amount;
    const paidOn = parseDate(dto.paidOn ?? todayIn());
    const n = await this.prisma.imprestEntry.updateMany({
      where: { id: e.id, status: 'REQUESTED' },
      data: { status: 'PAID', amount, paidOn, paymentMode: dto.paymentMode ?? 'BANK', reference: dto.reference || null, decisionNote: dto.note || null, decidedById: user.id, decidedAt: new Date() },
    });
    if (!n.count) throw new ConflictException('This top-up has already been decided');
    await this.audit.log(user, 'IMPREST', r.id, 'TOP_UP_PAID', `${inr(amount)}${dto.reference ? ` (${dto.reference})` : ''}`);
    await this.notifyHolder(user, r, `Top-up paid: ${inr(amount)}`, `For your imprest at ${r.project.name}${dto.reference ? ` (${dto.reference})` : ''}.`);
    return this.get(user, r.id);
  }

  async reject(user: RequestUser, entryId: string, dto: RejectDto): Promise<ImprestDetailDto> {
    const { e, r } = await this.loadEntry(user, entryId);
    const n = await this.prisma.imprestEntry.updateMany({ where: { id: e.id, status: 'REQUESTED' }, data: { status: 'REJECTED', decisionNote: dto.note, decidedById: user.id, decidedAt: new Date() } });
    if (!n.count) throw new ConflictException('This top-up has already been decided');
    await this.audit.log(user, 'IMPREST', r.id, 'TOP_UP_REJECTED', dto.note);
    await this.notifyHolder(user, r, `Top-up turned down: ${inr(e.amount)}`, `${r.project.name}: ${dto.note}`);
    return this.get(user, r.id);
  }

  /** The holder hands unspent cash back to accounts. */
  async takeReturn(user: RequestUser, id: string, dto: ReturnDto): Promise<ImprestDetailDto> {
    this.assertAdmin(user);
    const r = await this.load(user, id);
    const amount = this.positive(dto.amount, 'The amount returned');
    const f = await this.figures(r);
    if (amount.gt(f.cashInHand)) throw new BadRequestException(`${r.holder.fullName} has only ${inr(f.cashInHand)} of this imprest in hand`);
    const date = parseDate(dto.date ?? todayIn());
    await this.prisma.imprestEntry.create({
      data: { organizationId: user.organizationId, imprestId: id, kind: 'RETURN', status: 'PAID', amount, date, paidOn: date, paymentMode: 'CASH', reason: dto.note || null, decidedById: user.id, decidedAt: new Date() },
    });
    await this.audit.log(user, 'IMPREST', id, 'RETURNED', inr(amount));
    return this.get(user, id);
  }

  private async notifyAdmins(user: RequestUser, r: Row, title: string, body: string, dedupeKey: string) {
    try {
      const admins = await this.prisma.user.findMany({ where: { organizationId: user.organizationId, isActive: true, role: { key: { in: IMPREST_ADMIN_ROLES } } }, select: { id: true } });
      await this.notifications.notify({ organizationId: user.organizationId, userIds: admins.map((a) => a.id).filter((a) => a !== user.id), type: 'IMPREST', title, body, projectId: r.projectId, entityType: 'IMPREST', entityId: r.id, dedupeKey });
    } catch (e) {
      this.log.warn(`Imprest notification failed: ${(e as Error).message}`);
    }
  }

  private async notifyHolder(user: RequestUser, r: Row, title: string, body: string) {
    if (r.holderId === user.id) return;
    try {
      await this.notifications.notify({ organizationId: user.organizationId, userIds: [r.holderId], type: 'IMPREST', title, body, projectId: r.projectId, entityType: 'IMPREST', entityId: r.id });
    } catch (e) {
      this.log.warn(`Imprest notification failed: ${(e as Error).message}`);
    }
  }
}
