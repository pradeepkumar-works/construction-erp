import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ORDER_STAGES,
  SUBMISSION_STATUS_LABELS,
  awardLowestPerItem,
  canPurchase,
  finaliseProblem,
  orderStage,
  rankQuotations,
  type OrderStage,
  type RequestToOrderDto,
  type RequestsToOrderPage,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { AuditService } from '../common/audit.service';
import { dateOnly, iso } from '../common/serialize';
import { ilike, pageArgs, searchWords } from '../common/paging';
import { todayIn } from '../notifications/time';
import { toOrderOf } from './purchase-math';
import { QuotationsService } from './quotations.service';
import { FinaliseL1Dto, RequestsToOrderQuery } from './purchasing.dto';

/** The first few item names a row shows. */
const NAMES_SHOWN = 4;

const select = {
  id: true,
  requestNo: true,
  projectId: true,
  requiredDate: true,
  priority: true,
  reviewedAt: true,
  status: true,
  finalQuotationId: true,
  finalSplit: true,
  finalRank: true,
  finalReason: true,
  finalisedAt: true,
  finalQuotation: { select: { vendor: { select: { name: true } } } },
  finalisedBy: { select: { fullName: true } },
  project: { select: { name: true } },
  submittedBy: { select: { fullName: true } },
  items: {
    orderBy: { sortOrder: 'asc' as const },
    select: {
      id: true,
      itemName: true,
      quantity: true,
      stockTxns: { select: { quantity: true, purchaseOrderLineId: true } },
      covers: { select: { quantity: true } },
      poLines: { where: { purchaseOrder: { status: { not: 'REJECTED' as const } } }, select: { quantity: true, purchaseOrder: { select: { closedAt: true } }, stockTxns: { select: { quantity: true } } } },
    },
  },
  quotations: {
    orderBy: [{ quoteDate: 'asc' as const }, { createdAt: 'asc' as const }],
    select: { id: true, vendorId: true, freight: true, vendor: { select: { name: true } }, lines: { select: { materialRequestItemId: true, rate: true, gstRate: true } } },
  },
  enquiries: { orderBy: { createdAt: 'desc' as const }, select: { closesOn: true, tokens: { select: { respondedAt: true } } } },
  purchaseOrders: { where: { status: { not: 'REJECTED' as const } }, select: { id: true } },
} satisfies Prisma.MaterialRequestSelect;
type Loaded = Prisma.MaterialRequestGetPayload<{ select: typeof select }>;

/** What the rules read of a loaded request: what is still to order, its quotations as the ranking takes them, its enquiries. */
function facts(r: Loaded) {
  const toOrder = Object.fromEntries(r.items.map((i) => [i.id, toOrderOf(i).toString()]));
  const quotations = r.quotations.map((qt) => ({
    id: qt.id,
    vendorId: qt.vendorId,
    vendorName: qt.vendor.name,
    freight: qt.freight.toString(),
    lines: qt.lines.map((l) => ({ materialRequestItemId: l.materialRequestItemId, rate: l.rate.toString(), gstRate: l.gstRate.toString() })),
  }));
  const enquiries = r.enquiries.map((e) => ({ closesOn: dateOnly(e.closesOn)!, invited: e.tokens.length, replied: e.tokens.filter((t) => t.respondedAt).length }));
  const final = r.finalisedAt && (r.finalQuotationId || r.finalSplit) ? { quotationId: r.finalQuotationId, split: r.finalSplit } : null;
  return { toOrder, quotations, enquiries, final, ranked: rankQuotations(quotations, toOrder) };
}

/**
 * Requests to order (Purchases › Requests to order): approved material requests with something still to order, each
 * with its stage (no quotations yet, an enquiry being answered, the L1 to finalise, the L1 finalised with its order to
 * raise) and its L1 and L2, so purchase works from a list of its own instead of opening each request under Materials.
 * Finalising records purchase's choice of supplier on the request (L1, another quotation with a reason, or the lowest
 * per item split); the order is then raised from it. The stage, ranking and the reason check are the pure rules in
 * `@erp/shared/purchase-queue.ts`; what a line still needs is `toOrderOf`, as on the request, the PO form and My work.
 */
@Injectable()
export class RequestsToOrderService {
  constructor(
    private prisma: PrismaService,
    private access: ProjectAccessService,
    private audit: AuditService,
    private quotations: QuotationsService,
  ) {}

  private assertCanPurchase(user: RequestUser) {
    if (!canPurchase(user.roleKey)) throw new ForbiddenException('Only procurement, project managers and management order material');
  }

  async list(user: RequestUser, q: RequestsToOrderQuery): Promise<RequestsToOrderPage> {
    const rows = await this.rows(user, q);
    const stages = Object.fromEntries(ORDER_STAGES.map((s) => [s, 0])) as Record<OrderStage, number>;
    for (const r of rows) stages[r.stage] += 1;
    const shown = q.stage ? rows.filter((r) => r.stage === q.stage) : rows;
    const args = pageArgs(q);
    return { items: shown.slice(args.skip, args.skip + args.take), total: shown.length, page: args.page, pageSize: args.pageSize, stages };
  }

  /** Every request on the list for these filters but the stage, by the day it is needed (most urgent first). */
  async rows(user: RequestUser, q: Pick<RequestsToOrderQuery, 'projectId' | 'q'> = {}): Promise<RequestToOrderDto[]> {
    this.assertCanPurchase(user);
    const where: Prisma.MaterialRequestWhereInput = { ...this.access.submissionWhere(user), status: 'APPROVED' };
    if (q.projectId) where.projectId = q.projectId;
    const words = searchWords(q.q);
    if (words.length)
      where.AND = words.map((w) => ({ OR: [{ requestNo: ilike(w) }, { items: { some: { itemName: ilike(w) } } }, { project: { name: ilike(w) } }, { quotations: { some: { vendor: { name: ilike(w) } } } }] }));
    const requests = await this.prisma.materialRequest.findMany({ where, select, orderBy: [{ requiredDate: 'asc' }, { requestNo: 'asc' }] });
    const today = todayIn();
    return requests.flatMap((r) => {
      const row = this.toRow(r, today);
      return row.itemsLeft > 0 ? [row] : [];
    });
  }

  /** One request as the list shows it, also once everything on it is ordered (its screen still opens). */
  async get(user: RequestUser, id: string): Promise<RequestToOrderDto> {
    this.assertCanPurchase(user);
    return this.toRow(await this.load(user, id), todayIn());
  }

  private async load(user: RequestUser, id: string) {
    const r = await this.prisma.materialRequest.findFirst({ where: { id, ...this.access.submissionWhere(user) }, select });
    if (!r) throw new NotFoundException('Material request not found');
    return r;
  }

  private toRow(r: Loaded, today: string): RequestToOrderDto {
    const f = facts(r);
    const left = r.items.filter((i) => Number(f.toOrder[i.id]) > 0);
    const quoted = new Set(f.quotations.flatMap((qt) => qt.lines.map((l) => l.materialRequestItemId)));
    const top = (n: number) => {
      const x = f.ranked.find((k) => k.rank === n);
      return x ? { quotationId: x.quotationId, vendorName: x.vendorName, total: x.total.toFixed(2) } : null;
    };
    return {
      id: r.id,
      requestNo: r.requestNo,
      projectId: r.projectId,
      projectName: r.project.name,
      requiredDate: dateOnly(r.requiredDate)!,
      priority: r.priority,
      submittedByName: r.submittedBy.fullName,
      approvedAt: iso(r.reviewedAt),
      stage: orderStage(f, today),
      final: f.final
        ? { quotationId: r.finalQuotationId, vendorName: r.finalQuotation?.vendor.name ?? null, split: r.finalSplit, rank: r.finalRank, reason: r.finalReason, byName: r.finalisedBy?.fullName ?? null, at: iso(r.finalisedAt) }
        : null,
      itemNames: left.slice(0, NAMES_SHOWN).map((i) => i.itemName),
      itemsLeft: left.length,
      itemsUnquoted: left.filter((i) => !quoted.has(i.id)).length,
      orders: r.purchaseOrders.length,
      quotations: r.quotations.length,
      enquiry: f.enquiries[0] ?? null,
      l1: top(1),
      l2: top(2),
    };
  }

  /**
   * Finalise the supplier for what is still to order: L1, another quotation with the reason (it goes on the order as
   * why this vendor), or the lowest per item split when it gives more than one order. Finalising again replaces it.
   */
  async finalise(user: RequestUser, id: string, dto: FinaliseL1Dto): Promise<RequestToOrderDto> {
    this.assertCanPurchase(user);
    const r = await this.load(user, id);
    if (r.status !== 'APPROVED') throw new ConflictException(`Suppliers are finalised on approved requests. ${r.requestNo} is ${SUBMISSION_STATUS_LABELS[r.status].toLowerCase()}.`);
    const f = facts(r);
    if (!Object.values(f.toOrder).some((q) => Number(q) > 0)) throw new ConflictException(`Everything on ${r.requestNo} is ordered or received`);
    const split = !!dto.split;
    if (split === !!dto.quotationId) throw new BadRequestException('Choose one quotation, or the lowest per item split');
    if (split) {
      const plan = awardLowestPerItem(await this.quotations.comparative(user, id), f.toOrder);
      if (plan.orders.length < 2) throw new ConflictException('One vendor is lowest on every item still to order, so finalise that quotation instead of a split');
    }
    const reason = dto.reason?.trim() || null;
    const problem = finaliseProblem(f.ranked, { quotationId: dto.quotationId, split }, reason);
    if (problem) throw new BadRequestException(problem);
    const chosen = f.ranked.find((q) => q.quotationId === dto.quotationId);
    await this.prisma.materialRequest.update({
      where: { id },
      data: {
        finalQuotationId: split ? null : dto.quotationId!,
        finalSplit: split,
        finalRank: split ? null : (chosen?.rank ?? null),
        finalReason: split || chosen?.rank === 1 ? null : reason,
        finalisedAt: new Date(),
        finalisedById: user.id,
      },
    });
    const what = split ? 'lowest per item, split between vendors' : `${chosen!.vendorName}${chosen!.rank ? ` (L${chosen!.rank})` : ''}`;
    await this.audit.log(user, 'MATERIAL_REQUEST', id, 'SUPPLIER_FINALISED', reason && !split && chosen?.rank !== 1 ? `${what}: ${reason}` : what);
    return this.get(user, id);
  }

  /** Undo the choice, so the quotations can be compared again (a better quote came in, a supplier backed out). */
  async reopen(user: RequestUser, id: string): Promise<RequestToOrderDto> {
    this.assertCanPurchase(user);
    const r = await this.load(user, id);
    if (!r.finalisedAt) throw new ConflictException(`No supplier is finalised on ${r.requestNo}`);
    await this.prisma.materialRequest.update({ where: { id }, data: { finalQuotationId: null, finalSplit: false, finalRank: null, finalReason: null, finalisedAt: null, finalisedById: null } });
    await this.audit.log(user, 'MATERIAL_REQUEST', id, 'SUPPLIER_REOPENED', r.finalQuotation?.vendor.name ?? (r.finalSplit ? 'lowest per item split' : null));
    return this.get(user, id);
  }
}
