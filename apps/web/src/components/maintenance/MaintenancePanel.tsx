'use client';

import React, { useState } from 'react';
import { Button, Select, Statistic, Table, Typography, theme } from 'antd';
import { PlusOutlined, ToolOutlined } from '@/components/common/icons';
import type { TableProps } from 'antd';
import type { MaintenanceJobDto, MaintenanceKind, MaintenanceStatus, ServiceStatusDto } from '@erp/shared';
import { MAINTENANCE_KINDS, MAINTENANCE_KIND_LABELS, MAINTENANCE_STATUSES, MAINTENANCE_STATUS_LABELS, canLogMachinery, canManageMaintenance } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useMaintenanceJobs, useMaintenanceSummary } from '@/lib/queries';
import { EquipmentSelect, useEquipmentItem } from '@/components/common/SearchSelect';
import { formatDate, formatINR, formatQty, toNumber, NO_VALUE } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { useListFrame } from '@/components/list/useListFrame';
import { RecordLink } from '@/components/record/RecordLink';
import { JobDrawer } from './JobDrawer';
import { JobFormModal } from './JobFormModal';
import { JobKindTag, JobStatusTag, ServiceStateTag, serviceLeft } from './maintenanceUi';
import { CardToolbar } from '@/components/common/CardToolbar';
import { themeColor, themeFontSize } from '@/lib/theme';

const big = { content: { fontSize: themeFontSize('fontSizeXL') } };
const KEYS = ['status', 'kind', 'equipmentId'] as const;

function Sub({ children }: { children: React.ReactNode }) {
  const { token } = theme.useToken();
  return <span style={{ color: token.colorTextSecondary }}>{children}</span>;
}

/**
 * Machinery maintenance (v4 item 42): service schedule of the fleet, open breakdowns and job cards. Site staff report
 * breakdowns; the store manager or an approver raises services, issues spares and closes job cards.
 */
export function MaintenancePanel({ projectId: fixedProject, initialOpenId }: { projectId?: string; initialOpenId?: string }) {
  const { user } = useAuth();
  const manager = !!user && canManageMaintenance(user.roleKey);
  const mayReport = manager || (!!user && canLogMachinery(user.roleKey));
  const [openId, setOpenId] = useState<string | null>(initialOpenId ?? null);
  const [form, setForm] = useState<{ kind: MaintenanceKind; equipmentId?: string } | null>(null);
  const [editing, setEditing] = useState<MaintenanceJobDto | null>(null);
  const frame = useListFrame<'date', MaintenanceJobDto>({
    list: 'maintenance-jobs',
    url: false,
    keys: KEYS,
    sortBy: 'date',
    sortOrder: 'desc',
    sortFields: ['date'],
    fixedProject,
    statusLabels: MAINTENANCE_STATUS_LABELS,
    chipLabels: {
      kind: (v) => MAINTENANCE_KIND_LABELS[v as MaintenanceKind] ?? v,
      equipmentId: () => (machine ? `Machine: ${machine.code}` : 'One machine'),
    },
    columns: (): ListColumn<MaintenanceJobDto>[] => [
      {
        key: 'jobNo',
        title: 'Job card',
        dataIndex: 'jobNo',
        width: 150,
        locked: true,
        render: (v: string, r) => (
          <RecordLink onOpen={() => setOpenId(r.id)} strong className="mono">
            {v}
          </RecordLink>
        ),
      },
      { key: 'date', title: 'Date', dataIndex: 'date', width: 110, render: (v: string) => formatDate(v) },
      {
        title: 'Machine',
        key: 'm',
        width: 220,
        render: (_, r) => (
          <span>
            <b className="mono" translate="no">{r.equipmentCode}</b> {r.equipmentName}
          </span>
        ),
      },
      { title: 'Type', dataIndex: 'kind', key: 'kind', width: 110, render: (v: MaintenanceKind) => <JobKindTag kind={v} /> },
      { key: 'description', title: 'Fault / work', dataIndex: 'description', ellipsis: true },
      ...(fixedProject ? [] : [{ key: 'projectName', title: 'At', dataIndex: 'projectName', width: 200, ellipsis: true, render: (v: string | null) => v ?? <Sub>Yard</Sub> } satisfies ListColumn<MaintenanceJobDto>]),
      { key: 'status', title: 'Status', dataIndex: 'status', width: 90, render: (v: MaintenanceStatus) => <JobStatusTag status={v} /> },
      { key: 'totalCost', title: 'Cost', dataIndex: 'totalCost', width: 110, align: 'right', render: (v: string, r) => (r.status === 'CLOSED' || Number(v) > 0 ? formatINR(v) : NO_VALUE), total: (rows) => formatINR(rows.reduce((n, r) => n + toNumber(r.totalCost), 0)) },
    ],
  });
  const { page, projectId } = frame;
  const { data: s } = useMaintenanceSummary(projectId);
  const status = page.filters.status as MaintenanceStatus | undefined;
  const kind = page.filters.kind as MaintenanceKind | undefined;
  const equipmentId = page.filters.equipmentId;
  // Read by the chip's label once the list has drawn.
  const machine = useEquipmentItem(equipmentId);
  const { data, isLoading, isFetching, error, refetch } = useMaintenanceJobs({ page: page.params.page, pageSize: page.params.pageSize, q: page.params.q, projectId, status, kind, equipmentId });

  const serviceColumns: TableProps<ServiceStatusDto>['columns'] = [
    {
      title: 'Machine',
      key: 'm',
      render: (_, r) => (
        <div>
          <b className="mono" translate="no">{r.equipmentCode}</b> {r.equipmentName}
          {!projectId ? <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>{r.projectName ?? 'Yard'}</div> : null}
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
    {
      title: 'Worked since',
      dataIndex: 'hoursSince',
      width: 120,
      align: 'right',
      render: (v, r) => (
        <span>
          {`${formatQty(v)} h`}
          {r.hoursFrom === 'METER' ? (
            <span className="text-muted" style={{ display: 'block', fontSize: themeFontSize('fontSizeSM') }}>
              hour meter
            </span>
          ) : null}
        </span>
      ),
    },
    { title: 'Due', key: 'due', width: 220, render: (_, r) => <span className={r.state === 'OVERDUE' ? 'text-danger' : undefined}>{serviceLeft(r.hoursLeft, r.daysLeft)}</span> },
    { title: 'Status', dataIndex: 'state', width: 100, render: (v) => <ServiceStateTag state={v} /> },
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

  const newButton = mayReport ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setForm({ kind: 'BREAKDOWN' })}>
      Report breakdown
    </Button>
  ) : null;

  return (
    <div className="maintenance-panel">
      {s ? (
        <CardToolbar className="maintenance-summary" variant="summary" wrap gap={28}>
          <Statistic title="Open job cards" value={s.openJobs} styles={big} />
          <Statistic title="Machines broken down" value={s.openBreakdowns} styles={{ content: { fontSize: themeFontSize('fontSizeXL'), color: s.openBreakdowns ? themeColor('colorErrorText') : undefined } }} />
          <Statistic title="Service overdue / due soon" value={`${s.service.filter((x) => x.state === 'OVERDUE').length} / ${s.service.filter((x) => x.state === 'DUE_SOON').length}`} styles={big} />
          <Statistic title="Closed this month" value={s.closedThisMonth} suffix={<span style={{ fontSize: themeFontSize('fontSizeSM') }}>{formatQty(s.downtimeHoursThisMonth)} h down</span>} styles={big} />
          <Statistic title="Repair cost this month" value={formatINR(s.costThisMonth)} styles={big} />
        </CardToolbar>
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
      <ListToolbar filters={frame.filterState}
        search={page.search}
        onSearch={page.setSearch}
        projectId={frame.projectFilter}
        onProject={(v) => {
          frame.setProjectFilter(v);
          page.setFilter('equipmentId', undefined);
        }}
        hideProject={!!fixedProject}
        searchPlaceholder="Search job, machine, fault, workshop"
        searchLabel="Search maintenance jobs"
        extra={
          <>
            {manager ? (
              <Button icon={<ToolOutlined />} onClick={() => setForm({ kind: 'SERVICE' })}>
                Raise service
              </Button>
            ) : null}
            {newButton}
          </>
        }
      >
        <Select
          allowClear
          placeholder="Open and closed"
          aria-label="Status"
          style={{ width: 150 }}
          value={status}
          onChange={(v) => page.setFilter('status', v)}
          options={MAINTENANCE_STATUSES.map((x) => ({ value: x, label: MAINTENANCE_STATUS_LABELS[x] }))}
        />
        <Select
          allowClear
          placeholder="Services and breakdowns"
          aria-label="Type"
          style={{ width: 190 }}
          value={kind}
          onChange={(v) => page.setFilter('kind', v)}
          options={MAINTENANCE_KINDS.map((x) => ({ value: x, label: MAINTENANCE_KIND_LABELS[x] }))}
        />
        <EquipmentSelect
          allowClear
          placeholder="All machines"
          aria-label="Machine"
          style={{ width: 220 }}
          params={projectId ? { projectId } : undefined}
          value={equipmentId}
          onChange={(v) => page.setFilter('equipmentId', v)}
        />
      </ListToolbar>
      <DataTable<MaintenanceJobDto>
        className="job-table"
        columns={frame.columns}
        visible={frame.choice.visible}
        onChooseColumns={frame.choice.setChosen}
        chosenIsDefault={frame.choice.isDefault}
        rows={data?.items ?? []}
        loading={isLoading || isFetching}
        table={page.tableProps<MaintenanceJobDto>(data?.total)}
        onOpen={setOpenId}
        chips={frame.chips}
        empty={frame.empty}
        failed={!!error}
        scrollX={1000}
        emptyText={<EmptyArt art="entries" title={status || kind || equipmentId || page.params.q ? 'No job card matches these filters' : 'No job cards yet'} />}
        emptyAction={newButton}
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
