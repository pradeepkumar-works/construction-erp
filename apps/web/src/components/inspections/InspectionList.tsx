'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button, Select, Tag, theme } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { InspectionDto, InspectionSortField, SubmissionStatus } from '@erp/shared';
import { INSPECTION_STATUS_LABELS, LIST_SORT_FIELDS, canRequestInspection, checklistCounts } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useProjectScope } from '@/lib/project-scope';
import { useActivities, useInspections } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { EmptyArt } from '@/components/common/EmptyArt';
import { StatusTag } from '@/components/common/StatusTag';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { DateRangeFilter } from '@/components/list/DateRangeFilter';
import { RowActions } from '@/components/list/RowActions';
import { RecordLink } from '@/components/record/RecordLink';
import { useListFrame } from '@/components/list/useListFrame';
import { InspectionDrawer } from './InspectionDrawer';
import { InspectionFormModal } from './InspectionFormModal';

const KEYS = ['status', 'mine', 'from', 'to', 'activityId'] as const;

function Sub({ children }: { children: React.ReactNode }) {
  const { token } = theme.useToken();
  return <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{children}</div>;
}

function inspectionColumns({ showProject, onOpen, onEdit, sortOrderFor }: { showProject: boolean; onOpen: (id: string) => void; onEdit: (row: InspectionDto) => void; sortOrderFor: (key: InspectionSortField) => 'ascend' | 'descend' | null }): ListColumn<InspectionDto>[] {
  const sort = (key: InspectionSortField) => ({ key, sorter: true, sortOrder: sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });
  return [
    { title: 'Ready on', dataIndex: 'date', width: 110, render: (v) => formatDate(v), ...sort('date') },
    { title: 'No.', dataIndex: 'inspectionNo', width: 130, className: 'mono', ...sort('inspectionNo') },
    ...(showProject ? [{ title: 'Project', dataIndex: 'projectName', ...sort('project'), width: 200, ellipsis: true, render: (v: string, r: InspectionDto) => <Link href={`/projects/${r.projectId}`}>{v}</Link> }] : []),
    {
      title: 'Activity and location',
      locked: true,
      width: 280,
      ...sort('activity'),
      render: (_, r) => (
        <div>
          <RecordLink href={`/inspections/${r.id}`} onOpen={() => onOpen(r.id)}>{r.activityName}</RecordLink>
          {r.holdPoint && (
            <Tag color="orange" style={{ marginLeft: 6 }}>
              Hold point
            </Tag>
          )}
          <Sub>{r.location}</Sub>
        </div>
      ),
    },
    {
      title: 'Checklist',
      key: 'checklist',
      width: 170,
      render: (_, r) => {
        const c = checklistCounts(r.checklist);
        if (!c.total) return '-';
        return (
          <div>
            {r.checklistName ?? 'Own points'}
            <Sub>{c.open === c.total ? `${c.total} points` : `${c.pass} OK${c.fail ? `, ${c.fail} not OK` : ''}`}</Sub>
          </div>
        );
      },
    },
    { title: 'Requested by', dataIndex: 'submittedByName', width: 140, ...sort('submittedBy') },
    { title: 'Requested on', dataIndex: 'submittedAt', width: 130, defaultHidden: true, render: (v) => formatDate(v), ...sort('submittedAt') },
    { key: 'reviewedByName', title: 'Inspected by', dataIndex: 'reviewedByName', width: 140, render: (v: string | null) => v ?? '-' },
    { title: 'Status', fixed: 'right' as const, dataIndex: 'status', width: 120, ...sort('status'), render: (s: SubmissionStatus) => <StatusTag status={s} labels={INSPECTION_STATUS_LABELS} /> },
    // Passing an inspection means filling its checklist, so the row menu opens it rather than approving.
    { key: 'actions', title: '', label: 'Actions', locked: true, fixed: 'right' as const, width: 56, render: (_, r) => <RowActions type="inspection" row={r} href={`/inspections/${r.id}`} review={false} onOpen={onOpen} onEdit={onEdit} /> },
  ];
}

/** Inspection requests, on the Inspections page and as a project tab. */
export function InspectionList({ projectId: fixedProject }: { projectId?: string }) {
  const { user } = useAuth();
  const [openId, setOpenId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InspectionDto | null>(null);
  const [scope] = useProjectScope();
  const { data: activities } = useActivities(fixedProject ?? scope);
  const frame = useListFrame({
    list: 'inspections',
    type: 'INSPECTION',
    keys: KEYS,
    sortBy: 'date',
    sortOrder: 'desc',
    sortFields: LIST_SORT_FIELDS.inspections,
    fixedProject,
    columns: (sortOrderFor) => inspectionColumns({ showProject: !fixedProject, onOpen: setOpenId, onEdit: setEditing, sortOrderFor }),
    statusLabels: INSPECTION_STATUS_LABELS,
    chipLabels: { activityId: (v) => `Activity: ${activities?.find((a) => a.id === v)?.name ?? 'one activity'}` },
  });
  const { page } = frame;
  const activityId = frame.projectId ? page.filters.activityId : undefined;
  const { data, isLoading, isFetching, error, refetch } = useInspections({ ...page.params, projectId: frame.projectId, status: frame.status, activityId });

  const newButton = user && canRequestInspection(user.roleKey) ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
      Request inspection
    </Button>
  ) : null;

  return (
    <>
      {frame.views}
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar
        projectId={frame.projectFilter}
        onProject={(v) => {
          page.setFilter('activityId', undefined);
          frame.setProjectFilter(v);
        }}
        hideProject={!!fixedProject}
        status={frame.status}
        onStatus={frame.setStatus}
        statusLabels={INSPECTION_STATUS_LABELS}
        search={page.search}
        onSearch={page.setSearch}
        searchPlaceholder="Search no., location, activity"
        searchLabel="Search inspections"
        extra={newButton}
      >
        <Select
          allowClear
          showSearch={{ optionFilterProp: 'label' }}
          placeholder={frame.projectId ? 'All activities' : 'Pick a project to filter by activity'}
          aria-label="Activity"
          disabled={!frame.projectId}
          style={{ width: 240 }}
          value={activityId}
          onChange={(v) => page.setFilter('activityId', v)}
          options={(activities ?? []).map((a) => ({ value: a.id, label: a.name }))}
        />
        <DateRangeFilter {...frame.dateRange} />
      </ListToolbar>
      <DataTable<InspectionDto>
        columns={frame.columns}
        visible={frame.choice.visible}
        onChooseColumns={frame.choice.setChosen}
        chosenIsDefault={frame.choice.isDefault}
        rows={data?.items ?? []}
        loading={isLoading || isFetching}
        table={page.tableProps<InspectionDto>(data?.total)}
        onOpen={setOpenId}
        chips={frame.chips}
        empty={frame.empty}
        failed={!!error}
        scrollX={fixedProject ? 1250 : 1450}
        emptyText={<EmptyArt art="entries" title="No inspection requested yet" />}
        emptyAction={newButton}
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
