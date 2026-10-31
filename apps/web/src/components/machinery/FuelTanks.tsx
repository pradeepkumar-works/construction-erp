'use client';

import React from 'react';
import { App, Button, Space, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import type { FuelDispenseDto, MachineDayDto, MachineFuelDto } from '@erp/shared';
import { canManageIntegrations } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useMachineDays, useRetryDispense } from '@/lib/queries';
import { errorMessage } from '@/lib/api';
import { formatDateTime, formatQty, formatTime } from '@/lib/format';
import { themeFontSize } from '@/lib/theme';
import { AppTag } from '@/components/common/AppTag';
import { LinkButton } from '@/components/common/LinkButton';
import { Section } from '@/components/common/Section';

type TankRow = MachineDayDto & { fuel: MachineFuelDto };

const L = (v: string | null, muted = true) =>
  v === null || (muted && Number(v) === 0) ? (
    <span className="text-muted">-</span>
  ) : (
    <span className="mono" translate="no">
      {formatQty(v)} L
    </span>
  );
const small = { fontSize: themeFontSize('fontSizeSM') };

/** What does not add up on a machine's tank that day, as tags; the norm's only where asked for. */
export function fuelTags(f: MachineFuelDto, withNorm = true): React.ReactNode[] {
  return [
    f.unslippedLitres !== null ? (
      <AppTag key="unslipped" tone="danger">
        {`${formatQty(f.unslippedLitres)} L filled, no slip`}
      </AppTag>
    ) : null,
    f.notInTankLitres !== null ? (
      <AppTag key="notintank" tone="danger">
        {`${formatQty(f.notInTankLitres)} L on slips, not in tank`}
      </AppTag>
    ) : null,
    Number(f.drainedLitres) > 0 ? (
      <AppTag key="drained" tone="danger">
        {`${formatQty(f.drainedLitres)} L drained`}
      </AppTag>
    ) : null,
    withNorm && f.aboveNormPct !== null ? (
      <AppTag key="norm" tone="pending">
        {`${f.aboveNormPct}% above norm`}
      </AppTag>
    ) : null,
  ].filter(Boolean);
}

/**
 * Fuel sensors and the dispenser, under the day's fuel position: each machine's tank against the day's
 * slips, and the dispenser's fills not on a slip yet. Shows only where a tracker reads a tank or a dispenser posts.
 */
export function FuelTanks({ date, projectId, canIssue }: { date: string; projectId?: string; canIssue: boolean }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const { data } = useMachineDays({ from: date, to: date, projectId });
  const retry = useRetryDispense();
  const rows = (data?.days ?? []).filter((d): d is TankRow => d.fuel !== null);
  const waiting = data?.dispenses ?? [];
  const admin = !!user && canManageIntegrations(user.roleKey);
  if (!rows.length && !waiting.length) return null;

  const times = (f: MachineFuelDto, kind: 'REFILL' | 'DRAIN') =>
    f.events
      .filter((e) => e.kind === kind)
      .map((e) => formatTime(e.endAt))
      .join(', ');

  const columns: TableProps<TankRow>['columns'] = [
    {
      title: 'Machine',
      key: 'machine',
      render: (_, d) => (
        <div>
          <span className="mono" translate="no">
            {d.equipmentCode}
          </span>{' '}
          {d.equipmentName}
          {!projectId && d.projectName ? (
            <div className="text-muted" style={small}>
              {d.projectName}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      title: 'In the tank',
      key: 'tank',
      width: 140,
      render: (_, d) => (
        <span className="mono" translate="no">
          {formatQty(d.fuel.startLitres)} → {formatQty(d.fuel.endLitres)} L
        </span>
      ),
    },
    {
      title: 'Filled',
      key: 'filled',
      width: 110,
      align: 'right',
      render: (_, d) => (
        <div>
          {L(d.fuel.filledLitres)}
          {Number(d.fuel.filledLitres) > 0 ? <div className="text-muted" style={small}>{`at ${times(d.fuel, 'REFILL')}`}</div> : null}
        </div>
      ),
    },
    { title: 'On slips', key: 'slips', width: 100, align: 'right', render: (_, d) => L(d.fuel.slipLitres) },
    {
      title: 'Drained',
      key: 'drained',
      width: 110,
      align: 'right',
      render: (_, d) => (
        <div>
          {L(d.fuel.drainedLitres)}
          {Number(d.fuel.drainedLitres) > 0 ? <div className="text-muted" style={small}>{`at ${times(d.fuel, 'DRAIN')}`}</div> : null}
        </div>
      ),
    },
    {
      title: 'Burnt',
      key: 'burnt',
      width: 130,
      align: 'right',
      render: (_, d) => (
        <div>
          {L(d.fuelUsedLitres, false)}
          {d.fuel.litresPerHour !== null ? (
            <div className="text-muted" style={small} translate="no">
              {`${formatQty(d.fuel.litresPerHour)} L/h${d.fuel.norm !== null ? `, norm ${formatQty(d.fuel.norm)}` : ''}`}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      title: 'Check',
      key: 'check',
      width: 220,
      render: (_, d) => {
        const tags = fuelTags(d.fuel);
        return tags.length ? <Space size={4} wrap>{tags}</Space> : <AppTag tone="success">In order</AppTag>;
      },
    },
  ];

  const waitingColumns: TableProps<FuelDispenseDto>['columns'] = [
    { title: 'Time', dataIndex: 'at', width: 150, render: (v: string) => formatDateTime(v) },
    {
      title: 'Tag',
      key: 'tag',
      render: (_, d) => (
        <div>
          <span className="mono" translate="no">
            {d.tag}
          </span>
          {d.tagLabel || d.equipmentCode ? (
            <div className="text-muted" style={small}>
              {[d.tagLabel, d.equipmentCode].filter(Boolean).join(', ')}
            </div>
          ) : null}
        </div>
      ),
    },
    { title: 'Litres', dataIndex: 'litres', width: 90, align: 'right', render: (v: string) => L(v, false) },
    {
      title: 'Why it waits',
      key: 'problem',
      width: 340,
      render: (_, d) => (
        <Space size={8} wrap>
          <span>{`${d.problem} (${d.connectionName})`}</span>
          {d.equipmentCode && canIssue ? (
            <Button
              size="small"
              loading={retry.isPending && retry.variables === d.id}
              aria-label={`Try the fill of ${formatQty(d.litres)} litres at ${formatTime(d.at)} again`}
              onClick={() =>
                retry.mutate(d.id, {
                  onSuccess: (r) => (r.entryNo ? message.success(`Slip ${r.entryNo} made`) : message.error(r.problem ?? 'The slip could not be made')),
                  onError: (e) => message.error(errorMessage(e)),
                })
              }
            >
              Try again
            </Button>
          ) : !d.equipmentCode && admin ? (
            <LinkButton size="small" href="/connections?tab=devices">
              Match the tag
            </LinkButton>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <>
      {rows.length ? (
        <Section style={{ marginTop: 16 }} title="Fuel tanks">
          <Table<TankRow> rowKey="id" size="small" pagination={false} dataSource={rows} scroll={{ x: 1000 }} columns={columns} />
          <Typography.Paragraph type="secondary" style={{ ...small, marginTop: 8, marginBottom: 0 }}>
            From each machine&rsquo;s fuel sensor through its tracker. A rise of 20 litres or more is a fill and is set against the day&rsquo;s slips; a fall
            as big with the engine off is a drain. Set the tank&rsquo;s size on the machine in Equipment when the sensor sends a %.
          </Typography.Paragraph>
        </Section>
      ) : null}
      {waiting.length ? (
        <Section style={{ marginTop: 16 }} title="Dispenser fills not on a slip">
          <Table<FuelDispenseDto> rowKey="id" size="small" pagination={false} dataSource={waiting} scroll={{ x: 760 }} columns={waitingColumns} />
        </Section>
      ) : null}
    </>
  );
}
