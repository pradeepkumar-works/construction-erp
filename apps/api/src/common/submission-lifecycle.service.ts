import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { canApprove, canEditSubmission, canResubmit, type PendingApprovalDto, type ReviewDecision, type SubmissionStatus, type SubmissionType } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from './current-user';
import { ProjectAccessService } from './project-access.service';
import { AuditService } from './audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { expenseTitle, machineryTitle, measurementTitle } from './submission-titles';

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
 * review history stays on one record. Progress entries, DPRs, material requests, machinery logs, site expenses and measurements all go through here.
 */
@Injectable()
export class SubmissionLifecycleService {
  constructor(private prisma: PrismaService, private access: ProjectAccessService, private audit: AuditService, private notifications: NotificationsService) {}

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
    }
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
    await this.access.assertCanApprove(user, row.projectId);
    if (row.status !== 'SUBMITTED') throw new BadRequestException(`Only submitted entries can be reviewed (current status ${row.status})`);
    const status = decision === 'APPROVE' ? 'APPROVED' : decision === 'REJECT' ? 'REJECTED' : 'CHANGES_REQUESTED';
    await this.delegate(type).update({ where: { id }, data: { status, reviewedById: user.id, reviewedAt: new Date(), reviewNote: note ?? null } });
    await this.audit.log(user, type, id, status, note);
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

  /** Everything awaiting the current user's approval, across all submission types. */
  async pending(user: RequestUser): Promise<PendingApprovalDto[]> {
    if (!canApprove(user.roleKey)) return [];
    const where = { ...this.access.submissionWhere(user), status: 'SUBMITTED' as const };
    const [progress, dprs, mrs, logs, expenses, mbs] = await Promise.all([
      this.prisma.progressEntry.findMany({ where, include: { project: true, activity: true, submittedBy: true }, orderBy: { submittedAt: 'asc' } }),
      this.prisma.dailyReport.findMany({ where, include: { project: true, submittedBy: true }, orderBy: { submittedAt: 'asc' } }),
      this.prisma.materialRequest.findMany({ where, include: { project: true, submittedBy: true, items: true }, orderBy: { submittedAt: 'asc' } }),
      this.prisma.machineryLog.findMany({ where, include: { project: true, submittedBy: true, equipment: true }, orderBy: { submittedAt: 'asc' } }),
      this.prisma.expense.findMany({ where, include: { project: true, submittedBy: true }, orderBy: { submittedAt: 'asc' } }),
      this.prisma.measurementSheet.findMany({ where, include: { project: true, submittedBy: true, boqItem: true }, orderBy: { submittedAt: 'asc' } }),
    ]);
    const out: PendingApprovalDto[] = [
      ...progress.map((p) => ({
        type: 'PROGRESS' as const,
        id: p.id,
        projectId: p.projectId,
        projectName: p.project.name,
        title: `${p.activity.name}: ${p.quantity.toString()} ${p.activity.unit} on ${p.date.toISOString().slice(0, 10)}`,
        submittedByName: p.submittedBy.fullName,
        submittedAt: (p.submittedAt ?? p.createdAt).toISOString(),
      })),
      ...dprs.map((d) => ({
        type: 'DPR' as const,
        id: d.id,
        projectId: d.projectId,
        projectName: d.project.name,
        title: `DPR for ${d.date.toISOString().slice(0, 10)}`,
        submittedByName: d.submittedBy.fullName,
        submittedAt: (d.submittedAt ?? d.createdAt).toISOString(),
      })),
      ...mrs.map((m) => ({
        type: 'MATERIAL_REQUEST' as const,
        id: m.id,
        projectId: m.projectId,
        projectName: m.project.name,
        title: `${m.requestNo}: ${m.items.length} item(s), ${m.priority.toLowerCase()} priority`,
        submittedByName: m.submittedBy.fullName,
        submittedAt: (m.submittedAt ?? m.createdAt).toISOString(),
      })),
      ...logs.map((l) => ({
        type: 'MACHINERY' as const,
        id: l.id,
        projectId: l.projectId,
        projectName: l.project.name,
        title: machineryTitle(l.equipment.code, l.equipment.name, l.hoursWorked.toString(), l.breakdownHours.toString(), l.date.toISOString().slice(0, 10)),
        submittedByName: l.submittedBy.fullName,
        submittedAt: (l.submittedAt ?? l.createdAt).toISOString(),
      })),
      ...expenses.map((x) => ({
        type: 'EXPENSE' as const,
        id: x.id,
        projectId: x.projectId,
        projectName: x.project.name,
        title: expenseTitle(x.expenseNo, x.totalAmount.toFixed(2), x.description),
        submittedByName: x.submittedBy.fullName,
        submittedAt: (x.submittedAt ?? x.createdAt).toISOString(),
      })),
      ...mbs.map((m) => ({
        type: 'MEASUREMENT' as const,
        id: m.id,
        projectId: m.projectId,
        projectName: m.project.name,
        title: measurementTitle(m.mbNo, m.boqItem.itemNo, m.totalQty.toString(), m.boqItem.unit, m.location),
        submittedByName: m.submittedBy.fullName,
        submittedAt: (m.submittedAt ?? m.createdAt).toISOString(),
      })),
    ];
    return out.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  }
}
