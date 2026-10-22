import type { FinalSettlementDto, PayslipDto } from '@erp/shared';
import { AUTO_PRINT_SCRIPT, brandFooter, PRINT_BRAND_CSS, PRINT_FONT_LINKS } from '@/components/print/printBrand';
import { BRAND } from '@/lib/brand';
import { formatINR } from '@/lib/format';
import dayjs from 'dayjs';

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/** Rupees in words, Indian style (lakh, crore), for the net pay line. */
export function rupeesInWords(amount: number): string {
  const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const two = (n: number) => (n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ''}`);
  const three = (n: number) => `${n >= 100 ? `${ones[Math.floor(n / 100)]} hundred${n % 100 ? ' ' : ''}` : ''}${n % 100 ? two(n % 100) : ''}`;
  let n = Math.round(Math.abs(amount));
  if (n === 0) return 'Zero rupees';
  const parts: string[] = [];
  for (const [unit, size] of [['crore', 1e7], ['lakh', 1e5], ['thousand', 1e3]] as const) {
    if (n >= size) {
      parts.push(`${three(Math.floor(n / size))} ${unit}`);
      n %= size;
    }
  }
  if (n) parts.push(three(n));
  const words = parts.join(' ');
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} rupees only`;
}

function slipHtml(p: PayslipDto, company: string): string {
  const earn = p.lines.filter((l) => l.kind === 'EARNING');
  const ded = p.lines.filter((l) => l.kind === 'DEDUCTION');
  const er = p.lines.filter((l) => l.kind === 'EMPLOYER');
  const rows = Math.max(earn.length, ded.length);
  const body = Array.from({ length: rows }, (_, i) => {
    const e = earn[i];
    const d = ded[i];
    return `<tr><td>${e ? esc(e.label) : ''}</td><td class="r">${e ? formatINR(e.amount) : ''}</td><td>${d ? esc(d.label) : ''}</td><td class="r">${d ? formatINR(d.amount) : ''}</td></tr>`;
  }).join('');
  return `<section class="slip">
  <div class="head"><div class="brand">${esc(company)}</div><div><b>Payslip for ${esc(dayjs(`${p.month}-01`).format('MMMM YYYY'))}</b></div></div>
  <table class="facts">
    <tr><th>Employee</th><td>${esc(p.employeeName)} (${esc(p.employeeCode)})</td><th>Designation</th><td>${esc(p.designation)}</td></tr>
    <tr><th>Posted at</th><td>${esc(p.projectName ?? 'Head office')}</td><th>PAN</th><td>${esc(p.pan ?? '-')}</td></tr>
    <tr><th>UAN</th><td>${esc(p.uan ?? '-')}</td><th>ESI number</th><td>${esc(p.esiNumber ?? '-')}</td></tr>
    <tr><th>Bank</th><td>${esc(p.bankName ?? '-')} ${p.bankAccountNo ? `A/c ending ${esc(p.bankAccountNo.slice(-4))}` : ''}</td><th>Days paid</th><td>${esc(p.paidDays)} of ${esc(p.monthDays)}${Number(p.lopDays) ? ` (loss of pay ${esc(p.lopDays)})` : ''}</td></tr>
  </table>
  <table class="lines">
    <thead><tr><th>Earnings</th><th class="r">Amount</th><th>Deductions</th><th class="r">Amount</th></tr></thead>
    <tbody>${body}
      <tr class="total"><td>Gross earnings</td><td class="r">${formatINR(p.gross)}</td><td>Total deductions</td><td class="r">${formatINR(p.deductions)}</td></tr>
    </tbody>
  </table>
  <p class="net">Net pay <b>${formatINR(p.net)}</b> <span class="muted">(${esc(rupeesInWords(Number(p.net)))})</span></p>
  ${er.length ? `<p class="muted">Paid by the company besides: ${er.map((l) => `${esc(l.label)} ${formatINR(l.amount)}`).join(', ')}.</p>` : ''}
  <p class="muted">A computer-generated payslip; it needs no signature. ${esc(p.runNo)}</p>
</section>`;
}

/** A print page with the payslip styles around the sections given. */
function page(title: string, sections: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"/>
${PRINT_FONT_LINKS}
<title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111; font-size: 11.5px; margin: 0; padding: 24px; }
  .slip { page-break-after: always; }
  .slip:last-of-type { page-break-after: auto; }
  .head { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid ${BRAND.colors.ink}; padding-bottom: 6px; margin-bottom: 10px; }
  .brand { font-size: 17px; font-weight: 600; color: ${BRAND.colors.ink}; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  th, td { border: 1px solid #bbb; padding: 4px 6px; text-align: left; vertical-align: top; }
  .facts th { background: #f1f4f8; width: 16%; font-weight: 500; }
  .lines thead th { background: #f1f4f8; }
  .r { text-align: right; }
  .total td { font-weight: 700; }
  .net { font-size: 13px; }
  .muted { color: #555; }
  @media print { body { padding: 0; } }
  ${PRINT_BRAND_CSS}
</style></head>
<body>
  ${sections}
  ${brandFooter(esc(BRAND.name))}
  ${AUTO_PRINT_SCRIPT}
</body></html>`;
}

/** One or more payslips, one to a page, on the company's name. */
export function buildPayslipsHtml(slips: PayslipDto[], company: string): string {
  return page(`Payslips ${slips[0]?.runNo ?? ''}`, slips.map((p) => slipHtml(p, company)).join('\n'));
}

/** The full and final settlement statement: what is owed each way and the net, with lines to sign. */
export function buildSettlementHtml(s: FinalSettlementDto, company: string): string {
  const d = (v: string | null) => (v ? dayjs(v).format('DD MMM YYYY') : '-');
  const earn: [string, string][] = [
    [`Salary for ${s.salaryDays} days of the last month`, s.salary],
    [`Leave encashment, ${s.leaveDays} days`, s.leaveEncashment],
    [`Gratuity, ${s.serviceYears} years of service`, s.gratuity],
    ['Other earnings', s.otherEarnings],
  ];
  const ded: [string, string][] = [
    [`Notice period short by ${s.noticeShortDays} days`, s.noticeRecovery],
    ['Loans and advances still owed', s.loanRecovery],
    ['Other deductions', s.otherDeductions],
  ];
  const rows = (list: [string, string][]) => list.filter(([, v]) => Number(v)).map(([l, v]) => `<tr><td>${esc(l)}</td><td class="r">${formatINR(v)}</td></tr>`).join('') || '<tr><td colspan="2">None</td></tr>';
  const net = Number(s.net);
  return page(
    `${s.settlementNo} ${s.employeeName}`,
    `<section class="slip">
  <div class="head"><div class="brand">${esc(company)}</div><div><b>Full and final settlement</b> ${esc(s.settlementNo)}</div></div>
  <table class="facts">
    <tr><th>Employee</th><td>${esc(s.employeeName)} (${esc(s.employeeCode)})</td><th>Designation</th><td>${esc(s.designation)}</td></tr>
    <tr><th>Joined on</th><td>${d(s.joinedOn)}</td><th>Last working day</th><td>${d(s.lastWorkingDay)}</td></tr>
  </table>
  <table class="lines"><thead><tr><th>Owed to them</th><th class="r">Amount</th></tr></thead><tbody>${rows(earn)}</tbody></table>
  <table class="lines"><thead><tr><th>Recovered from them</th><th class="r">Amount</th></tr></thead><tbody>${rows(ded)}</tbody></table>
  <p class="net">${net >= 0 ? 'Net payable to them' : 'Net they owe the company'} <b>${formatINR(Math.abs(net))}</b> <span class="muted">(${esc(rupeesInWords(net))})</span></p>
  ${s.note ? `<p>${esc(s.note)}</p>` : ''}
  <p class="muted">Prepared by ${esc(s.preparedByName)}${s.approvedByName ? `, approved by ${esc(s.approvedByName)} on ${d(s.approvedAt)}` : ''}${s.paidOn ? `, paid on ${d(s.paidOn)}${s.paymentRef ? ` (${esc(s.paymentRef)})` : ''}` : ''}.</p>
  <table style="margin-top:48px"><tr><td style="border:0;width:50%">I have received the above in full and have no further claim on the company.<br/><br/><br/>Signature of ${esc(s.employeeName)}</td><td style="border:0" class="r"><br/><br/><br/><br/>For ${esc(company)}</td></tr></table>
</section>`,
  );
}

export function openSettlement(s: FinalSettlementDto, company: string) {
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) return false;
  w.document.open();
  w.document.write(buildSettlementHtml(s, company));
  w.document.close();
  return true;
}

export function openPayslips(slips: PayslipDto[], company: string) {
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) return false;
  w.document.open();
  w.document.write(buildPayslipsHtml(slips, company));
  w.document.close();
  return true;
}
