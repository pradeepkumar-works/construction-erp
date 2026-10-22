'use client';

import React, { useState } from 'react';
import { Alert, Button, Table, Typography } from 'antd';
import type { LedgerDto, LedgerEntryDto } from '@erp/shared';
import { formatDate } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { Amount, Balance, VoucherTypeTag } from './booksUi';
import { VoucherDrawer } from './VoucherDrawer';

/** An account's entries with its opening, running and closing balance; a voucher opens on click. */
export function LedgerView({ data, isLoading, error, refetch, emptyText }: { data: LedgerDto | undefined; isLoading: boolean; error: unknown; refetch: () => void; emptyText: string }) {
  const [open, setOpen] = useState<string | null>(null);
  if (error) return <QueryError error={error} onRetry={refetch} />;
  return (
    <>
      {data?.truncated && <Alert type="info" showIcon title="Only the latest 2,000 entries show. Pick a shorter period to see the rest; the opening balance counts them." style={{ marginBottom: 12 }} />}
      <Table<LedgerEntryDto>
        rowKey="lineId"
        size="small"
        loading={isLoading}
        dataSource={data?.entries ?? []}
        pagination={{ pageSize: 100, hideOnSinglePage: true, showSizeChanger: false }}
        scroll={{ x: 980 }}
        locale={{ emptyText }}
        onRow={(e) => ({ onClick: () => setOpen(e.voucherId), style: { cursor: 'pointer' } })}
        columns={[
          { title: 'Date', dataIndex: 'date', width: 110, render: (d: string) => formatDate(d) },
          {
            title: 'Voucher',
            key: 'voucher',
            width: 200,
            render: (_, e) => (
              <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setOpen(e.voucherId)}>
                <span translate="no">{e.voucherNo}</span>
              </Button>
            ),
          },
          { title: 'Type', dataIndex: 'type', width: 110, render: (t: LedgerEntryDto['type']) => <VoucherTypeTag type={t} /> },
          { title: 'Against', dataIndex: 'against', width: 200, ellipsis: true, render: (a: string) => <span translate="no">{a}</span> },
          { title: 'Narration', dataIndex: 'narration', ellipsis: true },
          { title: 'Debit', dataIndex: 'debit', align: 'right', width: 140, render: (x: string | null) => <Amount value={x} /> },
          { title: 'Credit', dataIndex: 'credit', align: 'right', width: 140, render: (x: string | null) => <Amount value={x} /> },
          { title: 'Balance', dataIndex: 'balance', align: 'right', width: 160, render: (x: string) => <Balance value={x} /> },
        ]}
        summary={() =>
          data ? (
            <>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={5}>
                  <Typography.Text type="secondary">{data.from ? `Opening on ${formatDate(data.from)}` : 'Opening'}</Typography.Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={5} colSpan={3} align="right">
                  <Balance value={data.opening} />
                </Table.Summary.Cell>
              </Table.Summary.Row>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={5}>
                  <Typography.Text strong>{`Closing on ${formatDate(data.to)}`}</Typography.Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={5} align="right">
                  <Typography.Text strong>
                    <Amount value={data.debit} />
                  </Typography.Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={6} align="right">
                  <Typography.Text strong>
                    <Amount value={data.credit} />
                  </Typography.Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={7} align="right">
                  <Typography.Text strong>
                    <Balance value={data.closing} />
                  </Typography.Text>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            </>
          ) : null
        }
      />
      <VoucherDrawer id={open} onClose={() => setOpen(null)} />
    </>
  );
}
