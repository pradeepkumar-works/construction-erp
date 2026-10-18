import { BadRequestException, ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { BILLING_YEAR_CHARGED_MONTHS, PRODUCT_NAME, aiRoleAllowed, ROLE_KEYS, ROLE_LABELS, orgCodeFrom, type AuthOptionsDto, type AuthUser, type LoginResponse, type PasswordTokenInfoDto, type RoleKey } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ApprovalRightsService } from '../common/approval-rights.service';
import { isPlatformAdmin } from '../common/platform-admin';
import { billingConfig, billingState } from '../common/billing';
import { todayIn } from '../notifications/time';
import { aiConfigured } from '../ai/ai.config';
import { PasswordLinksService } from './password-links.service';
import { SignupDto } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService, private rights: ApprovalRightsService, private links: PasswordLinksService) {}

  async login(email: string, password: string): Promise<LoginResponse> {
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), isActive: true },
      include: { role: true, organization: true },
    });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.issue(user.id);
  }

  private async issue(userId: string): Promise<LoginResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { role: true, organization: true } });
    if (user.organization.suspendedAt) throw new ForbiddenException(`${user.organization.name} is suspended on ${PRODUCT_NAME}. Please contact ${PRODUCT_NAME} support.`);
    const accessToken = await this.jwt.signAsync({ sub: user.id, org: user.organizationId });
    return { accessToken, user: await this.toAuthUser(user) };
  }

  options(): AuthOptionsDto {
    const billing = billingConfig();
    return {
      signup: signupOpen(),
      demoLogin: process.env.DEMO_LOGIN !== 'false',
      resetByEmail: this.links.canEmail && !!this.links.configuredWebUrl(),
      pricing: billing ? { unit: billing.unit, price: billing.price, trialDays: billing.trialDays, yearChargedMonths: BILLING_YEAR_CHARGED_MONTHS } : null,
    };
  }

  /**
   * A new organisation with every standard role and its first admin, who is signed in straight away. Activity
   * templates and the approval rule start as the built-in defaults. Only when ORG_SIGNUP=open.
   */
  async signup(dto: SignupDto): Promise<LoginResponse> {
    if (!signupOpen()) throw new ForbiddenException('Sign-up is closed on this server. Ask the operator to create your organisation.');
    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.user.findFirst({ where: { email }, select: { id: true } })) throw new ConflictException('This email already has an account. Sign in, or use "Forgot password".');
    const base = orgCodeFrom(dto.organizationName);
    let code = base;
    for (let i = 2; await this.prisma.organization.findUnique({ where: { code }, select: { id: true } }); i++) code = `${base}${i}`;
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const userId = await this.prisma.$transaction(async (tx) => {
      const billing = billingConfig();
      const trialEndsAt = billing ? new Date(Date.parse(`${todayIn()}T00:00:00Z`) + billing.trialDays * 86_400_000) : null;
      const org = await tx.organization.create({ data: { name: dto.organizationName.trim(), code, trialEndsAt } });
      await tx.role.createMany({ data: ROLE_KEYS.map((key) => ({ organizationId: org.id, key, name: ROLE_LABELS[key] })) });
      const admin = await tx.role.findUniqueOrThrow({ where: { organizationId_key: { organizationId: org.id, key: 'ADMIN' } } });
      const u = await tx.user.create({ data: { organizationId: org.id, roleId: admin.id, email, fullName: dto.fullName.trim(), phone: dto.phone?.trim() || null, passwordHash } });
      return u.id;
    });
    return this.issue(userId);
  }

  /** Always succeeds, so the answer does not reveal whether an email has an account. */
  async forgotPassword(emailIn: string): Promise<{ ok: true }> {
    const email = emailIn.trim().toLowerCase();
    if (!this.links.configuredWebUrl() || !this.links.canEmail) return { ok: true };
    const users = await this.prisma.user.findMany({ where: { email, isActive: true }, select: { id: true } });
    for (const u of users) {
      const recent = await this.prisma.passwordToken.findFirst({ where: { userId: u.id, purpose: 'RESET', createdAt: { gt: new Date(Date.now() - 60_000) } }, select: { id: true } });
      if (!recent) await this.links.create(u.id, 'RESET');
    }
    return { ok: true };
  }

  passwordToken(token: string): Promise<PasswordTokenInfoDto> {
    return this.links.info(token);
  }

  /** Accept an invite or reset: set the password and sign in. */
  async setPassword(token: string, password: string): Promise<LoginResponse> {
    return this.issue(await this.links.use(token, password));
  }

  async me(req: RequestUser): Promise<AuthUser> {
    if (req.support) {
      const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: req.organizationId } });
      return {
        id: req.id,
        email: req.email,
        fullName: req.fullName,
        phone: null,
        roleKey: 'ADMIN',
        roleName: `${PRODUCT_NAME} support (read-only)`,
        organizationId: org.id,
        organizationName: org.name,
        approvalRights: [],
        support: req.support,
        ...billingOf(org),
      };
    }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: req.id }, include: { role: true, organization: true } });
    return this.toAuthUser(user);
  }

  async changePassword(req: RequestUser, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: req.id } });
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) throw new BadRequestException('Current password is incorrect');
    await this.prisma.user.update({ where: { id: req.id }, data: { passwordHash: await bcrypt.hash(newPassword, 10) } });
    return { ok: true };
  }

  private async toAuthUser(user: { id: string; email: string; fullName: string; phone: string | null; organizationId: string; role: { key: string; name: string }; organization: BillingOrg & { name: string; aiEnabled: boolean; aiRoles: string[] } }): Promise<AuthUser> {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      roleKey: user.role.key as RoleKey,
      roleName: user.role.name,
      organizationId: user.organizationId,
      organizationName: user.organization.name,
      approvalRights: await this.rights.rightsFor(user.organizationId, user.role.key as RoleKey),
      ...(isPlatformAdmin(user.email) ? { platformAdmin: true } : {}),
      ...billingOf(user.organization),
      ...(user.organization.aiEnabled && aiConfigured() && aiRoleAllowed(user.role.key as RoleKey, user.organization.aiRoles) ? { ai: true } : {}),
    };
  }
}

type BillingOrg = { code: string; trialEndsAt: Date | null; paidUntil: Date | null };
/** The company's subscription state, when billing is on. */
const billingOf = (org: BillingOrg): Pick<AuthUser, 'billing'> => {
  const cfg = billingConfig();
  return cfg ? { billing: billingState(cfg, org, todayIn()) } : {};
};

const signupOpen = () => process.env.ORG_SIGNUP === 'open';
