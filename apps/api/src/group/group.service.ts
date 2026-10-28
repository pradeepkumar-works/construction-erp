import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { COMPANY_KIND_INFO, COMPANY_KIND_LABELS, GUEST_ROLES, ROLE_KEYS, ROLE_LABELS, orgCodeFrom, type GroupDto, type GroupPersonDto, type GroupStateDto, type RoleKey } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { withoutTenant } from '../prisma/tenant-context';
import { AuditService } from '../common/audit.service';
import { RequestUser } from '../common/current-user';
import { adminChangeProblem, placeProblem } from './group-rules';
import { GivePlaceDto, GroupCompanyDto, UpdateGroupCompanyDto } from './group.dto';

/**
 * Group companies (phase 1, ARCHITECTURE "Group companies"): a parent company's group, its companies and who works in
 * which. Each company stays a tenant of its own; this service reads and writes across them only for the group's admins,
 * outside the request's tenant (`withoutTenant`), and never touches a company's business records.
 */
@Injectable()
export class GroupService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  /** The caller's sign-in, their company's group and whether they run it. */
  private async whoAmI(req: RequestUser) {
    if (req.support) throw new ForbiddenException(`A support session cannot see or change the group`);
    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: req.id }, select: { loginId: true, fullName: true, phone: true, organization: { select: { groupId: true } } } });
    const groupId = me.organization.groupId;
    const admin = groupId ? !!(await this.prisma.groupAdmin.findUnique({ where: { groupId_loginId: { groupId, loginId: me.loginId } }, select: { id: true } })) : false;
    return { loginId: me.loginId, fullName: me.fullName, phone: me.phone, groupId, admin };
  }

  private async assertAdmin(req: RequestUser) {
    const me = await this.whoAmI(req);
    if (!me.groupId || !me.admin) throw new ForbiddenException("Only the group's admins can do this");
    return { ...me, groupId: me.groupId };
  }

  /** The company's group for its admins; without a group, whether the caller (a company admin) may make one. */
  async state(req: RequestUser): Promise<GroupStateDto> {
    const me = await this.whoAmI(req);
    if (!me.groupId) return { group: null, canMakeGroup: req.roleKey === 'ADMIN' };
    if (!me.admin) throw new ForbiddenException("Only the group's admins see its companies");
    return { group: await this.load(me.groupId, req.organizationId, me.loginId), canMakeGroup: false };
  }

  private load(groupId: string, currentOrgId: string, loginId: string): Promise<GroupDto> {
    const staff = { role: { key: { notIn: GUEST_ROLES } } };
    return withoutTenant(async () => {
      const [group, users] = await Promise.all([
        this.prisma.companyGroup.findUniqueOrThrow({
          where: { id: groupId },
          select: {
            id: true,
            name: true,
            admins: { select: { loginId: true } },
            companies: {
              select: { id: true, name: true, kind: true, legalName: true, pan: true, cin: true, gstin: true, _count: { select: { users: { where: { isActive: true, ...staff } } } } },
              orderBy: { name: 'asc' },
            },
          },
        }),
        this.prisma.user.findMany({
          where: { organization: { groupId }, ...staff },
          select: { loginId: true, fullName: true, email: true, isActive: true, organizationId: true, role: { select: { key: true, name: true } }, organization: { select: { name: true } } },
          orderBy: [{ fullName: 'asc' }, { organization: { name: 'asc' } }],
        }),
      ]);
      const admins = new Set(group.admins.map((a) => a.loginId));
      const people = new Map<string, GroupPersonDto>();
      for (const u of users) {
        let p = people.get(u.loginId);
        if (!p) people.set(u.loginId, (p = { loginId: u.loginId, fullName: u.fullName, email: u.email, admin: admins.has(u.loginId), places: [] }));
        p.places.push({ organizationId: u.organizationId, companyName: u.organization.name, roleKey: u.role.key as RoleKey, roleName: u.role.name, isActive: u.isActive });
      }
      const mine = new Map(users.filter((u) => u.loginId === loginId && u.isActive).map((u) => [u.organizationId, u.role.name]));
      return {
        id: group.id,
        name: group.name,
        companies: group.companies.map((c) => ({ id: c.id, name: c.name, kind: c.kind, legalName: c.legalName, pan: c.pan, cin: c.cin, gstin: c.gstin, people: c._count.users, current: c.id === currentOrgId, yourRole: mine.get(c.id) ?? null })),
        people: [...people.values()],
      };
    });
  }

  /** Make a group with the caller's company as its first: a company admin, who becomes the group's admin. */
  async make(req: RequestUser, name: string): Promise<GroupStateDto> {
    if (req.roleKey !== 'ADMIN') throw new ForbiddenException('Only an admin can make a group');
    const me = await this.whoAmI(req);
    if (me.groupId) throw new BadRequestException('This company is already in a group');
    await this.prisma.$transaction(async (tx) => {
      const group = await tx.companyGroup.create({ data: { name } });
      await tx.organization.update({ where: { id: req.organizationId }, data: { groupId: group.id } });
      await tx.groupAdmin.create({ data: { groupId: group.id, loginId: me.loginId } });
    });
    await this.audit.log(req, 'COMPANY', req.organizationId, 'GROUP_MADE', `Made the group ${name}`);
    return this.state(req);
  }

  /**
   * A new company in the group, of a kind that sets the modules it starts with. It gets the standard roles, and the
   * caller its admin on the same sign-in. It takes the plan and paid-until date of the company it was made from, so a
   * group company never starts a trial of its own.
   */
  async addCompany(req: RequestUser, dto: GroupCompanyDto): Promise<GroupStateDto> {
    const me = await this.assertAdmin(req);
    const here = await this.prisma.organization.findUniqueOrThrow({ where: { id: req.organizationId }, select: { moduleTier: true, trialEndsAt: true, paidUntil: true } });
    await withoutTenant(async () => {
      const base = orgCodeFrom(dto.name);
      let code = base;
      for (let i = 2; await this.prisma.organization.findUnique({ where: { code }, select: { id: true } }); i++) code = `${base}${i}`;
      await this.prisma.$transaction(async (tx) => {
        const org = await tx.organization.create({
          data: {
            name: dto.name,
            code,
            groupId: me.groupId,
            kind: dto.kind,
            legalName: dto.legalName ?? null,
            pan: dto.pan ?? null,
            cin: dto.cin ?? null,
            gstin: dto.gstin ?? null,
            modulesOff: [...COMPANY_KIND_INFO[dto.kind].modulesOff],
            moduleTier: here.moduleTier,
            trialEndsAt: here.trialEndsAt,
            paidUntil: here.paidUntil,
            // As for a new sign-up: payments against approved requests, progress from the DPR.
            paymentsNeedRequest: true,
            progressFromDpr: true,
          },
        });
        await tx.role.createMany({ data: ROLE_KEYS.map((key) => ({ organizationId: org.id, key, name: ROLE_LABELS[key] })) });
        const admin = await tx.role.findUniqueOrThrow({ where: { organizationId_key: { organizationId: org.id, key: 'ADMIN' } } });
        await tx.user.create({ data: { organizationId: org.id, roleId: admin.id, loginId: me.loginId, email: req.email, fullName: me.fullName, phone: me.phone } });
      });
    });
    await this.audit.log(req, 'COMPANY', req.organizationId, 'GROUP_COMPANY_ADDED', `Added ${dto.name} (${COMPANY_KIND_LABELS[dto.kind]}) to the group`);
    return this.state(req);
  }

  /** A company's name, kind and legal details. The kind changes no modules once the company is made. */
  async updateCompany(req: RequestUser, id: string, dto: UpdateGroupCompanyDto): Promise<GroupStateDto> {
    const me = await this.assertAdmin(req);
    const company = await withoutTenant(async () => await this.prisma.organization.findUnique({ where: { id }, select: { groupId: true, name: true } }));
    if (!company || company.groupId !== me.groupId) throw new NotFoundException('Company not found in this group');
    await withoutTenant(async () => await
      this.prisma.organization.update({
        where: { id },
        data: { name: dto.name, kind: dto.kind, legalName: dto.legalName, pan: dto.pan, cin: dto.cin, gstin: dto.gstin },
      }),
    );
    await this.audit.log(req, 'COMPANY', req.organizationId, 'GROUP_COMPANY_CHANGED', `Changed the details of ${dto.name ?? company.name}`);
    return this.state(req);
  }

  /**
   * Give someone who works in the group a place in one of its companies, on the sign-in they already have: a user there
   * with this role (or their old one there switched back on). They see it in the company switcher at once.
   */
  async givePlace(req: RequestUser, dto: GivePlaceDto): Promise<GroupStateDto> {
    const me = await this.assertAdmin(req);
    const { company, rows } = await withoutTenant(async () => ({
      company: await this.prisma.organization.findUnique({ where: { id: dto.organizationId }, select: { groupId: true, name: true } }),
      rows: await this.prisma.user.findMany({
        where: { loginId: dto.loginId },
        select: { id: true, organizationId: true, isActive: true, email: true, fullName: true, phone: true, organization: { select: { groupId: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    }));
    const existing = rows.find((r) => r.organizationId === dto.organizationId);
    const problem = placeProblem({
      roleKey: dto.roleKey,
      companyInGroup: !!company && company.groupId === me.groupId,
      personInGroup: rows.length > 0 && rows.every((r) => r.organization.groupId === me.groupId),
      existingActive: !!existing?.isActive,
    });
    if (problem) throw new BadRequestException(problem);
    await withoutTenant(async () => {
      const role = await this.prisma.role.findUniqueOrThrow({ where: { organizationId_key: { organizationId: dto.organizationId, key: dto.roleKey } } });
      if (existing) await this.prisma.user.update({ where: { id: existing.id }, data: { isActive: true, roleId: role.id } });
      else await this.prisma.user.create({ data: { organizationId: dto.organizationId, loginId: dto.loginId, email: rows[0].email, fullName: rows[0].fullName, phone: rows[0].phone, roleId: role.id } });
    });
    await this.audit.log(req, 'COMPANY', req.organizationId, 'GROUP_PLACE_GIVEN', `Gave ${rows[0].fullName} a place in ${company!.name} as ${ROLE_LABELS[dto.roleKey]}`);
    return this.state(req);
  }

  /** Make someone who works in the group one of its admins, or stop them being one (never the last). */
  async setAdmin(req: RequestUser, loginId: string, admin: boolean): Promise<GroupStateDto> {
    const me = await this.assertAdmin(req);
    const [person, admins] = await withoutTenant(() =>
      Promise.all([
        this.prisma.user.findFirst({ where: { loginId, organization: { groupId: me.groupId } }, select: { fullName: true } }),
        this.prisma.groupAdmin.findMany({ where: { groupId: me.groupId }, select: { loginId: true } }),
      ]),
    );
    if (!person) throw new NotFoundException('Choose someone who works in a company of this group');
    const isAdmin = admins.some((a) => a.loginId === loginId);
    const problem = adminChangeProblem({ adminCount: admins.length, isAdmin, makeAdmin: admin });
    if (problem) throw new BadRequestException(problem);
    if (admin && !isAdmin) await this.prisma.groupAdmin.create({ data: { groupId: me.groupId, loginId } });
    if (!admin && isAdmin) await this.prisma.groupAdmin.delete({ where: { groupId_loginId: { groupId: me.groupId, loginId } } });
    if (admin !== isAdmin) await this.audit.log(req, 'COMPANY', req.organizationId, admin ? 'GROUP_ADMIN_ADDED' : 'GROUP_ADMIN_REMOVED', `${person.fullName} ${admin ? 'now runs' : 'no longer runs'} the group`);
    return this.state(req);
  }
}
