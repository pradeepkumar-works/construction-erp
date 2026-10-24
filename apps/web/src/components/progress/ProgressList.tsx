'use client';

import React, { useState } from 'react';
import { Button } from 'antd';
import { PlusOutlined } from '@/components/common/icons';
import type { AiDraftDto, ProgressEntryDto } from '@erp/shared';
import { LIST_SORT_FIELDS } from '@erp/shared';
import { useNewIntent } from '@/lib/new-intent';
import { useProgressList, LIST_START } from '@/lib/queries';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { PROGRESS_EXPORT } from '@/lib/exportColumns';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable } from '@/components/list/DataTable';
import { DateRangeFilter } from '@/components/list/DateRangeFilter';
import { exportSelected, useBulkApprove } from '@/components/list/bulk';
import { useListFrame } from '@/components/list/useListFrame';
import { progressColumns } from './ProgressTable';
import { ProgressDrawer } from './ProgressDrawer';
import { ProgressFormModal } from './ProgressFormModal';

const KEYS = ['status', 'mine', 'from', 'to'] as const;

/**
 * Server-paged list with views, search, project / status / date filters, sortable and choosable columns, bulk approve
 * and Excel export. With `projectId` it is the project page's tab (project fixed); without, the top-level page.
 */
export function ProgressList({ projectId: fixedProject, newLabel }: { projectId?: string; newLabel?: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProgressEntryDto | null>(null);
  // A draft from Ask Nirmaan (AI item 71) the form opens with
  const [prefill, setPrefill] = useState<AiDraftDto | null>(null);
  const frame = useListFrame({
    list: 'progress',
    type: 'PROGRESS',
    keys: KEYS,
    // Where the sidebar's hover fetched it ahead from (LIST_START).
    sortBy: LIST_START['/progress'].sortBy,
    sortOrder: LIST_START['/progress'].sortOrder,
    sortFields: LIST_SORT_FIELDS.progress,
    fixedProject,
    columns: (sortOrderFor) => progressColumns({ showProject: !fixedProject, onOpen: setOpenId, onEdit: setEditing, sortOrderFor }),
  });
  const { page } = frame;
  const filters = { ...page.params, projectId: frame.projectId, status: frame.status };
  const { data, isLoading, isFetching, error, refetch } = useProgressList(filters);
  const approve = useBulkApprove<ProgressEntryDto>('progress');

  const exportRows = async () => {
    const rows = await fetchAllPages<ProgressEntryDto>('/progress', { ...filters });
    await downloadXlsx(exportFileName('progress'), 'progress', PROGRESS_EXPORT, rows);
    return rows.length;
  };

  useNewIntent('progress', !!newLabel, (draft) => {
    setPrefill(draft ?? null);
    setFormOpen(true);
  });

  const newButton = newLabel ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
      {newLabel}
    </Button>
  ) : null;

  return (
    <>
      {frame.views}
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar filters={frame.filterState}
        projectId={frame.projectFilter}
        onProject={frame.setProjectFilter}
        hideProject={!!fixedProject}
        status={frame.status}
        onStatus={frame.setStatus}
        search={page.search}
        onSearch={page.setSearch}
        searchPlaceholder="Search activity, location, remarks, people"
        searchLabel="Search progress entries"
        extra={
          <>
            <ExportButton onExport={exportRows} />
            {newButton}
          </>
        }
      >
        <DateRangeFilter {...frame.dateRange} />
      </ListToolbar>
      <DataTable<ProgressEntryDto>
        columns={frame.columns}
        visible={frame.choice.visible}
        onChooseColumns={frame.choice.setChosen}
        chosenIsDefault={frame.choice.isDefault}
        rows={data?.items ?? []}
        loading={isLoading || isFetching}
        table={page.tableProps<ProgressEntryDto>(data?.total)}
        onOpen={setOpenId}
        bulk={[...(approve ? [approve] : []), exportSelected<ProgressEntryDto>('progress', 'progress', PROGRESS_EXPORT)]}
        chips={frame.chips}
        empty={frame.empty}
        failed={!!error}
        scrollX={fixedProject ? 1180 : 1400}
        emptyText={<EmptyArt art="entries" title="No progress entries here yet" />}
        emptyAction={newButton}
      />
      <ProgressDrawer id={openId} open={!!openId} onClose={() => setOpenId(null)} onEdit={setEditing} />
      <ProgressFormModal open={formOpen || !!editing} entry={editing} onClose={() => { setFormOpen(false); setEditing(null); setPrefill(null); }} prefill={prefill} projectId={fixedProject} defaultProjectId={frame.projectId} />
    </>
  );
}
