'use client';

import React, { useState } from 'react';
import { Button, Tooltip } from 'antd';
import { PlusOutlined } from '@/components/common/icons';
import type { AiDraftDto, DailyReportDto } from '@erp/shared';
import { LIST_SORT_FIELDS, MAX_PAGE_SIZE, SUBMISSION_STATUS_LABELS, SUBMISSION_STATUS_SHORT_LABELS } from '@erp/shared';
import { useNewIntent } from '@/lib/new-intent';
import { useDprList, LIST_START } from '@/lib/queries';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { EmptyArt } from '@/components/common/EmptyArt';
import { AppTag } from '@/components/common/AppTag';
import { formatDayMonth, todayDate } from '@/lib/format';
import { SiteDayGrid, gridDays, useFilingSites } from '@/components/site-days/SiteDayGrid';
import { DataTable } from '@/components/list/DataTable';
import { DateRangeFilter } from '@/components/list/DateRangeFilter';
import { useBulkApprove } from '@/components/list/bulk';
import { DownloadOutlined } from '@/components/common/icons';
import { dprExportColumns } from './dprExport';
import { useListFrame } from '@/components/list/useListFrame';
import { dprColumns } from './DprTable';
import { DprDrawer } from './DprDrawer';
import { DprFormModal } from './DprFormModal';

const KEYS = ['status', 'mine', 'from', 'to'] as const;

/**
 * Server-paged list with views, search, project / status / date filters, sortable and choosable columns, bulk approve
 * and Excel export. With `projectId` it is the project page's tab (project fixed); without, the top-level page, which
 * opens on Days: a row per site and a cell per day, so a site that did not file shows (ARCHITECTURE "Views that fit the
 * data"). The days follow the project and the date range; status, Mine, the views and search are the table's.
 */
export function DprList({ projectId: fixedProject, newLabel }: { projectId?: string; newLabel?: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DailyReportDto | null>(null);
  // A draft from Ask Nirmaan the form opens with
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
    viewKinds: fixedProject ? undefined : ['days', 'table'],
    columns: (sortOrderFor) => dprColumns({ showProject: !fixedProject, onOpen: setOpenId, onEdit: setEditing, sortOrderFor }),
  });
  const { page } = frame;
  const filters = { ...page.params, projectId: frame.projectId, status: frame.status };
  const onDays = frame.view === 'days';
  const { data, isLoading, isFetching, error, refetch } = useDprList(filters, !onDays);
  const days = gridDays(page.filters.from || undefined, page.filters.to || undefined, todayDate());
  const grid = useDprList({ projectId: frame.projectId, from: days[0], to: days[days.length - 1], pageSize: MAX_PAGE_SIZE, sortBy: 'date', sortOrder: 'desc' }, onDays);
  const sites = useFilingSites(frame.projectId);
  const shown = onDays ? grid : { error, refetch };
  const approve = useBulkApprove<DailyReportDto>('dpr');

  const exportRows = async () => {
    const rows = await fetchAllPages<DailyReportDto>('/dpr', { ...filters });
    await downloadXlsx(exportFileName('dpr'), 'dpr', await dprExportColumns(rows), rows);
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
      {onDays ? null : frame.views}
      {shown.error && <QueryError error={shown.error} onRetry={() => shown.refetch()} />}
      <ListToolbar filters={frame.filterState}
        projectId={frame.projectFilter}
        onProject={frame.setProjectFilter}
        hideProject={!!fixedProject}
        status={frame.status}
        onStatus={onDays ? undefined : frame.setStatus}
        search={page.search}
        onSearch={onDays ? undefined : page.setSearch}
        searchPlaceholder="Search work, issues, people"
        searchLabel="Search DPRs"
        extra={
          <>
            {frame.viewToggle}
            <ExportButton onExport={exportRows} />
            {newButton}
          </>
        }
      >
        <DateRangeFilter {...frame.dateRange} />
      </ListToolbar>
      {onDays ? (
        <SiteDayGrid<DailyReportDto>
          label="Daily reports by site and day"
          sites={sites.sites}
          entries={grid.data?.items ?? []}
          days={days}
          loading={sites.isLoading || grid.isLoading}
          shown={grid.data?.items.length ?? 0}
          total={grid.data?.total ?? 0}
          missingWord="No daily report"
          cell={(reports, day, site) => {
            const r = reports[0];
            const status = SUBMISSION_STATUS_LABELS[r.status];
            return (
              <Tooltip title={status}>
                <Button type="text" size="small" onClick={() => setOpenId(r.id)} aria-label={`Daily report, ${site.name}, ${formatDayMonth(day)}, ${status.toLowerCase()}`}>
                  <AppTag kind="submission" status={r.status}>
                    {SUBMISSION_STATUS_SHORT_LABELS[r.status]}
                  </AppTag>
                </Button>
              </Tooltip>
            );
          }}
        />
      ) : (
        <DataTable<DailyReportDto>
          columns={frame.columns}
          visible={frame.choice.visible}
          onChooseColumns={frame.choice.setChosen}
          chosenIsDefault={frame.choice.isDefault}
          rows={data?.items ?? []}
          loading={isLoading || isFetching}
          table={page.tableProps<DailyReportDto>(data?.total)}
          onOpen={setOpenId}
          bulk={[...(approve ? [approve] : []), { key: 'export', label: 'Export', icon: <DownloadOutlined />, run: async (rows: DailyReportDto[]) => downloadXlsx(exportFileName('dpr'), 'dpr', await dprExportColumns(rows), rows) }]}
          chips={frame.chips}
          empty={frame.empty}
          failed={!!error}
          emptyText={<EmptyArt art="entries" title="No daily reports here yet" />}
          emptyAction={newButton}
        />
      )}
      <DprDrawer id={openId} open={!!openId} onClose={() => setOpenId(null)} onEdit={setEditing} />
      <DprFormModal open={formOpen || !!editing} entry={editing} onClose={() => { setFormOpen(false); setEditing(null); setPrefill(null); }} prefill={prefill} projectId={fixedProject} defaultProjectId={frame.projectId} />
    </>
  );
}
