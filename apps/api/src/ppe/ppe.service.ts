import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  PPE_KIND_LABELS,
  canEditSafetyRecord,
  canIssuePpe,
  canManageSafety,
  ppeGaps,
  ppeReplaceBy,
  type Paginated,
  type PpeContractorDto,
  type PpeIssueDto,
  type PpeIssueResultDto,
  type PpeKind,
  type PpeRegisterDto,
  type PpeWorkerDto,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { dateOnly, iso, parseDate } from '../common/serialize';
import { isUniqueViolation } from '../common/idempotency';
import { ilike, pageArgs, paginated, searchWords } from '../common/paging';
import { todayIn } from '../notifications/time';
import { ClosePpeDto, IssuePpeDto, ListPpeQuery, SetPpeRequiredDto } from './ppe.dto';

const issueInclude = {
  project: { select: { name: true } },
  worker: { select: { workerNo: true, name: true, contractor: true, trade: true } },
  issuedBy: { select: { fullName: true } },
  closedBy: { select: { fullName: true } },
} satisfies Prisma.PpeIssueInclude;
type IssueRow = Prisma.PpeIssueGetPayload<{ include: typeof issueInclude }>;

const blank = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null);
/** 1 April of the Indian financial year a day falls in. */
const fyStart = (day: string) => {
  const [y, m] = day.split('-').map(Number);
  return `${m >= 4 ? y : y - 1}-04-01`;
};

/**
 * PPE register: kit handed to named workers at a project, its replacement dates, returns and losses, and who is on
 * site without the kit the project requires. Pure rules (what a worker lacks, replace-by dates) are in @erp/shared ppe.ts.
 */
@Injectable()
export class PpeService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
  ) {}

  private dto(r: IssueRow, today = todayIn()): PpeIssueDto {
    const replaceBy = dateOnly(r.replaceBy);
    return {
      id: r.id,
      projectId: r.projectId,
      projectName: r.project.name,
      workerId: r.workerId,
      workerNo: r.worker.workerNo,
      workerName: r.worker.name,
      contractor: r.worker.contractor,
      trade: r.worker.trade,
      kind: r.kind,
      size: r.size,
      issuedOn: dateOnly(r.issuedOn),
      replaceBy,
      status: r.status,
      dueForReplacement: r.status === 'ISSUED' && !!replaceBy && replaceBy < today,
      closedOn: dateOnly(r.closedOn),
      closeNote: r.closeNote,
      recoverable: r.recoverable,
      note: r.note,
      issuedById: r.issuedById,
      issuedByName: r.issuedBy.fullName,
      closedByName: r.closedBy?.fullName ?? null,
      createdAt: iso(r.createdAt),
    };
  }

  /** The project's workers with what they hold and lack, today's roll call, and totals by contractor. */
  async register(user: RequestUser, projectId: string): Promise<PpeRegisterDto> {
    await this.access.assertCanAccessProject(user, projectId);
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { id: true, code: true, name: true, ppeRequired: true } });
    if (!project) throw new NotFoundException('Project not found');
    const today = todayIn();
    const [workers, open, roll, recover, lost, away] = await Promise.all([
      this.prisma.worker.findMany({ where: { organizationId: user.organizationId, projectId, isActive: true }, select: { id: true, workerNo: true, name: true, contractor: true, trade: true }, orderBy: [{ contractor: 'asc' }, { name: 'asc' }] }),
      this.prisma.ppeIssue.findMany({ where: { projectId, status: 'ISSUED' }, select: { id: true, workerId: true, kind: true, issuedOn: true, replaceBy: true } }),
      this.prisma.workerAttendance.findMany({ where: { projectId, date: parseDate(today) }, select: { workerId: true, status: true } }),
      this.prisma.ppeIssue.findMany({ where: { projectId, recoverable: true }, select: { worker: { select: { contractor: true } } } }),
      this.prisma.ppeIssue.count({ where: { projectId, status: 'LOST', closedOn: { gte: parseDate(fyStart(today)) } } }),
      this.prisma.ppeIssue.findMany({
        where: { projectId, status: 'ISSUED', worker: { OR: [{ isActive: false }, { projectId: { not: projectId } }, { projectId: null }] } },
        select: { id: true, kind: true, issuedOn: true, worker: { select: { name: true, workerNo: true, contractor: true } } },
        orderBy: { issuedOn: 'asc' },
      }),
    ]);
    const presentOf = new Map(roll.map((r) => [r.workerId, r.status !== 'ABSENT']));
    const openOf = new Map<string, { id: string; kind: PpeKind; issuedOn: string; replaceBy: string | null }[]>();
    for (const o of open) {
      const list = openOf.get(o.workerId) ?? [];
      list.push({ id: o.id, kind: o.kind, issuedOn: dateOnly(o.issuedOn), replaceBy: dateOnly(o.replaceBy) });
      openOf.set(o.workerId, list);
    }
    const required = project.ppeRequired as PpeKind[];
    let due = 0;
    const rows: PpeWorkerDto[] = workers.map((w) => {
      const g = ppeGaps(required, openOf.get(w.id) ?? [], today);
      due += g.due.length;
      return { workerId: w.id, workerNo: w.workerNo, name: w.name, contractor: w.contractor, trade: w.trade, presentToday: roll.length ? (presentOf.get(w.id) ?? false) : null, holding: g.holding, missing: g.missing };
    });
    const byContractor = new Map<string, PpeContractorDto>();
    const of = (c: string) => byContractor.get(c) ?? byContractor.set(c, { contractor: c, workers: 0, missingAny: 0, recoverable: 0 }).get(c)!;
    for (const r of rows) {
      const c = of(r.contractor);
      c.workers += 1;
      if (r.missing.length) c.missingAny += 1;
    }
    for (const r of recover) of(r.worker.contractor).recoverable += 1;
    const missingAny = rows.filter((r) => r.missing.length).length;
    return {
      projectId: project.id,
      projectCode: project.code,
      projectName: project.name,
      required,
      today,
      rollCallToday: roll.length > 0,
      workers: rows,
      counts: {
        workers: rows.length,
        fullyKitted: rows.length - missingAny,
        missingAny,
        presentMissing: rows.filter((r) => r.presentToday && r.missing.length).length,
        dueForReplacement: due,
        lostThisYear: lost,
      },
      byContractor: [...byContractor.values()].sort((a, b) => b.missingAny - a.missingAny || a.contractor.localeCompare(b.contractor)),
      leftWithKit: away.map((a) => ({ issueId: a.id, workerName: a.worker.name, workerNo: a.worker.workerNo, contractor: a.worker.contractor, kind: a.kind, issuedOn: dateOnly(a.issuedOn) })),
      canIssue: canIssuePpe(user.roleKey),
      canSetRequired: canManageSafety(user.roleKey),
    };
  }

  async list(user: RequestUser, q: ListPpeQuery): Promise<Paginated<PpeIssueDto>> {
    const today = todayIn();
    const where: Prisma.PpeIssueWhereInput = { ...this.access.submissionWhere(user) };
    if (q.projectId) where.projectId = q.projectId;
    if (q.workerId) where.workerId = q.workerId;
    if (q.status) where.status = q.status;
    if (q.kind) where.kind = q.kind;
    if (q.recoverable) where.recoverable = true;
    if (q.due) Object.assign(where, { status: 'ISSUED', replaceBy: { lt: parseDate(today) } });
    if (q.from || q.to) where.issuedOn = { ...(q.from ? { gte: parseDate(q.from) } : {}), ...(q.to ? { lte: parseDate(q.to) } : {}) };
    const words = searchWords(q.q);
    if (words.length) where.AND = words.map((w) => ({ OR: [{ worker: { name: ilike(w) } }, { worker: { workerNo: ilike(w) } }, { worker: { contractor: ilike(w) } }, { size: ilike(w) }, { note: ilike(w) }] }));
    const args = pageArgs(q);
    const order = q.sortOrder ?? 'desc';
    const [rows, total] = await Promise.all([
      this.prisma.ppeIssue.findMany({ where, include: issueInclude, orderBy: [{ issuedOn: order }, { createdAt: order }], skip: args.skip, take: args.take }),
      this.prisma.ppeIssue.count({ where }),
    ]);
    return paginated(rows.map((r) => this.dto(r, today)), total, args);
  }

  async get(user: RequestUser, id: string): Promise<PpeIssueDto> {
    const row = await this.prisma.ppeIssue.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include: issueInclude });
    if (!row) throw new NotFoundException('PPE issue not found');
    return this.dto(row);
  }

  /**
   * Hand each worker each kind. An item of the same kind the worker still holds (here or at another project) is
   * marked replaced. A batch sent again with the same id issues nothing more.
   */
  async issue(user: RequestUser, dto: IssuePpeDto): Promise<PpeIssueResultDto> {
    const batchResult = async (batchId: string): Promise<PpeIssueResultDto | null> => {
      const n = await this.prisma.ppeIssue.count({ where: { batchId, organizationId: user.organizationId } });
      return n ? { issued: n, replaced: 0 } : null;
    };
    if (dto.id) {
      const done = await batchResult(dto.id);
      if (done) return done;
    }
    await this.access.assertCanIssuePpe(user, dto.projectId);
    const today = todayIn();
    if (dto.issuedOn > today) throw new BadRequestException('Enter an issue date up to today');
    const workers = await this.prisma.worker.findMany({ where: { id: { in: dto.workerIds }, organizationId: user.organizationId }, select: { id: true, name: true, projectId: true, isActive: true } });
    if (workers.length !== dto.workerIds.length) throw new BadRequestException('A worker was not found: refresh the list and choose again');
    const away = workers.filter((w) => w.projectId !== dto.projectId || !w.isActive);
    if (away.length) throw new BadRequestException(`${away.map((w) => w.name).slice(0, 3).join(', ')}${away.length > 3 ? ' and others' : ''} ${away.length === 1 ? 'is' : 'are'} not on this project's roll: move them here first`);
    const issuedOn = parseDate(dto.issuedOn);
    const size = blank(dto.size) ?? null;
    const note = blank(dto.note) ?? null;
    let result: PpeIssueResultDto;
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const replaced = await tx.ppeIssue.updateMany({
          where: { workerId: { in: dto.workerIds }, kind: { in: dto.kinds }, status: 'ISSUED', issuedOn: { lte: issuedOn } },
          data: { status: 'REPLACED', closedOn: issuedOn, closedById: user.id },
        });
        const created = await tx.ppeIssue.createMany({
          data: dto.workerIds.flatMap((workerId) =>
            dto.kinds.map((kind) => ({
              organizationId: user.organizationId,
              projectId: dto.projectId,
              workerId,
              kind,
              size,
              issuedOn,
              replaceBy: parseDate(ppeReplaceBy(kind, dto.issuedOn)),
              batchId: dto.id ?? null,
              note,
              issuedById: user.id,
            })),
          ),
        });
        return { issued: created.count, replaced: replaced.count };
      });
    } catch (e) {
      if (isUniqueViolation(e) && dto.id) {
        const done = await batchResult(dto.id);
        if (done) return done;
      }
      throw e;
    }
    const kinds = dto.kinds.map((k) => PPE_KIND_LABELS[k].toLowerCase()).join(', ');
    await this.audit.log(user, 'PROJECT', dto.projectId, 'PPE_ISSUED', `${kinds} to ${dto.workerIds.length} worker${dto.workerIds.length === 1 ? '' : 's'}${result.replaced ? `, ${result.replaced} replaced` : ''}`);
    return result;
  }

  /** Returned or lost: closes an item the worker holds. */
  async close(user: RequestUser, id: string, dto: ClosePpeDto): Promise<PpeIssueDto> {
    const row = await this.prisma.ppeIssue.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include: issueInclude });
    if (!row) throw new NotFoundException('PPE issue not found');
    await this.access.assertCanIssuePpe(user, row.projectId);
    if (row.status !== 'ISSUED') throw new ConflictException('This item is already closed: refresh the register');
    const issuedOn = dateOnly(row.issuedOn);
    if (dto.on < issuedOn || dto.on > todayIn()) throw new BadRequestException('Enter a date between the issue date and today');
    const recoverable = dto.recoverable ?? dto.status === 'LOST';
    await this.prisma.ppeIssue.update({
      where: { id },
      data: { status: dto.status, closedOn: parseDate(dto.on), closeNote: blank(dto.note) ?? null, recoverable, closedById: user.id },
    });
    await this.audit.log(user, 'PPE', id, dto.status === 'LOST' ? 'LOST' : 'RETURNED', `${PPE_KIND_LABELS[row.kind]}, ${row.worker.name}${recoverable ? ', to recover from the contractor' : ''}`);
    return this.get(user, id);
  }

  /** Delete an entry made by mistake: whoever issued it, or the safety officer or an approver. */
  async remove(user: RequestUser, id: string): Promise<{ ok: true }> {
    const row = await this.prisma.ppeIssue.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include: issueInclude });
    if (!row) throw new NotFoundException('PPE issue not found');
    if (!canEditSafetyRecord(user, row.issuedById)) throw new ForbiddenException('Only whoever issued it, the safety officer or an approver can delete it');
    await this.access.assertCanAccessProject(user, row.projectId);
    await this.prisma.ppeIssue.delete({ where: { id } });
    await this.audit.log(user, 'PPE', id, 'DELETED', `${PPE_KIND_LABELS[row.kind]}, ${row.worker.name}, issued ${dateOnly(row.issuedOn)}`);
    return { ok: true };
  }

  async setRequired(user: RequestUser, projectId: string, dto: SetPpeRequiredDto): Promise<PpeRegisterDto> {
    await this.access.assertCanManageSafety(user, projectId);
    await this.prisma.project.update({ where: { id: projectId }, data: { ppeRequired: dto.kinds } });
    await this.audit.log(user, 'PROJECT', projectId, 'PPE_REQUIRED_SET', dto.kinds.length ? dto.kinds.map((k) => PPE_KIND_LABELS[k]).join(', ') : 'none');
    return this.register(user, projectId);
  }
}
