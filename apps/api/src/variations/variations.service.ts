import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  canManageVariations,
  canViewVariations,
  variationLabel,
  VARIATION_STATUS_LABELS,
  type Paginated,
  type VariationDto,
  type VariationSummaryDto,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { AuditService } from '../common/audit.service';
import { AttachmentsService, ATTACHMENT_FIELDS } from '../common/attachments.service';
import { ProjectAccessService } from '../common/project-access.service';
import { isUniqueViolation } from '../common/idempotency';
import { ilike, pageArgs, paginated, searchWords } from '../common/paging';
import { dateOnly, dec, iso, money, parseDate } from '../common/serialize';
import { CreateVariationDto, DecideVariationDto, ListVariationsQuery, SubmitVariationDto, UpdateVariationDto, VariationLineInput, VariationSummaryQuery } from './variations.dto';
import { todayIn } from '../notifications/time';

const D = (v: string | number | Prisma.Decimal) => new Prisma.Decimal(v);
const ZERO = D(0);
const round2 = (v: Prisma.Decimal) => v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

const include = {
  project: { select: { code: true, name: true } },
  createdBy: { select: { fullName: true } },
  lines: { orderBy: { sortOrder: 'asc' } },
  attachments: { select: ATTACHMENT_FIELDS },
} satisfies Prisma.VariationInclude;
type Row = Prisma.VariationGetPayload<{ include: typeof include }>;

/** A BOQ item with no quantity yet: an extra item the client has not approved. */
const unapprovedExtra = (b: { originalQty: Prisma.Decimal; revisedQty: Prisma.Decimal | null }) => (b.revisedQty ?? b.originalQty).isZero();

// Both filters are written out positively: NOT over a nullable column would drop the NULL rows in SQL.
/** BOQ items that have a quantity and so can be billed (an extra item gets one when its variation is approved). */
export const BILLABLE_BOQ_ITEM: Prisma.BoqItemWhereInput = { OR: [{ revisedQty: { gt: 0 } }, { revisedQty: null, originalQty: { gt: 0 } }] };
/** Extra items: no BOQ quantity until the client approves a variation for them. */
export const UNAPPROVED_EXTRA_ITEM: Prisma.BoqItemWhereInput = { OR: [{ revisedQty: 0 }, { revisedQty: null, originalQty: 0 }] };

/**
 * Variation register. A variation lists quantity changes on BOQ items and new (extra) items with their
 * rates. It goes to the client, and only the client's approval changes the BOQ (revised quantity, new items) and
 * the revised contract value. RA bills hold back extra items until then.
 */
@Injectable()
export class VariationsService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private attachments: AttachmentsService,
  ) {}

  private assertCanView(user: RequestUser) {
    if (!canViewVariations(user.roleKey)) throw new ForbiddenException('Your role cannot see variations');
  }

  private assertCanManage(user: RequestUser) {
    if (!canManageVariations(user.roleKey)) throw new ForbiddenException('Only admin, management, project managers and quantity surveyors handle variations');
  }

  private toDto(r: Row): VariationDto {
    return {
      id: r.id,
      projectId: r.projectId,
      projectCode: r.project.code,
      projectName: r.project.name,
      varNo: r.varNo,
      label: variationLabel(r.varNo),
      title: r.title,
      cause: r.cause,
      description: r.description,
      status: r.status,
      claimedAmount: money(r.claimedAmount)!,
      approvedAmount: money(r.approvedAmount),
      submittedDate: dateOnly(r.submittedDate),
      submittedRef: r.submittedRef,
      decidedDate: dateOnly(r.decidedDate),
      clientRef: r.clientRef,
      decisionNote: r.decisionNote,
      createdByName: r.createdBy.fullName,
      createdAt: iso(r.createdAt)!,
      updatedAt: iso(r.updatedAt)!,
      lines: r.lines.map((l) => ({
        id: l.id,
        boqItemId: l.boqItemId,
        isNewItem: l.isNewItem,
        itemNo: l.itemNo,
        description: l.description,
        unit: l.unit,
        qty: dec(l.qty)!,
        rate: money(l.rate)!,
        amount: money(round2(l.qty.mul(l.rate)))!,
        approvedQty: dec(l.approvedQty),
        approvedRate: money(l.approvedRate),
        approvedAmount: l.approvedQty !== null ? money(round2(l.approvedQty.mul(l.approvedRate ?? l.rate))) : null,
      })),
      attachments: r.attachments.map((a) => this.attachments.toDto(a)),
    };
  }

  private async load(user: RequestUser, id: string): Promise<Row> {
    const row = await this.prisma.variation.findFirst({ where: { id, organizationId: user.organizationId, project: this.access.projectWhere(user) }, include });
    if (!row) throw new NotFoundException('Variation not found');
    return row;
  }

  async list(user: RequestUser, q: ListVariationsQuery): Promise<Paginated<VariationDto>> {
    this.assertCanView(user);
    const where: Prisma.VariationWhereInput = { organizationId: user.organizationId, project: this.access.projectWhere(user) };
    if (q.projectId) where.projectId = q.projectId;
    if (q.status) where.status = q.status;
    const words = searchWords(q.q);
    if (words.length) {
      where.AND = words.map((w) => ({ OR: [{ title: ilike(w) }, { lines: { some: { OR: [{ description: ilike(w) }, { itemNo: ilike(w) }] } } }] }));
    }
    const sortBy = q.sortBy ?? 'createdAt';
    const order = q.sortOrder ?? (sortBy === 'varNo' ? 'asc' : 'desc');
    const args = pageArgs(q);
    const [rows, total] = await Promise.all([
      this.prisma.variation.findMany({ where, include, orderBy: [{ [sortBy]: order }, { id: 'asc' }], skip: args.skip, take: args.take }),
      this.prisma.variation.count({ where }),
    ]);
    return paginated(rows.map((r) => this.toDto(r)), total, args);
  }

  async get(user: RequestUser, id: string): Promise<VariationDto> {
    this.assertCanView(user);
    return this.toDto(await this.load(user, id));
  }

  /** Contract value, approved and pending variations and the revised contract value, per visible project. */
  async summary(user: RequestUser, q: VariationSummaryQuery): Promise<VariationSummaryDto[]> {
    this.assertCanView(user);
    const projects = await this.prisma.project.findMany({
      where: { ...this.access.projectWhere(user), ...(q.projectId ? { id: q.projectId } : {}) },
      select: { id: true, code: true, name: true, contractValue: true },
      orderBy: { code: 'asc' },
    });
    const ids = projects.map((p) => p.id);
    const [variations, extras] = await Promise.all([
      this.prisma.variation.findMany({ where: { projectId: { in: ids } }, select: { projectId: true, status: true, claimedAmount: true, approvedAmount: true } }),
      this.prisma.boqItem.groupBy({ by: ['projectId'], where: { projectId: { in: ids }, ...UNAPPROVED_EXTRA_ITEM }, _count: true }),
    ]);
    const extraCount = new Map(extras.map((e) => [e.projectId, e._count]));
    return projects.map((p) => {
      const mine = variations.filter((v) => v.projectId === p.id);
      const approved = mine.filter((v) => v.status === 'APPROVED').reduce((s, v) => s.add(v.approvedAmount ?? ZERO), ZERO);
      const pending = mine.filter((v) => v.status === 'DRAFT' || v.status === 'SUBMITTED').reduce((s, v) => s.add(v.claimedAmount), ZERO);
      return {
        projectId: p.id,
        projectCode: p.code,
        projectName: p.name,
        contractValue: money(p.contractValue),
        approved: money(approved)!,
        pending: money(pending)!,
        revisedContractValue: p.contractValue ? money(p.contractValue.add(approved)) : null,
        count: mine.length,
        unapprovedExtraItems: extraCount.get(p.id) ?? 0,
      };
    });
  }

  /** Check the lines against the project's BOQ and turn them into rows (without the variation id). */
  private async buildLines(projectId: string, organizationId: string, input: VariationLineInput[]) {
    const ids = input.map((l) => l.boqItemId).filter((x): x is string => !!x);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('A BOQ item can only appear once in a variation');
    const newNos = input.filter((l) => !l.boqItemId).map((l) => l.itemNo!.toLowerCase());
    if (new Set(newNos).size !== newNos.length) throw new BadRequestException('Two new items have the same item number');
    const boq = await this.prisma.boqItem.findMany({ where: { projectId }, select: { id: true, itemNo: true, description: true, unit: true, rate: true, originalQty: true, revisedQty: true } });
    const byId = new Map(boq.map((b) => [b.id, b]));
    const taken = new Set(boq.map((b) => b.itemNo.toLowerCase()));
    let claimed = ZERO;
    const rows = input.map((l, i) => {
      const qty = D(l.qty);
      if (qty.isZero()) throw new BadRequestException(`Line ${i + 1}: the quantity cannot be 0`);
      if (l.rate !== undefined && D(l.rate).lt(0)) throw new BadRequestException(`Line ${i + 1}: the rate cannot be negative`);
      let row: Omit<Prisma.VariationLineUncheckedCreateInput, 'variationId'>;
      if (l.boqItemId) {
        const b = byId.get(l.boqItemId);
        if (!b) throw new BadRequestException(`Line ${i + 1}: BOQ item not found on this project`);
        const extra = unapprovedExtra(b);
        const current = b.revisedQty ?? b.originalQty;
        if (current.add(qty).lt(0)) throw new BadRequestException(`Item ${b.itemNo}: the quantity cannot go below 0 (it is ${current})`);
        if (extra && qty.lt(0)) throw new BadRequestException(`Item ${b.itemNo} is an extra item: give the quantity the client should approve`);
        const rate = extra && l.rate !== undefined ? D(l.rate) : b.rate;
        row = { organizationId, boqItemId: b.id, isNewItem: extra, itemNo: b.itemNo, description: b.description, unit: b.unit, qty, rate, sortOrder: i };
      } else {
        if (taken.has(l.itemNo!.toLowerCase())) throw new BadRequestException(`Item ${l.itemNo} is already in the BOQ: pick it from the list instead`);
        if (qty.lt(0)) throw new BadRequestException(`New item ${l.itemNo}: the quantity must be more than 0`);
        if (l.rate === undefined) throw new BadRequestException(`New item ${l.itemNo}: give the proposed rate`);
        row = { organizationId, boqItemId: null, isNewItem: true, itemNo: l.itemNo!, description: l.description!, unit: l.unit!, qty, rate: D(l.rate), sortOrder: i };
      }
      claimed = claimed.add(round2(D(row.qty as Prisma.Decimal).mul(row.rate as Prisma.Decimal)));
      return row;
    });
    return { rows, claimed };
  }

  private async findExisting(user: RequestUser, id: string | undefined) {
    if (!id) return null;
    const row = await this.prisma.variation.findFirst({ where: { id, organizationId: user.organizationId }, select: { id: true } });
    return row ? this.get(user, row.id) : null;
  }

  async create(user: RequestUser, dto: CreateVariationDto): Promise<VariationDto> {
    const existing = await this.findExisting(user, dto.id);
    if (existing) return existing;
    this.assertCanManage(user);
    await this.access.assertCanAccessProject(user, dto.projectId);
    const { rows, claimed } = await this.buildLines(dto.projectId, user.organizationId, dto.lines);
    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`VAR:${dto.projectId}`}))`;
        const last = await tx.variation.findFirst({ where: { projectId: dto.projectId }, orderBy: { varNo: 'desc' }, select: { varNo: true } });
        const row = await tx.variation.create({
          data: {
            id: dto.id,
            organizationId: user.organizationId,
            projectId: dto.projectId,
            varNo: (last?.varNo ?? 0) + 1,
            title: dto.title,
            cause: dto.cause,
            description: dto.description ?? null,
            claimedAmount: claimed,
            createdById: user.id,
            lines: { createMany: { data: rows } },
          },
          select: { id: true, varNo: true },
        });
        return row.id;
      });
    } catch (e) {
      if (isUniqueViolation(e) && dto.id) {
        const winner = await this.findExisting(user, dto.id);
        if (winner) return winner;
      }
      throw e;
    }
    await this.attachments.link(user, 'variationId', id, dto.attachmentIds);
    await this.audit.log(user, 'VARIATION', id, 'CREATED', `${dto.title} (₹${claimed.toFixed(2)})`);
    return this.get(user, id);
  }

  async update(user: RequestUser, id: string, dto: UpdateVariationDto): Promise<VariationDto> {
    this.assertCanManage(user);
    const cur = await this.load(user, id);
    if (cur.status === 'APPROVED') throw new ConflictException('The client has approved this variation; it can no longer be changed');
    if (dto.projectId && dto.projectId !== cur.projectId) throw new BadRequestException('A variation cannot move to another project');
    const data: Prisma.VariationUncheckedUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.cause !== undefined) data.cause = dto.cause;
    if (dto.description !== undefined) data.description = dto.description;
    await this.prisma.$transaction(async (tx) => {
      if (dto.lines) {
        const { rows, claimed } = await this.buildLines(cur.projectId, user.organizationId, dto.lines);
        await tx.variationLine.deleteMany({ where: { variationId: id } });
        await tx.variationLine.createMany({ data: rows.map((r) => ({ ...r, variationId: id })) });
        data.claimedAmount = claimed;
      }
      await tx.variation.update({ where: { id }, data });
    });
    await this.attachments.sync(user, 'variationId', id, dto.attachmentIds);
    await this.audit.log(user, 'VARIATION', id, 'UPDATED');
    return this.get(user, id);
  }

  /** Sent to the client (again, after a rejection or a revised claim). */
  async submit(user: RequestUser, id: string, dto: SubmitVariationDto): Promise<VariationDto> {
    this.assertCanManage(user);
    const cur = await this.load(user, id);
    if (cur.status === 'APPROVED') throw new ConflictException('The client has already approved this variation');
    if (dto.date > todayIn()) throw new BadRequestException('The date sent cannot be in the future');
    await this.prisma.variation.update({
      where: { id },
      data: { status: 'SUBMITTED', submittedDate: parseDate(dto.date), submittedRef: dto.ref ?? null, decidedDate: null, clientRef: null, decisionNote: null },
    });
    await this.audit.log(user, 'VARIATION', id, 'SENT_TO_CLIENT', dto.ref ? `Ref ${dto.ref}` : null);
    return this.get(user, id);
  }

  /**
   * The client's decision. Approval applies the approved quantities to the BOQ: a quantity change moves the item's
   * revised quantity, an extra item gets its quantity (and the approved rate), and a new item is added to the BOQ.
   */
  async decide(user: RequestUser, id: string, dto: DecideVariationDto): Promise<VariationDto> {
    this.assertCanManage(user);
    const cur = await this.load(user, id);
    if (cur.status !== 'SUBMITTED') throw new ConflictException(`Only a variation with the client can be decided (this one is ${VARIATION_STATUS_LABELS[cur.status].toLowerCase()})`);
    if (dto.date > todayIn()) throw new BadRequestException('The decision date cannot be in the future');
    if (cur.submittedDate && dto.date < dateOnly(cur.submittedDate)!) throw new BadRequestException('The decision cannot be dated before the variation was sent');
    const decided = { decidedDate: parseDate(dto.date), clientRef: dto.clientRef ?? null, decisionNote: dto.note ?? null };
    if (dto.decision === 'REJECTED') {
      await this.prisma.variation.update({ where: { id }, data: { status: 'REJECTED', ...decided } });
      await this.audit.log(user, 'VARIATION', id, 'REJECTED_BY_CLIENT', dto.note ?? null);
      return this.get(user, id);
    }

    const given = new Map((dto.lines ?? []).map((l) => [l.id, l]));
    for (const lineId of given.keys()) if (!cur.lines.some((l) => l.id === lineId)) throw new BadRequestException('A decision line does not belong to this variation');
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`VAR:${cur.projectId}`}))`;
      let total = ZERO;
      let sortOrder = (await tx.boqItem.aggregate({ where: { projectId: cur.projectId }, _max: { sortOrder: true } }))._max.sortOrder ?? 0;
      for (const l of cur.lines) {
        const g = given.get(l.id);
        const qty = g?.approvedQty !== undefined ? D(g.approvedQty) : l.qty;
        const rate = l.isNewItem && g?.approvedRate !== undefined ? D(g.approvedRate) : l.rate;
        if (rate.lt(0)) throw new BadRequestException(`Item ${l.itemNo}: the rate cannot be negative`);
        if (l.isNewItem && qty.lt(0)) throw new BadRequestException(`Item ${l.itemNo}: the approved quantity cannot be negative`);
        if (!qty.isZero() && qty.isNegative() !== l.qty.isNegative()) throw new BadRequestException(`Item ${l.itemNo}: the approved quantity must have the same sign as the claim`);
        let boqItemId = l.boqItemId;
        if (!qty.isZero()) {
          if (l.boqItemId) {
            const b = await tx.boqItem.findUniqueOrThrow({ where: { id: l.boqItemId } });
            const next = (b.revisedQty ?? b.originalQty).add(qty);
            if (next.lt(0)) throw new BadRequestException(`Item ${b.itemNo}: the quantity cannot go below 0`);
            await tx.boqItem.update({ where: { id: b.id }, data: { revisedQty: next, ...(l.isNewItem ? { rate } : {}) } });
          } else {
            if (await tx.boqItem.findFirst({ where: { projectId: cur.projectId, itemNo: { equals: l.itemNo, mode: 'insensitive' } }, select: { id: true } })) {
              throw new ConflictException(`Item ${l.itemNo} was added to the BOQ meanwhile: edit the variation to pick it instead`);
            }
            sortOrder += 1;
            const b = await tx.boqItem.create({
              data: { organizationId: cur.organizationId, projectId: cur.projectId, itemNo: l.itemNo, description: l.description, unit: l.unit, rate, originalQty: ZERO, revisedQty: qty, sortOrder },
              select: { id: true },
            });
            boqItemId = b.id;
          }
        }
        await tx.variationLine.update({ where: { id: l.id }, data: { approvedQty: qty, approvedRate: rate, boqItemId } });
        total = total.add(round2(qty.mul(rate)));
      }
      await tx.variation.update({ where: { id }, data: { status: 'APPROVED', approvedAmount: total, ...decided } });
    });
    await this.audit.log(user, 'VARIATION', id, 'APPROVED_BY_CLIENT', dto.clientRef ? `Ref ${dto.clientRef}` : null);
    await this.audit.log(user, 'PROJECT', cur.projectId, 'BOQ_REVISED', `${variationLabel(cur.varNo)} approved by the client`);
    return this.get(user, id);
  }

  async remove(user: RequestUser, id: string) {
    this.assertCanManage(user);
    const cur = await this.load(user, id);
    if (cur.status === 'APPROVED') throw new ConflictException('An approved variation has changed the BOQ and cannot be deleted');
    await this.prisma.variation.delete({ where: { id } });
    await this.audit.log(user, 'VARIATION', id, 'DELETED', `${variationLabel(cur.varNo)} ${cur.title}`);
    return { ok: true };
  }

  /** Approved variations per project (for the revised contract value on projects and dashboards). */
  async approvedByProject(projectIds: string[]): Promise<Map<string, Prisma.Decimal>> {
    if (!projectIds.length) return new Map();
    const rows = await this.prisma.variation.groupBy({ by: ['projectId'], where: { projectId: { in: projectIds }, status: 'APPROVED' }, _sum: { approvedAmount: true } });
    return new Map(rows.map((r) => [r.projectId, r._sum.approvedAmount ?? ZERO]));
  }
}
