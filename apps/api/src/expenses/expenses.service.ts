import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { GST_TOLERANCE, MAX_GST_RATE, gstFor, type ExpenseDto, type ExpenseSortField, type ExpenseSummaryDto, type Paginated, type SortOrder } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { SubmissionLifecycleService } from '../common/submission-lifecycle.service';
import { VendorsService } from '../vendors/vendors.service';
import { AttachmentsService } from '../common/attachments.service';
import { dateOnly, iso, money, parseDate } from '../common/serialize';
import { isUniqueViolation } from '../common/idempotency';
import { nextDocNo } from '../common/doc-number';
import { ilike, pageArgs, paginated, searchWords } from '../common/paging';
import { CreateExpenseDto, ListExpensesQuery, UpdateExpenseDto } from './expenses.dto';

const include = {
  project: { select: { name: true } },
  activity: { select: { name: true } },
  submittedBy: { select: { fullName: true } },
  reviewedBy: { select: { fullName: true } },
  attachments: true,
} satisfies Prisma.ExpenseInclude;
type Row = Prisma.ExpenseGetPayload<{ include: typeof include }>;

const ORDER: Record<ExpenseSortField, (o: SortOrder) => Prisma.ExpenseOrderByWithRelationInput[]> = {
  date: (o) => [{ date: o }, { expenseNo: o }],
  expenseNo: (o) => [{ expenseNo: o }],
  createdAt: (o) => [{ createdAt: o }],
  submittedAt: (o) => [{ submittedAt: { sort: o, nulls: 'last' } }],
  totalAmount: (o) => [{ totalAmount: o }],
  category: (o) => [{ category: o }, { date: 'desc' }],
  status: (o) => [{ status: o }, { date: 'desc' }],
  project: (o) => [{ project: { name: o } }, { date: 'desc' }],
  submittedBy: (o) => [{ submittedBy: { fullName: o } }, { date: 'desc' }],
};
const DESC_DEFAULT = new Set<string>(['date', 'expenseNo', 'createdAt', 'submittedAt', 'totalAmount']);

interface Amounts {
  amount: Prisma.Decimal;
  gstRate: Prisma.Decimal;
  gstAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
}

/**
 * Site expenses: a bill paid at the project (taxable value, GST, payment mode, bill photo), numbered
 * EXP-<year>-0001 per organisation and approved through the shared submission lifecycle.
 * Approved expenses are project cost (see the cost view).
 */
@Injectable()
export class ExpensesService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private lifecycle: SubmissionLifecycleService,
    private attachments: AttachmentsService,
    private vendors: VendorsService,
  ) {}

  toDto(r: Row): ExpenseDto {
    return {
      id: r.id,
      projectId: r.projectId,
      projectName: r.project.name,
      expenseNo: r.expenseNo,
      date: dateOnly(r.date)!,
      category: r.category,
      description: r.description,
      vendor: r.vendor,
      vendorGstin: r.vendorGstin,
      vendorId: r.vendorId,
      billNo: r.billNo,
      amount: money(r.amount)!,
      gstRate: r.gstRate.toString(),
      gstAmount: money(r.gstAmount)!,
      totalAmount: money(r.totalAmount)!,
      paymentMode: r.paymentMode,
      activityId: r.activityId,
      activityName: r.activity?.name ?? null,
      remarks: r.remarks,
      status: r.status,
      submittedById: r.submittedById,
      submittedByName: r.submittedBy.fullName,
      submittedAt: iso(r.submittedAt),
      reviewedById: r.reviewedById,
      reviewedByName: r.reviewedBy?.fullName ?? null,
      reviewedAt: iso(r.reviewedAt),
      reviewNote: r.reviewNote,
      attachments: r.attachments.map((a) => this.attachments.toDto(a)),
      createdAt: iso(r.createdAt)!,
      updatedAt: iso(r.updatedAt)!,
    };
  }

  private where(user: RequestUser, q: ListExpensesQuery): Prisma.ExpenseWhereInput {
    const where: Prisma.ExpenseWhereInput = { ...this.access.submissionWhere(user) };
    if (q.projectId) where.projectId = q.projectId;
    if (q.status) where.status = q.status;
    if (q.category) where.category = q.category;
    if (q.paymentMode) where.paymentMode = q.paymentMode;
    if (q.mine) where.submittedById = user.id;
    if (q.noReceipt) where.attachments = { none: {} };
    if (q.from || q.to) where.date = { ...(q.from ? { gte: parseDate(q.from) } : {}), ...(q.to ? { lte: parseDate(q.to) } : {}) };
    const words = searchWords(q.q);
    if (words.length)
      where.AND = words.map((w) => ({
        OR: [{ expenseNo: ilike(w) }, { description: ilike(w) }, { vendor: ilike(w) }, { billNo: ilike(w) }, { project: { name: ilike(w) } }, { submittedBy: { fullName: ilike(w) } }],
      }));
    return where;
  }

  async list(user: RequestUser, q: ListExpensesQuery): Promise<Paginated<ExpenseDto>> {
    const where = this.where(user, q);
    const sortBy = q.sortBy ?? 'date';
    const order = q.sortOrder ?? (DESC_DEFAULT.has(sortBy) ? 'desc' : 'asc');
    const args = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.expense.findMany({ where, include, orderBy: [...ORDER[sortBy](order), { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.expense.count({ where }),
    ]);
    return paginated(rows.map((r) => this.toDto(r)), total, args);
  }

  /** Totals for the same filters as the list (paging and sort ignored). */
  async summary(user: RequestUser, q: ListExpensesQuery): Promise<ExpenseSummaryDto> {
    const where = this.where(user, q);
    const [all, byStatus, byCategory] = await Promise.all([
      this.prisma.expense.aggregate({ where, _count: true, _sum: { amount: true, gstAmount: true, totalAmount: true } }),
      this.prisma.expense.groupBy({ by: ['status'], where, _sum: { totalAmount: true } }),
      this.prisma.expense.groupBy({ by: ['category'], where, _count: true, _sum: { totalAmount: true } }),
    ]);
    const statusTotal = (s: string) => byStatus.find((b) => b.status === s)?._sum.totalAmount ?? 0;
    return {
      count: all._count,
      amount: money(all._sum.amount ?? 0)!,
      gstAmount: money(all._sum.gstAmount ?? 0)!,
      totalAmount: money(all._sum.totalAmount ?? 0)!,
      approvedTotal: money(statusTotal('APPROVED'))!,
      pendingTotal: money(statusTotal('SUBMITTED'))!,
      byCategory: byCategory
        .map((c) => ({ category: c.category, count: c._count, totalAmount: money(c._sum.totalAmount ?? 0)! }))
        .sort((a, b) => Number(b.totalAmount) - Number(a.totalAmount)),
    };
  }

  async get(user: RequestUser, id: string): Promise<ExpenseDto> {
    const row = await this.prisma.expense.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include });
    if (!row) throw new NotFoundException('Expense not found');
    return this.toDto(row);
  }

  private checkDate(date: string) {
    if (parseDate(date).getTime() > Date.now() + 36 * 3600 * 1000) throw new BadRequestException('The date cannot be in the future');
  }

  /** Taxable value, rate and GST on the bill -> stored amounts. A typed GST must be within ₹1 of rate × amount. */
  private amounts(amount: string, gstRate: string | undefined, gstAmount: string | null | undefined): Amounts {
    const a = new Prisma.Decimal(amount);
    if (a.lte(0)) throw new BadRequestException('Amount must be greater than 0');
    if (a.decimalPlaces() > 2) throw new BadRequestException('Amount can have at most 2 decimals');
    const rate = new Prisma.Decimal(gstRate || 0);
    if (rate.lt(0) || rate.gt(MAX_GST_RATE)) throw new BadRequestException(`GST rate must be between 0 and ${MAX_GST_RATE}%`);
    const computed = new Prisma.Decimal(gstFor(amount, rate.toString()));
    let gst = computed;
    if (gstAmount !== undefined && gstAmount !== null && gstAmount !== '') {
      gst = new Prisma.Decimal(gstAmount).toDecimalPlaces(2);
      if (gst.lt(0)) throw new BadRequestException('GST cannot be negative');
      if (gst.minus(computed).abs().gt(GST_TOLERANCE)) throw new BadRequestException(`GST ₹${gst.toFixed(2)} does not match ${rate.toString()}% of ₹${a.toFixed(2)} (₹${computed.toFixed(2)})`);
    }
    return { amount: a, gstRate: rate, gstAmount: gst, totalAmount: a.plus(gst) };
  }

  private async assertActivity(projectId: string, activityId: string | null | undefined) {
    if (!activityId) return;
    const a = await this.prisma.activity.findFirst({ where: { id: activityId, projectId }, select: { id: true } });
    if (!a) throw new NotFoundException('Activity not found in this project');
  }

  private async findExisting(user: RequestUser, id: string | undefined) {
    if (!id) return null;
    const row = await this.prisma.expense.findFirst({ where: { id, organizationId: user.organizationId }, select: { id: true } });
    return row ? this.get(user, row.id) : null;
  }

  async create(user: RequestUser, dto: CreateExpenseDto): Promise<ExpenseDto> {
    const existing = await this.findExisting(user, dto.id);
    if (existing) return existing;
    await this.access.assertCanSubmitExpense(user, dto.projectId);
    await this.assertActivity(dto.projectId, dto.activityId);
    this.checkDate(dto.date);
    const amounts = this.amounts(dto.amount, dto.gstRate, dto.gstAmount);
    const vendor = await this.vendors.resolve(user, dto.vendorId, dto.vendor);
    let id: string | null;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        const expenseNo = await nextDocNo(tx, user.organizationId, 'EXP', async (prefix) =>
          (await tx.expense.findFirst({ where: { organizationId: user.organizationId, expenseNo: { startsWith: prefix } }, orderBy: { expenseNo: 'desc' }, select: { expenseNo: true } }))?.expenseNo ?? null,
        );
        // A retry of the same offline expense that waited on the lock: the first one already created it.
        if (dto.id && (await tx.expense.count({ where: { id: dto.id } }))) return null;
        const row = await tx.expense.create({
          data: {
            id: dto.id,
            organizationId: user.organizationId,
            projectId: dto.projectId,
            expenseNo,
            date: parseDate(dto.date),
            category: dto.category,
            description: dto.description,
            vendor: vendor?.name ?? null,
            vendorGstin: dto.vendorGstin || vendor?.gstin || null,
            vendorId: vendor?.vendorId ?? null,
            billNo: dto.billNo || null,
            ...amounts,
            paymentMode: dto.paymentMode ?? 'CASH',
            activityId: dto.activityId || null,
            remarks: dto.remarks || null,
            submittedById: user.id,
            status: 'DRAFT',
          },
          select: { id: true },
        });
        return row.id;
      });
    } catch (e) {
      if (isUniqueViolation(e) && dto.id) {
        const winner = await this.findExisting(user, dto.id);
        if (winner) return winner;
      }
      throw e;
    }
    if (!id) return this.get(user, dto.id!);
    await this.attachments.link(user, 'expenseId', id, dto.attachmentIds);
    await this.audit.log(user, 'EXPENSE', id, 'CREATED');
    if (dto.submit !== false) await this.lifecycle.submit(user, 'EXPENSE', id);
    return this.get(user, id);
  }

  async update(user: RequestUser, id: string, dto: UpdateExpenseDto): Promise<ExpenseDto> {
    const row = await this.lifecycle.load(user, 'EXPENSE', id);
    await this.lifecycle.assertEditable(user, row);
    const current = await this.prisma.expense.findUniqueOrThrow({ where: { id } });
    if (dto.projectId !== undefined && dto.projectId !== current.projectId) throw new BadRequestException('An expense cannot be moved to another project; delete it and file it again');
    if (dto.activityId !== undefined) await this.assertActivity(current.projectId, dto.activityId);
    if (dto.date !== undefined) this.checkDate(dto.date);
    const data: Prisma.ExpenseUncheckedUpdateInput = {};
    if (dto.amount !== undefined || dto.gstRate !== undefined || dto.gstAmount !== undefined) {
      // Changing the amount or rate recomputes GST unless the bill's GST is sent too.
      const gstAmount = dto.gstAmount !== undefined ? dto.gstAmount : dto.amount !== undefined || dto.gstRate !== undefined ? null : current.gstAmount.toString();
      Object.assign(data, this.amounts(dto.amount ?? current.amount.toString(), dto.gstRate ?? current.gstRate.toString(), gstAmount));
    }
    if (dto.date !== undefined) data.date = parseDate(dto.date);
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.vendorGstin !== undefined) data.vendorGstin = dto.vendorGstin || null;
    const vendor = await this.vendors.resolve(user, dto.vendorId, dto.vendor);
    if (vendor) {
      Object.assign(data, { vendor: vendor.name, vendorId: vendor.vendorId });
      if (dto.vendorGstin === undefined && vendor.gstin && !current.vendorGstin) data.vendorGstin = vendor.gstin;
    }
    if (dto.billNo !== undefined) data.billNo = dto.billNo || null;
    if (dto.paymentMode !== undefined) data.paymentMode = dto.paymentMode;
    if (dto.activityId !== undefined) data.activityId = dto.activityId || null;
    if (dto.remarks !== undefined) data.remarks = dto.remarks || null;
    await this.prisma.expense.update({ where: { id }, data });
    await this.attachments.sync(user, 'expenseId', id, dto.attachmentIds);
    await this.audit.log(user, 'EXPENSE', id, 'UPDATED');
    if (dto.submit) await this.lifecycle.submit(user, 'EXPENSE', id);
    return this.get(user, id);
  }

  async submit(user: RequestUser, id: string) {
    await this.lifecycle.submit(user, 'EXPENSE', id);
    return this.get(user, id);
  }

  async remove(user: RequestUser, id: string) {
    const row = await this.lifecycle.load(user, 'EXPENSE', id);
    await this.lifecycle.assertEditable(user, row);
    await this.prisma.expense.delete({ where: { id } });
    await this.audit.log(user, 'EXPENSE', id, 'DELETED');
    return { ok: true };
  }
}
