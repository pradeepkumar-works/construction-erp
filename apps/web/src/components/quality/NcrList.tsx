'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button, Checkbox, Select, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { NcrDto, NcrSeverity, NcrSortField, NcrStatus } from '@erp/shared';
import { NCR_SEVERITIES, NCR_SEVERITY_LABELS, NCR_STATUSES, NCR_STATUS_LABELS, canRaiseNcr } from '@erp/shared';
import { useProjectScope } from '@/lib/project-scope';
import { useAuth } from '@/lib/auth';
import { useNcrs } from '@/lib/queries';
import { useListState } from '@/lib/listState';
import { formatDate } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { NcrStatusTag, SeverityTag } from './qualityUi';
import { NcrFormModal } from './NcrFormModal';

/** Non-conformance reports, on the Quality page and a project's Quality tab. The drawer is the parent's, so tests can open NCRs too. */
export function NcrList({ projectId: fixedProject, onOpen }: { projectId?: string; onOpen: (id: string) => void }) {
  const { user } = useAuth();
  const list = useListState<NcrSortField>({ sortBy: 'raisedOn', sortOrder: 'desc' });
  const [projectFilter, setProjectFilter] = useProjectScope();
  const [status, setStatus] = useState<NcrStatus | undefined>();
  const [severity, setSeverity] = useState<NcrSeverity | undefined>();
  const [active, setActive] = useState(false);
  const [mine, setMine] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const projectId = fixedProject ?? projectFilter;
  const { data, isLoading, isFetching, error, refetch } = useNcrs({ ...list.params, projectId, status, severity, active: active || undefined, mine: mine || undefined });
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    list.resetPage();
  };
  const sort = (key: NcrSortField) => ({ key, sorter: true, sortOrder: list.sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });

  const columns: TableProps<NcrDto>['columns'] = [
    { title: 'Raised', dataIndex: 'raisedOn', width: 110, render: (v) => formatDate(v), ...sort('raisedOn') },
    { title: 'No.', dataIndex: 'ncrNo', width: 150, className: 'mono', ...sort('ncrNo') },
    ...(fixedProject
      ? []
      : [{ title: 'Project', dataIndex: 'projectName', ...sort('project'), width: 200, ellipsis: true, render: (v: string, r: NcrDto) => <Link href={`/projects/${r.projectId}`}>{v}</Link> }]),
    {
      title: 'Non-conformance',
      width: 300,
      render: (_, r) => (
        <div>
          <Typography.Link onClick={() => onOpen(r.id)}>{r.title}</Typography.Link>
          <div className="text-muted" style={{ fontSize: 12 }}>
            {[r.location, r.testNo, r.inspectionNo].filter(Boolean).join(' · ') || r.activityName}
          </div>
        </div>
      ),
    },
    { title: 'Severity', dataIndex: 'severity', width: 100, ...sort('severity'), render: (v: NcrSeverity) => <SeverityTag severity={v} /> },
    { title: 'Rectify by', dataIndex: 'dueDate', width: 120, ...sort('dueDate'), render: (v: string | null, r) => (v ? <span className={r.overdue ? 'text-danger' : undefined}>{formatDate(v)}</span> : <span className="text-muted">-</span>) },
    { title: 'Assigned to', dataIndex: 'actionByName', width: 150, render: (v: string | null) => v ?? <span className="text-muted">-</span> },
    { title: 'Status', dataIndex: 'status', fixed: 'right' as const, width: 120, ...sort('status'), render: (v: NcrStatus) => <NcrStatusTag status={v} /> },
    {
      title: '',
      key: 'actions',
      fixed: 'right' as const,
      width: 80,
      render: (_, r) => (
        <Button size="small" onClick={() => onOpen(r.id)}>
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
        searchPlaceholder="Search no., title, location"
        extra={
          user && canRaiseNcr(user.roleKey) ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
              Raise NCR
            </Button>
          ) : null
        }
      >
        <Select allowClear placeholder="All statuses" value={status} onChange={reset(setStatus)} style={{ width: 150 }} options={NCR_STATUSES.map((s) => ({ value: s, label: NCR_STATUS_LABELS[s] }))} />
        <Select allowClear placeholder="Any severity" value={severity} onChange={reset(setSeverity)} style={{ width: 140 }} options={NCR_SEVERITIES.map((s) => ({ value: s, label: NCR_SEVERITY_LABELS[s] }))} />
        <Checkbox checked={active} onChange={(e) => reset(setActive)(e.target.checked)}>
          Not closed
        </Checkbox>
        <Checkbox checked={mine} onChange={(e) => reset(setMine)(e.target.checked)}>
          Assigned to me
        </Checkbox>
      </ListToolbar>
      <Table<NcrDto>
        rowKey="id"
        loading={isLoading || isFetching}
        columns={columns}
        dataSource={data?.items ?? []}
        size="middle"
        {...list.tableProps<NcrDto>(data?.total)}
        scroll={{ x: fixedProject ? 1100 : 1300 }}
        locale={{ emptyText: 'No NCR raised' }}
      />
      <NcrFormModal open={formOpen} onClose={() => setFormOpen(false)} projectId={fixedProject} onSaved={(x) => onOpen(x.id)} />
    </>
  );
}
