import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  BANK_FILE_FORMATS,
  PAYMENT_MODE_LABELS,
  bankFileProblem,
  bankFileRows,
  bankFileText,
  canRecordPayment,
  paymentMode,
  readUtrResponse,
  type BankFileDto,
  type BankFileFormatKey,
  type BankPayee,
  type PayableRequestDto,
  type PaymentBatchDetailDto,
  type PaymentBatchDto,
  type PaymentBatchLineDto,
  type PaymentBatchLineState,
  type TransferMode,
  type UtrImportResultDto,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { AuditService } from '../common/audit.service';
import { ProjectAccessService } from '../common/project-access.service';
import { dateOnly, iso, money } from '../common/serialize';
import { inr } from '../common/submission-titles';
import { isUniqueViolation } from '../common/idempotency';
import { nextDocNo } from '../common/doc-number';
import { todayIn } from '../notifications/time';
import { PayablesService, type PreparedPayment } from './payables.service';
import { targetLabel } from './payment-requests.service';
import type { AddBatchLinesDto, CreatePaymentBatchDto, UpdatePaymentBatchDto } from './payment-batches.dto';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const ZERO = D(0);
/** Export writes every payment of a batch in one transaction; a few hundred lines take a few seconds. */
const EXPORT_TX = { timeout: 120_000, maxWait: 10_000 };

const requestInclude = {
  vendor: { select: { id: true, name: true, bankAccountNo: true, bankIfsc: true, email: true } },
  project: { select: { code: true, name: true } },
  vendorBill: { select: { billNo: true } },
  subcontractBill: { select: { billNo: true, isFinal: true, workOrder: { select: { woNo: true } } } },
  purchaseOrder: { select: { poNo: true } },
  workOrder: { select: { woNo: true } },
} satisfies Prisma.PaymentRequestInclude;
type RequestRow = Prisma.PaymentRequestGetPayload<{ include: typeof requestInclude }>;

const lineInclude = {
  paymentRequest: { include: requestInclude },
  vendorPayment: { select: { id: true, reference: true } },
} satisfies Prisma.PaymentBatchLineInclude;
type LineRow = Prisma.PaymentBatchLineGetPayload<{ include: typeof lineInclude }>;

const batchInclude = {
  createdBy: { select: { fullName: true } },
  exportedBy: { select: { fullName: true } },
  lines: { include: lineInclude, orderBy: [{ createdAt: 'asc' }, { paymentRequest: { requestNo: 'asc' } }] },
} satisfies Prisma.PaymentBatchInclude;
type BatchRow = Prisma.PaymentBatchGetPayload<{ include: typeof batchInclude }>;

const against = (r: RequestRow) =>
  r.kind === 'FUND_REQUEST' ? 'On account' : r.kind === 'BILL' ? targetLabel(r) : `Advance on ${targetLabel(r)}`;
const leftOn = (r: { amount: Prisma.Decimal; paidAmount: Prisma.Decimal }) => r.amount.sub(r.paidAmount);

/** The request as the bank file pays it: the vendor's account today, its number as our reference. */
const payeeOf = (r: RequestRow, amount: Prisma.Decimal): BankPayee => ({
  name: r.vendor?.name ?? '',
  accountNo: r.vendor?.bankAccountNo,
  ifsc: r.vendor?.bankIfsc,
  amount: amount.toFixed(2),
  narration: `${r.requestNo} ${against(r)}`,
  reference: r.requestNo,
  email: r.vendor?.email,
});

/** Why a request cannot go in a batch; null when it can. */
function requestProblem(r: RequestRow): string | null {
  if (r.status !== 'APPROVED') return `${r.requestNo} is not approved yet; only approved requests are paid`;
  if (!r.vendorId) return `${r.requestNo} goes into a site's imprest: release it from the request instead`;
  if (r.mode !== 'BANK') return `${r.requestNo} asks to be paid by ${PAYMENT_MODE_LABELS[r.mode].toLowerCase()}, not through the bank`;
  if (leftOn(r).lte(0)) return `${r.requestNo} is paid in full`;
  return null;
}

/**
 * Bank payments (ARCHITECTURE "Bank payments"): approved payment requests paid in one upload to the bank. A draft takes
 * lines; export writes the file and records each line's payment through payables, so it posts as one recorded by hand;
 * the bank's UTRs, read back, set each payment's reference and settle the batch. Admin, management and accounts.
 */
@Injectable()
export class PaymentBatchesService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private payables: PayablesService,
  ) {}

  private assertCan(user: RequestUser) {
    if (!canRecordPayment(user.roleKey)) throw new ForbiddenException('Only admin, management and accounts pay vendors by bank file');
  }

  private lineState(b: { status: BatchRow['status'] }, l: LineRow, problem: string | null): PaymentBatchLineState {
    if (b.status === 'DRAFT') return problem ? 'MISSING' : 'READY';
    if (l.leftOut) return 'LEFT_OUT';
    if (!l.vendorPayment) return 'REMOVED';
    return l.vendorPayment.reference ? 'PAID' : 'WAITING';
  }

  private lineDto(b: BatchRow, l: LineRow): PaymentBatchLineDto {
    const r = l.paymentRequest;
    const live = b.status === 'DRAFT' ? bankFileProblem(payeeOf(r, l.amount)) : null;
    const state = this.lineState(b, l, live);
    const accountNo = b.status === 'DRAFT' ? r.vendor?.bankAccountNo : l.accountNo;
    return {
      id: l.id,
      paymentRequestId: r.id,
      requestNo: r.requestNo,
      vendorId: r.vendorId ?? '',
      vendorName: r.vendor?.name ?? '',
      projectCode: r.project.code,
      projectName: r.project.name,
      against: against(r),
      amount: money(l.amount),
      state,
      problem: live ?? l.leftOut,
      accountEnding: accountNo ? accountNo.replace(/\s+/g, '').slice(-4) : null,
      ifsc: (b.status === 'DRAFT' ? r.vendor?.bankIfsc : l.ifsc) ?? null,
      mode: b.status === 'DRAFT' ? (live ? null : paymentMode(l.amount.toFixed(2))) : (l.payMode as TransferMode | null),
      vendorPaymentId: l.vendorPayment?.id ?? null,
      utr: l.vendorPayment?.reference ?? null,
    };
  }

  private toDto(b: BatchRow, items = b.lines.map((l) => this.lineDto(b, l))): PaymentBatchDto {
    const inFile = items.filter((l) => l.state !== 'MISSING' && l.state !== 'LEFT_OUT');
    return {
      id: b.id,
      batchNo: b.batchNo,
      status: b.status,
      format: b.format as BankFileFormatKey,
      debitAccount: b.debitAccount,
      lines: items.length,
      inFile: inFile.length,
      total: money(inFile.reduce((s, l) => s.add(l.amount), ZERO)),
      paid: items.filter((l) => l.state === 'PAID').length,
      paymentDate: b.paymentDate ? dateOnly(b.paymentDate) : null,
      createdByName: b.createdBy.fullName,
      createdAt: iso(b.createdAt),
      exportedByName: b.exportedBy?.fullName ?? null,
      exportedAt: b.exportedAt ? iso(b.exportedAt) : null,
      settledAt: b.settledAt ? iso(b.settledAt) : null,
    };
  }

  private detail(b: BatchRow): PaymentBatchDetailDto {
    const items = b.lines.map((l) => this.lineDto(b, l));
    const dto = this.toDto(b, items);
    const exportProblem =
      b.status !== 'DRAFT' ? null : !items.length ? 'Add the payment requests to pay' : !dto.inFile ? 'No line has the vendor’s bank account and IFSC; add them on the vendor' : null;
    return { ...dto, items, fileName: b.fileName, exportProblem };
  }

  private async load(user: RequestUser, id: string): Promise<BatchRow> {
    this.assertCan(user);
    const b = await this.prisma.paymentBatch.findFirst({ where: { id, organizationId: user.organizationId }, include: batchInclude });
    if (!b) throw new NotFoundException('Batch not found');
    return b;
  }

  private assertDraft(b: { status: string; batchNo: string }) {
    if (b.status !== 'DRAFT') throw new BadRequestException(`${b.batchNo} is exported; its lines and file no longer change`);
  }

  async list(user: RequestUser): Promise<PaymentBatchDto[]> {
    this.assertCan(user);
    const rows = await this.prisma.paymentBatch.findMany({ where: { organizationId: user.organizationId }, include: batchInclude, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 500 });
    return rows.map((b) => this.toDto(b));
  }

  async get(user: RequestUser, id: string): Promise<PaymentBatchDetailDto> {
    return this.detail(await this.load(user, id));
  }

  /** Approved requests with something left to pay, for adding to a batch: those already in an open batch say which. */
  async payable(user: RequestUser): Promise<PayableRequestDto[]> {
    this.assertCan(user);
    const rows = await this.prisma.paymentRequest.findMany({
      where: { ...this.access.submissionWhere(user), status: 'APPROVED', paidDate: null, vendorId: { not: null } },
      include: { ...requestInclude, batchLines: { where: { open: true }, select: { batch: { select: { batchNo: true } } } } },
      orderBy: [{ neededBy: { sort: 'asc', nulls: 'last' } }, { requestNo: 'asc' }],
      take: 1000,
    });
    return rows
      .filter((r) => leftOn(r).gt(0))
      .map((r) => ({
        id: r.id,
        requestNo: r.requestNo,
        vendorName: r.vendor?.name ?? '',
        projectCode: r.project.code,
        against: against(r),
        left: money(leftOn(r)),
        inBatch: r.batchLines[0]?.batch.batchNo ?? null,
        problem: requestProblem(r) ?? bankFileProblem(payeeOf(r, leftOn(r))),
      }));
  }

  async create(user: RequestUser, dto: CreatePaymentBatchDto): Promise<PaymentBatchDetailDto> {
    this.assertCan(user);
    const org = user.organizationId;
    const id = await this.prisma.$transaction(async (tx) => {
      const batchNo = await nextDocNo(tx, org, 'PB', async (prefix) =>
        (await tx.paymentBatch.findFirst({ where: { organizationId: org, batchNo: { startsWith: prefix } }, orderBy: { batchNo: 'desc' }, select: { batchNo: true } }))?.batchNo ?? null,
      );
      const row = await tx.paymentBatch.create({ data: { organizationId: org, batchNo, debitAccount: dto.debitAccount, format: dto.format, createdById: user.id }, select: { id: true } });
      return row.id;
    });
    const b = await this.load(user, id);
    await this.audit.log(user, 'PAYMENT_BATCH', id, 'CREATED', `${b.batchNo} from ${b.debitAccount}, ${BANK_FILE_FORMATS[dto.format].label}`);
    return this.detail(b);
  }

  async update(user: RequestUser, id: string, dto: UpdatePaymentBatchDto): Promise<PaymentBatchDetailDto> {
    const b = await this.load(user, id);
    this.assertDraft(b);
    const moved = await this.prisma.paymentBatch.updateMany({
      where: { id, organizationId: user.organizationId, status: 'DRAFT' },
      data: { ...(dto.debitAccount !== undefined ? { debitAccount: dto.debitAccount } : {}), ...(dto.format !== undefined ? { format: dto.format } : {}) },
    });
    if (moved.count !== 1) this.assertDraft({ status: 'EXPORTED', batchNo: b.batchNo });
    await this.audit.log(user, 'PAYMENT_BATCH', id, 'UPDATED');
    return this.get(user, id);
  }

  async remove(user: RequestUser, id: string) {
    const b = await this.load(user, id);
    this.assertDraft(b);
    const gone = await this.prisma.paymentBatch.deleteMany({ where: { id, organizationId: user.organizationId, status: 'DRAFT' } });
    if (gone.count !== 1) this.assertDraft({ status: 'EXPORTED', batchNo: b.batchNo });
    await this.audit.log(user, 'PAYMENT_BATCH', id, 'DELETED', b.batchNo);
    return { ok: true };
  }

  /**
   * Add approved requests to a draft. A request already in another open batch is refused with that batch named: checked
   * first for the message, and held by the partial unique index when two people add it at once.
   */
  async addLines(user: RequestUser, id: string, dto: AddBatchLinesDto): Promise<PaymentBatchDetailDto> {
    const b = await this.load(user, id);
    this.assertDraft(b);
    const ids = [...new Set(dto.paymentRequestIds)];
    const requests = await this.prisma.paymentRequest.findMany({ where: { id: { in: ids }, ...this.access.submissionWhere(user) }, include: requestInclude });
    if (requests.length !== ids.length) throw new NotFoundException('Payment request not found');
    for (const r of requests) {
      const problem = requestProblem(r);
      if (problem) throw new BadRequestException(problem);
    }
    await this.assertNotInOpenBatch(user, ids, id);
    try {
      await this.prisma.$transaction(async (tx) => {
        const held = await tx.paymentBatch.updateMany({ where: { id, status: 'DRAFT' }, data: { updatedAt: new Date() } });
        if (held.count !== 1) this.assertDraft({ status: 'EXPORTED', batchNo: b.batchNo });
        await tx.paymentBatchLine.createMany({ data: requests.map((r) => ({ organizationId: user.organizationId, batchId: id, paymentRequestId: r.id, amount: leftOn(r) })) });
      });
    } catch (e) {
      if (isUniqueViolation(e)) await this.assertNotInOpenBatch(user, ids, null);
      throw e;
    }
    await this.audit.log(user, 'PAYMENT_BATCH', id, 'LINES_ADDED', requests.map((r) => `${r.requestNo} ${inr(leftOn(r))}`).join(', '));
    return this.get(user, id);
  }

  private async assertNotInOpenBatch(user: RequestUser, requestIds: string[], exceptBatchId: string | null) {
    const held = await this.prisma.paymentBatchLine.findFirst({
      where: { organizationId: user.organizationId, paymentRequestId: { in: requestIds }, open: true },
      select: { batchId: true, batch: { select: { batchNo: true } }, paymentRequest: { select: { requestNo: true } } },
    });
    if (!held) return;
    if (held.batchId === exceptBatchId) throw new BadRequestException(`${held.paymentRequest.requestNo} is already in this batch`);
    throw new BadRequestException(`${held.paymentRequest.requestNo} is already in ${held.batch.batchNo}; a request is paid in one batch at a time`);
  }

  async removeLine(user: RequestUser, id: string, lineId: string): Promise<PaymentBatchDetailDto> {
    const b = await this.load(user, id);
    this.assertDraft(b);
    const line = b.lines.find((l) => l.id === lineId);
    if (!line) throw new NotFoundException('Line not found');
    await this.prisma.$transaction(async (tx) => {
      const held = await tx.paymentBatch.updateMany({ where: { id, status: 'DRAFT' }, data: { updatedAt: new Date() } });
      if (held.count !== 1) this.assertDraft({ status: 'EXPORTED', batchNo: b.batchNo });
      await tx.paymentBatchLine.delete({ where: { id: lineId } });
    });
    await this.audit.log(user, 'PAYMENT_BATCH', id, 'LINE_REMOVED', line.paymentRequest.requestNo);
    return this.get(user, id);
  }

  /**
   * Make the bank file and record its payments, all in one transaction: the batch moves from draft only once, the lines
   * must be those read, each payment goes through payables' own checks and locks, and a vendor without an account or
   * IFSC is left out of the file and frees its request.
   */
  async exportFile(user: RequestUser, id: string): Promise<PaymentBatchDetailDto> {
    const b = await this.load(user, id);
    this.assertDraft(b);
    const view = this.detail(b);
    if (view.exportProblem) throw new BadRequestException(view.exportProblem);
    const valueDate = todayIn();
    const file = bankFileRows(b.format as BankFileFormatKey, { debitAccount: b.debitAccount, valueDate }, b.lines.map((l) => payeeOf(l.paymentRequest, l.amount)));
    const modeOf = new Map(file.paid.map((p) => [p.reference, p.mode]));
    const leftOut = new Map(file.missing.map((m) => [m.reference, m.problem]));
    const prepared: { line: LineRow; payment: PreparedPayment }[] = [];
    for (const line of b.lines.filter((l) => modeOf.has(l.paymentRequest.requestNo)))
      prepared.push({
        line,
        payment: await this.payables.prepare(user, {
          paymentRequestId: line.paymentRequestId,
          paymentDate: valueDate,
          amount: line.amount.toFixed(2),
          mode: 'BANK',
          remarks: `Paid in ${b.batchNo}`,
        }),
      });
    const paid = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.paymentBatch.updateMany({
        where: { id, organizationId: user.organizationId, status: 'DRAFT' },
        data: { status: 'EXPORTED', exportedById: user.id, exportedAt: new Date(), paymentDate: new Date(valueDate), fileName: `${b.batchNo}-${b.format.toLowerCase()}.csv`, fileContent: bankFileText(file.rows) },
      });
      if (claimed.count !== 1) throw new ConflictException(`${b.batchNo} is already exported`);
      const now = await tx.paymentBatchLine.findMany({ where: { batchId: id }, select: { id: true } });
      if (now.length !== b.lines.length || now.some((l) => !b.lines.some((x) => x.id === l.id))) throw new ConflictException(`The lines of ${b.batchNo} changed while it was being exported; export it again`);
      const out: { id: string; payment: PreparedPayment }[] = [];
      for (const { line, payment } of prepared) {
        const r = line.paymentRequest;
        const paymentId = await this.payables.insert(tx, user, payment);
        await tx.paymentBatchLine.update({ where: { id: line.id }, data: { vendorPaymentId: paymentId, accountNo: r.vendor?.bankAccountNo?.replace(/\s+/g, '').toUpperCase(), ifsc: r.vendor?.bankIfsc?.replace(/\s+/g, '').toUpperCase(), payMode: modeOf.get(r.requestNo) } });
        out.push({ id: paymentId, payment });
      }
      for (const line of b.lines.filter((l) => leftOut.has(l.paymentRequest.requestNo)))
        await tx.paymentBatchLine.update({ where: { id: line.id }, data: { open: false, leftOut: leftOut.get(line.paymentRequest.requestNo) } });
      return out;
    }, EXPORT_TX);
    for (const p of paid) await this.payables.announce(user, p.payment, p.id);
    await this.audit.log(user, 'PAYMENT_BATCH', id, 'EXPORTED', `${paid.length} payments, ${inr(prepared.reduce((s, p) => s.add(p.line.amount), ZERO))}${leftOut.size ? `; ${leftOut.size} left out` : ''}`);
    return this.get(user, id);
  }

  /**
   * Undo an export the bank has not acted on (the file was refused, or made with the wrong account): its payments come
   * off through payables, and the batch is a draft again. Refused once a UTR is in or a payment is in Tally.
   */
  async undoExport(user: RequestUser, id: string): Promise<PaymentBatchDetailDto> {
    const b = await this.load(user, id);
    if (b.status !== 'EXPORTED') throw new BadRequestException(b.status === 'DRAFT' ? `${b.batchNo} is not exported` : `${b.batchNo} is settled; its payments have their UTRs`);
    const withUtr = b.lines.find((l) => l.vendorPayment?.reference);
    if (withUtr) throw new BadRequestException(`${withUtr.paymentRequest.requestNo} already has its UTR, so the bank has paid it; the export stays`);
    const removals: Awaited<ReturnType<PayablesService['prepareRemove']>>[] = [];
    for (const l of b.lines) if (l.vendorPayment) removals.push(await this.payables.prepareRemove(user, l.vendorPayment.id));
    await this.prisma.$transaction(async (tx) => {
      const back = await tx.paymentBatch.updateMany({
        where: { id, organizationId: user.organizationId, status: 'EXPORTED' },
        data: { status: 'DRAFT', exportedById: null, exportedAt: null, paymentDate: null, fileName: null, fileContent: null },
      });
      if (back.count !== 1) throw new ConflictException(`${b.batchNo} changed meanwhile; open it again`);
      const utr = await tx.vendorPayment.count({ where: { id: { in: removals.map((r) => r.row.id) }, reference: { not: null } } });
      if (utr) throw new ConflictException(`A UTR came in for ${b.batchNo} meanwhile; the export stays`);
      for (const r of removals) await this.payables.removeIn(tx, r);
      await tx.paymentBatchLine.updateMany({ where: { batchId: id }, data: { accountNo: null, ifsc: null, payMode: null } });
      // Lines left out come back unless their request went into another batch meanwhile.
      for (const l of b.lines.filter((x) => x.leftOut)) {
        const elsewhere = await tx.paymentBatchLine.count({ where: { paymentRequestId: l.paymentRequestId, open: true } });
        if (elsewhere) await tx.paymentBatchLine.delete({ where: { id: l.id } });
        else await tx.paymentBatchLine.update({ where: { id: l.id }, data: { open: true, leftOut: null } });
      }
    }, EXPORT_TX);
    for (const r of removals) await this.payables.announceRemove(user, r);
    await this.audit.log(user, 'PAYMENT_BATCH', id, 'EXPORT_UNDONE', `${removals.length} payments taken off`);
    return this.get(user, id);
  }

  /** The file as export made it. */
  async file(user: RequestUser, id: string): Promise<BankFileDto> {
    const b = await this.load(user, id);
    if (!b.fileContent || !b.fileName) throw new BadRequestException(`${b.batchNo} has no file yet; export it first`);
    return { fileName: b.fileName, mimeType: 'text/csv', content: b.fileContent };
  }

  /**
   * Read the bank's UTRs (its response file or a pasted list, as cells) onto the batch's payments through payables, and
   * settle the batch once every payment it made has one. Importing the same UTRs again changes nothing.
   */
  async importUtrs(user: RequestUser, id: string, cells: unknown[][]): Promise<UtrImportResultDto> {
    const b = await this.load(user, id);
    if (b.status === 'DRAFT') throw new BadRequestException(`${b.batchNo} is not exported yet; export it, upload the file to the bank, then import the UTRs`);
    if (b.status === 'SETTLED') throw new BadRequestException(`${b.batchNo} is settled; change a UTR on the payment itself`);
    const read = readUtrResponse(cells, b.lines.map((l) => l.paymentRequest.requestNo));
    const byRequest = new Map(b.lines.map((l) => [l.paymentRequest.requestNo, l]));
    const problems = [...read.problems];
    const refs: { id: string; reference: string }[] = [];
    for (const f of read.found) {
      const line = byRequest.get(f.reference)!;
      if (!line.vendorPayment) problems.push(`${f.reference} is not paid in this batch`);
      else refs.push({ id: line.vendorPayment.id, reference: f.utr });
    }
    const outcome = await this.prisma.$transaction(async (tx) => {
      const held = await tx.paymentBatch.updateMany({ where: { id, status: 'EXPORTED' }, data: { updatedAt: new Date() } });
      if (held.count !== 1) throw new ConflictException(`${b.batchNo} is settled; change a UTR on the payment itself`);
      const changed = await this.payables.setReferences(tx, user, refs);
      const waiting = await tx.paymentBatchLine.count({ where: { batchId: id, vendorPaymentId: { not: null }, vendorPayment: { reference: null } } });
      if (!waiting) {
        await tx.paymentBatch.updateMany({ where: { id, status: 'EXPORTED' }, data: { status: 'SETTLED', settledAt: new Date() } });
        await tx.paymentBatchLine.updateMany({ where: { batchId: id }, data: { open: false } });
      }
      return { changed, waiting };
    });
    await this.payables.referencesSet(user, outcome.changed, b.batchNo);
    if (outcome.changed.length) await this.audit.log(user, 'PAYMENT_BATCH', id, 'UTRS_IMPORTED', `${outcome.changed.length} UTRs${outcome.waiting ? `, ${outcome.waiting} still waiting` : ', settled'}`);
    return { set: outcome.changed.length, waiting: outcome.waiting, rejected: read.rejected, problems, batch: await this.get(user, id) };
  }
}
