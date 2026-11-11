import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  MAX_PAGE_SIZE,
  MAX_REPORT_NAME,
  REPORT_FILTER_OP_LABELS,
  REPORT_ROW_CAP,
  REPORT_SOURCES,
  ROLE_LABELS,
  catalogueDto,
  catalogueFor,
  isGuest,
  isReportSource,
  readDefinition,
  reportingMonth,
  reportSourcesFor,
  runReport,
  scheduleProblem,
  scheduleWords,
  type ManagementReportDto,
  type Paginated,
  type ReportCatalogue,
  type ReportDefinition,
  type ReportFrequency,
  type ReportRecipientDto,
  type ReportSourceDto,
  type ReportSourceKey,
  type RoleKey,
  type SavedReportDto,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../common/current-user';
import { dateOnly, formatDay, iso, parseDate } from '../common/serialize';
import { pageArgs, paginated, searchWords, ilike } from '../common/paging';
import { todayIn } from '../notifications/time';
import { PurchaseOrdersService } from '../purchasing/purchase-orders.service';
import { VendorBillsService } from '../purchasing/vendor-bills.service';
import { RaBillsService } from '../ra-bills/ra-bills.service';
import { MaterialRequestsService } from '../material-requests/material-requests.service';
import { StockService } from '../stock/stock.service';
import { VendorsService } from '../vendors/vendors.service';
import { ProjectsService } from '../projects/projects.service';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { ListSavedReportsQuery, ReportRunQuery, SaveReportDto, ScheduleReportDto } from './report-builder.dto';

/** What a source's list is asked for: the period and project as the list's own filters, a page at a time. */
type ListArgs = { from?: string; to?: string; projectId?: string; page: number; pageSize: number };
type Reader = (user: RequestUser, q: ListArgs) => Promise<Paginated<unknown>>;

/** Pages read at once: enough to keep a big report quick, few enough to leave the pool for everyone else. */
const PAGES_AT_ONCE = 4;

const include = { owner: { select: { fullName: true } }, schedule: true } satisfies Prisma.SavedReportInclude;
type Row = Prisma.SavedReportGetPayload<{ include: typeof include }>;

export interface ReportRunOptions extends ReportRunQuery {
  /** Leave out the columns the reader does not see (someone else's report, or a schedule run as its recipient) */
  drop?: boolean;
  title?: string;
}

const monthEnd = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

/**
 * Reports people build (ARCHITECTURE "Reports you build"). Rows come only from each source's own list service called as
 * the reader, the way `SearchService` reads, so project visibility, the list's role gate and what the service hides hold;
 * the definition is read against the reader's catalogue (`readDefinition`) and run by the pure `runReport`.
 */
@Injectable()
export class ReportBuilderService {
  private readonly readers: Record<ReportSourceKey, Reader>;

  constructor(
    private prisma: PrismaService,
    purchaseOrders: PurchaseOrdersService,
    vendorBills: VendorBillsService,
    raBills: RaBillsService,
    materialRequests: MaterialRequestsService,
    private stock: StockService,
    vendors: VendorsService,
    private projects: ProjectsService,
    private customFields: CustomFieldsService,
  ) {
    this.readers = {
      'purchase-orders': (u, q) => purchaseOrders.list(u, { ...q, sortBy: 'poDate', sortOrder: 'desc' }),
      'vendor-bills': (u, q) => vendorBills.list(u, { ...q, sortBy: 'invoiceDate', sortOrder: 'desc' }),
      'ra-bills': (u, q) => raBills.list(u, { ...q, sortBy: 'billDate', sortOrder: 'desc' }),
      indents: (u, q) => materialRequests.list(u, { ...q, sortBy: 'createdAt', sortOrder: 'desc' }),
      stock: (u, q) => stock.balances(u, { projectId: q.projectId, page: q.page, pageSize: q.pageSize }),
      vendors: (u, q) => vendors.list(u, { includeInactive: true, page: q.page, pageSize: q.pageSize }),
      projects: (u, q) => projects.list(u, { page: q.page, pageSize: q.pageSize, sortBy: 'code', sortOrder: 'asc' }),
    };
  }

  /** The columns the reader is offered over a source; a source whose list their role does not open is refused. */
  async catalogue(user: RequestUser, source: ReportSourceKey): Promise<ReportCatalogue> {
    const def = REPORT_SOURCES[source];
    if (!def.sees(user.roleKey)) throw new ForbiddenException(`Your role does not open ${def.label.toLowerCase()}`);
    const fields = def.customFields ? await this.customFields.list(user, def.customFields) : [];
    return catalogueFor(user.roleKey, source, fields);
  }

  async sources(user: RequestUser): Promise<ReportSourceDto[]> {
    return Promise.all(reportSourcesFor(user.roleKey).map(async (k) => catalogueDto(await this.catalogue(user, k))));
  }

  /** Every row of the list for the period and project, up to `REPORT_ROW_CAP`, a few pages at a time. */
  private async readAll(user: RequestUser, source: ReportSourceKey, q: Omit<ListArgs, 'page' | 'pageSize'>): Promise<{ rows: unknown[]; total: number }> {
    const read = this.readers[source];
    // The stock list works its balances out whole and pages them in memory, so it is read once.
    if (source === 'stock') {
      const all = await read(user, { ...q, page: 1, pageSize: REPORT_ROW_CAP });
      return { rows: all.items, total: all.total };
    }
    const first = await read(user, { ...q, page: 1, pageSize: MAX_PAGE_SIZE });
    const pages = Math.ceil(Math.min(first.total, REPORT_ROW_CAP) / MAX_PAGE_SIZE);
    const rows = [...first.items];
    for (let p = 2; p <= pages; p += PAGES_AT_ONCE) {
      const batch = await Promise.all(Array.from({ length: Math.min(PAGES_AT_ONCE, pages - p + 1) }, (_, i) => read(user, { ...q, page: p + i, pageSize: MAX_PAGE_SIZE })));
      for (const b of batch) rows.push(...b.items);
    }
    return { rows: rows.slice(0, REPORT_ROW_CAP), total: first.total };
  }

  /** A definition run as the reader, as a `ManagementReportDto` the report page, print and Excel draw. */
  async run(user: RequestUser, raw: unknown, opts: ReportRunOptions = {}): Promise<ManagementReportDto & { count: number; countLabel: string }> {
    const sourceKey = raw && typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw, 'source') ? (raw as { source: unknown }).source : undefined;
    if (!isReportSource(sourceKey)) throw new BadRequestException('Choose what the report is over: purchase orders, vendor bills, RA bills, indents, stock, vendors or projects');
    const catalogue = await this.catalogue(user, sourceKey);
    const read = readDefinition(raw, catalogue, { drop: opts.drop });
    if (!read.definition) throw new BadRequestException(read.problems.join('. '));
    const def = read.definition;
    const today = todayIn();
    let from: string | null = null;
    let to = today;
    if (catalogue.dated) {
      const month = reportingMonth(today);
      from = opts.from ?? `${month}-01`;
      to = opts.to ?? (monthEnd(month) > today ? today : monthEnd(month));
      if (from > to) throw new BadRequestException('The period starts after it ends');
    }
    const projectId = catalogue.projects ? opts.projectId : undefined;
    const project = projectId ? await this.projects.get(user, projectId) : null;
    const { rows, total } = await this.readAll(user, def.source, { ...(from ? { from, to } : {}), ...(projectId ? { projectId } : {}) });
    const run = runReport(rows, def, catalogue);
    const notes = [
      ...(def.filters.length ? [`Only rows where ${def.filters.map((f) => `${catalogue.columns.find((c) => c.key === f.column)!.label} ${REPORT_FILTER_OP_LABELS[f.op]} ${f.value}`).join(', and ')}.`] : []),
      ...(read.left.length ? [`Left out, as your role does not see ${read.left.length === 1 ? 'it' : 'them'}: ${read.left.join(', ')}.`] : []),
      ...(total > REPORT_ROW_CAP ? [`Only the first ${REPORT_ROW_CAP.toLocaleString('en-IN')} of ${total.toLocaleString('en-IN')} ${catalogue.label.toLowerCase()} are read; choose a shorter period or one project.`] : []),
    ];
    return {
      key: 'saved',
      title: opts.title ?? catalogue.label,
      period: from ? `${formatDay(from)} to ${formatDay(to)}` : `As of ${formatDay(today)}`,
      from,
      to,
      projectName: project ? `${project.code} · ${project.name}` : null,
      verticalName: null,
      scope: project ? null : def.source === 'vendors' ? 'Every vendor' : 'Every project you see',
      generatedAt: new Date().toISOString(),
      figures: [],
      sections: run.sections,
      notes,
      count: run.count,
      countLabel: catalogue.countLabel,
    };
  }

  // Saved reports

  private visible(user: RequestUser): Prisma.SavedReportWhereInput {
    return { organizationId: user.organizationId, source: { in: reportSourcesFor(user.roleKey) }, OR: [{ ownerId: user.id }, { shared: true }] };
  }

  private async recipientsOf(organizationId: string, ids: string[]) {
    if (!ids.length) return new Map<string, string>();
    const users = await this.prisma.user.findMany({ where: { organizationId, id: { in: ids } }, select: { id: true, fullName: true } });
    return new Map(users.map((u) => [u.id, u.fullName]));
  }

  private toDto(user: RequestUser, r: Row, names: Map<string, string>): SavedReportDto {
    const source = r.source as ReportSourceKey;
    const s = r.schedule;
    return {
      id: r.id,
      name: r.name,
      source,
      sourceLabel: REPORT_SOURCES[source]?.label ?? r.source,
      definition: r.definition as unknown as ReportDefinition,
      shared: r.shared,
      ownerId: r.ownerId,
      ownerName: r.owner.fullName,
      mine: r.ownerId === user.id,
      schedule: s
        ? {
            frequency: s.frequency as ReportFrequency,
            weekday: s.weekday,
            dayOfMonth: s.dayOfMonth,
            recipients: s.recipientIds.filter((id) => names.has(id)).map((id) => ({ id, name: names.get(id)! })),
            words: scheduleWords({ frequency: s.frequency as ReportFrequency, weekday: s.weekday, dayOfMonth: s.dayOfMonth }),
            lastSentOn: dateOnly(s.lastSentOn),
          }
        : null,
      createdAt: iso(r.createdAt)!,
      updatedAt: iso(r.updatedAt)!,
    };
  }

  private async dtos(user: RequestUser, rows: Row[]) {
    const names = await this.recipientsOf(user.organizationId, [...new Set(rows.flatMap((r) => r.schedule?.recipientIds ?? []))]);
    return rows.map((r) => this.toDto(user, r, names));
  }

  async list(user: RequestUser, q: ListSavedReportsQuery): Promise<Paginated<SavedReportDto>> {
    const where: Prisma.SavedReportWhereInput = { ...this.visible(user) };
    const and: Prisma.SavedReportWhereInput[] = [];
    if (q.mine) where.ownerId = user.id;
    if (q.scheduled) where.schedule = { isNot: null };
    for (const w of searchWords(q.q)) and.push({ name: ilike(w) });
    if (and.length) where.AND = and;
    const args = pageArgs(q);
    const sortBy = q.sortBy ?? 'name';
    const order = q.sortOrder ?? (sortBy === 'updatedAt' ? 'desc' : 'asc');
    const [rows, total] = await Promise.all([
      this.prisma.savedReport.findMany({ where, include, orderBy: [{ [sortBy]: order }, { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.savedReport.count({ where }),
    ]);
    return paginated(await this.dtos(user, rows), total, args);
  }

  private async row(user: RequestUser, id: string): Promise<Row> {
    const r = await this.prisma.savedReport.findFirst({ where: { id, ...this.visible(user) }, include });
    if (!r) throw new NotFoundException('Report not found');
    return r;
  }

  private async own(user: RequestUser, id: string): Promise<Row> {
    const r = await this.row(user, id);
    if (r.ownerId !== user.id) throw new ForbiddenException(`Only ${r.owner.fullName}, who made this report, can change it`);
    return r;
  }

  async get(user: RequestUser, id: string): Promise<SavedReportDto> {
    return (await this.dtos(user, [await this.row(user, id)]))[0];
  }

  /** The name and definition checked in full, as the owner sees the source, before anything is written. */
  private async checked(user: RequestUser, dto: SaveReportDto): Promise<{ name: string; definition: ReportDefinition }> {
    const name = (dto.name ?? '').trim().replace(/\s+/g, ' ');
    if (!name || name.length > MAX_REPORT_NAME) throw new BadRequestException(`Give the report a name of 1 to ${MAX_REPORT_NAME} letters`);
    const source = (dto.definition as { source?: unknown }).source;
    if (!isReportSource(source)) throw new BadRequestException('Choose what the report is over');
    const read = readDefinition(dto.definition, await this.catalogue(user, source));
    if (!read.definition) throw new BadRequestException(read.problems.join('. '));
    return { name, definition: read.definition };
  }

  async create(user: RequestUser, dto: SaveReportDto): Promise<SavedReportDto> {
    const { name, definition } = await this.checked(user, dto);
    const r = await this.prisma.savedReport.create({
      data: { organizationId: user.organizationId, ownerId: user.id, name, source: definition.source, definition: definition as unknown as Prisma.InputJsonValue, shared: dto.shared === true },
      include,
    });
    return (await this.dtos(user, [r]))[0];
  }

  async update(user: RequestUser, id: string, dto: SaveReportDto): Promise<SavedReportDto> {
    await this.own(user, id);
    const { name, definition } = await this.checked(user, dto);
    const r = await this.prisma.savedReport.update({
      where: { id },
      data: { name, source: definition.source, definition: definition as unknown as Prisma.InputJsonValue, ...(dto.shared !== undefined ? { shared: dto.shared } : {}) },
      include,
    });
    return (await this.dtos(user, [r]))[0];
  }

  async remove(user: RequestUser, id: string): Promise<{ ok: true }> {
    await this.own(user, id);
    await this.prisma.savedReport.delete({ where: { id } });
    return { ok: true };
  }

  /** A saved report run as the reader: someone else's shared report leaves out what the reader's role does not see. */
  async runSaved(user: RequestUser, id: string, q: ReportRunQuery) {
    const r = await this.row(user, id);
    return this.run(user, r.definition, { ...q, drop: r.ownerId !== user.id, title: r.name });
  }

  // Schedules

  /** People a report over the source can go to: active staff of the company whose role opens its list. */
  async recipients(user: RequestUser, source: ReportSourceKey): Promise<ReportRecipientDto[]> {
    await this.catalogue(user, source);
    const users = await this.prisma.user.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      select: { id: true, fullName: true, role: { select: { key: true } } },
      orderBy: { fullName: 'asc' },
    });
    return users.filter((u) => mayReceive(u.role.key as RoleKey, source)).map((u) => ({ id: u.id, name: u.fullName, role: ROLE_LABELS[u.role.key as RoleKey] ?? u.role.key }));
  }

  async setSchedule(user: RequestUser, id: string, dto: ScheduleReportDto): Promise<SavedReportDto> {
    const r = await this.own(user, id);
    const recipientIds = [...new Set(dto.recipientIds)];
    const problem = scheduleProblem({ ...dto, weekday: dto.weekday ?? 0, dayOfMonth: dto.dayOfMonth ?? 1, recipientIds });
    if (problem) throw new BadRequestException(problem);
    const source = r.source as ReportSourceKey;
    const users = await this.prisma.user.findMany({ where: { organizationId: user.organizationId, id: { in: recipientIds }, isActive: true }, select: { id: true, fullName: true, role: { select: { key: true } } } });
    if (users.length !== recipientIds.length) throw new BadRequestException('Choose people who still work in the company');
    const cannot = users.filter((u) => !mayReceive(u.role.key as RoleKey, source));
    if (cannot.length) throw new BadRequestException(`${cannot.map((u) => u.fullName).join(', ')} cannot open ${REPORT_SOURCES[source].label.toLowerCase()}; choose someone else`);
    const data = { frequency: dto.frequency, weekday: dto.weekday ?? 0, dayOfMonth: dto.dayOfMonth ?? 1, recipientIds };
    await this.prisma.reportSchedule.upsert({
      where: { reportId: id },
      create: { organizationId: user.organizationId, reportId: id, since: parseDate(todayIn()), ...data },
      update: data,
    });
    return this.get(user, id);
  }

  async removeSchedule(user: RequestUser, id: string): Promise<SavedReportDto> {
    await this.own(user, id);
    await this.prisma.reportSchedule.deleteMany({ where: { reportId: id, organizationId: user.organizationId } });
    return this.get(user, id);
  }
}

/** A recipient is staff (never a client's guest or a supplier) whose role opens the source's list. */
export const mayReceive = (role: RoleKey, source: ReportSourceKey) => !isGuest(role) && REPORT_SOURCES[source].sees(role);
