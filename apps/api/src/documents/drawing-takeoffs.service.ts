import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  TAKEOFF_KIND_LABELS,
  TAKEOFF_UNITS,
  canEditMarkup,
  canEditProjects,
  roundPoint,
  scaleFrom,
  scaleProblem,
  takeoffBoqQty,
  takeoffProblem,
  takeoffValue,
  type DrawingScaleDto,
  type DrawingTakeoffDto,
  type DrawingTakeoffsDto,
  type MarkupPoint,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { iso } from '../common/serialize';
import { isUniqueViolation } from '../common/idempotency';
import { PlanningService } from '../planning/planning.service';
import { CreateTakeoffDto, SetDrawingScaleDto, TakeoffsToBoqDto, TakeoffsToMeasurementDto, UpdateTakeoffDto } from './documents.dto';

const takeoffInclude = {
  revision: { select: { revision: true } },
  createdBy: { select: { fullName: true } },
  measurement: { select: { mbNo: true } },
} satisfies Prisma.DrawingTakeoffInclude;
type TakeoffRow = Prisma.DrawingTakeoffGetPayload<{ include: typeof takeoffInclude }>;
type ScaleRow = Prisma.DrawingScaleGetPayload<{ include: { setBy: { select: { fullName: true } } } }>;

/** Metres per page height of a stored scale. */
const metresPerPage = (s: { points: unknown; lengthM: Prisma.Decimal; aspect: number }) => scaleFrom(s.points as [MarkupPoint, MarkupPoint], Number(s.lengthM), s.aspect);

/**
 * Measuring on drawings: each page of a drawing file may have a scale (two points a known distance apart),
 * and lengths, areas and counts are taken off it, numbered T1, T2… per document. Anyone who can open the document
 * measures and sets the scale; whoever made a measure, and document control, rename or delete it. A new scale works the
 * page's lengths and areas out again. Scales and measures are on the document's history.
 */
@Injectable()
export class DrawingTakeoffsService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private planning: PlanningService,
  ) {}

  private async loadDocument(user: RequestUser, id: string) {
    const doc = await this.prisma.document.findFirst({ where: { id, ...this.access.submissionWhere(user) }, select: { id: true, projectId: true, docNo: true } });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  /** A file of one of the document's revisions. */
  private async loadFile(documentId: string, attachmentId: string, revisionId?: string) {
    const file = await this.prisma.attachment.findFirst({ where: { id: attachmentId, ...(revisionId ? { revisionId } : {}), revision: { documentId } }, select: { id: true, revisionId: true } });
    if (!file) throw new BadRequestException("That file is not on this drawing's revision; open the drawing again");
    return file;
  }

  private scaleDto(s: ScaleRow): DrawingScaleDto {
    return {
      attachmentId: s.attachmentId,
      page: s.page,
      points: s.points as unknown as [MarkupPoint, MarkupPoint],
      lengthM: s.lengthM.toFixed(3),
      metresPerPage: metresPerPage(s) ?? 0,
      aspect: s.aspect,
      setByName: s.setBy.fullName,
      updatedAt: iso(s.updatedAt)!,
    };
  }

  private toDto(t: TakeoffRow): DrawingTakeoffDto {
    return {
      id: t.id,
      documentId: t.documentId,
      takeoffNo: t.takeoffNo,
      revisionId: t.revisionId,
      revision: t.revision.revision,
      attachmentId: t.attachmentId,
      page: t.page,
      kind: t.kind,
      points: t.points as unknown as MarkupPoint[],
      label: t.label,
      value: t.value.toFixed(3),
      measurementId: t.measurementId,
      mbNo: t.measurement?.mbNo ?? null,
      createdById: t.createdById,
      createdByName: t.createdBy.fullName,
      createdAt: iso(t.createdAt)!,
    };
  }

  /** Every scale and measure on the document's files, measures by number. */
  async list(user: RequestUser, documentId: string): Promise<DrawingTakeoffsDto> {
    await this.loadDocument(user, documentId);
    const [scales, takeoffs] = await Promise.all([
      this.prisma.drawingScale.findMany({ where: { documentId, organizationId: user.organizationId }, include: { setBy: { select: { fullName: true } } }, orderBy: { createdAt: 'asc' } }),
      this.prisma.drawingTakeoff.findMany({ where: { documentId, organizationId: user.organizationId }, include: takeoffInclude, orderBy: { takeoffNo: 'asc' } }),
    ]);
    return { scales: scales.map((s) => this.scaleDto(s)), takeoffs: takeoffs.map((t) => this.toDto(t)) };
  }

  /** Sets a page's scale and works out its lengths and areas again. */
  async setScale(user: RequestUser, documentId: string, dto: SetDrawingScaleDto): Promise<DrawingTakeoffsDto> {
    const doc = await this.loadDocument(user, documentId);
    await this.loadFile(documentId, dto.attachmentId);
    const problem = scaleProblem(dto.points, dto.lengthM, dto.aspect);
    if (problem) throw new BadRequestException(problem);
    const page = dto.page ?? 1;
    const points = (dto.points as MarkupPoint[]).map(roundPoint);
    const scale = scaleFrom(points as [MarkupPoint, MarkupPoint], dto.lengthM, dto.aspect)!;
    const lengthM = new Prisma.Decimal(dto.lengthM).toDecimalPlaces(3);
    const measures = await this.prisma.drawingTakeoff.findMany({ where: { attachmentId: dto.attachmentId, page, kind: { not: 'COUNT' } }, select: { id: true, kind: true, points: true } });
    await this.prisma.$transaction([
      this.prisma.drawingScale.upsert({
        where: { attachmentId_page: { attachmentId: dto.attachmentId, page } },
        create: { organizationId: user.organizationId, documentId, attachmentId: dto.attachmentId, page, points: points as unknown as Prisma.InputJsonValue, lengthM, aspect: dto.aspect, setById: user.id },
        update: { points: points as unknown as Prisma.InputJsonValue, lengthM, aspect: dto.aspect, setById: user.id },
      }),
      ...measures.map((m) => this.prisma.drawingTakeoff.update({ where: { id: m.id }, data: { value: takeoffValue(m.kind, m.points as unknown as MarkupPoint[], dto.aspect, scale)! } })),
    ]);
    await this.audit.log(user, 'DOCUMENT', doc.id, 'SCALE_SET', `Scale set on page ${page}: ${lengthM.toFixed(3)} m between two points${measures.length ? `; ${measures.length} measure${measures.length === 1 ? '' : 's'} worked out again` : ''}`);
    return this.list(user, documentId);
  }

  async create(user: RequestUser, documentId: string, dto: CreateTakeoffDto): Promise<DrawingTakeoffsDto> {
    const doc = await this.loadDocument(user, documentId);
    if (dto.id && (await this.prisma.drawingTakeoff.findFirst({ where: { id: dto.id, organizationId: user.organizationId }, select: { id: true } }))) return this.list(user, documentId);
    await this.loadFile(documentId, dto.attachmentId, dto.revisionId);
    const page = dto.page ?? 1;
    const scale = await this.prisma.drawingScale.findUnique({ where: { attachmentId_page: { attachmentId: dto.attachmentId, page } } });
    const problem = takeoffProblem(dto.kind, dto.points, dto.label, !!scale);
    if (problem) throw new BadRequestException(problem);
    const points = (dto.points as MarkupPoint[]).map(roundPoint);
    const value = takeoffValue(dto.kind, points, scale?.aspect ?? 1, scale ? metresPerPage(scale) : null)!;
    // Numbers are per document; two people measuring at once retry on the clash.
    for (let attempt = 0; ; attempt++) {
      const last = await this.prisma.drawingTakeoff.aggregate({ where: { documentId }, _max: { takeoffNo: true } });
      try {
        const row = await this.prisma.drawingTakeoff.create({
          data: {
            ...(dto.id ? { id: dto.id } : {}),
            organizationId: user.organizationId,
            projectId: doc.projectId,
            documentId,
            takeoffNo: (last._max.takeoffNo ?? 0) + 1,
            revisionId: dto.revisionId,
            attachmentId: dto.attachmentId,
            page,
            kind: dto.kind,
            points: points as unknown as Prisma.InputJsonValue,
            label: dto.label.trim(),
            value,
            createdById: user.id,
          },
          select: { takeoffNo: true },
        });
        await this.audit.log(user, 'DOCUMENT', documentId, 'TAKEOFF_ADDED', `T${row.takeoffNo} ${TAKEOFF_KIND_LABELS[dto.kind].toLowerCase()} ${value} ${TAKEOFF_UNITS[dto.kind]}: ${dto.label.trim()}`);
        return this.list(user, documentId);
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
        if (dto.id && (await this.prisma.drawingTakeoff.findFirst({ where: { id: dto.id, organizationId: user.organizationId }, select: { id: true } }))) return this.list(user, documentId);
        if (attempt >= 4) throw new BadRequestException('Others are measuring this drawing right now; save again');
      }
    }
  }

  private async loadTakeoff(user: RequestUser, documentId: string, id: string) {
    await this.loadDocument(user, documentId);
    const row = await this.prisma.drawingTakeoff.findFirst({ where: { id, documentId, organizationId: user.organizationId } });
    if (!row) throw new NotFoundException('Measure not found on this drawing');
    if (!canEditMarkup(user.roleKey, row.createdById === user.id)) throw new ForbiddenException('Only whoever measured it, or document control, can change it');
    return row;
  }

  async rename(user: RequestUser, documentId: string, id: string, dto: UpdateTakeoffDto): Promise<DrawingTakeoffsDto> {
    const cur = await this.loadTakeoff(user, documentId, id);
    const problem = takeoffProblem(cur.kind, cur.points, dto.label, true);
    if (problem) throw new BadRequestException(problem);
    await this.prisma.drawingTakeoff.update({ where: { id }, data: { label: dto.label.trim() } });
    return this.list(user, documentId);
  }

  async remove(user: RequestUser, documentId: string, id: string): Promise<DrawingTakeoffsDto> {
    const cur = await this.loadTakeoff(user, documentId, id);
    await this.prisma.drawingTakeoff.delete({ where: { id } });
    await this.audit.log(user, 'DOCUMENT', documentId, 'TAKEOFF_DELETED', `T${cur.takeoffNo}: ${cur.label}`);
    return this.list(user, documentId);
  }

  /** Records the measurement sheet the measures were put in, once that sheet is saved (the sheet keeps its own lines). */
  async toMeasurement(user: RequestUser, documentId: string, dto: TakeoffsToMeasurementDto): Promise<DrawingTakeoffsDto> {
    const doc = await this.loadDocument(user, documentId);
    const sheet = await this.prisma.measurementSheet.findFirst({ where: { id: dto.measurementId, projectId: doc.projectId, ...this.access.submissionWhere(user) }, select: { id: true, mbNo: true } });
    if (!sheet) throw new BadRequestException('That measurement is not on this drawing’s project');
    const { count } = await this.prisma.drawingTakeoff.updateMany({ where: { id: { in: dto.ids }, documentId, organizationId: user.organizationId }, data: { measurementId: sheet.id } });
    if (count) await this.audit.log(user, 'DOCUMENT', documentId, 'TAKEOFF_MEASURED', `${count} measure${count === 1 ? '' : 's'} put in ${sheet.mbNo}`);
    return this.list(user, documentId);
  }

  /**
   * Sets a BOQ item's original or revised quantity to the measures' total (times a factor), through the BOQ's own update,
   * so its rules hold (an extra item's quantity comes from a variation). For those who keep the BOQ.
   */
  async toBoq(user: RequestUser, documentId: string, dto: TakeoffsToBoqDto): Promise<DrawingTakeoffsDto> {
    if (!canEditProjects(user.roleKey)) throw new ForbiddenException('Only those who keep the BOQ (project managers and quantity surveyors) set its quantities');
    const doc = await this.loadDocument(user, documentId);
    const measures = await this.prisma.drawingTakeoff.findMany({ where: { id: { in: dto.ids }, documentId, organizationId: user.organizationId }, select: { takeoffNo: true, kind: true, value: true }, orderBy: { takeoffNo: 'asc' } });
    if (measures.length !== new Set(dto.ids).size) throw new BadRequestException('Some of those measures are no longer on this drawing; open it again');
    const factor = dto.factor ?? 1;
    const got = takeoffBoqQty(measures.map((m) => ({ kind: m.kind, value: m.value.toString() })), factor);
    if ('problem' in got) throw new BadRequestException(got.problem);
    const item = await this.prisma.boqItem.findFirst({ where: { id: dto.boqItemId, projectId: doc.projectId }, select: { id: true, itemNo: true } });
    if (!item) throw new BadRequestException('That BOQ item is not on this drawing’s project');
    const qty = got.qty.toFixed(3);
    await this.planning.updateBoq(user, doc.projectId, item.id, dto.field === 'ORIGINAL' ? { originalQty: qty } : { revisedQty: qty });
    const which = `${measures.map((m) => `T${m.takeoffNo}`).join(', ')}${factor !== 1 ? ` × ${factor}` : ''}`;
    const field = dto.field === 'ORIGINAL' ? 'original' : 'revised';
    await this.audit.log(user, 'BOQ_ITEM', item.id, 'QTY_FROM_DRAWING', `${field} quantity ${qty} from ${doc.docNo} ${which}`);
    await this.audit.log(user, 'DOCUMENT', documentId, 'TAKEOFF_TO_BOQ', `${which} = ${qty} set as BOQ item ${item.itemNo}'s ${field} quantity`);
    return this.list(user, documentId);
  }
}
