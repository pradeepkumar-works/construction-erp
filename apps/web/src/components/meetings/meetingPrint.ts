import { MEETING_KIND_LABELS, type MeetingDetailDto } from '@erp/shared';
import { AUTO_PRINT_SCRIPT, brandFooter, PRINT_BRAND_CSS, PRINT_FONT_LINKS } from '@/components/print/printBrand';
import { BRAND } from '@/lib/brand';
import { formatDate, formatDateTime } from '@/lib/format';

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const STYLE = `
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111; font-size: 11px; margin: 0; padding: 24px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 10px; margin-bottom: 12px; }
  .brand { font-size: 18px; color: ${BRAND.colors.ink}; }
  .org { color: #555; font-size: 12px; }
  h1 { font-size: 16px; margin: 0 0 2px; }
  h2 { font-size: 11px; text-transform: uppercase; color: ${BRAND.colors.ink}; border-bottom: 1px solid #ddd; margin: 14px 0 6px; padding-bottom: 3px; }
  .meta { display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 6px 16px; margin-bottom: 12px; }
  .meta div b { display: block; font-size: 9px; color: #666; text-transform: uppercase; letter-spacing: .04em; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  th, td { border: 1px solid #bbb; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #f1f4f8; font-size: 10px; }
  td.c, th.c { text-align: center; }
  td.d { white-space: nowrap; }
  .muted { color: ${BRAND.colors.muted}; }
  .draft { display: inline-block; padding: 2px 8px; border: 1px solid #c77; color: #a33; border-radius: 10px; font-size: 10px; text-transform: uppercase; }
  ol { margin: 0; padding-left: 16px; }
  ol li { margin-bottom: 4px; }
  @media print { body { padding: 0; } }
  ${PRINT_BRAND_CSS}
`;

const who = (list: MeetingDetailDto['attendees']) => list.map((a) => esc(a.organisation ? `${a.name} (${a.organisation})` : a.name)).join(', ');

/** The minutes as a printable page: the meeting, who came, the points, the actions and those still open from before. */
export function buildMinutesHtml(m: MeetingDetailDto, orgName: string): string {
  const present = m.attendees.filter((a) => a.present);
  const absent = m.attendees.filter((a) => !a.present);
  const actionRows = (list: MeetingDetailDto['actions'], from: boolean) =>
    list
      .map(
        (a, i) =>
          `<tr><td class="c">${i + 1}</td><td>${esc(a.text)}${a.link ? `<div class="muted">${esc(a.link.label)}</div>` : ''}${from ? `<div class="muted">${esc(`${a.meetingNo}, ${formatDate(a.heldOn)}`)}</div>` : ''}</td><td>${esc(a.ownerName)}</td><td class="d">${esc(a.dueOn ? formatDate(a.dueOn) : '-')}</td><td>${esc(a.status === 'OPEN' ? (a.daysOverdue ? `${a.daysOverdue} days late` : 'Open') : a.status === 'DONE' ? 'Done' : 'Dropped')}</td></tr>`,
      )
      .join('');
  const table = (rows: string) => `<table><thead><tr><th class="c">#</th><th>Action</th><th>Who</th><th>By</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`;
  return `<!doctype html>
<html><head><meta charset="utf-8"/>
${PRINT_FONT_LINKS}
<title>${esc(m.meetingNo)} - ${esc(m.title)}</title>
<style>${STYLE}</style></head>
<body>
  <div class="head">
    <div><div class="brand">${esc(orgName)}</div><div class="org">${esc(`${m.projectCode} ${m.projectName}`)}</div></div>
    <div style="text-align:right"><h1>Minutes of meeting</h1><div>${esc(m.meetingNo)}</div>${m.status === 'DRAFT' ? `<div class="draft" style="margin-top:4px">Draft, not issued</div>` : ''}</div>
  </div>
  <div class="meta">
    <div><b>Meeting</b>${esc(m.title)}<div class="muted">${esc(MEETING_KIND_LABELS[m.kind])}</div></div>
    <div><b>Held on</b>${esc(formatDate(m.heldOn))}${m.startTime ? `, ${esc(m.startTime)}` : ''}${m.venue ? `<div class="muted">${esc(m.venue)}</div>` : ''}</div>
    <div><b>Chaired by</b>${esc(m.chairedBy ?? '-')}</div>
  </div>
  <p><b>Present:</b> ${present.length ? who(present) : '-'}</p>
  ${absent.length ? `<p><b>Absent:</b> ${who(absent)}</p>` : ''}
  ${m.agenda ? `<h2>Agenda</h2><ol>${m.agenda.split(/\n+/).filter((l) => l.trim()).map((l) => `<li>${esc(l.trim())}</li>`).join('')}</ol>` : ''}
  ${m.earlierActions.length ? `<h2>Open from earlier meetings</h2>${table(actionRows(m.earlierActions, true))}` : ''}
  ${m.points.length ? `<h2>Minutes</h2><ol>${m.points.map((p) => `<li>${p.kind === 'DECISION' ? '<b>Decided:</b> ' : ''}${esc(p.text)}</li>`).join('')}</ol>` : ''}
  ${m.actions.length ? `<h2>Actions</h2>${table(actionRows(m.actions, false))}` : ''}
  ${m.nextOn ? `<p style="margin-top:12px"><b>Next meeting:</b> ${esc(formatDate(m.nextOn))}</p>` : ''}
  <p class="muted" style="margin-top:12px">${esc(m.issuedAt ? `Issued by ${m.issuedByName ?? ''} on ${formatDate(m.issuedAt.slice(0, 10))}` : `Recorded by ${m.createdByName}`)}</p>
  ${brandFooter(`Generated from ${esc(BRAND.name)} on ${esc(formatDateTime(new Date().toISOString()))} · ${esc(m.meetingNo)}`)}
  ${AUTO_PRINT_SCRIPT}
</body></html>`;
}

export function openMinutesPrint(m: MeetingDetailDto, orgName: string): boolean {
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) return false;
  w.document.open();
  w.document.write(buildMinutesHtml(m, orgName));
  w.document.close();
  return true;
}

/** The minutes as a WhatsApp message: decisions and actions, short enough for a site group. */
export function minutesText(m: MeetingDetailDto): string {
  const decisions = m.points.filter((p) => p.kind === 'DECISION');
  return [
    `*${m.title}* (${m.meetingNo})`,
    `${m.projectCode} ${m.projectName}, ${formatDate(m.heldOn)}${m.venue ? `, ${m.venue}` : ''}`,
    ...(decisions.length ? ['', '*Decided*', ...decisions.map((p, i) => `${i + 1}. ${p.text}`)] : []),
    ...(m.actions.length ? ['', '*Actions*', ...m.actions.map((a, i) => `${i + 1}. ${a.text}: ${a.ownerName}${a.dueOn ? `, by ${formatDate(a.dueOn)}` : ''}`)] : []),
    ...(m.nextOn ? ['', `Next meeting: ${formatDate(m.nextOn)}`] : []),
  ].join('\n');
}
