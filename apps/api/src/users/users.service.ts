import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import type { CreateUserResultDto, Paginated, PasswordLinkDto, RoleKey, SortOrder, UserSortField, UserSummary } from '@erp/shared';
import { ilike, pageArgs, paginated, searchWords } from '../common/paging';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { CreateUserDto, ListUsersQuery, UpdateUserDto } from './users.dto';
import { PasswordLinksService } from '../auth/password-links.service';
import { withoutTenant } from '../prisma/tenant-context';

const ORDER: Record<UserSortField, (o: SortOrder) => Prisma.UserOrderByWithRelationInput[]> = {
  fullName: (o) => [{ fullName: o }],
  email: (o) => [{ email: o }],
  role: (o) => [{ role: { name: o } }, { fullName: 'asc' }],
  isActive: (o) => [{ isActive: o }, { fullName: 'asc' }],
  createdAt: (o) => [{ createdAt: o }],
};

/** What a user's row in the list (and a picker) shows: never the password hash. */
const USER_FIELDS = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  isActive: true,
  invitedAt: true,
  createdAt: true,
  role: { select: { key: true, name: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService, private links: PasswordLinksService) {}

  private toDto(u: { id: string; email: string; fullName: string; phone: string | null; isActive: boolean; invitedAt: Date | null; createdAt: Date; role: { key: string; name: string } }): UserSummary {
    return { id: u.id, email: u.email, fullName: u.fullName, phone: u.phone, isActive: u.isActive, roleKey: u.role.key as RoleKey, roleName: u.role.name, createdAt: u.createdAt.toISOString(), invitePending: u.invitedAt !== null };
  }

  /** Sign-in is by email alone, so an email may belong to one user across all organisations. */
  private async assertEmailFree(email: string, exceptId?: string) {
    const exists = await withoutTenant(() => this.prisma.user.findFirst({ where: { email, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { organizationId: true } }));
    if (exists) throw new ConflictException('A user with this email already exists');
  }

  async list(req: RequestUser, q: ListUsersQuery): Promise<Paginated<UserSummary>> {
    const where: Prisma.UserWhereInput = { organizationId: req.organizationId };
    if (q.roleKey) where.role = { key: q.roleKey };
    else if (q.roleKeys?.length) where.role = { key: { in: q.roleKeys } };
    if (q.isActive !== undefined) where.isActive = q.isActive;
    const words = searchWords(q.q);
    if (words.length) where.AND = words.map((w) => ({ OR: [{ fullName: ilike(w) }, { email: ilike(w) }, { phone: ilike(w) }] }));
    const sortBy = q.sortBy ?? 'fullName';
    const order = q.sortOrder ?? (sortBy === 'createdAt' ? 'desc' : 'asc');
    const args = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({ where, select: USER_FIELDS, orderBy: [...ORDER[sortBy](order), { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.user.count({ where }),
    ]);
    return paginated(rows.map((u) => this.toDto(u)), total, args);
  }

  async roles(req: RequestUser) {
    // A supplier's login is made from their vendor (the supplier portal), never here.
    return this.prisma.role.findMany({ where: { organizationId: req.organizationId, key: { not: 'SUPPLIER' } }, select: { id: true, key: true, name: true }, orderBy: { name: 'asc' } });
  }

  /** With a password the user can sign in at once; without one they are invited (set-password link). */
  async create(req: RequestUser, dto: CreateUserDto, origin?: string): Promise<CreateUserResultDto> {
    const email = dto.email.toLowerCase();
    if (dto.roleKey === 'SUPPLIER') throw new BadRequestException("Give a supplier a login from their vendor's page (Portal logins)");
    await this.assertEmailFree(email);
    const role = await this.prisma.role.findUniqueOrThrow({ where: { organizationId_key: { organizationId: req.organizationId, key: dto.roleKey } } });
    const invite = !dto.password;
    const user = await this.prisma.user.create({
      data: {
        organizationId: req.organizationId,
        email,
        fullName: dto.fullName,
        phone: dto.phone ?? null,
        roleId: role.id,
        // An invited user gets an unguessable password nobody knows until they use the link.
        passwordHash: await bcrypt.hash(dto.password || randomBytes(24).toString('base64url'), 10),
        invitedAt: invite ? new Date() : null,
      },
      include: { role: true },
    });
    return { ...this.toDto(user), invite: invite ? await this.links.create(user.id, 'INVITE', origin) : null };
  }

  async passwordLink(req: RequestUser, id: string, origin?: string): Promise<PasswordLinkDto> {
    const user = await this.prisma.user.findFirst({ where: { id, organizationId: req.organizationId }, select: { id: true, isActive: true, invitedAt: true } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.isActive) throw new BadRequestException('Activate the user first');
    return this.links.create(user.id, user.invitedAt ? 'INVITE' : 'RESET', origin);
  }

  async update(req: RequestUser, id: string, dto: UpdateUserDto): Promise<UserSummary> {
    const existing = await this.prisma.user.findFirst({ where: { id, organizationId: req.organizationId } });
    if (!existing) throw new NotFoundException('User not found');
    const data: any = {};
    if (dto.fullName !== undefined) data.fullName = dto.fullName;
    if (dto.phone !== undefined) data.phone = dto.phone;
    // WhatsApp entries (AI item 120) are read from the number they were switched on with: a new number switches them off.
    if (dto.phone !== undefined && dto.phone !== existing.phone) data.captureFrom = null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.email !== undefined) {
      data.email = dto.email.toLowerCase();
      await this.assertEmailFree(data.email, id);
    }
    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
      data.invitedAt = null;
      // A password the admin sets ends the sessions signed in with the old one.
      data.tokensValidAfter = new Date();
    }
    if (dto.roleKey && (dto.roleKey === 'SUPPLIER') !== (existing.vendorId !== null)) throw new BadRequestException('A supplier login stays a supplier login, tied to its vendor');
    if (dto.roleKey) {
      const role = await this.prisma.role.findUniqueOrThrow({ where: { organizationId_key: { organizationId: req.organizationId, key: dto.roleKey } } });
      data.roleId = role.id;
    }
    const user = await this.prisma.user.update({ where: { id }, data, include: { role: true } });
    return this.toDto(user);
  }
}
