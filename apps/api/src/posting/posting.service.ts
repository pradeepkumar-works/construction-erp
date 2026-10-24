import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DEBIT_NOTE_REASON_LABELS,
  EXPENSE_CATEGORY_LABELS,
  TALLY_FIXED_LEDGERS,
  gstStateCode,
  subBillLabel,
  tallyClientKey,
  tallyExpenseDefault,
  tallyExpenseKey,
  tallyLoanKey,
  loanLedgerName,
  PAYMENT_MODE_LABELS,
  tallyVendorKey,
  type ExpenseCategory,
  type TallyHeldDto,
  type VendorBillKind,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { dateOnly } from '../common/serialize';
import { bankCredit } from '../epc/epc-rules';
import { Lines, balanced, credits, debits, gstLines, isInterState, moneyLedger, type LedgerName, type Voucher } from '../tally/vouchers';

type Tx = Prisma.TransactionClient | PrismaService;
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const FIXED = new Map(TALLY_FIXED_LEDGERS.map((l) => [l.key, l]));
/**
 * The ledger a vendor bill's value is booked to: purchases for a PO bill, machine hire, repairs to machinery, or the
 * expense head of any other bill (v5 item 91).
 */
function billHead(b: { kind: VendorBillKind; expenseCategory: ExpenseCategory | null }): { key: string; fallback?: string } {
  if (b.kind === 'HIRE') return { key: 'MACHINE_HIRE' };
  if (b.kind === 'SERVICE') return { key: 'REPAIRS' };
  if (b.kind === 'OTHER') {
    const c = b.expenseCategory ?? 'OTHER';
    return { key: tallyExpenseKey(c), fallback: tallyExpenseDefault(c) };
  }
  return { key: 'PURCHASE' };
}
const DEFAULT_RECEIPT_LEDGER = { BILL: null, RETENTION_RELEASE: 'RETENTION_RECEIVABLE', DEPOSIT_RELEASE: 'DEPOSIT_RECEIVABLE' } as const;

/** The company's Tally settings that posting reads: its GST state and the ledger names it renamed. */
export interface PostingConfig {
  companyName: string | null;
  stateCode: string | null;
  costCentres: boolean;
  ledgers: Record<string, string>;
}

/** Tally takes what is not yet exported, in a date range; the books take every record. */
export interface PostingOptions {
  unexported: boolean;
  range?: { upTo: Date; from: Date | null };
}

const projectSelect = { id: true, code: true, name: true, clientId: true, clientName: true, exchangeRate: true, client: { select: { name: true } } } satisfies Prisma.ProjectSelect;
type ProjectRow = Prisma.ProjectGetPayload<{ select: typeof projectSelect }>;
/** The client ledger of a project: its client in the master, else the client name typed on the project. */
const clientOf = (p: ProjectRow) => (p.clientId ? { key: tallyClientKey(p.clientId), name: p.client!.name } : { key: `CLIENT_NAME:${p.clientName ?? p.name}`, name: p.clientName ?? p.name });
const raBillRef = (projectCode: string, billNo: number) => `RA/${projectCode}/${billNo}`;
export const shortId = (id: string) => id.replace(/-/g, '').slice(0, 8).toUpperCase();
/** The last day of a YYYY-MM month: the date a salary run is booked on. */
const monthEnd = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0));
const monthName = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1)).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export interface Built {
  vouchers: Voucher[];
  held: TallyHeldDto[];
  awaitingCertification: number;
}

/**
 * The posting service (v6 item 102): what each module's records become in the accounts, as vouchers of keyed ledger
 * lines. The Tally export sends them to Tally (each record once); the books keep them as their own vouchers. Approved
 * RA bills once the client certifies them are sales; money received against them (with what the client deducted) and
 * retention or deposit released are receipts; approved vendor bills are purchases; approved subcontractor bills are
 * journals that credit the subcontractor with the net payable and the deductions to their ledgers; payments to vendors
 * are payments; approved site expenses are payments out of cash or bank (or a journal to the vendor when on credit);
 * approved salary runs are journals and paid ones payments.
 */
@Injectable()
export class PostingService {
  async config(db: Tx, organizationId: string): Promise<PostingConfig> {
    const c = await db.tallyConfig.findUnique({ where: { organizationId } });
    return { companyName: c?.companyName ?? null, stateCode: c?.stateCode ?? null, costCentres: c?.costCentres ?? true, ledgers: (c?.ledgers as Record<string, string> | undefined) ?? {} };
  }

  namer(cfg: PostingConfig): LedgerName {
    return (key, fallback) => cfg.ledgers[key] ?? FIXED.get(key)?.name ?? (key.startsWith('EXPENSE:') ? tallyExpenseDefault(key.slice(8) as never) : (fallback ?? key));
  }

  /**
   * Every record that posts, as the vouchers it becomes (or held, with the reason): for Tally, those not yet exported and
   * dated in the range; for the books, all of them.
   */
  async build(db: Tx, organizationId: string, cfg: PostingConfig, opts: PostingOptions): Promise<Built> {
    const org = organizationId;
    const name = this.namer(cfg);
    const tally = opts.unexported;
    const open = { organizationId: org, ...(tally ? { tallyExportId: null } : {}) };
    const range = (field: string) => (opts.range ? { [field]: { lte: opts.range.upTo, ...(opts.range.from ? { gte: opts.range.from } : {}) } } : {});
    const [raBills, awaitingCertification, receipts, vendorBills, subBills, payments, expenses, debitNotes] = await Promise.all([
      db.raBill.findMany({ where: { ...open, status: 'APPROVED', stage: { in: ['CERTIFIED', 'PAID'] }, ...range('billDate') }, include: { project: { select: projectSelect } } }),
      db.raBill.count({ where: { ...open, status: 'APPROVED', stage: { in: ['NOT_SENT', 'SENT'] }, ...range('billDate') } }),
      db.receipt.findMany({ where: { ...open, ...range('receiptDate') }, include: { project: { select: projectSelect }, bill: { select: { id: true, billNo: true, tallyExportId: true } } } }),
      db.vendorBill.findMany({ where: { ...open, status: 'APPROVED', ...range('invoiceDate') }, include: { project: { select: projectSelect }, vendor: { select: { name: true, stateCode: true, gstin: true } } } }),
      db.subcontractBill.findMany({
        where: { ...open, status: 'APPROVED', ...range('billDate') },
        include: { project: { select: projectSelect }, workOrder: { select: { woNo: true, vendorId: true, vendor: { select: { name: true, stateCode: true, gstin: true } } } } },
      }),
      db.vendorPayment.findMany({
        where: { ...open, ...range('paymentDate') },
        include: {
          project: { select: projectSelect },
          vendor: { select: { name: true } },
          vendorBill: { select: { invoiceNo: true } },
          subcontractBill: { select: { billNo: true, isFinal: true, workOrder: { select: { woNo: true } } } },
          purchaseOrder: { select: { poNo: true } },
          workOrder: { select: { woNo: true } },
          paymentRequest: { select: { requestNo: true } },
        },
      }),
      db.expense.findMany({ where: { ...open, status: 'APPROVED', ...range('date') }, include: { project: { select: projectSelect } } }),
      db.debitNote.findMany({
        where: { ...open, cancelledAt: null, ...range('date') },
        include: {
          project: { select: projectSelect },
          vendor: { select: { name: true, stateCode: true, gstin: true } },
          vendorBill: { select: { invoiceNo: true, kind: true, expenseCategory: true } },
          subcontractBill: { select: { billNo: true, isFinal: true, workOrder: { select: { woNo: true } } } },
        },
      }),
    ]);

    const vouchers: Voucher[] = [];
    const held: TallyHeldDto[] = [];
    const add = (v: Voucher) => {
      if (balanced(v.lines)) vouchers.push(v);
      else held.push({ kind: v.kind, sourceId: v.sourceId, date: dateOnly(v.date)!, number: v.number, party: v.party, reason: `Does not balance: debits ${debits(v.lines).toFixed(2)}, credits ${credits(v.lines).toFixed(2)}` });
    };
    const cc = { costCentre: true };

    // RA bills: Dr client (work + GST), Cr works receipts, Cr output GST. Works on a site are supplied where the site is,
    // which is where the contractor bills from, so GST is CGST + SGST.
    const exportedBills = new Set<string>();
    for (const b of raBills) {
      const client = clientOf(b.project);
      const ref = raBillRef(b.project.code, b.billNo);
      // Price variation is part of the sale: works receipts carry work value + price variation.
      const sale = b.grossAmount.add(b.pvAmount);
      const l = new Lines(name).dr(client.key, sale.add(b.gstAmount), { fallback: client.name, party: true }).cr('SALES', sale, cc);
      gstLines(l, 'cr', 'OUTPUT', b.gstAmount, false);
      exportedBills.add(b.id);
      add({
        kind: 'SALES',
        sourceId: b.id,
        date: b.billDate,
        number: ref,
        reference: b.certificateNo,
        party: client.name,
        projectId: b.project.id,
        projectCode: b.project.code,
        projectName: b.project.name,
        narration: `${b.omYear !== null ? `O&M bill ${b.billNo}` : `RA bill ${b.billNo}${b.isFinal ? ' (final)' : ''}`} of ${b.project.name}: ${b.omYear !== null ? 'operation and maintenance' : 'work'} ₹${b.grossAmount.toFixed(2)}${b.pvAmount.isZero() ? '' : ` + price variation ₹${b.pvAmount.toFixed(2)}`} + GST ₹${b.gstAmount.toFixed(2)}${b.certificateNo ? `, certificate ${b.certificateNo}` : ''}`,
        billRef: { name: ref, type: 'New Ref' },
        lines: l.lines,
      });
    }

    // Receipts: Dr bank or cash, Dr what the client deducted; Cr the client (or retention / deposit held, for releases).
    // A client in another currency (item 130) is credited at the contract rate; the bank takes what it credited at the
    // day's rate, and the difference is an exchange gain (Cr) or loss (Dr).
    for (const r of receipts) {
      const client = clientOf(r.project);
      const number = `RCPT/${shortId(r.id)}`;
      const ref = r.bill ? raBillRef(r.project.code, r.bill.billNo) : null;
      if (tally && r.bill && !r.bill.tallyExportId && !exportedBills.has(r.bill.id)) {
        held.push({ kind: 'RECEIPT', sourceId: r.id, date: dateOnly(r.receiptDate)!, number, party: client.name, reason: `Its RA bill ${r.bill.billNo} goes to Tally once the client certifies it` });
        continue;
      }
      const settled = [r.amount, r.tdsAmount, r.gstTdsAmount, r.retentionAmount, r.securityDepositAmount, r.advanceRecoveryAmount, r.labourCessAmount, r.otherDeduction].reduce((s, v) => s.add(v), D(0));
      const bank = bankCredit(r.amount, r.project.exchangeRate, r.exchangeRate);
      const exchange = bank.sub(r.amount);
      const l = new Lines(name)
        .dr(moneyLedger(r.mode), bank)
        .dr('EXCHANGE_DIFFERENCE', exchange.lt(0) ? exchange.neg() : D(0), cc)
        .dr('TDS_RECEIVABLE', r.tdsAmount)
        .dr('GST_TDS_RECEIVABLE', r.gstTdsAmount)
        .dr('RETENTION_RECEIVABLE', r.retentionAmount)
        .dr('DEPOSIT_RECEIVABLE', r.securityDepositAmount)
        .dr('CLIENT_ADVANCE', r.advanceRecoveryAmount)
        .dr('LABOUR_CESS', r.labourCessAmount, cc)
        .dr('CLIENT_DEDUCTIONS', r.otherDeduction, cc);
      const releaseKey = DEFAULT_RECEIPT_LEDGER[r.kind];
      if (releaseKey) l.cr(releaseKey, settled);
      else l.cr(client.key, settled, { fallback: client.name, party: true });
      if (exchange.gt(0)) l.cr('EXCHANGE_DIFFERENCE', exchange, cc);
      add({
        kind: 'RECEIPT',
        sourceId: r.id,
        date: r.receiptDate,
        number,
        reference: r.reference,
        party: client.name,
        projectId: r.project.id,
        projectCode: r.project.code,
        projectName: r.project.name,
        narration:
          r.kind === 'BILL'
            ? `Received against RA bill ${r.bill?.billNo} of ${r.project.name}${r.reference ? `, ${r.reference}` : ''}${r.otherDeductionNote ? `; deducted: ${r.otherDeductionNote}` : ''}`
            : `${r.kind === 'RETENTION_RELEASE' ? 'Retention' : 'Security deposit'} released on ${r.project.name}${r.reference ? `, ${r.reference}` : ''}`,
        billRef: ref ? { name: ref, type: 'Agst Ref' } : null,
        lines: l.lines,
      });
    }

    // Vendor bills: Dr purchases (machine hire, repairs or the expense head on a bill without a PO), freight and input
    // GST; Cr the vendor with the invoice total, less diesel recovered on a hire bill (Cr diesel recovered).
    for (const b of vendorBills) {
      const vendorState = gstStateCode(b.vendor.gstin) ?? b.vendor.stateCode;
      const l = new Lines(name);
      const head = billHead(b);
      l.dr(head.key, b.subtotal, { ...cc, fallback: head.fallback }).dr('FREIGHT', b.freight, cc);
      gstLines(l, 'dr', 'INPUT', b.gstAmount, isInterState(cfg.stateCode, vendorState));
      l.cr(tallyVendorKey(b.vendorId), b.total.sub(b.fuelRecovery), { fallback: b.vendor.name, party: true }).cr('FUEL_RECOVERY', b.fuelRecovery, cc);
      add({
        kind: 'PURCHASE',
        sourceId: b.id,
        date: b.invoiceDate,
        number: b.billNo,
        reference: b.invoiceNo,
        party: b.vendor.name,
        projectId: b.project.id,
        projectCode: b.project.code,
        projectName: b.project.name,
        narration: `Invoice ${b.invoiceNo} of ${b.vendor.name} for ${b.project.name} (${b.billNo})`,
        billRef: { name: b.invoiceNo, type: 'New Ref' },
        lines: l.lines,
      });
    }

    // Subcontractor bills: Dr subcontract charges and input GST; Cr the subcontractor with the net payable, and what
    // the bill kept back to its ledgers (retention, advance, TDS, material recovered, other).
    for (const b of subBills) {
      const v = b.workOrder.vendor;
      const label = subBillLabel(b.workOrder.woNo, b.billNo, b.isFinal);
      const l = new Lines(name).dr('SUBCONTRACT', b.grossAmount, cc);
      gstLines(l, 'dr', 'INPUT', b.gstAmount, isInterState(cfg.stateCode, gstStateCode(v.gstin) ?? v.stateCode));
      l.cr(tallyVendorKey(b.workOrder.vendorId), b.netPayable, { fallback: v.name, party: true })
        .cr('RETENTION_PAYABLE', b.retentionAmount)
        .cr('SUB_ADVANCE', b.advanceRecoveryAmount)
        .cr('TDS_PAYABLE', b.tdsAmount)
        .cr('MATERIAL_RECOVERY', b.materialRecovery.add(b.excessRecovery), cc)
        .cr('VENDOR_DEDUCTIONS', b.otherDeduction, cc);
      add({
        kind: 'SUBCONTRACT',
        sourceId: b.id,
        date: b.billDate,
        number: label,
        reference: b.invoiceNo,
        party: v.name,
        projectId: b.project.id,
        projectCode: b.project.code,
        projectName: b.project.name,
        narration: `${label} of ${v.name} on ${b.project.name}: work ₹${b.grossAmount.toFixed(2)}, measured up to ${dateOnly(b.measuredUpTo)}`,
        billRef: { name: label, type: 'New Ref' },
        lines: l.lines,
      });
    }

    // Debit notes (v5 item 91): Dr the party against the bill; Cr the head the bill was booked to and the input GST it
    // reverses.
    for (const n of debitNotes) {
      const label = n.vendorBill ? n.vendorBill.invoiceNo : n.subcontractBill ? subBillLabel(n.subcontractBill.workOrder.woNo, n.subcontractBill.billNo, n.subcontractBill.isFinal) : '';
      const head = n.vendorBill ? billHead(n.vendorBill) : { key: 'SUBCONTRACT', fallback: undefined };
      const l = new Lines(name).dr(tallyVendorKey(n.vendorId), n.total, { fallback: n.vendor.name, party: true }).cr(head.key, n.subtotal, { ...cc, fallback: head.fallback });
      gstLines(l, 'cr', 'INPUT', n.gstAmount, isInterState(cfg.stateCode, gstStateCode(n.vendor.gstin) ?? n.vendor.stateCode));
      add({
        kind: 'DEBIT_NOTE',
        sourceId: n.id,
        date: n.date,
        number: n.noteNo,
        reference: label,
        party: n.vendor.name,
        projectId: n.project.id,
        projectCode: n.project.code,
        projectName: n.project.name,
        narration: `${n.noteNo} to ${n.vendor.name} against ${label} (${DEBIT_NOTE_REASON_LABELS[n.reason].toLowerCase()})${n.remarks ? `: ${n.remarks}` : ''}`,
        billRef: { name: label, type: 'Agst Ref' },
        lines: l.lines,
      });
    }

    // Payments to vendors: Dr the vendor with what the payment settles; Cr bank or cash, TDS and other deductions. An
    // advance (v5 item 90) has no bill: it goes against the party ledger as an advance on the order, which Tally
    // sets off when the bill is booked. A site's fund request paid to a party (v6 item 107) is on account the same
    // way, against the request.
    for (const p of payments) {
      const number = `PAY/${shortId(p.id)}`;
      const advance = !p.vendorBill && !p.subcontractBill;
      const onAccount = advance && !p.purchaseOrder && !p.workOrder;
      const billName = p.vendorBill ? p.vendorBill.invoiceNo : p.subcontractBill ? subBillLabel(p.subcontractBill.workOrder.woNo, p.subcontractBill.billNo, p.subcontractBill.isFinal) : (p.purchaseOrder?.poNo ?? p.workOrder?.woNo ?? p.paymentRequest?.requestNo ?? '');
      const l = new Lines(name)
        .dr(tallyVendorKey(p.vendorId), p.amount.add(p.tdsAmount).add(p.otherDeduction), { fallback: p.vendor.name, party: true })
        .cr(moneyLedger(p.mode), p.amount)
        .cr('TDS_PAYABLE', p.tdsAmount)
        .cr('VENDOR_DEDUCTIONS', p.otherDeduction, cc);
      add({
        kind: 'PAYMENT',
        sourceId: p.id,
        date: p.paymentDate,
        number,
        reference: p.reference,
        party: p.vendor.name,
        projectId: p.project.id,
        projectCode: p.project.code,
        projectName: p.project.name,
        narration: `${onAccount ? `Paid ${p.vendor.name} on account (${billName})` : advance ? `Advance to ${p.vendor.name} on ${billName}` : `Paid ${p.vendor.name} against ${billName}`} (${p.project.name})${p.reference ? `, ${p.reference}` : ''}${p.otherDeductionNote ? `; deducted: ${p.otherDeductionNote}` : ''}`,
        billRef: onAccount ? { name: billName, type: 'On Account' } : advance ? { name: `Advance ${billName}`, type: 'Advance' } : { name: billName, type: 'Agst Ref' },
        lines: l.lines,
      });
    }

    // Site expenses: Dr the category (input GST apart when the vendor's GSTIN is known); Cr cash or bank, or the vendor
    // when bought on credit.
    for (const e of expenses) {
      const credit = e.paymentMode === 'CREDIT';
      const party = e.vendor ?? 'Site creditors';
      const claimGst = !!e.vendorGstin && e.gstAmount.gt(0);
      const l = new Lines(name).dr(tallyExpenseKey(e.category), claimGst ? e.amount : e.totalAmount, cc);
      if (claimGst) gstLines(l, 'dr', 'INPUT', e.gstAmount, isInterState(cfg.stateCode, gstStateCode(e.vendorGstin)));
      if (credit) l.cr(e.vendorId ? tallyVendorKey(e.vendorId) : 'SITE_CREDITORS', e.totalAmount, { fallback: party, party: true });
      else l.cr(moneyLedger(e.paymentMode), e.totalAmount);
      add({
        kind: 'EXPENSE',
        sourceId: e.id,
        date: e.date,
        number: e.expenseNo,
        reference: e.billNo,
        party: credit ? party : (e.vendor ?? EXPENSE_CATEGORY_LABELS[e.category]),
        projectId: e.project.id,
        projectCode: e.project.code,
        projectName: e.project.name,
        narration: `${e.description} (${e.project.name})${e.vendor ? `, ${e.vendor}` : ''}${e.billNo ? `, bill ${e.billNo}` : ''}`,
        billRef: credit && e.billNo ? { name: e.billNo, type: 'New Ref' } : null,
        lines: l.lines,
      });
    }

    await this.salaries(db, org, name, opts, range, add);
    await this.staffLoans(db, org, name, opts, range, add);
    await this.rmc(db, org, name, opts, range, add);
    await this.machineLoans(db, org, name, opts, range, add);

    // Oldest first, so Tally numbers and ages them in order.
    vouchers.sort((a, b) => a.date.getTime() - b.date.getTime() || a.kind.localeCompare(b.kind) || a.number.localeCompare(b.number));
    return { vouchers, held, awaitingCertification };
  }

  /**
   * Salary runs (v6 item 102): an approved run is a journal on the month's last day (Dr salaries and the company's PF
   * and ESI; Cr each deduction's payable and the net to salaries payable); once paid, a payment (Dr salaries payable,
   * Cr bank). A site's run carries the site as cost centre.
   */
  private async salaries(db: Tx, org: string, name: LedgerName, opts: PostingOptions, range: (field: string) => object, add: (v: Voucher) => void) {
    const tally = opts.unexported;
    const project = { project: { select: projectSelect } };
    const [booked, paid] = await Promise.all([
      db.payrollRun.findMany({ where: { organizationId: org, status: { in: ['APPROVED', 'PAID'] }, ...(tally ? { tallyExportId: null } : {}) }, include: project }),
      db.payrollRun.findMany({ where: { organizationId: org, status: 'PAID', paidOn: { not: null }, ...(tally ? { tallyPaymentExportId: null } : {}), ...range('paidOn') }, include: project }),
    ]);
    const inRange = (d: Date) => !opts.range || (d <= opts.range.upTo && (!opts.range.from || d >= opts.range.from));
    const runs = booked.filter((r) => inRange(monthEnd(r.month)));
    const ids = [...new Set([...runs, ...paid].map((r) => r.id))];
    if (!ids.length) return;
    const lines = await db.payslipLine.findMany({ where: { organizationId: org, payslip: { runId: { in: ids } } }, select: { kind: true, code: true, amount: true, payslip: { select: { runId: true } } } });
    const zero = () => ({ earnings: D(0), pf: D(0), esi: D(0), pt: D(0), tds: D(0), loans: D(0), other: D(0), employerPf: D(0), employerEsi: D(0) });
    const totals = new Map<string, ReturnType<typeof zero>>();
    for (const l of lines) {
      const t = totals.get(l.payslip.runId) ?? zero();
      totals.set(l.payslip.runId, t);
      if (l.kind === 'EARNING') t.earnings = t.earnings.add(l.amount);
      else if (l.kind === 'EMPLOYER') {
        if (l.code === 'ESI_EMPLOYER') t.employerEsi = t.employerEsi.add(l.amount);
        else t.employerPf = t.employerPf.add(l.amount);
      } else {
        const k = ({ PF: 'pf', ESI: 'esi', PT: 'pt', TDS: 'tds', LOAN: 'loans', ADVANCE: 'loans' } as const)[l.code as 'PF'] ?? 'other';
        t[k] = t[k].add(l.amount);
      }
    }
    const netOf = (t: ReturnType<typeof zero>) => t.earnings.sub(t.pf).sub(t.esi).sub(t.pt).sub(t.tds).sub(t.loans).sub(t.other);
    const where = (r: (typeof runs)[number]) => ({ projectId: r.project?.id ?? null, projectCode: r.project?.code ?? '', projectName: r.project?.name ?? '' });

    for (const r of runs) {
      const t = totals.get(r.id) ?? zero();
      const cc = r.project ? { costCentre: true } : {};
      const l = new Lines(name)
        .dr('SALARIES', t.earnings, cc)
        .dr('EMPLOYER_PF', t.employerPf, cc)
        .dr('EMPLOYER_ESI', t.employerEsi, cc)
        .cr('PF_PAYABLE', t.pf.add(t.employerPf))
        .cr('ESI_PAYABLE', t.esi.add(t.employerEsi))
        .cr('PT_PAYABLE', t.pt)
        .cr('SALARY_TDS_PAYABLE', t.tds)
        .cr('STAFF_LOANS', t.loans)
        .cr('STAFF_RECOVERIES', t.other, cc)
        .cr('SALARY_PAYABLE', netOf(t));
      add({
        kind: 'SALARY',
        sourceId: r.id,
        date: monthEnd(r.month),
        number: r.runNo,
        reference: null,
        party: 'Salaries',
        ...where(r),
        narration: `Salaries for ${monthName(r.month)} (${r.runNo})${r.project ? ` at ${r.project.name}` : ''}: gross ₹${t.earnings.toFixed(2)}, net ₹${netOf(t).toFixed(2)}`,
        billRef: null,
        lines: l.lines,
      });
    }
    for (const r of paid) {
      const net = netOf(totals.get(r.id) ?? zero());
      add({
        kind: 'SALARY_PAYMENT',
        sourceId: r.id,
        date: r.paidOn!,
        number: `${r.runNo}/PAID`,
        reference: r.paymentRef,
        party: 'Salaries',
        ...where(r),
        narration: `Salaries for ${monthName(r.month)} paid (${r.runNo})${r.paymentRef ? `, ${r.paymentRef}` : ''}`,
        billRef: null,
        lines: new Lines(name).dr('SALARY_PAYABLE', net).cr('BANK', net).lines,
      });
    }
  }

  /** Loans and salary advances given to staff (v6 item 102): a payment, Dr loans to staff, Cr bank. */
  private async staffLoans(db: Tx, org: string, name: LedgerName, opts: PostingOptions, range: (field: string) => object, add: (v: Voucher) => void) {
    const loans = await db.staffLoan.findMany({
      where: { organizationId: org, ...(opts.unexported ? { tallyExportId: null } : {}), ...range('issuedOn') },
      include: { employee: { select: { fullName: true, employeeCode: true } } },
    });
    for (const l of loans) {
      const what = l.kind === 'LOAN' ? 'Loan' : 'Salary advance';
      add({
        kind: 'STAFF_LOAN',
        sourceId: l.id,
        date: l.issuedOn,
        number: `LOAN/${shortId(l.id)}`,
        reference: null,
        party: l.employee.fullName,
        projectId: null,
        projectCode: '',
        projectName: '',
        narration: `${what} to ${l.employee.fullName} (${l.employee.employeeCode}), recovered ₹${l.emi.toFixed(2)} a month from ${l.startMonth}${l.note ? `; ${l.note}` : ''}`,
        billRef: null,
        lines: new Lines(name).dr('STAFF_LOANS', l.amount).cr('BANK', l.amount).lines,
      });
    }
  }

  /**
   * RMC (v6 item 104): a bill is a sale (Dr the customer, Cr sales of ready-mix concrete with the plant as cost centre,
   * Cr output GST as billed); money received is a receipt (Dr bank or cash, Cr the customer). A cancelled bill posts
   * nothing.
   */
  private async rmc(db: Tx, org: string, name: LedgerName, opts: PostingOptions, range: (field: string) => object, add: (v: Voucher) => void) {
    const open = { organizationId: org, ...(opts.unexported ? { tallyExportId: null } : {}) };
    const plant = { select: { id: true, code: true, name: true } } as const;
    const [bills, receipts] = await Promise.all([
      db.rmcInvoice.findMany({ where: { ...open, status: 'ISSUED', ...range('date') }, include: { plant, client: { select: { name: true } }, order: { select: { orderNo: true, site: true } } } }),
      db.rmcReceipt.findMany({ where: { ...open, ...range('date') }, include: { client: { select: { name: true } }, invoice: { select: { invoiceNo: true, plant } } } }),
    ]);
    for (const b of bills) {
      const client = { key: tallyClientKey(b.clientId), name: b.client.name };
      const l = new Lines(name)
        .dr(client.key, b.total, { fallback: client.name, party: true })
        .cr('RMC_SALES', b.taxable, { costCentre: true })
        .cr('OUTPUT_CGST', b.cgst)
        .cr('OUTPUT_SGST', b.sgst)
        .cr('OUTPUT_IGST', b.igst);
      add({
        kind: 'RMC_SALE',
        sourceId: b.id,
        date: b.date,
        number: b.invoiceNo,
        reference: b.order?.orderNo ?? null,
        party: client.name,
        projectId: b.plant.id,
        projectCode: b.plant.code,
        projectName: b.plant.name,
        narration: `${b.quantity.toFixed(3).replace(/\.?0+$/, '')} m³ of ready-mix concrete${b.order ? ` on ${b.order.orderNo}` : ''}${b.order?.site ? ` to ${b.order.site}` : ''}: concrete ₹${b.concrete.toFixed(2)}${b.pumping.isZero() ? '' : ` + pumping ₹${b.pumping.toFixed(2)}`} + GST ₹${b.cgst.add(b.sgst).add(b.igst).toFixed(2)}`,
        billRef: { name: b.invoiceNo, type: 'New Ref' },
        lines: l.lines,
      });
    }
    for (const r of receipts) {
      const client = { key: tallyClientKey(r.clientId), name: r.client.name };
      add({
        kind: 'RMC_RECEIPT',
        sourceId: r.id,
        date: r.date,
        number: `RMCR/${shortId(r.id)}`,
        reference: r.reference,
        party: client.name,
        projectId: r.invoice?.plant.id ?? null,
        projectCode: r.invoice?.plant.code ?? '',
        projectName: r.invoice?.plant.name ?? '',
        narration: `Received for RMC${r.invoice ? ` against ${r.invoice.invoiceNo}` : ' on account'}${r.reference ? `, ${r.reference}` : ''}`,
        billRef: r.invoice ? { name: r.invoice.invoiceNo, type: 'Agst Ref' } : null,
        lines: new Lines(name).dr(moneyLedger(r.mode), r.amount).cr(client.key, r.amount, { fallback: client.name, party: true }).lines,
      });
    }
  }

  /**
   * Machine finance (v6 item 108): a loan is a journal on its sanction date, Dr Plant and Machinery (the lender paid the
   * dealer) or the bank (a loan against a machine already owned, a receipt in Tally), Cr the loan's own ledger under
   * Secured Loans; each EMI paid is a payment, Dr the loan with the principal and interest on machinery loans (finance
   * costs) with the interest, Cr bank or cash.
   */
  private async machineLoans(db: Tx, org: string, name: LedgerName, opts: PostingOptions, range: (field: string) => object, add: (v: Voucher) => void) {
    const tally = opts.unexported;
    const equipment = { select: { code: true, name: true } } as const;
    const [loans, emis] = await Promise.all([
      db.equipmentLoan.findMany({ where: { organizationId: org, ...(tally ? { tallyExportId: null } : {}), ...range('sanctionDate') }, include: { equipment } }),
      db.loanEmi.findMany({
        where: { organizationId: org, paidOn: { not: null }, ...(tally ? { tallyExportId: null } : {}), ...range('paidOn') },
        include: { loan: { select: { id: true, lenderName: true, loanNo: true, tenureMonths: true, equipment } } },
      }),
    ]);
    const none = { projectId: null, projectCode: '', projectName: '' };
    for (const l of loans) {
      const loan = { key: tallyLoanKey(l.id), name: loanLedgerName(l) };
      const intoBank = l.disbursal === 'BANK';
      add({
        kind: 'MACHINE_LOAN',
        sourceId: l.id,
        date: l.sanctionDate,
        number: `MLOAN/${shortId(l.id)}`,
        reference: l.loanNo,
        party: l.lenderName,
        ...none,
        narration: `Loan ${l.loanNo} from ${l.lenderName} on ${l.equipment.code} ${l.equipment.name}: ₹${l.amount.toFixed(2)} at ${l.ratePct.toFixed(2)}% for ${l.tenureMonths} months, EMI ₹${l.emi.toFixed(2)}${intoBank ? ', credited to the bank' : ', paid to the dealer'}`,
        billRef: null,
        lines: new Lines(name).dr(intoBank ? 'BANK' : 'MACHINERY', l.amount).cr(loan.key, l.amount, { fallback: loan.name }).lines,
        ...(intoBank ? { voucherType: 'Receipt' } : {}),
      });
    }
    for (const e of emis) {
      const loan = { key: tallyLoanKey(e.loan.id), name: loanLedgerName(e.loan) };
      add({
        kind: 'LOAN_EMI',
        sourceId: e.id,
        date: e.paidOn!,
        number: `EMI/${shortId(e.id)}`,
        reference: e.reference,
        party: e.loan.lenderName,
        ...none,
        narration: `EMI ${e.no} of ${e.loan.tenureMonths} on loan ${e.loan.loanNo} (${e.loan.equipment.code} ${e.loan.equipment.name}): principal ₹${e.principal.toFixed(2)}, interest ₹${e.interest.toFixed(2)}${e.mode ? `, by ${PAYMENT_MODE_LABELS[e.mode].toLowerCase()}` : ''}${e.reference ? `, ${e.reference}` : ''}`,
        billRef: null,
        lines: new Lines(name).dr(loan.key, e.principal, { fallback: loan.name }).dr('LOAN_INTEREST', e.interest).cr(moneyLedger(e.mode ?? 'BANK'), e.emi).lines,
      });
    }
  }
}
