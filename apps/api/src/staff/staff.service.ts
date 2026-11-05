import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DEFAULT_LEAVE_POLICY,
  leaveEntitlement,
  leaveOpeningProblem,
  OPENING_LEAVE_TYPES,
  type LeaveOpeningDto,
  type LeavePolicy,
  LEAVE_TYPE_LABELS,
  LEAVE_TYPES,
  ROLE_LABELS,
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
  type RoleKey,
  type SortOrder,
  type CheckInSiteDto,
  type OrgPersonDto,
  type StaffApprovalDto,
  type StaffDecision,
  type StaffRequestState,
  type StaffAttendanceDto,
  type StaffRegisterDto,
  type StaffSummaryDto,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService, staffLineSelect, staffRequestEmployeeSelect, type StaffLineRow } from '../common/project-access.service';
import { AttendanceService } from '../attendance/attendance.service';
import { AttendanceCorrectionsService } from './attendance-corrections.service';
import { AuditService } from '../common/audit.service';
import { UndoService } from '../common/undo.service';
import { ATTACHMENT_FIELDS, AttachmentsService } from '../common/attachments.service';
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
  CheckOutDto,
  CreateEmployeeDto,
  CreateHolidayDto,
  DecideLeaveDto,
  HolidayQuery,
  ListEmployeesQuery,
  ListLeaveQuery,
  RejectLeaveDto,
  SaveLeaveOpeningDto,
  SaveRegisterDto,
  UpdateEmployeeDto,
} from './staff.dto';

const employeeInclude = {
  user: { select: { email: true } },
  project: { select: { name: true } },
  reportingTo: { select: { fullName: true } },
  functionalManager: { select: { fullName: true } },
} satisfies Prisma.EmployeeInclude;

type EmployeeRow = Prisma.EmployeeGetPayload<{ include: typeof employeeInclude }>;

const attendanceInclude = {
  employee: { select: staffRequestEmployeeSelect },
  project: { select: { name: true } },
  markedBy: { select: { fullName: true } },
  overtimeDecidedBy: { select: { fullName: true } },
  overtimeRecommendedBy: { select: { fullName: true } },
  checkInPhoto: { select: ATTACHMENT_FIELDS },
  checkOutPhoto: { select: ATTACHMENT_FIELDS },
} satisfies Prisma.StaffAttendanceInclude;
type AttendanceRow = Prisma.StaffAttendanceGetPayload<{ include: typeof attendanceInclude }>;

const leaveInclude = {
  employee: { select: staffRequestEmployeeSelect },
  appliedBy: { select: { fullName: true } },
  recommendedBy: { select: { fullName: true } },
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

/** The HR record's fields from a create or edit: on an edit, a field left out stays as it is. */
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
    functionalManagerId: opt(dto.functionalManagerId, editing),
    probationEndsOn: optDate(dto.probationEndsOn, editing),
    confirmedOn: optDate(dto.confirmedOn, editing),
    noticeDays: opt(dto.noticeDays, editing),
    ctcAnnual: dto.ctcAnnual === undefined ? (editing ? undefined : null) : dto.ctcAnnual === null ? null : new Prisma.Decimal(dto.ctcAnnual),
  };
}

/** The next HR letter number of the year an event takes effect in: HR-2026-0001. */
export async function nextLetterNo(tx: Prisma.TransactionClient, organizationId: string, date: string) {
  const prefix = `HR-${date.slice(0, 4)}-`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`HRLETTER:${organizationId}:${prefix}`}))`;
  const last = await tx.employeeEvent.findFirst({ where: { organizationId, letterNo: { startsWith: prefix } }, orderBy: { letterNo: 'desc' }, select: { letterNo: true } });
  const n = last ? parseInt(last.letterNo.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(n).padStart(4, '0')}`;
}

/** Overtime as a request in the two steps of `staff-approval.ts`. */
const overtimeState = (a: { overtimeStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | null; overtimeRecommendedById: string | null }): StaffRequestState => ({
  status: a.overtimeStatus ?? 'APPROVED',
  appliedById: null,
  recommendedById: a.overtimeRecommendedById,
});
/** A decision's columns on the day: a recommendation keeps it waiting, for HR. */
const overtimeDecided = (result: 'RECOMMENDED' | 'APPROVED' | 'REJECTED', userId: string, note: string | null) =>
  result === 'RECOMMENDED'
    ? { overtimeRecommendedById: userId, overtimeRecommendedAt: new Date() }
    : { overtimeStatus: result, overtimeDecidedById: userId, overtimeDecidedAt: new Date(), overtimeNote: note };

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
    private attachments: AttachmentsService,
    private attendanceLock: AttendanceService,
    private corrections: AttendanceCorrectionsService,
  ) {
    undo.register('HOLIDAY', { entityType: 'HOLIDAY', check: (user) => this.access.assertCanManageStaff(user) });
  }

  // Mapping

  /** HR records: personal, statutory and bank details go to staff admins, payroll and the person only. */
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
      functionalManagerId: e.functionalManagerId,
      functionalManagerName: e.functionalManager?.fullName ?? null,
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
      date: dateOnly(a.date),
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
      checkInPhoto: a.checkInPhoto ? this.attachments.toDto(a.checkInPhoto) : null,
      checkOutPhoto: a.checkOutPhoto ? this.attachments.toDto(a.checkOutPhoto) : null,
      ...this.overtimeTurn(a, user),
      note: a.note,
      markedByName: a.markedBy.fullName,
    };
  }

  /** Where a request stands in its two steps, for the caller. */
  private approvalOf(user: RequestUser, req: StaffRequestState, e: StaffLineRow, rec: { name: string | null; at: Date | null; note: string | null }): { mine: boolean; approval: StaffApprovalDto } {
    const turn = this.access.staffTurn(user, req, e);
    return { mine: turn.mine, approval: { waitingOn: turn.waitingOn, recommendedByName: rec.name, recommendedAt: iso(rec.at), recommendNote: rec.note, callerRecommends: turn.recommends } };
  }

  private overtimeTurn(a: AttendanceRow, user: RequestUser): Pick<StaffAttendanceDto, 'canDecideOvertime' | 'overtimeApproval'> {
    if (!a.overtimeStatus) return { canDecideOvertime: false, overtimeApproval: null };
    const { mine, approval } = this.approvalOf(user, overtimeState(a), a.employee, { name: a.overtimeRecommendedBy?.fullName ?? null, at: a.overtimeRecommendedAt, note: null });
    return { canDecideOvertime: mine, overtimeApproval: approval };
  }

  /** A site's location for GPS check-in, or null when the project has none. */
  private toSite(p: { id: string; name: string; siteLat: Prisma.Decimal | null; siteLng: Prisma.Decimal | null; siteRadiusM: number | null; siteCheckInStrict: boolean } | null): CheckInSiteDto | null {
    if (!p?.siteLat || !p.siteLng) return null;
    return { projectId: p.id, projectName: p.name, lat: p.siteLat.toString(), lng: p.siteLng.toString(), radiusM: p.siteRadiusM ?? DEFAULT_SITE_RADIUS_M, strict: p.siteCheckInStrict };
  }

  private toLeaveDto(l: LeaveRow, user: RequestUser, today = todayIn()): LeaveRequestDto {
    const own = l.employee.userId === user.id || l.appliedById === user.id;
    const from = dateOnly(l.fromDate);
    const turn = this.approvalOf(user, l, l.employee, { name: l.recommendedBy?.fullName ?? null, at: l.recommendedAt, note: l.recommendNote });
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
      toDate: dateOnly(l.toDate),
      halfDay: l.halfDay,
      days: dec(l.days),
      reason: l.reason,
      status: l.status,
      appliedByName: l.appliedBy.fullName,
      decidedByName: l.decidedBy?.fullName ?? null,
      decidedAt: iso(l.decidedAt),
      decisionNote: l.decisionNote,
      createdAt: l.createdAt.toISOString(),
      canDecide: turn.mine,
      canCancel: (l.status === 'PENDING' && (own || canManageStaff(user.roleKey))) || (l.status === 'APPROVED' && (canManageStaff(user.roleKey) || (own && from > today))),
      approval: turn.approval,
    };
  }

  private toHolidayDto(h: { id: string; projectId: string | null; project: { name: string } | null; date: Date; name: string }): HolidayDto {
    return { id: h.id, projectId: h.projectId, projectName: h.project?.name ?? null, date: dateOnly(h.date), name: h.name };
  }

  // Lookups

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
    return new Map(rows.map((h) => [dateOnly(h.date), h.name]));
  }

  // Summary and me

  async summary(user: RequestUser): Promise<StaffSummaryDto> {
    const today = parseDate(todayIn());
    const [leave, overtime, corrections] = await Promise.all([this.leaveWaitingIds(user), this.overtimeWaitingIds(user), this.corrections.waitingIds(user)]);
    const waiting = { leaveToDecide: leave.length, overtimeToDecide: overtime.length, correctionsToDecide: corrections.length };
    if (!canMarkStaff(user.roleKey)) return { ...waiting, employees: null, onLeaveToday: null };
    const staff = { ...this.access.staffWhere(user), isActive: true };
    const [employees, onLeaveToday] = await Promise.all([
      this.prisma.employee.count({ where: staff }),
      this.prisma.leaveRequest.count({ where: { status: 'APPROVED', fromDate: { lte: today }, toDate: { gte: today }, employee: staff } }),
    ]);
    return { ...waiting, employees, onLeaveToday };
  }

  /** Leave waiting on the user: the employees they may decide for, narrowed by the two-step rule. */
  async leaveWaitingIds(user: RequestUser): Promise<string[]> {
    const rows = await this.prisma.leaveRequest.findMany({
      where: { organizationId: user.organizationId, status: 'PENDING', employee: this.access.staffDeciderWhere(user) },
      select: { id: true, status: true, appliedById: true, recommendedById: true, employee: { select: staffLineSelect } },
      take: 1000,
    });
    return rows.filter((r) => this.access.staffTurn(user, r, r.employee).mine).map((r) => r.id);
  }

  /** Days of overtime waiting on the user, the same way. */
  async overtimeWaitingIds(user: RequestUser): Promise<string[]> {
    const rows = await this.prisma.staffAttendance.findMany({
      where: { organizationId: user.organizationId, overtimeStatus: 'PENDING', employee: this.access.staffDeciderWhere(user) },
      select: { id: true, overtimeStatus: true, overtimeRecommendedById: true, employee: { select: staffLineSelect } },
      take: 1000,
    });
    return rows.filter((r) => this.access.staffTurn(user, overtimeState(r), r.employee).mine).map((r) => r.id);
  }

  /**
   * The org chart's people: every active employee the caller sees (`staffWhere`), with the names of both their lines. The
   * tree itself is `orgChart` (`@erp/shared`), built where it is drawn.
   */
  async orgPeople(user: RequestUser): Promise<OrgPersonDto[]> {
    const rows = await this.prisma.employee.findMany({
      where: { ...this.access.staffWhere(user), isActive: true },
      select: {
        id: true,
        employeeCode: true,
        fullName: true,
        designation: true,
        department: true,
        projectId: true,
        project: { select: { name: true } },
        reportingToId: true,
        reportingTo: { select: { fullName: true } },
        functionalManagerId: true,
        functionalManager: { select: { fullName: true } },
      },
      orderBy: { fullName: 'asc' },
    });
    return rows.map(({ project, reportingTo, functionalManager, ...r }) => ({
      ...r,
      projectName: project?.name ?? null,
      reportingToName: reportingTo?.fullName ?? null,
      functionalManagerName: functionalManager?.fullName ?? null,
    }));
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
    if (!e) return { employee: null, today: null, todayOff, year, balances: [], leave: [], corrections: [], holidays, site: null, monthPresent: '0' };
    const [att, leave, balances, site, month, corrections] = await Promise.all([
      this.prisma.staffAttendance.findUnique({ where: { employeeId_date: { employeeId: e.id, date: parseDate(today) } }, include: attendanceInclude }),
      this.prisma.leaveRequest.findMany({ where: { employeeId: e.id }, include: leaveInclude, orderBy: [{ fromDate: 'desc' }, { createdAt: 'desc' }], take: 20 }),
      this.balancesFor(e.id, e.projectId, year),
      e.projectId ? this.prisma.project.findUnique({ where: { id: e.projectId }, select: siteSelect }) : null,
      this.prisma.staffAttendance.groupBy({ by: ['status'], where: { employeeId: e.id, date: { gte: parseDate(`${today.slice(0, 7)}-01`), lte: parseDate(today) }, status: { in: ['PRESENT', 'HALF_DAY'] } }, _count: true }),
      this.corrections.mine(user, e.id),
    ]);
    const present = month.reduce((n, r) => n + (r.status === 'HALF_DAY' ? r._count / 2 : r._count), 0);
    return {
      employee: this.toEmployeeDto(e, user),
      today: att ? this.toAttendanceDto(att, user) : null,
      todayOff,
      year,
      balances,
      leave: leave.map((l) => this.toLeaveDto(l, user, today)),
      corrections,
      holidays,
      site: this.toSite(site),
      monthPresent: String(present),
    };
  }

  /**
   * Self check-in from the app: today, at their posting unless they say which site. With a position it
   * records where they were and whether that was inside the site's radius; a strict site refuses a check-in from
   * outside it or without a position. The phone sends the person's photo (face attendance), kept on the day.
   */
  async checkIn(user: RequestUser, dto: CheckInDto): Promise<StaffAttendanceDto> {
    const e = await this.ownEmployee(user);
    if (!e || !e.isActive) throw new BadRequestException('Your login is not linked to a staff record. Ask HR to link it.');
    const projectId = dto.projectId ?? e.projectId;
    if (dto.projectId && dto.projectId !== e.projectId) await this.access.assertCanAccessProject(user, dto.projectId);
    const date = parseDate(todayIn());
    const cur = await this.prisma.staffAttendance.findUnique({ where: { employeeId_date: { employeeId: e.id, date } } });
    if (cur?.checkIn) throw new BadRequestException('You have already marked in today');
    const checkInPhotoId = await this.ownPhoto(user, dto.photoId);
    const site = this.toSite(projectId ? await this.prisma.project.findUnique({ where: { id: projectId }, select: siteSelect }) : null);
    const hasPosition = dto.lat !== undefined && dto.lng !== undefined;
    const place = site && hasPosition ? checkInPlace({ lat: Number(site.lat), lng: Number(site.lng), radiusM: site.radiusM }, { lat: dto.lat!, lng: dto.lng!, accuracyM: dto.accuracyM ?? null }) : null;
    if (site?.strict && !hasPosition) throw new BadRequestException(`${site.projectName} checks your location when you mark in. Allow location for this app and try again.`);
    if (site?.strict && place && !place.inside) {
      throw new BadRequestException(`You are ${km(place.distanceM)} from ${site.projectName}; mark in from within ${site.radiusM} m of the site, or ask your manager to mark you in the register.`);
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
      ? await this.prisma.staffAttendance.update({ where: { id: cur.id }, data: { checkIn: now, status: 'PRESENT', projectId: projectId ?? cur.projectId, checkInPhotoId, ...position }, include: attendanceInclude })
      : await this.prisma.staffAttendance
          .create({ data: { organizationId: user.organizationId, employeeId: e.id, date, projectId, status: 'PRESENT', checkIn: now, markedById: user.id, checkInPhotoId, ...position }, include: attendanceInclude })
          .catch((err) => {
            if (isUniqueViolation(err)) throw new BadRequestException('You have already marked in today');
            throw err;
          });
    return this.toAttendanceDto(row, user);
  }

  /**
   * Check-out: overtime is the time past a standard day in half hours and waits for the site manager or HR; under half a day is marked a half day.
   */
  async checkOut(user: RequestUser, dto: CheckOutDto = {}): Promise<StaffAttendanceDto> {
    const e = await this.ownEmployee(user);
    if (!e) throw new BadRequestException('Your login is not linked to a staff record. Ask HR to link it.');
    const cur = await this.prisma.staffAttendance.findUnique({ where: { employeeId_date: { employeeId: e.id, date: parseDate(todayIn()) } } });
    if (!cur?.checkIn) throw new BadRequestException('Mark in first');
    if (cur.checkOut) throw new BadRequestException('You have already marked out today');
    const checkOutPhotoId = await this.ownPhoto(user, dto.photoId);
    const now = new Date();
    const hours = (now.getTime() - cur.checkIn.getTime()) / 3_600_000;
    const ot = overtimeHours(cur.checkIn.toISOString(), now.toISOString());
    const row = await this.prisma.staffAttendance.update({
      where: { id: cur.id },
      data: { checkOut: now, checkOutPhotoId, overtimeHours: ot, overtimeStatus: ot ? 'PENDING' : null, status: hours < STANDARD_DAY_HOURS / 2 ? 'HALF_DAY' : 'PRESENT' },
      include: attendanceInclude,
    });
    const out = this.toAttendanceDto(row, user);
    if (ot) await this.notifyOvertime(user, out, row);
    return out;
  }

  /** A face attendance photo: an image the person uploaded themselves, not yet kept on anything. */
  private async ownPhoto(user: RequestUser, photoId: string | undefined): Promise<string | null> {
    if (!photoId) return null;
    const photo = await this.prisma.attachment.findFirst({ where: { id: photoId, organizationId: user.organizationId, uploadedById: user.id, mimeType: { startsWith: 'image/' } }, select: { id: true } });
    if (!photo) throw new BadRequestException('Your photo did not reach the server. Take it again.');
    return photo.id;
  }

  // Employees

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
      select: { id: true, fullName: true, email: true, role: { select: { key: true } } },
      orderBy: { fullName: 'asc' },
    });
    return rows.map((u) => ({ id: u.id, fullName: u.fullName, email: u.email, roleName: ROLE_LABELS[u.role.key as RoleKey] }));
  }

  private async checkLinks(user: RequestUser, dto: { userId?: string | null; projectId?: string | null; reportingToId?: string | null; functionalManagerId?: string | null }, self?: string) {
    const lines = [
      ['Reports to', dto.reportingToId],
      ['Functional manager', dto.functionalManagerId],
    ] as const;
    for (const [label, id] of lines) {
      if (!id) continue;
      if (id === self) throw new BadRequestException(`${label}: someone cannot report to themselves. Choose their manager.`);
      if (!(await this.prisma.employee.findFirst({ where: { id, organizationId: user.organizationId }, select: { id: true } }))) throw new BadRequestException(`${label}: employee not found`);
    }
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
        // The joining is the first event of their service, and prints the appointment letter.
        if (e.joinedOn)
          await tx.employeeEvent.create({
            data: {
              organizationId: user.organizationId,
              employeeId: e.id,
              type: 'JOINED',
              effectiveDate: e.joinedOn,
              letterNo: await nextLetterNo(tx, user.organizationId, dateOnly(e.joinedOn)),
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

  // Attendance

  /** A site's staff for a day: everyone posted there (and anyone marked there that day), with leave covering the day. */
  /** Who may mark a register: a site's markers for a site; HR and admins for head office (staff posted nowhere). */
  private async assertMayMark(user: RequestUser, projectId: string | null) {
    if (projectId) return this.access.assertCanMarkStaff(user, projectId);
    if (!canManageStaff(user.roleKey)) throw new ForbiddenException('Only HR or an admin marks the head office register');
  }

  async register(user: RequestUser, projectId: string | null, date: string): Promise<StaffRegisterDto> {
    await this.assertMayMark(user, projectId);
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
    const projectId = dto.projectId ?? null;
    await this.assertMayMark(user, projectId);
    if (dto.date > todayIn()) throw new BadRequestException('Attendance cannot be marked for a future day');
    const day = parseDate(dto.date);
    await this.attendanceLock.assertDayUnlocked(user.organizationId, projectId, day);
    const ids = [...new Set(dto.entries.map((e) => e.employeeId))];
    if (ids.length !== dto.entries.length) throw new BadRequestException('Each employee once per register');
    const allowed = await this.prisma.employee.findMany({
      where: {
        id: { in: ids },
        organizationId: user.organizationId,
        OR: [{ projectId, isActive: true }, { attendance: { some: { date: day, projectId } } }, ...(canManageStaff(user.roleKey) ? [{ isActive: true }] : [])],
      },
      select: { id: true, ...staffLineSelect, attendance: { where: { date: day }, select: { overtimeHours: true, overtimeStatus: true } } },
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
        // Overtime the marker changes counts as their decision where it is theirs to take (approved, or recommended to
        // HR), else it waits; unchanged keeps its decision.
        const emp = byId.get(e.employeeId)!;
        const was = emp.attendance[0];
        const otChanged = e.overtimeHours !== undefined && Number(e.overtimeHours ?? 0) !== Number(was?.overtimeHours ?? 0);
        const fresh = { overtimeStatus: 'PENDING' as const, overtimeDecidedById: null, overtimeDecidedAt: null, overtimeNote: null, overtimeRecommendedById: null, overtimeRecommendedAt: null };
        const asMarker = this.access.staffDecision(user, overtimeState(fresh), emp, 'APPROVE');
        const data = {
          status: e.status,
          projectId,
          note: e.note === undefined ? undefined : e.note || null,
          overtimeHours: e.overtimeHours === undefined ? undefined : e.overtimeHours,
          ...(otChanged
            ? e.overtimeHours
              ? { ...fresh, ...(asMarker.ok ? overtimeDecided(asMarker.result, user.id, null) : {}) }
              : { ...fresh, overtimeStatus: null }
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
    await this.audit.log(user, 'STAFF_REGISTER', projectId ?? user.organizationId, 'SAVED', `${projectId ? '' : 'Head office, '}${dto.date}: ${marked} marked`);
    return this.register(user, projectId, dto.date);
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

  // Overtime

  /** Overtime waiting on the caller (the employee's manager, then HR), oldest first. */
  async overtimeToDecide(user: RequestUser): Promise<StaffAttendanceDto[]> {
    const rows = await this.prisma.staffAttendance.findMany({
      where: { id: { in: await this.overtimeWaitingIds(user) } },
      include: attendanceInclude,
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      take: 200,
    });
    return rows.map((r) => this.toAttendanceDto(r, user));
  }

  async decideOvertime(user: RequestUser, id: string, decision: StaffDecision, note?: string | null): Promise<StaffAttendanceDto> {
    const cur = await this.prisma.staffAttendance.findFirst({ where: { id, organizationId: user.organizationId, overtimeStatus: { not: null } }, include: attendanceInclude });
    if (!cur) throw new NotFoundException('Overtime not found');
    const outcome = this.access.staffDecision(user, overtimeState(cur), cur.employee, decision);
    if (!outcome.ok) throw cur.overtimeStatus === 'PENDING' ? new ForbiddenException(outcome.problem) : new BadRequestException('This overtime has already been decided');
    const { count } = await this.prisma.staffAttendance.updateMany({
      where: { id, overtimeStatus: 'PENDING', overtimeRecommendedById: cur.overtimeRecommendedById },
      data: overtimeDecided(outcome.result, user.id, note || null),
    });
    if (!count) throw new BadRequestException('This overtime has just been decided by someone else. Open it again.');
    await this.audit.log(user, 'STAFF_OVERTIME', id, outcome.result, `${cur.employee.fullName}, ${dateOnly(cur.date)}: ${dec(cur.overtimeHours)} h${note ? ` (${note})` : ''}`);
    const row = await this.prisma.staffAttendance.findUniqueOrThrow({ where: { id }, include: attendanceInclude });
    const out = this.toAttendanceDto(row, user);
    if (outcome.result === 'RECOMMENDED') {
      await this.notifyOvertime(user, out, row);
      return out;
    }
    const status = outcome.result;
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

  /** Waiting overtime: whoever acts next (the manager, then HR) is told it waits on them. */
  private async notifyOvertime(user: RequestUser, a: StaffAttendanceDto, row: AttendanceRow) {
    try {
      const to = (await this.access.staffNextDeciders(user.organizationId, overtimeState(row), row.employee)).filter((u) => u !== user.id && u !== row.employee.userId);
      if (!to.length) return;
      const recommended = a.overtimeApproval?.recommendedByName;
      await this.notifications.notify({
        organizationId: user.organizationId,
        userIds: to,
        type: 'OVERTIME',
        title: recommended ? `${recommended} recommended ${a.employeeName}'s ${a.overtimeHours} h overtime` : `${a.employeeName} worked ${a.overtimeHours} h overtime`,
        body: `${a.date}${a.projectName ? ` at ${a.projectName}` : ''}: ${recommended ? 'approve it' : 'decide it'} for payroll on the Staff page.`,
        projectId: a.projectId,
        entityId: a.id,
        dedupeKey: `OVERTIME_${recommended ? 'RECOMMENDED' : 'PENDING'}:${a.id}`,
      });
    } catch (e) {
      this.log.warn(`Overtime notification failed: ${(e as Error).message}`);
    }
  }

  // Leave

  /** The company's leave rules (Payroll settings), as shipped until HR sets them. */
  private async leavePolicy(organizationId: string, db: Prisma.TransactionClient = this.prisma): Promise<LeavePolicy> {
    const s = await db.payrollSettings.findUnique({ where: { organizationId }, select: { casualLeaveDays: true, sickLeaveDays: true, earnedLeaveDays: true, earnedCarryMax: true, leaveProRata: true } });
    return s
      ? { casual: s.casualLeaveDays.toNumber(), sick: s.sickLeaveDays.toNumber(), earned: s.earnedLeaveDays.toNumber(), earnedCarryMax: s.earnedCarryMax.toNumber(), proRata: s.leaveProRata }
      : DEFAULT_LEAVE_POLICY;
  }

  /**
   * Days a year per type: the company's leave rules (`leaveEntitlement`) with the employee's opening leave (days taken
   * before Nirmaan count as taken; earned leave brought forward stands in for the carry); comp-off is earned by working a
   * weekly off or holiday (a half day earns half); unpaid has no limit. Leave counts in the year it starts.
   */
  async balancesFor(employeeId: string, projectId: string | null, year: number, db: Prisma.TransactionClient = this.prisma, excludeId?: string): Promise<LeaveBalanceDto[]> {
    const range = yearRange(year);
    const [rows, worked, openings] = await Promise.all([
      db.leaveRequest.groupBy({ by: ['type', 'status'], where: { employeeId, status: { in: [...LIVE_LEAVE] }, fromDate: range, ...(excludeId ? { id: { not: excludeId } } : {}) }, _sum: { days: true } }),
      db.staffAttendance.findMany({ where: { employeeId, date: range, status: { in: ['PRESENT', 'HALF_DAY'] } }, select: { date: true, status: true, projectId: true } }),
      db.leaveOpening.findMany({ where: { employeeId, year }, select: { type: true, takenBefore: true, broughtForward: true } }),
    ]);
    const emp = await db.employee.findUnique({ where: { id: employeeId }, select: { organizationId: true, joinedOn: true } });
    const [holidays, policy] = emp
      ? await Promise.all([db.holiday.findMany({ where: { organizationId: emp.organizationId, date: range }, select: { date: true, projectId: true } }), this.leavePolicy(emp.organizationId, db)])
      : [[], DEFAULT_LEAVE_POLICY];
    const joinedOn = emp?.joinedOn ? dateOnly(emp.joinedOn) : null;
    // Earned leave the year before left, for what carries: that year's own days (no carry of its own) less taken and waiting.
    let earnedLeftLastYear = 0;
    if (policy.earnedCarryMax > 0) {
      const [last, lastOpening] = await Promise.all([
        db.leaveRequest.aggregate({ where: { employeeId, type: 'EARNED', status: { in: [...LIVE_LEAVE] }, fromDate: yearRange(year - 1) }, _sum: { days: true } }),
        db.leaveOpening.findUnique({ where: { employeeId_year_type: { employeeId, year: year - 1, type: 'EARNED' } }, select: { takenBefore: true, broughtForward: true } }),
      ]);
      const lastBrought = lastOpening?.broughtForward ? lastOpening.broughtForward.toNumber() : null;
      earnedLeftLastYear =
        (leaveEntitlement('EARNED', { ...policy, earnedCarryMax: 0 }, year - 1, joinedOn, 0, lastBrought) ?? 0) - num(last._sum.days ?? 0) - (lastOpening ? lastOpening.takenBefore.toNumber() : 0);
    }
    const isOff = (d: Date, p: string | null) => {
      const s = dateOnly(d);
      return isWeeklyOff(s) || holidays.some((h) => dateOnly(h.date) === s && (h.projectId === null || h.projectId === (p ?? projectId)));
    };
    const compOff = worked.filter((a) => isOff(a.date, a.projectId)).reduce((n, a) => n + (a.status === 'HALF_DAY' ? 0.5 : 1), 0);
    const sum = (type: LeaveType, status: 'PENDING' | 'APPROVED') => num(rows.find((r) => r.type === type && r.status === status)?._sum.days ?? 0);
    return LEAVE_TYPES.map((type) => {
      const opening = openings.find((o) => o.type === type);
      const broughtForward = opening?.broughtForward ? opening.broughtForward.toNumber() : null;
      const entitled = type === 'COMP_OFF' ? compOff : leaveEntitlement(type, policy, year, joinedOn, earnedLeftLastYear, broughtForward);
      const takenBefore = opening ? opening.takenBefore.toNumber() : 0;
      const taken = sum(type, 'APPROVED') + takenBefore;
      const pending = sum(type, 'PENDING');
      return { type, entitled, taken, takenBefore, pending, left: entitled === null ? null : entitled - taken - pending };
    });
  }

  async balances(user: RequestUser, q: BalanceQuery): Promise<LeaveBalanceDto[]> {
    const e = q.employeeId ? await this.visibleEmployee(user, q.employeeId) : await this.ownEmployee(user);
    if (!e) throw new NotFoundException('Your login is not linked to a staff record');
    return this.balancesFor(e.id, e.projectId, q.year ?? yearOf(todayIn()));
  }

  /** An employee's leave before Nirmaan for a year: days taken and earned leave brought forward (HR and the people who see the record). */
  async leaveOpening(user: RequestUser, employeeId: string, year: number): Promise<LeaveOpeningDto> {
    const e = await this.visibleEmployee(user, employeeId);
    const rows = await this.prisma.leaveOpening.findMany({ where: { employeeId: e.id, year }, include: { updatedBy: { select: { fullName: true } } }, orderBy: { updatedAt: 'desc' } });
    return {
      employeeId: e.id,
      year,
      lines: OPENING_LEAVE_TYPES.map((type) => {
        const r = rows.find((x) => x.type === type);
        return { type, takenBefore: r ? r.takenBefore.toNumber() : 0, broughtForward: r?.broughtForward ? r.broughtForward.toNumber() : null };
      }),
      updatedByName: rows[0]?.updatedBy.fullName ?? null,
      updatedAt: rows[0] ? iso(rows[0].updatedAt) : null,
    };
  }

  /** HR sets an employee's leave before Nirmaan for a year; a line of nothing taken and nothing brought forward is removed. */
  async saveLeaveOpening(user: RequestUser, employeeId: string, dto: SaveLeaveOpeningDto): Promise<LeaveOpeningDto> {
    if (!canManageStaff(user.roleKey)) throw new ForbiddenException('Only HR or an admin sets opening leave');
    const e = await this.visibleEmployee(user, employeeId);
    const lines = dto.lines.map((l) => ({ type: l.type, takenBefore: l.takenBefore, broughtForward: l.broughtForward ?? null }));
    const problem = leaveOpeningProblem(lines);
    if (problem) throw new BadRequestException(problem);
    await this.prisma.$transaction(async (tx) => {
      await this.lockEmployee(tx, e.id);
      for (const l of lines) {
        const key = { employeeId_year_type: { employeeId: e.id, year: dto.year, type: l.type } };
        if (!l.takenBefore && l.broughtForward === null) {
          await tx.leaveOpening.deleteMany({ where: { employeeId: e.id, year: dto.year, type: l.type } });
          continue;
        }
        const data = { takenBefore: l.takenBefore, broughtForward: l.broughtForward, updatedById: user.id };
        await tx.leaveOpening.upsert({ where: key, create: { organizationId: user.organizationId, employeeId: e.id, year: dto.year, type: l.type, ...data }, update: data });
      }
    });
    const words = lines
      .filter((l) => l.takenBefore || l.broughtForward !== null)
      .map((l) => `${LEAVE_TYPE_LABELS[l.type]}: ${l.takenBefore} taken${l.broughtForward !== null ? `, ${l.broughtForward} brought forward` : ''}`)
      .join('; ');
    await this.audit.log(user, 'EMPLOYEE', e.id, 'UPDATED', `Opening leave ${dto.year}: ${words || 'none'}`);
    return this.leaveOpening(user, e.id, dto.year);
  }

  private leaveWhere(user: RequestUser): Prisma.LeaveRequestWhereInput {
    return { organizationId: user.organizationId, employee: this.access.staffWhere(user) };
  }

  async listLeave(user: RequestUser, q: ListLeaveQuery): Promise<Paginated<LeaveRequestDto>> {
    const and: Prisma.LeaveRequestWhereInput[] = [this.leaveWhere(user)];
    if (q.toDecide) and.push({ id: { in: await this.leaveWaitingIds(user) } });
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
    await this.notifyWaiting(user, out, created);
    return out;
  }

  /** The manager's approval recommends it to HR (or approves it, when they are HR themselves); HR's approves it. */
  async approveLeave(user: RequestUser, id: string, dto: DecideLeaveDto): Promise<LeaveRequestDto> {
    return this.decide(user, id, 'APPROVE', dto.note);
  }

  async rejectLeave(user: RequestUser, id: string, dto: RejectLeaveDto): Promise<LeaveRequestDto> {
    return this.decide(user, id, 'REJECT', dto.note);
  }

  private async decide(user: RequestUser, id: string, decision: StaffDecision, note?: string | null): Promise<LeaveRequestDto> {
    const cur = await this.visibleLeave(user, id);
    const outcome = this.access.staffDecision(user, cur, cur.employee, decision);
    if (!outcome.ok) throw cur.status === 'PENDING' ? new ForbiddenException(outcome.problem) : new BadRequestException('This leave has already been decided or cancelled');
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.lockEmployee(tx, cur.employeeId);
      const fresh = await tx.leaveRequest.findUnique({ where: { id }, select: { status: true, recommendedById: true } });
      if (fresh?.status !== 'PENDING') throw new BadRequestException('This leave has already been decided or cancelled');
      if (fresh.recommendedById !== cur.recommendedById) throw new BadRequestException('This leave has just been recommended by someone else. Open it again.');
      // Balance and overlap stand at the final approval, as when it was applied for.
      if (outcome.result === 'APPROVED') await this.assertBalance(tx, cur.employeeId, cur.employee.projectId, cur.type, dateOnly(cur.fromDate), num(cur.days), id);
      const data =
        outcome.result === 'RECOMMENDED'
          ? { recommendedById: user.id, recommendedAt: now, recommendNote: note || null }
          : { status: outcome.result, decidedById: user.id, decidedAt: now, decisionNote: note || null };
      return tx.leaveRequest.update({ where: { id }, data, include: leaveInclude });
    });
    await this.audit.log(user, 'LEAVE', id, outcome.result, note || null);
    const out = this.toLeaveDto(updated, user);
    if (outcome.result === 'RECOMMENDED') await this.notifyWaiting(user, out, updated);
    else await this.notifyDecided(user, out, [updated.employee.userId, updated.appliedById]);
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

  /** Waiting leave: whoever acts next (the manager when applied for, then HR once recommended) is told. */
  private async notifyWaiting(user: RequestUser, l: LeaveRequestDto, row: LeaveRow) {
    try {
      const to = (await this.access.staffNextDeciders(user.organizationId, row, row.employee)).filter((u) => u !== user.id && u !== row.employee.userId);
      if (!to.length) return;
      const recommended = l.approval.recommendedByName;
      await this.notifications.notify({
        organizationId: user.organizationId,
        userIds: to,
        type: 'LEAVE',
        title: recommended ? `${recommended} recommended ${l.employeeName}'s ${LEAVE_TYPE_LABELS[l.type].toLowerCase()}` : `${l.employeeName} applied for ${LEAVE_TYPE_LABELS[l.type].toLowerCase()}`,
        body: `${l.days} day${l.days === '1' ? '' : 's'}, ${this.leaveSpan(l)}: ${l.approval.recommendNote ?? l.reason}`,
        projectId: l.projectId,
        entityId: l.id,
        dedupeKey: `LEAVE_${recommended ? 'RECOMMENDED' : 'APPLIED'}:${l.id}`,
        // Leave waits on whoever decides it, and the days may already have started.
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

  // Holidays

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
