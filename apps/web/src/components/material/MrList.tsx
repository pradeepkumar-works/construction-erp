'use client';

import React, { useEffect, useState } from 'react';
import { Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { MaterialRequestDto, MaterialRequestSortField, SubmissionStatus } from '@erp/shared';
import { useNewIntent } from '@/lib/new-intent';
import { useProjectScope } from '@/lib/project-scope';
import { useMaterialRequests } from '@/lib/queries';
import { useListState } from '@/lib/listState';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { MR_EXPORT, mrExportRows } from '@/lib/exportColumns';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { MrTable } from './MrTable';
import { MrDrawer } from './MrDrawer';
import { MrFormModal } from './MrFormModal';

/**
 * Server-paged list with search, project / status filters, sortable columns and Excel export of every
 * matching row. With `projectId` it is the project page's tab (project fixed); without, the top-level page.
 */
export function MrList({ projectId: fixedProject, newLabel, openId: initialOpen }: { projectId?: string; newLabel?: string; openId?: string | null }) {
  const list = useListState<MaterialRequestSortField>({ sortBy: 'createdAt', sortOrder: 'desc' });
  const [projectFilter, setProjectFilter] = useProjectScope();
  const [status, setStatus] = useState<SubmissionStatus | undefined>();
  const [openId, setOpenId] = useState<string | null>(initialOpen ?? null);
  useEffect(() => {
    if (initialOpen) setOpenId(initialOpen);
  }, [initialOpen]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MaterialRequestDto | null>(null);
  const projectId = fixedProject ?? projectFilter;
  const filters = { ...list.params, projectId, status };
  const { data, isLoading, isFetching, error, refetch } = useMaterialRequests(filters);

  const exportRows = async () => {
    const rows = await fetchAllPages<MaterialRequestDto>('/material-requests', { ...filters });
    downloadXlsx(exportFileName('material-requests'), 'material-requests', MR_EXPORT, mrExportRows(rows));
    return rows.length;
  };

  useNewIntent('material-request', !!newLabel, () => setFormOpen(true));

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
        status={status}
        onStatus={(v) => {
          setStatus(v);
          list.resetPage();
        }}
        search={list.search}
        onSearch={list.setSearch}
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
      />
      <MrTable
        data={data?.items ?? []}
        loading={isLoading || isFetching}
        showProject={!fixedProject}
        onOpen={setOpenId}
        onEdit={setEditing}
        table={list.tableProps<MaterialRequestDto>(data?.total)}
        sortOrderFor={list.sortOrderFor}
      />
      <MrDrawer id={openId} open={!!openId} onClose={() => setOpenId(null)} onEdit={setEditing} />
      <MrFormModal open={formOpen || !!editing} entry={editing} onClose={() => { setFormOpen(false); setEditing(null); }} projectId={fixedProject} />
    </>
  );
}
