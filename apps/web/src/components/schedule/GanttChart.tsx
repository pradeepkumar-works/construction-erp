'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { Tooltip } from 'antd';
import dayjs from 'dayjs';
import type { GanttActivityDto, GanttDto, MilestoneDto, StatusMeaning } from '@erp/shared';
import { ACTIVITY_LINK_TYPE_LABELS, MILESTONE_STATE_LABELS, SCHEDULE_STATE_LABELS, daysBetween, linkLabel, statusTone } from '@erp/shared';
import { tk } from '@/ds';
import { formatDate, formatPct, plural } from '@/lib/format';

export type GanttScale = 'week' | 'month';

const LABEL_W = 260;
// 44 px: each row is a touch target (opens the activity or milestone), WCAG 2.5.8 on a phone.
const ROW_H = 44;
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

/**
 * A bar's or a milestone's colour, by what its state means (`statusTone`): the plan in the accent, behind plan or due soon in
 * the waiting tone, done in quiet grey, and red only for what is late (past its planned finish, a missed milestone).
 */
const INK: Record<StatusMeaning, string> = {
  inHand: tk.color.accent.solid,
  waiting: tk.color.tone.pending.solid,
  failed: tk.color.tone.danger.solid,
  done: tk.color.tone.neutral.solid,
  closed: tk.color.text.faint,
};

/** The critical path and today are drawn in the one neutral ink, by weight and dash, never in a colour of their own. */
const MARK = tk.color.text.strong;

const slipText = (days: number | null) => (days === null ? null : days === 0 ? 'on the baseline' : days > 0 ? `${days} days later than the baseline` : `${-days} days earlier than the baseline`);

/**
 * A plain Gantt: one row per milestone and activity on a day scale, the current plan as a bar filled to
 * its progress, the frozen baseline as a thin grey bar under it, and a dashed line for today. Names stay put while the
 * timeline scrolls sideways. With links a critical activity's bar has a heavy outline in ink, its float shows
 * as a dotted line after the bar, and the row opens the activity's links.
 */
export function GanttChart({
  data,
  scale,
  showBaseline,
  onMilestone,
  onActivity,
}: {
  data: GanttDto;
  scale: GanttScale;
  showBaseline: boolean;
  onMilestone?: (m: MilestoneDto) => void;
  onActivity?: (a: GanttActivityDto) => void;
}) {
  const range = useMemo(() => chartRange(data, showBaseline), [data, showBaseline]);
  const scroller = useRef<HTMLDivElement>(null);
  // Open with today about a third of the way across the visible timeline.
  useEffect(() => {
    const el = scroller.current;
    if (!el || !range) return;
    const today = daysBetween(range.start, data.today) * PX_PER_DAY[scale];
    el.scrollLeft = Math.max(0, today - (el.clientWidth - LABEL_W) / 3);
  }, [range, scale, data.today]);
  if (!range) return <div className="text-muted" style={{ padding: tk.space[6] }}>Give the activities planned dates, or add a milestone, to see the chart.</div>;

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
    <div className="gantt-label" style={{ position: 'sticky', left: 0, zIndex: 3, width: LABEL_W, minWidth: LABEL_W, padding: `0 ${tk.space[3]}`, background: tk.color.surface.base, borderRight: tk.line('hairline'), display: 'flex', flexDirection: 'column', justifyContent: 'center', overflow: 'hidden' }}>
      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{children}</div>
      {sub ? <div className="text-muted" style={{ ...tk.type.caption, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div> : null}
    </div>
  );
  const row = (key: string, lbl: React.ReactNode, bars: React.ReactNode, className: string, onClick?: () => void, action?: string) => {
    const style: React.CSSProperties = { display: 'flex', height: ROW_H, borderBottom: tk.line('hairline'), cursor: onClick ? 'pointer' : undefined };
    const cells = (
      <>
        {lbl}
        <div style={{ position: 'relative', width, minWidth: width }}>{bars}</div>
      </>
    );
    if (!onClick)
      return (
        <div key={key} className={className} style={style}>
          {cells}
        </div>
      );
    // A row that opens something is a button for the keyboard too: Tab reaches it, Enter or Space opens it.
    return (
      <div
        key={key}
        className={className}
        style={style}
        role="button"
        tabIndex={0}
        aria-label={action}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          onClick();
        }}
      >
        {cells}
      </div>
    );
  };
  const section = (title: string) => (
    <div style={{ display: 'flex', height: 26, background: tk.color.surface.sunken, borderBottom: tk.line('hairline') }}>
      <div style={{ position: 'sticky', left: 0, zIndex: 3, width: LABEL_W, minWidth: LABEL_W, padding: `0 ${tk.space[3]}`, display: 'flex', alignItems: 'center', ...tk.type.label, background: tk.color.surface.sunken }}>{title}</div>
      <div style={{ width, minWidth: width }} />
    </div>
  );

  const diamond = (left: number, color: string, hollow = false) => (
    <div style={{ position: 'absolute', left: left + px / 2 - 7, top: ROW_H / 2 - 7, width: 14, height: 14, transform: 'rotate(45deg)', background: hollow ? tk.color.surface.base : color, border: `2px solid ${color}`, boxSizing: 'border-box', zIndex: hollow ? 1 : 2 }} />
  );

  const milestoneRow = (m: MilestoneDto) => {
    const color = INK[statusTone('milestone', m.state)];
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
          {showBaseline && m.baselineDate && m.baselineDate !== m.dueDate ? diamond(x(m.baselineDate), tk.color.text.faint, true) : null}
          {diamond(x(m.dueDate), color, !!m.achievedOn && m.achievedOn !== m.dueDate)}
          {m.achievedOn && m.achievedOn !== m.dueDate ? diamond(x(m.achievedOn), color) : null}
        </div>
      </Tooltip>,
      'gantt-row gantt-milestone',
      onMilestone ? () => onMilestone(m) : undefined,
      `Edit milestone ${m.name}, due ${formatDate(m.dueDate)}`,
    );
  };

  const names = new Map(data.activities.map((x) => [x.id, x.name]));
  const activityRow = (a: GanttActivityDto) => {
    const color = INK[statusTone('schedule', a.state)];
    const floatEnd = a.totalFloat && a.totalFloat > 0 && a.plannedEnd && a.lateFinish && a.lateFinish > a.plannedEnd ? a.lateFinish : null;
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
        {a.predecessors.length ? <div>After {a.predecessors.map((p) => `${names.get(p.activityId)} (${linkLabel(p.type, p.lagDays)}, ${ACTIVITY_LINK_TYPE_LABELS[p.type].toLowerCase()})`).join(', ')}</div> : null}
        {a.totalFloat !== null ? <div>{a.critical ? 'Critical: ' : ''}{a.totalFloat < 0 ? `${-a.totalFloat} days behind what the finish needs` : `${a.totalFloat} days of float`}</div> : null}
        {a.linkStartsOn ? <div>Its links let it start on {formatDate(a.linkStartsOn)} at the earliest</div> : null}
      </div>
    );
    return row(
      a.id,
      label(a.name, [a.critical ? 'Critical' : null, SCHEDULE_STATE_LABELS[a.state], formatPct(a.progressPct), a.finishSlipDays ? `${plural(Math.abs(a.finishSlipDays), 'day')} ${a.finishSlipDays > 0 ? 'late' : 'early'}` : null].filter(Boolean).join(' · ')),
      <Tooltip title={tip}>
        <div style={{ position: 'absolute', inset: 0 }}>
          {showBaseline && a.baselineStart && a.baselineEnd ? (
            <div className="gantt-baseline" style={{ position: 'absolute', ...span(a.baselineStart, a.baselineEnd), top: ROW_H / 2 + 7, height: 5, borderRadius: tk.radius.xs, background: tk.color.text.faint }} />
          ) : null}
          {a.plannedStart && a.plannedEnd ? (
            <div
              className={a.critical ? 'gantt-bar gantt-critical' : 'gantt-bar'}
              style={{ position: 'absolute', ...span(a.plannedStart, a.plannedEnd), top: ROW_H / 2 - 12, height: 15, borderRadius: tk.radius.sm, overflow: 'hidden', boxSizing: 'border-box', background: tk.color.state.track, border: a.critical ? `2px solid ${MARK}` : `1px solid ${color}` }}
            >
              <div style={{ width: `${Math.min(a.progressPct, 100)}%`, height: '100%', background: color }} />
            </div>
          ) : null}
          {floatEnd && a.plannedEnd ? (
            <div className="gantt-float" style={{ position: 'absolute', left: x(a.plannedEnd) + px, width: Math.max(daysBetween(a.plannedEnd, floatEnd) * px, 2), top: ROW_H / 2 - 5, borderTop: `2px dotted ${tk.color.text.faint}` }} />
          ) : null}
          {a.linkStartsOn ? (
            <div className="gantt-link-start" style={{ position: 'absolute', left: x(a.linkStartsOn), top: ROW_H / 2 - 14, height: 20, borderLeft: `2px solid ${tk.color.text.muted}` }} />
          ) : null}
        </div>
      </Tooltip>,
      'gantt-row gantt-activity',
      onActivity ? () => onActivity(a) : undefined,
      `Links of ${a.name}`,
    );
  };

  const today = x(data.today) + px / 2;
  return (
    <div ref={scroller} className="gantt-chart" style={{ overflowX: 'auto', border: tk.line('hairline'), borderRadius: tk.radius.md }}>
      <div style={{ position: 'relative', width: LABEL_W + width, minWidth: '100%' }}>
        {/* Month lines and today, under the rows' contents and the sticky names */}
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: LABEL_W, width, pointerEvents: 'none' }}>
          {months.map((m) => (
            <div key={m.left} style={{ position: 'absolute', top: 0, bottom: 0, left: m.left, borderLeft: tk.line('hairline') }} />
          ))}
          <div className="gantt-today" style={{ position: 'absolute', top: 0, bottom: 0, left: today, borderLeft: `2px dashed ${MARK}`, zIndex: 2 }} title={`Today, ${formatDate(data.today)}`} />
        </div>
        <div style={{ display: 'flex', height: scale === 'week' ? 44 : 28, borderBottom: tk.line('base'), position: 'relative' }}>
          <div style={{ position: 'sticky', left: 0, zIndex: 3, width: LABEL_W, minWidth: LABEL_W, background: tk.color.surface.base, borderRight: tk.line('hairline') }} />
          <div style={{ position: 'relative', width, minWidth: width, ...tk.type.caption }}>
            {months.map((m) => (
              <div key={m.left} style={{ position: 'absolute', left: m.left, width: m.width, top: 0, height: 26, display: 'flex', alignItems: 'center', ...tk.type.label, paddingLeft: tk.space[2], whiteSpace: 'nowrap', overflow: 'hidden' }}>
                {m.label}
              </div>
            ))}
            {weeks.map((w) => (
              <div key={w.left} className="text-muted" style={{ position: 'absolute', left: w.left, top: 26, height: 18, paddingLeft: tk.space[1], ...tk.type.caption, borderLeft: `1px dotted ${tk.color.line.base}` }}>
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

/** What the colours and shapes mean: red is only for late, and the critical path and today are in ink. */
export function GanttLegend({ showBaseline, linked }: { showBaseline: boolean; linked?: boolean }) {
  const item = (mark: React.CSSProperties, label: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: tk.space[2] }}>
      <span aria-hidden style={{ display: 'inline-block', boxSizing: 'border-box', ...mark }} />
      {label}
    </span>
  );
  const bar = (background: string, border?: string): React.CSSProperties => ({ width: 22, height: 10, borderRadius: tk.radius.xs, background, border });
  return (
    <div className="text-muted" style={{ display: 'flex', gap: `${tk.space[2]} ${tk.space[4]}`, flexWrap: 'wrap', ...tk.type.caption, marginTop: tk.space[2] }}>
      {item(bar(INK.inHand), 'Plan, filled to progress')}
      {item(bar(INK.waiting), 'Behind plan')}
      {item(bar(INK.failed), 'Late: past its planned finish')}
      {item(bar(INK.done), 'Done')}
      {showBaseline ? item(bar(tk.color.text.faint), 'Baseline') : null}
      {linked ? item(bar(tk.color.state.track, `2px solid ${MARK}`), 'Critical path') : null}
      {linked ? item({ width: 22, borderTop: `2px dotted ${tk.color.text.faint}` }, 'Float') : null}
      {linked ? item({ height: 12, borderLeft: `2px solid ${tk.color.text.muted}` }, 'Earliest start its links allow') : null}
      <span>◆ Milestone{showBaseline ? ' (hollow: baseline date)' : ''}, red when missed</span>
      {item({ height: 12, borderLeft: `2px dashed ${MARK}` }, 'Today')}
    </div>
  );
}
