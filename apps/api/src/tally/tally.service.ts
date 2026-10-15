import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  TALLY_CLIENT_GROUP,
  TALLY_EXPENSE_GROUP,
  TALLY_FIXED_LEDGERS,
  TALLY_VENDOR_GROUP,
  canExportTally,
  gstStateCode,
  subBillLabel,
  tallyClientKey,
  tallyExpenseDefault,
  tallyExpenseKey,
  tallyVendorKey,
  type TallyExportDto,
  type TallyHeldDto,
  type TallyLedgerRowDto,
  type TallyPreviewDto,
  type TallySettingsDto,
  type TallyVoucherDto,
  type TallyVoucherKind,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { AuditService } from '../common/audit.service';
import { dateOnly, iso, money, parseDate } from '../common/serialize';
import { TallyRangeQuery, UpdateTallySettingsDto } from './tally.dto';
import {
  Lines,
  balanced,
  costCentreName,
  credits,
  debits,
  gstLines,
  isInterState,
  mastersXml,
  moneyLedger,
  vouchersXml,
  type LedgerMaster,
  type LedgerName,
  type Voucher,
} from './vouchers';

type Tx = Prisma.TransactionClient | PrismaService;
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const FIXED = new Map(TALLY_FIXED_LEDGERS.map((l) => [l.key, l]));
const GST_HEADS: Record<string, LedgerMaster['gstHead']> = {
  OUTPUT_CGST: 'Central Tax',
  INPUT_CGST: 'Central Tax',
  OUTPUT_SGST: 'State Tax',
  INPUT_SGST: 'State Tax',
  OUTPUT_IGST: 'Integrated Tax',
  INPUT_IGST: 'Integrated Tax',
};
/** Lines that carry the project as cost centre: income and expense ledgers. */
const COST_CENTRE_KEYS = new Set(['SALES', 'PURCHASE', 'FREIGHT', 'SUBCONTRACT', 'MATERIAL_RECOVERY', 'LABOUR_CESS', 'CLIENT_DEDUCTIONS', 'VENDOR_DEDUCTIONS']);
const DEFAULT_RECEIPT_LEDGER = { BILL: null, RETENTION_RELEASE: 'RETENTION_RECEIVABLE', DEPOSIT_RELEASE: 'DEPOSIT_RECEIVABLE' } as const;

interface Config {
  companyName: string | null;
  stateCode: string | null;
  costCentres: boolean;
  ledgers: Record<string, string>;
}

const projectSelect = { code: true, name: true, clientId: true, clientName: true, client: { select: { name: true } } } satisfies Prisma.ProjectSelect;
type ProjectRow = Prisma.ProjectGetPayload<{ select: typeof projectSelect }>;
/** The client ledger of a project: its client in the master, else the client name typed on the project. */
const clientOf = (p: ProjectRow) => (p.clientId ? { key: tallyClientKey(p.clientId), name: p.client!.name } : { key: `CLIENT_NAME:${p.clientName ?? p.name}`, name: p.clientName ?? p.name });
const raBillRef = (projectCode: string, billNo: number) => `RA/${projectCode}/${billNo}`;
const shortId = (id: string) => id.replace(/-/g, '').slice(0, 8).toUpperCase();

interface Built {
  vouchers: Voucher[];
  held: TallyHeldDto[];
  awaitingCertification: number;
}

/**
 * Tally export (v3 item 24). Tally stays the books: Nirmaan sends it vouchers as TallyPrime XML, never keeps a ledger
 * of its own. Approved RA bills once the client certifies them are sales; money received against them (with what the
 * client deducted) and retention or deposit released are receipts; approved vendor bills are purchases; approved
 * subcontractor bills are journals that credit the subcontractor with the net payable and the deductions to their
 * ledgers; payments to vendors are payments; approved site expenses are payments out of cash or bank (or a journal to
 * the vendor when on credit). Every record goes once: an export marks what it took, and undoing the export releases it.
 */
@Injectable()
export class TallyService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private assertCan(user: RequestUser) {
    if (!canExportTally(user.roleKey)) throw new ForbiddenException('Only admin, management and accounts export to Tally');
  }

  private async config(db: Tx, organizationId: string): Promise<Config> {
    const c = await db.tallyConfig.findUnique({ where: { organizationId } });
    return { companyName: c?.companyName ?? null, stateCode: c?.stateCode ?? null, costCentres: c?.costCentres ?? true, ledgers: (c?.ledgers as Record<string, string> | undefined) ?? {} };
  }

  private namer(cfg: Config): LedgerName {
    return (key, fallback) => cfg.ledgers[key] ?? FIXED.get(key)?.name ?? (key.startsWith('EXPENSE:') ? tallyExpenseDefault(key.slice(8) as never) : (fallback ?? key));
  }

  // ----- Settings and ledger names -----

  async settings(user: RequestUser): Promise<TallySettingsDto> {
    this.assertCan(user);
    const cfg = await this.config(this.prisma, user.organizationId);
    const [clients, vendors] = await Promise.all([
      this.prisma.client.findMany({ where: { organizationId: user.organizationId }, select: { id: true, name: true, department: true }, orderBy: { name: 'asc' } }),
      this.prisma.vendor.findMany({ where: { organizationId: user.organizationId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    const row = (key: string, kind: TallyLedgerRowDto['kind'], use: string, defaultName: string, group: string): TallyLedgerRowDto => ({ key, kind, use, defaultName, name: cfg.ledgers[key] ?? null, group });
    return {
      companyName: cfg.companyName,
      stateCode: cfg.stateCode,
      costCentres: cfg.costCentres,
      ledgers: [
        ...TALLY_FIXED_LEDGERS.map((l) => row(l.key, 'FIXED', l.use, l.name, l.group)),
        ...EXPENSE_CATEGORIES.map((c) => row(tallyExpenseKey(c), 'EXPENSE', `Site expenses: ${EXPENSE_CATEGORY_LABELS[c]}`, tallyExpenseDefault(c), TALLY_EXPENSE_GROUP)),
        ...clients.map((c) => row(tallyClientKey(c.id), 'CLIENT', c.department ? `Client · ${c.department}` : 'Client', c.name, TALLY_CLIENT_GROUP)),
        ...vendors.map((v) => row(tallyVendorKey(v.id), 'VENDOR', 'Vendor', v.name, TALLY_VENDOR_GROUP)),
      ],
    };
  }

  async saveSettings(user: RequestUser, dto: UpdateTallySettingsDto): Promise<TallySettingsDto> {
    this.assertCan(user);
    const current = await this.settings(user);
    const known = new Map(current.ledgers.map((l) => [l.key, l]));
    const ledgers: Record<string, string> = {};
    for (const l of current.ledgers) if (l.name) ledgers[l.key] = l.name;
    for (const [key, raw] of Object.entries(dto.ledgers ?? {})) {
      const row = known.get(key);
      if (!row) throw new BadRequestException(`Unknown ledger ${key}`);
      const name = (raw ?? '').trim();
      if (name.length > 200) throw new BadRequestException('A Tally ledger name has at most 200 characters');
      if (!name || name === row.defaultName) delete ledgers[key];
      else ledgers[key] = name;
    }
    const stateCode = dto.stateCode === undefined ? current.stateCode : dto.stateCode?.trim() || null;
    if (stateCode && !/^\d{2}$/.test(stateCode)) throw new BadRequestException('The GST state code is two digits, e.g. 21 for Odisha');
    const data = {
      companyName: dto.companyName === undefined ? current.companyName : dto.companyName?.trim() || null,
      stateCode,
      costCentres: dto.costCentres ?? current.costCentres,
      ledgers,
    };
    await this.prisma.tallyConfig.upsert({ where: { organizationId: user.organizationId }, create: { organizationId: user.organizationId, ...data }, update: data });
    await this.audit.log(user, 'TALLY_CONFIG', user.organizationId, 'UPDATED');
    return this.settings(user);
  }

  /** Ledger masters (and a cost centre per project) to import into Tally once, before the first vouchers. */
  async mastersXml(user: RequestUser): Promise<string> {
    const s = await this.settings(user);
    const cfg = await this.config(this.prisma, user.organizationId);
    const [vendors, clients, projects] = await Promise.all([
      this.prisma.vendor.findMany({ where: { organizationId: user.organizationId }, select: { id: true, gstin: true } }),
      this.prisma.client.findMany({ where: { organizationId: user.organizationId }, select: { id: true, gstin: true } }),
      this.prisma.project.findMany({ where: { organizationId: user.organizationId }, select: { code: true, name: true }, orderBy: { code: 'asc' } }),
    ]);
    const gstin = new Map([...vendors.map((v) => [tallyVendorKey(v.id), v.gstin] as const), ...clients.map((c) => [tallyClientKey(c.id), c.gstin] as const)]);
    const seen = new Set<string>();
    const ledgers: LedgerMaster[] = [];
    for (const l of s.ledgers) {
      const name = l.name ?? l.defaultName;
      if (seen.has(name)) continue;
      seen.add(name);
      ledgers.push({
        name,
        group: l.group,
        billWise: l.kind === 'CLIENT' || l.kind === 'VENDOR' || l.key === 'SITE_CREDITORS',
        costCentres: l.kind === 'EXPENSE' || COST_CENTRE_KEYS.has(l.key),
        gstHead: GST_HEADS[l.key],
        gstin: gstin.get(l.key) ?? null,
      });
    }
    return mastersXml(
      ledgers,
      cfg.costCentres ? projects.map((p) => costCentreName(p.code, p.name)) : [],
      cfg.companyName,
    );
  }

  // ----- Vouchers -----

  private range(field: string, q: TallyRangeQuery) {
    const upTo = parseDate(q.upTo);
    const from = q.from ? parseDate(q.from) : null;
    if (from && from > upTo) throw new BadRequestException('From is after up to');
    return { [field]: { lte: upTo, ...(from ? { gte: from } : {}) } };
  }

  /** Every record not yet exported, dated in the range, as the vouchers it becomes (or held, with the reason). */
  private async build(db: Tx, user: RequestUser, cfg: Config, q: TallyRangeQuery): Promise<Built> {
    const org = user.organizationId;
    const name = this.namer(cfg);
    const open = { organizationId: org, tallyExportId: null };
    const [raBills, awaitingCertification, receipts, vendorBills, subBills, payments, expenses] = await Promise.all([
      db.raBill.findMany({ where: { ...open, status: 'APPROVED', stage: { in: ['CERTIFIED', 'PAID'] }, ...this.range('billDate', q) }, include: { project: { select: projectSelect } } }),
      db.raBill.count({ where: { ...open, status: 'APPROVED', stage: { in: ['NOT_SENT', 'SENT'] }, ...this.range('billDate', q) } }),
      db.receipt.findMany({ where: { ...open, ...this.range('receiptDate', q) }, include: { project: { select: projectSelect }, bill: { select: { id: true, billNo: true, tallyExportId: true } } } }),
      db.vendorBill.findMany({ where: { ...open, status: 'APPROVED', ...this.range('invoiceDate', q) }, include: { project: { select: projectSelect }, vendor: { select: { name: true, stateCode: true, gstin: true } } } }),
      db.subcontractBill.findMany({
        where: { ...open, status: 'APPROVED', ...this.range('billDate', q) },
        include: { project: { select: projectSelect }, workOrder: { select: { woNo: true, vendorId: true, vendor: { select: { name: true, stateCode: true, gstin: true } } } } },
      }),
      db.vendorPayment.findMany({
        where: { ...open, ...this.range('paymentDate', q) },
        include: {
          project: { select: projectSelect },
          vendor: { select: { name: true } },
          vendorBill: { select: { invoiceNo: true } },
          subcontractBill: { select: { billNo: true, isFinal: true, workOrder: { select: { woNo: true } } } },
        },
      }),
      db.expense.findMany({ where: { ...open, status: 'APPROVED', ...this.range('date', q) }, include: { project: { select: projectSelect } } }),
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
        projectCode: b.project.code,
        projectName: b.project.name,
        narration: `RA bill ${b.billNo}${b.isFinal ? ' (final)' : ''} of ${b.project.name}: work ₹${b.grossAmount.toFixed(2)}${b.pvAmount.isZero() ? '' : ` + price variation ₹${b.pvAmount.toFixed(2)}`} + GST ₹${b.gstAmount.toFixed(2)}${b.certificateNo ? `, certificate ${b.certificateNo}` : ''}`,
        billRef: { name: ref, type: 'New Ref' },
        lines: l.lines,
      });
    }

    // Receipts: Dr bank or cash, Dr what the client deducted; Cr the client (or retention / deposit held, for releases).
    for (const r of receipts) {
      const client = clientOf(r.project);
      const number = `RCPT/${shortId(r.id)}`;
      const ref = r.bill ? raBillRef(r.project.code, r.bill.billNo) : null;
      if (r.bill && !r.bill.tallyExportId && !exportedBills.has(r.bill.id)) {
        held.push({ kind: 'RECEIPT', sourceId: r.id, date: dateOnly(r.receiptDate)!, number, party: client.name, reason: `Its RA bill ${r.bill.billNo} goes to Tally once the client certifies it` });
        continue;
      }
      const settled = [r.amount, r.tdsAmount, r.gstTdsAmount, r.retentionAmount, r.securityDepositAmount, r.advanceRecoveryAmount, r.labourCessAmount, r.otherDeduction].reduce((s, v) => s.add(v), D(0));
      const l = new Lines(name)
        .dr(moneyLedger(r.mode), r.amount)
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
      add({
        kind: 'RECEIPT',
        sourceId: r.id,
        date: r.receiptDate,
        number,
        reference: r.reference,
        party: client.name,
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

    // Vendor bills: Dr purchases, freight and input GST; Cr the vendor with the invoice total.
    for (const b of vendorBills) {
      const vendorState = gstStateCode(b.vendor.gstin) ?? b.vendor.stateCode;
      const l = new Lines(name).dr('PURCHASE', b.subtotal, cc).dr('FREIGHT', b.freight, cc);
      gstLines(l, 'dr', 'INPUT', b.gstAmount, isInterState(cfg.stateCode, vendorState));
      l.cr(tallyVendorKey(b.vendorId), b.total, { fallback: b.vendor.name, party: true });
      add({
        kind: 'PURCHASE',
        sourceId: b.id,
        date: b.invoiceDate,
        number: b.billNo,
        reference: b.invoiceNo,
        party: b.vendor.name,
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
        .cr('MATERIAL_RECOVERY', b.materialRecovery, cc)
        .cr('VENDOR_DEDUCTIONS', b.otherDeduction, cc);
      add({
        kind: 'SUBCONTRACT',
        sourceId: b.id,
        date: b.billDate,
        number: label,
        reference: b.invoiceNo,
        party: v.name,
        projectCode: b.project.code,
        projectName: b.project.name,
        narration: `${label} of ${v.name} on ${b.project.name}: work ₹${b.grossAmount.toFixed(2)}, measured up to ${dateOnly(b.measuredUpTo)}`,
        billRef: { name: label, type: 'New Ref' },
        lines: l.lines,
      });
    }

    // Payments to vendors: Dr the vendor with what the payment settles; Cr bank or cash, TDS and other deductions.
    for (const p of payments) {
      const number = `PAY/${shortId(p.id)}`;
      const billName = p.vendorBill ? p.vendorBill.invoiceNo : subBillLabel(p.subcontractBill!.workOrder.woNo, p.subcontractBill!.billNo, p.subcontractBill!.isFinal);
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
        projectCode: p.project.code,
        projectName: p.project.name,
        narration: `Paid ${p.vendor.name} against ${billName} (${p.project.name})${p.reference ? `, ${p.reference}` : ''}${p.otherDeductionNote ? `; deducted: ${p.otherDeductionNote}` : ''}`,
        billRef: { name: billName, type: 'Agst Ref' },
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
        projectCode: e.project.code,
        projectName: e.project.name,
        narration: `${e.description} (${e.project.name})${e.vendor ? `, ${e.vendor}` : ''}${e.billNo ? `, bill ${e.billNo}` : ''}`,
        billRef: credit && e.billNo ? { name: e.billNo, type: 'New Ref' } : null,
        lines: l.lines,
      });
    }

    // Oldest first, so Tally numbers and ages them in order.
    vouchers.sort((a, b) => a.date.getTime() - b.date.getTime() || a.kind.localeCompare(b.kind) || a.number.localeCompare(b.number));
    return { vouchers, held, awaitingCertification };
  }

  private voucherDto(v: Voucher): TallyVoucherDto {
    return {
      key: `${v.kind}:${v.sourceId}`,
      kind: v.kind,
      sourceId: v.sourceId,
      date: dateOnly(v.date)!,
      number: v.number,
      party: v.party,
      projectCode: v.projectCode,
      projectName: v.projectName,
      amount: money(debits(v.lines))!,
      narration: v.narration,
      entries: v.lines.map((l) => ({ ledgerKey: l.ledgerKey, ledger: l.ledger, debit: l.amount.gt(0) ? money(l.amount) : null, credit: l.amount.lt(0) ? money(l.amount.neg()) : null })),
    };
  }

  private counts(vouchers: Voucher[]) {
    const out: Partial<Record<TallyVoucherKind, number>> = {};
    for (const v of vouchers) out[v.kind] = (out[v.kind] ?? 0) + 1;
    return out;
  }

  async preview(user: RequestUser, q: TallyRangeQuery): Promise<TallyPreviewDto> {
    this.assertCan(user);
    const cfg = await this.config(this.prisma, user.organizationId);
    const b = await this.build(this.prisma, user, cfg, q);
    return { upTo: q.upTo, from: q.from ?? null, vouchers: b.vouchers.map((v) => this.voucherDto(v)), held: b.held, counts: this.counts(b.vouchers), awaitingCertification: b.awaitingCertification };
  }

  private exportDto(r: Prisma.TallyExportGetPayload<{ include: { createdBy: { select: { fullName: true } } } }>): TallyExportDto {
    return {
      id: r.id,
      upTo: dateOnly(r.upTo)!,
      fromDate: dateOnly(r.fromDate),
      voucherCount: r.voucherCount,
      counts: r.counts as TallyExportDto['counts'],
      createdByName: r.createdBy.fullName,
      createdAt: iso(r.createdAt)!,
    };
  }

  /** Export every voucher of the preview and mark its records, so the next export does not take them again. */
  async createExport(user: RequestUser, q: TallyRangeQuery): Promise<TallyExportDto> {
    this.assertCan(user);
    const id = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`TALLY:${user.organizationId}`}))`;
      const cfg = await this.config(tx, user.organizationId);
      const { vouchers } = await this.build(tx, user, cfg, q);
      if (!vouchers.length) throw new BadRequestException('Nothing new to export up to that date');
      const counts = this.counts(vouchers);
      const created = await tx.tallyExport.create({
        data: {
          organizationId: user.organizationId,
          upTo: parseDate(q.upTo),
          fromDate: q.from ? parseDate(q.from) : null,
          voucherCount: vouchers.length,
          counts,
          xml: vouchersXml(vouchers, cfg.companyName, cfg.costCentres),
          createdById: user.id,
        },
      });
      const ids = (k: TallyVoucherKind) => vouchers.filter((v) => v.kind === k).map((v) => v.sourceId);
      const mark = { tallyExportId: created.id };
      await tx.raBill.updateMany({ where: { id: { in: ids('SALES') }, tallyExportId: null }, data: mark });
      await tx.receipt.updateMany({ where: { id: { in: ids('RECEIPT') }, tallyExportId: null }, data: mark });
      await tx.vendorBill.updateMany({ where: { id: { in: ids('PURCHASE') }, tallyExportId: null }, data: mark });
      await tx.subcontractBill.updateMany({ where: { id: { in: ids('SUBCONTRACT') }, tallyExportId: null }, data: mark });
      await tx.vendorPayment.updateMany({ where: { id: { in: ids('PAYMENT') }, tallyExportId: null }, data: mark });
      await tx.expense.updateMany({ where: { id: { in: ids('EXPENSE') }, tallyExportId: null }, data: mark });
      return created.id;
    });
    const row = await this.prisma.tallyExport.findUniqueOrThrow({ where: { id }, include: { createdBy: { select: { fullName: true } } } });
    await this.audit.log(user, 'TALLY_EXPORT', id, 'CREATED', `${row.voucherCount} vouchers up to ${q.upTo}`);
    return this.exportDto(row);
  }

  async listExports(user: RequestUser): Promise<TallyExportDto[]> {
    this.assertCan(user);
    const rows = await this.prisma.tallyExport.findMany({
      where: { organizationId: user.organizationId },
      omit: { xml: true },
      include: { createdBy: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((r) => this.exportDto({ ...r, xml: '' }));
  }

  async exportXml(user: RequestUser, id: string): Promise<{ xml: string; fileName: string }> {
    this.assertCan(user);
    const row = await this.prisma.tallyExport.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!row) throw new NotFoundException('Export not found');
    return { xml: row.xml, fileName: `nirmaan-tally-upto-${dateOnly(row.upTo)}-${shortId(row.id)}.xml` };
  }

  /** Undo an export that Tally did not take: its records go back to waiting for the next export. */
  async undoExport(user: RequestUser, id: string) {
    this.assertCan(user);
    const row = await this.prisma.tallyExport.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!row) throw new NotFoundException('Export not found');
    await this.prisma.tallyExport.delete({ where: { id } });
    await this.audit.log(user, 'TALLY_EXPORT', id, 'DELETED', `${row.voucherCount} vouchers up to ${dateOnly(row.upTo)} released`);
    return { ok: true };
  }
}
