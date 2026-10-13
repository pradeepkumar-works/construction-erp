import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { AuthUser, LoginResponse, RoleKey } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ApprovalRightsService } from '../common/approval-rights.service';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService, private rights: ApprovalRightsService) {}

  async login(email: string, password: string): Promise<LoginResponse> {
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), isActive: true },
      include: { role: true, organization: true },
    });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const accessToken = await this.jwt.signAsync({ sub: user.id, org: user.organizationId });
    return { accessToken, user: await this.toAuthUser(user) };
  }

  async me(req: RequestUser): Promise<AuthUser> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: req.id }, include: { role: true, organization: true } });
    return this.toAuthUser(user);
  }

  async changePassword(req: RequestUser, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: req.id } });
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) throw new BadRequestException('Current password is incorrect');
    await this.prisma.user.update({ where: { id: req.id }, data: { passwordHash: await bcrypt.hash(newPassword, 10) } });
    return { ok: true };
  }

  private async toAuthUser(user: { id: string; email: string; fullName: string; phone: string | null; organizationId: string; role: { key: string; name: string }; organization: { name: string } }): Promise<AuthUser> {
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
    };
  }
}
