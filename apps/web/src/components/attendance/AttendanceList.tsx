'use client';

import React, { useState } from 'react';
import { Button, DatePicker } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import type { AttendanceSheetDto, AttendanceSortField } from '@erp/shared';
import { canRecordAttendance } from '@erp/shared';
import { useProjectScope } from '@/lib/project-scope';
import { useAuth } from '@/lib/auth';
import { useAttendanceList } from '@/lib/queries';
import { useListState } from '@/lib/listState';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { ATTENDANCE_EXPORT, attendanceExportRows } from '@/lib/exportColumns';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { AttendanceTable } from './AttendanceTable';
import { AttendanceFormModal } from './AttendanceFormModal';
import { rangePresets } from '@/lib/dates';

/** Server-paged attendance register with project and date-range filters and Excel export (one row per contractor and trade). */
export function AttendanceList({ projectId: fixedProject }: { projectId?: string }) {
  const { user } = useAuth();
  const canRecord = !!user && canRecordAttendance(user.roleKey);
  const list = useListState<AttendanceSortField>({ sortBy: 'date', sortOrder: 'desc' });
  const [projectFilter, setProjectFilter] = useProjectScope();
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [opened, setOpened] = useState<AttendanceSheetDto | null>(null);
  const projectId = fixedProject ?? projectFilter;
  const filters = { ...list.params, projectId, from: range?.[0]?.format('YYYY-MM-DD'), to: range?.[1]?.format('YYYY-MM-DD') };
  const { data, isLoading, isFetching, error, refetch } = useAttendanceList(filters);

  const exportRows = async () => {
    const rows = await fetchAllPages<AttendanceSheetDto>('/attendance', { ...filters });
    const lines = attendanceExportRows(rows);
    downloadXlsx(exportFileName('attendance'), 'attendance', ATTENDANCE_EXPORT, lines);
    return lines.length;
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
        search={list.search}
        onSearch={list.setSearch}
        searchPlaceholder="Search contractor, trade, people"
        extra={
          <>
            <ExportButton onExport={exportRows} />
            {canRecord ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
                Record attendance
              </Button>
            ) : null}
          </>
        }
      >
        <DatePicker.RangePicker presets={rangePresets()}
          value={range}
          onChange={(v) => {
            setRange(v as [Dayjs | null, Dayjs | null] | null);
            list.resetPage();
          }}
          format="DD MMM YYYY"
          allowEmpty={[true, true]}
        />
      </ListToolbar>
      <AttendanceTable
        data={data?.items ?? []}
        loading={isLoading || isFetching}
        showProject={!fixedProject}
        onOpen={setOpened}
        canEdit={canRecord}
        table={list.tableProps<AttendanceSheetDto>(data?.total)}
        sortOrderFor={list.sortOrderFor}
      />
      <AttendanceFormModal
        open={formOpen || !!opened}
        sheet={opened}
        projectId={fixedProject}
        onClose={() => {
          setFormOpen(false);
          setOpened(null);
        }}
      />
    </>
  );
}
