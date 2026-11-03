import type { LetterheadDto, StockEntryDto, StockEntryType } from '@erp/shared';
import { GRN_QC_STATUS_LABELS, STOCK_ADJUSTMENT_REASON_LABELS, unitLabel } from '@erp/shared';
import { esc, metaItem, openPrintWindow, printDocHtml, signLine } from '@/components/print/printDoc';
import { formatDate, formatQty, toNumber } from '@/lib/format';

/** The paper each kind of entry prints as. */
export const STOCK_PAPER_TITLES: Record<StockEntryType, string> = {
  RECEIPT: 'Goods received note',
  ISSUE: 'Material issue slip',
  RETURN_FROM_SITE: 'Material return note',
  TRANSFER_OUT: 'Transfer challan',
  TRANSFER_IN: 'Transfer receipt',
  RETURN_TO_VENDOR: 'Return to vendor',
  ADJUSTMENT: 'Stock adjustment',
};

/** Who signs each kind: the store's own copy for the audit file. */
function signsFor(e: StockEntryDto): string[] {
  switch (e.type) {
    case 'RECEIPT':
      return [signLine('Received by', e.createdByName), signLine('Checked by QA/QC', e.qcByName), signLine("Supplier's driver or representative")];
    case 'ISSUE':
      return [signLine('Issued by', e.createdByName), signLine('Received by', e.issuedTo), signLine('Site engineer')];
    case 'RETURN_FROM_SITE':
      return [signLine('Returned by', e.issuedTo), signLine('Received into store by', e.createdByName)];
    case 'TRANSFER_OUT':
      return [
        signLine('Sent by', e.createdByName),
        signLine('Driver', e.vehicleNo ? `Vehicle ${e.vehicleNo}` : null),
        signLine(`Received at ${e.toProjectName ?? 'destination'}`),
      ];
    case 'TRANSFER_IN':
      return [signLine('Received by', e.createdByName), signLine('Driver')];
    case 'RETURN_TO_VENDOR':
      return [signLine('Sent back by', e.createdByName), signLine("Supplier's acknowledgement", e.supplier)];
    default:
      return [signLine('Prepared by', e.createdByName), signLine('Approved by')];
  }
}

/**
 * A GRN, issue slip, return or transfer challan as the store files it: what came in or went out, from whom or to where,
 * each item's quantity (on a receipt, what QA/QC accepted and rejected), and the signatures the kind needs.
 */
export function buildStockEntryPrintHtml(e: StockEntryDto, letterhead: LetterheadDto): string {
  const receipt = e.type === 'RECEIPT';
  const checked = receipt && !!e.qcStatus;
  const rows = e.lines
    .map((l, n) => {
      const qty = Math.abs(toNumber(l.quantity));
      const rejected = toNumber(l.rejectedQty ?? 0);
      return `<tr><td class="c">${n + 1}</td><td>${esc(l.itemName)}</td><td class="c">${esc(unitLabel(l.unit))}</td><td class="num">${e.type === 'ADJUSTMENT' && toNumber(l.quantity) < 0 ? '-' : ''}${esc(formatQty(qty))}</td>${
        checked ? `<td class="num">${esc(formatQty(qty - rejected))}</td><td class="num">${rejected ? esc(formatQty(rejected)) : ''}</td>` : ''
      }</tr>`;
    })
    .join('');
  const facts = [
    e.supplier ? metaItem(e.type === 'RETURN_TO_VENDOR' ? 'To' : 'Supplier', esc(e.supplier)) : '',
    e.poNo ? metaItem('Purchase order', esc(e.poNo)) : '',
    e.requestNo ? metaItem('Indent', esc(e.requestNo)) : '',
    e.challanNo ? metaItem('Challan / invoice', esc(e.challanNo)) : '',
    e.vehicleNo ? metaItem('Vehicle', esc(e.vehicleNo)) : '',
    e.issuedTo && e.type !== 'RECEIPT' ? metaItem(e.type === 'RETURN_FROM_SITE' ? 'Returned by' : 'Issued to', esc(e.issuedTo)) : '',
    e.woNo ? metaItem('Work order', esc(e.woNo)) : '',
    e.activityName ? metaItem('For', esc(e.activityName)) : '',
    e.workElementLabel ? metaItem('Where', esc(e.workElementLabel)) : '',
    e.toProjectName ? metaItem('To', esc(e.toProjectName)) : '',
    e.fromProjectName ? metaItem('From', `${esc(e.fromProjectName)}${e.transferOutNo ? ` (${esc(e.transferOutNo)})` : ''}`) : '',
    e.equipmentCode ? metaItem('Machine', `${esc(e.equipmentCode)}${e.meterReading ? `, meter ${esc(formatQty(e.meterReading))}` : ''}`) : '',
    e.adjustmentReason ? metaItem('Reason', esc(STOCK_ADJUSTMENT_REASON_LABELS[e.adjustmentReason])) : '',
    e.mtcNo ? metaItem("Maker's test certificate", `${esc(e.mtcNo)}${e.mtcDate ? `, ${esc(formatDate(e.mtcDate))}` : ''}`) : '',
    checked ? metaItem('QA/QC', `${esc(GRN_QC_STATUS_LABELS[e.qcStatus!])}${e.qcAt ? `, ${esc(formatDate(e.qcAt.slice(0, 10)))}` : ''}`) : '',
  ].filter(Boolean);
  const body = `
  ${facts.length ? `<div class="meta">${facts.join('')}</div>` : ''}
  <table>
    <thead><tr><th class="c">#</th><th>Item</th><th class="c">Unit</th><th class="num">Quantity</th>${checked ? '<th class="num">Accepted</th><th class="num">Rejected</th>' : ''}</tr></thead>
    <tbody>${rows}</tbody>
  </table>
  ${receipt && !checked ? '<p class="muted">Not yet checked by QA/QC.</p>' : ''}
  ${e.qcNote ? `<h2>QA/QC note</h2><p class="note">${esc(e.qcNote)}</p>` : ''}
  ${e.remarks ? `<h2>Remarks</h2><p class="note">${esc(e.remarks)}</p>` : ''}`;
  return printDocHtml({
    letterhead,
    under: e.projectName,
    title: STOCK_PAPER_TITLES[e.type],
    number: e.entryNo,
    date: formatDate(e.date),
    body,
    signs: signsFor(e),
  });
}

export const openStockEntryPrint = (e: StockEntryDto, l: LetterheadDto) => openPrintWindow(buildStockEntryPrintHtml(e, l));
