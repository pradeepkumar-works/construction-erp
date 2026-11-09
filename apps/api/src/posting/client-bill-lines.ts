import { Prisma } from '@prisma/client';
import { billOwed, type OwedColumns } from '../receivables/bill-settlement';
import { Lines, gstLines, type LedgerName, type Line } from '../tally/vouchers';

/**
 * An RA bill as a sale: Dr the client with what it owes on the bill (`billOwed`), Cr works receipts with the work value and
 * price variation, Cr output GST (CGST + SGST: works are supplied where the site is, which is where the contractor bills
 * from). The secured advance paid less the previous one recovered is a liability to the client until the material is
 * used (Cr, or Dr once less is at site); what the bill withheld less what it released is an asset until released (Dr,
 * or Cr once more is released). So the client's ledger and the receipts against it settle to the same amount.
 */
export function raBillSaleLines(name: LedgerName, b: OwedColumns, client: { key: string; name: string }): Line[] {
  const sale = b.grossAmount.add(b.pvAmount);
  const l = new Lines(name).dr(client.key, billOwed(b), { fallback: client.name, party: true }).cr('SALES', sale, { costCentre: true });
  gstLines(l, 'cr', 'OUTPUT', b.gstAmount, false);
  l.cr('SECURED_ADVANCE', b.securedAdvance.sub(b.securedAdvanceRecovered));
  l.dr('WITHHELD_BY_CLIENT', b.withheld.sub(b.withheldReleased));
  return l.lines;
}

/** A hold closed with part of it never to be paid: the lost amount is a deduction by the client, no longer withheld. */
export const holdLostLines = (name: LedgerName, lost: Prisma.Decimal): Line[] => new Lines(name).dr('CLIENT_DEDUCTIONS', lost, { costCentre: true }).cr('WITHHELD_BY_CLIENT', lost).lines;
