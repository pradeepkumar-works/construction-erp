import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { APPROVER_ROLES, type RoleKey, type SubmissionType, COMPANY_WIDE_ROLES, isCompanyWide, canAdjustStock, canApprove, canKeepStock, canLogMachinery, canManageEquipment, canManageStore, canMeasure, canRaiseRisk, canRecordAttendance, canRequestInspection, canSubmitExpense, canRecordTest, canRaiseNcr, canCheckGrn, canManageDocuments, canViewLetters, canManageStaff, canMarkStaff, canViewEmployeePrivate, canViewMessageLog, canReportSafety, canManageSafety, canIssuePpe, canManageMaintenance, canFreezeBaseline, canManageWorkers, canViewWorkers, canReportDefect, canCloseDefect, canManageHandover, CLIENT_GUEST_ROLES, isClientGuest, isGuest, isSupplier, canManageSupplierLogins, canCheckSupplierInvoices, canApproveSupplierChange } from '@erp/shared';
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

  /**
   * Where stock can come from for a material request (v6 item 106): the projects the user sees, and every central store
   * of the company, so a site asking for material sees what the store holds even when no one there is a member of it.
   * Only the balance is shown; sending still needs a stock keeper of the store.
   */
  stockSourceWhere(user: RequestUser): Prisma.ProjectWhereInput {
    return { organizationId: user.organizationId, OR: [this.projectWhere(user), { type: 'STORE' }] };
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
  async approversForProject(organizationId: string, projectId: string, type?: SubmissionType, amount: Prisma.Decimal | null = null, level = 1) {
    return this.usersWithRoles(organizationId, projectId, type ? await this.rights.roleKeysFor(organizationId, type, amount, level) : APPROVER_ROLES);
  }

  /** Active users of these roles who see the project (company-wide roles, its manager and its members). */
  async usersWithRoles(organizationId: string, projectId: string, roleKeys: RoleKey[]) {
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

  /**
   * Review a submission: the approval matrix must give the user's role this type at the level the entry waits at, up
   * to its amount (or the entry escalated to the role); one person approves only one level of an entry (v5 item 94).
   */
  async assertCanApproveSubmission(user: RequestUser, type: SubmissionType, id: string, projectId: string) {
    await this.assertCanAccessProject(user, projectId);
    const decision = await this.rights.decide(user, await this.rights.entryOf(type, id));
    if (!decision.ok) throw new ForbiddenException(decision.reason!.replace(/\.$/, ''));
    return decision;
  }

  /** Record or correct attendance: a recorder role with access to the project. */
  async assertCanRecordAttendance(user: RequestUser, projectId: string) {
    if (!canRecordAttendance(user.roleKey)) throw new ForbiddenException('Your role cannot record attendance');
    await this.assertCanAccessProject(user, projectId);
  }

  /** Keep the named worker register and mark the roll call: an attendance recorder with access to the project. */
  async assertCanManageWorkers(user: RequestUser, projectId: string | null) {
    if (!canManageWorkers(user.roleKey)) throw new ForbiddenException('Your role cannot keep the worker register');
    if (projectId) await this.assertCanAccessProject(user, projectId);
  }

  /** See workers, the muster and output per man-day of a project. */
  async assertCanViewWorkers(user: RequestUser, projectId: string | null) {
    if (!canViewWorkers(user.roleKey)) throw new ForbiddenException('Your role cannot see the worker register');
    if (projectId) await this.assertCanAccessProject(user, projectId);
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

  /** Accept or reject material received on a GRN: QA/QC or an approver with access to the project. */
  async assertCanCheckGrn(user: RequestUser, projectId: string) {
    if (!canCheckGrn(user.roleKey)) throw new ForbiddenException('Only QA/QC or an approver can accept or reject material received');
    await this.assertCanAccessProject(user, projectId);
  }

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

  /**
   * The client portal: certify a bill or record attending an inspection. Only the client's engineer or the consultant,
   * and only on projects they are a member of (guests are never company-wide).
   */
  async assertCanActAsClient(user: RequestUser, projectId: string) {
    if (!isClientGuest(user.roleKey)) throw new ForbiddenException("Only the client's engineer or the consultant does this, from the client portal");
    await this.assertCanAccessProject(user, projectId);
  }

  /** The client's engineers and consultants on a project: told when a bill is sent or an inspection requested. */
  projectGuests(organizationId: string, projectId: string) {
    return this.prisma.user.findMany({
      where: { organizationId, isActive: true, role: { key: { in: CLIENT_GUEST_ROLES } }, OR: [{ managedProjects: { some: { id: projectId } } }, { memberships: { some: { projectId } } }] },
      select: { id: true, fullName: true },
    });
  }

  /** A supplier-portal login (v6 item 105): the vendor it acts for. Everything it sees is that vendor's. */
  supplierVendor(user: RequestUser): string {
    if (!isSupplier(user.roleKey) || !user.vendorId) throw new ForbiddenException('The supplier portal is for supplier accounts');
    return user.vendorId;
  }

  /** Give a vendor's people supplier-portal logins, and see what they send. */
  assertCanManageSupplierLogins(user: RequestUser) {
    if (!canManageSupplierLogins(user.roleKey)) throw new ForbiddenException('Only admin, management, procurement or accounts manage supplier logins');
  }

  /** Turn a supplier's invoice into a bill, or return it. */
  assertCanCheckSupplierInvoices(user: RequestUser) {
    if (!canCheckSupplierInvoices(user.roleKey)) throw new ForbiddenException('Only those who record vendor bills check supplier invoices');
  }

  /** Approve or turn down a change to a vendor's details a supplier asked for; a new bank account needs one who pays vendors. */
  assertCanDecideSupplierChange(user: RequestUser, bank: boolean) {
    if (!canApproveSupplierChange(user.roleKey, bank)) throw new ForbiddenException(bank ? 'Only admin, management or accounts approve a new bank account' : 'Only admin, management, procurement or accounts approve a supplier’s changes');
  }

  /** Active users of these company-wide roles, for supplier-portal notices to the office. */
  companyUsersWithRoles(organizationId: string, roleKeys: RoleKey[]) {
    return this.prisma.user.findMany({ where: { organizationId, isActive: true, role: { key: { in: roleKeys } } }, select: { id: true } });
  }

  assertCanViewMessageLog(user: RequestUser) {
    if (!canViewMessageLog(user.roleKey)) throw new ForbiddenException('Only management or an admin can see the message log');
  }

  /** Staff master and holidays: staff admins (admin, management, HR). */
  assertCanManageStaff(user: RequestUser) {
    if (!canManageStaff(user.roleKey)) throw new ForbiddenException('Only HR, management or an admin can change staff records');
  }

  /**
   * Employees the user may see: staff admins see everyone; attendance recorders see the staff posted at their projects;
   * anyone else only themselves.
   */
  staffWhere(user: RequestUser): Prisma.EmployeeWhereInput {
    // Payroll (accounts) sees every employee too, for salaries and bank details (v6 item 99).
    if (canManageStaff(user.roleKey) || canViewEmployeePrivate(user.roleKey)) return { organizationId: user.organizationId };
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

  /** Who looks after quality on a project: whoever passes its inspections (QA/QC by default, per the approval matrix). */
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

  /** Report a breakdown: a machinery logger with access to the machine's project; for a machine in the yard, a maintenance manager. */
  async assertCanReportBreakdown(user: RequestUser, projectId: string | null) {
    if (!projectId) return this.assertCanManageMaintenance(user, null);
    if (!canLogMachinery(user.roleKey) && !canManageMaintenance(user.roleKey)) throw new ForbiddenException('Your role cannot report breakdowns');
    await this.assertCanAccessProject(user, projectId);
  }

  /** Raise or close job cards, issue spares, keep vehicle papers and drivers: the store manager or an approver (with access to the machine's project). */
  async assertCanManageMaintenance(user: RequestUser, projectId: string | null) {
    if (!canManageMaintenance(user.roleKey)) throw new ForbiddenException('Only the store manager or an approver can do this');
    if (projectId) await this.assertCanAccessProject(user, projectId);
  }

  /** Freeze or replace a project's schedule baseline: the project's managers, with access to the project. */
  async assertCanFreezeBaseline(user: RequestUser, projectId: string) {
    if (!canFreezeBaseline(user.roleKey)) throw new ForbiddenException('Only a project manager, management or an admin can freeze the baseline');
    await this.assertCanAccessProject(user, projectId);
  }

  /** Snags, defects and the handover page: the company's own people (not the client's engineers) with access to the project. */
  handoverWhere(user: RequestUser): { organizationId: string; project?: Prisma.ProjectWhereInput } {
    if (isGuest(user.roleKey)) throw new ForbiddenException('Snags and defects are kept by the contractor');
    return this.submissionWhere(user);
  }

  async assertCanViewHandover(user: RequestUser, projectId: string) {
    this.handoverWhere(user);
    await this.assertCanAccessProject(user, projectId);
  }

  /** Report a snag or defect, or mark one fixed: site and office staff on the project. */
  async assertCanReportDefect(user: RequestUser, projectId: string) {
    if (!canReportDefect(user.roleKey)) throw new ForbiddenException('Your role cannot report snags or defects');
    await this.assertCanAccessProject(user, projectId);
  }

  /** Accept (close) or reopen a fixed snag or defect, or delete one: QA/QC or an approver on the project. */
  async assertCanCloseDefect(user: RequestUser, projectId: string) {
    if (!canCloseDefect(user.roleKey)) throw new ForbiddenException('Only QA/QC or an approver can close or reopen a snag or defect');
    await this.assertCanAccessProject(user, projectId);
  }

  /** Record the completion certificate and keep the close-out checklist: the project's approvers. */
  async assertCanManageHandover(user: RequestUser, projectId: string) {
    if (!canManageHandover(user.roleKey)) throw new ForbiddenException('Only a project manager, management or an admin can record the handover');
    await this.assertCanAccessProject(user, projectId);
  }

  /** Job cards a user sees: company-wide roles all; others those at their projects, plus machines in the yard for maintenance managers. */
  maintenanceWhere(user: RequestUser): Prisma.MaintenanceJobWhereInput {
    if (isCompanyWide(user.roleKey)) return { organizationId: user.organizationId };
    return {
      organizationId: user.organizationId,
      OR: [{ project: this.projectWhere(user) }, ...(canManageMaintenance(user.roleKey) ? [{ projectId: null }] : [])],
    };
  }

  /** Report an incident, record a toolbox talk or request a permit: site roles with access to the project. */
  async assertCanReportSafety(user: RequestUser, projectId: string) {
    if (!canReportSafety(user.roleKey)) throw new ForbiddenException('Your role cannot record safety entries');
    await this.assertCanAccessProject(user, projectId);
  }

  /** Hand PPE to workers or take it back: the safety officer, stores, site staff or an approver, with access to the project. */
  async assertCanIssuePpe(user: RequestUser, projectId: string) {
    if (!canIssuePpe(user.roleKey)) throw new ForbiddenException('Your role cannot issue PPE');
    await this.assertCanAccessProject(user, projectId);
  }

  /** Issue or reject a permit, close an incident: the safety officer or an approver, with access to the project. */
  async assertCanManageSafety(user: RequestUser, projectId: string) {
    if (!canManageSafety(user.roleKey)) throw new ForbiddenException('Only the safety officer or an approver can do this');
    await this.assertCanAccessProject(user, projectId);
  }

  /**
   * Who hears about safety at a project: its safety officers always, and (with `approvers`) the approvers who see it.
   */
  async safetyWatchersForProject(organizationId: string, projectId: string, approvers: boolean) {
    const officers = await this.prisma.user.findMany({
      where: { organizationId, isActive: true, role: { key: 'SAFETY_OFFICER' }, OR: [{ managedProjects: { some: { id: projectId } } }, { memberships: { some: { projectId } } }] },
      select: { id: true },
    });
    const others = approvers ? await this.approversForProject(organizationId, projectId) : [];
    return [...new Set([...officers, ...others].map((u) => u.id))];
  }

  /** Who hears about a machine's breakdown and its papers: the project's manager and store managers; for a machine in the yard, store managers and admins. */
  async maintenanceWatchers(organizationId: string, projectId: string | null): Promise<string[]> {
    const users = projectId
      ? await this.stockWatchersForProject(organizationId, projectId)
      : await this.prisma.user.findMany({ where: { organizationId, isActive: true, role: { key: { in: ['STORE_MANAGER', 'ADMIN'] } } }, select: { id: true } });
    return users.map((u) => u.id);
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
