import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  PIPE_ELEMENT_TYPES,
  VALVE_NODE_KINDS,
  activityPipeStage,
  canEditProjects,
  comparePipeCodes,
  importPlan,
  isLengthUnit,
  networkProblems,
  segmentStatus,
  workingFronts,
  zoneTable,
  type PipeNetworkDto,
  type PipeNetworkImportResultDto,
  type PipeStage,
  type PipeZoneDto,
  type SegmentStage,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import type { RequestUser } from '../common/current-user';
import { dec } from '../common/serialize';
import { PipeNetworkImportDto, UpdatePipeSegmentDto } from './pipe-network.dto';

type Db = PrismaService | Prisma.TransactionClient;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** A zone's or main's leaf activities and the pipe stage each stands for. */
export async function stageActivities(db: Db, where: Prisma.WorkElementWhereInput) {
  const zones = await db.workElement.findMany({
    where: { ...where, elementType: { in: PIPE_ELEMENT_TYPES } },
    select: {
      id: true,
      code: true,
      name: true,
      elementType: true,
      level: true,
      parent: { select: { name: true } },
      activities: { where: { subActivities: { none: {} } }, select: { id: true, name: true, unit: true, pipeStage: true }, orderBy: { sortOrder: 'asc' } },
    },
  });
  const stageOf = new Map<string, { stage: PipeStage; zoneId: string; metres: boolean }>();
  for (const z of zones)
    for (const a of z.activities) {
      const stage = activityPipeStage({ pipeStage: a.pipeStage, name: a.name, elementType: z.elementType });
      if (stage) stageOf.set(a.id, { stage, zoneId: z.id, metres: stage !== 'VALVES' && isLengthUnit(a.unit) });
    }
  return { zones, stageOf };
}

/**
 * What each segment's stages already hold: metres on lines that are not rejected, per segment and activity, leaving
 * out one DPR's own lines (they are being saved). Keyed `segmentId|activityId`.
 */
export async function heldOnSegments(db: Db, segmentIds: string[], exceptDprId?: string): Promise<Map<string, number>> {
  if (!segmentIds.length) return new Map();
  const rows = await db.progressEntry.groupBy({
    by: ['pipeSegmentId', 'activityId'],
    where: { pipeSegmentId: { in: segmentIds }, status: { not: 'REJECTED' }, ...(exceptDprId ? { OR: [{ dailyReportId: null }, { dailyReportId: { not: exceptDprId } }] } : {}) },
    _sum: { quantity: true },
  });
  return new Map(rows.map((r) => [`${r.pipeSegmentId}|${r.activityId}`, Number(r._sum.quantity ?? 0)]));
}

/**
 * Pipe network (ARCHITECTURE "Pipe network"): a project's pipe zones and mains with their junctions and
 * segments, how far each stage has got on each segment, the zone tables by diameter and the working fronts, and the
 * import that loads or refreshes a zone's model.
 */
@Injectable()
export class PipeNetworkService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
  ) {}

  async get(user: RequestUser, projectId: string): Promise<PipeNetworkDto> {
    await this.access.assertCanAccessProject(user, projectId);
    return this.network(projectId, canEditProjects(user.roleKey));
  }

  /** The network and its figures without the caller's checks, for the reconciliation's pipe view, which has made them. */
  async network(projectId: string, canEdit = false): Promise<PipeNetworkDto> {
    const [{ zones, stageOf }, nodes, segments, tested] = await Promise.all([
      stageActivities(this.prisma, { projectId }),
      this.prisma.pipeNode.findMany({ where: { projectId } }),
      this.prisma.pipeSegment.findMany({ where: { projectId }, include: { fromNode: { select: { code: true } }, toNode: { select: { code: true } } } }),
      this.prisma.pipeTestSegment.findMany({ where: { segment: { projectId }, qualityTest: { result: 'PASS' } }, select: { segmentId: true } }),
    ]);
    const stageIds = [...stageOf.keys()];
    const [approved, waiting, unplaced, fixed] = stageIds.length
      ? await Promise.all([
          this.prisma.progressEntry.groupBy({ by: ['pipeSegmentId', 'activityId'], where: { activityId: { in: stageIds }, status: 'APPROVED', pipeSegmentId: { not: null } }, _sum: { quantity: true } }),
          this.prisma.progressEntry.groupBy({ by: ['pipeSegmentId', 'activityId'], where: { activityId: { in: stageIds }, status: 'SUBMITTED', pipeSegmentId: { not: null } }, _sum: { quantity: true } }),
          this.prisma.progressEntry.groupBy({ by: ['activityId'], where: { activityId: { in: stageIds }, status: 'APPROVED', pipeSegmentId: null }, _sum: { quantity: true } }),
          this.prisma.progressEntry.findMany({ where: { activityId: { in: stageIds }, status: 'APPROVED', pipeNodeId: { not: null } }, select: { pipeNodeId: true, activityId: true }, distinct: ['pipeNodeId'] }),
        ])
      : [[], [], [], []];

    const perSegment = (rows: { pipeSegmentId: string | null; activityId: string; _sum: { quantity: Prisma.Decimal | null } }[]) => {
      const out = new Map<string, Partial<Record<SegmentStage, number>>>();
      for (const r of rows) {
        const s = stageOf.get(r.activityId);
        if (!r.pipeSegmentId || !s?.metres) continue;
        const m = out.get(r.pipeSegmentId) ?? {};
        const stage = s.stage as SegmentStage;
        m[stage] = round3((m[stage] ?? 0) + Number(r._sum.quantity ?? 0));
        out.set(r.pipeSegmentId, m);
      }
      return out;
    };
    const done = perSegment(approved);
    const pending = perSegment(waiting);
    const testedIds = new Set(tested.map((t) => t.segmentId));
    const fixedIds = new Set(fixed.flatMap((f) => (f.pipeNodeId && stageOf.get(f.activityId)?.stage === 'VALVES' ? [f.pipeNodeId] : [])));

    const segmentDtos = segments
      .map((s) => {
        const lengthM = Number(s.lengthM);
        return {
          id: s.id,
          zoneId: s.zoneId,
          code: s.code,
          fromNodeId: s.fromNodeId,
          fromCode: s.fromNode.code,
          toNodeId: s.toNodeId,
          toCode: s.toNode.code,
          lengthM: dec(s.lengthM)!,
          diameterMm: s.diameterMm,
          material: s.material,
          pipeClass: s.pipeClass,
          scope: s.scope,
          surface: s.surface,
          crossing: s.crossing,
          status: segmentStatus(lengthM, { done: s.scope === 'PROPOSED' ? (done.get(s.id) ?? {}) : {}, tested: s.scope === 'PROPOSED' && testedIds.has(s.id) }),
          waiting: pending.get(s.id) ?? {},
        };
      })
      .sort((a, b) => comparePipeCodes(a.code, b.code));
    const nodeKinds = nodes.map((n) => ({ code: n.code, kind: n.kind }));
    const unplacedOf = new Map(unplaced.map((u) => [u.activityId, Number(u._sum.quantity ?? 0)]));

    const zoneDtos: PipeZoneDto[] = zones
      .map((z) => {
        const mine = segmentDtos.filter((s) => s.zoneId === z.id);
        const stageActivityIds: Partial<Record<PipeStage, string>> = {};
        const unplacedM: Partial<Record<SegmentStage, number>> = {};
        for (const a of z.activities) {
          const s = stageOf.get(a.id);
          if (!s) continue;
          stageActivityIds[s.stage] ??= a.id;
          const left = unplacedOf.get(a.id) ?? 0;
          if (s.metres && left > 0) unplacedM[s.stage as SegmentStage] = round3((unplacedM[s.stage as SegmentStage] ?? 0) + left);
        }
        return {
          id: z.id,
          code: z.code,
          name: z.name,
          label: z.level === 'SUB_COMPONENT' && z.parent ? `${z.parent.name} › ${z.name}` : z.name,
          elementType: z.elementType,
          nodes: nodes.filter((n) => n.zoneId === z.id).length,
          pipes: mine.length,
          stageActivities: stageActivityIds,
          table: zoneTable(mine.map((s) => ({ diameterMm: s.diameterMm, material: s.material, lengthM: Number(s.lengthM), scope: s.scope, status: s.status }))),
          fronts: workingFronts(
            mine.map((s) => ({ id: s.id, code: s.code, fromCode: s.fromCode, toCode: s.toCode, scope: s.scope, status: s.status, lengthM: Number(s.lengthM) })),
            nodeKinds,
          ),
          unplacedM,
        };
      })
      .sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));

    return {
      projectId,
      zones: zoneDtos,
      nodes: nodes
        .map((n) => ({ id: n.id, zoneId: n.zoneId, code: n.code, kind: n.kind, groundLevel: dec(n.groundLevel), x: n.x, y: n.y, chainage: n.chainage, fixed: fixedIds.has(n.id) }))
        .sort((a, b) => comparePipeCodes(a.code, b.code)),
      segments: segmentDtos,
      canEdit,
    };
  }

  /**
   * Loads or refreshes a zone's network from a model file read on the screen: nodes and pipes matched by code, so work
   * recorded on a pipe stays with it. A dry run only says what saving would do. Saving plans the zone's stages at its
   * proposed length (valves at its valve count).
   */
  async import(user: RequestUser, projectId: string, dto: PipeNetworkImportDto): Promise<PipeNetworkImportResultDto> {
    await this.access.assertCanAccessProject(user, projectId);
    const zone = await this.prisma.workElement.findFirst({ where: { id: dto.zoneId, projectId }, select: { id: true, code: true, name: true, elementType: true } });
    if (!zone || !PIPE_ELEMENT_TYPES.includes(zone.elementType)) throw new BadRequestException('Choose a pipe zone or main of this project');
    const file = { nodes: dto.nodes.map((n) => ({ ...n, code: n.code.trim() })), pipes: dto.pipes.map((p) => ({ ...p, code: p.code.trim(), from: p.from.trim(), to: p.to.trim() })) };

    const [nodes, pipes] = await Promise.all([
      this.prisma.pipeNode.findMany({ where: { projectId } }),
      this.prisma.pipeSegment.findMany({ where: { projectId }, include: { fromNode: { select: { code: true } }, toNode: { select: { code: true } } } }),
    ]);
    const inFile = new Set(file.nodes.map((n) => n.code));
    const problems = networkProblems(file, nodes.filter((n) => !inFile.has(n.code)).map((n) => n.code));
    const elsewhere = new Map(pipes.filter((p) => p.zoneId !== zone.id).map((p) => [p.code, p]));
    for (const p of file.pipes) if (elsewhere.has(p.code)) problems.push(`Pipe ${p.code} is already in another zone or main of this project; pipe codes are unique in a project`);

    const mine = pipes.filter((p) => p.zoneId === zone.id);
    const held = await heldOnSegments(this.prisma, mine.map((p) => p.id));
    const doneOf = new Map<string, number>();
    for (const [key, m] of held) {
      const id = key.split('|')[0];
      doneOf.set(id, Math.max(doneOf.get(id) ?? 0, m));
    }
    const plan = importPlan(
      {
        nodes: nodes.filter((n) => n.zoneId === zone.id).map((n) => ({ code: n.code, kind: n.kind, groundLevel: n.groundLevel === null ? null : Number(n.groundLevel), x: n.x, y: n.y, chainage: n.chainage })),
        pipes: mine.map((p) => ({ code: p.code, from: p.fromNode.code, to: p.toNode.code, lengthM: Number(p.lengthM), diameterMm: p.diameterMm, material: p.material, pipeClass: p.pipeClass, scope: p.scope, surface: p.surface, crossing: p.crossing, doneM: doneOf.get(p.id) ?? 0 })),
      },
      { nodes: file.nodes.filter((n) => !nodes.some((o) => o.code === n.code && o.zoneId !== zone.id)), pipes: file.pipes },
    );
    for (const code of plan.shortened) problems.push(`Pipe ${code} would be shorter than the work already recorded on it`);
    const kept = mine.filter((p) => !file.pipes.some((f) => f.code === p.code));
    const proposedM = round3(file.pipes.filter((p) => p.scope === 'PROPOSED').reduce((s, p) => s + p.lengthM, 0) + kept.filter((p) => p.scope === 'PROPOSED').reduce((s, p) => s + Number(p.lengthM), 0));
    if (dto.dryRun || problems.length) return { plan, problems, saved: false, proposedM };

    await this.prisma.$transaction(
      async (tx) => {
        const zoneOf = new Map(nodes.map((n) => [n.code, n.zoneId]));
        for (const n of file.nodes) {
          const data = { kind: n.kind, groundLevel: n.groundLevel === null || n.groundLevel === undefined ? null : new Prisma.Decimal(n.groundLevel), x: n.x ?? null, y: n.y ?? null, chainage: n.chainage ?? null };
          const owner = zoneOf.get(n.code);
          if (owner && owner !== zone.id) continue; // a tank or junction of another zone, only referred to
          if (owner) await tx.pipeNode.update({ where: { projectId_code: { projectId, code: n.code } }, data });
          else await tx.pipeNode.create({ data: { ...data, organizationId: user.organizationId, projectId, zoneId: zone.id, code: n.code } });
        }
        const idOf = new Map((await tx.pipeNode.findMany({ where: { projectId }, select: { id: true, code: true } })).map((n) => [n.code, n.id]));
        for (const [i, p] of file.pipes.entries()) {
          const data = {
            fromNodeId: idOf.get(p.from)!,
            toNodeId: idOf.get(p.to)!,
            lengthM: new Prisma.Decimal(round3(p.lengthM)),
            diameterMm: p.diameterMm,
            material: p.material,
            pipeClass: p.pipeClass ?? null,
            scope: p.scope,
            surface: p.surface ?? null,
            crossing: p.crossing ?? null,
            sortOrder: i,
          };
          await tx.pipeSegment.upsert({
            where: { projectId_code: { projectId, code: p.code } },
            update: data,
            create: { ...data, organizationId: user.organizationId, projectId, zoneId: zone.id, code: p.code },
          });
        }
        await this.planFromNetwork(tx, zone.id);
      },
      { timeout: 60_000 },
    );
    const { added, changed } = plan.pipes;
    await this.audit.log(user, 'PROJECT', projectId, 'PIPE_NETWORK_IMPORTED', `${zone.code} ${zone.name}: ${added} pipes added, ${changed} changed, ${round3(proposedM)} m proposed`);
    return { plan, problems, saved: true, proposedM };
  }

  /** Corrects a segment from the site: its length (never below the work on it), diameter, material, class, scope. */
  async updateSegment(user: RequestUser, projectId: string, id: string, dto: UpdatePipeSegmentDto) {
    await this.access.assertCanAccessProject(user, projectId);
    const seg = await this.prisma.pipeSegment.findFirst({ where: { id, projectId } });
    if (!seg) throw new NotFoundException('Pipe segment not found in this project');
    if (dto.lengthM !== undefined) {
      const held = Math.max(0, ...(await heldOnSegments(this.prisma, [id])).values());
      if (dto.lengthM < held - 0.001) throw new BadRequestException(`${seg.code} already has ${round3(held)} m recorded on one stage; enter at least that length`);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.pipeSegment.update({
        where: { id },
        data: {
          ...(dto.lengthM !== undefined ? { lengthM: new Prisma.Decimal(round3(dto.lengthM)) } : {}),
          ...(dto.diameterMm !== undefined ? { diameterMm: dto.diameterMm } : {}),
          ...(dto.material !== undefined ? { material: dto.material } : {}),
          ...(dto.pipeClass !== undefined ? { pipeClass: dto.pipeClass?.trim() || null } : {}),
          ...(dto.scope !== undefined ? { scope: dto.scope } : {}),
          ...(dto.surface !== undefined ? { surface: dto.surface?.trim() || null } : {}),
          ...(dto.crossing !== undefined ? { crossing: dto.crossing?.trim() || null } : {}),
        },
      });
      await this.planFromNetwork(tx, seg.zoneId);
    });
    await this.audit.log(user, 'PROJECT', projectId, 'PIPE_SEGMENT_UPDATED', seg.code);
    return { ok: true };
  }

  /** The zone's length stages are planned at its proposed length, its valve stage at its count of valves and fittings. */
  async planFromNetwork(tx: Db, zoneId: string) {
    const [{ stageOf }, proposed, valves] = await Promise.all([
      stageActivities(tx, { id: zoneId }),
      tx.pipeSegment.aggregate({ where: { zoneId, scope: 'PROPOSED' }, _sum: { lengthM: true } }),
      tx.pipeNode.count({ where: { zoneId, kind: { in: VALVE_NODE_KINDS } } }),
    ]);
    const total = proposed._sum.lengthM ?? new Prisma.Decimal(0);
    const metres = [...stageOf].filter(([, s]) => s.metres).map(([id]) => id);
    if (metres.length && total.gt(0)) await tx.activity.updateMany({ where: { id: { in: metres } }, data: { plannedQty: total } });
    const valveIds = [...stageOf].filter(([, s]) => s.stage === 'VALVES').map(([id]) => id);
    if (valveIds.length && valves > 0) await tx.activity.updateMany({ where: { id: { in: valveIds }, unit: { in: ['Nos', 'No', 'nos', 'Each'] } }, data: { plannedQty: new Prisma.Decimal(valves) } });
  }
}

