'use client';

import React, { useState } from 'react';
import { Button, Input, Segmented, Space, Table } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { BookVoucherDto, BookVoucherStatus, BookVoucherType } from '@erp/shared';
import { canApproveVouchers } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useBookVouchers } from '@/lib/queries';
import { useNewIntent } from '@/lib/new-intent';
import { formatDate } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { Amount, VoucherStatusTag, VoucherTypeTag } from './booksUi';
import { VoucherDrawer } from './VoucherDrawer';
import { VoucherForm } from './VoucherForm';

type View = 'decide' | 'open' | 'all';

/** Vouchers made by hand: those waiting for the caller, drafts and sent back, or all; New voucher starts one. */
export function Vouchers() {
  const { user } = useAuth();
  const approver = !!user && canApproveVouchers(user.roleKey);
  const [view, setView] = useState<View>(approver ? 'decide' : 'open');
  const [status, setStatus] = useState<BookVoucherStatus | undefined>();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  useNewIntent('voucher', true, () => setCreating(true));
  const filters = view === 'decide' ? { toDecide: true } : view === 'open' ? { status: status ?? ('DRAFT' as const) } : { status };
  const { data, isLoading, isFetching, error, refetch } = useBookVouchers({ ...filters, q: q || undefined, page, pageSize: 50 });
  const views = [
    ...(approver ? [{ value: 'decide', label: 'Waiting for me' }] : []),
    { value: 'open', label: 'Drafts and sent back' },
    { value: 'all', label: 'All' },
  ];
  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <Space wrap>
          <Segmented
            aria-label="Which vouchers"
            value={view}
            onChange={(v) => {
              setView(v as View);
              setStatus(v === 'open' ? 'DRAFT' : undefined);
              setPage(1);
            }}
            options={views}
          />
          {view === 'open' && (
            <Segmented
              aria-label="Drafts or sent back"
              value={status ?? 'DRAFT'}
              onChange={(v) => (setStatus(v as BookVoucherStatus), setPage(1))}
              options={[
                { value: 'DRAFT', label: 'Drafts' },
                { value: 'REJECTED', label: 'Sent back' },
              ]}
            />
          )}
          <Input.Search allowClear placeholder="Number or narration" aria-label="Search vouchers" onSearch={(v) => (setQ(v.trim()), setPage(1))} style={{ width: 220 }} />
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
          New voucher
        </Button>
      </div>
      {error ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : (
        <Table<BookVoucherDto>
          rowKey="id"
          size="small"
          loading={isLoading || isFetching}
          dataSource={data?.items ?? []}
          scroll={{ x: 860 }}
          locale={{ emptyText: view === 'decide' ? 'Nothing waiting for your approval' : 'No vouchers here' }}
          pagination={{ current: page, pageSize: 50, total: data?.total ?? 0, onChange: setPage, hideOnSinglePage: true, showSizeChanger: false }}
          onRow={(v) => ({ onClick: () => setOpen(v.id), style: { cursor: 'pointer' } })}
          columns={[
            { title: 'Date', dataIndex: 'date', width: 110, render: (d: string) => formatDate(d) },
            {
              title: 'Voucher',
              dataIndex: 'voucherNo',
              width: 170,
              render: (n: string, v) => (
                <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setOpen(v.id)}>
                  <span translate="no">{n}</span>
                </Button>
              ),
            },
            { title: 'Type', dataIndex: 'type', width: 110, render: (t: BookVoucherType) => <VoucherTypeTag type={t} /> },
            { title: 'Narration', dataIndex: 'narration', ellipsis: true },
            { title: 'Made by', dataIndex: 'preparedByName', width: 150, ellipsis: true },
            { title: 'Status', dataIndex: 'status', width: 170, render: (s: BookVoucherStatus) => <VoucherStatusTag status={s} /> },
            { title: 'Amount', dataIndex: 'amount', align: 'right', width: 150, render: (a: string) => <Amount value={a} /> },
          ]}
        />
      )}
      <VoucherDrawer id={open} onClose={() => setOpen(null)} />
      <VoucherForm open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
