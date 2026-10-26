import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  LEAVE_ENTITLEMENT,
  LEAVE_TYPE_LABELS,
  LEAVE_TYPES,
  STANDARD_DAY_HOURS,
  DEFAULT_SITE_RADIUS_M,
  canManageStaff,
  checkInPlace,
  canMarkStaff,
  canViewEmployeePrivate,
  isWeeklyOff,
  leaveDays,
  overtimeHours,
  type EmployeeDto,
  type EmployeeSortField,
  type HolidayDto,
  type LeaveBalanceDto,
  type LeaveRequestDto,
  type LeaveSortField,
  type LeaveType,
  type MyStaffDto,
  type Paginated,
  type SortOrder,
  type CheckInSiteDto,
  type StaffAttendanceDto,
  type StaffRegisterDto,
  type StaffSummaryDto,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { UndoService } from '../common/undo.service';
import { NotificationsService } from '../notifications/notifications.service';
import { todayIn } from '../notifications/time';
import { dateOnly, dec, iso, money, parseDate } from '../common/serialize';
import { isUniqueViolation } from '../common/idempotency';
import { ilike, pageArgs, paginated, searchWords } from '../common/paging';
import {
  ApplyLeaveDto,
  AttendanceQuery,
  BalanceQuery,
  CheckInDto,
  CreateEmployeeDto,
  CreateHolidayDto,
  DecideLeaveDto,
  HolidayQuery,
  ListEmployeesQuery,
  ListLeaveQuery,
  RejectLeaveDto,
  SaveRegisterDto,
  UpdateEmployeeDto,
} from './staff.dto';

const employeeInclude = {
  user: { select: { email: true } },
  project: { select: { name: true } },
  reportingTo: { select: { fullName: true } },
} satisfies Prisma.EmployeeInclude;
type EmployeeRow = Prisma.EmployeeGetPayload<{ include: typeof employeeInclude }>;

const attendanceInclude = {
  employee: { select: { fullName: true, employeeCode: true, userId: true, projectId: true, project: { select: { projectManagerId: true } } } },
  project: { select: { name: true } },
  markedBy: { select: { fullName: true } },
  overtimeDecidedBy: { select: { fullName: true } },
} satisfies Prisma.StaffAttendanceInclude;
type AttendanceRow = Prisma.StaffAttendanceGetPayload<{ include: typeof attendanceInclude }>;

const leaveInclude = {
  employee: { select: { fullName: true, employeeCode: true, designation: true, userId: true, projectId: true, project: { select: { name: true, projectManagerId: true } } } },
  appliedBy: { select: { fullName: true } },
  decidedBy: { select: { fullName: true } },
} satisfies Prisma.LeaveRequestInclude;
type LeaveRow = Prisma.LeaveRequestGetPayload<{ include: typeof leaveInclude }>;

const EMPLOYEE_ORDER: Record<EmployeeSortField, (o: SortOrder) => Prisma.EmployeeOrderByWithRelationInput[]> = {
  employeeCode: (o) => [{ employeeCode: o }],
  fullName: (o) => [{ fullName: o }],
  designation: (o) => [{ designation: o }, { fullName: 'asc' }],
  project: (o) => [{ project: { name: o } }, { fullName: 'asc' }],
  createdAt: (o) => [{ createdAt: o }],
};
const LEAVE_ORDER: Record<LeaveSortField, (o: SortOrder) => Prisma.LeaveRequestOrderByWithRelationInput[]> = {
  fromDate: (o) => [{ fromDate: o }, { createdAt: o }],
  createdAt: (o) => [{ createdAt: o }],
  employee: (o) => [{ employee: { fullName: o } }, { fromDate: 'desc' }],
  status: (o) => [{ status: o }, { fromDate: 'desc' }],
  type: (o) => [{ type: o }, { fromDate: 'desc' }],
};
const DESC_DEFAULT = new Set<string>(['fromDate', 'createdAt']);
const order = (sortBy: string, o: SortOrder | undefined): SortOrder => o ?? (DESC_DEFAULT.has(sortBy) ? 'desc' : 'asc');

const opt = <T>(v: T | null | undefined, editing: boolean): T | null | undefined => (v === undefined ? (editing ? undefined : null) : v === '' ? null : v);
const optDate = (v: string | null | undefined, editing: boolean) => (v === undefined ? (editing ? undefined : null) : v ? parseDate(v) : null);

/** The HR record's fields (v6 item 99) from a create or edit: on an edit, a field left out stays as it is. */
function hrFields(dto: Partial<CreateEmployeeDto>, editing: boolean) {
  return {
    dateOfBirth: optDate(dto.dateOfBirth, editing),
    gender: opt(dto.gender, editing),
    fatherOrSpouseName: opt(dto.fatherOrSpouseName, editing),
    email: opt(dto.email, editing),
    address: opt(dto.address, editing),
    bloodGroup: opt(dto.bloodGroup, editing),
    emergencyContact: opt(dto.emergencyContact, editing),
    emergencyPhone: opt(dto.emergencyPhone, editing),
    pan: opt(dto.pan, editing),
    aadhaarLast4: opt(dto.aadhaarLast4, editing),
    uan: opt(dto.uan, editing),
    pfNumber: opt(dto.pfNumber, editing),
    esiNumber: opt(dto.esiNumber, editing),
    bankName: opt(dto.bankName, editing),
    bankAccountNo: opt(dto.bankAccountNo, editing),
    bankIfsc: opt(dto.bankIfsc, editing),
    employmentType: opt(dto.employmentType, editing),
    grade: opt(dto.grade, editing),
    reportingToId: opt(dto.reportingToId, editing),
    probationEndsOn: optDate(dto.probationEndsOn, editing),
    confirmedOn: optDate(dto.confirmedOn, editing),
    noticeDays: opt(dto.noticeDays, editing),
    ctcAnnual: dto.ctcAnnual === undefined ? (editing ? undefined : null) : dto.ctcAnnual === null ? null : new Prisma.Decimal(dto.ctcAnnual),
  };
}

/** The next HR letter number of the year an event takes effect in: HR-2026-0001 (v6 item 99). */
export async function nextLetterNo(tx: Prisma.TransactionClient, organizationId: string, date: string) {
  const prefix = `HR-${date.slice(0, 4)}-`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`HRLETTER:${organizationId}:${prefix}`}))`;
  const last = await tx.employeeEvent.findFirst({ where: { organizationId, letterNo: { startsWith: prefix } }, orderBy: { letterNo: 'desc' }, select: { letterNo: true } });
  const n = last ? parseInt(last.letterNo.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(n).padStart(4, '0')}`;
}

/** Leave that counts: waiting or approved. */
const LIVE_LEAVE = ['PENDING', 'APPROVED'] as const;
const yearOf = (d: string) => Number(d.slice(0, 4));
const yearRange = (year: number) => ({ gte: parseDate(`${year}-01-01`), lte: parseDate(`${year}-12-31`) });
const num = (d: Prisma.Decimal | number) => Number(d);
const km = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);
const siteSelect = { id: true, name: true, siteLat: true, siteLng: true, siteRadiusM: true, siteCheckInStrict: true } satisfies Prisma.ProjectSelect;

/**
 * Company staff (not contractor labour): the employee master, daily attendance (self check-in from the app or the
 * site register), leave with balances and approval, and holidays. Leave has its own approval flow: a staff admin
 * (admin, management, HR) or the manager of the employee's site decides it, never the employee.
 * Sunday is the weekly off; weekly offs and holidays are not counted as leave days.
 */
@Injectable()
export class StaffService {
  private readonly log = new Logger(StaffService.name);

  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private notifications: NotificationsService,
    private undo: UndoService,
  ) {
    undo.register('HOLIDAY', { entityType: 'HOLIDAY', check: (user) => this.access.assertCanManageStaff(user) });
  }

  /* ---------- mapping ---------- */

  /** HR records (v6 item 99): personal, statutory and bank details go to staff admins, payroll and the person only. */
  private seesPrivate(user: RequestUser | undefined, e: { userId: string | null }) {
    return !!user && (canViewEmployeePrivate(user.roleKey) || (!!e.userId && e.userId === user.id));
  }

  private toEmployeeDto(e: EmployeeRow, user?: RequestUser): EmployeeDto {
    return {
      id: e.id,
      employeeCode: e.employeeCode,
      fullName: e.fullName,
      designation: e.designation,
      department: e.department,
      phone: e.phone,
      userId: e.userId,
      userEmail: e.user?.email ?? null,
      projectId: e.projectId,
      projectName: e.project?.name ?? null,
      joinedOn: dateOnly(e.joinedOn),
      leftOn: dateOnly(e.leftOn),
      isActive: e.isActive,
      employmentType: e.employmentType,
      grade: e.grade,
      reportingToId: e.reportingToId,
      reportingToName: e.reportingTo?.fullName ?? null,
      probationEndsOn: dateOnly(e.probationEndsOn),
      confirmedOn: dateOnly(e.confirmedOn),
      noticeDays: e.noticeDays,
      private: this.seesPrivate(user, e)
        ? {
            dateOfBirth: dateOnly(e.dateOfBirth),
            gender: e.gender,
            fatherOrSpouseName: e.fatherOrSpouseName,
            email: e.email,
            address: e.address,
            bloodGroup: e.bloodGroup,
            emergencyContact: e.emergencyContact,
            emergencyPhone: e.emergencyPhone,
            pan: e.pan,
            aadhaarLast4: e.aadhaarLast4,
            uan: e.uan,
            pfNumber: e.pfNumber,
            esiNumber: e.esiNumber,
            bankName: e.bankName,
            bankAccountNo: e.bankAccountNo,
            bankIfsc: e.bankIfsc,
            ctcAnnual: money(e.ctcAnnual),
            exitReason: e.exitReason,
          }
        : null,
    };
  }

  private toAttendanceDto(a: AttendanceRow, user: RequestUser): StaffAttendanceDto {
    return {
      id: a.id,
      employeeId: a.employeeId,
      employeeName: a.employee.fullName,
      employeeCode: a.employee.employeeCode,
      date: dateOnly(a.date)!,
      projectId: a.projectId,
      projectName: a.project?.name ?? null,
      status: a.status,
      checkIn: iso(a.checkIn),
      checkOut: iso(a.checkOut),
      overtimeHours: dec(a.overtimeHours),
      overtimeStatus: a.overtimeStatus,
      overtimeDecidedByName: a.overtimeDecidedBy?.fullName ?? null,
      overtimeNote: a.overtimeNote,
      checkInPlace:
        a.checkInLat && a.checkInLng
          ? { lat: a.checkInLat.toString(), lng: a.checkInLng.toString(), accuracyM: a.checkInAccuracyM, distanceM: a.checkInDistanceM, inside: a.checkInInside }
          : null,
      canDecideOvertime: a.overtimeStatus === 'PENDING' && this.access.canDecideLeave(user, a.employee),
      note: a.note,
      markedByName: a.markedBy.fullName,
    };
  }

  /** A site's location for GPS check-in, or null when the project has none. */
  private toSite(p: { id: string; name: string; siteLat: Prisma.Decimal | null; siteLng: Prisma.Decimal | null; siteRadiusM: number | null; siteCheckInStrict: boolean } | null): CheckInSiteDto | null {
    if (!p?.siteLat || !p.siteLng) return null;
    return { projectId: p.id, projectName: p.name, lat: p.siteLat.toString(), lng: p.siteLng.toString(), radiusM: p.siteRadiusM ?? DEFAULT_SITE_RADIUS_M, strict: p.siteCheckInStrict };
  }

  private toLeaveDto(l: LeaveRow, user: RequestUser, today = todayIn()): LeaveRequestDto {
    const own = l.employee.userId === user.id || l.appliedById === user.id;
    const from = dateOnly(l.fromDate)!;
    return {
      id: l.id,
      employeeId: l.employeeId,
      employeeName: l.employee.fullName,
      employeeCode: l.employee.employeeCode,
      designation: l.employee.designation,
      projectId: l.employee.projectId,
      projectName: l.employee.project?.name ?? null,
      type: l.type,
      fromDate: from,
      toDate: dateOnly(l.toDate)!,
      halfDay: l.halfDay,
      days: dec(l.days)!,
      reason: l.reason,
      status: l.status,
      appliedByName: l.appliedBy.fullName,
      decidedByName: l.decidedBy?.fullName ?? null,
      decidedAt: iso(l.decidedAt),
      decisionNote: l.decisionNote,
      createdAt: l.createdAt.toISOString(),
      canDecide: l.status === 'PENDING' && this.access.canDecideLeave(user, l.employee),
      canCancel: (l.status === 'PENDING' && (own || canManageStaff(user.roleKey))) || (l.status === 'APPROVED' && (canManageStaff(user.roleKey) || (own && from > today))),
    };
  }

  private toHolidayDto(h: { id: string; projectId: string | null; project: { name: string } | null; date: Date; name: string }): HolidayDto {
    return { id: h.id, projectId: h.projectId, projectName: h.project?.name ?? null, date: dateOnly(h.date)!, name: h.name };
  }

  /* ---------- lookups ---------- */

  private async ownEmployee(user: RequestUser) {
    return this.prisma.employee.findFirst({ where: { organizationId: user.organizationId, userId: user.id }, include: employeeInclude });
  }

  /** An employee the user may see, or 404. */
  private async visibleEmployee(user: RequestUser, id: string) {
    const e = await this.prisma.employee.findFirst({ where: { id, ...this.access.staffWhere(user) }, include: employeeInclude });
    if (!e) throw new NotFoundException('Employee not found');
    return e;
  }

  /** Holiday dates (YYYY-MM-DD → name) for a site between two days, including holidays for every site. */
  private async holidayMap(organizationId: string, projectId: string | null, from: string, to: string, db: Prisma.TransactionClient = this.prisma) {
    const rows = await db.holiday.findMany({
      where: { organizationId, date: { gte: parseDate(from), lte: parseDate(to) }, OR: [{ projectId: null }, ...(projectId ? [{ projectId }] : [])] },
      select: { date: true, name: true },
    });
    return new Map(rows.map((h) => [dateOnly(h.date)!, h.name]));
  }

  /* ---------- summary and me ---------- */

  async summary(user: RequestUser): Promise<StaffSummaryDto> {
    const today = parseDate(todayIn());
    const [leaveToDecide, overtimeToDecide] = await Promise.all([
      this.prisma.leaveRequest.count({ where: { organizationId: user.organizationId, status: 'PENDING', employee: this.access.leaveDeciderWhere(user) } }),
      this.prisma.staffAttendance.count({ where: { organizationId: user.organizationId, overtimeStatus: 'PENDING', employee: this.access.leaveDeciderWhere(user) } }),
    ]);
    if (!canMarkStaff(user.roleKey)) return { leaveToDecide, overtimeToDecide, employees: null, onLeaveToday: null };
    const staff = { ...this.access.staffWhere(user), isActive: true };
    const [employees, onLeaveToday] = await Promise.all([
      this.prisma.employee.count({ where: staff }),
      this.prisma.leaveRequest.count({ where: { status: 'APPROVED', fromDate: { lte: today }, toDate: { gte: today }, employee: staff } }),
    ]);
    return { leaveToDecide, overtimeToDecide, employees, onLeaveToday };
  }

  async me(user: RequestUser): Promise<MyStaffDto> {
    const today = todayIn();
    const year = yearOf(today);
    const e = await this.ownEmployee(user);
    const holidayRows = await this.prisma.holiday.findMany({
      where: { organizationId: user.organizationId, date: { gte: parseDate(today), lte: parseDate(`${year + 1}-01-31`) }, OR: [{ projectId: null }, ...(e?.projectId ? [{ projectId: e.projectId }] : [])] },
      include: { project: { select: { name: true } } },
      orderBy: { date: 'asc' },
      take: 12,
    });
    const holidays = holidayRows.map((h) => this.toHolidayDto(h));
    const todayHoliday = holidays.find((h) => h.date === today)?.name ?? null;
    const todayOff = todayHoliday ?? (isWeeklyOff(today) ? 'Sunday' : null);
    if (!e) return { employee: null, today: null, todayOff, year, balances: [], leave: [], holidays, site: null };
    const [att, leave, balances, site] = await Promise.all([
      this.prisma.staffAttendance.findUnique({ where: { employeeId_date: { employeeId: e.id, date: parseDate(today) } }, include: attendanceInclude }),
      this.prisma.leaveRequest.findMany({ where: { employeeId: e.id }, include: leaveInclude, orderBy: [{ fromDate: 'desc' }, { createdAt: 'desc' }], take: 20 }),
      this.balancesFor(e.id, e.projectId, year),
      e.projectId ? this.prisma.project.findUnique({ where: { id: e.projectId }, select: siteSelect }) : null,
    ]);
    return {
      employee: this.toEmployeeDto(e, user),
      today: att ? this.toAttendanceDto(att, user) : null,
      todayOff,
      year,
      balances,
      leave: leave.map((l) => this.toLeaveDto(l, user, today)),
      holidays,
      site: this.toSite(site),
    };
  }

  /**
   * Self check-in from the app: today, at their posting unless they say which site. With a position (v5 item 97) it
   * records where they were and whether that was inside the site's radius; a strict site refuses a check-in from
   * outside it or without a position.
   */
  async checkIn(user: RequestUser, dto: CheckInDto): Promise<StaffAttendanceDto> {
    const e = await this.ownEmployee(user);
    if (!e || !e.isActive) throw new BadRequestException('Your login is not linked to a staff record. Ask HR to link it.');
    const projectId = dto.projectId ?? e.projectId;
    if (dto.projectId && dto.projectId !== e.projectId) await this.access.assertCanAccessProject(user, dto.projectId);
    const date = parseDate(todayIn());
    const cur = await this.prisma.staffAttendance.findUnique({ where: { employeeId_date: { employeeId: e.id, date } } });
    if (cur?.checkIn) throw new BadRequestException('You have already checked in today');
    const site = this.toSite(projectId ? await this.prisma.project.findUnique({ where: { id: projectId }, select: siteSelect }) : null);
    const hasPosition = dto.lat !== undefined && dto.lng !== undefined;
    const place = site && hasPosition ? checkInPlace({ lat: Number(site.lat), lng: Number(site.lng), radiusM: site.radiusM }, { lat: dto.lat!, lng: dto.lng!, accuracyM: dto.accuracyM ?? null }) : null;
    if (site?.strict && !hasPosition) throw new BadRequestException(`${site.projectName} checks your location at check-in. Allow location for this app and try again.`);
    if (site?.strict && place && !place.inside) {
      throw new BadRequestException(`You are ${km(place.distanceM)} from ${site.projectName}; check in from within ${site.radiusM} m of the site, or ask your manager to mark you in the register.`);
    }
    const position = hasPosition
      ? {
          checkInLat: new Prisma.Decimal(dto.lat!.toFixed(6)),
          checkInLng: new Prisma.Decimal(dto.lng!.toFixed(6)),
          checkInAccuracyM: dto.accuracyM === undefined ? null : Math.round(dto.accuracyM),
          checkInDistanceM: place?.distanceM ?? null,
          checkInInside: place?.inside ?? null,
        }
      : {};
    const now = new Date();
    const row = cur
      ? await this.prisma.staffAttendance.update({ where: { id: cur.id }, data: { checkIn: now, status: 'PRESENT', projectId: projectId ?? cur.projectId, ...position }, include: attendanceInclude })
      : await this.prisma.staffAttendance
          .create({ data: { organizationId: user.organizationId, employeeId: e.id, date, projectId, status: 'PRESENT', checkIn: now, markedById: user.id, ...position }, include: attendanceInclude })
          .catch((err) => {
            if (isUniqueViolation(err)) throw new BadRequestException('You have already checked in today');
            throw err;
          });
    return this.toAttendanceDto(row, user);
  }

  /**
   * Check-out: overtime is the time past a standard day in half hours and waits for the site manager or HR (v5 item
   * 97); under half a day is marked a half day.
   */
  async checkOut(user: RequestUser): Promise<StaffAttendanceDto> {
    const e = await this.ownEmployee(user);
    if (!e) throw new BadRequestException('Your login is not linked to a staff record. Ask HR to link it.');
    const cur = await this.prisma.staffAttendance.findUnique({ where: { employeeId_date: { employeeId: e.id, date: parseDate(todayIn()) } } });
    if (!cur?.checkIn) throw new BadRequestException('Check in first');
    if (cur.checkOut) throw new BadRequestException('You have already checked out today');
    const now = new Date();
    const hours = (now.getTime() - cur.checkIn.getTime()) / 3_600_000;
    const ot = overtimeHours(cur.checkIn.toISOString(), now.toISOString());
    const row = await this.prisma.staffAttendance.update({
      where: { id: cur.id },
      data: { checkOut: now, overtimeHours: ot, overtimeStatus: ot ? 'PENDING' : null, status: hours < STANDARD_DAY_HOURS / 2 ? 'HALF_DAY' : 'PRESENT' },
      include: attendanceInclude,
    });
    const out = this.toAttendanceDto(row, user);
    if (ot) await this.notifyOvertime(user, out, e.projectId);
    return out;
  }

  /* ---------- employees ---------- */

  async listEmployees(user: RequestUser, q: ListEmployeesQuery): Promise<Paginated<EmployeeDto>> {
    const and: Prisma.EmployeeWhereInput[] = [this.access.staffWhere(user)];
    if (!q.includeInactive) and.push({ isActive: true });
    if (q.projectId) and.push({ projectId: q.projectId });
    for (const w of searchWords(q.q)) and.push({ OR: [{ employeeCode: ilike(w) }, { fullName: ilike(w) }, { designation: ilike(w) }, { department: ilike(w) }, { phone: ilike(w) }] });
    const where: Prisma.EmployeeWhereInput = { AND: and };
    const sortBy = q.sortBy ?? 'employeeCode';
    const args = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.employee.findMany({ where, include: employeeInclude, orderBy: [...EMPLOYEE_ORDER[sortBy](order(sortBy, q.sortOrder)), { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.employee.count({ where }),
    ]);
    return paginated(rows.map((r) => this.toEmployeeDto(r, user)), total, args);
  }

  async getEmployee(user: RequestUser, id: string): Promise<EmployeeDto> {
    return this.toEmployeeDto(await this.visibleEmployee(user, id), user);
  }

  /** Logins that can be linked to a staff record: active users not linked to anyone else. */
  async linkableUsers(user: RequestUser, employeeId?: string) {
    this.access.assertCanManageStaff(user);
    const rows = await this.prisma.user.findMany({
      where: { organizationId: user.organizationId, isActive: true, OR: [{ employee: null }, ...(employeeId ? [{ employee: { id: employeeId } }] : [])] },
      select: { id: true, fullName: true, email: true, role: { select: { name: true } } },
      orderBy: { fullName: 'asc' },
    });
    return rows.map((u) => ({ id: u.id, fullName: u.fullName, email: u.email, roleName: u.role.name }));
  }

  private async checkLinks(user: RequestUser, dto: { userId?: string | null; projectId?: string | null; reportingToId?: string | null }, self?: string) {
    if (dto.reportingToId && (dto.reportingToId === self || !(await this.prisma.employee.findFirst({ where: { id: dto.reportingToId, organizationId: user.organizationId }, select: { id: true } }))))
      throw new BadRequestException(dto.reportingToId === self ? 'Someone cannot report to themselves. Choose their manager.' : 'Reports to: employee not found');
    if (dto.userId && !(await this.prisma.user.findFirst({ where: { id: dto.userId, organizationId: user.organizationId }, select: { id: true } }))) throw new BadRequestException('Login not found');
    if (dto.projectId && !(await this.prisma.project.findFirst({ where: { id: dto.projectId, organizationId: user.organizationId }, select: { id: true } }))) throw new BadRequestException('Project not found');
  }

  private async nextEmployeeCode(tx: Prisma.TransactionClient, organizationId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`EMP:${organizationId}`}))`;
    const codes = await tx.employee.findMany({ where: { organizationId, employeeCode: { startsWith: 'EMP-' } }, select: { employeeCode: true } });
    const max = codes.reduce((m, c) => Math.max(m, parseInt(c.employeeCode.slice(4), 10) || 0), 0);
    return `EMP-${String(max + 1).padStart(3, '0')}`;
  }

  private uniqueError(e: unknown, code?: string): never {
    if (isUniqueViolation(e)) {
      const target = String((e as Prisma.PrismaClientKnownRequestError).meta?.target ?? '');
      throw new BadRequestException(target.includes('userId') ? 'That login is already linked to another employee' : `Employee code ${code ?? ''} is already used`);
    }
    throw e;
  }

  async createEmployee(user: RequestUser, dto: CreateEmployeeDto): Promise<EmployeeDto> {
    this.access.assertCanManageStaff(user);
    await this.checkLinks(user, dto);
    const created = await this.prisma
      .$transaction(async (tx) => {
        const e = await tx.employee.create({
          data: {
            organizationId: user.organizationId,
            employeeCode: dto.employeeCode || (await this.nextEmployeeCode(tx, user.organizationId)),
            fullName: dto.fullName,
            designation: dto.designation,
            department: dto.department || null,
            phone: dto.phone || null,
            userId: dto.userId ?? null,
            projectId: dto.projectId ?? null,
            joinedOn: dto.joinedOn ? parseDate(dto.joinedOn) : null,
            ...hrFields(dto, false),
          },
          include: employeeInclude,
        });
        // The joining is the first event of their service, and prints the appointment letter (v6 item 99).
        if (e.joinedOn)
          await tx.employeeEvent.create({
            data: {
              organizationId: user.organizationId,
              employeeId: e.id,
              type: 'JOINED',
              effectiveDate: e.joinedOn,
              letterNo: await nextLetterNo(tx, user.organizationId, dateOnly(e.joinedOn)!),
              toProjectId: e.projectId,
              toDesignation: e.designation,
              toDepartment: e.department,
              toCtc: e.ctcAnnual,
              createdById: user.id,
            },
          });
        return e;
      })
      .catch((e) => this.uniqueError(e, dto.employeeCode));
    await this.audit.log(user, 'EMPLOYEE', created.id, 'CREATED', created.employeeCode);
    return this.toEmployeeDto(created, user);
  }

  async updateEmployee(user: RequestUser, id: string, dto: UpdateEmployeeDto): Promise<EmployeeDto> {
    this.access.assertCanManageStaff(user);
    const cur = await this.visibleEmployee(user, id);
    await this.checkLinks(user, dto, id);
    if (dto.employeeCode === '') throw new BadRequestException('Employee code cannot be empty');
    const leftOn = dto.leftOn === undefined ? undefined : dto.leftOn ? parseDate(dto.leftOn) : null;
    const isActive = dto.isActive ?? (dto.leftOn === undefined ? undefined : !dto.leftOn);
    const updated = await this.prisma.employee
      .update({
        where: { id },
        data: {
          employeeCode: dto.employeeCode,
          fullName: dto.fullName,
          designation: dto.designation,
          department: dto.department === undefined ? undefined : dto.department || null,
          phone: dto.phone === undefined ? undefined : dto.phone || null,
          userId: dto.userId,
          projectId: dto.projectId,
          joinedOn: dto.joinedOn === undefined ? undefined : dto.joinedOn ? parseDate(dto.joinedOn) : null,
          leftOn,
          isActive,
          ...hrFields(dto, true),
        },
        include: employeeInclude,
      })
      .catch((e) => this.uniqueError(e, dto.employeeCode));
    const moved = dto.projectId !== undefined && dto.projectId !== cur.projectId;
    await this.audit.log(user, 'EMPLOYEE', id, isActive === false && cur.isActive ? 'LEFT' : 'UPDATED', moved ? `Posted to ${updated.project?.name ?? 'head office'}` : null);
    return this.toEmployeeDto(updated, user);
  }

  employeeHistory(user: RequestUser, id: string) {
    this.access.assertCanManageStaff(user);
    return this.audit.forEntity(user.organizationId, 'EMPLOYEE', id);
  }

  /* ---------- attendance ---------- */

  /** A site's staff for a day: everyone posted there (and anyone marked there that day), with leave covering the day. */
  async register(user: RequestUser, projectId: string, date: string): Promise<StaffRegisterDto> {
    await this.access.assertCanMarkStaff(user, projectId);
    const day = parseDate(date);
    const employees = await this.prisma.employee.findMany({
      where: {
        organizationId: user.organizationId,
        OR: [
          { projectId, isActive: true, OR: [{ joinedOn: null }, { joinedOn: { lte: day } }] },
          { attendance: { some: { date: day, projectId } } },
        ],
      },
      include: employeeInclude,
      orderBy: { fullName: 'asc' },
    });
    const ids = employees.map((e) => e.id);
    const [att, leave, holidays] = await Promise.all([
      this.prisma.staffAttendance.findMany({ where: { employeeId: { in: ids }, date: day }, include: attendanceInclude }),
      this.prisma.leaveRequest.findMany({ where: { employeeId: { in: ids }, status: { in: [...LIVE_LEAVE] }, fromDate: { lte: day }, toDate: { gte: day } }, orderBy: { status: 'asc' } }),
      this.holidayMap(user.organizationId, projectId, date, date),
    ]);
    const attBy = new Map(att.map((a) => [a.employeeId, a]));
    const leaveBy = new Map<string, (typeof leave)[number]>();
    for (const l of leave) if (!leaveBy.has(l.employeeId) || l.status === 'APPROVED') leaveBy.set(l.employeeId, l);
    return {
      date,
      projectId,
      holiday: holidays.get(date) ?? null,
      weeklyOff: isWeeklyOff(date),
      rows: employees.map((e) => {
        const a = attBy.get(e.id);
        const l = leaveBy.get(e.id);
        return {
          employee: this.toEmployeeDto(e, user),
          attendance: a ? this.toAttendanceDto(a, user) : null,
          leave: l ? { id: l.id, type: l.type, status: l.status, halfDay: l.halfDay } : null,
        };
      }),
    };
  }

  /** Save the register: each entry sets or clears one employee's day; self check-in times are kept. */
  async saveRegister(user: RequestUser, dto: SaveRegisterDto): Promise<StaffRegisterDto> {
    await this.access.assertCanMarkStaff(user, dto.projectId);
    if (dto.date > todayIn()) throw new BadRequestException('Attendance cannot be marked for a future day');
    const day = parseDate(dto.date);
    const ids = [...new Set(dto.entries.map((e) => e.employeeId))];
    if (ids.length !== dto.entries.length) throw new BadRequestException('Each employee once per register');
    const allowed = await this.prisma.employee.findMany({
      where: {
        id: { in: ids },
        organizationId: user.organizationId,
        OR: [{ projectId: dto.projectId, isActive: true }, { attendance: { some: { date: day, projectId: dto.projectId } } }, ...(canManageStaff(user.roleKey) ? [{ isActive: true }] : [])],
      },
      select: { id: true, userId: true, project: { select: { projectManagerId: true } }, attendance: { where: { date: day }, select: { overtimeHours: true, overtimeStatus: true } } },
    });
    if (allowed.length !== ids.length) throw new BadRequestException('Some of these people are not posted at this site');
    const byId = new Map(allowed.map((a) => [a.id, a]));
    let marked = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const e of dto.entries) {
        if (!e.status) {
          await tx.staffAttendance.deleteMany({ where: { employeeId: e.employeeId, date: day } });
          continue;
        }
        // Overtime the marker changes is approved when they may decide it (v5 item 97), else it waits; unchanged keeps its decision.
        const emp = byId.get(e.employeeId)!;
        const was = emp.attendance[0];
        const otChanged = e.overtimeHours !== undefined && Number(e.overtimeHours ?? 0) !== Number(was?.overtimeHours ?? 0);
        const data = {
          status: e.status,
          projectId: dto.projectId,
          note: e.note === undefined ? undefined : e.note || null,
          overtimeHours: e.overtimeHours === undefined ? undefined : e.overtimeHours,
          ...(otChanged
            ? e.overtimeHours
              ? this.access.canDecideLeave(user, emp)
                ? { overtimeStatus: 'APPROVED' as const, overtimeDecidedById: user.id, overtimeDecidedAt: new Date(), overtimeNote: null }
                : { overtimeStatus: 'PENDING' as const, overtimeDecidedById: null, overtimeDecidedAt: null, overtimeNote: null }
              : { overtimeStatus: null, overtimeDecidedById: null, overtimeDecidedAt: null, overtimeNote: null }
            : {}),
          markedById: user.id,
        };
        await tx.staffAttendance.upsert({
          where: { employeeId_date: { employeeId: e.employeeId, date: day } },
          create: { ...data, organizationId: user.organizationId, employeeId: e.employeeId, date: day, note: data.note ?? null, overtimeHours: data.overtimeHours ?? null },
          update: data,
        });
        marked += 1;
      }
    });
    await this.audit.log(user, 'STAFF_REGISTER', dto.projectId, 'SAVED', `${dto.date}: ${marked} marked`);
    return this.register(user, dto.projectId, dto.date);
  }

  /** One employee's days between two dates (at most 62): themselves, or someone who can see them. */
  async attendance(user: RequestUser, q: AttendanceQuery): Promise<StaffAttendanceDto[]> {
    if (q.from > q.to) throw new BadRequestException('From must be on or before to');
    if ((Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 > 62) throw new BadRequestException('At most two months at a time');
    await this.visibleEmployee(user, q.employeeId);
    const rows = await this.prisma.staffAttendance.findMany({
      where: { employeeId: q.employeeId, date: { gte: parseDate(q.from), lte: parseDate(q.to) } },
      include: attendanceInclude,
      orderBy: { date: 'asc' },
    });
    return rows.map((r) => this.toAttendanceDto(r, user));
  }

  /* ---------- overtime (v5 item 97) ---------- */

  /** Overtime waiting on the caller: the same people who decide the employee's leave, oldest first. */
  async overtimeToDecide(user: RequestUser): Promise<StaffAttendanceDto[]> {
    const rows = await this.prisma.staffAttendance.findMany({
      where: { organizationId: user.organizationId, overtimeStatus: 'PENDING', employee: this.access.leaveDeciderWhere(user) },
      include: attendanceInclude,
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      take: 200,
    });
    return rows.map((r) => this.toAttendanceDto(r, user));
  }

  async decideOvertime(user: RequestUser, id: string, status: 'APPROVED' | 'REJECTED', note?: string | null): Promise<StaffAttendanceDto> {
    const cur = await this.prisma.staffAttendance.findFirst({ where: { id, organizationId: user.organizationId }, include: attendanceInclude });
    if (!cur) throw new NotFoundException('Attendance not found');
    if (!this.access.canDecideLeave(user, cur.employee)) {
      throw new ForbiddenException(cur.employee.userId === user.id ? 'You cannot decide your own overtime' : 'Only HR or the site manager can decide this overtime');
    }
    const { count } = await this.prisma.staffAttendance.updateMany({
      where: { id, overtimeStatus: 'PENDING' },
      data: { overtimeStatus: status, overtimeDecidedById: user.id, overtimeDecidedAt: new Date(), overtimeNote: note || null },
    });
    if (!count) throw new BadRequestException('This overtime has already been decided');
    await this.audit.log(user, 'STAFF_OVERTIME', id, status, `${cur.employee.fullName}, ${dateOnly(cur.date)}: ${dec(cur.overtimeHours)} h${note ? ` (${note})` : ''}`);
    const row = await this.prisma.staffAttendance.findUniqueOrThrow({ where: { id }, include: attendanceInclude });
    const out = this.toAttendanceDto(row, user);
    if (cur.employee.userId && cur.employee.userId !== user.id) {
      await this.notifications
        .notify({
          organizationId: user.organizationId,
          userIds: [cur.employee.userId],
          type: 'OVERTIME',
          title: `Overtime ${status === 'APPROVED' ? 'approved' : 'rejected'}`,
          body: `${out.overtimeHours} h on ${out.date}${note ? `: ${note}` : ''}`,
          projectId: out.projectId,
          entityId: id,
          dedupeKey: `OVERTIME_${status}:${id}`,
        })
        .catch((e: Error) => this.log.warn(`Overtime notification failed: ${e.message}`));
    }
    return out;
  }

  /** Overtime from a check-out: the site manager and HR are told it waits on them. */
  private async notifyOvertime(user: RequestUser, a: StaffAttendanceDto, postingId: string | null) {
    try {
      const to = (await this.access.leaveApprovers(user.organizationId, postingId)).filter((u) => u !== user.id);
      if (!to.length) return;
      await this.notifications.notify({
        organizationId: user.organizationId,
        userIds: to,
        type: 'OVERTIME',
        title: `${a.employeeName} worked ${a.overtimeHours} h overtime`,
        body: `${a.date}${a.projectName ? ` at ${a.projectName}` : ''}: approve it for payroll on the Staff page.`,
        projectId: a.projectId,
        entityId: a.id,
        dedupeKey: `OVERTIME_PENDING:${a.id}`,
      });
    } catch (e) {
      this.log.warn(`Overtime notification failed: ${(e as Error).message}`);
    }
  }

  /* ---------- leave ---------- */

  /**
   * Days a year per type: fixed for casual, sick and earned; comp-off is earned by working a weekly off or holiday
   * (a half day earns half); unpaid has no limit. Leave counts in the year it starts.
   */
  async balancesFor(employeeId: string, projectId: string | null, year: number, db: Prisma.TransactionClient = this.prisma, excludeId?: string): Promise<LeaveBalanceDto[]> {
    const range = yearRange(year);
    const [rows, worked] = await Promise.all([
      db.leaveRequest.groupBy({ by: ['type', 'status'], where: { employeeId, status: { in: [...LIVE_LEAVE] }, fromDate: range, ...(excludeId ? { id: { not: excludeId } } : {}) }, _sum: { days: true } }),
      db.staffAttendance.findMany({ where: { employeeId, date: range, status: { in: ['PRESENT', 'HALF_DAY'] } }, select: { date: true, status: true, projectId: true } }),
    ]);
    const emp = await db.employee.findUnique({ where: { id: employeeId }, select: { organizationId: true } });
    const holidays = emp ? await db.holiday.findMany({ where: { organizationId: emp.organizationId, date: range }, select: { date: true, projectId: true } }) : [];
    const isOff = (d: Date, p: string | null) => {
      const s = dateOnly(d)!;
      return isWeeklyOff(s) || holidays.some((h) => dateOnly(h.date) === s && (h.projectId === null || h.projectId === (p ?? projectId)));
    };
    const compOff = worked.filter((a) => isOff(a.date, a.projectId)).reduce((n, a) => n + (a.status === 'HALF_DAY' ? 0.5 : 1), 0);
    const sum = (type: LeaveType, status: 'PENDING' | 'APPROVED') => num(rows.find((r) => r.type === type && r.status === status)?._sum.days ?? 0);
    return LEAVE_TYPES.map((type) => {
      const entitled = type === 'COMP_OFF' ? compOff : LEAVE_ENTITLEMENT[type];
      const taken = sum(type, 'APPROVED');
      const pending = sum(type, 'PENDING');
      return { type, entitled, taken, pending, left: entitled === null ? null : entitled - taken - pending };
    });
  }

  async balances(user: RequestUser, q: BalanceQuery): Promise<LeaveBalanceDto[]> {
    const e = q.employeeId ? await this.visibleEmployee(user, q.employeeId) : await this.ownEmployee(user);
    if (!e) throw new NotFoundException('Your login is not linked to a staff record');
    return this.balancesFor(e.id, e.projectId, q.year ?? yearOf(todayIn()));
  }

  private leaveWhere(user: RequestUser): Prisma.LeaveRequestWhereInput {
    return { organizationId: user.organizationId, employee: this.access.staffWhere(user) };
  }

  async listLeave(user: RequestUser, q: ListLeaveQuery): Promise<Paginated<LeaveRequestDto>> {
    const and: Prisma.LeaveRequestWhereInput[] = [this.leaveWhere(user)];
    if (q.toDecide) and.push({ status: 'PENDING', employee: this.access.leaveDeciderWhere(user) });
    if (q.status) and.push({ status: q.status });
    if (q.type) and.push({ type: q.type });
    if (q.employeeId) and.push({ employeeId: q.employeeId });
    if (q.projectId) and.push({ employee: { projectId: q.projectId } });
    if (q.on) and.push({ fromDate: { lte: parseDate(q.on) }, toDate: { gte: parseDate(q.on) } });
    for (const w of searchWords(q.q)) and.push({ OR: [{ reason: ilike(w) }, { employee: { OR: [{ fullName: ilike(w) }, { employeeCode: ilike(w) }] } }] });
    const where: Prisma.LeaveRequestWhereInput = { AND: and };
    const sortBy = q.sortBy ?? 'fromDate';
    const args = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.leaveRequest.findMany({ where, include: leaveInclude, orderBy: [...LEAVE_ORDER[sortBy](order(sortBy, q.sortOrder)), { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.leaveRequest.count({ where }),
    ]);
    const today = todayIn();
    return paginated(rows.map((r) => this.toLeaveDto(r, user, today)), total, args);
  }

  private async visibleLeave(user: RequestUser, id: string) {
    const l = await this.prisma.leaveRequest.findFirst({ where: { id, ...this.leaveWhere(user) }, include: leaveInclude });
    if (!l) throw new NotFoundException('Leave request not found');
    return l;
  }

  async getLeave(user: RequestUser, id: string): Promise<LeaveRequestDto> {
    return this.toLeaveDto(await this.visibleLeave(user, id), user);
  }

  /** Lock one employee's leave so two requests cannot both pass the balance check. */
  private lockEmployee(tx: Prisma.TransactionClient, employeeId: string) {
    return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`LEAVE:${employeeId}`}))`;
  }

  private async assertBalance(tx: Prisma.TransactionClient, employeeId: string, projectId: string | null, type: LeaveType, fromDate: string, days: number, excludeId?: string) {
    const b = (await this.balancesFor(employeeId, projectId, yearOf(fromDate), tx, excludeId)).find((x) => x.type === type)!;
    if (b.left !== null && b.left < days) {
      const label = LEAVE_TYPE_LABELS[type].toLowerCase();
      throw new BadRequestException(b.left <= 0 ? `No ${label} left for ${yearOf(fromDate)}` : `Only ${b.left} day${b.left === 1 ? '' : 's'} of ${label} left for ${yearOf(fromDate)}`);
    }
  }

  async applyLeave(user: RequestUser, dto: ApplyLeaveDto): Promise<LeaveRequestDto> {
    const own = await this.ownEmployee(user);
    let e = own;
    if (dto.employeeId && dto.employeeId !== own?.id) {
      if (!canManageStaff(user.roleKey)) throw new ForbiddenException('Only HR can apply for leave for someone else');
      e = await this.visibleEmployee(user, dto.employeeId);
    }
    if (!e) throw new BadRequestException('Your login is not linked to a staff record. Ask HR to link it.');
    if (!e.isActive) throw new BadRequestException(`${e.fullName} has left`);
    const halfDay = !!dto.halfDay;
    if (dto.fromDate > dto.toDate) throw new BadRequestException('The leave cannot end before it starts');
    if (halfDay && dto.fromDate !== dto.toDate) throw new BadRequestException('A half day is a single day');
    if (yearOf(dto.fromDate) !== yearOf(dto.toDate)) throw new BadRequestException('Apply separately for the days in each year');
    if ((Date.parse(dto.toDate) - Date.parse(dto.fromDate)) / 86_400_000 > 90) throw new BadRequestException('At most 90 days at a time');
    const employee = e;
    const created = await this.prisma.$transaction(async (tx) => {
      await this.lockEmployee(tx, employee.id);
      const holidays = await this.holidayMap(user.organizationId, employee.projectId, dto.fromDate, dto.toDate, tx);
      const days = leaveDays(dto.fromDate, dto.toDate, halfDay, new Set(holidays.keys()));
      if (days === 0) throw new BadRequestException('Those days are Sundays or holidays; no leave is needed');
      const clash = await tx.leaveRequest.findFirst({
        where: { employeeId: employee.id, status: { in: [...LIVE_LEAVE] }, fromDate: { lte: parseDate(dto.toDate) }, toDate: { gte: parseDate(dto.fromDate) } },
        select: { fromDate: true, toDate: true, halfDay: true },
      });
      if (clash) throw new BadRequestException(`Leave from ${dateOnly(clash.fromDate)} to ${dateOnly(clash.toDate)} already covers some of these days`);
      await this.assertBalance(tx, employee.id, employee.projectId, dto.type, dto.fromDate, days);
      return tx.leaveRequest.create({
        data: {
          organizationId: user.organizationId,
          employeeId: employee.id,
          type: dto.type,
          fromDate: parseDate(dto.fromDate),
          toDate: parseDate(dto.toDate),
          halfDay,
          days,
          reason: dto.reason,
          appliedById: user.id,
        },
        include: leaveInclude,
      });
    });
    await this.audit.log(user, 'LEAVE', created.id, 'CREATED', `${LEAVE_TYPE_LABELS[dto.type]}, ${dec(created.days)} day(s)`);
    const out = this.toLeaveDto(created, user);
    await this.notifyApplied(user, out, employee.userId);
    return out;
  }

  async approveLeave(user: RequestUser, id: string, dto: DecideLeaveDto): Promise<LeaveRequestDto> {
    return this.decide(user, id, 'APPROVED', dto.note);
  }

  async rejectLeave(user: RequestUser, id: string, dto: RejectLeaveDto): Promise<LeaveRequestDto> {
    return this.decide(user, id, 'REJECTED', dto.note);
  }

  private async decide(user: RequestUser, id: string, status: 'APPROVED' | 'REJECTED', note?: string | null): Promise<LeaveRequestDto> {
    const cur = await this.visibleLeave(user, id);
    if (!this.access.canDecideLeave(user, cur.employee)) {
      throw new ForbiddenException(cur.employee.userId === user.id ? 'You cannot decide your own leave' : 'Only HR or the site manager can decide this leave');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.lockEmployee(tx, cur.employeeId);
      const fresh = await tx.leaveRequest.findUnique({ where: { id }, select: { status: true } });
      if (fresh?.status !== 'PENDING') throw new BadRequestException('This leave has already been decided or cancelled');
      if (status === 'APPROVED') await this.assertBalance(tx, cur.employeeId, cur.employee.projectId, cur.type, dateOnly(cur.fromDate)!, num(cur.days), id);
      return tx.leaveRequest.update({ where: { id }, data: { status, decidedById: user.id, decidedAt: new Date(), decisionNote: note || null }, include: leaveInclude });
    });
    await this.audit.log(user, 'LEAVE', id, status, note || null);
    const out = this.toLeaveDto(updated, user);
    await this.notifyDecided(user, out, [updated.employee.userId, updated.appliedById]);
    return out;
  }

  /** Withdraw a request: the employee before it starts (or while waiting), or HR at any time. */
  async cancelLeave(user: RequestUser, id: string): Promise<LeaveRequestDto> {
    const cur = await this.visibleLeave(user, id);
    if (!this.toLeaveDto(cur, user).canCancel) {
      if (cur.status !== 'PENDING' && cur.status !== 'APPROVED') throw new BadRequestException('Only waiting or approved leave can be cancelled');
      const own = cur.employee.userId === user.id || cur.appliedById === user.id;
      throw own ? new BadRequestException('Leave that has started can only be cancelled by HR') : new ForbiddenException('Only the employee or HR can cancel this leave');
    }
    const updated = await this.prisma.leaveRequest.update({ where: { id }, data: { status: 'CANCELLED' }, include: leaveInclude });
    await this.audit.log(user, 'LEAVE', id, 'CANCELLED');
    return this.toLeaveDto(updated, user);
  }

  leaveHistory(user: RequestUser, id: string) {
    return this.visibleLeave(user, id).then(() => this.audit.forEntity(user.organizationId, 'LEAVE', id));
  }

  private leaveSpan(l: LeaveRequestDto) {
    return l.fromDate === l.toDate ? `${l.fromDate}${l.halfDay ? ' (half day)' : ''}` : `${l.fromDate} to ${l.toDate}`;
  }

  private async notifyApplied(user: RequestUser, l: LeaveRequestDto, employeeUserId: string | null) {
    try {
      const to = (await this.access.leaveApprovers(user.organizationId, l.projectId)).filter((u) => u !== user.id && u !== employeeUserId);
      if (!to.length) return;
      await this.notifications.notify({
        organizationId: user.organizationId,
        userIds: to,
        type: 'LEAVE',
        title: `${l.employeeName} applied for ${LEAVE_TYPE_LABELS[l.type].toLowerCase()}`,
        body: `${l.days} day${l.days === '1' ? '' : 's'}, ${this.leaveSpan(l)}: ${l.reason}`,
        projectId: l.projectId,
        entityId: l.id,
        dedupeKey: `LEAVE_APPLIED:${l.id}`,
        // Leave waits on whoever decides it, and the days may already have started (finding 18 of the October review).
        email: { href: `/staff?tab=leave&leave=${l.id}`, cta: 'Decide it' },
      });
    } catch (e) {
      this.log.warn(`Leave notification failed: ${(e as Error).message}`);
    }
  }

  private async notifyDecided(user: RequestUser, l: LeaveRequestDto, userIds: (string | null)[]) {
    try {
      const to = [...new Set(userIds.filter((u): u is string => !!u && u !== user.id))];
      if (!to.length) return;
      await this.notifications.notify({
        organizationId: user.organizationId,
        userIds: to,
        type: 'LEAVE',
        title: `${LEAVE_TYPE_LABELS[l.type]} ${l.status === 'APPROVED' ? 'approved' : 'rejected'}`,
        body: `${l.employeeName}, ${this.leaveSpan(l)}${l.decisionNote ? `: ${l.decisionNote}` : ''}`,
        projectId: l.projectId,
        entityId: l.id,
        dedupeKey: `LEAVE_${l.status}:${l.id}`,
      });
    } catch (e) {
      this.log.warn(`Leave notification failed: ${(e as Error).message}`);
    }
  }

  /* ---------- holidays ---------- */

  async holidays(user: RequestUser, q: HolidayQuery): Promise<HolidayDto[]> {
    const year = q.year ?? yearOf(todayIn());
    const rows = await this.prisma.holiday.findMany({
      where: { organizationId: user.organizationId, date: yearRange(year), ...(q.projectId ? { OR: [{ projectId: null }, { projectId: q.projectId }] } : {}) },
      include: { project: { select: { name: true } } },
      orderBy: [{ date: 'asc' }, { name: 'asc' }],
    });
    return rows.map((h) => this.toHolidayDto(h));
  }

  async createHoliday(user: RequestUser, dto: CreateHolidayDto): Promise<HolidayDto> {
    this.access.assertCanManageStaff(user);
    await this.checkLinks(user, { projectId: dto.projectId });
    const date = parseDate(dto.date);
    const clash = await this.prisma.holiday.findFirst({ where: { organizationId: user.organizationId, date, projectId: dto.projectId ?? null } });
    if (clash) throw new BadRequestException(`${dto.date} is already a holiday (${clash.name})`);
    const h = await this.prisma.holiday.create({
      data: { organizationId: user.organizationId, date, name: dto.name, projectId: dto.projectId ?? null },
      include: { project: { select: { name: true } } },
    });
    await this.audit.log(user, 'HOLIDAY', h.id, 'CREATED', `${dto.date} ${dto.name}`);
    return this.toHolidayDto(h);
  }

  async removeHoliday(user: RequestUser, id: string) {
    this.access.assertCanManageStaff(user);
    const h = await this.prisma.holiday.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!h) throw new NotFoundException('Holiday not found');
    await this.prisma.holiday.delete({ where: { id } });
    await this.audit.log(user, 'HOLIDAY', id, 'DELETED', `${dateOnly(h.date)} ${h.name}`);
    return { ok: true, undo: this.undo.offer(user, 'HOLIDAY', { rows: [{ model: 'holiday', data: h }] }) };
  }
}
