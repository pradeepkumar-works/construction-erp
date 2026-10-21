import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  EQUIPMENT_RATE_UNIT_LABELS,
  SUBMISSION_STATUS_LABELS,
  canRecordVendorBill,
  canViewVendorBills,
  type BillableJobDto,
  type HireBillPreviewDto,
  type Paginated,
  type SortOrder,
  type VendorBillDto,
  type VendorBillKind,
  type VendorBillSortField,
  type VendorBillSourceDto,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { SubmissionLifecycleService } from '../common/submission-lifecycle.service';
import { AttachmentsService, ATTACHMENT_FIELDS } from '../common/attachments.service';
import { dateOnly, dec, iso, money, parseDate } from '../common/serialize';
import { isUniqueViolation } from '../common/idempotency';
import { nextDocNo } from '../common/doc-number';
import { dateRange, ilike, pageArgs, paginated, searchWords } from '../common/paging';
import { BillableJobsQuery, CreateVendorBillDto, HirePreviewQuery, ListVendorBillsQuery, UpdateVendorBillDto, VendorBillLineInput } from './purchasing.dto';
import { advanceAdjusted, advancePaid } from '../payables/advances';
import { vendorBillPayable } from '../payables/payable';
import { D, DEFAULT_PAYMENT_DAYS, MSME_MAX_PAYMENT_DAYS, ZERO, lineAmounts, parseFreight, parseGstRate, parseQty, parseRate, sum, totals } from './purchase-math';

type Tx = Prisma.TransactionClient;
type Decimal = Prisma.Decimal;

const include = {
  project: { select: { name: true } },
  vendor: { select: { name: true, gstin: true, msmeCategory: true } },
  equipment: { select: { code: true, name: true } },
  purchaseOrder: {
    select: {
      poNo: true,
      // Advance paid on the PO (v5 item 90), and what its other bills have taken off
      advances: { where: { vendorBillId: null }, select: { amount: true, tdsAmount: true, otherDeduction: true } },
      vendorBills: { where: { status: { not: 'REJECTED' as const } }, select: { id: true, advanceAdjusted: true } },
    },
  },
  submittedBy: { select: { fullName: true } },
  reviewedBy: { select: { fullName: true } },
  attachments: { select: ATTACHMENT_FIELDS },
  lines: {
    orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
    include: {
      purchaseOrderLine: {
        select: { itemName: true, unit: true, rate: true, gstRate: true, stockTxns: { select: { quantity: true } }, billLines: { where: { bill: { status: { not: 'REJECTED' as const } } }, select: { billId: true, quantity: true } } },
      },
    },
  },
} satisfies Prisma.VendorBillInclude;
type Row = Prisma.VendorBillGetPayload<{ include: typeof include }>;

const ORDER: Record<VendorBillSortField, (o: SortOrder) => Prisma.VendorBillOrderByWithRelationInput[]> = {
  invoiceDate: (o) => [{ invoiceDate: o }, { billNo: o }],
  billNo: (o) => [{ billNo: o }],
  dueDate: (o) => [{ dueDate: o }, { billNo: 'asc' }],
  total: (o) => [{ total: o }],
  status: (o) => [{ status: o }, { invoiceDate: 'desc' }],
  project: (o) => [{ project: { name: o } }, { invoiceDate: 'desc' }],
  vendor: (o) => [{ vendor: { name: o } }, { invoiceDate: 'desc' }],
  createdAt: (o) => [{ createdAt: o }],
};
const DESC_DEFAULT = new Set<string>(['invoiceDate', 'billNo', 'total', 'createdAt']);

const rupees = (d: Decimal) => `₹${d.toFixed(2)}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (d: Date) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
const monthRange = (month: string) => {
  const from = parseDate(`${month}-01`);
  return { from, to: new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1)) };
};
const RATE_UNIT_WORD = { HOUR: 'hour', DAY: 'day', MONTH: 'month' } as const;
/** On a hire bill the hire line is sortOrder 0, the minimum-hours top-up 1, and the vendor's other lines from 10. */
const HIRE_EXTRA_FROM = 10;
/** Logs and job cards free to bill: on no bill, on a rejected one, or on the bill being edited. */
const freeFor = (billId?: string) => ({ OR: [{ vendorBillId: null }, { vendorBill: { status: 'REJECTED' as const } }, ...(billId ? [{ vendorBillId: billId }] : [])] });

/** What a bill without a PO is made of, worked out from its machine and month, job cards or own lines (v5 item 91). */
interface Plan {
  projectId: string;
  vendorId: string;
  vendorName: string;
  msme: string | null;
  equipmentId: string | null;
  hireMonth: Date | null;
  expenseCategory: CreateVendorBillDto['expenseCategory'] | null;
  lines: PricedLine[];
  fuelLitres: Decimal;
  fuelRate: Decimal;
  fuelRecovery: Decimal;
  exceptions: string[];
  logIds: string[];
  jobIds: string[];
}
type PlanInput = Pick<CreateVendorBillDto, 'projectId' | 'vendorId' | 'equipmentId' | 'hireMonth' | 'hireQuantity' | 'hireRate' | 'hireGstRate' | 'fuelRate' | 'jobIds' | 'expenseCategory'> & {
  lines?: VendorBillLineInput[];
};
type StoredLine = { purchaseOrderLineId: string | null; description: string | null; unit: string | null; quantity: Decimal; rate: Decimal; gstRate: Decimal; sortOrder: number };
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

interface PoForMatch {
  poNo: string;
  freight: Decimal;
  lines: { id: string; itemName: string; unit: string; rate: Decimal; gstRate: Decimal }[];
}

interface PricedLine {
  purchaseOrderLineId: string | null;
  description?: string | null;
  unit?: string | null;
  quantity: Decimal;
  rate: Decimal;
  gstRate: Decimal;
  amount: Decimal;
  gstAmount: Decimal;
  sortOrder: number;
}

/**
 * Vendor bills: the supplier's invoice entered against an approved purchase order, numbered VB-<year>-0001 and approved
 * through the shared submission lifecycle. Each bill is matched three ways (order, receipt, invoice): quantity billed
 * against quantity received less what other bills already claim, rate and GST rate against the PO, freight against the
 * PO's. A mismatch is recorded as an exception for the approver, not refused, because short supply and revised rates
 * are settled on the bill. The due date is the invoice date plus the PO's payment days, 45 at most for micro and small
 * enterprises.
 */
@Injectable()
export class VendorBillsService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private lifecycle: SubmissionLifecycleService,
    private attachments: AttachmentsService,
  ) {}

  toDto(r: Row, sources?: VendorBillSourceDto[]): VendorBillDto {
    const payable = vendorBillPayable(r);
    const po = r.purchaseOrder;
    const advancePaid = po ? sum(po.advances, (p) => p.amount.add(p.tdsAmount).add(p.otherDeduction)) : ZERO;
    const adjustedElsewhere = po ? sum(po.vendorBills.filter((b) => b.id !== r.id), (b) => b.advanceAdjusted) : ZERO;
    return {
      id: r.id,
      projectId: r.projectId,
      projectName: r.project.name,
      billNo: r.billNo,
      vendorId: r.vendorId,
      vendorName: r.vendor.name,
      vendorGstin: r.vendor.gstin,
      vendorMsme: r.vendor.msmeCategory,
      kind: r.kind,
      purchaseOrderId: r.purchaseOrderId,
      poNo: po?.poNo ?? null,
      equipmentId: r.equipmentId,
      equipmentCode: r.equipment?.code ?? null,
      equipmentName: r.equipment?.name ?? null,
      hireMonth: dateOnly(r.hireMonth),
      fuelLitres: dec(r.fuelLitres)!,
      fuelRate: money(r.fuelRate)!,
      fuelRecovery: money(r.fuelRecovery)!,
      expenseCategory: r.expenseCategory,
      debitNoteAmount: money(r.debitNoteAmount)!,
      ...(sources ? { sources } : {}),
      invoiceNo: r.invoiceNo,
      invoiceDate: dateOnly(r.invoiceDate)!,
      dueDate: dateOnly(r.dueDate)!,
      freight: money(r.freight)!,
      subtotal: money(r.subtotal)!,
      gstAmount: money(r.gstAmount)!,
      total: money(r.total)!,
      matched: r.matched,
      exceptions: r.exceptions,
      advanceAdjusted: money(r.advanceAdjusted)!,
      payable: money(payable)!,
      poAdvancePaid: money(advancePaid)!,
      poAdvanceAvailable: money(Prisma.Decimal.max(advancePaid.sub(adjustedElsewhere), 0))!,
      paidAmount: money(r.paidAmount)!,
      outstanding: money(Prisma.Decimal.max(payable.sub(r.paidAmount), 0))!,
      paidDate: dateOnly(r.paidDate),
      remarks: r.remarks,
      lines: r.lines.map((l) => {
        const pl = l.purchaseOrderLine;
        return {
          id: l.id,
          purchaseOrderLineId: l.purchaseOrderLineId,
          itemName: pl?.itemName ?? l.description ?? '',
          unit: pl?.unit ?? l.unit ?? '',
          quantity: dec(l.quantity)!,
          rate: money(l.rate)!,
          gstRate: l.gstRate.toString(),
          amount: money(l.amount)!,
          gstAmount: money(l.gstAmount)!,
          poRate: pl ? money(pl.rate) : null,
          poGstRate: pl ? pl.gstRate.toString() : null,
          receivedQty: pl ? dec(sum(pl.stockTxns, (t) => t.quantity)) : null,
          billedElsewhere: pl ? dec(sum(pl.billLines.filter((b) => b.billId !== r.id), (b) => b.quantity)) : null,
          sortOrder: l.sortOrder,
        };
      }),
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

  private assertCanView(user: RequestUser) {
    if (!canViewVendorBills(user.roleKey)) throw new ForbiddenException('Your role cannot see vendor bills');
  }

  private async assertCanRecord(user: RequestUser, projectId: string) {
    if (!canRecordVendorBill(user.roleKey)) throw new ForbiddenException('Only accounts, procurement and management record vendor bills');
    await this.access.assertCanAccessProject(user, projectId);
  }

  private where(user: RequestUser, q: ListVendorBillsQuery): Prisma.VendorBillWhereInput {
    const where: Prisma.VendorBillWhereInput = { ...this.access.submissionWhere(user) };
    if (q.projectId) where.projectId = q.projectId;
    if (q.vendorId) where.vendorId = q.vendorId;
    if (q.purchaseOrderId) where.purchaseOrderId = q.purchaseOrderId;
    if (q.equipmentId) where.equipmentId = q.equipmentId;
    if (q.kind) where.kind = q.kind;
    if (q.status) where.status = q.status;
    if (q.exceptions) where.matched = false;
    if (q.mine) where.submittedById = user.id;
    const days = dateRange(q.from, q.to);
    if (days) where.invoiceDate = days;
    const words = searchWords(q.q);
    if (words.length)
      where.AND = words.map((w) => ({ OR: [{ billNo: ilike(w) }, { invoiceNo: ilike(w) }, { vendor: { name: ilike(w) } }, { project: { name: ilike(w) } }, { purchaseOrder: { poNo: ilike(w) } }, { equipment: { code: ilike(w) } }] }));
    return where;
  }

  async list(user: RequestUser, q: ListVendorBillsQuery): Promise<Paginated<VendorBillDto>> {
    this.assertCanView(user);
    const where = this.where(user, q);
    const sortBy = q.sortBy ?? 'invoiceDate';
    const order = q.sortOrder ?? (DESC_DEFAULT.has(sortBy) ? 'desc' : 'asc');
    const args = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.vendorBill.findMany({ where, include, orderBy: [...ORDER[sortBy](order), { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.vendorBill.count({ where }),
    ]);
    return paginated(rows.map((r) => this.toDto(r)), total, args);
  }

  async get(user: RequestUser, id: string): Promise<VendorBillDto> {
    this.assertCanView(user);
    const row = await this.prisma.vendorBill.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include });
    if (!row) throw new NotFoundException('Vendor bill not found');
    return this.toDto(row, await this.sources(row.id, row.kind));
  }

  /** The logs a hire bill billed, or the job cards of a service bill. */
  private async sources(id: string, kind: VendorBillKind): Promise<VendorBillSourceDto[] | undefined> {
    if (kind === 'HIRE') {
      const logs = await this.prisma.machineryLog.findMany({ where: { vendorBillId: id }, orderBy: { date: 'asc' }, select: { id: true, date: true, hoursWorked: true, idleHours: true, dieselLitres: true } });
      return logs.map((l) => ({
        id: l.id,
        label: dateOnly(l.date)!,
        date: dateOnly(l.date)!,
        detail: `${dec(l.hoursWorked)} h worked${l.idleHours.gt(0) ? `, ${dec(l.idleHours)} h idle` : ''}${l.dieselLitres ? `, ${dec(l.dieselLitres)} L diesel` : ''}`,
        quantity: dec(l.hoursWorked),
        amount: null,
      }));
    }
    if (kind === 'SERVICE') {
      const jobs = await this.prisma.maintenanceJob.findMany({ where: { vendorBillId: id }, orderBy: { date: 'asc' }, include: { equipment: { select: { code: true } } } });
      return jobs.map((j) => ({ id: j.id, label: j.jobNo, date: dateOnly(j.closedDate ?? j.date)!, detail: `${j.equipment.code}: ${j.description}`, quantity: null, amount: money(j.labourCost.add(j.partsCost)) }));
    }
    return undefined;
  }

  private async order(user: RequestUser, id: string | null | undefined) {
    if (!id) throw new BadRequestException('Choose the approved purchase order the bill is against');
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId: user.organizationId },
      include: { vendor: { select: { name: true, msmeCategory: true } }, lines: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!po) throw new NotFoundException('Purchase order not found');
    if (po.status !== 'APPROVED') throw new ConflictException(`Bills are recorded against approved orders. ${po.poNo} is ${SUBMISSION_STATUS_LABELS[po.status].toLowerCase()}.`);
    return po;
  }

  private checkDate(date: string) {
    if (parseDate(date).getTime() > Date.now() + 36 * 3600 * 1000) throw new BadRequestException('The invoice date cannot be in the future');
  }

  private dueDate(invoiceDate: Date, paymentDays: number | null, msme: string | null) {
    const days = paymentDays ?? DEFAULT_PAYMENT_DAYS;
    return addDays(invoiceDate, msme === 'MICRO' || msme === 'SMALL' ? Math.min(days, MSME_MAX_PAYMENT_DAYS) : days);
  }

  private priced(po: PoForMatch, input: VendorBillLineInput[]): PricedLine[] {
    if (!input.length) throw new BadRequestException('Add the PO lines the invoice bills');
    const seen = new Set<string>();
    return input.map((l, i) => {
      if (!l.purchaseOrderLineId) throw new BadRequestException(`Line ${i + 1}: choose the PO line it bills`);
      const line = po.lines.find((x) => x.id === l.purchaseOrderLineId);
      if (!line) throw new BadRequestException(`A line is not part of ${po.poNo}`);
      if (seen.has(line.id)) throw new BadRequestException(`${line.itemName} is billed twice`);
      seen.add(line.id);
      const quantity = parseQty(l.quantity, line.itemName);
      const rate = parseRate(l.rate, line.itemName);
      const gstRate = l.gstRate === undefined ? line.gstRate : parseGstRate(l.gstRate, line.itemName);
      return { purchaseOrderLineId: line.id, quantity, rate, gstRate, ...lineAmounts(quantity, rate, gstRate), sortOrder: i };
    });
  }

  /** The three-way match: one exception per mismatch, against receipts now and other bills (not rejected) on the order. */
  private async match(db: Tx | PrismaService, po: PoForMatch & { id: string }, lines: PricedLine[], freight: Decimal, billId?: string): Promise<string[]> {
    const lineIds = lines.map((l) => l.purchaseOrderLineId).filter((x): x is string => !!x);
    const others = { bill: { status: { not: 'REJECTED' as const }, ...(billId ? { id: { not: billId } } : {}) } };
    const [received, billed, otherFreight] = await Promise.all([
      db.stockTxn.groupBy({ by: ['purchaseOrderLineId'], where: { purchaseOrderLineId: { in: lineIds } }, _sum: { quantity: true } }),
      db.vendorBillLine.groupBy({ by: ['purchaseOrderLineId'], where: { purchaseOrderLineId: { in: lineIds }, ...others }, _sum: { quantity: true } }),
      db.vendorBill.aggregate({ where: { purchaseOrderId: po.id, status: { not: 'REJECTED' }, ...(billId ? { id: { not: billId } } : {}) }, _sum: { freight: true } }),
    ]);
    const out: string[] = [];
    for (const l of lines) {
      const line = po.lines.find((x) => x.id === l.purchaseOrderLineId)!;
      const got = received.find((r) => r.purchaseOrderLineId === line.id)?._sum.quantity ?? ZERO;
      const elsewhere = billed.find((b) => b.purchaseOrderLineId === line.id)?._sum.quantity ?? ZERO;
      const open = got.sub(elsewhere);
      if (l.quantity.gt(open))
        out.push(
          `${line.itemName}: ${dec(l.quantity)} ${line.unit} billed, ${dec(got)} received${elsewhere.gt(0) ? ` of which ${dec(elsewhere)} is on other bills` : ''}`,
        );
      if (l.rate.gt(line.rate)) out.push(`${line.itemName}: rate ${rupees(l.rate)} is above the PO rate ${rupees(line.rate)}`);
      if (!l.gstRate.eq(line.gstRate)) out.push(`${line.itemName}: GST ${l.gstRate.toString()}% where the PO has ${line.gstRate.toString()}%`);
    }
    const freightLeft = po.freight.sub(otherFreight._sum.freight ?? ZERO);
    if (freight.gt(freightLeft)) out.push(`Freight ${rupees(freight)} is above the ${rupees(freightLeft.gt(0) ? freightLeft : ZERO)} left on the PO`);
    return out;
  }

  /**
   * Advance taken off this bill (v5 item 90): at most what was paid against the PO in advances and not yet taken off
   * its other bills (not rejected), and never more than the bill.
   */
  private async checkAdvance(db: Tx | PrismaService, purchaseOrderId: string, amount: Decimal, total: Decimal, billId?: string) {
    if (amount.isZero()) return;
    if (amount.lt(0)) throw new BadRequestException('The advance adjusted cannot be negative');
    if (amount.decimalPlaces() > 2) throw new BadRequestException('Amounts are in rupees and paise');
    if (amount.gt(total)) throw new BadRequestException(`The advance adjusted (${rupees(amount)}) cannot be more than the bill (${rupees(total)})`);
    const [paid, elsewhere] = await Promise.all([advancePaid(db as Tx, { purchaseOrderId }), advanceAdjusted(db as Tx, purchaseOrderId, billId)]);
    const left = paid.paid.sub(elsewhere);
    if (amount.gt(left)) throw new BadRequestException(`Only ${rupees(Prisma.Decimal.max(left, ZERO))} of the advance paid on this PO is not yet taken off its bills`);
  }

  private parseAdvance(v: string | undefined) {
    return v === undefined || v === '' ? undefined : new Prisma.Decimal(v);
  }

  private async findExisting(user: RequestUser, id: string | undefined) {
    if (!id) return null;
    const row = await this.prisma.vendorBill.findFirst({ where: { id, organizationId: user.organizationId }, select: { id: true } });
    return row ? this.get(user, row.id) : null;
  }

  private duplicate(e: unknown, invoiceNo: string, vendor: string) {
    if (isUniqueViolation(e)) return new ConflictException(`${vendor}'s invoice ${invoiceNo} is already recorded`);
    return e;
  }

  /* ---------- bills without a PO (v5 item 91) ---------- */

  private async vendorOf(db: Tx | PrismaService, user: RequestUser, id: string | undefined) {
    if (!id) throw new BadRequestException('Choose the vendor');
    const v = await db.vendor.findFirst({ where: { id, organizationId: user.organizationId }, select: { id: true, name: true, msmeCategory: true } });
    if (!v) throw new NotFoundException('Vendor not found');
    return v;
  }

  /** Lines a bill without a PO describes itself: what for, quantity, unit, rate and GST. */
  private freeLines(input: VendorBillLineInput[], from = 0): PricedLine[] {
    return input.map((l, i) => {
      if (l.purchaseOrderLineId) throw new BadRequestException('Only a bill against a PO bills PO lines');
      const what = l.description?.trim();
      if (!what) throw new BadRequestException(`Line ${i + 1}: say what it is for`);
      const quantity = parseQty(l.quantity, what);
      const rate = parseRate(l.rate, what);
      const gstRate = parseGstRate(l.gstRate, what);
      return { purchaseOrderLineId: null, description: what, unit: l.unit?.trim() || 'nos', quantity, rate, gstRate, ...lineAmounts(quantity, rate, gstRate), sortOrder: from + i };
    });
  }

  private static asInput(l: StoredLine): VendorBillLineInput {
    return { description: l.description ?? '', unit: l.unit ?? undefined, quantity: l.quantity.toString(), rate: l.rate.toString(), gstRate: l.gstRate.toString() };
  }

  /** The machine, its approved logs of the month on the project still free to bill, and the bill already made for them. */
  private async hireFacts(db: Tx | PrismaService, user: RequestUser, equipmentId: string, projectId: string, month: string, billId?: string) {
    const eq = await db.equipment.findFirst({ where: { id: equipmentId, organizationId: user.organizationId }, include: { vendor: { select: { id: true, name: true, msmeCategory: true } } } });
    if (!eq) throw new NotFoundException('Machine not found');
    if (eq.ownership !== 'HIRED') throw new BadRequestException(`${eq.code} is our own machine; hire bills are for hired machines`);
    const { from, to } = monthRange(month);
    const inMonth = { equipmentId, projectId, date: { gte: from, lt: to } };
    const [logs, pendingLogs, existing] = await Promise.all([
      db.machineryLog.findMany({ where: { ...inMonth, status: 'APPROVED', ...freeFor(billId) }, orderBy: { date: 'asc' } }),
      db.machineryLog.count({ where: { ...inMonth, status: { in: ['DRAFT', 'SUBMITTED', 'CHANGES_REQUESTED'] } } }),
      db.vendorBill.findFirst({ where: { kind: 'HIRE', equipmentId, projectId, hireMonth: from, status: { not: 'REJECTED' }, ...(billId ? { id: { not: billId } } : {}) }, select: { id: true, billNo: true } }),
    ]);
    const workedHours = sum(logs, (l) => l.hoursWorked);
    const workedDays = logs.filter((l) => l.hoursWorked.gt(0)).length;
    const hireQuantity = !logs.length ? ZERO : eq.rateUnit === 'HOUR' ? workedHours : eq.rateUnit === 'DAY' ? D(workedDays) : D(1);
    const minTopUp = logs.length && eq.rateUnit === 'HOUR' && eq.hireMinHours && workedHours.lt(eq.hireMinHours) ? eq.hireMinHours.sub(workedHours) : ZERO;
    const fuelLitres = eq.hireFuelBy === 'OWNER' ? sum(logs, (l) => l.dieselLitres ?? ZERO) : ZERO;
    return { eq, from, logs, pendingLogs, existing, workedHours, workedDays, hireQuantity, minTopUp, fuelLitres };
  }

  /** GET /vendor-bills/hire-preview: what a hire bill for the machine, project and month would bill. */
  async hirePreview(user: RequestUser, q: HirePreviewQuery): Promise<HireBillPreviewDto> {
    await this.assertCanRecord(user, q.projectId);
    const f = await this.hireFacts(this.prisma, user, q.equipmentId, q.projectId, q.month, q.billId);
    return {
      equipmentId: f.eq.id,
      equipmentCode: f.eq.code,
      equipmentName: f.eq.name,
      vendorId: f.eq.vendor?.id ?? null,
      vendorName: f.eq.vendor?.name ?? null,
      projectId: q.projectId,
      month: dateOnly(f.from)!,
      rate: money(f.eq.rate),
      rateUnit: f.eq.rateUnit,
      hireMinHours: dec(f.eq.hireMinHours),
      hireFuelBy: f.eq.hireFuelBy,
      hireOperator: f.eq.hireOperator,
      logs: f.logs.map((l) => ({ id: l.id, date: dateOnly(l.date)!, hoursWorked: dec(l.hoursWorked)!, idleHours: dec(l.idleHours)!, breakdownHours: dec(l.breakdownHours)!, dieselLitres: dec(l.dieselLitres) })),
      pendingLogs: f.pendingLogs,
      workedHours: dec(f.workedHours)!,
      workedDays: f.workedDays,
      hireQuantity: dec(f.hireQuantity)!,
      minTopUpHours: dec(f.minTopUp)!,
      fuelLitres: dec(f.fuelLitres)!,
      existingBill: f.existing,
    };
  }

  /** GET /vendor-bills/billable-jobs: closed job cards on the project (or in the yard) not yet on a bill. */
  async billableJobs(user: RequestUser, q: BillableJobsQuery): Promise<BillableJobDto[]> {
    await this.assertCanRecord(user, q.projectId);
    const jobs = await this.prisma.maintenanceJob.findMany({
      where: { organizationId: user.organizationId, status: 'CLOSED', OR: [{ projectId: q.projectId }, { projectId: null }], AND: [freeFor(q.billId)] },
      include: { equipment: { select: { code: true, name: true } } },
      orderBy: [{ closedDate: 'desc' }, { jobNo: 'desc' }],
      take: 200,
    });
    return jobs.map((j) => ({
      id: j.id,
      jobNo: j.jobNo,
      date: dateOnly(j.date)!,
      closedDate: dateOnly(j.closedDate),
      equipmentCode: j.equipment.code,
      equipmentName: j.equipment.name,
      description: j.description,
      workshop: j.workshop,
      labourCost: money(j.labourCost)!,
      partsCost: money(j.partsCost)!,
    }));
  }

  /**
   * Work out a hire, service or other bill from its input, the stored bill filling what an update leaves out. Hire lines
   * come from the month's approved logs at the machine's rate, with the minimum-hours top-up; fuel we issued to a machine
   * the owner fuels is recovered. Billing more than the logs or the job cards record, or above the agreed rate, is an
   * exception for the approver, as on a PO bill; a second bill for the same machine and month is refused.
   */
  private async plan(db: Tx | PrismaService, user: RequestUser, kind: Exclude<VendorBillKind, 'PO'>, input: PlanInput, current?: { id: string; projectId: string; vendorId: string; equipmentId: string | null; hireMonth: Date | null; fuelRate: Decimal; expenseCategory: Plan['expenseCategory']; lines: StoredLine[] }): Promise<Plan> {
    const billId = current?.id;
    const projectId = current?.projectId ?? input.projectId;
    if (!projectId) throw new BadRequestException('Choose the project');
    const exceptions: string[] = [];
    if (kind === 'HIRE') {
      const equipmentId = current?.equipmentId ?? input.equipmentId;
      const month = current?.hireMonth ? dateOnly(current.hireMonth)!.slice(0, 7) : input.hireMonth;
      if (!equipmentId) throw new BadRequestException('Choose the hired machine');
      if (!month) throw new BadRequestException('Choose the month billed');
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`HIRE:${equipmentId}:${projectId}:${month}`}))`;
      const f = await this.hireFacts(db, user, equipmentId, projectId, month, billId);
      const { eq } = f;
      if (!eq.vendor) throw new BadRequestException(`Link ${eq.code} to its hire agency in the vendor master first (Machinery, ${eq.code}, Edit)`);
      if (f.existing) throw new ConflictException(`${eq.code} for ${monthLabel(f.from)} is already billed on ${f.existing.billNo}`);
      const hireLine = current?.lines.find((l) => l.sortOrder === 0);
      const unit = RATE_UNIT_WORD[eq.rateUnit];
      const quantity = input.hireQuantity !== undefined ? parseQty(input.hireQuantity, 'Hire') : (hireLine?.quantity ?? f.hireQuantity);
      if (quantity.lte(0)) throw new BadRequestException(`No approved logs of ${eq.code} on this project in ${monthLabel(f.from)}; approve its logs first`);
      const rate = input.hireRate !== undefined ? parseRate(input.hireRate, 'Hire rate') : (hireLine?.rate ?? eq.rate);
      if (!rate) throw new BadRequestException(`Enter the hire rate; ${eq.code} has none in the machine master`);
      const gstRate = input.hireGstRate !== undefined ? parseGstRate(input.hireGstRate, 'Hire') : (hireLine?.gstRate ?? D(18));
      const lines: PricedLine[] = [{ purchaseOrderLineId: null, description: `${eq.code} ${eq.name}, hire for ${monthLabel(f.from)}`, unit, quantity, rate, gstRate, ...lineAmounts(quantity, rate, gstRate), sortOrder: 0 }];
      if (f.minTopUp.gt(0) && eq.rateUnit === 'HOUR')
        lines.push({ purchaseOrderLineId: null, description: `Minimum ${dec(eq.hireMinHours)} hours a month: hours not worked`, unit, quantity: f.minTopUp, rate, gstRate, ...lineAmounts(f.minTopUp, rate, gstRate), sortOrder: 1 });
      const extra = input.lines ?? current?.lines.filter((l) => l.sortOrder >= HIRE_EXTRA_FROM).map(VendorBillsService.asInput) ?? [];
      lines.push(...this.freeLines(extra, HIRE_EXTRA_FROM));
      if (quantity.gt(f.hireQuantity)) exceptions.push(`${dec(quantity)} ${unit}s billed, ${dec(f.hireQuantity)} in the approved logs`);
      if (eq.rate && rate.gt(eq.rate)) exceptions.push(`Hire rate ${rupees(rate)} is above the agreed ${rupees(eq.rate)} ${EQUIPMENT_RATE_UNIT_LABELS[eq.rateUnit]}`);
      if (f.pendingLogs) exceptions.push(`${f.pendingLogs} log${f.pendingLogs === 1 ? '' : 's'} of the month ${f.pendingLogs === 1 ? 'is' : 'are'} not approved yet and not billed`);
      const fuelRate = input.fuelRate !== undefined ? parseRate(input.fuelRate, 'Diesel rate') : (current?.fuelRate ?? ZERO);
      const fuelRecovery = f.fuelLitres.mul(fuelRate).toDecimalPlaces(2);
      if (f.fuelLitres.gt(0) && fuelRate.isZero()) exceptions.push(`${dec(f.fuelLitres)} litres of diesel we issued are not recovered: enter the diesel rate`);
      return {
        projectId,
        vendorId: eq.vendor.id,
        vendorName: eq.vendor.name,
        msme: eq.vendor.msmeCategory,
        equipmentId: eq.id,
        hireMonth: f.from,
        expenseCategory: null,
        lines,
        fuelLitres: f.fuelLitres,
        fuelRate: f.fuelLitres.gt(0) ? fuelRate : ZERO,
        fuelRecovery,
        exceptions,
        logIds: f.logs.map((l) => l.id),
        jobIds: [],
      };
    }
    const vendor = await this.vendorOf(db, user, current?.vendorId ?? input.vendorId);
    const lines = this.freeLines(input.lines ?? current?.lines.map(VendorBillsService.asInput) ?? []);
    if (!lines.length) throw new BadRequestException('Add the lines of the bill');
    const base = { projectId, vendorId: vendor.id, vendorName: vendor.name, msme: vendor.msmeCategory, equipmentId: null, hireMonth: null, lines, fuelLitres: ZERO, fuelRate: ZERO, fuelRecovery: ZERO, exceptions };
    if (kind === 'OTHER') {
      const expenseCategory = input.expenseCategory ?? current?.expenseCategory;
      if (!expenseCategory) throw new BadRequestException('Choose the cost head (expense category) the bill is booked to');
      return { ...base, expenseCategory, logIds: [], jobIds: [] };
    }
    const jobIds = input.jobIds ?? (billId ? (await db.maintenanceJob.findMany({ where: { vendorBillId: billId }, select: { id: true } })).map((j) => j.id) : []);
    if (!jobIds.length) throw new BadRequestException('Choose the closed job cards the workshop bills');
    const jobs = await db.maintenanceJob.findMany({ where: { id: { in: jobIds }, organizationId: user.organizationId }, include: { vendorBill: { select: { billNo: true, status: true } } } });
    if (jobs.length !== new Set(jobIds).size) throw new NotFoundException('A job card was not found');
    for (const j of jobs) {
      if (j.status !== 'CLOSED') throw new BadRequestException(`${j.jobNo} is still open; close it with its cost first`);
      if (j.projectId && j.projectId !== projectId) throw new BadRequestException(`${j.jobNo} is on another project`);
      if (j.vendorBill && j.vendorBillId !== billId && j.vendorBill.status !== 'REJECTED') throw new ConflictException(`${j.jobNo} is already billed on ${j.vendorBill.billNo}`);
    }
    const recorded = sum(jobs, (j) => j.labourCost.add(j.partsCost));
    const billed = sum(lines, (l) => l.amount);
    if (billed.gt(recorded.add(1))) exceptions.push(`${rupees(billed)} billed before GST; the job cards record ${rupees(recorded)} of labour and parts`);
    return { ...base, expenseCategory: null, logIds: [], jobIds: jobs.map((j) => j.id) };
  }

  /** Point the month's logs or the job cards at the bill, and free the ones it no longer bills. */
  private async link(tx: Tx, billId: string, plan: Plan) {
    await tx.machineryLog.updateMany({ where: { vendorBillId: billId, id: { notIn: plan.logIds } }, data: { vendorBillId: null } });
    if (plan.logIds.length) await tx.machineryLog.updateMany({ where: { id: { in: plan.logIds } }, data: { vendorBillId: billId } });
    await tx.maintenanceJob.updateMany({ where: { vendorBillId: billId, id: { notIn: plan.jobIds } }, data: { vendorBillId: null } });
    if (plan.jobIds.length) await tx.maintenanceJob.updateMany({ where: { id: { in: plan.jobIds } }, data: { vendorBillId: billId } });
  }

  private checkFuel(plan: Plan, total: Decimal) {
    if (plan.fuelRecovery.gt(total)) throw new BadRequestException(`The diesel recovered (${rupees(plan.fuelRecovery)}) is more than the bill (${rupees(total)})`);
  }

  private static planData(plan: Plan) {
    return { equipmentId: plan.equipmentId, hireMonth: plan.hireMonth, expenseCategory: plan.expenseCategory, fuelLitres: plan.fuelLitres, fuelRate: plan.fuelRate, fuelRecovery: plan.fuelRecovery, matched: plan.exceptions.length === 0, exceptions: plan.exceptions };
  }

  async create(user: RequestUser, dto: CreateVendorBillDto): Promise<VendorBillDto> {
    const existing = await this.findExisting(user, dto.id);
    if (existing) return existing;
    const kind = dto.kind ?? 'PO';
    if (kind !== 'PO') return this.createWithoutPo(user, kind, dto);
    const po = await this.order(user, dto.purchaseOrderId);
    await this.assertCanRecord(user, po.projectId);
    this.checkDate(dto.invoiceDate);
    const lines = this.priced(po, dto.lines);
    const freight = parseFreight(dto.freight);
    const invoiceDate = parseDate(dto.invoiceDate);
    const advance = this.parseAdvance(dto.advanceAdjusted) ?? ZERO;
    await this.checkAdvance(this.prisma, po.id, advance, totals(lines, freight).total);
    let id: string | null;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        const billNo = await this.nextBillNo(tx, user);
        if (dto.id && (await tx.vendorBill.count({ where: { id: dto.id } }))) return null;
        const exceptions = await this.match(tx, po, lines, freight);
        const row = await tx.vendorBill.create({
          data: {
            id: dto.id,
            organizationId: user.organizationId,
            projectId: po.projectId,
            vendorId: po.vendorId,
            kind: 'PO',
            purchaseOrderId: po.id,
            billNo,
            invoiceNo: dto.invoiceNo,
            invoiceDate,
            dueDate: this.dueDate(invoiceDate, po.paymentDays, po.vendor.msmeCategory),
            freight,
            ...totals(lines, freight),
            advanceAdjusted: advance,
            matched: exceptions.length === 0,
            exceptions,
            remarks: dto.remarks || null,
            submittedById: user.id,
            status: 'DRAFT',
            lines: { create: lines },
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
      throw this.duplicate(e, dto.invoiceNo, po.vendor.name);
    }
    return this.afterCreate(user, id, dto);
  }

  private nextBillNo(tx: Tx, user: RequestUser) {
    return nextDocNo(tx, user.organizationId, 'VB', async (prefix) =>
      (await tx.vendorBill.findFirst({ where: { organizationId: user.organizationId, billNo: { startsWith: prefix } }, orderBy: { billNo: 'desc' }, select: { billNo: true } }))?.billNo ?? null,
    );
  }

  private async afterCreate(user: RequestUser, id: string | null, dto: CreateVendorBillDto) {
    if (!id) return this.get(user, dto.id!);
    await this.attachments.link(user, 'vendorBillId', id, dto.attachmentIds);
    await this.audit.log(user, 'VENDOR_BILL', id, 'CREATED');
    if (dto.submit) await this.submit(user, id);
    return this.get(user, id);
  }

  /** A hire, service or other bill (v5 item 91): no PO to match; its own checks are recorded as exceptions. */
  private async createWithoutPo(user: RequestUser, kind: Exclude<VendorBillKind, 'PO'>, dto: CreateVendorBillDto): Promise<VendorBillDto> {
    if (dto.purchaseOrderId) throw new BadRequestException('A bill against a PO is of kind PO');
    if (!dto.projectId) throw new BadRequestException('Choose the project');
    await this.assertCanRecord(user, dto.projectId);
    this.checkDate(dto.invoiceDate);
    if (this.parseAdvance(dto.advanceAdjusted)?.gt(0)) throw new BadRequestException('Advances are taken off bills against a PO');
    const freight = parseFreight(dto.freight);
    const invoiceDate = parseDate(dto.invoiceDate);
    let id: string | null;
    let vendorName = '';
    try {
      id = await this.prisma.$transaction(async (tx) => {
        const plan = await this.plan(tx, user, kind, dto);
        vendorName = plan.vendorName;
        const sums = totals(plan.lines, freight);
        this.checkFuel(plan, sums.total);
        const billNo = await this.nextBillNo(tx, user);
        if (dto.id && (await tx.vendorBill.count({ where: { id: dto.id } }))) return null;
        const row = await tx.vendorBill.create({
          data: {
            id: dto.id,
            organizationId: user.organizationId,
            projectId: plan.projectId,
            vendorId: plan.vendorId,
            kind,
            billNo,
            invoiceNo: dto.invoiceNo,
            invoiceDate,
            dueDate: this.dueDate(invoiceDate, null, plan.msme),
            freight,
            ...sums,
            ...VendorBillsService.planData(plan),
            remarks: dto.remarks || null,
            submittedById: user.id,
            status: 'DRAFT',
            lines: { create: plan.lines },
          },
          select: { id: true },
        });
        await this.link(tx, row.id, plan);
        return row.id;
      });
    } catch (e) {
      if (isUniqueViolation(e) && dto.id) {
        const winner = await this.findExisting(user, dto.id);
        if (winner) return winner;
      }
      throw this.duplicate(e, dto.invoiceNo, vendorName || 'The vendor');
    }
    return this.afterCreate(user, id, dto);
  }

  async update(user: RequestUser, id: string, dto: UpdateVendorBillDto): Promise<VendorBillDto> {
    const row = await this.lifecycle.load(user, 'VENDOR_BILL', id);
    await this.assertCanRecord(user, row.projectId);
    await this.lifecycle.assertEditable(user, row);
    const current = await this.prisma.vendorBill.findUniqueOrThrow({ where: { id }, include: { lines: { orderBy: { sortOrder: 'asc' } } } });
    if (dto.invoiceDate !== undefined) this.checkDate(dto.invoiceDate);
    const freight = dto.freight !== undefined ? parseFreight(dto.freight) : current.freight;
    const invoiceDate = dto.invoiceDate !== undefined ? parseDate(dto.invoiceDate) : current.invoiceDate;
    const invoiceNo = dto.invoiceNo ?? current.invoiceNo;
    if (current.kind !== 'PO') {
      const kind = current.kind;
      if (this.parseAdvance(dto.advanceAdjusted)?.gt(0)) throw new BadRequestException('Advances are taken off bills against a PO');
      let vendorName = '';
      try {
        await this.prisma.$transaction(async (tx) => {
          const plan = await this.plan(tx, user, kind, dto, current);
          vendorName = plan.vendorName;
          const sums = totals(plan.lines, freight);
          this.checkFuel(plan, sums.total);
          await tx.vendorBill.update({
            where: { id },
            data: {
              invoiceNo,
              invoiceDate,
              dueDate: this.dueDate(invoiceDate, null, plan.msme),
              freight,
              ...sums,
              ...VendorBillsService.planData(plan),
              ...(dto.remarks !== undefined ? { remarks: dto.remarks || null } : {}),
              lines: { deleteMany: {}, create: plan.lines },
            },
          });
          await this.link(tx, id, plan);
        });
      } catch (e) {
        throw this.duplicate(e, invoiceNo, vendorName || 'The vendor');
      }
      return this.afterUpdate(user, id, dto);
    }
    const po = await this.order(user, current.purchaseOrderId);
    const lines = dto.lines ? this.priced(po, dto.lines) : current.lines;
    const advance = this.parseAdvance(dto.advanceAdjusted) ?? current.advanceAdjusted;
    await this.checkAdvance(this.prisma, po.id, advance, totals(lines, freight).total, id);
    try {
      await this.prisma.$transaction(async (tx) => {
        const exceptions = await this.match(tx, po, lines, freight, id);
        await tx.vendorBill.update({
          where: { id },
          data: {
            invoiceNo,
            invoiceDate,
            dueDate: this.dueDate(invoiceDate, po.paymentDays, po.vendor.msmeCategory),
            freight,
            ...totals(lines, freight),
            advanceAdjusted: advance,
            matched: exceptions.length === 0,
            exceptions,
            ...(dto.remarks !== undefined ? { remarks: dto.remarks || null } : {}),
            ...(dto.lines ? { lines: { deleteMany: {}, create: lines as PricedLine[] } } : {}),
          },
        });
      });
    } catch (e) {
      throw this.duplicate(e, invoiceNo, po.vendor.name);
    }
    return this.afterUpdate(user, id, dto);
  }

  private async afterUpdate(user: RequestUser, id: string, dto: UpdateVendorBillDto) {
    await this.attachments.sync(user, 'vendorBillId', id, dto.attachmentIds);
    await this.audit.log(user, 'VENDOR_BILL', id, 'UPDATED');
    if (dto.submit) await this.submit(user, id);
    return this.get(user, id);
  }

  /**
   * Submit for approval, checking again first: GRNs or other bills may have arrived since a PO bill was entered, and a
   * hire bill takes the month's logs approved since (its minimum-hours top-up and fuel move with them).
   */
  async submit(user: RequestUser, id: string) {
    const row = await this.lifecycle.load(user, 'VENDOR_BILL', id);
    const bill = await this.prisma.vendorBill.findUniqueOrThrow({ where: { id }, include: { lines: { orderBy: { sortOrder: 'asc' } } } });
    if (row.status !== 'SUBMITTED' && row.status !== 'APPROVED') {
      if (bill.kind !== 'PO') {
        const kind = bill.kind;
        await this.prisma.$transaction(async (tx) => {
          const plan = await this.plan(tx, user, kind, {}, bill);
          const sums = totals(plan.lines, bill.freight);
          this.checkFuel(plan, sums.total);
          await tx.vendorBill.update({ where: { id }, data: { ...sums, ...VendorBillsService.planData(plan), lines: { deleteMany: {}, create: plan.lines } } });
          await this.link(tx, id, plan);
        });
      } else {
        const po = await this.order(user, bill.purchaseOrderId);
        const exceptions = await this.match(this.prisma, po, bill.lines, bill.freight, id);
        await this.checkAdvance(this.prisma, po.id, bill.advanceAdjusted, bill.total, id);
        await this.prisma.vendorBill.update({ where: { id }, data: { matched: exceptions.length === 0, exceptions } });
      }
    }
    await this.lifecycle.submit(user, 'VENDOR_BILL', id);
    return this.get(user, id);
  }

  async remove(user: RequestUser, id: string) {
    const row = await this.lifecycle.load(user, 'VENDOR_BILL', id);
    await this.assertCanRecord(user, row.projectId);
    await this.lifecycle.assertEditable(user, row);
    await this.prisma.vendorBill.delete({ where: { id } });
    await this.audit.log(user, 'VENDOR_BILL', id, 'DELETED');
    return { ok: true };
  }
}
