import type { LetterheadDto } from '@erp/shared';
import { GST_STATES } from '@erp/shared';
import { AUTO_PRINT_SCRIPT, brandFooter, PRINT_BRAND_CSS, PRINT_FONT_LINKS, PRINT, PRINT_FACE } from '@/components/print/printBrand';
import { BRAND } from '@/lib/brand';
import { formatDateTime, formatINR, RUPEE } from '@/lib/format';

/**
 * The frame every printed paper shares (a GRN, a permit, a measurement sheet, a tax invoice): the company's letterhead,
 * the paper's own name and number on the right, its body, the signature row and the Nirmaan footer. Each paper builds
 * only its body from these pieces, so the look stays the one `PRINT` and `PRINT_BRAND_CSS` set.
 */

export const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Rupees with paise and no sign, for a column headed (₹). */
export const inr = (v: string | number) => esc(formatINR(v, true).replace(RUPEE, ''));

/** The company's details for a print: the letterhead when it has loaded, else the name the session knows. */
export const letterheadOr = (l: LetterheadDto | undefined, orgName: string): LetterheadDto =>
  l ?? {
    name: orgName,
    legalName: null,
    address: null,
    gstin: null,
    pan: null,
    cin: null,
    stateCode: null,
  };

const STYLE = `
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: ${PRINT_FACE}; color: ${PRINT.text}; font-size: 11px; margin: 0; padding: 24px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; padding-bottom: 10px; margin-bottom: 12px; }
  .brand { font-size: 18px; color: ${PRINT.ink}; }
  .org { color: ${PRINT.muted}; font-size: 10px; line-height: 1.5; }
  .doc { text-align: right; }
  h1 { font-size: 16px; margin: 0 0 2px; }
  h2 { font-size: 11px; text-transform: uppercase; color: ${PRINT.ink}; border-bottom: 1px solid ${PRINT.hairline}; margin: 14px 0 6px; padding-bottom: 3px; }
  .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px 16px; margin-bottom: 12px; }
  .meta .k { display: block; font-size: 9px; color: ${PRINT.muted}; text-transform: uppercase; letter-spacing: .04em; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  th, td { border: 1px solid ${PRINT.border}; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: ${PRINT.canvas}; font-size: 10px; }
  td.num, th.num { text-align: right; white-space: nowrap; width: 1%; }
  td.c, th.c { text-align: center; white-space: nowrap; width: 1%; }
  .total td { font-weight: 700; background: ${PRINT.canvas}; }
  .sums { width: 55%; margin-left: auto; }
  .muted { color: ${PRINT.muted}; }
  .words { margin-top: 4px; font-style: italic; }
  .note { white-space: pre-wrap; margin: 4px 0 0; }
  ol { margin: 0; padding-left: 16px; }
  .stamp { display: inline-block; margin-top: 4px; padding: 2px 8px; border: 1px solid ${PRINT.danger}; color: ${PRINT.danger}; border-radius: 10px; font-size: 10px; text-transform: uppercase; }
  .box { display: inline-block; width: 11px; height: 11px; border: 1px solid ${PRINT.text}; margin-right: 6px; vertical-align: -2px; text-align: center; font-size: 9px; line-height: 10px; }
  ul.checks { list-style: none; margin: 0; padding: 0; columns: 2; column-gap: 24px; }
  ul.checks li { margin: 0 0 5px; break-inside: avoid; }
  .sign { display: grid; gap: 32px; margin-top: 48px; page-break-inside: avoid; }
  .sign div { border-top: 1px solid ${PRINT.text}; padding-top: 4px; font-size: 10px; }
  @media print { body { padding: 0; } }
  ${PRINT_BRAND_CSS}
`;

/** The company block at the top left: its name, then legal name, address, GSTIN and PAN where it has them. */
function companyBlock(l: LetterheadDto, under?: string) {
  const lines = [
    l.legalName && l.legalName !== l.name ? esc(l.legalName) : '',
    l.address ? esc(l.address).replace(/\n+/g, ', ') : '',
    [
      l.gstin ? `GSTIN ${esc(l.gstin)}` : '',
      l.stateCode && GST_STATES[l.stateCode] ? `${esc(GST_STATES[l.stateCode])} (${esc(l.stateCode)})` : '',
      l.pan ? `PAN ${esc(l.pan)}` : '',
    ]
      .filter(Boolean)
      .join(' · '),
    under ? esc(under) : '',
  ].filter(Boolean);
  return `<div><div class="brand">${esc(l.name)}</div>${lines.length ? `<div class="org">${lines.join('<br/>')}</div>` : ''}</div>`;
}

export interface PrintDoc {
  letterhead: LetterheadDto;
  /** Under the company's details: the project or plant the paper belongs to */
  under?: string;
  /** "Goods received note", "Tax invoice" */
  title: string;
  /** Its number and date, already plain text */
  number: string;
  date: string;
  /** A red mark when the paper is not yet good to act on: "Draft, not approved", "Cancelled" */
  stamp?: string | null;
  /** The body, already-escaped HTML */
  body: string;
  /** Who signs, left to right */
  signs?: string[];
}

/** The whole printable page around a paper's body; it prints itself once fonts and images have loaded. */
export function printDocHtml(d: PrintDoc): string {
  const signs = d.signs?.length
    ? `<div class="sign" style="grid-template-columns: repeat(${d.signs.length}, 1fr)">${d.signs.map((s) => `<div>${s}</div>`).join('')}</div>`
    : '';
  return `<!doctype html>
<html><head><meta charset="utf-8"/>
${PRINT_FONT_LINKS}
<title>${esc(d.title)} ${esc(d.number)}</title>
<style>${STYLE}</style></head>
<body>
  <div class="head">
    ${companyBlock(d.letterhead, d.under)}
    <div class="doc"><h1>${esc(d.title)}</h1><div>${esc(d.number)}</div><div>${esc(d.date)}</div>${d.stamp ? `<div class="stamp">${esc(d.stamp)}</div>` : ''}</div>
  </div>
  ${d.body}
  ${signs}
  ${brandFooter(`Generated from ${esc(BRAND.name)} on ${esc(formatDateTime(new Date().toISOString()))} · ${esc(d.number)}`)}
  ${AUTO_PRINT_SCRIPT}
</body></html>`;
}

/** A labelled fact for the `.meta` grid; `html` is already escaped. */
export const metaItem = (label: string, html: string) => `<div><span class="k">${esc(label)}</span>${html || '-'}</div>`;

/** A signature line: the role, and the name under it when known. */
export const signLine = (role: string, name?: string | null) => `${esc(role)}${name ? `<br/>${esc(name)}` : ''}`;

/** Opens the paper in a new window to print; false when the browser blocked the pop-up. */
export function openPrintWindow(html: string): boolean {
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}

/** What to say when the pop-up was blocked. */
export const POPUP_BLOCKED = 'Pop-up blocked. Allow pop-ups for this site to print.';
