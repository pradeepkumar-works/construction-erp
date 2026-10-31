'use client';

import React, { useState } from 'react';
import { App, Button, Popconfirm, Space, Table, Typography } from 'antd';
import { CheckOutlined, EditOutlined, PlusOutlined } from '@/components/common/icons';
import type { MixDesignDto } from '@erp/shared';
import { canApproveMixDesign, canRunRmcPlant } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useMixDesigns, useRmcAction } from '@/lib/queries';
import { errorMessage } from '@/lib/api';
import { formatDate, formatQty } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { DesignStatusTag, PlantFilter, Rupees, usePlantScope } from './rmcUi';
import { DesignForm } from './DesignForm';

/** Mix designs at the plants: what goes into a cubic metre of each grade, its material cost, and quality's approval. */
export function MixDesigns() {
  const { user } = useAuth();
  const { message } = App.useApp();
  const [plantId] = usePlantScope();
  const { data, isLoading, error, refetch } = useMixDesigns({ plantId });
  const act = useRmcAction<MixDesignDto>();
  const [editing, setEditing] = useState<MixDesignDto | null>(null);
  const [creating, setCreating] = useState(false);
  const mayMake = !!user && (canRunRmcPlant(user.roleKey) || canApproveMixDesign(user.roleKey));
  const mayApprove = !!user && canApproveMixDesign(user.roleKey);
  const run = async (path: string, done: (d: MixDesignDto) => string) => {
    try {
      message.success(done(await act.mutateAsync({ path })));
    } catch (e) {
      message.error(errorMessage(e));
    }
  };
  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <PlantFilter />
        {mayMake && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
            New mix design
          </Button>
        )}
      </div>
      {error ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : (
        <Table<MixDesignDto>
          rowKey="id"
          size="small"
          loading={isLoading}
          dataSource={data ?? []}
          pagination={false}
          scroll={{ x: 900 }}
          locale={{ emptyText: 'No mix designs yet' }}
          expandable={{
            expandedRowRender: (d) => (
              <Table
                rowKey="itemId"
                size="small"
                pagination={false}
                dataSource={d.lines}
                columns={[
                  { title: 'Material', dataIndex: 'itemName' },
                  { title: 'Per m³', key: 'q', align: 'right', render: (_, l) => <span translate="no">{`${formatQty(l.quantity)} ${l.unit}`}</span> },
                ]}
              />
            ),
          }}
          columns={[
            { title: 'Code', dataIndex: 'code', width: 150, render: (c: string) => <span translate="no">{c}</span> },
            { title: 'Grade', dataIndex: 'grade', width: 80, render: (g: string) => <span translate="no">{g}</span> },
            { title: 'Description', dataIndex: 'description', ellipsis: true },
            { title: 'Slump', dataIndex: 'slumpMm', width: 90, render: (s: number | null) => (s === null ? '-' : <span translate="no">{`${s} mm`}</span>) },
            { title: 'Material cost per m³', dataIndex: 'costPerM3', align: 'right', width: 140, render: (c: string | null) => (c ? <Rupees value={c} /> : <Typography.Text type="secondary">No rates</Typography.Text>) },
            { title: 'Status', key: 's', width: 210, render: (_, d) => <Space size={4} wrap><DesignStatusTag status={d.status} />{d.approvedAt && <Typography.Text type="secondary">{`${d.approvedByName ?? ''}, ${formatDate(d.approvedAt)}`}</Typography.Text>}</Space> },
            {
              title: '',
              key: 'a',
              width: 220,
              render: (_, d) => (
                <Space size={4}>
                  {d.canApprove && (
                    <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => run(`/rmc/mix-designs/${d.id}/approve`, (r) => `${r.code} approved`)}>
                      Approve
                    </Button>
                  )}
                  {d.canEdit && (
                    <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(d)}>
                      Change
                    </Button>
                  )}
                  {mayApprove && d.status === 'APPROVED' && (
                    <Popconfirm title={`Retire ${d.code}?`} description="No new orders can use it." okText="Retire" onConfirm={() => run(`/rmc/mix-designs/${d.id}/retire`, (r) => `${r.code} retired`)}>
                      <Button size="small">Retire</Button>
                    </Popconfirm>
                  )}
                </Space>
              ),
            },
          ]}
        />
      )}
      <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
        Material a cubic metre is at the item master’s rates. Each truck issues its materials from the plant’s store at its design, or as weighed at the batcher.
      </Typography.Paragraph>
      <DesignForm open={creating || !!editing} design={editing} onClose={() => (setCreating(false), setEditing(null))} />
    </div>
  );
}
