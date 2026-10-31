/**
 * Meetings' rules, with no database: how late an action is, what stops the minutes being issued, what an
 * action may move to, and the counts the register shows. Tested in src/scripts/meetings-test.ts.
 */
import type { MeetingActionStatus } from '@erp/shared';

const DAY = 86_400_000;
/** Whole days from `from` to `to`, both YYYY-MM-DD. */
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
/** YYYY-MM-DD `n` days after `d`. */
export const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

export interface ActionTiming {
  /** Days past due while open (0 on the day it is due); null otherwise */
  daysOverdue: number | null;
  /** Days left while open and not yet due; null otherwise */
  daysLeft: number | null;
}

/** Where an action stands against its due date. A closed action, or one with no date, is neither late nor due. */
export function actionTiming(status: MeetingActionStatus, dueOn: string | null, today: string): ActionTiming {
  if (status !== 'OPEN' || !dueOn) return { daysOverdue: null, daysLeft: null };
  const left = daysBetween(today, dueOn);
  return left > 0 ? { daysOverdue: null, daysLeft: left } : { daysOverdue: left === 0 ? 0 : -left, daysLeft: null };
}

export interface IssueInput {
  attendees: { present: boolean }[];
  points: number;
  actions: { text: string; ownerName: string | null; dueOn: string | null }[];
}

/**
 * Why the minutes cannot be issued yet, or null. Issued minutes go to those present and fix who does what by when, so
 * someone must have been there, the minutes must say something, and every action needs an owner and a date.
 */
export function issueProblem(m: IssueInput): string | null {
  if (!m.attendees.some((a) => a.present)) return 'Mark who was present.';
  if (!m.points && !m.actions.length) return 'Write the minutes: a point noted, a decision or an action.';
  for (const [i, a] of m.actions.entries()) {
    if (!a.ownerName?.trim()) return `Action ${i + 1}: name who does it.`;
    if (!a.dueOn) return `Action ${i + 1}: give the date it is due.`;
  }
  return null;
}

/** Why an action cannot move to `to`, or null. Done needs the day it was done (not ahead); dropping needs a reason. */
export function actionMoveProblem(from: MeetingActionStatus, to: MeetingActionStatus, opts: { doneOn?: string | null; note?: string | null; today: string }): string | null {
  if (from === to && to !== 'OPEN') return `This action is already ${to === 'DONE' ? 'done' : 'dropped'}.`;
  if (to === 'DONE') {
    if (!opts.doneOn) return 'Give the day it was done.';
    if (opts.doneOn > opts.today) return 'It cannot be done after today.';
  }
  if (to === 'DROPPED' && !opts.note?.trim()) return 'Say why the action is dropped.';
  return null;
}

export interface ActionCounts {
  open: number;
  overdue: number;
  dueThisWeek: number;
  doneThisMonth: number;
}

/** The register's figures: open, late, due in the next 7 days, and done since the 1st of the month. */
export function actionCounts(actions: { status: MeetingActionStatus; dueOn: string | null; doneOn: string | null }[], today: string): ActionCounts {
  const month = `${today.slice(0, 7)}-01`;
  const week = addDays(today, 7);
  const out: ActionCounts = { open: 0, overdue: 0, dueThisWeek: 0, doneThisMonth: 0 };
  for (const a of actions) {
    if (a.status === 'DONE' && a.doneOn && a.doneOn >= month && a.doneOn <= today) out.doneThisMonth += 1;
    if (a.status !== 'OPEN') continue;
    out.open += 1;
    if (a.dueOn && a.dueOn < today) out.overdue += 1;
    else if (a.dueOn && a.dueOn <= week) out.dueThisWeek += 1;
  }
  return out;
}

/** Open actions in the order to take them up: the earliest due (so the latest overdue) first, those with no date last. */
export function byUrgency<T extends { dueOn: string | null; sortKey?: string }>(actions: T[]): T[] {
  return [...actions].sort((a, b) => (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999') || (a.sortKey ?? '').localeCompare(b.sortKey ?? ''));
}
