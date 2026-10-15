/** Gantt, milestones and the frozen baseline (v4 item 43). */
import { daysBetween } from './maintenance';

/** An activity is "behind" when its progress trails the straight-line plan by more than this many percentage points. */
export const BEHIND_TOLERANCE_PCT = 10;

export type ScheduleState = 'UNSCHEDULED' | 'NOT_STARTED' | 'ON_TRACK' | 'BEHIND' | 'LATE' | 'DONE';

export const SCHEDULE_STATE_LABELS: Record<ScheduleState, string> = {
  UNSCHEDULED: 'No dates',
  NOT_STARTED: 'Not started',
  ON_TRACK: 'On track',
  BEHIND: 'Behind plan',
  LATE: 'Past end date',
  DONE: 'Done',
};

/** Progress the plan expects on `today`: 0 before the start, 100 after the end, straight line in between. */
export function expectedPct(start: string | null, end: string | null, today: string): number | null {
  if (!start || !end) return null;
  const span = daysBetween(start, end) + 1;
  const gone = daysBetween(start, today) + 1;
  if (gone <= 0) return 0;
  if (gone >= span) return 100;
  return Math.round((gone / span) * 1000) / 10;
}

/** Where an activity stands against its current plan. */
export function scheduleState(a: { plannedStart: string | null; plannedEnd: string | null; progressPct: number }, today: string): ScheduleState {
  if (a.progressPct >= 100) return 'DONE';
  if (!a.plannedStart || !a.plannedEnd) return 'UNSCHEDULED';
  if (today > a.plannedEnd) return 'LATE';
  const expected = expectedPct(a.plannedStart, a.plannedEnd, today) ?? 0;
  if (today < a.plannedStart) return a.progressPct > 0 ? 'ON_TRACK' : 'NOT_STARTED';
  return a.progressPct + BEHIND_TOLERANCE_PCT < expected ? 'BEHIND' : 'ON_TRACK';
}

export type MilestoneState = 'UPCOMING' | 'DUE_SOON' | 'MISSED' | 'ACHIEVED' | 'ACHIEVED_LATE';

export const MILESTONE_STATE_LABELS: Record<MilestoneState, string> = {
  UPCOMING: 'Upcoming',
  DUE_SOON: 'Due soon',
  MISSED: 'Missed',
  ACHIEVED: 'Achieved',
  ACHIEVED_LATE: 'Achieved late',
};

/** A milestone is "due soon" within this many days of its due date. */
export const MILESTONE_SOON_DAYS = 14;

export function milestoneState(m: { dueDate: string; achievedOn: string | null }, today: string): MilestoneState {
  if (m.achievedOn) return m.achievedOn > m.dueDate ? 'ACHIEVED_LATE' : 'ACHIEVED';
  const left = daysBetween(today, m.dueDate);
  return left < 0 ? 'MISSED' : left <= MILESTONE_SOON_DAYS ? 'DUE_SOON' : 'UPCOMING';
}

/** Days a date has moved against its baseline: positive = later than the baseline. Null without both dates. */
export const slipDays = (current: string | null, baseline: string | null) => (current && baseline ? daysBetween(baseline, current) : null);

export interface MilestoneDto {
  id: string;
  projectId: string;
  name: string;
  dueDate: string;
  baselineDate: string | null;
  achievedOn: string | null;
  note: string | null;
  sortOrder: number;
  state: MilestoneState;
  /** Due date (or the date achieved) against the baseline, in days; positive = later */
  slipDays: number | null;
}

export interface GanttActivityDto {
  id: string;
  name: string;
  unit: string;
  boqItemNo: string | null;
  responsibleName: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  baselineStart: string | null;
  baselineEnd: string | null;
  /** First approved progress entry */
  actualStart: string | null;
  /** The approved entry that took it to 100% */
  actualEnd: string | null;
  progressPct: number;
  /** Straight-line progress the plan expects today */
  expectedPct: number | null;
  state: ScheduleState;
  /** Planned end (or actual end, once done) against the baseline end, in days; positive = later */
  finishSlipDays: number | null;
}

export interface GanttDto {
  projectId: string;
  projectStart: string | null;
  projectEnd: string | null;
  today: string;
  baselineAt: string | null;
  baselineByName: string | null;
  baselineNote: string | null;
  activities: GanttActivityDto[];
  milestones: MilestoneDto[];
  summary: {
    activities: number;
    scheduled: number;
    done: number;
    behind: number;
    late: number;
    /** Activities whose finish has moved later than the baseline */
    slipped: number;
    /** Activities added after the baseline was frozen */
    notInBaseline: number;
    milestones: number;
    milestonesAchieved: number;
    milestonesMissed: number;
    /** Latest planned end of the activities and milestones */
    plannedFinish: string | null;
    baselineFinish: string | null;
    finishSlipDays: number | null;
  };
}
