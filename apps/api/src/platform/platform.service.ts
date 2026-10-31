import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { ModuleTier, PlatformCompanyDetailDto, PlatformCompanyDto, SupportSessionDto } from '@erp/shared';
import { PRODUCT_NAME, SUPPORT_SESSION_HOURS, modulesOffFor } from '@erp/shared';
import { tierNote } from '../module-switches/module-switch-rules';
import { PrismaService } from '../prisma/prisma.service';
import { withoutTenant } from '../prisma/tenant-context';
import { RequestUser } from '../common/current-user';
import { isPlatformAdmin } from '../common/platform-admin';
import { billingConfig, billingState } from '../common/billing';
import { todayIn } from '../notifications/time';

const DAY = 24 * 3600_000;

/**
 * The console for Nirmaan staff: every company with its size and activity, suspend and lift, and a
 * read-only support session into a company that has agreed to it. Counts only: a company's records are seen through
 * a support session, which its admin allows and which is written to its audit log.
 */
@Injectable()
export class PlatformService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  private assertStaff(user: RequestUser) {
    if (user.support || !isPlatformAdmin(user.email)) throw new ForbiddenException('Only platform admins can use this');
  }

  async companies(user: RequestUser): Promise<PlatformCompanyDto[]> {
    this.assertStaff(user);
    return withoutTenant(async () => {
      const since = new Date(Date.now() - 30 * DAY);
      const [orgs, users, projects, last, recent, files] = await Promise.all([
        this.prisma.organization.findMany({ orderBy: { createdAt: 'desc' } }),
        this.prisma.user.groupBy({ by: ['organizationId'], where: { isActive: true }, _count: true }),
        this.prisma.project.groupBy({ by: ['organizationId'], _count: true }),
        this.prisma.auditLog.groupBy({ by: ['organizationId'], _max: { createdAt: true } }),
        this.prisma.auditLog.groupBy({ by: ['organizationId'], where: { createdAt: { gte: since } }, _count: true }),
        this.prisma.attachment.groupBy({ by: ['organizationId'], _count: true, _sum: { size: true } }),
      ]);
      const by = <T extends { organizationId: string }>(rows: T[]) => new Map(rows.map((r) => [r.organizationId, r]));
      const u = by(users), p = by(projects), l = by(last), r = by(recent), f = by(files);
      const billing = billingConfig();
      const today = todayIn();
      return orgs.map((o) => ({
        id: o.id,
        name: o.name,
        code: o.code,
        createdAt: o.createdAt.toISOString(),
        activeUsers: u.get(o.id)?._count ?? 0,
        projects: p.get(o.id)?._count ?? 0,
        lastActivityAt: l.get(o.id)?._max.createdAt?.toISOString() ?? null,
        actions30d: r.get(o.id)?._count ?? 0,
        storageBytes: f.get(o.id)?._sum.size ?? 0,
        files: f.get(o.id)?._count ?? 0,
        suspendedAt: o.suspendedAt?.toISOString() ?? null,
        suspendedReason: o.suspendedReason,
        supportAccessUntil: o.supportAccessUntil && o.supportAccessUntil > new Date() ? o.supportAccessUntil.toISOString() : null,
        deletionScheduledFor: o.deletionScheduledFor?.toISOString().slice(0, 10) ?? null,
        ...(billing ? { billing: billingState(billing, o, today) } : {}),
        moduleTier: o.moduleTier,
        modulesOff: modulesOffFor(o),
      }));
    });
  }

  async company(user: RequestUser, id: string): Promise<PlatformCompanyDetailDto> {
    this.assertStaff(user);
    const row = (await this.companies(user)).find((c) => c.id === id);
    if (!row) throw new NotFoundException('Company not found');
    return withoutTenant(async () => {
      const [org, users, lastByUser] = await Promise.all([
        this.prisma.organization.findUniqueOrThrow({ where: { id }, select: { supportAccessGrantedByName: true } }),
        this.prisma.user.findMany({ where: { organizationId: id }, include: { role: { select: { name: true } } }, orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }] }),
        this.prisma.auditLog.groupBy({ by: ['actorId'], where: { organizationId: id }, _max: { createdAt: true } }),
      ]);
      const last = new Map(lastByUser.map((x) => [x.actorId, x._max.createdAt]));
      return {
        ...row,
        supportAccessGrantedByName: row.supportAccessUntil ? org.supportAccessGrantedByName : null,
        users: users.map((x) => ({
          id: x.id,
          fullName: x.fullName,
          email: x.email,
          roleName: x.role.name,
          isActive: x.isActive,
          createdAt: x.createdAt.toISOString(),
          lastActivityAt: last.get(x.id)?.toISOString() ?? null,
        })),
      };
    });
  }

  async suspend(user: RequestUser, id: string, reason: string) {
    this.assertStaff(user);
    if (id === user.organizationId) throw new BadRequestException('You cannot suspend your own company');
    await withoutTenant(async () => {
      const org = await this.prisma.organization.findUnique({ where: { id } });
      if (!org) throw new NotFoundException('Company not found');
      await this.prisma.organization.update({ where: { id }, data: { suspendedAt: new Date(), suspendedReason: reason.trim() } });
      await this.prisma.auditLog.create({ data: { organizationId: id, actorId: user.id, entityType: 'COMPANY', entityId: id, action: 'SUSPENDED', note: `Suspended by ${PRODUCT_NAME} (${user.fullName}): ${reason.trim()}` } });
    });
    return this.company(user, id);
  }

  /** Set when a company's free trial ends: longer for a pilot, or today to end it (audited in the company). */
  async setTrial(user: RequestUser, id: string, until: string) {
    this.assertStaff(user);
    if (!billingConfig()) throw new BadRequestException('Billing is not switched on');
    await withoutTenant(async () => {
      const org = await this.prisma.organization.findUnique({ where: { id } });
      if (!org) throw new NotFoundException('Company not found');
      await this.prisma.organization.update({ where: { id }, data: { trialEndsAt: new Date(`${until}T00:00:00Z`), billingRemindedFor: null } });
      await this.prisma.auditLog.create({ data: { organizationId: id, actorId: user.id, entityType: 'COMPANY', entityId: id, action: 'TRIAL_CHANGED', note: `Free trial set to end on ${until} by ${PRODUCT_NAME} (${user.fullName})` } });
    });
    return this.company(user, id);
  }

  /** Set the company's plan, which decides the modules it has (audited in the company). */
  async setModuleTier(user: RequestUser, id: string, tier: ModuleTier | null) {
    this.assertStaff(user);
    await withoutTenant(async () => {
      const org = await this.prisma.organization.findUnique({ where: { id }, select: { moduleTier: true } });
      if (!org) throw new NotFoundException('Company not found');
      if (org.moduleTier === tier) return;
      await this.prisma.organization.update({ where: { id }, data: { moduleTier: tier } });
      await this.prisma.auditLog.create({ data: { organizationId: id, actorId: user.id, entityType: 'COMPANY', entityId: id, action: 'MODULE_PLAN', note: `${tierNote(org.moduleTier, tier)} by ${PRODUCT_NAME} (${user.fullName})` } });
    });
    return this.company(user, id);
  }

  async unsuspend(user: RequestUser, id: string) {
    this.assertStaff(user);
    await withoutTenant(async () => {
      const org = await this.prisma.organization.findUnique({ where: { id } });
      if (!org) throw new NotFoundException('Company not found');
      await this.prisma.organization.update({ where: { id }, data: { suspendedAt: null, suspendedReason: null } });
      await this.prisma.auditLog.create({ data: { organizationId: id, actorId: user.id, entityType: 'COMPANY', entityId: id, action: 'UNSUSPENDED', note: `Suspension lifted by ${PRODUCT_NAME} (${user.fullName})` } });
    });
    return this.company(user, id);
  }

  /** A short read-only session in a company whose admin allowed it; the visit goes in that company's audit log. */
  async openSupport(user: RequestUser, id: string): Promise<SupportSessionDto> {
    this.assertStaff(user);
    return withoutTenant(async () => {
      const org = await this.prisma.organization.findUnique({ where: { id } });
      if (!org) throw new NotFoundException('Company not found');
      if (!org.supportAccessUntil || org.supportAccessUntil < new Date()) throw new ForbiddenException(`${org.name} has not allowed support access. Their admin can allow it under Data & Privacy.`);
      const hours = Math.min(SUPPORT_SESSION_HOURS, (org.supportAccessUntil.getTime() - Date.now()) / 3600_000);
      const expiresAt = new Date(Date.now() + hours * 3600_000);
      const accessToken = await this.jwt.signAsync({ sub: user.id, org: id, sup: true }, { expiresIn: Math.max(60, Math.floor(hours * 3600)) });
      await this.prisma.auditLog.create({
        data: { organizationId: id, actorId: user.id, entityType: 'COMPANY', entityId: id, action: 'SUPPORT_VIEW', note: `${user.fullName} of ${PRODUCT_NAME} support opened the company read-only` },
      });
      return { accessToken, organizationName: org.name, expiresAt: expiresAt.toISOString() };
    });
  }
}
