'use client';

import React, { useMemo, useState } from 'react';
import { App, Button, Card, Empty, Segmented, Skeleton, Space, theme } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import { formatDayMonth, formatDate } from '@/lib/format';
import { PrinterOutlined } from '@/components/common/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { QueryError } from '@/components/common/QueryState';
import { usePortalReport, useProgressReport } from '@/lib/queries';
import { buildProgressReportHtml, openProgressReportPrint, type ReportKind } from './progressReportHtml';

/** Monday-based week containing `d`. */
const weekOf = (d: Dayjs): [Dayjs, Dayjs] => {
  const start = d.subtract((d.day() + 6) % 7, 'day').startOf('day');
  return [start, start.add(6, 'day')];
};

/**
 * The weekly / monthly / custom progress report of one project, previewed and printable. Staff read it from
 * /reports/progress, the client portal from /portal/projects/:id/report (the same report).
 */
export function ProgressReportView({ projectId, portal = false, picker, only }: { projectId: string | undefined; portal?: boolean; picker?: React.ReactNode; only?: ReportKind }) {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const [chosen, setKind] = useState<ReportKind>('MONTHLY');
  const kind = only ?? chosen;
  const [anchor, setAnchor] = useState<Dayjs>(dayjs());
  const [custom, setCustom] = useState<[Dayjs, Dayjs] | null>(null);

  const [from, to] = useMemo<[Dayjs, Dayjs]>(() => {
    if (kind === 'WEEKLY') return weekOf(anchor);
    if (kind === 'MONTHLY') return [anchor.startOf('month'), anchor.endOf('month').startOf('day')];
    return custom ?? [dayjs().subtract(13, 'day'), dayjs()];
  }, [kind, anchor, custom]);

  const staff = useProgressReport(portal ? undefined : projectId, from.format('YYYY-MM-DD'), to.format('YYYY-MM-DD'));
  const client = usePortalReport(portal ? projectId : undefined, from.format('YYYY-MM-DD'), to.format('YYYY-MM-DD'));
  const { data, isLoading, isFetching, error, refetch } = portal ? client : staff;
  const html = useMemo(() => (data ? buildProgressReportHtml(data, kind, false) : ''), [data, kind]);

  return (
    <>
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          {picker}
          {only ? null : (
          <Segmented
            value={kind}
            onChange={(v) => setKind(v as ReportKind)}
            options={[
              { value: 'WEEKLY', label: 'Weekly' },
              { value: 'MONTHLY', label: 'Monthly' },
              { value: 'CUSTOM', label: 'Custom dates' },
            ]}
          />
          )}
          {kind === 'WEEKLY' ? <DatePicker picker="week" aria-label="Week" value={anchor} onChange={(d) => d && setAnchor(d)} allowClear={false} format={() => `${formatDayMonth(from)} to ${formatDate(to.format('YYYY-MM-DD'))}`} /> : null}
          {kind === 'MONTHLY' ? <DatePicker picker="month" aria-label="Month" value={anchor} onChange={(d) => d && setAnchor(d)} allowClear={false} format="MMMM YYYY" /> : null}
          {kind === 'CUSTOM' ? (
            <DatePicker.RangePicker
              value={custom ?? [from, to]}
              onChange={(r) => r?.[0] && r?.[1] && setCustom([r[0], r[1]])}
              allowClear={false}
              disabledDate={(d, info) => !!info?.from && Math.abs(d.diff(info.from, 'day')) > 91}
              aria-label="Dates"
            />
          ) : null}
          <Button type="primary" icon={<PrinterOutlined />} disabled={!data} onClick={() => data && !openProgressReportPrint(data, kind) && message.warning('Pop-up blocked. Allow pop-ups to print the report.')}>
            Print / Save as PDF
          </Button>
        </Space>
      </Card>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {!projectId ? <Empty description="Choose a project" /> : null}
      {isLoading ? <Skeleton active /> : null}
      {data ? (
        <Card size="small" styles={{ body: { padding: 0, background: token.colorFillSecondary } }}>
          <div style={{ padding: 16, display: 'flex', justifyContent: 'center', opacity: isFetching ? 0.6 : 1 }}>
            <iframe title="Report preview" srcDoc={html} style={{ width: '100%', maxWidth: 900, height: 1200, border: `1px solid ${token.colorBorder}`, background: token.colorBgContainer, boxShadow: token.boxShadowTertiary }} />
          </div>
        </Card>
      ) : null}
    </>
  );
}
