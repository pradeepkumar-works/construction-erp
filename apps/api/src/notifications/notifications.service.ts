import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { COMPANY_WIDE_ROLES, PAYMENT_ROLES, subBillLabel, LEGACY_NOTIFICATION_TYPES, NOTIFICATION_TABS, NOTIFICATION_TAB_OF, NOTIFICATION_TYPES_VERSION, notificationTypesFor, notificationTypesIn, type NotificationDto, type NotificationListDto, type NotificationTab, type NotificationType, type PushTokenDto, type SubmissionType } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { ApprovalRightsService } from '../common/approval-rights.service';
import { dateOnly, iso } from '../common/serialize';
import { ExpoPushService } from './expo-push.service';
import { dprTitle, expenseTitle, machineryTitle, measurementTitle, progressTitle, billTitle, poTitle, vendorBillTitle, woTitle, subBillTitle, inspectionTitle, payRequestTitle, PAY_REQUEST_TITLE } from '../common/submission-titles';
import { ListNotificationsQuery, RegisterPushTokenDto } from './notifications.dto';
import { MessagingService, type OutgoingMessage } from '../messaging/messaging.service';

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

  constructor(private prisma: PrismaService, private access: ProjectAccessService, private push: ExpoPushService, private rights: ApprovalRightsService, private messaging: MessagingService) {}

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
    return { created: rows.length, pushed, skipped: skipped + (userIds.length - rows.length), messaged };
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
        return b ? { title: billTitle(b.billNo, b.isFinal, b.grossAmount.toFixed(2)), projectId: b.projectId, projectName: b.project.name, submittedById: b.submittedById } : null;
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
    const payers = await this.prisma.user.findMany({
      where: {
        organizationId: actor.organizationId,
        isActive: true,
        // The approver and the one who asked hear of it already.
        id: { notIn: [actor.id, s.submittedById] },
        role: { key: { in: PAYMENT_ROLES } },
        OR: [{ role: { key: { in: COMPANY_WIDE_ROLES } } }, { managedProjects: { some: { id: s.projectId } } }, { memberships: { some: { projectId: s.projectId } } }],
      },
      select: { id: true },
    });
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
      const approvers = await this.access.approversForProject(actor.organizationId, s.projectId, type, await this.rights.amountOf(type, id));
      await this.notify({
        organizationId: actor.organizationId,
        userIds: approvers.map((a) => a.id).filter((uid) => uid !== actor.id),
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
    } catch (e) {
      this.log.warn(`onSubmitted(${type}, ${id}) failed: ${(e as Error).message}`);
    }
  }

  /** One approval level done (v5 item 94): the next level's approvers on the project are asked, like a new submission. */
  async onLevelApproved(actor: RequestUser, type: SubmissionType, id: string, nextLevel: number, levels: number) {
    try {
      const s = await this.describeSubmission(type, id);
      if (!s) return;
      const approvers = await this.access.approversForProject(actor.organizationId, s.projectId, type, await this.rights.amountOf(type, id), nextLevel);
      await this.notify({
        organizationId: actor.organizationId,
        userIds: approvers.map((a) => a.id).filter((uid) => uid !== actor.id),
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
        // Send-backs go out on WhatsApp / SMS too; approvals stay in-app and push.
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
}
