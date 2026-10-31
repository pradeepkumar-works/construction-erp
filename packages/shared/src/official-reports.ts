/**
 * Official progress reports (item 174, asked by Pradeep on 30 Oct 2026 with the client's own samples): the daily site
 * report, the weekly progress report and the monthly progress report (MPR) a contractor submits to the client or its
 * consultant, in Nirmaan's design. One document model (`OfficialReportDto`: a header, numbered chapters of blocks and the
 * signatures) is drawn on the screen and written to PDF, Word and Excel, so the four always say the same thing. The
 * periods, numbers, delays and wording below are pure and tested in `apps/api/src/scripts/official-reports-test.ts`.
 */
import type { ReportColumnDto, ReportColumnKind, ReportFigureDto, ReportRowDto } from './management';

export const OFFICIAL_REPORT_KINDS = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;
export type OfficialReportKind = (typeof OFFICIAL_REPORT_KINDS)[number];
export const OFFICIAL_REPORT_KIND_LABELS: Record<OfficialReportKind, string> = { DAILY: 'Daily', WEEKLY: 'Weekly', MONTHLY: 'Monthly' };

/** Title, the short mark in the document number, and what each report is for. */
export const OFFICIAL_REPORTS: Record<OfficialReportKind, { title: string; code: string; description: string }> = {
  DAILY: { title: 'Daily progress report', code: 'DPR', description: 'The day at site: work done by component and chainage, crew and machines, observations and deviations with their closure, and photographs.' },
  WEEKLY: { title: 'Weekly progress report', code: 'WPR', description: 'Overall physical and financial progress, every component against its scope with its status in words, the week’s work and observations, and photographs.' },
  MONTHLY: { title: 'Monthly progress report', code: 'MPR', description: 'The MPR: project details, summary, delays against the programme, physical and financial progress, bills, variations and extensions, drawings, meetings, letters, staff, machinery, quality, safety, risks and photographs.' },
};

/* ---------- the document ---------- */

export interface OfficialFactDto {
  label: string;
  value: string | number | null;
  /** How the value reads (text when left out): money in rupees, a date, a % */
  kind?: ReportColumnKind;
}

export type OfficialBlockDto =
  | { type: 'facts'; facts: OfficialFactDto[] }
  | { type: 'text'; title?: string; paragraphs: string[] }
  | { type: 'figures'; figures: ReportFigureDto[] }
  | { type: 'table'; title?: string; note?: string; columns: ReportColumnDto[]; rows: ReportRowDto[]; total?: ReportRowDto; empty: string }
  | { type: 'photos'; photos: { url: string; caption: string }[]; empty?: string };

export interface OfficialChapterDto {
  key: string;
  title: string;
  blocks: OfficialBlockDto[];
}

/** When the report was submitted: the issue register's latest entry for the same project, kind and period. */
export interface OfficialIssueDto {
  id: string;
  projectId: string;
  kind: OfficialReportKind;
  from: string;
  to: string;
  reportNo: number | null;
  docNo: string;
  /** 0 the first time, then 1, 2… for each re-issue of the same period */
  revision: number;
  issuedAt: string;
  issuedByName: string;
  note: string | null;
}

export interface OfficialReportDto {
  kind: OfficialReportKind;
  title: string;
  /** Counted from the project's start: the day, week or month of the contract (null without a start date) */
  reportNo: number | null;
  /** P07/MPR/016 */
  docNo: string;
  /** The issue this copy is (null for a draft made now from live data) */
  issue: OfficialIssueDto | null;
  /** The period in words: "8 Apr 2026", "Week 3 of April 2026 (13 to 19 Apr)", "April 2026" */
  period: string;
  from: string;
  to: string;
  generatedAt: string;
  organizationName: string;
  project: { id: string; code: string; name: string };
  /** The box at the top: client, contractor, LOA, agreement, scheme, period, report date */
  header: OfficialFactDto[];
  chapters: OfficialChapterDto[];
  /** Signature boxes at the foot: who prepares, checks and receives it */
  signatures: { role: string; name: string | null }[];
  /** Where the figures come from, for the last line */
  sources: string;
  /** Made for someone who sees the contract, so it has money in it (bills, financial %, variations) */
  withMoney: boolean;
}

/** What the page offers for a project: the latest issues of each kind (the register). */
export interface OfficialIssueListDto {
  issues: OfficialIssueDto[];
}

/* ---------- periods and numbers ---------- */

const DAY = 86_400_000;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const utc = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`);
const iso = (t: Date) => t.toISOString().slice(0, 10);
const addDays = (d: string, n: number) => iso(new Date(utc(d).getTime() + n * DAY));
export const daysFrom = (a: string, b: string) => Math.round((utc(b).getTime() - utc(a).getTime()) / DAY);
/** Monday on or before the date. */
export const mondayOf = (d: string) => addDays(d, -((utc(d).getUTCDay() + 6) % 7));

/** The period a report covers: the day; the Monday-to-Sunday week holding the date; the calendar month. */
export function officialPeriod(kind: OfficialReportKind, date: string): { from: string; to: string } {
  const d = date.slice(0, 10);
  if (kind === 'DAILY') return { from: d, to: d };
  if (kind === 'WEEKLY') {
    const from = mondayOf(d);
    return { from, to: addDays(from, 6) };
  }
  const t = utc(d);
  const from = iso(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1)));
  const to = iso(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)));
  return { from, to };
}

/**
 * The report's number, counted from the project's start: day 1 is the start date, week 1 the week holding it, MPR 1 its
 * month. Null without a start date or for a period wholly before it.
 */
export function officialReportNo(kind: OfficialReportKind, projectStart: string | null, from: string): number | null {
  if (!projectStart) return null;
  const start = projectStart.slice(0, 10);
  let n: number;
  if (kind === 'DAILY') n = daysFrom(start, from) + 1;
  else if (kind === 'WEEKLY') n = Math.floor(daysFrom(mondayOf(start), mondayOf(from)) / 7) + 1;
  else {
    const s = utc(start);
    const f = utc(from);
    n = (f.getUTCFullYear() - s.getUTCFullYear()) * 12 + (f.getUTCMonth() - s.getUTCMonth()) + 1;
  }
  return n >= 1 ? n : null;
}

/** P07/MPR/016, or P07/MPR/DRAFT without a number. */
export function officialDocNo(projectCode: string, kind: OfficialReportKind, reportNo: number | null): string {
  return `${projectCode}/${OFFICIAL_REPORTS[kind].code}/${reportNo === null ? 'DRAFT' : String(reportNo).padStart(3, '0')}`;
}

/** "8 Apr 2026": a date inside a report's sentences (tables and facts carry dates as dates). */
export const officialDate = (d: string) => {
  const t = utc(d);
  return `${t.getUTCDate()} ${SHORT[t.getUTCMonth()]} ${t.getUTCFullYear()}`;
};
const dayWords = officialDate;

/** The week of its month a week falls in, by its Thursday (so a week belongs to the month holding most of it). */
export function weekOfMonth(from: string): { week: number; month: string } {
  const thu = utc(addDays(mondayOf(from), 3));
  return { week: Math.floor((thu.getUTCDate() - 1) / 7) + 1, month: `${MONTHS[thu.getUTCMonth()]} ${thu.getUTCFullYear()}` };
}

/** "8 Apr 2026", "Week 3 of April 2026 (13 to 19 Apr 2026)", "April 2026". */
export function officialPeriodWords(kind: OfficialReportKind, from: string, to: string): string {
  if (kind === 'DAILY') return dayWords(from);
  if (kind === 'WEEKLY') {
    const { week, month } = weekOfMonth(from);
    const f = utc(from);
    const t = utc(to);
    const start = f.getUTCMonth() === t.getUTCMonth() ? String(f.getUTCDate()) : `${f.getUTCDate()} ${SHORT[f.getUTCMonth()]}`;
    return `Week ${week} of ${month} (${start} to ${dayWords(to)})`;
  }
  const f = utc(from);
  return `${MONTHS[f.getUTCMonth()]} ${f.getUTCFullYear()}`;
}

/** nirmaan-P07-MPR-016-2026-04.pdf */
export function officialFileName(r: Pick<OfficialReportDto, 'kind' | 'project' | 'reportNo' | 'from' | 'issue'>, ext: 'pdf' | 'docx' | 'xlsx'): string {
  const period = r.kind === 'MONTHLY' ? r.from.slice(0, 7) : r.from;
  const no = r.reportNo === null ? 'draft' : String(r.reportNo).padStart(3, '0');
  const rev = r.issue && r.issue.revision > 0 ? `-R${r.issue.revision}` : '';
  return `${r.project.code}-${OFFICIAL_REPORTS[r.kind].code}-${no}${rev}-${period}.${ext}`.replace(/[^\w.-]+/g, '-');
}

/* ---------- what the chapters say ---------- */

export interface ComponentScheduleFacts {
  /** Last planned finish of its activities */
  plannedEnd: string | null;
  /** Its progress, % */
  pct: number;
  /** The day its last approved progress was recorded (its finish, once complete) */
  lastWorkOn: string | null;
}

/**
 * Days a component is behind its programme as on a date: finished, the days its last work ran past the planned finish;
 * not finished, the days since the planned finish. Never negative; null without a planned finish.
 */
export function componentDelayDays(c: ComponentScheduleFacts, asOf: string): number | null {
  if (!c.plannedEnd) return null;
  const done = c.pct >= 100;
  const end = done ? (c.lastWorkOn ?? c.plannedEnd) : asOf;
  return Math.max(0, daysFrom(c.plannedEnd, end));
}

export interface StatusActivity {
  name: string;
  pct: number;
  /** Approved quantity in the period */
  periodQty?: number;
}

/**
 * A component's "current status" in words, from its activities: what is complete, what is in progress and how far, and
 * what has not started, in the programme's order. "Excavation and PCC completed; Raft in progress (60%); 2 not started".
 */
export function componentStatusText(acts: StatusActivity[]): string {
  if (!acts.length) return 'No activities in the programme';
  const done = acts.filter((a) => a.pct >= 100).map((a) => a.name);
  const going = acts.filter((a) => a.pct > 0 && a.pct < 100);
  const notStarted = acts.filter((a) => a.pct <= 0).length;
  if (done.length === acts.length) return 'Completed';
  if (notStarted === acts.length) return 'Not started';
  const parts: string[] = [];
  if (done.length) parts.push(`${listWords(done, 3)} completed`);
  if (going.length) parts.push(`${listWords(going.map((a) => `${a.name} (${Math.round(a.pct)}%)`), 3)} in progress`);
  if (notStarted) parts.push(`${notStarted} not started`);
  return parts.join('; ');
}

/** "A", "A and B", "A, B and C", "A, B and 3 more". */
export function listWords(items: string[], max = 3): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length > max) return `${items.slice(0, max - 1).join(', ')} and ${items.length - max + 1} more`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export interface SummaryFacts {
  kind: OfficialReportKind;
  physicalPct: number;
  physicalAtStartPct: number;
  /** Planned by the end of the period, %; null without a programme */
  plannedPct: number | null;
  /** Share of the contract period gone, %; null without both dates */
  timeElapsedPct: number | null;
  /** Approved RA bills against the revised contract, %; null when the reader may not see it */
  financialPct: number | null;
  /** Components finished in the period, by name */
  completed: string[];
  /** Components behind their programme, worst first: name and days */
  late: { name: string; days: number }[];
  /** Days on which work was held up (delay register) in the period */
  delayDays: number;
  openNcrs: number;
  /** Days of the period with an approved DPR, and the period's length */
  dprDays: number;
  days: number;
}

const pctWords = (n: number) => `${Math.round(n * 10) / 10}%`;

/**
 * The paragraph a weekly or monthly report opens with, written from its own figures: progress and its gain against the
 * plan and the time gone, money where the reader sees it, what finished, what is late and what is open.
 */
export function officialSummary(f: SummaryFacts): string {
  const span = f.kind === 'MONTHLY' ? 'this month' : f.kind === 'WEEKLY' ? 'this week' : 'today';
  const gain = Math.round((f.physicalPct - f.physicalAtStartPct) * 10) / 10;
  const out: string[] = [];
  let first = `Overall physical progress is ${pctWords(f.physicalPct)}`;
  first += gain > 0 ? `, up ${pctWords(gain)} ${span}` : `, with no measurable gain ${span}`;
  if (f.plannedPct !== null) {
    const gap = Math.round((f.physicalPct - f.plannedPct) * 10) / 10;
    first += gap >= 0 ? `, ${gap === 0 ? 'on' : `${pctWords(gap)} ahead of`} the ${pctWords(f.plannedPct)} planned` : `, ${pctWords(-gap)} behind the ${pctWords(f.plannedPct)} planned`;
  }
  if (f.timeElapsedPct !== null) first += ` with ${pctWords(f.timeElapsedPct)} of the contract period gone`;
  out.push(`${first}.`);
  if (f.financialPct !== null) out.push(`Bills approved to date come to ${pctWords(f.financialPct)} of the revised contract value.`);
  if (f.completed.length) out.push(`${listWords(f.completed, 4)} ${f.completed.length === 1 ? 'was' : 'were'} completed ${span}.`);
  if (f.late.length) {
    const worst = f.late.slice(0, 3).map((l) => `${l.name} (${l.days} day${l.days === 1 ? '' : 's'})`);
    out.push(`${f.late.length === 1 ? 'One component is' : `${f.late.length} components are`} behind the programme: ${listWords(worst, 3)}${f.late.length > 3 ? ' and others' : ''}.`);
  }
  if (f.delayDays > 0) out.push(`Work was held up on ${f.delayDays} day${f.delayDays === 1 ? '' : 's'} ${span} (see hindrances).`);
  if (f.openNcrs > 0) out.push(`${f.openNcrs} non-conformance${f.openNcrs === 1 ? ' is' : 's are'} open.`);
  if (f.kind !== 'DAILY' && f.dprDays < f.days) out.push(`Approved daily reports cover ${f.dprDays} of the ${f.days} days.`);
  return out.join(' ');
}
