import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AccessRequest, LauncherFlag } from '@prisma/client';
import {
  LAUNCHER_FLAG_NODES,
  canManageUsers,
  canRequestNav,
  canSeeNav,
  navNode,
  type AccessRequestDto,
  type HomeTilesDto,
  type LauncherFlagDto,
  type MyAccessRequestDto,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { RequestUser } from '../common/current-user';
import { dateOnly, iso, parseDate } from '../common/serialize';
import { NotificationsService } from '../notifications/notifications.service';
import { AccessDecisionDto, AccessRequestCreateDto, HomeTilesSettingsDto, LauncherFlagSetDto } from './launcher.dto';

export const flagDto = (f: LauncherFlag): LauncherFlagDto => ({ nodeId: f.nodeId, isNew: f.isNew, newUntil: dateOnly(f.newUntil), featured: f.featured });
export const myRequestDto = (r: AccessRequest): MyAccessRequestDto => ({ id: r.id, nodeId: r.nodeId, status: r.status, reply: r.reply, createdAt: iso(r.createdAt), decidedAt: iso(r.decidedAt) });

const requestInclude = { user: { select: { fullName: true, role: { select: { key: true } } } }, decidedBy: { select: { fullName: true } } } as const;
type RequestRow = AccessRequest & { user: { fullName: string; role: { key: string } }; decidedBy: { fullName: string } | null };

const requestDto = (r: RequestRow): AccessRequestDto => ({
  ...myRequestDto(r),
  nodeLabel: navNode(r.nodeId)?.label ?? r.nodeId,
  userId: r.userId,
  userName: r.user.fullName,
  roleKey: r.user.role.key as AccessRequestDto['roleKey'],
  note: r.note,
  decidedByName: r.decidedBy?.fullName ?? null,
});

/** Answered requests Admin › Home tiles keeps showing under the waiting ones. */
const ANSWERED_SHOWN = 30;

/**
 * Home tiles (ARCHITECTURE "Discover and access requests"): the company's New and Featured marks on Home's tiles, its
 * Discover switch, and requests for access. Admins (`canManageUsers`, who also change roles) mark and answer; anyone may ask
 * for a module their role cannot open. Changes are audited, and requests notify the admins and then the person.
 */
@Injectable()
export class HomeTilesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
  ) {}

  private guard(user: RequestUser) {
    if (!canManageUsers(user.roleKey)) throw new ForbiddenException('Only admins manage Home tiles');
  }

  async get(user: RequestUser): Promise<HomeTilesDto> {
    this.guard(user);
    const where = { organizationId: user.organizationId };
    const [flags, org, open, answered] = await Promise.all([
      this.prisma.launcherFlag.findMany({ where }),
      this.prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId }, select: { discoverLocked: true } }),
      this.prisma.accessRequest.findMany({ where: { ...where, status: 'OPEN' }, include: requestInclude, orderBy: { createdAt: 'asc' } }),
      this.prisma.accessRequest.findMany({ where: { ...where, status: { not: 'OPEN' } }, include: requestInclude, orderBy: { decidedAt: 'desc' }, take: ANSWERED_SHOWN }),
    ]);
    return { flags: flags.map(flagDto), discoverLocked: org.discoverLocked, requests: [...open, ...answered].map(requestDto) };
  }

  async setFlag(user: RequestUser, nodeId: string, dto: LauncherFlagSetDto): Promise<LauncherFlagDto> {
    this.guard(user);
    const node = LAUNCHER_FLAG_NODES.find((n) => n.id === nodeId);
    if (!node) throw new NotFoundException('That is not one of Home’s tiles');
    if (dto.newUntil && !dto.isNew) throw new BadRequestException('Turn on New to give it a last day');
    const data = { isNew: dto.isNew ?? null, newUntil: dto.isNew && dto.newUntil ? parseDate(dto.newUntil) : null, featured: dto.featured ?? null, updatedById: user.id };
    const row = await this.prisma.launcherFlag.upsert({
      where: { organizationId_nodeId: { organizationId: user.organizationId, nodeId } },
      create: { organizationId: user.organizationId, nodeId, ...data },
      update: data,
    });
    const say = (v: boolean | null, word: string) => (v === null ? `${word}: as shipped` : `${word}: ${v ? 'on' : 'off'}`);
    await this.audit.log(user, 'COMPANY', user.organizationId, 'HOME_TILES', `${node.label}. ${say(row.isNew, 'New')}${row.newUntil ? ` until ${dateOnly(row.newUntil)}` : ''}; ${say(row.featured, 'Featured')}`);
    return flagDto(row);
  }

  async setSettings(user: RequestUser, dto: HomeTilesSettingsDto): Promise<HomeTilesDto> {
    this.guard(user);
    await this.prisma.organization.update({ where: { id: user.organizationId }, data: { discoverLocked: dto.discoverLocked } });
    await this.audit.log(user, 'COMPANY', user.organizationId, 'HOME_TILES', dto.discoverLocked ? 'Discover shows modules a role cannot open' : 'Discover shows only modules a role can open');
    return this.get(user);
  }

  /** Someone asks for a module their role cannot open. One waiting request per module; asking again returns it. */
  async request(user: RequestUser, dto: AccessRequestCreateDto): Promise<MyAccessRequestDto> {
    const node = navNode(dto.nodeId);
    if (!node) throw new NotFoundException('No such module');
    if (canSeeNav(user, node)) throw new BadRequestException(`You can already open ${node.label}`);
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId }, select: { discoverLocked: true } });
    if (!org.discoverLocked || !canRequestNav(user, node)) throw new BadRequestException(`${node.label} cannot be asked for here. Ask your admin`);
    const waiting = await this.prisma.accessRequest.findFirst({ where: { organizationId: user.organizationId, userId: user.id, nodeId: node.id, status: 'OPEN' } });
    if (waiting) return myRequestDto(waiting);
    const row = await this.prisma.accessRequest.create({ data: { organizationId: user.organizationId, userId: user.id, nodeId: node.id, note: dto.note?.trim() || null } });
    await this.audit.log(user, 'ACCESS_REQUEST', row.id, 'REQUESTED', `${node.label}${row.note ? `: ${row.note}` : ''}`);
    const admins = await this.prisma.user.findMany({ where: { organizationId: user.organizationId, isActive: true, role: { key: 'ADMIN' } }, select: { id: true } });
    await this.notifications.notify({
      organizationId: user.organizationId,
      userIds: admins.map((a) => a.id),
      type: 'ACCESS_REQUEST',
      title: `${user.fullName} asks to open ${node.label}`,
      body: row.note ?? 'Change their role, or turn the module on, then mark it granted. Or decline it.',
      entityType: 'ACCESS_REQUEST',
      entityId: row.id,
    });
    return myRequestDto(row);
  }

  /** An admin answers: granted (after changing the role or turning the module on) or declined, with a line for the person. */
  async decide(user: RequestUser, id: string, dto: AccessDecisionDto): Promise<AccessRequestDto> {
    this.guard(user);
    const row = await this.prisma.accessRequest.findFirst({ where: { id, organizationId: user.organizationId }, include: requestInclude });
    if (!row) throw new NotFoundException('Request not found');
    if (row.status !== 'OPEN') throw new BadRequestException('That request has been answered');
    const reply = dto.reply?.trim() || null;
    if (dto.status === 'DECLINED' && !reply) throw new BadRequestException('Say why, so they know what to do');
    const done = await this.prisma.accessRequest.update({ where: { id }, data: { status: dto.status, reply, decidedById: user.id, decidedAt: new Date() }, include: requestInclude });
    const label = navNode(row.nodeId)?.label ?? row.nodeId;
    await this.audit.log(user, 'ACCESS_REQUEST', id, dto.status, `${label} for ${row.user.fullName}${reply ? `: ${reply}` : ''}`);
    await this.notifications.notify({
      organizationId: user.organizationId,
      userIds: [row.userId],
      type: 'ACCESS_REQUEST',
      title: dto.status === 'GRANTED' ? `You can open ${label} now` : `Your request to open ${label} was declined`,
      body: reply ?? (dto.status === 'GRANTED' ? 'Sign out and in again if it is not on Home yet.' : `${user.fullName} declined it.`),
      entityType: 'ACCESS_DECISION',
      entityId: id,
    });
    return requestDto(done);
  }
}
