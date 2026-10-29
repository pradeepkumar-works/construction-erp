import type { LetterPrintDto } from '@erp/shared';
import { AUTO_PRINT_SCRIPT, brandFooter, PRINT_BRAND_CSS, PRINT_FONT_LINKS } from '@/components/print/printBrand';
import { BRAND } from '@/lib/brand';
import { formatDate } from '@/lib/format';

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/** The letter's text in paragraphs, as the writer broke it. */
const paras = (text: string | null) =>
  (text ?? '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br/>')}</p>`)
    .join('\n  ');

/** An outward letter on the company's letterhead: number and date, to, subject, reference, text, signature, enclosures. */
export function buildLetterHtml(d: LetterPrintDto): string {
  const l = d.letter;
  const draft = !l.letterNo;
  const to = [d.to.name, d.to.office, d.to.organisation, d.to.address].filter(Boolean).map(esc).join('<br/>');
  const ref = l.inReplyTo ? `Ref.: your letter ${esc(l.inReplyTo.letterNo ?? '')} dated ${esc(formatDate(l.inReplyTo.letterDate))}` : l.theirRef ? `Ref.: ${esc(l.theirRef)}` : '';
  const enclosures = l.attachments.length ? `<div class="encl"><b>Enclosures</b><ol>${l.attachments.map((a) => `<li>${esc(a.fileName)}</li>`).join('')}</ol></div>` : '';
  return `<!doctype html>
<html><head><meta charset="utf-8"/>
${PRINT_FONT_LINKS}
<title>${esc(l.letterNo ?? 'Draft letter')} ${esc(l.subject)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111; font-size: 12.5px; line-height: 1.55; margin: 0; padding: 28px; }
  .head { border-bottom: 2px solid ${BRAND.colors.ink}; padding-bottom: 8px; margin-bottom: 18px; }
  .brand { font-size: 19px; color: ${BRAND.colors.ink}; font-weight: 600; }
  .muted { color: #555; }
  .meta { display: flex; justify-content: space-between; margin-bottom: 16px; }
  .to { margin-bottom: 14px; }
  .subject { font-weight: 600; margin: 12px 0 4px; }
  .sign { margin-top: 48px; }
  .encl { margin-top: 28px; }
  .encl ol { margin: 4px 0 0 18px; padding: 0; }
  .draft { position: fixed; top: 40%; left: 0; right: 0; text-align: center; font-size: 72px; color: rgba(0,0,0,0.07); transform: rotate(-24deg); pointer-events: none; }
  @media print { body { padding: 0; } }
  ${PRINT_BRAND_CSS}
</style></head>
<body>
  ${draft ? '<div class="draft">DRAFT</div>' : ''}
  <div class="head"><div class="brand">${esc(d.company.name)}</div>${d.company.address ? `<div class="muted">${esc(d.company.address)}</div>` : ''}${d.company.gstin ? `<div class="muted">GSTIN ${esc(d.company.gstin)}</div>` : ''}</div>
  <div class="meta"><div>No. ${esc(l.letterNo ?? 'Draft')}</div><div>Date: ${esc(formatDate(l.letterDate))}</div></div>
  <div class="to">To<br/>${to}</div>
  <div class="subject">Sub.: ${esc(l.subject)}</div>
  ${ref ? `<div>${ref}</div>` : ''}
  ${l.projectName ? `<div class="muted">Project: ${esc(l.projectName)}</div>` : ''}
  <p>Sir/Madam,</p>
  ${paras(l.body)}
  <p>Thanking you,</p>
  <div class="sign">Yours faithfully,<br/>For ${esc(d.company.name)}<br/><br/><br/>${d.signedBy ? `<b>${esc(d.signedBy.name)}</b><br/><span class="muted">${esc(d.signedBy.title)}</span>` : '(Authorised signatory)'}</div>
  ${enclosures}
  ${brandFooter(`${esc(l.letterNo ?? 'Draft')} · ${esc(BRAND.name)}`)}
  ${AUTO_PRINT_SCRIPT}
</body></html>`;
}

/** Open the print window at once (one opened after a request is blocked as a pop-up), then fill it. False when blocked. */
export async function printLetter(load: () => Promise<LetterPrintDto>): Promise<boolean> {
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) return false;
  w.document.write('<p style="font-family:sans-serif;padding:24px">Preparing the letter…</p>');
  try {
    const html = buildLetterHtml(await load());
    w.document.open();
    w.document.write(html);
    w.document.close();
    return true;
  } catch (err) {
    w.close();
    throw err;
  }
}
