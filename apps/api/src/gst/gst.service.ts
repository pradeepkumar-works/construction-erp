import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  canViewGstRegisters,
  gstStateCode,
  subBillLabel,
  type GstInwardRowDto,
  type GstOutwardRowDto,
  type GstRegistersDto,
  type GstTaxTotalsDto,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { dateOnly, money, parseDate } from '../common/serialize';
import { isInterState } from '../tally/vouchers';
import { GstRangeQuery } from './gst.dto';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const ZERO = D(0);
/** GST allows an invoice number of at most 16 characters. */
const MAX_INVOICE_NO = 16;

/** Tax on a value: IGST across states, else CGST and SGST in halves (the odd paisa to SGST), as the Tally export posts it. */
function split(gst: Prisma.Decimal, interState: boolean) {
  if (interState) return { igst: gst, cgst: ZERO, sgst: ZERO };
  const cgst = gst.div(2).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  return { igst: ZERO, cgst, sgst: gst.sub(cgst) };
}

interface Sums {
  taxable: Prisma.Decimal;
  igst: Prisma.Decimal;
  cgst: Prisma.Decimal;
  sgst: Prisma.Decimal;
}
const totals = (rows: { taxable: string; igst: string; cgst: string; sgst: string }[]): GstTaxTotalsDto => {
  const t = rows.reduce<Sums>((s, r) => ({ taxable: s.taxable.add(r.taxable), igst: s.igst.add(r.igst), cgst: s.cgst.add(r.cgst), sgst: s.sgst.add(r.sgst) }), { taxable: ZERO, igst: ZERO, cgst: ZERO, sgst: ZERO });
  return { taxable: money(t.taxable)!, igst: money(t.igst)!, cgst: money(t.cgst)!, sgst: money(t.sgst)!, tax: money(t.igst.add(t.cgst).add(t.sgst))! };
};

/**
 * GST registers (v3 item 25), for the accountant to file GSTR-1 and reconcile input tax with GSTR-2B. Outward supplies
 * are approved RA bills by bill date: works on a site are supplied where the site is, which is where the contractor
 * bills from, so their GST is CGST + SGST. Input tax comes from approved vendor bills (by invoice date, a row per GST
 * rate of their lines), subcontractor bills and site expenses with GST; only invoices with the supplier's GSTIN can be
 * claimed; debit notes against those bills reverse their input tax (v5 item 91). E-invoicing is not done here.
 */
@Injectable()
export class GstService {
  constructor(private prisma: PrismaService) {}

  async registers(user: RequestUser, q: GstRangeQuery): Promise<GstRegistersDto> {
    if (!canViewGstRegisters(user.roleKey)) throw new ForbiddenException('Only admin, management and accounts see the GST registers');
    const from = parseDate(q.from);
    const to = parseDate(q.to);
    if (from > to) throw new BadRequestException('From is after to');
    const org = user.organizationId;
    const range = { gte: from, lte: to };
    const project = { select: { code: true, name: true } };
    const [config, raBills, vendorBills, subBills, expenses, debitNotes] = await Promise.all([
      this.prisma.tallyConfig.findUnique({ where: { organizationId: org }, select: { stateCode: true } }),
      this.prisma.raBill.findMany({
        where: { organizationId: org, status: 'APPROVED', billDate: range },
        include: { project: { select: { code: true, name: true, clientName: true, client: { select: { name: true, gstin: true, stateCode: true } } } } },
        orderBy: [{ billDate: 'asc' }, { billNo: 'asc' }],
      }),
      this.prisma.vendorBill.findMany({
        where: { organizationId: org, status: 'APPROVED', invoiceDate: range },
        include: { project, vendor: { select: { name: true, gstin: true, stateCode: true } }, lines: { select: { gstRate: true, amount: true, gstAmount: true } } },
        orderBy: { invoiceDate: 'asc' },
      }),
      this.prisma.subcontractBill.findMany({
        where: { organizationId: org, status: 'APPROVED', billDate: range, gstAmount: { gt: 0 } },
        include: { project, workOrder: { select: { woNo: true, vendor: { select: { name: true, gstin: true, stateCode: true } } } } },
        orderBy: { billDate: 'asc' },
      }),
      this.prisma.expense.findMany({ where: { organizationId: org, status: 'APPROVED', date: range, gstAmount: { gt: 0 } }, include: { project }, orderBy: { date: 'asc' } }),
      this.prisma.debitNote.findMany({
        where: { organizationId: org, cancelledAt: null, date: range, gstAmount: { gt: 0 } },
        include: { project, vendor: { select: { name: true, gstin: true, stateCode: true } }, vendorBill: { select: { invoiceNo: true } }, subcontractBill: { select: { invoiceNo: true } }, lines: { select: { gstRate: true, amount: true, gstAmount: true } } },
        orderBy: { date: 'asc' },
      }),
    ]);
    const ours = config?.stateCode ?? null;
    const warnings: string[] = [];
    if (!ours) warnings.push('Set the GST state code the company bills from (Tally Export → Ledgers) so purchases from other states show as IGST.');

    const outward: GstOutwardRowDto[] = raBills.map((b) => {
      const c = b.project.client;
      const gstin = c?.gstin ?? null;
      const invoiceNo = `RA/${b.project.code}/${b.billNo}`;
      if (invoiceNo.length > MAX_INVOICE_NO) warnings.push(`${invoiceNo} is longer than the 16 characters GST allows for an invoice number: shorten the project code.`);
      const tax = split(b.gstAmount, false);
      return {
        billId: b.id,
        projectId: b.projectId,
        projectCode: b.project.code,
        projectName: b.project.name,
        invoiceNo,
        invoiceDate: dateOnly(b.billDate)!,
        section: gstin ? 'B2B' : 'B2CS',
        recipientGstin: gstin,
        recipientName: c?.name ?? b.project.clientName ?? b.project.name,
        placeOfSupply: ours ?? c?.stateCode ?? gstStateCode(gstin),
        rate: money(b.gstRate)!,
        taxable: money(b.grossAmount.add(b.pvAmount))!,
        igst: money(tax.igst)!,
        cgst: money(tax.cgst)!,
        sgst: money(tax.sgst)!,
        invoiceValue: money(b.grossAmount.add(b.pvAmount).add(b.gstAmount))!,
      };
    });

    const inward: GstInwardRowDto[] = [];
    let ineligible = ZERO;
    const push = (r: Omit<GstInwardRowDto, 'igst' | 'cgst' | 'sgst' | 'taxable' | 'rate' | 'itcEligible'>, rate: Prisma.Decimal, taxable: Prisma.Decimal, gst: Prisma.Decimal, supplierState: string | null) => {
      const itcEligible = !!r.supplierGstin;
      if (!itcEligible) ineligible = ineligible.add(gst);
      const tax = split(gst, isInterState(ours, supplierState));
      inward.push({ ...r, rate: money(rate)!, taxable: money(taxable)!, igst: money(tax.igst)!, cgst: money(tax.cgst)!, sgst: money(tax.sgst)!, itcEligible });
    };
    for (const b of vendorBills) {
      const byRate = new Map<string, { rate: Prisma.Decimal; taxable: Prisma.Decimal; gst: Prisma.Decimal }>();
      for (const l of b.lines) {
        const k = l.gstRate.toFixed(2);
        const g = byRate.get(k) ?? { rate: l.gstRate, taxable: ZERO, gst: ZERO };
        byRate.set(k, { rate: g.rate, taxable: g.taxable.add(l.amount), gst: g.gst.add(l.gstAmount) });
      }
      for (const [k, g] of byRate) {
        if (g.gst.isZero()) continue;
        push(
          {
            key: `VENDOR_BILL:${b.id}:${k}`,
            source: 'VENDOR_BILL',
            sourceId: b.id,
            ref: b.billNo,
            projectCode: b.project.code,
            projectName: b.project.name,
            supplierGstin: b.vendor.gstin,
            supplierName: b.vendor.name,
            invoiceNo: b.invoiceNo,
            invoiceDate: dateOnly(b.invoiceDate)!,
            invoiceValue: money(b.total)!,
          },
          g.rate,
          g.taxable,
          g.gst,
          gstStateCode(b.vendor.gstin) ?? b.vendor.stateCode,
        );
      }
    }
    for (const b of subBills) {
      const v = b.workOrder.vendor;
      const label = subBillLabel(b.workOrder.woNo, b.billNo, b.isFinal);
      push(
        {
          key: `SUBCONTRACT_BILL:${b.id}`,
          source: 'SUBCONTRACT_BILL',
          sourceId: b.id,
          ref: label,
          projectCode: b.project.code,
          projectName: b.project.name,
          supplierGstin: v.gstin,
          supplierName: v.name,
          invoiceNo: b.invoiceNo,
          invoiceDate: dateOnly(b.billDate)!,
          invoiceValue: money(b.grossAmount.add(b.gstAmount))!,
        },
        b.gstRate,
        b.grossAmount,
        b.gstAmount,
        gstStateCode(v.gstin) ?? v.stateCode,
      );
    }
    for (const e of expenses) {
      push(
        {
          key: `EXPENSE:${e.id}`,
          source: 'EXPENSE',
          sourceId: e.id,
          ref: e.expenseNo,
          projectCode: e.project.code,
          projectName: e.project.name,
          supplierGstin: e.vendorGstin,
          supplierName: e.vendor ?? e.description,
          invoiceNo: e.billNo,
          invoiceDate: dateOnly(e.date)!,
          invoiceValue: money(e.totalAmount)!,
        },
        e.gstRate,
        e.amount,
        e.gstAmount,
        gstStateCode(e.vendorGstin),
      );
    }
    // A debit note against a bill reverses that much of its input tax (v5 item 91): negative rows, a row per GST rate.
    for (const n of debitNotes) {
      const byRate = new Map<string, { rate: Prisma.Decimal; taxable: Prisma.Decimal; gst: Prisma.Decimal }>();
      for (const l of n.lines) {
        const k = l.gstRate.toFixed(2);
        const g = byRate.get(k) ?? { rate: l.gstRate, taxable: ZERO, gst: ZERO };
        byRate.set(k, { rate: g.rate, taxable: g.taxable.add(l.amount), gst: g.gst.add(l.gstAmount) });
      }
      for (const [k, g] of byRate) {
        if (g.gst.isZero()) continue;
        push(
          {
            key: `DEBIT_NOTE:${n.id}:${k}`,
            source: 'DEBIT_NOTE',
            sourceId: n.id,
            ref: n.noteNo,
            projectCode: n.project.code,
            projectName: n.project.name,
            supplierGstin: n.vendor.gstin,
            supplierName: n.vendor.name,
            invoiceNo: n.vendorBill?.invoiceNo ?? n.subcontractBill?.invoiceNo ?? null,
            invoiceDate: dateOnly(n.date)!,
            invoiceValue: money(n.total.neg())!,
          },
          g.rate,
          g.taxable.neg(),
          g.gst.neg(),
          gstStateCode(n.vendor.gstin) ?? n.vendor.stateCode,
        );
      }
    }
    inward.sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate) || a.ref.localeCompare(b.ref));
    const missing = inward.filter((r) => !r.itcEligible).length;
    if (missing) warnings.push(`${missing} purchase${missing === 1 ? ' has' : 's have'} GST but no supplier GSTIN: that tax cannot be claimed.`);
    const noInvoice = inward.filter((r) => r.itcEligible && !r.invoiceNo).length;
    if (noInvoice) warnings.push(`${noInvoice} purchase${noInvoice === 1 ? ' has' : 's have'} no supplier invoice number to match with GSTR-2B.`);

    return {
      from: q.from,
      to: q.to,
      stateCode: ours,
      outward,
      outwardTotals: totals(outward),
      inward,
      inwardTotals: totals(inward.filter((r) => r.itcEligible)),
      ineligibleTax: money(ineligible)!,
      warnings,
    };
  }
}
