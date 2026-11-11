import { formatINR, type ManagementReportDto, type ReportCell, type ReportColumnKind, type ReportSectionDto } from '@erp/shared';
import { EMAIL_COLORS, emailButton, emailLayout } from '../notifications/email-layout';
import { escapeHtml } from '../notifications/email.service';

/** Rows of the report's first table an email carries; the link opens the rest. */
export const REPORT_EMAIL_ROWS = 25;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return d ? `${d} ${MONTHS[m - 1]} ${y}` : `${MONTHS[m - 1]} ${y}`;
};

/** A cell as the email reads it: rupees to the paisa, quantities as they are, days and months in words. */
export function emailCell(kind: ReportColumnKind, v: ReportCell | undefined): string {
  if (v === null || v === undefined || v === '') return '–';
  if (kind === 'money') return formatINR(v, true);
  if ((kind === 'date' || kind === 'month') && /^\d{4}-\d{2}/.test(String(v))) return day(String(v));
  if (kind === 'pct') return `${v}%`;
  if (kind === 'days') return `${v} ${Number(v) === 1 ? 'day' : 'days'}`;
  return String(v);
}

const numeric = (kind: ReportColumnKind) => kind !== 'text' && kind !== 'date' && kind !== 'month';

function table(s: ReportSectionDto): string {
  const cell = (kind: ReportColumnKind, v: ReportCell | undefined, bold = false) =>
    `<td style="padding:6px 8px;border-bottom:1px solid ${EMAIL_COLORS.border};text-align:${numeric(kind) ? 'right' : 'left'};white-space:${numeric(kind) ? 'nowrap' : 'normal'};${bold ? 'font-weight:700;' : ''}">${escapeHtml(emailCell(kind, v))}</td>`;
  const head = s.columns.map((c) => `<th style="padding:6px 8px;background:${EMAIL_COLORS.canvas};border-bottom:1px solid ${EMAIL_COLORS.border};text-align:${numeric(c.kind) ? 'right' : 'left'};font-size:12px">${escapeHtml(c.label)}</th>`).join('');
  const rows = s.rows.slice(0, REPORT_EMAIL_ROWS).map((r) => `<tr>${s.columns.map((c) => cell(c.kind, r[c.key])).join('')}</tr>`).join('');
  const total = s.total ? `<tr>${s.columns.map((c, i) => (i === 0 && (s.total![c.key] === null || s.total![c.key] === undefined) ? `<td style="padding:6px 8px;font-weight:700">Total</td>` : cell(c.kind, s.total![c.key], true))).join('')}</tr>` : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;margin:8px 0 0">${`<tr>${head}</tr>`}${rows}${total}</table>`;
}

/**
 * A scheduled report as its email: what it is and the period, its first table (the groups when it is grouped) with its
 * total, how many rows the link holds, and the link to the whole report. Pure.
 */
export function reportEmail(r: ManagementReportDto, opts: { firstName: string; href: string; orgName: string; count: number; countLabel: string }): { subject: string; html: string; text: string } {
  const first = r.sections[0];
  const subject = `${r.title}: ${r.period}`;
  const shown = first ? Math.min(first.rows.length, REPORT_EMAIL_ROWS) : 0;
  const more = first && first.rows.length > shown ? `<p style="margin:8px 0 0;color:${EMAIL_COLORS.muted};font-size:13px">The first ${shown} of ${first.rows.length} rows; the report has them all.</p>` : '';
  const counted = `${opts.count} ${opts.countLabel.toLowerCase()}`;
  const scope = r.projectName ?? r.scope ?? '';
  const lead = `${r.title} for ${r.period}${scope ? `, ${scope.charAt(0).toLowerCase()}${scope.slice(1)}` : ''}: ${counted}.`;
  const body = `<p style="margin:0 0 8px">Hello ${escapeHtml(opts.firstName)},</p>
    <p style="margin:0 0 4px">${escapeHtml(lead)}</p>
    ${first && first.rows.length ? `<p style="margin:12px 0 0;font-weight:700">${escapeHtml(first.title)}</p>${table(first)}${more}` : `<p style="margin:12px 0 0">${escapeHtml(first?.empty ?? 'Nothing to show for this period.')}</p>`}
    ${r.notes.length ? `<p style="margin:12px 0 0;color:${EMAIL_COLORS.muted};font-size:12px">${r.notes.map(escapeHtml).join('<br/>')}</p>` : ''}
    ${emailButton(opts.href, 'Open the report')}`;
  const textRows = first ? first.rows.slice(0, REPORT_EMAIL_ROWS).map((row) => first.columns.map((c) => emailCell(c.kind, row[c.key])).join(' | ')) : [];
  const textTotal = first?.total ? [`Total: ${first.columns.slice(1).map((c) => `${c.label} ${emailCell(c.kind, first.total![c.key])}`).join(', ')}`] : [];
  const text = [`Hello ${opts.firstName},`, '', lead, '', ...(first ? [first.title, first.columns.map((c) => c.label).join(' | '), ...textRows, ...textTotal] : []), '', ...r.notes, `Open the report: ${opts.href}`].join('\n');
  return {
    subject,
    html: emailLayout({ preheader: lead, body, orgName: opts.orgName, footnote: 'You get this because it is scheduled to you. The person who set it up can stop it from the report’s Schedule.' }),
    text,
  };
}
