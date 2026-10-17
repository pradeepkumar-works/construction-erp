'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { Tooltip, theme } from 'antd';
import dayjs from 'dayjs';
import type { GanttActivityDto, GanttDto, MilestoneDto, MilestoneState, ScheduleState } from '@erp/shared';
import { MILESTONE_STATE_LABELS, SCHEDULE_STATE_LABELS, daysBetween } from '@erp/shared';
import { BRAND } from '@/lib/brand';
import { formatDate, formatPct } from '@/lib/format';

export type GanttScale = 'week' | 'month';

const LABEL_W = 260;
const ROW_H = 34;
const PX_PER_DAY: Record<GanttScale, number> = { week: 7, month: 2.2 };

interface Range {
  start: string;
  days: number;
}

/** The chart spans every date it draws, from the start of the first month to the end of the last. */
function chartRange(data: GanttDto, showBaseline: boolean): Range | null {
  const dates: string[] = [data.today];
  const push = (...d: (string | null)[]) => d.forEach((x) => x && dates.push(x));
  push(data.projectStart, data.projectEnd);
  for (const a of data.activities) {
    push(a.plannedStart, a.plannedEnd, a.actualStart, a.actualEnd);
    if (showBaseline) push(a.baselineStart, a.baselineEnd);
  }
  for (const m of data.milestones) {
    push(m.dueDate, m.achievedOn);
    if (showBaseline) push(m.baselineDate);
  }
  if (dates.length < 2) return null;
  dates.sort();
  const start = dayjs(dates[0]).startOf('month').format('YYYY-MM-DD');
  const end = dayjs(dates[dates.length - 1]).endOf('month').format('YYYY-MM-DD');
  return { start, days: daysBetween(start, end) + 1 };
}

function stateColor(state: ScheduleState, token: ReturnType<typeof theme.useToken>['token']) {
  if (state === 'DONE') return token.colorSuccess;
  if (state === 'BEHIND' || state === 'LATE') return token.colorError;
  if (state === 'UNSCHEDULED') return token.colorTextQuaternary;
  return BRAND.colors.primary;
}

function milestoneColor(state: MilestoneState, token: ReturnType<typeof theme.useToken>['token']) {
  if (state === 'ACHIEVED') return token.colorSuccess;
  if (state === 'ACHIEVED_LATE') return token.colorWarning;
  if (state === 'MISSED') return token.colorError;
  if (state === 'DUE_SOON') return BRAND.colors.pending;
  return BRAND.colors.primary;
}

const slipText = (days: number | null) => (days === null ? null : days === 0 ? 'on the baseline' : days > 0 ? `${days} days later than the baseline` : `${-days} days earlier than the baseline`);

/**
 * A plain Gantt (v4 item 43): one row per milestone and activity on a day scale, the current plan as a bar filled to
 * its progress, the frozen baseline as a thin grey bar under it, and a line for today. Names stay put while the
 * timeline scrolls sideways.
 */
export function GanttChart({ data, scale, showBaseline, onMilestone }: { data: GanttDto; scale: GanttScale; showBaseline: boolean; onMilestone?: (m: MilestoneDto) => void }) {
  const { token } = theme.useToken();
  const range = useMemo(() => chartRange(data, showBaseline), [data, showBaseline]);
  const scroller = useRef<HTMLDivElement>(null);
  // Open with today about a third of the way across the visible timeline.
  useEffect(() => {
    const el = scroller.current;
    if (!el || !range) return;
    const today = daysBetween(range.start, data.today) * PX_PER_DAY[scale];
    el.scrollLeft = Math.max(0, today - (el.clientWidth - LABEL_W) / 3);
  }, [range, scale, data.today]);
  if (!range) return <div className="text-muted" style={{ padding: 24 }}>Give the activities planned dates, or add a milestone, to see the chart.</div>;

  const px = PX_PER_DAY[scale];
  const width = Math.ceil(range.days * px);
  const x = (d: string) => daysBetween(range.start, d) * px;
  const span = (from: string, to: string) => ({ left: x(from), width: Math.max((daysBetween(from, to) + 1) * px, 3) });

  const months: { label: string; left: number; width: number }[] = [];
  for (let m = dayjs(range.start); m.format('YYYY-MM-DD') < dayjs(range.start).add(range.days, 'day').format('YYYY-MM-DD'); m = m.add(1, 'month')) {
    const from = m.format('YYYY-MM-DD');
    const to = m.endOf('month').format('YYYY-MM-DD');
    months.push({ label: m.format(scale === 'week' ? 'MMMM YYYY' : 'MMM YY'), ...span(from, to) });
  }
  const weeks: { label: string; left: number }[] = [];
  if (scale === 'week') {
    let w = dayjs(range.start);
    while (w.day() !== 1) w = w.add(1, 'day');
    for (; daysBetween(range.start, w.format('YYYY-MM-DD')) < range.days; w = w.add(7, 'day')) weeks.push({ label: w.format('D'), left: x(w.format('YYYY-MM-DD')) });
  }

  const label = (children: React.ReactNode, sub?: React.ReactNode) => (
    <div className="gantt-label" style={{ position: 'sticky', left: 0, zIndex: 3, width: LABEL_W, minWidth: LABEL_W, padding: '0 12px', background: token.colorBgContainer, borderRight: `1px solid ${token.colorBorderSecondary}`, display: 'flex', flexDirection: 'column', justifyContent: 'center', overflow: 'hidden' }}>
      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{children}</div>
      {sub ? <div className="text-muted" style={{ fontSize: token.fontSizeSM, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div> : null}
    </div>
  );
  const row = (key: string, lbl: React.ReactNode, bars: React.ReactNode, className: string, onClick?: () => void, action?: string) => (
    <div
      key={key}
      className={className}
      style={{ display: 'flex', height: ROW_H, borderBottom: `1px solid ${token.colorBorderSecondary}`, cursor: onClick ? 'pointer' : undefined }}
      onClick={onClick}
      // A row that opens something is a button for the keyboard too: Tab reaches it, Enter or Space opens it.
      {...(onClick
        ? {
            role: 'button',
            tabIndex: 0,
            'aria-label': action,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.preventDefault();
              onClick();
            },
          }
        : {})}
    >
      {lbl}
      <div style={{ position: 'relative', width, minWidth: width }}>{bars}</div>
    </div>
  );
  const section = (title: string) => (
    <div style={{ display: 'flex', height: 26, background: token.colorFillQuaternary, borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
      <div style={{ position: 'sticky', left: 0, zIndex: 3, width: LABEL_W, minWidth: LABEL_W, padding: '0 12px', lineHeight: '26px', fontWeight: 600, fontSize: token.fontSizeSM, background: token.colorFillQuaternary }}>{title}</div>
      <div style={{ width, minWidth: width }} />
    </div>
  );

  const diamond = (left: number, color: string, hollow = false) => (
    <div style={{ position: 'absolute', left: left + px / 2 - 7, top: ROW_H / 2 - 7, width: 14, height: 14, transform: 'rotate(45deg)', background: hollow ? token.colorBgContainer : color, border: `2px solid ${color}`, boxSizing: 'border-box', zIndex: hollow ? 1 : 2 }} />
  );

  const milestoneRow = (m: MilestoneDto) => {
    const color = milestoneColor(m.state, token);
    const tip = (
      <div>
        <b>{m.name}</b>
        <div>Due {formatDate(m.dueDate)}</div>
        {m.baselineDate ? <div>Baseline {formatDate(m.baselineDate)}{m.slipDays ? ` (${slipText(m.slipDays)})` : ''}</div> : null}
        {m.achievedOn ? <div>Achieved {formatDate(m.achievedOn)}</div> : null}
        <div>{MILESTONE_STATE_LABELS[m.state]}</div>
      </div>
    );
    return row(
      m.id,
      label(<span>◆ {m.name}</span>, `${MILESTONE_STATE_LABELS[m.state]} · due ${formatDate(m.dueDate)}`),
      <Tooltip title={tip}>
        <div style={{ position: 'absolute', inset: 0 }}>
          {showBaseline && m.baselineDate && m.baselineDate !== m.dueDate ? diamond(x(m.baselineDate), token.colorTextQuaternary, true) : null}
          {diamond(x(m.dueDate), color, !!m.achievedOn && m.achievedOn !== m.dueDate)}
          {m.achievedOn && m.achievedOn !== m.dueDate ? diamond(x(m.achievedOn), color) : null}
        </div>
      </Tooltip>,
      'gantt-row gantt-milestone',
      onMilestone ? () => onMilestone(m) : undefined,
      `Edit milestone ${m.name}, due ${formatDate(m.dueDate)}`,
    );
  };

  const activityRow = (a: GanttActivityDto) => {
    const color = stateColor(a.state, token);
    const tip = (
      <div>
        <b>{a.name}</b>
        <div>Plan {a.plannedStart ? `${formatDate(a.plannedStart)} to ${formatDate(a.plannedEnd)}` : 'not scheduled'}</div>
        {a.baselineEnd ? <div>Baseline {formatDate(a.baselineStart)} to {formatDate(a.baselineEnd)}</div> : null}
        {a.actualStart ? <div>Started {formatDate(a.actualStart)}{a.actualEnd ? `, finished ${formatDate(a.actualEnd)}` : ''}</div> : null}
        <div>
          Done {formatPct(a.progressPct)}
          {a.expectedPct !== null && a.progressPct < 100 ? `, plan expects ${formatPct(a.expectedPct)} by today` : ''}
        </div>
        {a.finishSlipDays ? <div>Finish {slipText(a.finishSlipDays)}</div> : null}
        <div>{SCHEDULE_STATE_LABELS[a.state]}</div>
      </div>
    );
    return row(
      a.id,
      label(a.name, [SCHEDULE_STATE_LABELS[a.state], formatPct(a.progressPct), a.finishSlipDays ? `${a.finishSlipDays > 0 ? '+' : ''}${a.finishSlipDays} d` : null].filter(Boolean).join(' · ')),
      <Tooltip title={tip}>
        <div style={{ position: 'absolute', inset: 0 }}>
          {showBaseline && a.baselineStart && a.baselineEnd ? (
            <div className="gantt-baseline" style={{ position: 'absolute', ...span(a.baselineStart, a.baselineEnd), top: ROW_H - 10, height: 5, borderRadius: 2, background: token.colorTextQuaternary }} />
          ) : null}
          {a.plannedStart && a.plannedEnd ? (
            <div className="gantt-bar" style={{ position: 'absolute', ...span(a.plannedStart, a.plannedEnd), top: 7, height: 15, borderRadius: 3, overflow: 'hidden', background: token.colorFillSecondary, border: `1px solid ${color}` }}>
              <div style={{ width: `${Math.min(a.progressPct, 100)}%`, height: '100%', background: color }} />
            </div>
          ) : null}
        </div>
      </Tooltip>,
      'gantt-row gantt-activity',
    );
  };

  const today = x(data.today) + px / 2;
  return (
    <div ref={scroller} className="gantt-chart" style={{ overflowX: 'auto', border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadius }}>
      <div style={{ position: 'relative', width: LABEL_W + width, minWidth: '100%' }}>
        {/* Month lines and today, under the rows' contents and the sticky names */}
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: LABEL_W, width, pointerEvents: 'none' }}>
          {months.map((m) => (
            <div key={m.left} style={{ position: 'absolute', top: 0, bottom: 0, left: m.left, borderLeft: `1px solid ${token.colorBorderSecondary}` }} />
          ))}
          <div className="gantt-today" style={{ position: 'absolute', top: 0, bottom: 0, left: today, borderLeft: `2px dashed ${token.colorError}`, zIndex: 2 }} title={`Today, ${formatDate(data.today)}`} />
        </div>
        <div style={{ display: 'flex', height: scale === 'week' ? 44 : 28, borderBottom: `1px solid ${token.colorBorder}`, position: 'relative' }}>
          <div style={{ position: 'sticky', left: 0, zIndex: 3, width: LABEL_W, minWidth: LABEL_W, background: token.colorBgContainer, borderRight: `1px solid ${token.colorBorderSecondary}` }} />
          <div style={{ position: 'relative', width, minWidth: width, fontSize: token.fontSizeSM }}>
            {months.map((m) => (
              <div key={m.left} style={{ position: 'absolute', left: m.left, width: m.width, top: 0, height: 26, lineHeight: '26px', paddingLeft: 6, whiteSpace: 'nowrap', overflow: 'hidden', fontWeight: 600 }}>
                {m.label}
              </div>
            ))}
            {weeks.map((w) => (
              <div key={w.left} className="text-muted" style={{ position: 'absolute', left: w.left, top: 26, height: 18, paddingLeft: 3, fontSize: token.fontSizeSM, borderLeft: `1px dotted ${token.colorBorder}` }}>
                {w.label}
              </div>
            ))}
          </div>
        </div>
        {data.milestones.length ? section('Milestones') : null}
        {data.milestones.map(milestoneRow)}
        {data.activities.length ? section('Activities') : null}
        {data.activities.map(activityRow)}
      </div>
    </div>
  );
}

/** What the colours and shapes mean. */
export function GanttLegend({ showBaseline }: { showBaseline: boolean }) {
  const { token } = theme.useToken();
  const swatch = (bg: string, label: string, border?: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ display: 'inline-block', width: 22, height: 10, borderRadius: 2, background: bg, border: border ? `1px solid ${border}` : undefined }} />
      {label}
    </span>
  );
  return (
    <div className="text-muted" style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: token.fontSizeSM, marginTop: 8 }}>
      {swatch(BRAND.colors.primary, 'Plan, filled to progress')}
      {swatch(token.colorError, 'Behind plan or past its end')}
      {swatch(token.colorSuccess, 'Done')}
      {showBaseline ? swatch(token.colorTextQuaternary, 'Baseline') : null}
      <span>◆ Milestone{showBaseline ? ' (hollow: baseline date)' : ''}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ display: 'inline-block', height: 12, borderLeft: `2px dashed ${token.colorError}` }} />
        Today
      </span>
    </div>
  );
}
