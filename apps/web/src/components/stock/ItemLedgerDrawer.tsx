'use client';

import React, { useState } from 'react';
import { Descriptions, Drawer, Table, Typography } from 'antd';
import type { StockBalanceDto, StockEntryDto } from '@erp/shared';
import { useStockEntries } from '@/lib/queries';
import { formatDate, formatQty, NO_VALUE } from '@/lib/format';
import { StockTypeTag, entrySummary } from './StockTypeTag';
import { StockEntryDrawer } from './StockEntryDrawer';
import { RecordLink } from '@/components/record/RecordLink';
import { unitLabel } from '@erp/shared';

/** Movements of one item at one project, newest first. */
export function ItemLedgerDrawer({ row, onClose }: { row: StockBalanceDto | null; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const [opened, setOpened] = useState<string | null>(null);
  const { data, isLoading } = useStockEntries(row ? { projectId: row.projectId, itemId: row.itemId, page, pageSize: 20, sortBy: 'date', sortOrder: 'desc' } : undefined, !!row);
  const qtyOf = (e: StockEntryDto) => e.lines.filter((l) => l.itemId === row?.itemId).reduce((s, l) => s + Number(l.quantity), 0);
  return (
    <Drawer open={!!row} onClose={onClose} size={720} title={row ? `${row.itemName} · ${row.projectName}` : 'Item'} destroyOnHidden>
      {row ? (
        <>
          <Descriptions
            size="small"
            bordered
            column={3}
            style={{ marginBottom: 16 }}
            items={[
              { key: 'r', label: 'Received', children: `${formatQty(row.received)} ${unitLabel(row.unit)}` },
              { key: 'i', label: 'Issued', children: `${formatQty(row.issued)} ${unitLabel(row.unit)}` },
              { key: 'a', label: 'Adjusted', children: `${formatQty(row.adjusted)} ${unitLabel(row.unit)}` },
              {
                key: 'b',
                label: 'Balance',
                children: (
                  <Typography.Text strong type={row.low ? 'danger' : undefined}>
                    {formatQty(row.balance)} {row.unit}
                  </Typography.Text>
                ),
              },
              { key: 'm', label: 'Minimum', children: row.minQty ? `${formatQty(row.minQty)} ${unitLabel(row.unit)}` : NO_VALUE },
              { key: 'l', label: 'Last movement', children: formatDate(row.lastMovement) },
            ]}
          />
          <Table<StockEntryDto>
            size="small"
            rowKey="id"
            loading={isLoading}
            dataSource={data?.items ?? []}
            pagination={{ current: page, pageSize: 20, total: data?.total ?? 0, onChange: setPage, hideOnSinglePage: true }}
            columns={[
              { title: 'Date', dataIndex: 'date', width: 110, render: (v) => formatDate(v) },
              { title: 'Entry', dataIndex: 'entryNo', width: 130, render: (v, e) => <RecordLink onOpen={() => setOpened(e.id)}>{v}</RecordLink> },
              { title: 'Type', dataIndex: 'type', width: 120, render: (v) => <StockTypeTag type={v} /> },
              { title: 'Details', key: 'd', ellipsis: true, render: (_, e) => entrySummary(e) },
              {
                title: 'Qty',
                key: 'q',
                align: 'right',
                width: 110,
                render: (_, e) => {
                  const q = qtyOf(e);
                  return <Typography.Text type={q < 0 ? 'danger' : 'success'}>{`${q > 0 ? '+' : ''}${formatQty(q)}`}</Typography.Text>;
                },
              },
            ]}
          />
        </>
      ) : null}
      <StockEntryDrawer id={opened} onClose={() => setOpened(null)} />
    </Drawer>
  );
}
