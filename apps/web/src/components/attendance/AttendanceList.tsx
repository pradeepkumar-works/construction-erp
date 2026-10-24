'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button, Tooltip, theme } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import { LockOutlined, PlusOutlined } from '@ant-design/icons';
import type { AttendanceSheetDto, AttendanceSortField } from '@erp/shared';
import { LIST_SORT_FIELDS, canRecordAttendance } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useAttendanceList } from '@/lib/queries';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { ATTENDANCE_EXPORT, attendanceExportRows } from '@/lib/exportColumns';
import { formatDate } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { EmptyArt } from '@/components/common/EmptyArt';
import { StatusTag } from '@/components/common/StatusTag';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { DateRangeFilter } from '@/components/list/DateRangeFilter';
import { exportSelected } from '@/components/list/bulk';
import { useListFrame } from '@/components/list/useListFrame';
import { RecordLink } from '@/components/record/RecordLink';
import { AttendanceFormModal } from './AttendanceFormModal';

const KEYS = ['from', 'to'] as const;

function Sub({ children }: { children: React.ReactNode }) {
  const { token } = theme.useToken();
  return <span style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{children}</span>;
}

/** Server-paged attendance register with project and date-range filters and Excel export (one row per contractor and trade). */
export function AttendanceList({ projectId: fixedProject }: { projectId?: string }) {
  const { user } = useAuth();
  const canRecord = !!user && canRecordAttendance(user.roleKey);
  const [formOpen, setFormOpen] = useState(false);
  const [opened, setOpened] = useState<AttendanceSheetDto | null>(null);
  const frame = useListFrame<AttendanceSortField, AttendanceSheetDto>({
    list: 'attendance',
    url: false,
    keys: KEYS,
    sortBy: 'date',
    sortOrder: 'desc',
    sortFields: LIST_SORT_FIELDS.attendance,
    fixedProject,
    columns: (sortOrderFor): ListColumn<AttendanceSheetDto>[] => {
      const sort = (key: AttendanceSortField) => ({ key, sorter: true, sortOrder: sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });
      return [
        { title: 'Date', dataIndex: 'date', width: 120, locked: true, render: (v: string, r) => <RecordLink onOpen={() => setOpened(r)} strong>{formatDate(v)}</RecordLink>, ...sort('date') },
        ...(fixedProject
          ? []
          : [{ title: 'Project', dataIndex: 'projectName', ...sort('project'), width: 240, ellipsis: true, render: (v: string, r: AttendanceSheetDto) => <Link href={`/projects/${r.projectId}`}>{v}</Link> } satisfies ListColumn<AttendanceSheetDto>]),
        { title: 'Workers', dataIndex: 'totalWorkers', width: 110, align: 'center', ...sort('totalWorkers'), total: (rows) => rows.reduce((n, r) => n + r.totalWorkers, 0) },
        {
          title: 'By trade',
          key: 'manpower',
          render: (_, r) =>
            r.manpower.length ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {r.manpower.map((m) => (
                  <AppTag key={m.category} style={{ margin: 0 }}>
                    {m.category} {m.count}
                  </AppTag>
                ))}
              </div>
            ) : (
              <Sub>{r.remarks || 'No workers'}</Sub>
            ),
        },
        { title: 'Contractors', key: 'contractors', width: 220, ellipsis: true, render: (_, r) => [...new Set(r.lines.map((l) => l.contractor))].join(', ') || '-' },
        { title: 'Recorded by', dataIndex: 'recordedByName', width: 150, ...sort('recordedBy') },
        {
          title: 'DPR',
          key: 'dpr',
          fixed: 'right' as const,
          width: 170,
          render: (_, r) => (
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              {r.dprStatus ? <StatusTag status={r.dprStatus} /> : <Sub>Not filed</Sub>}
              {r.locked ? (
                <Tooltip title="The DPR for this day is approved, so the sheet is locked">
                  <LockOutlined aria-label="Locked" />
                </Tooltip>
              ) : null}
            </span>
          ),
        },
      ];
    },
  });
  const { page } = frame;
  const filters = { page: page.params.page, pageSize: page.params.pageSize, q: page.params.q, sortBy: page.params.sortBy, sortOrder: page.params.sortOrder, projectId: frame.projectId, from: page.filters.from || undefined, to: page.filters.to || undefined };
  const { data, isLoading, isFetching, error, refetch } = useAttendanceList(filters);
  const rows = data?.items ?? [];

  const exportRows = async () => {
    const all = await fetchAllPages<AttendanceSheetDto>('/attendance', { ...filters });
    const lines = attendanceExportRows(all);
    await downloadXlsx(exportFileName('attendance'), 'attendance', ATTENDANCE_EXPORT, lines);
    return lines.length;
  };

  const newButton = canRecord ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
      Record attendance
    </Button>
  ) : null;

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar filters={frame.filterState}
        projectId={frame.projectFilter}
        onProject={frame.setProjectFilter}
        hideProject={!!fixedProject}
        search={page.search}
        onSearch={page.setSearch}
        searchPlaceholder="Search contractor, trade, people"
        searchLabel="Search attendance"
        extra={
          <>
            <ExportButton onExport={exportRows} />
            {newButton}
          </>
        }
      >
        <DateRangeFilter {...frame.dateRange} />
      </ListToolbar>
      <DataTable<AttendanceSheetDto>
        columns={frame.columns}
        visible={frame.choice.visible}
        onChooseColumns={frame.choice.setChosen}
        chosenIsDefault={frame.choice.isDefault}
        rows={rows}
        loading={isLoading || isFetching}
        table={page.tableProps<AttendanceSheetDto>(data?.total)}
        onOpen={(id) => setOpened(rows.find((r) => r.id === id) ?? null)}
        bulk={[exportSelected<AttendanceSheetDto, ReturnType<typeof attendanceExportRows>[number]>('attendance', 'attendance', ATTENDANCE_EXPORT, attendanceExportRows)]}
        chips={frame.chips}
        empty={frame.empty}
        failed={!!error}
        scrollX={fixedProject ? 1000 : 1250}
        emptyText={<EmptyArt art="entries" title={page.filters.from || page.filters.to || page.params.q ? 'No sheet matches these filters' : canRecord ? 'No attendance yet. Record the day with Record attendance.' : 'No attendance yet'} />}
        emptyAction={newButton}
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
