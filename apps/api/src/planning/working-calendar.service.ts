import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { WorkingCalendar, WorkingCalendarDto } from '@erp/shared';
import { DEFAULT_WEEKLY_OFF, breakProblem, canEditProjects, daysOffProblem, isWeekday, weeklyOffOf, workWeekWords, workingDaysIn } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { dateOnly, parseDate } from '../common/serialize';
import { todayIn } from '../notifications/time';
import { CreateScheduleBreakDto, UpdateWorkingCalendarDto } from './schedule.dto';

/**
 * A project's working calendar (ARCHITECTURE "Working calendar"): whether the schedule counts working days, its weekly days
 * off and its breaks; holidays are the company's and the site's own (Staff › Holidays). The critical path and the
 * look-ahead read it through `calendarOf`, and only this service changes it.
 */
@Injectable()
export class WorkingCalendarService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
  ) {}

  /** The calendar the schedule counts on; every day when the project's is off. */
  async calendarOf(projectId: string): Promise<WorkingCalendar> {
    const p = await this.prisma.project.findFirst({ where: { id: projectId }, select: { organizationId: true, workingCalendar: true, scheduleDaysOff: true } });
    if (!p?.workingCalendar) return { on: false, daysOff: [], holidays: [], breaks: [] };
    const [holidays, breaks] = await Promise.all([
      this.prisma.holiday.findMany({ where: { organizationId: p.organizationId, OR: [{ projectId: null }, { projectId }] }, select: { date: true, name: true } }),
      this.prisma.scheduleBreak.findMany({ where: { organizationId: p.organizationId, projectId }, select: { fromDate: true, toDate: true, reason: true } }),
    ]);
    return {
      on: true,
      daysOff: p.scheduleDaysOff.filter(isWeekday),
      holidays: holidays.map((h) => ({ date: dateOnly(h.date), name: h.name })),
      breaks: breaks.map((b) => ({ from: dateOnly(b.fromDate), to: dateOnly(b.toDate), reason: b.reason })),
    };
  }

  async get(user: RequestUser, projectId: string): Promise<WorkingCalendarDto> {
    await this.access.assertCanAccessProject(user, projectId);
    const [p, settings] = await Promise.all([
      this.prisma.project.findFirst({ where: { id: projectId, organizationId: user.organizationId }, select: { workingCalendar: true, scheduleDaysOff: true, weeklyOff: true } }),
      this.prisma.payrollSettings.findUnique({ where: { organizationId: user.organizationId }, select: { weeklyOff: true } }),
    ]);
    if (!p) throw new NotFoundException('Project not found');
    const yearAgo = `${Number(todayIn().slice(0, 4)) - 1}${todayIn().slice(4)}`;
    const [holidays, breaks] = await Promise.all([
      this.prisma.holiday.findMany({ where: { organizationId: user.organizationId, OR: [{ projectId: null }, { projectId }], date: { gte: parseDate(yearAgo) } }, orderBy: { date: 'asc' } }),
      this.prisma.scheduleBreak.findMany({ where: { organizationId: user.organizationId, projectId }, orderBy: { fromDate: 'asc' } }),
    ]);
    const daysOff = p.scheduleDaysOff.filter(isWeekday);
    const cal: WorkingCalendar = { on: true, daysOff, holidays: holidays.map((h) => ({ date: dateOnly(h.date), name: h.name })), breaks: [] };
    return {
      projectId,
      on: p.workingCalendar,
      daysOff,
      staffWeeklyOff: weeklyOffOf(p, isWeekday(settings?.weeklyOff) ? settings.weeklyOff : DEFAULT_WEEKLY_OFF),
      holidays: holidays.map((h) => ({ date: dateOnly(h.date), name: h.name, siteOnly: !!h.projectId })),
      breaks: breaks.map((b) => {
        const from = dateOnly(b.fromDate);
        const to = dateOnly(b.toDate);
        return { id: b.id, from, to, reason: b.reason, days: workingDaysIn(cal, from, to) };
      }),
      workWeek: workWeekWords(daysOff),
      canEdit: canEditProjects(user.roleKey),
    };
  }

  async update(user: RequestUser, projectId: string, dto: UpdateWorkingCalendarDto): Promise<WorkingCalendarDto> {
    await this.access.assertCanAccessProject(user, projectId);
    const p = await this.prisma.project.findFirst({ where: { id: projectId, organizationId: user.organizationId }, select: { workingCalendar: true, scheduleDaysOff: true } });
    if (!p) throw new NotFoundException('Project not found');
    const daysOff = dto.daysOff ?? p.scheduleDaysOff;
    const problem = daysOffProblem(daysOff);
    if (problem) throw new BadRequestException(problem);
    const on = dto.on ?? p.workingCalendar;
    await this.prisma.project.update({ where: { id: projectId }, data: { workingCalendar: on, scheduleDaysOff: [...daysOff].sort() } });
    await this.audit.log(user, 'PROJECT', projectId, 'WORKING_CALENDAR_SET', on ? `Working days: ${workWeekWords(daysOff)}` : 'Every day counts');
    return this.get(user, projectId);
  }

  async addBreak(user: RequestUser, projectId: string, dto: CreateScheduleBreakDto): Promise<WorkingCalendarDto> {
    await this.access.assertCanAccessProject(user, projectId);
    const others = await this.prisma.scheduleBreak.findMany({ where: { organizationId: user.organizationId, projectId }, select: { fromDate: true, toDate: true, reason: true } });
    const b = { from: dto.from, to: dto.to, reason: dto.reason.trim() };
    const problem = breakProblem(b, others.map((o) => ({ from: dateOnly(o.fromDate), to: dateOnly(o.toDate), reason: o.reason })));
    if (problem) throw new BadRequestException(problem);
    await this.prisma.scheduleBreak.create({ data: { organizationId: user.organizationId, projectId, fromDate: parseDate(b.from), toDate: parseDate(b.to), reason: b.reason, createdById: user.id } });
    await this.audit.log(user, 'PROJECT', projectId, 'SCHEDULE_BREAK_ADDED', `${b.reason}: ${b.from} to ${b.to}`);
    return this.get(user, projectId);
  }

  async removeBreak(user: RequestUser, projectId: string, id: string): Promise<WorkingCalendarDto> {
    await this.access.assertCanAccessProject(user, projectId);
    const row = await this.prisma.scheduleBreak.findFirst({ where: { id, projectId, organizationId: user.organizationId } });
    if (!row) throw new NotFoundException('Break not found');
    await this.prisma.scheduleBreak.delete({ where: { id } });
    await this.audit.log(user, 'PROJECT', projectId, 'SCHEDULE_BREAK_REMOVED', `${row.reason}: ${dateOnly(row.fromDate)} to ${dateOnly(row.toDate)}`);
    return this.get(user, projectId);
  }
}
