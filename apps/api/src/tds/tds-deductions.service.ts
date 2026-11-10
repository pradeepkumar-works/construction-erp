import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  TDS_SECTIONS,
  challanLabel,
  filedQuarterWords,
  isTdsSection,
  quarterOf,
  rateMilliOf,
  rateText,
  tdsRate,
  validPan,
  type LowerTdsCertificate,
  type TdsReturnForm,
  type TdsSection,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { dateOnly, parseDate } from '../common/serialize';

type Tx = Prisma.TransactionClient;
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

/** A deduction ready to write, less its source's id. */
export interface DeductionDraft {
  form: TdsReturnForm;
  section: TdsSection | null;
  vendorId: string | null;
  employeeId: string | null;
  deducteeName: string;
  deducteePan: string | null;
  deducteeRef: string | null;
  projectId: string | null;
  /** YYYY-MM-DD */
  paidOn: string;
  amountPaid: Prisma.Decimal;
  rate: Prisma.Decimal | null;
  tdsAmount: Prisma.Decimal;
  reason: string | null;
  certificateNo: string | null;
}

type Source = { vendorPaymentId: string } | { subcontractBillId: string } | { payslipId: string };

/** The deduction a payment carries, as payables hands it over. */
export interface PaymentTds {
  section: TdsSection | null;
  /** What TDS was worked out on */
  base: Prisma.Decimal;
  rate: Prisma.Decimal | null;
  reason: string | null;
  certificateNo: string | null;
}

/**
 * The deductions each place that deducts TDS writes in its own transaction (ARCHITECTURE "TDS returns"): a vendor
 * payment (payables), an approved subcontractor bill (194C) and an approved salary run (192 per payslip). Every write
 * takes the shared lock of each quarter it touches and refuses while that quarter's return is filed; a deduction in a
 * challan is never changed or removed from under it. It never writes a payment, a bill or a run.
 */
@Injectable()
export class TdsDeductionsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Hold each quarter the days fall in for the rest of `tx` (shared: writers run side by side, filing waits for them) and
   * refuse while one is filed, with words that say what to do.
   */
  async holdQuarters(tx: Tx, organizationId: string, items: { form: TdsReturnForm; paidOn: string }[], what: string, mode: 'shared' | 'exclusive' = 'shared') {
    if (!items.length) return;
    const keys = new Map<string, { form: TdsReturnForm; from: string }>();
    for (const i of items) {
      const q = quarterOf(i.paidOn);
      keys.set(`TDSQ:${organizationId}:${i.form}:${q.from}`, { form: i.form, from: q.from });
    }
    const sorted = [...keys.keys()].sort();
    if (mode === 'shared') await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtext(k)) FROM (SELECT k FROM unnest(${sorted}::text[]) AS k ORDER BY k COLLATE "C") AS locks`;
    else await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(k)) FROM (SELECT k FROM unnest(${sorted}::text[]) AS k ORDER BY k COLLATE "C") AS locks`;
    const filed = await tx.tdsReturn.findFirst({
      where: { organizationId, status: 'FILED', OR: [...keys.values()].map((k) => ({ form: k.form, periodFrom: parseDate(k.from) })) },
      select: { form: true, periodFrom: true },
    });
    if (filed) throw new BadRequestException(filedQuarterWords(filed.form, quarterOf(dateOnly(filed.periodFrom)), what));
  }

  /** The certificate a vendor holds for a section on a day, with what it has covered so far. */
  async certificateFor(db: Tx | PrismaService, organizationId: string, vendorId: string, section: string, on: string): Promise<LowerTdsCertificate | null> {
    const c = await db.tdsCertificate.findFirst({ where: { organizationId, vendorId, section, validFrom: { lte: parseDate(on) }, validTo: { gte: parseDate(on) } }, orderBy: { validFrom: 'desc' } });
    if (!c) return null;
    const used = await db.tdsDeduction.aggregate({ where: { organizationId, certificateNo: c.certificateNo }, _sum: { amountPaid: true } });
    return { certificateNo: c.certificateNo, section: c.section, rate: c.rate.toString(), validFrom: dateOnly(c.validFrom), validTo: dateOnly(c.validTo), limit: c.limitAmount.toString(), used: (used._sum.amountPaid ?? D(0)).toString() };
  }

  /**
   * The deduction of a vendor payment, worked out before its transaction: the section (required once TDS is deducted,
   * and a 26Q one), the base (what the payment settles less the bill's GST share, unless given) and the rate for the
   * vendor's PAN and certificate.
   */
  async preparePayment(
    organizationId: string,
    p: { vendorId: string; section: string | null | undefined; base: string | null | undefined; tdsAmount: Prisma.Decimal; settles: Prisma.Decimal; gstShare: Prisma.Decimal; paymentDate: string },
    keepUnconfirmed = false,
  ): Promise<PaymentTds | null> {
    if (p.tdsAmount.lte(0)) return null;
    if (!p.section) {
      if (keepUnconfirmed) return { section: null, base: p.settles, rate: null, reason: null, certificateNo: null };
      throw new BadRequestException('Choose the TDS section for the TDS deducted');
    }
    if (!isTdsSection(p.section) || TDS_SECTIONS[p.section].form !== 'FORM_26Q') throw new BadRequestException('Choose a TDS section for vendors and contractors (194C, 194J and the rest)');
    const base = p.base !== undefined && p.base !== null && p.base !== '' ? D(p.base) : p.settles.sub(p.gstShare);
    if (base.lte(0)) throw new BadRequestException('Enter the amount TDS is worked out on');
    if (base.decimalPlaces() > 2) throw new BadRequestException('Amounts are in rupees and paise');
    if (p.tdsAmount.gt(base)) throw new BadRequestException('The TDS cannot be more than the amount it is worked out on');
    const vendor = await this.prisma.vendor.findFirstOrThrow({ where: { id: p.vendorId, organizationId }, select: { pan: true } });
    const cert = validPan(vendor.pan) ? await this.certificateFor(this.prisma, organizationId, p.vendorId, p.section, p.paymentDate) : null;
    const r = tdsRate(p.section, { pan: vendor.pan, certificate: cert }, p.paymentDate, base.toString());
    return { section: p.section, base, rate: D(rateText(r.rate)), reason: r.reason, certificateNo: r.certificateNo };
  }

  private async write(tx: Tx, organizationId: string, rows: (DeductionDraft & Source)[], what: string) {
    if (!rows.length) return;
    await this.holdQuarters(tx, organizationId, rows, what);
    await tx.tdsDeduction.createMany({
      data: rows.map((r) => ({ ...r, organizationId, paidOn: parseDate(r.paidOn) })),
    });
  }

  /** Payments just inserted by payables, in its transaction: one deduction for each that deducted TDS. */
  async forPayments(tx: Tx, organizationId: string, payments: { id: string; vendorId: string; projectId: string; paymentDate: string; tdsAmount: Prisma.Decimal; tds: PaymentTds | null }[]) {
    const withTds = payments.filter((p) => p.tds && p.tdsAmount.gt(0));
    if (!withTds.length) return;
    const vendors = new Map((await tx.vendor.findMany({ where: { id: { in: [...new Set(withTds.map((p) => p.vendorId))] } }, select: { id: true, name: true, pan: true } })).map((v) => [v.id, v]));
    await this.write(
      tx,
      organizationId,
      withTds.map((p) => {
        const v = vendors.get(p.vendorId)!;
        return { ...this.vendorDraft(v, p.projectId, p.paymentDate, p.tdsAmount, p.tds!), vendorPaymentId: p.id };
      }),
      'a payment with TDS',
    );
  }

  private vendorDraft(v: { id: string; name: string; pan: string | null }, projectId: string, paidOn: string, tdsAmount: Prisma.Decimal, t: PaymentTds): DeductionDraft {
    return { form: 'FORM_26Q', section: t.section, vendorId: v.id, employeeId: null, deducteeName: v.name, deducteePan: validPan(v.pan), deducteeRef: null, projectId, paidOn, amountPaid: t.base, rate: t.rate, tdsAmount, reason: t.reason, certificateNo: t.certificateNo };
  }

  private refuseInChallan(d: { challan: { bsrCode: string; challanSerial: string; depositedOn: Date } | null }, what: string) {
    if (d.challan) throw new BadRequestException(`The TDS on ${what} is in challan ${challanLabel({ ...d.challan, depositedOn: dateOnly(d.challan.depositedOn) })}. Delete that challan under Accounts › TDS returns first, then change it`);
  }

  /**
   * A payment changed by payables, in its transaction: its deduction follows its date, TDS, section and base, or goes
   * when it no longer deducts. Refused while the deduction is in a challan or either quarter is filed.
   */
  async changePayment(tx: Tx, organizationId: string, p: { id: string; vendorId: string; projectId: string; paymentDate: string; tdsAmount: Prisma.Decimal; tds: PaymentTds | null }) {
    const now = await tx.tdsDeduction.findUnique({ where: { vendorPaymentId: p.id }, include: { challan: { select: { bsrCode: true, challanSerial: true, depositedOn: true } } } });
    const want = p.tds && p.tdsAmount.gt(0) ? p.tds : null;
    if (!now && !want) return;
    if (now) {
      const same =
        want &&
        dateOnly(now.paidOn) === p.paymentDate &&
        now.tdsAmount.eq(p.tdsAmount) &&
        now.section === want.section &&
        now.amountPaid.eq(want.base);
      if (same) return;
      this.refuseInChallan(now, 'this payment');
    }
    await this.holdQuarters(tx, organizationId, [...(now ? [{ form: now.form, paidOn: dateOnly(now.paidOn) }] : []), { form: 'FORM_26Q' as const, paidOn: p.paymentDate }], 'this payment');
    if (!want) {
      await tx.tdsDeduction.delete({ where: { id: now!.id } });
      return;
    }
    const v = await tx.vendor.findUniqueOrThrow({ where: { id: p.vendorId }, select: { id: true, name: true, pan: true } });
    const draft = this.vendorDraft(v, p.projectId, p.paymentDate, p.tdsAmount, want);
    if (now) await tx.tdsDeduction.update({ where: { id: now.id }, data: { ...draft, paidOn: parseDate(p.paymentDate) } });
    else await tx.tdsDeduction.create({ data: { ...draft, organizationId, paidOn: parseDate(p.paymentDate), vendorPaymentId: p.id } });
  }

  /** Payments about to be taken off by payables, in its transaction: their deductions go first, never one in a challan or a filed quarter. */
  async dropPayments(tx: Tx, organizationId: string, paymentIds: string[]) {
    if (!paymentIds.length) return;
    const rows = await tx.tdsDeduction.findMany({ where: { vendorPaymentId: { in: paymentIds } }, include: { challan: { select: { bsrCode: true, challanSerial: true, depositedOn: true } } } });
    if (!rows.length) return;
    for (const r of rows) this.refuseInChallan(r, 'this payment');
    await this.holdQuarters(tx, organizationId, rows.map((r) => ({ form: r.form, paidOn: dateOnly(r.paidOn) })), 'this payment');
    await tx.tdsDeduction.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
  }

  /** A subcontractor bill as it is approved, in the approval's transaction: its TDS under 194C on the work value. */
  async forSubcontractBill(tx: Tx, organizationId: string, billId: string) {
    const b = await tx.subcontractBill.findUniqueOrThrow({
      where: { id: billId },
      select: { id: true, projectId: true, billDate: true, grossAmount: true, tdsPct: true, tdsAmount: true, workOrder: { select: { vendor: { select: { id: true, name: true, pan: true } } } } },
    });
    if (b.tdsAmount.lte(0)) return;
    const v = b.workOrder.vendor;
    const pan = validPan(v.pan);
    const noPanRate = !pan && (rateMilliOf(b.tdsPct.toString()) ?? 0) >= TDS_SECTIONS['194C'].noPanRate;
    await this.write(
      tx,
      organizationId,
      [
        {
          form: 'FORM_26Q',
          section: '194C',
          vendorId: v.id,
          employeeId: null,
          deducteeName: v.name,
          deducteePan: pan,
          deducteeRef: null,
          projectId: b.projectId,
          paidOn: dateOnly(b.billDate),
          amountPaid: b.grossAmount,
          rate: b.tdsPct,
          tdsAmount: b.tdsAmount,
          reason: noPanRate ? 'C' : null,
          certificateNo: null,
          subcontractBillId: b.id,
        },
      ],
      'a subcontractor bill with TDS',
    );
  }

  /** A salary run as it is approved, in the approval's transaction: each payslip's TDS under 192, on the month's last day. */
  async forPayrollRun(tx: Tx, organizationId: string, runId: string) {
    const run = await tx.payrollRun.findUniqueOrThrow({ where: { id: runId }, select: { month: true } });
    const [y, m] = run.month.split('-').map(Number);
    const paidOn = dateOnly(new Date(Date.UTC(y, m, 0)));
    const slips = await tx.payslip.findMany({
      where: { runId, lines: { some: { code: 'TDS', amount: { gt: 0 } } } },
      select: { id: true, employeeId: true, employeeName: true, employeeCode: true, pan: true, projectId: true, gross: true, lines: { where: { code: 'TDS' }, select: { amount: true } } },
    });
    await this.write(
      tx,
      organizationId,
      slips.map((s) => {
        const tds = s.lines.reduce((n, l) => n.add(l.amount), D(0));
        return {
          form: 'FORM_24Q' as const,
          section: '192' as const,
          vendorId: null,
          employeeId: s.employeeId,
          deducteeName: s.employeeName,
          deducteePan: validPan(s.pan),
          deducteeRef: s.employeeCode,
          projectId: s.projectId,
          paidOn,
          amountPaid: s.gross,
          rate: s.gross.gt(0) ? tds.mul(100).div(s.gross).toDecimalPlaces(3) : null,
          tdsAmount: tds,
          reason: null,
          certificateNo: null,
          payslipId: s.id,
        };
      }),
      `the salary of ${run.month}`,
    );
  }

  /** A salary run sent back after approval, in its transaction: its deductions go, never once in a challan or a filed quarter. */
  async dropPayrollRun(tx: Tx, organizationId: string, runId: string) {
    const rows = await tx.tdsDeduction.findMany({ where: { payslip: { runId } }, include: { challan: { select: { bsrCode: true, challanSerial: true, depositedOn: true } } } });
    if (!rows.length) return;
    for (const r of rows) this.refuseInChallan(r, 'this salary run');
    await this.holdQuarters(tx, organizationId, rows.map((r) => ({ form: r.form, paidOn: dateOnly(r.paidOn) })), 'this salary run');
    await tx.tdsDeduction.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
  }
}
