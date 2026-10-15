'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button, Select, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { SafetyIncidentDto, SafetyIncidentStatus, SafetyIncidentType } from '@erp/shared';
import { SAFETY_INCIDENT_STATUSES, SAFETY_INCIDENT_STATUS_LABELS, SAFETY_INCIDENT_TYPES, SAFETY_INCIDENT_TYPE_LABELS, canReportSafety } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useSafetyIncidents } from '@/lib/queries';
import { useListState } from '@/lib/listState';
import { formatDate } from '@/lib/format';
import { downloadXlsx, exportFileName, fetchAllPages, type ExportColumn } from '@/lib/exportExcel';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { IncidentDrawer } from './IncidentDrawer';
import { IncidentFormModal } from './IncidentFormModal';
import { IncidentStatusTag, IncidentTypeTag } from './safetyUi';

const EXPORT: ExportColumn<SafetyIncidentDto>[] = [
  { header: 'No.', value: (r) => r.incidentNo, width: 15 },
  { header: 'Project', value: (r) => r.projectName, width: 30 },
  { header: 'Date', value: (r) => r.date, width: 12 },
  { header: 'Time', value: (r) => r.time ?? '', width: 8 },
  { header: 'Type', value: (r) => SAFETY_INCIDENT_TYPE_LABELS[r.type], width: 18 },
  { header: 'Where', value: (r) => r.location, width: 28 },
  { header: 'What happened', value: (r) => r.description, width: 50 },
  { header: 'People hurt', value: (r) => r.injuredCount, width: 10 },
  { header: 'Names', value: (r) => r.injuredNames ?? '', width: 24 },
  { header: 'Days off work', value: (r) => r.daysLost ?? '', width: 10 },
  { header: 'Whose workers', value: (r) => r.contractor ?? '', width: 24 },
  { header: 'Immediate action', value: (r) => r.immediateAction ?? '', width: 36 },
  { header: 'Root cause', value: (r) => r.rootCause ?? '', width: 36 },
  { header: 'Corrective action', value: (r) => r.correctiveAction ?? '', width: 36 },
  { header: 'Status', value: (r) => SAFETY_INCIDENT_STATUS_LABELS[r.status], width: 10 },
  { header: 'Reported by', value: (r) => r.reportedByName, width: 20 },
];

/** The incident and near-miss register. */
export function IncidentList({ projectId: fixedProject, initialOpenId }: { projectId?: string; initialOpenId?: string }) {
  const { user } = useAuth();
  const list = useListState<'date'>({ sortBy: 'date', sortOrder: 'desc' });
  const [projectFilter, setProjectFilter] = useState<string | undefined>();
  const [type, setType] = useState<SafetyIncidentType | 'INCIDENTS' | undefined>();
  const [status, setStatus] = useState<SafetyIncidentStatus | undefined>();
  const [openId, setOpenId] = useState<string | null>(initialOpenId ?? null);
  const [form, setForm] = useState<{ nearMiss: boolean } | null>(null);
  const [editing, setEditing] = useState<SafetyIncidentDto | null>(null);
  const projectId = fixedProject ?? projectFilter;
  const { sortBy: _sortBy, ...paging } = list.params;
  const filters = { ...paging, projectId, type: type === 'INCIDENTS' ? undefined : type, incidentsOnly: type === 'INCIDENTS' || undefined, status };
  const { data, isLoading, isFetching, error, refetch } = useSafetyIncidents(filters);
  const mayReport = !!user && canReportSafety(user.roleKey);
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    list.resetPage();
  };

  const columns: TableProps<SafetyIncidentDto>['columns'] = [
    { title: 'No.', dataIndex: 'incidentNo', width: 135, className: 'mono' },
    { title: 'Date', dataIndex: 'date', width: 120, render: (v, r) => `${formatDate(v)}${r.time ? ` ${r.time}` : ''}` },
    ...(fixedProject ? [] : [{ title: 'Project', dataIndex: 'projectName', width: 200, ellipsis: true, render: (v: string, r: SafetyIncidentDto) => <Link href={`/projects/${r.projectId}?tab=safety`}>{v}</Link> }]),
    { title: 'Type', dataIndex: 'type', width: 150, render: (t) => <IncidentTypeTag type={t} /> },
    {
      title: 'What happened',
      dataIndex: 'description',
      render: (v, r) => (
        <div>
          <Typography.Link onClick={() => setOpenId(r.id)}>{r.location}</Typography.Link>
          <div className="text-muted" style={{ fontSize: 12 }}>
            {v.length > 140 ? `${v.slice(0, 137)}...` : v}
          </div>
        </div>
      ),
    },
    { title: 'Hurt', dataIndex: 'injuredCount', width: 70, align: 'center', render: (v) => (v ? <strong>{v}</strong> : <span className="text-muted">-</span>) },
    { title: 'Reported by', dataIndex: 'reportedByName', width: 150 },
    { title: 'Status', dataIndex: 'status', width: 90, fixed: 'right' as const, render: (s) => <IncidentStatusTag status={s} /> },
  ];

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar
        projectId={projectFilter}
        onProject={reset(setProjectFilter)}
        hideProject={!!fixedProject}
        search={list.search}
        onSearch={list.setSearch}
        searchPlaceholder="Search no., place, details"
        extra={
          <>
            <ExportButton
              onExport={async () => {
                const rows = await fetchAllPages<SafetyIncidentDto>('/safety/incidents', filters);
                downloadXlsx(exportFileName('incident-register'), 'incidents', EXPORT, rows);
                return rows.length;
              }}
            />
            {mayReport ? (
              <>
                <Button icon={<PlusOutlined />} onClick={() => setForm({ nearMiss: true })}>
                  Near miss
                </Button>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setForm({ nearMiss: false })}>
                  Report incident
                </Button>
              </>
            ) : null}
          </>
        }
      >
        <Select
          allowClear
          placeholder="All types"
          style={{ width: 190 }}
          value={type}
          onChange={reset(setType)}
          options={[{ value: 'INCIDENTS', label: 'All but near misses' }, ...SAFETY_INCIDENT_TYPES.map((t) => ({ value: t, label: SAFETY_INCIDENT_TYPE_LABELS[t] }))]}
        />
        <Select allowClear placeholder="Open and closed" style={{ width: 150 }} value={status} onChange={reset(setStatus)} options={SAFETY_INCIDENT_STATUSES.map((s) => ({ value: s, label: SAFETY_INCIDENT_STATUS_LABELS[s] }))} />
      </ListToolbar>
      <Table<SafetyIncidentDto>
        rowKey="id"
        className="incident-list"
        size="middle"
        loading={isLoading || isFetching}
        columns={columns}
        dataSource={data?.items ?? []}
        {...list.tableProps<SafetyIncidentDto>(data?.total)}
        onRow={(r) => ({ onClick: () => setOpenId(r.id), style: { cursor: 'pointer' } })}
        scroll={{ x: fixedProject ? 1000 : 1200 }}
        locale={{ emptyText: 'No incidents or near misses recorded' }}
      />
      <IncidentDrawer id={openId} open={!!openId} onClose={() => setOpenId(null)} onEdit={setEditing} />
      <IncidentFormModal
        open={!!form || !!editing}
        incident={editing}
        nearMiss={form?.nearMiss}
        projectId={fixedProject}
        onClose={() => {
          setForm(null);
          setEditing(null);
        }}
      />
    </>
  );
}
