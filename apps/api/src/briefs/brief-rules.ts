import { BRIEF_LINES, SUBMISSION_TYPE_LABELS, type BriefLineDto, type ProgressReportDto, type SubmissionType } from '@erp/shared';

/**
 * The morning brief and the weekly narrative (AI item 74) as the rules write them: the facts each is built from, the
 * draft the model starts from (and the text shown when the model's is not used), and the checks on what the model
 * wrote. Pure functions, so they are tested without a model (src/scripts/briefs-test.ts).
 */

/** What one person's morning brief is built from: their own My work and watch list, as their role sees them. */
export interface MorningFacts {
  today: string;
  approvals: { count: number; overTwoDays: number; oldestDays: number; oldest: { type: SubmissionType; title: string; projectName: string } | null } | null;
  sentBack: { count: number; href: string | null } | null;
  warnings: { count: number; top: { title: string; projectName: string | null }[] } | null;
  payablesDue: { count: number; amount: string } | null;
  lateDeliveries: { count: number; amount: string } | null;
  receivables: { count: number; amount: string; oldestDays: number } | null;
  expiring: { count: number } | null;
  lowStock: { count: number } | null;
}

/** "₹18.4 L", "₹2.1 Cr", "₹45,000". */
export function rupees(amount: string | number): string {
  const n = Number(amount);
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(1)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Every line the brief could carry, most pressing first. */
export function morningCandidates(f: MorningFacts): BriefLineDto[] {
  const out: BriefLineDto[] = [];
  const a = f.approvals;
  if (a && a.overTwoDays > 0) {
    const oldest = a.oldest ? ` (${SUBMISSION_TYPE_LABELS[a.oldest.type]}, ${a.oldest.projectName})` : '';
    out.push({ text: `${plural(a.overTwoDays, 'approval')} over two days old, the oldest ${plural(a.oldestDays, 'day')}${oldest}`, href: '/approvals' });
  } else if (a && a.count > 0) out.push({ text: `${plural(a.count, 'approval')} waiting for you`, href: '/approvals' });
  if (f.sentBack && f.sentBack.count > 0) out.push({ text: `${plural(f.sentBack.count, 'entry', 'entries')} of yours sent back for changes`, href: f.sentBack.href });
  if (f.warnings && f.warnings.top.length) {
    const more = f.warnings.count - 1;
    out.push({ text: `${f.warnings.top[0].title}${more > 0 ? `, and ${more} more on the watch list` : ''}`, href: '/watch-list' });
  }
  if (f.payablesDue && f.payablesDue.count > 0) out.push({ text: `${rupees(f.payablesDue.amount)} due to vendors this week or overdue, ${plural(f.payablesDue.count, 'bill')}`, href: '/payables' });
  if (f.lateDeliveries && f.lateDeliveries.count > 0) out.push({ text: `${plural(f.lateDeliveries.count, 'order')} past the delivery date, ${rupees(f.lateDeliveries.amount)} still to come`, href: '/purchase-orders' });
  if (f.receivables && f.receivables.count > 0) out.push({ text: `${rupees(f.receivables.amount)} outstanding from clients, the oldest bill ${plural(f.receivables.oldestDays, 'day')}`, href: '/receivables' });
  if (f.expiring && f.expiring.count > 0) out.push({ text: `${plural(f.expiring.count, 'guarantee or policy', 'guarantees and policies')} expiring within 30 days`, href: '/compliance' });
  if (f.lowStock && f.lowStock.count > 0) out.push({ text: `${plural(f.lowStock.count, 'item')} below minimum stock`, href: '/stock' });
  return out;
}

export const NOTHING_TODAY: BriefLineDto = { text: 'Nothing needs you this morning.', href: null };

/** The rules' own brief: the first three candidates. */
export function morningDraft(candidates: BriefLineDto[]): BriefLineDto[] {
  return candidates.length ? candidates.slice(0, BRIEF_LINES) : [NOTHING_TODAY];
}

/** What the model is asked to return, and what the rules' draft looks like in that form. */
export const asPicks = (candidates: BriefLineDto[], lines: BriefLineDto[]) => JSON.stringify(lines.map((l) => ({ line: l.text, from: candidates.indexOf(l) })));

const MAX_LINE = 140;

/**
 * The model's brief as lines, or null when it is not fit to show: not a JSON list of one to three lines, a line too
 * long or on two lines, a line naming no candidate (its link comes from the one it rewrites), or the same one twice.
 */
export function parsePicks(text: string, candidates: BriefLineDto[]): BriefLineDto[] | null {
  const json = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1);
  let picks: unknown;
  try {
    picks = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(picks) || picks.length < 1 || picks.length > BRIEF_LINES) return null;
  const used = new Set<number>();
  const out: BriefLineDto[] = [];
  for (const p of picks) {
    const line = typeof p?.line === 'string' ? p.line.trim() : '';
    const from = Number(p?.from);
    if (!line || line.length > MAX_LINE || /\n/.test(line)) return null;
    if (!candidates.length && from === -1) {
      out.push({ text: line, href: null });
      continue;
    }
    if (!Number.isInteger(from) || !candidates[from] || used.has(from)) return null;
    used.add(from);
    out.push({ text: line, href: candidates[from].href });
  }
  return out;
}

/* ---------------- the weekly narrative ---------------- */

const qty = (s: string | number) => Number(s).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** What a project's weekly narrative is built from: the report's own figures, without money or photos. */
export function narrativeFacts(r: ProgressReportDto) {
  const done = r.activities.filter((a) => Number(a.periodQty) > 0).sort((a, b) => Number(b.periodQty) - Number(a.periodQty));
  return {
    project: { code: r.project.code, name: r.project.name },
    from: r.from,
    to: r.to,
    physicalPct: { atStart: r.physical.atStartPct, atEnd: r.physical.atEndPct },
    timeElapsedPct: r.timeElapsedPct,
    workDone: done.slice(0, 5).map((a) => ({ name: a.name, unit: a.unit, quantity: a.periodQty, pctComplete: a.pct })),
    otherActivitiesProgressed: Math.max(0, done.length - 5),
    behindPlan: r.activities.filter((a) => a.delayed).map((a) => a.name).slice(0, 3),
    behindPlanCount: r.activities.filter((a) => a.delayed).length,
    workersPerDay: Math.round(r.manpower.reduce((s, m) => s + m.avgPerDay, 0)),
    attendanceDays: r.attendanceDays,
    dprDays: r.dpr.days,
    rainyDays: r.dpr.rainyDays,
    issues: r.issues.slice(0, 2).map((i) => i.text),
    issueCount: r.issues.length,
    safetyEvents: r.safety.length,
    delays: r.delays.slice(0, 2).map((d) => ({ title: d.title, days: d.daysInPeriod })),
    delayCount: r.delays.length,
    nextWeek: r.nextPeriod.slice(0, 3).map((n) => ({ name: n.name, unit: n.unit, balance: n.balanceQty })),
  };
}
export type NarrativeFacts = ReturnType<typeof narrativeFacts>;

const list = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
const pct = (n: number) => `${n.toFixed(1)}%`;

/** The rules' paragraph: progress against time, the work done, the people on site, what held it up and what is next. */
export function narrativeDraft(f: NarrativeFacts): string {
  const parts: string[] = [];
  const time = f.timeElapsedPct === null ? '' : `, with ${pct(f.timeElapsedPct)} of the contract time gone`;
  parts.push(`In the week of ${day(f.from)} to ${day(f.to)}, overall progress on ${f.project.name} moved from ${pct(f.physicalPct.atStart)} to ${pct(f.physicalPct.atEnd)}${time}.`);
  if (f.workDone.length) {
    const others = f.otherActivitiesProgressed ? `, with ${plural(f.otherActivitiesProgressed, 'more activity', 'more activities')} progressed` : '';
    parts.push(`Work done: ${list(f.workDone.map((w) => `${w.name} ${qty(w.quantity)} ${w.unit}`))}${others}.`);
  } else parts.push('No progress was recorded this week.');
  if (f.workersPerDay > 0) parts.push(`About ${f.workersPerDay} workers a day were on site over ${plural(f.attendanceDays, 'day')} of attendance.`);
  if (f.rainyDays > 0) parts.push(`Rain affected ${plural(f.rainyDays, 'day')}.`);
  if (f.delayCount) parts.push(`Work was held up by ${list(f.delays.map((d) => `${d.title} (${plural(d.days, 'day')})`))}${f.delayCount > f.delays.length ? ` and ${f.delayCount - f.delays.length} more` : ''}.`);
  if (f.behindPlanCount === 1) parts.push(`${f.behindPlan[0]} is behind plan.`);
  else if (f.behindPlanCount > 1) parts.push(`${f.behindPlanCount} activities are behind plan, among them ${list(f.behindPlan)}.`);
  if (f.nextWeek.length) parts.push(`Next week: ${list(f.nextWeek.map((n) => n.name))}.`);
  return parts.join(' ');
}

const MAX_NARRATIVE = 1200;

/** The model's paragraph is fit to show: one paragraph, not too long, and no money (the report has its own figures). */
export function narrativeFits(text: string): boolean {
  const t = text.trim();
  return t.length >= 40 && t.length <= MAX_NARRATIVE && !/\n\s*\n/.test(t) && !/₹|\bRs\.?\s?\d|\blakh|\bcrore/i.test(t);
}

/** The Monday of the week `date` falls in. */
export function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
