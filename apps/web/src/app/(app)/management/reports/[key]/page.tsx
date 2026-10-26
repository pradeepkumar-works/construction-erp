'use client';

import React, { useMemo, useState } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { App, Button, Flex, Result, Spin, Typography, theme } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { MANAGEMENT_REPORTS, MANAGEMENT_REPORT_KEYS, canSeeManagement, type ManagementReportDto, type ManagementReportKey } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useManagementReport, useProjects } from '@/lib/queries';
import { useProjectScope } from '@/lib/project-scope';
import { PageHeader } from '@/components/common/PageHeader';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { DatePicker } from '@/components/common/DatePicker';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { ResultMark } from '@/components/common/ResultMark';
import { FileExcelOutlined, PrinterOutlined } from '@/components/common/icons';
import { FigureStrip } from '@/components/management/FigureStrip';
import { ReportSection } from '@/components/management/ReportSection';
import { cellText } from '@/components/management/report-format';
import { exportManagementReport, openManagementReportPrint } from '@/components/management/reportOutput';

const isKey = (k: string | undefined): k is ManagementReportKey => !!k && (MANAGEMENT_REPORT_KEYS as readonly string[]).includes(k);
const crumbs = [{ title: 'Management dashboard', href: '/management' }];

/**
 * A management report (ARCHITECTURE "Management dashboard and reports"): its period (a month, a range of dates, or today),
 * every contract project or one, the headline figures, the sections as tables with totals, and Print and Excel with the
 * same figures. The period sits in the address, so a link opens the same report.
 */
export default function Page() {
  const { key } = useParams<{ key: string }>();
  const { user } = useAuth();
  if (!isKey(key))
    return (
      <div className="page-container">
        <PageHeader title="Report" docTitle="Report not found" crumbs={crumbs} />
        <Result icon={<ResultMark kind="not-found" />} title="There is no such report" subTitle="Choose a report from the management dashboard." />
      </div>
    );
  if (user && !canSeeManagement(user.roleKey))
    return (
      <div className="page-container">
        <PageHeader title={MANAGEMENT_REPORTS[key].title} crumbs={crumbs} />
        <Result icon={<ResultMark kind="no-access" />} title="Management reports are for management, accounts and project managers" />
      </div>
    );
  if (!user) return <PageSkeleton shape="list" />;
  return <Report reportKey={key} />;
}

function Report({ reportKey }: { reportKey: ManagementReportKey }) {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const { user } = useAuth();
  const info = MANAGEMENT_REPORTS[reportKey];
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [projectId, setProjectId] = useProjectScope(search.get('projectId') ?? undefined);
  const { data: projects } = useProjects();
  const [exporting, setExporting] = useState(false);
  const month = search.get('month') ?? undefined;
  const from = search.get('from') ?? undefined;
  const to = search.get('to') ?? undefined;
  const params = info.period === 'month' ? { month, projectId } : info.period === 'range' ? { from, to, projectId } : { projectId };
  const { data, isLoading, isFetching, error, refetch } = useManagementReport(reportKey, params);

  const setParams = (next: Record<string, string | undefined>) => {
    const q = new URLSearchParams(search.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    q.delete('projectId');
    router.replace(q.size ? `${pathname}?${q}` : pathname, { scroll: false });
  };
  // A store or a plant has no contract, so only the stock position takes one.
  const options = useMemo(
    () =>
      (projects ?? [])
        .filter((p) => reportKey === 'stock' || (p.type !== 'STORE' && p.type !== 'PLANT'))
        .map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` })),
    [projects, reportKey],
  );

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

  const period =
    info.period === 'month' ? (
      <DatePicker
        picker="month"
        aria-label="Month"
        allowClear={false}
        format="MMMM YYYY"
        value={dayjs(month ? `${month}-01` : undefined)}
        disabledDate={(d: Dayjs) => d.isAfter(dayjs(), 'month')}
        onChange={(d) => setParams({ month: d ? d.format('YYYY-MM') : undefined })}
      />
    ) : info.period === 'range' ? (
      <DatePicker.RangePicker
        aria-label="Period"
        allowClear={false}
        format="D MMM YYYY"
        value={[from ? dayjs(from) : data?.from ? dayjs(data.from) : null, to ? dayjs(to) : data ? dayjs(data.to) : null]}
        disabledDate={(d: Dayjs) => d.isAfter(dayjs(), 'day')}
        onChange={(v) =>
          setParams({
            from: v?.[0]?.format('YYYY-MM-DD'),
            to: v?.[1]?.format('YYYY-MM-DD'),
          })
        }
      />
    ) : (
      <Typography.Text type="secondary">As of today</Typography.Text>
    );

  return (
    <div className="page-container">
      <PageHeader
        title={info.title}
        crumbs={crumbs}
        subtitle={info.description}
        extra={
          <>
            <Button icon={<PrinterOutlined />} onClick={print} disabled={!data}>
              Print
            </Button>
            <Button icon={<FileExcelOutlined />} onClick={excel} loading={exporting} disabled={!data}>
              Excel
            </Button>
          </>
        }
      />
      <Flex wrap align="center" gap={token.marginSM} style={{ marginBottom: token.margin }}>
        {period}
        <ProjectSelect value={projectId} onChange={(v) => setProjectId(v)} options={options} placeholder="Every contract project" aria-label="Project" />
        {isFetching && data ? <Spin size="small" description="Updating…" /> : null}
      </Flex>
      {isLoading && !data ? (
        <PageSkeleton shape="list" header={false} />
      ) : error || !data ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : (
        <ReportBody data={data} />
      )}
    </div>
  );
}

function ReportBody({ data }: { data: ManagementReportDto }) {
  const { token } = theme.useToken();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: token.margin }}>
      <Typography.Text type="secondary">
        <span translate="no">{data.period}</span>, {data.projectName ? <span translate="no">{data.projectName}</span> : 'every contract project'}
      </Typography.Text>
      {data.figures.length ? (
        <FigureStrip
          label={`${data.title} figures`}
          figures={data.figures.map((f, i) => ({
            key: `${i}`,
            label: f.label,
            value: cellText(f.kind, f.value, true),
            note: f.note,
            tone: typeof f.value === 'number' && f.value < 0 && (f.kind === 'money' || f.kind === 'pct') ? 'danger' : undefined,
          }))}
        />
      ) : null}
      {data.sections.map((s) => (
        <ReportSection key={s.key} section={s} />
      ))}
      {data.notes.length ? (
        <section
          aria-label="How the figures are worked out"
          style={{
            color: token.colorTextSecondary,
            fontSize: token.fontSizeSM,
          }}
        >
          {data.notes.map((n, i) => (
            <p key={i} style={{ margin: `0 0 ${token.marginXXS}px` }}>
              {n}
            </p>
          ))}
        </section>
      ) : null}
    </div>
  );
}
