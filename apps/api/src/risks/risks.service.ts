import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  HIGH_RISK_SCORE,
  RISK_CATEGORIES,
  RISK_KIND_LABELS,
  canApprove,
  canEditRisk,
  delayDays,
  riskScore,
  type DelayParty,
  type DelaySuggestionDto,
  type Paginated,
  type RiskDto,
  type RiskSortField,
  type RiskSummaryDto,
  type RoleKey,
  type SortOrder,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { AttachmentsService, ATTACHMENT_FIELDS } from '../common/attachments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { dateOnly, iso, parseDate, pct } from '../common/serialize';
import { isUniqueViolation } from '../common/idempotency';
import { nextDocNo } from '../common/doc-number';
import { ilike, pageArgs, paginated, searchWords } from '../common/paging';
import { CreateRiskDto, ListRisksQuery, RiskSuggestionsQuery, UpdateRiskDto } from './risks.dto';

const include = {
  project: { select: { name: true } },
  activity: { select: { name: true } },
  owner: { select: { fullName: true } },
  raisedBy: { select: { fullName: true } },
  attachments: { select: ATTACHMENT_FIELDS },
} satisfies Prisma.RiskInclude;
type Row = Prisma.RiskGetPayload<{ include: typeof include }>;

const ORDER: Record<RiskSortField, (o: SortOrder) => Prisma.RiskOrderByWithRelationInput[]> = {
  riskNo: (o) => [{ riskNo: o }],
  score: (o) => [{ score: o }, { riskNo: 'desc' }],
  status: (o) => [{ status: o }, { score: 'desc' }],
  kind: (o) => [{ kind: o }, { score: 'desc' }],
  category: (o) => [{ category: o }, { score: 'desc' }],
  dueDate: (o) => [{ dueDate: { sort: o, nulls: 'last' } }, { score: 'desc' }],
  project: (o) => [{ project: { name: o } }, { score: 'desc' }],
  owner: (o) => [{ owner: { fullName: o } }, { score: 'desc' }],
  createdAt: (o) => [{ createdAt: o }],
  updatedAt: (o) => [{ updatedAt: o }],
};
const DESC_DEFAULT = new Set<string>(['riskNo', 'score', 'createdAt', 'updatedAt']);

/** Delays the contractor is not answerable for: these can support an extension-of-time claim. */
const EXCUSABLE: DelayParty[] = ['CLIENT', 'THIRD_PARTY', 'FORCE_MAJEURE'];

const todayStr = () => new Date().toISOString().slice(0, 10);

/**
 * Delay and risk register per project. Entries are numbered RISK-<year>-0001 per organisation. A delay records the
 * days work was held up and who caused it; a risk is scored probability × impact. Not an approval submission: entries
 * stay open, are followed up by an owner and closed with a note. Raising a delay or a high risk notifies the project's
 * approvers.
 */
@Injectable()
export class RisksService {
  private readonly log = new Logger(RisksService.name);

  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private attachments: AttachmentsService,
    private notifications: NotificationsService,
  ) {}

  toDto(r: Row, today = todayStr()): RiskDto {
    const delayStart = dateOnly(r.delayStart);
    const delayEnd = dateOnly(r.delayEnd);
    const dueDate = dateOnly(r.dueDate);
    return {
      id: r.id,
      projectId: r.projectId,
      projectName: r.project.name,
      riskNo: r.riskNo,
      kind: r.kind,
      category: r.category,
      title: r.title,
      description: r.description,
      activityId: r.activityId,
      activityName: r.activity?.name ?? null,
      ownerId: r.ownerId,
      ownerName: r.owner?.fullName ?? null,
      probability: r.probability,
      impact: r.impact,
      score: r.score,
      mitigation: r.mitigation,
      dueDate,
      overdue: r.status !== 'CLOSED' && !!dueDate && dueDate < today,
      status: r.status,
      delayStart,
      delayEnd,
      daysLost: r.kind === 'DELAY' ? (r.daysLost ?? delayDays(delayStart, delayEnd, today)) : null,
      responsibleParty: r.responsibleParty,
      eotClaimed: r.eotClaimed,
      eotGrantedDays: r.eotGrantedDays,
      closedAt: iso(r.closedAt),
      closureNote: r.closureNote,
      raisedById: r.raisedById,
      raisedByName: r.raisedBy.fullName,
      attachments: r.attachments.map((a) => this.attachments.toDto(a)),
      createdAt: iso(r.createdAt)!,
      updatedAt: iso(r.updatedAt)!,
    };
  }

  /** Filters shared by the list and the summary; the summary leaves out the status filters so it can count each status. */
  private where(user: RequestUser, q: ListRisksQuery, withStatus = true): Prisma.RiskWhereInput {
    const where: Prisma.RiskWhereInput = { ...this.access.submissionWhere(user) };
    const and: Prisma.RiskWhereInput[] = [];
    if (q.projectId) where.projectId = q.projectId;
    if (q.kind) where.kind = q.kind;
    if (q.category) where.category = q.category;
    if (q.ownerId) where.ownerId = q.ownerId;
    if (q.mine) where.ownerId = user.id;
    if (q.minScore) where.score = { gte: q.minScore };
    if (withStatus) {
      if (q.status) where.status = q.status;
      if (q.active) and.push({ status: { not: 'CLOSED' } });
      if (q.overdue) and.push({ status: { not: 'CLOSED' } }, { dueDate: { lt: parseDate(todayStr()) } });
    }
    for (const w of searchWords(q.q))
      and.push({ OR: [{ riskNo: ilike(w) }, { title: ilike(w) }, { description: ilike(w) }, { mitigation: ilike(w) }, { project: { name: ilike(w) } }] });
    if (and.length) where.AND = and;
    return where;
  }

  async list(user: RequestUser, q: ListRisksQuery): Promise<Paginated<RiskDto>> {
    const where = this.where(user, q);
    const sortBy = q.sortBy ?? 'score';
    const order = q.sortOrder ?? (DESC_DEFAULT.has(sortBy) ? 'desc' : 'asc');
    const args = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.risk.findMany({ where, include, orderBy: [...ORDER[sortBy](order), { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.risk.count({ where }),
    ]);
    const today = todayStr();
    return paginated(rows.map((r) => this.toDto(r, today)), total, args);
  }

  /** Counts, days lost and the heat map for the same filters as the list (status filters ignored). */
  async summary(user: RequestUser, q: ListRisksQuery): Promise<RiskSummaryDto> {
    const rows = await this.prisma.risk.findMany({
      where: this.where(user, q, false),
      select: { kind: true, category: true, status: true, probability: true, impact: true, score: true, dueDate: true, delayStart: true, delayEnd: true, daysLost: true, responsibleParty: true, eotClaimed: true },
    });
    const today = todayStr();
    const heat = [0, 1, 2, 3, 4].map(() => [0, 0, 0, 0, 0]);
    const cats = new Map<string, { open: number; total: number; daysLost: number }>();
    const s: RiskSummaryDto = { open: 0, monitoring: 0, closed: 0, highRisks: 0, openDelays: 0, overdue: 0, daysLost: 0, excusableDaysLost: 0, eotClaimed: 0, heat, byCategory: [] };
    for (const r of rows) {
      const active = r.status !== 'CLOSED';
      if (r.status === 'OPEN') s.open++;
      else if (r.status === 'MONITORING') s.monitoring++;
      else s.closed++;
      const due = dateOnly(r.dueDate);
      if (active && due && due < today) s.overdue++;
      let lost = 0;
      if (r.kind === 'RISK') {
        if (active) {
          heat[r.probability - 1][r.impact - 1]++;
          if (r.score >= HIGH_RISK_SCORE) s.highRisks++;
        }
      } else {
        if (active) s.openDelays++;
        lost = r.daysLost ?? delayDays(dateOnly(r.delayStart), dateOnly(r.delayEnd), today) ?? 0;
        s.daysLost += lost;
        if (r.responsibleParty && EXCUSABLE.includes(r.responsibleParty)) s.excusableDaysLost += lost;
        if (r.eotClaimed) s.eotClaimed++;
      }
      const c = cats.get(r.category) ?? { open: 0, total: 0, daysLost: 0 };
      c.total++;
      if (active) c.open++;
      c.daysLost += lost;
      cats.set(r.category, c);
    }
    s.byCategory = RISK_CATEGORIES.filter((c) => cats.has(c)).map((category) => ({ category, ...cats.get(category)! }));
    return s;
  }

  /** Delayed activities (past planned end, approved progress short of plan) on active projects with no open delay entry. */
  async suggestions(user: RequestUser, q: RiskSuggestionsQuery): Promise<DelaySuggestionDto[]> {
    const today = parseDate(todayStr());
    const activities = await this.prisma.activity.findMany({
      where: {
        project: { ...this.access.projectWhere(user), status: 'ACTIVE', ...(q.projectId ? { id: q.projectId } : {}) },
        plannedEnd: { lt: today },
        risks: { none: { kind: 'DELAY', status: { not: 'CLOSED' } } },
      },
      include: { project: { select: { name: true } }, progressEntries: { where: { status: 'APPROVED' }, select: { quantity: true } } },
      orderBy: [{ plannedEnd: 'asc' }, { sortOrder: 'asc' }],
    });
    return activities
      .map((a) => {
        const executed = a.progressEntries.reduce((s, e) => s.add(e.quantity), new Prisma.Decimal(0));
        return {
          activityId: a.id,
          activityName: a.name,
          projectId: a.projectId,
          projectName: a.project.name,
          plannedEnd: dateOnly(a.plannedEnd)!,
          progressPct: pct(executed, a.plannedQty),
          daysLate: Math.round((today.getTime() - a.plannedEnd!.getTime()) / 86_400_000),
        };
      })
      .filter((a) => a.progressPct < 100);
  }

  async get(user: RequestUser, id: string): Promise<RiskDto> {
    const row = await this.prisma.risk.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include });
    if (!row) throw new NotFoundException('Register entry not found');
    return this.toDto(row);
  }

  private async assertActivity(projectId: string, activityId: string | null | undefined) {
    if (!activityId) return;
    const a = await this.prisma.activity.findFirst({ where: { id: activityId, projectId }, select: { id: true } });
    if (!a) throw new NotFoundException('Activity not found in this project');
  }

  /** The owner must be an active user of the organisation who can see the project. */
  private async assertOwner(user: RequestUser, projectId: string, ownerId: string | null | undefined) {
    if (!ownerId) return;
    const u = await this.prisma.user.findFirst({ where: { id: ownerId, organizationId: user.organizationId, isActive: true }, include: { role: { select: { key: true } } } });
    if (!u) throw new NotFoundException('Owner not found');
    if (!(await this.access.userSeesProject({ id: u.id, organizationId: u.organizationId, roleKey: u.role.key as RoleKey }, projectId))) throw new BadRequestException(`${u.fullName} is not on this project`);
  }

  /** Validated delay fields; risks keep none of them. */
  private delayFields(kind: string, v: { delayStart?: string | null; delayEnd?: string | null; daysLost?: number | null; responsibleParty?: DelayParty | null; eotClaimed?: boolean; eotGrantedDays?: number | null }) {
    if (kind !== 'DELAY') return { delayStart: null, delayEnd: null, daysLost: null, responsibleParty: null, eotClaimed: false, eotGrantedDays: null };
    if (!v.delayStart) throw new BadRequestException('A delay needs the date work was first held up');
    const today = todayStr();
    if (v.delayStart > today) throw new BadRequestException('A delay cannot start in the future; raise it as a risk');
    if (v.delayEnd && v.delayEnd < v.delayStart) throw new BadRequestException('The delay cannot end before it started');
    if (v.delayEnd && v.delayEnd > today) throw new BadRequestException('The delay end cannot be in the future; leave it empty while work is still held up');
    return {
      delayStart: parseDate(v.delayStart),
      delayEnd: v.delayEnd ? parseDate(v.delayEnd) : null,
      daysLost: v.daysLost ?? null,
      responsibleParty: v.responsibleParty ?? null,
      eotClaimed: v.eotClaimed ?? false,
      eotGrantedDays: v.eotGrantedDays ?? null,
    };
  }

  private async findExisting(user: RequestUser, id: string | undefined) {
    if (!id) return null;
    const row = await this.prisma.risk.findFirst({ where: { id, organizationId: user.organizationId }, select: { id: true } });
    return row ? this.get(user, row.id) : null;
  }

  async create(user: RequestUser, dto: CreateRiskDto): Promise<RiskDto> {
    const existing = await this.findExisting(user, dto.id);
    if (existing) return existing;
    await this.access.assertCanRaiseRisk(user, dto.projectId);
    await this.assertActivity(dto.projectId, dto.activityId);
    await this.assertOwner(user, dto.projectId, dto.ownerId);
    const probability = dto.probability ?? (dto.kind === 'DELAY' ? 5 : 3);
    const delay = this.delayFields(dto.kind, dto);
    let id: string | null;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        const riskNo = await nextDocNo(tx, user.organizationId, 'RISK', async (prefix) =>
          (await tx.risk.findFirst({ where: { organizationId: user.organizationId, riskNo: { startsWith: prefix } }, orderBy: { riskNo: 'desc' }, select: { riskNo: true } }))?.riskNo ?? null,
        );
        // A retry of the same offline entry that waited on the lock: the first one already created it.
        if (dto.id && (await tx.risk.count({ where: { id: dto.id } }))) return null;
        const row = await tx.risk.create({
          data: {
            id: dto.id,
            organizationId: user.organizationId,
            projectId: dto.projectId,
            riskNo,
            kind: dto.kind,
            category: dto.category,
            title: dto.title,
            description: dto.description || null,
            activityId: dto.activityId || null,
            ownerId: dto.ownerId || null,
            probability,
            impact: dto.impact,
            score: riskScore(probability, dto.impact),
            mitigation: dto.mitigation || null,
            dueDate: dto.dueDate ? parseDate(dto.dueDate) : null,
            ...delay,
            raisedById: user.id,
          },
          select: { id: true },
        });
        return row.id;
      });
    } catch (e) {
      if (isUniqueViolation(e) && dto.id) {
        const winner = await this.findExisting(user, dto.id);
        if (winner) return winner;
      }
      throw e;
    }
    if (!id) return this.get(user, dto.id!);
    await this.attachments.link(user, 'riskId', id, dto.attachmentIds);
    await this.audit.log(user, 'RISK', id, 'CREATED');
    const created = await this.get(user, id);
    await this.notifyRaised(user, created);
    return created;
  }

  async update(user: RequestUser, id: string, dto: UpdateRiskDto): Promise<RiskDto> {
    const current = await this.prisma.risk.findFirst({ where: { id, ...this.access.submissionWhere(user) } });
    if (!current) throw new NotFoundException('Register entry not found');
    if (!canEditRisk(user, current)) throw new ForbiddenException('Only the person who raised it, its owner or an approver can change this entry');
    if (dto.projectId !== undefined && dto.projectId !== current.projectId) throw new BadRequestException('An entry cannot be moved to another project; raise it again there');
    if (dto.activityId !== undefined) await this.assertActivity(current.projectId, dto.activityId);
    if (dto.ownerId !== undefined) await this.assertOwner(user, current.projectId, dto.ownerId);
    const kind = dto.kind ?? current.kind;
    const data: Prisma.RiskUncheckedUpdateInput = {};
    if (dto.kind !== undefined) data.kind = dto.kind;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description || null;
    if (dto.activityId !== undefined) data.activityId = dto.activityId || null;
    if (dto.ownerId !== undefined) data.ownerId = dto.ownerId || null;
    if (dto.mitigation !== undefined) data.mitigation = dto.mitigation || null;
    if (dto.dueDate !== undefined) data.dueDate = dto.dueDate ? parseDate(dto.dueDate) : null;
    const probability = dto.probability ?? current.probability;
    const impact = dto.impact ?? current.impact;
    Object.assign(data, { probability, impact, score: riskScore(probability, impact) });

    // Closing an open delay ends it today unless an end date is given.
    const closing = dto.status === 'CLOSED' && current.status !== 'CLOSED';
    let delayEnd = dto.delayEnd !== undefined ? dto.delayEnd : dateOnly(current.delayEnd);
    if (closing && kind === 'DELAY' && !delayEnd) delayEnd = todayStr();
    Object.assign(
      data,
      this.delayFields(kind, {
        delayStart: dto.delayStart !== undefined ? dto.delayStart : dateOnly(current.delayStart),
        delayEnd,
        daysLost: dto.daysLost !== undefined ? dto.daysLost : current.daysLost,
        responsibleParty: dto.responsibleParty !== undefined ? dto.responsibleParty : current.responsibleParty,
        eotClaimed: dto.eotClaimed ?? current.eotClaimed,
        eotGrantedDays: dto.eotGrantedDays !== undefined ? dto.eotGrantedDays : current.eotGrantedDays,
      }),
    );
    if (dto.status !== undefined) {
      data.status = dto.status;
      if (closing) data.closedAt = new Date();
      if (dto.status !== 'CLOSED') data.closedAt = null;
    }
    if (dto.closureNote !== undefined) data.closureNote = dto.closureNote || null;
    await this.prisma.risk.update({ where: { id }, data });
    await this.attachments.sync(user, 'riskId', id, dto.attachmentIds);
    const action = closing ? 'CLOSED' : dto.status && dto.status !== 'CLOSED' && current.status === 'CLOSED' ? 'REOPENED' : 'UPDATED';
    await this.audit.log(user, 'RISK', id, action, closing ? (dto.closureNote ?? null) : null);
    const updated = await this.get(user, id);
    if (updated.ownerId && updated.ownerId !== current.ownerId && updated.ownerId !== user.id && updated.status !== 'CLOSED') await this.notifyOwner(user, updated);
    return updated;
  }

  /** Approvers only: for an entry raised by mistake. A resolved entry is closed, not deleted. */
  async remove(user: RequestUser, id: string) {
    const current = await this.prisma.risk.findFirst({ where: { id, ...this.access.submissionWhere(user) }, select: { id: true } });
    if (!current) throw new NotFoundException('Register entry not found');
    if (!canApprove(user.roleKey)) throw new ForbiddenException('Only an approver can delete a register entry; close it instead');
    await this.prisma.risk.delete({ where: { id } });
    await this.audit.log(user, 'RISK', id, 'DELETED');
    return { ok: true };
  }

  async history(user: RequestUser, id: string) {
    await this.get(user, id);
    return this.audit.forEntity(user.organizationId, 'RISK', id);
  }

  /* ---------- notifications ---------- */

  /** A delay, or a risk scored HIGH_RISK_SCORE or more, goes to the project's approvers and the owner. */
  private async notifyRaised(user: RequestUser, r: RiskDto) {
    if (r.kind !== 'DELAY' && r.score < HIGH_RISK_SCORE) {
      if (r.ownerId && r.ownerId !== user.id) await this.notifyOwner(user, r);
      return;
    }
    try {
      const approvers = (await this.access.approversForProject(user.organizationId, r.projectId)).map((u) => u.id);
      const userIds = [...approvers, ...(r.ownerId ? [r.ownerId] : [])].filter((u) => u !== user.id);
      const what = r.kind === 'DELAY' ? 'Delay' : 'High risk';
      await this.notifications.notify({
        organizationId: user.organizationId,
        userIds,
        type: 'RISK_RAISED',
        title: `${what} raised: ${r.title}`,
        body: `${r.riskNo} at ${r.projectName}, raised by ${r.raisedByName}${r.kind === 'DELAY' ? ` (since ${r.delayStart})` : ` (score ${r.score})`}.`,
        projectId: r.projectId,
        entityId: r.id,
        dedupeKey: `RISK_RAISED:${r.id}`,
      });
    } catch (e) {
      this.log.warn(`Risk notification failed: ${(e as Error).message}`);
    }
  }

  private async notifyOwner(user: RequestUser, r: RiskDto) {
    try {
      await this.notifications.notify({
        organizationId: user.organizationId,
        userIds: [r.ownerId!],
        type: 'RISK_RAISED',
        title: `${RISK_KIND_LABELS[r.kind]} assigned to you: ${r.title}`,
        body: `${r.riskNo} at ${r.projectName}. ${r.mitigation ? `Action: ${r.mitigation}` : 'Please follow it up.'}`,
        projectId: r.projectId,
        entityId: r.id,
        dedupeKey: `RISK_OWNER:${r.id}:${r.ownerId}`,
      });
    } catch (e) {
      this.log.warn(`Risk owner notification failed: ${(e as Error).message}`);
    }
  }
}
