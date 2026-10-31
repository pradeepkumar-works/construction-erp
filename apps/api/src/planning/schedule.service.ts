import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ActivityLinkDto, GanttActivityDto, GanttDto, LookaheadActivityDto, LookaheadDto, MilestoneDto, ScheduleFileFormat, ScheduleImportResultDto } from '@erp/shared';
import { linkLabel, revisedCompletion } from '@erp/shared';
import { expectedPct, milestoneState, scheduleState, slipDays } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { UndoService } from '../common/undo.service';
import { dateOnly, iso, parseDate, pct } from '../common/serialize';
import { todayIn } from '../notifications/time';
import { CreateLinkDto, CreateMilestoneDto, FreezeBaselineDto, ImportScheduleDto, UpdateLinkDto, UpdateMilestoneDto } from './schedule.dto';
import { criticalPath, findCycle, linkProblem, lookaheadWeeks, moves, readiness, type NetLink } from './schedule-rules';
import { parseMsProjectXml, parseXer, toMsProjectXml, toXer, type ScheduleFile } from './schedule-files';

const D = (v: string | number | Prisma.Decimal) => new Prisma.Decimal(v);
const maxDate = (dates: (string | null)[]) => dates.reduce<string | null>((m, d) => (d && (!m || d > m) ? d : m), null);

/**
 * Gantt, milestones and the schedule baseline (v4 item 43). Freezing the baseline copies every activity's planned dates
 * and every milestone's due date to their baseline columns; the plan can then move while the baseline stays put.
 */
@Injectable()
export class ScheduleService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private undo: UndoService,
  ) {
    undo.register('MILESTONE', { entityType: 'MILESTONE', check: (user, row) => this.access.assertCanAccessProject(user, row.projectId as string) });
  }

  private toMilestoneDto(m: Prisma.MilestoneGetPayload<object>, today: string): MilestoneDto {
    const dueDate = dateOnly(m.dueDate);
    const achievedOn = dateOnly(m.achievedOn);
    return {
      id: m.id,
      projectId: m.projectId,
      name: m.name,
      dueDate,
      baselineDate: dateOnly(m.baselineDate),
      achievedOn,
      note: m.note,
      sortOrder: m.sortOrder,
      state: milestoneState({ dueDate, achievedOn }, today),
      slipDays: slipDays(achievedOn ?? dueDate, dateOnly(m.baselineDate)),
    };
  }

  async gantt(user: RequestUser, projectId: string): Promise<GanttDto> {
    await this.access.assertCanAccessProject(user, projectId);
    const today = todayIn();
    const [project, activities, milestones] = await Promise.all([
      this.prisma.project.findFirst({ where: { id: projectId }, select: { startDate: true, endDate: true, baselineAt: true, baselineNote: true, baselineBy: { select: { fullName: true } }, risks: { where: { kind: 'DELAY' }, select: { eotGrantedDays: true } } } }),
      this.prisma.activity.findMany({
        where: { projectId },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: {
          boqItem: { select: { itemNo: true } },
          responsible: { select: { fullName: true } },
          progressEntries: { where: { status: 'APPROVED' }, select: { date: true, quantity: true }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] },
        },
      }),
      this.prisma.milestone.findMany({ where: { projectId }, orderBy: [{ dueDate: 'asc' }, { sortOrder: 'asc' }] }),
    ]);
    const links = await this.prisma.activityLink.findMany({ where: { projectId }, orderBy: { createdAt: 'asc' } });
    if (!project) throw new NotFoundException('Project not found');

    const rows: GanttActivityDto[] = activities.map((a) => {
      let done = D(0);
      let actualEnd: string | null = null;
      for (const e of a.progressEntries) {
        done = done.add(e.quantity);
        if (!actualEnd && a.plannedQty.gt(0) && done.gte(a.plannedQty)) actualEnd = dateOnly(e.date);
      }
      const progressPct = pct(done, a.plannedQty);
      const plannedStart = dateOnly(a.plannedStart);
      const plannedEnd = dateOnly(a.plannedEnd);
      const baselineEnd = dateOnly(a.baselineEnd);
      return {
        id: a.id,
        name: a.name,
        unit: a.unit,
        boqItemNo: a.boqItem?.itemNo ?? null,
        responsibleName: a.responsible?.fullName ?? null,
        plannedStart,
        plannedEnd,
        baselineStart: dateOnly(a.baselineStart),
        baselineEnd,
        actualStart: a.progressEntries.length ? dateOnly(a.progressEntries[0].date) : null,
        actualEnd: progressPct >= 100 ? actualEnd : null,
        progressPct,
        expectedPct: expectedPct(plannedStart, plannedEnd, today),
        state: scheduleState({ plannedStart, plannedEnd, progressPct }, today),
        finishSlipDays: slipDays(progressPct >= 100 && actualEnd ? actualEnd : plannedEnd, baselineEnd),
        earlyStart: null,
        earlyFinish: null,
        lateStart: null,
        lateFinish: null,
        totalFloat: null,
        critical: false,
        linkStartsOn: null,
        predecessors: links.filter((l) => l.successorId === a.id).map((l) => ({ linkId: l.id, activityId: l.predecessorId, type: l.type, lagDays: l.lagDays })),
      };
    });
    // The critical path over the links: done work where it ran, the rest from its planned dates.
    const net = criticalPath(
      rows.map((r) =>
        r.state === 'DONE' && r.actualStart && r.actualEnd
          ? { id: r.id, start: r.actualStart, end: r.actualEnd, done: true }
          : { id: r.id, start: r.plannedStart, end: r.plannedEnd, done: r.state === 'DONE', startedOn: r.actualStart },
      ),
      links.map((l) => ({ pred: l.predecessorId, succ: l.successorId, type: l.type, lag: l.lagDays })),
    );
    for (const r of rows) {
      const c = net?.results.get(r.id);
      if (!c) continue;
      r.earlyStart = c.es;
      r.earlyFinish = c.ef;
      r.lateStart = c.ls;
      r.lateFinish = c.lf;
      r.totalFloat = r.state === 'DONE' ? null : c.float;
      r.critical = c.critical;
      r.linkStartsOn = r.state !== 'DONE' && !r.actualStart && r.plannedStart && c.es > r.plannedStart ? c.es : null;
    }
    const names = new Map(rows.map((r) => [r.id, r.name]));
    const ms = milestones.map((m) => this.toMilestoneDto(m, today));

    const plannedFinish = maxDate([...rows.map((r) => r.plannedEnd), ...ms.map((m) => m.dueDate)]);
    const baselineFinish = project.baselineAt ? maxDate([...rows.map((r) => r.baselineEnd), ...ms.map((m) => m.baselineDate)]) : null;
    return {
      projectId,
      projectStart: dateOnly(project.startDate),
      projectEnd: dateOnly(project.endDate),
      completionDate: revisedCompletion(dateOnly(project.endDate), project.risks.reduce((t, r) => t + (r.eotGrantedDays ?? 0), 0)),
      today,
      baselineAt: iso(project.baselineAt),
      baselineByName: project.baselineBy?.fullName ?? null,
      baselineNote: project.baselineNote,
      activities: rows,
      milestones: ms,
      summary: {
        activities: rows.length,
        scheduled: rows.filter((r) => r.plannedStart && r.plannedEnd).length,
        done: rows.filter((r) => r.state === 'DONE').length,
        behind: rows.filter((r) => r.state === 'BEHIND').length,
        late: rows.filter((r) => r.state === 'LATE').length,
        slipped: rows.filter((r) => (r.finishSlipDays ?? 0) > 0).length,
        notInBaseline: project.baselineAt ? rows.filter((r) => r.plannedEnd && !r.baselineEnd).length : 0,
        milestones: ms.length,
        milestonesAchieved: ms.filter((m) => m.state === 'ACHIEVED' || m.state === 'ACHIEVED_LATE').length,
        milestonesMissed: ms.filter((m) => m.state === 'MISSED').length,
        plannedFinish,
        baselineFinish,
        finishSlipDays: slipDays(plannedFinish, baselineFinish),
        links: links.length,
        critical: rows.filter((r) => r.critical).length,
        linkConflicts: rows.filter((r) => r.linkStartsOn).length,
        networkFinish: net?.finish ?? null,
      },
      links: links.map((l) => this.linkDto(l, names)),
    };
  }

  /** Copy today's plan to the baseline. Re-freezing replaces the earlier baseline; the audit log keeps who did it and when. */
  async freezeBaseline(user: RequestUser, projectId: string, dto: FreezeBaselineDto) {
    await this.access.assertCanFreezeBaseline(user, projectId);
    const dated = await this.prisma.activity.count({ where: { projectId, plannedStart: { not: null }, plannedEnd: { not: null } } });
    const milestones = await this.prisma.milestone.count({ where: { projectId } });
    if (!dated && !milestones) throw new BadRequestException('Give the activities planned dates, or add a milestone, before freezing a baseline');
    const previous = await this.prisma.project.findFirst({ where: { id: projectId }, select: { baselineAt: true } });
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.$executeRaw`UPDATE "Activity" SET "baselineStart" = "plannedStart", "baselineEnd" = "plannedEnd", "updatedAt" = ${now} WHERE "projectId" = ${projectId}`,
      this.prisma.$executeRaw`UPDATE "Milestone" SET "baselineDate" = "dueDate", "updatedAt" = ${now} WHERE "projectId" = ${projectId}`,
      this.prisma.project.update({ where: { id: projectId }, data: { baselineAt: now, baselineById: user.id, baselineNote: dto.note?.trim() || null } }),
    ]);
    await this.audit.log(user, 'PROJECT', projectId, previous?.baselineAt ? 'BASELINE_REPLACED' : 'BASELINE_FROZEN', dto.note?.trim() || undefined);
    return this.gantt(user, projectId);
  }

  async listMilestones(user: RequestUser, projectId: string): Promise<MilestoneDto[]> {
    await this.access.assertCanAccessProject(user, projectId);
    const today = todayIn();
    const rows = await this.prisma.milestone.findMany({ where: { projectId }, orderBy: [{ dueDate: 'asc' }, { sortOrder: 'asc' }] });
    return rows.map((m) => this.toMilestoneDto(m, today));
  }

  async createMilestone(user: RequestUser, projectId: string, dto: CreateMilestoneDto): Promise<MilestoneDto> {
    await this.access.assertCanAccessProject(user, projectId);
    const row = await this.prisma.milestone.create({
      data: {
        organizationId: user.organizationId,
        projectId,
        name: dto.name.trim(),
        dueDate: parseDate(dto.dueDate),
        achievedOn: dto.achievedOn ? parseDate(dto.achievedOn) : null,
        note: dto.note?.trim() || null,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    await this.audit.log(user, 'MILESTONE', row.id, 'CREATED', row.name);
    return this.toMilestoneDto(row, todayIn());
  }

  async updateMilestone(user: RequestUser, projectId: string, id: string, dto: UpdateMilestoneDto): Promise<MilestoneDto> {
    await this.access.assertCanAccessProject(user, projectId);
    const existing = await this.prisma.milestone.findFirst({ where: { id, projectId } });
    if (!existing) throw new NotFoundException('Milestone not found');
    const data: Prisma.MilestoneUncheckedUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.dueDate !== undefined) data.dueDate = parseDate(dto.dueDate);
    if (dto.achievedOn !== undefined) data.achievedOn = dto.achievedOn ? parseDate(dto.achievedOn) : null;
    if (dto.note !== undefined) data.note = dto.note?.trim() || null;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    const row = await this.prisma.milestone.update({ where: { id }, data });
    const achieved = !existing.achievedOn && row.achievedOn;
    await this.audit.log(user, 'MILESTONE', id, achieved ? 'ACHIEVED' : 'UPDATED', achieved ? dateOnly(row.achievedOn)! : undefined);
    return this.toMilestoneDto(row, todayIn());
  }

  async deleteMilestone(user: RequestUser, projectId: string, id: string) {
    await this.access.assertCanAccessProject(user, projectId);
    const row = await this.prisma.milestone.findFirst({ where: { id, projectId } });
    const { count } = await this.prisma.milestone.deleteMany({ where: { id, projectId } });
    if (!count || !row) throw new NotFoundException('Milestone not found');
    await this.audit.log(user, 'MILESTONE', id, 'DELETED');
    return { ok: true, undo: this.undo.offer(user, 'MILESTONE', { rows: [{ model: 'milestone', data: row }] }) };
  }

  // Links between activities, the look-ahead and schedule files (v6 item 114)

  private linkDto(l: { id: string; predecessorId: string; successorId: string; type: ActivityLinkDto['type']; lagDays: number }, names: Map<string, string>): ActivityLinkDto {
    return { id: l.id, predecessorId: l.predecessorId, predecessorName: names.get(l.predecessorId) ?? '', successorId: l.successorId, successorName: names.get(l.successorId) ?? '', type: l.type, lagDays: l.lagDays };
  }

  private async network(projectId: string) {
    const [activities, links] = await Promise.all([
      this.prisma.activity.findMany({ where: { projectId }, select: { id: true, name: true } }),
      this.prisma.activityLink.findMany({ where: { projectId } }),
    ]);
    const names = new Map(activities.map((a) => [a.id, a.name]));
    const net: NetLink[] = links.map((l) => ({ pred: l.predecessorId, succ: l.successorId, type: l.type, lag: l.lagDays }));
    return { ids: activities.map((a) => a.id), names, links, net };
  }

  async createLink(user: RequestUser, projectId: string, dto: CreateLinkDto): Promise<ActivityLinkDto> {
    await this.access.assertCanAccessProject(user, projectId);
    const { ids, names, net } = await this.network(projectId);
    const link: NetLink = { pred: dto.predecessorId, succ: dto.successorId, type: dto.type ?? 'FS', lag: dto.lagDays ?? 0 };
    const problem = linkProblem(ids, net, link, (id) => names.get(id) ?? id);
    if (problem) throw new BadRequestException(problem);
    const row = await this.prisma.activityLink.create({
      data: { organizationId: user.organizationId, projectId, predecessorId: link.pred, successorId: link.succ, type: link.type, lagDays: link.lag },
    });
    await this.audit.log(user, 'ACTIVITY', link.succ, 'LINK_ADDED', `${linkLabel(link.type, link.lag)} after ${names.get(link.pred)}`);
    return this.linkDto(row, names);
  }

  async updateLink(user: RequestUser, projectId: string, id: string, dto: UpdateLinkDto): Promise<ActivityLinkDto> {
    await this.access.assertCanAccessProject(user, projectId);
    const { names, links } = await this.network(projectId);
    const existing = links.find((l) => l.id === id);
    if (!existing) throw new NotFoundException('Link not found');
    const row = await this.prisma.activityLink.update({ where: { id }, data: { ...(dto.type ? { type: dto.type } : {}), ...(dto.lagDays !== undefined ? { lagDays: dto.lagDays } : {}) } });
    await this.audit.log(user, 'ACTIVITY', row.successorId, 'LINK_CHANGED', `${linkLabel(row.type, row.lagDays)} after ${names.get(row.predecessorId)}`);
    return this.linkDto(row, names);
  }

  async deleteLink(user: RequestUser, projectId: string, id: string) {
    await this.access.assertCanAccessProject(user, projectId);
    const row = await this.prisma.activityLink.findFirst({ where: { id, projectId }, include: { predecessor: { select: { name: true } } } });
    if (!row) throw new NotFoundException('Link not found');
    await this.prisma.activityLink.delete({ where: { id } });
    await this.audit.log(user, 'ACTIVITY', row.successorId, 'LINK_REMOVED', `${linkLabel(row.type, row.lagDays)} after ${row.predecessor.name}`);
    return { ok: true };
  }

  /** Move every activity planned earlier than its links allow to the first day they do, keeping its length. */
  async applyLinks(user: RequestUser, projectId: string): Promise<{ moved: { id: string; name: string; from: string; to: string }[] }> {
    await this.access.assertCanAccessProject(user, projectId);
    const g = await this.gantt(user, projectId);
    const toMove = moves(
      g.activities.map((a) => ({ id: a.id, start: a.plannedStart, end: a.plannedEnd, done: a.state === 'DONE', startedOn: a.actualStart })),
      new Map(g.activities.filter((a) => a.earlyStart && a.earlyFinish).map((a) => [a.id, { es: a.earlyStart!, ef: a.earlyFinish!, ls: a.lateStart!, lf: a.lateFinish!, float: a.totalFloat ?? 0, critical: a.critical }])),
    );
    if (!toMove.length) return { moved: [] };
    const now = new Date();
    await this.prisma.$transaction(toMove.map((m) => this.prisma.activity.update({ where: { id: m.id }, data: { plannedStart: parseDate(m.start), plannedEnd: parseDate(m.end), updatedAt: now } })));
    const byId = new Map(g.activities.map((a) => [a.id, a]));
    const moved = toMove.map((m) => ({ id: m.id, name: byId.get(m.id)!.name, from: byId.get(m.id)!.plannedStart!, to: m.start }));
    await this.audit.log(user, 'PROJECT', projectId, 'SCHEDULED_FROM_LINKS', moved.map((m) => `${m.name}: ${m.from} → ${m.to}`).join('; ').slice(0, 1000));
    return { moved };
  }

  /** The three weeks from this Monday: activities planned in each, whether they can start, and what is overdue. */
  async lookahead(user: RequestUser, projectId: string): Promise<LookaheadDto> {
    const g = await this.gantt(user, projectId);
    const byId = new Map(g.activities.map((a) => [a.id, a]));
    const item = (a: GanttActivityDto): LookaheadActivityDto => {
      const r = readiness(
        { progressPct: a.progressPct, earliest: a.linkStartsOn },
        a.predecessors.flatMap((p) => {
          const pred = byId.get(p.activityId);
          return pred ? [{ name: pred.name, type: p.type, progressPct: pred.progressPct }] : [];
        }),
        g.today,
      );
      return { id: a.id, name: a.name, responsibleName: a.responsibleName, plannedStart: a.plannedStart!, plannedEnd: a.plannedEnd!, progressPct: a.progressPct, state: a.state, critical: a.critical, totalFloat: a.totalFloat, linkStartsOn: a.linkStartsOn, ...r };
    };
    const open = g.activities.filter((a) => a.plannedStart && a.plannedEnd && a.state !== 'DONE');
    const order = (x: LookaheadActivityDto, y: LookaheadActivityDto) => x.plannedStart.localeCompare(y.plannedStart) || Number(y.critical) - Number(x.critical) || x.name.localeCompare(y.name);
    const weeks = lookaheadWeeks(g.today).map((w) => ({ ...w, activities: open.filter((a) => a.plannedStart! <= w.to && a.plannedEnd! >= w.from && a.plannedEnd! >= g.today).map(item).sort(order) }));
    return { projectId, today: g.today, weeks, overdue: open.filter((a) => a.plannedEnd! < g.today).map(item).sort(order) };
  }

  /** The activities with dates and their links, as an MS Project XML or P6 XER file. */
  async exportFile(user: RequestUser, projectId: string, format: ScheduleFileFormat): Promise<{ fileName: string; mimeType: string; content: string }> {
    await this.access.assertCanAccessProject(user, projectId);
    const project = await this.prisma.project.findFirst({ where: { id: projectId }, select: { code: true, name: true, startDate: true } });
    if (!project) throw new NotFoundException('Project not found');
    const [activities, links] = await Promise.all([
      this.prisma.activity.findMany({ where: { projectId, plannedStart: { not: null }, plannedEnd: { not: null } }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, name: true, plannedStart: true, plannedEnd: true } }),
      this.prisma.activityLink.findMany({ where: { projectId } }),
    ]);
    if (!activities.length) throw new BadRequestException('Give the activities planned dates before exporting the schedule');
    const rows = activities.map((a) => ({ key: a.id, name: a.name, start: dateOnly(a.plannedStart)!, end: dateOnly(a.plannedEnd)! }));
    const fl = links.map((l) => ({ predKey: l.predecessorId, succKey: l.successorId, type: l.type, lagDays: l.lagDays }));
    await this.audit.log(user, 'PROJECT', projectId, 'SCHEDULE_EXPORTED', format);
    return format === 'XER'
      ? { fileName: `${project.code}-schedule.xer`, mimeType: 'text/plain', content: toXer(project, rows, fl, todayIn()) }
      : { fileName: `${project.code}-schedule.xml`, mimeType: 'application/xml', content: toMsProjectXml({ ...project, start: dateOnly(project.startDate) }, rows, fl) };
  }

  /**
   * Read an MS Project XML or P6 XER file into the project: activities matched by name get the file's dates, the rest are
   * added (unit "job", quantity 1), and the file's links replace the links between them. `dryRun` only says what would change.
   */
  async importFile(user: RequestUser, projectId: string, dto: ImportScheduleDto): Promise<ScheduleImportResultDto> {
    await this.access.assertCanAccessProject(user, projectId);
    let file: ScheduleFile;
    try {
      file = dto.format === 'XER' ? parseXer(dto.content) : parseMsProjectXml(dto.content);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    if (!file.activities.length) throw new BadRequestException('The file has no activities with dates.');
    const existing = await this.prisma.activity.findMany({ where: { projectId }, select: { id: true, name: true, plannedStart: true, plannedEnd: true } });
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
    const byName = new Map(existing.map((a) => [norm(a.name), a]));
    const seen = new Set<string>();
    const plan = file.activities.flatMap((f) => {
      const key = norm(f.name);
      if (seen.has(key)) return [];
      seen.add(key);
      const match = byName.get(key);
      const action: 'CREATE' | 'UPDATE' | 'SAME' = !match ? 'CREATE' : dateOnly(match.plannedStart) === f.start && dateOnly(match.plannedEnd) === f.end ? 'SAME' : 'UPDATE';
      return [{ ...f, matchId: match?.id ?? null, action }];
    });
    const dupes = file.activities.length - plan.length;
    const skipped = [...file.skipped, ...(dupes ? [`${dupes} row${dupes === 1 ? '' : 's'} with a name already read`] : [])];
    // The file's links, by name, must not loop with the links that stay.
    const keyToName = new Map(file.activities.map((f) => [f.key, norm(f.name)]));
    const fileLinks = file.links.map((l) => ({ pred: keyToName.get(l.predKey)!, succ: keyToName.get(l.succKey)!, type: l.type, lag: Math.max(-365, Math.min(365, l.lagDays)) })).filter((l) => l.pred !== l.succ);
    const result: ScheduleImportResultDto = {
      format: dto.format,
      dryRun: !!dto.dryRun,
      activities: plan.map((p) => ({ name: p.name, start: p.start, end: p.end, action: p.action })),
      created: plan.filter((p) => p.action === 'CREATE').length,
      updated: plan.filter((p) => p.action === 'UPDATE').length,
      links: fileLinks.length,
      skipped,
    };
    if (findCycle([...new Set(plan.map((p) => norm(p.name)))], fileLinks)) throw new BadRequestException('The links in the file go round in a loop. Fix them in the planning tool and export again.');
    if (dto.dryRun) return result;

    const org = user.organizationId;
    await this.prisma.$transaction(async (tx) => {
      const ids = new Map<string, string>();
      const last = await tx.activity.aggregate({ where: { projectId }, _max: { sortOrder: true } });
      let sort = (last._max.sortOrder ?? 0) + 1;
      for (const p of plan) {
        if (p.matchId) {
          ids.set(norm(p.name), p.matchId);
          if (p.action === 'UPDATE') await tx.activity.update({ where: { id: p.matchId }, data: { plannedStart: parseDate(p.start), plannedEnd: parseDate(p.end) } });
        } else {
          const a = await tx.activity.create({ data: { organizationId: org, projectId, name: p.name, unit: 'job', plannedQty: D(1), plannedStart: parseDate(p.start), plannedEnd: parseDate(p.end), sortOrder: sort++ } });
          ids.set(norm(p.name), a.id);
        }
      }
      const touched = [...ids.values()];
      await tx.activityLink.deleteMany({ where: { projectId, predecessorId: { in: touched }, successorId: { in: touched } } });
      const kept = await tx.activityLink.findMany({ where: { projectId } });
      const all = [...kept.map((l) => ({ pred: l.predecessorId, succ: l.successorId, type: l.type, lag: l.lagDays })), ...fileLinks.map((l) => ({ ...l, pred: ids.get(l.pred)!, succ: ids.get(l.succ)! }))];
      const everyId = (await tx.activity.findMany({ where: { projectId }, select: { id: true } })).map((a) => a.id);
      if (findCycle(everyId, all)) throw new ConflictException('With the links already on the project, the file’s links would go round in a loop.');
      const pairs = new Set<string>();
      await tx.activityLink.createMany({
        data: fileLinks.flatMap((l) => {
          const pair = `${ids.get(l.pred)}>${ids.get(l.succ)}`;
          if (pairs.has(pair)) return [];
          pairs.add(pair);
          return [{ organizationId: org, projectId, predecessorId: ids.get(l.pred)!, successorId: ids.get(l.succ)!, type: l.type, lagDays: l.lag }];
        }),
      });
    });
    await this.audit.log(user, 'PROJECT', projectId, 'SCHEDULE_IMPORTED', `${dto.format}: ${result.created} added, ${result.updated} moved, ${result.links} links`);
    return result;
  }
}
