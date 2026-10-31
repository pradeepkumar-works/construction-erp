import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MAX_GST_RATE, canRaiseDebitNote, canViewDebitNotes, subBillLabel, type DebitNoteDto, type DebitNoteSortField, type Paginated, type PayableBillType, type SortOrder } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { dateOnly, dec, iso, money, parseDate } from '../common/serialize';
import { isUniqueViolation } from '../common/idempotency';
import { nextDocNo } from '../common/doc-number';
import { dateRange, ilike, pageArgs, paginated, searchWords } from '../common/paging';
import { SUB_BILL_PAYABLE, VENDOR_BILL_PAYABLE, subBillPayable, vendorBillPayable } from './payable';
import { syncPaid } from './payables.service';
import { CancelDebitNoteDto, CreateDebitNoteDto, DebitNoteLineInput, ListDebitNotesQuery } from './payables.dto';

type Tx = Prisma.TransactionClient;
type Decimal = Prisma.Decimal;
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const ZERO = D(0);
/** Within a rupee of what is unpaid, as payments are. */
const TOLERANCE = D(1);
const rupees = (d: Decimal) => `₹${d.toFixed(2)}`;

const include = {
  project: { select: { code: true, name: true } },
  vendor: { select: { name: true, gstin: true } },
  vendorBill: { select: { billNo: true, invoiceNo: true } },
  subcontractBill: { select: { billNo: true, isFinal: true, workOrder: { select: { woNo: true } } } },
  stockEntry: { select: { entryNo: true } },
  createdBy: { select: { fullName: true } },
  cancelledBy: { select: { fullName: true } },
  lines: { orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }] },
} satisfies Prisma.DebitNoteInclude;
type Row = Prisma.DebitNoteGetPayload<{ include: typeof include }>;

const ORDER: Record<DebitNoteSortField, (o: SortOrder) => Prisma.DebitNoteOrderByWithRelationInput[]> = {
  noteNo: (o) => [{ noteNo: o }],
  date: (o) => [{ date: o }, { noteNo: o }],
  total: (o) => [{ total: o }],
  vendor: (o) => [{ vendor: { name: o } }, { noteNo: 'desc' }],
  project: (o) => [{ project: { name: o } }, { noteNo: 'desc' }],
  createdAt: (o) => [{ createdAt: o }],
};
const DESC_DEFAULT = new Set<string>(['noteNo', 'date', 'total', 'createdAt']);

/** The bill a note is against, with what it still owes. */
interface Bill {
  type: PayableBillType;
  id: string;
  label: string;
  projectId: string;
  vendorId: string;
  billDate: Date;
  purchaseOrderId: string | null;
}

/**
 * Debit notes: what we take off an approved vendor or subcontract bill for short supply, excess billing,
 * material rejected at QA/QC or returned, or a rate difference. Numbered DN-<year>-0001 and raised by those who record
 * bills, without an approval of their own (the bill was approved; the note only lowers it). A note takes off at most what
 * is still unpaid on the bill; the bill's `debitNoteAmount` is kept as the sum of its notes not cancelled, so its payable
 * and paid state follow. A note in a Tally export cannot be cancelled until that export is undone.
 */
@Injectable()
export class DebitNotesService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
  ) {}

  toDto(r: Row): DebitNoteDto {
    return {
      id: r.id,
      noteNo: r.noteNo,
      date: dateOnly(r.date)!,
      reason: r.reason,
      projectId: r.projectId,
      projectCode: r.project.code,
      projectName: r.project.name,
      vendorId: r.vendorId,
      vendorName: r.vendor.name,
      vendorGstin: r.vendor.gstin,
      billType: r.vendorBillId ? 'VENDOR_BILL' : 'SUBCONTRACT_BILL',
      vendorBillId: r.vendorBillId,
      subcontractBillId: r.subcontractBillId,
      billLabel: r.vendorBill
        ? `${r.vendorBill.billNo} · ${r.vendorBill.invoiceNo}`
        : r.subcontractBill
          ? subBillLabel(r.subcontractBill.workOrder.woNo, r.subcontractBill.billNo, r.subcontractBill.isFinal)
          : '',
      stockEntryId: r.stockEntryId,
      stockEntryNo: r.stockEntry?.entryNo ?? null,
      subtotal: money(r.subtotal)!,
      gstAmount: money(r.gstAmount)!,
      total: money(r.total)!,
      remarks: r.remarks,
      createdById: r.createdById,
      createdByName: r.createdBy.fullName,
      createdAt: iso(r.createdAt)!,
      cancelledAt: iso(r.cancelledAt),
      cancelledByName: r.cancelledBy?.fullName ?? null,
      cancelNote: r.cancelNote,
      exportedToTally: !!r.tallyExportId,
      lines: r.lines.map((l) => ({
        id: l.id,
        description: l.description,
        quantity: dec(l.quantity),
        unit: l.unit,
        rate: money(l.rate),
        amount: money(l.amount)!,
        gstRate: l.gstRate.toString(),
        gstAmount: money(l.gstAmount)!,
      })),
    };
  }

  private assertCanView(user: RequestUser) {
    if (!canViewDebitNotes(user.roleKey)) throw new ForbiddenException('Your role cannot see debit notes');
  }

  private async assertCanRaise(user: RequestUser, projectId: string) {
    if (!canRaiseDebitNote(user.roleKey)) throw new ForbiddenException('Only accounts, procurement and management raise debit notes');
    await this.access.assertCanAccessProject(user, projectId);
  }

  private where(user: RequestUser, q: ListDebitNotesQuery): Prisma.DebitNoteWhereInput {
    const where: Prisma.DebitNoteWhereInput = { ...this.access.submissionWhere(user) };
    for (const k of ['projectId', 'vendorId', 'vendorBillId', 'subcontractBillId', 'stockEntryId', 'reason'] as const) if (q[k]) (where as Record<string, unknown>)[k] = q[k];
    if (!q.includeCancelled) where.cancelledAt = null;
    const days = dateRange(q.from, q.to);
    if (days) where.date = days;
    const words = searchWords(q.q);
    if (words.length)
      where.AND = words.map((w) => ({
        OR: [
          { noteNo: ilike(w) },
          { remarks: ilike(w) },
          { vendor: { name: ilike(w) } },
          { project: { name: ilike(w) } },
          { project: { code: ilike(w) } },
          { vendorBill: { billNo: ilike(w) } },
          { vendorBill: { invoiceNo: ilike(w) } },
          { subcontractBill: { workOrder: { woNo: ilike(w) } } },
        ],
      }));
    return where;
  }

  async list(user: RequestUser, q: ListDebitNotesQuery): Promise<Paginated<DebitNoteDto>> {
    this.assertCanView(user);
    const where = this.where(user, q);
    const sortBy = q.sortBy ?? 'noteNo';
    const order = q.sortOrder ?? (DESC_DEFAULT.has(sortBy) ? 'desc' : 'asc');
    const args = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.debitNote.findMany({ where, include, orderBy: [...ORDER[sortBy](order), { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.debitNote.count({ where }),
    ]);
    return paginated(rows.map((r) => this.toDto(r)), total, args);
  }

  async get(user: RequestUser, id: string): Promise<DebitNoteDto> {
    this.assertCanView(user);
    const row = await this.prisma.debitNote.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include });
    if (!row) throw new NotFoundException('Debit note not found');
    return this.toDto(row);
  }

  /** The approved bill the note is against. */
  private async bill(user: RequestUser, dto: Pick<CreateDebitNoteDto, 'vendorBillId' | 'subcontractBillId'>): Promise<Bill> {
    if (!!dto.vendorBillId === !!dto.subcontractBillId) throw new BadRequestException('Choose the one bill the debit note is against');
    const org = user.organizationId;
    let bill: (Bill & { status: string }) | null = null;
    if (dto.vendorBillId) {
      const b = await this.prisma.vendorBill.findFirst({ where: { id: dto.vendorBillId, organizationId: org } });
      if (b) bill = { type: 'VENDOR_BILL', id: b.id, label: b.billNo, projectId: b.projectId, vendorId: b.vendorId, billDate: b.invoiceDate, purchaseOrderId: b.purchaseOrderId, status: b.status };
    } else {
      const b = await this.prisma.subcontractBill.findFirst({ where: { id: dto.subcontractBillId, organizationId: org }, include: { workOrder: { select: { woNo: true, vendorId: true } } } });
      if (b) bill = { type: 'SUBCONTRACT_BILL', id: b.id, label: subBillLabel(b.workOrder.woNo, b.billNo, b.isFinal), projectId: b.projectId, vendorId: b.workOrder.vendorId, billDate: b.billDate, purchaseOrderId: null, status: b.status };
    }
    if (!bill) throw new NotFoundException('Bill not found');
    if (bill.status !== 'APPROVED') throw new ConflictException(`Debit notes are raised against approved bills; ${bill.label} is not approved`);
    await this.assertCanRaise(user, bill.projectId);
    return bill;
  }

  /** A GRN rejected at QA/QC or a return to the supplier, of the bill's project and vendor. */
  private async stockEntry(user: RequestUser, id: string | undefined, bill: Bill) {
    if (!id) return null;
    const e = await this.prisma.stockEntry.findFirst({ where: { id, organizationId: user.organizationId }, select: { id: true, entryNo: true, type: true, projectId: true, vendorId: true, purchaseOrderId: true } });
    if (!e) throw new NotFoundException('Stock entry not found');
    if (e.type !== 'RECEIPT' && e.type !== 'RETURN_TO_VENDOR') throw new BadRequestException(`${e.entryNo} is not a receipt or a return to the supplier`);
    if (e.projectId !== bill.projectId) throw new BadRequestException(`${e.entryNo} is on another project`);
    if (e.vendorId && e.vendorId !== bill.vendorId) throw new BadRequestException(`${e.entryNo} is from another supplier`);
    return e.id;
  }

  private lines(input: DebitNoteLineInput[]) {
    return input.map((l, i) => {
      const what = l.description;
      const n = (raw: string | undefined, label: string) => {
        if (raw === undefined || raw === '') return null;
        const v = D(raw);
        if (!v.isFinite() || v.lt(0)) throw new BadRequestException(`${what}: the ${label} cannot be negative`);
        return v;
      };
      const quantity = n(l.quantity, 'quantity');
      const rate = n(l.rate, 'rate');
      if (quantity?.decimalPlaces() && quantity.decimalPlaces() > 3) throw new BadRequestException(`${what}: use at most 3 decimals in the quantity`);
      if ((quantity === null) !== (rate === null)) throw new BadRequestException(`${what}: enter both the quantity and the rate, or a lump sum`);
      const amount = quantity && rate ? quantity.mul(rate).toDecimalPlaces(2) : n(l.amount, 'amount');
      if (!amount || amount.lte(0)) throw new BadRequestException(`${what}: enter the amount, or the quantity and rate`);
      if (amount.decimalPlaces() > 2) throw new BadRequestException(`${what}: amounts are in rupees and paise`);
      const gstRate = n(l.gstRate, 'GST rate') ?? ZERO;
      if (gstRate.gt(MAX_GST_RATE)) throw new BadRequestException(`${what}: GST must be between 0 and ${MAX_GST_RATE}%`);
      return { description: what, quantity, unit: quantity ? l.unit || null : null, rate, amount, gstRate, gstAmount: amount.mul(gstRate).div(100).toDecimalPlaces(2), sortOrder: i };
    });
  }

  /** Set the bill's debit note amount to its notes not cancelled, then its paid state (its payable moved). */
  private async resync(tx: Tx, bill: { type: PayableBillType; id: string }) {
    const where = bill.type === 'VENDOR_BILL' ? { vendorBillId: bill.id } : { subcontractBillId: bill.id };
    const s = await tx.debitNote.aggregate({ where: { ...where, cancelledAt: null }, _sum: { total: true } });
    const debitNoteAmount = s._sum.total ?? ZERO;
    if (bill.type === 'VENDOR_BILL') await tx.vendorBill.update({ where: { id: bill.id }, data: { debitNoteAmount } });
    else await tx.subcontractBill.update({ where: { id: bill.id }, data: { debitNoteAmount } });
    await syncPaid(tx, bill.type, bill.id);
  }

  /** What is still unpaid on the bill, notes and payments as they are now. */
  private async unpaid(tx: Tx, bill: Bill): Promise<Decimal> {
    if (bill.type === 'VENDOR_BILL') {
      const b = await tx.vendorBill.findUniqueOrThrow({ where: { id: bill.id }, select: { ...VENDOR_BILL_PAYABLE, paidAmount: true } });
      return vendorBillPayable(b).sub(b.paidAmount);
    }
    const b = await tx.subcontractBill.findUniqueOrThrow({ where: { id: bill.id }, select: { ...SUB_BILL_PAYABLE, paidAmount: true } });
    return subBillPayable(b).sub(b.paidAmount);
  }

  async create(user: RequestUser, dto: CreateDebitNoteDto): Promise<DebitNoteDto> {
    if (dto.id) {
      const existing = await this.prisma.debitNote.findFirst({ where: { id: dto.id, organizationId: user.organizationId }, select: { id: true } });
      if (existing) return this.get(user, existing.id);
    }
    const bill = await this.bill(user, dto);
    const stockEntryId = await this.stockEntry(user, dto.stockEntryId, bill);
    const date = parseDate(dto.date);
    if (date.getTime() > Date.now() + 36 * 3600 * 1000) throw new BadRequestException('The debit note date cannot be in the future');
    if (date < bill.billDate) throw new BadRequestException(`The debit note cannot be dated before the bill (${dateOnly(bill.billDate)})`);
    const lines = this.lines(dto.lines);
    const subtotal = lines.reduce((s, l) => s.add(l.amount), ZERO);
    const gstAmount = lines.reduce((s, l) => s.add(l.gstAmount), ZERO);
    const total = subtotal.add(gstAmount);
    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        // The same lock as payments on the bill, so a note and a payment cannot both take the last of it.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`PAY:${bill.id}`}))`;
        const unpaid = await this.unpaid(tx, bill);
        if (total.gt(unpaid.add(TOLERANCE)))
          throw new BadRequestException(`The note (${rupees(total)}) is more than the ${rupees(Prisma.Decimal.max(unpaid, ZERO))} still unpaid on ${bill.label}; record a refund from the supplier instead`);
        const noteNo = await nextDocNo(tx, user.organizationId, 'DN', async (prefix) =>
          (await tx.debitNote.findFirst({ where: { organizationId: user.organizationId, noteNo: { startsWith: prefix } }, orderBy: { noteNo: 'desc' }, select: { noteNo: true } }))?.noteNo ?? null,
        );
        const row = await tx.debitNote.create({
          data: {
            id: dto.id,
            organizationId: user.organizationId,
            projectId: bill.projectId,
            vendorId: bill.vendorId,
            noteNo,
            date,
            reason: dto.reason,
            vendorBillId: bill.type === 'VENDOR_BILL' ? bill.id : null,
            subcontractBillId: bill.type === 'SUBCONTRACT_BILL' ? bill.id : null,
            stockEntryId,
            subtotal,
            gstAmount,
            total,
            remarks: dto.remarks || null,
            createdById: user.id,
            lines: { create: lines },
          },
          select: { id: true },
        });
        await this.resync(tx, bill);
        return row.id;
      });
    } catch (e) {
      if (isUniqueViolation(e) && dto.id) {
        const winner = await this.prisma.debitNote.findFirst({ where: { id: dto.id, organizationId: user.organizationId }, select: { id: true } });
        if (winner) return this.get(user, winner.id);
      }
      throw e;
    }
    await this.audit.log(user, 'DEBIT_NOTE', id, 'CREATED');
    await this.audit.log(user, bill.type, bill.id, 'DEBIT_NOTE', `${rupees(total)} taken off`);
    return this.get(user, id);
  }

  /** Cancel a wrong note: the bill owes its amount again. Not once it is in a Tally export. */
  async cancel(user: RequestUser, id: string, dto: CancelDebitNoteDto): Promise<DebitNoteDto> {
    const note = await this.get(user, id);
    await this.assertCanRaise(user, note.projectId);
    if (note.cancelledAt) throw new ConflictException(`${note.noteNo} is already cancelled`);
    if (note.exportedToTally) throw new ConflictException(`${note.noteNo} is in a Tally export; undo that export first`);
    const bill = { type: note.billType, id: (note.vendorBillId ?? note.subcontractBillId)! };
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`PAY:${bill.id}`}))`;
      await tx.debitNote.update({ where: { id }, data: { cancelledAt: new Date(), cancelledById: user.id, cancelNote: dto.note } });
      await this.resync(tx, bill);
    });
    await this.audit.log(user, 'DEBIT_NOTE', id, 'CANCELLED', dto.note);
    return this.get(user, id);
  }
}
