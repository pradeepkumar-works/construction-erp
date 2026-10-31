import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { canRunSubcontractEnquiries, type ScEnquiryDetailDto, type ScEnquiryDto, type ScEnquiryListDto, type ScQuoteDto } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { dateOnly, iso, money, parseDate } from '../common/serialize';
import { nextDocNo } from '../common/doc-number';
import { todayIn } from '../notifications/time';
import { ZERO, parseGstRate, parseQty, parseRate } from '../purchasing/purchase-math';
import { fyStart } from '../tenders/tender-rules';
import { WorkOrdersService } from './work-orders.service';
import { awardProblem, compare, itemsProblem, type CmpItem, type CmpQuote, type Comparison } from './comparison-rules';
import { AwardDto, CreateScEnquiryDto, InviteDto, ScEnquiryQuery, ScItemInput, ScQuoteDto as ScQuoteInput, ScStatusDto, UpdateScEnquiryDto } from './sc-enquiries.dto';

const INCLUDE = {
  project: { select: { code: true, name: true } },
  createdBy: { select: { fullName: true } },
  workOrder: { select: { woNo: true } },
  items: { orderBy: { sortOrder: 'asc' }, include: { boqItem: { select: { itemNo: true, rate: true, budgetRate: true } } } },
  quotes: { orderBy: { createdAt: 'asc' }, include: { vendor: { select: { name: true, phone: true } }, lines: true } },
} satisfies Prisma.SubcontractEnquiryInclude;
type Row = Prisma.SubcontractEnquiryGetPayload<{ include: typeof INCLUDE }>;

/**
 * Subcontract enquiries: the items of a project's BOQ (or the enquiry's own items) sent to several
 * subcontractors, their quotes entered as they come, the comparative statement worked out by `compare`, and the chosen
 * quote made a draft work order through `WorkOrdersService.create`. Run by those who issue work orders.
 */
@Injectable()
export class ScEnquiriesService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private workOrders: WorkOrdersService,
  ) {}

  private assertRun(user: RequestUser) {
    if (!canRunSubcontractEnquiries(user.roleKey)) throw new ForbiddenException('Only those who issue work orders run subcontract enquiries');
  }

  private async row(user: RequestUser, id: string): Promise<Row> {
    this.assertRun(user);
    const row = await this.prisma.subcontractEnquiry.findFirst({ where: { id, organizationId: user.organizationId, project: this.access.projectWhere(user) }, include: INCLUDE });
    if (!row) throw new NotFoundException('Enquiry not found');
    return row;
  }

  private comparison(row: Row): Comparison {
    const items: CmpItem[] = row.items.map((i) => ({ id: i.id, quantity: i.quantity, clientRate: i.boqItem?.rate ?? null }));
    const quotes: CmpQuote[] = row.quotes.map((q) => ({ id: q.id, receivedOn: q.receivedOn, gstRate: q.gstRate, rates: new Map(q.lines.map((l) => [l.itemId, l.rate])) }));
    return compare(items, quotes);
  }

  private summary(row: Row, c: Comparison): ScEnquiryDto {
    const lowest = c.quotes.filter((q) => c.lowestIds.includes(q.quoteId));
    const awarded = row.awardedQuoteId ? row.quotes.find((q) => q.id === row.awardedQuoteId) : null;
    return {
      id: row.id,
      enquiryNo: row.enquiryNo,
      projectId: row.projectId,
      projectCode: row.project.code,
      projectName: row.project.name,
      title: row.title,
      closesOn: dateOnly(row.closesOn),
      status: row.status,
      itemCount: row.items.length,
      invited: row.quotes.length,
      received: row.quotes.filter((q) => q.receivedOn).length,
      lowestTotal: lowest.length ? money(lowest[0].total) : null,
      lowestVendorName: lowest.length ? lowest.map((l) => row.quotes.find((q) => q.id === l.quoteId)!.vendor.name).join(', ') : null,
      awardedVendorName: awarded?.vendor.name ?? null,
      awardedTotal: awarded ? money(c.quotes.find((q) => q.quoteId === awarded.id)!.total) : null,
      workOrderId: row.workOrderId,
      woNo: row.workOrder?.woNo ?? null,
      createdAt: iso(row.createdAt)!,
    };
  }

  private detail(user: RequestUser, row: Row): ScEnquiryDetailDto {
    const c = this.comparison(row);
    const byItem = new Map(c.items.map((i) => [i.itemId, i]));
    const quotes: ScQuoteDto[] = row.quotes.map((q) => {
      const cq = c.quotes.find((x) => x.quoteId === q.id)!;
      const rates: Record<string, string | null> = {};
      for (const it of row.items) rates[it.id] = money(q.lines.find((l) => l.itemId === it.id)?.rate ?? null);
      return {
        id: q.id,
        vendorId: q.vendorId,
        vendorName: q.vendor.name,
        vendorPhone: q.vendor.phone,
        received: cq.received,
        receivedOn: dateOnly(q.receivedOn),
        gstRate: q.gstRate.toFixed(2),
        validUntil: dateOnly(q.validUntil),
        note: q.note,
        rates,
        total: cq.received ? money(cq.total) : null,
        gst: cq.received ? money(cq.gst) : null,
        totalWithGst: cq.received ? money(cq.totalWithGst) : null,
        priced: cq.priced,
        complete: cq.complete,
        rank: cq.rank,
        marginPct: cq.marginPct ? cq.marginPct.toFixed(2) : null,
        awarded: row.awardedQuoteId === q.id,
      };
    });
    // Ranked quotes first, then the other received ones, then those still awaited.
    const order = (q: ScQuoteDto) => (q.rank ?? (q.received ? 1000 : 2000));
    quotes.sort((a, b) => order(a) - order(b));
    return {
      ...this.summary(row, c),
      scope: row.scope,
      items: row.items.map((i) => {
        const ci = byItem.get(i.id)!;
        return {
          id: i.id,
          boqItemId: i.boqItemId,
          itemNo: i.boqItem?.itemNo ?? null,
          description: i.description,
          unit: i.unit,
          quantity: i.quantity.toFixed(3),
          clientRate: money(i.boqItem?.rate ?? null),
          budgetRate: money(i.boqItem?.budgetRate ?? null),
          lowestRate: money(ci.lowestRate),
          lowestQuoteIds: ci.lowestQuoteIds,
          spreadPct: ci.spreadPct ? ci.spreadPct.toFixed(2) : null,
        };
      }),
      quotes,
      clientValue: money(c.clientValue),
      decisionNote: row.decisionNote,
      decidedAt: iso(row.decidedAt),
      createdByName: row.createdBy.fullName,
      closed: !!row.closesOn && dateOnly(row.closesOn)! < todayIn(),
      canEdit: canRunSubcontractEnquiries(user.roleKey),
    };
  }

  async list(user: RequestUser, q: ScEnquiryQuery): Promise<ScEnquiryListDto> {
    this.assertRun(user);
    const base: Prisma.SubcontractEnquiryWhereInput = { organizationId: user.organizationId, project: this.access.projectWhere(user), ...(q.projectId ? { projectId: q.projectId } : {}) };
    const status = q.status ?? 'open';
    const words = q.q?.trim();
    const where: Prisma.SubcontractEnquiryWhereInput = {
      ...base,
      ...(status === 'all' ? {} : { status: status.toUpperCase() as 'OPEN' | 'AWARDED' | 'CANCELLED' }),
      ...(words
        ? {
            OR: [
              { title: { contains: words, mode: 'insensitive' } },
              { enquiryNo: { contains: words, mode: 'insensitive' } },
              { project: { OR: [{ code: { contains: words, mode: 'insensitive' } }, { name: { contains: words, mode: 'insensitive' } }] } },
              { quotes: { some: { vendor: { name: { contains: words, mode: 'insensitive' } } } } },
            ],
          }
        : {}),
    };
    const [rows, all] = await Promise.all([
      this.prisma.subcontractEnquiry.findMany({ where, include: INCLUDE, orderBy: status === 'open' ? [{ closesOn: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }] : [{ createdAt: 'desc' }], take: 200 }),
      this.prisma.subcontractEnquiry.findMany({ where: { ...base, OR: [{ status: 'OPEN' }, { status: 'AWARDED', decidedAt: { gte: parseDate(fyStart(todayIn())) } }] }, include: INCLUDE }),
    ]);
    let awaiting = 0;
    let ready = 0;
    let awardedCount = 0;
    let awardedValue = ZERO;
    for (const r of all) {
      const c = this.comparison(r);
      if (r.status === 'OPEN') {
        if (r.quotes.some((q) => !q.receivedOn)) awaiting += 1;
        if (c.lowestIds.length) ready += 1;
      } else {
        awardedCount += 1;
        const won = c.quotes.find((q) => q.quoteId === r.awardedQuoteId);
        if (won) awardedValue = awardedValue.add(won.total);
      }
    }
    return {
      items: rows.map((r) => this.summary(r, this.comparison(r))),
      summary: { open: all.filter((r) => r.status === 'OPEN').length, awaitingQuotes: awaiting, readyToAward: ready, awardedThisYear: awardedCount, awardedValue: money(awardedValue)! },
    };
  }

  async get(user: RequestUser, id: string): Promise<ScEnquiryDetailDto> {
    return this.detail(user, await this.row(user, id));
  }

  /** The items priced; a BOQ item takes its description and unit, and appears once. */
  private async items(projectId: string, input: ScItemInput[]) {
    const boqIds = input.map((l) => l.boqItemId).filter((x): x is string => !!x);
    if (new Set(boqIds).size !== boqIds.length) throw new BadRequestException('A BOQ item is on the enquiry twice');
    const boq = boqIds.length ? await this.prisma.boqItem.findMany({ where: { id: { in: boqIds }, projectId }, select: { id: true, itemNo: true, description: true, unit: true } }) : [];
    return input.map((l, i) => {
      const b = l.boqItemId ? boq.find((x) => x.id === l.boqItemId) : null;
      if (l.boqItemId && !b) throw new BadRequestException(`Item ${i + 1}: the BOQ item is not part of this project`);
      const description = b ? b.description : l.description?.trim();
      const unit = b?.unit ?? l.unit?.trim();
      if (!description || !unit) throw new BadRequestException(`Item ${i + 1}: give the description and unit`);
      return { boqItemId: b?.id ?? null, description: description.slice(0, 300), unit, quantity: parseQty(l.quantity, b ? `Item ${b.itemNo}` : description), sortOrder: i };
    });
  }

  private async vendors(user: RequestUser, ids: string[]) {
    const unique = [...new Set(ids)];
    const found = await this.prisma.vendor.findMany({ where: { id: { in: unique }, organizationId: user.organizationId }, select: { id: true, name: true, isActive: true } });
    if (found.length !== unique.length) throw new NotFoundException('A subcontractor was not found in the vendor master');
    const off = found.find((v) => !v.isActive);
    if (off) throw new BadRequestException(`${off.name} is inactive in the vendor master`);
    return unique;
  }

  async create(user: RequestUser, dto: CreateScEnquiryDto): Promise<ScEnquiryDetailDto> {
    this.assertRun(user);
    await this.access.assertCanAccessProject(user, dto.projectId);
    const items = await this.items(dto.projectId, dto.items);
    const vendorIds = await this.vendors(user, dto.vendorIds ?? []);
    const id = await this.prisma.$transaction(async (tx) => {
      const enquiryNo = await nextDocNo(tx, user.organizationId, 'SCE', async (prefix) =>
        (await tx.subcontractEnquiry.findFirst({ where: { organizationId: user.organizationId, enquiryNo: { startsWith: prefix } }, orderBy: { enquiryNo: 'desc' }, select: { enquiryNo: true } }))?.enquiryNo ?? null,
      );
      const row = await tx.subcontractEnquiry.create({
        data: {
          organizationId: user.organizationId,
          projectId: dto.projectId,
          enquiryNo,
          title: dto.title,
          scope: dto.scope ?? null,
          closesOn: dto.closesOn ? parseDate(dto.closesOn) : null,
          createdById: user.id,
          items: { create: items.map((i) => ({ ...i, organizationId: user.organizationId })) },
          quotes: { create: vendorIds.map((vendorId) => ({ organizationId: user.organizationId, vendorId })) },
        },
        select: { id: true, enquiryNo: true },
      });
      return row.id;
    });
    await this.audit.log(user, 'SC_ENQUIRY', id, 'CREATED');
    return this.get(user, id);
  }

  async update(user: RequestUser, id: string, dto: UpdateScEnquiryDto): Promise<ScEnquiryDetailDto> {
    const row = await this.row(user, id);
    if (row.status !== 'OPEN') throw new ConflictException('Only an open enquiry can change.');
    const items = dto.items ? await this.items(row.projectId, dto.items) : null;
    if (items) {
      const problem = itemsProblem(row.status, row.quotes.filter((q) => q.receivedOn).length);
      if (problem) throw new ConflictException(problem);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.subcontractEnquiry.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.scope !== undefined ? { scope: dto.scope || null } : {}),
          ...(dto.closesOn !== undefined ? { closesOn: dto.closesOn ? parseDate(dto.closesOn) : null } : {}),
        },
      });
      if (items) {
        await tx.subcontractEnquiryItem.deleteMany({ where: { enquiryId: id } });
        await tx.subcontractEnquiryItem.createMany({ data: items.map((i) => ({ ...i, enquiryId: id, organizationId: user.organizationId })) });
      }
    });
    await this.audit.log(user, 'SC_ENQUIRY', id, 'UPDATED');
    return this.get(user, id);
  }

  async remove(user: RequestUser, id: string) {
    const row = await this.row(user, id);
    if (row.workOrderId) throw new ConflictException(`This enquiry became work order ${row.workOrder?.woNo}. It stays on record.`);
    await this.prisma.subcontractEnquiry.delete({ where: { id } });
    await this.audit.log(user, 'SC_ENQUIRY', id, 'DELETED', `${row.enquiryNo} ${row.title}`);
    return { ok: true };
  }

  async invite(user: RequestUser, id: string, dto: InviteDto): Promise<ScEnquiryDetailDto> {
    const row = await this.row(user, id);
    if (row.status !== 'OPEN') throw new ConflictException('Only an open enquiry takes more subcontractors.');
    const ids = (await this.vendors(user, dto.vendorIds)).filter((v) => !row.quotes.some((q) => q.vendorId === v));
    if (ids.length) await this.prisma.subcontractQuote.createMany({ data: ids.map((vendorId) => ({ organizationId: user.organizationId, enquiryId: id, vendorId })) });
    return this.get(user, id);
  }

  async saveQuote(user: RequestUser, id: string, quoteId: string, dto: ScQuoteInput): Promise<ScEnquiryDetailDto> {
    const row = await this.row(user, id);
    const quote = row.quotes.find((q) => q.id === quoteId);
    if (!quote) throw new NotFoundException('Quote not found');
    if (row.status !== 'OPEN') throw new ConflictException('This enquiry is decided: its quotes stay as they are.');
    const itemIds = new Set(row.items.map((i) => i.id));
    const lines: { itemId: string; rate: Prisma.Decimal }[] = [];
    for (const r of dto.rates) {
      if (!itemIds.has(r.itemId)) throw new BadRequestException('A rate is for an item not on this enquiry');
      if (r.rate === null || r.rate === undefined || r.rate === '') continue;
      const item = row.items.find((i) => i.id === r.itemId)!;
      lines.push({ itemId: r.itemId, rate: parseRate(r.rate, item.description.slice(0, 40)) });
    }
    if (!lines.length) throw new BadRequestException('Enter at least one rate from their quote');
    const receivedOn = parseDate(dto.receivedOn);
    if (dateOnly(receivedOn)! > todayIn()) throw new BadRequestException('Their quote cannot come after today');
    await this.prisma.$transaction(async (tx) => {
      await tx.subcontractQuote.update({
        where: { id: quoteId },
        data: { receivedOn, gstRate: parseGstRate(dto.gstRate, 'GST'), validUntil: dto.validUntil ? parseDate(dto.validUntil) : null, note: dto.note ?? null },
      });
      await tx.subcontractQuoteLine.deleteMany({ where: { quoteId } });
      await tx.subcontractQuoteLine.createMany({ data: lines.map((l) => ({ ...l, quoteId, organizationId: user.organizationId })) });
    });
    await this.audit.log(user, 'SC_ENQUIRY', id, 'QUOTE_ENTERED', quote.vendor.name);
    return this.get(user, id);
  }

  async removeQuote(user: RequestUser, id: string, quoteId: string): Promise<ScEnquiryDetailDto> {
    const row = await this.row(user, id);
    const quote = row.quotes.find((q) => q.id === quoteId);
    if (!quote) throw new NotFoundException('Quote not found');
    if (row.status !== 'OPEN') throw new ConflictException('This enquiry is decided: its quotes stay as they are.');
    await this.prisma.subcontractQuote.delete({ where: { id: quoteId } });
    await this.audit.log(user, 'SC_ENQUIRY', id, 'QUOTE_REMOVED', quote.vendor.name);
    return this.get(user, id);
  }

  /** The chosen quote becomes a draft work order at its rates; the enquiry is then awarded. */
  async award(user: RequestUser, id: string, dto: AwardDto): Promise<{ workOrderId: string; woNo: string }> {
    const row = await this.row(user, id);
    const c = this.comparison(row);
    const quote = row.quotes.find((q) => q.id === dto.quoteId) ?? null;
    const cq = quote ? c.quotes.find((q) => q.quoteId === quote.id)! : null;
    const problem = awardProblem(row.status, !!row.workOrderId, cq ? { received: cq.received, complete: cq.complete, rank: cq.rank } : null, dto.note);
    if (problem) throw new ConflictException(problem);
    const rateOf = new Map(quote!.lines.map((l) => [l.itemId, l.rate]));
    const wo = await this.workOrders.create(user, {
      projectId: row.projectId,
      vendorId: quote!.vendorId,
      title: row.title,
      startDate: dto.startDate ?? null,
      endDate: dto.endDate ?? null,
      gstRate: quote!.gstRate.toFixed(2),
      ...(dto.retentionPct !== undefined ? { retentionPct: dto.retentionPct } : {}),
      terms: row.scope,
      remarks: `From subcontract enquiry ${row.enquiryNo}, ${quote!.vendor.name}'s quote of ${dateOnly(quote!.receivedOn)}`,
      lines: row.items.map((i) => ({
        ...(i.boqItemId ? { boqItemId: i.boqItemId } : { description: i.description, unit: i.unit }),
        quantity: i.quantity.toFixed(3),
        rate: rateOf.get(i.id)!.toFixed(2),
      })),
    });
    try {
      await this.prisma.subcontractEnquiry.update({
        where: { id },
        data: { status: 'AWARDED', awardedQuoteId: quote!.id, workOrderId: wo.id, decisionNote: dto.note ?? null, decidedAt: new Date() },
      });
    } catch (e) {
      // The work order is new and still a draft: take it away so the award can be made again.
      await this.prisma.workOrder.delete({ where: { id: wo.id } }).catch(() => undefined);
      throw e;
    }
    await this.audit.log(user, 'SC_ENQUIRY', id, 'AWARDED', `${quote!.vendor.name}, ${wo.woNo}`);
    return { workOrderId: wo.id, woNo: wo.woNo };
  }

  /** Cancel an open enquiry, or reopen a cancelled one (or one whose work order was deleted). */
  async setStatus(user: RequestUser, id: string, dto: ScStatusDto): Promise<ScEnquiryDetailDto> {
    const row = await this.row(user, id);
    if (dto.status === 'CANCELLED') {
      if (row.status !== 'OPEN') throw new ConflictException('Only an open enquiry can be cancelled.');
      if (!dto.note?.trim()) throw new BadRequestException('Say why the enquiry is cancelled');
      await this.prisma.subcontractEnquiry.update({ where: { id }, data: { status: 'CANCELLED', decisionNote: dto.note, decidedAt: new Date() } });
    } else {
      if (row.status === 'OPEN') return this.detail(user, row);
      if (row.workOrderId) throw new ConflictException(`This enquiry is work order ${row.workOrder?.woNo}. Delete that draft first to reopen it.`);
      await this.prisma.subcontractEnquiry.update({ where: { id }, data: { status: 'OPEN', awardedQuoteId: null, decisionNote: null, decidedAt: null } });
    }
    await this.audit.log(user, 'SC_ENQUIRY', id, dto.status === 'CANCELLED' ? 'CANCELLED' : 'REOPENED', dto.note ?? null);
    return this.get(user, id);
  }
}

