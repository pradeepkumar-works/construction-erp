'use client';

import React from 'react';
import { Flex, Statistic, Table, Typography, theme } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import type { TableProps } from 'antd';
import { LOOKAHEAD_READINESS_LABELS, type LookaheadActivityDto, type LookaheadReadiness } from '@erp/shared';
import { useLookahead } from '@/lib/queries';
import dayjs from 'dayjs';
import { formatDate, formatDayMonth, formatPct } from '@/lib/format';
import { Loading, QueryError } from '@/components/common/QueryState';
import { themeFontSize } from '@/lib/theme';

const READINESS_COLORS: Record<LookaheadReadiness, string> = { IN_PROGRESS: 'blue', READY: 'green', WAITING: 'gold' };
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const big = { content: { fontSize: themeFontSize('fontSizeXL') } };

type Row = LookaheadActivityDto & { overdue: boolean };

/** Which days of a week an activity runs, in words: "all week", "from Wed", "Tue to Thu". */
function daysIn(a: Row, week: { from: string; to: string }): { on: boolean[]; text: string } | null {
  if (a.plannedStart > week.to || a.plannedEnd < week.from) return null;
  const start = dayjs(week.from);
  const on = DAYS.map((_, i) => {
    const d = start.add(i, 'day').format('YYYY-MM-DD');
    return d >= a.plannedStart && d <= a.plannedEnd;
  });
  const first = on.indexOf(true);
  const last = on.lastIndexOf(true);
  const text = first === 0 && last === 6 ? 'all week' : first === 0 ? `to ${DAYS[last]}` : last === 6 ? `from ${DAYS[first]}` : first === last ? DAYS[first] : `${DAYS[first]} to ${DAYS[last]}`;
  return { on, text };
}

/**
 * Look-ahead tab of a project (v6 item 114): the three weeks from this Monday, every activity planned in them (and those
 * past their end, still open) with the days it runs each week, and whether it can start: under way, ready, or waiting on
 * the activities its links tie it to. Critical activities are marked; the site team plans the next weeks from it.
 */
export function LookaheadPanel({ projectId }: { projectId: string }) {
  const { token } = theme.useToken();
  const { data, isLoading, error, refetch } = useLookahead(projectId);
  if (isLoading) return <Loading />;
  if (error || !data) return <QueryError error={error} onRetry={() => refetch()} />;

  const seen = new Set<string>();
  const rows: Row[] = [...data.overdue.map((a) => ({ ...a, overdue: true })), ...data.weeks.flatMap((w) => w.activities.map((a) => ({ ...a, overdue: false })))].filter((a) => !seen.has(a.id) && !!seen.add(a.id));
  const starting = rows.filter((a) => a.readiness !== 'IN_PROGRESS');
  const ready = starting.filter((a) => a.readiness === 'READY').length;
  const waiting = starting.filter((a) => a.readiness === 'WAITING').length;

  const bar = (a: Row, week: { from: string; to: string }, first: boolean) => {
    // Past its end and still open: it carries into this week.
    if (a.overdue && first) return <span style={{ color: token.colorErrorText, fontSize: themeFontSize('fontSizeSM') }}>Still open</span>;
    const d = daysIn(a, week);
    if (!d) return <span className="text-muted">-</span>;
    const color = a.critical ? token.colorErrorText : a.readiness === 'WAITING' ? token.colorWarningText : token.colorPrimary;
    return (
      <div>
        <div role="img" aria-label={d.text} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, height: 10 }}>
          {d.on.map((on, i) => (
            <span key={i} style={{ background: on ? color : token.colorFillSecondary, borderRadius: 2 }} />
          ))}
        </div>
        <span aria-hidden className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
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
          <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
            <span translate="no">{`${formatDate(r.plannedStart)} to ${formatDate(r.plannedEnd)}`}</span>
            {r.responsibleName ? <span translate="no">{` · ${r.responsibleName}`}</span> : null}
          </div>
          <Flex gap={4} wrap style={{ marginTop: 2 }}>
            {r.critical ? <AppTag tone="danger">Critical</AppTag> : null}
            {r.overdue ? <AppTag tone="danger">{`Due ${formatDayMonth(r.plannedEnd)}`}</AppTag> : null}
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
          <AppTag color={READINESS_COLORS[r.readiness]}>{r.readiness === 'IN_PROGRESS' ? `Under way, ${formatPct(r.progressPct)}` : LOOKAHEAD_READINESS_LABELS[r.readiness]}</AppTag>
          {r.readiness === 'WAITING' ? (
            <div style={{ fontSize: themeFontSize('fontSizeSM'), marginTop: 2 }}>
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
          <span className="text-muted" style={{ display: 'block', fontWeight: 'normal', fontSize: themeFontSize('fontSizeSM') }} translate="no">
            {`${formatDayMonth(w.from)} to ${formatDayMonth(w.to)}`}
          </span>
        </span>
      ),
      key: w.from,
      width: 130,
      render: (_: unknown, r: Row) => bar(r, w, i === 0),
    })),
  ];

  return (
    <div className="lookahead-panel">
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginBottom: 12 }}>
        <Statistic title="Under way" value={rows.length - starting.length} styles={big} />
        <Statistic title="Ready to start" value={ready} suffix={<span style={{ fontSize: themeFontSize('fontSizeSM') }}>of {starting.length} to start</span>} styles={big} />
        <Statistic title="Waiting" value={waiting} styles={big} />
        <Statistic title="Past their end" value={data.overdue.length} styles={data.overdue.length ? { content: { fontSize: themeFontSize('fontSizeXL'), color: token.colorErrorText } } : big} />
      </div>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
        {`The three weeks from Monday ${formatDate(data.weeks[0]?.from)}. An activity is ready when what it waits on has started or finished as its links need; links are set on the Schedule tab.`}
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
