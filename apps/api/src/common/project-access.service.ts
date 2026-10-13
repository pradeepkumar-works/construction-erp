import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { APPROVER_ROLES, COMPANY_WIDE_ROLES, isCompanyWide, canApprove, canRecordAttendance } from '@erp/shared';
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
}
