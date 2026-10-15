import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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

  /** Physical progress = weighted by BOQ amount where activities are linked to BOQ, else simple average of activity %. */
  async computeProgress(projectId: string): Promise<number> {
    const activities = await this.prisma.activity.findMany({
      where: { projectId },
      include: { boqItem: { select: { rate: true } }, progressEntries: { where: { status: 'APPROVED' }, select: { quantity: true } } },
    });
    return weightedProgress(
      activities.map((a) => ({ plannedQty: a.plannedQty, rate: a.boqItem?.rate ?? null, executed: a.progressEntries.reduce((s, e) => s.add(e.quantity), new Prisma.Decimal(0)) })),
    );
  }

  async pendingApprovalsCount(projectId: string): Promise<number> {
    const [p, d, m] = await Promise.all([
      this.prisma.progressEntry.count({ where: { projectId, status: 'SUBMITTED' } }),
      this.prisma.dailyReport.count({ where: { projectId, status: 'SUBMITTED' } }),
      this.prisma.materialRequest.count({ where: { projectId, status: 'SUBMITTED' } }),
    ]);
    return p + d + m;
  }

  async toSummary(p: ProjectRow): Promise<ProjectSummary> {
    const [physicalProgressPct, pendingApprovals, variations] = await Promise.all([
      this.computeProgress(p.id),
      this.pendingApprovalsCount(p.id),
      p.contractValue ? this.prisma.variation.aggregate({ where: { projectId: p.id, status: 'APPROVED' }, _sum: { approvedAmount: true } }) : null,
    ]);
    return {
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
      revisedContractValue: p.contractValue ? money(p.contractValue.add(variations?._sum.approvedAmount ?? 0)) : null,
      projectManagerId: p.projectManagerId,
      projectManagerName: p.projectManager?.fullName ?? null,
      physicalProgressPct,
      pendingApprovals,
    };
  }

  async toDetail(p: ProjectRow): Promise<ProjectDetail> {
    const summary = await this.toSummary(p);
    return {
      ...summary,
      clientId: p.clientId,
      consultantName: p.consultantName,
      workOrderNo: p.workOrderNo,
      description: p.description,
      members: p.members.map((m) => ({ id: m.id, userId: m.userId, fullName: m.user.fullName, roleKey: m.user.role.key as RoleKey, roleName: m.user.role.name })),
      createdAt: iso(p.createdAt)!,
      updatedAt: iso(p.updatedAt)!,
    };
  }

  /** Every visible project, unpaged (dashboards). */
  async listAll(user: RequestUser): Promise<ProjectSummary[]> {
    const rows = await this.prisma.project.findMany({ where: this.access.projectWhere(user), include: projectInclude, orderBy: [{ status: 'asc' }, { code: 'asc' }] });
    return Promise.all(rows.map((r) => this.toSummary(r)));
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
      this.prisma.project.findMany({ where, include: projectInclude, orderBy: [...ORDER[sortBy](order), { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.project.count({ where }),
    ]);
    return paginated(await Promise.all(rows.map((r) => this.toSummary(r))), total, args);
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
    if (dto.projectManagerId !== undefined) data.projectManager = dto.projectManagerId ? { connect: { id: dto.projectManagerId } } : { disconnect: true };
    return data;
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
