import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  EMPLOYEE_EVENT_LABELS,
  EMPLOYEE_EVENT_LETTERS,
  EMPLOYMENT_TYPE_LABELS,
  ROLE_LABELS,
  canManageStaff,
  canViewEmployeePrivate,
  isExitEvent,
  letterTemplateFor,
  type AttachmentDto,
  type EmployeeEventDto,
  type EmployeeLetterDto,
  type HeadcountRowDto,
  type HrDashboardDto,
  type HrSiteRowDto,
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
import { EmployeeDocumentsService } from './employee-documents.service';
import { LetterTemplatesService } from './letter-templates.service';
import { structureForCtc } from '../payroll/payroll-rules';
import { toRulesSettings, toRulesStructure } from '../payroll/salary.service';

const eventInclude = {
  employee: { select: { fullName: true, employeeCode: true, userId: true } },
  fromProject: { select: { name: true } },
  toProject: { select: { name: true } },
  createdBy: { select: { fullName: true, role: { select: { key: true } } } },
} satisfies Prisma.EmployeeEventInclude;
type EventRow = Prisma.EmployeeEventGetPayload<{ include: typeof eventInclude }>;

/** The note on a salary structure an increment or promotion made: how it is found again when the event is taken back. */
const payNote = (type: 'INCREMENT' | 'PROMOTED', letterNo: string) => `${EMPLOYEE_EVENT_LETTERS[type]} ${letterNo}`;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const monthEnd = (d: string, plus = 0) => {
  const [y, m] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m + plus, 0)).toISOString().slice(0, 10);
};

/**
 * HR records: the events of a person's service (joining, confirmation, transfer, promotion, increment,
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
    private docs: EmployeeDocumentsService,
    private templates: LetterTemplatesService,
  ) {}

  private toEventDto(e: EventRow, user: RequestUser): EmployeeEventDto {
    const money_ = canViewEmployeePrivate(user.roleKey) || e.employee.userId === user.id;
    return {
      id: e.id,
      employeeId: e.employeeId,
      employeeName: e.employee.fullName,
      employeeCode: e.employee.employeeCode,
      type: e.type,
      effectiveDate: dateOnly(e.effectiveDate),
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
    if (joined && dto.effectiveDate < joined && dto.type !== 'OFFERED') throw new BadRequestException(`The date is before ${e.fullName} joined (${joined}). Check the date.`);
    const toCtc = dto.toCtc === undefined || dto.toCtc === null ? null : new Prisma.Decimal(dto.toCtc);
    const change: Prisma.EmployeeUncheckedUpdateInput = {};
    const event: Partial<Prisma.EmployeeEventUncheckedCreateInput> = {};
    switch (dto.type) {
      case 'OFFERED': {
        if (joined && dto.effectiveDate > joined) throw new BadRequestException(`The offer must be made on or before the joining date (${joined}). Check the date.`);
        if (await this.prisma.employeeEvent.findFirst({ where: { employeeId, type: 'OFFERED' }, select: { id: true } })) throw new BadRequestException(`${e.fullName} already has an offer letter. Take it back first to make a fresh offer.`);
        if (!toCtc) throw new BadRequestException('Enter the cost to company a year that is offered');
        const problem = await this.docs.letterProblem(employeeId, 'OFFERED');
        if (problem) throw new BadRequestException(problem);
        break;
      }
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
    if (toCtc && (dto.type === 'INCREMENT' || dto.type === 'PROMOTED' || dto.type === 'OFFERED')) {
      Object.assign(event, { fromCtc: e.ctcAnnual, toCtc });
      change.ctcAnnual = toCtc;
    }
    // An increment or a promotion with a new CTC changes the pay too, so payroll pays what the letter says.
    const pay = toCtc && (dto.type === 'INCREMENT' || dto.type === 'PROMOTED') ? await this.payFor(user.organizationId, e, dto.type, dto.effectiveDate, toCtc) : null;
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
      if (pay) await tx.salaryStructure.create({ data: { ...pay, organizationId: user.organizationId, createdById: user.id, note: payNote(dto.type as 'INCREMENT' | 'PROMOTED', row.letterNo) } });
      return row;
    });
    await this.audit.log(user, 'EMPLOYEE', employeeId, isExitEvent(dto.type) ? 'LEFT' : 'UPDATED', `${EMPLOYEE_EVENT_LABELS[dto.type]} from ${dto.effectiveDate} (${created.letterNo})${pay ? `, salary structure from the same date` : ''}`);
    return this.toEventDto(created, user);
  }

  /**
   * The salary structure an increment or a promotion brings from its date, grown from the one in force before it
   * (`structureForCtc`). None when they have no structure yet or HR already made one for that date in Salaries; refused
   * when that month's salary is already approved, as a structure made by hand would be.
   */
  private async payFor(orgId: string, e: { id: string; fullName: string }, type: 'INCREMENT' | 'PROMOTED', date: string, toCtc: Prisma.Decimal) {
    const from = parseDate(date);
    const [same, current, locked, settings] = await Promise.all([
      this.prisma.salaryStructure.findUnique({ where: { employeeId_effectiveFrom: { employeeId: e.id, effectiveFrom: from } }, select: { id: true } }),
      this.prisma.salaryStructure.findFirst({ where: { employeeId: e.id, effectiveFrom: { lt: from } }, orderBy: { effectiveFrom: 'desc' } }),
      this.prisma.payslip.findFirst({ where: { employeeId: e.id, run: { status: { in: ['APPROVED', 'PAID'] }, month: { gte: date.slice(0, 7) } } }, select: { run: { select: { month: true } } } }),
      this.prisma.payrollSettings.findUnique({ where: { organizationId: orgId } }),
    ]);
    if (same || !current) return null;
    if (locked) throw new BadRequestException(`${e.fullName}'s salary for ${locked.run.month} is already approved. Record the ${EMPLOYEE_EVENT_LABELS[type].toLowerCase()} from a later month.`);
    const next = structureForCtc(toRulesStructure(current), toCtc.toNumber(), toRulesSettings(settings));
    if (!next) return null;
    const { declaredDeductions, otherIncome, ...parts } = next;
    return { employeeId: e.id, effectiveFrom: from, ...parts, declaredDeductions, otherIncome } satisfies Omit<Prisma.SalaryStructureUncheckedCreateInput, 'organizationId' | 'createdById'>;
  }

  /** Undo the latest event of a person, when it was recorded by mistake: the staff record goes back as it was. */
  async removeEvent(user: RequestUser, id: string) {
    this.access.assertCanManageStaff(user);
    const ev = await this.prisma.employeeEvent.findFirst({ where: { id, organizationId: user.organizationId }, include: eventInclude });
    if (!ev) throw new NotFoundException('Event not found');
    // The joining is recorded with the staff record, so an offer counts as the latest while only the joining follows it.
    const latest = await this.prisma.employeeEvent.findFirst({ where: { employeeId: ev.employeeId, ...(ev.type === 'OFFERED' ? { type: { not: 'JOINED' } } : {}) }, orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }], select: { id: true } });
    if (latest?.id !== ev.id) throw new BadRequestException('Only the latest event can be taken back. Take back the later ones first.');
    if (ev.type === 'JOINED') throw new BadRequestException('The joining cannot be taken back. Change the joining date on the staff record.');
    if (isExitEvent(ev.type) && (await this.prisma.finalSettlement.findUnique({ where: { employeeId: ev.employeeId }, select: { id: true } })))
      throw new BadRequestException('Their full and final settlement is worked out. Delete it under Payroll first.');
    // The salary structure the increment or promotion made goes with it, unless salary has been worked out on it.
    const pay =
      ev.type === 'INCREMENT' || ev.type === 'PROMOTED'
        ? await this.prisma.salaryStructure.findFirst({ where: { employeeId: ev.employeeId, effectiveFrom: ev.effectiveDate, note: payNote(ev.type, ev.letterNo) }, select: { id: true, _count: { select: { payslips: true } } } })
        : null;
    if (pay?._count.payslips) throw new BadRequestException(`Salary has been worked out on the pay from this ${EMPLOYEE_EVENT_LABELS[ev.type].toLowerCase()}. Delete that salary run under Payroll first.`);
    const back: Prisma.EmployeeUncheckedUpdateInput = {};
    if (ev.type === 'CONFIRMED') back.confirmedOn = null;
    if (ev.type === 'TRANSFERRED') back.projectId = ev.fromProjectId;
    if (ev.fromDesignation) back.designation = ev.fromDesignation;
    if (ev.fromDepartment !== null || ev.toDepartment !== null) back.department = ev.fromDepartment;
    if (ev.toCtc) back.ctcAnnual = ev.fromCtc;
    if (isExitEvent(ev.type)) Object.assign(back, { leftOn: null, isActive: true, exitReason: null });
    await this.prisma.$transaction([
      this.prisma.employeeEvent.delete({ where: { id } }),
      this.prisma.employee.update({ where: { id: ev.employeeId }, data: back }),
      ...(pay ? [this.prisma.salaryStructure.delete({ where: { id: pay.id } })] : []),
    ]);
    await this.audit.log(user, 'EMPLOYEE', ev.employeeId, 'UPDATED', `${EMPLOYEE_EVENT_LABELS[ev.type]} ${ev.letterNo} taken back`);
    return { ok: true };
  }

  /** What an event's letter needs: the company, the person as they are on the record, and who signs. */
  async letter(user: RequestUser, id: string): Promise<EmployeeLetterDto> {
    const ev = await this.prisma.employeeEvent.findFirst({ where: { id, ...this.eventWhere(user) }, include: eventInclude });
    if (!ev) throw new NotFoundException('Letter not found');
    const held = await this.docs.letterProblem(ev.employeeId, ev.type);
    if (held) throw new BadRequestException(held);
    const exit = isExitEvent(ev.type);
    const [org, e, own] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: user.organizationId }, select: { name: true, billingAddress: true } }),
      this.prisma.employee.findUnique({ where: { id: ev.employeeId }, include: { project: { select: { name: true } } } }),
      this.templates.ownFor(user.organizationId, exit ? [ev.type, 'EXPERIENCE'] : [ev.type]),
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
      template: letterTemplateFor(ev.type, own),
      experienceTemplate: exit ? letterTemplateFor('EXPERIENCE', own) : null,
    };
  }

  async documents(user: RequestUser, employeeId: string): Promise<AttachmentDto[]> {
    const e = await this.employeeFor(user, employeeId);
    if (!canManageStaff(user.roleKey) && !canViewEmployeePrivate(user.roleKey) && e.userId !== user.id) throw new ForbiddenException('Only HR, payroll and the person themselves see their documents');
    const rows = await this.prisma.attachment.findMany({ where: { employeeId, organizationId: user.organizationId, joiningDocument: null }, select: ATTACHMENT_FIELDS, orderBy: { createdAt: 'asc' } });
    return rows.map((a) => this.attachments.toDto(a));
  }

  async setDocuments(user: RequestUser, employeeId: string, dto: EmployeeDocumentsDto): Promise<AttachmentDto[]> {
    this.access.assertCanManageStaff(user);
    await this.employeeFor(user, employeeId);
    // The joining documents' files stay: they leave only through the checklist.
    const joining = await this.prisma.employeeDocument.findMany({ where: { employeeId, attachmentId: { not: null } }, select: { attachmentId: true } });
    await this.attachments.sync(user, 'employeeId', employeeId, [...new Set([...dto.attachmentIds, ...joining.map((j) => j.attachmentId!)])]);
    await this.audit.log(user, 'EMPLOYEE', employeeId, 'UPDATED', `Documents: ${dto.attachmentIds.length}`);
    return this.documents(user, employeeId);
  }

  /** Head count by site, department and type, the month's joiners and leavers, probation due, birthdays and anniversaries. */
  async dashboard(user: RequestUser): Promise<HrDashboardDto> {
    if (!canManageStaff(user.roleKey) && !canViewEmployeePrivate(user.roleKey)) throw new ForbiddenException('The HR dashboard is for HR, payroll, management and admins');
    const today = todayIn();
    const monthStart = `${today.slice(0, 7)}-01`;
    const org = user.organizationId;
    const select = { id: true, fullName: true, employeeCode: true, designation: true, department: true, employmentType: true, joinedOn: true, leftOn: true, dateOfBirth: true, probationEndsOn: true, confirmedOn: true, pan: true, uan: true, bankAccountNo: true, projectId: true, project: { select: { name: true } } } as const;
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
      const md = dateOnly(d).slice(5);
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
    const papers = await this.docs.outstandingFor(org, active.map((e) => e.id));
    const { sites, costMonth } = await this.sitesToday(org, today, active, papers);
    return {
      date: today,
      active: active.length,
      bySite: tally((e) => [e.project?.name ?? '', e.project?.name ?? 'Head office']),
      byDepartment: tally((e) => [e.department ?? '', e.department ?? 'No department']),
      byType: tally((e) => [e.employmentType ?? '', e.employmentType ? EMPLOYMENT_TYPE_LABELS[e.employmentType] : 'Not set']),
      joinedThisMonth: active.filter((e) => e.joinedOn && dateOnly(e.joinedOn) >= monthStart).map((e) => row(e, dateOnly(e.joinedOn)!)),
      leftThisMonth: left.map((e) => row(e, dateOnly(e.leftOn)!)),
      probationDue: active
        .filter((e) => e.probationEndsOn && !e.confirmedOn && dateOnly(e.probationEndsOn) <= soon)
        .map((e) => row(e, dateOnly(e.probationEndsOn)!))
        .sort((a, b) => a.date.localeCompare(b.date)),
      birthdays: birthdays.sort((a, b) => a.date.localeCompare(b.date)),
      anniversaries: anniversaries.sort((a, b) => a.date.localeCompare(b.date)),
      missingDetails: active
        .map((e) => ({ employeeId: e.id, fullName: e.fullName, employeeCode: e.employeeCode, missing: [!e.pan && 'PAN', !e.uan && 'UAN', !e.bankAccountNo && 'bank account'].filter((x): x is string => !!x) }))
        .filter((m) => m.missing.length > 0),
      documentsPending: active.filter((e) => papers.has(e.id)).map((e) => ({ employeeId: e.id, fullName: e.fullName, employeeCode: e.employeeCode, missing: papers.get(e.id)! })),
      sites,
      costMonth,
    };
  }

  /**
   * Each site's staff today, by where they are posted: present (half days count), on approved leave, absent and not
   * marked, the same rule as the People figures; with the last settled salary month's cost and the papers outstanding.
   */
  private async sitesToday(org: string, today: string, active: { id: string; projectId: string | null; project: { name: string } | null }[], papers: Map<string, string[]>) {
    const day = parseDate(today);
    const ids = active.map((e) => e.id);
    const [marks, leave, lastRun] = await Promise.all([
      this.prisma.staffAttendance.findMany({ where: { organizationId: org, date: day, employeeId: { in: ids } }, select: { employeeId: true, status: true } }),
      this.prisma.leaveRequest.findMany({ where: { organizationId: org, status: 'APPROVED', fromDate: { lte: day }, toDate: { gte: day }, employeeId: { in: ids } }, select: { employeeId: true } }),
      this.prisma.payrollRun.findFirst({ where: { organizationId: org, status: { in: ['APPROVED', 'PAID'] } }, orderBy: { month: 'desc' }, select: { month: true } }),
    ]);
    const costMonth = lastRun?.month ?? null;
    const slips = costMonth
      ? await this.prisma.payslip.findMany({ where: { organizationId: org, run: { month: costMonth, status: { in: ['APPROVED', 'PAID'] } } }, select: { projectId: true, gross: true, employerCost: true } })
      : [];
    const status = new Map(marks.map((m) => [m.employeeId, m.status]));
    const away = new Set(leave.map((l) => l.employeeId));
    const rows = new Map<string, HrSiteRowDto & { costN: number }>();
    const rowFor = (projectId: string | null, label: string) => {
      const k = projectId ?? '';
      const r = rows.get(k) ?? { projectId, label, onRoll: 0, present: 0, onLeave: 0, absent: 0, notMarked: 0, cost: null, papersPending: 0, costN: 0 };
      rows.set(k, r);
      return r;
    };
    for (const e of active) {
      const r = rowFor(e.projectId, e.project?.name ?? 'Head office');
      r.onRoll += 1;
      const st = status.get(e.id);
      if (st === 'ABSENT') r.absent += 1;
      else if (st) r.present += 1;
      else if (away.has(e.id)) r.onLeave += 1;
      else r.notMarked += 1;
      if (papers.has(e.id)) r.papersPending += 1;
    }
    const names = new Map(active.filter((e) => e.projectId).map((e) => [e.projectId!, e.project!.name]));
    if (slips.some((s) => s.projectId && !names.has(s.projectId))) {
      const more = await this.prisma.project.findMany({ where: { id: { in: slips.map((s) => s.projectId!).filter((p) => p && !names.has(p)) } }, select: { id: true, name: true } });
      for (const p of more) names.set(p.id, p.name);
    }
    for (const s of slips) rowFor(s.projectId, s.projectId ? (names.get(s.projectId) ?? 'Another site') : 'Head office').costN += Number(s.gross) + Number(s.employerCost);
    const sites: HrSiteRowDto[] = [...rows.values()]
      .sort((a, b) => (a.projectId ? 0 : 1) - (b.projectId ? 0 : 1) || b.onRoll - a.onRoll || a.label.localeCompare(b.label))
      .map(({ costN, ...r }) => ({ ...r, cost: costMonth && costN ? money(costN) : null }));
    return { sites, costMonth };
  }
}
