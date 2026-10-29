/**
 * QA/QC audits, visits and the monthly report (item 137 part 3, ARCHITECTURE "QA/QC"): internal audits and visits by the
 * client, its consultant, a third-party inspector or the department, each with its findings; a finding is put right on
 * its own or through an NCR raised from it. The monthly report's figures are added up here too. Everything is pure.
 */
import { daysBetween } from './maintenance';
import type { NcrSeverity, NcrStatus } from './quality';
import type { AttachmentDto } from './types';

/* ---------- audits and visits ---------- */

export const QA_AUDIT_KINDS = ['INTERNAL', 'CLIENT', 'CONSULTANT', 'TPI', 'DEPARTMENT'] as const;
export type QaAuditKind = (typeof QA_AUDIT_KINDS)[number];
export const QA_AUDIT_KIND_LABELS: Record<QaAuditKind, string> = {
  INTERNAL: 'Internal audit',
  CLIENT: 'Client visit',
  CONSULTANT: 'Consultant visit',
  TPI: 'Third-party inspection',
  DEPARTMENT: 'Department inspection',
};

/** A visit from outside the company: its findings are raised by the client's side. */
export const isExternalAudit = (kind: QaAuditKind) => kind !== 'INTERNAL';

/** A finding left open longer than this is overdue (the usual compliance period of a site inspection report). */
export const FINDING_CLOSE_DAYS = 15;

export type FindingState = 'OPEN' | 'NCR' | 'CLOSED';
export const FINDING_STATE_LABELS: Record<FindingState, string> = { OPEN: 'Open', NCR: 'NCR raised', CLOSED: 'Closed' };

/** Where a finding stands: put right on its own (closed), followed through its NCR until that closes, or still open. */
export function findingState(f: { closedOn: string | null; ncrStatus: NcrStatus | null }): FindingState {
  if (f.ncrStatus) return f.ncrStatus === 'CLOSED' ? 'CLOSED' : 'NCR';
  return f.closedOn ? 'CLOSED' : 'OPEN';
}

/** Days an open finding is past `FINDING_CLOSE_DAYS` from its audit (null while closed or still in time). */
export function findingOverdue(f: { closedOn: string | null; ncrStatus: NcrStatus | null }, auditOn: string, today: string): number | null {
  if (findingState(f) === 'CLOSED') return null;
  const late = daysBetween(auditOn, today) - FINDING_CLOSE_DAYS;
  return late > 0 ? late : null;
}

/** What is wrong with an audit before it is saved, in words for the form. */
export function auditProblem(a: { kind: QaAuditKind; date: string; visitor?: string | null; findings: { text: string }[] }, today: string): string | null {
  if (a.date > today) return 'An audit or visit is recorded on or after its day, not ahead of it';
  if (isExternalAudit(a.kind) && !a.visitor?.trim()) return 'Say who visited, such as the client’s engineer';
  if (a.findings.some((f) => !f.text.trim())) return 'Say what each finding is, or remove the empty line';
  return null;
}

/** Findings of one audit by where they stand. */
export function auditCounts(findings: { closedOn: string | null; ncrStatus: NcrStatus | null }[]): { total: number; open: number; closed: number } {
  const closed = findings.filter((f) => findingState(f) === 'CLOSED').length;
  return { total: findings.length, open: findings.length - closed, closed };
}

export interface QaAuditFindingDto {
  id: string;
  text: string;
  severity: NcrSeverity;
  /** Who on site puts it right, by when */
  dueOn: string | null;
  closedOn: string | null;
  closingNote: string | null;
  ncrId: string | null;
  ncrNo: string | null;
  ncrStatus: NcrStatus | null;
  state: FindingState;
  overdueDays: number | null;
}

export interface QaAuditDto {
  id: string;
  auditNo: string;
  projectId: string;
  projectName: string;
  kind: QaAuditKind;
  date: string;
  /** Who came, such as "EE (Quality), PWD" or "M/s TPI Consultants" */
  visitor: string | null;
  summary: string | null;
  /** An internal audit's score out of 100, where the company scores them */
  score: number | null;
  findings: QaAuditFindingDto[];
  open: number;
  createdByName: string;
  createdAt: string;
  attachments: AttachmentDto[];
}

/* ---------- the monthly report ---------- */

/** The first and last day of a YYYY-MM month. */
export function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

/** Tests passed of those decided, as a whole %; null with none decided. */
export const passRate = (passed: number, failed: number) => (passed + failed ? Math.round((passed * 100) / (passed + failed)) : null);

/** How long an open NCR has been open: up to 15 days, 16 to 30, or over 30. */
export type NcrAgeBand = 'UP_TO_15' | 'UP_TO_30' | 'OVER_30';
export const NCR_AGE_BAND_LABELS: Record<NcrAgeBand, string> = { UP_TO_15: 'Up to 15 days', UP_TO_30: '16 to 30 days', OVER_30: 'Over 30 days' };
export function ncrAgeBand(raisedOn: string, today: string): NcrAgeBand {
  const d = daysBetween(raisedOn, today);
  return d <= 15 ? 'UP_TO_15' : d <= 30 ? 'UP_TO_30' : 'OVER_30';
}

/** Counts of the codes given, largest first (then by code), with null as "Not given". */
export function countBy(codes: (string | null)[], nameOf: (code: string) => string): { code: string | null; name: string; count: number }[] {
  const m = new Map<string | null, number>();
  for (const c of codes) m.set(c, (m.get(c) ?? 0) + 1);
  return [...m.entries()]
    .map(([code, count]) => ({ code, name: code === null ? 'Not given' : nameOf(code), count }))
    .sort((a, b) => b.count - a.count || (a.code ?? '~').localeCompare(b.code ?? '~'));
}

export interface QaReportRowDto {
  projectId: string;
  projectName: string;
  /** Tests sampled in the month, and those decided */
  tests: number;
  passed: number;
  failed: number;
  passRate: number | null;
  /** Tests the quality plan owes and are not taken, today */
  short: number;
  ncrsRaised: number;
  ncrsClosed: number;
  /** Open NCRs today, and how many of them for over 30 days */
  ncrsOpen: number;
  ncrsOver30: number;
  /** Rework cost on NCRs raised in the month */
  reworkCost: string;
  audits: number;
  findingsOpen: number;
  /** Grades whose cubes fail IS 456 Table 11 */
  cubesFailing: string[];
}

export interface QaReportDto {
  month: string;
  from: string;
  to: string;
  rows: QaReportRowDto[];
  totals: Omit<QaReportRowDto, 'projectId' | 'projectName' | 'cubesFailing'> & { cubesFailing: number };
  ncrAges: { band: NcrAgeBand; count: number }[];
  byCategory: { code: string | null; name: string; count: number }[];
  byRootCause: { code: string | null; name: string; count: number }[];
  instrumentsOverdue: number;
  instrumentsDueSoon: number;
  samplesLate: number;
  certificatesMissing: number;
  labsExpiring: string[];
}

/** The report's totals over its rows (the pass rate from the summed counts, not an average of rates). */
export function reportTotals(rows: QaReportRowDto[]): QaReportDto['totals'] {
  const sum = (k: keyof QaReportRowDto) => rows.reduce((s, r) => s + (r[k] as number), 0);
  const passed = sum('passed');
  const failed = sum('failed');
  return {
    tests: sum('tests'),
    passed,
    failed,
    passRate: passRate(passed, failed),
    short: sum('short'),
    ncrsRaised: sum('ncrsRaised'),
    ncrsClosed: sum('ncrsClosed'),
    ncrsOpen: sum('ncrsOpen'),
    ncrsOver30: sum('ncrsOver30'),
    reworkCost: rows.reduce((s, r) => s + Number(r.reworkCost), 0).toFixed(2),
    audits: sum('audits'),
    findingsOpen: sum('findingsOpen'),
    cubesFailing: rows.reduce((s, r) => s + r.cubesFailing.length, 0),
  };
}
