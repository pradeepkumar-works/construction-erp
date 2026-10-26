'use client';

import React, { useState } from 'react';
import { Button, Select } from 'antd';
import { PlusOutlined } from '@/components/common/icons';
import type { MeasurementSheetDto, ToMeasureItemDto } from '@erp/shared';
import { LIST_SORT_FIELDS, canMeasure } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useProjectScope } from '@/lib/project-scope';
import { useBoq, useMeasurements, LIST_START } from '@/lib/queries';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { MEASUREMENT_EXPORT, measurementExportRows, type MeasurementExportRow } from '@/lib/exportColumns';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable } from '@/components/list/DataTable';
import { DateRangeFilter } from '@/components/list/DateRangeFilter';
import { exportSelected, useBulkApprove } from '@/components/list/bulk';
import { useListFrame } from '@/components/list/useListFrame';
import { measurementColumns } from './MeasurementTable';
import { MeasurementDrawer } from './MeasurementDrawer';
import { MeasurementFormModal, type MeasurementPrefill } from './MeasurementFormModal';
import { MeasureFromProgressModal, progressPrefill } from './MeasureFromProgressModal';

const KEYS = ['status', 'mine', 'from', 'to', 'boqItemId'] as const;

/** Measurement book sheets, used on the Measurement book page and as a project tab. */
export function MeasurementList({ projectId: fixedProject }: { projectId?: string }) {
  const { user } = useAuth();
  const [openId, setOpenId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MeasurementSheetDto | null>(null);
  const [fromProgress, setFromProgress] = useState(false);
  const [started, setStarted] = useState<{ boqItemId: string; prefill: MeasurementPrefill } | null>(null);
  const [scope] = useProjectScope();
  const { data: boq } = useBoq(fixedProject ?? scope);
  const frame = useListFrame({
    list: 'measurements',
    type: 'MEASUREMENT',
    keys: KEYS,
    // Where the sidebar's hover fetched it ahead from (LIST_START).
    sortBy: LIST_START['/measurements'].sortBy,
    sortOrder: LIST_START['/measurements'].sortOrder,
    sortFields: LIST_SORT_FIELDS.measurements,
    fixedProject,
    columns: (sortOrderFor) => measurementColumns({ showProject: !fixedProject, onOpen: setOpenId, onEdit: setEditing, sortOrderFor }),
    chipLabels: {
      boqItemId: (v) => {
        const b = boq?.find((x) => x.id === v);
        return `BOQ item: ${b ? b.itemNo : 'one item'}`;
      },
    },
  });
  const { page } = frame;
  const boqItemId = frame.projectId ? page.filters.boqItemId : undefined;
  const filters = { ...page.params, projectId: frame.projectId, status: frame.status, boqItemId };
  const { data, isLoading, isFetching, error, refetch } = useMeasurements(filters);
  const approve = useBulkApprove<MeasurementSheetDto>('measurement', (r) => r.amount);
  const mayMeasure = !!user && canMeasure(user.roleKey);

  const exportRows = async () => {
    const rows = await fetchAllPages<MeasurementSheetDto>('/measurements', { ...filters });
    await downloadXlsx(exportFileName('measurement-book'), 'measurements', MEASUREMENT_EXPORT, measurementExportRows(rows));
    return rows.length;
  };

  const newButton = mayMeasure ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
      New measurement
    </Button>
  ) : null;
  // Start a sheet from the days the site already got approved (finding 14 of the October review).
  const startFromProgress = (item: ToMeasureItemDto) => setStarted({ boqItemId: item.boqItemId, prefill: progressPrefill(item) });

  return (
    <>
      {frame.views}
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar filters={frame.filterState}
        projectId={frame.projectFilter}
        onProject={(v) => {
          page.setFilter('boqItemId', undefined);
          frame.setProjectFilter(v);
        }}
        hideProject={!!fixedProject}
        status={frame.status}
        onStatus={frame.setStatus}
        search={page.search}
        onSearch={page.setSearch}
        searchPlaceholder="Search MB no., location, BOQ item"
        searchLabel="Search measurements"
        extra={
          <>
            {mayMeasure && frame.projectId ? <Button onClick={() => setFromProgress(true)}>Measure from progress</Button> : null}
            <ExportButton onExport={exportRows} />
            {newButton}
          </>
        }
      >
        <Select
          allowClear
          showSearch={{ optionFilterProp: 'label' }}
          placeholder={frame.projectId ? 'All BOQ items' : 'Pick a project to filter by BOQ item'}
          aria-label="BOQ item"
          disabled={!frame.projectId}
          style={{ width: 260 }}
          value={boqItemId}
          onChange={(v) => page.setFilter('boqItemId', v)}
          options={(boq ?? []).map((b) => ({ value: b.id, label: `${b.itemNo} - ${b.description}` }))}
        />
        <DateRangeFilter {...frame.dateRange} />
      </ListToolbar>
      <DataTable<MeasurementSheetDto>
        columns={frame.columns}
        visible={frame.choice.visible}
        onChooseColumns={frame.choice.setChosen}
        chosenIsDefault={frame.choice.isDefault}
        rows={data?.items ?? []}
        loading={isLoading || isFetching}
        table={page.tableProps<MeasurementSheetDto>(data?.total)}
        onOpen={setOpenId}
        bulk={[...(approve ? [approve] : []), exportSelected<MeasurementSheetDto, MeasurementExportRow>('measurement-book', 'measurements', MEASUREMENT_EXPORT, measurementExportRows)]}
        chips={frame.chips}
        empty={frame.empty}
        failed={!!error}
        scrollX={fixedProject ? 1150 : 1350}
        emptyText={<EmptyArt art="entries" title="No measurements here yet" />}
        emptyAction={newButton}
      />
      <MeasurementDrawer id={openId} open={!!openId} onClose={() => setOpenId(null)} onEdit={setEditing} />
      {frame.projectId ? (
        <MeasureFromProgressModal open={fromProgress} onClose={() => setFromProgress(false)} projectId={frame.projectId} onStart={startFromProgress} />
      ) : null}
      <MeasurementFormModal
        open={formOpen || !!editing || !!started}
        sheet={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
          setStarted(null);
        }}
        projectId={started ? frame.projectId : fixedProject}
        boqItemId={started?.boqItemId}
        prefill={started?.prefill}
      />
    </>
  );
}
