import type { EmployeeLetterDto } from '@erp/shared';
import { HR_LETTER_TITLES, STANDARD_HR_LETTERS, fillLetter, hrLetterValues, letterKindOf } from '@erp/shared';
import { AUTO_PRINT_SCRIPT, brandFooter, PRINT_BRAND_CSS, PRINT_FONT_LINKS, PRINT, PRINT_FACE } from '@/components/print/printBrand';
import { BRAND } from '@/lib/brand';
import { formatDate, formatINR } from '@/lib/format';

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/** The letter's title and paragraphs from the company's words (or the standard ones), its facts filled in. */
export function letterBody(l: EmployeeLetterDto, experience: boolean, template?: string): { title: string; paras: string[] } {
  const kind = letterKindOf(l.event.type, experience);
  const words = template ?? (experience ? l.experienceTemplate : l.template) ?? STANDARD_HR_LETTERS[kind];
  return { title: HR_LETTER_TITLES[kind], paras: fillLetter(words, hrLetterValues(l, { date: formatDate, money: (v) => formatINR(v) })) };
}

/** One HR letter (appointment to relieving) on the company's letterhead, or the experience certificate for an exit. */
export function buildHrLetterHtml(l: EmployeeLetterDto, experience = false, template?: string): string {
  const { title, paras } = letterBody(l, experience, template);
  const p = (t: string) => `<p>${esc(t)}</p>`;
  const e = l.employee;
  return `<!doctype html>
<html><head><meta charset="utf-8"/>
${PRINT_FONT_LINKS}
<title>${esc(title)} ${esc(l.event.letterNo)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  * { box-sizing: border-box; }
  body { font-family: ${PRINT_FACE}; color: ${PRINT.text}; font-size: 12.5px; line-height: 1.55; margin: 0; padding: 28px; }
  .head { border-bottom: 2px solid ${PRINT.ink}; padding-bottom: 8px; margin-bottom: 18px; }
  .brand { font-size: 19px; color: ${PRINT.ink}; font-weight: 600; }
  .muted { color: ${PRINT.muted}; }
  .meta { display: flex; justify-content: space-between; margin-bottom: 16px; }
  h1 { font-size: 15px; text-align: center; text-decoration: underline; margin: 6px 0 16px; }
  .to { margin-bottom: 14px; }
  .sign { margin-top: 48px; display: flex; justify-content: space-between; }
  .accept { border-top: 1px dashed ${PRINT.faint}; margin-top: 40px; padding-top: 10px; }
  @media print { body { padding: 0; } }
  ${PRINT_BRAND_CSS}
</style></head>
<body>
  <div class="head"><div class="brand">${esc(l.company.name)}</div>${l.company.address ? `<div class="muted">${esc(l.company.address)}</div>` : ''}</div>
  <div class="meta"><div>Ref. ${esc(l.event.letterNo)}</div><div>${esc(formatDate(l.event.createdAt.slice(0, 10)))}</div></div>
  <div class="to">To<br/><b>${esc(e.fullName)}</b> (${esc(e.employeeCode)})<br/>${esc(e.designation)}${e.postedAt ? `, ${esc(e.postedAt)}` : ''}${e.address ? `<br/>${esc(e.address)}` : ''}</div>
  <h1>${esc(title)}</h1>
  ${paras.map(p).join('\n  ')}
  <div class="sign"><div>For ${esc(l.company.name)}<br/><br/><br/><b>${esc(l.signedBy.name)}</b><br/><span class="muted">${esc(l.signedBy.title)}</span></div></div>
  ${l.event.type === 'JOINED' && !experience ? `<div class="accept">I accept the appointment on the terms above.<br/><br/>Signature: ____________________ &nbsp; Date: ____________</div>` : ''}
  ${brandFooter(`${esc(l.event.letterNo)} · ${esc(BRAND.name)}`)}
  ${AUTO_PRINT_SCRIPT}
</body></html>`;
}

/**
 * Open the print window at once (a window opened after a request is blocked as a pop-up), then fill it with the letter
 * when it arrives. False when the browser blocked the window.
 */
export async function printHrLetter(load: () => Promise<EmployeeLetterDto>, experience = false): Promise<boolean> {
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) return false;
  w.document.write('<p style="font-family:sans-serif;padding:24px">Preparing the letter…</p>');
  try {
    const html = buildHrLetterHtml(await load(), experience);
    w.document.open();
    w.document.write(html);
    w.document.close();
    return true;
  } catch (err) {
    w.close();
    throw err;
  }
}
