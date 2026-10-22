import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ROLE_LABELS,
  subBillLabel,
  canApprove,
  canEditSubmission,
  canResubmit,
  machineryLogCost,
  type ApprovalStageDto,
  type ReviewResultDto,
  type PendingApprovalDto,
  type ReviewDecision,
  type ReviewedItemDto,
  type SubmissionStatus,
  type SubmissionType,
  type WaitingEntryDto,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from './current-user';
import { ProjectAccessService } from './project-access.service';
import { ApprovalRightsService, type LevelEntry } from './approval-rights.service';
import { mayDecide, queueRoles } from './approval-levels';
import { AuditService } from './audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { dprTitle, expenseTitle, machineryTitle, measurementTitle, progressTitle, billTitle, poTitle, vendorBillTitle, woTitle, subBillTitle, inspectionTitle, payRequestTitle, PAY_REQUEST_TITLE } from './submission-titles';

const REVIEW_ACTIONS = ['APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'LEVEL_APPROVED'] as const;

interface SubmissionRow {
  id: string;
  organizationId: string;
  projectId: string;
  status: SubmissionStatus;
  submittedById: string;
  submittedAt: Date | null;
  createdAt: Date;
}

/**
 * One state machine for every site submission:
 *   DRAFT / REJECTED / CHANGES_REQUESTED --submit--> SUBMITTED --review--> APPROVED | REJECTED | CHANGES_REQUESTED
 * A rejected or changes-requested entry is edited in place and resubmitted (audit action RESUBMITTED), so the
 * review history stays on one record. Every submission type (progress, DPRs, material requests, machinery logs, expenses, measurements, bills, orders, inspections, payment requests) goes through here.
 */
/** The queue's line reads only the project's and the submitter's names. */
const NAME = { select: { name: true } } as const;
const BY = { select: { fullName: true } } as const;

@Injectable()
export class SubmissionLifecycleService {
  private readonly approvedHooks = new Map<SubmissionType, (user: RequestUser, id: string) => Promise<void>>();
  private readonly beforeApproveHooks = new Map<SubmissionType, (user: RequestUser, id: string) => Promise<void>>();

  constructor(private prisma: PrismaService, private access: ProjectAccessService, private audit: AuditService, private notifications: NotificationsService, private rights: ApprovalRightsService) {}

  private delegate(type: SubmissionType): any {
    return this.rights.submissionModel(type);
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

  /**
   * Approver decides on a SUBMITTED entry. With approval levels (v5 item 94) an approval below the entry's last level
   * records an `ApprovalStep` and the entry stays SUBMITTED for the next level; the last level approves it as before.
   * Rejecting or sending back at any level ends the round.
   */
  async review(user: RequestUser, type: SubmissionType, id: string, decision: ReviewDecision, note?: string | null): Promise<Omit<ReviewResultDto, 'ok'>> {
    const row = await this.load(user, type, id);
    if (row.status !== 'SUBMITTED') throw new BadRequestException(`Only submitted entries can be reviewed (current status ${row.status})`);
    const { stage } = await this.access.assertCanApproveSubmission(user, type, id, row.projectId);
    const round = row.submittedAt ?? row.createdAt;
    if (decision === 'APPROVE') await this.beforeApproveHooks.get(type)?.(user, id);
    if (decision === 'APPROVE' && stage.level < stage.levels) {
      await this.prisma.approvalStep.create({ data: { organizationId: user.organizationId, entityType: type, entityId: id, level: stage.level, action: 'APPROVED', round, actorId: user.id, note: note ?? null } });
      await this.audit.log(user, type, id, 'LEVEL_APPROVED', `Level ${stage.level} of ${stage.levels}${note ? `: ${note}` : ''}`);
      await this.notifications.onLevelApproved(user, type, id, stage.level + 1, stage.levels);
      return { status: 'SUBMITTED' as const, level: stage.level, levels: stage.levels };
    }
    const status = decision === 'APPROVE' ? 'APPROVED' : decision === 'REJECT' ? 'REJECTED' : 'CHANGES_REQUESTED';
    if (status === 'APPROVED' && stage.levels > 1)
      await this.prisma.approvalStep.create({ data: { organizationId: user.organizationId, entityType: type, entityId: id, level: stage.level, action: 'APPROVED', round, actorId: user.id, note: note ?? null } });
    await this.delegate(type).update({ where: { id }, data: { status, reviewedById: user.id, reviewedAt: new Date(), reviewNote: note ?? null } });
    await this.audit.log(user, type, id, status, note);
    if (status === 'APPROVED') await this.approvedHooks.get(type)?.(user, id);
    await this.notifications.onReviewed(user, type, id, status, note);
    return { status, level: stage.level, levels: stage.levels };
  }

  /** Where an entry stands in its approval levels and whether the caller may decide it now (the record's stage line). */
  async stage(user: RequestUser, type: SubmissionType, id: string): Promise<ApprovalStageDto> {
    const row = await this.load(user, type, id);
    const entry = await this.rights.entryOf(type, id);
    const steps = (await this.rights.stepsOf([entry])).get(`${type}:${id}`) ?? [];
    const { rules, stage, ok, reason } = await this.rights.decide(user, entry);
    const submitted = row.status === 'SUBMITTED';
    const rights = await this.rights.rightsFor(user.organizationId, user.roleKey);
    return {
      type,
      id,
      status: row.status,
      level: stage.level,
      levels: stage.levels,
      steps: steps.map((s) => ({ level: s.level, action: s.action, byName: s.actorName, at: s.createdAt.toISOString(), note: s.note })),
      escalated: submitted && stage.escalated,
      waitingWith: submitted ? queueRoles(type, rules, entry.amount, stage).map((r) => ROLE_LABELS[r] ?? r) : [],
      waitingSince: submitted ? stage.since.toISOString() : null,
      canReview: submitted && ok,
      reason: submitted && !ok && rights.some((r) => r.type === type) ? reason : null,
    };
  }

  /** The caller's own entries waiting for approval: at which level, in whose queue, since when (Waiting with others). */
  async waiting(user: RequestUser): Promise<WaitingEntryDto[]> {
    const mine = await this.mine(user, ['SUBMITTED']);
    const entries: LevelEntry[] = mine.map((m) => ({ type: m.type, id: m.id, amount: m.amount, round: new Date(m.submittedAt) }));
    const { rules, stages } = await this.rights.stages(user.organizationId, entries);
    return mine
      .map((m) => {
        const stage = stages.get(`${m.type}:${m.id}`)!;
        return {
          ...m,
          level: stage.level,
          levels: stage.levels,
          escalated: stage.escalated,
          waitingWith: queueRoles(m.type, rules, m.amount, stage).map((r) => ROLE_LABELS[r] ?? r),
          waitingSince: stage.since.toISOString(),
        };
      })
      .sort((a, b) => a.waitingSince.localeCompare(b.waitingSince));
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
   * Everything awaiting the current user's decision, across all submission types: the types the approval matrix gives
   * the user's role at the level each entry waits at, within its amount limit (anything above goes to a higher
   * approver), and entries escalated to the role (v5 item 94). An entry whose earlier level this user approved waits
   * for someone else.
   */
  async pending(user: RequestUser): Promise<PendingApprovalDto[]> {
    const rules = await this.rights.rules(user.organizationId);
    const rights = await this.rights.rightsFor(user.organizationId, user.roleKey);
    // Escalation can bring any type to management, or to a role that decides a higher level of it.
    const types = new Set<SubmissionType>([
      ...rights.map((r) => r.type),
      ...(user.roleKey === 'MANAGEMENT' ? (await this.escalatedTypes(user.organizationId)) : []),
      ...rules.filter((r) => r.level > 1 && r.roleKey === user.roleKey).map((r) => r.type),
    ]);
    if (!types.size) return [];
    const where = { ...this.access.submissionWhere(user), status: 'SUBMITTED' as const };
    const out = await this.describe((t) => (types.has(t) ? where : null));
    const { stages } = await this.rights.stages(
      user.organizationId,
      out.map((p) => ({ type: p.type, id: p.id, amount: p.amount, round: new Date(p.submittedAt) })),
    );
    return out
      .flatMap((p) => {
        const stage = stages.get(`${p.type}:${p.id}`)!;
        if (!mayDecide(user, p.type, rules, p.amount, stage).ok) return [];
        return [stage.levels > 1 || stage.escalated ? { ...p, level: stage.level, levels: stage.levels, escalated: stage.escalated || undefined } : p];
      })
      .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  }

  /** Everything waiting for approval in the projects the caller sees, whoever decides it (the phone's company view, v5 item 96). */
  async submitted(user: RequestUser): Promise<PendingApprovalDto[]> {
    const where = { ...this.access.submissionWhere(user), status: 'SUBMITTED' as const };
    return (await this.describe(() => where)).sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  }

  /** Types with an entry escalated in the last 90 days (management's queue looks at these too). */
  private async escalatedTypes(organizationId: string): Promise<SubmissionType[]> {
    const rows = await this.prisma.approvalStep.findMany({
      where: { organizationId, action: 'ESCALATED', createdAt: { gte: new Date(Date.now() - 90 * 86_400_000) } },
      distinct: ['entityType'],
      select: { entityType: true },
    });
    return rows.map((r) => r.entityType as SubmissionType);
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
      return d ? [{ ...d, decision: (l.action === 'LEVEL_APPROVED' ? 'APPROVED' : l.action) as ReviewedItemDto['decision'], note: l.note, reviewedAt: l.createdAt.toISOString() }] : [];
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
    const [progress, dprs, mrs, logs, expenses, mbs, bills, pos, vbills, wos, sbills, inspections, payRequests] = await Promise.all([
      allowed('PROGRESS') ? this.prisma.progressEntry.findMany({ where: where('PROGRESS'), include: { project: NAME, activity: { include: { boqItem: { select: { rate: true } } } }, submittedBy: BY }, orderBy: { submittedAt: 'asc' } }) : none,
      allowed('DPR') ? this.prisma.dailyReport.findMany({ where: where('DPR'), include: { project: NAME, submittedBy: BY }, orderBy: { submittedAt: 'asc' } }) : none,
      allowed('MATERIAL_REQUEST') ? this.prisma.materialRequest.findMany({ where: where('MATERIAL_REQUEST'), include: { project: NAME, submittedBy: BY, items: { select: { id: true } } }, orderBy: { submittedAt: 'asc' } }) : none,
      allowed('MACHINERY') ? this.prisma.machineryLog.findMany({ where: where('MACHINERY'), include: { project: NAME, submittedBy: BY, equipment: { select: { code: true, name: true, rate: true, rateUnit: true } } }, orderBy: { submittedAt: 'asc' } }) : none,
      allowed('EXPENSE') ? this.prisma.expense.findMany({ where: where('EXPENSE'), include: { project: NAME, submittedBy: BY }, orderBy: { submittedAt: 'asc' } }) : none,
      allowed('MEASUREMENT') ? this.prisma.measurementSheet.findMany({ where: where('MEASUREMENT'), include: { project: NAME, submittedBy: BY, boqItem: { select: { itemNo: true, unit: true, rate: true } } }, orderBy: { submittedAt: 'asc' } }) : none,
      allowed('BILL') ? this.prisma.raBill.findMany({ where: where('BILL'), include: { project: NAME, submittedBy: BY }, orderBy: { submittedAt: 'asc' } }) : none,
      allowed('PURCHASE_ORDER') ? this.prisma.purchaseOrder.findMany({ where: where('PURCHASE_ORDER'), include: { project: NAME, submittedBy: BY, vendor: { select: { name: true } } }, orderBy: { submittedAt: 'asc' } }) : none,
      allowed('VENDOR_BILL') ? this.prisma.vendorBill.findMany({ where: where('VENDOR_BILL'), include: { project: NAME, submittedBy: BY, vendor: { select: { name: true } } }, orderBy: { submittedAt: 'asc' } }) : none,
      allowed('WORK_ORDER') ? this.prisma.workOrder.findMany({ where: where('WORK_ORDER'), include: { project: NAME, submittedBy: BY, vendor: { select: { name: true } } }, orderBy: { submittedAt: 'asc' } }) : none,
      allowed('SUBCONTRACT_BILL')
        ? this.prisma.subcontractBill.findMany({ where: where('SUBCONTRACT_BILL'), include: { project: NAME, submittedBy: BY, workOrder: { select: { woNo: true, vendor: { select: { name: true } } } } }, orderBy: { submittedAt: 'asc' } })
        : none,
      allowed('INSPECTION') ? this.prisma.inspection.findMany({ where: where('INSPECTION'), include: { project: NAME, submittedBy: BY, activity: { select: { name: true } } }, orderBy: { submittedAt: 'asc' } }) : none,
      allowed('PAYMENT_REQUEST')
        ? this.prisma.paymentRequest.findMany({
            where: where('PAYMENT_REQUEST'),
            include: { project: NAME, submittedBy: BY, ...PAY_REQUEST_TITLE },
            orderBy: { submittedAt: 'asc' },
          })
        : none,
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
        title: `${vendorBillTitle(v.billNo, v.invoiceNo, v.vendor.name, v.total.toFixed(2))}${v.matched ? '' : v.purchaseOrderId ? ' (does not match the PO)' : ' (has exceptions)'}`,
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
      ...payRequests.map((r) => ({
        type: 'PAYMENT_REQUEST' as const,
        id: r.id,
        projectId: r.projectId,
        projectName: r.project.name,
        title: payRequestTitle(r),
        submittedByName: r.submittedBy.fullName,
        submittedAt: (r.submittedAt ?? r.createdAt).toISOString(),
        amount: amt(r.amount),
      })),
    ];
    return out;
  }
}
