'use client';

import React, { useState } from 'react';
import { Alert, App, Button, DatePicker, Input, Select, Space, Table, Typography } from 'antd';
import { SyncOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { BookSource, BookVoucherDto, BookVoucherType, BooksPostResultDto } from '@erp/shared';
import { BOOK_SOURCES, BOOK_SOURCE_LABELS, BOOK_VOUCHER_TYPES, BOOK_VOUCHER_TYPE_LABELS } from '@erp/shared';
import { useBooksAction, useBooksStatus, useDayBook } from '@/lib/queries';
import { useProjectScope } from '@/lib/project-scope';
import { errorMessage } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { Amount, VoucherTypeTag, sourceLabel } from './booksUi';
import { VoucherDrawer } from './VoucherDrawer';

/** When the modules were last posted, a Post now, and the records that could not be posted with why. */
function PostingLine() {
  const { message } = App.useApp();
  const { data } = useBooksStatus();
  const post = useBooksAction<BooksPostResultDto>();
  const [showHeld, setShowHeld] = useState(false);
  const held = data?.held ?? [];
  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Typography.Text type="secondary">{data?.lastPostedAt ? `Bills, receipts, payments, expenses and salaries posted ${formatDateTime(data.lastPostedAt)}` : 'Posting the modules…'}</Typography.Text>
        <Button
          size="small"
          icon={<SyncOutlined />}
          loading={post.isPending}
          onClick={async () => {
            try {
              const r = await post.mutateAsync({ path: '/books/post' });
              message.success(r.added || r.changed || r.removed ? `Posted: ${r.added} new, ${r.changed} changed, ${r.removed} taken out` : 'The books were up to date');
            } catch (e) {
              message.error(errorMessage(e));
            }
          }}
        >
          Post now
        </Button>
      </Space>
      {held.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          title={`${held.length === 1 ? '1 record' : `${held.length} records`} could not be posted`}
          description={
            showHeld ? (
              <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                {held.map((h) => (
                  <li key={`${h.source}:${h.sourceId}`}>
                    <span translate="no">{`${h.number} (${BOOK_SOURCE_LABELS[h.source]}, ${formatDate(h.date)}, ${h.party})`}</span>: {h.reason}
                  </li>
                ))}
              </ul>
            ) : (
              <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setShowHeld(true)}>
                Show which and why
              </Button>
            )
          }
        />
      )}
    </>
  );
}

/** Every approved voucher in a period, from the modules and made by hand, with its lines on expand. */
export function DayBook() {
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>(() => [dayjs().startOf('month'), dayjs()]);
  const [type, setType] = useState<BookVoucherType | undefined>();
  const [source, setSource] = useState<BookSource | undefined>();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [projectId, setProjectId] = useProjectScope();
  const [open, setOpen] = useState<string | null>(null);
  const { data, isLoading, isFetching, error, refetch } = useDayBook({ from: range[0].format('YYYY-MM-DD'), to: range[1].format('YYYY-MM-DD'), type, source, projectId, q: q || undefined, page, pageSize: 50 });
  const reset = () => setPage(1);
  return (
    <div style={{ padding: 16 }}>
      <PostingLine />
      <Space wrap style={{ marginBottom: 12 }}>
        <DatePicker.RangePicker
          aria-label="Period"
          format="DD MMM YYYY"
          allowClear={false}
          value={range}
          onChange={(r) => {
            if (r?.[0] && r[1]) setRange([r[0], r[1]]);
            reset();
          }}
        />
        <Select allowClear placeholder="Every type" aria-label="Voucher type" value={type} onChange={(v) => (setType(v), reset())} style={{ minWidth: 150 }} options={BOOK_VOUCHER_TYPES.map((t) => ({ value: t, label: BOOK_VOUCHER_TYPE_LABELS[t] }))} />
        <Select allowClear placeholder="From anywhere" aria-label="From" value={source} onChange={(v) => (setSource(v), reset())} style={{ minWidth: 180 }} options={BOOK_SOURCES.map((s) => ({ value: s, label: BOOK_SOURCE_LABELS[s] }))} />
        <ProjectSelect allowClear placeholder="All projects" value={projectId} onChange={(v) => (setProjectId(v), reset())} aria-label="Project" style={{ minWidth: 220 }} />
        <Input.Search allowClear placeholder="Number, party or narration" aria-label="Search the day book" onSearch={(v) => (setQ(v.trim()), reset())} style={{ width: 240 }} />
      </Space>
      {error ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : (
        <Table<BookVoucherDto>
          rowKey="id"
          size="small"
          loading={isLoading || isFetching}
          dataSource={data?.items ?? []}
          scroll={{ x: 900 }}
          locale={{ emptyText: 'No vouchers in this period' }}
          pagination={{ current: page, pageSize: 50, total: data?.total ?? 0, onChange: setPage, hideOnSinglePage: true, showSizeChanger: false }}
          expandable={{
            expandedRowRender: (v) => (
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={v.lines}
                columns={[
                  { title: 'Account', dataIndex: 'accountName', render: (n: string) => <span translate="no">{n}</span> },
                  { title: 'Debit', dataIndex: 'debit', align: 'right', width: 150, render: (x: string | null) => <Amount value={x} /> },
                  { title: 'Credit', dataIndex: 'credit', align: 'right', width: 150, render: (x: string | null) => <Amount value={x} /> },
                ]}
              />
            ),
          }}
          columns={[
            { title: 'Date', dataIndex: 'date', width: 110, render: (d: string) => formatDate(d) },
            {
              title: 'Voucher',
              dataIndex: 'voucherNo',
              width: 190,
              render: (n: string, v) => (
                <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setOpen(v.id)}>
                  <span translate="no">{n}</span>
                </Button>
              ),
            },
            { title: 'Type', dataIndex: 'type', width: 110, render: (t: BookVoucherType) => <VoucherTypeTag type={t} /> },
            { title: 'From', dataIndex: 'source', width: 150, render: (s: BookSource) => sourceLabel(s) },
            { title: 'Party', dataIndex: 'party', width: 180, ellipsis: true, render: (p: string | null) => (p ? <span translate="no">{p}</span> : '') },
            { title: 'Narration', dataIndex: 'narration', ellipsis: true },
            { title: 'Amount', dataIndex: 'amount', align: 'right', width: 150, render: (a: string) => <Amount value={a} /> },
          ]}
          summary={() =>
            data && data.total ? (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={7}>
                  <Typography.Text strong>{`${data.total} ${data.total === 1 ? 'voucher' : 'vouchers'} in the period`}</Typography.Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={7} align="right">
                  <Typography.Text strong>
                    <Amount value={data.debit} />
                  </Typography.Text>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            ) : null
          }
        />
      )}
      <VoucherDrawer id={open} onClose={() => setOpen(null)} />
    </div>
  );
}
