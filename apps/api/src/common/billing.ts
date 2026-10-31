import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { BillingStateDto, BillingStatus, BillingUnit, RoleKey } from '@erp/shared';
import { GUEST_ROLES, PRODUCT_NAME, gstStateCode } from '@erp/shared';
import type { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from './current-user';

/**
 * Plans and billing. Billing is on only when Razorpay keys, a price and the seller's GST details are all
 * set; until then every company works as before and nothing is charged.
 */
export interface BillingConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string | null;
  apiUrl: string;
  unit: BillingUnit;
  /** Rupees per unit per month, before GST */
  price: string;
  trialDays: number;
  exemptCodes: string[];
  seller: { name: string; gstin: string; address: string; stateCode: string; sac: string };
  invoicePrefix: string;
  /** Ask Nirmaan included in the price: rupees a month per unit once paid, and for the whole trial month */
  aiPerUnitInr: number;
  aiTrialInr: number;
}

export function billingConfig(): BillingConfig | null {
  const e = process.env;
  const price = (e.BILLING_PRICE ?? '').trim();
  const gstin = (e.BILLING_SELLER_GSTIN ?? '').trim().toUpperCase();
  if (!e.RAZORPAY_KEY_ID || !e.RAZORPAY_KEY_SECRET || !/^\d+(\.\d{1,2})?$/.test(price) || Number(price) <= 0 || !e.BILLING_SELLER_NAME || !gstStateCode(gstin)) return null;
  return {
    keyId: e.RAZORPAY_KEY_ID,
    keySecret: e.RAZORPAY_KEY_SECRET,
    webhookSecret: e.RAZORPAY_WEBHOOK_SECRET || null,
    apiUrl: (e.RAZORPAY_API_URL || 'https://api.razorpay.com/v1').replace(/\/$/, ''),
    unit: (e.BILLING_UNIT ?? '').toLowerCase() === 'user' ? 'USER' : 'PROJECT',
    price,
    trialDays: Math.max(1, Number(e.BILLING_TRIAL_DAYS) || 30),
    exemptCodes: (e.BILLING_EXEMPT_ORG_CODES ?? 'DEMO').split(',').map((c) => c.trim().toUpperCase()).filter(Boolean),
    seller: { name: e.BILLING_SELLER_NAME, gstin, address: e.BILLING_SELLER_ADDRESS ?? '', stateCode: gstStateCode(gstin)!, sac: e.BILLING_SAC || '998314' },
    invoicePrefix: (e.BILLING_INVOICE_PREFIX || 'NIR').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5),
    aiPerUnitInr: wholeRupees(e.BILLING_AI_INR_PER_UNIT, 150),
    aiTrialInr: wholeRupees(e.BILLING_AI_TRIAL_INR, 1000),
  };
}

const wholeRupees = (v: string | undefined, fallback: number) => (v !== undefined && /^\d+$/.test(v.trim()) ? Number(v.trim()) : fallback);

/** Active projects, or active staff (guests are free); at least one. What the price, and the AI allowance, are counted by. */
export async function billingUnits(prisma: PrismaService, cfg: BillingConfig, organizationId: string): Promise<number> {
  const n =
    cfg.unit === 'PROJECT'
      ? await prisma.project.count({ where: { organizationId, status: 'ACTIVE' } })
      : await prisma.user.count({ where: { organizationId, isActive: true, role: { key: { notIn: GUEST_ROLES as RoleKey[] } } } });
  return Math.max(1, n);
}

/**
 * Rupees a month of Ask Nirmaan the plan includes: a fixed amount in the trial, the per-unit amount for
 * each unit paid for, nothing while read-only. Null for a company that is not charged, which keeps its own cap.
 */
export function aiPlanAllowanceInr(cfg: BillingConfig, status: BillingStatus, units: number): number | null {
  if (status === 'EXEMPT') return null;
  if (status === 'READ_ONLY') return 0;
  if (status === 'TRIAL') return cfg.aiTrialInr;
  return cfg.aiPerUnitInr * Math.max(1, units);
}

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** Where a company stands: exempt, paid up, in its trial (also before the trial has a date), or read-only. */
export function billingState(cfg: BillingConfig, org: { code: string; trialEndsAt: Date | null; paidUntil: Date | null }, today: string): BillingStateDto {
  const trialEndsAt = iso(org.trialEndsAt);
  const paidUntil = iso(org.paidUntil);
  const base = { trialEndsAt, paidUntil };
  if (cfg.exemptCodes.includes(org.code.toUpperCase())) return { status: 'EXEMPT', ...base };
  if (paidUntil && paidUntil >= today) return { status: 'ACTIVE', ...base };
  if (!trialEndsAt || trialEndsAt >= today) return { status: 'TRIAL', ...base };
  return { status: 'READ_ONLY', ...base };
}

/** Routes an unpaid company can still use to write: paying, its own account, notifications, and its data rights. */
export const ALLOW_WHEN_UNPAID_KEY = 'allowWhenUnpaid';
export const AllowWhenUnpaid = () => SetMetadata(ALLOW_WHEN_UNPAID_KEY, true);

/** A company whose trial is over and that has not paid can read everything but change nothing. Runs after JwtAuthGuard. */
@Injectable()
export class BillingReadOnlyGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{ method: string; user?: RequestUser }>();
    if (!req.user?.billingReadOnly || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
    if (this.reflector.getAllAndOverride<boolean>(ALLOW_WHEN_UNPAID_KEY, [ctx.getHandler(), ctx.getClass()])) return true;
    throw new HttpException(
      `Your ${PRODUCT_NAME} trial or subscription has ended, so the company is read-only. Everything is kept and can be viewed or exported; an admin can renew under Billing.`,
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
