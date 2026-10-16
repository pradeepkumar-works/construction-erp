import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { canApprove, canEditSubmission, canResubmit, machineryLogCost, type PendingApprovalDto, type ReviewDecision, type ReviewedItemDto, type SubmissionStatus, type SubmissionType } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from './current-user';
import { ProjectAccessService } from './project-access.service';
import { ApprovalRightsService } from './approval-rights.service';
import { AuditService } from './audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { dprTitle, expenseTitle, machineryTitle, measurementTitle, progressTitle, billTitle, poTitle, vendorBillTitle, woTitle, subBillTitle, inspectionTitle } from './submission-titles';

const REVIEW_ACTIONS = ['APPROVED', 'REJECTED', 'CHANGES_REQUESTED'] as const;

interface SubmissionRow {
  id: string;
  organizationId: string;
  projectId: string;
  status: SubmissionStatus;
  submittedById: string;
}

/**
 * One state machine for every site submission:
 *   DRAFT / REJECTED / CHANGES_REQUESTED --submit--> SUBMITTED --review--> APPROVED | REJECTED | CHANGES_REQUESTED
 * A rejected or changes-requested entry is edited in place and resubmitted (audit action RESUBMITTED), so the
 * review history stays on one record. Every submission type (progress, DPRs, material requests, machinery logs, expenses, measurements, bills, orders, inspections) goes through here.
 */
@Injectable()
export class SubmissionLifecycleService {
  private readonly approvedHooks = new Map<SubmissionType, (user: RequestUser, id: string) => Promise<void>>();
  private readonly beforeApproveHooks = new Map<SubmissionType, (user: RequestUser, id: string) => Promise<void>>();

  constructor(private prisma: PrismaService, private access: ProjectAccessService, private audit: AuditService, private notifications: NotificationsService, private rights: ApprovalRightsService) {}

  private delegate(type: SubmissionType): any {
    switch (type) {
      case 'PROGRESS':
        return this.prisma.progressEntry;
      case 'DPR':
        return this.prisma.dailyReport;
      case 'MATERIAL_REQUEST':
        return this.prisma.materialRequest;
      case 'MACHINERY':
        return this.prisma.machineryLog;
      case 'EXPENSE':
        return this.prisma.expense;
      case 'MEASUREMENT':
        return this.prisma.measurementSheet;
      case 'BILL':
        return this.prisma.raBill;
      case 'PURCHASE_ORDER':
        return this.prisma.purchaseOrder;
      case 'VENDOR_BILL':
        return this.prisma.vendorBill;
      case 'WORK_ORDER':
        return this.prisma.workOrder;
      case 'SUBCONTRACT_BILL':
        return this.prisma.subcontractBill;
      case 'INSPECTION':
        return this.prisma.inspection;
    }
  }

  /** Run `hook` after an entry of `type` is approved (e.g. a purchase order updates item rates). One per type. */
  onApproved(type: SubmissionType, hook: (user: RequestUser, id: string) => Promise<void>) {
    this.approvedHooks.set(type, hook);
  }

  /** Run `check` before an entry of `type` is approved; it throws to stop the approval (e.g. a hold point). One per type. */
  beforeApprove(type: SubmissionType, check: (user: RequestUser, id: string) => Promise<void>) {
    this.beforeApproveHooks.set(type, check);
  }

  async load(user: RequestUser, type: SubmissionType, id: string): Promise<SubmissionRow> {
    const row = await this.delegate(type).findFirst({ where: { id, organizationId: user.organizationId } });
    if (!row) throw new NotFoundException(`${type} not found`);
    await this.access.assertCanAccessProject(user, row.projectId);
    return row;
  }

  /** Owner (or an approver) moves a draft, rejected or changes-requested entry to SUBMITTED. */
  async submit(user: RequestUser, type: SubmissionType, id: string) {
    const row = await this.load(user, type, id);
    if (row.submittedById !== user.id && !canApprove(user.roleKey)) throw new ForbiddenException('Only the author can submit this entry');
    if (!canResubmit(user, row)) throw new BadRequestException(`Cannot submit an entry in status ${row.status}`);
    const resubmit = row.status === 'REJECTED' || row.status === 'CHANGES_REQUESTED';
    await this.delegate(type).update({ where: { id }, data: { status: 'SUBMITTED', submittedAt: new Date(), reviewedById: null, reviewedAt: null, reviewNote: null } });
    await this.audit.log(user, type, id, resubmit ? 'RESUBMITTED' : 'SUBMITTED');
    await this.notifications.onSubmitted(user, type, id);
  }

  /** Approver decides on a SUBMITTED entry. */
  async review(user: RequestUser, type: SubmissionType, id: string, decision: ReviewDecision, note?: string | null) {
    const row = await this.load(user, type, id);
    await this.access.assertCanApproveSubmission(user, type, id, row.projectId);
    if (row.status !== 'SUBMITTED') throw new BadRequestException(`Only submitted entries can be reviewed (current status ${row.status})`);
    const status = decision === 'APPROVE' ? 'APPROVED' : decision === 'REJECT' ? 'REJECTED' : 'CHANGES_REQUESTED';
    if (status === 'APPROVED') await this.beforeApproveHooks.get(type)?.(user, id);
    await this.delegate(type).update({ where: { id }, data: { status, reviewedById: user.id, reviewedAt: new Date(), reviewNote: note ?? null } });
    await this.audit.log(user, type, id, status, note);
    if (status === 'APPROVED') await this.approvedHooks.get(type)?.(user, id);
    await this.notifications.onReviewed(user, type, id, status, note);
  }

  /** Author can edit while DRAFT / REJECTED / CHANGES_REQUESTED; approvers may edit at any time before approval. */
  async assertEditable(user: RequestUser, row: SubmissionRow) {
    if (canEditSubmission(user, row)) return;
    if (row.status === 'APPROVED') throw new BadRequestException('Approved entries cannot be edited');
    if (row.submittedById !== user.id) throw new ForbiddenException('You cannot edit this entry');
    if (row.status === 'SUBMITTED') throw new BadRequestException('Entry is awaiting approval and cannot be edited');
    throw new ForbiddenException('You cannot edit this entry');
  }

  /**
   * Everything awaiting the current user's approval, across all submission types: only the types the approval matrix
   * gives the user's role, and only items within its amount limit (anything above goes to a higher approver).
   */
  async pending(user: RequestUser): Promise<PendingApprovalDto[]> {
    const rights = await this.rights.rightsFor(user.organizationId, user.roleKey);
    if (!rights.length) return [];
    const where = { ...this.access.submissionWhere(user), status: 'SUBMITTED' as const };
    const out = await this.describe((t) => (rights.some((r) => r.type === t) ? where : null));
    return out
      .filter((p) => ApprovalRightsService.within(rights.find((r) => r.type === p.type), p.type, p.amount === null ? null : new Prisma.Decimal(p.amount)))
      .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  }

  /**
   * What the current user approved, rejected or sent back since `since` (the inbox's "reviewed today"), newest first,
   * described like the queue. Entries since resubmitted keep the decision this user made.
   */
  async reviewedBy(user: RequestUser, since: Date): Promise<ReviewedItemDto[]> {
    const logs = await this.prisma.auditLog.findMany({
      where: { organizationId: user.organizationId, actorId: user.id, action: { in: [...REVIEW_ACTIONS] }, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const ids = new Map<string, string[]>();
    for (const l of logs) ids.set(l.entityType, [...(ids.get(l.entityType) ?? []), l.entityId]);
    const described = await this.describe((t) => (ids.has(t) ? { ...this.access.submissionWhere(user), id: { in: ids.get(t)! } } : null));
    const byKey = new Map(described.map((d) => [`${d.type}:${d.id}`, d]));
    return logs.flatMap((l) => {
      const d = byKey.get(`${l.entityType}:${l.entityId}`);
      return d ? [{ ...d, decision: l.action as ReviewedItemDto['decision'], note: l.note, reviewedAt: l.createdAt.toISOString() }] : [];
    });
  }

  /** The caller's own entries in these statuses (the home page's "sent back"), newest submitted first. */
  async mine(user: RequestUser, statuses: SubmissionStatus[]): Promise<PendingApprovalDto[]> {
    const where = { organizationId: user.organizationId, submittedById: user.id, status: { in: statuses } };
    return (await this.describe(() => where)).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  }

  /** The queue's one-line description of every entry each type's `whereFor` matches (null skips the type). */
  private async describe(whereFor: (type: SubmissionType) => Record<string, unknown> | null): Promise<PendingApprovalDto[]> {
    const none = Promise.resolve([] as never[]);
    const allowed = (t: SubmissionType) => whereFor(t) !== null;
    const where = (t: SubmissionType) => whereFor(t) as any;
    const [progress, dprs, mrs, logs, expenses, mbs, bills, pos, vbills, wos, sbills, inspections] = await Promise.all([
      allowed('PROGRESS') ? this.prisma.progressEntry.findMany({ where: where('PROGRESS'), include: { project: true, activity: { include: { boqItem: { select: { rate: true } } } }, submittedBy: true }, orderBy: { submittedAt: 'asc' } }) : none,
      allowed('DPR') ? this.prisma.dailyReport.findMany({ where: where('DPR'), include: { project: true, submittedBy: true }, orderBy: { submittedAt: 'asc' } }) : none,
      allowed('MATERIAL_REQUEST') ? this.prisma.materialRequest.findMany({ where: where('MATERIAL_REQUEST'), include: { project: true, submittedBy: true, items: true }, orderBy: { submittedAt: 'asc' } }) : none,
      allowed('MACHINERY') ? this.prisma.machineryLog.findMany({ where: where('MACHINERY'), include: { project: true, submittedBy: true, equipment: true }, orderBy: { submittedAt: 'asc' } }) : none,
      allowed('EXPENSE') ? this.prisma.expense.findMany({ where: where('EXPENSE'), include: { project: true, submittedBy: true }, orderBy: { submittedAt: 'asc' } }) : none,
      allowed('MEASUREMENT') ? this.prisma.measurementSheet.findMany({ where: where('MEASUREMENT'), include: { project: true, submittedBy: true, boqItem: true }, orderBy: { submittedAt: 'asc' } }) : none,
      allowed('BILL') ? this.prisma.raBill.findMany({ where: where('BILL'), include: { project: true, submittedBy: true }, orderBy: { submittedAt: 'asc' } }) : none,
      allowed('PURCHASE_ORDER') ? this.prisma.purchaseOrder.findMany({ where: where('PURCHASE_ORDER'), include: { project: true, submittedBy: true, vendor: { select: { name: true } } }, orderBy: { submittedAt: 'asc' } }) : none,
      allowed('VENDOR_BILL') ? this.prisma.vendorBill.findMany({ where: where('VENDOR_BILL'), include: { project: true, submittedBy: true, vendor: { select: { name: true } } }, orderBy: { submittedAt: 'asc' } }) : none,
      allowed('WORK_ORDER') ? this.prisma.workOrder.findMany({ where: where('WORK_ORDER'), include: { project: true, submittedBy: true, vendor: { select: { name: true } } }, orderBy: { submittedAt: 'asc' } }) : none,
      allowed('SUBCONTRACT_BILL')
        ? this.prisma.subcontractBill.findMany({ where: where('SUBCONTRACT_BILL'), include: { project: true, submittedBy: true, workOrder: { select: { woNo: true, vendor: { select: { name: true } } } } }, orderBy: { submittedAt: 'asc' } })
        : none,
      allowed('INSPECTION') ? this.prisma.inspection.findMany({ where: where('INSPECTION'), include: { project: true, submittedBy: true, activity: { select: { name: true } } }, orderBy: { submittedAt: 'asc' } }) : none,
    ]);
    const amt = (d: Prisma.Decimal | null): string | null => (d === null ? null : d.toDecimalPlaces(2).toFixed(2));
    const machineCost = (l: (typeof logs)[number]) => {
      const c = machineryLogCost(l.equipment.rate?.toString() ?? null, l.equipment.rateUnit, l.hoursWorked.toString());
      return c === null ? null : new Prisma.Decimal(c);
    };
    const out: PendingApprovalDto[] = [
      ...progress.map((p) => ({
        type: 'PROGRESS' as const,
        id: p.id,
        projectId: p.projectId,
        projectName: p.project.name,
        title: progressTitle(p.activity.name, p.quantity.toString(), p.activity.unit, p.date),
        submittedByName: p.submittedBy.fullName,
        submittedAt: (p.submittedAt ?? p.createdAt).toISOString(),
        amount: amt(p.activity.boqItem ? p.quantity.mul(p.activity.boqItem.rate) : null),
      })),
      ...dprs.map((d) => ({
        type: 'DPR' as const,
        id: d.id,
        projectId: d.projectId,
        projectName: d.project.name,
        title: dprTitle(d.date),
        submittedByName: d.submittedBy.fullName,
        submittedAt: (d.submittedAt ?? d.createdAt).toISOString(),
        amount: null,
      })),
      ...mrs.map((m) => ({
        type: 'MATERIAL_REQUEST' as const,
        id: m.id,
        projectId: m.projectId,
        projectName: m.project.name,
        title: `${m.requestNo}: ${m.items.length} item(s), ${m.priority.toLowerCase()} priority`,
        submittedByName: m.submittedBy.fullName,
        submittedAt: (m.submittedAt ?? m.createdAt).toISOString(),
        amount: null,
      })),
      ...logs.map((l) => ({
        type: 'MACHINERY' as const,
        id: l.id,
        projectId: l.projectId,
        projectName: l.project.name,
        title: machineryTitle(l.equipment.code, l.equipment.name, l.hoursWorked.toString(), l.breakdownHours.toString(), l.date),
        submittedByName: l.submittedBy.fullName,
        submittedAt: (l.submittedAt ?? l.createdAt).toISOString(),
        amount: amt(machineCost(l)),
      })),
      ...expenses.map((x) => ({
        type: 'EXPENSE' as const,
        id: x.id,
        projectId: x.projectId,
        projectName: x.project.name,
        title: expenseTitle(x.expenseNo, x.totalAmount.toFixed(2), x.description),
        submittedByName: x.submittedBy.fullName,
        submittedAt: (x.submittedAt ?? x.createdAt).toISOString(),
        amount: amt(x.totalAmount),
      })),
      ...mbs.map((m) => ({
        type: 'MEASUREMENT' as const,
        id: m.id,
        projectId: m.projectId,
        projectName: m.project.name,
        title: measurementTitle(m.mbNo, m.boqItem.itemNo, m.totalQty.toString(), m.boqItem.unit, m.location),
        submittedByName: m.submittedBy.fullName,
        submittedAt: (m.submittedAt ?? m.createdAt).toISOString(),
        amount: amt(m.totalQty.mul(m.boqItem.rate)),
      })),
      ...bills.map((b) => ({
        type: 'BILL' as const,
        id: b.id,
        projectId: b.projectId,
        projectName: b.project.name,
        title: billTitle(b.billNo, b.isFinal, b.grossAmount.toFixed(2)),
        submittedByName: b.submittedBy.fullName,
        submittedAt: (b.submittedAt ?? b.createdAt).toISOString(),
        amount: amt(b.grossAmount),
      })),
      ...pos.map((o) => ({
        type: 'PURCHASE_ORDER' as const,
        id: o.id,
        projectId: o.projectId,
        projectName: o.project.name,
        title: poTitle(o.poNo, o.total.toFixed(2), o.vendor.name),
        submittedByName: o.submittedBy.fullName,
        submittedAt: (o.submittedAt ?? o.createdAt).toISOString(),
        amount: amt(o.total),
      })),
      ...vbills.map((v) => ({
        type: 'VENDOR_BILL' as const,
        id: v.id,
        projectId: v.projectId,
        projectName: v.project.name,
        title: `${vendorBillTitle(v.billNo, v.invoiceNo, v.vendor.name, v.total.toFixed(2))}${v.matched ? '' : ' (does not match the PO)'}`,
        submittedByName: v.submittedBy.fullName,
        submittedAt: (v.submittedAt ?? v.createdAt).toISOString(),
        amount: amt(v.total),
      })),
      ...wos.map((w) => ({
        type: 'WORK_ORDER' as const,
        id: w.id,
        projectId: w.projectId,
        projectName: w.project.name,
        title: woTitle(w.woNo, w.title, w.value.toFixed(2), w.vendor.name),
        submittedByName: w.submittedBy.fullName,
        submittedAt: (w.submittedAt ?? w.createdAt).toISOString(),
        amount: amt(w.value),
      })),
      ...sbills.map((b) => ({
        type: 'SUBCONTRACT_BILL' as const,
        id: b.id,
        projectId: b.projectId,
        projectName: b.project.name,
        title: subBillTitle(b.workOrder.woNo, b.billNo, b.isFinal, b.workOrder.vendor.name, b.grossAmount.toFixed(2)),
        submittedByName: b.submittedBy.fullName,
        submittedAt: (b.submittedAt ?? b.createdAt).toISOString(),
        amount: amt(b.grossAmount),
      })),
      ...inspections.map((i) => ({
        type: 'INSPECTION' as const,
        id: i.id,
        projectId: i.projectId,
        projectName: i.project.name,
        title: inspectionTitle(i.inspectionNo, i.activity.name, i.location),
        submittedByName: i.submittedBy.fullName,
        submittedAt: (i.submittedAt ?? i.createdAt).toISOString(),
        amount: null,
      })),
    ];
    return out;
  }
}
