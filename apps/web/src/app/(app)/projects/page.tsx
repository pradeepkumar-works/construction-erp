'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card, Progress, Select, Table, Badge } from 'antd';
import type { TableProps } from 'antd';
import type { ColumnType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import type { ProjectSortField, ProjectStatus, ProjectSummary, ProjectType } from '@erp/shared';
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS, PROJECT_TYPES, PROJECT_TYPE_LABELS, canEditProjects } from '@erp/shared';
import { useProjectsPage } from '@/lib/queries';
import { useListState } from '@/lib/listState';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { PROJECT_EXPORT } from '@/lib/exportColumns';
import { ExportButton } from '@/components/common/ExportButton';
import { SearchBox } from '@/components/common/SearchBox';
import { useAuth } from '@/lib/auth';
import { formatDate, formatINR, progressStatus } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryError } from '@/components/common/QueryState';
import { ProjectStatusTag, ProjectTypeTag } from '@/components/common/StatusTag';
import { ProjectFormModal } from '@/components/projects/ProjectFormModal';
import { BRAND } from '@/lib/brand';

export default function ProjectsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const list = useListState<ProjectSortField>({ sortBy: 'status', sortOrder: 'asc', pageSize: 25 });
  const [type, setType] = useState<ProjectType | undefined>();
  const [status, setStatus] = useState<ProjectStatus | undefined>();
  const filters = { ...list.params, type, status };
  const { data, isLoading, isFetching, error, refetch } = useProjectsPage(filters);
  const [createOpen, setCreateOpen] = useState(false);

  const canCreate = user && canEditProjects(user.roleKey) && user.roleKey !== 'QUANTITY_SURVEYOR';
  const sort = (key: ProjectSortField): Pick<ColumnType<ProjectSummary>, 'key' | 'sorter' | 'sortOrder'> => ({ key, sorter: true, sortOrder: list.sortOrderFor(key) });
  const exportRows = async () => {
    const rows = await fetchAllPages<ProjectSummary>('/projects', filters);
    downloadXlsx(exportFileName('projects'), 'Projects', PROJECT_EXPORT, rows);
    return rows.length;
  };

  const columns: TableProps<ProjectSummary>['columns'] = [
    {
      title: 'Project',
      ...sort('name'),
      width: 320,
      render: (_, p) => (
        <div>
          <Link href={`/projects/${p.id}`} className="link-strong">
            {p.name}
          </Link>
          <div className="text-muted" style={{ fontSize: 12 }}>
            {[p.code, p.clientName, p.location].filter(Boolean).join(' · ')}
          </div>
        </div>
      ),
    },
    { title: 'Type', dataIndex: 'type', width: 150, render: (t) => <ProjectTypeTag type={t} />, ...sort('type') },
    { title: 'Status', dataIndex: 'status', width: 110, render: (s) => <ProjectStatusTag status={s} />, ...sort('status') },
    { title: 'PM', dataIndex: 'projectManagerName', width: 140, render: (v) => v ?? <span className="text-muted">Unassigned</span> },
    { title: 'Contract Value', dataIndex: 'contractValue', width: 150, align: 'right', className: 'mono', render: (v) => (v ? formatINR(v) : '-'), ...sort('contractValue') },
    { title: 'Progress', dataIndex: 'physicalProgressPct', width: 160, render: (v: number) => <Progress percent={Math.round(v * 10) / 10} size="small" status={progressStatus(v)} /> },
    { title: 'End Date', dataIndex: 'endDate', width: 120, render: (v) => formatDate(v), ...sort('endDate') },
    { title: 'Pending', dataIndex: 'pendingApprovals', width: 80, align: 'center', fixed: 'right', render: (v: number) => (v > 0 ? <Badge count={v} color={BRAND.colors.pending} /> : <span className="text-muted">0</span>) },
  ];

  return (
    <div className="page-container">
      <PageHeader
        title="Projects"
        subtitle={`${data?.total ?? 0} project${data?.total === 1 ? '' : 's'} ${type || status || list.params.q ? 'match' : 'in your scope'}`}
        extra={
          canCreate ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              New project
            </Button>
          ) : undefined
        }
      />
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <Card className="table-card" size="small">
        <div style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid #f0f0f0' }}>
          <SearchBox value={list.search} onChange={list.setSearch} placeholder="Search by name, code, client, location" width={320} />
          <Select allowClear placeholder="All types" value={type} onChange={(v) => { setType(v); list.resetPage(); }} style={{ width: 180 }} options={PROJECT_TYPES.map((t) => ({ value: t, label: PROJECT_TYPE_LABELS[t] }))} />
          <Select allowClear placeholder="All statuses" value={status} onChange={(v) => { setStatus(v); list.resetPage(); }} style={{ width: 160 }} options={PROJECT_STATUSES.map((s) => ({ value: s, label: PROJECT_STATUS_LABELS[s] }))} />
          <div style={{ marginLeft: 'auto' }}>
            <ExportButton onExport={exportRows} />
          </div>
        </div>
        <Table<ProjectSummary>
          rowKey="id"
          loading={isLoading || isFetching}
          columns={columns}
          dataSource={data?.items ?? []}
          size="middle"
          {...list.tableProps<ProjectSummary>(data?.total)}
          scroll={{ x: 1150 }}
          onRow={(p) => ({ onClick: (e) => { if ((e.target as HTMLElement).closest('a')) return; router.push(`/projects/${p.id}`); }, style: { cursor: 'pointer' } })}
        />
      </Card>
      <ProjectFormModal open={createOpen} onClose={() => setCreateOpen(false)} onSaved={(id) => router.push(`/projects/${id}`)} />
    </div>
  );
}
