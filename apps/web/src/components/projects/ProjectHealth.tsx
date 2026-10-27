'use client';

import React from 'react';
import { Badge, Flex, Tooltip, theme } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import type { ProjectDashboard, ProjectDetail } from '@erp/shared';
import { canViewCost, projectScheduleStatus, type ProjectScheduleStatus } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { formatDate, formatPct } from '@/lib/format';
import { useProjectCost, useProjectDashboard } from '@/lib/queries';

type Level = 'success' | 'warning' | 'error' | 'default';

export interface HealthSignal {
  key: 'schedule' | 'cost' | 'billing';
  level: Level;
  /** Short, for the chip: "Schedule: on track". */
  text: string;
  /** What it is measured from, for the tooltip. */
  detail: string;
}

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const days = (from: string, to: string) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;

/** Share of the project's time gone by today (0 to 100), or null without both dates. */
export function timeElapsedPct(start: string | null, end: string | null, on = today()): number | null {
  if (!start || !end) return null;
  const total = days(start, end);
  if (total <= 0) return null;
  return Math.min(100, Math.max(0, (days(start, on) / total) * 100));
}

export interface ScheduleStatus extends ProjectScheduleStatus {
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
 * Where the project stands against its schedule (UX item 85), the one reading behind the header's chip and the
 * overview's lead line, from `projectScheduleStatus` (shared with the watch list): progress against what the
 * activities' dates planned by today, and where the plan ends against the completion date.
 */
export function scheduleStatus(project: ProjectDetail, dash: ProjectDashboard, on = today()): ScheduleStatus {
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

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The chip's words: "Schedule: ends 245 days late", "Schedule: no plan yet", "Schedule: on track". */
export function scheduleChipText(s: ScheduleStatus): string {
  if (s.state === 'COMPLETED') return 'Schedule: completed';
  if (s.state === 'ON_HOLD') return 'Schedule: on hold';
  if (s.state === 'OVERRUN') return 'Schedule: past completion date';
  if (s.state === 'FINISH_LATE') return `Schedule: ends ${plural(s.finishLateDays!, 'day')} late`;
  if (s.late > 0) return `Schedule: ${plural(s.late, 'activity', 'activities')} late`;
  if (s.state === 'BEHIND') return 'Schedule: behind';
  if (s.state === 'NO_PLAN') return 'Schedule: no plan yet';
  return 'Schedule: on track';
}

/**
 * The project's health at a glance (UI roadmap item 56): schedule from activities running late and progress against
 * time gone; for those who see cost, cost against the value of work done and how much of that work is billed.
 */
export function useProjectHealth(project: ProjectDetail): HealthSignal[] {
  const { user } = useAuth();
  const seesCost = !!user && canViewCost(user.roleKey);
  const { data: dash } = useProjectDashboard(project.id);
  const { data: cost } = useProjectCost(seesCost ? project.id : undefined, {});
  const out: HealthSignal[] = [];

  if (dash) {
    const s = scheduleStatus(project, dash);
    const against = s.planned !== null ? `, ${formatPct(s.planned)} planned by today` : s.elapsed !== null ? `, ${formatPct(s.elapsed)} of the time gone` : '';
    const finish =
      s.finishLateDays !== null
        ? ` The plan ends ${formatDate(s.plannedFinish)}, after the completion date of ${formatDate(s.completionDate)}.`
        : s.state === 'NO_PLAN'
          ? ' No activity has planned dates yet.'
          : '';
    const detail = `${formatPct(s.done)} done${against}; ${s.late} of ${dash.activitiesTotal} activities past their finish date.${finish}`;
    out.push({ key: 'schedule', level: s.level, text: scheduleChipText(s), detail });
  }

  if (cost) {
    const executed = Number(cost.executedValue);
    if (cost.costPct !== null) {
      const pct = cost.costPct;
      out.push({
        key: 'cost',
        level: pct <= 90 ? 'success' : pct <= 100 ? 'warning' : 'error',
        text: `Cost: ${formatPct(pct)} of work value`,
        detail: 'Cost booked so far against the value of approved work (progress × BOQ rate).',
      });
    }
    if (executed > 0) {
      const pct = (Number(cost.billedValue) / executed) * 100;
      out.push({
        key: 'billing',
        level: pct >= 80 ? 'success' : pct >= 50 ? 'warning' : 'error',
        text: `Billed: ${formatPct(pct)} of work value`,
        detail: 'Approved RA bills against the value of approved work. Work not yet billed is cash still to ask for.',
      });
    }
  }
  return out;
}

/** The health signals as chips (the page header) or as dots (the collapsed bar). */
export function ProjectHealth({ signals, compact }: { signals: HealthSignal[]; compact?: boolean }) {
  const { token } = theme.useToken();
  if (!signals.length) return null;
  return (
    <Flex gap={compact ? token.marginXS : token.marginXXS} wrap={!compact} align="center" role="list" aria-label="Project health">
      {signals.map((s) => (
        <Tooltip key={s.key} title={compact ? `${s.text}. ${s.detail}` : s.detail}>
          <span role="listitem">{compact ? <span role="img" aria-label={s.text}><Badge status={s.level} /></span> : <AppTag color={s.level} style={{ margin: 0 }}>{s.text}</AppTag>}</span>
        </Tooltip>
      ))}
    </Flex>
  );
}
