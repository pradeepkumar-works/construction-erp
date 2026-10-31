import type { OfficialFactDto, OfficialReportDto } from '@erp/shared';
import { formatDate, formatDateTime, NO_VALUE } from '@/lib/format';
import { cellText } from '@/components/management/report-format';

/**
 * What an official report's facts and labels read as, shared by the page, print, PDF, Word and Excel (item 174,
 * ARCHITECTURE "Official progress reports"): cells read through the management reports' `cellText`, so a rupee, a date
 * or a % looks the same in all of them.
 */

export const factText = (f: OfficialFactDto) => (f.value === null || f.value === '' ? NO_VALUE : f.kind ? cellText(f.kind, f.value) : String(f.value));

/** "Rev 0, issued 2 Nov 2026 by Ramesh Kumar", or "Draft, not issued". */
export function issueLine(r: OfficialReportDto): string {
  if (!r.issue) return 'Draft, not issued';
  return `Rev ${r.issue.revision}, issued ${formatDate(r.issue.issuedAt.slice(0, 10))} by ${r.issue.issuedByName}`;
}

/** The document control strip: number, revision, the report's date. */
export function controlFacts(r: OfficialReportDto): OfficialFactDto[] {
  return [
    { label: 'Doc no.', value: r.docNo },
    { label: 'Revision', value: r.issue ? String(r.issue.revision).padStart(2, '0') : 'Draft' },
    { label: 'Report date', value: (r.issue?.issuedAt ?? r.generatedAt).slice(0, 10), kind: 'date' },
  ];
}

export const footNote = (r: OfficialReportDto) => `${r.sources} ${r.issue ? issueLine(r) : `Made ${formatDateTime(r.generatedAt)}`}.`;


/** A table with more columns than this turns the page to landscape. */
export const WIDE_COLUMNS = 9;
