import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { ROLE_LABELS, type CreateUserResultDto, type Paginated, type PasswordLinkDto, type RoleKey, type SortOrder, type UserSortField, type UserSummary } from '@erp/shared';
import { ilike, pageArgs, paginated, searchWords } from '../common/paging';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { CreateUserDto, ListUsersQuery, UpdateUserDto } from './users.dto';
import { PasswordLinksService } from '../auth/password-links.service';
import { ProjectsService } from '../projects/projects.service';
import { withoutTenant } from '../prisma/tenant-context';
import { emailUse, sharedLoginProblem } from '../group/group-rules';

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
  constructor(
    private prisma: PrismaService,
    private links: PasswordLinksService,
    private projects: ProjectsService,
  ) {}

  private toDto(u: { id: string; email: string; fullName: string; phone: string | null; isActive: boolean; invitedAt: Date | null; createdAt: Date; role: { key: string; name: string } }): UserSummary {
    return { id: u.id, email: u.email, fullName: u.fullName, phone: u.phone, isActive: u.isActive, roleKey: u.role.key as RoleKey, roleName: ROLE_LABELS[u.role.key as RoleKey], createdAt: u.createdAt.toISOString(), invitePending: u.invitedAt !== null };
  }

  /** Sign-in is by email alone, so an email belongs to one sign-in across all organisations. */
  private async assertEmailFree(email: string, exceptLoginId?: string) {
    const exists = await withoutTenant(() => this.prisma.login.findFirst({ where: { email, ...(exceptLoginId ? { id: { not: exceptLoginId } } : {}) }, select: { id: true } }));
    if (exists) throw new ConflictException('A user with this email already exists');
  }

  /** The other companies a user's sign-in reaches (group companies), by name. */
  private async otherCompanies(loginId: string, exceptUserId: string): Promise<string[]> {
    const rows = await withoutTenant(async () => await this.prisma.user.findMany({ where: { loginId, id: { not: exceptUserId } }, select: { organization: { select: { name: true } } }, orderBy: { createdAt: 'asc' } }));
    return rows.map((r) => r.organization.name);
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
    const roles = await this.prisma.role.findMany({ where: { organizationId: req.organizationId, key: { not: 'SUPPLIER' } }, select: { id: true, key: true }, orderBy: { name: 'asc' } });
    return roles.map((r) => ({ ...r, name: ROLE_LABELS[r.key as RoleKey] }));
  }

  /**
   * With a password the user can sign in at once; without one they are invited (set-password link). Someone who already
   * signs in to a sister company of the group gets a place here on that same sign-in, with no invite and their password kept.
   */
  async create(req: RequestUser, dto: CreateUserDto, origin?: string): Promise<CreateUserResultDto> {
    const email = dto.email.toLowerCase();
    if (dto.roleKey === 'SUPPLIER') throw new BadRequestException("Give a supplier a login from their vendor's page (Portal logins)");
    const [login, here] = await Promise.all([
      withoutTenant(async () => await this.prisma.login.findUnique({ where: { email }, select: { id: true, users: { select: { organizationId: true, organization: { select: { name: true, groupId: true } } } } } })),
      this.prisma.organization.findUniqueOrThrow({ where: { id: req.organizationId }, select: { groupId: true } }),
    ]);
    const use = emailUse(login?.users.map((u) => ({ organizationId: u.organizationId, groupId: u.organization.groupId })) ?? [], { organizationId: req.organizationId, groupId: here.groupId });
    if (use === 'HERE') throw new ConflictException('This person is already a user of this company');
    if (use === 'ELSEWHERE') throw new ConflictException('A user with this email already exists');
    const role = await this.prisma.role.findUniqueOrThrow({ where: { organizationId_key: { organizationId: req.organizationId, key: dto.roleKey } } });
    const sister = use === 'SISTER';
    const invite = !sister && !dto.password;
    // An invited user gets an unguessable password nobody knows until they use the link.
    const passwordHash = sister ? null : await bcrypt.hash(dto.password || randomBytes(24).toString('base64url'), 10);
    // A sign-in left behind by a deleted user is taken over; a new person gets a new one.
    const loginId = login
      ? (passwordHash ? await this.prisma.login.update({ where: { id: login.id }, data: { passwordHash, tokensValidAfter: new Date() } }) : login).id
      : (await this.prisma.login.create({ data: { email, passwordHash: passwordHash! } })).id;
    const user = await this.prisma.user.create({
      data: {
        organizationId: req.organizationId,
        loginId,
        email,
        fullName: dto.fullName,
        phone: dto.phone ?? null,
        roleId: role.id,
        invitedAt: invite ? new Date() : null,
      },
      include: { role: true },
    });
    // The projects they were given on the form, so they do not have to be added from each project in turn.
    if (dto.projectIds?.length) await this.projects.addToProjects(req, user.id, dto.projectIds);
    return {
      ...this.toDto(user),
      invite: invite ? await this.links.create(user.id, 'INVITE', origin) : null,
      ...(sister ? { alsoIn: login!.users.map((u) => u.organization.name) } : {}),
    };
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
    // WhatsApp entries are read from the number they were switched on with: a new number switches them off.
    if (dto.phone !== undefined && dto.phone !== existing.phone) data.captureFrom = null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    // The email and password belong to the person's sign-in, which may reach sister companies too (group companies).
    const login: any = {};
    const emailChanged = dto.email !== undefined && dto.email.toLowerCase() !== existing.email;
    if (emailChanged || dto.password) {
      const others = await this.otherCompanies(existing.loginId, id);
      const problem = sharedLoginProblem(others, emailChanged ? 'email' : 'password');
      if (problem) throw new BadRequestException(problem);
    }
    if (emailChanged) {
      data.email = login.email = dto.email!.toLowerCase();
      await this.assertEmailFree(data.email, existing.loginId);
    }
    if (dto.password) {
      login.passwordHash = await bcrypt.hash(dto.password, 10);
      data.invitedAt = null;
      // A password the admin sets ends the sessions signed in with the old one.
      login.tokensValidAfter = new Date();
    }
    if (Object.keys(login).length) await this.prisma.login.update({ where: { id: existing.loginId }, data: login });
    if (dto.roleKey && (dto.roleKey === 'SUPPLIER') !== (existing.vendorId !== null)) throw new BadRequestException('A supplier login stays a supplier login, tied to its vendor');
    if (dto.roleKey) {
      const role = await this.prisma.role.findUniqueOrThrow({ where: { organizationId_key: { organizationId: req.organizationId, key: dto.roleKey } } });
      data.roleId = role.id;
    }
    const user = await this.prisma.user.update({ where: { id }, data, include: { role: true } });
    return this.toDto(user);
  }
}
