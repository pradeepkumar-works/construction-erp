'use client';

import React, { useState } from 'react';
import { Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ProgressEntryDto, ProgressSortField, SubmissionStatus } from '@erp/shared';
import { useProgressList } from '@/lib/queries';
import { useListState } from '@/lib/listState';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { PROGRESS_EXPORT } from '@/lib/exportColumns';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { ProgressTable } from './ProgressTable';
import { ProgressDrawer } from './ProgressDrawer';
import { ProgressFormModal } from './ProgressFormModal';

/**
 * Server-paged list with search, project / status filters, sortable columns and Excel export of every
 * matching row. With `projectId` it is the project page's tab (project fixed); without, the top-level page.
 */
export function ProgressList({ projectId: fixedProject, newLabel }: { projectId?: string; newLabel?: string }) {
  const list = useListState<ProgressSortField>({ sortBy: 'date', sortOrder: 'desc' });
  const [projectFilter, setProjectFilter] = useState<string | undefined>();
  const [status, setStatus] = useState<SubmissionStatus | undefined>();
  const [openId, setOpenId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProgressEntryDto | null>(null);
  const projectId = fixedProject ?? projectFilter;
  const filters = { ...list.params, projectId, status };
  const { data, isLoading, isFetching, error, refetch } = useProgressList(filters);

  const exportRows = async () => {
    const rows = await fetchAllPages<ProgressEntryDto>('/progress', { ...filters });
    downloadXlsx(exportFileName('progress'), 'progress', PROGRESS_EXPORT, rows);
    return rows.length;
  };

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
        searchPlaceholder="Search activity, location, remarks, people"
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
      <ProgressTable
        data={data?.items ?? []}
        loading={isLoading || isFetching}
        showProject={!fixedProject}
        onOpen={setOpenId}
        onEdit={setEditing}
        table={list.tableProps<ProgressEntryDto>(data?.total)}
        sortOrderFor={list.sortOrderFor}
      />
      <ProgressDrawer id={openId} open={!!openId} onClose={() => setOpenId(null)} onEdit={setEditing} />
      <ProgressFormModal open={formOpen || !!editing} entry={editing} onClose={() => { setFormOpen(false); setEditing(null); }} projectId={fixedProject} />
    </>
  );
}
