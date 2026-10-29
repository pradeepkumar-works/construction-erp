'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, Checkbox, Flex, Segmented, Select, Statistic, Table, Typography, theme } from 'antd';
import { LAB_REPORT_DAYS, type LabSampleDto, type TestResult } from '@erp/shared';
import { useLabSamples, useQaLabs } from '@/lib/queries';
import { useProjectScope } from '@/lib/project-scope';
import { formatDate, formatINR } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryError } from '@/components/common/QueryState';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { AppTag } from '@/components/common/AppTag';
import { EmptyArt } from '@/components/common/EmptyArt';
import { TestResultTag } from '@/components/quality/qualityUi';

type StateFilter = 'ALL' | 'AT_LAB' | 'REPORTED';

/** Samples at the labs (item 137 part 2): what went to which lab, how long it has waited for its report, and the charges. */
export function SamplesPage() {
  const { token } = theme.useToken();
  const params = useSearchParams();
  const router = useRouter();
  const [projectId, setProjectId] = useProjectScope();
  const [labId, setLabId] = useState<string | undefined>(params.get('labId') ?? undefined);
  const [state, setState] = useState<StateFilter>((params.get('state') as StateFilter) ?? 'ALL');
  const [late, setLate] = useState(params.get('late') === '1');
  const [page, setPage] = useState({ page: 1, pageSize: 25 });
  const labs = useQaLabs();
  const { data, isLoading, isFetching, error, refetch } = useLabSamples({
    ...page,
    projectId,
    labId,
    state: state === 'ALL' ? undefined : state,
    late: late || undefined,
  });
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage((p) => ({ ...p, page: 1 }));
  };
  const filtered = !!labId || state !== 'ALL' || late;

  return (
    <div className="page-container">
      <PageHeader
        title="Samples sent out"
        subtitle={`Samples sent to the labs, the oldest wait first. A report is late after ${LAB_REPORT_DAYS} days, counted from the last test day.`}
      />
      {error ? <QueryError error={error} onRetry={() => refetch()} /> : null}
      <Flex gap={token.marginLG} wrap style={{ marginBottom: token.margin }}>
        <Statistic title="At the labs" value={data?.atLab ?? 0} loading={isLoading} />
        <Statistic title="Report late" value={data?.late ?? 0} loading={isLoading} styles={{ content: data?.late ? { color: token.colorErrorText } : undefined }} />
        <Statistic title="Charges on these" value={formatINR(data?.charges ?? 0)} loading={isLoading} />
      </Flex>
      <Card>
        <Flex gap={token.marginSM} wrap align="center" style={{ marginBottom: token.margin }}>
          <ProjectSelect allowClear placeholder="All projects" aria-label="Project" value={projectId} onChange={reset(setProjectId)} style={{ width: 220 }} />
          <Select
            allowClear
            placeholder="Any lab"
            aria-label="Lab"
            value={labId}
            onChange={reset(setLabId)}
            style={{ width: 220 }}
            loading={labs.isLoading}
            showSearch={{ optionFilterProp: 'label' }}
            options={(labs.data ?? []).map((l) => ({ value: l.id, label: l.name }))}
          />
          <Segmented<StateFilter>
            aria-label="Report"
            value={state}
            onChange={reset(setState)}
            options={[
              { value: 'ALL', label: 'All' },
              { value: 'AT_LAB', label: 'At the lab' },
              { value: 'REPORTED', label: 'Reported' },
            ]}
          />
          <Checkbox checked={late} onChange={(e) => reset(setLate)(e.target.checked)}>
            Report late
          </Checkbox>
        </Flex>
        <Table<LabSampleDto>
          rowKey="testId"
          size="middle"
          dataSource={data?.items ?? []}
          loading={isFetching && !isLoading}
          scroll={{ x: 1000 }}
          rowClassName={() => 'row-click'}
          onRow={(r) => ({ onClick: (e) => !(e.target as HTMLElement).closest('a') && router.push(`/inspections?tab=tests&id=${r.testId}`) })}
          pagination={{
            current: page.page,
            pageSize: page.pageSize,
            total: data?.total ?? 0,
            showSizeChanger: true,
            onChange: (p, s) => setPage({ page: s === page.pageSize ? p : 1, pageSize: s }),
          }}
          locale={{ emptyText: isLoading ? ' ' : <EmptyArt art="entries" title={filtered ? 'No sample matches these filters' : 'No sample at a lab yet'}>{filtered ? null : 'Pick the lab and the day it was sent on a material test.'}</EmptyArt> }}
          columns={[
            {
              title: 'Test',
              key: 'test',
              render: (_, s) => (
                <Flex vertical gap={2}>
                  <Link href={`/inspections?tab=tests&id=${s.testId}`}>
                    <span translate="no">{s.testNo}</span> {s.title}
                  </Link>
                  <Typography.Text type="secondary">{s.projectName}</Typography.Text>
                </Flex>
              ),
            },
            { title: 'Lab', dataIndex: 'labName', width: 200, render: (v: string) => <span translate="no">{v}</span> },
            { title: 'Sent', dataIndex: 'sentOn', width: 110, render: (v: string) => formatDate(v) },
            {
              title: 'Report',
              key: 'report',
              width: 200,
              render: (_, s) =>
                s.state === 'REPORTED' ? (
                  <Flex vertical gap={2}>
                    <span>{formatDate(s.reportOn)}</span>
                    {s.labReportNo ? (
                      <Typography.Text type="secondary" translate="no">
                        {s.labReportNo}
                      </Typography.Text>
                    ) : null}
                  </Flex>
                ) : (
                  <Flex gap={token.marginXS} align="center" wrap>
                    <span translate="no">{s.waitDays === 1 ? '1 day' : `${s.waitDays ?? 0} days`}</span>
                    {s.late ? <AppTag tone="danger">Late</AppTag> : <AppTag tone="pending">At the lab</AppTag>}
                  </Flex>
                ),
            },
            { title: 'Result', dataIndex: 'result', width: 120, render: (v: TestResult) => <TestResultTag result={v} /> },
            { title: 'Charge', dataIndex: 'labCharge', width: 110, align: 'right', render: (v: string | null) => <span translate="no">{v ? formatINR(v) : '-'}</span> },
          ]}
        />
      </Card>
    </div>
  );
}
