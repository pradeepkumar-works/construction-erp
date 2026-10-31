'use client';

import React from 'react';
import { Descriptions, Progress, Table } from 'antd';
import type { PortalActivityDto, PortalProjectDetailDto } from '@erp/shared';
import { formatDate, formatINR, formatQty, progressStatus, NO_VALUE } from '@/lib/format';
import { unitLabel } from '@erp/shared';

/** The project at a glance and approved progress by activity. */
export function PortalOverview({ project: p }: { project: PortalProjectDetailDto }) {
  return (
    <div style={{ padding: 12 }}>
      <Descriptions
        size="small"
        bordered
        column={{ xs: 1, md: 2, xl: 3 }}
        style={{ marginBottom: 16 }}
        items={[
          { key: 'pp', label: 'Physical progress', children: <Progress percent={p.physicalProgressPct} size="small" style={{ minWidth: 160, margin: 0 }} aria-label={`Physical progress ${p.physicalProgressPct}%`} /> },
          { key: 'te', label: 'Contract period gone', children: p.timeElapsedPct != null ? `${p.timeElapsedPct}%` : NO_VALUE },
          { key: 'cv', label: 'Contract value', children: p.contractValue ? formatINR(p.contractValue) : NO_VALUE },
          { key: 'wo', label: 'Work order', children: p.workOrderNo ?? NO_VALUE },
          { key: 'dates', label: 'Contract period', children: p.startDate && p.endDate ? `${formatDate(p.startDate)} to ${formatDate(p.endDate)}` : NO_VALUE },
          { key: 'pm', label: "Contractor's project manager", children: p.projectManagerName ?? NO_VALUE },
          { key: 'cl', label: 'Client', children: p.clientName ?? NO_VALUE },
          { key: 'cs', label: 'Consultant', children: p.consultantName ?? NO_VALUE },
          { key: 'dpr', label: 'Last daily report', children: p.lastDprDate ? formatDate(p.lastDprDate) : NO_VALUE },
        ]}
      />
      <Table<PortalActivityDto>
        rowKey="id"
        size="small"
        pagination={false}
        dataSource={p.activities}
        scroll={{ x: 800 }}
        locale={{ emptyText: 'No activities planned yet' }}
        title={p.programme === 'NONE' && p.activities.length ? () => 'Programme dates show here once the contractor freezes the agreed baseline.' : undefined}
        columns={[
          { title: 'Activity', dataIndex: 'name' },
          { title: 'Agreed programme', key: 'planned', width: 240, render: (_, a) => (a.plannedStart && a.plannedEnd ? `${formatDate(a.plannedStart)} to ${formatDate(a.plannedEnd)}` : NO_VALUE) },
          { title: 'Quantity', key: 'qty', align: 'right', width: 220, render: (_, a) => `${formatQty(a.doneQty)} of ${formatQty(a.plannedQty)} ${unitLabel(a.unit)}` },
          { title: 'Done', dataIndex: 'pct', width: 180, render: (v: number) => <Progress percent={v} size="small" status={progressStatus(v)} style={{ margin: 0 }} aria-label={`${v}% done`} /> },
        ]}
      />
    </div>
  );
}
