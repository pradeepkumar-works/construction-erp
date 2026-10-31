'use client';

import React, { useState } from 'react';
import { Statistic, Table, Tooltip } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import type { TableProps } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type { MusterDto, MusterRowDto, OutputRowDto, StaffAttendanceStatus } from '@erp/shared';
import { useMuster, useWorkerOutput } from '@/lib/queries';
import { formatINR, formatQty } from '@/lib/format';
import { downloadXlsx, exportFileName, type ExportColumn } from '@/lib/exportExcel';
import { QueryError } from '@/components/common/QueryState';
import { CardToolbar } from '@/components/common/CardToolbar';
import { themeColor, themeFontSize } from '@/lib/theme';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { useProjectScope } from '@/lib/project-scope';
import { ExportButton } from '@/components/common/ExportButton';

const MARK: Record<StaffAttendanceStatus, { text: string; color: string }> = {
  PRESENT: { text: 'P', color: themeColor('colorSuccessText') },
  HALF_DAY: { text: 'H', color: themeColor('orange7') },
  ABSENT: { text: 'A', color: themeColor('colorErrorText') },
};
const big = { content: { fontSize: themeFontSize('fontSizeXL') } };

const musterExport = (m: MusterDto): ExportColumn<MusterRowDto>[] => [
  { header: 'No.', value: (r) => r.workerNo },
  { header: 'Name', value: (r) => r.name, width: 24 },
  { header: 'Contractor', value: (r) => r.contractor, width: 28 },
  { header: 'Trade', value: (r) => r.trade, width: 12 },
  ...Array.from({ length: m.daysInMonth }, (_, i) => ({ header: String(i + 1), value: (r: MusterRowDto) => (r.marks[i + 1] ? MARK[r.marks[i + 1]].text : ''), width: 3 })),
  { header: 'Present', value: (r) => r.present },
  { header: 'Half days', value: (r) => r.halfDays },
  { header: 'Man-days', value: (r) => r.manDays },
  { header: 'OT hours', value: (r) => r.otHours },
  { header: 'Daily wage', value: (r) => Number(r.dailyWage) },
  { header: 'Wages', value: (r) => Number(r.wages) },
];

/**
 * The month's muster roll of a project with wages per worker and per contractor, and output per man-day: man-days
 * the roll call put on each activity against the progress approved in the same days.
 */
export function MusterPanel({ projectId: fixedProject }: { projectId?: string }) {
  // The header's project (UX item 84): picking one here picks it for every list.
  const [projectPick, setProjectPick] = useProjectScope();
  const projectId = fixedProject ?? projectPick;
  const [month, setMonth] = useState<Dayjs>(dayjs());
  const monthStr = month.format('YYYY-MM');
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(6, 'day'), dayjs()]);
  const muster = useMuster(projectId, monthStr);
  const output = useWorkerOutput(projectId, range[0].format('YYYY-MM-DD'), range[1].format('YYYY-MM-DD'));
  const m = muster.data;

  const columns: TableProps<MusterRowDto>['columns'] = [
    {
      title: 'Worker',
      dataIndex: 'name',
      fixed: 'left',
      width: 180,
      render: (v, r) => (
        <div>
          <b>{v}</b>
          <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
            {r.workerNo} · {r.trade}
          </div>
        </div>
      ),
    },
    ...Array.from({ length: m?.daysInMonth ?? 0 }, (_, i) => ({
      title: String(i + 1),
      key: `d${i + 1}`,
      width: 30,
      align: 'center' as const,
      render: (_: unknown, r: MusterRowDto) => {
        const k = r.marks[i + 1];
        return k ? <span style={{ color: MARK[k].color, fontWeight: 600, fontSize: themeFontSize('fontSizeSM') }}>{MARK[k].text}</span> : null;
      },
    })),
    { title: 'Man-days', dataIndex: 'manDays', width: 90, align: 'right', fixed: 'right' },
    { title: 'Overtime (h)', dataIndex: 'otHours', width: 100, align: 'right', fixed: 'right' },
    { title: 'Wages', dataIndex: 'wages', width: 110, align: 'right', fixed: 'right', render: (v) => formatINR(v) },
  ];

  const outCols: TableProps<OutputRowDto>['columns'] = [
    { title: 'Activity', dataIndex: 'activityName', render: (v, r) => (
      <div>
        <b>{v}</b>
        <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>{r.trades.map((t) => `${t.trade} ${t.manDays}`).join(', ')}</div>
      </div>
    ) },
    { title: 'Man-days', dataIndex: 'manDays', width: 100, align: 'right' },
    { title: 'Approved progress', dataIndex: 'quantity', width: 160, align: 'right', render: (v, r) => `${formatQty(v)} ${r.unit}` },
    {
      title: <Tooltip title="Approved progress over the man-days the roll call put on the activity">Output per man-day</Tooltip>,
      dataIndex: 'outputPerManDay',
      width: 170,
      align: 'right',
      render: (v, r) => (v === null || Number(r.quantity) === 0 ? <span className="text-muted">no progress approved</span> : `${formatQty(v)} ${r.unit}`),
    },
  ];

  return (
    <div className="muster-panel">
      <CardToolbar wrap gap={8} align="center">
        {!fixedProject ? <ProjectSelect value={projectPick} onChange={setProjectPick} placeholder="Choose the project" allowClear={false} /> : null}
        <DatePicker picker="month" value={month} onChange={(v) => v && setMonth(v)} format="MMM YYYY" allowClear={false} aria-label="Month" />
        <div style={{ flex: 1 }} />
        {m ? (
          <ExportButton
            onExport={async () => {
              await downloadXlsx(exportFileName(`muster-${monthStr}`), `Muster ${monthStr}`, musterExport(m), m.rows);
              return m.rows.length;
            }}
          />
        ) : null}
      </CardToolbar>
      {muster.error ? <QueryError error={muster.error} onRetry={() => muster.refetch()} /> : null}
      {!projectId ? (
        <div className="text-muted" style={{ padding: 16 }}>
          Choose a project to see its muster roll.
        </div>
      ) : (
        <>
          {m ? (
            <div className="muster-summary" style={{ padding: '12px 16px', display: 'flex', gap: 28, flexWrap: 'wrap' }}>
              <Statistic title="Workers" value={m.totals.workers} styles={big} />
              <Statistic title="Man-days" value={m.totals.manDays} styles={big} />
              <Statistic title="OT hours" value={m.totals.otHours} styles={big} />
              <Statistic title="Wages at current rates" value={formatINR(m.totals.wages)} styles={big} />
              {m.byContractor.map((c) => (
                <Statistic key={c.contractor} title={c.contractor} value={formatINR(c.wages)} suffix={<span style={{ fontSize: themeFontSize('fontSizeSM') }}>{c.workers} workers, {c.manDays} man-days</span>} styles={big} />
              ))}
            </div>
          ) : null}
          <Table<MusterRowDto>
            className="muster-table"
            rowKey="workerId"
            size="small"
            loading={muster.isLoading}
            columns={columns}
            dataSource={m?.rows ?? []}
            pagination={false}
            scroll={{ x: 180 + 30 * (m?.daysInMonth ?? 31) + 260 }}
            locale={{ emptyText: 'No roll call marked this month' }}
          />

          <div style={{ padding: '20px 12px 8px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <h4 style={{ margin: 0 }}>Output per man-day</h4>
            <DatePicker.RangePicker value={range} onChange={(v) => v && v[0] && v[1] && setRange([v[0], v[1]])} allowClear={false} aria-label="Dates" />
            {output.data ? (
              <span className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                {output.data.totalManDays} man-days{output.data.untaggedManDays ? `, ${output.data.untaggedManDays} not tagged to an activity` : ''}
              </span>
            ) : null}
          </div>
          {output.error ? <QueryError error={output.error} onRetry={() => output.refetch()} /> : null}
          <Table<OutputRowDto>
            className="output-table"
            rowKey="activityId"
            size="small"
            loading={output.isLoading}
            columns={outCols}
            dataSource={output.data?.rows ?? []}
            pagination={false}
            scroll={{ x: 700 }}
            locale={{ emptyText: 'No man-days tagged to activities in these days' }}
          />
        </>
      )}
    </div>
  );
}
