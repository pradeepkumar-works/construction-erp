import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import type { RoleKey, UserSummary } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { CreateUserDto, UpdateUserDto } from './users.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  private toDto(u: { id: string; email: string; fullName: string; phone: string | null; isActive: boolean; createdAt: Date; role: { key: string; name: string } }): UserSummary {
    return { id: u.id, email: u.email, fullName: u.fullName, phone: u.phone, isActive: u.isActive, roleKey: u.role.key as RoleKey, roleName: u.role.name, createdAt: u.createdAt.toISOString() };
  }

  async list(req: RequestUser): Promise<UserSummary[]> {
    const users = await this.prisma.user.findMany({ where: { organizationId: req.organizationId }, include: { role: true }, orderBy: { fullName: 'asc' } });
    return users.map((u) => this.toDto(u));
  }

  async roles(req: RequestUser) {
    return this.prisma.role.findMany({ where: { organizationId: req.organizationId }, select: { id: true, key: true, name: true }, orderBy: { name: 'asc' } });
  }

  async create(req: RequestUser, dto: CreateUserDto): Promise<UserSummary> {
    const email = dto.email.toLowerCase();
    const exists = await this.prisma.user.findFirst({ where: { organizationId: req.organizationId, email } });
    if (exists) throw new ConflictException('A user with this email already exists');
    const role = await this.prisma.role.findUniqueOrThrow({ where: { organizationId_key: { organizationId: req.organizationId, key: dto.roleKey } } });
    const user = await this.prisma.user.create({
      data: { organizationId: req.organizationId, email, fullName: dto.fullName, phone: dto.phone ?? null, roleId: role.id, passwordHash: await bcrypt.hash(dto.password, 10) },
      include: { role: true },
    });
    return this.toDto(user);
  }

  async update(req: RequestUser, id: string, dto: UpdateUserDto): Promise<UserSummary> {
    const existing = await this.prisma.user.findFirst({ where: { id, organizationId: req.organizationId } });
    if (!existing) throw new NotFoundException('User not found');
    const data: any = {};
    if (dto.fullName !== undefined) data.fullName = dto.fullName;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.email !== undefined) data.email = dto.email.toLowerCase();
    if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, 10);
    if (dto.roleKey) {
      const role = await this.prisma.role.findUniqueOrThrow({ where: { organizationId_key: { organizationId: req.organizationId, key: dto.roleKey } } });
      data.roleId = role.id;
    }
    const user = await this.prisma.user.update({ where: { id }, data, include: { role: true } });
    return this.toDto(user);
  }
}
