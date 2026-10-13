'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card, Input, Progress, Select, Table, Badge } from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ProjectStatus, ProjectSummary, ProjectType } from '@erp/shared';
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS, PROJECT_TYPES, PROJECT_TYPE_LABELS, canEditProjects } from '@erp/shared';
import { useProjects } from '@/lib/queries';
import { useAuth } from '@/lib/auth';
import { formatDate, formatINR, progressStatus } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryError } from '@/components/common/QueryState';
import { ProjectStatusTag, ProjectTypeTag } from '@/components/common/StatusTag';
import { ProjectFormModal } from '@/components/projects/ProjectFormModal';

export default function ProjectsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { data, isLoading, error, refetch } = useProjects();
  const [search, setSearch] = useState('');
  const [type, setType] = useState<ProjectType | undefined>();
  const [status, setStatus] = useState<ProjectStatus | undefined>();
  const [createOpen, setCreateOpen] = useState(false);

  const canCreate = user && canEditProjects(user.roleKey) && user.roleKey !== 'QUANTITY_SURVEYOR';

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter(
      (p) =>
        (!type || p.type === type) &&
        (!status || p.status === status) &&
        (!q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || (p.clientName ?? '').toLowerCase().includes(q) || (p.location ?? '').toLowerCase().includes(q)),
    );
  }, [data, search, type, status]);

  const columns: TableProps<ProjectSummary>['columns'] = [
    {
      title: 'Project',
      key: 'name',
      width: 320,
      render: (_, p) => (
        <div>
          <Link href={`/projects/${p.id}`} style={{ color: '#1659a8', fontWeight: 600 }}>
            {p.name}
          </Link>
          <div className="text-muted" style={{ fontSize: 12 }}>
            {[p.code, p.clientName, p.location].filter(Boolean).join(' · ')}
          </div>
        </div>
      ),
    },
    { title: 'Type', dataIndex: 'type', width: 150, render: (t) => <ProjectTypeTag type={t} /> },
    { title: 'Status', dataIndex: 'status', width: 100, render: (s) => <ProjectStatusTag status={s} /> },
    { title: 'PM', dataIndex: 'projectManagerName', width: 140, render: (v) => v ?? <span className="text-muted">Unassigned</span> },
    { title: 'Contract Value', dataIndex: 'contractValue', width: 150, align: 'right', className: 'mono', render: (v) => (v ? formatINR(v) : '-') },
    { title: 'Progress', dataIndex: 'physicalProgressPct', width: 160, render: (v: number) => <Progress percent={Math.round(v * 10) / 10} size="small" status={progressStatus(v)} /> },
    { title: 'End Date', dataIndex: 'endDate', width: 110, render: (v) => formatDate(v) },
    { title: 'Pending', dataIndex: 'pendingApprovals', width: 80, align: 'center', render: (v: number) => (v > 0 ? <Badge count={v} color="gold" /> : <span className="text-muted">0</span>) },
  ];

  return (
    <div className="page-container">
      <PageHeader
        title="Projects"
        subtitle={`${data?.length ?? 0} project${data?.length === 1 ? '' : 's'} in your scope`}
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
          <Input.Search placeholder="Search by name, code, client, location" allowClear value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 320, maxWidth: '100%' }} />
          <Select allowClear placeholder="All types" value={type} onChange={setType} style={{ width: 180 }} options={PROJECT_TYPES.map((t) => ({ value: t, label: PROJECT_TYPE_LABELS[t] }))} />
          <Select allowClear placeholder="All statuses" value={status} onChange={setStatus} style={{ width: 160 }} options={PROJECT_STATUSES.map((s) => ({ value: s, label: PROJECT_STATUS_LABELS[s] }))} />
        </div>
        <Table<ProjectSummary>
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={filtered}
          size="middle"
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          scroll={{ x: 1150 }}
          onRow={(p) => ({ onClick: (e) => { if ((e.target as HTMLElement).closest('a')) return; router.push(`/projects/${p.id}`); }, style: { cursor: 'pointer' } })}
        />
      </Card>
      <ProjectFormModal open={createOpen} onClose={() => setCreateOpen(false)} onSaved={(id) => router.push(`/projects/${id}`)} />
    </div>
  );
}
