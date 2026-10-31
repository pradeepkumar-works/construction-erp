import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  MEETING_KIND_LABELS,
  canEditMeeting,
  canManageMeetings,
  canRecordMeetings,
  canUpdateMeetingAction,
  canViewMeetings,
  type MeetingActionDto,
  type MeetingActionListDto,
  type MeetingDetailDto,
  type MeetingDto,
  type MeetingIssueResultDto,
  type MeetingLinkDto,
  type MeetingLinkOptionsDto,
  type MeetingListDto,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { dateOnly, formatDay, iso, parseDate } from '../common/serialize';
import { nextDocNo } from '../common/doc-number';
import { todayIn } from '../notifications/time';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService, escapeHtml } from '../notifications/email.service';
import { emailButton, emailLayout, EMAIL_COLORS } from '../notifications/email-layout';
import { actionCounts, actionMoveProblem, actionTiming, byUrgency, issueProblem } from './meeting-rules';
import { ActionInput, CreateMeetingDto, MeetingActionQuery, MeetingQuery, UpdateActionDto, UpdateMeetingDto } from './meetings.dto';

const WEB_URL = (process.env.WEB_URL || '').replace(/\/+$/, '');

const ACTION_INCLUDE = {
  meeting: { select: { meetingNo: true, title: true, heldOn: true, createdById: true } },
  project: { select: { code: true, name: true } },
  closedBy: { select: { fullName: true } },
  rfi: { select: { id: true, rfiNo: true, subject: true } },
  ncr: { select: { id: true, ncrNo: true, title: true } },
  variation: { select: { id: true, varNo: true, title: true } },
} satisfies Prisma.MeetingActionInclude;
type ActionRow = Prisma.MeetingActionGetPayload<{ include: typeof ACTION_INCLUDE }>;

const LIST_INCLUDE = {
  project: { select: { code: true, name: true } },
  createdBy: { select: { fullName: true } },
  attendees: { select: { present: true } },
  points: { select: { kind: true } },
  actions: { select: { status: true } },
} satisfies Prisma.MeetingInclude;
type ListRow = Prisma.MeetingGetPayload<{ include: typeof LIST_INCLUDE }>;

const DETAIL_INCLUDE = {
  project: { select: { code: true, name: true } },
  createdBy: { select: { fullName: true } },
  issuedBy: { select: { fullName: true } },
  attendees: { orderBy: { sortOrder: 'asc' } },
  points: { orderBy: { sortOrder: 'asc' } },
  actions: { orderBy: { sortOrder: 'asc' }, include: ACTION_INCLUDE },
} satisfies Prisma.MeetingInclude;
type DetailRow = Prisma.MeetingGetPayload<{ include: typeof DETAIL_INCLUDE }>;

const linkOf = (a: ActionRow): MeetingLinkDto | null =>
  a.rfi
    ? { kind: 'RFI', id: a.rfi.id, label: `${a.rfi.rfiNo} ${a.rfi.subject}` }
    : a.ncr
      ? { kind: 'NCR', id: a.ncr.id, label: `${a.ncr.ncrNo} ${a.ncr.title}` }
      : a.variation
        ? { kind: 'VARIATION', id: a.variation.id, label: `V-${a.variation.varNo} ${a.variation.title}` }
        : null;

/**
 * Meetings and action items (v6 item 112). A meeting is recorded on a project as a draft: who came, the points noted
 * and decided, and the actions with an owner and a due date. Issuing the minutes fixes them, emails them to everyone
 * on the list with an address, and tells our action owners; the actions then stay open, come up at the project's next
 * meetings and in their owners' My work, until done or dropped. Rules in `meeting-rules.ts`.
 */
@Injectable()
export class MeetingsService {
  private readonly log = new Logger(MeetingsService.name);

  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private notifications: NotificationsService,
    private email: EmailService,
  ) {}

  private assertView(user: RequestUser) {
    if (!canViewMeetings(user.roleKey)) throw new ForbiddenException('Meetings are for the company’s own staff');
  }

  private actionDto(user: RequestUser, a: ActionRow, today: string): MeetingActionDto {
    const dueOn = dateOnly(a.dueOn);
    return {
      id: a.id,
      meetingId: a.meetingId,
      meetingNo: a.meeting.meetingNo,
      meetingTitle: a.meeting.title,
      heldOn: dateOnly(a.meeting.heldOn),
      projectId: a.projectId,
      projectCode: a.project.code,
      projectName: a.project.name,
      text: a.text,
      ownerUserId: a.ownerUserId,
      ownerName: a.ownerName,
      dueOn,
      status: a.status,
      doneOn: dateOnly(a.doneOn),
      closeNote: a.closeNote,
      closedByName: a.closedBy?.fullName ?? null,
      link: linkOf(a),
      ...actionTiming(a.status, dueOn, today),
      canUpdate: canUpdateMeetingAction(user, { ownerUserId: a.ownerUserId, meetingCreatedById: a.meeting.createdById }),
    };
  }

  private summary(r: ListRow | DetailRow): MeetingDto {
    return {
      id: r.id,
      meetingNo: r.meetingNo,
      projectId: r.projectId,
      projectCode: r.project.code,
      projectName: r.project.name,
      title: r.title,
      kind: r.kind,
      heldOn: dateOnly(r.heldOn),
      startTime: r.startTime,
      venue: r.venue,
      status: r.status,
      present: r.attendees.filter((a) => a.present).length,
      decisionCount: r.points.filter((p) => p.kind === 'DECISION').length,
      actionCount: r.actions.length,
      openActionCount: r.actions.filter((a) => a.status === 'OPEN').length,
      issuedAt: iso(r.issuedAt),
      createdByName: r.createdBy.fullName,
    };
  }

  private where(user: RequestUser): Prisma.MeetingWhereInput {
    return { organizationId: user.organizationId, project: this.access.projectWhere(user) };
  }

  async list(user: RequestUser, q: MeetingQuery): Promise<MeetingListDto> {
    this.assertView(user);
    const today = todayIn();
    const base: Prisma.MeetingWhereInput = { ...this.where(user), ...(q.projectId ? { projectId: q.projectId } : {}) };
    const words = q.q?.trim();
    const where: Prisma.MeetingWhereInput = {
      ...base,
      ...(q.status === 'draft' ? { status: 'DRAFT' } : q.status === 'issued' ? { status: 'ISSUED' } : {}),
      ...(words
        ? {
            OR: [
              { title: { contains: words, mode: 'insensitive' } },
              { meetingNo: { contains: words, mode: 'insensitive' } },
              { venue: { contains: words, mode: 'insensitive' } },
              { project: { OR: [{ code: { contains: words, mode: 'insensitive' } }, { name: { contains: words, mode: 'insensitive' } }] } },
              { points: { some: { text: { contains: words, mode: 'insensitive' } } } },
              { actions: { some: { text: { contains: words, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
    const actionWhere: Prisma.MeetingActionWhereInput = { organizationId: user.organizationId, project: this.access.projectWhere(user), ...(q.projectId ? { projectId: q.projectId } : {}), status: 'OPEN' };
    const [rows, thisMonth, drafts, open] = await Promise.all([
      this.prisma.meeting.findMany({ where, include: LIST_INCLUDE, orderBy: [{ heldOn: 'desc' }, { createdAt: 'desc' }], take: 200 }),
      this.prisma.meeting.count({ where: { ...base, heldOn: { gte: parseDate(`${today.slice(0, 7)}-01`) } } }),
      this.prisma.meeting.count({ where: { ...base, status: 'DRAFT' } }),
      this.prisma.meetingAction.findMany({ where: actionWhere, select: { status: true, dueOn: true, doneOn: true } }),
    ]);
    const counts = actionCounts(open.map((a) => ({ status: a.status, dueOn: dateOnly(a.dueOn), doneOn: dateOnly(a.doneOn) })), today);
    return { items: rows.map((r) => this.summary(r)), summary: { thisMonth, drafts, openActions: counts.open, overdueActions: counts.overdue } };
  }

  /** Actions across the meetings of the caller's projects: open ones by due date by default, or the caller's own. */
  async actions(user: RequestUser, q: MeetingActionQuery): Promise<MeetingActionListDto> {
    this.assertView(user);
    const today = todayIn();
    const base: Prisma.MeetingActionWhereInput = {
      organizationId: user.organizationId,
      project: this.access.projectWhere(user),
      ...(q.projectId ? { projectId: q.projectId } : {}),
      ...(q.mine ? { ownerUserId: user.id } : {}),
    };
    const status = q.status ?? 'open';
    const words = q.q?.trim();
    const where: Prisma.MeetingActionWhereInput = {
      ...base,
      ...(status === 'open' ? { status: 'OPEN' } : status === 'overdue' ? { status: 'OPEN', dueOn: { lt: parseDate(today) } } : status === 'done' ? { status: { in: ['DONE', 'DROPPED'] } } : {}),
      ...(words
        ? {
            OR: [
              { text: { contains: words, mode: 'insensitive' } },
              { ownerName: { contains: words, mode: 'insensitive' } },
              { meeting: { OR: [{ meetingNo: { contains: words, mode: 'insensitive' } }, { title: { contains: words, mode: 'insensitive' } }] } },
            ],
          }
        : {}),
    };
    const [rows, all] = await Promise.all([
      this.prisma.meetingAction.findMany({ where, include: ACTION_INCLUDE, orderBy: status === 'done' ? [{ doneOn: 'desc' }] : [{ dueOn: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }], take: 300 }),
      this.prisma.meetingAction.findMany({ where: base, select: { status: true, dueOn: true, doneOn: true } }),
    ]);
    return {
      items: rows.map((a) => this.actionDto(user, a, today)),
      summary: actionCounts(all.map((a) => ({ status: a.status, dueOn: dateOnly(a.dueOn), doneOn: dateOnly(a.doneOn) })), today),
    };
  }

  private async row(user: RequestUser, id: string): Promise<DetailRow> {
    this.assertView(user);
    const row = await this.prisma.meeting.findFirst({ where: { id, ...this.where(user) }, include: DETAIL_INCLUDE });
    if (!row) throw new NotFoundException('Meeting not found');
    return row;
  }

  private async detail(user: RequestUser, r: DetailRow): Promise<MeetingDetailDto> {
    const today = todayIn();
    // What earlier meetings left open on this project, to be gone through at this one.
    const earlier = await this.prisma.meetingAction.findMany({
      where: { organizationId: user.organizationId, projectId: r.projectId, status: 'OPEN', meetingId: { not: r.id }, meeting: { heldOn: { lte: r.heldOn } } },
      include: ACTION_INCLUDE,
    });
    return {
      ...this.summary(r),
      chairedBy: r.chairedBy,
      agenda: r.agenda,
      nextOn: dateOnly(r.nextOn),
      attendees: r.attendees.map((a) => ({ id: a.id, userId: a.userId, name: a.name, organisation: a.organisation, email: a.email, phone: a.phone, present: a.present })),
      points: r.points.map((p) => ({ id: p.id, kind: p.kind, text: p.text })),
      actions: r.actions.map((a) => this.actionDto(user, a, today)),
      earlierActions: byUrgency(earlier.map((a) => ({ ...this.actionDto(user, a, today), sortKey: a.meeting.meetingNo }))).map(({ sortKey: _k, ...a }) => a),
      issuedByName: r.issuedBy?.fullName ?? null,
      canEdit: r.status === 'DRAFT' && canEditMeeting(user, r.createdById),
      canRevise: r.status === 'ISSUED' && canManageMeetings(user.roleKey),
    };
  }

  async get(user: RequestUser, id: string): Promise<MeetingDetailDto> {
    return this.detail(user, await this.row(user, id));
  }

  /** The RFIs, NCRs and variations of a project an action can be about, newest first. */
  async linkOptions(user: RequestUser, projectId: string): Promise<MeetingLinkOptionsDto> {
    this.assertView(user);
    await this.access.assertCanAccessProject(user, projectId);
    const where = { organizationId: user.organizationId, projectId };
    const [rfis, ncrs, variations] = await Promise.all([
      this.prisma.rfi.findMany({ where, select: { id: true, rfiNo: true, subject: true }, orderBy: { createdAt: 'desc' }, take: 200 }),
      this.prisma.ncr.findMany({ where, select: { id: true, ncrNo: true, title: true }, orderBy: { createdAt: 'desc' }, take: 200 }),
      this.prisma.variation.findMany({ where, select: { id: true, varNo: true, title: true }, orderBy: { varNo: 'desc' }, take: 200 }),
    ]);
    return {
      rfis: rfis.map((r) => ({ kind: 'RFI', id: r.id, label: `${r.rfiNo} ${r.subject}` })),
      ncrs: ncrs.map((n) => ({ kind: 'NCR', id: n.id, label: `${n.ncrNo} ${n.title}` })),
      variations: variations.map((v) => ({ kind: 'VARIATION', id: v.id, label: `V-${v.varNo} ${v.title}` })),
    };
  }

  /** Attendees with our users' names (and email when none is typed) from the user master. */
  private async attendeeRows(user: RequestUser, input: CreateMeetingDto['attendees']) {
    const list = input ?? [];
    const ids = [...new Set(list.map((a) => a.userId).filter((x): x is string => !!x))];
    const users = ids.length ? await this.prisma.user.findMany({ where: { id: { in: ids }, organizationId: user.organizationId }, select: { id: true, fullName: true, email: true, phone: true } }) : [];
    return list.map((a, i) => {
      const u = a.userId ? users.find((x) => x.id === a.userId) : null;
      if (a.userId && !u) throw new BadRequestException(`Attendee ${i + 1}: that user is not in this company`);
      const name = u?.fullName ?? a.name?.trim();
      if (!name) throw new BadRequestException(`Attendee ${i + 1}: give their name`);
      return { userId: u?.id ?? null, name, organisation: u ? null : (a.organisation ?? null), email: a.email ?? u?.email ?? null, phone: a.phone ?? u?.phone ?? null, present: a.present ?? true, sortOrder: i };
    });
  }

  /** Actions with our owners' names from the user master and their links checked against the project. */
  private async actionRows(user: RequestUser, projectId: string, input: ActionInput[]) {
    const ownerIds = [...new Set(input.map((a) => a.ownerUserId).filter((x): x is string => !!x))];
    const owners = ownerIds.length ? await this.prisma.user.findMany({ where: { id: { in: ownerIds }, organizationId: user.organizationId }, select: { id: true, fullName: true } }) : [];
    const ids = (kind: string) => input.filter((a) => a.linkKind === kind && a.linkId).map((a) => a.linkId!);
    const where = (list: string[]) => ({ id: { in: list }, projectId, organizationId: user.organizationId });
    const [rfis, ncrs, vars] = await Promise.all([
      this.prisma.rfi.findMany({ where: where(ids('RFI')), select: { id: true } }),
      this.prisma.ncr.findMany({ where: where(ids('NCR')), select: { id: true } }),
      this.prisma.variation.findMany({ where: where(ids('VARIATION')), select: { id: true } }),
    ]);
    const known = new Set([...rfis, ...ncrs, ...vars].map((x) => x.id));
    return input.map((a, i) => {
      const owner = a.ownerUserId ? owners.find((o) => o.id === a.ownerUserId) : null;
      if (a.ownerUserId && !owner) throw new BadRequestException(`Action ${i + 1}: that owner is not in this company`);
      if (a.linkKind && a.linkId && !known.has(a.linkId)) throw new BadRequestException(`Action ${i + 1}: the ${a.linkKind === 'VARIATION' ? 'variation' : a.linkKind} is not on this project`);
      const link = a.linkKind && a.linkId ? a.linkKind : null;
      return {
        id: a.id,
        text: a.text,
        ownerUserId: owner?.id ?? null,
        ownerName: owner?.fullName ?? a.ownerName?.trim() ?? '',
        dueOn: a.dueOn ? parseDate(a.dueOn) : null,
        rfiId: link === 'RFI' ? a.linkId! : null,
        ncrId: link === 'NCR' ? a.linkId! : null,
        variationId: link === 'VARIATION' ? a.linkId! : null,
        sortOrder: i,
      };
    });
  }

  async create(user: RequestUser, dto: CreateMeetingDto): Promise<MeetingDetailDto> {
    if (!canRecordMeetings(user.roleKey)) throw new ForbiddenException('Your role does not record meetings');
    await this.access.assertCanAccessProject(user, dto.projectId);
    const attendees = await this.attendeeRows(user, dto.attendees);
    const actions = await this.actionRows(user, dto.projectId, dto.actions ?? []);
    const orgId = user.organizationId;
    const id = await this.prisma.$transaction(async (tx) => {
      const meetingNo = await nextDocNo(tx, orgId, 'MOM', async (prefix) =>
        (await tx.meeting.findFirst({ where: { organizationId: orgId, meetingNo: { startsWith: prefix } }, orderBy: { meetingNo: 'desc' }, select: { meetingNo: true } }))?.meetingNo ?? null,
      );
      const m = await tx.meeting.create({
        data: {
          organizationId: orgId,
          projectId: dto.projectId,
          meetingNo,
          title: dto.title,
          kind: dto.kind ?? 'PROGRESS',
          heldOn: parseDate(dto.heldOn),
          startTime: dto.startTime ?? null,
          venue: dto.venue ?? null,
          chairedBy: dto.chairedBy ?? null,
          agenda: dto.agenda ?? null,
          nextOn: dto.nextOn ? parseDate(dto.nextOn) : null,
          createdById: user.id,
          attendees: { create: attendees.map((a) => ({ ...a, organizationId: orgId })) },
          points: { create: (dto.points ?? []).map((p, i) => ({ organizationId: orgId, kind: p.kind, text: p.text, sortOrder: i })) },
          actions: { create: actions.map(({ id: _id, ...a }) => ({ ...a, organizationId: orgId, projectId: dto.projectId })) },
        },
      });
      return m.id;
    });
    await this.audit.log(user, 'MEETING', id, 'CREATED');
    return this.get(user, id);
  }

  /**
   * Change a draft: the fields given, and the attendees, points and actions as wholes when given. Actions keep their id
   * (and their status, should a revised meeting have some closed already); those left out are removed.
   */
  async update(user: RequestUser, id: string, dto: UpdateMeetingDto): Promise<MeetingDetailDto> {
    const row = await this.row(user, id);
    if (!canEditMeeting(user, row.createdById)) throw new ForbiddenException('Only whoever recorded this meeting, or a manager, changes its minutes');
    if (row.status !== 'DRAFT') throw new ConflictException('These minutes are issued. A manager can take them back to draft to correct them.');
    const orgId = user.organizationId;
    const attendees = dto.attendees ? await this.attendeeRows(user, dto.attendees) : null;
    const actions = dto.actions ? await this.actionRows(user, row.projectId, dto.actions) : null;
    if (actions?.some((a) => a.id && !row.actions.some((x) => x.id === a.id))) throw new BadRequestException('An action is not on this meeting');
    await this.prisma.$transaction(async (tx) => {
      await tx.meeting.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
          ...(dto.heldOn !== undefined ? { heldOn: parseDate(dto.heldOn) } : {}),
          ...(dto.startTime !== undefined ? { startTime: dto.startTime } : {}),
          ...(dto.venue !== undefined ? { venue: dto.venue } : {}),
          ...(dto.chairedBy !== undefined ? { chairedBy: dto.chairedBy } : {}),
          ...(dto.agenda !== undefined ? { agenda: dto.agenda } : {}),
          ...(dto.nextOn !== undefined ? { nextOn: dto.nextOn ? parseDate(dto.nextOn) : null } : {}),
        },
      });
      if (attendees) {
        await tx.meetingAttendee.deleteMany({ where: { meetingId: id } });
        await tx.meetingAttendee.createMany({ data: attendees.map((a) => ({ ...a, organizationId: orgId, meetingId: id })) });
      }
      if (dto.points) {
        await tx.meetingPoint.deleteMany({ where: { meetingId: id } });
        await tx.meetingPoint.createMany({ data: dto.points.map((p, i) => ({ organizationId: orgId, meetingId: id, kind: p.kind, text: p.text, sortOrder: i })) });
      }
      if (actions) {
        const keep = actions.map((a) => a.id).filter((x): x is string => !!x);
        await tx.meetingAction.deleteMany({ where: { meetingId: id, id: { notIn: keep } } });
        for (const { id: actionId, ...a } of actions) {
          if (actionId) await tx.meetingAction.update({ where: { id: actionId }, data: a });
          else await tx.meetingAction.create({ data: { ...a, organizationId: orgId, meetingId: id, projectId: row.projectId } });
        }
      }
    });
    await this.audit.log(user, 'MEETING', id, 'UPDATED');
    return this.get(user, id);
  }

  async remove(user: RequestUser, id: string) {
    const row = await this.row(user, id);
    if (!canEditMeeting(user, row.createdById)) throw new ForbiddenException('Only whoever recorded this meeting, or a manager, deletes it');
    if (row.status !== 'DRAFT') throw new ConflictException('Issued minutes stay on record. A manager can take them back to draft to correct them.');
    await this.prisma.meeting.delete({ where: { id } });
    await this.audit.log(user, 'MEETING', id, 'DELETED', `${row.meetingNo} ${row.title}`);
    return { ok: true };
  }

  /** Issue the minutes: fixed from now, emailed to everyone listed with an address, and our action owners told. */
  async issue(user: RequestUser, id: string): Promise<MeetingIssueResultDto> {
    const row = await this.row(user, id);
    if (!canEditMeeting(user, row.createdById)) throw new ForbiddenException('Only whoever recorded this meeting, or a manager, issues its minutes');
    if (row.status !== 'DRAFT') throw new ConflictException('These minutes are already issued');
    const problem = issueProblem({
      attendees: row.attendees,
      points: row.points.length,
      actions: row.actions.map((a) => ({ text: a.text, ownerName: a.ownerName, dueOn: dateOnly(a.dueOn) })),
    });
    if (problem) throw new BadRequestException(problem);
    const done = await this.prisma.meeting.updateMany({ where: { id, status: 'DRAFT' }, data: { status: 'ISSUED', issuedAt: new Date(), issuedById: user.id } });
    if (!done.count) throw new ConflictException('These minutes are already issued');
    await this.audit.log(user, 'MEETING', id, 'ISSUED');
    const meeting = await this.get(user, id);

    const org = await this.prisma.organization.findUnique({ where: { id: user.organizationId }, select: { name: true } });
    const emailed = await this.sendMinutes(meeting, org?.name ?? '');
    // Each of our owners is told once, of all their actions in these minutes.
    const owners = new Map<string, number>();
    for (const a of meeting.actions) if (a.ownerUserId && a.status === 'OPEN') owners.set(a.ownerUserId, (owners.get(a.ownerUserId) ?? 0) + 1);
    let notified = 0;
    for (const [ownerId, n] of owners) {
      const r = await this.notifications.notify({
        organizationId: user.organizationId,
        userIds: [ownerId],
        type: 'DOCUMENT_ISSUED',
        title: `${n === 1 ? 'An action' : `${n} actions`} for you: ${meeting.meetingNo}`,
        body: `${meeting.title} (${meeting.projectName}), ${formatDay(meeting.heldOn)}`,
        projectId: meeting.projectId,
        entityType: 'MEETING',
        entityId: id,
        dedupeKey: `MEETING_ISSUED:${id}`,
      });
      notified += r.created;
    }
    return { meeting, emailed, notified };
  }

  /** The minutes by email to everyone on the list with an address. Returns how many went to a real provider. */
  private async sendMinutes(m: MeetingDetailDto, orgName: string): Promise<number> {
    const to = [...new Set(m.attendees.map((a) => a.email?.trim().toLowerCase()).filter((e): e is string => !!e))];
    if (!to.length) return 0;
    const subject = `Minutes: ${m.title} · ${m.projectName} · ${formatDay(m.heldOn)}`;
    const td = `padding:6px 8px;border:1px solid ${EMAIL_COLORS.border};vertical-align:top;font-size:14px`;
    const present = m.attendees.filter((a) => a.present);
    const absent = m.attendees.filter((a) => !a.present);
    const who = (list: typeof present) => list.map((a) => escapeHtml(a.organisation ? `${a.name} (${a.organisation})` : a.name)).join(', ');
    const html = [
      `<p style="margin:0 0 4px;font-size:13px;color:${EMAIL_COLORS.muted}">${escapeHtml(`${m.meetingNo} · ${MEETING_KIND_LABELS[m.kind]}`)}</p>`,
      `<h1 style="margin:0 0 4px;font-size:20px">${escapeHtml(m.title)}</h1>`,
      `<p style="margin:0 0 16px">${escapeHtml([`${m.projectCode} ${m.projectName}`, `${formatDay(m.heldOn)}${m.startTime ? `, ${m.startTime}` : ''}`, m.venue].filter(Boolean).join(' · '))}</p>`,
      present.length ? `<p style="margin:0 0 4px"><strong>Present:</strong> ${who(present)}</p>` : '',
      absent.length ? `<p style="margin:0 0 4px"><strong>Absent:</strong> ${who(absent)}</p>` : '',
      m.points.length
        ? `<h2 style="font-size:16px;margin:20px 0 8px">Minutes</h2><ol style="margin:0;padding-left:20px">${m.points.map((p) => `<li style="margin:0 0 6px">${p.kind === 'DECISION' ? '<strong>Decided:</strong> ' : ''}${escapeHtml(p.text)}</li>`).join('')}</ol>`
        : '',
      m.actions.length
        ? `<h2 style="font-size:16px;margin:20px 0 8px">Actions</h2><table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%"><tr><td style="${td}"><strong>Action</strong></td><td style="${td}"><strong>Who</strong></td><td style="${td}"><strong>By</strong></td></tr>${m.actions
            .map((a, i) => `<tr><td style="${td}">${i + 1}. ${escapeHtml(a.text)}${a.link ? `<br/><span style="color:${EMAIL_COLORS.muted};font-size:12px">${escapeHtml(a.link.label)}</span>` : ''}</td><td style="${td}">${escapeHtml(a.ownerName)}</td><td style="${td};white-space:nowrap">${a.dueOn ? escapeHtml(formatDay(a.dueOn)) : '-'}</td></tr>`)
            .join('')}</table>`
        : '',
      m.nextOn ? `<p style="margin:16px 0 0"><strong>Next meeting:</strong> ${escapeHtml(formatDay(m.nextOn))}</p>` : '',
      WEB_URL ? emailButton(`${WEB_URL}/meetings/${m.id}`, 'Open the minutes') : '',
    ].join('');
    const text = [
      `${m.meetingNo}: ${m.title}`,
      `${m.projectCode} ${m.projectName}, ${formatDay(m.heldOn)}${m.venue ? `, ${m.venue}` : ''}`,
      '',
      ...m.points.map((p, i) => `${i + 1}. ${p.kind === 'DECISION' ? 'Decided: ' : ''}${p.text}`),
      ...(m.actions.length ? ['', 'Actions:', ...m.actions.map((a, i) => `${i + 1}. ${a.text} (${a.ownerName}${a.dueOn ? `, by ${formatDay(a.dueOn)}` : ''})`)] : []),
    ].join('\n');
    let sent = 0;
    for (const address of to) {
      const ok = await this.email.send({ to: address, subject, html: emailLayout({ preheader: subject, body: html, orgName }), text }).catch((e) => {
        this.log.warn(`minutes email to ${address}: ${e}`);
        return false;
      });
      if (ok) sent += 1;
    }
    return sent;
  }

  /** Take issued minutes back to draft to correct them (managers); they are issued again after. */
  async revise(user: RequestUser, id: string): Promise<MeetingDetailDto> {
    const row = await this.row(user, id);
    if (!canManageMeetings(user.roleKey)) throw new ForbiddenException('Only a manager takes issued minutes back to draft');
    if (row.status !== 'ISSUED') return this.detail(user, row);
    await this.prisma.meeting.update({ where: { id }, data: { status: 'DRAFT', issuedAt: null, issuedById: null } });
    await this.audit.log(user, 'MEETING', id, 'REVISED');
    return this.get(user, id);
  }

  /** Close, drop or reopen an action, or move its date, by its owner, whoever recorded its meeting, or a manager. */
  async updateAction(user: RequestUser, actionId: string, dto: UpdateActionDto): Promise<MeetingActionDto> {
    this.assertView(user);
    const a = await this.prisma.meetingAction.findFirst({ where: { id: actionId, organizationId: user.organizationId, project: this.access.projectWhere(user) }, include: ACTION_INCLUDE });
    if (!a) throw new NotFoundException('Action not found');
    if (!canUpdateMeetingAction(user, { ownerUserId: a.ownerUserId, meetingCreatedById: a.meeting.createdById })) throw new ForbiddenException('Only its owner, whoever recorded the meeting, or a manager, updates this action');
    const today = todayIn();
    const to = dto.status ?? a.status;
    const problem = actionMoveProblem(a.status, to, { doneOn: dto.doneOn ?? (to === 'DONE' ? today : null), note: dto.note, today });
    if (problem) throw new BadRequestException(problem);
    if (dto.dueOn !== undefined && to !== 'OPEN') throw new BadRequestException('Move the date of an open action only');
    const data: Prisma.MeetingActionUncheckedUpdateInput =
      to === 'OPEN'
        ? { status: 'OPEN', doneOn: null, closeNote: null, closedById: null, ...(dto.dueOn !== undefined ? { dueOn: dto.dueOn ? parseDate(dto.dueOn) : null } : {}) }
        : { status: to, doneOn: parseDate(dto.doneOn ?? today), closeNote: dto.note ?? null, closedById: user.id };
    const saved = await this.prisma.meetingAction.update({ where: { id: actionId }, data, include: ACTION_INCLUDE });
    const what = to === a.status ? 'ACTION_MOVED' : to === 'DONE' ? 'ACTION_DONE' : to === 'DROPPED' ? 'ACTION_DROPPED' : 'ACTION_REOPENED';
    await this.audit.log(user, 'MEETING', a.meetingId, what, a.text.slice(0, 120));
    return this.actionDto(user, saved, today);
  }
}
