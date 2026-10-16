'use client';

import React from 'react';
import { Badge, Flex, Tag, Tooltip, theme } from 'antd';
import type { ProjectDetail } from '@erp/shared';
import { canViewCost } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { formatPct } from '@/lib/format';
import { useProjectCost, useProjectDashboard } from '@/lib/queries';

type Level = 'success' | 'warning' | 'error';

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
    const elapsed = timeElapsedPct(project.startDate, project.endDate);
    const done = project.physicalProgressPct;
    const behind = elapsed !== null && done < elapsed - 10;
    const late = dash.activitiesDelayed;
    const level: Level = late > 0 && behind ? 'error' : late > 0 || behind ? 'warning' : 'success';
    const text = late > 0 ? `Schedule: ${late} ${late === 1 ? 'activity' : 'activities'} late` : behind ? 'Schedule: behind' : 'Schedule: on track';
    const detail = `${formatPct(done)} done${elapsed !== null ? `, ${formatPct(Math.round(elapsed))} of the time gone` : ''}; ${late} of ${dash.activitiesTotal} activities past their finish date.`;
    out.push({ key: 'schedule', level, text, detail });
  }

  if (cost) {
    const executed = Number(cost.executedValue);
    if (cost.costPct !== null) {
      const pct = cost.costPct;
      out.push({
        key: 'cost',
        level: pct <= 90 ? 'success' : pct <= 100 ? 'warning' : 'error',
        text: `Cost: ${formatPct(Math.round(pct))} of work done`,
        detail: 'Cost booked so far against the value of approved work (progress × BOQ rate).',
      });
    }
    if (executed > 0) {
      const pct = (Number(cost.billedValue) / executed) * 100;
      out.push({
        key: 'billing',
        level: pct >= 80 ? 'success' : pct >= 50 ? 'warning' : 'error',
        text: `Billed: ${formatPct(Math.round(pct))} of work done`,
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
          <span role="listitem">{compact ? <Badge status={s.level} aria-label={s.text} /> : <Tag color={s.level} style={{ margin: 0 }}>{s.text}</Tag>}</span>
        </Tooltip>
      ))}
    </Flex>
  );
}
