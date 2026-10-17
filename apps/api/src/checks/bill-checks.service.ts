import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { BillCheckDto, BillChecksDto, BillCheckSummaryDto, CheckKind, SubmissionType } from '@erp/shared';
import { gstinChecksumOk } from '@erp/shared';
import type { RequestUser } from '../common/current-user';
import { AuditService } from '../common/audit.service';
import { ProjectAccessService } from '../common/project-access.service';
import { dateOnly } from '../common/serialize';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { VendorBillsService } from '../purchasing/vendor-bills.service';
import { SubcontractBillsService } from '../subcontracts/subcontract-bills.service';
import { ExpensesService } from '../expenses/expenses.service';
import { RaBillsService } from '../ra-bills/ra-bills.service';
import { type Check, type Link, expenseChecks, raBillChecks, rulesSummary, subcontractBillChecks, vendorBillChecks } from './bill-rules';

const TYPE_OF: Record<CheckKind, SubmissionType> = { 'vendor-bill': 'VENDOR_BILL', 'subcontract-bill': 'SUBCONTRACT_BILL', expense: 'EXPENSE', 'ra-bill': 'BILL' };
const n = (d: Prisma.Decimal | null | undefined) => (d ? d.toNumber() : 0);
/** Invoice numbers as people type them: "INV-884", "inv 884" and "INV/884" are the same invoice. */
const norm = (s: string | null | undefined) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const notRejected = { status: { not: 'REJECTED' as const } };

interface Loaded {
  type: SubmissionType;
  projectId: string;
  status: string;
  label: string;
  checks: Check[];
}

/**
 * Checks on a bill before it is approved (AI roadmap item 69): plain rules in `bill-rules.ts` over the bill and what it
 * should agree with, flags an approver may accept with a note, and one line on top that the model writes when Ask
 * Nirmaan is on (cached per set of open flags), else the rules do.
 */
@Injectable()
export class BillChecksService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private ai: AiService,
    private vendorBills: VendorBillsService,
    private subBills: SubcontractBillsService,
    private expenses: ExpensesService,
    private raBills: RaBillsService,
  ) {}

  async get(user: RequestUser, kind: CheckKind, id: string): Promise<BillChecksDto> {
    const bill = await this.load(user, kind, id);
    const checks = await this.withAcceptances(user, kind, id, bill.checks);
    const open = checks.filter((c) => !c.ok && !c.accepted);
    const cached = open.length ? await this.prisma.billCheckSummary.findUnique({ where: { kind_billId_fingerprint: { kind, billId: id, fingerprint: fingerprint(open) } } }) : null;
    const aiOn = open.length > 0 && !cached && (await this.ai.status(user)).enabled;
    return {
      kind,
      id,
      checks,
      openFlags: open.length,
      summary: cached?.text ?? rulesSummary(checks),
      summaryBy: cached?.model ? 'ai' : 'rules',
      aiSummaryPending: aiOn,
      canAccept: await this.canAccept(user, bill, id),
    };
  }

  /** The model's line for the bill's open flags: written once per set of flags, then read back. */
  async summary(user: RequestUser, kind: CheckKind, id: string): Promise<BillCheckSummaryDto> {
    const bill = await this.load(user, kind, id);
    const checks = await this.withAcceptances(user, kind, id, bill.checks);
    const open = checks.filter((c) => !c.ok && !c.accepted);
    const draft = rulesSummary(checks);
    if (!open.length) return { summary: draft, summaryBy: 'rules' };
    const key = { kind_billId_fingerprint: { kind, billId: id, fingerprint: fingerprint(open) } };
    const cached = await this.prisma.billCheckSummary.findUnique({ where: key });
    if (cached) return { summary: cached.text, summaryBy: cached.model ? 'ai' : 'rules' };
    const facts = {
      bill: bill.label,
      flags: checks.filter((c) => !c.ok).map((c) => ({ title: c.title, detail: c.detail, accepted: !!c.accepted })),
      passed: checks.filter((c) => c.ok).map((c) => c.title),
    };
    const written = await this.ai.checkSummary(user, facts, draft);
    if (!written) return { summary: draft, summaryBy: 'rules' };
    const row = await this.prisma.billCheckSummary
      .create({ data: { organizationId: user.organizationId, ...key.kind_billId_fingerprint, text: written.text, model: written.model, costPaise: written.costPaise } })
      .catch(async (e) => {
        // Two people opened the bill at once; the first line stands.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return this.prisma.billCheckSummary.findUniqueOrThrow({ where: key });
        throw e;
      });
    return { summary: row.text, summaryBy: row.model ? 'ai' : 'rules' };
  }

  async accept(user: RequestUser, kind: CheckKind, id: string, key: string, note: string): Promise<BillChecksDto> {
    const bill = await this.load(user, kind, id);
    if (!(await this.canAccept(user, bill, id))) throw new ForbiddenException('Only someone who can approve this bill may accept a flag, while it waits for approval');
    const check = bill.checks.find((c) => c.key === key);
    if (!check || check.ok) throw new BadRequestException('That flag is no longer raised on this bill; reload it');
    const text = note.trim();
    if (text.length < 3) throw new BadRequestException('Say why the flag is accepted');
    try {
      await this.prisma.billCheckAcceptance.create({ data: { organizationId: user.organizationId, kind, billId: id, checkKey: key, note: text, acceptedById: user.id } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('This flag is already accepted');
      throw e;
    }
    await this.audit.log(user, bill.type, id, 'CHECK_ACCEPTED', `${check.title}: ${text}`);
    return this.get(user, kind, id);
  }

  async unaccept(user: RequestUser, kind: CheckKind, id: string, key: string): Promise<BillChecksDto> {
    const bill = await this.load(user, kind, id);
    if (!(await this.canAccept(user, bill, id))) throw new ForbiddenException('Only someone who can approve this bill may change an accepted flag, while it waits for approval');
    const row = await this.prisma.billCheckAcceptance.findUnique({ where: { kind_billId_checkKey: { kind, billId: id, checkKey: key } } });
    if (!row || row.organizationId !== user.organizationId) throw new NotFoundException('That flag is not accepted');
    await this.prisma.billCheckAcceptance.delete({ where: { id: row.id } });
    const title = bill.checks.find((c) => c.key === key)?.title ?? key;
    await this.audit.log(user, bill.type, id, 'CHECK_REOPENED', title);
    return this.get(user, kind, id);
  }

  /** The rules' results for a bill, as the given user (their own access to the bill applies). For the demo-data check. */
  async checksOf(user: RequestUser, kind: CheckKind, id: string): Promise<Check[]> {
    return (await this.load(user, kind, id)).checks;
  }

  private async canAccept(user: RequestUser, bill: Loaded, id: string): Promise<boolean> {
    if (bill.status !== 'SUBMITTED' || user.support) return false;
    return this.access.assertCanApproveSubmission(user, bill.type, id, bill.projectId).then(
      () => true,
      () => false,
    );
  }

  private async withAcceptances(user: RequestUser, kind: CheckKind, id: string, checks: Check[]): Promise<BillCheckDto[]> {
    const rows = await this.prisma.billCheckAcceptance.findMany({ where: { organizationId: user.organizationId, kind, billId: id }, include: { acceptedBy: { select: { fullName: true } } } });
    const by = new Map(rows.map((r) => [r.checkKey, r]));
    return checks.map((c) => {
      const a = c.ok ? undefined : by.get(c.key);
      return { ...c, accepted: a ? { note: a.note, byName: a.acceptedBy.fullName, at: a.createdAt.toISOString() } : null };
    });
  }

  /** The bill through its own service (so its access rules apply), then the facts its rules need. */
  private load(user: RequestUser, kind: CheckKind, id: string): Promise<Loaded> {
    switch (kind) {
      case 'vendor-bill':
        return this.vendorBill(user, id);
      case 'subcontract-bill':
        return this.subcontractBill(user, id);
      case 'expense':
        return this.expense(user, id);
      case 'ra-bill':
        return this.raBill(user, id);
    }
  }

  private async vendorBill(user: RequestUser, id: string): Promise<Loaded> {
    const dto = await this.vendorBills.get(user, id);
    const bill = await this.prisma.vendorBill.findFirstOrThrow({
      where: { id, organizationId: user.organizationId },
      include: { vendor: { select: { gstin: true } }, purchaseOrder: { include: { lines: true } }, lines: { orderBy: { sortOrder: 'asc' } } },
    });
    const po = bill.purchaseOrder;
    // A bill is checked against the ones entered before it: the later copy is the one flagged.
    const before = { createdAt: { lt: bill.createdAt } };
    const lineIds = bill.lines.map((l) => l.purchaseOrderLineId);
    const [txns, others, otherFreight, dupBills, dupExpenses] = await Promise.all([
      this.prisma.stockTxn.findMany({ where: { purchaseOrderLineId: { in: lineIds } }, include: { entry: { select: { id: true, entryNo: true, type: true } } } }),
      this.prisma.vendorBillLine.findMany({ where: { purchaseOrderLineId: { in: lineIds }, billId: { not: id }, bill: { ...notRejected, ...before } }, include: { bill: { select: { id: true, billNo: true } } } }),
      this.prisma.vendorBill.aggregate({ where: { purchaseOrderId: po.id, id: { not: id }, ...notRejected, ...before }, _sum: { freight: true } }),
      this.prisma.vendorBill.findMany({
        where: { organizationId: user.organizationId, id: { not: id }, ...notRejected, ...before, OR: [{ vendorId: bill.vendorId }, ...(bill.vendor.gstin ? [{ vendor: { gstin: bill.vendor.gstin } }] : [])] },
        select: { id: true, billNo: true, invoiceNo: true },
      }),
      bill.vendor.gstin
        ? this.prisma.expense.findMany({ where: { organizationId: user.organizationId, ...notRejected, ...before, OR: [{ vendorGstin: bill.vendor.gstin }, { vendorId: bill.vendorId }], billNo: { not: null } }, select: { id: true, expenseNo: true, billNo: true } })
        : this.prisma.expense.findMany({ where: { organizationId: user.organizationId, ...notRejected, ...before, vendorId: bill.vendorId, billNo: { not: null } }, select: { id: true, expenseNo: true, billNo: true } }),
    ]);
    const invoice = norm(bill.invoiceNo);
    const duplicates: Link[] = [
      ...dupBills.filter((b) => norm(b.invoiceNo) === invoice).map((b) => ({ label: b.billNo, href: `/vendor-bills/${b.id}` })),
      ...dupExpenses.filter((x) => norm(x.billNo) === invoice).map((x) => ({ label: x.expenseNo, href: `/expenses/${x.id}` })),
    ];
    const checks = vendorBillChecks({
      invoiceNo: bill.invoiceNo,
      freight: n(bill.freight),
      poFreightLeft: n(po.freight) - n(otherFreight._sum.freight),
      subtotal: n(bill.subtotal),
      gstAmount: n(bill.gstAmount),
      total: n(bill.total),
      duplicates,
      lines: bill.lines.map((l, i) => {
        const pl = po.lines.find((x) => x.id === l.purchaseOrderLineId)!;
        const mine = txns.filter((t) => t.purchaseOrderLineId === pl.id);
        const receipts = new Map<string, Link & { qty: number }>();
        for (const t of mine.filter((t) => t.entry.type === 'RECEIPT')) {
          const r = receipts.get(t.entry.id) ?? { label: t.entry.entryNo, href: `/purchase-orders/${po.id}`, qty: 0 };
          r.qty += n(t.quantity);
          receipts.set(t.entry.id, r);
        }
        const elsewhere = new Map<string, Link & { qty: number }>();
        for (const o of others.filter((o) => o.purchaseOrderLineId === pl.id)) {
          const b = elsewhere.get(o.bill.id) ?? { label: o.bill.billNo, href: `/vendor-bills/${o.bill.id}`, qty: 0 };
          b.qty += n(o.quantity);
          elsewhere.set(o.bill.id, b);
        }
        return {
          id: l.id,
          no: i + 1,
          item: pl.itemName,
          unit: pl.unit,
          qty: n(l.quantity),
          rate: n(l.rate),
          gstRate: n(l.gstRate),
          amount: n(l.amount),
          gstAmount: n(l.gstAmount),
          poRate: n(pl.rate),
          poGstRate: n(pl.gstRate),
          received: mine.reduce((s, t) => s + n(t.quantity), 0),
          receipts: [...receipts.values()],
          billedElsewhere: [...elsewhere.values()].reduce((s, b) => s + b.qty, 0),
          otherBills: [...elsewhere.values()],
        };
      }),
    });
    return { type: 'VENDOR_BILL', projectId: dto.projectId, status: dto.status, label: `${dto.billNo}, invoice ${dto.invoiceNo} of ${dto.vendorName}, total ${dto.total}`, checks };
  }

  private async subcontractBill(user: RequestUser, id: string): Promise<Loaded> {
    const dto = await this.subBills.get(user, id);
    const bill = await this.prisma.subcontractBill.findFirstOrThrow({
      where: { id, organizationId: user.organizationId },
      include: { workOrder: { select: { id: true, woNo: true, vendorId: true } }, lines: { include: { workOrderLine: true }, orderBy: { sortOrder: 'asc' } } },
    });
    const earlier = { workOrderId: bill.workOrderId, billNo: { lt: bill.billNo } };
    const [billed, measured, dupBills] = await Promise.all([
      this.prisma.subcontractBillLine.groupBy({ by: ['workOrderLineId'], where: { bill: earlier }, _sum: { thisQty: true } }),
      this.prisma.measurementSheet.groupBy({ by: ['boqItemId'], where: { workOrderId: bill.workOrderId, OR: [{ subcontractBillId: id }, { subcontractBill: earlier }] }, _sum: { totalQty: true } }),
      bill.invoiceNo
        ? this.prisma.subcontractBill.findMany({ where: { organizationId: user.organizationId, id: { not: id }, ...notRejected, createdAt: { lt: bill.createdAt }, workOrder: { vendorId: bill.workOrder.vendorId }, invoiceNo: { not: null } }, include: { workOrder: { select: { woNo: true } } } })
        : Promise.resolve([]),
    ]);
    const checks = subcontractBillChecks({
      invoiceNo: bill.invoiceNo,
      duplicates: dupBills.filter((b) => norm(b.invoiceNo) === norm(bill.invoiceNo)).map((b) => ({ label: `${b.workOrder.woNo} bill ${b.billNo}`, href: `/subcontract-bills/${b.id}` })),
      lines: bill.lines.map((l, i) => ({
        id: l.id,
        no: i + 1,
        description: l.workOrderLine.description,
        unit: l.workOrderLine.unit,
        rate: n(l.rate),
        woRate: n(l.workOrderLine.rate),
        woQty: n(l.workOrderLine.quantity),
        prevQty: n(l.prevQty),
        thisQty: n(l.thisQty),
        uptoQty: n(l.uptoQty),
        amount: n(l.amount),
        earlierBilled: n(billed.find((b) => b.workOrderLineId === l.workOrderLineId)?._sum.thisQty),
        measuredToDate: l.workOrderLine.boqItemId ? n(measured.find((m) => m.boqItemId === l.workOrderLine.boqItemId)?._sum.totalQty) : null,
      })),
      grossAmount: n(bill.grossAmount),
      gstRate: n(bill.gstRate),
      gstAmount: n(bill.gstAmount),
      retentionPct: n(bill.retentionPct),
      retentionAmount: n(bill.retentionAmount),
      advanceRecoveryPct: n(bill.advanceRecoveryPct),
      advanceRecoveryAmount: n(bill.advanceRecoveryAmount),
      tdsPct: n(bill.tdsPct),
      tdsAmount: n(bill.tdsAmount),
      materialRecovery: n(bill.materialRecovery),
      otherDeduction: n(bill.otherDeduction),
      totalDeductions: n(bill.totalDeductions),
      netPayable: n(bill.netPayable),
    });
    return { type: 'SUBCONTRACT_BILL', projectId: dto.projectId, status: dto.status, label: `${bill.workOrder.woNo} bill ${bill.billNo}, gross ${bill.grossAmount.toFixed(2)}`, checks };
  }

  private async raBill(user: RequestUser, id: string): Promise<Loaded> {
    const dto = await this.raBills.get(user, id);
    const bill = await this.prisma.raBill.findFirstOrThrow({ where: { id, organizationId: user.organizationId }, include: { items: { include: { boqItem: true }, orderBy: { sortOrder: 'asc' } } } });
    const earlier = { projectId: bill.projectId, billNo: { lt: bill.billNo } };
    const [billed, measured] = await Promise.all([
      this.prisma.raBillItem.findMany({ where: { bill: earlier }, select: { boqItemId: true, thisQty: true, certifiedQty: true } }),
      this.prisma.measurementSheet.groupBy({ by: ['boqItemId'], where: { OR: [{ raBillId: id }, { raBill: earlier }] }, _sum: { totalQty: true } }),
    ]);
    const prev = new Map<string, number>();
    for (const b of billed) prev.set(b.boqItemId, (prev.get(b.boqItemId) ?? 0) + n(b.certifiedQty ?? b.thisQty));
    const checks = raBillChecks({
      items: bill.items.map((i) => ({
        id: i.id,
        itemNo: i.boqItem.itemNo,
        unit: i.boqItem.unit,
        boqQty: n(i.boqItem.revisedQty ?? i.boqItem.originalQty),
        rate: n(i.rate),
        boqRate: n(i.boqItem.rate),
        prevQty: n(i.prevQty),
        thisQty: n(i.thisQty),
        uptoQty: n(i.uptoQty),
        certifiedQty: i.certifiedQty === null ? null : n(i.certifiedQty),
        amount: n(i.amount),
        earlierBilled: prev.get(i.boqItemId) ?? 0,
        measuredToDate: n(measured.find((m) => m.boqItemId === i.boqItemId)?._sum.totalQty),
      })),
      grossAmount: n(bill.grossAmount),
      pvAmount: n(bill.pvAmount),
      gstRate: n(bill.gstRate),
      gstAmount: n(bill.gstAmount),
      deductions: [
        { label: 'Retention', pct: n(bill.retentionPct), amount: n(bill.retentionAmount) },
        { label: 'Security deposit', pct: n(bill.securityDepositPct), amount: n(bill.securityDepositAmount) },
        { label: 'Advance recovery', pct: n(bill.advanceRecoveryPct), amount: n(bill.advanceRecoveryAmount), capped: true },
        { label: 'TDS', pct: n(bill.tdsPct), amount: n(bill.tdsAmount) },
        { label: 'GST TDS', pct: n(bill.gstTdsPct), amount: n(bill.gstTdsAmount) },
        { label: 'Labour cess', pct: n(bill.labourCessPct), amount: n(bill.labourCessAmount) },
      ],
      otherDeduction: n(bill.otherDeduction),
      totalDeductions: n(bill.totalDeductions),
      netPayable: n(bill.netPayable),
    });
    return { type: 'BILL', projectId: dto.projectId, status: dto.status, label: `${dto.billLabel} of ${dto.projectName}, gross ${bill.grossAmount.toFixed(2)}`, checks };
  }

  private async expense(user: RequestUser, id: string): Promise<Loaded> {
    const dto = await this.expenses.get(user, id);
    const x = await this.prisma.expense.findFirstOrThrow({ where: { id, organizationId: user.organizationId } });
    const vendorName = norm(x.vendor);
    const sameVendor: Prisma.ExpenseWhereInput[] = [
      ...(x.vendorId ? [{ vendorId: x.vendorId }] : []),
      ...(x.vendorGstin ? [{ vendorGstin: x.vendorGstin }] : []),
      ...(x.vendor ? [{ vendor: { equals: x.vendor.trim(), mode: 'insensitive' as const } }] : []),
    ];
    const [others, bills] = await Promise.all([
      sameVendor.length
        ? this.prisma.expense.findMany({ where: { organizationId: user.organizationId, id: { not: id }, ...notRejected, createdAt: { lt: x.createdAt }, OR: sameVendor }, select: { id: true, expenseNo: true, billNo: true, date: true, totalAmount: true, projectId: true, vendor: true } })
        : Promise.resolve([]),
      x.billNo && (x.vendorGstin || x.vendorId)
        ? this.prisma.vendorBill.findMany({ where: { organizationId: user.organizationId, ...notRejected, createdAt: { lt: x.createdAt }, OR: [...(x.vendorId ? [{ vendorId: x.vendorId }] : []), ...(x.vendorGstin ? [{ vendor: { gstin: x.vendorGstin } }] : [])] }, select: { id: true, billNo: true, invoiceNo: true } })
        : Promise.resolve([]),
    ]);
    const bill = norm(x.billNo);
    const duplicates = [
      ...others.filter((o) => bill && norm(o.billNo) === bill).map((o) => ({ label: o.expenseNo, href: `/expenses/${o.id}`, sameBill: true })),
      ...bills.filter((b) => bill && norm(b.invoiceNo) === bill).map((b) => ({ label: b.billNo, href: `/vendor-bills/${b.id}`, sameBill: true })),
      // Without the same bill number: the same vendor, amount and day on the same project.
      ...others
        .filter((o) => !(bill && norm(o.billNo) === bill) && o.projectId === x.projectId && dateOnly(o.date) === dateOnly(x.date) && o.totalAmount.eq(x.totalAmount) && (!vendorName || norm(o.vendor) === vendorName))
        .map((o) => ({ label: o.expenseNo, href: `/expenses/${o.id}`, sameBill: false })),
    ];
    const checks = expenseChecks({
      amount: n(x.amount),
      gstRate: n(x.gstRate),
      gstAmount: n(x.gstAmount),
      totalAmount: n(x.totalAmount),
      paymentMode: x.paymentMode,
      vendorGstin: x.vendorGstin,
      gstinValid: x.vendorGstin ? gstinChecksumOk(x.vendorGstin) : null,
      billNo: x.billNo,
      duplicates,
    });
    return { type: 'EXPENSE', projectId: dto.projectId, status: dto.status, label: `${x.expenseNo}, ${x.description}, total ${x.totalAmount.toFixed(2)}`, checks };
  }
}

const fingerprint = (open: { key: string }[]) =>
  createHash('sha256')
    .update(open.map((c) => c.key).sort().join('\n'))
    .digest('hex')
    .slice(0, 32);
