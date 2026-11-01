import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BillingPayment, Prisma } from '@prisma/client';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import type { BillingAmountDto, BillingDetailsDto, BillingInvoiceDto, BillingOrderDto, BillingSummaryDto, BillingUnit } from '@erp/shared';
import { BILLING_GST_PCT, BILLING_REMIND_DAYS, BILLING_UNIT_LABELS, BILLING_YEAR_CHARGED_MONTHS, PRODUCT_NAME, canManageBilling, gstStateCode } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { withoutTenant } from '../prisma/tenant-context';
import { RequestUser } from '../common/current-user';
import { BillingConfig, aiPlanAllowanceInr, billingConfig, billingState, billingUnits } from '../common/billing';
import { EmailService, escapeHtml } from '../notifications/email.service';
import { emailButton, emailLayout } from '../notifications/email-layout';
import { MessagingService } from '../messaging/messaging.service';
import { todayIn } from '../notifications/time';
import { BillingDetailsInput } from './billing.dto';

const D = Prisma.Decimal;
const money = (d: Prisma.Decimal) => d.toFixed(2);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (date: string, n: number) => iso(new Date(day(date).getTime() + n * 86_400_000));
/** Last day of a period of `months` starting on `from`: the day before the same date that many months on (or the month's end). */
export function periodEnd(from: string, months: number): string {
  const [y, m, d] = from.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const daysIn = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const next = d <= daysIn ? new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), d)) : new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 1));
  return addDays(iso(next), -1);
}
/** Indian financial year of a date, as "2627" for April 2026 to March 2027. */
const fyCode = (date: string) => {
  const [y, m] = date.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${String(start).slice(2)}${String(start + 1).slice(2)}`;
};
const signature = (secret: string, payload: string) => createHmac('sha256', secret).update(payload).digest('hex');
const sameSignature = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Plans and billing: the trial, what the next payment is, Razorpay orders, and the GST invoice once paid. */
@Injectable()
export class BillingService {
  private readonly log = new Logger(BillingService.name);

  constructor(
    private prisma: PrismaService,
    private email: EmailService,
    private messaging: MessagingService,
  ) {}

  private cfg(): BillingConfig {
    const cfg = billingConfig();
    if (!cfg) throw new NotFoundException(`Billing is not switched on for this ${PRODUCT_NAME} server`);
    return cfg;
  }

  private assertAdmin(user: RequestUser) {
    if (!canManageBilling(user.roleKey)) throw new ForbiddenException('Only an admin can manage billing');
  }

  private units(cfg: BillingConfig, organizationId: string) {
    return billingUnits(this.prisma, cfg, organizationId);
  }

  private amount(cfg: BillingConfig, units: number, months: 1 | 12, buyerState: string | null): BillingAmountDto {
    const chargedMonths = months === 12 ? BILLING_YEAR_CHARGED_MONTHS : 1;
    const taxable = new D(cfg.price).mul(units).mul(chargedMonths).toDecimalPlaces(2);
    const intra = (buyerState ?? cfg.seller.stateCode) === cfg.seller.stateCode;
    const half = taxable.mul(BILLING_GST_PCT / 2).div(100).toDecimalPlaces(2);
    const cgst = intra ? half : new D(0);
    const igst = intra ? new D(0) : taxable.mul(BILLING_GST_PCT).div(100).toDecimalPlaces(2);
    return { months, chargedMonths, taxable: money(taxable), cgst: money(cgst), sgst: money(cgst), igst: money(igst), total: money(taxable.add(cgst).add(cgst).add(igst)) };
  }

  private details(org: { name: string; billingName: string | null; billingGstin: string | null; billingAddress: string | null; billingStateCode: string | null }): BillingDetailsDto {
    return { name: org.billingName ?? org.name, gstin: org.billingGstin, address: org.billingAddress, stateCode: org.billingStateCode ?? gstStateCode(org.billingGstin) };
  }

  async summary(user: RequestUser): Promise<BillingSummaryDto> {
    const cfg = this.cfg();
    this.assertAdmin(user);
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId } });
    const details = this.details(org);
    const units = await this.units(cfg, org.id);
    const state = billingState(cfg, org, todayIn());
    return {
      ...state,
      unit: cfg.unit,
      unitPrice: money(new D(cfg.price)),
      units,
      monthly: this.amount(cfg, units, 1, details.stateCode),
      yearly: this.amount(cfg, units, 12, details.stateCode),
      details,
      detailsComplete: !!(details.name && details.address && details.stateCode),
      seller: { name: cfg.seller.name, gstin: cfg.seller.gstin, address: cfg.seller.address, stateCode: cfg.seller.stateCode },
      keyId: cfg.keyId,
      ai: { allowanceInr: aiPlanAllowanceInr(cfg, state.status, units), perUnitInr: cfg.aiPerUnitInr, trialInr: cfg.aiTrialInr },
    };
  }

  async updateDetails(user: RequestUser, dto: BillingDetailsInput): Promise<BillingSummaryDto> {
    this.cfg();
    this.assertAdmin(user);
    const stateCode = gstStateCode(dto.gstin) ?? dto.stateCode ?? null;
    if (!stateCode) throw new BadRequestException('Choose the state the service is supplied to, or give a GSTIN');
    await this.prisma.organization.update({
      where: { id: user.organizationId },
      data: { billingName: dto.name, billingGstin: dto.gstin ?? null, billingAddress: dto.address, billingStateCode: stateCode },
    });
    return this.summary(user);
  }

  /** A Razorpay order for the next month or year; Checkout in the browser takes the payment. */
  async createOrder(user: RequestUser, months: 1 | 12): Promise<BillingOrderDto> {
    const cfg = this.cfg();
    const summary = await this.summary(user);
    if (summary.status === 'EXEMPT') throw new BadRequestException(`This company is not charged for ${PRODUCT_NAME}`);
    if (!summary.detailsComplete) throw new BadRequestException('Fill in who the invoice is made out to first');
    const amount = months === 12 ? summary.yearly : summary.monthly;
    const id = randomUUID();
    const paise = Math.round(Number(amount.total) * 100);
    const unitLabel = BILLING_UNIT_LABELS[cfg.unit][summary.units === 1 ? 'one' : 'many'];
    const description = `${PRODUCT_NAME}, ${summary.units} ${unitLabel}, ${months === 12 ? '1 year' : '1 month'}`;
    const res = await fetch(`${cfg.apiUrl}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Basic ${Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString('base64')}` },
      body: JSON.stringify({ amount: paise, currency: 'INR', receipt: id, notes: { organizationId: user.organizationId, description } }),
    }).catch((e: Error) => {
      throw new BadRequestException(`Could not reach Razorpay: ${e.message}`);
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; error?: { description?: string } };
    if (!res.ok || !body.id) {
      this.log.warn(`Razorpay order failed (${res.status}): ${JSON.stringify(body)}`);
      throw new BadRequestException(`Razorpay refused the order: ${body.error?.description ?? res.status}`);
    }
    const d = summary.details;
    await this.prisma.billingPayment.create({
      data: {
        id,
        organizationId: user.organizationId,
        razorpayOrderId: body.id,
        unit: cfg.unit,
        units: summary.units,
        months,
        chargedMonths: amount.chargedMonths,
        rate: summary.unitPrice,
        taxable: amount.taxable,
        cgst: amount.cgst,
        sgst: amount.sgst,
        igst: amount.igst,
        total: amount.total,
        buyerName: d.name,
        buyerGstin: d.gstin,
        buyerAddress: d.address,
        buyerStateCode: d.stateCode!,
        sellerStateCode: cfg.seller.stateCode,
        createdById: user.id,
        createdByEmail: user.email,
      },
    });
    return { paymentId: id, orderId: body.id, amount: paise, currency: 'INR', keyId: cfg.keyId, description, prefill: { name: user.fullName, email: user.email } };
  }

  /** Checkout's success handler: the signature proves Razorpay took the payment for this order. */
  async verify(user: RequestUser, orderId: string, paymentId: string, sig: string): Promise<BillingSummaryDto> {
    const cfg = this.cfg();
    this.assertAdmin(user);
    const row = await this.prisma.billingPayment.findFirst({ where: { razorpayOrderId: orderId, organizationId: user.organizationId } });
    if (!row) throw new NotFoundException('Payment not found');
    if (!sameSignature(signature(cfg.keySecret, `${orderId}|${paymentId}`), sig)) throw new BadRequestException('The payment could not be verified');
    await this.markPaid(row.id, paymentId);
    return this.summary(user);
  }

  /** Razorpay's webhook (payment.captured / order.paid): records payments whose browser closed before verify. */
  async webhook(rawBody: Buffer | undefined, sig: string | undefined): Promise<{ ok: boolean }> {
    const cfg = this.cfg();
    if (!cfg.webhookSecret || !rawBody || !sig || !sameSignature(signature(cfg.webhookSecret, rawBody.toString('utf8')), sig)) throw new BadRequestException('Bad signature');
    const event = JSON.parse(rawBody.toString('utf8')) as { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string; status?: string } } } };
    const payment = event.payload?.payment?.entity;
    if (!['payment.captured', 'order.paid'].includes(event.event ?? '') || !payment?.id || !payment.order_id) return { ok: true };
    const row = await withoutTenant(async () => await this.prisma.billingPayment.findUnique({ where: { razorpayOrderId: payment.order_id } }));
    if (row) await this.markPaid(row.id, payment.id!);
    return { ok: true };
  }

  /** Once per payment: extend the paid period, number the GST invoice, write the company log and send a receipt. */
  private async markPaid(id: string, razorpayPaymentId: string) {
    const cfg = this.cfg();
    const today = todayIn();
    const paid = await withoutTenant(async () =>
      await this.prisma.$transaction(async (tx) => {
        // One invoice number at a time across all companies (numbers run per financial year, without gaps).
        await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext('billing-invoice'))) l`;
        const row = await tx.billingPayment.findUniqueOrThrow({ where: { id } });
        if (row.status === 'PAID') return null;
        const org = await tx.organization.findUniqueOrThrow({ where: { id: row.organizationId } });
        let from = today;
        const trialEnd = org.trialEndsAt ? iso(org.trialEndsAt) : null;
        const paidUntil = org.paidUntil ? iso(org.paidUntil) : null;
        if (trialEnd && trialEnd >= from) from = addDays(trialEnd, 1);
        if (paidUntil && paidUntil >= today && addDays(paidUntil, 1) > from) from = addDays(paidUntil, 1);
        const to = periodEnd(from, row.months);
        const prefix = `${cfg.invoicePrefix}${fyCode(today)}-`;
        const issued = await tx.billingPayment.count({ where: { invoiceNo: { startsWith: prefix } } });
        const invoiceNo = `${prefix}${String(issued + 1).padStart(5, '0')}`;
        const updated = await tx.billingPayment.update({
          where: { id },
          data: { status: 'PAID', razorpayPaymentId, paidAt: new Date(), invoiceNo, invoiceDate: day(today), periodFrom: day(from), periodTo: day(to) },
        });
        await tx.organization.update({ where: { id: org.id }, data: { paidUntil: day(to) } });
        await tx.auditLog.create({
          data: { organizationId: org.id, actorId: row.createdById, entityType: 'COMPANY', entityId: org.id, action: 'SUBSCRIPTION_PAID', note: `Paid ₹${row.total.toFixed(2)} for ${from} to ${to}, invoice ${invoiceNo}` },
        });
        return { row: updated, orgName: org.name };
      }),
    );
    if (!paid) return;
    const link = this.messaging.webUrl('/billing');
    const subject = `${PRODUCT_NAME} invoice ${paid.row.invoiceNo}`;
    const html = `Thank you. We received ₹${paid.row.total.toFixed(2)} for ${escapeHtml(paid.orgName)}, covering ${iso(paid.row.periodFrom!)} to ${iso(paid.row.periodTo!)}. Your GST invoice ${paid.row.invoiceNo} is under Billing.`;
    await this.email
      .send({ to: paid.row.createdByEmail, subject, html: emailLayout({ preheader: subject, body: `<p>${html}</p>${link !== '-' ? emailButton(link, 'Billing') : ''}`, orgName: escapeHtml(paid.orgName) }), text: html })
      .catch((e) => this.log.warn(`receipt email: ${e}`));
  }

  async invoices(user: RequestUser): Promise<BillingInvoiceDto[]> {
    const cfg = this.cfg();
    this.assertAdmin(user);
    const rows = await this.prisma.billingPayment.findMany({ where: { organizationId: user.organizationId, status: 'PAID' }, orderBy: { paidAt: 'desc' } });
    return rows.map((r) => this.toInvoice(cfg, r));
  }

  async invoice(user: RequestUser, id: string): Promise<BillingInvoiceDto> {
    const cfg = this.cfg();
    this.assertAdmin(user);
    const row = await this.prisma.billingPayment.findFirst({ where: { id, organizationId: user.organizationId, status: 'PAID' } });
    if (!row) throw new NotFoundException('Invoice not found');
    return this.toInvoice(cfg, row);
  }

  private toInvoice(cfg: BillingConfig, r: BillingPayment): BillingInvoiceDto {
    return {
      id: r.id,
      status: r.status,
      invoiceNo: r.invoiceNo,
      invoiceDate: r.invoiceDate ? iso(r.invoiceDate) : null,
      periodFrom: r.periodFrom ? iso(r.periodFrom) : null,
      periodTo: r.periodTo ? iso(r.periodTo) : null,
      unit: r.unit as BillingUnit,
      units: r.units,
      months: r.months,
      chargedMonths: r.chargedMonths,
      rate: money(r.rate),
      taxable: money(r.taxable),
      cgst: money(r.cgst),
      sgst: money(r.sgst),
      igst: money(r.igst),
      total: money(r.total),
      buyer: { name: r.buyerName, gstin: r.buyerGstin, address: r.buyerAddress, stateCode: r.buyerStateCode },
      seller: { name: cfg.seller.name, gstin: cfg.seller.gstin, address: cfg.seller.address, stateCode: r.sellerStateCode, sac: cfg.seller.sac },
      razorpayPaymentId: r.razorpayPaymentId,
      paidAt: r.paidAt?.toISOString() ?? null,
    };
  }

  /**
   * Daily (with the digest cron): companies without a trial date start their trial today (so switching billing on gives
   * everyone a full trial), and admins hear once each when the trial or paid period is about to end, and when it has.
   */
  async daily(today = todayIn()): Promise<{ trialsStarted: number; reminded: number }> {
    const cfg = billingConfig();
    if (!cfg) return { trialsStarted: 0, reminded: 0 };
    return withoutTenant(async () => {
      const started = await this.prisma.organization.updateMany({
        where: { trialEndsAt: null, code: { notIn: cfg.exemptCodes } },
        data: { trialEndsAt: day(addDays(today, cfg.trialDays)) },
      });
      const orgs = await this.prisma.organization.findMany({
        where: { code: { notIn: cfg.exemptCodes }, suspendedAt: null },
        select: { id: true, name: true, code: true, trialEndsAt: true, paidUntil: true, billingRemindedFor: true },
      });
      let reminded = 0;
      for (const org of orgs) {
        const state = billingState(cfg, org, today);
        const ends = state.status === 'ACTIVE' ? state.paidUntil : state.status === 'TRIAL' ? state.trialEndsAt : [state.trialEndsAt, state.paidUntil].filter(Boolean).sort().pop();
        if (!ends) continue;
        const daysLeft = Math.round((day(ends).getTime() - day(today).getTime()) / 86_400_000);
        const bucket = state.status === 'READ_ONLY' ? 'ENDED' : daysLeft <= 1 ? '1' : daysLeft <= BILLING_REMIND_DAYS ? String(BILLING_REMIND_DAYS) : null;
        const key = bucket && `${state.status}:${ends}:${bucket}`;
        if (!key || key === org.billingRemindedFor) continue;
        const what = state.status === 'TRIAL' ? 'free trial' : 'subscription';
        const subject =
          state.status === 'READ_ONLY'
            ? `${org.name} is read-only on ${PRODUCT_NAME}`
            : `Your ${PRODUCT_NAME} ${what} ends ${daysLeft <= 0 ? 'today' : daysLeft === 1 ? 'tomorrow' : `on ${ends}`}`;
        const html =
          state.status === 'READ_ONLY'
            ? `The ${PRODUCT_NAME} trial or subscription for ${escapeHtml(org.name)} ended on ${ends}. Everyone can still see and export everything, but nothing new can be entered until an admin renews under Billing.`
            : `The ${PRODUCT_NAME} ${what} for ${escapeHtml(org.name)} ends on <b>${ends}</b>. After that the company becomes read-only until an admin pays under Billing. Nothing is deleted.`;
        await this.tellAdmins(org.id, org.name, subject, html);
        await this.prisma.organization.update({ where: { id: org.id }, data: { billingRemindedFor: key } });
        reminded++;
      }
      return { trialsStarted: started.count, reminded };
    });
  }

  private async tellAdmins(orgId: string, orgName: string, subject: string, html: string) {
    const admins = await this.prisma.user.findMany({ where: { organizationId: orgId, isActive: true, role: { key: 'ADMIN' } }, select: { email: true } });
    const link = this.messaging.webUrl('/billing');
    const body = `<p>${html}</p>${link !== '-' ? emailButton(link, 'Billing') : ''}`;
    const text = `${html.replace(/<[^>]+>/g, '')}${link !== '-' ? `\n\n${link}` : ''}`;
    for (const a of admins) {
      await this.email.send({ to: a.email, subject, html: emailLayout({ preheader: subject, body, orgName: escapeHtml(orgName) }), text }).catch((e) => this.log.warn(`billing email to ${a.email}: ${e}`));
    }
  }
}
