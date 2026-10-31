import type { MaterialPriority, SubmissionStatus } from './enums';
import type { SubmissionBase } from './types';

/**
 * Requests to order (Purchases › Requests to order): the buyer's own list of approved material requests with something
 * still to order, so the quotations, the L1 and the order are found under Purchases rather than inside each request
 * under Materials. Where a request stands and how its quotations rank are pure, so the list, the request's comparative
 * statement and the API read them the same way.
 */

const num = (v: string | number | null | undefined) => (v == null || v === '' ? 0 : Number(v));
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Where a request stands with its buyer, one screen each: no quotations yet (send the enquiry), an enquiry the
 * suppliers are still answering, quotations in with the L1 to finalise, the finalised choice waiting for its approval
 * (when the company has orders wait for one), and the L1 finalised with its order to raise.
 */
export const ORDER_STAGES = ['TO_ENQUIRE', 'AWAITING_QUOTES', 'TO_FINALISE', 'AWAITING_APPROVAL', 'READY'] as const;
export type OrderStage = (typeof ORDER_STAGES)[number];
export const ORDER_STAGE_LABELS: Record<OrderStage, string> = {
  TO_ENQUIRE: 'No quotations yet',
  AWAITING_QUOTES: 'Waiting for quotations',
  TO_FINALISE: 'L1 to finalise',
  AWAITING_APPROVAL: 'Choice waiting for approval',
  READY: 'L1 finalised, PO to raise',
};

/** An enquiry on a request as the stage reads it: its last day, and how many of the suppliers asked have answered. */
export interface EnquiryProgress {
  closesOn: string;
  invited: number;
  replied: number;
}

/** An enquiry still being answered: its closing day is today or later and someone asked has not replied. */
export const enquiryOpen = (e: EnquiryProgress, today: string) => e.closesOn >= today && e.replied < e.invited;

/**
 * Purchase's choice on a request: one quotation (null once that quotation is deleted), or the lowest per item split.
 * `approval` is the status of the choice as sent for approval, when the company has orders wait for an approved choice
 * (`ordersNeedApprovedChoice`); null or absent when it stands without one.
 */
export interface FinalChoice {
  quotationId: string | null;
  split: boolean;
  approval?: SubmissionStatus | null;
}

/** A choice still being decided holds the order back; one sent back or rejected goes back to Finalise L1. */
const choiceStage = (approval: SubmissionStatus | null | undefined): OrderStage =>
  approval === 'DRAFT' || approval === 'SUBMITTED' ? 'AWAITING_APPROVAL' : approval === 'REJECTED' || approval === 'CHANGES_REQUESTED' ? 'TO_FINALISE' : 'READY';

/**
 * The stage of a request from what is still to order on it (`toOrder` per request item; only items above zero count),
 * the quotations on it, its enquiries and the choice purchase finalised. A finalised choice holds while it still prices
 * something left to order; once its order is raised and other items remain, they go back to quotations.
 */
export function orderStage(
  input: { toOrder: Record<string, string | number>; quotations: Pick<QuoteToRank, 'id' | 'lines'>[]; enquiries: EnquiryProgress[]; final: FinalChoice | null },
  today: string,
): OrderStage {
  const left = new Set(Object.entries(input.toOrder).filter(([, q]) => num(q) > 0).map(([id]) => id));
  const prices = (q: Pick<QuoteToRank, 'lines'>) => q.lines.some((l) => left.has(l.materialRequestItemId));
  const f = input.final;
  if (f && (f.split ? input.quotations.some(prices) : input.quotations.some((q) => q.id === f.quotationId && prices(q)))) {
    const stage = choiceStage(f.approval);
    if (stage !== 'TO_FINALISE') return stage;
  }
  if (input.enquiries.some((e) => enquiryOpen(e, today))) return 'AWAITING_QUOTES';
  return input.quotations.some(prices) ? 'TO_FINALISE' : 'TO_ENQUIRE';
}

/**
 * What stops a choice being finalised: a quotation other than L1 (or one that leaves out items still to order) needs
 * the reason, which goes on the order as why this vendor. Null when it may be finalised.
 */
export function finaliseProblem(ranked: RankedQuote[], choice: { quotationId?: string | null; split?: boolean }, reason: string | null | undefined): string | null {
  if (choice.split) return null;
  const q = ranked.find((r) => r.quotationId === choice.quotationId);
  if (!q) return 'Choose one of the quotations on this request';
  if (q.rank === 1) return null;
  if (reason && reason.trim().length >= 5) return null;
  return q.rank
    ? `${q.vendorName} is L${q.rank}, not the lowest. Say why you are choosing them (at least 5 characters).`
    : `${q.vendorName} does not quote ${q.missing === 1 ? 'one item' : `${q.missing} items`} still to order. Say why you are choosing them (at least 5 characters).`;
}

/** What a quotation needs to be ranked: its freight and its priced lines (a `QuotationDto` will do). */
export interface QuoteToRank {
  id: string;
  vendorId: string;
  vendorName: string;
  freight: string | number;
  lines: { materialRequestItemId: string; rate: string | number; gstRate: string | number }[];
}

export interface RankedQuote {
  quotationId: string;
  vendorId: string;
  vendorName: string;
  /** 1 for L1, 2 for L2…; null for a quotation that leaves out an item still to order */
  rank: number | null;
  /** The items still to order at this quotation's rates, with GST and its freight */
  total: number;
  /** Items still to order that it does not price */
  missing: number;
}

/**
 * L1, L2, L3: the quotations that price every item still to order, by what those items cost at their rates (GST and
 * freight included, each line rounded to paise as an order is), lowest first and the earlier quotation on a tie.
 * A quotation that leaves out an item is not ranked, since its total is not for the same goods. With nothing left to
 * order the ranking is over the whole request, as it was quoted.
 */
export function rankQuotations(quotations: QuoteToRank[], toOrder: Record<string, string | number>): RankedQuote[] {
  const left = Object.entries(toOrder).filter(([, q]) => num(q) > 0);
  const items = left.length ? left : Object.entries(toOrder);
  const priced = quotations.map((q, i) => {
    let subtotal = 0;
    let gst = 0;
    let missing = 0;
    for (const [id, qty] of items) {
      const l = q.lines.find((x) => x.materialRequestItemId === id);
      if (!l) {
        missing += 1;
        continue;
      }
      const amount = round2(num(qty) * num(l.rate));
      subtotal += amount;
      gst += round2((amount * num(l.gstRate)) / 100);
    }
    return { i, q, missing, total: round2(subtotal + gst + num(q.freight)) };
  });
  const ranked = priced.filter((p) => p.missing === 0 && items.length > 0).sort((a, b) => a.total - b.total || a.i - b.i);
  const rankOf = new Map(ranked.map((p, n) => [p.q.id, n + 1]));
  return [...ranked, ...priced.filter((p) => !rankOf.has(p.q.id))].map((p) => ({
    quotationId: p.q.id,
    vendorId: p.q.vendorId,
    vendorName: p.q.vendorName,
    rank: rankOf.get(p.q.id) ?? null,
    total: p.total,
    missing: p.missing,
  }));
}

/** A request on the buyer's list (`GET /purchase-orders/requests-to-order`). */
export interface RequestToOrderDto {
  id: string;
  requestNo: string;
  projectId: string;
  projectName: string;
  requiredDate: string;
  priority: MaterialPriority;
  submittedByName: string;
  /** When it was approved, so the buyer sees how long it has waited */
  approvedAt: string | null;
  stage: OrderStage;
  /** What purchase finalised, if it did */
  final: {
    quotationId: string | null;
    vendorName: string | null;
    split: boolean;
    rank: number | null;
    reason: string | null;
    byName: string | null;
    at: string | null;
    /** The choice as sent for approval, when the company has orders wait for an approved choice; null otherwise */
    approval: { choiceId: string; status: SubmissionStatus; reviewedByName: string | null; reviewedAt: string | null; reviewNote: string | null } | null;
  } | null;
  /** Orders on this request wait for an approved supplier choice (the company's rule) */
  needsApproval: boolean;
  /** Items still to order, first few by name */
  itemNames: string[];
  /** How many items are still to order */
  itemsLeft: number;
  /** How many of those no quotation prices */
  itemsUnquoted: number;
  /** Orders already raised on it (not rejected) */
  orders: number;
  quotations: number;
  /** The latest enquiry: closing day and replies */
  enquiry: EnquiryProgress | null;
  /** The two lowest that price everything still to order */
  l1: { quotationId: string; vendorName: string; total: string } | null;
  l2: { quotationId: string; vendorName: string; total: string } | null;
}

/** A page of the list, with how many requests stand at each stage (across the filters but the stage) for its views. */
export interface RequestsToOrderPage {
  items: RequestToOrderDto[];
  total: number;
  page: number;
  pageSize: number;
  stages: Record<OrderStage, number>;
}

/**
 * Why a purchase order on a material request may not go ahead under the company's rule that orders wait for an approved
 * supplier choice: none sent, still waiting, sent back, or an order on someone other than the vendor approved (any vendor
 * the split approved may be ordered from). Null when it may.
 */
export function choiceProblem(
  requestNo: string,
  choice: { status: SubmissionStatus; split: boolean; vendorId: string | null; vendorName: string | null } | null,
  order: { vendorId: string; vendorName: string },
  splitVendorIds: string[] = [],
): string | null {
  if (!choice) return `Orders on ${requestNo} wait for an approved supplier choice. Finalise L1 on it under Purchases › Requests to order, then raise the order once it is approved.`;
  if (choice.status === 'SUBMITTED' || choice.status === 'DRAFT') return `The supplier choice on ${requestNo} is waiting for approval. Raise the order once it is approved.`;
  if (choice.status !== 'APPROVED') return `The supplier choice on ${requestNo} was ${choice.status === 'REJECTED' ? 'rejected' : 'sent back'}. Finalise L1 again and send it for approval.`;
  if (choice.split ? !splitVendorIds.includes(order.vendorId) : choice.vendorId !== order.vendorId)
    return choice.split
      ? `${order.vendorName} is not one of the vendors the approved split on ${requestNo} orders from. Reopen the choice to change it.`
      : `The approved supplier on ${requestNo} is ${choice.vendorName ?? 'another vendor'}. Raise the order on them, or reopen the choice and finalise again.`;
  return null;
}

/** A supplier choice as its own record (the approvals inbox and `/supplier-choices/[id]`). */
export interface SupplierChoiceDto extends SubmissionBase {
  materialRequestId: string;
  requestNo: string;
  /** The vendor of the chosen quotation; null for the split */
  vendorName: string | null;
  quotationId: string | null;
  split: boolean;
  /** Its L rank when chosen */
  rank: number | null;
  reason: string | null;
  /** What is still to order at the chosen rates, with GST and freight, when chosen */
  amount: string;
  /** L1's total for the same items when chosen */
  l1Amount: string | null;
  /** Still the request's current choice (a newer one replaces it) */
  current: boolean;
  /** Every quotation on the request as ranked now, for the approver */
  ranking: RankedQuote[];
  /** The split's orders, one per vendor, when the choice is the split */
  splitVendors: { vendorName: string; items: number; total: number }[];
  /** Items still to order on the request, first few by name */
  itemNames: string[];
  itemsLeft: number;
}
