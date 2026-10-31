import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  TALLY_CLIENT_GROUP,
  TALLY_EXPENSE_GROUP,
  TALLY_FIXED_LEDGERS,
  TALLY_VENDOR_GROUP,
  TALLY_LOAN_GROUP,
  loanLedgerName,
  tallyLoanKey,
  canExportTally,
  tallyClientKey,
  tallyExpenseDefault,
  tallyExpenseKey,
  tallyVendorKey,
  type TallyExportDto,
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
import { PostingService, shortId } from '../posting/posting.service';
import {
  costCentreName,
  debits,
  mastersXml,
  vouchersXml,
  type LedgerMaster,
  type Voucher,
} from './vouchers';

type Tx = Prisma.TransactionClient | PrismaService;
const GST_HEADS: Record<string, LedgerMaster['gstHead']> = {
  OUTPUT_CGST: 'Central Tax',
  INPUT_CGST: 'Central Tax',
  OUTPUT_SGST: 'State Tax',
  INPUT_SGST: 'State Tax',
  OUTPUT_IGST: 'Integrated Tax',
  INPUT_IGST: 'Integrated Tax',
};
/** Lines that carry the project as cost centre: income and expense ledgers. */
const COST_CENTRE_KEYS = new Set([
  'SALES',
  'PURCHASE',
  'FREIGHT',
  'MACHINE_HIRE',
  'REPAIRS',
  'FUEL_RECOVERY',
  'SUBCONTRACT',
  'MATERIAL_RECOVERY',
  'LABOUR_CESS',
  'CLIENT_DEDUCTIONS',
  'VENDOR_DEDUCTIONS',
  'SALARIES',
  'EMPLOYER_PF',
  'EMPLOYER_ESI',
  'STAFF_RECOVERIES',
]);
/**
 * Tally export. Sends Tally the vouchers of the posting service as TallyPrime XML. Every
 * record goes once: an export marks what it took, and undoing the export releases it.
 */
@Injectable()
export class TallyService {
  constructor(private prisma: PrismaService, private audit: AuditService, private posting: PostingService) {}

  private assertCan(user: RequestUser) {
    if (!canExportTally(user.roleKey)) throw new ForbiddenException('Only admin, management and accounts export to Tally');
  }

  private config(db: Tx, organizationId: string) {
    return this.posting.config(db, organizationId);
  }

  async settings(user: RequestUser): Promise<TallySettingsDto> {
    this.assertCan(user);
    const cfg = await this.config(this.prisma, user.organizationId);
    const [clients, vendors, loans] = await Promise.all([
      this.prisma.client.findMany({ where: { organizationId: user.organizationId }, select: { id: true, name: true, department: true }, orderBy: { name: 'asc' } }),
      this.prisma.vendor.findMany({ where: { organizationId: user.organizationId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      this.prisma.equipmentLoan.findMany({ where: { organizationId: user.organizationId }, select: { id: true, lenderName: true, loanNo: true, equipment: { select: { code: true } } }, orderBy: [{ lenderName: 'asc' }, { loanNo: 'asc' }] }),
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
        ...loans.map((l) => row(tallyLoanKey(l.id), 'LOAN', `Machine loan on ${l.equipment.code}`, loanLedgerName(l), TALLY_LOAN_GROUP)),
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

  private range(q: TallyRangeQuery) {
    const upTo = parseDate(q.upTo);
    const from = q.from ? parseDate(q.from) : null;
    if (from && from > upTo) throw new BadRequestException('From is after up to');
    return { upTo, from };
  }

  private voucherDto(v: Voucher): TallyVoucherDto {
    return {
      key: `${v.kind}:${v.sourceId}`,
      kind: v.kind,
      sourceId: v.sourceId,
      date: dateOnly(v.date),
      number: v.number,
      party: v.party,
      projectCode: v.projectCode,
      projectName: v.projectName,
      amount: money(debits(v.lines)),
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
    const b = await this.posting.build(this.prisma, user.organizationId, cfg, { unexported: true, range: this.range(q) });
    return { upTo: q.upTo, from: q.from ?? null, vouchers: b.vouchers.map((v) => this.voucherDto(v)), held: b.held, counts: this.counts(b.vouchers), awaitingCertification: b.awaitingCertification };
  }

  private exportDto(r: Prisma.TallyExportGetPayload<{ include: { createdBy: { select: { fullName: true } } } }>): TallyExportDto {
    return {
      id: r.id,
      upTo: dateOnly(r.upTo),
      fromDate: dateOnly(r.fromDate),
      voucherCount: r.voucherCount,
      counts: r.counts as TallyExportDto['counts'],
      createdByName: r.createdBy.fullName,
      createdAt: iso(r.createdAt),
    };
  }

  /** Export every voucher of the preview and mark its records, so the next export does not take them again. */
  async createExport(user: RequestUser, q: TallyRangeQuery): Promise<TallyExportDto> {
    this.assertCan(user);
    const id = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`TALLY:${user.organizationId}`}))`;
      const cfg = await this.config(tx, user.organizationId);
      const { vouchers } = await this.posting.build(tx, user.organizationId, cfg, { unexported: true, range: this.range(q) });
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
      await tx.debitNote.updateMany({ where: { id: { in: ids('DEBIT_NOTE') }, tallyExportId: null }, data: mark });
      await tx.payrollRun.updateMany({ where: { id: { in: ids('SALARY') }, tallyExportId: null }, data: mark });
      await tx.staffLoan.updateMany({ where: { id: { in: ids('STAFF_LOAN') }, tallyExportId: null }, data: mark });
      await tx.rmcInvoice.updateMany({ where: { id: { in: ids('RMC_SALE') }, tallyExportId: null }, data: mark });
      await tx.rmcReceipt.updateMany({ where: { id: { in: ids('RMC_RECEIPT') }, tallyExportId: null }, data: mark });
      await tx.equipmentLoan.updateMany({ where: { id: { in: ids('MACHINE_LOAN') }, tallyExportId: null }, data: mark });
      await tx.loanEmi.updateMany({ where: { id: { in: ids('LOAN_EMI') }, tallyExportId: null }, data: mark });
      await tx.payrollRun.updateMany({ where: { id: { in: ids('SALARY_PAYMENT') }, tallyPaymentExportId: null }, data: { tallyPaymentExportId: created.id } });
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
