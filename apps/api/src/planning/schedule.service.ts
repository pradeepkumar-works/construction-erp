import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { GanttActivityDto, GanttDto, MilestoneDto } from '@erp/shared';
import { expectedPct, milestoneState, scheduleState, slipDays } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { UndoService } from '../common/undo.service';
import { dateOnly, iso, parseDate, pct } from '../common/serialize';
import { todayIn } from '../notifications/time';
import { CreateMilestoneDto, FreezeBaselineDto, UpdateMilestoneDto } from './schedule.dto';

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
    const dueDate = dateOnly(m.dueDate)!;
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
      this.prisma.project.findFirst({ where: { id: projectId }, select: { startDate: true, endDate: true, baselineAt: true, baselineNote: true, baselineBy: { select: { fullName: true } } } }),
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
      };
    });
    const ms = milestones.map((m) => this.toMilestoneDto(m, today));

    const plannedFinish = maxDate([...rows.map((r) => r.plannedEnd), ...ms.map((m) => m.dueDate)]);
    const baselineFinish = project.baselineAt ? maxDate([...rows.map((r) => r.baselineEnd), ...ms.map((m) => m.baselineDate)]) : null;
    return {
      projectId,
      projectStart: dateOnly(project.startDate),
      projectEnd: dateOnly(project.endDate),
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
      },
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
}
