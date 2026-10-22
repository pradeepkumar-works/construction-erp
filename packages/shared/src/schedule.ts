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

/** How one activity hangs on another (v6 item 114): finish to start, start to start, finish to finish, start to finish. */
export const ACTIVITY_LINK_TYPES = ['FS', 'SS', 'FF', 'SF'] as const;
export type ActivityLinkType = (typeof ACTIVITY_LINK_TYPES)[number];
export const ACTIVITY_LINK_TYPE_LABELS: Record<ActivityLinkType, string> = {
  FS: 'Finish to start',
  SS: 'Start to start',
  FF: 'Finish to finish',
  SF: 'Start to finish',
};

/** A link written as planners do: "FS", "SS+3", "FF-2". */
export const linkLabel = (type: ActivityLinkType, lagDays: number) => `${type}${lagDays > 0 ? `+${lagDays}` : lagDays < 0 ? `${lagDays}` : ''}`;

export interface ActivityLinkDto {
  id: string;
  predecessorId: string;
  predecessorName: string;
  successorId: string;
  successorName: string;
  type: ActivityLinkType;
  /** Calendar days after (or, negative, before) the link point */
  lagDays: number;
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
  /** From the links (v6 item 114): the earliest the links let it start and finish, and the latest without moving the finish */
  earlyStart: string | null;
  earlyFinish: string | null;
  lateStart: string | null;
  lateFinish: string | null;
  /** Days it can slip without moving the project's finish; null when it has no dates or is done */
  totalFloat: number | null;
  /** On the critical path: no float */
  critical: boolean;
  /** Its planned start is earlier than its predecessors allow: the day the links allow */
  linkStartsOn: string | null;
  predecessors: { linkId: string; activityId: string; type: ActivityLinkType; lagDays: number }[];
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
    links: number;
    critical: number;
    /** Activities planned to start before their links allow */
    linkConflicts: number;
    /** The finish the links and planned durations give */
    networkFinish: string | null;
  };
  links: ActivityLinkDto[];
}

/** Whether an activity in the look-ahead can start: its predecessors done (or started, for a start link), or what holds it. */
export type LookaheadReadiness = 'IN_PROGRESS' | 'READY' | 'WAITING';
export const LOOKAHEAD_READINESS_LABELS: Record<LookaheadReadiness, string> = { IN_PROGRESS: 'Under way', READY: 'Ready to start', WAITING: 'Waiting' };

export interface LookaheadActivityDto {
  id: string;
  name: string;
  responsibleName: string | null;
  plannedStart: string;
  plannedEnd: string;
  progressPct: number;
  state: ScheduleState;
  critical: boolean;
  totalFloat: number | null;
  readiness: LookaheadReadiness;
  /** Not started and its links hold it later than planned: the first day they allow */
  linkStartsOn: string | null;
  /** The predecessors not yet where the link needs them (or, when only a lag holds it, all of them) */
  waitingOn: string[];
}

/** The three weeks from this Monday: what is planned in each, what is ready and what still waits (v6 item 114). */
export interface LookaheadDto {
  projectId: string;
  today: string;
  weeks: { from: string; to: string; activities: LookaheadActivityDto[] }[];
  /** Past their planned end and not done: carried into the first week */
  overdue: LookaheadActivityDto[];
}

/** A schedule file read for import (MS Project XML or Primavera XER), before anything is saved. */
export const SCHEDULE_FILE_FORMATS = ['MSP_XML', 'XER'] as const;
export type ScheduleFileFormat = (typeof SCHEDULE_FILE_FORMATS)[number];
export const SCHEDULE_FILE_FORMAT_LABELS: Record<ScheduleFileFormat, string> = { MSP_XML: 'MS Project XML', XER: 'Primavera P6 XER' };

export interface ScheduleImportResultDto {
  format: ScheduleFileFormat;
  /** True when nothing was saved (a preview) */
  dryRun: boolean;
  activities: { name: string; start: string; end: string; action: 'CREATE' | 'UPDATE' | 'SAME' }[];
  created: number;
  updated: number;
  links: number;
  /** What was left out, in words: summary rows, milestones, links to rows not in the file */
  skipped: string[];
}
