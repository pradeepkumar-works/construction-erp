import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { RoleKey } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { setTenant, withoutTenant } from '../prisma/tenant-context';
import { isPlatformAdmin } from '../common/platform-admin';
import { RequestUser } from '../common/current-user';
import { billingConfig, billingState } from '../common/billing';
import { todayIn } from '../notifications/time';

export interface JwtPayload {
  sub: string;
  org: string;
  /** A read-only support session: sub is the Nirmaan staff member, org the company they are looking at */
  sup?: boolean;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'dev-secret',
    });
  }

  async validate(payload: JwtPayload): Promise<RequestUser> {
    if (payload.sup) return this.support(payload);
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, organizationId: payload.org, isActive: true, organization: { suspendedAt: null } },
      include: { role: true, organization: { select: { code: true, trialEndsAt: true, paidUntil: true } } },
    });
    if (!user) throw new UnauthorizedException();
    setTenant(user.organizationId);
    const billing = billingConfig();
    const readOnly = !!billing && billingState(billing, user.organization, todayIn()).status === 'READ_ONLY';
    return { id: user.id, organizationId: user.organizationId, roleKey: user.role.key as RoleKey, email: user.email, fullName: user.fullName, ...(readOnly ? { billingReadOnly: true } : {}) };
  }

  /** Staff still on the platform list, and the company's consent still running: act as a read-only admin there. */
  private async support(payload: JwtPayload): Promise<RequestUser> {
    const [staff, org] = await withoutTenant(() =>
      Promise.all([
        this.prisma.user.findFirst({ where: { id: payload.sub, isActive: true } }),
        this.prisma.organization.findUnique({ where: { id: payload.org }, select: { supportAccessUntil: true } }),
      ]),
    );
    if (!staff || !isPlatformAdmin(staff.email) || !org?.supportAccessUntil || org.supportAccessUntil < new Date()) throw new UnauthorizedException();
    setTenant(payload.org);
    return {
      id: staff.id,
      organizationId: payload.org,
      roleKey: 'ADMIN',
      email: staff.email,
      fullName: staff.fullName,
      support: { staffName: staff.fullName, expiresAt: new Date((payload.exp ?? 0) * 1000).toISOString() },
    };
  }
}
