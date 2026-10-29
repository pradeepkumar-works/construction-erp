'use client';

import React from 'react';
import { App, Select, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import type { DeviceLinkDto } from '@erp/shared';
import { MAX_PAGE_SIZE } from '@erp/shared';
import { errorMessage } from '@/lib/api';
import { useDeviceLinks, useEquipment, useIntegrationAction } from '@/lib/queries';
import { formatDateTime } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ProjectSelect } from '@/components/common/ProjectSelect';

/** Devices the connections report on (trackers, meters, weighbridges), each matched by hand to a machine and a site. */
export function Devices() {
  const { message } = App.useApp();
  const { data, isLoading, error, refetch } = useDeviceLinks();
  const machines = useEquipment({ pageSize: MAX_PAGE_SIZE, sortBy: 'code', sortOrder: 'asc' });
  const act = useIntegrationAction();
  const save = (d: DeviceLinkDto, body: { equipmentId?: string | null; projectId?: string | null }, done: string) =>
    act
      .mutateAsync({ method: 'patch', path: `/integrations/devices/${d.id}`, body })
      .then(() => message.success(done))
      .catch((err) => message.error(errorMessage(err, 'That did not go through. Try again.')));
  const machineOptions = (machines.data?.items ?? []).map((m) => ({ value: m.id, label: `${m.code} ${m.name}` }));

  const columns: TableProps<DeviceLinkDto>['columns'] = [
    {
      title: 'Device',
      key: 'device',
      width: 240,
      render: (_, d) => (
        <span>
          {d.label ?? 'No name sent'}
          <Typography.Text type="secondary" translate="no">{` · ${d.externalId}`}</Typography.Text>
        </span>
      ),
    },
    { title: 'Connection', dataIndex: 'connectionName', width: 180, ellipsis: true },
    {
      title: 'Machine',
      key: 'machine',
      width: 260,
      render: (_, d) => (
        <Select
          size="small"
          allowClear
          showSearch={{ optionFilterProp: 'label' }}
          style={{ width: '100%' }}
          aria-label={`Machine for ${d.label ?? d.externalId}`}
          placeholder="Not matched"
          loading={machines.isLoading}
          value={d.equipmentId ?? undefined}
          options={machineOptions}
          onChange={(v: string | undefined) => save(d, { equipmentId: v ?? null }, v ? 'Matched to the machine' : 'Match cleared')}
        />
      ),
    },
    {
      title: 'Site',
      key: 'site',
      width: 220,
      render: (_, d) => (
        <ProjectSelect
          size="small"
          allowClear
          style={{ width: '100%' }}
          aria-label={`Site for ${d.label ?? d.externalId}`}
          placeholder="The connection’s site"
          value={d.projectId ?? undefined}
          onChange={(v: string | undefined) => save(d, { projectId: v ?? null }, 'Site saved')}
        />
      ),
    },
    { title: 'Last heard', dataIndex: 'lastSeenAt', width: 170, render: (v: string) => formatDateTime(v) },
    { title: 'Readings', dataIndex: 'readings', width: 90, align: 'right', render: (v: number) => <span translate="no">{v}</span> },
  ];

  return (
    <div style={{ padding: 16 }}>
      <Typography.Paragraph type="secondary" style={{ margin: '0 0 12px', maxWidth: 680 }}>
        Every device a connection has reported on shows here the first time it is heard from. Match each to its machine so its hours and fuel go on the right log.
      </Typography.Paragraph>
      {error ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : (
        <Table<DeviceLinkDto> rowKey="id" size="small" loading={isLoading} columns={columns} dataSource={data ?? []} pagination={false} scroll={{ x: 1180 }} locale={{ emptyText: 'No devices heard from yet.' }} />
      )}
    </div>
  );
}
