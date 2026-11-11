'use client';

import React, { useMemo, useState } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { App, Button, Flex, Spin, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type { ManagementReportDto, SavedReportDto } from '@erp/shared';
import { tk } from '@/ds';
import { useAuth } from '@/lib/auth';
import { useDeleteReport, useProjects, useReportSources, useSavedReport, useSavedReportRun } from '@/lib/queries';
import { useProjectScope } from '@/lib/project-scope';
import { formatDate } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { DatePicker } from '@/components/common/DatePicker';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { FileExcelOutlined, MailOutlined, PrinterOutlined } from '@/components/common/icons';
import { useConfirmDelete } from '@/components/common/ConfirmDelete';
import { MoreActions } from '@/components/record/MoreActions';
import { ReportSection } from '@/components/management/ReportSection';
import { exportManagementReport, openManagementReportPrint } from '@/components/management/reportOutput';
import { ReportForm } from '@/components/report-builder/ReportForm';
import { ScheduleForm } from '@/components/report-builder/ScheduleForm';

const crumbs = [
  { title: 'Reports', href: '/modules/reports' },
  { title: 'My reports', href: '/my-reports' },
];

/**
 * A saved report (ARCHITECTURE "Reports you build"), run as the reader over the period in the address (the reporting
 * month when none) and one project or every one they see; Print and Excel draw the same `ManagementReportDto`.
 */
export default function SavedReportPage() {
  const { id } = useParams<{ id: string }>();
  const { data: report, isLoading, error, refetch } = useSavedReport(id);
  if (isLoading) return <PageSkeleton shape="list" />;
  if (error || !report)
    return (
      <div className="page-container">
        <PageHeader title="Report" crumbs={crumbs} />
        <QueryError error={error} onRetry={() => refetch()} />
      </div>
    );
  return <SavedReport report={report} />;
}

function SavedReport({ report }: { report: SavedReportDto }) {
  const { message } = App.useApp();
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const { data: sources } = useReportSources();
  const source = sources?.find((s) => s.key === report.source);
  const [projectId, setProjectId] = useProjectScope(search.get('projectId') ?? undefined);
  const { data: projects } = useProjects(!!source?.projects);
  const from = search.get('from') ?? undefined;
  const to = search.get('to') ?? undefined;
  const params = { ...(source?.dated ? { from, to } : {}), ...(source?.projects && projectId ? { projectId } : {}) };
  const { data, isLoading, isFetching, error, refetch } = useSavedReportRun(report.id, params);
  const [editing, setEditing] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [askDelete, deleteDialog] = useConfirmDelete();
  const remove = useDeleteReport();

  const options = useMemo(() => (projects ?? []).map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` })), [projects]);
  const setParams = (next: Record<string, string | undefined>) => {
    const q = new URLSearchParams(search.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    q.delete('projectId');
    router.replace(q.size ? `${pathname}?${q}` : pathname, { scroll: false });
  };

  const print = () => {
    if (!data) return;
    if (!openManagementReportPrint(data, user?.organizationName ?? '')) message.warning('Pop-up blocked. Allow pop-ups for this site to print the report.');
  };
  const excel = async () => {
    if (!data) return;
    setExporting(true);
    try {
      await exportManagementReport(data);
    } catch {
      message.error('The spreadsheet could not be made. Try again, or print the report instead.');
    } finally {
      setExporting(false);
    }
  };

  const s = report.schedule;
  const subtitle = [report.sourceLabel, report.mine ? null : `made by ${report.ownerName}`, s ? `emailed ${s.words.charAt(0).toLowerCase()}${s.words.slice(1)} to ${s.recipients.map((r) => r.name).join(', ')}` : null].filter(Boolean).join(', ');

  return (
    <div className="page-container">
      <PageHeader
        title={report.name}
        crumbs={crumbs}
        extra={
          <>
            <Button icon={<PrinterOutlined />} onClick={print} disabled={!data}>
              Print
            </Button>
            <Button icon={<FileExcelOutlined />} onClick={excel} loading={exporting} disabled={!data}>
              Excel
            </Button>
            {report.mine ? (
              <>
                <Button icon={<MailOutlined />} onClick={() => setScheduling(true)}>
                  Schedule
                </Button>
                <MoreActions
                  label="More actions for this report"
                  items={[
                    { key: 'edit', label: 'Edit', onSelect: () => setEditing(true) },
                    { key: 'delete', label: 'Delete', danger: true, onSelect: () => askDelete({ what: `report ${report.name}`, onConfirm: async () => (await remove.mutateAsync(report.id), router.push('/my-reports')) }) },
                  ]}
                />
              </>
            ) : null}
          </>
        }
      />
      <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
        {subtitle.charAt(0).toUpperCase() + subtitle.slice(1)}.{s?.lastSentOn ? ` Last sent ${formatDate(s.lastSentOn)}.` : ''}
      </Typography.Paragraph>
      {source && (source.dated || source.projects) ? (
        <Flex wrap align="center" gap={tk.space[3]} style={{ marginBottom: tk.space[4] }}>
          {source.dated ? (
            <DatePicker.RangePicker
              aria-label={source.dated.label}
              allowClear={false}
              value={[from ? dayjs(from) : data?.from ? dayjs(data.from) : null, to ? dayjs(to) : data ? dayjs(data.to) : null]}
              disabledDate={(d: Dayjs) => d.isAfter(dayjs(), 'day')}
              onChange={(v) => setParams({ from: v?.[0]?.format('YYYY-MM-DD'), to: v?.[1]?.format('YYYY-MM-DD') })}
            />
          ) : null}
          {source.projects ? <ProjectSelect value={projectId} onChange={(v) => setProjectId(v)} options={options} placeholder="Every project you see" aria-label="Project" /> : null}
          {isFetching && data ? <Spin size="small" description="Updating…" /> : null}
        </Flex>
      ) : null}
      {isLoading && !data ? <PageSkeleton shape="list" header={false} /> : error || !data ? <QueryError error={error} onRetry={() => refetch()} /> : <ReportBody data={data} />}
      {report.mine ? <ReportForm open={editing} report={report} onClose={() => setEditing(false)} /> : null}
      {report.mine ? <ScheduleForm open={scheduling} report={report} onClose={() => setScheduling(false)} /> : null}
      {deleteDialog}
    </div>
  );
}

function ReportBody({ data }: { data: ManagementReportDto }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: tk.space[4] }}>
      <Typography.Text type="secondary">
        <span translate="no">{data.period}</span>
        {data.projectName ? (
          <>
            , <span translate="no">{data.projectName}</span>
          </>
        ) : data.scope ? (
          `, ${data.scope.charAt(0).toLowerCase()}${data.scope.slice(1)}`
        ) : null}
      </Typography.Text>
      {data.sections.map((s) => (
        <ReportSection key={s.key} section={s} />
      ))}
      {data.notes.length ? (
        <section aria-label="About this report" style={{ color: tk.color.text.muted, fontSize: tk.type.caption.fontSize }}>
          {data.notes.map((n, i) => (
            <p key={i} style={{ margin: `0 0 ${tk.space[1]}` }}>
              {n}
            </p>
          ))}
        </section>
      ) : null}
    </div>
  );
}
