import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  SUB_BILL_DEDUCTION_LABELS,
  BACK_CHARGE_OTHER,
  backChargesProblem,
  backChargesTotal,
  canPrepareSubcontractBill,
  retentionHeld,
  retentionReleaseProblem,
  subBillLabel,
  type BackChargeInput,
  type Paginated,
  type SortOrder,
  type SubcontractBillDeductionDto,
  type SubcontractBillDto,
  type SubcontractBillSortField,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { ApprovalRightsService } from '../common/approval-rights.service';
import { AuditService } from '../common/audit.service';
import { SubmissionLifecycleService } from '../common/submission-lifecycle.service';
import { AttachmentsService, ATTACHMENT_FIELDS } from '../common/attachments.service';
import { dateOnly, dec, iso, money, parseDate } from '../common/serialize';
import { isUniqueViolation } from '../common/idempotency';
import { dateRange, ilike, pageArgs, paginated, searchWords } from '../common/paging';
import { D, DEFAULT_PAYMENT_DAYS, MSME_MAX_PAYMENT_DAYS, ZERO, sum } from '../purchasing/purchase-math';
import { CreateSubcontractBillDto, ListSubcontractBillsQuery, OwnItemQtyInput, UpdateSubcontractBillDto } from './subcontracts.dto';
import { pctStr } from './work-orders.service';
import { workOrderAdvanceBase } from '../payables/advances';
import { subBillPayable } from '../payables/payable';
import { subBillLines } from './sub-bill-lines';
import { LabourComplianceService } from '../labour-compliance/labour-compliance.service';
import { TdsDeductionsService } from '../tds/tds-deductions.service';
import { MastersService } from '../masters/masters.service';

type Tx = Prisma.TransactionClient;
const round2 = (v: Prisma.Decimal) => v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
const pctOf = (base: Prisma.Decimal, pct: Prisma.Decimal) => round2(base.mul(pct).div(100));

const include = {
  project: { select: { name: true } },
  workOrder: { select: { woNo: true, title: true, vendorId: true, vendor: { select: { name: true, gstin: true, pan: true, msmeCategory: true } } } },
  lines: { orderBy: { sortOrder: 'asc' as const }, include: { workOrderLine: { include: { boqItem: { select: { itemNo: true } } } } } },
  materials: { include: { item: { select: { name: true, unit: true } } }, orderBy: { item: { name: 'asc' as const } } },
  charges: { orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }] },
  submittedBy: { select: { fullName: true } },
  reviewedBy: { select: { fullName: true } },
  attachments: { select: ATTACHMENT_FIELDS },
  _count: { select: { measurements: true, issues: true } },
} satisfies Prisma.SubcontractBillInclude;
type Row = Prisma.SubcontractBillGetPayload<{ include: typeof include }>;

const ORDER: Record<SubcontractBillSortField, (o: SortOrder) => Prisma.SubcontractBillOrderByWithRelationInput[]> = {
  billDate: (o) => [{ billDate: o }, { billNo: o }],
  grossAmount: (o) => [{ grossAmount: o }],
  netPayable: (o) => [{ netPayable: o }],
  dueDate: (o) => [{ dueDate: o }],
  status: (o) => [{ status: o }, { billDate: 'desc' }],
  project: (o) => [{ project: { name: o } }, { billDate: 'desc' }],
  vendor: (o) => [{ workOrder: { vendor: { name: o } } }, { billDate: 'desc' }],
  createdAt: (o) => [{ createdAt: o }],
};
const DESC_DEFAULT = new Set<string>(['billDate', 'grossAmount', 'netPayable', 'createdAt']);

/** A day can be at most 36 hours ahead of the server clock (time zones). */
const checkNotFuture = (date: string, what: string) => {
  if (parseDate(date).getTime() > Date.now() + 36 * 3600 * 1000) throw new BadRequestException(`The ${what} cannot be in the future`);
};

const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86400000);

/**
 * Subcontractor bills, running bills under a work order. A bill takes the approved measurements of the
 * contractor's work up to a date that no earlier bill took (BOQ lines) and the quantities entered for the order's own
 * items, priced at the work order rates with previous / this bill / up to date per line; adds GST at the order's rate;
 * and recovers retention, the advance (capped at what is still outstanding), TDS and the material issued to them from
 * stock (at each item's rate when the bill is made), plus any other recovery. One bill per work order is open at a time.
 * Approved through the lifecycle and the approval matrix; paid in payables.
 */
@Injectable()
export class SubcontractBillsService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private rights: ApprovalRightsService,
    private audit: AuditService,
    private lifecycle: SubmissionLifecycleService,
    private attachments: AttachmentsService,
    private masters: MastersService,
    private labour: LabourComplianceService,
    tds: TdsDeductionsService,
  ) {
    // The bill's TDS under 194C becomes a deduction for the quarter's return in the approval's own transaction.
    lifecycle.onApproved('SUBCONTRACT_BILL', (tx, user, id) => tds.forSubcontractBill(tx, user.organizationId, id));
  }

  /** The company's back-charge kinds by code. */
  private async chargeKinds(organizationId: string) {
    return new Map((await this.masters.entriesFor(organizationId, 'backCharge')).map((e) => [e.code, e]));
  }

  toDto(r: Row, kinds: Map<string, { name: string }>): SubcontractBillDto {
    const kindName = (code: string) => kinds.get(code)?.name ?? code;
    const deductions: SubcontractBillDeductionDto[] = [];
    const pct = (key: 'retention' | 'advanceRecovery' | 'tds', p: Prisma.Decimal, amount: Prisma.Decimal) => {
      if (!amount.isZero()) deductions.push({ key, label: SUB_BILL_DEDUCTION_LABELS[key], pct: pctStr(p), amount: money(amount) });
    };
    pct('retention', r.retentionPct, r.retentionAmount);
    pct('advanceRecovery', r.advanceRecoveryPct, r.advanceRecoveryAmount);
    pct('tds', r.tdsPct, r.tdsAmount);
    if (!r.materialRecovery.isZero()) deductions.push({ key: 'material', label: SUB_BILL_DEDUCTION_LABELS.material, pct: null, amount: money(r.materialRecovery) });
    if (!r.excessRecovery.isZero()) deductions.push({ key: 'excessMaterial', label: SUB_BILL_DEDUCTION_LABELS.excessMaterial, pct: null, amount: money(r.excessRecovery) });
    // Back-charges one by one; an older bill without them keeps its single other recovery.
    if (r.charges.length) for (const c of r.charges) deductions.push({ key: 'backCharge', label: c.note ? `${kindName(c.kindCode)}: ${c.note}` : kindName(c.kindCode), pct: null, amount: money(c.amount) });
    else if (!r.otherDeduction.isZero()) deductions.push({ key: 'other', label: r.otherDeductionNote || SUB_BILL_DEDUCTION_LABELS.other, pct: null, amount: money(r.otherDeduction) });
    const w = r.workOrder;
    return {
      id: r.id,
      projectId: r.projectId,
      projectName: r.project.name,
      billNo: r.billNo,
      label: subBillLabel(w.woNo, r.billNo, r.isFinal, r.isRelease),
      isFinal: r.isFinal,
      isRelease: r.isRelease,
      workOrderId: r.workOrderId,
      woNo: w.woNo,
      woTitle: w.title,
      vendorId: w.vendorId,
      vendorName: w.vendor.name,
      vendorGstin: w.vendor.gstin,
      vendorPan: w.vendor.pan,
      vendorMsme: w.vendor.msmeCategory,
      billDate: dateOnly(r.billDate),
      measuredUpTo: dateOnly(r.measuredUpTo),
      invoiceNo: r.invoiceNo,
      dueDate: dateOnly(r.dueDate),
      grossPrevious: money(r.grossPrevious),
      grossAmount: money(r.grossAmount),
      grossUpto: money(r.grossUpto),
      gstRate: pctStr(r.gstRate),
      gstAmount: money(r.gstAmount),
      retentionPct: pctStr(r.retentionPct),
      advanceRecoveryPct: pctStr(r.advanceRecoveryPct),
      tdsPct: pctStr(r.tdsPct),
      materialRecovery: money(r.materialRecovery),
      excessRecovery: money(r.excessRecovery),
      otherDeduction: money(r.otherDeduction),
      otherDeductionNote: r.otherDeductionNote,
      charges: r.charges.map((c) => ({ kindCode: c.kindCode, kindName: kindName(c.kindCode), amount: money(c.amount), note: c.note })),
      deductions,
      totalDeductions: money(r.totalDeductions),
      retentionReleased: money(r.retentionReleased),
      netPayable: money(r.netPayable),
      debitNoteAmount: money(r.debitNoteAmount),
      paidAmount: money(r.paidAmount),
      outstanding: money(Prisma.Decimal.max(subBillPayable(r).sub(r.paidAmount), 0)),
      paidDate: dateOnly(r.paidDate),
      remarks: r.remarks,
      measurementCount: r._count.measurements,
      issueCount: r._count.issues,
      lines: r.lines.map((l) => {
        const wl = l.workOrderLine;
        const prevAmount = l.prevAmount;
        const excess = l.uptoQty.sub(wl.quantity);
        return {
          id: l.id,
          workOrderLineId: l.workOrderLineId,
          boqItemId: wl.boqItemId,
          itemNo: wl.boqItem?.itemNo ?? null,
          description: wl.description,
          unit: wl.unit,
          woQty: dec(wl.quantity),
          rate: money(l.rate),
          prevQty: dec(l.prevQty),
          thisQty: dec(l.thisQty),
          uptoQty: dec(l.uptoQty),
          prevAmount: money(prevAmount),
          amount: money(l.amount),
          uptoAmount: money(prevAmount.add(l.amount)),
          excessQty: excess.gt(0) ? dec(excess) : '0',
        };
      }),
      materials: r.materials.map((m) => ({ itemId: m.itemId, itemName: m.item.name, unit: m.item.unit, quantity: dec(m.quantity), rate: money(m.rate), amount: money(m.amount) })),
      status: r.status,
      submittedById: r.submittedById,
      submittedByName: r.submittedBy.fullName,
      submittedAt: iso(r.submittedAt),
      reviewedById: r.reviewedById,
      reviewedByName: r.reviewedBy?.fullName ?? null,
      reviewedAt: iso(r.reviewedAt),
      reviewNote: r.reviewNote,
      attachments: r.attachments.map((a) => this.attachments.toDto(a)),
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
    };
  }

  /** Billing roles, plus any role the approval matrix lets approve subcontractor bills. */
  private async assertCanSee(user: RequestUser) {
    if (canPrepareSubcontractBill(user.roleKey)) return;
    const rights = await this.rights.rightsFor(user);
    if (!rights.some((r) => r.type === 'SUBCONTRACT_BILL')) throw new ForbiddenException('Your role cannot see subcontractor bills');
  }

  private async assertCanPrepare(user: RequestUser, projectId: string) {
    if (!canPrepareSubcontractBill(user.roleKey)) throw new ForbiddenException('Your role cannot prepare subcontractor bills');
    await this.access.assertCanAccessProject(user, projectId);
  }

  async list(user: RequestUser, q: ListSubcontractBillsQuery): Promise<Paginated<SubcontractBillDto>> {
    await this.assertCanSee(user);
    const where: Prisma.SubcontractBillWhereInput = { ...this.access.submissionWhere(user) };
    if (q.projectId) where.projectId = q.projectId;
    if (q.workOrderId) where.workOrderId = q.workOrderId;
    if (q.vendorId) where.workOrder = { vendorId: q.vendorId };
    if (q.status) where.status = q.status;
    if (q.mine) where.submittedById = user.id;
    const days = dateRange(q.from, q.to);
    if (days) where.billDate = days;
    const words = searchWords(q.q);
    if (words.length)
      where.AND = words.map((w) => ({
        OR: [
          { workOrder: { woNo: ilike(w) } },
          { workOrder: { title: ilike(w) } },
          { workOrder: { vendor: { name: ilike(w) } } },
          { project: { name: ilike(w) } },
          { invoiceNo: ilike(w) },
          { remarks: ilike(w) },
        ],
      }));
    const sortBy = q.sortBy ?? 'billDate';
    const order = q.sortOrder ?? (DESC_DEFAULT.has(sortBy) ? 'desc' : 'asc');
    const args = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.subcontractBill.findMany({ where, include, orderBy: [...ORDER[sortBy](order), { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.subcontractBill.count({ where }),
    ]);
    const kinds = await this.chargeKinds(user.organizationId);
    return paginated(rows.map((r) => this.toDto(r, kinds)), total, args);
  }

  async get(user: RequestUser, id: string): Promise<SubcontractBillDto> {
    await this.assertCanSee(user);
    const row = await this.prisma.subcontractBill.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include });
    if (!row) throw new NotFoundException('Subcontractor bill not found');
    const [sheets, issues, kinds, earlier, labourHold] = await Promise.all([
      this.prisma.measurementSheet.findMany({ where: { subcontractBillId: id }, include: { boqItem: { select: { itemNo: true, unit: true } } }, orderBy: [{ date: 'asc' }, { mbNo: 'asc' }] }),
      this.prisma.stockEntry.findMany({ where: { subcontractBillId: id }, select: { id: true, entryNo: true, date: true, _count: { select: { lines: true } } }, orderBy: [{ date: 'asc' }, { entryNo: 'asc' }] }),
      this.chargeKinds(user.organizationId),
      this.heldBefore(this.prisma, row.workOrderId, row.billNo),
      this.labour.forBill(user.organizationId, id),
    ]);
    return {
      ...this.toDto(row, kinds),
      retentionHeldBefore: earlier,
      labourHold,
      measurements: sheets.map((s) => ({ id: s.id, mbNo: s.mbNo, date: dateOnly(s.date), boqItemNo: s.boqItem.itemNo, unit: s.boqItem.unit, location: s.location, totalQty: dec(s.totalQty) })),
      issues: issues.map((e) => ({ id: e.id, entryNo: e.entryNo, date: dateOnly(e.date), lines: e._count.lines })),
    };
  }

  /**
   * Re-take the bill's measurements and issues and re-price it with the work order's current rates and terms. Only for a
   * bill that is not approved. `own` sets the quantities of the order's own items (others keep what the bill had);
   * `strict` refuses a bill with nothing in it.
   */
  private async recompute(tx: Tx, id: string, own?: OwnItemQtyInput[], strict = true) {
    const bill = await tx.subcontractBill.findUniqueOrThrow({
      where: { id },
      include: { lines: true, workOrder: { include: { lines: { orderBy: { sortOrder: 'asc' } }, vendor: { select: { name: true, msmeCategory: true } } } } },
    });
    const wo = bill.workOrder;
    const ownQty = new Map(bill.lines.map((l) => [l.workOrderLineId, l.thisQty]));
    for (const o of own ?? []) {
      const line = wo.lines.find((l) => l.id === o.workOrderLineId);
      if (!line) throw new BadRequestException('A quantity is for a line that is not on this work order');
      if (line.boqItemId) throw new BadRequestException(`${line.description} is measured in the measurement book; its quantity comes from the approved measurements`);
      const q = D(o.quantity);
      if (q.lt(0)) throw new BadRequestException(`${line.description}: the quantity cannot be negative`);
      if (q.decimalPlaces() > 3) throw new BadRequestException(`${line.description}: use at most 3 decimals`);
      ownQty.set(line.id, q);
    }

    // Take what is approved up to the date and not in an earlier bill; a retention release bill takes no work.
    await tx.measurementSheet.updateMany({ where: { subcontractBillId: id }, data: { subcontractBillId: null } });
    await tx.stockEntry.updateMany({ where: { subcontractBillId: id }, data: { subcontractBillId: null } });
    await tx.excessMaterialRecovery.updateMany({ where: { subcontractBillId: id }, data: { subcontractBillId: null } });
    if (bill.isRelease) ownQty.clear();
    else {
      await tx.measurementSheet.updateMany({ where: { workOrderId: wo.id, status: 'APPROVED', subcontractBillId: null, date: { lte: bill.measuredUpTo } }, data: { subcontractBillId: id } });
      await tx.stockEntry.updateMany({ where: { workOrderId: wo.id, type: { in: ['ISSUE', 'RETURN_FROM_SITE'] }, subcontractBillId: null, date: { lte: bill.measuredUpTo } }, data: { subcontractBillId: id } });
      // Material used over the norm, raised from the reconciliation and not yet on a bill.
      await tx.excessMaterialRecovery.updateMany({ where: { workOrderId: wo.id, subcontractBillId: null }, data: { subcontractBillId: id } });
    }

    const earlier = { workOrderId: wo.id, billNo: { lt: bill.billNo } };
    const [measured, billed, issued, recovered, excess] = await Promise.all([
      tx.measurementSheet.groupBy({ by: ['boqItemId'], where: { workOrderId: wo.id, OR: [{ subcontractBillId: id }, { subcontractBill: earlier }] }, _sum: { totalQty: true } }),
      tx.subcontractBillLine.findMany({ where: { bill: earlier }, select: { workOrderLineId: true, thisQty: true, amount: true } }),
      tx.stockTxn.groupBy({ by: ['itemId'], where: { entry: { subcontractBillId: id } }, _sum: { quantity: true } }),
      tx.subcontractBill.aggregate({ where: earlier, _sum: { advanceRecoveryAmount: true } }),
      tx.excessMaterialRecovery.aggregate({ where: { subcontractBillId: id }, _sum: { amount: true } }),
    ]);
    const upto = new Map(measured.map((m) => [m.boqItemId, m._sum.totalQty ?? ZERO]));
    const lines = bill.isRelease ? [] : subBillLines(wo.lines, billed, upto, ownQty);

    // Material issued to them less what they brought back, at each item's current rate (the last approved PO rate, or as
    // set in the item master). A return of material an earlier bill recovered comes off as a credit.
    const items = issued.length ? await tx.item.findMany({ where: { id: { in: issued.map((m) => m.itemId) } }, select: { id: true, rate: true } }) : [];
    const materials = issued
      .map((m) => {
        const quantity = (m._sum.quantity ?? ZERO).neg();
        const rate = items.find((x) => x.id === m.itemId)?.rate ?? ZERO;
        return { itemId: m.itemId, quantity, rate, amount: round2(quantity.mul(rate)) };
      })
      .filter((m) => !m.quantity.isZero());

    const grossAmount = sum(lines, (l) => l.amount);
    const grossPrevious = sum(lines, (l) => l.prevAmount);
    const base = Prisma.Decimal.max(grossAmount, ZERO);
    // Recovered from what was actually paid against the order once an advance payment is on record.
    const advanceBase = await workOrderAdvanceBase(tx, wo);
    const outstanding = Prisma.Decimal.max(advanceBase.sub(recovered._sum.advanceRecoveryAmount ?? ZERO), ZERO);
    const materialRecovery = sum(materials, (m) => m.amount);
    const excessRecovery = excess._sum.amount ?? ZERO;
    const data = {
      grossPrevious,
      grossAmount,
      grossUpto: grossPrevious.add(grossAmount),
      gstRate: wo.gstRate,
      gstAmount: pctOf(base, wo.gstRate),
      retentionPct: wo.retentionPct,
      advanceRecoveryPct: wo.advanceRecoveryPct,
      tdsPct: wo.tdsPct,
      retentionAmount: pctOf(base, wo.retentionPct),
      advanceRecoveryAmount: Prisma.Decimal.min(pctOf(base, wo.advanceRecoveryPct), outstanding),
      tdsAmount: pctOf(base, wo.tdsPct),
      materialRecovery,
      excessRecovery,
      dueDate: addDays(bill.billDate, this.paymentDays(wo.paymentDays, wo.vendor.msmeCategory)),
    };
    const totalDeductions = data.retentionAmount.add(data.advanceRecoveryAmount).add(data.tdsAmount).add(materialRecovery).add(excessRecovery).add(bill.otherDeduction);
    // Retention paid back: never more than earlier bills kept and have not paid back.
    const held = await this.heldBefore(tx, wo.id, bill.billNo);
    const releaseProblem = retentionReleaseProblem(bill.retentionReleased.toFixed(2), held, bill.isRelease);
    if (releaseProblem) throw new BadRequestException(releaseProblem);
    if (bill.isRelease && bill.otherDeduction.gt(bill.retentionReleased)) throw new BadRequestException('Back-charges on a retention release bill cannot be more than the retention it pays back');
    if (strict && !bill.isRelease && grossAmount.lte(0) && materialRecovery.isZero() && excessRecovery.isZero() && bill.retentionReleased.isZero())
      throw new BadRequestException(
        'Nothing to bill: there are no approved measurements of their work up to this date beyond earlier bills, and no quantities for the work order’s own items',
      );
    await tx.subcontractBillLine.deleteMany({ where: { billId: id } });
    await tx.subcontractBillLine.createMany({ data: lines.map((l) => ({ ...l, billId: id })) });
    await tx.subcontractBillMaterial.deleteMany({ where: { billId: id } });
    if (materials.length) await tx.subcontractBillMaterial.createMany({ data: materials.map((m) => ({ ...m, billId: id })) });
    await tx.subcontractBill.update({ where: { id }, data: { ...data, totalDeductions, netPayable: grossAmount.add(data.gstAmount).sub(totalDeductions).add(bill.retentionReleased) } });
  }

  /** Retention the work order's bills before `billNo` kept and have not paid back. */
  private async heldBefore(db: Tx | PrismaService, workOrderId: string, billNo: number): Promise<string> {
    const bills = await db.subcontractBill.findMany({ where: { workOrderId, billNo: { lt: billNo }, status: 'APPROVED' }, select: { billNo: true, retentionAmount: true, retentionReleased: true } });
    return retentionHeld(bills.map((b) => ({ billNo: b.billNo, retentionAmount: money(b.retentionAmount), retentionReleased: money(b.retentionReleased) })));
  }

  /**
   * A bill's back-charges, replacing those it had: each a kind from the company's `backCharge` list (one already on the
   * bill stays allowed after the kind is switched off). Sets `otherDeduction` to their sum. An older client's single
   * other deduction comes in as one "Other" charge.
   */
  private async setCharges(tx: Tx, user: RequestUser, id: string, dto: { charges?: BackChargeInput[]; otherDeduction?: string; otherDeductionNote?: string | null }) {
    let charges = dto.charges;
    if (charges === undefined && dto.otherDeduction !== undefined) {
      const v = this.parseOther(dto.otherDeduction);
      charges = v.isZero() ? [] : [{ kindCode: BACK_CHARGE_OTHER, amount: v.toFixed(2), note: dto.otherDeductionNote?.trim() || SUB_BILL_DEDUCTION_LABELS.other }];
    }
    if (charges === undefined) return;
    const had = await tx.subcontractBillCharge.findMany({ where: { billId: id }, select: { kindCode: true } });
    const kinds = new Set([...[...(await this.chargeKinds(user.organizationId)).values()].filter((k) => k.isActive).map((k) => k.code), ...had.map((h) => h.kindCode)]);
    const problem = backChargesProblem(charges, kinds);
    if (problem) throw new BadRequestException(problem);
    await tx.subcontractBillCharge.deleteMany({ where: { billId: id } });
    if (charges.length) await tx.subcontractBillCharge.createMany({ data: charges.map((c, i) => ({ billId: id, kindCode: c.kindCode, amount: D(c.amount), note: c.note?.trim() || null, sortOrder: i })) });
    await tx.subcontractBill.update({ where: { id }, data: { otherDeduction: D(backChargesTotal(charges)), otherDeductionNote: null } });
  }

  /**
   * After a recovery is raised or cancelled on a work order: re-take the bill being prepared on it, if one
   * can still be edited, so the recovery shows on it now. Returns that bill's id, or null when none was re-taken.
   */
  async retakeOpenBill(workOrderId: string): Promise<string | null> {
    const open = await this.prisma.subcontractBill.findFirst({ where: { workOrderId, status: { in: ['DRAFT', 'CHANGES_REQUESTED', 'REJECTED'] } }, select: { id: true } });
    if (!open) return null;
    await this.prisma.$transaction((tx) => this.recompute(tx, open.id, undefined, false));
    return open.id;
  }

  /** Days to pay: the work order's, or 30; never more than 45 for micro and small enterprises. */
  private paymentDays(days: number | null, msme: string | null) {
    const d = days ?? DEFAULT_PAYMENT_DAYS;
    return msme === 'MICRO' || msme === 'SMALL' ? Math.min(d, MSME_MAX_PAYMENT_DAYS) : d;
  }

  private checkDates(billDate: string, measuredUpTo: string) {
    checkNotFuture(billDate, 'bill date');
    if (measuredUpTo > billDate) throw new BadRequestException('Work can only be billed up to the bill date');
  }

  private parseRelease(raw: string) {
    const v = D(raw);
    if (v.lt(0)) throw new BadRequestException('The retention to release cannot be negative');
    if (v.decimalPlaces() > 2) throw new BadRequestException('Enter the retention to release in rupees and paise');
    return v;
  }

  private parseOther(raw: string) {
    const v = D(raw);
    if (v.lt(0)) throw new BadRequestException('The other deduction cannot be negative');
    return round2(v);
  }

  private async findExisting(user: RequestUser, id: string | undefined) {
    if (!id) return null;
    const row = await this.prisma.subcontractBill.findFirst({ where: { id, organizationId: user.organizationId }, select: { id: true } });
    return row ? this.get(user, row.id) : null;
  }

  async create(user: RequestUser, dto: CreateSubcontractBillDto): Promise<SubcontractBillDto> {
    const existing = await this.findExisting(user, dto.id);
    if (existing) return existing;
    const wo = await this.prisma.workOrder.findFirst({ where: { id: dto.workOrderId, organizationId: user.organizationId }, select: { id: true, woNo: true, projectId: true, status: true, closedAt: true } });
    if (!wo) throw new NotFoundException('Work order not found');
    await this.assertCanPrepare(user, wo.projectId);
    if (wo.status !== 'APPROVED') throw new ConflictException(`${wo.woNo} is not approved yet`);
    // Retention is paid back after the final bill and once the order is closed, at the end of the defects period.
    const release = !!dto.isRelease;
    if (wo.closedAt && !release) throw new ConflictException(`${wo.woNo} is closed`);
    const measuredUpTo = release ? dto.billDate : (dto.measuredUpTo ?? dto.billDate);
    this.checkDates(dto.billDate, measuredUpTo);
    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`SB:${wo.id}`}))`;
        const bills = await tx.subcontractBill.findMany({ where: { workOrderId: wo.id }, select: { billNo: true, isFinal: true, status: true, measuredUpTo: true }, orderBy: { billNo: 'desc' } });
        const open = bills.find((b) => b.status !== 'APPROVED');
        if (open) throw new ConflictException(`Bill ${open.billNo} on ${wo.woNo} is not approved yet. Finish or delete it before preparing the next one.`);
        if (!release && bills.some((b) => b.isFinal)) throw new ConflictException(`The final bill on ${wo.woNo} has already been made`);
        const last = bills[0];
        if (last && dateOnly(last.measuredUpTo) > measuredUpTo)
          throw new BadRequestException(release ? `Date the release on or after ${dateOnly(last.measuredUpTo)}, the day bill ${last.billNo} took work up to` : `Bill ${last.billNo} already took work up to ${dateOnly(last.measuredUpTo)}`);
        const row = await tx.subcontractBill.create({
          data: {
            id: dto.id,
            organizationId: user.organizationId,
            projectId: wo.projectId,
            workOrderId: wo.id,
            billNo: (last?.billNo ?? 0) + 1,
            isFinal: release ? false : !!dto.isFinal,
            isRelease: release,
            billDate: parseDate(dto.billDate),
            measuredUpTo: parseDate(measuredUpTo),
            retentionReleased: this.parseRelease(dto.retentionRelease ?? '0'),
            invoiceNo: dto.invoiceNo || null,
            dueDate: parseDate(dto.billDate),
            remarks: dto.remarks || null,
            ...Object.fromEntries(
              [
                'grossPrevious',
                'grossAmount',
                'grossUpto',
                'gstRate',
                'gstAmount',
                'retentionPct',
                'advanceRecoveryPct',
                'tdsPct',
                'retentionAmount',
                'advanceRecoveryAmount',
                'tdsAmount',
                'materialRecovery',
                'totalDeductions',
                'netPayable',
              ].map((k) => [k, ZERO]),
            ),
            submittedById: user.id,
            status: 'DRAFT',
          } as Prisma.SubcontractBillUncheckedCreateInput,
          select: { id: true },
        });
        await this.setCharges(tx, user, row.id, dto);
        await this.recompute(tx, row.id, dto.quantities);
        return row.id;
      });
    } catch (e) {
      if (isUniqueViolation(e) && dto.id) {
        const winner = await this.findExisting(user, dto.id);
        if (winner) return winner;
      }
      throw e;
    }
    await this.attachments.link(user, 'subcontractBillId', id, dto.attachmentIds);
    await this.audit.log(user, 'SUBCONTRACT_BILL', id, 'CREATED');
    if (dto.submit) await this.lifecycle.submit(user, 'SUBCONTRACT_BILL', id);
    return this.get(user, id);
  }

  async update(user: RequestUser, id: string, dto: UpdateSubcontractBillDto): Promise<SubcontractBillDto> {
    const row = await this.lifecycle.load(user, 'SUBCONTRACT_BILL', id);
    await this.assertCanPrepare(user, row.projectId);
    await this.lifecycle.assertEditable(user, row);
    const cur = await this.prisma.subcontractBill.findUniqueOrThrow({ where: { id }, select: { billDate: true, measuredUpTo: true, billNo: true, workOrderId: true, isRelease: true } });
    const billDate = dto.billDate ?? dateOnly(cur.billDate);
    const measuredUpTo = dto.measuredUpTo ?? dateOnly(cur.measuredUpTo);
    this.checkDates(billDate, measuredUpTo);
    const data: Prisma.SubcontractBillUncheckedUpdateInput = {};
    if (dto.billDate !== undefined) data.billDate = parseDate(dto.billDate);
    if (dto.measuredUpTo !== undefined) {
      const before = await this.prisma.subcontractBill.findFirst({ where: { workOrderId: cur.workOrderId, billNo: cur.billNo - 1 }, select: { measuredUpTo: true } });
      if (before && dateOnly(before.measuredUpTo) > measuredUpTo) throw new BadRequestException(`Bill ${cur.billNo - 1} already took work up to ${dateOnly(before.measuredUpTo)}`);
      data.measuredUpTo = parseDate(dto.measuredUpTo);
    }
    if (dto.isFinal !== undefined && !cur.isRelease) data.isFinal = dto.isFinal;
    if (dto.invoiceNo !== undefined) data.invoiceNo = dto.invoiceNo || null;
    if (dto.retentionRelease !== undefined) data.retentionReleased = this.parseRelease(dto.retentionRelease);
    if (dto.remarks !== undefined) data.remarks = dto.remarks || null;
    await this.prisma.$transaction(async (tx) => {
      await tx.subcontractBill.update({ where: { id }, data });
      await this.setCharges(tx, user, id, dto);
      await this.recompute(tx, id, dto.quantities);
    });
    await this.attachments.sync(user, 'subcontractBillId', id, dto.attachmentIds);
    await this.audit.log(user, 'SUBCONTRACT_BILL', id, 'UPDATED');
    if (dto.submit) await this.lifecycle.submit(user, 'SUBCONTRACT_BILL', id);
    return this.get(user, id);
  }

  /** Re-takes what was approved or issued since the bill was prepared, then submits it. */
  async submit(user: RequestUser, id: string) {
    const row = await this.lifecycle.load(user, 'SUBCONTRACT_BILL', id);
    await this.assertCanPrepare(user, row.projectId);
    await this.lifecycle.assertEditable(user, row);
    await this.prisma.$transaction((tx) => this.recompute(tx, id));
    await this.lifecycle.submit(user, 'SUBCONTRACT_BILL', id);
    return this.get(user, id);
  }

  async remove(user: RequestUser, id: string) {
    const row = await this.lifecycle.load(user, 'SUBCONTRACT_BILL', id);
    await this.assertCanPrepare(user, row.projectId);
    if (row.status === 'APPROVED') throw new BadRequestException('An approved bill cannot be deleted');
    await this.lifecycle.assertEditable(user, row);
    await this.prisma.subcontractBill.delete({ where: { id } });
    await this.audit.log(user, 'SUBCONTRACT_BILL', id, 'DELETED');
    return { ok: true };
  }
}
