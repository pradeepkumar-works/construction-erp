'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { App, Button, Card, DatePicker, Empty, Segmented, Select, Skeleton, Space } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryError } from '@/components/common/QueryState';
import { useProgressReport, useProjects } from '@/lib/queries';
import { buildProgressReportHtml, openProgressReportPrint, type ReportKind } from '@/components/reports/progressReportHtml';

/** Monday-based week containing `d`. */
const weekOf = (d: Dayjs): [Dayjs, Dayjs] => {
  const start = d.subtract((d.day() + 6) % 7, 'day').startOf('day');
  return [start, start.add(6, 'day')];
};

export default function ReportsPage() {
  return (
    <Suspense fallback={<Skeleton active />}>
      <Reports />
    </Suspense>
  );
}

function Reports() {
  const params = useSearchParams();
  const { message } = App.useApp();
  const { data: projects } = useProjects();
  const [projectId, setProjectId] = useState<string | undefined>(params.get('projectId') ?? undefined);
  const [kind, setKind] = useState<ReportKind>('MONTHLY');
  const [anchor, setAnchor] = useState<Dayjs>(dayjs());
  const [custom, setCustom] = useState<[Dayjs, Dayjs] | null>(null);

  useEffect(() => {
    if (!projectId && projects?.length) setProjectId(projects[0].id);
  }, [projects, projectId]);

  const [from, to] = useMemo<[Dayjs, Dayjs]>(() => {
    if (kind === 'WEEKLY') return weekOf(anchor);
    if (kind === 'MONTHLY') return [anchor.startOf('month'), anchor.endOf('month').startOf('day')];
    return custom ?? [dayjs().subtract(13, 'day'), dayjs()];
  }, [kind, anchor, custom]);

  const { data, isLoading, isFetching, error, refetch } = useProgressReport(projectId, from.format('YYYY-MM-DD'), to.format('YYYY-MM-DD'));
  const html = useMemo(() => (data ? buildProgressReportHtml(data, kind, false) : ''), [data, kind]);

  return (
    <div className="page-container">
      <PageHeader title="Progress Reports" subtitle="Weekly and monthly progress report from approved data, ready to print or save as PDF." />
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          <Select
            showSearch
            optionFilterProp="label"
            style={{ width: 340 }}
            placeholder="Project"
            value={projectId}
            onChange={setProjectId}
            options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))}
          />
          <Segmented
            value={kind}
            onChange={(v) => setKind(v as ReportKind)}
            options={[
              { value: 'WEEKLY', label: 'Weekly' },
              { value: 'MONTHLY', label: 'Monthly' },
              { value: 'CUSTOM', label: 'Custom' },
            ]}
          />
          {kind === 'WEEKLY' ? <DatePicker picker="week" value={anchor} onChange={(d) => d && setAnchor(d)} allowClear={false} format={() => `${from.format('D MMM')} to ${to.format('D MMM YYYY')}`} /> : null}
          {kind === 'MONTHLY' ? <DatePicker picker="month" value={anchor} onChange={(d) => d && setAnchor(d)} allowClear={false} format="MMMM YYYY" /> : null}
          {kind === 'CUSTOM' ? (
            <DatePicker.RangePicker
              value={custom ?? [from, to]}
              onChange={(r) => r?.[0] && r?.[1] && setCustom([r[0], r[1]])}
              format="DD MMM YYYY"
              allowClear={false}
              disabledDate={(d, info) => !!info?.from && Math.abs(d.diff(info.from, 'day')) > 91}
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
        <Card size="small" styles={{ body: { padding: 0, background: '#e9edf2' } }}>
          <div style={{ padding: 16, display: 'flex', justifyContent: 'center', opacity: isFetching ? 0.6 : 1 }}>
            <iframe title="Report preview" srcDoc={html} style={{ width: '100%', maxWidth: 900, height: 1200, border: '1px solid #d0d7e2', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,.08)' }} />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
