'use client';

import React from 'react';
import Link from 'next/link';
import { App, Button, Descriptions, Divider, Drawer, Popconfirm, Skeleton, Space, Table, Typography } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { StockLineDto } from '@erp/shared';
import { canAdjustStock } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useStockEntry } from '@/lib/queries';
import { formatDate, formatDateTime, formatQty } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { StockTypeTag } from './StockTypeTag';

/** A GRN, issue slip or adjustment. Approvers can delete a wrong entry. */
export function StockEntryDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { message } = App.useApp();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useStockEntry(id ?? undefined);
  const remove = useMutation({
    mutationFn: async () => (await api.delete(`/stock/entries/${id}`)).data,
    onSuccess: () => {
      message.success(`${data?.entryNo} deleted`);
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['material-requests'] });
      onClose();
    },
    onError: (err) => message.error(errorMessage(err)),
  });
  const mayDelete = !!user && canAdjustStock(user.roleKey);
  const kind = data?.type === 'RECEIPT' ? 'Goods received note' : data?.type === 'ISSUE' ? 'Issue slip' : 'Stock adjustment';

  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      width={640}
      title={data ? <Space>{`${kind} · ${data.entryNo}`}<StockTypeTag type={data.type} /></Space> : 'Stock entry'}
      extra={
        data && mayDelete ? (
          <Popconfirm
            title={`Delete ${data.entryNo}?`}
            description="Its quantities come off the stock register."
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={() => remove.mutate()}
          >
            <Button danger size="small" icon={<DeleteOutlined />} loading={remove.isPending}>
              Delete
            </Button>
          </Popconfirm>
        ) : null
      }
      destroyOnHidden
    >
      {isLoading && <Skeleton active />}
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {data && (
        <>
          <Descriptions
            size="small"
            column={2}
            bordered
            style={{ marginBottom: 16 }}
            items={[
              { key: 'date', label: 'Date', children: formatDate(data.date) },
              { key: 'project', label: 'Project', children: <Link href={`/projects/${data.projectId}?tab=stock`}>{data.projectName}</Link> },
              ...(data.type === 'RECEIPT'
                ? [
                    ...(data.poNo ? [{ key: 'po', label: 'Purchase order', children: data.poNo }] : []),
                    { key: 'mr', label: 'Material request', children: data.requestNo ?? '-' },
                    { key: 'supplier', label: 'Supplier', children: data.supplier ?? '-' },
                    { key: 'challan', label: 'Challan no.', children: data.challanNo ?? '-' },
                    { key: 'vehicle', label: 'Vehicle no.', children: data.vehicleNo ?? '-' },
                  ]
                : []),
              ...(data.type === 'ISSUE'
                ? [
                    { key: 'to', label: 'Issued to', children: data.issuedTo ?? '-' },
                    { key: 'activity', label: 'Activity', children: data.activityName ?? '-' },
                  ]
                : []),
              { key: 'remarks', label: data.type === 'ADJUSTMENT' ? 'Reason' : 'Remarks', children: data.remarks ?? '-', span: 2 },
              { key: 'by', label: 'Entered by', children: `${data.createdByName}, ${formatDateTime(data.createdAt)}`, span: 2 },
            ]}
          />
          <Table<StockLineDto>
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={data.lines}
            columns={[
              { title: '#', key: 'idx', width: 40, render: (_, __, i) => i + 1 },
              { title: 'Item', dataIndex: 'itemName' },
              {
                title: 'Quantity',
                dataIndex: 'quantity',
                align: 'right',
                width: 130,
                render: (v: string) => <Typography.Text type={Number(v) < 0 ? 'danger' : 'success'}>{`${Number(v) > 0 ? '+' : ''}${formatQty(v)}`}</Typography.Text>,
              },
              { title: 'Unit', dataIndex: 'unit', width: 80 },
            ]}
          />
          {data.attachments.length > 0 && (
            <>
              <Divider titlePlacement="start" plain>
                Challan / invoice
              </Divider>
              <AttachmentGallery attachments={data.attachments} />
            </>
          )}
        </>
      )}
    </Drawer>
  );
}
