'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button, Checkbox, Select, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { LetterDirection, LetterDto, LetterSortField } from '@erp/shared';
import { LETTER_DIRECTIONS, LETTER_DIRECTION_LABELS } from '@erp/shared';
import { useProjectScope } from '@/lib/project-scope';
import { useLetters } from '@/lib/queries';
import { useListState } from '@/lib/listState';
import { formatDate } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { DirectionTag } from './LetterDrawer';

/** Letters in and out, numbered IN- and OUT-, with replies due. */
export function LetterList({ projectId: fixedProject, onOpen, onNew }: { projectId?: string; onOpen: (id: string) => void; onNew: () => void }) {
  const list = useListState<LetterSortField>({ sortBy: 'letterDate', sortOrder: 'desc' });
  const [projectFilter, setProjectFilter] = useProjectScope();
  const [direction, setDirection] = useState<LetterDirection | undefined>();
  const [awaiting, setAwaiting] = useState(false);
  const projectId = fixedProject ?? projectFilter;
  const { data, isLoading, isFetching, error, refetch } = useLetters({ ...list.params, projectId, direction, awaitingReply: awaiting || undefined });
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    list.resetPage();
  };
  const sort = (key: LetterSortField) => ({ key, sorter: true, sortOrder: list.sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });

  const columns: TableProps<LetterDto>['columns'] = [
    { title: 'Dated', dataIndex: 'letterDate', width: 110, render: (v) => formatDate(v), ...sort('letterDate') },
    { title: 'No.', dataIndex: 'letterNo', width: 140, className: 'mono', ...sort('letterNo') },
    { title: '', dataIndex: 'direction', width: 90, render: (v: LetterDirection) => <DirectionTag direction={v} /> },
    ...(fixedProject
      ? []
      : [{ title: 'Project', dataIndex: 'projectName', ...sort('project'), width: 200, ellipsis: true, render: (v: string, r: LetterDto) => <Link href={`/projects/${r.projectId}`}>{v}</Link> }]),
    {
      title: 'Subject',
      width: 320,
      render: (_, r) => (
        <div>
          <Typography.Link onClick={() => onOpen(r.id)}>{r.subject}</Typography.Link>
          <div className="text-muted" style={{ fontSize: 12 }}>
            {[r.direction === 'IN' ? `From ${r.party}` : `To ${r.party}`, r.theirRef, r.riskNo].filter(Boolean).join(' · ')}
          </div>
        </div>
      ),
    },
    {
      title: 'Reply by',
      dataIndex: 'replyBy',
      width: 150,
      ...sort('replyBy'),
      render: (v: string | null, r) =>
        v ? <span className={r.overdue ? 'text-danger' : r.awaitingReply ? undefined : 'text-muted'}>{formatDate(v)}{r.awaitingReply ? '' : ' (replied)'}</span> : <span className="text-muted">-</span>,
    },
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
        searchPlaceholder="Search no., reference, subject"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={onNew}>
            Record letter
          </Button>
        }
      >
        <Select allowClear placeholder="In and out" value={direction} onChange={reset(setDirection)} style={{ width: 130 }} options={LETTER_DIRECTIONS.map((d) => ({ value: d, label: LETTER_DIRECTION_LABELS[d] }))} />
        <Checkbox checked={awaiting} onChange={(e) => reset(setAwaiting)(e.target.checked)}>
          Reply due
        </Checkbox>
      </ListToolbar>
      <Table<LetterDto>
        rowKey="id"
        loading={isLoading || isFetching}
        columns={columns}
        dataSource={data?.items ?? []}
        size="middle"
        {...list.tableProps<LetterDto>(data?.total)}
        scroll={{ x: fixedProject ? 1000 : 1220 }}
        locale={{ emptyText: 'No letters recorded' }}
      />
    </>
  );
}
