/** Gantt, milestones and the frozen baseline. */
import { daysBetween } from './maintenance';

/** An activity is "behind" when its progress trails the straight-line plan by more than this many percentage points. */
export const BEHIND_TOLERANCE_PCT = 10;

export type ScheduleState = 'UNSCHEDULED' | 'NOT_STARTED' | 'ON_TRACK' | 'BEHIND' | 'LATE' | 'DONE';

export const SCHEDULE_STATE_LABELS: Record<ScheduleState, string> = {
  UNSCHEDULED: 'No dates',
  NOT_STARTED: 'Not started',
  ON_TRACK: 'On track',
  BEHIND: 'Behind plan',
  LATE: 'Past planned finish',
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

/** How one activity hangs on another: finish to start, start to start, finish to finish, start to finish. */
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
  /** From the links: the earliest the links let it start and finish, and the latest without moving the finish */
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
  /** The completion date after the extensions of time granted: where the plan must end */
  completionDate: string | null;
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

/** The three weeks from this Monday: what is planned in each, what is ready and what still waits. */
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

/** Points of progress a project may trail its plan (or the time gone) by before it counts as behind. */
export const PROJECT_BEHIND_BY = 10;

export type ProjectScheduleState = 'NO_PLAN' | 'ON_TRACK' | 'BEHIND' | 'FINISH_LATE' | 'OVERRUN' | 'COMPLETED' | 'ON_HOLD';

export interface ProjectScheduleFacts {
  status: string;
  /** Physical progress, 0 to 100 */
  done: number;
  /** % planned by today from the activities' dates, else null */
  planned: number | null;
  /** % of the time between the project's start and end gone by, else null */
  elapsed: number | null;
  /** Activities past their planned finish and not done */
  late: number;
  /** Activities with both planned dates */
  scheduled: number;
  /** Contract completion after the extensions of time granted */
  completionDate: string | null;
  /** The latest planned finish of the activities (where the plan now ends) */
  plannedFinish: string | null;
  today: string;
}

export interface ProjectScheduleStatus {
  state: ProjectScheduleState;
  level: 'success' | 'warning' | 'error' | 'default';
  /** Behind its plan by 10 points or more, planned to finish after the completion date, or past it unfinished */
  behind: boolean;
  /** Past its completion date and not finished */
  overrun: boolean;
  /** Days the plan's finish lands after the completion date; null when on or before it, or either date is missing */
  finishLateDays: number | null;
  late: number;
}

/**
 * Where a project stands against its schedule, the one rule behind the header's chip, the overview's lead line, the
 * watch list and the morning brief. A plan that ends after the contract's completion date (with its
 * extensions) is late however well today's progress keeps to it; a project with no dated activities has no plan to be
 * on track with.
 */
export function projectScheduleStatus(f: ProjectScheduleFacts): ProjectScheduleStatus {
  const finishLateDays = f.plannedFinish && f.completionDate && f.plannedFinish > f.completionDate ? daysBetween(f.completionDate, f.plannedFinish) : null;
  const base = { finishLateDays, late: f.late };
  if (f.status === 'COMPLETED' || f.status === 'CLOSED') return { ...base, state: 'COMPLETED', level: 'success', behind: false, overrun: false };
  if (f.status === 'ON_HOLD') return { ...base, state: 'ON_HOLD', level: 'default', behind: false, overrun: false };
  const overrun = !!f.completionDate && f.completionDate < f.today && f.done < 100;
  const mark = f.planned ?? f.elapsed;
  const trailing = mark !== null && f.done <= mark - PROJECT_BEHIND_BY;
  if (overrun) return { ...base, state: 'OVERRUN', level: 'error', behind: true, overrun };
  if (finishLateDays !== null) return { ...base, state: 'FINISH_LATE', level: 'error', behind: true, overrun };
  if (trailing) return { ...base, state: 'BEHIND', level: f.late > 0 ? 'error' : 'warning', behind: true, overrun };
  if (f.scheduled === 0) return { ...base, state: 'NO_PLAN', level: 'default', behind: false, overrun };
  return { ...base, state: 'ON_TRACK', level: f.late > 0 ? 'warning' : 'success', behind: false, overrun };
}

/** Share of the project's time gone by on a day (0 to 100), or null without both dates. */
export function timeElapsedPct(start: string | null, end: string | null, on: string): number | null {
  if (!start || !end) return null;
  const total = daysBetween(start, end);
  if (total <= 0) return null;
  return Math.min(100, Math.max(0, (daysBetween(start, on) / total) * 100));
}

export interface ScheduleReading extends ProjectScheduleStatus {
  done: number;
  /** % planned by today from the activities' dates, else null */
  planned: number | null;
  /** % of the time between the project's start and end gone by, else null */
  elapsed: number | null;
  /** Where the plan now ends, and the completion date it is held to */
  plannedFinish: string | null;
  completionDate: string | null;
}

/**
 * A project's schedule status read from its record and its dashboard, the same on the web's header and Overview and
 * on the phone's project screen: progress against what the activities' dates planned by today, and where the plan
 * ends against the completion date (`projectScheduleStatus`).
 */
export function scheduleReading(
  project: { status: string; physicalProgressPct: number; startDate: string | null; endDate: string | null },
  dash: {
    physicalProgressPct?: number | null;
    plannedProgressPct?: number | null;
    completionDate?: string | null;
    plannedFinish?: string | null;
    activitiesDelayed: number;
    activitiesScheduled?: number;
    activitiesTotal: number;
  },
  on: string,
): ScheduleReading {
  const done = dash.physicalProgressPct ?? project.physicalProgressPct;
  const planned = dash.plannedProgressPct ?? null;
  const elapsed = timeElapsedPct(project.startDate, project.endDate, on);
  const completionDate = dash.completionDate ?? project.endDate;
  const plannedFinish = dash.plannedFinish ?? null;
  const s = projectScheduleStatus({
    status: project.status,
    done,
    planned,
    elapsed,
    late: dash.activitiesDelayed,
    scheduled: dash.activitiesScheduled ?? (planned === null ? 0 : dash.activitiesTotal),
    completionDate,
    plannedFinish,
    today: on,
  });
  return { ...s, done, planned, elapsed, plannedFinish, completionDate };
}
