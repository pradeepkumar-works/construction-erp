'use client';

import React, { useState } from 'react';
import { Button, Checkbox } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { MachineryLogDto } from '@erp/shared';
import { LIST_SORT_FIELDS, canLogMachinery } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useMachineryLogs } from '@/lib/queries';
import { EquipmentSelect, useEquipmentItem } from '@/components/common/SearchSelect';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { MACHINERY_EXPORT } from '@/lib/exportColumns';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable } from '@/components/list/DataTable';
import { DateRangeFilter } from '@/components/list/DateRangeFilter';
import { exportSelected, useBulkApprove } from '@/components/list/bulk';
import { useListFrame } from '@/components/list/useListFrame';
import { machineryColumns } from './MachineryTable';
import { MachineryDrawer } from './MachineryDrawer';
import { MachineryFormModal } from './MachineryFormModal';

const KEYS = ['status', 'mine', 'from', 'to', 'equipmentId', 'breakdownOnly'] as const;

/** Daily machinery logs: views, search, project / machine / status / date filters, breakdowns, bulk approve and export. */
export function MachineryList({ projectId: fixedProject }: { projectId?: string }) {
  const { user } = useAuth();
  const [openId, setOpenId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MachineryLogDto | null>(null);
  const frame = useListFrame({
    list: 'machinery',
    type: 'MACHINERY',
    keys: KEYS,
    sortBy: 'date',
    sortOrder: 'desc',
    sortFields: LIST_SORT_FIELDS.machinery,
    fixedProject,
    columns: (sortOrderFor) => machineryColumns({ showProject: !fixedProject, onOpen: setOpenId, onEdit: setEditing, sortOrderFor }),
    moreViews: [{ key: 'breakdowns', label: 'Breakdowns', filters: { breakdownOnly: '1' } }],
    chipLabels: {
      equipmentId: () => `Machine: ${machine ? `${machine.code} · ${machine.name}` : 'one machine'}`,
      breakdownOnly: () => 'Breakdowns only',
    },
  });
  const { page } = frame;
  const equipmentId = page.filters.equipmentId;
  // Read by the chip's label once the list has drawn.
  const machine = useEquipmentItem(equipmentId);
  const filters = { ...page.params, projectId: frame.projectId, status: frame.status, equipmentId, breakdownOnly: page.filters.breakdownOnly === '1' || undefined };
  const { data, isLoading, isFetching, error, refetch } = useMachineryLogs(filters);
  const approve = useBulkApprove<MachineryLogDto>('machinery');
  const mayLog = !!user && canLogMachinery(user.roleKey);

  const exportRows = async () => {
    const rows = await fetchAllPages<MachineryLogDto>('/machinery-logs', { ...filters });
    await downloadXlsx(exportFileName('machinery-logs'), 'machinery', MACHINERY_EXPORT, rows);
    return rows.length;
  };

  const newButton = mayLog ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
      New machinery log
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
        searchPlaceholder="Search machine, operator, work, people"
        searchLabel="Search machinery logs"
        extra={
          <>
            <ExportButton onExport={exportRows} />
            {newButton}
          </>
        }
      >
        <EquipmentSelect
          allowClear
          placeholder="All equipment"
          aria-label="Equipment"
          style={{ width: 220 }}
          params={{ projectId: frame.projectId, includeInactive: true }}
          value={equipmentId}
          onChange={(v) => page.setFilter('equipmentId', v)}
        />
        <DateRangeFilter {...frame.dateRange} />
        <Checkbox checked={!!filters.breakdownOnly} onChange={(e) => page.setFilter('breakdownOnly', e.target.checked ? '1' : undefined)}>
          Breakdowns only
        </Checkbox>
      </ListToolbar>
      <DataTable<MachineryLogDto>
        columns={frame.columns}
        visible={frame.choice.visible}
        onChooseColumns={frame.choice.setChosen}
        chosenIsDefault={frame.choice.isDefault}
        rows={data?.items ?? []}
        loading={isLoading || isFetching}
        table={page.tableProps<MachineryLogDto>(data?.total)}
        onOpen={setOpenId}
        bulk={[...(approve ? [approve] : []), exportSelected<MachineryLogDto>('machinery-logs', 'machinery', MACHINERY_EXPORT)]}
        chips={frame.chips}
        empty={frame.empty}
        failed={!!error}
        scrollX={fixedProject ? 1100 : 1320}
        emptyText={<EmptyArt art="entries" title="No machinery logs here yet" />}
        emptyAction={newButton}
      />
      <MachineryDrawer id={openId} open={!!openId} onClose={() => setOpenId(null)} onEdit={setEditing} />
      <MachineryFormModal
        open={formOpen || !!editing}
        log={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        projectId={fixedProject}
      />
    </>
  );
}
