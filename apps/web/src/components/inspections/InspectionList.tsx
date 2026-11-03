'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button, Select } from 'antd';
import { tk } from '@/ds';
import { AppTag } from '@/components/common/AppTag';
import { PlusOutlined } from '@/components/common/icons';
import type { InspectionDto, InspectionSortField, SubmissionStatus } from '@erp/shared';
import { INSPECTION_STATUS_LABELS, LIST_SORT_FIELDS, canRequestInspection, checklistCounts } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useProjectScope } from '@/lib/project-scope';
import { useActivities, useInspections } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { downloadXlsx, exportFileName, fetchAllPages, type ExportColumn } from '@/lib/exportExcel';
import { EmptyArt } from '@/components/common/EmptyArt';
import { StatusTag } from '@/components/common/StatusTag';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { DateRangeFilter } from '@/components/list/DateRangeFilter';
import { RowActions } from '@/components/list/RowActions';
import { RecordLink } from '@/components/record/RecordLink';
import { useListFrame } from '@/components/list/useListFrame';
import { InspectionDrawer } from './InspectionDrawer';
import { InspectionFormModal } from './InspectionFormModal';
import { useNewIntent } from '@/lib/new-intent';

const KEYS = ['status', 'mine', 'from', 'to', 'activityId'] as const;

function Sub({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: tk.type.caption.fontSize, color: tk.color.text.muted }}>{children}</div>;
}

function inspectionColumns({ showProject, onOpen, onEdit, sortOrderFor }: { showProject: boolean; onOpen: (id: string) => void; onEdit: (row: InspectionDto) => void; sortOrderFor: (key: InspectionSortField) => 'ascend' | 'descend' | null }): ListColumn<InspectionDto>[] {
  const sort = (key: InspectionSortField) => ({ key, sorter: true, sortOrder: sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });
  return [
    { card: 'date', title: 'Ready on', dataIndex: 'date', width: 110, render: (v) => formatDate(v), ...sort('date') },
    { card: 'meta', title: 'No.', dataIndex: 'inspectionNo', width: 140, className: 'mono', ...sort('inspectionNo') },
    ...(showProject ? [{ card: 'meta' as const, cardText: (r: InspectionDto) => r.projectName, title: 'Project', dataIndex: 'projectName', ...sort('project'), width: 200, ellipsis: true, render: (v: string, r: InspectionDto) => <Link href={`/projects/${r.projectId}`}>{v}</Link> }] : []),
    {
      card: 'title',
      cardText: (r) => [r.activityName, r.location].filter(Boolean).join(', '),
      title: 'Activity and location',
      locked: true,
      width: 280,
      ...sort('activity'),
      render: (_, r) => (
        <div>
          <RecordLink href={`/inspections/${r.id}`} onOpen={() => onOpen(r.id)}>{r.activityName}</RecordLink>
          {r.holdPoint && (
            <AppTag meaning="waiting" style={{ marginInlineStart: tk.space[2] }}>
              Hold point
            </AppTag>
          )}
          <Sub>{r.location}</Sub>
        </div>
      ),
    },
    {
      title: 'Checklist',
      defaultFrom: 1400,
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
    { title: 'Requested by', dataIndex: 'submittedByName', width: 140, defaultFrom: 1600, ...sort('submittedBy') },
    { title: 'Requested on', dataIndex: 'submittedAt', width: 130, defaultHidden: true, render: (v) => formatDate(v), ...sort('submittedAt') },
    { key: 'reviewedByName', title: 'Inspected by', dataIndex: 'reviewedByName', width: 140, defaultFrom: 1600, render: (v: string | null) => v ?? '-' },
    { card: 'status', title: 'Status', fixed: 'right' as const, dataIndex: 'status', width: 120, ...sort('status'), render: (s: SubmissionStatus) => <StatusTag status={s} labels={INSPECTION_STATUS_LABELS} /> },
    // Passing an inspection means filling its checklist, so the row menu opens it rather than approving.
    { key: 'actions', title: '', label: 'Actions', locked: true, fixed: 'right' as const, width: 56, render: (_, r) => <RowActions type="inspection" row={r} href={`/inspections/${r.id}`} review={false} onOpen={onOpen} onEdit={onEdit} /> },
  ];
}

/** Inspection requests, on the Inspections page and as a project tab. */
/** The inspection register: each request, the work it covers and how it stands. */
const EXPORT: ExportColumn<InspectionDto>[] = [
  { header: 'Inspection', value: (i) => i.inspectionNo, width: 16 },
  { header: 'Project', value: (i) => i.projectName, width: 26 },
  { header: 'Ready on', value: (i) => i.date, width: 12 },
  { header: 'Activity', value: (i) => i.activityName, width: 30 },
  { header: 'Location', value: (i) => i.location, width: 26 },
  { header: 'Hold point', value: (i) => (i.holdPoint ? 'Yes' : ''), width: 10 },
  { header: 'Hidden work', value: (i) => (i.hiddenWork ? 'Yes' : ''), width: 10 },
  { header: 'Checklist', value: (i) => i.checklistName, width: 24 },
  { header: 'Checks passed', value: (i) => { const c = checklistCounts(i.checklist); return c.total ? `${c.pass} of ${c.total}` : ''; }, width: 12 },
  { header: 'Status', value: (i) => INSPECTION_STATUS_LABELS[i.status], width: 16 },
  { header: 'Requested by', value: (i) => i.submittedByName, width: 20 },
  { header: 'Reviewed by', value: (i) => i.reviewedByName, width: 20 },
  { header: 'Remarks', value: (i) => i.remarks, width: 30 },
];

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

  useNewIntent('inspection', !!user && canRequestInspection(user.roleKey), () => setFormOpen(true));

  const newButton = user && canRequestInspection(user.roleKey) ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
      Request inspection
    </Button>
  ) : null;

  return (
    <>
      {frame.views}
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar filters={frame.filterState}
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
        extra={
          <>
            <ExportButton
              onExport={async () => {
                const rows = await fetchAllPages<InspectionDto>('/inspections', { ...page.params, page: undefined, pageSize: undefined, projectId: frame.projectId, status: frame.status, activityId });
                await downloadXlsx(exportFileName('inspections'), 'Inspections', EXPORT, rows);
                return rows.length;
              }}
            />
            {newButton}
          </>
        }
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
