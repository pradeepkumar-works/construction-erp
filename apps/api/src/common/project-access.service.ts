import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { APPROVER_ROLES, COMPANY_WIDE_ROLES, isCompanyWide, canAdjustStock, canApprove, canKeepStock, canLogMachinery, canManageEquipment, canManageStore, canRecordAttendance, canSubmitExpense } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from './current-user';

/**
 * Central place for "which projects can this user see / act on".
 * Company-wide roles see every project in their organisation; others see projects they are a member of
 * or manage.
 */
@Injectable()
export class ProjectAccessService {
  constructor(private prisma: PrismaService) {}

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
   * (company-wide approvers plus project managers who manage or are a member of it).
   */
  async approversForProject(organizationId: string, projectId: string) {
    return this.prisma.user.findMany({
      where: {
        organizationId,
        isActive: true,
        role: { key: { in: APPROVER_ROLES } },
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
