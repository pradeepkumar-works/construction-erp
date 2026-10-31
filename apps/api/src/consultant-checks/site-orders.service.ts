import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CHECK_LEVEL_LABELS,
  SITE_ORDER_DEFAULT_DAYS,
  canApprove,
  canKeepSiteOrders,
  isClientGuest,
  siteOrderLabel,
  siteOrderProblem,
  siteOrderState,
  type CheckLevel,
  type SiteOrderDto,
  type SiteOrderStatus,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { dateOnly, iso, parseDate } from '../common/serialize';
import { todayIn } from '../notifications/time';
import { checkLevelOf } from './check-level';

const include = {
  project: { select: { name: true } },
  issuedBy: { select: { fullName: true } },
  repliedBy: { select: { fullName: true } },
  closedBy: { select: { fullName: true } },
  recordedBy: { select: { fullName: true } },
} satisfies Prisma.SiteOrderInclude;
type Row = Prisma.SiteOrderGetPayload<{ include: typeof include }>;

const addDays = (day: string, n: number) => {
  const d = parseDate(day);
  d.setUTCDate(d.getUTCDate() + n);
  return dateOnly(d);
};
const short = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export interface SiteOrderInput {
  date?: string;
  instruction: string;
  location?: string | null;
  complyBy?: string | null;
  /** Staff recording a paper order: who wrote it, as signed, and their level */
  issuedByName?: string | null;
  issuedByLevel?: CheckLevel | null;
}

/**
 * The site order book (item 172, ARCHITECTURE "Consultant checks"): the engineer's written instructions to the site, numbered
 * per project. The client's engineer or a consultant writes one in the portal, or staff copy one in from the paper book; the
 * site replies with its compliance and the engineer accepts it (or sends it back). Where an order stands is
 * `siteOrderState` in `@erp/shared/consultant-checks.ts`.
 */
@Injectable()
export class SiteOrdersService {
  constructor(private prisma: PrismaService, private access: ProjectAccessService, private audit: AuditService, private notifications: NotificationsService) {}

  toDto(r: Row, today = todayIn()): SiteOrderDto {
    const complyBy = dateOnly(r.complyBy);
    return {
      id: r.id,
      projectId: r.projectId,
      projectName: r.project.name,
      orderNo: r.orderNo,
      label: siteOrderLabel(r.orderNo),
      date: dateOnly(r.date),
      issuedById: r.issuedById,
      issuedByName: r.issuedBy?.fullName ?? r.issuedByName,
      issuedByLevel: r.issuedByLevel,
      fromPortal: !r.recordedById,
      location: r.location,
      instruction: r.instruction,
      complyBy,
      status: r.status,
      state: siteOrderState({ status: r.status, complyBy }, today),
      reply: r.reply,
      repliedByName: r.repliedBy?.fullName ?? null,
      repliedOn: dateOnly(r.repliedOn),
      closedByName: r.closedBy?.fullName ?? null,
      closedOn: dateOnly(r.closedOn),
      closeNote: r.closeNote,
      recordedByName: r.recordedBy?.fullName ?? null,
      createdAt: iso(r.createdAt),
    };
  }

  /** A project's book: waiting for compliance first, then the latest. */
  async list(user: RequestUser, projectId: string, status?: SiteOrderStatus): Promise<SiteOrderDto[]> {
    await this.access.assertCanAccessProject(user, projectId);
    const rows = await this.prisma.siteOrder.findMany({ where: { projectId, organizationId: user.organizationId, ...(status ? { status } : {}) }, include, orderBy: { orderNo: 'desc' }, take: 500 });
    const today = todayIn();
    const rank = { OPEN: 0, REPLIED: 1, CLOSED: 2 } as const;
    return rows.map((r) => this.toDto(r, today)).sort((a, b) => rank[a.status] - rank[b.status] || b.orderNo - a.orderNo);
  }

  private async load(user: RequestUser, id: string): Promise<Row> {
    const row = await this.prisma.siteOrder.findFirst({ where: { id, organizationId: user.organizationId }, include });
    if (!row) throw new NotFoundException('Site order not found');
    await this.access.assertCanAccessProject(user, row.projectId);
    return row;
  }

  /**
   * Write an order in the book. From the portal it is the guest's own, at their level; staff copying one in from the paper
   * book name who wrote it. The number is the project's next.
   */
  async create(user: RequestUser, projectId: string, dto: SiteOrderInput): Promise<SiteOrderDto> {
    const guest = isClientGuest(user.roleKey);
    if (guest) await this.access.assertCanActAsClient(user, projectId);
    else {
      await this.access.assertCanAccessProject(user, projectId);
      if (!canKeepSiteOrders(user.roleKey)) throw new ForbiddenException('Your role cannot record site orders');
      if (!dto.issuedByName?.trim()) throw new BadRequestException('Name the engineer who wrote the order, as signed in the book');
    }
    const today = todayIn();
    const date = dto.date ?? today;
    const complyBy = dto.complyBy === undefined ? addDays(date, SITE_ORDER_DEFAULT_DAYS) : dto.complyBy;
    const problem = siteOrderProblem({ instruction: dto.instruction, date, complyBy }, today);
    if (problem) throw new BadRequestException(problem);
    const level = guest ? await checkLevelOf(this.prisma, projectId, user.id) : (dto.issuedByLevel ?? null);
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`SITE_ORDER:${projectId}`}))`;
      const last = await tx.siteOrder.findFirst({ where: { projectId }, orderBy: { orderNo: 'desc' }, select: { orderNo: true } });
      return tx.siteOrder.create({
        data: {
          organizationId: user.organizationId,
          projectId,
          orderNo: (last?.orderNo ?? 0) + 1,
          date: parseDate(date),
          issuedById: guest ? user.id : null,
          issuedByName: guest ? user.fullName : dto.issuedByName!.trim(),
          issuedByLevel: level,
          location: dto.location?.trim() || null,
          instruction: dto.instruction.trim(),
          complyBy: complyBy ? parseDate(complyBy) : null,
          recordedById: guest ? null : user.id,
        },
        include,
      });
    });
    await this.audit.log(user, 'SITE_ORDER', row.id, 'CREATED', guest ? `Written in the portal${level ? ` by the ${CHECK_LEVEL_LABELS[level].toLowerCase()}` : ''}` : `Recorded from the book: written by ${row.issuedByName}`);
    if (guest) {
      await this.notifications.handoff({
        organizationId: user.organizationId,
        projectId,
        roles: ['SITE_ENGINEER', 'TEAM_LEADER', 'PROJECT_MANAGER'],
        exceptUserIds: [user.id],
        title: `${siteOrderLabel(row.orderNo)} from ${user.fullName}: reply with the compliance`,
        body: `${row.project.name}${row.location ? `, ${row.location}` : ''}: ${short(row.instruction)}${complyBy ? ` Comply by ${complyBy}.` : ''}`,
        entityType: 'SITE_ORDER',
        entityId: row.id,
        email: { href: `/projects/${projectId}?tab=site-orders&order=${row.id}`, cta: 'Reply with the compliance' },
      });
    }
    return this.toDto(row);
  }

  /** The site's compliance reply: what was done. The engineer who wrote it and the project's guests are told. */
  async reply(user: RequestUser, id: string, reply: string): Promise<SiteOrderDto> {
    const row = await this.load(user, id);
    if (!canKeepSiteOrders(user.roleKey)) throw new ForbiddenException('Your role cannot reply to site orders');
    if (row.status !== 'OPEN') throw new ConflictException(row.status === 'CLOSED' ? 'This order is closed' : 'This order already has its compliance reply; the engineer accepts it or sends it back');
    if (!reply.trim()) throw new BadRequestException('Write what was done to comply');
    const updated = await this.prisma.siteOrder.update({ where: { id }, data: { status: 'REPLIED', reply: reply.trim(), repliedById: user.id, repliedOn: parseDate(todayIn()) }, include });
    await this.audit.log(user, 'SITE_ORDER', id, 'REPLIED', short(reply.trim(), 300));
    const guests = await this.access.projectGuests(user.organizationId, row.projectId);
    await this.notifications.notify({
      organizationId: user.organizationId,
      userIds: [...new Set([...(row.issuedById ? [row.issuedById] : []), ...guests.map((g) => g.id)])],
      type: 'PORTAL',
      title: `${siteOrderLabel(row.orderNo)}: the site has complied`,
      body: `${row.project.name}: ${short(reply.trim())} Accept it or send it back in the portal.`,
      projectId: row.projectId,
      entityType: 'SITE_ORDER',
      entityId: id,
    });
    return this.toDto(updated);
  }

  /**
   * The engineer accepts the compliance and closes the order, from the portal. Staff close an order copied in from the
   * paper book once the engineer has signed it off there.
   */
  async close(user: RequestUser, id: string, note: string | null): Promise<SiteOrderDto> {
    const row = await this.load(user, id);
    if (isClientGuest(user.roleKey)) await this.access.assertCanActAsClient(user, row.projectId);
    else {
      if (row.issuedById) throw new ForbiddenException('The engineer who wrote this order in the portal closes it there');
      if (!canKeepSiteOrders(user.roleKey)) throw new ForbiddenException('Your role cannot close site orders');
    }
    if (row.status !== 'REPLIED') throw new ConflictException(row.status === 'CLOSED' ? 'This order is already closed' : 'The site has not replied to this order yet');
    const text = note?.trim() || null;
    const updated = await this.prisma.siteOrder.update({ where: { id }, data: { status: 'CLOSED', closedById: user.id, closedOn: parseDate(todayIn()), closeNote: text }, include });
    await this.audit.log(user, 'SITE_ORDER', id, 'CLOSED', text);
    if (isClientGuest(user.roleKey))
      await this.notifications.notify({
        organizationId: user.organizationId,
        userIds: [...new Set([row.repliedById, ...(await this.access.projectPeople(row.projectId))].filter((u): u is string => !!u && u !== user.id))].slice(0, 50),
        type: 'HANDOFF',
        title: `${siteOrderLabel(row.orderNo)} closed by ${user.fullName}`,
        body: `${row.project.name}: the compliance was accepted.${text ? ` ${text}` : ''}`,
        projectId: row.projectId,
        entityType: 'SITE_ORDER',
        entityId: id,
      });
    return this.toDto(updated);
  }

  /** The engineer does not accept the compliance: the order opens again with their note, for a new reply. */
  async reopen(user: RequestUser, id: string, note: string): Promise<SiteOrderDto> {
    const row = await this.load(user, id);
    await this.access.assertCanActAsClient(user, row.projectId);
    if (row.status !== 'REPLIED') throw new ConflictException('Only an order with a compliance reply is sent back');
    if (!note.trim()) throw new BadRequestException('Say what is still to be done');
    const updated = await this.prisma.siteOrder.update({ where: { id }, data: { status: 'OPEN', closeNote: note.trim() }, include });
    await this.audit.log(user, 'SITE_ORDER', id, 'REOPENED', note.trim());
    await this.notifications.handoff({
      organizationId: user.organizationId,
      projectId: row.projectId,
      roles: ['SITE_ENGINEER', 'PROJECT_MANAGER'],
      alsoUserIds: [row.repliedById],
      exceptUserIds: [user.id],
      title: `${siteOrderLabel(row.orderNo)} sent back by ${user.fullName}`,
      body: `${row.project.name}: ${short(note.trim())}`,
      entityType: 'SITE_ORDER',
      entityId: id,
      email: { href: `/projects/${row.projectId}?tab=site-orders&order=${id}`, cta: 'Reply again' },
    });
    return this.toDto(updated);
  }

  /** A paper order copied in by mistake: while it waits for a reply, by whoever recorded it or an approver. */
  async remove(user: RequestUser, id: string) {
    const row = await this.load(user, id);
    if (row.issuedById) throw new ForbiddenException('An order written in the portal stays in the book');
    if (row.recordedById !== user.id && !canApprove(user.roleKey)) throw new ForbiddenException('Whoever recorded the order, or an approver, deletes it');
    if (row.status !== 'OPEN' || row.reply) throw new ConflictException('An order with a compliance reply stays in the book');
    await this.prisma.siteOrder.delete({ where: { id } });
    await this.audit.log(user, 'SITE_ORDER', id, 'DELETED', `${siteOrderLabel(row.orderNo)}: ${short(row.instruction, 200)}`);
    return { ok: true };
  }
}
