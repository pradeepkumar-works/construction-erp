'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button, Tooltip } from 'antd';
import { LockOutlined, PlusOutlined } from '@/components/common/icons';
import type { AttendanceSheetDto, AttendanceSortField, ManpowerLine } from '@erp/shared';
import { LIST_SORT_FIELDS, MAX_PAGE_SIZE, canRecordAttendance, plural } from '@erp/shared';
import { tk } from '@/ds';
import { useAuth } from '@/lib/auth';
import { useAttendanceList } from '@/lib/queries';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { ATTENDANCE_EXPORT, attendanceExportRows } from '@/lib/exportColumns';
import { formatDate, formatDayMonth, todayDate } from '@/lib/format';
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
import { SiteDayGrid, gridDays, useFilingSites } from '@/components/site-days/SiteDayGrid';
import { AttendanceFormModal } from './AttendanceFormModal';

const KEYS = ['from', 'to'] as const;

function Sub({ children }: { children: React.ReactNode }) {
  return <span style={{ ...tk.type.caption, color: tk.color.text.muted }}>{children}</span>;
}

/** The day's trades on one line: "Mason 8 · Helper 20". */
const tradesLine = (manpower: ManpowerLine[]) => manpower.map((m) => `${m.category} ${m.count}`).join(' · ');

/**
 * Server-paged attendance register with project and date-range filters and Excel export (one row per contractor and trade).
 * Across projects it opens on Days, the head count of each site by day, so a day with none shows as an empty cell
 * (ARCHITECTURE "Views that fit the data"); the days follow the project and the date range, search is the table's.
 */
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
    viewKinds: fixedProject ? undefined : ['days', 'table'],
    columns: (sortOrderFor): ListColumn<AttendanceSheetDto>[] => {
      const sort = (key: AttendanceSortField) => ({ key, sorter: true, sortOrder: sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });
      return [
        { title: 'Date', dataIndex: 'date', width: 120, locked: true, render: (v: string, r) => <RecordLink onOpen={() => setOpened(r)} strong>{formatDate(v)}</RecordLink>, ...sort('date') },
        ...(fixedProject
          ? []
          : [{ title: 'Project', dataIndex: 'projectName', ...sort('project'), width: 240, ellipsis: true, render: (v: string, r: AttendanceSheetDto) => <Link href={`/projects/${r.projectId}`}>{v}</Link> } satisfies ListColumn<AttendanceSheetDto>]),
        { title: 'Workers', dataIndex: 'totalWorkers', width: 110, align: 'center', ...sort('totalWorkers') },
        {
          title: 'By trade',
          key: 'manpower',
          ellipsis: true,
          render: (_, r) => {
            const line = tradesLine(r.manpower);
            return line ? (
              <span translate="no" title={line}>
                {line}
              </span>
            ) : (
              <Sub>{r.remarks || 'No workers'}</Sub>
            );
          },
        },
        { title: 'Contractors', key: 'contractors', width: 220, ellipsis: true, render: (_, r) => [...new Set(r.lines.map((l) => l.contractor))].join(', ') || '-' },
        { title: 'Recorded by', dataIndex: 'recordedByName', width: 150, ...sort('recordedBy') },
        {
          title: 'DPR',
          key: 'dpr',
          fixed: 'right' as const,
          width: 170,
          render: (_, r) => (
            <span style={{ display: 'inline-flex', gap: tk.space[2], alignItems: 'center' }}>
              {r.dprStatus ? <StatusTag status={r.dprStatus} /> : <Sub>Not filed</Sub>}
              {r.locked ? (
                <Tooltip title={`Payroll for this month is approved (${r.lockedByRun}), so the sheet is locked`}>
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
  const onDays = frame.view === 'days';
  const { data, isLoading, isFetching, error, refetch } = useAttendanceList(filters, !onDays);
  const rows = data?.items ?? [];
  const days = gridDays(page.filters.from || undefined, page.filters.to || undefined, todayDate());
  const grid = useAttendanceList({ projectId: frame.projectId, from: days[0], to: days[days.length - 1], pageSize: MAX_PAGE_SIZE, sortBy: 'date', sortOrder: 'desc' }, onDays);
  const sites = useFilingSites(frame.projectId);
  const shown = onDays ? grid : { error, refetch };

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
      {shown.error && <QueryError error={shown.error} onRetry={() => shown.refetch()} />}
      <ListToolbar filters={frame.filterState}
        projectId={frame.projectFilter}
        onProject={frame.setProjectFilter}
        hideProject={!!fixedProject}
        search={page.search}
        onSearch={onDays ? undefined : page.setSearch}
        searchPlaceholder="Search contractor, trade, people"
        searchLabel="Search attendance"
        view={frame.viewToggle}
        extra={
          <>
            <ExportButton onExport={exportRows} />
            {newButton}
          </>
        }
      >
        <DateRangeFilter {...frame.dateRange} />
      </ListToolbar>
      {onDays ? (
        <SiteDayGrid<AttendanceSheetDto>
          label="Head count by site and day"
          sites={sites.sites}
          entries={grid.data?.items ?? []}
          days={days}
          loading={sites.isLoading || grid.isLoading}
          shown={grid.data?.items.length ?? 0}
          total={grid.data?.total ?? 0}
          missingWord="No head count"
          cell={(sheets, day, site) => {
            const s = sheets[0];
            return (
              <Tooltip title={s.manpower.length ? tradesLine(s.manpower) : s.remarks || 'No workers'}>
                <Button type="text" size="small" onClick={() => setOpened(s)} aria-label={`Head count, ${site.name}, ${formatDayMonth(day)}, ${plural(s.totalWorkers, 'worker')}`}>
                  <span translate="no">{s.totalWorkers}</span>
                </Button>
              </Tooltip>
            );
          }}
        />
      ) : (
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
          emptyText={<EmptyArt art="entries" title={page.filters.from || page.filters.to || page.params.q ? 'No sheet matches these filters' : canRecord ? 'No attendance yet. Record the day with Record attendance.' : 'No attendance yet'} />}
          emptyAction={newButton}
        />
      )}
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
