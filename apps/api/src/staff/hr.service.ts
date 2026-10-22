import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  EMPLOYEE_EVENT_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  ROLE_LABELS,
  canManageStaff,
  canViewEmployeePrivate,
  isExitEvent,
  type AttachmentDto,
  type EmployeeEventDto,
  type EmployeeLetterDto,
  type HeadcountRowDto,
  type HrDashboardDto,
  type HrPersonRowDto,
  type Paginated,
  type RoleKey,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { AttachmentsService, ATTACHMENT_FIELDS } from '../common/attachments.service';
import { todayIn } from '../notifications/time';
import { dateOnly, money, parseDate } from '../common/serialize';
import { pageArgs, paginated } from '../common/paging';
import { EmployeeDocumentsDto, ListEmployeeEventsQuery, RecordEmployeeEventDto } from './staff.dto';
import { nextLetterNo } from './staff.service';

const eventInclude = {
  employee: { select: { fullName: true, employeeCode: true, userId: true } },
  fromProject: { select: { name: true } },
  toProject: { select: { name: true } },
  createdBy: { select: { fullName: true, role: { select: { key: true } } } },
} satisfies Prisma.EmployeeEventInclude;
type EventRow = Prisma.EmployeeEventGetPayload<{ include: typeof eventInclude }>;

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const monthEnd = (d: string, plus = 0) => {
  const [y, m] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m + plus, 0)).toISOString().slice(0, 10);
};

/**
 * HR records (v6 item 99): the events of a person's service (joining, confirmation, transfer, promotion, increment,
 * warning, exit) each with its numbered letter, the employee's documents, and the HR dashboard. Recording an event
 * changes the staff record the same way, in one transaction. Staff admins record; payroll and the person read.
 */
@Injectable()
export class HrService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private attachments: AttachmentsService,
  ) {}

  private toEventDto(e: EventRow, user: RequestUser): EmployeeEventDto {
    const money_ = canViewEmployeePrivate(user.roleKey) || e.employee.userId === user.id;
    return {
      id: e.id,
      employeeId: e.employeeId,
      employeeName: e.employee.fullName,
      employeeCode: e.employee.employeeCode,
      type: e.type,
      effectiveDate: dateOnly(e.effectiveDate)!,
      letterNo: e.letterNo,
      fromProjectName: e.fromProject?.name ?? null,
      toProjectName: e.toProject?.name ?? null,
      fromDesignation: e.fromDesignation,
      toDesignation: e.toDesignation,
      fromDepartment: e.fromDepartment,
      toDepartment: e.toDepartment,
      fromCtc: money_ ? money(e.fromCtc) : null,
      toCtc: money_ ? money(e.toCtc) : null,
      noticeGivenOn: dateOnly(e.noticeGivenOn),
      note: e.note,
      createdByName: e.createdBy.fullName,
      createdAt: e.createdAt.toISOString(),
    };
  }

  /** Who may read a person's service history: staff admins, payroll and the person. */
  private eventWhere(user: RequestUser): Prisma.EmployeeEventWhereInput {
    if (canManageStaff(user.roleKey) || canViewEmployeePrivate(user.roleKey)) return { organizationId: user.organizationId };
    return { organizationId: user.organizationId, employee: { userId: user.id } };
  }

  private async employeeFor(user: RequestUser, id: string) {
    const e = await this.prisma.employee.findFirst({ where: { id, ...this.access.staffWhere(user) } });
    if (!e) throw new NotFoundException('Employee not found');
    return e;
  }

  async listEvents(user: RequestUser, q: ListEmployeeEventsQuery): Promise<Paginated<EmployeeEventDto>> {
    const where: Prisma.EmployeeEventWhereInput = {
      ...this.eventWhere(user),
      ...(q.employeeId ? { employeeId: q.employeeId } : {}),
      ...(q.type ? { type: q.type } : {}),
      ...(q.from || q.to ? { effectiveDate: { ...(q.from ? { gte: parseDate(q.from) } : {}), ...(q.to ? { lte: parseDate(q.to) } : {}) } } : {}),
    };
    const args = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.employeeEvent.findMany({ where, include: eventInclude, orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }], skip: args.skip, take: args.take }),
      this.prisma.employeeEvent.count({ where }),
    ]);
    return paginated(rows.map((r) => this.toEventDto(r, user)), total, args);
  }

  /** Record an event and change the staff record to match: posting, designation, CTC, confirmation or last working day. */
  async recordEvent(user: RequestUser, employeeId: string, dto: RecordEmployeeEventDto): Promise<EmployeeEventDto> {
    this.access.assertCanManageStaff(user);
    const e = await this.employeeFor(user, employeeId);
    if (!e.isActive) throw new BadRequestException(`${e.fullName} has left. Bring them back on the staff record before recording anything else.`);
    const joined = dateOnly(e.joinedOn);
    if (joined && dto.effectiveDate < joined) throw new BadRequestException(`The date is before ${e.fullName} joined (${joined}). Check the date.`);
    const toCtc = dto.toCtc === undefined || dto.toCtc === null ? null : new Prisma.Decimal(dto.toCtc);
    const change: Prisma.EmployeeUncheckedUpdateInput = {};
    const event: Partial<Prisma.EmployeeEventUncheckedCreateInput> = {};
    switch (dto.type) {
      case 'CONFIRMED':
        if (e.confirmedOn) throw new BadRequestException(`${e.fullName} was already confirmed on ${dateOnly(e.confirmedOn)}`);
        change.confirmedOn = parseDate(dto.effectiveDate);
        if (e.employmentType === 'PROBATION' || !e.employmentType) change.employmentType = 'PERMANENT';
        break;
      case 'TRANSFERRED': {
        if (dto.toProjectId === undefined) throw new BadRequestException('Choose where they are transferred to (blank for head office)');
        if (dto.toProjectId && !(await this.prisma.project.findFirst({ where: { id: dto.toProjectId, organizationId: user.organizationId }, select: { id: true } }))) throw new BadRequestException('Project not found');
        if ((dto.toProjectId ?? null) === e.projectId) throw new BadRequestException(`${e.fullName} is already posted there. Choose another site.`);
        Object.assign(event, { fromProjectId: e.projectId, toProjectId: dto.toProjectId ?? null });
        change.projectId = dto.toProjectId ?? null;
        break;
      }
      case 'PROMOTED':
        if (!dto.toDesignation) throw new BadRequestException('Enter the new designation');
        break;
      case 'INCREMENT':
        if (!toCtc) throw new BadRequestException('Enter the new cost to company a year');
        if (e.ctcAnnual && toCtc.lte(e.ctcAnnual)) throw new BadRequestException(`The new CTC must be more than the present one (₹${e.ctcAnnual.toFixed(0)} a year)`);
        break;
      case 'WARNING':
        if (!dto.note) throw new BadRequestException('Write what the warning is about');
        break;
      case 'RESIGNED':
      case 'TERMINATED':
      case 'RETIRED':
        change.leftOn = parseDate(dto.effectiveDate);
        change.isActive = false;
        change.exitReason = dto.note ?? EMPLOYEE_EVENT_LABELS[dto.type];
        if (dto.type === 'RESIGNED' && dto.noticeGivenOn) {
          if (dto.noticeGivenOn > dto.effectiveDate) throw new BadRequestException('The resignation must be handed in on or before the last working day');
          event.noticeGivenOn = parseDate(dto.noticeGivenOn);
        }
        break;
    }
    if (dto.toDesignation && dto.toDesignation !== e.designation) {
      Object.assign(event, { fromDesignation: e.designation, toDesignation: dto.toDesignation });
      change.designation = dto.toDesignation;
    }
    if (dto.toDepartment !== undefined && (dto.toDepartment || null) !== e.department) {
      Object.assign(event, { fromDepartment: e.department, toDepartment: dto.toDepartment || null });
      change.department = dto.toDepartment || null;
    }
    if (toCtc && (dto.type === 'INCREMENT' || dto.type === 'PROMOTED')) {
      Object.assign(event, { fromCtc: e.ctcAnnual, toCtc });
      change.ctcAnnual = toCtc;
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.employeeEvent.create({
        data: {
          organizationId: user.organizationId,
          employeeId,
          type: dto.type,
          effectiveDate: parseDate(dto.effectiveDate),
          letterNo: await nextLetterNo(tx, user.organizationId, dto.effectiveDate),
          note: dto.note || null,
          createdById: user.id,
          ...event,
        },
        include: eventInclude,
      });
      // A future transfer or exit still changes the record now: the register and payroll read the dates.
      if (Object.keys(change).length) await tx.employee.update({ where: { id: employeeId }, data: change });
      return row;
    });
    await this.audit.log(user, 'EMPLOYEE', employeeId, isExitEvent(dto.type) ? 'LEFT' : 'UPDATED', `${EMPLOYEE_EVENT_LABELS[dto.type]} from ${dto.effectiveDate} (${created.letterNo})`);
    return this.toEventDto(created, user);
  }

  /** Undo the latest event of a person, when it was recorded by mistake: the staff record goes back as it was. */
  async removeEvent(user: RequestUser, id: string) {
    this.access.assertCanManageStaff(user);
    const ev = await this.prisma.employeeEvent.findFirst({ where: { id, organizationId: user.organizationId }, include: eventInclude });
    if (!ev) throw new NotFoundException('Event not found');
    const latest = await this.prisma.employeeEvent.findFirst({ where: { employeeId: ev.employeeId }, orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }], select: { id: true } });
    if (latest?.id !== ev.id) throw new BadRequestException('Only the latest event can be taken back. Take back the later ones first.');
    if (ev.type === 'JOINED') throw new BadRequestException('The joining cannot be taken back. Change the joining date on the staff record.');
    const back: Prisma.EmployeeUncheckedUpdateInput = {};
    if (ev.type === 'CONFIRMED') back.confirmedOn = null;
    if (ev.type === 'TRANSFERRED') back.projectId = ev.fromProjectId;
    if (ev.fromDesignation) back.designation = ev.fromDesignation;
    if (ev.fromDepartment !== null || ev.toDepartment !== null) back.department = ev.fromDepartment;
    if (ev.toCtc) back.ctcAnnual = ev.fromCtc;
    if (isExitEvent(ev.type)) Object.assign(back, { leftOn: null, isActive: true, exitReason: null });
    await this.prisma.$transaction([this.prisma.employeeEvent.delete({ where: { id } }), this.prisma.employee.update({ where: { id: ev.employeeId }, data: back })]);
    await this.audit.log(user, 'EMPLOYEE', ev.employeeId, 'UPDATED', `${EMPLOYEE_EVENT_LABELS[ev.type]} ${ev.letterNo} taken back`);
    return { ok: true };
  }

  /** What an event's letter needs: the company, the person as they are on the record, and who signs. */
  async letter(user: RequestUser, id: string): Promise<EmployeeLetterDto> {
    const ev = await this.prisma.employeeEvent.findFirst({ where: { id, ...this.eventWhere(user) }, include: eventInclude });
    if (!ev) throw new NotFoundException('Letter not found');
    const [org, e] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: user.organizationId }, select: { name: true, billingAddress: true } }),
      this.prisma.employee.findUnique({ where: { id: ev.employeeId }, include: { project: { select: { name: true } } } }),
    ]);
    return {
      event: this.toEventDto(ev, user),
      company: { name: org!.name, address: org!.billingAddress },
      employee: {
        fullName: e!.fullName,
        employeeCode: e!.employeeCode,
        designation: e!.designation,
        department: e!.department,
        address: canViewEmployeePrivate(user.roleKey) || e!.userId === user.id ? e!.address : null,
        fatherOrSpouseName: e!.fatherOrSpouseName,
        joinedOn: dateOnly(e!.joinedOn),
        leftOn: dateOnly(e!.leftOn),
        postedAt: e!.project?.name ?? null,
        probationEndsOn: dateOnly(e!.probationEndsOn),
        noticeDays: e!.noticeDays,
      },
      signedBy: { name: ev.createdBy.fullName, title: ROLE_LABELS[ev.createdBy.role.key as RoleKey] ?? 'Authorised signatory' },
    };
  }

  /* ---------- documents ---------- */

  async documents(user: RequestUser, employeeId: string): Promise<AttachmentDto[]> {
    const e = await this.employeeFor(user, employeeId);
    if (!canManageStaff(user.roleKey) && !canViewEmployeePrivate(user.roleKey) && e.userId !== user.id) throw new ForbiddenException('Only HR, payroll and the person themselves see their documents');
    const rows = await this.prisma.attachment.findMany({ where: { employeeId, organizationId: user.organizationId }, select: ATTACHMENT_FIELDS, orderBy: { createdAt: 'asc' } });
    return rows.map((a) => this.attachments.toDto(a));
  }

  async setDocuments(user: RequestUser, employeeId: string, dto: EmployeeDocumentsDto): Promise<AttachmentDto[]> {
    this.access.assertCanManageStaff(user);
    await this.employeeFor(user, employeeId);
    await this.attachments.sync(user, 'employeeId', employeeId, dto.attachmentIds);
    await this.audit.log(user, 'EMPLOYEE', employeeId, 'UPDATED', `Documents: ${dto.attachmentIds.length}`);
    return this.documents(user, employeeId);
  }

  /* ---------- dashboard ---------- */

  /** Head count by site, department and type, the month's joiners and leavers, probation due, birthdays and anniversaries. */
  async dashboard(user: RequestUser): Promise<HrDashboardDto> {
    if (!canManageStaff(user.roleKey) && !canViewEmployeePrivate(user.roleKey)) throw new ForbiddenException('The HR dashboard is for HR, payroll, management and admins');
    const today = todayIn();
    const monthStart = `${today.slice(0, 7)}-01`;
    const org = user.organizationId;
    const select = { id: true, fullName: true, employeeCode: true, designation: true, department: true, employmentType: true, joinedOn: true, leftOn: true, dateOfBirth: true, probationEndsOn: true, confirmedOn: true, pan: true, uan: true, bankAccountNo: true, project: { select: { name: true } } } as const;
    const [active, left] = await Promise.all([
      this.prisma.employee.findMany({ where: { organizationId: org, isActive: true }, select, orderBy: { fullName: 'asc' } }),
      this.prisma.employee.findMany({ where: { organizationId: org, leftOn: { gte: parseDate(monthStart), lte: parseDate(monthEnd(today)) } }, select, orderBy: { leftOn: 'asc' } }),
    ]);
    const row = (e: (typeof active)[number], date: string, years?: number): HrPersonRowDto => ({ employeeId: e.id, fullName: e.fullName, employeeCode: e.employeeCode, designation: e.designation, projectName: e.project?.name ?? null, date, ...(years !== undefined ? { years } : {}) });
    const tally = (key: (e: (typeof active)[number]) => [string, string]): HeadcountRowDto[] => {
      const m = new Map<string, HeadcountRowDto>();
      for (const e of active) {
        const [k, label] = key(e);
        const r = m.get(k) ?? { key: k, label, count: 0 };
        r.count += 1;
        m.set(k, r);
      }
      return [...m.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    };
    // Birthdays and anniversaries from today to the end of next month, in date order (the year does not matter).
    const until = monthEnd(today, 1);
    const upcoming = (d: Date | null): string | null => {
      if (!d) return null;
      const md = dateOnly(d)!.slice(5);
      for (const y of [Number(today.slice(0, 4)), Number(today.slice(0, 4)) + 1]) {
        const on = `${y}-${md}`;
        if (on >= today && on <= until) return on;
      }
      return null;
    };
    const birthdays: HrPersonRowDto[] = [];
    const anniversaries: HrPersonRowDto[] = [];
    for (const e of active) {
      const b = upcoming(e.dateOfBirth);
      if (b) birthdays.push(row(e, b));
      const a = upcoming(e.joinedOn);
      const years = a && e.joinedOn ? Number(a.slice(0, 4)) - e.joinedOn.getUTCFullYear() : 0;
      if (a && years > 0) anniversaries.push(row(e, a, years));
    }
    const soon = addDays(today, 30);
    return {
      date: today,
      active: active.length,
      bySite: tally((e) => [e.project?.name ?? '', e.project?.name ?? 'Head office']),
      byDepartment: tally((e) => [e.department ?? '', e.department ?? 'No department']),
      byType: tally((e) => [e.employmentType ?? '', e.employmentType ? EMPLOYMENT_TYPE_LABELS[e.employmentType] : 'Not set']),
      joinedThisMonth: active.filter((e) => e.joinedOn && dateOnly(e.joinedOn)! >= monthStart).map((e) => row(e, dateOnly(e.joinedOn)!)),
      leftThisMonth: left.map((e) => row(e, dateOnly(e.leftOn)!)),
      probationDue: active
        .filter((e) => e.probationEndsOn && !e.confirmedOn && dateOnly(e.probationEndsOn)! <= soon)
        .map((e) => row(e, dateOnly(e.probationEndsOn)!))
        .sort((a, b) => a.date.localeCompare(b.date)),
      birthdays: birthdays.sort((a, b) => a.date.localeCompare(b.date)),
      anniversaries: anniversaries.sort((a, b) => a.date.localeCompare(b.date)),
      missingDetails: active
        .map((e) => ({ employeeId: e.id, fullName: e.fullName, employeeCode: e.employeeCode, missing: [!e.pan && 'PAN', !e.uan && 'UAN', !e.bankAccountNo && 'bank account'].filter((x): x is string => !!x) }))
        .filter((m) => m.missing.length > 0),
    };
  }
}
