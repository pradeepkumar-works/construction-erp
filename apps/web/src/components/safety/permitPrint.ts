import type { LetterheadDto, WorkPermitDto } from '@erp/shared';
import { PERMIT_PRECAUTIONS, WORK_PERMIT_EXPIRED_LABEL, WORK_PERMIT_STATUS_LABELS, WORK_PERMIT_TYPE_LABELS } from '@erp/shared';
import { esc, metaItem, openPrintWindow, printDocHtml, signLine } from '@/components/print/printDoc';
import { formatDateTime } from '@/lib/format';

/**
 * A permit to work as it hangs at the work spot: the work, where, who, how long it holds, every standard precaution of
 * its kind with the ones taken ticked, the conditions it was issued on and a place to sign it closed.
 */
export function buildPermitPrintHtml(p: WorkPermitDto, letterhead: LetterheadDto): string {
  const standard = PERMIT_PRECAUTIONS[p.type] ?? [];
  const taken = new Set(p.precautions);
  const all = [...standard, ...p.precautions.filter((x) => !standard.includes(x))];
  const checks = all.length
    ? `<ul class="checks">${all.map((x) => `<li><span class="box">${taken.has(x) ? '✓' : ''}</span>${esc(x)}</li>`).join('')}</ul>`
    : '<p class="muted">None listed.</p>';
  const stamp =
    p.status === 'ISSUED'
      ? p.expired
        ? WORK_PERMIT_EXPIRED_LABEL
        : null
      : p.status === 'REQUESTED'
        ? 'Not issued: no work'
        : WORK_PERMIT_STATUS_LABELS[p.status];
  const body = `
  <div class="meta">
    ${metaItem('Work', esc(WORK_PERMIT_TYPE_LABELS[p.type]))}
    ${metaItem('Where', esc(p.location))}
    ${metaItem('Valid', `${esc(formatDateTime(p.validFrom))}<br/>to ${esc(formatDateTime(p.validTo))}`)}
    ${metaItem('Contractor', esc(p.contractor ?? ''))}
    ${metaItem('Workers', esc([p.workerCount, p.workers].filter(Boolean).join(': ')))}
    ${metaItem('Asked by', `${esc(p.requestedByName)}<br/><span class="muted">${esc(formatDateTime(p.createdAt))}</span>`)}
  </div>
  <h2>The work</h2>
  <p class="note">${esc(p.description)}</p>
  <h2>Precautions</h2>
  ${checks}
  ${p.issuedAt ? `<h2>${p.status === 'REJECTED' ? 'Rejected' : 'Issued'}</h2><p class="note">${esc(p.issuedByName ?? '')}, ${esc(formatDateTime(p.issuedAt))}${p.issueNote ? `<br/>${esc(p.issueNote)}` : ''}</p>` : ''}
  ${p.closedAt ? `<h2>Closed</h2><p class="note">${esc(p.closedByName ?? '')}, ${esc(formatDateTime(p.closedAt))}${p.closeNote ? `<br/>${esc(p.closeNote)}` : ''}</p>` : ''}`;
  return printDocHtml({
    letterhead,
    under: p.projectName,
    title: 'Permit to work',
    number: p.permitNo,
    date: formatDateTime(p.validFrom),
    stamp,
    body,
    signs: [signLine('Asked by', p.requestedByName), signLine('Issued by', p.issuedByName), signLine('Work done, area safe: closed by', p.closedByName)],
  });
}

export const openPermitPrint = (p: WorkPermitDto, l: LetterheadDto) => openPrintWindow(buildPermitPrintHtml(p, l));
