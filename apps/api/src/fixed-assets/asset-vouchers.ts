import { Prisma } from '@prisma/client';
import { ASSET_CLASSES, disposalResult, tallyVendorKey, type AssetClassCode, type AssetFunding } from '@erp/shared';
import { Lines, moneyLedger, type LedgerName, type Line } from '../tally/vouchers';

const FUNDING_LEDGER: Record<Exclude<AssetFunding, 'VENDOR' | 'IN_BOOKS'>, string> = { BANK: 'BANK', CASH: 'CASH', MACHINE_LOAN: 'MACHINERY' };

/**
 * An asset's cost into its class's ledger, against what paid for it. None when it is in the books already, or when a
 * machine loan booked it to Plant and Machinery and that is its class's ledger too.
 */
export function additionLines(name: LedgerName, a: { assetClass: string; cost: Prisma.Decimal.Value; fundedBy: AssetFunding; vendorId: string | null; vendorName: string | null }): Line[] | null {
  if (a.fundedBy === 'IN_BOOKS') return null;
  const ledger = ASSET_CLASSES[a.assetClass as AssetClassCode].ledger;
  const from = a.fundedBy === 'VENDOR' ? tallyVendorKey(a.vendorId!) : FUNDING_LEDGER[a.fundedBy];
  if (from === ledger) return null;
  return new Lines(name).dr(ledger, a.cost).cr(from, a.cost, a.fundedBy === 'VENDOR' ? { fallback: a.vendorName ?? undefined, party: true } : {}).lines;
}

export const depreciationLines = (name: LedgerName, total: Prisma.Decimal.Value) => new Lines(name).dr('DEPRECIATION', total).cr('ACCUMULATED_DEPRECIATION', total).lines;

/** A sale or scrapping: the money in, the depreciation charged and any loss against the cost, any profit on top. */
export function disposalLines(name: LedgerName, a: { assetClass: string; cost: Prisma.Decimal.Value; accumulated: Prisma.Decimal.Value; proceeds: Prisma.Decimal.Value; mode: string }): Line[] {
  const r = disposalResult({ cost: Number(a.cost), accumulated: Number(a.accumulated), proceeds: Number(a.proceeds) });
  return new Lines(name)
    .dr(moneyLedger(a.mode), a.proceeds)
    .dr('ACCUMULATED_DEPRECIATION', a.accumulated)
    .dr('ASSET_SALE_LOSS', r.loss)
    .cr(ASSET_CLASSES[a.assetClass as AssetClassCode].ledger, a.cost)
    .cr('ASSET_SALE_PROFIT', r.gain).lines;
}
