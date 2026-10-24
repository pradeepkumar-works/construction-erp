import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { OmBillDto } from '@erp/shared';
import type { OmPricing, Percentages } from '../ra-bills/ra-bill-pricing';
import { loadOm, priceOmPeriod } from './om-load';
import { addMonths, type OmBillDetail } from './om-rules';

/*
 * An O&M bill (item 131) is an RA bill with `omYear` and `omInstalment`: receipts, receivables, the books, Tally and the
 * client portal take it like any other bill. `RaBillsService` prices it here instead of from measurements.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const ZERO = D(0);
const money = (v: number) => v.toFixed(2);

/**
 * The deductions an O&M bill takes: GST, TDS and GST TDS as the contract has them; no retention, security deposit,
 * labour cess or advance recovery, which belonged to the works.
 */
export function omPercentages(p: Percentages): Percentages {
  return { ...p, retentionPct: ZERO, securityDepositPct: ZERO, advanceRecoveryPct: ZERO, labourCessPct: ZERO };
}

/** Price an O&M bill from its period's records, as of the day after the period (all of it over). */
export async function omPricing(tx: Prisma.TransactionClient, bill: { projectId: string; billNo: number; omYear: number; omInstalment: number }): Promise<{ pricing: OmPricing; detail: OmBillDetail }> {
  const om = await loadOm(tx, bill.projectId);
  const period = om?.periods.find((p) => p.year === bill.omYear && p.instalment === bill.omInstalment);
  if (!om || !period) throw new BadRequestException('This O&M bill’s period is no longer in the O&M contract');
  const [{ gross, penalty, detail }, before] = await Promise.all([
    priceOmPeriod(tx, om, bill.projectId, period, addMonths(period.from, 12 / om.contract.instalmentsPerYear)),
    tx.raBill.aggregate({ where: { projectId: bill.projectId, billNo: { lt: bill.billNo }, omYear: { not: null } }, _sum: { grossAmount: true } }),
  ]);
  return { pricing: { amount: D(gross), previous: before._sum.grossAmount ?? ZERO, penalty: D(penalty) }, detail };
}

/** A priced O&M bill's figures as stored, for re-pricing it at its certificate. */
export const storedOmPricing = (b: { grossAmount: Prisma.Decimal; grossPrevious: Prisma.Decimal; omPenalty: Prisma.Decimal }): OmPricing => ({
  amount: b.grossAmount,
  previous: b.grossPrevious,
  penalty: b.omPenalty,
});

/** What the bill shows of its period. */
export function omBillDto(b: { omYear: number | null; omInstalment: number | null; omDetail: Prisma.JsonValue }): OmBillDto | null {
  if (b.omYear === null || b.omInstalment === null || !b.omDetail) return null;
  const d = b.omDetail as unknown as OmBillDetail;
  return {
    year: b.omYear,
    instalment: b.omInstalment,
    label: d.label,
    from: d.from,
    to: d.to,
    yearPct: String(d.yearPct),
    instalmentAmount: money(d.instalment),
    staffDeduction: money(d.staffDeduction),
    penalty: money(d.penalty),
    staff: d.staff.map((l) => ({ ...l, deduction: money(l.deduction) })),
    penalties: d.penalties.map((p) => ({ ...p, amount: money(p.amount) })),
    missingDays: d.missingDays,
    staffNotRecorded: d.staffNotRecorded,
  };
}
