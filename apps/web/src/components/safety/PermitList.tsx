'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button, Segmented, Select, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { WorkPermitDto, WorkPermitStatus, WorkPermitType } from '@erp/shared';
import { WORK_PERMIT_STATUS_LABELS, WORK_PERMIT_TYPES, WORK_PERMIT_TYPE_LABELS, canReportSafety } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useWorkPermits } from '@/lib/queries';
import { useListState } from '@/lib/listState';
import { downloadXlsx, exportFileName, fetchAllPages, type ExportColumn } from '@/lib/exportExcel';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { PermitDrawer } from './PermitDrawer';
import { PermitFormModal } from './PermitFormModal';
import { PermitStatusTag, permitTypeLabel, permitWindow } from './safetyUi';

const EXPORT: ExportColumn<WorkPermitDto>[] = [
  { header: 'No.', value: (r) => r.permitNo, width: 15 },
  { header: 'Project', value: (r) => r.projectName, width: 30 },
  { header: 'Work', value: (r) => WORK_PERMIT_TYPE_LABELS[r.type], width: 22 },
  { header: 'Where', value: (r) => r.location, width: 28 },
  { header: 'The work', value: (r) => r.description, width: 40 },
  { header: 'Valid', value: (r) => permitWindow(r), width: 30 },
  { header: 'Contractor', value: (r) => r.contractor ?? '', width: 22 },
  { header: 'Workers', value: (r) => r.workerCount ?? '', width: 9 },
  { header: 'Precautions', value: (r) => r.precautions.join('; '), width: 50 },
  { header: 'Status', value: (r) => (r.expired ? 'Expired' : WORK_PERMIT_STATUS_LABELS[r.status]), width: 11 },
  { header: 'Asked by', value: (r) => r.requestedByName, width: 20 },
  { header: 'Issued by', value: (r) => r.issuedByName ?? '', width: 20 },
];

type View = 'ACTIVE' | WorkPermitStatus | 'ALL';

/** Permits to work: what is waiting to be issued, live at site, and the record of past ones. */
export function PermitList({ projectId: fixedProject, initialOpenId }: { projectId?: string; initialOpenId?: string }) {
  const { user } = useAuth();
  const list = useListState<'date'>({ sortBy: 'date', sortOrder: 'desc' });
  const [projectFilter, setProjectFilter] = useState<string | undefined>();
  const [view, setView] = useState<View>('ACTIVE');
  const [type, setType] = useState<WorkPermitType | undefined>();
  const [openId, setOpenId] = useState<string | null>(initialOpenId ?? null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WorkPermitDto | null>(null);
  const projectId = fixedProject ?? projectFilter;
  const { sortBy: _sortBy, ...paging } = list.params;
  const filters = { ...paging, projectId, type, active: view === 'ACTIVE' || undefined, status: view === 'ACTIVE' || view === 'ALL' ? undefined : view };
  const { data, isLoading, isFetching, error, refetch } = useWorkPermits(filters);
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    list.resetPage();
  };

  const columns: TableProps<WorkPermitDto>['columns'] = [
    { title: 'No.', dataIndex: 'permitNo', width: 135, className: 'mono' },
    ...(fixedProject ? [] : [{ title: 'Project', dataIndex: 'projectName', width: 200, ellipsis: true, render: (v: string, r: WorkPermitDto) => <Link href={`/projects/${r.projectId}?tab=safety`}>{v}</Link> }]),
    {
      title: 'Work',
      dataIndex: 'type',
      render: (t, r) => (
        <div>
          <Typography.Link onClick={() => setOpenId(r.id)}>{permitTypeLabel(t)}</Typography.Link>
          <div className="text-muted" style={{ fontSize: 12 }}>
            {r.location}: {r.description}
          </div>
        </div>
      ),
    },
    { title: 'Valid', key: 'valid', width: 230, render: (_, r) => permitWindow(r) },
    { title: 'Asked by', dataIndex: 'requestedByName', width: 150 },
    { title: 'Status', dataIndex: 'status', width: 100, fixed: 'right' as const, render: (_, r) => <PermitStatusTag p={r} /> },
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
        searchPlaceholder="Search no., place, work"
        extra={
          <>
            <ExportButton
              onExport={async () => {
                const rows = await fetchAllPages<WorkPermitDto>('/safety/permits', filters);
                downloadXlsx(exportFileName('permits-to-work'), 'permits', EXPORT, rows);
                return rows.length;
              }}
            />
            {user && canReportSafety(user.roleKey) ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
                Ask for permit
              </Button>
            ) : null}
          </>
        }
      >
        <Segmented
          value={view}
          onChange={(v) => reset(setView)(v as View)}
          options={[
            { value: 'ACTIVE', label: 'Waiting + live' },
            { value: 'REQUESTED', label: 'Waiting' },
            { value: 'ISSUED', label: 'Issued' },
            { value: 'CLOSED', label: 'Closed' },
            { value: 'ALL', label: 'All' },
          ]}
        />
        <Select allowClear placeholder="All kinds of work" style={{ width: 200 }} value={type} onChange={reset(setType)} options={WORK_PERMIT_TYPES.map((t) => ({ value: t, label: WORK_PERMIT_TYPE_LABELS[t] }))} />
      </ListToolbar>
      <Table<WorkPermitDto>
        rowKey="id"
        className="permit-list"
        size="middle"
        loading={isLoading || isFetching}
        columns={columns}
        dataSource={data?.items ?? []}
        {...list.tableProps<WorkPermitDto>(data?.total)}
        onRow={(r) => ({ onClick: () => setOpenId(r.id), style: { cursor: 'pointer' } })}
        scroll={{ x: fixedProject ? 900 : 1100 }}
        locale={{ emptyText: view === 'ACTIVE' ? 'No permits waiting or live' : 'No permits' }}
      />
      <PermitDrawer id={openId} open={!!openId} onClose={() => setOpenId(null)} onEdit={setEditing} />
      <PermitFormModal
        open={formOpen || !!editing}
        permit={editing}
        projectId={fixedProject}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
      />
    </>
  );
}
