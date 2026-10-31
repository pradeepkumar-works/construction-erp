'use client';

import React, { useState } from 'react';
import { Button, Space, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import type { MachineDayDto } from '@erp/shared';
import { canLogMachinery, canManageIntegrations, distanceText } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useMachineDays } from '@/lib/queries';
import { useProjectScope } from '@/lib/project-scope';
import { formatDate, formatQty } from '@/lib/format';
import { themeFontSize } from '@/lib/theme';
import { AppTag } from '@/components/common/AppTag';
import { LinkButton } from '@/components/common/LinkButton';
import { QueryError } from '@/components/common/QueryState';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { StatusTag } from '@/components/common/StatusTag';
import { EmptyLine } from '@/components/common/EmptyArt';
import { DateRangeFilter } from '@/components/list/DateRangeFilter';
import { RecordLink } from '@/components/record/RecordLink';
import type { SubmissionStatus } from '@erp/shared';
import { MachineryDrawer } from './MachineryDrawer';
import { MachineryFormModal, type MachineryPrefill } from './MachineryFormModal';
import { fuelTags } from './FuelTanks';

const hrs = (v: string | null) =>
  v === null ? (
    <span className="text-muted">-</span>
  ) : (
    <span className="mono" translate="no">
      {formatQty(v)} h
    </span>
  );

/**
 * Engine hours: each machine's day from its tracker or its maker's feed, beside the day's log. A log with
 * more hours than the engine ran, a working day with no log and a machine beyond its site's radius stand out.
 */
export function EngineHoursPanel({ projectId: fixedProject }: { projectId?: string }) {
  const { user } = useAuth();
  const [scope, setScope] = useProjectScope();
  const projectId = fixedProject ?? scope;
  const [range, setRange] = useState<{ from?: string; to?: string }>({});
  const { data, isLoading, error, refetch } = useMachineDays({ ...range, projectId });
  const [openId, setOpenId] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<MachineryPrefill | null>(null);
  const mayLog = !!user && canLogMachinery(user.roleKey);
  const admin = !!user && canManageIntegrations(user.roleKey);

  const columns: TableProps<MachineDayDto>['columns'] = [
    { title: 'Date', dataIndex: 'date', width: 110, render: (v: string) => formatDate(v) },
    {
      title: 'Machine',
      key: 'machine',
      render: (_, d) => (
        <div>
          <span className="mono" translate="no">
            {d.equipmentCode}
          </span>{' '}
          {d.equipmentName}
          {!fixedProject && d.projectName ? (
            <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
              {d.projectName}
            </div>
          ) : null}
        </div>
      ),
    },
    { title: 'Engine', dataIndex: 'engineHours', width: 80, align: 'right', render: hrs },
    { title: 'Idle', dataIndex: 'idleHours', width: 70, align: 'right', render: hrs },
    {
      title: 'Hour meter',
      key: 'meter',
      width: 150,
      render: (_, d) =>
        d.meterStart === null ? (
          <span className="text-muted">No meter</span>
        ) : (
          <span className="mono" translate="no">
            {formatQty(d.meterStart)} → {formatQty(d.meterEnd ?? d.meterStart)}
          </span>
        ),
    },
    {
      title: 'Fuel used',
      dataIndex: 'fuelUsedLitres',
      width: 100,
      align: 'right',
      render: (v: string | null, d) =>
        v === null ? (
          <span className="text-muted">-</span>
        ) : (
          <div>
            <span className="mono" translate="no">
              {formatQty(v)} L
            </span>
            {d.fuel?.litresPerHour ? (
              <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }} translate="no">
                {`${formatQty(d.fuel.litresPerHour)} L/h`}
              </div>
            ) : null}
          </div>
        ),
    },
    {
      title: 'Log',
      key: 'log',
      width: 180,
      render: (_, d) =>
        d.log ? (
          <Space size={6} wrap>
            <RecordLink href={`/machinery/${d.log.id}`} onOpen={() => setOpenId(d.log!.id)}>
              {`${formatQty(d.log.hoursWorked)} h worked`}
            </RecordLink>
            <StatusTag status={d.log.status as SubmissionStatus} />
          </Space>
        ) : mayLog && Number(d.engineHours) > 0 ? (
          <Button size="small" onClick={() => setPrefill({ projectId: d.projectId, equipmentId: d.equipmentId, equipmentLabel: `${d.equipmentCode} - ${d.equipmentName}`, date: d.date })} aria-label={`Make the log for ${d.equipmentCode} on ${formatDate(d.date)}`}>
            Make the log
          </Button>
        ) : (
          <span className="text-muted">{Number(d.engineHours) > 0 ? 'No log' : 'Did not run'}</span>
        ),
    },
    {
      title: 'Check',
      key: 'check',
      width: 260,
      render: (_, d) => {
        const tags = [
          ...(d.fuel ? fuelTags(d.fuel, false) : []),
          d.hoursAbove !== null ? (
            <AppTag key="above" tone="danger">
              {`${formatQty(d.hoursAbove)} h above engine`}
            </AppTag>
          ) : null,
          d.outsideSite && d.farthestM !== null ? (
            <AppTag key="away" tone="pending">
              {`${distanceText(d.farthestM)} from site`}
            </AppTag>
          ) : null,
          !d.log && Number(d.engineHours) > 0 ? (
            <AppTag key="nolog" tone="info">
              Ran with no log
            </AppTag>
          ) : null,
        ].filter(Boolean);
        return tags.length ? <Space size={4} wrap>{tags}</Space> : <AppTag tone="success">In order</AppTag>;
      },
    },
  ];

  const empty = (
    <EmptyLine title="No engine hours yet">
      <p style={{ margin: '4px 0 8px' }}>
        {data?.unmatchedDevices
          ? `${data.unmatchedDevices} tracker${data.unmatchedDevices === 1 ? ' is' : 's are'} not matched to a machine yet. Match them in Admin, Connections, Devices.`
          : "Connect the fleet's GPS trackers or a machine maker's feed in Admin, Connections, and each machine's engine hours show here by the day."}
      </p>
      {admin ? <LinkButton href="/connections?tab=devices">Open connections</LinkButton> : null}
    </EmptyLine>
  );

  return (
    <div style={{ paddingTop: 12 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        {fixedProject ? null : <ProjectSelect value={scope} onChange={(v) => setScope(v)} style={{ minWidth: 220, maxWidth: '100%' }} />}
        <DateRangeFilter from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
        {data ? (
          <Typography.Text type="secondary" style={{ marginLeft: 'auto' }}>
            {`${data.machines} machine${data.machines === 1 ? '' : 's'} tracked${data.unmatchedDevices ? `, ${data.unmatchedDevices} device${data.unmatchedDevices === 1 ? '' : 's'} to match` : ''}`}
          </Typography.Text>
        ) : null}
      </div>
      {error ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : (
        <Table<MachineDayDto>
          rowKey="id"
          size="small"
          loading={isLoading}
          columns={columns}
          dataSource={data?.days ?? []}
          pagination={{ pageSize: 50, hideOnSinglePage: true }}
          scroll={{ x: 1160 }}
          locale={{ emptyText: empty }}
        />
      )}
      <Typography.Paragraph type="secondary" style={{ fontSize: themeFontSize('fontSizeSM'), marginTop: 12, marginBottom: 0 }}>
        From each machine&rsquo;s hour meter as its tracker or maker&rsquo;s feed reads it (ignition time where there is no meter), the last week unless you choose dates. A log&rsquo;s worked and idle hours more than half an hour above the engine&rsquo;s are flagged, and so is a machine beyond its site&rsquo;s radius (2 km at least).
      </Typography.Paragraph>
      <MachineryDrawer id={openId} open={!!openId} onClose={() => setOpenId(null)} />
      <MachineryFormModal open={!!prefill} onClose={() => setPrefill(null)} projectId={fixedProject} prefill={prefill} />
    </div>
  );
}
