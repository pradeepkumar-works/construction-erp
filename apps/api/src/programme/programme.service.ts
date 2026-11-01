import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  PROGRAMME_OBLIGATION_CODE,
  PROGRAMME_UPDATE_DAYS,
  addMonthsDays,
  canApprove,
  canKeepProgramme,
  canViewProgramme,
  isClientGuest,
  obligationDue,
  programmeDecisionProblem,
  programmeInForce,
  programmeLabel,
  programmeMetOn,
  programmeObligationMetOn,
  programmeSubmitProblem,
  programmeWatch,
  type ProgrammeRegisterDto,
  type ProgrammeSubmissionDto,
  type ProgrammeWatch,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { dateOnly, parseDate } from '../common/serialize';
import { todayIn } from '../notifications/time';
import { ANCHOR_SELECT, anchorsOf, termsOf } from '../contracts/obligation-recovery';

const include = {
  submittedBy: { select: { fullName: true } },
  decidedBy: { select: { fullName: true } },
} satisfies Prisma.ProgrammeSubmissionInclude;
type Row = Prisma.ProgrammeSubmissionGetPayload<{ include: typeof include }>;

const PROJECT_SELECT = { ...ANCHOR_SELECT, name: true, type: true, status: true, programmeUpdateDays: true } satisfies Prisma.ProjectSelect;
type ProjectRow = Prisma.ProjectGetPayload<{ select: typeof PROJECT_SELECT }>;
/** A project's watch for the watch list, with what the contract holds back while the first programme is late. */
export type ProgrammeWatchRow = ProgrammeWatch & { intervalDays: number; lastLabel: string | null; withholdPct: string | null };
/** The day the Contract tab marks the programme as met, counted as a programme sent (`programmeWatch`). */
const metBefore = (o: { metOn: Date | null; waived: boolean } | null) => (o && !o.waived ? dateOnly(o.metOn) : null);

/** Days of the standard obligation when a contract keeps no obligation of its own (GCC 13: within 15 days of the agreement). */
const FIRST_PROGRAMME_DAYS = 15;

const rulesRow = (r: { revision: number; status: Row['status']; submittedOn: Date }) => ({ revision: r.revision, status: r.status, submittedOn: dateOnly(r.submittedOn) });

/**
 * The programme register (ARCHITECTURE "Programme and EOT"): each revision of the construction programme as it
 * went to the Engineer, what it showed, and their answer; the watch on the next one due; and the contract's programme
 * obligation, met by the first revision not returned. Rules are pure in `@erp/shared/programme-eot.ts`.
 */
@Injectable()
export class ProgrammeService {
  constructor(private prisma: PrismaService, private access: ProjectAccessService, private audit: AuditService, private notifications: NotificationsService) {}

  private toDto(r: Row, inForceId: string | null): ProgrammeSubmissionDto {
    return {
      id: r.id,
      projectId: r.projectId,
      revision: r.revision,
      label: programmeLabel(r.revision),
      submittedOn: dateOnly(r.submittedOn),
      submittedByName: r.submittedBy.fullName,
      letterRef: r.letterRef,
      note: r.note,
      activityCount: r.activityCount,
      plannedFinish: dateOnly(r.plannedFinish),
      status: r.status,
      decidedOn: dateOnly(r.decidedOn),
      decidedByName: r.decidedByName ?? r.decidedBy?.fullName ?? null,
      decisionNote: r.decisionNote,
      inForce: r.id === inForceId,
    };
  }

  private async assertView(user: RequestUser, projectId: string) {
    if (isClientGuest(user.roleKey)) return this.access.assertCanActAsClient(user, projectId);
    if (!canViewProgramme(user.roleKey)) throw new ForbiddenException('Your role cannot see the programme register');
    await this.access.assertCanAccessProject(user, projectId);
  }

  private async assertKeep(user: RequestUser, projectId: string) {
    if (!canKeepProgramme(user.roleKey)) throw new ForbiddenException('Your role cannot send programme revisions');
    await this.access.assertCanAccessProject(user, projectId);
  }

  /** The first programme's day: the contract's programme obligation, else 15 days from the agreement (or the start). */
  private firstDue(project: ProjectRow, obligation: Prisma.ContractObligationGetPayload<object> | null): string | null {
    if (obligation?.waived) return null;
    if (obligation) return obligationDue(termsOf(obligation), anchorsOf(project));
    const from = dateOnly(project.agreementDate) ?? dateOnly(project.startDate);
    return from ? addMonthsDays(from, 0, FIRST_PROGRAMME_DAYS) : null;
  }

  /** Nothing is due from a store or a plant (no works contract), or once the works are complete or handed over. */
  private active(project: ProjectRow) {
    if (project.type === 'STORE' || project.type === 'PLANT') return false;
    return (project.status === 'ACTIVE' || project.status === 'PLANNED' || project.status === 'ON_HOLD') && !project.handover?.completedOn;
  }

  async register(user: RequestUser, projectId: string): Promise<ProgrammeRegisterDto> {
    await this.assertView(user, projectId);
    const [project, rows, obligation, plan] = await Promise.all([
      this.prisma.project.findFirst({ where: { id: projectId, organizationId: user.organizationId }, select: PROJECT_SELECT }),
      this.prisma.programmeSubmission.findMany({ where: { projectId }, include, orderBy: { revision: 'desc' } }),
      this.prisma.contractObligation.findFirst({ where: { projectId, code: PROGRAMME_OBLIGATION_CODE } }),
      this.prisma.activity.aggregate({ where: { projectId }, _count: { _all: true }, _max: { plannedEnd: true } }),
    ]);
    if (!project) throw new NotFoundException('Project not found');
    const rules = rows.map(rulesRow);
    const intervalDays = project.programmeUpdateDays ?? PROGRAMME_UPDATE_DAYS;
    const firstDue = this.firstDue(project, obligation);
    const inForce = programmeInForce(rows.map((r) => ({ ...rulesRow(r), id: r.id })));
    const guest = isClientGuest(user.roleKey);
    return {
      projectId,
      intervalDays,
      intervalSet: project.programmeUpdateDays !== null,
      firstDue,
      watch: programmeWatch(rules, firstDue, intervalDays, todayIn(), this.active(project), metBefore(obligation)),
      metOn: obligation ? dateOnly(obligation.metOn) : programmeMetOn(rules),
      // What a late programme costs is the contractor's own business.
      obligation: obligation && !guest ? { id: obligation.id, title: obligation.title, clause: obligation.clause, penaltyValue: obligation.penalty === 'WITHHOLD_PCT' ? (obligation.penaltyValue?.toString() ?? null) : null, waived: obligation.waived } : null,
      activityCount: plan._count._all,
      plannedFinish: dateOnly(plan._max.plannedEnd),
      submissions: rows.map((r) => this.toDto(r, inForce?.id ?? null)),
    };
  }

  /** The watch for each project (the watch list's PROGRAMME_DUE), read with the same rules as the register. */
  async watchFor(projectIds: string[], today: string): Promise<Map<string, ProgrammeWatchRow>> {
    if (!projectIds.length) return new Map();
    const [projects, rows, obligations] = await Promise.all([
      this.prisma.project.findMany({ where: { id: { in: projectIds } }, select: { ...PROJECT_SELECT, id: true } }),
      this.prisma.programmeSubmission.findMany({ where: { projectId: { in: projectIds } }, select: { projectId: true, revision: true, status: true, submittedOn: true } }),
      this.prisma.contractObligation.findMany({ where: { projectId: { in: projectIds }, code: PROGRAMME_OBLIGATION_CODE } }),
    ]);
    const out = new Map<string, ProgrammeWatchRow>();
    for (const p of projects) {
      const own = rows.filter((r) => r.projectId === p.id).map(rulesRow);
      const intervalDays = p.programmeUpdateDays ?? PROGRAMME_UPDATE_DAYS;
      const last = own.filter((r) => r.status !== 'RETURNED').sort((a, b) => b.revision - a.revision)[0];
      const obligation = obligations.find((o) => o.projectId === p.id) ?? null;
      out.set(p.id, {
        ...programmeWatch(own, this.firstDue(p, obligation), intervalDays, today, this.active(p), metBefore(obligation)),
        intervalDays,
        lastLabel: last ? programmeLabel(last.revision) : null,
        withholdPct: obligation && !obligation.waived && obligation.penalty === 'WITHHOLD_PCT' && obligation.penaltyValue ? obligation.penaltyValue.toString() : null,
      });
    }
    return out;
  }

  /**
   * The contract's programme obligation follows the register: met on the day the first revision went that the Engineer
   * did not return, and open again if that one is returned or deleted. A waived obligation is left alone.
   */
  private async syncObligation(tx: Prisma.TransactionClient, projectId: string) {
    const obligation = await tx.contractObligation.findFirst({ where: { projectId, code: PROGRAMME_OBLIGATION_CODE }, select: { id: true, metOn: true, waived: true } });
    if (!obligation || obligation.waived) return;
    const rows = await tx.programmeSubmission.findMany({ where: { projectId }, select: { revision: true, status: true, submittedOn: true } });
    const metOn = programmeObligationMetOn(rows.map(rulesRow), dateOnly(obligation.metOn));
    if (metOn !== dateOnly(obligation.metOn)) await tx.contractObligation.update({ where: { id: obligation.id }, data: { metOn: metOn ? parseDate(metOn) : null } });
  }

  /** Send the next revision: the plan as it stands is kept with it, and the project's client guests are asked to answer. */
  async submit(user: RequestUser, projectId: string, dto: { submittedOn?: string; letterRef?: string | null; note?: string | null }): Promise<ProgrammeSubmissionDto> {
    await this.assertKeep(user, projectId);
    const today = todayIn();
    const submittedOn = dto.submittedOn ?? today;
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`PROGRAMME:${projectId}`}))`;
      const [rows, plan] = await Promise.all([
        tx.programmeSubmission.findMany({ where: { projectId }, select: { revision: true, status: true, submittedOn: true } }),
        tx.activity.aggregate({ where: { projectId }, _count: { _all: true }, _max: { plannedEnd: true } }),
      ]);
      const problem = programmeSubmitProblem(rows.map(rulesRow), submittedOn, today);
      if (problem) throw new BadRequestException(problem);
      if (!plan._count._all) throw new BadRequestException('The project has no activities yet: plan the work before sending a programme');
      const created = await tx.programmeSubmission.create({
        data: {
          organizationId: user.organizationId,
          projectId,
          revision: rows.length ? Math.max(...rows.map((r) => r.revision)) + 1 : 0,
          submittedOn: parseDate(submittedOn),
          submittedById: user.id,
          letterRef: dto.letterRef?.trim() || null,
          note: dto.note?.trim() || null,
          activityCount: plan._count._all,
          plannedFinish: plan._max.plannedEnd,
        },
        include: { ...include, project: { select: { name: true } } },
      });
      await this.syncObligation(tx, projectId);
      return created;
    });
    await this.audit.log(user, 'PROGRAMME', row.id, 'SUBMITTED', `${programmeLabel(row.revision)} sent on ${submittedOn}`);
    const guests = await this.access.projectGuests(user.organizationId, projectId);
    if (guests.length)
      await this.notifications.notify({
        organizationId: user.organizationId,
        userIds: guests.map((g) => g.id),
        type: 'PORTAL',
        title: `${programmeLabel(row.revision)} of the programme for ${row.project.name}`,
        body: `${row.activityCount} activities, finishing ${dateOnly(row.plannedFinish) ?? 'with no planned finish'}. Approve it or return it with comments in the portal.`,
        projectId,
        entityType: 'PROGRAMME',
        entityId: row.id,
      });
    return this.toDto(row, null);
  }

  /**
   * The Engineer's answer: approved, or returned with comments for a new revision. In the portal it is the guest's own;
   * staff recording a letter name who answered.
   */
  async decide(user: RequestUser, id: string, dto: { decision: 'APPROVED' | 'RETURNED'; decidedOn?: string; note?: string | null; decidedByName?: string | null }): Promise<ProgrammeSubmissionDto> {
    const current = await this.prisma.programmeSubmission.findFirst({ where: { id, organizationId: user.organizationId }, include: { ...include, project: { select: { name: true } } } });
    if (!current) throw new NotFoundException('Programme revision not found');
    const guest = isClientGuest(user.roleKey);
    if (guest) await this.access.assertCanActAsClient(user, current.projectId);
    else {
      await this.assertKeep(user, current.projectId);
      if (!dto.decidedByName?.trim()) throw new BadRequestException("Name the Engineer who answered, as on their letter");
    }
    const today = todayIn();
    const decidedOn = dto.decidedOn ?? today;
    const problem = programmeDecisionProblem(rulesRow(current), dto.decision, decidedOn, dto.note, today);
    if (problem) throw (current.status !== 'SUBMITTED' ? new ConflictException(problem) : new BadRequestException(problem));
    const note = dto.note?.trim() || null;
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.programmeSubmission.update({
        where: { id },
        data: { status: dto.decision, decidedOn: parseDate(decidedOn), decidedById: user.id, decidedByName: guest ? null : dto.decidedByName!.trim(), decisionNote: note },
        include,
      });
      await this.syncObligation(tx, current.projectId);
      return row;
    });
    const label = programmeLabel(current.revision);
    await this.audit.log(user, 'PROGRAMME', id, dto.decision, note ?? (guest ? 'In the portal' : `Recorded from ${dto.decidedByName!.trim()}`));
    if (guest)
      await this.notifications.handoff({
        organizationId: user.organizationId,
        projectId: current.projectId,
        roles: ['PROJECT_MANAGER', 'TEAM_LEADER'],
        alsoUserIds: [current.submittedById],
        exceptUserIds: [user.id],
        title: dto.decision === 'APPROVED' ? `${label} of the programme approved by ${user.fullName}` : `${label} of the programme returned by ${user.fullName}: send a new revision`,
        body: `${current.project.name}${note ? `: ${note.length > 200 ? `${note.slice(0, 199)}…` : note}` : '.'}`,
        entityType: 'PROGRAMME',
        entityId: id,
        email: dto.decision === 'RETURNED' ? { href: `/projects/${current.projectId}?tab=programme&revision=${id}`, cta: 'Answer the comments' } : undefined,
      });
    const rows = await this.prisma.programmeSubmission.findMany({ where: { projectId: current.projectId }, select: { id: true, revision: true, status: true, submittedOn: true } });
    return this.toDto(updated, programmeInForce(rows.map((r) => ({ ...rulesRow(r), id: r.id })))?.id ?? null);
  }

  /** A revision sent by mistake: the latest, while it is still with the Engineer, by whoever sent it or an approver. */
  async remove(user: RequestUser, id: string) {
    const current = await this.prisma.programmeSubmission.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!current) throw new NotFoundException('Programme revision not found');
    await this.assertKeep(user, current.projectId);
    if (current.submittedById !== user.id && !canApprove(user.roleKey)) throw new ForbiddenException('Whoever sent the revision, or an approver, deletes it');
    if (current.status !== 'SUBMITTED') throw new ConflictException('An answered revision stays in the register');
    const later = await this.prisma.programmeSubmission.count({ where: { projectId: current.projectId, revision: { gt: current.revision } } });
    if (later) throw new ConflictException('Only the latest revision can be deleted');
    await this.prisma.$transaction(async (tx) => {
      await tx.programmeSubmission.delete({ where: { id } });
      await this.syncObligation(tx, current.projectId);
    });
    await this.audit.log(user, 'PROGRAMME', id, 'DELETED', programmeLabel(current.revision));
    return { ok: true };
  }

  /** How often the contract wants an updated programme; null goes back to the standard monthly update. */
  async setInterval(user: RequestUser, projectId: string, days: number | null) {
    await this.assertKeep(user, projectId);
    await this.prisma.project.update({ where: { id: projectId }, data: { programmeUpdateDays: days } });
    await this.audit.log(user, 'PROJECT', projectId, 'UPDATED', `Programme updates every ${days ?? `${PROGRAMME_UPDATE_DAYS} (standard)`} days`);
    return this.register(user, projectId);
  }
}
