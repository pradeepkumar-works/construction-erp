import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  VALVE_NODE_KINDS,
  activityPipeStage,
  compareCodes,
  crewTotal,
  dprExtraProblems,
  dprRequiredProblems,
  dprLineProblem,
  isLengthUnit,
  lineFigures,
  lineLocation,
  segmentCapProblem,
  segmentLabel,
  typeCodeOf,
  workSummary,
  type PipeStage,
  type SegmentStage,
  type DailyReportDto,
  type DprExtra,
  type DprFormDef,
  type DprActivityOptionDto,
  type DprLineDto,
  type DprSortField,
  type DprWorkOptionsDto,
  type ManpowerLine,
  type MachineryLine,
  type Paginated,
  type SortOrder,
  type SubmissionStatus,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { SubmissionLifecycleService } from '../common/submission-lifecycle.service';
import { AttachmentsService, ATTACHMENT_FIELDS } from '../common/attachments.service';
import { dateOnly, dec, iso, parseDate, assertNotAfterToday } from '../common/serialize';
import { locationOr, resolveSector } from '../common/sector';
import { todayIn } from '../notifications/time';
import { isUniqueViolation } from '../common/idempotency';
import { ilike, pageArgs, paginated, searchWords, dateRange } from '../common/paging';
import { CreateDprDto, DprLineInputDto, DprWorkOptionsQuery, ListDprQuery, UpdateDprDto } from './dpr.dto';
import { AttendanceService } from '../attendance/attendance.service';
import { heldOnSegments } from '../pipe-network/pipe-network.service';
import { DprFormsService } from '../templates/dpr-forms.service';
import { ProjectTypesService } from '../templates/project-types.service';

const include = {
  project: { select: { name: true, type: true, typeCode: true } },
  submittedBy: { select: { fullName: true } },
  reviewedBy: { select: { fullName: true } },
  attachments: { select: ATTACHMENT_FIELDS },
  _count: { select: { lines: true } },
} satisfies Prisma.DailyReportInclude;
type Row = Prisma.DailyReportGetPayload<{ include: typeof include }>;

/** Where an activity sits in the work breakdown (item 125): its component and sub-component. */
const PLACE = { select: { code: true, name: true, level: true, elementType: true, parent: { select: { code: true, name: true } } } } as const;
type Place = { code: string; name: string; level: string; parent: { code: string; name: string } | null } | null;
const placeOf = (e: Place) => {
  if (!e) return { componentCode: null, componentName: null, subComponentCode: null, subComponentName: null };
  if (e.level === 'SUB_COMPONENT' && e.parent) return { componentCode: e.parent.code, componentName: e.parent.name, subComponentCode: e.code, subComponentName: e.name };
  return { componentCode: e.code, componentName: e.name, subComponentCode: null, subComponentName: null };
};

const SEGMENT = { select: { code: true, diameterMm: true, fromNode: { select: { code: true } }, toNode: { select: { code: true } } } } as const;
const lineInclude = {
  activity: { select: { name: true, unit: true, plannedQty: true, pipeStage: true, parentActivity: { select: { name: true } }, workElement: PLACE } },
  pipeSegment: SEGMENT,
  pipeNode: { select: { code: true } },
  workOrder: { select: { woNo: true } },
  materials: { include: { item: { select: { name: true, unit: true } } }, orderBy: { sortOrder: 'asc' } },
  attachments: { select: ATTACHMENT_FIELDS },
} satisfies Prisma.ProgressEntryInclude;

type Tx = Prisma.TransactionClient;

/** Own-field values as stored: an object of the form's keys (item 134 part 2). */
const extraOf = (v: Prisma.JsonValue | null | undefined): DprExtra => (v && typeof v === 'object' && !Array.isArray(v) ? (v as DprExtra) : {});
const manpowerTotal = (lines: { count?: number | null }[] | null | undefined) => (lines ?? []).reduce((s, m) => s + (Number(m.count) || 0), 0);

const ORDER: Record<DprSortField, (o: SortOrder) => Prisma.DailyReportOrderByWithRelationInput[]> = {
  date: (o) => [{ date: o }, { createdAt: o }],
  createdAt: (o) => [{ createdAt: o }],
  submittedAt: (o) => [{ submittedAt: { sort: o, nulls: 'last' } }],
  status: (o) => [{ status: o }, { date: 'desc' }],
  project: (o) => [{ project: { name: o } }, { date: 'desc' }],
  submittedBy: (o) => [{ submittedBy: { fullName: o } }, { date: 'desc' }],
};
const DESC_DEFAULT = new Set<string>(['date', 'createdAt', 'submittedAt']);

@Injectable()
export class DprService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private lifecycle: SubmissionLifecycleService,
    private attachments: AttachmentsService,
    private attendance: AttendanceService,
    private forms: DprFormsService,
    private types: ProjectTypesService,
  ) {
    // A DPR's work lines (item 127) are submitted, approved and sent back with it.
    lifecycle.onStatus('DPR', (_user, id, status) => this.syncLines(id, status));
  }

  private async syncLines(id: string, status: SubmissionStatus) {
    const dpr = await this.prisma.dailyReport.findUniqueOrThrow({ where: { id }, select: { submittedAt: true, reviewedById: true, reviewedAt: true, reviewNote: true } });
    await this.prisma.progressEntry.updateMany({ where: { dailyReportId: id }, data: { status, ...dpr } });
  }

  toDto(r: Row): DailyReportDto {
    const manpower = (r.manpower as unknown as ManpowerLine[]) ?? [];
    const machinery = (r.machinery as unknown as MachineryLine[]) ?? [];
    return {
      id: r.id,
      projectId: r.projectId,
      projectName: r.project.name,
      date: dateOnly(r.date),
      weather: r.weather,
      siteCondition: r.siteCondition,
      manpower,
      machinery,
      materialReceived: r.materialReceived,
      workExecuted: r.workExecuted,
      testsConducted: r.testsConducted,
      safetyObservations: r.safetyObservations,
      issues: r.issues,
      nextDayPlan: r.nextDayPlan,
      totalManpower: manpowerTotal(manpower),
      lineCount: r._count.lines,
      status: r.status,
      submittedById: r.submittedById,
      submittedByName: r.submittedBy.fullName,
      submittedAt: iso(r.submittedAt),
      reviewedById: r.reviewedById,
      reviewedByName: r.reviewedBy?.fullName ?? null,
      reviewedAt: iso(r.reviewedAt),
      reviewNote: r.reviewNote,
      attachments: r.attachments.map((a) => this.attachments.toDto(a)),
      formId: r.dprFormConfigId,
      typeCode: typeCodeOf(r.project),
      extra: extraOf(r.extra),
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
    };
  }

  async list(user: RequestUser, q: ListDprQuery): Promise<Paginated<DailyReportDto>> {
    const where: Prisma.DailyReportWhereInput = { ...this.access.submissionWhere(user) };
    if (q.projectId) where.projectId = q.projectId;
    if (q.status) where.status = q.status;
    if (q.mine) where.submittedById = user.id;
    const days = dateRange(q.from, q.to);
    if (days) where.date = days;
    const words = searchWords(q.q);
    if (words.length)
      where.AND = words.map((w) => ({
        OR: [{ workExecuted: ilike(w) }, { issues: ilike(w) }, { siteCondition: ilike(w) }, { project: { name: ilike(w) } }, { submittedBy: { fullName: ilike(w) } }],
      }));
    const sortBy = q.sortBy ?? 'date';
    const order = q.sortOrder ?? (DESC_DEFAULT.has(sortBy) ? 'desc' : 'asc');
    const args = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.dailyReport.findMany({ where, include, orderBy: [...ORDER[sortBy](order), { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.dailyReport.count({ where }),
    ]);
    return paginated(rows.map((r) => this.toDto(r)), total, args);
  }

  async get(user: RequestUser, id: string): Promise<DailyReportDto> {
    const row = await this.prisma.dailyReport.findFirst({ where: { id, ...this.access.submissionWhere(user) }, include });
    if (!row) throw new NotFoundException('Daily report not found');
    const [lines, form] = await Promise.all([this.lineDtos(row.id, row.date), this.forms.ofReport(row.organizationId, row.dprFormConfigId, row.project)]);
    return { ...this.toDto(row), lines, form };
  }

  /**
   * The work lines with their figures: scope is the activity's planned quantity, up to previous what was approved on it
   * up to the report's day outside this report (and the report's earlier lines on it), then cumulative, % and balance.
   */
  private async lineDtos(id: string, date: Date): Promise<DprLineDto[]> {
    const rows = await this.prisma.progressEntry.findMany({ where: { dailyReportId: id }, include: lineInclude, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
    if (!rows.length) return [];
    const activityIds = [...new Set(rows.map((r) => r.activityId))];
    const before = await this.prisma.progressEntry.groupBy({
      by: ['activityId'],
      where: { activityId: { in: activityIds }, status: 'APPROVED', date: { lte: date }, OR: [{ dailyReportId: null }, { dailyReportId: { not: id } }] },
      _sum: { quantity: true },
    });
    const previous = new Map(before.map((b) => [b.activityId, Number(b._sum.quantity ?? 0)]));
    const scope = new Map(rows.map((r) => [r.activityId, Number(r.activity.plannedQty)]));
    const figures = lineFigures(rows.map((r) => ({ activityId: r.activityId, quantity: r.quantity.toString() })), scope, previous);
    return rows.map((r, i) => ({
      id: r.id,
      activityId: r.activityId,
      activityName: r.activity.name,
      parentActivityName: r.activity.parentActivity?.name ?? null,
      unit: r.activity.unit,
      ...placeOf(r.activity.workElement),
      quantity: dec(r.quantity),
      location: r.location,
      chainageFrom: r.chainageFrom,
      chainageTo: r.chainageTo,
      floor: r.floor,
      village: r.village,
      labour: (r.labour as unknown as ManpowerLine[] | null) ?? [],
      machines: (r.machines as unknown as MachineryLine[] | null) ?? [],
      materials: r.materials.map((m) => ({ itemId: m.itemId, itemName: m.item.name, unit: m.item.unit, quantity: dec(m.quantity) })),
      workOrderId: r.workOrderId,
      workOrderNo: r.workOrder?.woNo ?? null,
      remarks: r.remarks,
      extra: extraOf(r.extra),
      attachments: r.attachments.map((a) => this.attachments.toDto(a)),
      pipeStage: activityPipeStage({ pipeStage: r.activity.pipeStage, name: r.activity.name, elementType: r.activity.workElement?.elementType }),
      pipeSegmentId: r.pipeSegmentId,
      segmentLabel: r.pipeSegment ? segmentLabel({ code: r.pipeSegment.code, fromCode: r.pipeSegment.fromNode.code, toCode: r.pipeSegment.toNode.code }) : null,
      segmentDiameterMm: r.pipeSegment?.diameterMm ?? null,
      pipeNodeId: r.pipeNodeId,
      nodeCode: r.pipeNode?.code ?? null,
      scope: dec(r.activity.plannedQty),
      ...figures[i],
    }));
  }

  /**
   * What a project's DPR form offers (item 127): the activities that take progress, look-ahead ones first, each with
   * where it sits, its scope, what is done and its material norms; the store items; the open work orders.
   */
  async workOptions(user: RequestUser, q: DprWorkOptionsQuery): Promise<DprWorkOptionsDto> {
    await this.access.assertCanAccessProject(user, q.projectId);
    const day = parseDate(q.date ?? todayIn());
    const weekOn = new Date(day.getTime() + 7 * 86_400_000);
    const [org, project, activities, done, items, workOrders, segments, valves] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId }, select: { progressFromDpr: true } }),
      this.prisma.project.findUniqueOrThrow({ where: { id: q.projectId }, select: { id: true, type: true, typeCode: true, chainageStart: true, chainageEnd: true, floors: true, villages: true } }),
      this.prisma.activity.findMany({
        where: { projectId: q.projectId, subActivities: { none: {} } },
        select: {
          id: true,
          name: true,
          unit: true,
          plannedQty: true,
          plannedStart: true,
          plannedEnd: true,
          holdPoint: true,
          sortOrder: true,
          pipeStage: true,
          workElementId: true,
          parentActivity: { select: { name: true, sortOrder: true } },
          workElement: PLACE,
          boqItem: { select: { materialNorms: { select: { itemId: true, qtyPerUnit: true, item: { select: { name: true, unit: true } } }, orderBy: { createdAt: 'asc' } } } },
          materialNorms: { select: { itemId: true, qtyPerUnit: true, item: { select: { name: true, unit: true } } }, orderBy: { createdAt: 'asc' } },
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.progressEntry.groupBy({ by: ['activityId'], where: { projectId: q.projectId, status: 'APPROVED' }, _sum: { quantity: true } }),
      this.prisma.item.findMany({ where: { organizationId: user.organizationId }, select: { id: true, name: true, unit: true }, orderBy: { name: 'asc' } }),
      this.prisma.workOrder.findMany({
        where: { projectId: q.projectId, status: 'APPROVED', closedAt: null },
        select: { id: true, woNo: true, title: true, vendor: { select: { name: true } } },
        orderBy: { woDate: 'desc' },
      }),
      this.prisma.pipeSegment.findMany({
        where: { projectId: q.projectId, scope: 'PROPOSED' },
        select: { id: true, zoneId: true, code: true, lengthM: true, diameterMm: true, fromNodeId: true, toNodeId: true, fromNode: { select: { code: true } }, toNode: { select: { code: true } } },
      }),
      this.prisma.pipeNode.findMany({ where: { projectId: q.projectId, kind: { in: VALVE_NODE_KINDS } }, select: { id: true, zoneId: true, code: true, kind: true } }),
    ]);
    const doneOf = new Map(done.map((d) => [d.activityId, Number(d._sum.quantity ?? 0)]));
    const options = activities.map((a): DprActivityOptionDto & { order: string } => {
      const place = placeOf(a.workElement);
      const doneQty = doneOf.get(a.id) ?? 0;
      const planned = Number(a.plannedQty);
      const started = a.plannedStart ? a.plannedStart <= weekOn : false;
      const notOver = !a.plannedEnd || a.plannedEnd >= day;
      const pipeStage = activityPipeStage({ pipeStage: a.pipeStage, name: a.name, elementType: a.workElement?.elementType });
      return {
        id: a.id,
        name: a.name,
        parentActivityName: a.parentActivity?.name ?? null,
        unit: a.unit,
        ...place,
        plannedQty: dec(a.plannedQty),
        doneQty: dec(new Prisma.Decimal(doneQty)),
        lookAhead: started && notOver && (planned <= 0 || doneQty < planned),
        holdPoint: a.holdPoint,
        // The activity's own norms (item 128) come before its BOQ item's
        norms: (a.materialNorms.length ? a.materialNorms : (a.boqItem?.materialNorms ?? [])).map((n) => ({ itemId: n.itemId, itemName: n.item.name, unit: n.item.unit, qtyPerUnit: n.qtyPerUnit.toString() })),
        pipeStage,
        zoneId: pipeStage ? a.workElementId : null,
        order: place.subComponentCode ?? place.componentCode ?? '~',
      };
    });
    // Look-ahead first, then by the breakdown's outline numbers, then the plan's order (kept by the stable sort).
    options.sort((x, y) => Number(y.lookAhead) - Number(x.lookAhead) || compareCodes(x.order, y.order));
    // What each segment's stages already hold, so the form can say what is left (item 126).
    const stageOf = new Map(options.flatMap((o) => (o.pipeStage ? [[o.id, o.pipeStage] as const] : [])));
    const held = await heldOnSegments(this.prisma, segments.map((sg) => sg.id));
    const heldOf = new Map<string, Partial<Record<PipeStage, number>>>();
    for (const [key, m] of held) {
      const [segmentId, activityId] = key.split('|');
      const stage = stageOf.get(activityId);
      if (!stage) continue;
      const h = heldOf.get(segmentId) ?? {};
      h[stage] = Math.round(((h[stage] ?? 0) + m) * 1000) / 1000;
      heldOf.set(segmentId, h);
    }
    const valveIds = valves.map((v) => v.id);
    const fixed = valveIds.length
      ? new Set((await this.prisma.progressEntry.findMany({ where: { pipeNodeId: { in: valveIds }, status: 'APPROVED' }, select: { pipeNodeId: true }, distinct: ['pipeNodeId'] })).map((e) => e.pipeNodeId))
      : new Set<string | null>();
    const [form, features] = await Promise.all([this.forms.forProject(user.organizationId, project), this.types.featuresOf(user.organizationId, [project])]);
    return {
      form,
      sector: { locations: features.get(project.id)!.locations, chainageStart: project.chainageStart, chainageEnd: project.chainageEnd, floors: project.floors, villages: project.villages },
      activities: options.map(({ order: _order, ...o }) => o),
      items,
      workOrders: workOrders.map((w) => ({ id: w.id, woNo: w.woNo, title: w.title, vendorName: w.vendor.name })),
      progressFromDpr: org.progressFromDpr,
      segments: segments
        .map((sg) => ({ id: sg.id, zoneId: sg.zoneId, code: sg.code, fromNodeId: sg.fromNodeId, fromCode: sg.fromNode.code, toNodeId: sg.toNodeId, toCode: sg.toNode.code, lengthM: dec(sg.lengthM), diameterMm: sg.diameterMm, held: heldOf.get(sg.id) ?? {} }))
        .sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true })),
      valves: valves.map((v) => ({ id: v.id, zoneId: v.zoneId, code: v.code, kind: v.kind, fixed: fixed.has(v.id) })).sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true })),
    };
  }

  /**
   * Saves the report's work lines (item 127) as its progress entries: the complete list, so lines left out are removed.
   * Each line takes the report's day, status and submitter, its crew total as the entry's manpower and its material.
   * `extras` are the lines' own-field values, already read against the report's form. Returns each entry with the
   * photos sent for it, which are linked once the transaction is in.
   */
  private async saveLines(
    tx: Tx,
    user: RequestUser,
    dpr: { id: string; projectId: string; date: Date; status: SubmissionStatus; submittedById: string; submittedAt: Date | null },
    lines: DprLineInputDto[],
    extras: DprExtra[],
  ): Promise<{ id: string; attachmentIds: string[] | undefined }[]> {
    lines.forEach((l, i) => {
      const problem = dprLineProblem(l, i + 1);
      if (problem) throw new BadRequestException(problem);
    });
    const activityIds = [...new Set(lines.map((l) => l.activityId))];
    const itemIds = [...new Set(lines.flatMap((l) => (l.materials ?? []).map((m) => m.itemId)))];
    const woIds = [...new Set(lines.flatMap((l) => (l.workOrderId ? [l.workOrderId] : [])))];
    const [activities, items, workOrders, existing] = await Promise.all([
      tx.activity.findMany({
        where: { id: { in: activityIds }, projectId: dpr.projectId },
        select: { id: true, name: true, unit: true, pipeStage: true, workElementId: true, workElement: { select: { elementType: true, _count: { select: { pipeSegments: true } } } }, _count: { select: { subActivities: true } } },
      }),
      itemIds.length ? tx.item.findMany({ where: { id: { in: itemIds }, organizationId: user.organizationId }, select: { id: true } }) : [],
      woIds.length ? tx.workOrder.findMany({ where: { id: { in: woIds }, projectId: dpr.projectId }, select: { id: true } }) : [],
      tx.progressEntry.findMany({ where: { dailyReportId: dpr.id }, select: { id: true } }),
    ]);
    const activity = new Map(activities.map((a) => [a.id, a]));
    const itemOk = new Set(items.map((i) => i.id));
    const woOk = new Set(workOrders.map((w) => w.id));
    lines.forEach((l, i) => {
      const a = activity.get(l.activityId);
      if (!a) throw new BadRequestException(`Line ${i + 1}: the activity is not in this project`);
      if (a._count.subActivities) throw new BadRequestException(`Line ${i + 1}: ${a.name} is made of sub-activities; choose one of them`);
      if ((l.materials ?? []).some((m) => !itemOk.has(m.itemId))) throw new BadRequestException(`Line ${i + 1}: choose material from the store items`);
      if ((l.materials ?? []).some((m) => Number(m.quantity) < 0)) throw new BadRequestException(`Line ${i + 1}: material used cannot be less than 0`);
      if (l.workOrderId && !woOk.has(l.workOrderId)) throw new BadRequestException(`Line ${i + 1}: the work order is not one of this project's`);
    });
    await this.checkPipeLines(tx, dpr, lines, activity);
    const mine = new Set(existing.map((e) => e.id));
    const kept = new Set(lines.flatMap((l) => (l.id && mine.has(l.id) ? [l.id] : [])));
    const gone = existing.filter((e) => !kept.has(e.id)).map((e) => e.id);
    if (gone.length) await tx.progressEntry.deleteMany({ where: { id: { in: gone } } });
    const saved: { id: string; attachmentIds: string[] | undefined }[] = [];
    for (const [i, l] of lines.entries()) {
      const sector = await resolveSector(this.prisma, dpr.projectId, l);
      const labour = (l.labour ?? []).filter((m) => m.category?.trim() && m.count > 0);
      const machines = (l.machines ?? []).filter((m) => m.name?.trim());
      const data = {
        activityId: l.activityId,
        date: dpr.date,
        quantity: new Prisma.Decimal(l.quantity),
        remarks: l.remarks?.trim() || null,
        extra: Object.keys(extras[i] ?? {}).length ? (extras[i] as Prisma.InputJsonValue) : Prisma.DbNull,
        location: locationOr(l.location, sector) ?? null,
        chainageFrom: sector.chainageFrom ?? null,
        chainageTo: sector.chainageTo ?? null,
        floor: sector.floor ?? null,
        village: sector.village ?? null,
        labour: labour as unknown as Prisma.InputJsonValue,
        machines: machines as unknown as Prisma.InputJsonValue,
        manpowerCount: crewTotal(labour) || null,
        machineryUsed: machines.map((m) => m.name.trim()).join(', ') || null,
        workOrderId: l.workOrderId ?? null,
        pipeSegmentId: l.pipeSegmentId ?? null,
        pipeNodeId: l.pipeNodeId ?? null,
        sortOrder: i,
        status: dpr.status,
        submittedById: dpr.submittedById,
        submittedAt: dpr.submittedAt,
      };
      let entryId: string;
      if (l.id && kept.has(l.id)) {
        await tx.progressEntry.update({ where: { id: l.id }, data });
        await tx.progressMaterial.deleteMany({ where: { progressEntryId: l.id } });
        entryId = l.id;
      } else {
        // A line id from the phone is kept when it is new; one already used elsewhere starts a fresh entry.
        const taken = l.id ? await tx.progressEntry.findUnique({ where: { id: l.id }, select: { id: true } }) : null;
        const row = await tx.progressEntry.create({
          data: { ...data, ...(l.id && !taken ? { id: l.id } : {}), organizationId: user.organizationId, projectId: dpr.projectId, dailyReportId: dpr.id },
          select: { id: true },
        });
        entryId = row.id;
      }
      const materials = (l.materials ?? []).filter((m) => Number(m.quantity) > 0);
      if (materials.length)
        await tx.progressMaterial.createMany({
          data: materials.map((m, k) => ({ organizationId: user.organizationId, progressEntryId: entryId, itemId: m.itemId, quantity: new Prisma.Decimal(m.quantity), sortOrder: k })),
        });
      saved.push({ id: entryId, attachmentIds: l.attachmentIds });
    }
    return saved;
  }

  /** Each line's photos, after the lines are saved (a line sent with none listed keeps what it has). */
  private async linkLinePhotos(user: RequestUser, saved: { id: string; attachmentIds: string[] | undefined }[]) {
    for (const s of saved) await this.attachments.sync(user, 'progressEntryId', s.id, s.attachmentIds);
  }

  /**
   * The report's own-field values read against its form (item 134 part 2): wrong values are refused always, empty
   * required ones only when `required` (the report is going for approval).
   */
  private readExtra(def: DprFormDef, day: unknown, lines: { extra?: unknown }[], required: boolean) {
    const r = dprExtraProblems(def, { day, lines: lines.map((l) => l.extra) }, { required });
    if (r.problems.length) throw new BadRequestException(r.problems.join('. '));
    return r;
  }

  /** What the form requires, checked when a report goes for approval: its required fields and the photos it needs. */
  private async assertRequired(organizationId: string, def: DprFormDef, filled: Parameters<typeof dprRequiredProblems>[1]) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { progressFromDpr: true } });
    const problems = dprRequiredProblems(def, filled, { progressFromDpr: org.progressFromDpr });
    if (problems.length) throw new BadRequestException(problems.join('. '));
  }

  /** A stored report against its own form, before it goes for approval. */
  private async assertComplete(organizationId: string, r: DailyReportDto) {
    const def = r.form!.def;
    const lines = r.lines ?? [];
    this.readExtra(def, r.extra, lines, true);
    await this.assertRequired(organizationId, def, {
      weather: r.weather,
      siteCondition: r.siteCondition,
      lines: lines.length,
      manpower: r.totalManpower,
      machinery: r.machinery.length,
      materialReceived: r.materialReceived,
      testsConducted: r.testsConducted,
      safetyObservations: r.safetyObservations,
      issues: r.issues,
      nextDayPlan: r.nextDayPlan,
      photos: r.attachments.length + lines.reduce((n, l) => n + l.attachments.length, 0),
    });
  }

  /**
   * Lines on a pipe zone's stages (item 126): once the zone has its network, each names the segment worked on (a valve
   * or fitting for VALVES) of that zone, and the metres a stage holds on a segment never pass its length.
   */
  private async checkPipeLines(
    tx: Tx,
    dpr: { id: string; projectId: string },
    lines: DprLineInputDto[],
    activity: Map<string, { name: string; unit: string; pipeStage: PipeStage | null; workElementId: string | null; workElement: { elementType: Parameters<typeof activityPipeStage>[0]['elementType']; _count: { pipeSegments: number } } | null }>,
  ) {
    const segIds = [...new Set(lines.flatMap((l) => (l.pipeSegmentId ? [l.pipeSegmentId] : [])))];
    const nodeIds = [...new Set(lines.flatMap((l) => (l.pipeNodeId ? [l.pipeNodeId] : [])))];
    const [segments, nodes, held] = await Promise.all([
      segIds.length ? tx.pipeSegment.findMany({ where: { id: { in: segIds }, projectId: dpr.projectId }, select: { id: true, zoneId: true, code: true, lengthM: true, scope: true, fromNodeId: true, toNodeId: true } }) : [],
      nodeIds.length ? tx.pipeNode.findMany({ where: { id: { in: nodeIds }, projectId: dpr.projectId }, select: { id: true, zoneId: true, code: true, kind: true } }) : [],
      heldOnSegments(tx, segIds, dpr.id),
    ]);
    const segOf = new Map(segments.map((sg) => [sg.id, sg]));
    const nodeOf = new Map(nodes.map((n) => [n.id, n]));
    const adding = new Map<string, number>();
    lines.forEach((l, i) => {
      const n = i + 1;
      const a = activity.get(l.activityId)!;
      const stage = activityPipeStage({ pipeStage: a.pipeStage, name: a.name, elementType: a.workElement?.elementType });
      const seg = l.pipeSegmentId ? segOf.get(l.pipeSegmentId) : null;
      const node = l.pipeNodeId ? nodeOf.get(l.pipeNodeId) : null;
      if (l.pipeSegmentId && !seg) throw new BadRequestException(`Line ${n}: the pipe segment is not one of this project's`);
      if (l.pipeNodeId && !node) throw new BadRequestException(`Line ${n}: the valve or junction is not one of this project's`);
      if (!stage) {
        if (seg || node) throw new BadRequestException(`Line ${n}: ${a.name} is not a stage of pipe work; leave the segment out`);
        return;
      }
      if (stage === 'VALVES') {
        if (seg) throw new BadRequestException(`Line ${n}: a valve line names the valve, not a segment`);
        if (node && (node.zoneId !== a.workElementId || !VALVE_NODE_KINDS.includes(node.kind))) throw new BadRequestException(`Line ${n}: choose a valve or chamber of this zone`);
        return;
      }
      if (!seg) {
        if (a.workElement?._count.pipeSegments) throw new BadRequestException(`Line ${n}: choose the pipe segment the work was on`);
        return;
      }
      if (seg.zoneId !== a.workElementId) throw new BadRequestException(`Line ${n}: ${seg.code} is not in the zone of ${a.name}`);
      if (seg.scope !== 'PROPOSED') throw new BadRequestException(`Line ${n}: ${seg.code} is an existing line and takes no work`);
      if (node && node.id !== seg.fromNodeId && node.id !== seg.toNodeId) throw new BadRequestException(`Line ${n}: the work starts from an end of ${seg.code}`);
      if (!isLengthUnit(a.unit)) return;
      const key = `${seg.id}|${l.activityId}`;
      const before = (held.get(key) ?? 0) + (adding.get(key) ?? 0);
      const problem = segmentCapProblem({ code: seg.code, lengthM: Number(seg.lengthM) }, stage as SegmentStage, before, Number(l.quantity), n);
      if (problem) throw new BadRequestException(problem);
      adding.set(key, (adding.get(key) ?? 0) + Number(l.quantity));
    });
  }

  /** "Work executed" written from the report's lines. */
  private async summaryOf(tx: Tx | PrismaService, id: string): Promise<string> {
    const rows = await tx.progressEntry.findMany({
      where: { dailyReportId: id },
      select: { quantity: true, location: true, activity: { select: { name: true, unit: true, parentActivity: { select: { name: true } } } }, pipeSegment: SEGMENT, pipeNode: { select: { code: true } } },
      orderBy: { sortOrder: 'asc' },
    });
    return workSummary(
      rows.map((r) => ({
        activityName: r.activity.name,
        parentActivityName: r.activity.parentActivity?.name ?? null,
        quantity: r.quantity.toString(),
        unit: r.activity.unit,
        location: lineLocation({
          location: r.location,
          chainageFrom: null,
          chainageTo: null,
          floor: null,
          village: null,
          segmentLabel: r.pipeSegment ? segmentLabel({ code: r.pipeSegment.code, fromCode: r.pipeSegment.fromNode.code, toCode: r.pipeSegment.toNode.code }) : null,
          nodeCode: r.pipeNode?.code ?? null,
        }),
      })),
    );
  }

  /** The form a new report on the project is made on (item 134 part 2): its type's latest. */
  async formFor(user: RequestUser, projectId: string) {
    await this.access.assertCanAccessProject(user, projectId);
    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { type: true, typeCode: true } });
    return this.forms.forProject(user.organizationId, project);
  }

  /** One DPR per project per day (a rejected one may be replaced). */
  private async assertNoDuplicate(projectId: string, date: Date, excludeId?: string) {
    const dup = await this.prisma.dailyReport.findFirst({
      where: { projectId, date, status: { not: 'REJECTED' }, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true, status: true },
    });
    if (dup) throw new ConflictException(`A DPR for ${dateOnly(date)} already exists for this project (status ${dup.status}). Edit it instead of creating another.`);
  }

  /** Idempotent create: a DPR that already exists under the client-supplied id is returned as is. */
  private async findExisting(user: RequestUser, id: string | undefined) {
    if (!id) return null;
    const row = await this.prisma.dailyReport.findFirst({ where: { id, organizationId: user.organizationId }, select: { id: true } });
    return row ? this.get(user, row.id) : null;
  }

  async create(user: RequestUser, dto: CreateDprDto): Promise<DailyReportDto> {
    const existing = await this.findExisting(user, dto.id);
    if (existing) return existing;
    await this.access.assertCanAccessProject(user, dto.projectId);
    assertNotAfterToday(dto.date, 'DPR');
    await this.assertNoDuplicate(dto.projectId, parseDate(dto.date));
    // No manpower sent: take it from the day's attendance sheet, if the supervisor recorded one.
    const manpower = dto.manpower?.length ? dto.manpower : ((await this.attendance.manpowerFor(dto.projectId, parseDate(dto.date))) ?? []);
    const text = dto.workExecuted?.trim() ?? '';
    if (!text && !dto.lines?.length) throw new BadRequestException('Say what work was done today, or add a work line');
    // The form of the project's type (item 134 part 2), checked before anything is written: a retry of the same
    // client id returns the draft without sending it again.
    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: dto.projectId }, select: { type: true, typeCode: true } });
    const form = await this.forms.chosen(user.organizationId, project, dto.formId);
    const submitting = dto.submit !== false;
    const lines = dto.lines ?? [];
    const extra = this.readExtra(form.def, dto.extra, lines, submitting);
    if (submitting)
      await this.assertRequired(user.organizationId, form.def, {
        weather: dto.weather,
        siteCondition: dto.siteCondition,
        lines: lines.length,
        manpower: manpowerTotal(manpower),
        machinery: (dto.machinery ?? []).length,
        materialReceived: dto.materialReceived,
        testsConducted: dto.testsConducted,
        safetyObservations: dto.safetyObservations,
        issues: dto.issues,
        nextDayPlan: dto.nextDayPlan,
        photos: (dto.attachmentIds?.length ?? 0) + lines.reduce((n, l) => n + (l.attachmentIds?.length ?? 0), 0),
      });
    let row: { id: string };
    let saved: { id: string; attachmentIds: string[] | undefined }[] = [];
    try {
      row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.dailyReport.create({
          data: {
            id: dto.id,
            organizationId: user.organizationId,
            projectId: dto.projectId,
            date: parseDate(dto.date),
            weather: dto.weather ?? null,
            siteCondition: dto.siteCondition ?? null,
            manpower: manpower as unknown as Prisma.InputJsonValue,
            machinery: (dto.machinery ?? []) as unknown as Prisma.InputJsonValue,
            materialReceived: dto.materialReceived ?? null,
            workExecuted: text,
            testsConducted: dto.testsConducted ?? null,
            safetyObservations: dto.safetyObservations ?? null,
            issues: dto.issues ?? null,
            nextDayPlan: dto.nextDayPlan ?? null,
            dprFormConfigId: form.id,
            extra: extra.day as Prisma.InputJsonValue,
            submittedById: user.id,
            status: 'DRAFT',
          },
          select: { id: true, projectId: true, date: true, status: true, submittedById: true, submittedAt: true },
        });
        if (lines.length) {
          saved = await this.saveLines(tx, user, created, lines, extra.lines);
          if (!text) await tx.dailyReport.update({ where: { id: created.id }, data: { workExecuted: await this.summaryOf(tx, created.id) } });
        }
        return created;
      });
    } catch (e) {
      if (isUniqueViolation(e) && dto.id) {
        const winner = await this.findExisting(user, dto.id);
        if (winner) return winner;
      }
      throw e;
    }
    await this.attachments.link(user, 'dailyReportId', row.id, dto.attachmentIds);
    await this.linkLinePhotos(user, saved);
    await this.audit.log(user, 'DPR', row.id, 'CREATED');
    if (submitting) await this.lifecycle.submit(user, 'DPR', row.id);
    return this.get(user, row.id);
  }

  async update(user: RequestUser, id: string, dto: UpdateDprDto): Promise<DailyReportDto> {
    const row = await this.lifecycle.load(user, 'DPR', id);
    await this.lifecycle.assertEditable(user, row);
    const current = await this.prisma.dailyReport.findUniqueOrThrow({
      where: { id },
      select: { date: true, workExecuted: true, submittedAt: true, dprFormConfigId: true, project: { select: { type: true, typeCode: true } } },
    });
    // An edited report keeps the form it was made on.
    const form = await this.forms.ofReport(user.organizationId, current.dprFormConfigId, current.project);
    const extra = this.readExtra(form.def, dto.extra, dto.lines ?? [], false);
    const data: Prisma.DailyReportUncheckedUpdateInput = {};
    if (dto.extra !== undefined) data.extra = extra.day as Prisma.InputJsonValue;
    if (dto.date !== undefined) {
      assertNotAfterToday(dto.date, 'DPR');
      await this.assertNoDuplicate(row.projectId, parseDate(dto.date), id);
      data.date = parseDate(dto.date);
    }
    if (dto.weather !== undefined) data.weather = dto.weather;
    if (dto.siteCondition !== undefined) data.siteCondition = dto.siteCondition;
    if (dto.manpower !== undefined) data.manpower = dto.manpower as unknown as Prisma.InputJsonValue;
    if (dto.machinery !== undefined) data.machinery = dto.machinery as unknown as Prisma.InputJsonValue;
    if (dto.materialReceived !== undefined) data.materialReceived = dto.materialReceived;
    if (dto.workExecuted !== undefined) data.workExecuted = dto.workExecuted.trim();
    if (dto.testsConducted !== undefined) data.testsConducted = dto.testsConducted;
    if (dto.safetyObservations !== undefined) data.safetyObservations = dto.safetyObservations;
    if (dto.issues !== undefined) data.issues = dto.issues;
    if (dto.nextDayPlan !== undefined) data.nextDayPlan = dto.nextDayPlan;
    let saved: { id: string; attachmentIds: string[] | undefined }[] = [];
    await this.prisma.$transaction(async (tx) => {
      // Text written from the lines is written again when they change; text of the user's own stays.
      const before = await this.summaryOf(tx, id);
      const auto = data.workExecuted === undefined ? current.workExecuted === before : data.workExecuted === '' || data.workExecuted === before;
      await tx.dailyReport.update({ where: { id }, data });
      const date = (data.date as Date | undefined) ?? current.date;
      if (dto.lines !== undefined)
        saved = await this.saveLines(tx, user, { id, projectId: row.projectId, date, status: row.status, submittedById: row.submittedById, submittedAt: current.submittedAt }, dto.lines, extra.lines);
      else if (data.date) await tx.progressEntry.updateMany({ where: { dailyReportId: id }, data: { date } });
      const lines = await tx.progressEntry.count({ where: { dailyReportId: id } });
      if (auto && lines) await tx.dailyReport.update({ where: { id }, data: { workExecuted: await this.summaryOf(tx, id) } });
      else if (!lines && !((data.workExecuted as string | undefined) ?? current.workExecuted).trim())
        throw new BadRequestException('Say what work was done today, or add a work line');
    });
    await this.attachments.sync(user, 'dailyReportId', id, dto.attachmentIds);
    await this.linkLinePhotos(user, saved);
    await this.audit.log(user, 'DPR', id, 'UPDATED');
    if (dto.submit) await this.submit(user, id);
    return this.get(user, id);
  }

  /**
   * (Re)submit for approval: the report must have what its form requires. A rejected DPR may have been replaced by a
   * newer one for the same day, so re-check.
   */
  async submit(user: RequestUser, id: string) {
    const current = await this.get(user, id);
    await this.assertComplete(user.organizationId, current);
    if (current.status === 'REJECTED') await this.assertNoDuplicate(current.projectId, parseDate(current.date), id);
    await this.lifecycle.submit(user, 'DPR', id);
    return this.get(user, id);
  }

  async remove(user: RequestUser, id: string) {
    const row = await this.lifecycle.load(user, 'DPR', id);
    await this.lifecycle.assertEditable(user, row);
    await this.prisma.dailyReport.delete({ where: { id } });
    await this.audit.log(user, 'DPR', id, 'DELETED');
    return { ok: true };
  }
}
