'use client';

import React, { useState } from 'react';
import { Button, Modal, Select, Space, Table } from 'antd';
import type { TableProps } from 'antd';
import { AppTag, type TagTone } from '@/components/common/AppTag';
import type { IntegrationEventDto, IntegrationEventStatus } from '@erp/shared';
import { INTEGRATION_EVENT_STATUSES, INTEGRATION_EVENT_STATUS_LABELS } from '@erp/shared';
import { useIntegrationConnections, useIntegrationEvents } from '@/lib/queries';
import { formatDateTime } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';

const STATUS_TONE: Record<IntegrationEventStatus, TagTone> = { OK: 'success', FAILED: 'danger', IGNORED: 'neutral' };

/** The log: the latest 200 messages in and out, what each became or why it failed. */
export function EventLog() {
  const [connectionId, setConnectionId] = useState<string | undefined>();
  const [status, setStatus] = useState<IntegrationEventStatus | undefined>();
  const [open, setOpen] = useState<IntegrationEventDto | null>(null);
  const connections = useIntegrationConnections();
  const { data, isLoading, error, refetch } = useIntegrationEvents({ connectionId, status });

  const columns: TableProps<IntegrationEventDto>['columns'] = [
    { title: 'When', dataIndex: 'createdAt', width: 170, render: (v: string) => formatDateTime(v) },
    { title: 'Connection', dataIndex: 'connectionName', width: 200, ellipsis: true, render: (v: string | null, e) => v ?? e.agentName ?? '-' },
    { title: 'Result', dataIndex: 'status', width: 120, render: (s: IntegrationEventStatus) => <AppTag tone={STATUS_TONE[s]}>{INTEGRATION_EVENT_STATUS_LABELS[s]}</AppTag> },
    { title: 'What came', dataIndex: 'summary' },
    {
      title: '',
      key: 'x',
      width: 130,
      render: (_, e) =>
        e.detail === null || e.detail === undefined ? null : (
          <Button size="small" onClick={() => setOpen(e)} aria-label={`What was sent at ${formatDateTime(e.createdAt)}`}>
            What was sent
          </Button>
        ),
    },
  ];

  return (
    <div style={{ padding: 16 }}>
      <Space wrap style={{ marginBottom: 12 }}>
        <Select
          allowClear
          aria-label="Connection"
          placeholder="All connections"
          style={{ minWidth: 220 }}
          value={connectionId}
          onChange={setConnectionId}
          options={(connections.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
        />
        <Select
          allowClear
          aria-label="Result"
          placeholder="All results"
          style={{ minWidth: 160 }}
          value={status}
          onChange={setStatus}
          options={INTEGRATION_EVENT_STATUSES.map((s) => ({ value: s, label: INTEGRATION_EVENT_STATUS_LABELS[s] }))}
        />
      </Space>
      {error ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : (
        <Table<IntegrationEventDto>
          rowKey="id"
          size="small"
          loading={isLoading}
          columns={columns}
          dataSource={data ?? []}
          pagination={{ pageSize: 50, hideOnSinglePage: true, showSizeChanger: false }}
          scroll={{ x: 900 }}
          locale={{ emptyText: connectionId || status ? 'Nothing matches. Clear the filters to see every message.' : 'Nothing has come in yet.' }}
        />
      )}
      <Modal open={!!open} onCancel={() => setOpen(null)} title={open ? `Sent at ${formatDateTime(open.createdAt)}` : ''} width={640} footer={<Button type="primary" onClick={() => setOpen(null)}>Done</Button>}>
        {open && (
          <pre translate="no" style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 12 }}>
            {JSON.stringify(open.detail, null, 2)}
          </pre>
        )}
      </Modal>
    </div>
  );
}
