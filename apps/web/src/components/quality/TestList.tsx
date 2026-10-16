'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button, Checkbox, Select, Typography, theme } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { QualityTestDto, QualityTestSortField, TestKind, TestResult } from '@erp/shared';
import { LIST_SORT_FIELDS, TEST_KINDS, TEST_KIND_LABELS, TEST_RESULTS, TEST_RESULT_LABELS, canRecordTest, specRange } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useQualityTests } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { DateRangeFilter } from '@/components/list/DateRangeFilter';
import { useListFrame } from '@/components/list/useListFrame';
import { RecordLink } from '@/components/record/RecordLink';
import { ReadingsSummary, TestResultTag } from './qualityUi';
import { TestDrawer } from './TestDrawer';
import { TestFormModal } from './TestFormModal';

const KEYS = ['kind', 'result', 'overdue', 'from', 'to'] as const;

function Sub({ children }: { children: React.ReactNode }) {
  const { token } = theme.useToken();
  return <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{children}</div>;
}

/** Quality tests, on the Quality page and a project's Quality tab. */
export function TestList({ projectId: fixedProject, initialOpenId, onOpenNcr }: { projectId?: string; initialOpenId?: string; onOpenNcr?: (id: string) => void }) {
  const { user } = useAuth();
  const [openId, setOpenId] = useState<string | null>(initialOpenId ?? null);
  const [formOpen, setFormOpen] = useState(false);
  const frame = useListFrame<QualityTestSortField, QualityTestDto>({
    list: 'quality-tests',
    url: false,
    keys: KEYS,
    sortBy: 'sampledOn',
    sortOrder: 'desc',
    sortFields: LIST_SORT_FIELDS.qualityTests,
    fixedProject,
    chipLabels: {
      kind: (v) => `Test: ${TEST_KIND_LABELS[v as TestKind] ?? v}`,
      result: (v) => `Result: ${TEST_RESULT_LABELS[v as TestResult] ?? v}`,
      overdue: () => 'Results overdue',
    },
    columns: (sortOrderFor): ListColumn<QualityTestDto>[] => {
      const sort = (key: QualityTestSortField) => ({ key, sorter: true, sortOrder: sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });
      return [
        { title: 'Sampled', dataIndex: 'sampledOn', width: 110, render: (v) => formatDate(v), ...sort('sampledOn') },
        { title: 'No.', dataIndex: 'testNo', width: 130, className: 'mono', ...sort('testNo') },
        ...(fixedProject
          ? []
          : [{ title: 'Project', dataIndex: 'projectName', ...sort('project'), width: 180, ellipsis: true, render: (v: string, r: QualityTestDto) => <Link href={`/projects/${r.projectId}`}>{v}</Link> } satisfies ListColumn<QualityTestDto>]),
        {
          title: 'Sample',
          locked: true,
          width: 280,
          ...sort('kind'),
          render: (_, r) => (
            <div>
              <RecordLink onOpen={() => setOpenId(r.id)}>{r.title}</RecordLink>
              <Sub>{[TEST_KIND_LABELS[r.kind], r.location].filter(Boolean).join(' · ')}</Sub>
            </div>
          ),
        },
        { title: 'Passes at', key: 'spec', width: 130, render: (_, r) => specRange(r.specMin, r.specMax, r.unit) ?? <Sub>-</Sub> },
        { title: 'Readings', key: 'readings', width: 240, render: (_, r) => <ReadingsSummary t={r} /> },
        { key: 'openNcrs', title: 'NCRs', label: 'Open NCRs', dataIndex: 'openNcrs', width: 80, align: 'right', render: (v: number) => (v ? <Typography.Text type="danger">{v} open</Typography.Text> : <Sub>-</Sub>), total: (rows) => rows.reduce((n, r) => n + r.openNcrs, 0) || '-' },
        { title: 'Result', dataIndex: 'result', fixed: 'right' as const, width: 100, ...sort('result'), render: (v: TestResult) => <TestResultTag result={v} /> },
      ];
    },
  });
  const { page } = frame;
  const kind = page.filters.kind as TestKind | undefined;
  const result = page.filters.result as TestResult | undefined;
  const overdue = page.filters.overdue === '1';
  const filters = { page: page.params.page, pageSize: page.params.pageSize, q: page.params.q, sortBy: page.params.sortBy, sortOrder: page.params.sortOrder, from: page.params.from, to: page.params.to, projectId: frame.projectId, kind, result, overdue: overdue || undefined };
  const { data, isLoading, isFetching, error, refetch } = useQualityTests(filters);
  const filtered = !!(kind || result || overdue || page.params.q || page.params.from || page.params.to);

  const newButton = user && canRecordTest(user.roleKey) ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
      Record test
    </Button>
  ) : null;

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar
        projectId={frame.projectFilter}
        onProject={frame.setProjectFilter}
        hideProject={!!fixedProject}
        search={page.search}
        onSearch={page.setSearch}
        searchPlaceholder="Search no., sample, location"
        extra={newButton}
      >
        <Select<TestKind> allowClear placeholder="All tests" aria-label="Test" value={kind} onChange={(v) => page.setFilter('kind', v)} style={{ width: 200 }} options={TEST_KINDS.map((k) => ({ value: k, label: TEST_KIND_LABELS[k] }))} />
        <Select<TestResult> allowClear placeholder="Any result" aria-label="Result" value={result} onChange={(v) => page.setFilter('result', v)} style={{ width: 130 }} options={TEST_RESULTS.map((k) => ({ value: k, label: TEST_RESULT_LABELS[k] }))} />
        <Checkbox checked={overdue} onChange={(e) => page.setFilter('overdue', e.target.checked ? '1' : undefined)}>
          Results overdue
        </Checkbox>
        <DateRangeFilter {...frame.dateRange} />
      </ListToolbar>
      <DataTable<QualityTestDto>
        columns={frame.columns}
        visible={frame.choice.visible}
        onChooseColumns={frame.choice.setChosen}
        chosenIsDefault={frame.choice.isDefault}
        rows={data?.items ?? []}
        loading={isLoading || isFetching}
        table={page.tableProps<QualityTestDto>(data?.total)}
        onOpen={setOpenId}
        chips={frame.chips}
        empty={frame.empty}
        failed={!!error}
        scrollX={fixedProject ? 1100 : 1280}
        emptyText={<EmptyArt art="entries" title={filtered ? 'No test matches these filters' : 'No test recorded yet'} />}
        emptyAction={newButton}
      />
      <TestDrawer id={openId} open={!!openId} onClose={() => setOpenId(null)} onOpenNcr={onOpenNcr} />
      <TestFormModal open={formOpen} onClose={() => setFormOpen(false)} projectId={fixedProject} />
    </>
  );
}
