'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button, Select, theme } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { SafetyIncidentDto, SafetyIncidentStatus, SafetyIncidentType } from '@erp/shared';
import { SAFETY_INCIDENT_STATUSES, SAFETY_INCIDENT_STATUS_LABELS, SAFETY_INCIDENT_TYPES, SAFETY_INCIDENT_TYPE_LABELS, canReportSafety } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useSafetyIncidents } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { downloadXlsx, exportFileName, fetchAllPages, type ExportColumn } from '@/lib/exportExcel';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { exportSelected } from '@/components/list/bulk';
import { useListFrame } from '@/components/list/useListFrame';
import { RecordLink } from '@/components/record/RecordLink';
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

const KEYS = ['type', 'status'] as const;

function Sub({ children }: { children: React.ReactNode }) {
  const { token } = theme.useToken();
  return <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{children}</div>;
}

/** The incident and near-miss register. */
export function IncidentList({ projectId: fixedProject, initialOpenId }: { projectId?: string; initialOpenId?: string }) {
  const { user } = useAuth();
  const [openId, setOpenId] = useState<string | null>(initialOpenId ?? null);
  const [form, setForm] = useState<{ nearMiss: boolean } | null>(null);
  const [editing, setEditing] = useState<SafetyIncidentDto | null>(null);
  const frame = useListFrame<'date', SafetyIncidentDto>({
    list: 'safety-incidents',
    url: false,
    keys: KEYS,
    sortBy: 'date',
    sortOrder: 'desc',
    sortFields: ['date'],
    fixedProject,
    statusLabels: SAFETY_INCIDENT_STATUS_LABELS,
    chipLabels: { type: (v) => (v === 'INCIDENTS' ? 'All but near misses' : `Type: ${SAFETY_INCIDENT_TYPE_LABELS[v as SafetyIncidentType] ?? v}`) },
    columns: (): ListColumn<SafetyIncidentDto>[] => [
      { key: 'incidentNo', title: 'No.', dataIndex: 'incidentNo', width: 135, className: 'mono' },
      { key: 'date', title: 'Date', dataIndex: 'date', width: 120, render: (v, r) => `${formatDate(v)}${r.time ? ` ${r.time}` : ''}` },
      ...(fixedProject
        ? []
        : [{ key: 'projectName', title: 'Project', dataIndex: 'projectName', width: 200, ellipsis: true, render: (v: string, r: SafetyIncidentDto) => <Link href={`/projects/${r.projectId}?tab=safety`}>{v}</Link> } satisfies ListColumn<SafetyIncidentDto>]),
      { key: 'type', title: 'Type', dataIndex: 'type', width: 150, render: (t) => <IncidentTypeTag type={t} /> },
      {
        key: 'description',
        title: 'What happened',
        dataIndex: 'description',
        locked: true,
        render: (v, r) => (
          <div>
            <RecordLink onOpen={() => setOpenId(r.id)}>{r.location}</RecordLink>
            <Sub>{v.length > 140 ? `${v.slice(0, 137)}...` : v}</Sub>
          </div>
        ),
      },
      { key: 'injuredCount', title: 'Hurt', label: 'People hurt', dataIndex: 'injuredCount', width: 70, align: 'center', render: (v) => (v ? <strong>{v}</strong> : <Sub>-</Sub>), total: (rows) => rows.reduce((n, r) => n + r.injuredCount, 0) },
      { key: 'daysLost', title: 'Days off', label: 'Days off work', dataIndex: 'daysLost', width: 90, align: 'center', defaultHidden: true, render: (v: number | null) => v ?? <Sub>-</Sub> },
      { key: 'reportedByName', title: 'Reported by', dataIndex: 'reportedByName', width: 150 },
      { key: 'status', title: 'Status', dataIndex: 'status', width: 90, fixed: 'right' as const, render: (s) => <IncidentStatusTag status={s} /> },
    ],
  });
  const { page } = frame;
  const type = page.filters.type as SafetyIncidentType | 'INCIDENTS' | undefined;
  const status = page.filters.status as SafetyIncidentStatus | undefined;
  const filters = { page: page.params.page, pageSize: page.params.pageSize, q: page.params.q, sortOrder: page.params.sortOrder, projectId: frame.projectId, type: type === 'INCIDENTS' ? undefined : type, incidentsOnly: type === 'INCIDENTS' || undefined, status };
  const { data, isLoading, isFetching, error, refetch } = useSafetyIncidents(filters);
  const mayReport = !!user && canReportSafety(user.roleKey);

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar
        projectId={frame.projectFilter}
        onProject={frame.setProjectFilter}
        hideProject={!!fixedProject}
        search={page.search}
        onSearch={page.setSearch}
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
          aria-label="Type"
          style={{ width: 190 }}
          value={type}
          onChange={(v) => page.setFilter('type', v)}
          options={[{ value: 'INCIDENTS', label: 'All but near misses' }, ...SAFETY_INCIDENT_TYPES.map((t) => ({ value: t, label: SAFETY_INCIDENT_TYPE_LABELS[t] }))]}
        />
        <Select<SafetyIncidentStatus>
          allowClear
          placeholder="Open and closed"
          aria-label="Status"
          style={{ width: 150 }}
          value={status}
          onChange={(v) => page.setFilter('status', v)}
          options={SAFETY_INCIDENT_STATUSES.map((s) => ({ value: s, label: SAFETY_INCIDENT_STATUS_LABELS[s] }))}
        />
      </ListToolbar>
      <DataTable<SafetyIncidentDto>
        className="incident-list"
        columns={frame.columns}
        visible={frame.choice.visible}
        onChooseColumns={frame.choice.setChosen}
        chosenIsDefault={frame.choice.isDefault}
        rows={data?.items ?? []}
        loading={isLoading || isFetching}
        table={page.tableProps<SafetyIncidentDto>(data?.total)}
        onOpen={setOpenId}
        bulk={[exportSelected<SafetyIncidentDto>('incident-register', 'incidents', EXPORT)]}
        chips={frame.chips}
        scrollX={fixedProject ? 1000 : 1200}
        emptyText={<EmptyArt art="entries" title={type || status || page.params.q ? 'No incident matches these filters' : 'No incidents or near misses recorded'} />}
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
