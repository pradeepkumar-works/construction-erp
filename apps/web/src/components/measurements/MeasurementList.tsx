'use client';

import React, { useState } from 'react';
import { Button, DatePicker, Select } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import type { MeasurementSheetDto, MeasurementSortField, SubmissionStatus } from '@erp/shared';
import { canMeasure } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useBoq, useMeasurements } from '@/lib/queries';
import { useListState } from '@/lib/listState';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { MEASUREMENT_EXPORT, measurementExportRows } from '@/lib/exportColumns';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { MeasurementTable } from './MeasurementTable';
import { MeasurementDrawer } from './MeasurementDrawer';
import { MeasurementFormModal } from './MeasurementFormModal';

/** Measurement book sheets, used on the Measurement Book page and as a project tab. */
export function MeasurementList({ projectId: fixedProject }: { projectId?: string }) {
  const { user } = useAuth();
  const list = useListState<MeasurementSortField>({ sortBy: 'date', sortOrder: 'desc' });
  const [projectFilter, setProjectFilter] = useState<string | undefined>();
  const [status, setStatus] = useState<SubmissionStatus | undefined>();
  const [boqItemId, setBoqItemId] = useState<string | undefined>();
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MeasurementSheetDto | null>(null);
  const projectId = fixedProject ?? projectFilter;
  const { data: boq } = useBoq(projectId);
  const filters = {
    ...list.params,
    projectId,
    status,
    boqItemId: projectId ? boqItemId : undefined,
    from: range?.[0]?.format('YYYY-MM-DD'),
    to: range?.[1]?.format('YYYY-MM-DD'),
  };
  const { data, isLoading, isFetching, error, refetch } = useMeasurements(filters);
  const mayMeasure = !!user && canMeasure(user.roleKey);
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    list.resetPage();
  };

  const exportRows = async () => {
    const rows = await fetchAllPages<MeasurementSheetDto>('/measurements', { ...filters });
    downloadXlsx(exportFileName('measurement-book'), 'measurements', MEASUREMENT_EXPORT, measurementExportRows(rows));
    return rows.length;
  };

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar
        projectId={projectFilter}
        onProject={(v) => {
          setBoqItemId(undefined);
          reset(setProjectFilter)(v);
        }}
        hideProject={!!fixedProject}
        status={status}
        onStatus={reset(setStatus)}
        search={list.search}
        onSearch={list.setSearch}
        searchPlaceholder="Search MB no., location, BOQ item"
        extra={
          <>
            <ExportButton onExport={exportRows} />
            {mayMeasure ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
                New measurement
              </Button>
            ) : null}
          </>
        }
      >
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder={projectId ? 'All BOQ items' : 'Pick a project to filter by BOQ item'}
          disabled={!projectId}
          style={{ width: 260 }}
          value={boqItemId}
          onChange={reset(setBoqItemId)}
          options={(boq ?? []).map((b) => ({ value: b.id, label: `${b.itemNo} - ${b.description}` }))}
        />
        <DatePicker.RangePicker value={range} onChange={(v) => reset(setRange)(v as [Dayjs | null, Dayjs | null] | null)} format="DD MMM YYYY" allowEmpty={[true, true]} />
      </ListToolbar>
      <MeasurementTable
        data={data?.items ?? []}
        loading={isLoading || isFetching}
        showProject={!fixedProject}
        onOpen={setOpenId}
        onEdit={setEditing}
        table={list.tableProps<MeasurementSheetDto>(data?.total)}
        sortOrderFor={list.sortOrderFor}
      />
      <MeasurementDrawer id={openId} open={!!openId} onClose={() => setOpenId(null)} onEdit={setEditing} />
      <MeasurementFormModal
        open={formOpen || !!editing}
        sheet={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        projectId={fixedProject}
      />
    </>
  );
}
