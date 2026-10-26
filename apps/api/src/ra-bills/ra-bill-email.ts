import { escapeHtml } from '../notifications/email.service';
import { EMAIL_COLORS, emailButton, emailLayout } from '../notifications/email-layout';

/** Items printed in the email; beyond this it names the rest and leaves them to the portal, so the mail stays readable. */
export const BILL_EMAIL_ITEMS = 40;

/** "₹1,83,600.00", and "-₹1,83,600.00" rather than "₹-1,83,600.00" for a deduction or a fall in the indices. */
const money = (v: string | number) => {
  const n = Number(v);
  return `${n < 0 ? '-' : ''}₹${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const qty = (v: string | number) => Number(v).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const date = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export interface BillEmailInput {
  orgName: string;
  /** "RA bill 3", or "RA bill 7 (final)" */
  billLabel: string;
  billDate: string;
  /** The last day of work the bill measures */
  measuredUpTo: string;
  projectCode: string;
  projectName: string;
  clientName: string | null;
  /** Who the email greets, when we know their name */
  contactPerson: string | null;
  agreementNo: string | null;
  /** Value of work in this bill, the price variation on it, and GST */
  grossAmount: string;
  pvAmount: string;
  gstRate: string;
  gstAmount: string;
  /** Work value up to and including this bill */
  grossUpto: string;
  /** Retention, TDS, cess and the rest, zero ones already left out */
  deductions: { label: string; amount: string }[];
  netPayable: string;
  /** Item number, description, unit, this bill's quantity, rate and amount, in the bill's order */
  items: { itemNo: string; description: string; unit: string; thisQty: string; rate: string; amount: string }[];
  /** Days from the certificate to the payment, from the contract; null when the contract is silent */
  paymentDays: number | null;
  /** The client portal's page for this bill, when the reader has a login there; else they reply to the QS */
  portalUrl: string | null;
  /** Who to ask about it: whoever prepared the bill */
  preparedBy: { name: string; email: string | null; phone: string | null };
}

/**
 * The bill as the client's engineer reads it in their inbox (finding 18 of the October review): the same items,
 * quantities, rates and deductions as the printed bill, so the email itself is the bill and prints to a PDF from any
 * mail app. The button takes them to the portal to check the measurements and certify it; without a login there they
 * reply to the QS who prepared it.
 */
export function billEmail(b: BillEmailInput): { subject: string; html: string; text: string } {
  const shown = b.items.slice(0, BILL_EMAIL_ITEMS);
  const rest = b.items.length - shown.length;
  const contact = [b.preparedBy.name, b.preparedBy.email, b.preparedBy.phone].filter(Boolean).join(', ');
  const lead = `${b.orgName} has sent ${b.billLabel} for ${b.projectName} (${b.projectCode}), for work measured up to ${date(b.measuredUpTo)}. Net payable is ${money(b.netPayable)}.`;
  const next = b.portalUrl
    ? 'Open it on the portal to check the measurements item by item and record your certificate.'
    : `Please check it and reply to ${contact} with your certificate.`;

  const cell = `padding:6px 8px;border-bottom:1px solid ${EMAIL_COLORS.border};vertical-align:top`;
  const num = `${cell};text-align:right;white-space:nowrap`;
  const small = `color:${EMAIL_COLORS.muted};font-size:13px`;
  const rows = shown
    .map(
      (i) =>
        `<tr><td style="${cell}">${escapeHtml(i.itemNo)}. ${escapeHtml(i.description)}</td><td style="${num}">${escapeHtml(qty(i.thisQty))} ${escapeHtml(i.unit)}<br><span style="${small}">@ ${escapeHtml(money(i.rate))}</span></td><td style="${num}">${escapeHtml(money(i.amount))}</td></tr>`,
    )
    .join('');
  const more = rest > 0 ? `<tr><td colspan="3" style="${cell};${small}">and ${rest} more item${rest === 1 ? '' : 's'}, in the bill on the portal</td></tr>` : '';
  const sumRow = (label: string, v: string, strong = false) =>
    `<tr><td colspan="2" style="${num};${strong ? 'font-weight:700' : ''}">${escapeHtml(label)}</td><td style="${num};${strong ? 'font-weight:700' : ''}">${escapeHtml(money(v))}</td></tr>`;
  const sums = [
    sumRow('Value of work', b.grossAmount),
    ...(Number(b.pvAmount) !== 0 ? [sumRow('Price variation', b.pvAmount)] : []),
    sumRow(`GST ${b.gstRate}%`, b.gstAmount),
    ...b.deductions.map((d) => sumRow(`Less ${d.label.toLowerCase()}`, `-${d.amount}`)),
    sumRow('Net payable', b.netPayable, true),
  ].join('');

  const facts: [string, string][] = [
    ['Bill', `${b.billLabel}, dated ${date(b.billDate)}`],
    ['Project', `${b.projectName} (${b.projectCode})`],
    ...(b.clientName ? ([['Client', b.clientName]] as [string, string][]) : []),
    ...(b.agreementNo ? ([['Agreement', b.agreementNo]] as [string, string][]) : []),
    ['Measured up to', date(b.measuredUpTo)],
    ['Work value to date', money(b.grossUpto)],
    ...(b.paymentDays !== null ? ([['Payment', `${b.paymentDays} days from the certificate`]] as [string, string][]) : []),
  ];
  const factRows = facts
    .map(([k, v]) => `<tr><td style="${cell};${small};width:38%">${escapeHtml(k)}</td><td style="${cell}">${escapeHtml(v)}</td></tr>`)
    .join('');

  const html = emailLayout({
    preheader: `${b.billLabel}: net ${money(b.netPayable)} to certify`,
    orgName: b.orgName,
    footnote: 'You get this because you certify bills on this project. The bill and its measurements are on the portal.',
    body: `<p style="margin:0 0 12px">Hello${b.contactPerson ? ` ${escapeHtml(b.contactPerson)}` : ''},</p>
      <p style="margin:0 0 16px">${escapeHtml(lead)}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 20px">${factRows}</table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr><td style="${cell};${small}">Item</td><td style="${num};${small}">Quantity</td><td style="${num};${small}">Amount</td></tr>
        ${rows}${more}${sums}
      </table>
      <p style="margin:16px 0 0">${escapeHtml(next)}</p>
      ${b.portalUrl ? emailButton(b.portalUrl, 'Open the bill') : ''}
      <p style="margin:16px 0 0;${small}">Questions on the measurements: ${escapeHtml(contact)}.</p>`,
  });

  const text = [
    lead,
    '',
    ...facts.map(([k, v]) => `${k}: ${v}`),
    '',
    ...shown.map((i) => `${i.itemNo}. ${i.description} — ${qty(i.thisQty)} ${i.unit} @ ${money(i.rate)} = ${money(i.amount)}`),
    ...(rest > 0 ? [`and ${rest} more item${rest === 1 ? '' : 's'}, in the bill on the portal`] : []),
    '',
    `Value of work: ${money(b.grossAmount)}`,
    ...(Number(b.pvAmount) !== 0 ? [`Price variation: ${money(b.pvAmount)}`] : []),
    `GST ${b.gstRate}%: ${money(b.gstAmount)}`,
    ...b.deductions.map((d) => `Less ${d.label.toLowerCase()}: ${money(`-${d.amount}`)}`),
    `Net payable: ${money(b.netPayable)}`,
    '',
    next,
    ...(b.portalUrl ? [`Open the bill: ${b.portalUrl}`] : []),
    `Questions on the measurements: ${contact}.`,
  ].join('\n');

  return { subject: `${b.billLabel} for ${b.projectName}: ${money(b.netPayable)} to certify`, html, text };
}
