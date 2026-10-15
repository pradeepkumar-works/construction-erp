'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button, DatePicker, Select, Table, Tag, Typography } from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import type { InspectionDto, InspectionSortField, SubmissionStatus } from '@erp/shared';
import { INSPECTION_STATUS_LABELS, canRequestInspection, checklistCounts } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useActivities, useInspections } from '@/lib/queries';
import { useListState } from '@/lib/listState';
import { formatDate } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { StatusTag } from '@/components/common/StatusTag';
import { EditResubmitButton } from '@/components/common/EditResubmitButton';
import { InspectionDrawer } from './InspectionDrawer';
import { InspectionFormModal } from './InspectionFormModal';
import { rangePresets } from '@/lib/dates';

/** Inspection requests, on the Inspections page and as a project tab. */
export function InspectionList({ projectId: fixedProject }: { projectId?: string }) {
  const { user } = useAuth();
  const list = useListState<InspectionSortField>({ sortBy: 'date', sortOrder: 'desc' });
  const [projectFilter, setProjectFilter] = useState<string | undefined>();
  const [status, setStatus] = useState<SubmissionStatus | undefined>();
  const [activityId, setActivityId] = useState<string | undefined>();
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InspectionDto | null>(null);
  const projectId = fixedProject ?? projectFilter;
  const { data: activities } = useActivities(projectId);
  const { data, isLoading, isFetching, error, refetch } = useInspections({
    ...list.params,
    projectId,
    status,
    activityId: projectId ? activityId : undefined,
    from: range?.[0]?.format('YYYY-MM-DD'),
    to: range?.[1]?.format('YYYY-MM-DD'),
  });
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    list.resetPage();
  };
  const sort = (key: InspectionSortField) => ({ key, sorter: true, sortOrder: list.sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });

  const columns: TableProps<InspectionDto>['columns'] = [
    { title: 'Ready on', dataIndex: 'date', width: 110, render: (v) => formatDate(v), ...sort('date') },
    { title: 'No.', dataIndex: 'inspectionNo', width: 130, className: 'mono', ...sort('inspectionNo') },
    ...(fixedProject
      ? []
      : [{ title: 'Project', dataIndex: 'projectName', ...sort('project'), width: 200, ellipsis: true, render: (v: string, r: InspectionDto) => <Link href={`/projects/${r.projectId}`}>{v}</Link> }]),
    {
      title: 'Activity and location',
      width: 280,
      ...sort('activity'),
      render: (_, r) => (
        <div>
          <Typography.Link onClick={() => setOpenId(r.id)}>{r.activityName}</Typography.Link>
          {r.holdPoint && (
            <Tag color="orange" style={{ marginLeft: 6 }}>
              Hold point
            </Tag>
          )}
          <div className="text-muted" style={{ fontSize: 12 }}>
            {r.location}
          </div>
        </div>
      ),
    },
    {
      title: 'Checklist',
      key: 'checklist',
      width: 170,
      render: (_, r) => {
        const c = checklistCounts(r.checklist);
        if (!c.total) return <span className="text-muted">-</span>;
        return (
          <div style={{ fontSize: 12 }}>
            {r.checklistName ?? 'Own points'}
            <div className="text-muted">{c.open === c.total ? `${c.total} points` : `${c.pass} OK${c.fail ? `, ${c.fail} not OK` : ''}`}</div>
          </div>
        );
      },
    },
    { title: 'Requested by', dataIndex: 'submittedByName', width: 140, ...sort('submittedBy') },
    { title: 'Inspected by', dataIndex: 'reviewedByName', width: 140, render: (v: string | null) => v ?? <span className="text-muted">-</span> },
    { title: 'Status', fixed: 'right' as const, dataIndex: 'status', width: 120, ...sort('status'), render: (s: SubmissionStatus) => <StatusTag status={s} labels={INSPECTION_STATUS_LABELS} /> },
    {
      title: '',
      key: 'actions',
      fixed: 'right' as const,
      width: 120,
      render: (_, r) => (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button size="small" onClick={() => setOpenId(r.id)}>
            {r.status === 'SUBMITTED' ? 'Open' : 'View'}
          </Button>
          <EditResubmitButton entry={r} onEdit={setEditing} size="small" compact />
        </div>
      ),
    },
  ];

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar
        projectId={projectFilter}
        onProject={(v) => {
          setActivityId(undefined);
          reset(setProjectFilter)(v);
        }}
        hideProject={!!fixedProject}
        status={status}
        onStatus={reset(setStatus)}
        statusLabels={INSPECTION_STATUS_LABELS}
        search={list.search}
        onSearch={list.setSearch}
        searchPlaceholder="Search no., location, activity"
        extra={
          user && canRequestInspection(user.roleKey) ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
              Request inspection
            </Button>
          ) : null
        }
      >
        <Select
          allowClear
          showSearch={{ optionFilterProp: 'label' }}
          placeholder={projectId ? 'All activities' : 'Pick a project to filter by activity'}
          disabled={!projectId}
          style={{ width: 240 }}
          value={activityId}
          onChange={reset(setActivityId)}
          options={(activities ?? []).map((a) => ({ value: a.id, label: a.name }))}
        />
        <DatePicker.RangePicker presets={rangePresets()} value={range} onChange={(v) => reset(setRange)(v as [Dayjs | null, Dayjs | null] | null)} format="DD MMM YYYY" allowEmpty={[true, true]} />
      </ListToolbar>
      <Table<InspectionDto>
        rowKey="id"
        loading={isLoading || isFetching}
        columns={columns}
        dataSource={data?.items ?? []}
        size="middle"
        {...list.tableProps<InspectionDto>(data?.total)}
        scroll={{ x: fixedProject ? 1300 : 1500 }}
        locale={{ emptyText: 'No inspection requested yet' }}
      />
      <InspectionDrawer id={openId} open={!!openId} onClose={() => setOpenId(null)} onEdit={setEditing} />
      <InspectionFormModal
        open={formOpen || !!editing}
        inspection={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        projectId={fixedProject}
      />
    </>
  );
}
