'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button, Checkbox, DatePicker, Select, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import type { QualityTestDto, QualityTestSortField, TestKind, TestResult } from '@erp/shared';
import { TEST_KINDS, TEST_KIND_LABELS, TEST_RESULTS, TEST_RESULT_LABELS, canRecordTest, specRange } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useQualityTests } from '@/lib/queries';
import { useListState } from '@/lib/listState';
import { formatDate } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ReadingsSummary, TestResultTag } from './qualityUi';
import { TestDrawer } from './TestDrawer';
import { TestFormModal } from './TestFormModal';

/** Quality tests, on the Quality page and a project's Quality tab. */
export function TestList({ projectId: fixedProject, initialOpenId, onOpenNcr }: { projectId?: string; initialOpenId?: string; onOpenNcr?: (id: string) => void }) {
  const { user } = useAuth();
  const list = useListState<QualityTestSortField>({ sortBy: 'sampledOn', sortOrder: 'desc' });
  const [projectFilter, setProjectFilter] = useState<string | undefined>();
  const [kind, setKind] = useState<TestKind | undefined>();
  const [result, setResult] = useState<TestResult | undefined>();
  const [overdue, setOverdue] = useState(false);
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [openId, setOpenId] = useState<string | null>(initialOpenId ?? null);
  const [formOpen, setFormOpen] = useState(false);
  const projectId = fixedProject ?? projectFilter;
  const { data, isLoading, isFetching, error, refetch } = useQualityTests({
    ...list.params,
    projectId,
    kind,
    result,
    overdue: overdue || undefined,
    from: range?.[0]?.format('YYYY-MM-DD'),
    to: range?.[1]?.format('YYYY-MM-DD'),
  });
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    list.resetPage();
  };
  const sort = (key: QualityTestSortField) => ({ key, sorter: true, sortOrder: list.sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });

  const columns: TableProps<QualityTestDto>['columns'] = [
    { title: 'Sampled', dataIndex: 'sampledOn', width: 110, render: (v) => formatDate(v), ...sort('sampledOn') },
    { title: 'No.', dataIndex: 'testNo', width: 130, className: 'mono', ...sort('testNo') },
    ...(fixedProject
      ? []
      : [{ title: 'Project', dataIndex: 'projectName', ...sort('project'), width: 180, ellipsis: true, render: (v: string, r: QualityTestDto) => <Link href={`/projects/${r.projectId}`}>{v}</Link> }]),
    {
      title: 'Sample',
      width: 280,
      ...sort('kind'),
      render: (_, r) => (
        <div>
          <Typography.Link onClick={() => setOpenId(r.id)}>{r.title}</Typography.Link>
          <div className="text-muted" style={{ fontSize: 12 }}>
            {[TEST_KIND_LABELS[r.kind], r.location].filter(Boolean).join(' · ')}
          </div>
        </div>
      ),
    },
    { title: 'Passes at', key: 'spec', width: 130, render: (_, r) => specRange(r.specMin, r.specMax, r.unit) ?? <span className="text-muted">-</span> },
    { title: 'Readings', key: 'readings', width: 240, render: (_, r) => <ReadingsSummary t={r} /> },
    { title: 'NCRs', dataIndex: 'openNcrs', width: 70, align: 'right', render: (v: number) => (v ? <span className="text-danger">{v} open</span> : <span className="text-muted">-</span>) },
    { title: 'Result', dataIndex: 'result', fixed: 'right' as const, width: 100, ...sort('result'), render: (v: TestResult) => <TestResultTag result={v} /> },
    {
      title: '',
      key: 'actions',
      fixed: 'right' as const,
      width: 80,
      render: (_, r) => (
        <Button size="small" onClick={() => setOpenId(r.id)}>
          Open
        </Button>
      ),
    },
  ];

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar
        projectId={projectFilter}
        onProject={reset(setProjectFilter)}
        hideProject={!!fixedProject}
        search={list.search}
        onSearch={list.setSearch}
        searchPlaceholder="Search no., sample, location"
        extra={
          user && canRecordTest(user.roleKey) ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
              Record test
            </Button>
          ) : null
        }
      >
        <Select allowClear placeholder="All tests" value={kind} onChange={reset(setKind)} style={{ width: 200 }} options={TEST_KINDS.map((k) => ({ value: k, label: TEST_KIND_LABELS[k] }))} />
        <Select allowClear placeholder="Any result" value={result} onChange={reset(setResult)} style={{ width: 130 }} options={TEST_RESULTS.map((k) => ({ value: k, label: TEST_RESULT_LABELS[k] }))} />
        <Checkbox checked={overdue} onChange={(e) => reset(setOverdue)(e.target.checked)}>
          Results overdue
        </Checkbox>
        <DatePicker.RangePicker value={range} onChange={(v) => reset(setRange)(v as [Dayjs | null, Dayjs | null] | null)} format="DD MMM YYYY" allowEmpty={[true, true]} />
      </ListToolbar>
      <Table<QualityTestDto>
        rowKey="id"
        loading={isLoading || isFetching}
        columns={columns}
        dataSource={data?.items ?? []}
        size="middle"
        {...list.tableProps<QualityTestDto>(data?.total)}
        scroll={{ x: fixedProject ? 1180 : 1360 }}
        locale={{ emptyText: 'No test recorded yet' }}
      />
      <TestDrawer id={openId} open={!!openId} onClose={() => setOpenId(null)} onOpenNcr={onOpenNcr} />
      <TestFormModal open={formOpen} onClose={() => setFormOpen(false)} projectId={fixedProject} />
    </>
  );
}
