'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button, Checkbox, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { TransmittalDto, TransmittalSortField } from '@erp/shared';
import { TRANSMITTAL_PURPOSE_LABELS, canManageDocuments } from '@erp/shared';
import { useProjectScope } from '@/lib/project-scope';
import { useAuth } from '@/lib/auth';
import { useTransmittals } from '@/lib/queries';
import { useListState } from '@/lib/listState';
import { formatDate } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';

/** Transmittals sent, with whether the receiver has signed for them. */
export function TransmittalList({ projectId: fixedProject, onOpen, onNew }: { projectId?: string; onOpen: (id: string) => void; onNew: () => void }) {
  const { user } = useAuth();
  const list = useListState<TransmittalSortField>({ sortBy: 'sentOn', sortOrder: 'desc' });
  const [projectFilter, setProjectFilter] = useProjectScope();
  const [unacknowledged, setUnacknowledged] = useState(false);
  const projectId = fixedProject ?? projectFilter;
  const { data, isLoading, isFetching, error, refetch } = useTransmittals({ ...list.params, projectId, unacknowledged: unacknowledged || undefined });
  const sort = (key: TransmittalSortField) => ({ key, sorter: true, sortOrder: list.sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });

  const columns: TableProps<TransmittalDto>['columns'] = [
    { title: 'Sent', dataIndex: 'sentOn', width: 110, render: (v) => formatDate(v), ...sort('sentOn') },
    { title: 'No.', dataIndex: 'transmittalNo', width: 150, className: 'mono', ...sort('transmittalNo'), render: (v: string, r) => <Typography.Link onClick={() => onOpen(r.id)}>{v}</Typography.Link> },
    ...(fixedProject
      ? []
      : [{ title: 'Project', dataIndex: 'projectName', ...sort('project'), width: 200, ellipsis: true, render: (v: string, r: TransmittalDto) => <Link href={`/projects/${r.projectId}`}>{v}</Link> }]),
    { title: 'To', dataIndex: 'toParty', width: 240, ellipsis: true, ...sort('toParty') },
    { title: 'Purpose', dataIndex: 'purpose', width: 160, render: (v: TransmittalDto['purpose']) => TRANSMITTAL_PURPOSE_LABELS[v] },
    {
      title: 'Documents',
      key: 'items',
      width: 260,
      render: (_, r) => (
        <span style={{ fontSize: 12 }}>
          {r.items
            .slice(0, 3)
            .map((i) => `${i.docNo} Rev ${i.revision}`)
            .join(', ')}
          {r.items.length > 3 ? ` +${r.items.length - 3}` : ''}
        </span>
      ),
    },
    { title: 'Acknowledged', dataIndex: 'acknowledgedOn', width: 130, render: (v: string | null) => (v ? formatDate(v) : <span className="text-danger">Not yet</span>) },
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
        onProject={(v) => {
          setProjectFilter(v);
          list.resetPage();
        }}
        hideProject={!!fixedProject}
        search={list.search}
        onSearch={list.setSearch}
        searchPlaceholder="Search no., to, document"
        extra={
          user && canManageDocuments(user.roleKey) ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={onNew}>
              New transmittal
            </Button>
          ) : null
        }
      >
        <Checkbox
          checked={unacknowledged}
          onChange={(e) => {
            setUnacknowledged(e.target.checked);
            list.resetPage();
          }}
        >
          Not acknowledged
        </Checkbox>
      </ListToolbar>
      <Table<TransmittalDto>
        rowKey="id"
        loading={isLoading || isFetching}
        columns={columns}
        dataSource={data?.items ?? []}
        size="middle"
        {...list.tableProps<TransmittalDto>(data?.total)}
        scroll={{ x: fixedProject ? 1050 : 1250 }}
        locale={{ emptyText: 'No transmittals yet' }}
      />
    </>
  );
}
