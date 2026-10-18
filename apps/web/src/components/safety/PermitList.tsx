'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button, Segmented, Select, theme } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { WorkPermitDto, WorkPermitStatus, WorkPermitType } from '@erp/shared';
import { WORK_PERMIT_STATUS_LABELS, WORK_PERMIT_TYPES, WORK_PERMIT_TYPE_LABELS, canReportSafety } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useWorkPermits } from '@/lib/queries';
import { downloadXlsx, exportFileName, fetchAllPages, type ExportColumn } from '@/lib/exportExcel';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { exportSelected } from '@/components/list/bulk';
import { useListFrame } from '@/components/list/useListFrame';
import { RecordLink } from '@/components/record/RecordLink';
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
const KEYS = ['view', 'type'] as const;
const VIEWS: View[] = ['ACTIVE', 'REQUESTED', 'ISSUED', 'CLOSED', 'ALL'];
const VIEW_LABELS: Record<string, string> = { ACTIVE: 'Waiting + live', REQUESTED: 'Waiting', ISSUED: 'Issued', CLOSED: 'Closed', ALL: 'All' };

function Sub({ children }: { children: React.ReactNode }) {
  const { token } = theme.useToken();
  return <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{children}</div>;
}

/** Permits to work: what is waiting to be issued, live at site, and the record of past ones. */
export function PermitList({ projectId: fixedProject, initialOpenId }: { projectId?: string; initialOpenId?: string }) {
  const { user } = useAuth();
  const [openId, setOpenId] = useState<string | null>(initialOpenId ?? null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WorkPermitDto | null>(null);
  const frame = useListFrame<'date', WorkPermitDto>({
    list: 'work-permits',
    url: false,
    keys: KEYS,
    sortBy: 'date',
    sortOrder: 'desc',
    sortFields: ['date'],
    fixedProject,
    // Waiting + live is the default, so only the other choices get a chip.
    chipLabels: { view: (v) => `Permits: ${VIEW_LABELS[v] ?? v}`, type: (v) => `Work: ${WORK_PERMIT_TYPE_LABELS[v as WorkPermitType] ?? v}` },
    columns: (): ListColumn<WorkPermitDto>[] => [
      { key: 'permitNo', title: 'No.', dataIndex: 'permitNo', width: 135, className: 'mono' },
      ...(fixedProject
        ? []
        : [{ key: 'projectName', title: 'Project', dataIndex: 'projectName', width: 200, ellipsis: true, render: (v: string, r: WorkPermitDto) => <Link href={`/projects/${r.projectId}?tab=safety`}>{v}</Link> } satisfies ListColumn<WorkPermitDto>]),
      {
        key: 'type',
        title: 'Work',
        dataIndex: 'type',
        locked: true,
        render: (t, r) => (
          <div>
            <RecordLink onOpen={() => setOpenId(r.id)}>{permitTypeLabel(t)}</RecordLink>
            <Sub>
              {r.location}: {r.description}
            </Sub>
          </div>
        ),
      },
      { title: 'Valid', key: 'valid', width: 230, render: (_, r) => permitWindow(r) },
      { key: 'contractor', title: 'Contractor', dataIndex: 'contractor', width: 160, defaultHidden: true, render: (v: string | null) => v ?? <Sub>-</Sub> },
      { key: 'workerCount', title: 'Workers', dataIndex: 'workerCount', width: 90, align: 'right', defaultHidden: true, render: (v: number | null) => v ?? <Sub>-</Sub>, total: (rows) => rows.reduce((n, r) => n + (r.workerCount ?? 0), 0) },
      { key: 'requestedByName', title: 'Asked by', dataIndex: 'requestedByName', width: 150 },
      { key: 'issuedByName', title: 'Issued by', dataIndex: 'issuedByName', width: 150, defaultHidden: true, render: (v: string | null) => v ?? <Sub>-</Sub> },
      { key: 'status', title: 'Status', dataIndex: 'status', width: 100, fixed: 'right' as const, render: (_, r) => <PermitStatusTag p={r} /> },
    ],
  });
  const { page } = frame;
  const view = (page.filters.view as View | undefined) ?? 'ACTIVE';
  const type = page.filters.type as WorkPermitType | undefined;
  const filters = { page: page.params.page, pageSize: page.params.pageSize, q: page.params.q, sortOrder: page.params.sortOrder, projectId: frame.projectId, type, active: view === 'ACTIVE' || undefined, status: view === 'ACTIVE' || view === 'ALL' ? undefined : view };
  const { data, isLoading, isFetching, error, refetch } = useWorkPermits(filters);

  const newButton = user && canReportSafety(user.roleKey) ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
      Ask for permit
    </Button>
  ) : null;

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar filters={frame.filterState}
        projectId={frame.projectFilter}
        onProject={frame.setProjectFilter}
        hideProject={!!fixedProject}
        search={page.search}
        onSearch={page.setSearch}
        searchPlaceholder="Search no., place, work"
        searchLabel="Search permits"
        extra={
          <>
            <ExportButton
              onExport={async () => {
                const rows = await fetchAllPages<WorkPermitDto>('/safety/permits', filters);
                await downloadXlsx(exportFileName('permits-to-work'), 'permits', EXPORT, rows);
                return rows.length;
              }}
            />
            {newButton}
          </>
        }
      >
        <Segmented<View> value={view} onChange={(v) => page.setFilter('view', v === 'ACTIVE' ? undefined : v)} options={VIEWS.map((v) => ({ value: v, label: VIEW_LABELS[v] }))} />
        <Select<WorkPermitType> allowClear placeholder="All kinds of work" aria-label="Work" style={{ width: 200 }} value={type} onChange={(v) => page.setFilter('type', v)} options={WORK_PERMIT_TYPES.map((t) => ({ value: t, label: WORK_PERMIT_TYPE_LABELS[t] }))} />
      </ListToolbar>
      <DataTable<WorkPermitDto>
        className="permit-list"
        columns={frame.columns}
        visible={frame.choice.visible}
        onChooseColumns={frame.choice.setChosen}
        chosenIsDefault={frame.choice.isDefault}
        rows={data?.items ?? []}
        loading={isLoading || isFetching}
        table={page.tableProps<WorkPermitDto>(data?.total)}
        onOpen={setOpenId}
        bulk={[exportSelected<WorkPermitDto>('permits-to-work', 'permits', EXPORT)]}
        chips={frame.chips}
        empty={frame.empty}
        failed={!!error}
        scrollX={fixedProject ? 900 : 1100}
        emptyText={<EmptyArt art="entries" title={view === 'ACTIVE' ? 'No permits waiting or live' : 'No permits'} />}
        emptyAction={newButton}
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
