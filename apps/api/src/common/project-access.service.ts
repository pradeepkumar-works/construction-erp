import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { APPROVER_ROLES, type SubmissionType, COMPANY_WIDE_ROLES, isCompanyWide, canAdjustStock, canApprove, canKeepStock, canLogMachinery, canManageEquipment, canManageStore, canMeasure, canRaiseRisk, canRecordAttendance, canRequestInspection, canSubmitExpense, canRecordTest, canRaiseNcr, canManageDocuments, canViewLetters, canManageStaff, canMarkStaff, canViewMessageLog } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ApprovalRightsService } from './approval-rights.service';
import { RequestUser } from './current-user';

/**
 * Central place for "which projects can this user see / act on".
 * Company-wide roles see every project in their organisation; others see projects they are a member of
 * or manage.
 */
@Injectable()
export class ProjectAccessService {
  constructor(private prisma: PrismaService, private rights: ApprovalRightsService) {}

  /** Prisma where-clause restricting projects to those visible to the user. */
  projectWhere(user: RequestUser): Prisma.ProjectWhereInput {
    if (isCompanyWide(user.roleKey)) return { organizationId: user.organizationId };
    return {
      organizationId: user.organizationId,
      OR: [{ projectManagerId: user.id }, { members: { some: { userId: user.id } } }],
    };
  }

  /** Where-clause for submissions (progress/DPR/MR) visible to the user. */
  submissionWhere(user: RequestUser): { organizationId: string; project?: Prisma.ProjectWhereInput } {
    if (isCompanyWide(user.roleKey)) return { organizationId: user.organizationId };
    return { organizationId: user.organizationId, project: this.projectWhere(user) };
  }

  async assertCanAccessProject(user: RequestUser, projectId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, ...this.projectWhere(user) }, select: { id: true } });
    if (!project) throw new NotFoundException('Project not found or not accessible');
    return project;
  }

  /**
   * Inverse of the visibility rule: every active user who may approve submissions of this project
   * (company-wide approvers plus approvers who manage or are a member of it). With a submission type (and amount),
   * only the roles the organisation's approval matrix allows for it; without one, the fixed approver roles.
   */
  async approversForProject(organizationId: string, projectId: string, type?: SubmissionType, amount: Prisma.Decimal | null = null) {
    const roleKeys = type ? await this.rights.roleKeysFor(organizationId, type, amount) : APPROVER_ROLES;
    return this.prisma.user.findMany({
      where: {
        organizationId,
        isActive: true,
        role: { key: { in: roleKeys } },
        OR: [
          { role: { key: { in: COMPANY_WIDE_ROLES } } },
          { managedProjects: { some: { id: projectId } } },
          { memberships: { some: { projectId } } },
        ],
      },
      select: { id: true, email: true, fullName: true },
    });
  }

  async assertCanApprove(user: RequestUser, projectId: string) {
    if (!canApprove(user.roleKey)) throw new ForbiddenException('Your role cannot approve submissions');
    await this.assertCanAccessProject(user, projectId);
  }

  /** Review a submission: the approval matrix must give the user's role this type, up to this amount. */
  async assertCanApproveSubmission(user: RequestUser, type: SubmissionType, id: string, projectId: string) {
    const right = (await this.rights.rightsFor(user.organizationId, user.roleKey)).find((r) => r.type === type);
    if (!right) throw new ForbiddenException('Your role cannot approve this type of submission');
    const amount = await this.rights.amountOf(type, id);
    if (!ApprovalRightsService.within(right, type, amount)) {
      throw new ForbiddenException(`This needs a higher approver: ₹${amount!.toFixed(2)} is above your limit of ₹${right.maxAmount}`);
    }
    await this.assertCanAccessProject(user, projectId);
  }

  /** Record or correct attendance: a recorder role with access to the project. */
  async assertCanRecordAttendance(user: RequestUser, projectId: string) {
    if (!canRecordAttendance(user.roleKey)) throw new ForbiddenException('Your role cannot record attendance');
    await this.assertCanAccessProject(user, projectId);
  }

  /** Receive (GRN) and issue material: a stock-keeper role with access to the project. */
  async assertCanKeepStock(user: RequestUser, projectId: string) {
    if (!canKeepStock(user.roleKey)) throw new ForbiddenException('Your role cannot record stock receipts or issues');
    await this.assertCanAccessProject(user, projectId);
  }

  /** Adjust stock or delete a stock entry: an approver with access to the project. */
  async assertCanAdjustStock(user: RequestUser, projectId: string) {
    if (!canAdjustStock(user.roleKey)) throw new ForbiddenException('Only an approver can adjust stock or delete stock entries');
    await this.assertCanAccessProject(user, projectId);
  }

  /** Item master and minimum levels: the store manager or an approver (with access to the project, when one is given). */
  async assertCanManageStore(user: RequestUser, projectId?: string) {
    if (!canManageStore(user.roleKey)) throw new ForbiddenException('Only the store manager or an approver can change the item master or minimum levels');
    if (projectId) await this.assertCanAccessProject(user, projectId);
  }

  /** File or edit a machinery log: a logger role with access to the project. */
  async assertCanLogMachinery(user: RequestUser, projectId: string) {
    if (!canLogMachinery(user.roleKey)) throw new ForbiddenException('Your role cannot log machinery');
    await this.assertCanAccessProject(user, projectId);
  }

  /** File or edit a site expense: an expense role with access to the project. */
  async assertCanSubmitExpense(user: RequestUser, projectId: string) {
    if (!canSubmitExpense(user.roleKey)) throw new ForbiddenException('Your role cannot file site expenses');
    await this.assertCanAccessProject(user, projectId);
  }

  /** Record a measurement book entry: a measuring role with access to the project. */
  async assertCanMeasure(user: RequestUser, projectId: string) {
    if (!canMeasure(user.roleKey)) throw new ForbiddenException('Your role cannot record measurements');
    await this.assertCanAccessProject(user, projectId);
  }

  /** Request an inspection: site staff, QA/QC or an approver with access to the project. */
  async assertCanRequestInspection(user: RequestUser, projectId: string) {
    if (!canRequestInspection(user.roleKey)) throw new ForbiddenException('Your role cannot request inspections');
    await this.assertCanAccessProject(user, projectId);
  }

  /** Record a quality test: site staff, QA/QC or an approver with access to the project. */
  async assertCanRecordTest(user: RequestUser, projectId: string) {
    if (!canRecordTest(user.roleKey)) throw new ForbiddenException('Your role cannot record quality tests');
    await this.assertCanAccessProject(user, projectId);
  }

  /** Raise or close a non-conformance report: QA/QC or an approver with access to the project. */
  async assertCanRaiseNcr(user: RequestUser, projectId: string) {
    if (!canRaiseNcr(user.roleKey)) throw new ForbiddenException('Only QA/QC or an approver can raise or close an NCR');
    await this.assertCanAccessProject(user, projectId);
  }

  /** Who looks after quality on a project: whoever passes its inspections (QA/QC by default, per the approval matrix). */
  /** Add drawings and revisions, send transmittals: document control roles on the project. */
  async assertCanManageDocuments(user: RequestUser, projectId: string) {
    if (!canManageDocuments(user.roleKey)) throw new ForbiddenException('Your role cannot change the document register');
    await this.assertCanAccessProject(user, projectId);
  }

  /** Letters in and out are contractual: correspondence roles on the project. */
  async assertCanUseLetters(user: RequestUser, projectId?: string) {
    if (!canViewLetters(user.roleKey)) throw new ForbiddenException('Your role cannot see project correspondence');
    if (projectId) await this.assertCanAccessProject(user, projectId);
  }

  /** Staff master and holidays: staff admins (admin, management, HR). */
  assertCanViewMessageLog(user: RequestUser) {
    if (!canViewMessageLog(user.roleKey)) throw new ForbiddenException('Only management or an admin can see the message log');
  }

  assertCanManageStaff(user: RequestUser) {
    if (!canManageStaff(user.roleKey)) throw new ForbiddenException('Only HR, management or an admin can change staff records');
  }

  /**
   * Employees the user may see: staff admins see everyone; attendance recorders see the staff posted at their projects;
   * anyone else only themselves.
   */
  staffWhere(user: RequestUser): Prisma.EmployeeWhereInput {
    if (canManageStaff(user.roleKey)) return { organizationId: user.organizationId };
    if (canMarkStaff(user.roleKey)) return { organizationId: user.organizationId, OR: [{ userId: user.id }, { project: this.projectWhere(user) }] };
    return { organizationId: user.organizationId, userId: user.id };
  }

  /** Mark the staff register of a site: staff admins, or attendance recorders on the project. */
  async assertCanMarkStaff(user: RequestUser, projectId: string) {
    if (!canMarkStaff(user.roleKey)) throw new ForbiddenException('Your role cannot mark staff attendance');
    await this.assertCanAccessProject(user, projectId);
  }

  /** Approve or reject leave: a staff admin, or the manager of the project the employee is posted at; never their own. */
  canDecideLeave(user: RequestUser, employee: { userId: string | null; project: { projectManagerId: string | null } | null }) {
    if (employee.userId === user.id) return false;
    return canManageStaff(user.roleKey) || (!!employee.project && employee.project.projectManagerId === user.id);
  }

  /** Leave waiting on this user: the same rule as canDecideLeave, as a where-clause on the employee. */
  leaveDeciderWhere(user: RequestUser): Prisma.EmployeeWhereInput {
    const notSelf: Prisma.EmployeeWhereInput = { OR: [{ userId: null }, { userId: { not: user.id } }] };
    if (canManageStaff(user.roleKey)) return notSelf;
    return { AND: [notSelf, { project: { projectManagerId: user.id } }] };
  }

  /** Who decides an employee's leave: HR managers and the manager of their site (admins and management when there is no HR). */
  async leaveApprovers(organizationId: string, projectId: string | null) {
    const pm = projectId ? (await this.prisma.project.findUnique({ where: { id: projectId }, select: { projectManagerId: true } }))?.projectManagerId : null;
    const hr = await this.prisma.user.findMany({ where: { organizationId, isActive: true, role: { key: 'HR_MANAGER' } }, select: { id: true } });
    const ids = hr.map((u) => u.id);
    if (!ids.length) {
      const admins = await this.prisma.user.findMany({ where: { organizationId, isActive: true, role: { key: { in: ['ADMIN', 'MANAGEMENT'] } } }, select: { id: true } });
      ids.push(...admins.map((u) => u.id));
    }
    if (pm) ids.push(pm);
    return [...new Set(ids)];
  }

  /** Everyone on a project: its manager and members. */
  async projectPeople(projectId: string) {
    const p = await this.prisma.project.findUnique({ where: { id: projectId }, select: { projectManagerId: true, members: { select: { userId: true } } } });
    if (!p) return [];
    return [...new Set([...(p.projectManagerId ? [p.projectManagerId] : []), ...p.members.map((m) => m.userId)])];
  }

  async qualityWatchers(organizationId: string, projectId: string, { onProjectOnly = false } = {}) {
    const users = await this.approversForProject(organizationId, projectId, 'INSPECTION');
    if (!onProjectOnly) return users;
    // Routine reminders go to the people on the project, not to every company-wide approver.
    const onProject = await this.prisma.user.findMany({
      where: { id: { in: users.map((u) => u.id) }, OR: [{ managedProjects: { some: { id: projectId } } }, { memberships: { some: { projectId } } }] },
      select: { id: true },
    });
    const ids = new Set(onProject.map((u) => u.id));
    return users.filter((u) => ids.has(u.id));
  }

  /** Raise a delay or risk: a raiser role with access to the project. */
  async assertCanRaiseRisk(user: RequestUser, projectId: string) {
    if (!canRaiseRisk(user.roleKey)) throw new ForbiddenException('Your role cannot raise delays or risks');
    await this.assertCanAccessProject(user, projectId);
  }

  /** Equipment master (codes, rates, deployment): approvers only. */
  assertCanManageEquipment(user: RequestUser) {
    if (!canManageEquipment(user.roleKey)) throw new ForbiddenException('Only an approver can change the equipment master');
  }

  /** Who hears about low stock at a project: its store managers and its project manager. */
  async stockWatchersForProject(organizationId: string, projectId: string) {
    return this.prisma.user.findMany({
      where: {
        organizationId,
        isActive: true,
        OR: [{ managedProjects: { some: { id: projectId } } }, { role: { key: 'STORE_MANAGER' }, memberships: { some: { projectId } } }],
      },
      select: { id: true },
    });
  }
}
