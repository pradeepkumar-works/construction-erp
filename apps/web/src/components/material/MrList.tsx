'use client';

import React, { useEffect, useState } from 'react';
import { Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { MaterialRequestDto } from '@erp/shared';
import { LIST_SORT_FIELDS } from '@erp/shared';
import { useNewIntent } from '@/lib/new-intent';
import { useMaterialRequests } from '@/lib/queries';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { MR_EXPORT, mrExportRows, type MrExportRow } from '@/lib/exportColumns';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable } from '@/components/list/DataTable';
import { DateRangeFilter } from '@/components/list/DateRangeFilter';
import { exportSelected, useBulkApprove } from '@/components/list/bulk';
import { useListFrame } from '@/components/list/useListFrame';
import { mrColumns } from './MrTable';
import { MrDrawer } from './MrDrawer';
import { MrFormModal } from './MrFormModal';

const KEYS = ['status', 'mine', 'from', 'to'] as const;

/**
 * Server-paged list with views, search, project / status / date filters, sortable and choosable columns, bulk approve
 * and Excel export. With `projectId` it is the project page's tab (project fixed); without, the top-level page.
 */
export function MrList({ projectId: fixedProject, newLabel, openId: initialOpen }: { projectId?: string; newLabel?: string; openId?: string | null }) {
  const [openId, setOpenId] = useState<string | null>(initialOpen ?? null);
  useEffect(() => {
    if (initialOpen) setOpenId(initialOpen);
  }, [initialOpen]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MaterialRequestDto | null>(null);
  const frame = useListFrame({
    list: 'material-requests',
    type: 'MATERIAL_REQUEST',
    keys: KEYS,
    sortBy: 'createdAt',
    sortOrder: 'desc',
    sortFields: LIST_SORT_FIELDS.materialRequests,
    fixedProject,
    columns: (sortOrderFor) => mrColumns({ showProject: !fixedProject, onOpen: setOpenId, onEdit: setEditing, sortOrderFor }),
  });
  const { page } = frame;
  const filters = { ...page.params, projectId: frame.projectId, status: frame.status };
  const { data, isLoading, isFetching, error, refetch } = useMaterialRequests(filters);
  const approve = useBulkApprove<MaterialRequestDto>('material_request');

  const exportRows = async () => {
    const rows = await fetchAllPages<MaterialRequestDto>('/material-requests', { ...filters });
    downloadXlsx(exportFileName('material-requests'), 'material-requests', MR_EXPORT, mrExportRows(rows));
    return rows.length;
  };

  useNewIntent('material-request', !!newLabel, () => setFormOpen(true));

  return (
    <>
      {frame.views}
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar
        projectId={frame.projectFilter}
        onProject={frame.setProjectFilter}
        hideProject={!!fixedProject}
        status={frame.status}
        onStatus={frame.setStatus}
        search={page.search}
        onSearch={page.setSearch}
        searchPlaceholder="Search request no., items, people"
        extra={
          <>
            <ExportButton onExport={exportRows} />
            {newLabel ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
                {newLabel}
              </Button>
            ) : null}
          </>
        }
      >
        <DateRangeFilter {...frame.dateRange} />
      </ListToolbar>
      <DataTable<MaterialRequestDto>
        columns={frame.columns}
        visible={frame.choice.visible}
        onChooseColumns={frame.choice.setChosen}
        chosenIsDefault={frame.choice.isDefault}
        rows={data?.items ?? []}
        loading={isLoading || isFetching}
        table={page.tableProps<MaterialRequestDto>(data?.total)}
        onOpen={setOpenId}
        bulk={[...(approve ? [approve] : []), exportSelected<MaterialRequestDto, MrExportRow>('material-requests', 'material-requests', MR_EXPORT, mrExportRows)]}
        chips={frame.chips}
        scrollX={fixedProject ? 1180 : 1400}
        emptyText={<EmptyArt art="entries" title="No material requests here yet" />}
      />
      <MrDrawer id={openId} open={!!openId} onClose={() => setOpenId(null)} onEdit={setEditing} />
      <MrFormModal open={formOpen || !!editing} entry={editing} onClose={() => { setFormOpen(false); setEditing(null); }} projectId={fixedProject} defaultProjectId={frame.projectId} />
    </>
  );
}
