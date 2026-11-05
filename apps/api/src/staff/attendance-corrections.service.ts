import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { STAFF_ATTENDANCE_LABELS, canManageStaff, type AttendanceCorrectionDto, type StaffDecision } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService, staffLineSelect, staffRequestEmployeeSelect } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { AttendanceService } from '../attendance/attendance.service';
import { NotificationsService } from '../notifications/notifications.service';
import { atWallClock } from '../notifications/time';
import { assertNotAfterToday, dateOnly, dec, formatDay, iso, parseDate } from '../common/serialize';
import { AskCorrectionDto } from './staff.dto';

const include = {
  employee: { select: staffRequestEmployeeSelect },
  recommendedBy: { select: { fullName: true } },
  decidedBy: { select: { fullName: true } },
} satisfies Prisma.AttendanceCorrectionInclude;
type Row = Prisma.AttendanceCorrectionGetPayload<{ include: typeof include }>;
type Day = { employeeId: string; date: Date; status: AttendanceCorrectionDto['dayStatus']; checkIn: Date | null; checkOut: Date | null; overtimeHours: Prisma.Decimal | null };

/**
 * An employee's own request to correct one day of their attendance: a missed mark-in, a wrong status, overtime the
 * register missed. It goes through the two steps of leave (`staff-approval.ts`: their manager recommends, HR approves)
 * and the final approval writes it to the day, unless payroll for the month is approved (`assertDayUnlocked`).
 */
@Injectable()
export class AttendanceCorrectionsService {
  private readonly log = new Logger(AttendanceCorrectionsService.name);

  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private notifications: NotificationsService,
    private attendanceLock: AttendanceService,
  ) {}

  private toDto(c: Row, user: RequestUser, day: Day | undefined): AttendanceCorrectionDto {
    const turn = this.access.staffTurn(user, c, c.employee);
    return {
      id: c.id,
      employeeId: c.employeeId,
      employeeName: c.employee.fullName,
      employeeCode: c.employee.employeeCode,
      projectName: c.employee.project?.name ?? null,
      date: dateOnly(c.date),
      current: day ? { status: day.status, checkIn: iso(day.checkIn), checkOut: iso(day.checkOut), overtimeHours: dec(day.overtimeHours) } : null,
      dayStatus: c.dayStatus,
      checkIn: iso(c.checkIn),
      checkOut: iso(c.checkOut),
      overtimeHours: dec(c.overtimeHours),
      reason: c.reason,
      status: c.status,
      decidedByName: c.decidedBy?.fullName ?? null,
      decidedAt: iso(c.decidedAt),
      decisionNote: c.decisionNote,
      createdAt: c.createdAt.toISOString(),
      canDecide: turn.mine,
      canCancel: c.status === 'PENDING' && (c.employee.userId === user.id || canManageStaff(user.roleKey)),
      approval: { waitingOn: turn.waitingOn, recommendedByName: c.recommendedBy?.fullName ?? null, recommendedAt: iso(c.recommendedAt), recommendNote: c.recommendNote, callerRecommends: turn.recommends },
    };
  }

  /** The DTOs with each day as it stands now. */
  private async toDtos(rows: Row[], user: RequestUser): Promise<AttendanceCorrectionDto[]> {
    const days = rows.length
      ? await this.prisma.staffAttendance.findMany({
          where: { OR: rows.map((r) => ({ employeeId: r.employeeId, date: r.date })) },
          select: { employeeId: true, date: true, status: true, checkIn: true, checkOut: true, overtimeHours: true },
        })
      : [];
    const key = (employeeId: string, date: Date) => `${employeeId}|${dateOnly(date)}`;
    const byKey = new Map(days.map((d) => [key(d.employeeId, d.date), d]));
    return rows.map((r) => this.toDto(r, user, byKey.get(key(r.employeeId, r.date))));
  }

  /** Corrections waiting on the user: the employees they may decide for, narrowed by the two-step rule. */
  async waitingIds(user: RequestUser): Promise<string[]> {
    const rows = await this.prisma.attendanceCorrection.findMany({
      where: { organizationId: user.organizationId, status: 'PENDING', employee: this.access.staffDeciderWhere(user) },
      select: { id: true, status: true, appliedById: true, recommendedById: true, employee: { select: staffLineSelect } },
      take: 1000,
    });
    return rows.filter((r) => this.access.staffTurn(user, r, r.employee).mine).map((r) => r.id);
  }

  /** Waiting on the caller, oldest day first. */
  async toDecide(user: RequestUser): Promise<AttendanceCorrectionDto[]> {
    const rows = await this.prisma.attendanceCorrection.findMany({ where: { id: { in: await this.waitingIds(user) } }, include, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] });
    return this.toDtos(rows, user);
  }

  /** One employee's own requests, newest first. */
  async mine(user: RequestUser, employeeId: string): Promise<AttendanceCorrectionDto[]> {
    const rows = await this.prisma.attendanceCorrection.findMany({ where: { employeeId }, include, orderBy: [{ createdAt: 'desc' }], take: 20 });
    return this.toDtos(rows, user);
  }

  private async visible(user: RequestUser, id: string) {
    const c = await this.prisma.attendanceCorrection.findFirst({ where: { id, organizationId: user.organizationId, employee: this.access.staffWhere(user) }, include });
    if (!c) throw new NotFoundException('Attendance correction not found');
    return c;
  }

  async ask(user: RequestUser, dto: AskCorrectionDto): Promise<AttendanceCorrectionDto> {
    const e = await this.prisma.employee.findFirst({ where: { organizationId: user.organizationId, userId: user.id }, select: { id: true, fullName: true, isActive: true, joinedOn: true, projectId: true } });
    if (!e?.isActive) throw new BadRequestException('Your login is not linked to a staff record. Ask HR to link it.');
    assertNotAfterToday(dto.date, 'attendance');
    if (e.joinedOn && dto.date < dateOnly(e.joinedOn)) throw new BadRequestException(`You joined on ${formatDay(dateOnly(e.joinedOn))}. Choose a day from then.`);
    const checkIn = dto.checkIn ? atWallClock(dto.date, dto.checkIn) : null;
    const checkOut = dto.checkOut ? atWallClock(dto.date, dto.checkOut) : null;
    if (checkIn && checkOut && checkOut <= checkIn) throw new BadRequestException('Mark-out must be after mark-in. Check the times.');
    if (dto.dayStatus === 'ABSENT' && (checkIn || checkOut || dto.overtimeHours)) throw new BadRequestException('An absent day has no times or overtime. Clear them, or choose present.');
    if (dto.overtimeHours != null && Math.round(dto.overtimeHours * 2) !== dto.overtimeHours * 2) throw new BadRequestException('Enter overtime in half hours, for example 1.5.');
    const date = parseDate(dto.date);
    await this.attendanceLock.assertDayUnlocked(user.organizationId, e.projectId, date);
    const waiting = await this.prisma.attendanceCorrection.findFirst({ where: { employeeId: e.id, date, status: 'PENDING' }, select: { id: true } });
    if (waiting) throw new BadRequestException(`You have already asked to correct ${formatDay(dto.date)}. Cancel that request to ask again.`);
    const created = await this.prisma.attendanceCorrection.create({
      data: {
        organizationId: user.organizationId,
        employeeId: e.id,
        date,
        dayStatus: dto.dayStatus,
        checkIn,
        checkOut,
        overtimeHours: dto.overtimeHours ?? null,
        reason: dto.reason,
        appliedById: user.id,
      },
      include,
    });
    await this.audit.log(user, 'ATTENDANCE_CORRECTION', created.id, 'CREATED', `${dto.date}: ${STAFF_ATTENDANCE_LABELS[dto.dayStatus]}`);
    const [out] = await this.toDtos([created], user);
    await this.notifyWaiting(user, out, created);
    return out;
  }

  /**
   * The manager's approval recommends it to HR (or approves it, when they are HR themselves); HR's approval writes it
   * to the day, which payroll may have locked since it was asked.
   */
  async decide(user: RequestUser, id: string, decision: StaffDecision, note?: string | null): Promise<AttendanceCorrectionDto> {
    const cur = await this.visible(user, id);
    const outcome = this.access.staffDecision(user, cur, cur.employee, decision);
    if (!outcome.ok) throw cur.status === 'PENDING' ? new ForbiddenException(outcome.problem) : new BadRequestException('This correction has already been decided or cancelled');
    if (outcome.result === 'APPROVED') await this.attendanceLock.assertDayUnlocked(user.organizationId, cur.employee.projectId, cur.date);
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const data =
        outcome.result === 'RECOMMENDED'
          ? { recommendedById: user.id, recommendedAt: now, recommendNote: note || null }
          : { status: outcome.result, decidedById: user.id, decidedAt: now, decisionNote: note || null };
      const { count } = await tx.attendanceCorrection.updateMany({ where: { id, status: 'PENDING', recommendedById: cur.recommendedById }, data });
      if (!count) throw new BadRequestException('This correction has just been decided by someone else. Open it again.');
      if (outcome.result === 'APPROVED') await this.writeDay(tx, user, cur);
      return tx.attendanceCorrection.findUniqueOrThrow({ where: { id }, include });
    });
    await this.audit.log(user, 'ATTENDANCE_CORRECTION', id, outcome.result, note || null);
    const [out] = await this.toDtos([updated], user);
    if (outcome.result === 'RECOMMENDED') await this.notifyWaiting(user, out, updated);
    else await this.notifyDecided(user, out, updated.employee.userId);
    return out;
  }

  /** The day as asked: the status always, a time or overtime only where one was asked; overtime asked is approved with it. */
  private async writeDay(tx: Prisma.TransactionClient, user: RequestUser, c: Row) {
    const overtime =
      c.overtimeHours === null
        ? {}
        : c.overtimeHours.gt(0)
          ? { overtimeHours: c.overtimeHours, overtimeStatus: 'APPROVED' as const, overtimeDecidedById: user.id, overtimeDecidedAt: new Date(), overtimeNote: 'Attendance correction', overtimeRecommendedById: c.recommendedById, overtimeRecommendedAt: c.recommendedAt }
          : { overtimeHours: null, overtimeStatus: null, overtimeDecidedById: null, overtimeDecidedAt: null, overtimeNote: null, overtimeRecommendedById: null, overtimeRecommendedAt: null };
    const data = {
      status: c.dayStatus,
      ...(c.checkIn ? { checkIn: c.checkIn } : {}),
      ...(c.checkOut ? { checkOut: c.checkOut } : {}),
      ...overtime,
      note: `Corrected: ${c.reason}`.slice(0, 500),
      markedById: user.id,
    };
    await tx.staffAttendance.upsert({
      where: { employeeId_date: { employeeId: c.employeeId, date: c.date } },
      create: { organizationId: c.organizationId, employeeId: c.employeeId, date: c.date, projectId: c.employee.projectId, ...data },
      update: data,
    });
  }

  /** Withdraw a waiting request: the employee, or HR. */
  async cancel(user: RequestUser, id: string): Promise<AttendanceCorrectionDto> {
    const cur = await this.visible(user, id);
    const [dto] = await this.toDtos([cur], user);
    if (!dto.canCancel) throw cur.status === 'PENDING' ? new ForbiddenException('Only the employee or HR can cancel this correction') : new BadRequestException('Only a waiting correction can be cancelled');
    const { count } = await this.prisma.attendanceCorrection.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'CANCELLED' } });
    if (!count) throw new BadRequestException('This correction has just been decided. Open it again.');
    await this.audit.log(user, 'ATTENDANCE_CORRECTION', id, 'CANCELLED');
    const [out] = await this.toDtos([await this.prisma.attendanceCorrection.findUniqueOrThrow({ where: { id }, include })], user);
    return out;
  }

  private async notifyWaiting(user: RequestUser, c: AttendanceCorrectionDto, row: Row) {
    try {
      const to = (await this.access.staffNextDeciders(user.organizationId, row, row.employee)).filter((u) => u !== user.id && u !== row.employee.userId);
      if (!to.length) return;
      const recommended = c.approval.recommendedByName;
      await this.notifications.notify({
        organizationId: user.organizationId,
        userIds: to,
        type: 'ATTENDANCE_CORRECTION',
        title: recommended ? `${recommended} recommended ${c.employeeName}'s attendance correction` : `${c.employeeName} asks to correct ${formatDay(c.date)}`,
        body: `${STAFF_ATTENDANCE_LABELS[c.dayStatus]} on ${formatDay(c.date)}: ${c.approval.recommendNote ?? c.reason}`,
        entityId: c.id,
        dedupeKey: `CORRECTION_${recommended ? 'RECOMMENDED' : 'ASKED'}:${c.id}`,
        email: { href: '/staff?tab=corrections', cta: 'Decide it' },
      });
    } catch (e) {
      this.log.warn(`Correction notification failed: ${(e as Error).message}`);
    }
  }

  private async notifyDecided(user: RequestUser, c: AttendanceCorrectionDto, employeeUserId: string | null) {
    if (!employeeUserId || employeeUserId === user.id) return;
    try {
      await this.notifications.notify({
        organizationId: user.organizationId,
        userIds: [employeeUserId],
        type: 'ATTENDANCE_CORRECTION',
        title: `Attendance correction ${c.status === 'APPROVED' ? 'approved' : 'rejected'}`,
        body: `${formatDay(c.date)}${c.decisionNote ? `: ${c.decisionNote}` : ''}`,
        entityId: c.id,
        dedupeKey: `CORRECTION_${c.status}:${c.id}`,
      });
    } catch (e) {
      this.log.warn(`Correction notification failed: ${(e as Error).message}`);
    }
  }
}
