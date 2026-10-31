import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  BUILDABLE_STATUSES,
  DRAWING_SOON_DAYS,
  drawingDaysLate,
  drawingDueSoon,
  drawingNeedProblem,
  drawingNeedState,
  drawingNoKey,
  drawingOverdue,
  isClientSide,
  isGuest,
  masterCode,
  nextDrawingNo,
  reminderLetter,
  remindsByLetter,
  revisionDays,
  scheduleCounts,
  type AsBuiltDueDto,
  type DocumentDiscipline,
  type DrawingNeedDto,
  type DrawingScheduleDto,
  type DrawingSource,
  type RevisionStatus,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { CorrespondenceService } from '../correspondence/correspondence.service';
import { RisksService } from '../risks/risks.service';
import { todayIn } from '../notifications/time';
import { dateOnly, parseDate } from '../common/serialize';
import { titleDate } from '../common/submission-titles';
import { isUniqueViolation } from '../common/idempotency';
import { ilike, pageArgs, searchWords } from '../common/paging';
import { AddDrawingNeedsDto, AsBuiltQuery, DrawingNeedLineDto, DrawingScheduleQuery, NextDrawingNoQuery, SaveDrawingNeedDto } from './drawing-schedule.dto';

const needInclude = {
  project: { select: { name: true } },
  activity: { select: { name: true } },
  risk: { select: { riskNo: true } },
  lastLetter: { select: { letterNo: true } },
  document: { select: { id: true, currentRevision: { select: { revision: true, status: true } }, revisions: { select: { issuedOn: true, status: true } } } },
} satisfies Prisma.DrawingNeedInclude;
type NeedRow = Prisma.DrawingNeedGetPayload<{ include: typeof needInclude }>;

const plusDays = (day: string, n: number) => {
  const d = parseDate(day);
  d.setUTCDate(d.getUTCDate() + n);
  return dateOnly(d);
};

/**
 * The drawing schedule (item 138 part 1, ARCHITECTURE "Design and drawings"): the drawings each project needs, matched to
 * the register by number as they arrive. A late one is chased by a draft letter through `CorrespondenceService.create`
 * (to be approved and numbered like any other) and recorded as a delay through `RisksService.create`, so the notice clock
 * and the extension of time claim run from the register.
 */
@Injectable()
export class DrawingScheduleService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private letters: CorrespondenceService,
    private risks: RisksService,
  ) {}

  private assertView(user: RequestUser) {
    if (isGuest(user.roleKey)) throw new ForbiddenException('The drawing schedule is for the company’s own staff');
  }

  private toDto(r: NeedRow, today: string): DrawingNeedDto {
    const days = revisionDays((r.document?.revisions ?? []).map((v) => ({ issuedOn: dateOnly(v.issuedOn), status: v.status as RevisionStatus })));
    const facts = { neededBy: dateOnly(r.neededBy), dropped: r.dropped, ...days };
    return {
      id: r.id,
      projectId: r.projectId,
      projectName: r.project.name,
      docNo: r.docNo,
      title: r.title,
      discipline: r.discipline as DocumentDiscipline,
      source: r.source as DrawingSource,
      fromParty: r.fromParty,
      neededBy: facts.neededBy,
      activityId: r.activityId,
      activityName: r.activity?.name ?? null,
      remarks: r.remarks,
      dropped: r.dropped,
      documentId: r.documentId,
      revision: r.document?.currentRevision?.revision ?? null,
      revisionStatus: (r.document?.currentRevision?.status ?? null) as RevisionStatus | null,
      receivedOn: days.receivedOn,
      gfcOn: days.gfcOn,
      state: drawingNeedState(facts),
      daysLate: drawingDaysLate(facts, today),
      overdue: drawingOverdue(facts, today),
      dueSoon: drawingDueSoon(facts, today),
      riskId: r.riskId,
      riskNo: r.risk?.riskNo ?? null,
      lastLetterId: r.lastLetterId,
      lastLetterNo: r.lastLetter?.letterNo ?? null,
      lastReminderOn: dateOnly(r.lastReminderOn),
      reminders: r.reminders,
    };
  }

  /** Links schedule lines to the register's documents of the same number (in any spelling), as drawings arrive. */
  private async linkArrived(organizationId: string, projectIds: string[] | null) {
    const open = await this.prisma.drawingNeed.findMany({
      where: { organizationId, documentId: null, docNo: { not: null }, ...(projectIds ? { projectId: { in: projectIds } } : {}) },
      select: { id: true, projectId: true, docNo: true },
    });
    if (!open.length) return;
    const docs = await this.prisma.document.findMany({ where: { organizationId, projectId: { in: [...new Set(open.map((o) => o.projectId))] } }, select: { id: true, projectId: true, docNo: true } });
    const byKey = new Map(docs.map((d) => [`${d.projectId}:${drawingNoKey(d.docNo)}`, d.id]));
    for (const o of open) {
      const documentId = byKey.get(`${o.projectId}:${drawingNoKey(o.docNo!)}`);
      if (documentId) await this.prisma.drawingNeed.update({ where: { id: o.id }, data: { documentId } });
    }
  }

  private async rows(user: RequestUser, where: Prisma.DrawingNeedWhereInput) {
    return this.prisma.drawingNeed.findMany({ where: { ...this.access.submissionWhere(user), ...where }, include: needInclude, orderBy: [{ neededBy: 'asc' }, { createdAt: 'asc' }] });
  }

  async list(user: RequestUser, q: DrawingScheduleQuery): Promise<DrawingScheduleDto> {
    this.assertView(user);
    if (q.projectId) await this.access.assertCanAccessProject(user, q.projectId);
    await this.linkArrived(user.organizationId, q.projectId ? [q.projectId] : null);
    const words = searchWords(q.q);
    const rows = await this.rows(user, {
      ...(q.projectId ? { projectId: q.projectId } : {}),
      ...(q.discipline ? { discipline: q.discipline } : {}),
      ...(q.source ? { source: q.source } : q.clientSide ? { source: { in: ['CLIENT', 'CONSULTANT', 'ARCHITECT'] } } : {}),
      AND: words.map((w) => ({ OR: [{ docNo: ilike(w) }, { title: ilike(w) }, { fromParty: ilike(w) }, { remarks: ilike(w) }] })),
    });
    const today = todayIn();
    const all = rows.map((r) => this.toDto(r, today));
    const counts = scheduleCounts(all, today);
    const shown = all
      .filter((n) =>
        q.state === 'LATE' ? n.overdue : q.state === 'SOON' ? n.dueSoon : q.state ? n.state === q.state : !n.dropped,
      )
      // What holds up work first (most days late), then by the day it is needed.
      .sort((a, b) => Number(b.overdue) - Number(a.overdue) || (b.overdue ? (b.daysLate ?? 0) - (a.daysLate ?? 0) : 0) || a.neededBy.localeCompare(b.neededBy));
    const args = pageArgs(q);
    return { items: shown.slice(args.skip, args.skip + args.take), total: shown.length, counts };
  }

  /** Overdue drawings for the watch list, through the same rules as the page. */
  async overdue(user: RequestUser): Promise<DrawingNeedDto[]> {
    await this.linkArrived(user.organizationId, null);
    const today = todayIn();
    const rows = await this.rows(user, { dropped: false, neededBy: { lt: parseDate(today) } });
    return rows.map((r) => this.toDto(r, today)).filter((n) => n.overdue);
  }

  private async row(user: RequestUser, id: string) {
    const row = await this.prisma.drawingNeed.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include: needInclude });
    if (!row) throw new NotFoundException('Drawing not found in the schedule');
    return row;
  }

  async get(user: RequestUser, id: string): Promise<DrawingNeedDto> {
    this.assertView(user);
    return this.toDto(await this.row(user, id), todayIn());
  }

  private async checkLine(organizationId: string, projectId: string, l: DrawingNeedLineDto & { documentId?: string | null }) {
    const problem = drawingNeedProblem({ title: l.title, neededBy: l.neededBy, source: l.source ?? 'CLIENT', fromParty: l.fromParty });
    if (problem) throw new BadRequestException(problem);
    if (l.activityId && !(await this.prisma.activity.count({ where: { id: l.activityId, projectId, organizationId } }))) throw new BadRequestException('Choose an activity of this project');
    if (l.documentId && !(await this.prisma.document.count({ where: { id: l.documentId, projectId, organizationId } }))) throw new BadRequestException('Choose a document of this project’s register');
  }

  private lineData(l: DrawingNeedLineDto) {
    return {
      docNo: l.docNo || null,
      title: l.title,
      discipline: l.discipline ?? 'GENERAL',
      source: l.source ?? 'CLIENT',
      fromParty: l.fromParty || null,
      neededBy: parseDate(l.neededBy),
      activityId: l.activityId || null,
      remarks: l.remarks || null,
    };
  }

  async create(user: RequestUser, dto: SaveDrawingNeedDto): Promise<DrawingNeedDto> {
    await this.access.assertCanManageDocuments(user, dto.projectId);
    await this.checkLine(user.organizationId, dto.projectId, dto);
    try {
      const row = await this.prisma.drawingNeed.create({
        data: { ...(dto.id ? { id: dto.id } : {}), organizationId: user.organizationId, projectId: dto.projectId, ...this.lineData(dto), dropped: !!dto.dropped, documentId: dto.documentId || null, createdById: user.id },
        select: { id: true },
      });
      await this.audit.log(user, 'DRAWING_NEED', row.id, 'CREATED', dto.docNo ?? dto.title);
      return this.get(user, row.id);
    } catch (e) {
      if (dto.id && isUniqueViolation(e)) return this.get(user, dto.id);
      throw e;
    }
  }

  /** Many lines at once, as a consultant's drawing list or the planning team's schedule is typed or pasted in. */
  async addMany(user: RequestUser, dto: AddDrawingNeedsDto): Promise<{ added: number }> {
    await this.access.assertCanManageDocuments(user, dto.projectId);
    for (const [i, l] of dto.lines.entries()) {
      await this.checkLine(user.organizationId, dto.projectId, l).catch((e: Error) => {
        throw new BadRequestException(`Line ${i + 1}: ${e.message}`);
      });
    }
    await this.prisma.drawingNeed.createMany({ data: dto.lines.map((l) => ({ organizationId: user.organizationId, projectId: dto.projectId, ...this.lineData(l), createdById: user.id })) });
    await this.audit.log(user, 'DRAWING_NEED', dto.projectId, 'CREATED', `${dto.lines.length} drawings added to the schedule`);
    return { added: dto.lines.length };
  }

  async update(user: RequestUser, id: string, dto: SaveDrawingNeedDto): Promise<DrawingNeedDto> {
    const cur = await this.row(user, id);
    if (dto.projectId !== cur.projectId) throw new BadRequestException('A drawing stays in its project’s schedule');
    await this.access.assertCanManageDocuments(user, cur.projectId);
    await this.checkLine(user.organizationId, cur.projectId, dto);
    // A new number unlinks a document matched by the old one, so the next list matches it again.
    const renumbered = drawingNoKey(dto.docNo ?? '') !== drawingNoKey(cur.docNo ?? '');
    await this.prisma.drawingNeed.update({
      where: { id },
      data: { ...this.lineData(dto), dropped: !!dto.dropped, documentId: dto.documentId !== undefined ? dto.documentId || null : renumbered ? null : cur.documentId },
    });
    await this.audit.log(user, 'DRAWING_NEED', id, 'UPDATED', dto.dropped && !cur.dropped ? 'No longer needed' : null);
    return this.get(user, id);
  }

  async remove(user: RequestUser, id: string) {
    const cur = await this.row(user, id);
    await this.access.assertCanManageDocuments(user, cur.projectId);
    if (cur.riskId || cur.lastLetterId) throw new BadRequestException('It was chased by letter or recorded as a delay, so it is kept; mark it not needed instead');
    await this.prisma.drawingNeed.delete({ where: { id } });
    await this.audit.log(user, 'DRAWING_NEED', id, 'DELETED', cur.docNo ?? cur.title);
    return { ok: true };
  }

  /**
   * A reminder letter for the drawings one party owes on the project: this one and the others from the same party that
   * are late or due within a week. It is a draft outward letter, approved and numbered like any other.
   */
  async remind(user: RequestUser, id: string): Promise<{ letterId: string; drawings: number }> {
    const cur = await this.row(user, id);
    await this.access.assertCanManageDocuments(user, cur.projectId);
    const today = todayIn();
    const me = this.toDto(cur, today);
    if (!remindsByLetter(me.source) || !me.fromParty) throw new BadRequestException('A reminder goes by letter to whoever issues the drawing; say who that is first');
    if (me.state === 'GFC' || me.state === 'DROPPED') throw new BadRequestException('This drawing is no longer awaited');
    const party = me.fromParty.trim().toLowerCase();
    const soon = plusDays(today, DRAWING_SOON_DAYS);
    const group = (await this.rows(user, { projectId: cur.projectId, dropped: false, source: cur.source }))
      .map((r) => this.toDto(r, today))
      .filter((n) => n.fromParty?.trim().toLowerCase() === party && (n.state === 'AWAITED' || n.state === 'RECEIVED') && (n.id === me.id || n.neededBy <= soon));
    const { subject, body } = reminderLetter(me.projectName, group, today, (d) => titleDate(parseDate(d)));
    const riskIds = [...new Set(group.map((n) => n.riskId).filter(Boolean))];
    const letter = await this.letters.create(user, {
      projectId: cur.projectId,
      direction: 'OUT',
      letterDate: today,
      party: me.fromParty,
      subject: subject.slice(0, 300),
      body,
      category: masterCode('Drawing and design'),
      replyBy: plusDays(today, 7),
      riskId: riskIds.length === 1 ? riskIds[0] : null,
    });
    await this.prisma.drawingNeed.updateMany({ where: { id: { in: group.map((n) => n.id) } }, data: { lastLetterId: letter.id, lastReminderOn: parseDate(today), reminders: { increment: 1 } } });
    await this.audit.log(user, 'DRAWING_NEED', id, 'UPDATED', `Reminder drafted for ${group.length} drawing${group.length === 1 ? '' : 's'}`);
    return { letterId: letter.id, drawings: group.length };
  }

  /** Records a late drawing from the client's side as a delay (design, the client's), from the day after it was needed. */
  async recordDelay(user: RequestUser, id: string): Promise<DrawingNeedDto> {
    const cur = await this.row(user, id);
    const today = todayIn();
    const me = this.toDto(cur, today);
    if (cur.riskId) throw new BadRequestException(`Already recorded as delay ${me.riskNo}`);
    if (!isClientSide(me.source)) throw new BadRequestException('Only a drawing the client’s side owes is the client’s delay');
    if (!me.overdue) throw new BadRequestException('It is not late yet');
    const risk = await this.risks.create(user, {
      projectId: cur.projectId,
      kind: 'DELAY',
      category: 'DESIGN',
      title: `Drawing awaited: ${[me.docNo, me.title].filter(Boolean).join(', ')}`.slice(0, 200),
      description: `Needed by ${titleDate(parseDate(me.neededBy))} from ${me.fromParty ?? 'the client'}; ${me.state === 'RECEIVED' ? `revision ${me.revision} is in but not for construction` : 'not yet received'}.${me.activityName ? ` It holds up ${me.activityName}.` : ''}`,
      activityId: cur.activityId,
      impact: 3,
      delayStart: plusDays(me.neededBy, 1),
      responsibleParty: 'CLIENT',
    });
    await this.prisma.drawingNeed.update({ where: { id }, data: { riskId: risk.id } });
    return this.get(user, id);
  }

  /** The next number in the company's scheme for a new drawing of the project. */
  async nextNo(user: RequestUser, q: NextDrawingNoQuery): Promise<{ docNo: string }> {
    this.assertView(user);
    await this.access.assertCanAccessProject(user, q.projectId);
    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: q.projectId }, select: { code: true } });
    const [docs, needs] = await Promise.all([
      this.prisma.document.findMany({ where: { projectId: q.projectId }, select: { docNo: true } }),
      this.prisma.drawingNeed.findMany({ where: { projectId: q.projectId, docNo: { not: null } }, select: { docNo: true } }),
    ]);
    return { docNo: nextDrawingNo(project.code, q.discipline, [...docs.map((d) => d.docNo), ...needs.map((n) => n.docNo!)]) };
  }

  /** Drawings site builds from that have no as-built revision yet: what the handover still owes. */
  async asBuiltDue(user: RequestUser, q: AsBuiltQuery): Promise<AsBuiltDueDto[]> {
    this.assertView(user);
    if (q.projectId) await this.access.assertCanAccessProject(user, q.projectId);
    const rows = await this.prisma.document.findMany({
      where: { ...this.access.submissionWhere(user), ...(q.projectId ? { projectId: q.projectId } : {}), kind: 'DRAWING', currentRevision: { status: { in: BUILDABLE_STATUSES } } },
      include: { project: { select: { name: true } }, currentRevision: { select: { revision: true, status: true, issuedOn: true } } },
      orderBy: [{ project: { name: 'asc' } }, { docNo: 'asc' }],
    });
    return rows.map((d) => ({
      documentId: d.id,
      projectId: d.projectId,
      projectName: d.project.name,
      docNo: d.docNo,
      title: d.title,
      discipline: d.discipline as DocumentDiscipline,
      revision: d.currentRevision!.revision,
      status: d.currentRevision!.status as RevisionStatus,
      issuedOn: dateOnly(d.currentRevision!.issuedOn),
    }));
  }
}
