import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { INVITE_LINK_HOURS, RESET_LINK_HOURS, type PasswordLinkDto, type PasswordTokenInfoDto, type PasswordTokenPurpose } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService, escapeHtml } from '../notifications/email.service';

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const trimUrl = (u: string) => u.trim().replace(/\/+$/, '');

/**
 * One-time set-password links for invites and resets. The raw token only ever exists in the link; the table keeps
 * its SHA-256. Links point at the web app: WEB_URL, else the first CORS_ORIGINS entry, else (for links an admin asks
 * for, which are shown to that admin) the browser origin of the request.
 */
@Injectable()
export class PasswordLinksService {
  private readonly log = new Logger(PasswordLinksService.name);
  constructor(private prisma: PrismaService, private email: EmailService) {}

  /** The web address links point at, from configuration only (safe for public endpoints). */
  configuredWebUrl(): string | null {
    if (process.env.WEB_URL) return trimUrl(process.env.WEB_URL);
    const first = (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).find(Boolean);
    return first ? trimUrl(first) : null;
  }

  get canEmail(): boolean {
    return this.email.enabled && this.email.provider !== 'log';
  }

  /**
   * Make a link for this user, invalidate their earlier unused links, and email it when email is set up.
   * `origin` is only used when nothing is configured, and only by callers whose result goes back to an admin.
   */
  async create(userId: string, purpose: PasswordTokenPurpose, origin?: string | null): Promise<PasswordLinkDto> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { organization: { select: { name: true } } } });
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + (purpose === 'INVITE' ? INVITE_LINK_HOURS : RESET_LINK_HOURS) * 3600_000);
    await this.prisma.$transaction([
      this.prisma.passwordToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } }),
      this.prisma.passwordToken.create({ data: { organizationId: user.organizationId, userId, purpose, tokenHash: hash(token), expiresAt } }),
    ]);
    const base = this.configuredWebUrl() ?? (origin && /^https?:\/\/[^/\s]+$/.test(origin) ? trimUrl(origin) : null);
    const link = base ? `${base}/set-password?token=${token}` : null;
    let emailed = false;
    if (link && this.canEmail) {
      const invite = purpose === 'INVITE';
      const org = user.organization.name;
      const hours = invite ? `${INVITE_LINK_HOURS / 24} days` : `${RESET_LINK_HOURS} hours`;
      const lead = invite ? `You have been invited to ${org} on Construction ERP. Choose a password to sign in.` : `Someone asked to reset your Construction ERP password for ${org}. If it was not you, ignore this email.`;
      emailed = await this.email.send({
        to: user.email,
        subject: invite ? `[${org}] You are invited to Construction ERP` : `[${org}] Reset your Construction ERP password`,
        text: `Hello ${user.fullName},\n\n${lead}\n\n${link}\n\nThe link works once and expires in ${hours}.\n`,
        html: `<p>Hello ${escapeHtml(user.fullName)},</p><p>${escapeHtml(lead)}</p><p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#1659a8;color:#fff;border-radius:6px;text-decoration:none">${invite ? 'Accept invitation' : 'Choose a new password'}</a></p><p style="color:#666;font-size:12px">The link works once and expires in ${hours}. If the button does not work, open ${escapeHtml(link)}</p>`,
      });
    } else if (!link) {
      this.log.warn(`No WEB_URL or CORS_ORIGINS: cannot build a ${purpose} link for user ${userId}`);
    }
    return { link, emailed, expiresAt: expiresAt.toISOString() };
  }

  private async valid(token: string) {
    const row = await this.prisma.passwordToken.findUnique({
      where: { tokenHash: hash(token) },
      include: { user: { select: { id: true, email: true, fullName: true, isActive: true } }, organization: { select: { name: true } } },
    });
    if (!row || row.usedAt || row.expiresAt < new Date() || !row.user.isActive) {
      throw new BadRequestException('This link is no longer valid. Ask your admin for a new one, or use "Forgot password" on the sign-in page.');
    }
    return row;
  }

  async info(token: string): Promise<PasswordTokenInfoDto> {
    const r = await this.valid(token);
    return { purpose: r.purpose, email: r.user.email, fullName: r.user.fullName, organizationName: r.organization.name, expiresAt: r.expiresAt.toISOString() };
  }

  /** Use the link: set the password, close every open link of the user, end the invite. Returns the user id. */
  async use(token: string, password: string): Promise<string> {
    const r = await this.valid(token);
    const passwordHash = await bcrypt.hash(password, 10);
    const done = await this.prisma.passwordToken.updateMany({ where: { id: r.id, usedAt: null }, data: { usedAt: new Date() } });
    if (done.count === 0) throw new BadRequestException('This link has already been used.');
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: r.userId }, data: { passwordHash, invitedAt: null } }),
      this.prisma.passwordToken.updateMany({ where: { userId: r.userId, usedAt: null }, data: { usedAt: new Date() } }),
    ]);
    return r.userId;
  }
}
