import { inr } from '../common/submission-titles';

/** A receipt from a client in the week, as the weekly summary reads it. */
export interface WeekReceipt {
  projectId: string;
  projectCode: string;
  projectName: string;
  /** Rupees, as a decimal string */
  amount: string;
  /** YYYY-MM-DD */
  date: string;
  /** "RA bill 3" when the receipt is against a bill */
  billLabel: string | null;
}

export interface ReceiptWeekSummary {
  /** Everything received in the week */
  total: string;
  count: number;
  /** Most money first */
  projects: { projectId: string; projectCode: string; projectName: string; total: string; count: number }[];
  title: string;
  body: string;
}

const round2 = (n: number) => n.toFixed(2);

/**
 * What came in from clients over a week, for the Monday summary (finding 18 of the October review): one line per
 * project, most money first. Null when nothing was received, because a week with no money in is not worth an email.
 * `projects` are the projects the reader may see; receipts of any other are left out by the caller.
 */
export function receiptWeek(from: string, to: string, receipts: WeekReceipt[]): ReceiptWeekSummary | null {
  const inWeek = receipts.filter((r) => r.date >= from && r.date <= to);
  if (!inWeek.length) return null;
  const byProject = new Map<string, { projectId: string; projectCode: string; projectName: string; total: number; count: number }>();
  let total = 0;
  for (const r of inWeek) {
    const amount = Number(r.amount);
    total += amount;
    const row = byProject.get(r.projectId) ?? { projectId: r.projectId, projectCode: r.projectCode, projectName: r.projectName, total: 0, count: 0 };
    row.total += amount;
    row.count += 1;
    byProject.set(r.projectId, row);
  }
  const projects = [...byProject.values()]
    .sort((a, b) => b.total - a.total || a.projectCode.localeCompare(b.projectCode))
    .map((p) => ({ projectId: p.projectId, projectCode: p.projectCode, projectName: p.projectName, total: round2(p.total), count: p.count }));
  const lines = projects.map((p) => `${p.projectName}: ${inr(p.total)}${p.count > 1 ? ` in ${p.count} receipts` : ''}`);
  const named = lines.slice(0, 4).join('; ');
  const rest = lines.length - Math.min(lines.length, 4);
  return {
    total: round2(total),
    count: inWeek.length,
    projects,
    title: `${inr(round2(total))} received from clients last week`,
    body: `${inWeek.length} receipt${inWeek.length === 1 ? '' : 's'} on ${projects.length} project${projects.length === 1 ? '' : 's'}. ${named}${rest > 0 ? `; and ${rest} more` : ''}.`,
  };
}
