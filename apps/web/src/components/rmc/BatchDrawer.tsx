'use client';

import React, { useState } from 'react';
import { App, Button, Descriptions, Drawer, Space, Table, Typography } from 'antd';
import { CheckOutlined, ExperimentOutlined, PrinterOutlined, RollbackOutlined } from '@/components/common/icons';
import type { RmcBatchDto, RmcBatchLineDto } from '@erp/shared';
import { useRmcAction, useRmcBatch } from '@/lib/queries';
import { QueryError } from '@/components/common/QueryState';
import { errorMessage } from '@/lib/api';
import { formatDateTime, formatQty } from '@/lib/format';
import { LinkButton } from '@/components/common/LinkButton';
import { BatchStatusTag, M3 } from './rmcUi';
import { DeliveryForm } from './BatchForms';

const variance = (v: number | null) => (v === null ? '-' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`);

/** A truck: its challan, what was weighed against the design, and delivery or cubes. */
export function BatchDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { message } = App.useApp();
  const act = useRmcAction<RmcBatchDto>();
  const [marking, setMarking] = useState<'deliver' | 'reject' | null>(null);
  const { data: batch, error, refetch } = useRmcBatch(id);
  const b = batch && batch.id === id ? batch : null;
  const cubes = async () => {
    try {
      const r = await act.mutateAsync({ path: `/rmc/batches/${b!.id}/cubes` });
      message.success(`Cube test ${r.cubeTestNo} recorded; readings due at 7 and 28 days`);
    } catch (e) {
      message.error(errorMessage(e));
    }
  };
  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      size={720}
      title={b ? <span translate="no">{`Challan ${b.batchNo}`}</span> : 'Challan'}
      extra={
        b ? (
          <Space wrap>
            {b.canDeliver && (
              <>
                <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => setMarking('deliver')}>
                  Delivered
                </Button>
                <Button size="small" icon={<RollbackOutlined />} onClick={() => setMarking('reject')}>
                  Turned back
                </Button>
              </>
            )}
            {b.canTakeCubes && (
              <Button size="small" icon={<ExperimentOutlined />} loading={act.isPending} onClick={cubes}>
                Take cubes
              </Button>
            )}
            <Button size="small" icon={<PrinterOutlined />} onClick={() => window.print()}>
              Print
            </Button>
          </Space>
        ) : null
      }
    >
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {b && (
        <>
          <Descriptions
            size="small"
            column={{ xs: 1, sm: 2 }}
            items={[
              { key: 's', label: 'Status', children: <BatchStatusTag status={b.status} /> },
              { key: 'o', label: 'Order', children: <span translate="no">{b.orderNo}</span> },
              { key: 'c', label: 'Customer', children: <span translate="no">{b.customer}</span> },
              { key: 'w', label: 'Pour at', children: b.site ?? '-' },
              { key: 'g', label: 'Grade', children: <span translate="no">{`${b.grade} (${b.mixDesignCode})`}</span> },
              { key: 'q', label: 'Quantity', children: <M3 value={b.quantity} /> },
              { key: 't', label: 'Truck', children: <span translate="no">{[b.truck, b.driver].filter(Boolean).join(', ') || '-'}</span> },
              { key: 'p', label: 'Pumped', children: b.pumped ? 'Yes' : 'No' },
              { key: 'sl', label: 'Slump at the plant', children: b.slumpMm === null ? '-' : <span translate="no">{`${b.slumpMm} mm`}</span> },
              { key: 'l', label: 'Left the plant', children: formatDateTime(b.dispatchedAt) },
              ...(b.status === 'DELIVERED' ? [{ key: 'd', label: 'Delivered', children: `${formatDateTime(b.deliveredAt)}${b.receivedBy ? `, received by ${b.receivedBy}` : ''}` }] : []),
              { key: 'st', label: 'Stock issue', children: <span translate="no">{b.stockEntryNo ?? '-'}</span> },
              { key: 'i', label: 'Bill', children: <span translate="no">{b.invoiceNo ?? 'Not billed'}</span> },
              {
                key: 'cube',
                label: 'Cubes',
                children: b.cubeTestId ? (
                  <LinkButton href={`/inspections?tab=tests&id=${b.cubeTestId}`} type="link" size="small" style={{ padding: 0 }}>
                    <span translate="no">{b.cubeTestNo}</span>
                  </LinkButton>
                ) : (
                  'None taken'
                ),
              },
            ]}
          />
          {b.note && <Typography.Paragraph style={{ marginTop: 12 }}>{b.note}</Typography.Paragraph>}
          <Typography.Title level={2} style={{ fontSize: 16, marginTop: 16 }}>
            Weighed against the design
          </Typography.Title>
          <Table<RmcBatchLineDto>
            rowKey="itemId"
            size="small"
            pagination={false}
            dataSource={b.lines}
            scroll={{ x: 520 }}
            columns={[
              { title: 'Material', dataIndex: 'itemName' },
              { title: 'Design', key: 'd', align: 'right', render: (_, l) => <span translate="no">{`${formatQty(l.designQty)} ${l.unit}`}</span> },
              { title: 'Weighed', key: 'a', align: 'right', render: (_, l) => <span translate="no">{`${formatQty(l.actualQty)} ${l.unit}`}</span> },
              {
                title: 'Variance',
                dataIndex: 'variancePct',
                align: 'right',
                width: 110,
                render: (v: number | null) => (
                  <Typography.Text type={v !== null && Math.abs(v) > 2 ? 'warning' : undefined} translate="no">
                    {variance(v)}
                  </Typography.Text>
                ),
              },
            ]}
          />
        </>
      )}
      <DeliveryForm batch={marking ? b : null} rejecting={marking === 'reject'} onClose={() => setMarking(null)} />
    </Drawer>
  );
}
