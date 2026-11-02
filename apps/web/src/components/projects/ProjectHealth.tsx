'use client';

import React from 'react';
import { Badge, Flex, Tooltip } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import type { ProjectDashboard, ProjectDetail } from '@erp/shared';
import { canViewCost, scheduleReading, type ScheduleReading } from '@erp/shared';
import { tk } from '@/ds';
import { useAuth } from '@/lib/auth';
import { formatDate, formatPct, plural, todayDate } from '@/lib/format';
import { useProjectCost, useProjectDashboard } from '@/lib/queries';

type Level = 'success' | 'warning' | 'error' | 'default';

export interface HealthSignal {
  key: 'schedule' | 'cost' | 'billing';
  level: Level;
  /** Short, for the chip: "Schedule: on track". */
  text: string;
  /** What it is measured from, for the tooltip. */
  detail: string;
  /** The same reading inside the Overview's first line: "behind plan", "billed 3.9% of work done". */
  lead: string;
}

export type ScheduleStatus = ScheduleReading;

/**
 * Where the project stands against its schedule, the one reading behind the header's chip and the
 * overview's lead line: `scheduleReading` in shared, which the phone's project screen reads too.
 */
export function scheduleStatus(project: ProjectDetail, dash: ProjectDashboard, on = todayDate()): ScheduleStatus {
  return scheduleReading(project, dash, on);
}

/** The schedule in a few words: "plan ends 7 days after the completion date", "2 activities late", "on track". */
function scheduleWords(s: ScheduleStatus): string {
  if (s.state === 'COMPLETED') return 'completed';
  if (s.state === 'ON_HOLD') return 'on hold';
  if (s.state === 'OVERRUN') return 'past its completion date';
  if (s.state === 'FINISH_LATE') return `plan ends ${plural(s.finishLateDays!, 'day')} after the completion date`;
  const late = s.late > 0 ? plural(s.late, 'activity', 'activities') + ' late' : null;
  if (s.state === 'BEHIND') return late ? `behind plan, ${late}` : 'behind plan';
  if (late) return late;
  if (s.state === 'NO_PLAN') return 'no dated plan yet';
  return 'on track';
}

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
 * The project's health at a glance: schedule from activities running late and progress against
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
    out.push({ key: 'schedule', level: s.level, text: scheduleChipText(s), detail, lead: scheduleWords(s) });
  }

  if (cost) {
    const executed = Number(cost.executedValue);
    if (cost.costPct !== null) {
      const pct = cost.costPct;
      out.push({
        key: 'cost',
        level: pct <= 90 ? 'success' : pct <= 100 ? 'warning' : 'error',
        text: `Cost: ${formatPct(pct)} of work done`,
        detail: 'Cost booked so far against the value of approved work (progress × BOQ rate).',
        lead: `cost ${formatPct(pct)} of work done`,
      });
    }
    if (executed > 0) {
      const pct = (Number(cost.billedValue) / executed) * 100;
      out.push({
        key: 'billing',
        level: pct >= 80 ? 'success' : pct >= 50 ? 'warning' : 'error',
        text: `Billed: ${formatPct(pct)} of work done`,
        detail: 'Approved RA bills against the value of approved work. Work not yet billed is cash still to ask for.',
        lead: `billed ${formatPct(pct)} of work done`,
      });
    }
  }
  return out;
}

const NEEDS: Partial<Record<Level, number>> = { error: 0, warning: 1 };

/**
 * The Overview's first line from the same signals as the header's chips, so the two never disagree: on track only when
 * no chip needs anyone, else what needs someone, the worst first ("Behind plan, billed 3.9% of work done").
 */
export function projectHeadline(status: string, signals: readonly HealthSignal[]): { text: string; level: Level } {
  if (status === 'COMPLETED' || status === 'CLOSED') return { text: 'Completed', level: 'default' };
  if (status === 'ON_HOLD') return { text: 'On hold', level: 'default' };
  const needs = signals.filter((s) => NEEDS[s.level] !== undefined).sort((a, b) => NEEDS[a.level]! - NEEDS[b.level]!);
  if (!needs.length) {
    const schedule = signals.find((s) => s.key === 'schedule');
    return schedule?.level === 'default' ? { text: 'No dated plan yet', level: 'default' } : { text: 'On track', level: 'success' };
  }
  const text = needs.map((s) => s.lead).join(', ');
  return { text: text.charAt(0).toUpperCase() + text.slice(1), level: needs[0].level };
}

/** The health signals as chips (the page header) or as dots (the collapsed bar). */
export function ProjectHealth({ signals, compact }: { signals: HealthSignal[]; compact?: boolean }) {
  if (!signals.length) return null;
  return (
    <Flex gap={compact ? tk.space[2] : tk.space[1]} wrap={!compact} align="center" role="list" aria-label="Project health">
      {signals.map((s) => (
        <Tooltip key={s.key} title={compact ? `${s.text}. ${s.detail}` : s.detail}>
          <span role="listitem" data-level={s.level}>
            {compact ? (
              <span role="img" aria-label={s.text}>
                <Badge status={s.level} />
              </span>
            ) : (
              <AppTag kind="signal" status={s.level} style={{ margin: 0 }}>
                {s.text}
              </AppTag>
            )}
          </span>
        </Tooltip>
      ))}
    </Flex>
  );
}
