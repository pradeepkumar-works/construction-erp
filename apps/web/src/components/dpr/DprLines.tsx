'use client';

import React from 'react';
import { Flex, Table, Typography } from 'antd';
import {
  crewCheck,
  dprActivityLabel,
  groupLines,
  lineLocation,
  machineHours,
  materialUsed,
  type DailyReportDto,
  type DprLineDto,
  type DprMaterialDto,
  type MachineryLine,
} from '@erp/shared';
import { formatPct, formatQty } from '@/lib/format';
import { Section } from '@/components/common/Section';

const crew = (l: DprLineDto) => l.labour.map((m) => `${m.category} ${m.count}`).join(', ');
const machines = (l: DprLineDto) => l.machines.map((m) => `${m.name} ${formatQty(m.hours)} h`).join(', ');
const material = (l: DprLineDto) => l.materials.map((m) => `${m.itemName} ${formatQty(m.quantity)} ${m.unit}`).join(', ');

/**
 * A DPR's work lines (item 127), grouped by component › sub-component, in the shape of the site's DPR: activity and
 * where, today, up to previous, cumulative against scope, %, balance, then the crew, machines and material.
 */
export function DprWorkLines({ lines }: { lines: DprLineDto[] }) {
  if (!lines.length) return null;
  return (
    <Flex vertical gap={12}>
      {groupLines(lines).map((g) => (
        <Section key={g.key} title={<span translate="no">{g.label}</span>}>
          <Table<DprLineDto>
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={g.lines}
            scroll={{ x: 820 }}
            columns={[
              {
                key: 'activity',
                title: 'Activity',
                render: (_, l) => (
                  <>
                    <div>{dprActivityLabel({ name: l.activityName, parentActivityName: l.parentActivityName })}</div>
                    {lineLocation(l) || l.workOrderNo ? (
                      <Typography.Text type="secondary">
                        {[lineLocation(l), l.workOrderNo].filter(Boolean).join(' · ')}
                      </Typography.Text>
                    ) : null}
                    {l.remarks ? <div>{l.remarks}</div> : null}
                  </>
                ),
              },
              { key: 'today', title: 'Today', align: 'right', width: 100, render: (_, l) => <span translate="no">{`${formatQty(l.quantity)} ${l.unit}`}</span> },
              { key: 'previous', title: 'Up to previous', align: 'right', width: 110, render: (_, l) => <span translate="no">{formatQty(l.previous)}</span> },
              { key: 'cumulative', title: 'Cumulative / scope', align: 'right', width: 140, render: (_, l) => <span translate="no">{`${formatQty(l.cumulative)} / ${formatQty(l.scope)}`}</span> },
              { key: 'pct', title: '%', align: 'right', width: 64, render: (_, l) => <span translate="no">{l.pct === null ? '-' : formatPct(l.pct)}</span> },
              { key: 'balance', title: 'Balance', align: 'right', width: 90, render: (_, l) => <span translate="no">{formatQty(l.balance)}</span> },
              {
                key: 'resources',
                title: 'Crew, machines, material',
                width: 220,
                render: (_, l) => {
                  const parts = [crew(l), machines(l), material(l)].filter(Boolean);
                  return parts.length ? parts.map((p) => <div key={p}>{p}</div>) : <span className="text-muted">-</span>;
                },
              },
            ]}
          />
        </Section>
      ))}
    </Flex>
  );
}

/** The crew on the lines against the day's head count, said in a line ("20 of the 24 on site are on a work line"). */
export function crewNote(data: DailyReportDto): string | null {
  const lines = data.lines ?? [];
  if (!lines.length) return null;
  const c = crewCheck(lines, data.manpower);
  if (!c.onLines && c.headCount === null) return null;
  if (c.headCount === null) return `${c.onLines} people on the work lines; no head count for the day`;
  if (c.difference === 0) return `All ${c.headCount} on site are on a work line`;
  if (c.difference! > 0) return `${c.onLines} of the ${c.headCount} on site are on a work line; ${c.difference} on none`;
  return `The work lines name ${c.onLines} people, ${-c.difference!} more than the ${c.headCount} on site`;
}

/** Machine hours and material used on the lines, added up (the DPR's materials part). */
export function DprLineTotals({ lines }: { lines: DprLineDto[] }) {
  const hours = machineHours(lines);
  const used = materialUsed(lines);
  if (!hours.length && !used.length) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
      {used.length ? (
        <Section title="Material used on the lines">
          <Table<DprMaterialDto>
            size="small"
            rowKey="itemId"
            pagination={false}
            dataSource={used}
            columns={[
              { key: 'item', title: 'Item', dataIndex: 'itemName' },
              { key: 'qty', title: 'Used', align: 'right', width: 120, render: (_, m) => <span translate="no">{`${formatQty(m.quantity)} ${m.unit}`}</span> },
            ]}
          />
        </Section>
      ) : null}
      {hours.length ? (
        <Section title="Machine hours on the lines">
          <Table<MachineryLine>
            size="small"
            rowKey="name"
            pagination={false}
            dataSource={hours}
            columns={[
              { key: 'name', title: 'Equipment', dataIndex: 'name' },
              { key: 'hours', title: 'Hours', align: 'right', width: 80, render: (_, m) => <span translate="no">{formatQty(m.hours)}</span> },
            ]}
          />
        </Section>
      ) : null}
    </div>
  );
}
