'use client';

import React, { useState } from 'react';
import { Alert, Button, Space, Table, Typography } from 'antd';
import { tk } from '@/ds';
import type { LedgerDto, LedgerEntryDto } from '@erp/shared';
import { BOOK_VOUCHER_TYPE_LABELS } from '@erp/shared';
import { formatDate, toNumber } from '@/lib/format';
import { PrinterOutlined } from '@/components/common/icons';
import { ExportButton } from '@/components/common/ExportButton';
import { downloadXlsx, type ExportColumn } from '@/lib/exportExcel';
import { usePrintPaper } from '@/components/print/usePrintPaper';
import { openLedgerPrint } from './booksPrint';
import { QueryError } from '@/components/common/QueryState';
import { Balance, VoucherTypeTag } from './booksUi';
import { VoucherDrawer } from './VoucherDrawer';
import { Money } from '@/components/common/Money';

type LedgerRow = Pick<LedgerEntryDto, 'date' | 'voucherNo' | 'against' | 'narration' | 'projectCode' | 'debit' | 'credit' | 'balance'> & { type: string };

const amount = (v: string | null) => (v === null ? null : toNumber(v));
const LEDGER_EXPORT: ExportColumn<LedgerRow>[] = [
  { header: 'Date', value: (r) => r.date, width: 12 },
  { header: 'Voucher', value: (r) => r.voucherNo, width: 20 },
  { header: 'Type', value: (r) => r.type, width: 12 },
  { header: 'Against', value: (r) => r.against, width: 30 },
  { header: 'Narration', value: (r) => r.narration, width: 40 },
  { header: 'Project', value: (r) => r.projectCode, width: 14 },
  { header: 'Debit', value: (r) => amount(r.debit), width: 14 },
  { header: 'Credit', value: (r) => amount(r.credit), width: 14 },
  { header: 'Balance (Dr +, Cr -)', value: (r) => toNumber(r.balance), width: 18 },
];

/** The ledger as rows for Excel: opening, every entry, closing with the period's totals. */
function ledgerRows(l: LedgerDto): LedgerRow[] {
  const line = (date: string, voucherNo: string, debit: string | null, credit: string | null, balance: string): LedgerRow => ({ date, voucherNo, type: '', against: '', narration: '', projectCode: null, debit, credit, balance });
  return [
    line(l.from ?? '', 'Opening', null, null, l.opening),
    ...l.entries.map((e) => ({ ...e, type: BOOK_VOUCHER_TYPE_LABELS[e.type] })),
    line(l.to, 'Closing', l.debit, l.credit, l.closing),
  ];
}

/** An account's entries with its opening, running and closing balance; a voucher opens on click. Prints as a statement and exports to Excel. */
export function LedgerView({ data, isLoading, error, refetch, emptyText, projectName }: { data: LedgerDto | undefined; isLoading: boolean; error: unknown; refetch: () => void; emptyText: string; projectName?: string | null }) {
  const [open, setOpen] = useState<string | null>(null);
  const print = usePrintPaper();
  if (error) return <QueryError error={error} onRetry={refetch} />;
  return (
    <>
      {data && (
        <Space wrap style={{ marginBottom: tk.space[3] }}>
          <Button icon={<PrinterOutlined />} onClick={() => print((l) => openLedgerPrint(data, l, projectName))}>
            Print
          </Button>
          <ExportButton
            onExport={async () => {
              const rows = ledgerRows(data);
              await downloadXlsx(`${data.account.name.replace(/[^\w.-]+/g, '-').toLowerCase()}-${data.to}.xlsx`, data.account.name, LEDGER_EXPORT, rows);
              return rows.length;
            }}
          />
        </Space>
      )}
      {data?.truncated && <Alert type="info" showIcon title="Only the latest 2,000 entries show. Choose a shorter period to see the rest; the opening balance counts them." style={{ marginBottom: tk.space[3] }} />}
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
          { title: 'Debit', dataIndex: 'debit', align: 'right', width: 140, render: (x: string | null) => <Money paise value={x} /> },
          { title: 'Credit', dataIndex: 'credit', align: 'right', width: 140, render: (x: string | null) => <Money paise value={x} /> },
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
                    <Money paise value={data.debit} />
                  </Typography.Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={6} align="right">
                  <Typography.Text strong>
                    <Money paise value={data.credit} />
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
