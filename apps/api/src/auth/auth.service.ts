import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { BILLING_YEAR_CHARGED_MONTHS, PRODUCT_NAME, aiRoleAllowed, ROLE_KEYS, ROLE_LABELS, orgCodeFrom, modulesOffFor, isDefaultNav, navSettingsFrom, type NavLook, type CompanyKind, type ModuleTier, type AuthOptionsDto, type AuthUser, type LoginResponse, type PasswordTokenInfoDto, type RoleKey } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { withoutTenant } from '../prisma/tenant-context';
import { pickPlace } from '../group/group-rules';
import { RequestUser } from '../common/current-user';
import { ApprovalRightsService } from '../common/approval-rights.service';
import { isPlatformAdmin } from '../common/platform-admin';
import { billingConfig, billingState } from '../common/billing';
import { todayIn } from '../notifications/time';
import { aiConfigured } from '../ai/ai.config';
import { PasswordLinksService } from './password-links.service';
import { LoginGuardService } from './login-guard.service';
import { SignupDto } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService, private rights: ApprovalRightsService, private links: PasswordLinksService, private guard: LoginGuardService) {}

  /** Sign in. A locked email or an address making too many tries is refused (429) before the password is checked. */
  async login(emailIn: string, password: string, ip: string | null = null): Promise<LoginResponse> {
    const email = emailIn.trim().toLowerCase();
    await this.guard.assertMayTry(email, ip);
    // One sign-in per person (group companies): it lands in the company used last, or the first one they were given.
    const login = await this.prisma.login.findUnique({
      where: { email },
      select: { passwordHash: true, lastOrganizationId: true, users: { select: { id: true, organizationId: true, isActive: true, createdAt: true, organization: { select: { suspendedAt: true } } } } },
    });
    const place = login ? pickPlace(login.users.map((u) => ({ ...u, suspended: !!u.organization.suspendedAt })), login.lastOrganizationId) : null;
    if (!login || !place || !(await bcrypt.compare(password, login.passwordHash))) {
      await this.guard.failed(email, ip);
      throw new UnauthorizedException('Invalid email or password');
    }
    await this.guard.succeeded(email);
    return this.issue(place.id);
  }

  /** A session for one of the person's users; the login remembers the company for the next sign-in. */
  private async issue(userId: string): Promise<LoginResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { role: true, organization: true } });
    if (user.organization.suspendedAt) throw new ForbiddenException(`${user.organization.name} is suspended on ${PRODUCT_NAME}. Please contact ${PRODUCT_NAME} support.`);
    const accessToken = await this.jwt.signAsync({ sub: user.id, org: user.organizationId });
    await this.prisma.login.update({ where: { id: user.loginId }, data: { lastOrganizationId: user.organizationId } });
    return { accessToken, user: await this.toAuthUser(user) };
  }

  /**
   * Move to another company of the group the person has a place in (the company switcher): a new session for their user
   * there, so the token still names one company and row-level security works as before.
   */
  async switchCompany(req: RequestUser, organizationId: string): Promise<LoginResponse> {
    if (req.support) throw new ForbiddenException('A support session stays in the company it opened');
    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: req.id }, select: { loginId: true, organization: { select: { groupId: true } } } });
    return withoutTenant(async () => {
      const target = me.organization.groupId
        ? await this.prisma.user.findFirst({ where: { loginId: me.loginId, organizationId, isActive: true, organization: { groupId: me.organization.groupId } }, select: { id: true } })
        : null;
      if (!target) throw new NotFoundException('You have no place in that company. Ask the group admin to give you one.');
      return this.issue(target.id);
    });
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
    if (await this.prisma.login.findUnique({ where: { email }, select: { id: true } })) throw new ConflictException('This email already has an account. Sign in, or use "Forgot password".');
    const base = orgCodeFrom(dto.organizationName);
    let code = base;
    for (let i = 2; await this.prisma.organization.findUnique({ where: { code }, select: { id: true } }); i++) code = `${base}${i}`;
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const userId = await this.prisma.$transaction(async (tx) => {
      const billing = billingConfig();
      const trialEndsAt = billing ? new Date(Date.parse(`${todayIn()}T00:00:00Z`) + billing.trialDays * 86_400_000) : null;
      // New companies pay bills only against approved payment requests and record progress only in the DPR;
      // older ones switch these on themselves.
      const org = await tx.organization.create({ data: { name: dto.organizationName.trim(), code, trialEndsAt, paymentsNeedRequest: true, progressFromDpr: true, ordersNeedApprovedChoice: true } });
      await tx.role.createMany({ data: ROLE_KEYS.map((key) => ({ organizationId: org.id, key, name: ROLE_LABELS[key] })) });
      const admin = await tx.role.findUniqueOrThrow({ where: { organizationId_key: { organizationId: org.id, key: 'ADMIN' } } });
      const login = await tx.login.create({ data: { email, passwordHash, lastOrganizationId: org.id } });
      const u = await tx.user.create({ data: { organizationId: org.id, roleId: admin.id, loginId: login.id, email, fullName: dto.fullName.trim(), phone: dto.phone?.trim() || null } });
      return u.id;
    });
    return this.issue(userId);
  }

  /** Always succeeds, so the answer does not reveal whether an email has an account. */
  async forgotPassword(emailIn: string, ip: string | null = null): Promise<{ ok: true }> {
    const email = emailIn.trim().toLowerCase();
    if (!this.links.configuredWebUrl() || !this.links.canEmail) return { ok: true };
    // Past the hourly limit nothing is sent, and the answer is the same, so it tells no one anything.
    if (!(await this.guard.mayRequestReset(email, ip))) return { ok: true };
    // One link per sign-in: it sets the password of every company the person signs in to.
    const users = await this.prisma.user.findMany({ where: { email, isActive: true }, select: { id: true }, orderBy: { createdAt: 'asc' }, take: 1 });
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
        ...modulesOf(org),
        ...navigationOf(org),
      };
    }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: req.id }, include: { role: true, organization: true } });
    return this.toAuthUser(user);
  }

  async changePassword(req: RequestUser, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: req.id }, include: { login: true } });
    if (!(await bcrypt.compare(currentPassword, user.login.passwordHash))) throw new BadRequestException('Current password is incorrect');
    // Other sessions of the old password end, in every company of the sign-in; this one goes on with the token returned.
    await this.prisma.login.update({ where: { id: user.loginId }, data: { passwordHash: await bcrypt.hash(newPassword, 10), tokensValidAfter: new Date() } });
    return { ok: true, accessToken: await this.jwt.signAsync({ sub: user.id, org: user.organizationId }) };
  }

  private async toAuthUser(user: { id: string; loginId: string; email: string; fullName: string; phone: string | null; organizationId: string; vendorId: string | null; navLook: NavLook | null; role: { key: string; name: string }; organization: BillingOrg & ModulesOrg & NavOrg & GroupOrg & { name: string; aiEnabled: boolean; aiRoles: string[] } }): Promise<AuthUser> {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      roleKey: user.role.key as RoleKey,
      roleName: ROLE_LABELS[user.role.key as RoleKey],
      organizationId: user.organizationId,
      organizationName: user.organization.name,
      approvalRights: await this.rights.rightsFor(user.organizationId, user.role.key as RoleKey),
      ...(isPlatformAdmin(user.email) ? { platformAdmin: true } : {}),
      ...billingOf(user.organization),
      ...modulesOf(user.organization),
      ...navigationOf(user.organization),
      ...(user.navLook ? { ownLook: user.navLook } : {}),
      ...(user.organization.aiEnabled && aiConfigured() && aiRoleAllowed(user.role.key as RoleKey, user.organization.aiRoles) ? { ai: true } : {}),
      ...(user.vendorId ? { vendor: await this.prisma.vendor.findUniqueOrThrow({ where: { id: user.vendorId }, select: { id: true, name: true } }) } : {}),
      ...(await this.groupOf(user)),
    };
  }

  /** Group companies: the company's kind, its group and the companies of the group the person can switch to. */
  private async groupOf(user: { loginId: string; organizationId: string; organization: GroupOrg }): Promise<Pick<AuthUser, 'companyKind' | 'group' | 'companies'>> {
    const kind = { companyKind: user.organization.kind };
    const groupId = user.organization.groupId;
    if (!groupId) return kind;
    // The other companies are outside this request's tenant, so read them as the sign-in does.
    const [group, admin, places] = await withoutTenant(() =>
      Promise.all([
        this.prisma.companyGroup.findUniqueOrThrow({ where: { id: groupId }, select: { id: true, name: true } }),
        this.prisma.groupAdmin.findUnique({ where: { groupId_loginId: { groupId, loginId: user.loginId } }, select: { id: true } }),
        this.prisma.user.findMany({
          where: { loginId: user.loginId, isActive: true, organization: { groupId, suspendedAt: null } },
          select: { organizationId: true, role: { select: { key: true } }, organization: { select: { name: true, kind: true } } },
          orderBy: { organization: { name: 'asc' } },
        }),
      ]),
    );
    return {
      ...kind,
      group: { id: group.id, name: group.name, admin: !!admin },
      ...(places.length > 1
        ? { companies: places.map((p) => ({ id: p.organizationId, name: p.organization.name, kind: p.organization.kind, roleName: ROLE_LABELS[p.role.key as RoleKey], current: p.organizationId === user.organizationId })) }
        : {}),
    };
  }
}

type GroupOrg = { groupId: string | null; kind: CompanyKind };

type BillingOrg = { code: string; trialEndsAt: Date | null; paidUntil: Date | null };
/** The company's subscription state, when billing is on. */
const billingOf = (org: BillingOrg): Pick<AuthUser, 'billing'> => {
  const cfg = billingConfig();
  return cfg ? { billing: billingState(cfg, org, todayIn()) } : {};
};

type ModulesOrg = { modulesOff: string[]; moduleTier: ModuleTier | null };
/** The modules the company does not use, when there are any. */
const modulesOf = (org: ModulesOrg): Pick<AuthUser, 'modulesOff'> => {
  const off = modulesOffFor(org);
  return off.length ? { modulesOff: off } : {};
};

type NavOrg = Parameters<typeof navSettingsFrom>[0];
/** The company's menu (Menu and names), when it chose anything but the default. */
const navigationOf = (org: NavOrg): Pick<AuthUser, 'navigation'> => {
  const nav = navSettingsFrom(org);
  return isDefaultNav(nav) ? {} : { navigation: nav };
};

const signupOpen = () => process.env.ORG_SIGNUP === 'open';
