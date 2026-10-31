import { NotificationsService } from '../notifications/notifications.service';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  COPIED_TERMS,
  nextProjectCode,
  termsFor,
  type NextProjectCodeDto,
  type Paginated,
  type ProjectDetail,
  type ProjectSortField,
  type ProjectSummary,
  type ProjectType,
  type RoleKey,
  type SortOrder,
  STANDARD_TYPE_FOR,
  layOutBreakdown,
  NO_VERTICAL,
  verticalOfType,
  verticalProblem,
} from '@erp/shared';
import { ilike, pageArgs, paginated, searchWords } from '../common/paging';
import { physicalProgress } from '../common/progress';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { TemplatesService } from '../templates/templates.service';
import { ProjectTypesService } from '../templates/project-types.service';
import { StructureService } from '../structure/structure.service';
import { MastersService } from '../masters/masters.service';
import { dateOnly, iso, money, parseDate, pct } from '../common/serialize';
import { AddMemberDto, CopyTeamDto, CreateProjectDto, ListProjectsQuery, UpdateProjectDto } from './projects.dto';

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
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private templates: TemplatesService,
    private types: ProjectTypesService,
    private structure: StructureService,
    private notifications: NotificationsService,
    private masters: MastersService,
  ) {}

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
    const [activities, elements, executed, progress, dprs, mrs, variations] = await Promise.all([
      this.prisma.activity.findMany({
        where: { projectId: { in: ids } },
        select: { id: true, projectId: true, plannedQty: true, workElementId: true, parentActivityId: true, weightPct: true, boqItem: { select: { rate: true } } },
      }),
      this.prisma.workElement.findMany({ where: { projectId: { in: ids } }, select: { id: true, projectId: true, parentId: true, weightPct: true } }),
      this.prisma.progressEntry.groupBy({ by: ['activityId'], where: { activity: { projectId: { in: ids } }, status: 'APPROVED' }, _sum: { quantity: true } }),
      this.prisma.progressEntry.groupBy({ by: ['projectId'], where: { ...waiting, dailyReportId: null }, _count: { _all: true } }),
      this.prisma.dailyReport.groupBy({ by: ['projectId'], where: waiting, _count: { _all: true } }),
      this.prisma.materialRequest.groupBy({ by: ['projectId'], where: waiting, _count: { _all: true } }),
      withContract.length
        ? this.prisma.variation.groupBy({ by: ['projectId'], where: { projectId: { in: withContract }, status: 'APPROVED' }, _sum: { approvedAmount: true } })
        : [],
    ]);
    const done = new Map(executed.map((e) => [e.activityId, e._sum.quantity ?? new Prisma.Decimal(0)]));
    const byProject = new Map<string, typeof activities>();
    for (const a of activities) byProject.set(a.projectId, [...(byProject.get(a.projectId) ?? []), a]);
    const elementsOf = new Map<string, typeof elements>();
    for (const e of elements) elementsOf.set(e.projectId, [...(elementsOf.get(e.projectId) ?? []), e]);
    const pending = new Map<string, number>();
    for (const g of [...progress, ...dprs, ...mrs]) pending.set(g.projectId, (pending.get(g.projectId) ?? 0) + g._count._all);
    const varied = new Map(variations.map((v) => [v.projectId, v._sum.approvedAmount]));
    const types = await this.types.featuresOf(rows[0]?.organizationId ?? '', rows);
    return rows.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      type: p.type,
      ...types.get(p.id)!,
      verticalCode: p.verticalCode,
      status: p.status,
      contractModel: p.contractModel,
      clientName: p.clientName,
      location: p.location,
      siteAddress: p.siteAddress,
      startDate: dateOnly(p.startDate),
      endDate: dateOnly(p.endDate),
      contractValue: money(p.contractValue),
      revisedContractValue: p.contractValue ? money(p.contractValue.add(varied.get(p.id) ?? 0)) : null,
      projectManagerId: p.projectManagerId,
      projectManagerName: p.projectManager?.fullName ?? null,
      physicalProgressPct: physicalProgress(
        (byProject.get(p.id) ?? []).map((a) => ({ ...a, rate: a.boqItem?.rate ?? null, executed: done.get(a.id) ?? new Prisma.Decimal(0) })),
        elementsOf.get(p.id) ?? [],
      ),
      pendingApprovals: pending.get(p.id) ?? 0,
    }));
  }

  async toDetail(p: ProjectRow): Promise<ProjectDetail> {
    const [[summary], handover] = await Promise.all([
      this.summaries([p]),
      this.prisma.projectHandover.findUnique({ where: { projectId: p.id }, select: { completedOn: true } }),
    ]);
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
      siteLat: p.siteLat?.toString() ?? null,
      siteLng: p.siteLng?.toString() ?? null,
      siteRadiusM: p.siteRadiusM,
      siteCheckInStrict: p.siteCheckInStrict,
      handedOverOn: dateOnly(handover?.completedOn ?? null),
      members: p.members.map((m) => ({ id: m.id, userId: m.userId, fullName: m.user.fullName, roleKey: m.user.role.key as RoleKey, roleName: m.user.role.name })),
      createdAt: iso(p.createdAt),
      updatedAt: iso(p.updatedAt),
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
    if (q.vertical) where.verticalCode = q.vertical === NO_VERTICAL ? null : q.vertical;
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
    if (dto.contractModel !== undefined) data.contractModel = dto.contractModel;
    if (dto.clientName !== undefined) data.clientName = dto.clientName;
    if (dto.consultantName !== undefined) data.consultantName = dto.consultantName;
    if (dto.location !== undefined) data.location = dto.location;
    if (dto.siteAddress !== undefined) data.siteAddress = dto.siteAddress || null;
    if (dto.workOrderNo !== undefined) data.workOrderNo = dto.workOrderNo;
    if (dto.agreementNo !== undefined) data.agreementNo = dto.agreementNo || null;
    if (dto.agreementDate !== undefined) data.agreementDate = dto.agreementDate ? parseDate(dto.agreementDate) : null;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.startDate !== undefined) data.startDate = dto.startDate ? parseDate(dto.startDate) : null;
    if (dto.endDate !== undefined) data.endDate = dto.endDate ? parseDate(dto.endDate) : null;
    if (dto.contractValue !== undefined) data.contractValue = dto.contractValue ? new Prisma.Decimal(dto.contractValue) : null;
    if (dto.chainageStart !== undefined) data.chainageStart = dto.chainageStart;
    if (dto.chainageEnd !== undefined) data.chainageEnd = dto.chainageEnd;
    if (dto.floors !== undefined) data.floors = dto.floors;
    if (dto.villages !== undefined) data.villages = dto.villages;
    if (dto.siteLat !== undefined) data.siteLat = dto.siteLat === null ? null : new Prisma.Decimal(dto.siteLat.toFixed(6));
    if (dto.siteLng !== undefined) data.siteLng = dto.siteLng === null ? null : new Prisma.Decimal(dto.siteLng.toFixed(6));
    if (dto.siteRadiusM !== undefined) data.siteRadiusM = dto.siteRadiusM;
    if (dto.siteCheckInStrict !== undefined) data.siteCheckInStrict = dto.siteCheckInStrict;
    if (dto.projectManagerId !== undefined) data.projectManager = dto.projectManagerId ? { connect: { id: dto.projectManagerId } } : { disconnect: true };
    return data;
  }

  private checkChainage(start: number | null, end: number | null) {
    if (start !== null && end !== null && end <= start) throw new BadRequestException('The chainage must end after it starts');
  }

  /** The site location is both coordinates or neither; a strict check-in needs a location. */
  private checkSite(lat: unknown, lng: unknown, strict: boolean) {
    if ((lat === null) !== (lng === null)) throw new BadRequestException('Give both the latitude and the longitude of the site, or clear both');
    if (strict && lat === null) throw new BadRequestException('Set the site location before refusing check-ins from outside it');
  }

  /**
   * The project's type (item 134): a code of the company's types sets `type` to the type's built-in kind and records
   * the version. Without a code, `type` alone gives the standard type of that kind, as before.
   */
  private async withType(user: RequestUser, dto: CreateProjectDto | UpdateProjectDto, data: Prisma.ProjectUpdateInput) {
    if (dto.typeCode === undefined || dto.typeCode === null) {
      if (dto.typeCode === null) {
        data.typeCode = null;
        data.typeVersion = null;
      }
      return dto.type ? this.types.type(user.organizationId, STANDARD_TYPE_FOR[dto.type] ?? '') : null;
    }
    const all = await this.types.list(user);
    const t = all.find((x) => x.code === dto.typeCode);
    if (!t) throw new BadRequestException('Choose one of the company’s project types');
    if (!t.active && 'applyTemplate' in dto) throw new BadRequestException(`${t.name} is archived; choose another type, or bring it back in Admin › Project types`);
    data.type = t.baseType;
    data.typeCode = t.code;
    data.typeVersion = t.version;
    return t;
  }

  /**
   * The project's vertical (item 167): a code of the company's vertical master, switched on. A new project with none
   * named takes its kind's (`verticalOfType`); null clears it.
   */
  private async withVertical(user: RequestUser, dto: CreateProjectDto | UpdateProjectDto, data: Prisma.ProjectUpdateInput, creating: boolean) {
    if (dto.verticalCode === undefined && !creating) return;
    const verticals = await this.masters.entriesFor(user.organizationId, 'vertical');
    if (dto.verticalCode === undefined) {
      data.verticalCode = dto.type ? verticalOfType(dto.type, verticals) : null;
      return;
    }
    const problem = verticalProblem(dto.verticalCode, verticals);
    if (problem) throw new BadRequestException(problem);
    data.verticalCode = dto.verticalCode || null;
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

  /**
   * The code to offer a new project of this type (finding 17 of the October review). Every code in the company counts
   * towards the series, including projects this user does not work on, or the suggestion would clash with them.
   */
  async nextCode(user: RequestUser, type: ProjectType): Promise<NextProjectCodeDto> {
    const taken = await this.prisma.project.findMany({ where: { organizationId: user.organizationId }, select: { code: true } });
    return { code: nextProjectCode(type, new Date().getFullYear(), taken.map((p) => p.code)) };
  }

  async create(user: RequestUser, dto: CreateProjectDto): Promise<ProjectDetail> {
    const dup = await this.prisma.project.findFirst({ where: { organizationId: user.organizationId, code: dto.code } });
    if (dup) throw new ConflictException(`Project code ${dto.code} already exists`);
    this.checkChainage(dto.chainageStart ?? null, dto.chainageEnd ?? null);
    this.checkSite(dto.siteLat ?? null, dto.siteLng ?? null, dto.siteCheckInStrict ?? false);
    const data = this.toData(dto) as Prisma.ProjectCreateInput;
    await this.withClient(user, dto, data);
    if (dto.clientId === null) delete data.client;
    const type = await this.withType(user, dto, data);
    await this.withVertical(user, { ...dto, type: (data.type as ProjectType | undefined) ?? dto.type }, data, true);
    const terms = await this.startingTerms(user, dto);
    const row = await this.prisma.project.create({ data: { ...data, ...terms, organization: { connect: { id: user.organizationId } } }, include: projectInclude });
    await this.audit.log(user, 'PROJECT', row.id, 'CREATED');
    if (type && dto.breakdown?.length) {
      const kinds = await this.types.kinds(user.organizationId);
      await this.structure.layOutUnchecked(user, row.id, layOutBreakdown(type, kinds, dto.breakdown));
    }
    if (dto.applyTemplate) await this.templates.applyUnchecked(user, row.id);
    if (dto.copyFromProjectId) {
      await this.joinTeam(user, row.id, await this.teamOf(dto.copyFromProjectId, row.projectManagerId));
      return this.toDetail(await this.prisma.project.findUniqueOrThrow({ where: { id: row.id }, include: projectInclude }));
    }
    return this.toDetail(row);
  }

  /**
   * The contract terms a new project starts with (finding 6 of the October review): a chosen project's, else its
   * client's usual terms, else the standard ones (`termsFor`), so no new project bills with every deduction at 0%.
   */
  private async startingTerms(user: RequestUser, dto: CreateProjectDto): Promise<Partial<Prisma.ProjectCreateInput>> {
    if (dto.copyFromProjectId) {
      await this.access.assertCanAccessProject(user, dto.copyFromProjectId);
      const select = Object.fromEntries(COPIED_TERMS.map((k) => [k, true])) as Record<(typeof COPIED_TERMS)[number], true>;
      return this.prisma.project.findUniqueOrThrow({ where: { id: dto.copyFromProjectId }, select });
    }
    const client = dto.clientId ? await this.prisma.client.findFirst({ where: { id: dto.clientId, organizationId: user.organizationId } }) : null;
    return termsFor(
      client && {
        retentionPct: client.retentionPct?.toString() ?? null,
        securityDepositPct: client.securityDepositPct?.toString() ?? null,
        tdsPct: client.tdsPct?.toString() ?? null,
        gstTdsPct: client.gstTdsPct?.toString() ?? null,
        labourCessPct: client.labourCessPct?.toString() ?? null,
        gstRate: client.gstRate?.toString() ?? null,
        defectLiabilityMonths: client.defectLiabilityMonths,
        clientPaymentDays: client.clientPaymentDays,
      },
    );
  }

  /** The people on a project, less the one who manages the new project (already its manager). */
  private async teamOf(projectId: string, except: string | null): Promise<string[]> {
    const rows = await this.prisma.projectMember.findMany({ where: { projectId, user: { isActive: true } }, select: { userId: true } });
    return rows.map((r) => r.userId).filter((id) => id !== except);
  }

  /** Adds people to a project, each told once; those already on it are left as they are. */
  private async joinTeam(user: RequestUser, projectId: string, userIds: string[]): Promise<number> {
    const people = await this.prisma.user.findMany({ where: { id: { in: [...new Set(userIds)] }, organizationId: user.organizationId }, select: { id: true, fullName: true } });
    if (people.length < new Set(userIds).size) throw new NotFoundException('User not found');
    const already = new Set((await this.prisma.projectMember.findMany({ where: { projectId, userId: { in: people.map((p) => p.id) } }, select: { userId: true } })).map((m) => m.userId));
    const added = people.filter((p) => !already.has(p.id));
    if (!added.length) return 0;
    await this.prisma.projectMember.createMany({ data: added.map((p) => ({ projectId, userId: p.id })), skipDuplicates: true });
    for (const p of added) {
      await this.audit.log(user, 'PROJECT', projectId, 'MEMBER_ADDED', p.fullName);
      await this.notifications.onAddedToProject(user, projectId, p.id);
    }
    return added.length;
  }

  async update(user: RequestUser, id: string, dto: UpdateProjectDto): Promise<ProjectDetail> {
    await this.access.assertCanAccessProject(user, id);
    if (dto.chainageStart !== undefined || dto.chainageEnd !== undefined) {
      const cur = await this.prisma.project.findUniqueOrThrow({ where: { id }, select: { chainageStart: true, chainageEnd: true } });
      this.checkChainage(dto.chainageStart !== undefined ? dto.chainageStart : cur.chainageStart, dto.chainageEnd !== undefined ? dto.chainageEnd : cur.chainageEnd);
    }
    if (dto.siteLat !== undefined || dto.siteLng !== undefined || dto.siteCheckInStrict !== undefined) {
      const cur = await this.prisma.project.findUniqueOrThrow({ where: { id }, select: { siteLat: true, siteLng: true, siteCheckInStrict: true } });
      this.checkSite(dto.siteLat !== undefined ? dto.siteLat : cur.siteLat, dto.siteLng !== undefined ? dto.siteLng : cur.siteLng, dto.siteCheckInStrict ?? cur.siteCheckInStrict);
    }
    const data = this.toData(dto);
    await this.withClient(user, dto, data);
    // A new built-in kind with no type named leaves the old type, whose kind it no longer is.
    await this.withType(user, dto.type !== undefined && dto.typeCode === undefined ? { ...dto, typeCode: null } : dto, data);
    await this.withVertical(user, dto, data, false);
    const before = await this.prisma.project.findUniqueOrThrow({ where: { id }, select: { startDate: true } });
    const row = await this.prisma.project.update({ where: { id }, data, include: projectInclude });
    await this.audit.log(user, 'PROJECT', row.id, 'UPDATED');
    // The dates arriving for the first time spread the activities that have none (finding 11 of the October review).
    if (!before.startDate && row.startDate) await this.templates.spreadUndated(user, id);
    return this.toDetail(row);
  }

  async addMember(user: RequestUser, id: string, dto: AddMemberDto): Promise<ProjectDetail> {
    await this.access.assertCanAccessProject(user, id);
    const ids = dto.userIds ?? (dto.userId ? [dto.userId] : []);
    if (!ids.length) throw new BadRequestException('Choose who to add');
    await this.joinTeam(user, id, ids);
    return this.get(user, id);
  }

  /**
   * One person onto several project teams, which is how a new user gets their projects as they are created
   * (finding 17 of the October review: the New user form had no project).
   */
  async addToProjects(user: RequestUser, userId: string, projectIds: string[]): Promise<number> {
    let joined = 0;
    for (const id of [...new Set(projectIds)]) {
      await this.access.assertCanAccessProject(user, id);
      joined += await this.joinTeam(user, id, [userId]);
    }
    return joined;
  }

  /** "Copy team from project": everyone on another project the caller sees joins this one. */
  async copyTeam(user: RequestUser, id: string, dto: CopyTeamDto): Promise<ProjectDetail> {
    if (dto.fromProjectId === id) throw new BadRequestException('Choose another project to copy the team from');
    await this.access.assertCanAccessProject(user, id);
    await this.access.assertCanAccessProject(user, dto.fromProjectId);
    const target = await this.prisma.project.findUniqueOrThrow({ where: { id }, select: { projectManagerId: true } });
    await this.joinTeam(user, id, await this.teamOf(dto.fromProjectId, target.projectManagerId));
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
