import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { NotificationDto, NotificationListDto, NotificationType, PushTokenDto, SubmissionType } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { ApprovalRightsService } from '../common/approval-rights.service';
import { dateOnly, iso } from '../common/serialize';
import { ExpoPushService } from './expo-push.service';
import { dprTitle, expenseTitle, machineryTitle, measurementTitle, progressTitle } from '../common/submission-titles';
import { ListNotificationsQuery, RegisterPushTokenDto } from './notifications.dto';

export interface NotifyInput {
  organizationId: string;
  userIds: string[];
  type: NotificationType;
  title: string;
  body: string;
  projectId?: string | null;
  entityType?: SubmissionType | null;
  entityId?: string | null;
  /** Per-user idempotency key (unique with userId); users that already have it are skipped. */
  dedupeKey?: string;
}

const include = { project: { select: { name: true } } } satisfies Prisma.NotificationInclude;
type Row = Prisma.NotificationGetPayload<{ include: typeof include }>;

const SUBMISSION_LABEL: Record<SubmissionType, string> = { PROGRESS: 'Progress entry', DPR: 'DPR', MATERIAL_REQUEST: 'Material request', MACHINERY: 'Machinery log', EXPENSE: 'Site expense', MEASUREMENT: 'Measurement' };

/**
 * Creates in-app notifications and pushes them to the users' devices.
 * Called by the submission lifecycle (approve / reject / changes requested / submitted) and by the scheduled jobs.
 * Delivery failures are logged, never thrown: a push outage must not fail an approval.
 */
@Injectable()
export class NotificationsService {
  private readonly log = new Logger(NotificationsService.name);

  constructor(private prisma: PrismaService, private access: ProjectAccessService, private push: ExpoPushService, private rights: ApprovalRightsService) {}

  /* ---------- reading ---------- */

  toDto(r: Row): NotificationDto {
    return {
      id: r.id,
      type: r.type,
      title: r.title,
      body: r.body,
      projectId: r.projectId,
      projectName: r.project?.name ?? null,
      entityType: (r.entityType as SubmissionType | null) ?? null,
      entityId: r.entityId,
      readAt: iso(r.readAt),
      createdAt: iso(r.createdAt)!,
    };
  }

  async list(user: RequestUser, q: ListNotificationsQuery): Promise<NotificationListDto> {
    const where: Prisma.NotificationWhereInput = { userId: user.id, organizationId: user.organizationId };
    if (q.unreadOnly) where.readAt = null;
    const [rows, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({ where, include, orderBy: { createdAt: 'desc' }, take: q.limit ?? 50 }),
      this.prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    ]);
    return { items: rows.map((r) => this.toDto(r)), unreadCount };
  }

  async markRead(user: RequestUser, id: string): Promise<NotificationDto> {
    const row = await this.prisma.notification.findFirst({ where: { id, userId: user.id }, include });
    if (!row) throw new NotFoundException('Notification not found');
    if (row.readAt) return this.toDto(row);
    const updated = await this.prisma.notification.update({ where: { id }, data: { readAt: new Date() }, include });
    return this.toDto(updated);
  }

  async markAllRead(user: RequestUser) {
    const res = await this.prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
    return { updated: res.count };
  }

  /* ---------- push tokens ---------- */

  private tokenDto(t: { id: string; token: string; platform: PushTokenDto['platform']; deviceName: string | null; createdAt: Date; lastSeenAt: Date }): PushTokenDto {
    return { id: t.id, token: t.token, platform: t.platform, deviceName: t.deviceName, createdAt: iso(t.createdAt)!, lastSeenAt: iso(t.lastSeenAt)! };
  }

  async listTokens(user: RequestUser): Promise<PushTokenDto[]> {
    const rows = await this.prisma.pushToken.findMany({ where: { userId: user.id }, orderBy: { lastSeenAt: 'desc' } });
    return rows.map((t) => this.tokenDto(t));
  }

  /** Idempotent: the same token re-registered (or registered by another account on a shared device) moves to the caller. */
  async registerToken(user: RequestUser, dto: RegisterPushTokenDto): Promise<PushTokenDto> {
    const row = await this.prisma.pushToken.upsert({
      where: { token: dto.token },
      update: { userId: user.id, platform: dto.platform, deviceName: dto.deviceName ?? null, lastSeenAt: new Date() },
      create: { userId: user.id, token: dto.token, platform: dto.platform, deviceName: dto.deviceName ?? null },
    });
    return this.tokenDto(row);
  }

  async removeToken(user: RequestUser, token: string) {
    const res = await this.prisma.pushToken.deleteMany({ where: { token, userId: user.id } });
    return { removed: res.count };
  }

  /* ---------- creating + delivering ---------- */

  /**
   * Creates one notification per user and pushes it to all their devices.
   * With a dedupeKey, users who already hold that key are skipped (the unique index makes re-runs safe).
   */
  async notify(input: NotifyInput): Promise<{ created: number; pushed: number; skipped: number }> {
    let userIds = [...new Set(input.userIds)];
    if (input.dedupeKey && userIds.length) {
      const existing = await this.prisma.notification.findMany({ where: { dedupeKey: input.dedupeKey, userId: { in: userIds } }, select: { userId: true } });
      const done = new Set(existing.map((e) => e.userId));
      userIds = userIds.filter((id) => !done.has(id));
    }
    const skipped = new Set(input.userIds).size - userIds.length;
    if (userIds.length === 0) return { created: 0, pushed: 0, skipped };
    const data = userIds.map((userId) => ({
      organizationId: input.organizationId,
      userId,
      type: input.type,
      title: input.title,
      body: input.body,
      projectId: input.projectId ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      dedupeKey: input.dedupeKey ?? null,
    }));
    const rows = await this.prisma.notification.createManyAndReturn({ data, skipDuplicates: true });
    const pushed = await this.deliverPush(rows);
    return { created: rows.length, pushed, skipped: skipped + (userIds.length - rows.length) };
  }

  private async deliverPush(rows: { id: string; userId: string; title: string; body: string; type: NotificationType; projectId: string | null; entityType: string | null; entityId: string | null }[]): Promise<number> {
    try {
      const tokens = await this.prisma.pushToken.findMany({ where: { userId: { in: rows.map((r) => r.userId) } } });
      if (tokens.length === 0) return 0;
      const byUser = new Map<string, string[]>();
      for (const t of tokens) byUser.set(t.userId, [...(byUser.get(t.userId) ?? []), t.token]);
      const messages = rows.flatMap((r) =>
        (byUser.get(r.userId) ?? []).map((to) => ({
          to,
          title: r.title,
          body: r.body,
          data: { notificationId: r.id, type: r.type, projectId: r.projectId, entityType: r.entityType, entityId: r.entityId },
        })),
      );
      const { sent, invalidTokens } = await this.push.send(messages);
      if (invalidTokens.length) await this.prisma.pushToken.deleteMany({ where: { token: { in: invalidTokens } } });
      if (sent > 0) {
        const pushedIds = rows.filter((r) => byUser.has(r.userId)).map((r) => r.id);
        await this.prisma.notification.updateMany({ where: { id: { in: pushedIds } }, data: { pushedAt: new Date() } });
      }
      return sent;
    } catch (e) {
      this.log.warn(`Push delivery failed: ${(e as Error).message}`);
      return 0;
    }
  }

  /* ---------- submission events (called by SubmissionLifecycleService) ---------- */

  /** Short human description of a submission, e.g. "GSB laying: 2400 Cum on 13 Oct 2026". */
  async describeSubmission(type: SubmissionType, id: string): Promise<{ title: string; projectId: string; projectName: string; submittedById: string } | null> {
    switch (type) {
      case 'PROGRESS': {
        const p = await this.prisma.progressEntry.findUnique({ where: { id }, include: { activity: { select: { name: true, unit: true } }, project: { select: { name: true } } } });
        return p ? { title: progressTitle(p.activity.name, p.quantity.toString(), p.activity.unit, p.date), projectId: p.projectId, projectName: p.project.name, submittedById: p.submittedById } : null;
      }
      case 'DPR': {
        const d = await this.prisma.dailyReport.findUnique({ where: { id }, include: { project: { select: { name: true } } } });
        return d ? { title: dprTitle(d.date), projectId: d.projectId, projectName: d.project.name, submittedById: d.submittedById } : null;
      }
      case 'MATERIAL_REQUEST': {
        const m = await this.prisma.materialRequest.findUnique({ where: { id }, include: { project: { select: { name: true } }, items: { select: { id: true } } } });
        return m ? { title: `${m.requestNo}: ${m.items.length} item(s)`, projectId: m.projectId, projectName: m.project.name, submittedById: m.submittedById } : null;
      }
      case 'MACHINERY': {
        const l = await this.prisma.machineryLog.findUnique({ where: { id }, include: { project: { select: { name: true } }, equipment: { select: { code: true, name: true } } } });
        return l
          ? { title: machineryTitle(l.equipment.code, l.equipment.name, l.hoursWorked.toString(), l.breakdownHours.toString(), l.date), projectId: l.projectId, projectName: l.project.name, submittedById: l.submittedById }
          : null;
      }
      case 'EXPENSE': {
        const x = await this.prisma.expense.findUnique({ where: { id }, include: { project: { select: { name: true } } } });
        return x ? { title: expenseTitle(x.expenseNo, x.totalAmount.toFixed(2), x.description), projectId: x.projectId, projectName: x.project.name, submittedById: x.submittedById } : null;
      }
      case 'MEASUREMENT': {
        const m = await this.prisma.measurementSheet.findUnique({ where: { id }, include: { project: { select: { name: true } }, boqItem: { select: { itemNo: true, unit: true } } } });
        return m ? { title: measurementTitle(m.mbNo, m.boqItem.itemNo, m.totalQty.toString(), m.boqItem.unit, m.location), projectId: m.projectId, projectName: m.project.name, submittedById: m.submittedById } : null;
      }
    }
  }

  /** Tell the project's approvers that something new is waiting for them. */
  async onSubmitted(actor: RequestUser, type: SubmissionType, id: string) {
    try {
      const s = await this.describeSubmission(type, id);
      if (!s) return;
      const approvers = await this.access.approversForProject(actor.organizationId, s.projectId, type, await this.rights.amountOf(type, id));
      await this.notify({
        organizationId: actor.organizationId,
        userIds: approvers.map((a) => a.id).filter((uid) => uid !== actor.id),
        type: 'SUBMISSION_SUBMITTED',
        title: `${SUBMISSION_LABEL[type]} awaiting your approval`,
        body: `${actor.fullName} submitted ${s.title} on ${s.projectName}.`,
        projectId: s.projectId,
        entityType: type,
        entityId: id,
      });
    } catch (e) {
      this.log.warn(`onSubmitted(${type}, ${id}) failed: ${(e as Error).message}`);
    }
  }

  /** Tell the author how the review went. */
  async onReviewed(actor: RequestUser, type: SubmissionType, id: string, status: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED', note?: string | null) {
    try {
      const s = await this.describeSubmission(type, id);
      if (!s || s.submittedById === actor.id) return;
      const map: Record<typeof status, { type: NotificationType; verb: string }> = {
        APPROVED: { type: 'SUBMISSION_APPROVED', verb: 'approved' },
        REJECTED: { type: 'SUBMISSION_REJECTED', verb: 'rejected' },
        CHANGES_REQUESTED: { type: 'SUBMISSION_CHANGES_REQUESTED', verb: 'requested changes to' },
      };
      const m = map[status];
      await this.notify({
        organizationId: actor.organizationId,
        userIds: [s.submittedById],
        type: m.type,
        title: `${SUBMISSION_LABEL[type]} ${status === 'CHANGES_REQUESTED' ? 'needs changes' : m.verb}`,
        body: `${actor.fullName} ${m.verb} ${s.title} on ${s.projectName}.${note ? ` Note: ${note}` : ''}`,
        projectId: s.projectId,
        entityType: type,
        entityId: id,
      });
    } catch (e) {
      this.log.warn(`onReviewed(${type}, ${id}) failed: ${(e as Error).message}`);
    }
  }
}
