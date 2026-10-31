import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DEFAULT_NOTICE_DAYS, DELAY_PARTY_LABELS, PAYMENT_ROLES, needsNotice, subBillLabel, type RoleKey, LEGACY_NOTIFICATION_TYPES, NOTIFICATION_TABS, NOTIFICATION_TAB_OF, NOTIFICATION_TYPES_VERSION, notificationTypesFor, notificationTypesIn, type NotificationDto, type NotificationListDto, type NotificationTab, type NotificationType, type PushTokenDto, type SubmissionType } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { ApprovalRightsService } from '../common/approval-rights.service';
import { dateOnly, iso } from '../common/serialize';
import { ExpoPushService } from './expo-push.service';
import { dprTitle, expenseTitle, machineryTitle, measurementTitle, progressTitle, billTitle, poTitle, vendorBillTitle, woTitle, subBillTitle, inspectionTitle, payRequestTitle, PAY_REQUEST_TITLE, inr, titleDate } from '../common/submission-titles';
import { ListNotificationsQuery, RegisterPushTokenDto } from './notifications.dto';
import { MessagingService, type OutgoingMessage } from '../messaging/messaging.service';
import { EmailService, escapeHtml } from './email.service';
import { emailButton, emailLayout } from './email-layout';
import { classifyRemark, noticeClock } from '../hindrance/hindrance-rules';
import { todayIn } from './time';

export interface NotifyInput {
  organizationId: string;
  userIds: string[];
  type: NotificationType;
  title: string;
  body: string;
  projectId?: string | null;
  entityType?: NotificationDto['entityType'];
  entityId?: string | null;
  /** Per-user idempotency key (unique with userId); users that already have it are skipped. */
  dedupeKey?: string;
  /** Also sent on WhatsApp / SMS to the users who switched those on */
  message?: OutgoingMessage;
  /**
   * Also emailed to the users who keep email alerts on (the default): an action that waits on them, with a button
   * to the page that does it (e2e review, fix 2). `href` is a path in the web app.
   */
  email?: { href: string; cta: string };
}

/** A hand-off to the next role in the chain (e2e review, fix 2): who, and what they are told. */
export interface HandoffInput {
  organizationId: string;
  projectId: string;
  /** The roles that act next; on the project first, company-wide holders only when nobody on it has the role */
  roles: RoleKey[];
  /** People told whatever their role (the requester of the material, say) */
  alsoUserIds?: (string | null | undefined)[];
  /** Never told: the person who did the step, who knows already */
  exceptUserIds?: (string | null | undefined)[];
  title: string;
  body: string;
  entityType?: NotificationDto['entityType'];
  entityId?: string | null;
  dedupeKey?: string;
  email?: { href: string; cta: string };
}

const include = { project: { select: { name: true } } } satisfies Prisma.NotificationInclude;
type Row = Prisma.NotificationGetPayload<{ include: typeof include }>;

const SUBMISSION_LABEL: Record<SubmissionType, string> = { PROGRESS: 'Progress entry', DPR: 'DPR', MATERIAL_REQUEST: 'Material request', MACHINERY: 'Machinery log', EXPENSE: 'Site expense', MEASUREMENT: 'Measurement', BILL: 'RA bill', PURCHASE_ORDER: 'Purchase order', VENDOR_BILL: 'Vendor bill', WORK_ORDER: 'Work order', SUBCONTRACT_BILL: 'Subcontractor bill', INSPECTION: 'Inspection', PAYMENT_REQUEST: 'Payment request' };

/**
 * Creates in-app notifications and pushes them to the users' devices.
 * Called by the submission lifecycle (approve / reject / changes requested / submitted) and by the scheduled jobs.
 * Delivery failures are logged, never thrown: a push outage must not fail an approval.
 */
@Injectable()
export class NotificationsService {
  private readonly log = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private push: ExpoPushService,
    private rights: ApprovalRightsService,
    private messaging: MessagingService,
    private mail: EmailService,
  ) {}

  /* ---------- reading ---------- */

  toDto(r: Row): NotificationDto {
    return {
      id: r.id,
      type: r.type,
      title: r.title,
      body: r.body,
      projectId: r.projectId,
      projectName: r.project?.name ?? null,
      entityType: (r.entityType as NotificationDto['entityType']) ?? null,
      entityId: r.entityId,
      readAt: iso(r.readAt),
      createdAt: iso(r.createdAt)!,
    };
  }

  async list(user: RequestUser, q: ListNotificationsQuery): Promise<NotificationListDto> {
    // Older phone builds crash on a type they have no icon for, so they get only the types they know.
    const version = q.typesVersion ?? (q.allTypes ? 1 : 0);
    const types = version >= NOTIFICATION_TYPES_VERSION ? {} : { type: { in: version === 0 ? LEGACY_NOTIFICATION_TYPES : notificationTypesFor(version) } };
    const where: Prisma.NotificationWhereInput = { userId: user.id, organizationId: user.organizationId, ...types };
    if (q.tab) where.AND = [{ type: { in: notificationTypesIn(q.tab) } }];
    if (q.unreadOnly) where.readAt = null;
    const [rows, unread] = await Promise.all([
      this.prisma.notification.findMany({ where, include, orderBy: { createdAt: 'desc' }, take: q.limit ?? 50 }),
      this.prisma.notification.groupBy({ by: ['type'], where: { userId: user.id, organizationId: user.organizationId, readAt: null, ...types }, _count: { _all: true } }),
    ]);
    const unreadByTab = Object.fromEntries(NOTIFICATION_TABS.map((t) => [t, 0])) as Record<NotificationTab, number>;
    let unreadCount = 0;
    for (const g of unread) {
      unreadCount += g._count._all;
      unreadByTab[NOTIFICATION_TAB_OF[g.type as NotificationType]] += g._count._all;
    }
    return { items: rows.map((r) => this.toDto(r)), unreadCount, unreadByTab };
  }

  async markRead(user: RequestUser, id: string): Promise<NotificationDto> {
    const row = await this.prisma.notification.findFirst({ where: { id, userId: user.id }, include });
    if (!row) throw new NotFoundException('Notification not found');
    if (row.readAt) return this.toDto(row);
    const updated = await this.prisma.notification.update({ where: { id }, data: { readAt: new Date() }, include });
    return this.toDto(updated);
  }

  async markAllRead(user: RequestUser, tab?: NotificationTab) {
    const res = await this.prisma.notification.updateMany({ where: { userId: user.id, readAt: null, ...(tab ? { type: { in: notificationTypesIn(tab) } } : {}) }, data: { readAt: new Date() } });
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
  async notify(input: NotifyInput): Promise<{ created: number; pushed: number; skipped: number; messaged: number }> {
    let userIds = [...new Set(input.userIds)];
    if (input.dedupeKey && userIds.length) {
      const existing = await this.prisma.notification.findMany({ where: { dedupeKey: input.dedupeKey, userId: { in: userIds } }, select: { userId: true } });
      const done = new Set(existing.map((e) => e.userId));
      userIds = userIds.filter((id) => !done.has(id));
    }
    const skipped = new Set(input.userIds).size - userIds.length;
    if (userIds.length === 0) return { created: 0, pushed: 0, skipped, messaged: 0 };
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
    const messaged = input.message ? await this.messaging.forNotifications(rows, input.message) : 0;
    if (input.email) await this.deliverEmail(input, rows.map((r) => r.userId));
    return { created: rows.length, pushed, skipped: skipped + (userIds.length - rows.length), messaged };
  }

  /** The notice as an email to those of `userIds` who keep email alerts on. Failures are logged, never thrown. */
  private async deliverEmail(input: NotifyInput, userIds: string[]) {
    try {
      if (!userIds.length || !input.email || !this.mail.enabled) return;
      const [users, org] = await Promise.all([
        this.prisma.user.findMany({ where: { id: { in: userIds }, isActive: true, emailAlerts: true }, select: { email: true, fullName: true } }),
        this.prisma.organization.findUnique({ where: { id: input.organizationId }, select: { name: true } }),
      ]);
      const href = this.messaging.webUrl(input.email.href);
      for (const u of users) {
        if (!u.email) continue;
        const body = `<p style="margin:0 0 8px">Hello ${escapeHtml(u.fullName.split(' ')[0])},</p>
          <p style="margin:0 0 4px;font-weight:700">${escapeHtml(input.title)}</p>
          <p style="margin:0">${escapeHtml(input.body)}</p>
          ${href.startsWith('http') ? emailButton(href, input.email.cta) : ''}`;
        await this.mail.send({
          to: u.email,
          subject: input.title,
          html: emailLayout({ preheader: input.body, body, orgName: org?.name, footnote: 'You get this because it waits on you. Switch email alerts off from Notifications, Alerts.' }),
          text: `${input.title}\n\n${input.body}${href.startsWith('http') ? `\n\n${input.email.cta}: ${href}` : ''}`,
        });
      }
    } catch (e) {
      this.log.warn(`Email delivery failed: ${(e as Error).message}`);
    }
  }

  /**
   * Of the users given, those on the project (its manager or a member); all of them when none is. Approval asks and
   * hand-offs go to the people on the project, so company-wide roles (the MD, admin) hear only of what nobody on the
   * project can do, such as an entry above the PM's limit; the rest reaches them in the daily digest.
   */
  async onProjectFirst<T extends { id: string }>(users: T[], projectId: string): Promise<T[]> {
    if (users.length < 2) return users;
    const team = new Set(await this.access.projectPeople(projectId));
    const on = users.filter((u) => team.has(u.id));
    return on.length ? on : users;
  }

  /** Tell the next role in the chain that a step waits on them (e2e review, fix 2), in the app and by email. */
  async handoff(h: HandoffInput) {
    try {
      const holders = h.roles.length ? await this.onProjectFirst(await this.access.usersWithRoles(h.organizationId, h.projectId, h.roles), h.projectId) : [];
      const except = new Set(h.exceptUserIds?.filter(Boolean));
      const userIds = [...holders.map((u) => u.id), ...(h.alsoUserIds ?? []).filter((u): u is string => !!u)].filter((u) => !except.has(u));
      if (!userIds.length) return { created: 0, pushed: 0, skipped: 0, messaged: 0 };
      return await this.notify({
        organizationId: h.organizationId,
        userIds,
        type: 'HANDOFF',
        title: h.title,
        body: h.body,
        projectId: h.projectId,
        entityType: h.entityType ?? null,
        entityId: h.entityId ?? null,
        dedupeKey: h.dedupeKey,
        email: h.email,
      });
    } catch (e) {
      this.log.warn(`handoff(${h.title}) failed: ${(e as Error).message}`);
      return { created: 0, pushed: 0, skipped: 0, messaged: 0 };
    }
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
      case 'BILL': {
        const b = await this.prisma.raBill.findUnique({ where: { id }, include: { project: { select: { name: true } } } });
        return b ? { title: billTitle(b.billNo, b.isFinal, b.grossAmount.toFixed(2), b.omYear !== null), projectId: b.projectId, projectName: b.project.name, submittedById: b.submittedById } : null;
      }
      case 'PURCHASE_ORDER': {
        const o = await this.prisma.purchaseOrder.findUnique({ where: { id }, include: { project: { select: { name: true } }, vendor: { select: { name: true } } } });
        return o ? { title: poTitle(o.poNo, o.total.toFixed(2), o.vendor.name), projectId: o.projectId, projectName: o.project.name, submittedById: o.submittedById } : null;
      }
      case 'VENDOR_BILL': {
        const v = await this.prisma.vendorBill.findUnique({ where: { id }, include: { project: { select: { name: true } }, vendor: { select: { name: true } } } });
        return v ? { title: vendorBillTitle(v.billNo, v.invoiceNo, v.vendor.name, v.total.toFixed(2)), projectId: v.projectId, projectName: v.project.name, submittedById: v.submittedById } : null;
      }
      case 'WORK_ORDER': {
        const w = await this.prisma.workOrder.findUnique({ where: { id }, include: { project: { select: { name: true } }, vendor: { select: { name: true } } } });
        return w ? { title: woTitle(w.woNo, w.title, w.value.toFixed(2), w.vendor.name), projectId: w.projectId, projectName: w.project.name, submittedById: w.submittedById } : null;
      }
      case 'SUBCONTRACT_BILL': {
        const b = await this.prisma.subcontractBill.findUnique({ where: { id }, include: { project: { select: { name: true } }, workOrder: { select: { woNo: true, vendor: { select: { name: true } } } } } });
        return b
          ? { title: subBillTitle(b.workOrder.woNo, b.billNo, b.isFinal, b.workOrder.vendor.name, b.grossAmount.toFixed(2)), projectId: b.projectId, projectName: b.project.name, submittedById: b.submittedById }
          : null;
      }
      case 'INSPECTION': {
        const i = await this.prisma.inspection.findUnique({ where: { id }, include: { project: { select: { name: true } }, activity: { select: { name: true } } } });
        return i ? { title: inspectionTitle(i.inspectionNo, i.activity.name, i.location), projectId: i.projectId, projectName: i.project.name, submittedById: i.submittedById } : null;
      }
      case 'PAYMENT_REQUEST': {
        const r = await this.prisma.paymentRequest.findUnique({ where: { id }, include: { project: { select: { name: true } }, ...PAY_REQUEST_TITLE } });
        if (!r) return null;
        return { title: payRequestTitle(r), projectId: r.projectId, projectName: r.project.name, submittedById: r.submittedById };
      }
    }
  }

  /** An approved payment request (v5 item 90) is money to release: tell the project's payers (admin, management, accounts). */
  private async onPaymentApproved(actor: RequestUser, id: string, s: { title: string; projectId: string; projectName: string; submittedById: string }) {
    // The approver and the one who asked hear of it already.
    const payers = (await this.access.usersWithRoles(actor.organizationId, s.projectId, PAYMENT_ROLES)).filter((u) => u.id !== actor.id && u.id !== s.submittedById);
    if (!payers.length) return;
    await this.notify({
      organizationId: actor.organizationId,
      userIds: payers.map((u) => u.id),
      type: 'BILLS_DUE',
      title: 'Payment request approved: ready to pay',
      body: `${actor.fullName} approved ${s.title} on ${s.projectName}.`,
      projectId: s.projectId,
      entityType: 'PAYMENT_REQUEST',
      entityId: id,
    });
  }

  /** "Progress entry (GSB laying: 2400 Cum on 13 Oct 2026)", "DPR for 13 Oct 2026": what a WhatsApp / SMS names. */
  private subject(type: SubmissionType, title: string) {
    return title.startsWith(SUBMISSION_LABEL[type]) ? title : `${SUBMISSION_LABEL[type]} (${title})`;
  }

  /** Tell the project's approvers that something new is waiting for them. */
  async onSubmitted(actor: RequestUser, type: SubmissionType, id: string) {
    try {
      const s = await this.describeSubmission(type, id);
      if (!s) return;
      const approvers = await this.onProjectFirst(
        (await this.access.approversForProject(actor.organizationId, s.projectId, type, await this.rights.amountOf(type, id))).filter((a) => a.id !== actor.id),
        s.projectId,
      );
      await this.notify({
        organizationId: actor.organizationId,
        userIds: approvers.map((a) => a.id),
        type: 'SUBMISSION_SUBMITTED',
        title: type === 'INSPECTION' ? 'Inspection requested' : `${SUBMISSION_LABEL[type]} awaiting your approval`,
        body: `${actor.fullName} ${type === 'INSPECTION' ? 'requested' : 'submitted'} ${s.title} on ${s.projectName}.`,
        projectId: s.projectId,
        entityType: type,
        entityId: id,
        message: { template: 'APPROVAL_REQUEST', params: [this.subject(type, s.title), s.projectName, actor.fullName, this.messaging.webUrl(`/notifications?type=${type}&id=${id}`)] },
      });
      // The client's engineer and consultant on the project may attend: it shows in their portal.
      if (type === 'INSPECTION') {
        const guests = await this.access.projectGuests(actor.organizationId, s.projectId);
        if (guests.length)
          await this.notify({
            organizationId: actor.organizationId,
            userIds: guests.map((g) => g.id),
            type: 'PORTAL',
            title: `Inspection requested: ${s.title}`,
            body: `${actor.fullName} requested ${s.title} on ${s.projectName}. Attend it and record your remarks in the client portal.`,
            projectId: s.projectId,
            entityId: id,
          });
      }
      if (type === 'DPR') await this.onDprHindrance(actor, id);
    } catch (e) {
      this.log.warn(`onSubmitted(${type}, ${id}) failed: ${(e as Error).message}`);
    }
  }

  /** One approval level done (v5 item 94): the next level's approvers on the project are asked, like a new submission. */
  async onLevelApproved(actor: RequestUser, type: SubmissionType, id: string, nextLevel: number, levels: number) {
    try {
      const s = await this.describeSubmission(type, id);
      if (!s) return;
      const approvers = await this.onProjectFirst(
        (await this.access.approversForProject(actor.organizationId, s.projectId, type, await this.rights.amountOf(type, id), nextLevel)).filter((a) => a.id !== actor.id),
        s.projectId,
      );
      await this.notify({
        organizationId: actor.organizationId,
        userIds: approvers.map((a) => a.id),
        type: 'SUBMISSION_SUBMITTED',
        title: `${SUBMISSION_LABEL[type]} awaiting your approval (level ${nextLevel} of ${levels})`,
        body: `${actor.fullName} approved ${s.title} on ${s.projectName} at level ${nextLevel - 1}; it needs your approval next.`,
        projectId: s.projectId,
        entityType: type,
        entityId: id,
        message: { template: 'APPROVAL_REQUEST', params: [this.subject(type, s.title), s.projectName, actor.fullName, this.messaging.webUrl(`/notifications?type=${type}&id=${id}`)] },
      });
    } catch (e) {
      this.log.warn(`onLevelApproved(${type}, ${id}) failed: ${(e as Error).message}`);
    }
  }

  /**
   * An entry waited too long at its level (v5 item 94): remind its approvers, or tell the roles it escalated to that it
   * is in their queue now. `hours` is how long it has waited.
   */
  async onWaiting(organizationId: string, type: SubmissionType, id: string, userIds: string[], hours: number, escalated: boolean) {
    try {
      const s = await this.describeSubmission(type, id);
      if (!s || !userIds.length) return { created: 0, pushed: 0, messaged: 0 };
      const by = await this.prisma.user.findUnique({ where: { id: s.submittedById }, select: { fullName: true } });
      const waited = hours >= 48 ? `${Math.floor(hours / 24)} days` : `${Math.floor(hours)} hours`;
      return await this.notify({
        organizationId,
        userIds: userIds.filter((u) => u !== s.submittedById),
        type: 'SUBMISSION_SUBMITTED',
        title: escalated ? `${SUBMISSION_LABEL[type]} escalated to you after ${waited}` : `${SUBMISSION_LABEL[type]} waiting ${waited} for approval`,
        body: escalated
          ? `${s.title} on ${s.projectName} has waited ${waited} without a decision, so you can decide it too.`
          : `${s.title} on ${s.projectName} has waited ${waited} for your decision.`,
        projectId: s.projectId,
        entityType: type,
        entityId: id,
        // An entry that has waited past its level's hours is worth an email (e2e review, fix 2), not just the bell.
        email: { href: `/notifications?type=${type}&id=${id}`, cta: 'Decide it' },
        message: { template: 'APPROVAL_REQUEST', params: [this.subject(type, s.title), s.projectName, by?.fullName ?? '-', this.messaging.webUrl(`/notifications?type=${type}&id=${id}`)] },
      });
    } catch (e) {
      this.log.warn(`onWaiting(${type}, ${id}) failed: ${(e as Error).message}`);
      return { created: 0, pushed: 0, messaged: 0 };
    }
  }

  /** Tell the author how the review went. */
  /** An approved purchase or work order goes to the supplier's portal logins to accept (v6 item 105). */
  private async onOrderApproved(actor: RequestUser, type: 'PURCHASE_ORDER' | 'WORK_ORDER', id: string, projectName: string) {
    const order =
      type === 'PURCHASE_ORDER'
        ? await this.prisma.purchaseOrder.findUnique({ where: { id }, select: { vendorId: true, poNo: true } }).then((o) => o && { vendorId: o.vendorId, no: o.poNo })
        : await this.prisma.workOrder.findUnique({ where: { id }, select: { vendorId: true, woNo: true, title: true } }).then((o) => o && { vendorId: o.vendorId, no: `${o.woNo} (${o.title})` });
    if (!order) return;
    await this.notifyVendor(actor.organizationId, order.vendorId, {
      title: `New ${type === 'PURCHASE_ORDER' ? 'purchase' : 'work'} order ${order.no}`,
      body: `${projectName}: open it to read the terms and accept it.`,
      entityType: type === 'PURCHASE_ORDER' ? 'PORTAL_PO' : 'PORTAL_WO',
      entityId: id,
    });
  }

  /** A supplier's portal logins (v6 item 105) are told what concerns their vendor: an order to accept, an enquiry, a payment. */
  async notifyVendor(organizationId: string, vendorId: string, n: Omit<NotifyInput, 'organizationId' | 'userIds' | 'type'>) {
    const logins = await this.prisma.user.findMany({ where: { organizationId, vendorId, isActive: true }, select: { id: true } });
    if (logins.length) await this.notify({ organizationId, userIds: logins.map((u) => u.id), type: 'SUPPLIER', ...n });
  }

  async onReviewed(actor: RequestUser, type: SubmissionType, id: string, status: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED', note?: string | null) {
    try {
      const s = await this.describeSubmission(type, id);
      if (s && type === 'PAYMENT_REQUEST' && status === 'APPROVED') await this.onPaymentApproved(actor, id, s);
      if (s && status === 'APPROVED' && (type === 'PURCHASE_ORDER' || type === 'WORK_ORDER')) await this.onOrderApproved(actor, type, id, s.projectName);
      if (s && status === 'APPROVED' && type === 'MATERIAL_REQUEST') await this.onRequestApproved(actor, id, s);
      if (s && status === 'APPROVED' && type === 'PURCHASE_ORDER') await this.onPoApprovedForStore(actor, id, s);
      if (!s || s.submittedById === actor.id) return;
      const map: Record<typeof status, { type: NotificationType; verb: string }> = {
        APPROVED: { type: 'SUBMISSION_APPROVED', verb: 'approved' },
        REJECTED: { type: 'SUBMISSION_REJECTED', verb: 'rejected' },
        CHANGES_REQUESTED: { type: 'SUBMISSION_CHANGES_REQUESTED', verb: 'requested changes to' },
      };
      // An inspection is passed, failed or sent back for re-inspection rather than approved or rejected.
      if (type === 'INSPECTION') map[status].verb = { APPROVED: 'passed', REJECTED: 'failed', CHANGES_REQUESTED: 'asked for re-inspection of' }[status];
      const m = map[status];
      await this.notify({
        organizationId: actor.organizationId,
        userIds: [s.submittedById],
        type: m.type,
        title: `${SUBMISSION_LABEL[type]} ${status === 'CHANGES_REQUESTED' ? (type === 'INSPECTION' ? 'to be re-inspected' : 'needs changes') : m.verb}`,
        body: `${actor.fullName} ${m.verb} ${s.title} on ${s.projectName}.${note ? ` Note: ${note}` : ''}`,
        projectId: s.projectId,
        entityType: type,
        entityId: id,
        // Send-backs go out by email, WhatsApp and SMS too, with the reason; approvals stay in-app and push.
        email: status === 'APPROVED' ? undefined : { href: `/notifications?type=${type}&id=${id}`, cta: status === 'REJECTED' ? 'Open it' : 'Make the changes' },
        message:
          status === 'APPROVED'
            ? undefined
            : {
                template: 'SENT_BACK',
                params: [
                  this.subject(type, s.title),
                  s.projectName,
                  type === 'INSPECTION' ? (status === 'REJECTED' ? 'failed' : 'sent back for re-inspection') : status === 'REJECTED' ? 'rejected' : 'sent back for changes',
                  actor.fullName,
                  note || 'none',
                  this.messaging.webUrl(`/notifications?type=${type}&id=${id}`),
                ],
              },
      });
    } catch (e) {
      this.log.warn(`onReviewed(${type}, ${id}) failed: ${(e as Error).message}`);
    }
  }

  /* ---------- hand-offs to the next role (e2e review, fix 2) ---------- */

  /** An approved material request is purchase's to order: the procurement managers on the project, else the company's. */
  private async onRequestApproved(actor: RequestUser, id: string, s: { title: string; projectId: string; projectName: string; submittedById: string }) {
    const mr = await this.prisma.materialRequest.findUnique({ where: { id }, select: { requestNo: true, requiredDate: true, items: { select: { itemName: true, quantity: true, unit: true } } } });
    if (!mr) return;
    const items = mr.items.slice(0, 3).map((i) => `${i.itemName} ${i.quantity.toString()} ${i.unit}`).join(', ') + (mr.items.length > 3 ? ` and ${mr.items.length - 3} more` : '');
    await this.handoff({
      organizationId: actor.organizationId,
      projectId: s.projectId,
      roles: ['PROCUREMENT_MANAGER'],
      exceptUserIds: [actor.id],
      title: `To order: ${mr.requestNo}`,
      body: `${actor.fullName} approved ${mr.requestNo} on ${s.projectName}: ${items}, needed by ${titleDate(mr.requiredDate)}. Send enquiries or raise the order.`,
      entityType: 'MATERIAL_REQUEST',
      entityId: id,
      dedupeKey: `HANDOFF_TO_ORDER:${id}`,
      email: { href: `/requests-to-order/${id}`, cta: 'Open in Requests to order' },
    });
  }

  /** An approved PO is a delivery for the project's store to expect. */
  private async onPoApprovedForStore(actor: RequestUser, id: string, s: { title: string; projectId: string; projectName: string }) {
    const po = await this.prisma.purchaseOrder.findUnique({ where: { id }, select: { poNo: true, deliveryBy: true, vendor: { select: { name: true } }, lines: { select: { itemName: true } } } });
    if (!po) return;
    const what = po.lines.slice(0, 3).map((l) => l.itemName).join(', ') + (po.lines.length > 3 ? ` and ${po.lines.length - 3} more` : '');
    await this.handoff({
      organizationId: actor.organizationId,
      projectId: s.projectId,
      roles: ['STORE_MANAGER'],
      exceptUserIds: [actor.id],
      title: `Delivery to expect: ${po.poNo}`,
      body: `${po.vendor.name} is to deliver ${what} to ${s.projectName}${po.deliveryBy ? ` by ${titleDate(po.deliveryBy)}` : ''}. Receive it against ${po.poNo} when it arrives.`,
      entityType: 'PURCHASE_ORDER',
      entityId: id,
      dedupeKey: `HANDOFF_DELIVERY:${id}`,
      email: { href: `/purchase-orders/${id}`, cta: 'Open the order' },
    });
  }

  /**
   * Goods received (a GRN): the person who asked for them, quality to test the lot, accounts to match the supplier's
   * bill. Called by StockService after the receipt is saved.
   */
  async onGoodsReceived(actor: RequestUser, entryId: string) {
    try {
      const e = await this.prisma.stockEntry.findUnique({
        where: { id: entryId },
        select: {
          entryNo: true,
          projectId: true,
          supplier: true,
          project: { select: { name: true } },
          materialRequest: { select: { requestNo: true, submittedById: true } },
          purchaseOrder: { select: { poNo: true, materialRequest: { select: { submittedById: true } } } },
          lines: { select: { quantity: true, item: { select: { name: true, unit: true } } } },
        },
      });
      if (!e) return;
      const what = e.lines.slice(0, 3).map((t) => `${t.item.name} ${t.quantity.toString()} ${t.item.unit}`).join(', ') + (e.lines.length > 3 ? ` and ${e.lines.length - 3} more` : '');
      const against = e.purchaseOrder?.poNo ?? e.materialRequest?.requestNo;
      const requesters = [e.materialRequest?.submittedById, e.purchaseOrder?.materialRequest?.submittedById];
      const base = { organizationId: actor.organizationId, projectId: e.projectId, exceptUserIds: [actor.id], entityType: 'GRN' as const, entityId: entryId };
      const line = `${e.entryNo}${against ? ` against ${against}` : ''} on ${e.project.name}: ${what}${e.supplier ? ` from ${e.supplier}` : ''}.`;
      await this.handoff({ ...base, roles: [], alsoUserIds: requesters, title: `Your material arrived: ${e.entryNo}`, body: `${actor.fullName} received ${line}`, dedupeKey: `HANDOFF_GRN_REQ:${entryId}` });
      await this.handoff({
        ...base,
        roles: ['QA_QC_ENGINEER'],
        exceptUserIds: [actor.id, ...requesters],
        entityType: 'GRN_CHECK',
        title: `Material to check: ${e.entryNo}`,
        body: `${actor.fullName} received ${line} Check the lot, and test it, before it goes into the work.`,
        dedupeKey: `HANDOFF_GRN_QA:${entryId}`,
        email: { href: `/inspections?tab=grns`, cta: 'Check the material' },
      });
      if (e.purchaseOrder)
        await this.handoff({
          ...base,
          roles: ['ACCOUNTS_MANAGER'],
          exceptUserIds: [actor.id, ...requesters],
          entityType: 'GRN_TO_BILL',
          title: `Ready to match: ${e.entryNo}`,
          body: `${actor.fullName} received ${line} Match the supplier's bill against ${e.purchaseOrder.poNo} and this receipt.`,
          dedupeKey: `HANDOFF_GRN_AC:${entryId}`,
          email: { href: `/vendor-bills?tab=to-bill`, cta: 'Record the bill' },
        });
    } catch (err) {
      this.log.warn(`onGoodsReceived(${entryId}) failed: ${(err as Error).message}`);
    }
  }

  /**
   * Material rejected at QA/QC or sent back to the supplier: accounts raise the debit note that takes it off the bill,
   * and purchase hears of it to settle with the vendor. Called by StockService after the check or the return is saved.
   */
  async onDebitToRaise(actor: RequestUser, entryId: string) {
    try {
      const e = await this.prisma.stockEntry.findUnique({
        where: { id: entryId },
        select: {
          entryNo: true,
          type: true,
          projectId: true,
          supplier: true,
          qcNote: true,
          project: { select: { name: true } },
          purchaseOrder: { select: { poNo: true, vendor: { select: { name: true } } } },
          lines: { select: { quantity: true, rejectedQty: true, item: { select: { name: true, unit: true } } } },
        },
      });
      if (!e) return;
      const returned = e.type === 'RETURN_TO_VENDOR';
      const lines = e.lines
        .map((l) => ({ name: l.item.name, unit: l.item.unit, qty: returned ? l.quantity.abs() : (l.rejectedQty ?? new Prisma.Decimal(0)) }))
        .filter((l) => l.qty.gt(0));
      if (!lines.length) return;
      const what = lines.slice(0, 3).map((l) => `${l.name} ${l.qty.toString()} ${l.unit}`).join(', ') + (lines.length > 3 ? ` and ${lines.length - 3} more` : '');
      const vendor = e.purchaseOrder?.vendor.name ?? e.supplier ?? 'the supplier';
      await this.handoff({
        organizationId: actor.organizationId,
        projectId: e.projectId,
        roles: ['ACCOUNTS_MANAGER', 'PROCUREMENT_MANAGER'],
        exceptUserIds: [actor.id],
        title: `Debit note to raise: ${e.entryNo}`,
        body: `${actor.fullName} ${returned ? `sent back to ${vendor}` : `rejected at QA/QC from ${vendor}`} on ${e.project.name}: ${what}${e.purchaseOrder ? ` (${e.purchaseOrder.poNo})` : ''}${!returned && e.qcNote ? `. ${e.qcNote}` : ''}. Raise the debit note so it comes off their bill.`,
        entityType: 'DEBIT_TO_RAISE',
        entityId: entryId,
        dedupeKey: `HANDOFF_DEBIT:${entryId}`,
        email: { href: `/payables?tab=debit-notes&sub=to-raise`, cta: 'Raise the debit note' },
      });
    } catch (err) {
      this.log.warn(`onDebitToRaise(${entryId}) failed: ${(err as Error).message}`);
    }
  }

  /** Material sent from another site or store: the receiving site's store expects it and receives it on arrival. */
  async onTransferSent(actor: RequestUser, entryId: string) {
    try {
      const e = await this.prisma.stockEntry.findUnique({
        where: { id: entryId },
        select: { entryNo: true, toProjectId: true, vehicleNo: true, project: { select: { name: true } }, toProject: { select: { name: true } }, lines: { select: { quantity: true, item: { select: { name: true, unit: true } } } } },
      });
      if (!e?.toProjectId) return;
      const what = e.lines.slice(0, 3).map((l) => `${l.item.name} ${l.quantity.abs().toString()} ${l.item.unit}`).join(', ') + (e.lines.length > 3 ? ` and ${e.lines.length - 3} more` : '');
      await this.handoff({
        organizationId: actor.organizationId,
        projectId: e.toProjectId,
        roles: ['STORE_MANAGER'],
        exceptUserIds: [actor.id],
        title: `Material on the way: ${e.entryNo}`,
        body: `${actor.fullName} sent ${what} from ${e.project.name} to ${e.toProject?.name ?? 'your site'}${e.vehicleNo ? ` on ${e.vehicleNo}` : ''}. Receive it against ${e.entryNo} when it arrives.`,
        entityType: 'TRANSFER_IN',
        entityId: entryId,
        dedupeKey: `HANDOFF_TRANSFER:${entryId}`,
        email: { href: `/stock?projectId=${e.toProjectId}`, cta: 'Open stock' },
      });
    } catch (err) {
      this.log.warn(`onTransferSent(${entryId}) failed: ${(err as Error).message}`);
    }
  }

  /**
   * A supplier's bill that does not match its order (finding 18 of the October review): purchase raised the order and
   * agreed the rates, so the mismatch is theirs to settle with the vendor, and the project's manager hears of it too.
   * The approver already has it in their queue; this is so the bill is not approved or held by them alone.
   */
  async onVendorBillExceptions(actor: RequestUser, billId: string) {
    try {
      const b = await this.prisma.vendorBill.findUnique({
        where: { id: billId },
        select: { billNo: true, invoiceNo: true, exceptions: true, total: true, projectId: true, vendor: { select: { name: true } }, purchaseOrder: { select: { poNo: true } }, project: { select: { name: true, projectManagerId: true } } },
      });
      if (!b?.exceptions.length) return;
      const against = b.purchaseOrder ? ` against ${b.purchaseOrder.poNo}` : '';
      const listed = b.exceptions.slice(0, 3).join('; ') + (b.exceptions.length > 3 ? `; and ${b.exceptions.length - 3} more` : '');
      await this.handoff({
        organizationId: actor.organizationId,
        projectId: b.projectId,
        roles: ['PROCUREMENT_MANAGER'],
        alsoUserIds: [b.project.projectManagerId],
        exceptUserIds: [actor.id],
        title: `${b.billNo} does not match the order`,
        body: `${b.vendor.name}'s invoice ${b.invoiceNo}${against} on ${b.project.name}, ${inr(b.total.toFixed(2))}: ${listed}. Settle it with the vendor or tell the approver it stands.`,
        entityType: 'VENDOR_BILL',
        entityId: billId,
        dedupeKey: `HANDOFF_VB_EXCEPTIONS:${billId}`,
        email: { href: `/vendor-bills/${billId}`, cta: 'Open the bill' },
      });
    } catch (e) {
      this.log.warn(`onVendorBillExceptions(${billId}) failed: ${(e as Error).message}`);
    }
  }

  /** The client certified an RA bill: accounts expect the money by the contract's payment days. */
  async onBillCertified(actor: RequestUser, billId: string, label: string) {
    const b = await this.prisma.raBill.findUnique({ where: { id: billId }, select: { projectId: true, netPayable: true, certifiedDate: true, project: { select: { name: true, clientPaymentDays: true } } } });
    if (!b) return;
    const due = b.certifiedDate && b.project.clientPaymentDays ? new Date(b.certifiedDate.getTime() + b.project.clientPaymentDays * 86_400_000) : null;
    await this.handoff({
      organizationId: actor.organizationId,
      projectId: b.projectId,
      roles: ['ACCOUNTS_MANAGER'],
      exceptUserIds: [actor.id],
      title: `${label} certified: money to collect`,
      body: `The client certified ${label} on ${b.project.name}, net ${inr(b.netPayable.toFixed(2))}${due ? `, due by ${titleDate(due)}` : ''}. Record the receipt when it comes in.`,
      entityType: 'BILL',
      entityId: billId,
      dedupeKey: `HANDOFF_CERTIFIED:${billId}`,
      email: { href: `/receivables`, cta: 'Open receivables' },
    });
  }

  /** Money in from the client: the project's manager and management hear of it. */
  async onClientReceipt(actor: RequestUser, receiptId: string) {
    try {
      const r = await this.prisma.receipt.findUnique({ where: { id: receiptId }, select: { projectId: true, amount: true, receiptDate: true, project: { select: { name: true, projectManagerId: true } }, bill: { select: { billNo: true } } } });
      if (!r) return;
      await this.handoff({
        organizationId: actor.organizationId,
        projectId: r.projectId,
        roles: ['MANAGEMENT'],
        alsoUserIds: [r.project.projectManagerId],
        exceptUserIds: [actor.id],
        title: `Received ${inr(r.amount.toFixed(2))} from the client`,
        body: `${actor.fullName} recorded ${inr(r.amount.toFixed(2))} received on ${titleDate(r.receiptDate)} for ${r.project.name}${r.bill ? ` against RA bill ${r.bill.billNo}` : ''}.`,
        dedupeKey: `HANDOFF_RECEIPT:${receiptId}`,
      });
    } catch (e) {
      this.log.warn(`onClientReceipt(${receiptId}) failed: ${(e as Error).message}`);
    }
  }

  /** Someone was added to a project's team: they hear of it with the link. */
  async onAddedToProject(actor: RequestUser, projectId: string, userId: string) {
    try {
      if (userId === actor.id) return;
      const p = await this.prisma.project.findUnique({ where: { id: projectId }, select: { code: true, name: true } });
      if (!p) return;
      await this.notify({
        organizationId: actor.organizationId,
        userIds: [userId],
        type: 'HANDOFF',
        title: `You were added to ${p.code}`,
        body: `${actor.fullName} added you to the team of ${p.name}. It now shows in your projects and in the header's project switcher.`,
        projectId,
        entityType: 'PROJECT',
        entityId: projectId,
        dedupeKey: `HANDOFF_ADDED:${projectId}`,
        email: { href: `/projects/${projectId}`, cta: 'Open the project' },
      });
    } catch (e) {
      this.log.warn(`onAddedToProject(${projectId}) failed: ${(e as Error).message}`);
    }
  }

  /**
   * A DPR whose remarks read as a hindrance the client or a third party causes (the pure `classifyRemark`): the
   * project manager is told with the notice deadline, so the contract's notice is not missed waiting on the Risks tab.
   */
  private async onDprHindrance(actor: RequestUser, dprId: string) {
    const d = await this.prisma.dailyReport.findUnique({ where: { id: dprId }, select: { date: true, issues: true, projectId: true, project: { select: { name: true, noticeDays: true, projectManagerId: true } } } });
    if (!d?.issues || !d.project.projectManagerId) return;
    const date = dateOnly(d.date)!;
    const reading = classifyRemark(d.issues, date);
    if (reading.verdict === 'NONE' || !needsNotice(reading.party)) return;
    const start = new Date(d.date.getTime() - reading.startOffset * 86_400_000);
    const clock = noticeClock(dateOnly(start)!, d.project.noticeDays ?? DEFAULT_NOTICE_DAYS, todayIn());
    const due = titleDate(new Date(`${clock.due}T00:00:00Z`));
    await this.handoff({
      organizationId: actor.organizationId,
      projectId: d.projectId,
      roles: [],
      alsoUserIds: [d.project.projectManagerId],
      exceptUserIds: [actor.id],
      title: `Hindrance in the DPR: notice due by ${due}`,
      body: `${actor.fullName}'s DPR for ${titleDate(d.date)} on ${d.project.name} reads as ${reading.title ? reading.title.charAt(0).toLowerCase() + reading.title.slice(1) : 'a hindrance'} (${DELAY_PARTY_LABELS[reading.party!].toLowerCase()}). Record it as a delay and send the notice by ${due}.`,
      entityType: 'DPR',
      entityId: dprId,
      dedupeKey: `HANDOFF_HINDRANCE:${dprId}`,
      email: { href: `/projects/${d.projectId}?tab=risks`, cta: 'Record the delay' },
    });
  }
}
