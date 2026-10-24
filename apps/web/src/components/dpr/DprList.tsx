'use client';

import React, { useState } from 'react';
import { Button } from 'antd';
import { PlusOutlined } from '@/components/common/icons';
import type { AiDraftDto, DailyReportDto } from '@erp/shared';
import { LIST_SORT_FIELDS } from '@erp/shared';
import { useNewIntent } from '@/lib/new-intent';
import { useDprList, LIST_START } from '@/lib/queries';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { DPR_EXPORT } from '@/lib/exportColumns';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable } from '@/components/list/DataTable';
import { DateRangeFilter } from '@/components/list/DateRangeFilter';
import { exportSelected, useBulkApprove } from '@/components/list/bulk';
import { useListFrame } from '@/components/list/useListFrame';
import { dprColumns } from './DprTable';
import { DprDrawer } from './DprDrawer';
import { DprFormModal } from './DprFormModal';

const KEYS = ['status', 'mine', 'from', 'to'] as const;

/**
 * Server-paged list with views, search, project / status / date filters, sortable and choosable columns, bulk approve
 * and Excel export. With `projectId` it is the project page's tab (project fixed); without, the top-level page.
 */
export function DprList({ projectId: fixedProject, newLabel }: { projectId?: string; newLabel?: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DailyReportDto | null>(null);
  // A draft from Ask Nirmaan (AI item 71) the form opens with
  const [prefill, setPrefill] = useState<AiDraftDto | null>(null);
  const frame = useListFrame({
    list: 'dpr',
    type: 'DPR',
    keys: KEYS,
    // Where the sidebar's hover fetched it ahead from (LIST_START).
    sortBy: LIST_START['/dpr'].sortBy,
    sortOrder: LIST_START['/dpr'].sortOrder,
    sortFields: LIST_SORT_FIELDS.dpr,
    fixedProject,
    columns: (sortOrderFor) => dprColumns({ showProject: !fixedProject, onOpen: setOpenId, onEdit: setEditing, sortOrderFor }),
  });
  const { page } = frame;
  const filters = { ...page.params, projectId: frame.projectId, status: frame.status };
  const { data, isLoading, isFetching, error, refetch } = useDprList(filters);
  const approve = useBulkApprove<DailyReportDto>('dpr');

  const exportRows = async () => {
    const rows = await fetchAllPages<DailyReportDto>('/dpr', { ...filters });
    await downloadXlsx(exportFileName('dpr'), 'dpr', DPR_EXPORT, rows);
    return rows.length;
  };

  useNewIntent('dpr', !!newLabel, (draft) => {
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
        searchPlaceholder="Search work, issues, people"
        searchLabel="Search DPRs"
        extra={
          <>
            <ExportButton onExport={exportRows} />
            {newButton}
          </>
        }
      >
        <DateRangeFilter {...frame.dateRange} />
      </ListToolbar>
      <DataTable<DailyReportDto>
        columns={frame.columns}
        visible={frame.choice.visible}
        onChooseColumns={frame.choice.setChosen}
        chosenIsDefault={frame.choice.isDefault}
        rows={data?.items ?? []}
        loading={isLoading || isFetching}
        table={page.tableProps<DailyReportDto>(data?.total)}
        onOpen={setOpenId}
        bulk={[...(approve ? [approve] : []), exportSelected<DailyReportDto>('dpr', 'dpr', DPR_EXPORT)]}
        chips={frame.chips}
        empty={frame.empty}
        failed={!!error}
        scrollX={fixedProject ? 1230 : 1450}
        emptyText={<EmptyArt art="entries" title="No daily reports here yet" />}
        emptyAction={newButton}
      />
      <DprDrawer id={openId} open={!!openId} onClose={() => setOpenId(null)} onEdit={setEditing} />
      <DprFormModal open={formOpen || !!editing} entry={editing} onClose={() => { setFormOpen(false); setEditing(null); setPrefill(null); }} prefill={prefill} projectId={fixedProject} defaultProjectId={frame.projectId} />
    </>
  );
}
