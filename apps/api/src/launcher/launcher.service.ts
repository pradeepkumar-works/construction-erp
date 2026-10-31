import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { NavPin, NavVisit } from '@prisma/client';
import {
  LAUNCHER_PIN_MAX,
  LAUNCHER_RECENT_SHOWN,
  LAUNCHER_VISITS_KEPT,
  LAUNCHER_VISIT_GAP_MS,
  MODULE_KEYS,
  MODULE_SUBMISSION_TYPES,
  byPosition,
  navNode,
  navRootOf,
  pathIsOff,
  positionBetween,
  type LauncherBadgesDto,
  type LauncherDto,
  type NavPinDto,
  type NavPinKind,
  type NavVisitDto,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectAccessService } from '../common/project-access.service';
import { RequestUser } from '../common/current-user';
import { iso } from '../common/serialize';
import { configuredWebUrl } from '../common/web-url';
import { HomeService } from '../dashboard/home.service';
import { CreatePinDto, ImportDto, VisitDto } from './launcher.dto';
import { flagDto, myRequestDto } from './home-tiles.service';

const pinDto = (p: NavPin, label = p.label): NavPinDto => ({ id: p.id, kind: p.kind, target: p.target, label, position: p.position });
const visitDto = (v: NavVisit, label = v.label): NavVisitDto => ({ kind: v.kind, target: v.target, label, href: v.href, lastAt: iso(v.lastAt)! });

/**
 * Pins and Recent on the launcher Home (ARCHITECTURE "Launcher Home"). They belong to the user and follow them to
 * every browser and the phone. Projects are checked against the caller's access when pinned and again when read, so a pin
 * never shows a name the user may no longer see; a tree node is checked by the app, which knows the menu.
 */
@Injectable()
export class LauncherService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private home: HomeService,
  ) {}

  /** Pins and the latest places, with project names as they are now; and for Discover, the company's marks, the
   *  tiles the user has opened and their requests for access. */
  async get(user: RequestUser): Promise<LauncherDto> {
    const mine = { userId: user.id, organizationId: user.organizationId };
    const [pins, visits, nodeVisits, flags, requests, org] = await Promise.all([
      this.prisma.navPin.findMany({ where: mine }),
      this.prisma.navVisit.findMany({ where: mine, orderBy: { lastAt: 'desc' }, take: LAUNCHER_RECENT_SHOWN * 3 }),
      this.prisma.navVisit.findMany({ where: { ...mine, kind: 'NODE' }, select: { target: true } }),
      this.prisma.launcherFlag.findMany({ where: { organizationId: user.organizationId } }),
      this.prisma.accessRequest.findMany({ where: mine, orderBy: { createdAt: 'desc' } }),
      this.prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId }, select: { discoverLocked: true } }),
    ]);
    const latestRequest = new Map<string, (typeof requests)[number]>();
    for (const r of requests) if (!latestRequest.has(r.nodeId)) latestRequest.set(r.nodeId, r);
    const opened = [...new Set(nodeVisits.flatMap((v) => navRootOf(v.target) ?? []))];
    const projectIds = [...new Set([...pins, ...visits].filter((x) => x.kind === 'PROJECT').map((x) => x.target))];
    const projects = projectIds.length ? await this.prisma.project.findMany({ where: { AND: [this.access.projectWhere(user), { id: { in: projectIds } }] }, select: { id: true, name: true } }) : [];
    const projectName = new Map(projects.map((p) => [p.id, p.name]));
    // A page of a module the company switched off stays saved but is left out until it is on again.
    const off = (href: string | null | undefined) => !!href && pathIsOff(href, user.modulesOff);
    const nameOf = (kind: string, target: string, label: string): string | null => {
      if (kind === 'PROJECT') return projectName.get(target) ?? null;
      if (kind === 'NODE') {
        const node = navNode(target);
        return node && !off(node.route) ? node.label : null;
      }
      return off(target) ? null : label;
    };
    return {
      pins: byPosition(pins).flatMap((p) => {
        const label = nameOf(p.kind, p.target, p.label);
        return label === null ? [] : [pinDto(p, label)];
      }),
      recent: visits.flatMap((v) => {
        const label = nameOf(v.kind, v.target, v.label);
        return label === null ? [] : [visitDto(v, label)];
      }),
      flags: flags.map(flagDto),
      opened,
      requests: [...latestRequest.values()].map(myRequestDto),
      discoverLocked: org.discoverLocked,
      webUrl: configuredWebUrl(),
    };
  }

  /** What a pin is called, after checking the caller may pin it. */
  private async labelFor(user: RequestUser, kind: NavPinKind, target: string): Promise<string> {
    if (kind === 'NODE') {
      const node = navNode(target);
      if (!node || node.status !== 'live') throw new BadRequestException('That page is not in the menu');
      if (node.route && pathIsOff(node.route, user.modulesOff)) throw new BadRequestException('That module is turned off for your company');
      return node.label;
    }
    const project = await this.prisma.project.findFirst({ where: { AND: [this.access.projectWhere(user), { id: target }] }, select: { name: true } });
    if (!project) throw new NotFoundException('Project not found');
    return project.name;
  }

  async pin(user: RequestUser, dto: CreatePinDto): Promise<NavPinDto> {
    const label = await this.labelFor(user, dto.kind, dto.target);
    const pins = byPosition(await this.prisma.navPin.findMany({ where: { userId: user.id, organizationId: user.organizationId } }));
    const already = pins.find((p) => p.kind === dto.kind && p.target === dto.target);
    if (already) return pinDto(already, label);
    if (pins.length >= LAUNCHER_PIN_MAX) throw new BadRequestException(`Pinned is full (${LAUNCHER_PIN_MAX}). Unpin one first`);
    const position = dto.position && !pins.some((p) => p.position === dto.position) ? dto.position : positionBetween(pins.at(-1)?.position ?? null, null);
    const row = await this.prisma.navPin.create({ data: { organizationId: user.organizationId, userId: user.id, kind: dto.kind, target: dto.target, label, position } });
    return pinDto(row);
  }

  async move(user: RequestUser, id: string, position: string): Promise<NavPinDto> {
    const pin = await this.prisma.navPin.findFirst({ where: { id, userId: user.id, organizationId: user.organizationId } });
    if (!pin) throw new NotFoundException('Pin not found');
    return pinDto(await this.prisma.navPin.update({ where: { id }, data: { position } }));
  }

  async unpin(user: RequestUser, id: string): Promise<{ ok: true }> {
    await this.prisma.navPin.deleteMany({ where: { id, userId: user.id, organizationId: user.organizationId } });
    return { ok: true };
  }

  /** A place opened: counted again only after a short gap; projects and records beyond the latest few are let go. */
  async visit(user: RequestUser, dto: VisitDto, at = new Date()): Promise<{ ok: true }> {
    if (dto.kind === 'NODE' && !navNode(dto.target)) throw new BadRequestException('That page is not in the menu');
    const key = { userId_kind_target: { userId: user.id, kind: dto.kind, target: dto.target } };
    const old = await this.prisma.navVisit.findUnique({ where: key });
    if (old && old.organizationId !== user.organizationId) throw new NotFoundException();
    if (old) {
      if (at.getTime() - old.lastAt.getTime() < LAUNCHER_VISIT_GAP_MS && old.label === dto.label) return { ok: true };
      await this.prisma.navVisit.update({ where: key, data: { lastAt: at > old.lastAt ? at : old.lastAt, label: dto.label, href: dto.href, count: { increment: 1 } } });
    } else {
      await this.prisma.navVisit.create({ data: { organizationId: user.organizationId, userId: user.id, kind: dto.kind, target: dto.target, label: dto.label, href: dto.href, firstAt: at, lastAt: at } });
    }
    if (dto.kind !== 'NODE') await this.trim(user);
    return { ok: true };
  }

  private async trim(user: RequestUser) {
    const stale = await this.prisma.navVisit.findMany({
      where: { userId: user.id, organizationId: user.organizationId, kind: { in: ['PROJECT', 'RECORD'] } },
      orderBy: { lastAt: 'desc' },
      skip: LAUNCHER_VISITS_KEPT,
      select: { id: true },
    });
    if (stale.length) await this.prisma.navVisit.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
  }

  /** The old Home's favourites and recent pages from one browser: added once, after anything already on the account. */
  async import(user: RequestUser, dto: ImportDto): Promise<LauncherDto> {
    for (const p of dto.pins) {
      try {
        await this.pin(user, { kind: p.kind, target: p.target });
      } catch {
        // A favourite the user can no longer open, or Pinned is full: left out.
      }
    }
    for (const v of [...dto.visits].sort((a, b) => a.at - b.at)) {
      try {
        await this.visit(user, v, new Date(Math.min(v.at, Date.now())));
      } catch {
        // A page that is no longer in the menu.
      }
    }
    return this.get(user);
  }

  /** What waits on the caller, on the tiles that lead to it: Approvals, each module (its entries to approve), My work and Watch list. */
  async badges(user: RequestUser): Promise<LauncherBadgesDto> {
    const work = await this.home.myWork(user);
    const nodes: Record<string, number> = {};
    const add = (id: string, n: number | undefined) => {
      if (n && n > 0) nodes[id] = (nodes[id] ?? 0) + n;
    };
    const approvals = work.approvals ?? [];
    add('approvals', approvals.reduce((t, a) => t + a.count, 0));
    for (const key of MODULE_KEYS) {
      const types = new Set<string>(MODULE_SUBMISSION_TYPES[key]);
      add(key, approvals.filter((a) => types.has(a.type)).reduce((t, a) => t + a.count, 0));
    }
    add('my-work', (nodes.approvals ?? 0) + (work.sentBack?.count ?? 0) + (work.dprsMissing?.count ?? 0));
    add('watch', work.watchList?.count);
    // Each desk's queue on the tile that opens it.
    add('purchases.toOrder', work.toOrder?.count);
    add('quality.grns', work.grnsToCheck?.count);
    add('quality.audits', work.findingsToClose?.count);
    add('purchases.toBill', work.toMatch?.count);
    add('accounts.debitNotes', work.toDebit?.count);
    return { nodes, approvals: approvals.filter((a) => a.count > 0) };
  }
}
