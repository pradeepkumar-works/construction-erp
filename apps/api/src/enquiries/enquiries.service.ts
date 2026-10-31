import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import {
  PRODUCT_NAME,
  SUBMISSION_STATUS_LABELS,
  canPurchase,
  canViewPurchaseOrders,
  siteDeliveryAddress,
  type EnquiryDto,
  type EnquiryVendorState,
  type PublicEnquiryDto,
  type SupplierEnquiryDto,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { withoutTenant } from '../prisma/tenant-context';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { dateOnly, dec, iso, parseDate } from '../common/serialize';
import { EmailService, escapeHtml } from '../notifications/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EMAIL_COLORS, emailButton, emailLayout } from '../notifications/email-layout';
import { PasswordLinksService } from '../auth/password-links.service';
import { todayIn } from '../notifications/time';
import { parseFreight, parseGstRate, parseRate } from '../purchasing/purchase-math';
import { CreateEnquiryDto, PublicQuoteDto } from './enquiries.dto';

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const CLOSED = 'This enquiry has closed. Ask the company for a new link if you still want to quote.';
const INVALID = 'This link is not valid. Check that you opened the whole link from the email, or ask the company for a new one.';

const include = {
  createdBy: { select: { fullName: true } },
  tokens: { include: { vendor: { select: { name: true, phone: true } } }, orderBy: { vendor: { name: 'asc' as const } } },
} satisfies Prisma.EnquiryInclude;
type Row = Prisma.EnquiryGetPayload<{ include: typeof include }>;

/** A vendor's link with what its page shows. */
const tokenInclude = {
  vendor: { select: { name: true } },
  enquiry: {
    include: {
      organization: { select: { name: true } },
      createdBy: { select: { id: true, email: true, fullName: true, isActive: true } },
      materialRequest: { include: { project: { select: { name: true, location: true, siteAddress: true } }, items: { orderBy: { sortOrder: 'asc' as const } } } },
    },
  },
} satisfies Prisma.EnquiryTokenInclude;
type TokenRow = Prisma.EnquiryTokenGetPayload<{ include: typeof tokenInclude }>;

/** The end of a closing date in India (the links work all of that day). */
function endOfDayIst(day: Date): Date {
  return new Date(day.getTime() + 24 * 3600_000 - 330 * 60_000);
}

/**
 * Enquiries: an approved material request's lines sent to chosen vendors, each with a one-time link to a
 * page where they type their rates (no sign-in). The raw token lives only in the link; the table keeps its SHA-256, as
 * for password links. The reply becomes that vendor's quotation on the request, marked as from the supplier, so it
 * lands on the comparative statement with the ones entered by hand.
 */
@Injectable()
export class EnquiriesService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private email: EmailService,
    private links: PasswordLinksService,
    private notifications: NotificationsService,
  ) {}

  private stateOf(t: Row['tokens'][number], now: Date): EnquiryVendorState {
    if (t.respondedAt) return 'QUOTED';
    if (t.expiresAt < now) return 'EXPIRED';
    if (t.openedAt) return 'OPENED';
    return t.emailedAt ? 'SENT' : 'NOT_SENT';
  }

  private toDto(r: Row, links?: Map<string, string | null>): EnquiryDto {
    const now = new Date();
    return {
      id: r.id,
      materialRequestId: r.materialRequestId,
      closesOn: dateOnly(r.closesOn),
      message: r.message,
      createdByName: r.createdBy.fullName,
      createdAt: iso(r.createdAt),
      vendors: r.tokens.map((t) => ({
        vendorId: t.vendorId,
        vendorName: t.vendor.name,
        email: t.email,
        phone: t.vendor.phone,
        state: this.stateOf(t, now),
        emailedAt: iso(t.emailedAt),
        emailError: t.emailError,
        openedAt: iso(t.openedAt),
        respondedAt: iso(t.respondedAt),
        quotationId: t.quotationId,
        ...(links ? { link: links.get(t.vendorId) ?? null } : {}),
      })),
    };
  }

  async list(user: RequestUser, materialRequestId: string): Promise<EnquiryDto[]> {
    if (!canViewPurchaseOrders(user.roleKey)) throw new ForbiddenException('Your role cannot see quotations');
    const rows = await this.prisma.enquiry.findMany({
      where: { materialRequestId, organizationId: user.organizationId, materialRequest: this.access.submissionWhere(user) },
      include,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toDto(r));
  }

  /**
   * Send an enquiry: one link per vendor, emailed when the vendor has an email and email is set up; the answer carries
   * the links so the buyer can pass on the rest by phone. A vendor's earlier open link on the same request stops working.
   */
  async create(user: RequestUser, materialRequestId: string, dto: CreateEnquiryDto, origin?: string | null): Promise<EnquiryDto> {
    if (!canPurchase(user.roleKey)) throw new ForbiddenException('Only procurement, project managers and management send enquiries');
    const mr = await this.prisma.materialRequest.findFirst({
      where: { id: materialRequestId, ...this.access.submissionWhere(user) },
      include: { project: { select: { name: true, location: true, siteAddress: true } }, organization: { select: { name: true } }, items: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!mr) throw new NotFoundException('Material request not found');
    if (mr.status !== 'APPROVED') throw new ConflictException(`Enquiries are sent for approved requests. ${mr.requestNo} is ${SUBMISSION_STATUS_LABELS[mr.status].toLowerCase()}.`);
    const closesOn = parseDate(dto.closesOn);
    if (dto.closesOn < todayIn()) throw new BadRequestException('Choose a closing date from today on');
    const ids = [...new Set(dto.vendorIds)];
    const vendors = await this.prisma.vendor.findMany({ where: { id: { in: ids }, organizationId: user.organizationId }, select: { id: true, name: true, email: true, contactPerson: true, isActive: true } });
    if (vendors.length !== ids.length) throw new NotFoundException('A vendor was not found');
    const inactive = vendors.find((v) => !v.isActive);
    if (inactive) throw new BadRequestException(`${inactive.name} is inactive in the vendor master`);

    const expiresAt = endOfDayIst(closesOn);
    const tokens = new Map(vendors.map((v) => [v.id, randomBytes(32).toString('base64url')]));
    const enquiry = await this.prisma.$transaction(async (tx) => {
      await tx.enquiryToken.updateMany({
        where: { vendorId: { in: ids }, respondedAt: null, expiresAt: { gt: new Date() }, enquiry: { materialRequestId: mr.id } },
        data: { expiresAt: new Date() },
      });
      return tx.enquiry.create({
        data: {
          organizationId: user.organizationId,
          materialRequestId: mr.id,
          closesOn,
          message: dto.message || null,
          createdById: user.id,
          tokens: {
            create: vendors.map((v) => ({ organizationId: user.organizationId, vendorId: v.id, email: v.email?.trim() || null, tokenHash: hash(tokens.get(v.id)!), expiresAt })),
          },
        },
        select: { id: true },
      });
    });

    const base = this.links.configuredWebUrl() ?? (origin && /^https?:\/\/[^/\s]+$/.test(origin) ? origin.replace(/\/+$/, '') : null);
    const links = new Map(vendors.map((v) => [v.id, base ? `${base}/quote/${tokens.get(v.id)}` : null]));
    const canEmail = this.email.enabled && this.email.provider !== 'log';
    const org = mr.organization.name;
    const closing = closesOn.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    for (const v of vendors) {
      const link = links.get(v.id);
      const to = v.email?.trim();
      if (!to) continue;
      if (!link || !canEmail) {
        await this.prisma.enquiryToken.updateMany({ where: { enquiryId: enquiry.id, vendorId: v.id }, data: { emailError: !link ? 'No web address is set up for links' : 'Email is not set up' } });
        continue;
      }
      const lead = `${org} asks for your rates for the items below, for ${mr.project.name}${mr.project.location ? ` (${mr.project.location})` : ''}. Please quote by ${closing}.`;
      const rows = mr.items
        .map(
          (i) =>
            `<tr><td style="padding:6px 8px;border-bottom:1px solid ${EMAIL_COLORS.border}">${escapeHtml(i.itemName)}${i.specification ? `<br><span style="color:${EMAIL_COLORS.muted};font-size:13px">${escapeHtml(i.specification)}</span>` : ''}</td><td style="padding:6px 8px;border-bottom:1px solid ${EMAIL_COLORS.border};text-align:right;white-space:nowrap">${escapeHtml(dec(i.quantity))} ${escapeHtml(i.unit)}</td></tr>`,
        )
        .join('');
      const sent = await this.email.deliver({
        to,
        subject: `[${org}] Request for quotation ${mr.requestNo}`,
        text: `Hello ${v.contactPerson || v.name},\n\n${lead}\n\n${mr.items.map((i) => `- ${i.itemName}${i.specification ? ` (${i.specification})` : ''}: ${dec(i.quantity)} ${i.unit}`).join('\n')}\n${dto.message ? `\n${dto.message}\n` : ''}\nSend your rates here (no sign-in needed):\n${link}\n\nThe link is for ${v.name} only, works once and closes on ${closing}.\n`,
        html: emailLayout({
          preheader: lead,
          orgName: org,
          body:
            `<p style="margin:0 0 12px">Hello ${escapeHtml(v.contactPerson || v.name)},</p><p style="margin:0 0 12px">${escapeHtml(lead)}</p>` +
            `<table role="presentation" style="border-collapse:collapse;width:100%;margin:0 0 12px">${rows}</table>` +
            (dto.message ? `<p style="margin:0 0 12px">${escapeHtml(dto.message)}</p>` : '') +
            emailButton(link, 'Send your quote') +
            `<p style="margin:0;color:${EMAIL_COLORS.muted};font-size:13px">No sign-in is needed. The link is for ${escapeHtml(v.name)} only, works once and closes on ${escapeHtml(closing)}. If the button does not work, open <a href="${escapeHtml(link)}" style="color:${EMAIL_COLORS.link};word-break:break-all">${escapeHtml(link)}</a></p>`,
        }),
      });
      await this.prisma.enquiryToken.updateMany({ where: { enquiryId: enquiry.id, vendorId: v.id }, data: sent.ok ? { emailedAt: new Date(), emailError: null } : { emailError: sent.error ?? 'Not sent' } });
    }
    await this.audit.log(user, 'ENQUIRY', enquiry.id, 'CREATED', `${mr.requestNo} to ${vendors.map((v) => v.name).join(', ')}`);
    const row = await this.prisma.enquiry.findUniqueOrThrow({ where: { id: enquiry.id }, include });
    // A vendor with supplier-portal logins also finds it there.
    for (const t of row.tokens)
      await this.notifications.notifyVendor(user.organizationId, t.vendorId, {
        title: `Enquiry for ${mr.requestNo}`,
        body: `Send your rates by ${dateOnly(row.closesOn)}.`,
        projectId: mr.projectId,
        entityType: 'PORTAL_ENQUIRY',
        entityId: t.id,
      });
    return this.toDto(row, links);
  }

  /** The link's row, looked up across companies (the page has no signed-in user). */
  private async byToken(token: string) {
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw new BadRequestException(INVALID);
    const row = await withoutTenant(() => this.prisma.enquiryToken.findUnique({ where: { tokenHash: hash(token) }, include: tokenInclude }));
    if (!row) throw new BadRequestException(INVALID);
    return row;
  }

  private isOpen(row: TokenRow) {
    return !row.respondedAt && row.expiresAt >= new Date() && row.enquiry.materialRequest.status === 'APPROVED';
  }

  private assertOpen(row: TokenRow) {
    if (row.expiresAt < new Date() || row.enquiry.materialRequest.status !== 'APPROVED') throw new BadRequestException(CLOSED);
  }

  async publicInfo(token: string): Promise<PublicEnquiryDto> {
    const row = await this.byToken(token);
    if (!row.respondedAt) this.assertOpen(row);
    if (!row.openedAt && !row.respondedAt) await withoutTenant(() => this.prisma.enquiryToken.update({ where: { id: row.id }, data: { openedAt: new Date() } }));
    return this.info(row);
  }

  /** The enquiries sent to a vendor, newest first. */
  async forVendor(organizationId: string, vendorId: string): Promise<SupplierEnquiryDto[]> {
    const rows = await this.prisma.enquiryToken.findMany({ where: { organizationId, vendorId }, include: tokenInclude, orderBy: { enquiry: { createdAt: 'desc' } }, take: 100 });
    return rows.map((r) => ({ ...this.info(r), id: r.id, sentAt: r.enquiry.createdAt.toISOString(), open: this.isOpen(r) }));
  }

  /** A signed-in supplier quotes on an enquiry sent to their vendor: the same as answering its link. */
  async respondForVendor(organizationId: string, vendorId: string, id: string, dto: PublicQuoteDto) {
    const row = await this.prisma.enquiryToken.findFirst({ where: { id, organizationId, vendorId }, include: tokenInclude });
    if (!row) throw new NotFoundException('Enquiry not found');
    return this.respondTo(row, dto);
  }

  private info(row: TokenRow): PublicEnquiryDto {
    const mr = row.enquiry.materialRequest;
    return {
      organizationName: row.enquiry.organization.name,
      projectName: mr.project.name,
      siteAddress: siteDeliveryAddress(mr.project),
      vendorName: row.vendor.name,
      requestNo: mr.requestNo,
      requiredDate: dateOnly(mr.requiredDate),
      closesOn: dateOnly(row.enquiry.closesOn),
      message: row.enquiry.message,
      respondedAt: iso(row.respondedAt),
      lines: mr.items.map((i) => ({ materialRequestItemId: i.id, itemName: i.itemName, specification: i.specification, unit: i.unit, quantity: dec(i.quantity) })),
    };
  }

  /**
   * The supplier's quote: saved as their quotation on the request (an earlier one of theirs is replaced, unless an order
   * was raised on it), dated today, marked from the supplier. The link then only shows that it was received.
   */
  async respond(token: string, dto: PublicQuoteDto): Promise<{ ok: true; respondedAt: string }> {
    return this.respondTo(await this.byToken(token), dto);
  }

  private async respondTo(row: TokenRow, dto: PublicQuoteDto): Promise<{ ok: true; respondedAt: string }> {
    if (row.respondedAt) throw new ConflictException('Your quote was already received. Thank you.');
    this.assertOpen(row);
    const mr = row.enquiry.materialRequest;
    const seen = new Set<string>();
    const lines = dto.lines.map((l) => {
      const item = mr.items.find((i) => i.id === l.materialRequestItemId);
      if (!item) throw new BadRequestException('A line is not part of this enquiry. Reload the page and try again.');
      if (seen.has(item.id)) throw new BadRequestException(`${item.itemName} is quoted twice`);
      seen.add(item.id);
      return { materialRequestItemId: item.id, rate: parseRate(l.rate, item.itemName), gstRate: parseGstRate(l.gstRate, item.itemName), remarks: l.remarks || null };
    });
    const fields = {
      quoteRef: dto.quoteRef || null,
      quoteDate: parseDate(todayIn()),
      validUntil: dto.validUntil ? parseDate(dto.validUntil) : null,
      deliveryDays: dto.deliveryDays ?? null,
      paymentTerms: dto.paymentTerms || null,
      freight: parseFreight(dto.freight),
      remarks: dto.remarks || null,
      fromSupplier: true,
    };
    const respondedAt = new Date();
    await withoutTenant(() =>
      this.prisma.$transaction(async (tx) => {
        const claimed = await tx.enquiryToken.updateMany({ where: { id: row.id, respondedAt: null }, data: { respondedAt } });
        if (claimed.count === 0) throw new ConflictException('Your quote was already received. Thank you.');
        const earlier = await tx.quotation.findUnique({
          where: { materialRequestId_vendorId: { materialRequestId: mr.id, vendorId: row.vendorId } },
          select: { id: true, purchaseOrders: { where: { status: { not: 'REJECTED' } }, select: { id: true } } },
        });
        if (earlier?.purchaseOrders.length) throw new ConflictException(CLOSED);
        const q = earlier
          ? await tx.quotation.update({ where: { id: earlier.id }, data: { ...fields, lines: { deleteMany: {}, create: lines } }, select: { id: true } })
          : await tx.quotation.create({
              data: { organizationId: row.organizationId, projectId: mr.projectId, materialRequestId: mr.id, vendorId: row.vendorId, createdById: row.enquiry.createdById, ...fields, lines: { create: lines } },
              select: { id: true },
            });
        await tx.enquiryToken.update({ where: { id: row.id }, data: { quotationId: q.id } });
        await tx.auditLog.create({
          data: { organizationId: row.organizationId, entityType: 'QUOTATION', entityId: q.id, action: earlier ? 'UPDATED' : 'CREATED', actorId: row.enquiry.createdById, note: `${row.vendor.name} quoted on ${mr.requestNo} through the enquiry link` },
        });
      }),
    );
    // Tell whoever sent the enquiry, by email, when it is set up.
    const buyer = row.enquiry.createdBy;
    const base = this.links.configuredWebUrl();
    if (buyer.isActive && this.email.enabled && this.email.provider !== 'log') {
      const href = base ? `${base}/material-requests/${mr.id}` : null;
      const lead = `${row.vendor.name} sent their quote for ${mr.requestNo} (${mr.project.name}). It is on the comparative statement.`;
      await this.email.deliver({
        to: buyer.email,
        subject: `[${row.enquiry.organization.name}] ${row.vendor.name} quoted on ${mr.requestNo}`,
        text: `Hello ${buyer.fullName},\n\n${lead}\n${href ? `\n${href}\n` : ''}`,
        html: emailLayout({
          preheader: lead,
          orgName: row.enquiry.organization.name,
          body: `<p style="margin:0 0 12px">Hello ${escapeHtml(buyer.fullName)},</p><p style="margin:0">${escapeHtml(lead)}</p>${href ? emailButton(href, `Open ${mr.requestNo} in ${PRODUCT_NAME}`) : ''}`,
        }),
      });
    }
    return { ok: true, respondedAt: respondedAt.toISOString() };
  }
}
