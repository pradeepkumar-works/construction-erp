'use client';

import React from 'react';
import { Flex, Statistic, Table, Typography } from 'antd';
import { tk } from '@/ds';
import { AppTag } from '@/components/common/AppTag';
import type { TableProps } from 'antd';
import { LOOKAHEAD_READINESS_LABELS, WEEKDAY_NAMES, type LookaheadActivityDto } from '@erp/shared';
import { useLookahead } from '@/lib/queries';
import dayjs from 'dayjs';
import { formatDate, formatDayMonth, formatPct, plural } from '@/lib/format';
import { Loading, QueryError } from '@/components/common/QueryState';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const big = { content: { fontSize: tk.type.subhead.fontSize } };

type Row = LookaheadActivityDto & { overdue: boolean };
type Week = { from: string; to: string; daysOff: { date: string }[] };

/** Which days of a week an activity runs, in words: "all week", "from Wed", "Tue to Thu"; days off on the working calendar are not. */
function daysIn(a: Row, week: Week): { on: boolean[]; text: string } | null {
  if (a.plannedStart > week.to || a.plannedEnd < week.from) return null;
  const start = dayjs(week.from);
  const on = DAYS.map((_, i) => {
    const d = start.add(i, 'day').format('YYYY-MM-DD');
    return d >= a.plannedStart && d <= a.plannedEnd && !week.daysOff.some((x) => x.date === d);
  });
  if (!on.includes(true)) return null;
  const first = on.indexOf(true);
  const last = on.lastIndexOf(true);
  const text = first === 0 && last === 6 ? 'all week' : first === 0 ? `to ${DAYS[last]}` : last === 6 ? `from ${DAYS[first]}` : first === last ? DAYS[first] : `${DAYS[first]} to ${DAYS[last]}`;
  return { on, text };
}

/** A week's working days on the calendar, naming its holidays and breaks: "5 working days, Holi". */
function weekDaysWords(daysOff: { date: string; reason: string }[]) {
  const weekdays = new Set(Object.values(WEEKDAY_NAMES));
  const named = [...new Set(daysOff.map((d) => d.reason).filter((r) => !weekdays.has(r)))];
  return `${plural(7 - daysOff.length, 'working day')}${named.length ? `, ${named.join(', ')}` : ''}`;
}

/**
 * Look-ahead tab of a project: the three weeks from this Monday, every activity planned in them (and those
 * past their end, still open) with the days it runs each week, and whether it can start: under way, ready, or waiting on
 * the activities its links tie it to. Critical activities are marked; the site team plans the next weeks from it.
 */
export function LookaheadPanel({ projectId }: { projectId: string }) {
  const { data, isLoading, error, refetch } = useLookahead(projectId);
  if (isLoading) return <Loading />;
  if (error || !data) return <QueryError error={error} onRetry={() => refetch()} />;

  const seen = new Set<string>();
  const rows: Row[] = [...data.overdue.map((a) => ({ ...a, overdue: true })), ...data.weeks.flatMap((w) => w.activities.map((a) => ({ ...a, overdue: false })))].filter((a) => !seen.has(a.id) && !!seen.add(a.id));
  const starting = rows.filter((a) => a.readiness !== 'IN_PROGRESS');
  const ready = starting.filter((a) => a.readiness === 'READY').length;
  const waiting = starting.filter((a) => a.readiness === 'WAITING').length;

  const bar = (a: Row, week: Week, first: boolean) => {
    // Past its end and still open: it carries into this week.
    if (a.overdue && first) return <span style={{ color: tk.color.tone.danger.fg, fontSize: tk.type.caption.fontSize }}>Still open</span>;
    const d = daysIn(a, week);
    if (!d) return <span className="text-muted">-</span>;
    const color = a.critical ? tk.color.tone.danger.fg : a.readiness === 'WAITING' ? tk.color.tone.pending.fg : tk.color.accent.solid;
    return (
      <div>
        <div role="img" aria-label={d.text} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: tk.space.half, height: 10 }}>
          {d.on.map((on, i) => (
            <span key={i} style={{ background: on ? color : tk.color.tone.neutral.bg, borderRadius: tk.radius.xs }} />
          ))}
        </div>
        <span aria-hidden className="text-muted" style={{ fontSize: tk.type.caption.fontSize }}>
          {d.text}
        </span>
      </div>
    );
  };

  const columns: TableProps<Row>['columns'] = [
    {
      title: 'Activity',
      dataIndex: 'name',
      fixed: 'left',
      width: 220,
      render: (v, r) => (
        <div>
          <b>{v}</b>
          <div className="text-muted" style={{ fontSize: tk.type.caption.fontSize }}>
            <span translate="no">{`${formatDate(r.plannedStart)} to ${formatDate(r.plannedEnd)}`}</span>
            {r.responsibleName ? <span translate="no">{` · ${r.responsibleName}`}</span> : null}
          </div>
          <Flex gap={4} wrap style={{ marginTop: tk.space.half }}>
            {r.critical ? <AppTag meaning="failed">Critical</AppTag> : null}
            {r.overdue ? <AppTag meaning="failed">{`Due ${formatDayMonth(r.plannedEnd)}`}</AppTag> : null}
          </Flex>
        </div>
      ),
    },
    {
      title: 'Can start',
      key: 'ready',
      width: 220,
      render: (_, r) => (
        <div>
          <AppTag kind="lookahead" status={r.readiness}>{r.readiness === 'IN_PROGRESS' ? `Under way, ${formatPct(r.progressPct)}` : LOOKAHEAD_READINESS_LABELS[r.readiness]}</AppTag>
          {r.readiness === 'WAITING' ? (
            <div style={{ fontSize: tk.type.caption.fontSize, marginTop: tk.space.half }}>
              {`On ${r.waitingOn.join(', ')}`}
              {r.linkStartsOn ? `; its links allow it from ${formatDate(r.linkStartsOn)}` : ''}
            </div>
          ) : null}
        </div>
      ),
    },
    ...data.weeks.map((w, i) => ({
      title: (
        <span>
          {i === 0 ? 'This week' : i === 1 ? 'Next week' : 'Week after'}
          <span className="text-muted" style={{ display: 'block', fontWeight: 'normal', fontSize: tk.type.caption.fontSize }} translate="no">
            {`${formatDayMonth(w.from)} to ${formatDayMonth(w.to)}`}
          </span>
          {w.daysOff.length ? <span className="text-muted" style={{ display: 'block', fontWeight: 'normal', fontSize: tk.type.caption.fontSize }}>{weekDaysWords(w.daysOff)}</span> : null}
        </span>
      ),
      key: w.from,
      width: 130,
      render: (_: unknown, r: Row) => bar(r, w, i === 0),
    })),
  ];

  return (
    <div className="lookahead-panel">
      <div style={{ display: 'flex', gap: tk.space[8], flexWrap: 'wrap', marginBottom: tk.space[3] }}>
        <Statistic title="Under way" value={rows.length - starting.length} styles={big} />
        <Statistic title="Ready to start" value={ready} suffix={<span style={{ fontSize: tk.type.caption.fontSize }}>of {starting.length} to start</span>} styles={big} />
        <Statistic title="Waiting" value={waiting} styles={big} />
        <Statistic title="Past planned finish" value={data.overdue.length} styles={data.overdue.length ? { content: { fontSize: tk.type.subhead.fontSize, color: tk.color.tone.danger.fg } } : big} />
      </div>
      <Typography.Paragraph type="secondary" style={{ marginBottom: tk.space[2] }}>
        {`The three weeks from Monday ${formatDate(data.weeks[0]?.from)}.`}
      </Typography.Paragraph>
      <Table<Row>
        className="lookahead-table"
        rowKey="id"
        size="small"
        pagination={false}
        columns={columns}
        dataSource={rows}
        scroll={{ x: 840 }}
        locale={{ emptyText: 'Nothing planned in the next three weeks. Give the activities planned dates under Activities or Gantt.' }}
      />
    </div>
  );
}
