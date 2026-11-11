import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  MAX_PAGE_SIZE,
  MAX_REPORT_NAME,
  REPORT_FILTER_OP_LABELS,
  REPORT_ROW_CAP,
  REPORT_SOURCES,
  ROLE_LABELS,
  canPrepareBill,
  canStopAnySchedule,
  catalogueDto,
  catalogueFor,
  isRealDay,
  isReportSource,
  leftOutNotes,
  mayReceiveReport,
  readDefinition,
  reportingMonth,
  reportSourcesFor,
  runReport,
  scheduleOwnerProblem,
  scheduleProblem,
  scheduleSince,
  scheduleWords,
  visibleDefinition,
  type ManagementReportDto,
  type Paginated,
  type ReportCatalogue,
  type ReportDefinition,
  type ReportFrequency,
  type ReportReader,
  type ReportRecipientDto,
  type ReportSourceDto,
  type ReportSourceKey,
  type RoleKey,
  type SavedReportDto,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../common/current-user';
import { ApprovalRightsService } from '../common/approval-rights.service';
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
/** Someone a report is read as or sent to. */
type Who = { id: string; organizationId: string; roleKey: RoleKey };

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
    private rights: ApprovalRightsService,
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

  /**
   * Someone as a report reader: their role, and their approval rights where a source admits its approvers (RA bills, as
   * the bills list's own check does). Given a source, the rights are read only when that source needs them.
   */
  async readerOf(who: Who, source?: ReportSourceKey): Promise<ReportReader> {
    if (source && (source !== 'ra-bills' || canPrepareBill(who.roleKey))) return { roleKey: who.roleKey };
    return { roleKey: who.roleKey, approvalRights: await this.rights.rightsFor(who) };
  }

  /** Several people as readers of a source, a few at a time where their rights have to be read. */
  async readersOf(people: Who[], source: ReportSourceKey): Promise<Map<string, ReportReader>> {
    const out = new Map<string, ReportReader>();
    for (let i = 0; i < people.length; i += PAGES_AT_ONCE) {
      const batch = people.slice(i, i + PAGES_AT_ONCE);
      const readers = await Promise.all(batch.map((p) => this.readerOf(p, source)));
      batch.forEach((p, j) => out.set(p.id, readers[j]));
    }
    return out;
  }

  /** The columns the reader is offered over a source; a source whose list their role does not open is refused. */
  async catalogue(user: RequestUser, source: ReportSourceKey, reader?: ReportReader): Promise<ReportCatalogue> {
    const def = REPORT_SOURCES[source];
    if (!def.sees(reader ?? (await this.readerOf(user, source)))) throw new ForbiddenException(`Your role does not open ${def.label.toLowerCase()}`);
    const fields = def.customFields ? await this.customFields.list(user, def.customFields) : [];
    return catalogueFor(user.roleKey, source, fields);
  }

  async sources(user: RequestUser): Promise<ReportSourceDto[]> {
    const reader = await this.readerOf(user);
    return Promise.all(reportSourcesFor(reader).map(async (k) => catalogueDto(await this.catalogue(user, k, reader))));
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
    return { rows: uniqueRows(rows).slice(0, REPORT_ROW_CAP), total: first.total };
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
      if (opts.from !== undefined && !isRealDay(opts.from)) throw new BadRequestException('Choose a first day that is on the calendar');
      if (opts.to !== undefined && !isRealDay(opts.to)) throw new BadRequestException('Choose a last day that is on the calendar');
      from = opts.from ?? `${month}-01`;
      to = opts.to ?? (monthEnd(month) > today ? today : monthEnd(month));
      if (from > to) throw new BadRequestException('Choose a start on or before the end');
    }
    const projectId = catalogue.projects ? opts.projectId : undefined;
    const project = projectId ? await this.projects.get(user, projectId) : null;
    const { rows, total } = await this.readAll(user, def.source, { ...(from ? { from, to } : {}), ...(projectId ? { projectId } : {}) });
    const run = runReport(rows, def, catalogue);
    const notes = [
      ...(def.filters.length ? [`Only rows where ${def.filters.map((f) => `${catalogue.columns.find((c) => c.key === f.column)!.label} ${REPORT_FILTER_OP_LABELS[f.op]} ${f.value}`).join(', and ')}.`] : []),
      ...leftOutNotes(read),
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

  /**
   * The reports a person sees: their own whatever the source (so one they can no longer open still shows why, and can
   * stop sending), and over a source they open, the shared ones and those scheduled to them; an admin also sees every
   * scheduled report, to stop it.
   */
  private async visible(user: RequestUser): Promise<Prisma.SavedReportWhereInput> {
    const source = { in: reportSourcesFor(await this.readerOf(user)) };
    const or: Prisma.SavedReportWhereInput[] = [{ ownerId: user.id }, { shared: true, source }, { schedule: { recipientIds: { has: user.id } }, source }];
    if (canStopAnySchedule(user.roleKey)) or.push({ schedule: { isNot: null }, source });
    return { organizationId: user.organizationId, OR: or };
  }

  /** Recipients' names; someone who has left the company is no longer one. */
  private async recipientsOf(organizationId: string, ids: string[]) {
    if (!ids.length) return new Map<string, string>();
    const users = await this.prisma.user.findMany({ where: { organizationId, id: { in: ids }, isActive: true }, select: { id: true, fullName: true } });
    return new Map(users.map((u) => [u.id, u.fullName]));
  }

  private toDto(user: RequestUser, r: Row, names: Map<string, string>, catalogues: Map<string, ReportCatalogue>): SavedReportDto {
    const source = r.source as ReportSourceKey;
    const s = r.schedule;
    const mine = r.ownerId === user.id;
    const catalogue = catalogues.get(source);
    return {
      id: r.id,
      name: r.name,
      source,
      sourceLabel: REPORT_SOURCES[source]?.label ?? r.source,
      // Someone else's report reads as what this reader's role sees of it, never the columns and conditions it hides.
      definition: mine || !catalogue ? (r.definition as unknown as ReportDefinition) : visibleDefinition(r.definition, catalogue),
      shared: r.shared,
      ownerId: r.ownerId,
      ownerName: r.owner.fullName,
      mine,
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
    const others = [...new Set(rows.filter((r) => r.ownerId !== user.id && isReportSource(r.source)).map((r) => r.source as ReportSourceKey))];
    const catalogues = new Map(await Promise.all(others.map(async (k) => [k, await this.catalogue(user, k)] as const)));
    return rows.map((r) => this.toDto(user, r, names, catalogues));
  }

  async list(user: RequestUser, q: ListSavedReportsQuery): Promise<Paginated<SavedReportDto>> {
    const where: Prisma.SavedReportWhereInput = { ...(await this.visible(user)) };
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
    const r = await this.prisma.savedReport.findFirst({ where: { id, ...(await this.visible(user)) }, include });
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
    const source = r.source as ReportSourceKey;
    if (r.ownerId === user.id && isReportSource(source) && !REPORT_SOURCES[source].sees(await this.readerOf(user, source)))
      throw new ForbiddenException(`Your role no longer opens ${REPORT_SOURCES[source].label.toLowerCase()}`);
    return this.run(user, r.definition, { ...q, drop: r.ownerId !== user.id, title: r.name });
  }

  // Schedules

  /** People a report over the source can go to: active staff of the company who open its list (`mayReceiveReport`). */
  async recipients(user: RequestUser, source: ReportSourceKey): Promise<ReportRecipientDto[]> {
    await this.catalogue(user, source);
    const users = await this.prisma.user.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      select: { id: true, organizationId: true, fullName: true, role: { select: { key: true } } },
      orderBy: { fullName: 'asc' },
    });
    const readers = await this.readersOf(users.map(asWho), source);
    return users.filter((u) => mayReceiveReport(readers.get(u.id)!, source)).map((u) => ({ id: u.id, name: u.fullName, role: ROLE_LABELS[u.role.key as RoleKey] ?? u.role.key }));
  }

  async setSchedule(user: RequestUser, id: string, dto: ScheduleReportDto): Promise<SavedReportDto> {
    const r = await this.own(user, id);
    const recipientIds = [...new Set(dto.recipientIds)];
    const problem = scheduleProblem({ ...dto, weekday: dto.weekday ?? 0, dayOfMonth: dto.dayOfMonth ?? 1, recipientIds });
    if (problem) throw new BadRequestException(problem);
    const source = r.source as ReportSourceKey;
    const ownerProblem = scheduleOwnerProblem({ isActive: true, ...(await this.readerOf(user, source)) }, source);
    if (ownerProblem) throw new ForbiddenException(`Your role no longer opens ${REPORT_SOURCES[source].label.toLowerCase()}`);
    const users = await this.prisma.user.findMany({ where: { organizationId: user.organizationId, id: { in: recipientIds }, isActive: true }, select: { id: true, organizationId: true, fullName: true, role: { select: { key: true } } } });
    if (users.length !== recipientIds.length) throw new BadRequestException('Choose people who still work in the company');
    const readers = await this.readersOf(users.map(asWho), source);
    const cannot = users.filter((u) => !mayReceiveReport(readers.get(u.id)!, source));
    if (cannot.length) throw new BadRequestException(`${cannot.map((u) => u.fullName).join(', ')} cannot open ${REPORT_SOURCES[source].label.toLowerCase()}; choose someone else`);
    const data = { frequency: dto.frequency, weekday: dto.weekday ?? 0, dayOfMonth: dto.dayOfMonth ?? 1, recipientIds };
    const today = todayIn();
    const old = r.schedule;
    // New days start again from today, so a change never sends a period that ended before it (`scheduleSince`).
    const since = scheduleSince(old ? { frequency: old.frequency as ReportFrequency, weekday: old.weekday, dayOfMonth: old.dayOfMonth, since: dateOnly(old.since)! } : null, data, today);
    await this.prisma.reportSchedule.upsert({
      where: { reportId: id },
      create: { organizationId: user.organizationId, reportId: id, since: parseDate(since), ...data },
      update: { ...data, since: parseDate(since) },
    });
    return this.get(user, id);
  }

  /** The owner stops a schedule, or an admin stops anyone's (the email's footnote says so). */
  async removeSchedule(user: RequestUser, id: string): Promise<SavedReportDto> {
    const r = await this.row(user, id);
    if (r.ownerId !== user.id && !canStopAnySchedule(user.roleKey)) throw new ForbiddenException(`Only ${r.owner.fullName}, who made this report, or an admin can stop sending it`);
    await this.prisma.reportSchedule.deleteMany({ where: { reportId: id, organizationId: user.organizationId } });
    return this.get(user, id);
  }
}

const asWho = (u: { id: string; organizationId: string; role: { key: string } }): Who => ({ id: u.id, organizationId: u.organizationId, roleKey: u.role.key as RoleKey });

/** Rows read a page at a time, each once: a record that moves between pages while they are read is not counted twice. */
export function uniqueRows(rows: unknown[]): unknown[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const id = r && typeof r === 'object' && typeof (r as { id?: unknown }).id === 'string' ? (r as { id: string }).id : null;
    if (id === null) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
