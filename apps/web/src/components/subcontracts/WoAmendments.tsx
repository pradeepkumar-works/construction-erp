'use client';

import React from 'react';
import Link from 'next/link';
import { Table, Typography } from 'antd';
import { workOrderAsOf, type WorkOrderAmendmentDto, type WorkOrderDto } from '@erp/shared';
import { tk } from '@/ds';
import { formatDate, formatQty, NO_VALUE } from '@/lib/format';
import { AppTag } from '@/components/common/AppTag';
import { StatusTag } from '@/components/common/StatusTag';
import { Money } from '@/components/common/Money';
import { AmendmentLines } from './WoAmendmentRecord';

interface Version {
  n: number;
  name: string;
  value: string;
  endDate: string | null;
  lines: { id: string; description: string; unit: string; quantity: string; rate: string; amount: string }[];
}

/** The order as it stood at each amendment in force, newest first: version 0 is the order as approved. */
function versionsOf(order: WorkOrderDto, amendments: WorkOrderAmendmentDto[]): Version[] {
  const applied = amendments.filter((a) => a.appliedAt).sort((a, b) => a.amendmentNo - b.amendmentNo);
  const asApplied = applied.map((a) => ({ amendmentNo: a.amendmentNo, lines: a.lines.map((l) => ({ workOrderLineId: l.workOrderLineId, qtyBefore: l.qtyBefore, rateBefore: l.rateBefore })) }));
  const byId = new Map(order.lines.map((l) => [l.id, l]));
  const ends = [applied.length ? applied[0].endDateBefore : order.endDate, ...applied.map((a) => a.endDate ?? a.endDateBefore)];
  return [0, ...applied.map((a) => a.amendmentNo)]
    .map((n, i) => {
      const v = workOrderAsOf(order.lines, asApplied, n);
      return {
        n,
        name: n === 0 ? 'As approved' : `After amendment ${n}`,
        value: v.value,
        endDate: ends[i] ?? null,
        lines: v.lines.map((l) => ({ ...l, description: byId.get(l.id)?.description ?? '', unit: byId.get(l.id)?.unit ?? '' })),
      };
    })
    .reverse();
}

/**
 * A work order's amendments: the one still open with what it changes, every one raised with its decision, and the order
 * as it stood at each amendment in force (its lines then, a row away).
 */
export function WoAmendments({ order, amendments }: { order: WorkOrderDto; amendments: WorkOrderAmendmentDto[] }) {
  const open = amendments.find((a) => a.id === order.openAmendment?.id);
  const versions = versionsOf(order, amendments);
  return (
    <>
      {open ? (
        <div style={{ marginBottom: tk.space[4] }}>
          <Typography.Paragraph>
            <Link href={`/work-order-amendments/${open.id}`} translate="no">
              {open.label}
            </Link>{' '}
            <StatusTag status={open.status} /> takes the order from <Money value={open.valueBefore} paise /> to <Money value={open.valueAfter} paise />. Measurements, issues and bills go on against the order as it stands meanwhile.
          </Typography.Paragraph>
          <AmendmentLines amendment={open} onlyChanged />
        </div>
      ) : null}
      <Table<WorkOrderAmendmentDto>
        rowKey="id"
        size="small"
        pagination={false}
        dataSource={amendments}
        scroll={{ x: 720 }}
        style={{ marginBottom: tk.space[4] }}
        columns={[
          { title: 'Amendment', key: 'no', width: 200, render: (_, a) => <Link href={`/work-order-amendments/${a.id}`} translate="no">{a.label}</Link> },
          { title: 'Status', key: 'status', width: 130, render: (_, a) => <StatusTag status={a.status} /> },
          { title: 'Why', key: 'reason', render: (_, a) => a.reason || <span className="text-muted">{NO_VALUE}</span> },
          { title: 'Value after', key: 'after', width: 150, align: 'right', render: (_, a) => <Money value={a.valueAfter} paise /> },
          { title: 'Decided', key: 'decided', width: 120, render: (_, a) => (a.reviewedAt ? formatDate(a.reviewedAt.slice(0, 10)) : <span className="text-muted">{NO_VALUE}</span>) },
        ]}
      />
      {versions.length > 1 ? (
        <Table<Version>
          rowKey="n"
          size="small"
          pagination={false}
          dataSource={versions}
          scroll={{ x: 560 }}
          title={() => <Typography.Text strong>Versions of the order</Typography.Text>}
          expandable={{
            expandedRowRender: (v) => (
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={v.lines}
                columns={[
                  { title: 'Item', dataIndex: 'description' },
                  { title: 'Quantity', key: 'q', width: 140, align: 'right', render: (_, l) => <span className="mono" translate="no">{formatQty(l.quantity)} {l.unit}</span> },
                  { title: 'Rate', key: 'r', width: 120, align: 'right', render: (_, l) => <Money value={l.rate} paise /> },
                  { title: 'Amount', key: 'a', width: 140, align: 'right', render: (_, l) => <Money value={l.amount} paise /> },
                ]}
              />
            ),
          }}
          columns={[
            { title: 'Version', key: 'name', render: (_, v) => (v.n === order.amendmentNo ? <span>{v.name} <AppTag meaning="done" style={{ margin: 0 }}>In force</AppTag></span> : v.name) },
            { title: 'Lines', key: 'lines', width: 90, align: 'right', render: (_, v) => v.lines.length },
            { title: 'Ends', key: 'end', width: 120, render: (_, v) => (v.endDate ? formatDate(v.endDate) : NO_VALUE) },
            { title: 'Value before GST', key: 'value', width: 160, align: 'right', render: (_, v) => <Money value={v.value} paise /> },
          ]}
        />
      ) : null}
    </>
  );
}
