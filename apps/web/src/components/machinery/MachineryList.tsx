'use client';

import React, { useState } from 'react';
import { Button, Checkbox, DatePicker, Select } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import type { MachineryLogDto, MachineryLogSortField, SubmissionStatus } from '@erp/shared';
import { MAX_PAGE_SIZE, canLogMachinery } from '@erp/shared';
import { useProjectScope } from '@/lib/project-scope';
import { useAuth } from '@/lib/auth';
import { useEquipment, useMachineryLogs } from '@/lib/queries';
import { useListState } from '@/lib/listState';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { MACHINERY_EXPORT } from '@/lib/exportColumns';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { MachineryTable } from './MachineryTable';
import { MachineryDrawer } from './MachineryDrawer';
import { MachineryFormModal } from './MachineryFormModal';
import { rangePresets } from '@/lib/dates';

/** Daily machinery logs: paged, searchable, filtered by project, machine, status, dates and breakdowns; Excel export. */
export function MachineryList({ projectId: fixedProject }: { projectId?: string }) {
  const { user } = useAuth();
  const list = useListState<MachineryLogSortField>({ sortBy: 'date', sortOrder: 'desc' });
  const [projectFilter, setProjectFilter] = useProjectScope();
  const [status, setStatus] = useState<SubmissionStatus | undefined>();
  const [equipmentId, setEquipmentId] = useState<string | undefined>();
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [breakdownOnly, setBreakdownOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MachineryLogDto | null>(null);
  const projectId = fixedProject ?? projectFilter;
  const { data: equipment } = useEquipment({ pageSize: MAX_PAGE_SIZE, includeInactive: true });
  const filters = {
    ...list.params,
    projectId,
    status,
    equipmentId,
    from: range?.[0]?.format('YYYY-MM-DD'),
    to: range?.[1]?.format('YYYY-MM-DD'),
    breakdownOnly: breakdownOnly || undefined,
  };
  const { data, isLoading, isFetching, error, refetch } = useMachineryLogs(filters);
  const mayLog = !!user && canLogMachinery(user.roleKey);

  const exportRows = async () => {
    const rows = await fetchAllPages<MachineryLogDto>('/machinery-logs', { ...filters });
    downloadXlsx(exportFileName('machinery-logs'), 'machinery', MACHINERY_EXPORT, rows);
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
        searchPlaceholder="Search machine, operator, work, people"
        extra={
          <>
            <ExportButton onExport={exportRows} />
            {mayLog ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
                Log machinery
              </Button>
            ) : null}
          </>
        }
      >
        <Select
          allowClear
          showSearch={{ optionFilterProp: 'label' }}
          placeholder="All equipment"
          style={{ width: 220 }}
          value={equipmentId}
          onChange={(v) => {
            setEquipmentId(v);
            list.resetPage();
          }}
          options={(equipment?.items ?? []).filter((e) => !projectId || e.projectId === projectId || e.id === equipmentId).map((e) => ({ value: e.id, label: `${e.code} · ${e.name}` }))}
        />
        <DatePicker.RangePicker presets={rangePresets()}
          value={range}
          onChange={(v) => {
            setRange(v as [Dayjs | null, Dayjs | null] | null);
            list.resetPage();
          }}
          format="DD MMM YYYY"
          allowEmpty={[true, true]}
        />
        <Checkbox
          checked={breakdownOnly}
          onChange={(e) => {
            setBreakdownOnly(e.target.checked);
            list.resetPage();
          }}
        >
          Breakdowns only
        </Checkbox>
      </ListToolbar>
      <MachineryTable
        data={data?.items ?? []}
        loading={isLoading || isFetching}
        showProject={!fixedProject}
        onOpen={setOpenId}
        onEdit={setEditing}
        table={list.tableProps<MachineryLogDto>(data?.total)}
        sortOrderFor={list.sortOrderFor}
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
