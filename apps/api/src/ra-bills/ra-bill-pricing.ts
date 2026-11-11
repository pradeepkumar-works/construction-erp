import { Prisma } from '@prisma/client';
import { BILLABLE_BOQ_ITEM } from '../variations/variations.service';
import type { BillStagePlan } from '../stage-billing/stage-plan';
import { windowRecovery } from '../stage-billing/stage-billing-rules';
import { billsByStages, cappedSecurityDeposit, securedAdvanceOf, takesTenderFactor, type ContractModel } from '@erp/shared';
import { obligationRecovery } from '../contracts/obligation-recovery';

/*
 * Pricing an RA bill: its measured lines, its work value, GST, deductions and net payable. `RaBillsService` runs it on
 * every change and certificate, and the demo seed runs it for the town scheme's past bills, so both agree.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const ZERO = D(0);
const round2 = (v: Prisma.Decimal) => v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
const pctOf = (base: Prisma.Decimal, pct: Prisma.Decimal) => round2(base.mul(pct).div(100));

/**
 * An O&M bill's figures: the instalment less staff short (its work value), the O&M bills before it, and the
 * service level penalties it deducts. `omPricing` in `src/om/om-bill.ts` works them out.
 */
export interface OmPricing {
  amount: Prisma.Decimal;
  previous: Prisma.Decimal;
  penalty: Prisma.Decimal;
}

/** Deduction percentages of a bill, in the order the bill shows them. */
export const PCT_DEDUCTIONS = [
  ['retention', 'retentionPct', 'retentionAmount'],
  ['securityDeposit', 'securityDepositPct', 'securityDepositAmount'],
  ['advanceRecovery', 'advanceRecoveryPct', 'advanceRecoveryAmount'],
  ['tds', 'tdsPct', 'tdsAmount'],
  ['gstTds', 'gstTdsPct', 'gstTdsAmount'],
  ['labourCess', 'labourCessPct', 'labourCessAmount'],
] as const;

/** The deduction percentages and GST, and the secured advance's % (null when the contract gives none). */
export type Percentages = Record<(typeof PCT_DEDUCTIONS)[number][1] | 'gstRate', Prisma.Decimal> & { securedAdvancePct: Prisma.Decimal | null };

/** One price variation component on a bill: a share of the work value that moves with an index. */
interface PvLine {
  sharePct: Prisma.Decimal;
  baseIndex: Prisma.Decimal;
  currentIndex: Prisma.Decimal;
}

/** Work value × share % × (current − base) / base, to the paisa. Negative when the index fell. */
export const pvLineAmount = (work: Prisma.Decimal, l: PvLine) => round2(work.mul(l.sharePct).div(100).mul(l.currentIndex.sub(l.baseIndex)).div(l.baseIndex));

export interface Line {
  boqItemId: string;
  boqQty: Prisma.Decimal;
  rate: Prisma.Decimal;
  prevQty: Prisma.Decimal;
  thisQty: Prisma.Decimal;
  uptoQty: Prisma.Decimal;
  certifiedQty: Prisma.Decimal | null;
  sortOrder: number;
}

/** What a bill's advance recovery and stage billing read from the project. */
export const TERMS_SELECT = { mobilisationAdvance: true, contractValue: true, advanceRecoveryFromPct: true, advanceRecoveryToPct: true, securityDepositCapPct: true } satisfies Prisma.ProjectSelect;
export type Terms = Prisma.ProjectGetPayload<{ select: typeof TERMS_SELECT }>;

/** The project's percentages and terms a bill is priced with. */
export const BILL_TERMS_SELECT = { contractModel: true, tenderFactor: true, retentionPct: true, securityDepositPct: true, advanceRecoveryPct: true, tdsPct: true, gstTdsPct: true, labourCessPct: true, gstRate: true, securedAdvancePct: true, ...TERMS_SELECT } satisfies Prisma.ProjectSelect;

/**
 * Take the approved measurements up to the bill's date that no earlier bill took (not extra items waiting for their
 * variation, nor the lump-sum items a break-up pays by stages) and make its lines: previous, this bill and up to date per
 * BOQ item, unit-rate items of a lump-sum contract at rate × the tender factor.
 */
export async function measuredLines(
  tx: Prisma.TransactionClient,
  bill: { id: string; projectId: string; billNo: number; measuredUpTo: Date },
  plan: BillStagePlan | null,
  contract: { contractModel: ContractModel; tenderFactor: Prisma.Decimal | null } | null = null,
): Promise<Line[]> {
  const id = bill.id;
  await tx.measurementSheet.updateMany({ where: { raBillId: id }, data: { raBillId: null } });
  // Extra items (no BOQ quantity) wait for the client's approved variation before they are billed.
  await tx.measurementSheet.updateMany({
    where: { projectId: bill.projectId, status: 'APPROVED', raBillId: null, date: { lte: bill.measuredUpTo }, boqItem: BILLABLE_BOQ_ITEM, ...(plan ? { boqItemId: { notIn: plan.lumpSumBoqItemIds } } : {}) },
    data: { raBillId: id },
  });
  const earlier = { projectId: bill.projectId, billNo: { lt: bill.billNo } };
  const [measured, billed, boq] = await Promise.all([
    tx.measurementSheet.groupBy({ by: ['boqItemId'], where: { OR: [{ raBillId: id }, { raBill: earlier }] }, _sum: { totalQty: true } }),
    tx.raBillItem.findMany({ where: { bill: earlier }, select: { boqItemId: true, thisQty: true, certifiedQty: true } }),
    tx.boqItem.findMany({ where: { projectId: bill.projectId }, orderBy: [{ sortOrder: 'asc' }, { itemNo: 'asc' }] }),
  ]);
  const upto = new Map(measured.map((m) => [m.boqItemId, m._sum.totalQty ?? ZERO]));
  const prev = new Map<string, Prisma.Decimal>();
  for (const b of billed) prev.set(b.boqItemId, (prev.get(b.boqItemId) ?? ZERO).add(b.certifiedQty ?? b.thisQty));
  const lines: Line[] = [];
  boq.forEach((b, i) => {
    const uptoQty = upto.get(b.id) ?? ZERO;
    const prevQty = prev.get(b.id) ?? ZERO;
    if (uptoQty.lte(0) && prevQty.isZero()) return;
    const rate = billRate(b, plan, contract);
    lines.push({ boqItemId: b.id, boqQty: b.revisedQty ?? b.originalQty, rate, prevQty, thisQty: uptoQty.sub(prevQty), uptoQty, certifiedQty: null, sortOrder: i });
  });
  return lines;
}

/**
 * The rate a BOQ item is billed at: × the tender factor for a lump-sum contract's unit-rate items, and for every item of
 * an item-rate contract's BOQ as tendered when it was won at a premium above or below the schedule of rates
 * (`takesTenderFactor`); else the BOQ rate.
 */
export function billRate(b: { id: string; rate: Prisma.Decimal; originalQty: Prisma.Decimal }, plan: BillStagePlan | null, contract: { contractModel: ContractModel; tenderFactor: Prisma.Decimal | null } | null): Prisma.Decimal {
  const factor = plan ? plan.tenderFactor : (contract?.tenderFactor ?? null);
  if (!factor || factor.eq(1)) return b.rate;
  const takes = plan ? plan.unitRateBoqItemIds.has(b.id) : !!contract && takesTenderFactor(contract.contractModel, { originalQty: b.originalQty.toNumber(), unitRate: false });
  return takes ? round2(b.rate.mul(factor)) : b.rate;
}

/** The tender factor an item-rate bill was priced with, kept on the bill so its print says so; null when none. */
export const itemRateFactor = (plan: BillStagePlan | null, contract: { contractModel: ContractModel; tenderFactor: Prisma.Decimal | null }) =>
  !plan && contract.tenderFactor && !contract.tenderFactor.eq(1) && !billsByStages(contract.contractModel) ? contract.tenderFactor : null;

/**
 * Work value, price variation, GST, deductions and net payable of a set of lines priced on certified (else claimed)
 * quantities, with the stages' amounts and the slippage withheld. GST and the deductions are on work value +
 * price variation. A works bill also deducts what the contract's missed obligations cost as of its date, and holds the
 * security deposit to its cap. The secured advance on material at site and the amounts released from earlier holds are
 * added after GST, and the previous bill's secured advance and this bill's holds deducted, all outside that base: none is
 * a supply.
 */
export async function billTotals(
  tx: Prisma.TransactionClient,
  bill: { id: string; projectId: string; billNo: number; billDate: Date; otherDeduction: Prisma.Decimal },
  lines: Line[],
  pcts: Percentages,
  terms: Terms,
  plan: BillStagePlan | null,
  om: OmPricing | null = null,
) {
  // An O&M bill recovers no mobilisation advance: that belonged to the works.
  const advance = om ? ZERO : terms.mobilisationAdvance;
  const amounts = lines.map((l) => round2((l.certifiedQty ?? l.thisQty).mul(l.rate)));
  const grossAmount = amounts.reduce((s, a) => s.add(a), plan?.stageAmount ?? om?.amount ?? ZERO);
  const grossPrevious = lines.reduce((s, l) => s.add(round2(l.prevQty.mul(l.rate))), plan?.stagePrevious ?? om?.previous ?? ZERO);
  const [recovered, pvLines, obligations, atSite, previousBill, held, released] = await Promise.all([
    tx.raBill.aggregate({ where: { projectId: bill.projectId, billNo: { lt: bill.billNo } }, _sum: { advanceRecoveryAmount: true, securityDepositAmount: true } }),
    tx.raBillPvLine.findMany({ where: { billId: bill.id }, select: { id: true, sharePct: true, baseIndex: true, currentIndex: true } }),
    // An O&M bill takes no works obligations: those belonged to the construction contract.
    om ? null : obligationRecovery(tx, bill, terms.contractValue),
    tx.raBillSecuredAdvance.findMany({ where: { billId: bill.id }, orderBy: { sortOrder: 'asc' }, select: { id: true, description: true, unit: true, qtyAtSite: true, rate: true } }),
    tx.raBill.findFirst({ where: { projectId: bill.projectId, billNo: bill.billNo - 1 }, select: { securedAdvance: true } }),
    tx.raBillHold.aggregate({ where: { billId: bill.id }, _sum: { amount: true } }),
    tx.raBillHoldRelease.aggregate({ where: { billId: bill.id }, _sum: { amount: true } }),
  ]);
  const secured = securedAdvanceOf({
    pct: om ? null : (pcts.securedAdvancePct?.toString() ?? null),
    lines: om ? [] : atSite.map((l) => ({ ...l, qtyAtSite: l.qtyAtSite.toString(), rate: l.rate.toString() })),
    previous: previousBill?.securedAdvance.toString() ?? 0,
  });
  for (const [i, l] of secured.lines.entries()) await tx.raBillSecuredAdvance.update({ where: { id: atSite[i].id }, data: { value: D(l.value.toFixed(2)), advance: D(l.advance.toFixed(2)) } });
  const securedAdvance = D(secured.securedAdvance.toFixed(2));
  const securedAdvanceRecovered = D(secured.recovered.toFixed(2));
  const withheld = held._sum.amount ?? ZERO;
  const withheldReleased = released._sum.amount ?? ZERO;
  const outstanding = Prisma.Decimal.max(advance.sub(recovered._sum.advanceRecoveryAmount ?? ZERO), ZERO);
  const pvAmounts = pvLines.map((l) => ({ id: l.id, amount: pvLineAmount(grossAmount, l) }));
  const pvAmount = pvAmounts.reduce((s, l) => s.add(l.amount), ZERO);
  for (const l of pvAmounts) await tx.raBillPvLine.update({ where: { id: l.id }, data: { amount: l.amount } });
  const base = Prisma.Decimal.max(grossAmount.add(pvAmount), ZERO);
  // A recovery window recovers the advance between two % of the contract executed, else a % of each bill.
  const windowed =
    !om && terms.advanceRecoveryFromPct && terms.advanceRecoveryToPct && terms.contractValue
      ? windowRecovery({ advance, contractValue: terms.contractValue, executedUpto: grossPrevious.add(grossAmount), fromPct: terms.advanceRecoveryFromPct, toPct: terms.advanceRecoveryToPct, recoveredBefore: recovered._sum.advanceRecoveryAmount ?? ZERO })
      : null;
  const slippageWithheld = plan?.slippageWithheld ?? ZERO;
  const data = {
    grossPrevious,
    grossAmount,
    grossUpto: grossPrevious.add(grossAmount),
    pvAmount,
    gstRate: pcts.gstRate,
    gstAmount: pctOf(base, pcts.gstRate),
    retentionPct: pcts.retentionPct,
    securityDepositPct: pcts.securityDepositPct,
    advanceRecoveryPct: windowed ? (base.gt(0) ? windowed.mul(100).div(base).toDecimalPlaces(2) : ZERO) : pcts.advanceRecoveryPct,
    tdsPct: pcts.tdsPct,
    gstTdsPct: pcts.gstTdsPct,
    labourCessPct: pcts.labourCessPct,
    retentionAmount: pctOf(base, pcts.retentionPct),
    securityDepositAmount: D(
      cappedSecurityDeposit(
        pctOf(base, pcts.securityDepositPct).toNumber(),
        terms.securityDepositCapPct ? terms.securityDepositCapPct.toNumber() : null,
        Number(terms.contractValue ?? 0),
        grossPrevious.add(grossAmount).toNumber(),
        Number(recovered._sum.securityDepositAmount ?? 0),
      ),
    ),
    advanceRecoveryAmount: windowed ?? Prisma.Decimal.min(pctOf(base, pcts.advanceRecoveryPct), outstanding),
    tdsAmount: pctOf(base, pcts.tdsPct),
    gstTdsAmount: pctOf(base, pcts.gstTdsPct),
    labourCessAmount: pctOf(base, pcts.labourCessPct),
  };
  const omPenalty = om?.penalty ?? ZERO;
  const obligationAmount = obligations?.total ?? ZERO;
  const totalDeductions = PCT_DEDUCTIONS.reduce((s, [, , k]) => s.add(data[k]), ZERO)
    .add(bill.otherDeduction)
    .add(slippageWithheld)
    .add(omPenalty)
    .add(obligationAmount)
    .add(securedAdvanceRecovered)
    .add(withheld);
  const slippageLines = (plan?.slippageLines ?? []) as unknown as Prisma.InputJsonValue;
  const obligationLines = (obligations?.lines ?? []) as unknown as Prisma.InputJsonValue;
  return {
    amounts,
    data: {
      ...data,
      slippageWithheld,
      slippageLines,
      omPenalty,
      obligationRecovery: obligationAmount,
      obligationLines,
      securedAdvancePct: om ? ZERO : (pcts.securedAdvancePct ?? ZERO),
      securedAdvance,
      securedAdvanceRecovered,
      withheld,
      withheldReleased,
      totalDeductions,
      netPayable: grossAmount.add(pvAmount).add(data.gstAmount).add(securedAdvance).add(withheldReleased).sub(totalDeductions),
    },
  };
}

/** Write a priced bill: its lines, its stage lines and its totals. */
export async function writeBill(tx: Prisma.TransactionClient, id: string, lines: Line[], amounts: Prisma.Decimal[], data: Awaited<ReturnType<typeof billTotals>>['data'], plan: BillStagePlan | null) {
  await tx.raBillItem.deleteMany({ where: { billId: id } });
  await tx.raBillItem.createMany({ data: lines.map((l, i) => ({ ...l, billId: id, amount: amounts[i] })) });
  await tx.raBillStageLine.deleteMany({ where: { billId: id } });
  if (plan) await tx.raBillStageLine.createMany({ data: plan.lines.map((l) => ({ ...l, billId: id })) });
  await tx.raBill.update({ where: { id }, data });
}
