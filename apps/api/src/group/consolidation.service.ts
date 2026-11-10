import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  canNameSisterCompanies,
  canSeeConsolidation,
  tallyClientKey,
  tallyVendorKey,
  type CompanyKind,
  type ConsolidationBasis,
  type ConsolidationDto,
  type SisterLinksDto,
  type StatementLine,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { asTenant, withoutTenant } from '../prisma/tenant-context';
import { AuditService } from '../common/audit.service';
import { RequestUser } from '../common/current-user';
import { StatementsService } from '../statements/statements.service';
import { companyPeriod, consolidate, type CompanyFigures } from './consolidation-rules';
import { SisterLinkDto } from './consolidation.dto';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

/**
 * Consolidated accounts (item 192, ARCHITECTURE "Consolidated accounts") and the sister companies each company names.
 * Every figure is a company's own statement, read through `StatementsService` as that company (`asTenant`, so its
 * books post under its own row-level security); only the reads that span companies (the group's companies, the links,
 * the group's admins) are `withoutTenant`, each query awaited inside its callback. The arithmetic is `consolidation-rules.ts`.
 */
@Injectable()
export class ConsolidationService {
  constructor(private prisma: PrismaService, private audit: AuditService, private statements: StatementsService) {}

  /** The caller's company: its group and kind, and whether the caller runs the group, as the shared rules take them. */
  private async who(req: RequestUser) {
    if (req.support) throw new ForbiddenException('A support session cannot see the group');
    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: req.id }, select: { loginId: true, organization: { select: { groupId: true, kind: true } } } });
    const { groupId, kind } = me.organization;
    const admin = groupId ? !!(await withoutTenant(async () => await this.prisma.groupAdmin.findUnique({ where: { groupId_loginId: { groupId, loginId: me.loginId } }, select: { id: true } }))) : false;
    return { roleKey: req.roleKey, groupId, companyKind: kind as CompanyKind, group: groupId ? { admin } : undefined };
  }

  // Consolidated accounts

  async consolidation(req: RequestUser, q: { from: string; to: string; basis?: ConsolidationBasis }): Promise<ConsolidationDto> {
    const me = await this.who(req);
    if (!me.groupId || !canSeeConsolidation(me)) throw new ForbiddenException("Only the group's admins see the consolidated accounts, from the holding company");
    if (q.from > q.to) throw new BadRequestException('From is after to. Choose an earlier from date.');
    const basis = q.basis ?? 'BOOKS';
    const groupId = me.groupId;
    // Across companies: which companies, and the links between them. Each company's own books are read as that company.
    const { all, links } = await withoutTenant(async () => {
      const all = await this.prisma.organization.findMany({ where: { groupId }, select: { id: true, name: true, kind: true, modulesOff: true, suspendedAt: true } });
      const ids = all.map((c) => c.id);
      const links = await this.prisma.sisterLink.findMany({ where: { organizationId: { in: ids }, sisterId: { in: ids } }, select: { organizationId: true, sisterId: true, vendorId: true, clientId: true } });
      return { all, links };
    });
    // The holding first, then the others by name. A company with its books switched off has no statements to add.
    all.sort((a, b) => Number(b.kind === 'HOLDING') - Number(a.kind === 'HOLDING') || byName(a, b));
    const companies = all.filter((c) => !c.modulesOff.includes('books'));
    const leftOut = all.filter((c) => c.modulesOff.includes('books')).map((c) => ({ id: c.id, name: c.name, reason: 'Its books are switched off' }));

    const read = await Promise.all(
      companies.map(async (c) => {
        const { booksFrom, lockedUpTo, closedYear } = await asTenant(c.id, async () => await this.statements.lockAndClose(c.id));
        const period = companyPeriod(basis, q, lockedUpTo);
        const parties = new Map(links.filter((l) => l.organizationId === c.id).map((l) => [l.vendorId ? tallyVendorKey(l.vendorId) : tallyClientKey(l.clientId!), l.sisterId]));
        const figures = await asTenant(c.id, async () => await this.statements.companyFigures(c.id, period, parties));
        return { c, booksFrom, lockedUpTo, closedYear, period, figures };
      }),
    );

    const input: CompanyFigures[] = read.map(({ c, booksFrom, period, figures }) => {
      const lines: Partial<Record<StatementLine, Prisma.Decimal>> = {};
      const pl = figures.profitLoss;
      for (const l of pl ? [...pl.income, ...pl.expenses, pl.tax] : []) lines[l.line] = D(l.amount);
      for (const s of figures.balanceSheet.sections) for (const l of s.lines) lines[l.line] = D(l.amount);
      return { id: c.id, name: c.name, lines, sisters: figures.sisters, noBooks: !!booksFrom && booksFrom > period.to };
    });
    return {
      from: q.from,
      to: q.to,
      basis,
      companies: read.map(({ c, booksFrom, lockedUpTo, closedYear, period, figures }) => ({
        id: c.id,
        name: c.name,
        kind: c.kind as CompanyKind,
        from: period.from,
        to: period.to,
        lockedUpTo,
        closedYear,
        booksFrom,
        suspended: !!c.suspendedAt,
        difference: figures.balanceSheet.difference,
      })),
      ...consolidate(
        input,
        links.map((l) => ({ companyId: l.organizationId, sisterId: l.sisterId })),
      ),
      leftOut,
    };
  }

  // Sister companies

  private async assertNames(req: RequestUser) {
    const me = await this.who(req);
    if (!me.groupId || !canNameSisterCompanies(me)) throw new ForbiddenException("Only an admin of a group's company names its sister companies");
    return { ...me, groupId: me.groupId };
  }

  /** The company's vendors and clients named as sisters, the sisters' links that name it, and what is left to name. */
  async sisters(req: RequestUser): Promise<SisterLinksDto> {
    const me = await this.assertNames(req);
    const org = req.organizationId;
    const [links, vendors, clients] = await Promise.all([
      this.prisma.sisterLink.findMany({ where: { organizationId: org }, select: { id: true, vendorId: true, clientId: true, sisterId: true, vendor: { select: { name: true } }, client: { select: { name: true } } } }),
      this.prisma.vendor.findMany({ where: { organizationId: org, isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      this.prisma.client.findMany({ where: { organizationId: org, isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    const { companies, namedBy } = await withoutTenant(async () => ({
      companies: await this.prisma.organization.findMany({ where: { OR: [{ groupId: me.groupId }, { id: { in: links.map((l) => l.sisterId) } }] }, select: { id: true, name: true, groupId: true } }),
      namedBy: await this.prisma.sisterLink.findMany({
        where: { sisterId: org, organization: { groupId: me.groupId } },
        select: { organization: { select: { id: true, name: true } }, vendor: { select: { name: true } }, client: { select: { name: true } } },
      }),
    }));
    const company = new Map(companies.map((c) => [c.id, c]));
    const taken = new Set(links.map((l) => l.vendorId ?? l.clientId));
    return {
      links: links
        .map((l) => ({
          id: l.id,
          party: l.vendorId ? ('VENDOR' as const) : ('CLIENT' as const),
          partyId: (l.vendorId ?? l.clientId)!,
          partyName: (l.vendor?.name ?? l.client?.name)!,
          sisterId: l.sisterId,
          sisterName: company.get(l.sisterId)?.name ?? '',
          outsideGroup: company.get(l.sisterId)?.groupId !== me.groupId,
        }))
        .sort((a, b) => a.sisterName.localeCompare(b.sisterName) || a.partyName.localeCompare(b.partyName)),
      namedBy: namedBy
        .map((n) => ({ companyId: n.organization.id, companyName: n.organization.name, party: n.vendor ? ('VENDOR' as const) : ('CLIENT' as const), partyName: (n.vendor?.name ?? n.client?.name)! }))
        .sort((a, b) => a.companyName.localeCompare(b.companyName) || a.partyName.localeCompare(b.partyName)),
      sisters: companies.filter((c) => c.groupId === me.groupId && c.id !== org).map((c) => ({ id: c.id, name: c.name })).sort(byName),
      vendors: vendors.filter((v) => !taken.has(v.id)),
      clients: clients.filter((c) => !taken.has(c.id)),
    };
  }

  /** Name a vendor or client as a sister company of the group (or change which sister it is). */
  async setSister(req: RequestUser, dto: SisterLinkDto): Promise<SisterLinksDto> {
    const me = await this.assertNames(req);
    const org = req.organizationId;
    if (!!dto.vendorId === !!dto.clientId) throw new BadRequestException('Choose either a vendor or a client');
    if (dto.sisterId === org) throw new BadRequestException('Choose another company of the group: this one is your own');
    const sister = await withoutTenant(async () => await this.prisma.organization.findUnique({ where: { id: dto.sisterId }, select: { name: true, groupId: true } }));
    if (!sister || sister.groupId !== me.groupId) throw new BadRequestException('Choose a company of your group');
    const party = dto.vendorId
      ? await this.prisma.vendor.findFirst({ where: { id: dto.vendorId, organizationId: org }, select: { name: true } })
      : await this.prisma.client.findFirst({ where: { id: dto.clientId, organizationId: org }, select: { name: true } });
    if (!party) throw new NotFoundException(dto.vendorId ? 'Vendor not found' : 'Client not found');
    const where = dto.vendorId ? { organizationId_vendorId: { organizationId: org, vendorId: dto.vendorId } } : { organizationId_clientId: { organizationId: org, clientId: dto.clientId! } };
    const link = await this.prisma.sisterLink.upsert({
      where,
      create: { organizationId: org, vendorId: dto.vendorId ?? null, clientId: dto.clientId ?? null, sisterId: dto.sisterId, createdById: req.id },
      update: { sisterId: dto.sisterId },
    });
    await this.audit.log(req, 'SISTER_LINK', link.id, 'SISTER_NAMED', `${dto.vendorId ? 'Vendor' : 'Client'} ${party.name} is the sister company ${sister.name}`);
    return this.sisters(req);
  }

  async removeSister(req: RequestUser, id: string): Promise<SisterLinksDto> {
    await this.assertNames(req);
    const link = await this.prisma.sisterLink.findFirst({ where: { id, organizationId: req.organizationId }, select: { id: true, vendor: { select: { name: true } }, client: { select: { name: true } } } });
    if (!link) throw new NotFoundException('Sister company link not found');
    await this.prisma.sisterLink.delete({ where: { id } });
    await this.audit.log(req, 'SISTER_LINK', id, 'SISTER_UNNAMED', `${link.vendor ? 'Vendor' : 'Client'} ${link.vendor?.name ?? link.client?.name} is no longer named as a sister company`);
    return this.sisters(req);
  }
}
