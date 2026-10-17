import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Paginated, ProjectDetail, ProjectSortField, ProjectSummary, RoleKey, SortOrder } from '@erp/shared';
import { ilike, pageArgs, paginated, searchWords } from '../common/paging';
import { weightedProgress } from '../common/progress';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { TemplatesService } from '../templates/templates.service';
import { dateOnly, iso, money, parseDate, pct } from '../common/serialize';
import { AddMemberDto, CreateProjectDto, ListProjectsQuery, UpdateProjectDto } from './projects.dto';

const projectInclude = {
  projectManager: { select: { id: true, fullName: true } },
  members: { include: { user: { include: { role: true } } } },
} satisfies Prisma.ProjectInclude;

type ProjectRow = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>;

/** What the list shows needs no members (the detail adds them). */
const summaryInclude = { projectManager: { select: { id: true, fullName: true } } } satisfies Prisma.ProjectInclude;
type SummaryRow = Prisma.ProjectGetPayload<{ include: typeof summaryInclude }>;

const ORDER: Record<ProjectSortField, (o: SortOrder) => Prisma.ProjectOrderByWithRelationInput[]> = {
  status: (o) => [{ status: o }, { code: 'asc' }],
  code: (o) => [{ code: o }],
  name: (o) => [{ name: o }],
  type: (o) => [{ type: o }, { code: 'asc' }],
  startDate: (o) => [{ startDate: { sort: o, nulls: 'last' } }],
  endDate: (o) => [{ endDate: { sort: o, nulls: 'last' } }],
  contractValue: (o) => [{ contractValue: { sort: o, nulls: 'last' } }],
  createdAt: (o) => [{ createdAt: o }],
};
const DESC_DEFAULT = new Set<string>(['startDate', 'endDate', 'contractValue', 'createdAt']);

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService, private access: ProjectAccessService, private audit: AuditService, private templates: TemplatesService) {}

  /**
   * The list's figures for a page of projects in a fixed number of queries, however many projects: physical progress
   * (weighted by BOQ amount where activities are linked to BOQ, else by planned quantity), entries waiting for approval
   * and the contract value revised by approved variations.
   */
  async summaries(rows: SummaryRow[]): Promise<ProjectSummary[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const waiting = { projectId: { in: ids }, status: 'SUBMITTED' as const };
    const withContract = rows.filter((r) => r.contractValue).map((r) => r.id);
    const [activities, executed, progress, dprs, mrs, variations] = await Promise.all([
      this.prisma.activity.findMany({ where: { projectId: { in: ids } }, select: { id: true, projectId: true, plannedQty: true, boqItem: { select: { rate: true } } } }),
      this.prisma.progressEntry.groupBy({ by: ['activityId'], where: { activity: { projectId: { in: ids } }, status: 'APPROVED' }, _sum: { quantity: true } }),
      this.prisma.progressEntry.groupBy({ by: ['projectId'], where: waiting, _count: { _all: true } }),
      this.prisma.dailyReport.groupBy({ by: ['projectId'], where: waiting, _count: { _all: true } }),
      this.prisma.materialRequest.groupBy({ by: ['projectId'], where: waiting, _count: { _all: true } }),
      withContract.length
        ? this.prisma.variation.groupBy({ by: ['projectId'], where: { projectId: { in: withContract }, status: 'APPROVED' }, _sum: { approvedAmount: true } })
        : [],
    ]);
    const done = new Map(executed.map((e) => [e.activityId, e._sum.quantity ?? new Prisma.Decimal(0)]));
    const byProject = new Map<string, typeof activities>();
    for (const a of activities) byProject.set(a.projectId, [...(byProject.get(a.projectId) ?? []), a]);
    const pending = new Map<string, number>();
    for (const g of [...progress, ...dprs, ...mrs]) pending.set(g.projectId, (pending.get(g.projectId) ?? 0) + g._count._all);
    const varied = new Map(variations.map((v) => [v.projectId, v._sum.approvedAmount]));
    return rows.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      type: p.type,
      status: p.status,
      clientName: p.clientName,
      location: p.location,
      startDate: dateOnly(p.startDate),
      endDate: dateOnly(p.endDate),
      contractValue: money(p.contractValue),
      revisedContractValue: p.contractValue ? money(p.contractValue.add(varied.get(p.id) ?? 0)) : null,
      projectManagerId: p.projectManagerId,
      projectManagerName: p.projectManager?.fullName ?? null,
      physicalProgressPct: weightedProgress(
        (byProject.get(p.id) ?? []).map((a) => ({ plannedQty: a.plannedQty, rate: a.boqItem?.rate ?? null, executed: done.get(a.id) ?? new Prisma.Decimal(0) })),
      ),
      pendingApprovals: pending.get(p.id) ?? 0,
    }));
  }

  async toDetail(p: ProjectRow): Promise<ProjectDetail> {
    const [summary] = await this.summaries([p]);
    return {
      ...summary,
      clientId: p.clientId,
      consultantName: p.consultantName,
      workOrderNo: p.workOrderNo,
      description: p.description,
      chainageStart: p.chainageStart,
      chainageEnd: p.chainageEnd,
      floors: p.floors,
      villages: p.villages,
      members: p.members.map((m) => ({ id: m.id, userId: m.userId, fullName: m.user.fullName, roleKey: m.user.role.key as RoleKey, roleName: m.user.role.name })),
      createdAt: iso(p.createdAt)!,
      updatedAt: iso(p.updatedAt)!,
    };
  }

  /** Every visible project, unpaged (dashboards). */
  async listAll(user: RequestUser): Promise<ProjectSummary[]> {
    const rows = await this.prisma.project.findMany({ where: this.access.projectWhere(user), include: summaryInclude, orderBy: [{ status: 'asc' }, { code: 'asc' }] });
    return this.summaries(rows);
  }

  async list(user: RequestUser, q: ListProjectsQuery): Promise<Paginated<ProjectSummary>> {
    const where: Prisma.ProjectWhereInput = { ...this.access.projectWhere(user) };
    if (q.status) where.status = q.status;
    if (q.type) where.type = q.type;
    const words = searchWords(q.q);
    if (words.length)
      where.AND = words.map((w) => ({ OR: [{ code: ilike(w) }, { name: ilike(w) }, { clientName: ilike(w) }, { location: ilike(w) }, { workOrderNo: ilike(w) }] }));
    const sortBy = q.sortBy ?? 'status';
    const order = q.sortOrder ?? (DESC_DEFAULT.has(sortBy) ? 'desc' : 'asc');
    const args = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.project.findMany({ where, include: summaryInclude, orderBy: [...ORDER[sortBy](order), { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.project.count({ where }),
    ]);
    return paginated(await this.summaries(rows), total, args);
  }

  async get(user: RequestUser, id: string): Promise<ProjectDetail> {
    const row = await this.prisma.project.findFirst({ where: { id, ...this.access.projectWhere(user) }, include: projectInclude });
    if (!row) throw new NotFoundException('Project not found');
    return this.toDetail(row);
  }

  private toData(dto: CreateProjectDto | UpdateProjectDto): Prisma.ProjectUpdateInput {
    const data: Prisma.ProjectUpdateInput = {};
    if (dto.code !== undefined) data.code = dto.code;
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.clientName !== undefined) data.clientName = dto.clientName;
    if (dto.consultantName !== undefined) data.consultantName = dto.consultantName;
    if (dto.location !== undefined) data.location = dto.location;
    if (dto.workOrderNo !== undefined) data.workOrderNo = dto.workOrderNo;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.startDate !== undefined) data.startDate = dto.startDate ? parseDate(dto.startDate) : null;
    if (dto.endDate !== undefined) data.endDate = dto.endDate ? parseDate(dto.endDate) : null;
    if (dto.contractValue !== undefined) data.contractValue = dto.contractValue ? new Prisma.Decimal(dto.contractValue) : null;
    if (dto.chainageStart !== undefined) data.chainageStart = dto.chainageStart;
    if (dto.chainageEnd !== undefined) data.chainageEnd = dto.chainageEnd;
    if (dto.floors !== undefined) data.floors = dto.floors;
    if (dto.villages !== undefined) data.villages = dto.villages;
    if (dto.projectManagerId !== undefined) data.projectManager = dto.projectManagerId ? { connect: { id: dto.projectManagerId } } : { disconnect: true };
    return data;
  }

  private checkChainage(start: number | null, end: number | null) {
    if (start !== null && end !== null && end <= start) throw new BadRequestException('The chainage must end after it starts');
  }

  /** A client from the master sets the project's client name too; null unlinks it and keeps the name as text. */
  private async withClient(user: RequestUser, dto: CreateProjectDto | UpdateProjectDto, data: Prisma.ProjectUpdateInput) {
    if (dto.clientId === undefined) return;
    if (dto.clientId === null) {
      data.client = { disconnect: true };
      return;
    }
    const client = await this.prisma.client.findFirst({ where: { id: dto.clientId, organizationId: user.organizationId }, select: { id: true, name: true } });
    if (!client) throw new NotFoundException('Client not found');
    data.client = { connect: { id: client.id } };
    data.clientName = client.name;
  }

  async create(user: RequestUser, dto: CreateProjectDto): Promise<ProjectDetail> {
    const dup = await this.prisma.project.findFirst({ where: { organizationId: user.organizationId, code: dto.code } });
    if (dup) throw new ConflictException(`Project code ${dto.code} already exists`);
    this.checkChainage(dto.chainageStart ?? null, dto.chainageEnd ?? null);
    const data = this.toData(dto) as Prisma.ProjectCreateInput;
    await this.withClient(user, dto, data);
    if (dto.clientId === null) delete data.client;
    const row = await this.prisma.project.create({ data: { ...data, organization: { connect: { id: user.organizationId } } }, include: projectInclude });
    await this.audit.log(user, 'PROJECT', row.id, 'CREATED');
    if (dto.applyTemplate) await this.templates.applyUnchecked(user, row.id);
    return this.toDetail(row);
  }

  async update(user: RequestUser, id: string, dto: UpdateProjectDto): Promise<ProjectDetail> {
    await this.access.assertCanAccessProject(user, id);
    if (dto.chainageStart !== undefined || dto.chainageEnd !== undefined) {
      const cur = await this.prisma.project.findUniqueOrThrow({ where: { id }, select: { chainageStart: true, chainageEnd: true } });
      this.checkChainage(dto.chainageStart !== undefined ? dto.chainageStart : cur.chainageStart, dto.chainageEnd !== undefined ? dto.chainageEnd : cur.chainageEnd);
    }
    const data = this.toData(dto);
    await this.withClient(user, dto, data);
    const row = await this.prisma.project.update({ where: { id }, data, include: projectInclude });
    await this.audit.log(user, 'PROJECT', row.id, 'UPDATED');
    return this.toDetail(row);
  }

  async addMember(user: RequestUser, id: string, dto: AddMemberDto): Promise<ProjectDetail> {
    await this.access.assertCanAccessProject(user, id);
    const member = await this.prisma.user.findFirst({ where: { id: dto.userId, organizationId: user.organizationId } });
    if (!member) throw new NotFoundException('User not found');
    await this.prisma.projectMember.upsert({ where: { projectId_userId: { projectId: id, userId: dto.userId } }, create: { projectId: id, userId: dto.userId }, update: {} });
    await this.audit.log(user, 'PROJECT', id, 'MEMBER_ADDED', member.fullName);
    return this.get(user, id);
  }

  async removeMember(user: RequestUser, id: string, userId: string): Promise<ProjectDetail> {
    await this.access.assertCanAccessProject(user, id);
    await this.prisma.projectMember.deleteMany({ where: { projectId: id, userId } });
    await this.audit.log(user, 'PROJECT', id, 'MEMBER_REMOVED', userId);
    return this.get(user, id);
  }

  audits(user: RequestUser, id: string) {
    return this.audit.forEntity(user.organizationId, 'PROJECT', id);
  }
}
