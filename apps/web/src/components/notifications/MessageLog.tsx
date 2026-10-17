'use client';

import React, { useState } from 'react';
import { Input, Select, Table, Tag, Typography } from 'antd';
import type { MessageChannel, OutboundMessageDto, OutboundMessageStatus } from '@erp/shared';
import { formatPhone, MESSAGE_CHANNEL_LABELS, MESSAGE_CHANNELS, MESSAGE_TEMPLATE_LABELS, OUTBOUND_MESSAGE_STATUS_LABELS, OUTBOUND_MESSAGE_STATUSES } from '@erp/shared';
import { useMessageLog } from '@/lib/queries';
import { formatDateTime } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { CardToolbar } from '@/components/common/CardToolbar';

const STATUS_COLOR: Record<OutboundMessageStatus, string> = { SENT: 'green', FAILED: 'red', SKIPPED: 'default' };

/** Every WhatsApp and SMS the company sent, or tried to, newest first (admin and management). */
export function MessageLog() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<OutboundMessageStatus>();
  const [channel, setChannel] = useState<MessageChannel>();
  const { data, isFetching, error, refetch } = useMessageLog({ page, pageSize, q: q || undefined, status, channel });

  return (
    <>
      <CardToolbar wrap gap={8}>
        <Input.Search
          allowClear
          placeholder="Search number, name or text"
          aria-label="Search messages"
          style={{ width: 260 }}
          onSearch={(v) => {
            setQ(v.trim());
            setPage(1);
          }}
        />
        <Select
          allowClear
          placeholder="Channel"
          aria-label="Channel"
          style={{ width: 130 }}
          value={channel}
          onChange={(v) => {
            setChannel(v);
            setPage(1);
          }}
          options={MESSAGE_CHANNELS.map((c) => ({ value: c, label: MESSAGE_CHANNEL_LABELS[c] }))}
        />
        <Select
          allowClear
          placeholder="Status"
          aria-label="Status"
          style={{ width: 140 }}
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={OUTBOUND_MESSAGE_STATUSES.map((s) => ({ value: s, label: OUTBOUND_MESSAGE_STATUS_LABELS[s] }))}
        />
      </CardToolbar>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <Table<OutboundMessageDto>
        rowKey="id"
        size="small"
        loading={isFetching}
        dataSource={data?.items ?? []}
        scroll={{ x: 1000 }}
        locale={{ emptyText: 'No WhatsApp or SMS yet. They go to people who switch them on under Notifications.' }}
        pagination={{
          current: page,
          pageSize,
          total: data?.total ?? 0,
          showSizeChanger: true,
          hideOnSinglePage: true,
          onChange: (p, s) => {
            setPage(p);
            setPageSize(s);
          },
        }}
        columns={[
          { title: 'Sent at', dataIndex: 'createdAt', width: 150, render: (v: string) => formatDateTime(v) },
          {
            title: 'To',
            key: 'to',
            width: 190,
            render: (_, m) => (
              <>
                <div>{m.userName ?? '-'}</div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {formatPhone(m.to)}
                </Typography.Text>
              </>
            ),
          },
          { title: 'Channel', dataIndex: 'channel', width: 100, render: (c: MessageChannel) => MESSAGE_CHANNEL_LABELS[c] },
          {
            title: 'Message',
            key: 'body',
            render: (_, m) => (
              <>
                <Typography.Text strong style={{ fontSize: 12 }}>
                  {MESSAGE_TEMPLATE_LABELS[m.template]}
                </Typography.Text>
                <div style={{ fontSize: 13 }}>{m.body}</div>
              </>
            ),
          },
          {
            title: 'Status',
            key: 'status',
            width: 190,
            render: (_, m) => (
              <>
                <Tag color={STATUS_COLOR[m.status]}>{OUTBOUND_MESSAGE_STATUS_LABELS[m.status]}</Tag>
                {m.error ? (
                  <div style={{ fontSize: 12 }}>
                    <Typography.Text type="secondary">{m.error}</Typography.Text>
                  </div>
                ) : null}
              </>
            ),
          },
        ]}
      />
    </>
  );
}
