'use client';

import React, { useState } from 'react';
import { Button, Select, Statistic, Table, Typography } from 'antd';
import { PlusOutlined, ToolOutlined } from '@ant-design/icons';
import type { TableProps } from 'antd';
import type { MaintenanceJobDto, MaintenanceKind, MaintenanceStatus, ServiceStatusDto } from '@erp/shared';
import { MAINTENANCE_KINDS, MAINTENANCE_KIND_LABELS, MAINTENANCE_STATUSES, MAINTENANCE_STATUS_LABELS, MAX_PAGE_SIZE, canLogMachinery, canManageMaintenance } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useEquipment, useMaintenanceJobs, useMaintenanceSummary } from '@/lib/queries';
import { useListState } from '@/lib/listState';
import { formatDate, formatINR, formatQty } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { JobDrawer } from './JobDrawer';
import { JobFormModal } from './JobFormModal';
import { JobKindTag, JobStatusTag, ServiceStateTag, serviceLeft } from './maintenanceUi';

const big = { content: { fontSize: 18 } };

/**
 * Machinery maintenance (v4 item 42): service schedule of the fleet, open breakdowns and job cards. Site staff report
 * breakdowns; the store manager or an approver raises services, issues spares and closes job cards.
 */
export function MaintenancePanel({ projectId: fixedProject, initialOpenId }: { projectId?: string; initialOpenId?: string }) {
  const { user } = useAuth();
  const [projectFilter, setProjectFilter] = useState<string | undefined>();
  const projectId = fixedProject ?? projectFilter;
  const manager = !!user && canManageMaintenance(user.roleKey);
  const mayReport = manager || (!!user && canLogMachinery(user.roleKey));
  const { data: s } = useMaintenanceSummary(projectId);
  const list = useListState<'date'>({ sortBy: 'date', sortOrder: 'desc', pageSize: 20 });
  const [status, setStatus] = useState<MaintenanceStatus | undefined>();
  const [kind, setKind] = useState<MaintenanceKind | undefined>();
  const [equipmentId, setEquipmentId] = useState<string | undefined>();
  const [openId, setOpenId] = useState<string | null>(initialOpenId ?? null);
  const [form, setForm] = useState<{ kind: MaintenanceKind; equipmentId?: string } | null>(null);
  const [editing, setEditing] = useState<MaintenanceJobDto | null>(null);
  const { data: equipment } = useEquipment({ pageSize: MAX_PAGE_SIZE, projectId });
  const { data, isLoading, isFetching, error, refetch } = useMaintenanceJobs({ page: list.params.page, pageSize: list.params.pageSize, q: list.params.q, projectId, status, kind, equipmentId });

  const serviceColumns: TableProps<ServiceStatusDto>['columns'] = [
    {
      title: 'Machine',
      key: 'm',
      render: (_, r) => (
        <div>
          <b className="mono">{r.equipmentCode}</b> {r.equipmentName}
          {!projectId ? <div className="text-muted" style={{ fontSize: 12 }}>{r.projectName ?? 'Yard'}</div> : null}
        </div>
      ),
    },
    {
      title: 'Every',
      key: 'every',
      width: 150,
      render: (_, r) => [r.intervalHours ? `${formatQty(r.intervalHours)} h` : null, r.intervalDays ? `${r.intervalDays} days` : null].filter(Boolean).join(' or '),
    },
    { title: 'Last service', dataIndex: 'lastServiceDate', width: 120, render: (v) => (v ? formatDate(v) : <span className="text-muted">not recorded</span>) },
    { title: 'Worked since', dataIndex: 'hoursSince', width: 110, align: 'right', render: (v) => `${formatQty(v)} h` },
    { title: 'Due', key: 'due', width: 220, render: (_, r) => <span className={r.state === 'OVERDUE' ? 'text-danger' : undefined}>{serviceLeft(r.hoursLeft, r.daysLeft)}</span> },
    { title: 'State', dataIndex: 'state', width: 100, render: (v) => <ServiceStateTag state={v} /> },
    ...(manager
      ? [
          {
            title: '',
            key: 'a',
            width: 130,
            render: (_: unknown, r: ServiceStatusDto) =>
              r.openServiceJobId ? (
                <Button size="small" type="link" onClick={() => setOpenId(r.openServiceJobId)}>
                  Open job card
                </Button>
              ) : r.state === 'OVERDUE' || r.state === 'DUE_SOON' ? (
                <Button size="small" icon={<ToolOutlined />} onClick={() => setForm({ kind: 'SERVICE', equipmentId: r.equipmentId })}>
                  Raise service
                </Button>
              ) : null,
          },
        ]
      : []),
  ];

  const columns: TableProps<MaintenanceJobDto>['columns'] = [
    { title: 'Job card', dataIndex: 'jobNo', width: 150, className: 'mono', render: (v, r) => <a style={{ whiteSpace: 'nowrap' }} onClick={() => setOpenId(r.id)}>{v}</a> },
    { title: 'Date', dataIndex: 'date', width: 110, render: (v) => formatDate(v) },
    {
      title: 'Machine',
      key: 'm',
      width: 220,
      render: (_, r) => (
        <span>
          <b className="mono">{r.equipmentCode}</b> {r.equipmentName}
        </span>
      ),
    },
    { title: 'Type', dataIndex: 'kind', key: 'kind', width: 110, render: (v) => <JobKindTag kind={v} /> },
    { title: 'Fault / work', dataIndex: 'description', ellipsis: true },
    ...(projectId ? [] : [{ title: 'At', dataIndex: 'projectName', width: 200, ellipsis: true, render: (v: string | null) => v ?? <span className="text-muted">Yard</span> }]),
    { title: 'Status', dataIndex: 'status', width: 90, render: (v) => <JobStatusTag status={v} /> },
    { title: 'Cost', dataIndex: 'totalCost', width: 110, align: 'right', render: (v, r) => (r.status === 'CLOSED' || Number(v) > 0 ? formatINR(v) : '-') },
  ];

  return (
    <div className="maintenance-panel">
      {s ? (
        <div className="maintenance-summary" style={{ padding: '12px 16px', display: 'flex', gap: 28, flexWrap: 'wrap', borderBottom: '1px solid var(--ant-color-border-secondary, #f0f0f0)' }}>
          <Statistic title="Open job cards" value={s.openJobs} styles={big} />
          <Statistic title="Machines broken down" value={s.openBreakdowns} styles={{ content: { fontSize: 18, color: s.openBreakdowns ? 'var(--ant-color-error, #cf1322)' : undefined } }} />
          <Statistic title="Service overdue / due soon" value={`${s.service.filter((x) => x.state === 'OVERDUE').length} / ${s.service.filter((x) => x.state === 'DUE_SOON').length}`} styles={big} />
          <Statistic title="Closed this month" value={s.closedThisMonth} suffix={<span style={{ fontSize: 12 }}>{formatQty(s.downtimeHoursThisMonth)} h down</span>} styles={big} />
          <Statistic title="Repair cost this month" value={formatINR(s.costThisMonth)} styles={big} />
        </div>
      ) : null}
      {s && s.service.length ? (
        <div style={{ padding: '12px 16px 0' }}>
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            Service schedule
          </Typography.Title>
          <Table<ServiceStatusDto> className="service-table" size="small" rowKey="equipmentId" pagination={false} dataSource={s.service} columns={serviceColumns} scroll={{ x: 860 }} />
        </div>
      ) : null}
      <div style={{ padding: '12px 16px 0' }}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          Job cards
        </Typography.Title>
      </div>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar
        search={list.search}
        onSearch={list.setSearch}
        projectId={projectFilter}
        onProject={(v) => {
          setProjectFilter(v);
          setEquipmentId(undefined);
          list.resetPage();
        }}
        hideProject={!!fixedProject}
        searchPlaceholder="Search job, machine, fault, workshop"
        extra={
          <>
            {manager ? (
              <Button icon={<ToolOutlined />} onClick={() => setForm({ kind: 'SERVICE' })}>
                Raise service
              </Button>
            ) : null}
            {mayReport ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setForm({ kind: 'BREAKDOWN' })}>
                Report breakdown
              </Button>
            ) : null}
          </>
        }
      >
        <Select
          allowClear
          placeholder="Open and closed"
          style={{ width: 150 }}
          value={status}
          onChange={(v) => {
            setStatus(v);
            list.resetPage();
          }}
          options={MAINTENANCE_STATUSES.map((x) => ({ value: x, label: MAINTENANCE_STATUS_LABELS[x] }))}
        />
        <Select
          allowClear
          placeholder="Services and breakdowns"
          style={{ width: 190 }}
          value={kind}
          onChange={(v) => {
            setKind(v);
            list.resetPage();
          }}
          options={MAINTENANCE_KINDS.map((x) => ({ value: x, label: MAINTENANCE_KIND_LABELS[x] }))}
        />
        <Select
          allowClear
          showSearch={{ optionFilterProp: 'label' }}
          placeholder="All machines"
          style={{ width: 220 }}
          value={equipmentId}
          onChange={(v) => {
            setEquipmentId(v);
            list.resetPage();
          }}
          options={(equipment?.items ?? []).map((e) => ({ value: e.id, label: `${e.code} · ${e.name}` }))}
        />
      </ListToolbar>
      <Table<MaintenanceJobDto>
        className="job-table"
        size="middle"
        rowKey="id"
        loading={isLoading || isFetching}
        dataSource={data?.items ?? []}
        columns={columns}
        {...list.tableProps<MaintenanceJobDto>(data?.total)}
        onRow={(r) => ({ onClick: () => setOpenId(r.id), style: { cursor: 'pointer' } })}
        scroll={{ x: 1000 }}
      />
      <JobDrawer id={openId} open={!!openId} onClose={() => setOpenId(null)} onEdit={setEditing} />
      <JobFormModal
        open={!!form || !!editing}
        job={editing}
        kind={form?.kind}
        equipmentId={form?.equipmentId}
        projectId={fixedProject}
        onClose={() => {
          setForm(null);
          setEditing(null);
        }}
      />
    </div>
  );
}
