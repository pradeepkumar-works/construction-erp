import type { EmployeeLetterDto } from '@erp/shared';
import { EMPLOYEE_EVENT_LETTERS } from '@erp/shared';
import { AUTO_PRINT_SCRIPT, brandFooter, PRINT_BRAND_CSS, PRINT_FONT_LINKS } from '@/components/print/printBrand';
import { BRAND } from '@/lib/brand';
import { formatDate, formatINR } from '@/lib/format';

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
const p = (s: string) => `<p>${s}</p>`;
const ctc = (v: string | null) => (v ? `${formatINR(v)} a year` : null);

/** The body of each letter, in plain words; values are escaped here. */
function body(l: EmployeeLetterDto, experience: boolean): { title: string; paras: string[] } {
  const { event: ev, employee: e, company } = l;
  const name = esc(e.fullName);
  const on = esc(formatDate(ev.effectiveDate));
  const firm = esc(company.name);
  const note = ev.note ? p(esc(ev.note)) : '';
  if (experience)
    return {
      title: 'Experience certificate',
      paras: [
        p(`This is to certify that ${name} (${esc(e.employeeCode)}) worked with ${firm} from ${esc(formatDate(e.joinedOn))} to ${esc(formatDate(e.leftOn ?? ev.effectiveDate))}${e.department ? ` in ${esc(e.department)}` : ''}, last as ${esc(e.designation)}.`),
        p('During this time we found their work and conduct good. We wish them well.'),
      ],
    };
  switch (ev.type) {
    case 'JOINED':
      return {
        title: EMPLOYEE_EVENT_LETTERS.JOINED,
        paras: [
          p(`Dear ${name},`),
          p(`We are pleased to appoint you as ${esc(ev.toDesignation ?? e.designation)}${ev.toDepartment ?? e.department ? ` in ${esc(ev.toDepartment ?? e.department)}` : ''} with ${firm}, from ${on}${ev.toProjectName ? `, posted at ${esc(ev.toProjectName)}` : ''}.`),
          ...(ctc(ev.toCtc) ? [p(`Your cost to company will be ${ctc(ev.toCtc)}, made up as set out in your salary structure.`)] : []),
          ...(e.probationEndsOn ? [p(`You will be on probation until ${esc(formatDate(e.probationEndsOn))}, after which your service will be confirmed in writing.`)] : []),
          ...(e.noticeDays ? [p(`Either side may end this appointment by giving ${e.noticeDays} days' notice in writing.`)] : []),
          note,
          p('Please sign and return the copy of this letter to accept the appointment.'),
        ],
      };
    case 'CONFIRMED':
      return {
        title: EMPLOYEE_EVENT_LETTERS.CONFIRMED,
        paras: [p(`Dear ${name},`), p(`We are pleased to confirm your service as ${esc(e.designation)} with ${firm} from ${on}. All other terms of your appointment stay the same.`), note],
      };
    case 'TRANSFERRED':
      return {
        title: EMPLOYEE_EVENT_LETTERS.TRANSFERRED,
        paras: [
          p(`Dear ${name},`),
          p(`You are transferred from ${esc(ev.fromProjectName ?? 'head office')} to ${esc(ev.toProjectName ?? 'head office')} from ${on}${ev.toDesignation && ev.toDesignation !== ev.fromDesignation ? `, as ${esc(ev.toDesignation)}` : ''}. Please hand over your present work and report there on that day.`),
          note,
        ],
      };
    case 'PROMOTED':
      return {
        title: EMPLOYEE_EVENT_LETTERS.PROMOTED,
        paras: [
          p(`Dear ${name},`),
          p(`We are pleased to promote you from ${esc(ev.fromDesignation ?? e.designation)} to ${esc(ev.toDesignation ?? e.designation)} from ${on}.`),
          ...(ctc(ev.toCtc) ? [p(`Your cost to company goes up to ${ctc(ev.toCtc)}.`)] : []),
          note,
          p('Congratulations, and thank you for your work.'),
        ],
      };
    case 'INCREMENT':
      return {
        title: EMPLOYEE_EVENT_LETTERS.INCREMENT,
        paras: [
          p(`Dear ${name},`),
          p(`We are pleased to tell you that your cost to company is revised${ev.fromCtc ? ` from ${ctc(ev.fromCtc)}` : ''} to ${ctc(ev.toCtc) ?? 'the new figure'} from ${on}.`),
          note,
          p('Thank you for your work. All other terms stay the same.'),
        ],
      };
    case 'WARNING':
      return {
        title: EMPLOYEE_EVENT_LETTERS.WARNING,
        paras: [
          p(`Dear ${name},`),
          p(`This letter is a written warning about the following, noted on ${on}:`),
          note,
          p('You are asked to make sure it does not happen again. A further lapse may lead to stronger action.'),
        ],
      };
    case 'TERMINATED':
      return {
        title: EMPLOYEE_EVENT_LETTERS.TERMINATED,
        paras: [p(`Dear ${name},`), p(`Your service with ${firm} ends on ${on}, which is your last working day.`), note, p('Please hand over company property and records to your manager. Your full and final settlement will follow.')],
      };
    default:
      // RESIGNED, RETIRED: the relieving letter.
      return {
        title: EMPLOYEE_EVENT_LETTERS[ev.type],
        paras: [
          p(`Dear ${name},`),
          p(
            ev.type === 'RETIRED'
              ? `On your retirement, you are relieved from your duties with ${firm} at the close of ${on}.`
              : `We accept your resignation${ev.noticeGivenOn ? ` given on ${esc(formatDate(ev.noticeGivenOn))}` : ''}. You are relieved from your duties as ${esc(e.designation)} at the close of ${on}.`,
          ),
          p('Your full and final settlement will be paid as per company rules. We thank you for your service and wish you well.'),
        ],
      };
  }
}

/** One HR letter (appointment to relieving) on the company's letterhead, or the experience certificate for an exit. */
export function buildHrLetterHtml(l: EmployeeLetterDto, experience = false): string {
  const { title, paras } = body(l, experience);
  const e = l.employee;
  return `<!doctype html>
<html><head><meta charset="utf-8"/>
${PRINT_FONT_LINKS}
<title>${esc(title)} ${esc(l.event.letterNo)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111; font-size: 12.5px; line-height: 1.55; margin: 0; padding: 28px; }
  .head { border-bottom: 2px solid ${BRAND.colors.ink}; padding-bottom: 8px; margin-bottom: 18px; }
  .brand { font-size: 19px; color: ${BRAND.colors.ink}; font-weight: 600; }
  .muted { color: #555; }
  .meta { display: flex; justify-content: space-between; margin-bottom: 16px; }
  h1 { font-size: 15px; text-align: center; text-decoration: underline; margin: 6px 0 16px; }
  .to { margin-bottom: 14px; }
  .sign { margin-top: 48px; display: flex; justify-content: space-between; }
  .accept { border-top: 1px dashed #999; margin-top: 40px; padding-top: 10px; }
  @media print { body { padding: 0; } }
  ${PRINT_BRAND_CSS}
</style></head>
<body>
  <div class="head"><div class="brand">${esc(l.company.name)}</div>${l.company.address ? `<div class="muted">${esc(l.company.address)}</div>` : ''}</div>
  <div class="meta"><div>Ref. ${esc(l.event.letterNo)}</div><div>${esc(formatDate(l.event.createdAt.slice(0, 10)))}</div></div>
  <div class="to">To<br/><b>${esc(e.fullName)}</b> (${esc(e.employeeCode)})<br/>${esc(e.designation)}${e.postedAt ? `, ${esc(e.postedAt)}` : ''}${e.address ? `<br/>${esc(e.address)}` : ''}</div>
  <h1>${esc(title)}</h1>
  ${paras.join('\n  ')}
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
