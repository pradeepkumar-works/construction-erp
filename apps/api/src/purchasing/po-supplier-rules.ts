import { PRODUCT_NAME } from '@erp/shared';
import { escapeHtml } from '../notifications/email.service';
import { EMAIL_COLORS, emailButton, emailLayout } from '../notifications/email-layout';

/** Shortest reason accepted for ordering from a vendor who is not the lowest complete quotation. */
export const SELECTION_REASON_MIN = 10;

const money = (v: string | number) => `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qty = (v: string | number) => Number(v).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const date = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/**
 * Why an order cannot go for approval as it stands, or null. When the request has a quotation pricing every line, an
 * order that is not from the lowest of them (by total with GST and freight, as the comparative statement ranks them)
 * says why it goes to this vendor: delivery, quality, credit terms, the lowest one's stock. One from the lowest, or on a
 * request with no complete quotation, needs nothing.
 */
export function selectionProblem(
  lowest: { id: string; vendorName: string; total: string } | null,
  order: { quotationId: string | null; vendorName: string },
  reason: string | null | undefined,
): string | null {
  if (!lowest || order.quotationId === lowest.id) return null;
  if ((reason ?? '').trim().length >= SELECTION_REASON_MIN) return null;
  return `${lowest.vendorName} quoted lowest (${money(lowest.total)}). Say why this order goes to ${order.vendorName} instead, in a sentence.`;
}

export interface PoEmailInput {
  orgName: string;
  poNo: string;
  poDate: string;
  vendorName: string;
  contactPerson: string | null;
  projectName: string;
  requestNo: string | null;
  deliveryBy: string | null;
  deliveryAddress: string | null;
  paymentTerms: string | null;
  paymentDays: number | null;
  remarks: string | null;
  subtotal: string;
  gstAmount: string;
  freight: string;
  total: string;
  lines: { itemName: string; specification: string | null; make: string | null; unit: string; quantity: string; rate: string; gstRate: string; amount: string }[];
  /** Who to write to about it: whoever raised the order. */
  buyer: { name: string; email: string | null; phone: string | null };
  /** The supplier portal's orders page, when the vendor has a login there; else they confirm with the buyer. */
  portalUrl: string | null;
}

/**
 * The approved order as the vendor reads it in their inbox: the same header, items, totals and terms as the printed PO,
 * so the email itself is the order (it prints to a PDF from any mail app). With a portal login the button takes them
 * to accept it there; without one they confirm with the buyer.
 */
export function poEmail(o: PoEmailInput): { subject: string; html: string; text: string } {
  const payment = o.paymentTerms ?? (o.paymentDays !== null ? `${o.paymentDays} days from invoice` : 'As agreed');
  const deliverBy = o.deliveryBy ? date(o.deliveryBy) : 'As agreed';
  const deliverTo = o.deliveryAddress ?? o.projectName;
  const terms = [
    'Quote this PO number on the delivery challan and the invoice.',
    'Material is accepted after inspection at site; quantity is as received at site.',
    'The invoice must show our GSTIN and the HSN code of each item.',
    ...(o.remarks ? [o.remarks] : []),
  ];
  const contact = [o.buyer.name, o.buyer.email, o.buyer.phone].filter(Boolean).join(', ');
  const lead = `${o.orgName} has placed purchase order ${o.poNo} with ${o.vendorName} for ${o.projectName}, for ${money(o.total)} including GST.`;
  const confirm = o.portalUrl ? 'Please accept it on the supplier portal, where you can also send dispatch notes and invoices against it.' : `Please confirm it with ${contact}.`;

  const cell = `padding:6px 8px;border-bottom:1px solid ${EMAIL_COLORS.border};vertical-align:top`;
  const num = `${cell};text-align:right;white-space:nowrap`;
  const small = `color:${EMAIL_COLORS.muted};font-size:13px`;
  const rows = o.lines
    .map((l) => {
      const detail = [l.make ? `Make: ${l.make}` : null, l.specification].filter(Boolean).join(' · ');
      return `<tr><td style="${cell}">${escapeHtml(l.itemName)}${detail ? `<br><span style="${small}">${escapeHtml(detail)}</span>` : ''}</td><td style="${num}">${escapeHtml(qty(l.quantity))} ${escapeHtml(l.unit)}<br><span style="${small}">@ ${escapeHtml(money(l.rate))} + ${escapeHtml(l.gstRate)}% GST</span></td><td style="${num}">${escapeHtml(money(l.amount))}</td></tr>`;
    })
    .join('');
  const sumRow = (label: string, v: string, strong = false) =>
    `<tr><td style="padding:4px 8px;text-align:right${strong ? ';font-weight:700' : ''}">${escapeHtml(label)}</td><td style="padding:4px 8px;text-align:right;white-space:nowrap${strong ? ';font-weight:700' : ''}">${escapeHtml(money(v))}</td></tr>`;
  const fact = (label: string, v: string) => `<tr><td style="padding:2px 12px 2px 0;${small};white-space:nowrap;vertical-align:top">${escapeHtml(label)}</td><td style="padding:2px 0">${escapeHtml(v)}</td></tr>`;
  const html = emailLayout({
    preheader: lead,
    orgName: o.orgName,
    body:
      `<p style="margin:0 0 12px">Hello ${escapeHtml(o.contactPerson || o.vendorName)},</p><p style="margin:0 0 16px">${escapeHtml(lead)}</p>` +
      `<p style="margin:0 0 4px;font-size:18px;font-weight:700">Purchase order ${escapeHtml(o.poNo)}</p>` +
      `<table role="presentation" style="border-collapse:collapse;margin:0 0 16px">${fact('Date', date(o.poDate))}${fact('Deliver to', deliverTo)}${fact('Deliver by', deliverBy)}${fact('Payment', payment)}${o.requestNo ? fact('Our reference', `Material request ${o.requestNo}`) : ''}</table>` +
      `<table role="presentation" style="border-collapse:collapse;width:100%;margin:0 0 8px"><tr><th style="${cell};text-align:left;${small}">Item</th><th style="${num};${small}">Quantity and rate</th><th style="${num};${small}">Amount</th></tr>${rows}</table>` +
      `<table role="presentation" style="border-collapse:collapse;margin:0 0 16px auto">${sumRow('Items', o.subtotal)}${sumRow('GST', o.gstAmount)}${Number(o.freight) > 0 ? sumRow('Freight', o.freight) : ''}${sumRow('Order total', o.total, true)}</table>` +
      `<p style="margin:0 0 4px;font-weight:700">Terms</p><ol style="margin:0 0 16px;padding-left:20px">${terms.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ol>` +
      `<p style="margin:0">${escapeHtml(confirm)}</p>` +
      (o.portalUrl ? emailButton(o.portalUrl, 'Accept on the supplier portal') : ''),
    footnote: `Questions about this order: ${escapeHtml(contact)}. Sent from ${escapeHtml(PRODUCT_NAME)}; replies to this address are not read.`,
  });
  const text = [
    `Hello ${o.contactPerson || o.vendorName},`,
    '',
    lead,
    '',
    `Purchase order ${o.poNo}, ${date(o.poDate)}`,
    `Deliver to: ${deliverTo}`,
    `Deliver by: ${deliverBy}`,
    `Payment: ${payment}`,
    ...(o.requestNo ? [`Our reference: material request ${o.requestNo}`] : []),
    '',
    ...o.lines.map((l) => `- ${l.itemName}${l.make ? ` (make ${l.make})` : ''}: ${qty(l.quantity)} ${l.unit} @ ${money(l.rate)} + ${l.gstRate}% GST = ${money(l.amount)}`),
    '',
    `Items ${money(o.subtotal)}, GST ${money(o.gstAmount)}${Number(o.freight) > 0 ? `, freight ${money(o.freight)}` : ''}, order total ${money(o.total)}`,
    '',
    'Terms:',
    ...terms.map((t, i) => `${i + 1}. ${t}`),
    '',
    confirm,
    ...(o.portalUrl ? [o.portalUrl] : []),
    '',
    `Questions about this order: ${contact}. Replies to this address are not read.`,
  ].join('\n');
  return { subject: `[${o.orgName}] Purchase order ${o.poNo}`, html, text };
}
