import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DEPARTMENTAL_CONTRACTOR,
  manDays,
  maskWorkerId,
  rollCallHeadCount,
  workerOtRate,
  workerOvertime,
  workerWages,
  type MusterDto,
  type MusterRowDto,
  type OutputDto,
  type Paginated,
  type RollCallDto,
  type RollCallRowDto,
  type WorkerDto,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { UndoService } from '../common/undo.service';
import { dateOnly, dec, iso, money, parseDate } from '../common/serialize';
import { ilike, pageArgs, paginated, searchWords } from '../common/paging';
import { todayIn } from '../notifications/time';
import { AttendanceService } from '../attendance/attendance.service';
import { CreateWorkerDto, ListWorkersQuery, MusterQuery, OutputQuery, RollCallQuery, SaveRollCallDto, UpdateWorkerDto } from './workers.dto';

const include = { project: { select: { name: true } } } satisfies Prisma.WorkerInclude;
type Row = Prisma.WorkerGetPayload<{ include: typeof include }>;

const markInclude = { activity: { select: { name: true } }, markedBy: { select: { fullName: true } } } satisfies Prisma.WorkerAttendanceInclude;

const byRoll = (a: { contractor: string; trade: string; name: string }, b: { contractor: string; trade: string; name: string }) =>
  a.contractor.localeCompare(b.contractor) || a.trade.localeCompare(b.trade) || a.name.localeCompare(b.name);

/**
 * Named worker register: contractor labour by name, the daily roll call per project, the monthly
 * muster with wages, and output per man-day against approved progress. The roll call keeps the day's head-count
 * sheet in step, so the DPR's manpower and the labour cost keep working from it.
 */
@Injectable()
export class WorkersService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private attendance: AttendanceService,
    private undo: UndoService,
  ) {
    undo.register('WORKER', { entityType: 'WORKER', check: (user, row) => this.access.assertCanManageWorkers(user, (row.projectId as string | null) ?? null) });
  }

  private toDto(r: Row, lastSeen: Date | null): WorkerDto {
    return {
      id: r.id,
      workerNo: r.workerNo,
      name: r.name,
      fatherName: r.fatherName,
      phone: r.phone,
      contractor: r.contractor,
      vendorId: r.vendorId,
      trade: r.trade,
      skill: r.skill,
      idType: r.idType,
      idNumber: r.idNumber,
      dailyWage: money(r.dailyWage)!,
      otRate: money(r.otRate),
      effectiveOtRate: workerOtRate(r.dailyWage.toString(), r.otRate?.toString() ?? null).toFixed(2),
      projectId: r.projectId,
      projectName: r.project?.name ?? null,
      joinedOn: dateOnly(r.joinedOn),
      leftOn: dateOnly(r.leftOn),
      isActive: r.isActive,
      lastSeenOn: dateOnly(lastSeen),
      createdAt: iso(r.createdAt)!,
      updatedAt: iso(r.updatedAt)!,
    };
  }

  /** Workers of projects the user can see, and those not posted to any project. */
  private visibleWhere(user: RequestUser): Prisma.WorkerWhereInput {
    return { organizationId: user.organizationId, OR: [{ projectId: null }, { project: this.access.projectWhere(user) }] };
  }

  private async lastSeen(ids: string[]) {
    if (!ids.length) return new Map<string, Date>();
    const rows = await this.prisma.workerAttendance.groupBy({ by: ['workerId'], where: { workerId: { in: ids }, status: { in: ['PRESENT', 'HALF_DAY'] } }, _max: { date: true } });
    return new Map(rows.filter((r) => r._max.date).map((r) => [r.workerId, r._max.date!]));
  }

  async list(user: RequestUser, q: ListWorkersQuery): Promise<Paginated<WorkerDto>> {
    await this.access.assertCanViewWorkers(user, q.projectId ?? null);
    const and: Prisma.WorkerWhereInput[] = [this.visibleWhere(user), { isActive: q.active ?? true }];
    if (q.projectId) and.push({ projectId: q.projectId });
    if (q.contractor) and.push({ contractor: { equals: q.contractor, mode: 'insensitive' } });
    for (const w of searchWords(q.q))
      and.push({ OR: [{ workerNo: ilike(w) }, { name: ilike(w) }, { fatherName: ilike(w) }, { phone: ilike(w) }, { contractor: ilike(w) }, { trade: ilike(w) }] });
    const where: Prisma.WorkerWhereInput = { AND: and };
    const args = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.worker.findMany({ where, include, orderBy: [{ contractor: 'asc' }, { trade: 'asc' }, { name: 'asc' }, { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.worker.count({ where }),
    ]);
    const seen = await this.lastSeen(rows.map((r) => r.id));
    return paginated(rows.map((r) => this.toDto(r, seen.get(r.id) ?? null)), total, args);
  }

  async get(user: RequestUser, id: string): Promise<WorkerDto> {
    await this.access.assertCanViewWorkers(user, null);
    const row = await this.prisma.worker.findFirst({ where: { id, ...this.visibleWhere(user) }, include });
    if (!row) throw new NotFoundException('Worker not found');
    return this.toDto(row, (await this.lastSeen([id])).get(id) ?? null);
  }

  /** A contractor named like an active vendor links to it and takes its spelling. */
  private async vendorFor(organizationId: string, contractor: string) {
    if (contractor.toLowerCase() === DEPARTMENTAL_CONTRACTOR.toLowerCase()) return { contractor: DEPARTMENTAL_CONTRACTOR, vendorId: null };
    const v = await this.prisma.vendor.findFirst({ where: { organizationId, isActive: true, name: { equals: contractor, mode: 'insensitive' } }, select: { id: true, name: true } });
    return v ? { contractor: v.name, vendorId: v.id } : { contractor, vendorId: null };
  }

  private async defaultWage(organizationId: string, trade: string) {
    const rate = await this.prisma.labourRate.findFirst({ where: { organizationId, category: { equals: trade, mode: 'insensitive' } }, select: { dailyRate: true } });
    if (!rate) throw new BadRequestException(`Enter the daily wage: there is no labour rate for ${trade} to take it from.`);
    return rate.dailyRate;
  }

  private positive(v: string | undefined | null, what: string) {
    if (v === undefined || v === null || v === '') return v === '' ? null : v;
    if (Number(v) < 0) throw new BadRequestException(`${what} cannot be negative`);
    return v;
  }

  async create(user: RequestUser, dto: CreateWorkerDto): Promise<WorkerDto> {
    await this.access.assertCanManageWorkers(user, dto.projectId ?? null);
    const link = await this.vendorFor(user.organizationId, dto.contractor);
    const dailyWage = this.positive(dto.dailyWage, 'The daily wage') ?? (await this.defaultWage(user.organizationId, dto.trade));
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`W:${user.organizationId}`}))`;
      const last = await tx.worker.findFirst({ where: { organizationId: user.organizationId, workerNo: { startsWith: 'W-' } }, orderBy: { workerNo: 'desc' }, select: { workerNo: true } });
      const next = (last ? parseInt(last.workerNo.slice(2), 10) || 0 : 0) + 1;
      const row = await tx.worker.create({
        data: {
          organizationId: user.organizationId,
          workerNo: `W-${String(next).padStart(4, '0')}`,
          name: dto.name,
          fatherName: dto.fatherName || null,
          phone: dto.phone || null,
          ...link,
          trade: dto.trade,
          skill: dto.skill ?? 'UNSKILLED',
          idType: dto.idType ?? null,
          idNumber: maskWorkerId(dto.idType, dto.idNumber),
          dailyWage,
          otRate: this.positive(dto.otRate, 'The OT rate'),
          projectId: dto.projectId ?? null,
          joinedOn: dto.joinedOn ? parseDate(dto.joinedOn) : null,
        },
        select: { id: true, workerNo: true },
      });
      return row;
    });
    await this.audit.log(user, 'WORKER', created.id, 'CREATED', `${created.workerNo} ${dto.name}`);
    return this.get(user, created.id);
  }

  async update(user: RequestUser, id: string, dto: UpdateWorkerDto): Promise<WorkerDto> {
    const row = await this.prisma.worker.findFirst({ where: { id, ...this.visibleWhere(user) }, select: { id: true, projectId: true, idType: true, idNumber: true } });
    if (!row) throw new NotFoundException('Worker not found');
    await this.access.assertCanManageWorkers(user, row.projectId);
    if (dto.projectId) await this.access.assertCanManageWorkers(user, dto.projectId);
    const data: Prisma.WorkerUncheckedUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.fatherName !== undefined) data.fatherName = dto.fatherName || null;
    if (dto.phone !== undefined) data.phone = dto.phone || null;
    if (dto.contractor !== undefined) Object.assign(data, await this.vendorFor(user.organizationId, dto.contractor));
    if (dto.trade !== undefined) data.trade = dto.trade;
    if (dto.skill !== undefined) data.skill = dto.skill;
    if (dto.idType !== undefined) data.idType = dto.idType;
    if (dto.idNumber !== undefined) data.idNumber = maskWorkerId(dto.idType !== undefined ? dto.idType : row.idType, dto.idNumber);
    else if (dto.idType === 'AADHAAR') data.idNumber = maskWorkerId('AADHAAR', row.idNumber);
    if (dto.dailyWage !== undefined) data.dailyWage = this.positive(dto.dailyWage, 'The daily wage')!;
    if (dto.otRate !== undefined) data.otRate = this.positive(dto.otRate, 'The OT rate');
    if (dto.projectId !== undefined) data.projectId = dto.projectId;
    if (dto.joinedOn !== undefined) data.joinedOn = dto.joinedOn ? parseDate(dto.joinedOn) : null;
    if (dto.leftOn !== undefined) {
      data.leftOn = dto.leftOn ? parseDate(dto.leftOn) : null;
      if (dto.leftOn && dto.isActive === undefined) data.isActive = false;
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    await this.prisma.worker.update({ where: { id }, data });
    const saved = await this.get(user, id);
    await this.audit.log(user, 'WORKER', id, saved.isActive ? 'UPDATED' : 'LEFT', `${saved.workerNo} ${saved.name}`);
    return saved;
  }

  async remove(user: RequestUser, id: string) {
    const row = await this.prisma.worker.findFirst({ where: { id, ...this.visibleWhere(user) }, select: { id: true, projectId: true, workerNo: true, name: true, _count: { select: { attendance: true } } } });
    if (!row) throw new NotFoundException('Worker not found');
    await this.access.assertCanManageWorkers(user, row.projectId);
    if (row._count.attendance) throw new ConflictException('This worker has attendance on record. Mark them as left instead of deleting them.');
    const raw = await this.prisma.worker.findUniqueOrThrow({ where: { id } });
    await this.prisma.worker.delete({ where: { id } });
    await this.audit.log(user, 'WORKER', id, 'DELETED', `${row.workerNo} ${row.name}`);
    return { ok: true, undo: this.undo.offer(user, 'WORKER', { rows: [{ model: 'worker', data: raw }] }) };
  }

  /** On the roll call of a project on a day: posted there and working on that day, or already marked there. */
  private rollWhere(organizationId: string, projectId: string, date: Date): Prisma.WorkerWhereInput {
    return {
      organizationId,
      OR: [
        { projectId, isActive: true, AND: [{ OR: [{ joinedOn: null }, { joinedOn: { lte: date } }] }, { OR: [{ leftOn: null }, { leftOn: { gte: date } }] }] },
        { projectId, isActive: false, leftOn: { gte: date } },
        { attendance: { some: { projectId, date } } },
      ],
    };
  }

  private async rollRows(organizationId: string, projectId: string, date: Date) {
    const workers = await this.prisma.worker.findMany({
      where: this.rollWhere(organizationId, projectId, date),
      include: { attendance: { where: { date }, include: markInclude } },
    });
    return workers
      .map((w) => {
        const m = w.attendance[0] && w.attendance[0].projectId === projectId ? w.attendance[0] : null;
        return { w, m };
      })
      .sort((a, b) => byRoll(a.w, b.w));
  }

  async rollCall(user: RequestUser, q: RollCallQuery): Promise<RollCallDto> {
    await this.access.assertCanViewWorkers(user, q.projectId);
    const date = parseDate(q.date);
    const [rows, day] = await Promise.all([this.rollRows(user.organizationId, q.projectId, date), this.attendance.day(user, { projectId: q.projectId, date: q.date })]);
    const out: RollCallRowDto[] = rows.map(({ w, m }) => ({
      workerId: w.id,
      workerNo: w.workerNo,
      name: w.name,
      contractor: w.contractor,
      trade: w.trade,
      skill: w.skill,
      status: m?.status ?? null,
      inTime: m?.inTime ?? null,
      outTime: m?.outTime ?? null,
      otHours: m?.otHours ? dec(m.otHours) : null,
      activityId: m?.activityId ?? null,
      activityName: m?.activity?.name ?? null,
      note: m?.note ?? null,
      markedByName: m?.markedBy.fullName ?? null,
    }));
    const count = (s: string | null) => out.filter((r) => r.status === s).length;
    return {
      projectId: q.projectId,
      date: q.date,
      locked: day.locked,
      lockedByRun: day.lockedByRun,
      rows: out,
      totals: {
        workers: out.length,
        present: count('PRESENT'),
        halfDay: count('HALF_DAY'),
        absent: count('ABSENT'),
        unmarked: count(null),
        manDays: out.reduce((s, r) => s + manDays(r.status), 0),
        otHours: out.reduce((s, r) => s + Number(r.otHours ?? 0), 0),
      },
      headCount: day.sheet ? day.sheet.lines.map(({ contractor, category, count: c }) => ({ contractor, category, count: c })) : null,
    };
  }

  /**
   * Mark the roll call: each entry sets (or with a null status clears) a worker's mark for the day. The day's
   * head-count sheet then takes the roll call's counts for the contractor and trade pairs it covers.
   */
  async saveRollCall(user: RequestUser, dto: SaveRollCallDto): Promise<RollCallDto> {
    await this.access.assertCanManageWorkers(user, dto.projectId);
    if (dto.date > todayIn()) throw new BadRequestException('The roll call cannot be marked for a day that has not come yet.');
    const date = parseDate(dto.date);
    await this.attendance.assertUnlocked(dto.projectId, date);
    const ids = [...new Set(dto.entries.map((e) => e.workerId))];
    if (ids.length !== dto.entries.length) throw new BadRequestException('Each worker can appear only once in a roll call.');
    const workers = await this.prisma.worker.findMany({ where: { id: { in: ids }, organizationId: user.organizationId }, select: { id: true, name: true, attendance: { where: { date }, select: { projectId: true, project: { select: { name: true } } } } } });
    if (workers.length !== ids.length) throw new BadRequestException('Some of these workers are not in the register.');
    const elsewhere = workers.find((w) => w.attendance[0] && w.attendance[0].projectId !== dto.projectId);
    if (elsewhere) throw new ConflictException(`${elsewhere.name} is already marked at ${elsewhere.attendance[0].project.name} on ${dto.date}.`);
    const activityIds = [...new Set(dto.entries.map((e) => e.activityId).filter((a): a is string => !!a))];
    if (activityIds.length) {
      const n = await this.prisma.activity.count({ where: { id: { in: activityIds }, projectId: dto.projectId } });
      if (n !== activityIds.length) throw new BadRequestException('Some of the activities are not on this project.');
    }

    const headCount = await this.prisma.$transaction(
      async (tx) => {
        for (const e of dto.entries) {
          if (!e.status) {
            await tx.workerAttendance.deleteMany({ where: { workerId: e.workerId, date } });
            continue;
          }
          const inTime = e.inTime || null;
          const outTime = e.outTime || null;
          const ot = e.otHours !== undefined && e.otHours !== null ? e.otHours : e.status === 'ABSENT' ? null : workerOvertime(inTime, outTime);
          const data = {
            status: e.status,
            inTime: e.status === 'ABSENT' ? null : inTime,
            outTime: e.status === 'ABSENT' ? null : outTime,
            otHours: e.status === 'ABSENT' || !ot ? null : ot,
            activityId: e.status === 'ABSENT' ? null : e.activityId ?? null,
            note: e.note || null,
            markedById: user.id,
          };
          await tx.workerAttendance.upsert({
            where: { workerId_date: { workerId: e.workerId, date } },
            create: { organizationId: user.organizationId, workerId: e.workerId, projectId: dto.projectId, date, ...data },
            update: data,
          });
        }
        return this.recountHeadCount(tx, user, dto.projectId, date);
      },
      { timeout: 30_000 },
    );

    const saved = await this.rollCall(user, { projectId: dto.projectId, date: dto.date });
    const t = saved.totals;
    await this.audit.log(user, 'ROLL_CALL', dto.projectId, 'MARKED', `${dto.date}: ${t.present} present, ${t.halfDay} half day, ${t.absent} absent; head count ${headCount ? headCount.reduce((s, l) => s + l.count, 0) : 0}`);
    return saved;
  }

  /**
   * The day's head-count sheet from the named workers' marks at the project: after a roll call, and after biometric
   * punches mark workers. `by` is who the sheet records as having changed it.
   */
  async recountHeadCount(tx: Prisma.TransactionClient, by: Pick<RequestUser, 'id' | 'organizationId'>, projectId: string, date: Date) {
    const roll = await tx.worker.findMany({ where: this.rollWhere(by.organizationId, projectId, date), select: { contractor: true, trade: true, attendance: { where: { date, projectId }, select: { status: true } } } });
    const counts = rollCallHeadCount(roll.map((w) => ({ contractor: w.contractor, trade: w.trade, status: w.attendance[0]?.status ?? null })));
    return this.attendance.applyRollCall(tx, by, projectId, date, counts);
  }

  /** The month's muster roll of a project: each worker's marks by day, man-days, overtime and wages at their current rates. */
  async muster(user: RequestUser, q: MusterQuery): Promise<MusterDto> {
    await this.access.assertCanViewWorkers(user, q.projectId);
    const [y, m] = q.month.split('-').map(Number);
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const from = parseDate(`${q.month}-01`);
    const to = parseDate(`${q.month}-${String(daysInMonth).padStart(2, '0')}`);
    const marks = await this.prisma.workerAttendance.findMany({
      where: { organizationId: user.organizationId, projectId: q.projectId, date: { gte: from, lte: to } },
      select: { date: true, status: true, otHours: true, worker: { select: { id: true, workerNo: true, name: true, contractor: true, trade: true, dailyWage: true, otRate: true } } },
    });
    const rows = new Map<string, MusterRowDto & { _ot: string | null }>();
    for (const k of marks) {
      const w = k.worker;
      let r = rows.get(w.id);
      if (!r) {
        r = { workerId: w.id, workerNo: w.workerNo, name: w.name, contractor: w.contractor, trade: w.trade, dailyWage: money(w.dailyWage)!, marks: {}, present: 0, halfDays: 0, absent: 0, manDays: 0, otHours: 0, wages: '0.00', _ot: w.otRate?.toString() ?? null };
        rows.set(w.id, r);
      }
      r.marks[k.date.getUTCDate()] = k.status;
      if (k.status === 'PRESENT') r.present += 1;
      else if (k.status === 'HALF_DAY') r.halfDays += 1;
      else r.absent += 1;
      r.manDays += manDays(k.status);
      r.otHours += Number(k.otHours ?? 0);
    }
    const list = [...rows.values()].sort(byRoll).map(({ _ot, ...r }) => ({ ...r, wages: workerWages(r.dailyWage, _ot, r.manDays, r.otHours).toFixed(2) }));
    const byContractor = new Map<string, { contractor: string; workers: number; manDays: number; otHours: number; wages: number }>();
    for (const r of list) {
      const c = byContractor.get(r.contractor) ?? { contractor: r.contractor, workers: 0, manDays: 0, otHours: 0, wages: 0 };
      c.workers += 1;
      c.manDays += r.manDays;
      c.otHours += r.otHours;
      c.wages += Number(r.wages);
      byContractor.set(r.contractor, c);
    }
    const total = list.reduce((s, r) => s + Number(r.wages), 0);
    return {
      projectId: q.projectId,
      month: q.month,
      daysInMonth,
      rows: list,
      byContractor: [...byContractor.values()].map((c) => ({ ...c, wages: c.wages.toFixed(2) })),
      totals: { workers: list.length, manDays: list.reduce((s, r) => s + r.manDays, 0), otHours: list.reduce((s, r) => s + r.otHours, 0), wages: total.toFixed(2) },
    };
  }

  /** Man-days the roll call put on each activity against the progress approved in the same days. */
  async output(user: RequestUser, q: OutputQuery): Promise<OutputDto> {
    await this.access.assertCanViewWorkers(user, q.projectId);
    if (q.from > q.to) throw new BadRequestException('The start date is after the end date.');
    const date = { gte: parseDate(q.from), lte: parseDate(q.to) };
    const [marks, progress] = await Promise.all([
      this.prisma.workerAttendance.findMany({
        where: { organizationId: user.organizationId, projectId: q.projectId, date, status: { in: ['PRESENT', 'HALF_DAY'] } },
        select: { status: true, activityId: true, worker: { select: { trade: true } } },
      }),
      this.prisma.progressEntry.groupBy({ by: ['activityId'], where: { projectId: q.projectId, status: 'APPROVED', date }, _sum: { quantity: true } }),
    ]);
    const days = new Map<string, { total: number; trades: Map<string, number> }>();
    let untagged = 0;
    let total = 0;
    for (const k of marks) {
      const d = manDays(k.status);
      total += d;
      if (!k.activityId) {
        untagged += d;
        continue;
      }
      const a = days.get(k.activityId) ?? { total: 0, trades: new Map<string, number>() };
      a.total += d;
      a.trades.set(k.worker.trade, (a.trades.get(k.worker.trade) ?? 0) + d);
      days.set(k.activityId, a);
    }
    const qty = new Map(progress.map((p) => [p.activityId, p._sum.quantity ?? new Prisma.Decimal(0)]));
    // Only activities someone worked on: progress without man-days says nothing about output per man-day.
    const ids = [...days.keys()];
    const activities = ids.length ? await this.prisma.activity.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, unit: true } }) : [];
    const rows = activities
      .map((a) => {
        const d = days.get(a.id)!;
        const quantity = qty.get(a.id) ?? new Prisma.Decimal(0);
        return {
          activityId: a.id,
          activityName: a.name,
          unit: a.unit,
          manDays: d.total,
          quantity: dec(quantity)!,
          outputPerManDay: d.total > 0 ? dec(quantity.div(d.total)) : null,
          trades: [...d.trades.entries()].map(([trade, n]) => ({ trade, manDays: n })).sort((x, y) => y.manDays - x.manDays),
        };
      })
      .sort((x, y) => y.manDays - x.manDays || x.activityName.localeCompare(y.activityName));
    return { projectId: q.projectId, from: q.from, to: q.to, rows, untaggedManDays: untagged, totalManDays: total };
  }
}
